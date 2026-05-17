"""
second_brain/api/main.py
────────────────────────
The FastAPI application — the HTTP brain of Second Brain.

PHASE 1 ENDPOINTS:
  POST /ingest/thought      ← quick text capture (CLI, mobile webhook)
  POST /ingest/url          ← URL / webpage clip
  POST /ingest/chat         ← AI conversation import
  POST /ingest/file         ← screenshot, video, document upload
  GET  /items               ← list all captured items
  GET  /items/{id}          ← inspect a single item
  GET  /health              ← is the API alive?
  GET  /stats               ← ingestion counts by type/status

PHASE 2 ENDPOINTS:
  GET  /search              ← KAG retriever (fused graph + vector search)
  GET  /graph/neighbors/{id}← graph neighborhood for visualization
  GET  /communities         ← GraphRAG community summaries

HOW A REQUEST FLOWS:
  HTTP Request
    → FastAPI validates the body (Pydantic model)
    → Creates an IngestionItem, saves to disk
    → Pushes item_id onto Celery queue (non-blocking)
    → Returns 202 Accepted immediately
  Meanwhile, in the background:
    → Celery worker picks up the item
    → Phase 1: Runs OCR / transcription / text extraction
    → Phase 2: Summarise → Extract entities → Embed → Write graph
    → Updates the item on disk with all enrichments + status=DONE
"""

import shutil
import sys
import os
from pathlib import Path
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import settings
from models import (
    IngestionItem, SourceType, Status,
    ThoughtRequest, URLRequest, ChatImportRequest, IngestResponse,
    SearchResponse, GraphNeighborsResponse,
)
from storage.store import save_item, load_item, list_items, all_items_full

# ── App init ──────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Second Brain — API",
    description="Phase 1+2: Universal intake layer + intelligence pipeline. "
                "Captures, processes, embeds, and graphs everything.",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # lock this down in production
    allow_methods=["*"],
    allow_headers=["*"],
)

settings.ensure_dirs()


# ── Queue helper (gracefully degrades if Redis is not running) ────────────────

def enqueue(item_id: str):
    """Push item onto Celery queue. If Redis isn't running, processes inline."""
    try:
        from task_queue.tasks import process_item
        process_item.delay(item_id)
    except Exception as e:
        # Redis not available: run synchronously so nothing is lost
        print(f"[warn] Queue unavailable ({e}), processing inline.")
        _process_inline(item_id)


def _process_inline(item_id: str):
    """Fallback: run the processor in-process (no Celery)."""
    from task_queue.tasks import process_item as _proc
    _proc(item_id)


# ── Phase 1 Routes ───────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/stats")
def stats():
    """Return counts grouped by source_type and status."""
    items = all_items_full(limit=10_000)
    by_type   = {}
    by_status = {}
    for item in items:
        by_type[item.source_type]     = by_type.get(item.source_type, 0) + 1
        by_status[item.status]        = by_status.get(item.status, 0) + 1
    return {
        "total": len(items),
        "by_source_type": by_type,
        "by_status": by_status,
    }


# ── Ingest: Quick thought ─────────────────────────────────────────────────────

@app.post("/ingest/thought", response_model=IngestResponse, status_code=202)
def ingest_thought(body: ThoughtRequest):
    """
    The fastest capture: a raw text thought.
    Used by the CLI tool and mobile webhook.
    """
    item = IngestionItem(
        source_type=SourceType.THOUGHT,
        raw_content=body.content,
        tags=body.tags,
        title=body.content[:60] + ("…" if len(body.content) > 60 else ""),
    )
    save_item(item)
    enqueue(item.id)
    return IngestResponse(item_id=item.id, status=item.status, message="Thought captured.")


# ── Ingest: URL clip ──────────────────────────────────────────────────────────

@app.post("/ingest/url", response_model=IngestResponse, status_code=202)
def ingest_url(body: URLRequest):
    """
    Clip a URL. Phase 2 will fetch + parse the full page text.
    Phase 1: stores the URL + title for now.
    """
    item = IngestionItem(
        source_type=SourceType.URL,
        raw_content=f"URL: {body.url}\nTitle: {body.title or ''}",
        source_url=body.url,
        title=body.title or body.url,
        tags=body.tags,
    )
    save_item(item)
    enqueue(item.id)
    return IngestResponse(item_id=item.id, status=item.status, message="URL queued.")


# ── Ingest: AI Chat import ────────────────────────────────────────────────────

@app.post("/ingest/chat", response_model=IngestResponse, status_code=202)
def ingest_chat(body: ChatImportRequest):
    """
    Import an exported AI conversation.
    Paste the raw text/JSON from ChatGPT, Claude, Gemini exports.
    """
    item = IngestionItem(
        source_type=SourceType.AI_CHAT,
        raw_content=body.content,
        platform=body.platform,
        title=body.title or f"Chat · {body.platform} · {datetime.now().strftime('%Y-%m-%d')}",
        tags=body.tags,
    )
    save_item(item)
    enqueue(item.id)
    return IngestResponse(item_id=item.id, status=item.status, message="Chat import queued.")


# ── Ingest: File upload (screenshot, video, doc) ──────────────────────────────

@app.post("/ingest/file", response_model=IngestResponse, status_code=202)
async def ingest_file(file: UploadFile = File(...)):
    """
    Upload any file: screenshot (jpg/png), video (mp4/mov), document (pdf).
    File is saved to storage/uploads/, then queued for processing.
    
    Source type is inferred from MIME type:
      image/*       → SCREENSHOT → OCR
      video/*       → VIDEO      → Whisper
      audio/*       → AUDIO      → Whisper
      application/* → DOCUMENT   → text extraction
    """
    content_type = file.content_type or ""

    if content_type.startswith("image/"):
        source_type = SourceType.SCREENSHOT
    elif content_type.startswith("video/"):
        source_type = SourceType.VIDEO
    elif content_type.startswith("audio/"):
        source_type = SourceType.AUDIO
    else:
        source_type = SourceType.DOCUMENT

    # Save the raw file
    dest = settings.storage_path / f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{file.filename}"
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    item = IngestionItem(
        source_type=source_type,
        file_path=str(dest),
        title=file.filename,
        metadata={"content_type": content_type, "original_filename": file.filename},
    )
    save_item(item)
    enqueue(item.id)
    return IngestResponse(item_id=item.id, status=item.status, message=f"File '{file.filename}' queued for {source_type} processing.")


# ── Read: list & inspect ──────────────────────────────────────────────────────

@app.get("/items")
def get_items(limit: int = 50, status: str | None = None):
    """List captured items, newest first."""
    status_filter = Status(status) if status else None
    items = list_items(limit=limit, status=status_filter)
    # Ensure every item has an id (older index entries may lack one)
    for item in items:
        if 'id' not in item and 'path' in item:
            # Extract id from path: storage/items/<uuid>.json
            item['id'] = Path(item['path']).stem
    return items


@app.get("/items/{item_id}")
def get_item(item_id: str):
    """Inspect a single item in full detail."""
    item = load_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


# ── Phase 2: Search (KAG Retriever) ──────────────────────────────────────────

@app.get("/search", response_model=SearchResponse)
def search_items(
    q: str = Query(..., min_length=1, description="Natural language search query"),
    limit: int = Query(5, ge=1, le=50, description="Max results to return"),
):
    """
    Fused graph + vector search (Knowledge-Augmented Generation).
    
    Query flow:
      1. Embed query → vector search Qdrant (top-k)
      2. Extract entities from query → graph traversal Neo4j  
      3. Merge: score = 0.6 * vector_score + 0.4 * graph_score
      4. Return top results with explanations
    """
    try:
        from processing.kag_retriever import search
        return search(q, limit=limit)
    except Exception as e:
        # Graceful degradation: return empty results on failure
        return SearchResponse(results=[], query_entities=[], total=0)


# ── Phase 2: Graph Neighbors ─────────────────────────────────────────────────

@app.get("/graph/neighbors/{item_id}", response_model=GraphNeighborsResponse)
def graph_neighbors(
    item_id: str,
    depth: int = Query(2, ge=1, le=4, description="Traversal depth"),
):
    """
    Get an item's neighborhood in the knowledge graph.
    Returns nodes + edges for the Phase 3 graph visualization UI.
    """
    # Verify item exists
    item = load_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    try:
        from processing.graph_writer import get_neighbors
        return get_neighbors(item_id, depth=depth)
    except Exception as e:
        return GraphNeighborsResponse(nodes=[], edges=[])


# ── Phase 2: GraphRAG Communities ─────────────────────────────────────────────

@app.get("/communities")
def get_communities():
    """
    Return GraphRAG community summaries.
    Communities are clusters of related items detected via shared entities.
    """
    try:
        from processing.graphrag_runner import get_all_communities
        communities = get_all_communities()
        return {"communities": communities, "total": len(communities)}
    except Exception as e:
        return {"communities": [], "total": 0}


@app.get("/communities/{community_id}")
def get_community(community_id: int):
    """Get a specific community by ID."""
    try:
        from processing.graphrag_runner import get_community_summary
        community = get_community_summary(community_id)
        if not community:
            raise HTTPException(status_code=404, detail="Community not found")
        return community
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Dev runner ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.main:app", host=settings.api_host, port=settings.api_port, reload=True)

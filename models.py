"""
second_brain/models.py
──────────────────────
Pydantic models that define the shape of every item that enters the brain.

Think of IngestionItem as the universal envelope — no matter where something
comes from (screenshot, video, chat, URL, thought), it always becomes one of these.
This makes Phase 2 (processing) much simpler because it only has to handle one shape.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


# ── Source types ──────────────────────────────────────────────────────────────

class SourceType(str, Enum):
    SCREENSHOT  = "screenshot"   # image file, will be OCR'd
    VIDEO       = "video"        # video file, will be transcribed
    AI_CHAT     = "ai_chat"      # exported conversation from ChatGPT / Claude / etc.
    URL         = "url"          # webpage clip
    THOUGHT     = "thought"      # plain text from CLI or quick-capture
    DOCUMENT    = "document"     # PDF / DOCX dropped in
    AUDIO       = "audio"        # voice memo


# ── Processing status ─────────────────────────────────────────────────────────

class Status(str, Enum):
    PENDING    = "pending"     # just arrived, not yet processed
    PROCESSING = "processing"  # worker picked it up
    DONE       = "done"        # fully processed, ready to graph
    FAILED     = "failed"      # something went wrong


# ── The universal ingestion envelope ─────────────────────────────────────────

class IngestionItem(BaseModel):
    """
    Every single thing that enters the Second Brain becomes an IngestionItem.
    
    Fields you fill at capture time:
      - id, source_type, raw_content / file_path, tags, metadata
    
    Fields the processing pipeline fills in:
      - extracted_text, status, processed_at, error
    """

    id: str = Field(default_factory=lambda: str(uuid4()))
    source_type: SourceType

    # Raw content: either inline text OR a path to a file on disk
    raw_content: str | None = None         # for THOUGHT, AI_CHAT, URL
    file_path: str | None = None           # for SCREENSHOT, VIDEO, AUDIO, DOCUMENT

    # What the processing pipeline extracts
    extracted_text: str | None = None
    summary: str | None = None             # filled by Phase 2 (LLM)
    embedding: list[float] | None = None   # filled by Phase 2 (vector store)

    # Metadata
    title: str | None = None
    tags: list[str] = Field(default_factory=list)
    source_url: str | None = None          # for URL clips
    platform: str | None = None            # "chatgpt", "claude", "gemini" for AI chats
    metadata: dict[str, Any] = Field(default_factory=dict)

    # Lifecycle
    status: Status = Status.PENDING
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    processed_at: datetime | None = None
    error: str | None = None

    def to_queue_payload(self) -> dict:
        """Serialise to dict for pushing onto the Redis queue."""
        return self.model_dump(mode="json")

    @classmethod
    def from_queue_payload(cls, payload: dict) -> "IngestionItem":
        return cls(**payload)


# ── API request/response shapes ───────────────────────────────────────────────

class ThoughtRequest(BaseModel):
    """POST /ingest/thought"""
    content: str = Field(..., min_length=1, max_length=10_000)
    tags: list[str] = Field(default_factory=list)

class URLRequest(BaseModel):
    """POST /ingest/url"""
    url: str
    title: str | None = None
    tags: list[str] = Field(default_factory=list)

class ChatImportRequest(BaseModel):
    """POST /ingest/chat"""
    platform: str                   # "chatgpt" | "claude" | "gemini" | "other"
    content: str                    # raw exported text / JSON
    title: str | None = None
    tags: list[str] = Field(default_factory=list)

class IngestResponse(BaseModel):
    """Returned after any ingest endpoint."""
    item_id: str
    status: Status
    message: str


# ── Phase 2: Entity extraction models ────────────────────────────────────────

class Entity(BaseModel):
    """
    A named entity extracted from an IngestionItem.
    Used by entity_extractor.py and graph_writer.py.
    """
    text: str                       # e.g. "GraphRAG", "Transformer", "OpenAI"
    label: str                      # PERSON | ORG | GPE | CONCEPT | TECHNOLOGY | DATE | EVENT
    salience: float = 0.5           # 0.0–1.0 — how central to the item
    source_item_id: str             # which item this was extracted from


# ── Phase 2: Search / retrieval models ───────────────────────────────────────

class SearchResult(BaseModel):
    """A single search result from the KAG retriever (graph + vector fusion)."""
    item_id: str
    title: str | None = None
    summary: str | None = None
    score: float
    matched_via: list[str] = Field(default_factory=list)   # ["vector", "entity:GraphRAG", ...]
    excerpt: str = ""                                       # 200 char snippet


class SearchResponse(BaseModel):
    """Full search response envelope — consumed by the Phase 3 graph UI."""
    results: list[SearchResult]
    query_entities: list[str] = Field(default_factory=list)
    total: int = 0


# ── Phase 2: Graph visualization models (served by /graph endpoints) ─────────

class GraphNode(BaseModel):
    id: str
    label: str | None = None
    type: str = "item"              # "item" | "entity"
    community_id: int | None = None
    score: float | None = None

class GraphEdge(BaseModel):
    source: str
    target: str
    relation: str = "RELATED_TO"    # MENTIONS | RELATED_TO | CO_OCCURS_WITH
    weight: float = 1.0

class GraphNeighborsResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]

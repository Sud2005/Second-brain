"""
second_brain/queue/tasks.py
───────────────────────────
Celery task definitions — the async processing workers.

HOW CELERY WORKS (quick mental model):
  1. An API endpoint or watcher calls  process_item.delay(item_id)
  2. That call pushes a message onto the Redis queue and returns immediately
  3. A separate worker process (run with: celery -A task_queue.tasks worker)
     picks up the message and runs the actual function
  4. The API stays fast; heavy work happens in the background

PHASE 1 TASKS:
  process_item(item_id)    ← dispatcher: routes to the right processor
  ocr_screenshot(item_id)  ← extracts text from image files
  transcribe_audio(item_id)← transcribes video/audio (Whisper, Phase 2)
  extract_text(item_id)    ← handles plain text items (thoughts, chats, URLs)

PHASE 2 ADDITIONS:
  process_item now runs the full intelligence pipeline after text extraction:
    1. summariser.summarise(item)
    2. entity_extractor.extract_entities(item)
    3. embedder.embed_and_store(item)
    4. graph_writer.write_item_to_graph(item, entities)

  run_graphrag_nightly()   ← Celery Beat periodic task for community detection
"""

import sys
import os
import platform
import logging

# Make sure we can import from project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from celery import Celery
from config import settings
from models import SourceType, Status

logger = logging.getLogger(__name__)

# ── App init ──────────────────────────────────────────────────────────────────
# broker=  where tasks are sent (Redis list)
# backend= where results are stored (Redis hash) — useful for polling
celery_app = Celery(
    "second_brain",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

_celery_conf = dict(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    # Retry failed tasks up to 3 times with exponential backoff
    task_acks_late=True,
    task_reject_on_worker_lost=True,
)

# ── Windows fix: prefork pool is not supported, use 'solo' instead ────────────
if platform.system() == "Windows":
    _celery_conf["worker_pool"] = "solo"

celery_app.conf.update(**_celery_conf)

# ── Celery Beat schedule (for nightly GraphRAG) ──────────────────────────────
celery_app.conf.beat_schedule = {
    "graphrag-nightly": {
        "task": "run_graphrag_nightly",
        "schedule": 86400.0,   # 24 hours in seconds
    },
}


# ── Helper: lazy imports to keep startup fast ─────────────────────────────────

def _get_store():
    from storage.store import load_item, update_status, update_extracted_text, save_item
    return load_item, update_status, update_extracted_text, save_item


# ── Phase 2 intelligence pipeline ────────────────────────────────────────────

def _run_phase2_pipeline(item_id: str) -> dict:
    """
    Run the full Phase 2 intelligence pipeline on an item:
      1. Summarise (LLM memory card)
      2. Extract entities (spaCy + LLM)
      3. Embed and store (OpenAI → Qdrant)
      4. Write to graph (Neo4j)

    Each step gracefully degrades — if a service is unavailable,
    it logs a warning and moves on. The pipeline never crashes the worker.
    """
    load_item, _, _, save_item = _get_store()
    item = load_item(item_id)
    if not item:
        return {"error": f"Item {item_id} not found for Phase 2"}

    result = {"item_id": item_id, "phase2": {}}

    # 1. Summarise
    try:
        from processing.summariser import summarise
        card = summarise(item)
        if card:
            result["phase2"]["summary"] = True
            save_item(item)  # summarise updates item.summary + metadata in-place
        else:
            result["phase2"]["summary"] = "skipped"
    except Exception as e:
        logger.warning(f"Summarisation failed for {item_id}: {e}")
        result["phase2"]["summary"] = f"failed: {e}"

    # 2. Extract entities
    entities = []
    try:
        from processing.entity_extractor import extract_entities
        entities = extract_entities(item)
        result["phase2"]["entities"] = len(entities)
    except Exception as e:
        logger.warning(f"Entity extraction failed for {item_id}: {e}")
        result["phase2"]["entities"] = f"failed: {e}"

    # 3. Embed and store in Qdrant
    try:
        from processing.embedder import embed_and_store
        embedding = embed_and_store(item)
        if embedding:
            item.embedding = embedding
            save_item(item)
            result["phase2"]["embedding"] = len(embedding)
        else:
            result["phase2"]["embedding"] = "skipped"
    except Exception as e:
        logger.warning(f"Embedding failed for {item_id}: {e}")
        result["phase2"]["embedding"] = f"failed: {e}"

    # 4. Write to Neo4j graph
    try:
        from processing.graph_writer import write_item_to_graph
        ok = write_item_to_graph(item, entities)
        result["phase2"]["graph"] = "written" if ok else "skipped"
    except Exception as e:
        logger.warning(f"Graph write failed for {item_id}: {e}")
        result["phase2"]["graph"] = f"failed: {e}"

    return result


# ── Dispatcher ────────────────────────────────────────────────────────────────

@celery_app.task(name="process_item", bind=True, max_retries=3)
def process_item(self, item_id: str):
    """
    Entry point for ALL items.
    Phase 1: Extract text (OCR / transcription / raw copy).
    Phase 2: Run intelligence pipeline (summarise → entities → embed → graph).

    IMPORTANT: We call _do_ocr / _do_transcribe / _do_extract (plain functions)
    instead of calling the Celery task objects directly. If we called
    ocr_screenshot(item_id) here, Celery would try to dispatch it as
    a NEW task onto Redis, which is NOT what we want — we want to run
    the processing code right here in the same worker.
    """
    load_item, update_status, _, _ = _get_store()

    item = load_item(item_id)
    if not item:
        return {"error": f"Item {item_id} not found"}

    update_status(item_id, Status.PROCESSING)

    try:
        # ── Phase 1: Text extraction ──────────────────────────
        if item.source_type == SourceType.SCREENSHOT:
            phase1_result = _do_ocr(item_id)
        elif item.source_type in (SourceType.VIDEO, SourceType.AUDIO):
            phase1_result = _do_transcribe(item_id)
        else:
            # THOUGHT, AI_CHAT, URL, DOCUMENT with embedded text
            phase1_result = _do_extract(item_id)

        # ── Phase 2: Intelligence pipeline ────────────────────
        phase2_result = _run_phase2_pipeline(item_id)

        update_status(item_id, Status.DONE)
        return {**phase1_result, **phase2_result}

    except Exception as exc:
        update_status(item_id, Status.FAILED, error=str(exc))
        # Celery retry with exponential backoff: 2^retry seconds
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)


# ── Processing functions (plain Python — called directly by the dispatcher) ───

def _do_ocr(item_id: str) -> dict:
    """
    Extract text from a screenshot or image using Tesseract OCR.

    Tesseract reads pixels → returns a string of detected text.
    We store that back onto the IngestionItem.
    """
    load_item, _, update_extracted_text, _ = _get_store()

    item = load_item(item_id)
    if not item or not item.file_path:
        return {"error": "No file path on item"}

    try:
        # Try pytesseract; fall back to a placeholder if Tesseract isn't installed
        import pytesseract
        from PIL import Image

        if settings.tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd

        image = Image.open(item.file_path)
        text = pytesseract.image_to_string(image)
        cleaned = text.strip()

    except Exception as e:
        # Tesseract not installed? Store a note — don't crash the pipeline
        cleaned = f"[OCR unavailable: {e}]"

    update_extracted_text(item_id, cleaned)
    return {"item_id": item_id, "chars_extracted": len(cleaned)}


def _do_transcribe(item_id: str) -> dict:
    """
    Transcribe audio/video using OpenAI Whisper.

    Phase 1: stores a placeholder so the pipeline doesn't break.
    Phase 2: uncomment the whisper block below.
    """
    load_item, _, update_extracted_text, _ = _get_store()

    item = load_item(item_id)
    if not item or not item.file_path:
        return {"error": "No file path"}

    # ── Phase 2: uncomment this block ────────────────────────
    # import whisper
    # model = whisper.load_model(settings.whisper_model)
    # result = model.transcribe(item.file_path)
    # text = result["text"]
    # ─────────────────────────────────────────────────────────

    text = f"[Transcription pending — Whisper integration in Phase 2. File: {item.file_path}]"
    update_extracted_text(item_id, text)
    return {"item_id": item_id, "note": "Whisper stub — enable in Phase 2"}


def _do_extract(item_id: str) -> dict:
    """
    Handle items that already have text (THOUGHT, AI_CHAT, URL).
    Just copies raw_content to extracted_text.
    Phase 2 pipeline runs after this (summarise, entities, embed, graph).
    """
    load_item, _, update_extracted_text, _ = _get_store()

    item = load_item(item_id)
    if not item:
        return {"error": "Item not found"}

    text = item.raw_content or ""
    update_extracted_text(item_id, text)
    return {"item_id": item_id, "chars": len(text)}


# ── Celery task wrappers (so these can also be called independently via .delay)

@celery_app.task(name="ocr_screenshot")
def ocr_screenshot(item_id: str) -> dict:
    return _do_ocr(item_id)


@celery_app.task(name="transcribe_audio")
def transcribe_audio(item_id: str) -> dict:
    return _do_transcribe(item_id)


@celery_app.task(name="extract_text")
def extract_text(item_id: str) -> dict:
    return _do_extract(item_id)


# ── Phase 2: Periodic task for GraphRAG community detection ──────────────────

@celery_app.task(name="run_graphrag_nightly")
def run_graphrag_nightly():
    """
    Nightly batch job: runs GraphRAG community detection across all items.
    Scheduled via Celery Beat (see beat_schedule above).
    Can also be triggered manually: run_graphrag_nightly.delay()
    """
    try:
        from processing.graphrag_runner import run_full_pipeline
        result = run_full_pipeline()
        logger.info(f"GraphRAG nightly complete: {result}")
        return result
    except Exception as e:
        logger.error(f"GraphRAG nightly failed: {e}")
        return {"error": str(e)}


# ── Phase 2: Re-process existing items through the new pipeline ──────────────

@celery_app.task(name="migrate_phase2")
def migrate_phase2():
    """
    One-time migration: run all existing Phase 1 items through
    the Phase 2 intelligence pipeline.
    """
    from storage.store import all_items_full
    items = all_items_full(limit=10_000)
    processed = 0

    for item in items:
        if item.extracted_text or item.raw_content:
            try:
                _run_phase2_pipeline(item.id)
                processed += 1
                logger.info(f"Migrated {item.id} ({processed}/{len(items)})")
            except Exception as e:
                logger.error(f"Migration failed for {item.id}: {e}")

    return {"total": len(items), "processed": processed}

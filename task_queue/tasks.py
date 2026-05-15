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

TASKS DEFINED HERE:
  process_item(item_id)    ← dispatcher: routes to the right processor
  ocr_screenshot(item_id)  ← extracts text from image files
  transcribe_audio(item_id)← transcribes video/audio (Whisper, Phase 2)
  extract_text(item_id)    ← handles plain text items (thoughts, chats, URLs)
"""

import sys
import os

# Make sure we can import from project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from celery import Celery
from config import settings
from models import SourceType, Status

# ── App init ──────────────────────────────────────────────────────────────────
# broker=  where tasks are sent (Redis list)
# backend= where results are stored (Redis hash) — useful for polling
celery_app = Celery(
    "second_brain",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    # Retry failed tasks up to 3 times with exponential backoff
    task_acks_late=True,
    task_reject_on_worker_lost=True,
)


# ── Helper: lazy imports to keep startup fast ─────────────────────────────────

def _get_store():
    from storage.store import load_item, update_status, update_extracted_text, save_item
    return load_item, update_status, update_extracted_text, save_item


# ── Dispatcher ────────────────────────────────────────────────────────────────

@celery_app.task(name="process_item", bind=True, max_retries=3)
def process_item(self, item_id: str):
    """
    Entry point for ALL items.
    Reads the item's source_type and routes to the right processor.
    """
    load_item, update_status, _, _ = _get_store()

    item = load_item(item_id)
    if not item:
        return {"error": f"Item {item_id} not found"}

    update_status(item_id, Status.PROCESSING)

    try:
        if item.source_type == SourceType.SCREENSHOT:
            result = ocr_screenshot(item_id)
        elif item.source_type in (SourceType.VIDEO, SourceType.AUDIO):
            result = transcribe_audio(item_id)
        else:
            # THOUGHT, AI_CHAT, URL, DOCUMENT with embedded text
            result = extract_text(item_id)

        update_status(item_id, Status.DONE)
        return result

    except Exception as exc:
        update_status(item_id, Status.FAILED, error=str(exc))
        # Celery retry with exponential backoff: 2^retry seconds
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)


# ── OCR processor ─────────────────────────────────────────────────────────────

@celery_app.task(name="ocr_screenshot")
def ocr_screenshot(item_id: str) -> dict:
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


# ── Audio/Video transcription (stub — full Whisper in Phase 2) ───────────────

@celery_app.task(name="transcribe_audio")
def transcribe_audio(item_id: str) -> dict:
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


# ── Plain text extractor ──────────────────────────────────────────────────────

@celery_app.task(name="extract_text")
def extract_text(item_id: str) -> dict:
    """
    Handle items that already have text (THOUGHT, AI_CHAT, URL).
    Right now: just copies raw_content to extracted_text.
    Phase 2 will add: entity extraction, summarisation, embedding.
    """
    load_item, _, update_extracted_text, _ = _get_store()

    item = load_item(item_id)
    if not item:
        return {"error": "Item not found"}

    text = item.raw_content or ""
    update_extracted_text(item_id, text)
    return {"item_id": item_id, "chars": len(text)}

"""
second_brain/storage/store.py
─────────────────────────────
Phase 1 storage: dead-simple JSON file per item on disk.

Why not a real DB yet?
  Phase 1's goal is to get data IN reliably.
  A flat JSON store is transparent — you can open any file and read it.
  Phase 2 will migrate this into Neo4j + Qdrant.

Structure:
  storage/uploads/          ← raw files (images, videos, docs)
  storage/items/            ← one .json file per IngestionItem
  storage/items/index.json  ← quick lookup: id → file path + status
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from models import IngestionItem, Status


ITEMS_DIR  = Path("./storage/items")
UPLOAD_DIR = Path("./storage/uploads")
INDEX_FILE = ITEMS_DIR / "index.json"


def _ensure_dirs():
    ITEMS_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _load_index() -> dict:
    if INDEX_FILE.exists():
        return json.loads(INDEX_FILE.read_text())
    return {}


def _save_index(index: dict):
    INDEX_FILE.write_text(json.dumps(index, indent=2, default=str))


# ── Public API ────────────────────────────────────────────────────────────────

def save_item(item: IngestionItem) -> Path:
    """Persist an IngestionItem to disk. Returns the path written."""
    _ensure_dirs()
    item_file = ITEMS_DIR / f"{item.id}.json"
    item_file.write_text(item.model_dump_json(indent=2))

    # Update index
    index = _load_index()
    index[item.id] = {
        "path": str(item_file),
        "status": item.status,
        "source_type": item.source_type,
        "created_at": item.created_at.isoformat(),
        "title": item.title,
    }
    _save_index(index)
    return item_file


def load_item(item_id: str) -> IngestionItem | None:
    """Load a single item by ID."""
    item_file = ITEMS_DIR / f"{item_id}.json"
    if not item_file.exists():
        return None
    return IngestionItem.model_validate_json(item_file.read_text())


def update_status(item_id: str, status: Status, error: str | None = None):
    """Quickly flip status without loading the full item."""
    item = load_item(item_id)
    if not item:
        return
    item.status = status
    if status == Status.DONE:
        item.processed_at = datetime.now(timezone.utc)
    if error:
        item.error = error
    save_item(item)


def update_extracted_text(item_id: str, text: str):
    """Write back extracted text after OCR / transcription."""
    item = load_item(item_id)
    if not item:
        return
    item.extracted_text = text
    save_item(item)


def list_items(limit: int = 50, status: Status | None = None) -> list[dict]:
    """Return lightweight index entries (not full items)."""
    index = _load_index()
    entries = list(index.values())
    if status:
        entries = [e for e in entries if e["status"] == status]
    # Sort newest first
    entries.sort(key=lambda e: e.get("created_at", ""), reverse=True)
    return entries[:limit]


def all_items_full(limit: int = 100) -> list[IngestionItem]:
    """Load all full IngestionItem objects. Use carefully on large stores."""
    index = _load_index()
    items = []
    for item_id in list(index.keys())[:limit]:
        item = load_item(item_id)
        if item:
            items.append(item)
    return sorted(items, key=lambda i: i.created_at, reverse=True)

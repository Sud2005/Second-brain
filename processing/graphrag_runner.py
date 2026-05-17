"""
second_brain/processing/graphrag_runner.py
───────────────────────────────────────────
Microsoft GraphRAG integration for community detection.

GraphRAG builds communities (clusters) of related concepts across the entire
corpus. This is EXPENSIVE — designed to run nightly via Celery Beat, not per-item.

Workflow:
  1. Export all items with extracted_text to a text corpus
  2. Run GraphRAG indexing pipeline
  3. Parse community reports
  4. Store community_id on each item's metadata
  5. Expose get_community_summary(id) for the API

USAGE:
  from processing.graphrag_runner import run_full_pipeline, get_community_summary
  run_full_pipeline()                         # nightly batch job
  summary = get_community_summary("c_0")     # get community info
"""

import sys
import os
import json
import logging
import hashlib
from pathlib import Path
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import settings

logger = logging.getLogger(__name__)

# ── Paths ─────────────────────────────────────────────────────────────────────

GRAPHRAG_DIR = Path("./storage/graphrag")
CORPUS_DIR = GRAPHRAG_DIR / "input"
OUTPUT_DIR = GRAPHRAG_DIR / "output"
COMMUNITIES_FILE = GRAPHRAG_DIR / "communities.json"


# ── Corpus builder ───────────────────────────────────────────────────────────

def _build_corpus() -> int:
    """
    Export all items with extracted_text to individual text files
    in the GraphRAG input directory.
    Returns count of documents written.
    """
    from storage.store import all_items_full

    CORPUS_DIR.mkdir(parents=True, exist_ok=True)

    # Clear old corpus
    for f in CORPUS_DIR.glob("*.txt"):
        f.unlink()

    items = all_items_full(limit=10_000)
    count = 0

    for item in items:
        text = item.extracted_text or item.raw_content or ""
        if not text.strip() or len(text.strip()) < 20:
            continue

        # Create document with metadata header
        doc_content = f"Title: {item.title or 'Untitled'}\n"
        doc_content += f"Type: {item.source_type}\n"
        doc_content += f"Tags: {', '.join(item.tags)}\n"
        doc_content += f"Date: {item.created_at.isoformat() if item.created_at else ''}\n"
        doc_content += f"---\n{text}\n"

        # Use a stable filename based on item id
        filename = f"{item.id}.txt"
        (CORPUS_DIR / filename).write_text(doc_content, encoding="utf-8")
        count += 1

    logger.info(f"Built GraphRAG corpus: {count} documents")
    return count


# ── Community detection (simplified) ─────────────────────────────────────────

def _run_community_detection() -> list[dict]:
    """
    Run a simplified community detection using entity co-occurrence.

    Full Microsoft GraphRAG requires significant setup and compute.
    This implementation uses the entity data we already have to build
    communities based on co-occurring entities across items.

    Each community is a cluster of items that share entities.
    """
    from processing.entity_extractor import load_entities
    from storage.store import all_items_full

    items = all_items_full(limit=10_000)

    # Build entity → items mapping
    entity_to_items: dict[str, set[str]] = {}
    item_entities: dict[str, list[str]] = {}

    for item in items:
        entities = load_entities(item.id)
        entity_texts = [e.text.lower() for e in entities]
        item_entities[item.id] = entity_texts

        for et in entity_texts:
            if et not in entity_to_items:
                entity_to_items[et] = set()
            entity_to_items[et].add(item.id)

    # Simple community detection: items that share 2+ entities are in the same community
    communities: list[dict] = []
    assigned: set[str] = set()
    community_id = 0

    for item in items:
        if item.id in assigned:
            continue

        # Find all items connected to this one via shared entities
        cluster = {item.id}
        frontier = {item.id}

        while frontier:
            current = frontier.pop()
            for entity in item_entities.get(current, []):
                for related_id in entity_to_items.get(entity, set()):
                    if related_id not in cluster:
                        # Check if they share at least 2 entities
                        shared = set(item_entities.get(current, [])) & set(item_entities.get(related_id, []))
                        if len(shared) >= 2:
                            cluster.add(related_id)
                            frontier.add(related_id)

        if len(cluster) > 1:
            # Collect shared entities as community theme
            all_ents = []
            for cid in cluster:
                all_ents.extend(item_entities.get(cid, []))
            from collections import Counter
            common_entities = [e for e, c in Counter(all_ents).most_common(5) if c > 1]

            community = {
                "id": community_id,
                "item_ids": list(cluster),
                "size": len(cluster),
                "key_entities": common_entities,
                "summary": f"Community of {len(cluster)} items connected through: {', '.join(common_entities[:3])}",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            communities.append(community)
            assigned.update(cluster)
            community_id += 1

    # Assign remaining items to individual communities
    for item in items:
        if item.id not in assigned:
            communities.append({
                "id": community_id,
                "item_ids": [item.id],
                "size": 1,
                "key_entities": item_entities.get(item.id, [])[:3],
                "summary": f"Individual item: {item.title or 'Untitled'}",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            assigned.add(item.id)
            community_id += 1

    return communities


def _save_communities(communities: list[dict]):
    """Save community data and update items with community_id."""
    GRAPHRAG_DIR.mkdir(parents=True, exist_ok=True)
    COMMUNITIES_FILE.write_text(json.dumps(communities, indent=2, default=str))

    # Update items with their community_id
    from storage.store import load_item, save_item

    for community in communities:
        for item_id in community["item_ids"]:
            item = load_item(item_id)
            if item:
                item.metadata["community_id"] = community["id"]
                save_item(item)

    # Update Neo4j community_id if available
    try:
        from processing.graph_writer import _get_driver
        driver = _get_driver()
        if driver:
            with driver.session() as session:
                for community in communities:
                    for item_id in community["item_ids"]:
                        session.run(
                            "MATCH (i:Item {id: $id}) SET i.community_id = $cid",
                            id=item_id, cid=community["id"],
                        )
    except Exception as e:
        logger.warning(f"Failed to update Neo4j with community IDs: {e}")


# ── Public API ────────────────────────────────────────────────────────────────

def run_full_pipeline() -> dict:
    """
    Full GraphRAG pipeline:
    1. Build text corpus from all items
    2. Run community detection
    3. Save communities + update items
    Returns stats dict.
    """
    logger.info("Starting GraphRAG pipeline...")

    doc_count = _build_corpus()
    if doc_count == 0:
        logger.warning("No documents to process — skipping GraphRAG.")
        return {"documents": 0, "communities": 0}

    communities = _run_community_detection()
    _save_communities(communities)

    logger.info(f"GraphRAG complete: {doc_count} docs → {len(communities)} communities")
    return {
        "documents": doc_count,
        "communities": len(communities),
        "largest_community": max((c["size"] for c in communities), default=0),
    }


def get_community_summary(community_id: int) -> dict | None:
    """Get a specific community's data by ID."""
    if not COMMUNITIES_FILE.exists():
        return None

    communities = json.loads(COMMUNITIES_FILE.read_text())
    for c in communities:
        if c["id"] == community_id:
            return c
    return None


def get_all_communities() -> list[dict]:
    """Get all community summaries."""
    if not COMMUNITIES_FILE.exists():
        return []
    return json.loads(COMMUNITIES_FILE.read_text())


# ── Test block ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Running GraphRAG pipeline...")
    result = run_full_pipeline()
    print(f"\nResults:")
    print(f"  Documents processed: {result['documents']}")
    print(f"  Communities found:   {result['communities']}")

    communities = get_all_communities()
    for c in communities[:5]:
        print(f"\n  Community {c['id']}: {c['size']} items")
        print(f"    Entities: {', '.join(c['key_entities'][:5])}")
        print(f"    Summary:  {c['summary'][:100]}")

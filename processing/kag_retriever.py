"""
second_brain/processing/kag_retriever.py
─────────────────────────────────────────
Knowledge-Augmented Generation: fused graph + vector search.

Query flow:
  1. Embed the user's query → vector search Qdrant (top-k)
  2. Extract entities from query → graph traversal Neo4j
  3. Merge results: score = 0.6 * vector_score + 0.4 * graph_score
  4. Return top-N fused results with explanations

USAGE:
  from processing.kag_retriever import search
  results = search("what do I know about transformer architectures", limit=5)
"""

import sys
import os
import logging

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import settings
from models import SearchResult, SearchResponse

logger = logging.getLogger(__name__)

# ── Score weights ─────────────────────────────────────────────────────────────

VECTOR_WEIGHT = 0.6
GRAPH_WEIGHT = 0.4


# ── Query entity extraction (lightweight) ────────────────────────────────────

def _extract_query_entities(query: str) -> list[str]:
    """Extract entity texts from a search query using spaCy."""
    try:
        from processing.entity_extractor import _get_nlp, SPACY_LABEL_MAP, VALID_LABELS
        nlp = _get_nlp()
        doc = nlp(query)
        entities = []
        for ent in doc.ents:
            mapped = SPACY_LABEL_MAP.get(ent.label_)
            if mapped and mapped in VALID_LABELS:
                entities.append(ent.text.strip())

        # Also add noun chunks as potential concepts
        for chunk in doc.noun_chunks:
            text = chunk.text.strip()
            if len(text) > 2 and text.lower() not in ("i", "we", "you", "it", "they"):
                if text not in entities:
                    entities.append(text)

        return entities[:10]

    except Exception as e:
        logger.warning(f"Query entity extraction failed: {e}")
        # Fallback: split on spaces and take significant words
        words = [w for w in query.split() if len(w) > 3]
        return words[:5]


# ── Vector search ─────────────────────────────────────────────────────────────

def _vector_search(query: str, limit: int) -> dict[str, dict]:
    """
    Embed query → search Qdrant → return {item_id: {score, payload}}.
    """
    try:
        from processing.embedder import embed_text, search_vectors

        query_vec = embed_text(query)
        if not query_vec or all(v == 0 for v in query_vec):
            return {}

        hits = search_vectors(query_vec, limit=limit)
        return {
            h["item_id"]: {
                "score": h["score"],
                "payload": h["payload"],
                "matched_via": ["vector"],
            }
            for h in hits
        }

    except Exception as e:
        logger.warning(f"Vector search failed: {e}")
        return {}


# ── Graph search ──────────────────────────────────────────────────────────────

def _graph_search(entities: list[str], limit: int) -> dict[str, dict]:
    """
    Search Neo4j for items mentioning the query's entities.
    Returns {item_id: {score, entity_matches}}.
    """
    if not entities:
        return {}

    try:
        from processing.graph_writer import search_entities_in_graph

        hits = search_entities_in_graph(entities, limit=limit)
        results: dict[str, dict] = {}

        for hit in hits:
            item_id = hit["item_id"]
            if item_id not in results:
                results[item_id] = {
                    "score": 0.0,
                    "entity_matches": [],
                    "title": hit.get("title", ""),
                }
            # Accumulate salience from multiple entity matches
            results[item_id]["score"] += (hit.get("salience") or 0.5)
            results[item_id]["entity_matches"].append(hit.get("entity_text", ""))

        # Normalize scores to 0-1
        if results:
            max_score = max(r["score"] for r in results.values())
            if max_score > 0:
                for r in results.values():
                    r["score"] = r["score"] / max_score

        return results

    except Exception as e:
        logger.warning(f"Graph search failed: {e}")
        return {}


# ── Fusion ────────────────────────────────────────────────────────────────────

def search(query: str, limit: int = 5) -> SearchResponse:
    """
    Full KAG search: fuse vector + graph results.

    Returns SearchResponse with:
      - results: list[SearchResult]
      - query_entities: entities extracted from the query
      - total: number of results
    """
    from storage.store import load_item

    # Step 1: Extract entities from query
    query_entities = _extract_query_entities(query)
    logger.info(f"Query entities: {query_entities}")

    # Step 2: Run both searches
    vector_results = _vector_search(query, limit=limit * 2)
    graph_results = _graph_search(query_entities, limit=limit * 2)

    # Step 3: Fuse scores
    all_item_ids = set(vector_results.keys()) | set(graph_results.keys())
    fused: list[dict] = []

    for item_id in all_item_ids:
        v_data = vector_results.get(item_id, {})
        g_data = graph_results.get(item_id, {})

        v_score = v_data.get("score", 0.0)
        g_score = g_data.get("score", 0.0)

        fused_score = (VECTOR_WEIGHT * v_score) + (GRAPH_WEIGHT * g_score)

        matched_via = []
        if v_data:
            matched_via.append("vector")
        if g_data:
            for entity in g_data.get("entity_matches", []):
                matched_via.append(f"entity:{entity}")

        fused.append({
            "item_id": item_id,
            "score": round(fused_score, 4),
            "matched_via": matched_via,
        })

    # Sort by fused score, take top-N
    fused.sort(key=lambda x: x["score"], reverse=True)
    top = fused[:limit]

    # Step 4: Enrich with item data
    results: list[SearchResult] = []
    for entry in top:
        item = load_item(entry["item_id"])
        if not item:
            continue

        text = item.extracted_text or item.raw_content or ""
        excerpt = text[:200].replace("\n", " ").strip()
        if len(text) > 200:
            excerpt += "..."

        results.append(SearchResult(
            item_id=item.id,
            title=item.title,
            summary=item.summary,
            score=entry["score"],
            matched_via=entry["matched_via"],
            excerpt=excerpt,
        ))

    return SearchResponse(
        results=results,
        query_entities=query_entities,
        total=len(results),
    )


# ── Test block ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    query = "what do I know about transformer architectures"
    print(f"Searching: \"{query}\"")

    response = search(query, limit=5)

    print(f"\nEntities extracted from query: {response.query_entities}")
    print(f"Results: {response.total}")

    for i, r in enumerate(response.results, 1):
        print(f"\n  {i}. [{r.score:.4f}] {r.title or 'Untitled'}")
        print(f"     Matched via: {', '.join(r.matched_via)}")
        print(f"     Excerpt: {r.excerpt[:100]}...")

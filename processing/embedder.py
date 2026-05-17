"""
second_brain/processing/embedder.py
────────────────────────────────────
Embeds IngestionItem text into vectors and stores them in Qdrant.

Uses OpenAI text-embedding-3-small (1536 dimensions).
Handles: empty text, text > 8192 tokens (chunk + mean-pool).
Qdrant collection: second_brain_items (auto-created on first use).

USAGE:
  from processing.embedder import embed_and_store
  embed_and_store(item)                # embed + upsert to Qdrant
  embed_text("some query")            # get raw embedding vector
"""

import sys
import os
import logging
import math
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import tiktoken
from openai import OpenAI
from qdrant_client import QdrantClient
from qdrant_client.models import (
    VectorParams, Distance, PointStruct, Filter, FieldCondition, MatchValue,
)

from config import settings
from models import IngestionItem

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

MAX_TOKENS = 8191          # text-embedding-3-small limit
CHUNK_OVERLAP = 200        # tokens overlap between chunks


# ── Clients (lazy singletons) ────────────────────────────────────────────────

_openai_client: Optional[OpenAI] = None
_qdrant_client: Optional[QdrantClient] = None


def _get_openai() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = OpenAI(api_key=settings.openai_api_key)
    return _openai_client


def _get_qdrant() -> QdrantClient:
    global _qdrant_client
    if _qdrant_client is None:
        _qdrant_client = QdrantClient(url=settings.qdrant_url)
        _ensure_collection()
    return _qdrant_client


def _ensure_collection():
    """Create the Qdrant collection if it doesn't exist yet."""
    client = _qdrant_client
    collections = [c.name for c in client.get_collections().collections]
    if settings.qdrant_collection not in collections:
        client.create_collection(
            collection_name=settings.qdrant_collection,
            vectors_config=VectorParams(
                size=settings.embedding_dim,
                distance=Distance.COSINE,
            ),
        )
        logger.info(f"Created Qdrant collection: {settings.qdrant_collection}")


# ── Token counting + chunking ────────────────────────────────────────────────

def _count_tokens(text: str) -> int:
    """Count tokens using tiktoken for the embedding model."""
    try:
        enc = tiktoken.encoding_for_model(settings.embedding_model)
    except KeyError:
        enc = tiktoken.get_encoding("cl100k_base")
    return len(enc.encode(text))


def _chunk_text(text: str) -> list[str]:
    """
    Split text into chunks that fit within the token limit.
    Uses a sliding window with overlap for context continuity.
    """
    try:
        enc = tiktoken.encoding_for_model(settings.embedding_model)
    except KeyError:
        enc = tiktoken.get_encoding("cl100k_base")

    tokens = enc.encode(text)
    if len(tokens) <= MAX_TOKENS:
        return [text]

    chunks = []
    start = 0
    while start < len(tokens):
        end = min(start + MAX_TOKENS, len(tokens))
        chunk_tokens = tokens[start:end]
        chunks.append(enc.decode(chunk_tokens))
        start += MAX_TOKENS - CHUNK_OVERLAP

    return chunks


# ── Embedding ─────────────────────────────────────────────────────────────────

def embed_text(text: str) -> list[float]:
    """
    Embed a string into a vector. Handles chunking for long texts.
    Returns a single vector (mean-pooled if chunked).
    """
    if not text or not text.strip():
        return [0.0] * settings.embedding_dim

    chunks = _chunk_text(text)
    client = _get_openai()

    if len(chunks) == 1:
        resp = client.embeddings.create(
            input=chunks[0],
            model=settings.embedding_model,
        )
        return resp.data[0].embedding

    # Multiple chunks: embed each, then mean-pool
    all_embeddings = []
    for chunk in chunks:
        resp = client.embeddings.create(
            input=chunk,
            model=settings.embedding_model,
        )
        all_embeddings.append(resp.data[0].embedding)

    # Mean pool across all chunk embeddings
    dim = len(all_embeddings[0])
    pooled = [0.0] * dim
    for emb in all_embeddings:
        for i in range(dim):
            pooled[i] += emb[i]
    n = len(all_embeddings)
    pooled = [v / n for v in pooled]

    # Normalize to unit vector
    magnitude = math.sqrt(sum(v * v for v in pooled))
    if magnitude > 0:
        pooled = [v / magnitude for v in pooled]

    return pooled


# ── Store to Qdrant ──────────────────────────────────────────────────────────

def embed_and_store(item: IngestionItem) -> list[float]:
    """
    Full pipeline: embed item text → upsert to Qdrant → return embedding.
    Uses upsert (idempotent — safe to re-run on same item).
    """
    text = item.extracted_text or item.raw_content or ""
    if not text.strip():
        logger.warning(f"Item {item.id} has no text to embed — skipping.")
        return []

    try:
        embedding = embed_text(text)

        qdrant = _get_qdrant()
        qdrant.upsert(
            collection_name=settings.qdrant_collection,
            points=[
                PointStruct(
                    id=item.id,
                    vector=embedding,
                    payload={
                        "item_id": item.id,
                        "source_type": item.source_type.value if hasattr(item.source_type, 'value') else str(item.source_type),
                        "title": item.title or "",
                        "tags": item.tags,
                        "created_at": item.created_at.isoformat() if item.created_at else "",
                    },
                )
            ],
        )
        logger.info(f"Embedded item {item.id} ({len(text)} chars → {len(embedding)} dims)")
        return embedding

    except Exception as e:
        logger.error(f"Embedding failed for {item.id}: {e}")
        raise


def search_vectors(query_embedding: list[float], limit: int = 10) -> list[dict]:
    """
    Search Qdrant for similar vectors. Returns list of
    {item_id, score, payload} dicts, sorted by score descending.
    """
    try:
        qdrant = _get_qdrant()
        results = qdrant.search(
            collection_name=settings.qdrant_collection,
            query_vector=query_embedding,
            limit=limit,
        )
        return [
            {
                "item_id": hit.id,
                "score": hit.score,
                "payload": hit.payload or {},
            }
            for hit in results
        ]
    except Exception as e:
        logger.error(f"Vector search failed: {e}")
        return []


# ── Test block ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    from models import IngestionItem, SourceType

    sample = IngestionItem(
        source_type=SourceType.THOUGHT,
        raw_content="GraphRAG uses community detection on knowledge graphs to improve retrieval-augmented generation for multi-hop questions.",
        title="GraphRAG Test",
        tags=["test", "graphrag"],
    )
    sample.extracted_text = sample.raw_content

    print(f"Embedding item: {sample.id}")
    vec = embed_and_store(sample)
    print(f"Vector dimension: {len(vec)}")
    print(f"First 5 values: {vec[:5]}")

    # Test search
    results = search_vectors(vec, limit=3)
    print(f"\nSearch returned {len(results)} results:")
    for r in results:
        print(f"  {r['item_id']} — score: {r['score']:.4f}")

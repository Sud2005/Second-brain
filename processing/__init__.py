"""
second_brain/processing/
────────────────────────
Phase 2 intelligence layer.

Modules:
  embedder           — OpenAI embeddings → Qdrant vector store
  entity_extractor   — spaCy + LLM entity extraction
  graph_writer       — Neo4j graph database writes
  summariser         — LLM-powered memory card generation
  graphrag_runner    — Microsoft GraphRAG community detection
  kag_retriever      — Knowledge-Augmented Generation (fused search)
"""

from .embedder import embed_and_store
from .entity_extractor import extract_entities
from .graph_writer import write_item_to_graph
from .summariser import summarise
from .kag_retriever import search

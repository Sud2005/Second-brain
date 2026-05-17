# Second Brain — Phase 2 Context

## What Was Built

### New Files Created
- `processing/__init__.py` — Package init with clean imports
- `processing/embedder.py` — OpenAI text-embedding-3-small → Qdrant vector store
- `processing/entity_extractor.py` — spaCy + OpenAI entity extraction (7 entity types)
- `processing/graph_writer.py` — Neo4j graph database writes + read operations
- `processing/summariser.py` — LLM memory card generation (OpenAI / Anthropic)
- `processing/graphrag_runner.py` — Community detection via entity co-occurrence
- `processing/kag_retriever.py` — KAG fused graph+vector search
- `PHASE2_SETUP.md` — Setup guide with migration instructions
- `CONTEXT.md` — This file

### Files Modified
- `config.py` — Added Neo4j, Qdrant, embedding, and summariser settings
- `models.py` — Added Entity, SearchResult, SearchResponse, GraphNode, GraphEdge, GraphNeighborsResponse models
- `task_queue/tasks.py` — Extended process_item with Phase 2 pipeline; added run_graphrag_nightly and migrate_phase2 tasks; added Celery Beat schedule
- `api/main.py` — Added /search, /graph/neighbors/{id}, /communities, /communities/{id} endpoints
- `brain_cli.py` — Added `brain search "query"` command
- `docker-compose.yml` — Added neo4j, qdrant, and celery-beat services
- `requirements.txt` — Added qdrant-client, neo4j, openai, tiktoken, spacy, anthropic
- `.env.example` — Documented all new environment variables

---

## Data Stores

### Neo4j (Graph Database)
- **URI:** `bolt://localhost:7687`
- **Browser:** `http://localhost:7474`
- **Auth:** `neo4j` / `secondbrain`
- **Schema:**
  - `(:Item {id, title, source_type, created_at, summary, community_id})`
  - `(:Entity {text, label})`
  - `(Item)-[:MENTIONS {salience: float}]->(Entity)`
  - `(Entity)-[:CO_OCCURS_WITH]->(Entity)`
  - `(Item)-[:RELATED_TO {via: str}]->(Item)`
- **Indexes:** `Item.id`, `Entity(text, label)`
- **Key Queries:**
  - Get neighbors: `MATCH (start:Item {id: $id})-[*1..N]->(connected) RETURN ...`
  - Find by entity: `MATCH (i:Item)-[:MENTIONS]->(e:Entity) WHERE toLower(e.text) = toLower($text)`

### Qdrant (Vector Store)
- **URL:** `http://localhost:6333`
- **Dashboard:** `http://localhost:6333/dashboard`
- **Collection:** `second_brain_items`
- **Vector Dimensions:** 1536 (text-embedding-3-small)
- **Distance:** Cosine
- **Payload fields:** `item_id`, `source_type`, `title`, `tags`, `created_at`
- **Point ID:** item UUID string

---

## Key Endpoints Added

### `GET /search`
- **Query params:** `q` (required, search query), `limit` (default 5)
- **Response:** `SearchResponse`
```json
{
  "results": [
    {
      "item_id": "uuid",
      "title": "string",
      "summary": "string",
      "score": 0.85,
      "matched_via": ["vector", "entity:GraphRAG"],
      "excerpt": "200 char snippet..."
    }
  ],
  "query_entities": ["GraphRAG", "transformer"],
  "total": 5
}
```

### `GET /graph/neighbors/{item_id}`
- **Query params:** `depth` (default 2, max 4)
- **Response:** `GraphNeighborsResponse`
```json
{
  "nodes": [
    {"id": "uuid", "label": "title", "type": "item|entity", "community_id": 0, "score": null}
  ],
  "edges": [
    {"source": "id", "target": "id", "relation": "MENTIONS|RELATED_TO|CO_OCCURS_WITH", "weight": 0.8}
  ]
}
```

### `GET /communities`
- **Response:**
```json
{
  "communities": [
    {
      "id": 0,
      "item_ids": ["uuid1", "uuid2"],
      "size": 2,
      "key_entities": ["GraphRAG", "Neo4j"],
      "summary": "Community of 2 items connected through: GraphRAG, Neo4j",
      "created_at": "2026-05-17T..."
    }
  ],
  "total": 5
}
```

### `GET /communities/{community_id}`
- Returns single community object (same shape as above)

---

## Data Flow

```
Item arrives (POST /ingest/*)
  → FastAPI validates + creates IngestionItem
  → Saved to storage/items/<uuid>.json
  → Pushed to Celery queue via Redis
  → Worker picks up:
    ┌─ Phase 1: Text extraction ─────────────────┐
    │  SCREENSHOT → Tesseract OCR                 │
    │  VIDEO/AUDIO → Whisper (stub)               │
    │  THOUGHT/CHAT/URL → copy raw_content        │
    └─────────────────────────────────────────────┘
    ┌─ Phase 2: Intelligence pipeline ────────────┐
    │  1. summariser.summarise(item)              │
    │     → LLM generates memory card             │
    │     → item.summary + metadata["memory_card"]│
    │  2. entity_extractor.extract(item)          │
    │     → spaCy NER + LLM concept extraction    │
    │     → saved to storage/entities/<id>.json    │
    │  3. embedder.embed_and_store(item)           │
    │     → OpenAI embedding → Qdrant upsert      │
    │     → item.embedding saved                  │
    │  4. graph_writer.write(item, entities)       │
    │     → Neo4j: Item node, Entity nodes         │
    │     → MENTIONS, CO_OCCURS, RELATED_TO edges  │
    └─────────────────────────────────────────────┘
  → status = DONE
```

---

## Entity Schema

```python
class Entity(BaseModel):
    text: str                  # "GraphRAG", "Transformer", "OpenAI"
    label: str                 # PERSON | ORG | GPE | CONCEPT | TECHNOLOGY | DATE | EVENT
    salience: float = 0.5      # 0.0–1.0 centrality score
    source_item_id: str        # UUID of the item it was extracted from
```

- **Standard NER (spaCy):** PERSON, ORG, GPE, DATE, EVENT
- **Custom LLM labels:** CONCEPT, TECHNOLOGY
- **Storage:** `storage/entities/<item_id>.json`

---

## GraphRAG

- **Schedule:** Nightly via Celery Beat (every 24h), or manual trigger
- **Corpus:** All items exported to `storage/graphrag/input/*.txt`
- **Algorithm:** Entity co-occurrence based community detection
  - Items sharing 2+ entities → same community
  - BFS-style cluster expansion
- **Output:** `storage/graphrag/communities.json`
- **Community fields:** `id`, `item_ids`, `size`, `key_entities`, `summary`
- **Item metadata:** `item.metadata["community_id"]` set after detection
- **Neo4j:** `Item.community_id` property updated

---

## Known Limitations / TODOs for Phase 3

1. **GraphRAG is simplified** — Uses entity co-occurrence clustering rather than full Microsoft GraphRAG library (which requires significant compute). Can be upgraded later.
2. **Whisper transcription is still a stub** — VIDEO/AUDIO items get placeholder text. Phase 3 should enable this.
3. **No real-time graph updates** — Graph UI will need to poll or use WebSocket for live updates.
4. **Community detection is batch-only** — New items don't get community_id until next nightly run.
5. **Qdrant uses UUID strings as point IDs** — Phase 3 graph UI should use item.id consistently.
6. **Search scores are not perfectly calibrated** — The 0.6/0.4 vector/graph weight split may need tuning.
7. **Entity salience is frequency-based** — Could be improved with TF-IDF or LLM ranking.
8. **No authentication** — CORS is set to `*`. Phase 3 should add auth for production.

### Phase 3 API Contract
The following endpoints are ready for the React + Three.js graph UI:
- `GET /items` → node list sidebar
- `GET /search?q=...` → highlight search results in graph
- `GET /graph/neighbors/{item_id}?depth=2` → render 3D node neighborhood
- `GET /communities` → color-code community clusters

---

## Environment Variables Added

| Variable | Example | Purpose |
|---|---|---|
| `NEO4J_URI` | `bolt://localhost:7687` | Neo4j connection |
| `NEO4J_USER` | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | `secondbrain` | Neo4j password |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant REST endpoint |
| `QDRANT_COLLECTION` | `second_brain_items` | Qdrant collection name |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | OpenAI embedding model |
| `EMBEDDING_DIM` | `1536` | Vector dimensions |
| `SUMMARISER_PROVIDER` | `openai` | LLM provider (openai\|anthropic) |
| `SUMMARISER_MODEL` | `gpt-4o-mini` | LLM model name |
| `OPENAI_API_KEY` | `sk-...` | OpenAI API key |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Anthropic API key (optional) |

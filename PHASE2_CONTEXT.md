# Second Brain: Phase 2 Context (The Intelligence Layer)

Phase 2 evolved the "Second Brain" from a dumb storage system (Phase 1) into an active, intelligent Knowledge Graph system capable of understanding, connecting, and searching your thoughts using cutting-edge GraphRAG and vector search techniques.

## Core Philosophical Shift
In Phase 1, data was simply ingested and saved as flat JSON files in `storage/items/`. 
In Phase 2, every ingested item is run through a modular **Intelligence Pipeline** powered by 100% free, local AI (Ollama), transforming unstructured text into structured, searchable data inside vector and graph databases.

## 1. The Intelligence Pipeline (`processing/`)
The `task_queue` now routes every new item through four distinct modules:

1. **Summariser (`processing/summariser.py`)**
   - Uses local LLM (`llama3.2` via Ollama).
   - Generates a 2-sentence summary of the text.
   - Creates a "Memory Card" attached to the JSON item containing: `summary`, `key_concepts`, `suggested_connections`, and `action`.

2. **Entity Extractor (`processing/entity_extractor.py`)**
   - **Hybrid Approach:** Uses `spaCy` (`en_core_web_sm`) to quickly extract standard entities like `PERSON`, `ORG`, `GPE`, `DATE`, and `EVENT`.
   - Uses local LLM (`llama3.2`) to extract harder, abstract entities: `CONCEPT` and `TECHNOLOGY`.
   - Deduplicates and assigns a "salience" score based on frequency, saving to `storage/entities/<id>.json`.

3. **Embedder (`processing/embedder.py`)**
   - Uses local embedding model (`nomic-embed-text` via Ollama) to convert text chunks into 768-dimensional math vectors.
   - Automatically mean-pools chunks if the text is long.
   - Upserts vectors into the local **Qdrant** vector database (collection: `second_brain_items`).

4. **Graph Writer (`processing/graph_writer.py`)**
   - Upserts items, entities, and relationships into **Neo4j** (`http://localhost:7474`).
   - Creates `(Item)` nodes and `(Entity)` nodes.
   - Connects them via `[MENTIONS]` relationships.
   - Creates `[CO_OCCURS_WITH]` relationships between entities mentioned in the same item.

## 2. Advanced Retrieval (KAG)
To query the brain, we implemented a Knowledge-Augmented Generation (KAG) fused retrieval system.

- **`processing/kag_retriever.py`**:
  - Takes a natural language query.
  - **Path A (Vector):** Embeds the query and searches Qdrant for conceptually similar items.
  - **Path B (Graph):** Extracts entities from the query using `spaCy`, queries Neo4j for connected graph components, and ranks items that share identical concepts.
  - **Fusion:** Merges the scores using a configurable weight (default: 60% Vector, 40% Graph).

## 3. GraphRAG Community Detection
- **`processing/graphrag_runner.py`**: 
  - A scheduled batch job (run via Celery Beat) that performs Microsoft-style GraphRAG logic.
  - It uses the Louvain algorithm inside Neo4j to cluster `(Entity)` nodes that frequently co-occur into "Communities" (themes).
  - Summarizes the themes to generate high-level semantic overviews of the user's brain.

## 4. API and CLI Enhancements
- **FastAPI Endpoints (`api/main.py`)**:
  - `GET /search?q=...` -> Executes the fused KAG retrieval.
  - `GET /graph/neighbors/{item_id}` -> Returns direct graph connections for a specific thought.
  - `GET /communities` -> Returns the GraphRAG clusters.
- **CLI (`brain_cli.py`)**:
  - Added `python brain_cli.py search "query"` which prints beautifully formatted, color-coded search results with scores and LLM summaries.

## 5. Infrastructure Upgrades
- **Docker Compose**: Added Qdrant (port 6333) and Neo4j (port 7474, 7687) containers. Added a `celery-beat` scheduler.
- **Dependencies**: Integrated `requests` (for Ollama API), `qdrant-client`, `neo4j`, and `spacy`.
- **Environment**: Swapped from paid OpenAI keys to a completely free, local architecture pointing at `OLLAMA_BASE_URL=http://localhost:11434`.

---
**TL;DR:** Phase 2 introduced a pipeline that takes raw text, uses local AI to summarize it and find its underlying concepts, converts those concepts into math vectors and graph webs, and fuses them together to provide hyper-accurate, natural language search.

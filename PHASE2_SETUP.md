# Phase 2 Setup Guide

> Follow these steps to set up and run the Phase 2 intelligence pipeline.

---

## Prerequisites

- Python 3.10+
- Docker Desktop (for Neo4j + Qdrant + Redis)
- **Ollama** installed on your machine (for 100% free, local AI)

---

## Step 1: Install Python Dependencies

```bash
cd second-brain
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux

pip install -r requirements.txt
```

## Step 2: Download Models

First, download the spaCy model for standard entity extraction:
```bash
python -m spacy download en_core_web_sm
```

Next, make sure you have installed [Ollama](https://ollama.com/), open a new terminal, and download the free local LLMs:
```bash
ollama pull llama3.2          # For generating summaries and concepts (3GB)
ollama pull nomic-embed-text  # For generating vector embeddings (270MB)
```

## Step 3: Start Infrastructure (Docker)

Make sure Docker Desktop is running, then:

```bash
# Start Redis + Neo4j + Qdrant
docker compose up redis neo4j qdrant -d
```

Wait for all three to be healthy:
```bash
docker compose ps
```

You should see:
- `brain_redis` — port 6379
- `brain_neo4j` — port 7474 (browser) + 7687 (bolt)
- `brain_qdrant` — port 6333

### Verify Neo4j
Open http://localhost:7474 in your browser.
Login: `neo4j` / `secondbrain`

### Verify Qdrant
Open http://localhost:6333/dashboard in your browser.

## Step 4: Configure Environment

```bash
cp .env.example .env
```

By default, the `.env.example` is now configured to point to your local Ollama server (`http://localhost:11434`) for both summarisation and embeddings! No paid API keys are required.

## Step 5: Start the Application

### Option A: Run everything in Docker
```bash
docker compose up --build
```

### Option B: Run Python locally (recommended for development)

**Terminal 1 — API:**
```bash
python api/main.py
```

**Terminal 2 — Celery Worker:**
```bash
celery -A task_queue.tasks worker --loglevel=info
```

**Terminal 3 — Folder Watcher (optional):**
```bash
python ingestion/watchers/folder_watcher.py
```

## Step 6: Migrate Existing Phase 1 Items

If you have existing items from Phase 1, run the migration to process them through the Phase 2 pipeline:

### Option A: Via the Celery task
```bash
python -c "from task_queue.tasks import migrate_phase2; migrate_phase2.delay()"
```

### Option B: Via Python directly
```bash
python -c "
from task_queue.tasks import _run_phase2_pipeline
from storage.store import all_items_full

items = all_items_full(limit=10000)
for i, item in enumerate(items):
    print(f'Processing {i+1}/{len(items)}: {item.title}')
    _run_phase2_pipeline(item.id)
print('Migration complete!')
"
```

## Step 7: Run GraphRAG Community Detection

GraphRAG builds community clusters from your knowledge base. Run it manually:

```bash
python processing/graphrag_runner.py
```

Or trigger via Celery:
```bash
python -c "from task_queue.tasks import run_graphrag_nightly; run_graphrag_nightly.delay()"
```

To enable nightly automatic runs, start Celery Beat:
```bash
celery -A task_queue.tasks beat --loglevel=info
```

Or via Docker:
```bash
docker compose --profile scheduler up -d
```

## Step 8: Test the Search

### Via CLI
```bash
python brain_cli.py search "what do I know about transformers"
```

### Via API
```bash
curl "http://localhost:8000/search?q=transformers&limit=5"
```

### Via Swagger UI
Open http://localhost:8000/docs and try the `/search` endpoint.

---

## Testing Individual Modules

Each Phase 2 module has a `if __name__ == "__main__"` test block:

```bash
python processing/entity_extractor.py    # Test entity extraction
python processing/embedder.py            # Test embedding + Qdrant
python processing/summariser.py          # Test LLM summarisation
python processing/graph_writer.py        # Test Neo4j writes
python processing/kag_retriever.py       # Test fused search
python processing/graphrag_runner.py     # Test community detection
```

---

## Troubleshooting

### "Neo4j unavailable" warnings
This is fine! The pipeline gracefully degrades. Graph features just won't work until Neo4j is running.

### "Vector search failed"
Make sure Qdrant is running: `docker compose up qdrant -d`

### "OpenAI API key not set"
Set `OPENAI_API_KEY` in your `.env` file. Summarisation and embeddings require this.

### Celery worker not processing on Windows
The worker auto-detects Windows and uses `--pool=solo`. If issues persist, try:
```bash
celery -A task_queue.tasks worker --loglevel=info --pool=solo
```

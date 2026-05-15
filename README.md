# Second Brain — Phase 1: Ingestion Layer

> Capture everything. Screenshots, videos, AI conversations, thoughts, URLs.
> Every piece of content becomes a structured item in your brain's pipeline.

---

## What Phase 1 Does

```
You drop a screenshot    →  Folder Watcher detects it
                         →  POSTs to FastAPI
                         →  FastAPI saves it + pushes job to Redis
                         →  Celery Worker picks it up
                         →  OCR extracts text
                         →  Item saved as JSON with extracted_text
                         →  Ready for Phase 2 (graph + vector embedding)
```

---

## Project Structure

```
second-brain/
├── api/
│   └── main.py            ← FastAPI: all HTTP endpoints
├── task_queue/
│   └── tasks.py           ← Celery: async processing workers
├── ingestion/
│   └── watchers/
│       └── folder_watcher.py  ← daemon: watches a folder for new files
├── storage/
│   └── store.py           ← JSON file store (Phase 1 persistence)
├── models.py              ← Pydantic data models (IngestionItem, etc.)
├── config.py              ← Settings from .env
├── brain_cli.py           ← CLI: `brain "my thought"` 
├── requirements.txt
├── docker-compose.yml     ← One command to run everything
└── docker/
    └── Dockerfile
```

---

## Setup: Step by Step

### Step 1 — Clone and enter the project

```bash
git clone <your-repo-url> second-brain
cd second-brain
```

### Step 2 — Create your virtual environment

```bash
python3 -m venv venv
source venv/bin/activate        # macOS / Linux
# venv\Scripts\activate         # Windows
```

### Step 3 — Install dependencies

```bash
pip install -r requirements.txt
```

### Step 4 — Configure environment

```bash
cp .env.example .env
# Open .env and review — defaults work for local dev without changes
```

### Step 5 — Install system dependencies (for OCR)

**macOS:**
```bash
brew install tesseract
```

**Ubuntu/Debian:**
```bash
sudo apt-get install tesseract-ocr
```

**Windows:**
Download from: https://github.com/UB-Mannheim/tesseract/wiki

### Step 6 — Start Redis

Redis is the message broker between the API and workers.

**Option A: Docker (easiest)**
```bash
docker run -d -p 6379:6379 --name brain-redis redis:7-alpine
```

**Option B: macOS Homebrew**
```bash
brew install redis && brew services start redis
```

**Option C: Use Docker Compose (runs everything)**
```bash
docker compose up --build
```

---

## Running the Services

You need 3 terminals running at once (or use Docker Compose):

### Terminal 1: Start the API
```bash
cd second-brain
source venv/bin/activate
python api/main.py
# → API running at http://localhost:8000
# → Docs at http://localhost:8000/docs
```

### Terminal 2: Start the Celery Worker
```bash
cd second-brain
source venv/bin/activate
celery -A task_queue.tasks worker --loglevel=info
# → Worker listening for jobs from Redis
```

### Terminal 3: Start the Folder Watcher
```bash
cd second-brain
source venv/bin/activate
python ingestion/watchers/folder_watcher.py
# → Watching ./watched_inbox/ for new files
```

---

## Using the CLI

### Setup the alias (do this once)
```bash
echo 'alias brain="python /path/to/second-brain/brain_cli.py"' >> ~/.zshrc
source ~/.zshrc
```

### Capture a quick thought
```bash
brain "GraphRAG is better than naive RAG for multi-hop questions"
brain "Read the Attention Is All You Need paper this weekend" --tag reading-list --tag ai
```

### Save a URL
```bash
brain url https://github.com/microsoft/graphrag --title "Microsoft GraphRAG"
brain url https://arxiv.org/abs/1706.03762 --tag papers --tag transformers
```

### Import an AI chat
```bash
# From a file
brain chat --platform claude --file my-chat-export.txt

# Or paste inline (Ctrl+D to finish)
brain chat --platform chatgpt
```

### List captured items
```bash
brain list                    # last 20 items
brain list --limit 50         # last 50
brain list --status pending   # only unprocessed
brain list --status done      # only processed
```

### Inspect an item
```bash
brain show <item-id>          # full item — raw content + extracted text
brain show dcfe34d            # partial ID works too
```

### Check stats
```bash
brain stats
```

---

## API Endpoints

Once the API is running, visit **http://localhost:8000/docs** for the interactive Swagger UI.

| Method | Endpoint | What it does |
|--------|----------|-------------|
| GET | `/health` | Is the API alive? |
| GET | `/stats` | Counts by type and status |
| POST | `/ingest/thought` | Capture a quick text thought |
| POST | `/ingest/url` | Save a URL |
| POST | `/ingest/chat` | Import an AI conversation |
| POST | `/ingest/file` | Upload screenshot / video / doc |
| GET | `/items` | List all items (paginated) |
| GET | `/items/{id}` | Inspect a single item |

### Example: Capture a thought via curl
```bash
curl -X POST http://localhost:8000/ingest/thought \
  -H "Content-Type: application/json" \
  -d '{"content": "Second brains need a capture → process → act loop", "tags": ["architecture"]}'
```

### Example: Upload a screenshot
```bash
curl -X POST http://localhost:8000/ingest/file \
  -F "file=@/path/to/screenshot.png"
```

---

## Docker: Run Everything at Once

```bash
# Start all services (API + Worker + Redis)
docker compose up --build

# Run in background
docker compose up --build -d

# Watch logs
docker compose logs -f api
docker compose logs -f worker

# Start with Flower dashboard (Celery monitoring)
docker compose --profile monitoring up

# Stop everything
docker compose down

# Stop and wipe storage (careful!)
docker compose down -v
```

**Ports when using Docker Compose:**
- API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Flower (Celery dashboard): http://localhost:5555

---

## Configure Your Screenshot Tool

Point your screenshot tool to save into `./watched_inbox/` and the folder watcher does the rest automatically.

**macOS:**
System Settings → Keyboard → Shortcuts → Screenshots → "Save to" → choose `watched_inbox/`

**ShareX (Windows):**
Capture → After capture tasks → Save image to file → set path to `watched_inbox/`

**Flameshot (Linux):**
```bash
flameshot config  # set save path to watched_inbox/
```

---

## How to Learn From This Code

| File | Concept to study |
|------|-----------------|
| `config.py` | Pydantic-settings: type-safe config from env vars |
| `models.py` | Pydantic models: validation, serialization, enums |
| `storage/store.py` | File I/O patterns, JSON persistence |
| `api/main.py` | FastAPI: routes, request bodies, file uploads, status codes |
| `task_queue/tasks.py` | Celery: async tasks, retry logic, task routing |
| `ingestion/watchers/folder_watcher.py` | watchdog: event-driven file system |
| `docker-compose.yml` | Multi-service Docker setup, healthchecks, volumes |
| `docker/Dockerfile` | Multi-stage builds, system deps, non-root user |

---

## Version Control Tips

```bash
# Init git
git init
git add .
git commit -m "feat: phase 1 ingestion layer"

# Never commit secrets or raw captures
cat .gitignore   # storage/ and .env are already excluded

# Branching workflow
git checkout -b feat/phase2-embeddings
git checkout -b fix/ocr-encoding
```

---

## What's Next: Phase 2

Once items are flowing in reliably, Phase 2 adds:

1. **Entity extraction** — spaCy pulls people, places, concepts from extracted text
2. **Vector embeddings** — every item gets embedded into Qdrant
3. **Graph storage** — entities and relationships written to Neo4j
4. **GraphRAG** — Microsoft's community graph builder runs across all items
5. **LLM summaries** — Claude API generates a memory card per item
6. **KAG retrieval** — graph + vector fused at query time

The pipeline is already wired for this. Phase 2 just replaces the stub processors
in `task_queue/tasks.py` with real implementations.

---

*Second Brain · Phase 1 · Built to grow.*

# Second Brain — Phase 3 Context

## What Was Built
A production-quality React frontend (`frontend/`) that visualizes the Second Brain as a living, glowing 3D knowledge graph. Inspired by Obsidian Canvas and Universe sandbox aesthetics — dark space background, glowing community-colored nodes, camera fly-to animations.

### Files Created
```
frontend/
├── index.html                           ← HTML entry with Google Fonts
├── package.json                         ← All deps: R3F, drei, d3-force-3d, zustand, framer-motion
├── vite.config.js                       ← Dev server on :3000, proxy /api → FastAPI :8000
├── Dockerfile.frontend                  ← Docker container for dev server
├── src/
│   ├── main.jsx                         ← React entry point
│   ├── App.jsx                          ← Layout orchestrator
│   ├── api/
│   │   └── client.js                    ← All API calls (getItems, search, ingestThought, etc.)
│   ├── store/
│   │   └── graphStore.js                ← Zustand global state
│   ├── hooks/
│   │   ├── useGraph.js                  ← Fetches items + neighbors → builds node/edge graph
│   │   ├── useSearch.js                 ← 300ms debounced search
│   │   ├── useRealtime.js               ← Polls /items every 10s, spawns new nodes
│   │   └── useCommunities.js            ← Fetches + caches community data
│   ├── components/
│   │   ├── Graph/
│   │   │   ├── GraphCanvas.jsx          ← Main 3D scene (react-three-fiber)
│   │   │   ├── Graph2D.jsx             ← 2D canvas fallback
│   │   │   ├── Timeline.jsx            ← Horizontal timeline with playback
│   │   │   └── GraphErrorBoundary.jsx  ← Catches WebGL crashes → falls back to 2D
│   │   ├── Sidebar/
│   │   │   ├── Sidebar.jsx             ← Left panel: search + filter tabs + item list
│   │   │   ├── SearchBar.jsx           ← Debounced search input
│   │   │   └── ItemCard.jsx            ← Compact item preview card
│   │   ├── Inspector/
│   │   │   ├── Inspector.jsx           ← Right panel: full item detail
│   │   │   ├── MemoryCard.jsx          ← LLM summary + key concepts + action
│   │   │   └── RelatedNodes.jsx        ← Connected nodes list
│   │   ├── HUD/
│   │   │   ├── HUD.jsx                 ← Top overlay: stats + view toggle + capture button
│   │   │   ├── ViewSwitcher.jsx        ← 3D / 2D / Timeline toggle
│   │   │   └── CommunityFilter.jsx     ← Bottom-left community legend + filter
│   │   └── Capture/
│   │       ├── QuickCapture.jsx        ← Ctrl+K floating input
│   │       └── CaptureModal.jsx        ← Full modal: Thought / URL / Chat / File
│   └── styles/
│       └── globals.css                  ← Design system: colors, fonts, glass panels, animations
```

### Files Modified
- `docker-compose.yml` — Added `frontend` service on port 3000

---

## Frontend Architecture

```
App.jsx
├── HUD (fixed top bar)
│   ├── "Second Brain" wordmark
│   ├── Live stats (nodes · connections · themes)
│   └── ViewSwitcher + Capture button
├── Sidebar (fixed left, 280px, glass)
│   ├── SearchBar (debounced, calls /search)
│   ├── Search results (score + matched_via pills)
│   ├── Filter tabs (All | 💭 | 📸 | 🤖 | 🔗)
│   └── ItemCard list (scrollable, newest first)
├── Graph Container (fills remaining space)
│   ├── 3D: GraphCanvas (react-three-fiber + d3-force-3d)
│   ├── 2D: Graph2D (canvas + d3-force)
│   └── Timeline (horizontal axis + community lanes + playback)
├── Inspector (fixed right, 320px, slides in on selection)
│   ├── Title + source type badge + status
│   ├── MemoryCard (summary, key_concepts, connections, action)
│   ├── RelatedNodes (click to fly-to)
│   └── Collapsible raw extracted_text
├── CommunityFilter (fixed bottom-left, floating legend)
├── QuickCapture (Ctrl+K → POST /ingest/thought)
├── CaptureModal (tabs: Thought | URL | Chat | File)
└── Toast notifications
```

State is managed via a single **Zustand** store (`graphStore.js`) — no prop drilling.

---

## API Integration

| Endpoint | Used By | Purpose |
|----------|---------|---------|
| `GET /items?limit=500` | `useGraph` | Build node list + sidebar items |
| `GET /items/{id}` | `Inspector` | Full item detail on selection |
| `GET /stats` | `useGraph` + `HUD` | Live stat counters |
| `GET /search?q=...` | `useSearch` | Debounced search results |
| `GET /graph/neighbors/{id}?depth=1` | `useGraph` + `Inspector` | Build edges + entity nodes |
| `GET /communities` | `useGraph` + `CommunityFilter` | Community data + color assignment |
| `POST /ingest/thought` | `QuickCapture` | Instant capture from UI |
| `POST /ingest/url` | `CaptureModal` | URL capture |
| `POST /ingest/chat` | `CaptureModal` | Chat import |
| `POST /ingest/file` | `CaptureModal` | File upload |

All calls go through `api/client.js` using the `/api/` prefix, which Vite proxies to FastAPI.

---

## 3D Graph Implementation

- **Layout**: `d3-force-3d` runs 120 ticks synchronously on load to compute stable positions
- **Rendering**: `@react-three/fiber` Canvas with `@react-three/drei` helpers (Stars, Billboard, Text, OrbitControls)
- **Nodes**: Spheres (items) and octahedrons (entities), radius proportional to connection count
- **Edges**: `<lineSegments>` with vertex colors based on community
- **Glow**: Each node has a transparent BackSide sphere halo that pulses when selected
- **Camera**: Smooth lerp fly-to animation when selecting a node
- **Background**: #050810 with fog, 2000 Stars points, and a faint grid floor

---

## View Modes

| Mode | Implementation | Best For |
|------|---------------|----------|
| **3D** | react-three-fiber + d3-force-3d | Default — immersive spatial exploration |
| **2D** | Plain `<canvas>` + d3-force (2D) | Fallback for no-GPU devices, faster for large graphs |
| **Timeline** | CSS-positioned nodes on horizontal axis | Seeing how the brain grew over time |

The 3D canvas is wrapped in `GraphErrorBoundary` — if WebGL crashes, it automatically renders `Graph2D` instead.

---

## State Shape (Zustand)

```javascript
{
  nodes: [],                    // { id, label, type, sourceType, icon, communityId, color, connectionCount, ... }
  edges: [],                    // { id, source, target, relation, weight }
  communities: [],              // { id, item_ids, size, key_entities, summary }
  stats: {},                    // { total, by_source_type, by_status }
  items: [],                    // Raw item list from API

  selectedNodeId: null,
  hoveredNodeId: null,
  inspectorOpen: false,

  viewMode: '3d',               // '3d' | '2d' | 'timeline'
  activeCommunityFilter: null,   // community ID or null
  sidebarTab: 'all',

  searchQuery: '',
  searchResults: [],
  searchEntities: [],
  isSearching: false,

  quickCaptureOpen: false,
  captureModalOpen: false,
  toast: null,                   // { message, type }
}
```

---

## Real-time Updates

- `useRealtime.js` polls `GET /items?limit=20` every **10 seconds**
- Compares returned IDs against a `Set` of known IDs
- New items trigger: `addNode()` (with `_isNew` flag), `addItem()`, and a toast notification
- No WebSocket needed — polling is sufficient for Phase 3

---

## Known Limitations / TODOs for Phase 4

1. **No InstancedMesh optimization** — For >500 nodes, should switch to InstancedMesh for performance
2. **Force layout is synchronous** — Could move to a Web Worker for large graphs
3. **No edge frustum culling** — All edges render regardless of camera position
4. **No Sigma.js for 2D** — Using plain canvas instead (simpler, fewer deps)
5. **Timeline lacks lane labels** — Community names should show on the Y axis
6. **No right-click context menu** — "Search similar" / "Expand neighbors" actions not implemented
7. **No authentication** — CORS is `*`, anyone on the network can access
8. **Agent Queue drawer** — Phase 4 placeholder exists in Inspector footer, needs real implementation
9. **Mobile touch controls** — OrbitControls work on mobile but sidebar/inspector need responsive breakpoints

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:8000` | FastAPI backend URL (used in production builds) |

In dev mode, Vite's proxy handles routing — no env var needed.

---

## Local Dev Commands

```bash
# Start the backend (from project root)
docker compose up redis neo4j qdrant -d
python api/main.py                               # Terminal 1
celery -A task_queue.tasks worker --loglevel=info # Terminal 2

# Start the frontend
cd frontend
npm install     # first time only
npm run dev     # → http://localhost:3000
```

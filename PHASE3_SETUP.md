# Phase 3 — Visual Graph UI Setup

## Prerequisites
- Node.js 18+ (recommended: 20)
- Phase 1+2 backend running (FastAPI on port 8000, Docker services)

---

## Quick Start

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

> The Vite dev server proxies all `/api/*` calls to `http://localhost:8000` automatically.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` / `⌘K` | Open Quick Capture |
| `Escape` | Close capture / deselect node |
| `Tab` (in capture) | Expand to full modal |

---

## Pointing at a Different API

Set the environment variable before starting:
```bash
VITE_API_URL=http://192.168.1.5:8000 npm run dev
```

Or edit `vite.config.js` → `server.proxy` target.

---

## Building for Production

```bash
cd frontend
npm run build
npm run preview    # test the build locally at :4173
```

The production build outputs to `frontend/dist/`.

---

## Common Issues

| Issue | Fix |
|-------|-----|
| **CORS errors** | Ensure FastAPI has `CORSMiddleware` with `allow_origins=["*"]` (already configured) |
| **WebGL crash** | The app auto-falls-back to 2D canvas if Three.js fails. Try switching to "2D" in the top-right toggle. |
| **Blank graph** | Make sure you have items in your brain (`brain_cli.py think "test"`) and that the API is running |
| **Slow first load** | The 3D graph needs to compute force layout for all nodes. This takes 1-2s on first load |

---

## Docker

The frontend is included in `docker-compose.yml`:
```bash
docker compose up frontend -d
# → http://localhost:3000
```

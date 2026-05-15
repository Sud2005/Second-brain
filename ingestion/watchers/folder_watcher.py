"""
second_brain/ingestion/watchers/folder_watcher.py
──────────────────────────────────────────────────
OS-level daemon using watchdog to monitor a folder.

HOW IT WORKS:
  1. You set WATCH_FOLDER=./watched_inbox in your .env
  2. Run this script: python ingestion/watchers/folder_watcher.py
  3. Drag any file into watched_inbox/ (or configure your screenshot tool
     to save there automatically)
  4. The watcher fires an HTTP POST to the API — exactly as if you uploaded
     it through the web UI

SCREENSHOT TOOLS TO CONFIGURE:
  macOS: System Settings → Keyboard → Screenshots → set save location
  Windows: Snipping Tool settings or ShareX output folder
  Linux: Flameshot or gnome-screenshot output path

The watcher is intentionally thin — it just POSTs to the API.
All processing logic lives in the API + Celery workers.
"""

import sys
import os
import time
import httpx
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from config import settings
from rich.console import Console

console = Console()

# Extensions we care about — ignore .tmp, .DS_Store etc.
WATCHED_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp",   # screenshots
    ".mp4", ".mov", ".mkv", ".avi",              # videos
    ".mp3", ".wav", ".m4a",                      # audio
    ".pdf", ".docx", ".txt", ".md",              # documents
}

API_BASE = f"http://{settings.api_host}:{settings.api_port}"


class BrainInboxHandler(FileSystemEventHandler):
    """Handles new file events in the watched folder."""

    def on_created(self, event):
        if event.is_directory:
            return

        path = Path(event.src_path)
        if path.suffix.lower() not in WATCHED_EXTENSIONS:
            return

        # Small delay: ensure the file is fully written before we read it
        time.sleep(0.5)

        console.print(f"[cyan]●[/cyan] New file detected: [bold]{path.name}[/bold]")
        self._upload(path)

    def _upload(self, path: Path):
        try:
            with open(path, "rb") as f:
                # Infer MIME type from extension
                mime = _mime(path.suffix.lower())
                response = httpx.post(
                    f"{API_BASE}/ingest/file",
                    files={"file": (path.name, f, mime)},
                    timeout=30,
                )
            if response.status_code == 202:
                data = response.json()
                console.print(f"  [green]✓[/green] Queued → item_id: [dim]{data['item_id']}[/dim]")
            else:
                console.print(f"  [red]✗[/red] API error {response.status_code}: {response.text}")

        except httpx.ConnectError:
            console.print(f"  [red]✗[/red] Can't reach API at {API_BASE} — is it running?")
        except Exception as e:
            console.print(f"  [red]✗[/red] Upload failed: {e}")


def _mime(ext: str) -> str:
    return {
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".gif": "image/gif", ".webp": "image/webp",
        ".mp4": "video/mp4", ".mov": "video/quicktime",
        ".mkv": "video/x-matroska", ".avi": "video/x-msvideo",
        ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
        ".pdf": "application/pdf", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".txt": "text/plain", ".md": "text/markdown",
    }.get(ext, "application/octet-stream")


def run():
    watch_path = settings.watch_folder
    watch_path.mkdir(parents=True, exist_ok=True)

    console.print(f"\n[bold green]Second Brain — Folder Watcher[/bold green]")
    console.print(f"Monitoring: [cyan]{watch_path.resolve()}[/cyan]")
    console.print(f"API target: [cyan]{API_BASE}[/cyan]")
    console.print(f"Watching for: [dim]{', '.join(sorted(WATCHED_EXTENSIONS))}[/dim]\n")
    console.print("Drop any file into the folder above. Press [bold]Ctrl+C[/bold] to stop.\n")

    handler = BrainInboxHandler()
    observer = Observer()
    observer.schedule(handler, str(watch_path), recursive=False)
    observer.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        console.print("\n[dim]Watcher stopped.[/dim]")
    observer.join()


if __name__ == "__main__":
    run()

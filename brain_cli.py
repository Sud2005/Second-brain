"""
second_brain/brain_cli.py
─────────────────────────
The `brain` command — your fastest capture interface.

USAGE:
  python brain_cli.py "my idea about graph databases"
  python brain_cli.py "article to read" --tag research --tag reading-list
  python brain_cli.py chat --platform claude --file export.txt
  python brain_cli.py list
  python brain_cli.py list --status pending
  python brain_cli.py show <item_id>
  python brain_cli.py stats

SETUP (so you can type `brain` instead of `python brain_cli.py`):
  1. chmod +x brain_cli.py
  2. echo 'alias brain="python /path/to/second-brain/brain_cli.py"' >> ~/.zshrc
  3. source ~/.zshrc
  Then: brain "my thought here"
"""

import sys
import os
from pathlib import Path
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import typer
import httpx
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich import box
from config import settings

app  = typer.Typer(help="Second Brain CLI — capture thoughts, list items, check stats.")
console = Console()

API_BASE = f"http://localhost:{settings.api_port}"


def _api(method: str, path: str, **kwargs):
    """Tiny wrapper around httpx with friendly error handling."""
    try:
        resp = httpx.request(method, f"{API_BASE}{path}", timeout=10, **kwargs)
        resp.raise_for_status()
        return resp.json()
    except httpx.ConnectError:
        console.print(f"[red]✗ Can't reach the API at {API_BASE}[/red]")
        console.print("[dim]  Start it with: python api/main.py[/dim]")
        raise typer.Exit(1)
    except httpx.HTTPStatusError as e:
        console.print(f"[red]✗ API error {e.response.status_code}[/red]")
        raise typer.Exit(1)


# ── Capture: quick thought ─────────────────────────────────────────────────────

@app.command(name="think", help="Capture a thought (default command).")
def think(
    content: str = typer.Argument(..., help="Your thought, idea, or note."),
    tag: list[str] = typer.Option([], "--tag", "-t", help="Add a tag (repeatable)."),
):
    data = _api("POST", "/ingest/thought", json={"content": content, "tags": tag})
    console.print(f"[green]✓ Captured[/green] → [dim]{data['item_id']}[/dim]")


# ── Capture: URL ───────────────────────────────────────────────────────────────

@app.command()
def url(
    link: str = typer.Argument(..., help="URL to save."),
    title: Optional[str] = typer.Option(None, "--title", "-T"),
    tag: list[str] = typer.Option([], "--tag", "-t"),
):
    """Save a URL to your brain."""
    data = _api("POST", "/ingest/url", json={"url": link, "title": title, "tags": tag})
    console.print(f"[green]✓ URL saved[/green] → [dim]{data['item_id']}[/dim]")


# ── Capture: AI chat ──────────────────────────────────────────────────────────

@app.command()
def chat(
    platform: str = typer.Option("other", "--platform", "-p", help="chatgpt | claude | gemini | other"),
    file: Optional[Path] = typer.Option(None, "--file", "-f", help="Path to exported chat file."),
    content: Optional[str] = typer.Option(None, "--content", "-c", help="Paste content directly."),
    tag: list[str] = typer.Option([], "--tag", "-t"),
):
    """Import an AI conversation export."""
    if file:
        text = file.read_text(encoding="utf-8", errors="replace")
    elif content:
        text = content
    else:
        console.print("[yellow]Paste your chat content (Ctrl+D to finish):[/yellow]")
        text = sys.stdin.read()

    data = _api("POST", "/ingest/chat", json={
        "platform": platform, "content": text, "tags": tag
    })
    console.print(f"[green]✓ Chat imported[/green] from [cyan]{platform}[/cyan] → [dim]{data['item_id']}[/dim]")


# ── Read: list items ──────────────────────────────────────────────────────────

@app.command(name="list")
def list_items(
    limit: int = typer.Option(20, "--limit", "-n"),
    status: Optional[str] = typer.Option(None, "--status", "-s", help="pending|processing|done|failed"),
):
    """List recently captured items."""
    params = {"limit": limit}
    if status:
        params["status"] = status

    items = _api("GET", "/items", params=params)

    if not items:
        console.print("[dim]No items found.[/dim]")
        return

    table = Table(box=box.SIMPLE_HEAVY, show_header=True, header_style="bold cyan")
    table.add_column("Status",  width=10)
    table.add_column("Type",    width=12)
    table.add_column("Title",   width=40)
    table.add_column("Created", width=20)
    table.add_column("ID",      width=12, style="dim")

    status_colors = {
        "pending":    "yellow",
        "processing": "cyan",
        "done":       "green",
        "failed":     "red",
    }

    for item in items:
        color = status_colors.get(item.get("status", ""), "white")
        table.add_row(
            f"[{color}]{item.get('status', '?')}[/{color}]",
            item.get("source_type", "?"),
            (item.get("title") or "—")[:38],
            (item.get("created_at", "")[:19]).replace("T", " "),
            item.get("id", "?")[:12],
        )

    console.print(table)


# ── Read: single item ─────────────────────────────────────────────────────────

@app.command()
def show(item_id: str = typer.Argument(..., help="Item ID (can be partial prefix).")):
    """Inspect a single item in full."""
    # Support partial ID: list all and find the match
    all_items = _api("GET", "/items", params={"limit": 1000})
    matched = [i for i in all_items if i.get("id", "").startswith(item_id)]

    if not matched:
        console.print(f"[red]No item found matching '{item_id}'[/red]")
        raise typer.Exit(1)

    full = _api("GET", f"/items/{matched[0]['id']}")

    console.print(Panel(
        f"[bold]ID:[/bold]        {full.get('id')}\n"
        f"[bold]Type:[/bold]      {full.get('source_type')}\n"
        f"[bold]Status:[/bold]    {full.get('status')}\n"
        f"[bold]Title:[/bold]     {full.get('title') or '—'}\n"
        f"[bold]Tags:[/bold]      {', '.join(full.get('tags', [])) or '—'}\n"
        f"[bold]Created:[/bold]   {full.get('created_at', '')[:19]}\n\n"
        f"[bold]Raw:[/bold]\n{(full.get('raw_content') or '—')[:500]}\n\n"
        f"[bold]Extracted:[/bold]\n{(full.get('extracted_text') or '[not yet processed]')[:500]}",
        title=f"[cyan]Brain Item[/cyan]",
        border_style="cyan",
    ))


# ── Stats ─────────────────────────────────────────────────────────────────────

@app.command()
def stats():
    """Show ingestion statistics."""
    data = _api("GET", "/stats")

    console.print(Panel(
        f"[bold]Total items:[/bold] {data['total']}\n\n"
        f"[bold]By type:[/bold]\n"
        + "\n".join(f"  {k}: {v}" for k, v in data.get("by_source_type", {}).items())
        + "\n\n[bold]By status:[/bold]\n"
        + "\n".join(f"  {k}: {v}" for k, v in data.get("by_status", {}).items()),
        title="[green]Second Brain Stats[/green]",
        border_style="green",
    ))


# ── Default: if called with a bare string, treat as thought ──────────────────

@app.callback(invoke_without_command=True)
def default(
    ctx: typer.Context,
    content: Optional[str] = typer.Argument(None),
    tag: list[str] = typer.Option([], "--tag", "-t"),
):
    """Capture a thought (default when no subcommand given)."""
    if ctx.invoked_subcommand is None:
        if content:
            think(content=content, tag=tag)
        else:
            console.print(ctx.get_help())


if __name__ == "__main__":
    app()

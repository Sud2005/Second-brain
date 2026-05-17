"""
second_brain/processing/summariser.py
──────────────────────────────────────
Generates LLM-powered "memory cards" for each IngestionItem.

Produces:
  - item.summary          → 2-sentence summary
  - item.metadata["memory_card"] → full structured JSON:
      {summary, key_concepts, suggested_connections, action}

Supports: OpenAI (gpt-4o-mini) or Anthropic (claude-sonnet-4-20250514).
Provider/model configurable via SUMMARISER_PROVIDER and SUMMARISER_MODEL.

USAGE:
  from processing.summariser import summarise
  summarise(item)   # updates item in-place + saves to disk
"""

import sys
import os
import json
import logging

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import settings
from models import IngestionItem

logger = logging.getLogger(__name__)

# ── System prompt ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a knowledge distiller for a personal second brain.
Given a piece of content, extract:
1. A 2-sentence summary (what it's about)
2. 3-5 key concepts (as a list)
3. Connections to suggest (what this might relate to)
4. An action if any (something to do or follow up on)

Respond ONLY in this JSON format:
{
  "summary": "...",
  "key_concepts": ["...", "..."],
  "suggested_connections": ["...", "..."],
  "action": "..." or null
}"""


# ── LLM call implementations ─────────────────────────────────────────────────

def _call_openai(text: str) -> dict:
    """Call OpenAI chat completions API."""
    from openai import OpenAI
    client = OpenAI(api_key=settings.openai_api_key)

    resp = client.chat.completions.create(
        model=settings.summariser_model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Content to distill:\n\n{text[:4000]}"},
        ],
        temperature=0.3,
        max_tokens=500,
        response_format={"type": "json_object"},
    )

    raw = resp.choices[0].message.content.strip()
    return json.loads(raw)


def _call_anthropic(text: str) -> dict:
    """Call Anthropic Claude API."""
    import anthropic
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    resp = client.messages.create(
        model=settings.summariser_model,
        max_tokens=500,
        system=SYSTEM_PROMPT,
        messages=[
            {"role": "user", "content": f"Content to distill:\n\n{text[:4000]}"},
        ],
    )

    raw = resp.content[0].text.strip()
    # Strip markdown fences if present
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()
    return json.loads(raw)


# ── Main summarise function ──────────────────────────────────────────────────

def summarise(item: IngestionItem) -> dict | None:
    """
    Generate a memory card for an item using the configured LLM.

    Updates:
      - item.summary → 2-sentence summary
      - item.metadata["memory_card"] → full structured response

    Returns the memory card dict, or None on failure.
    """
    text = item.extracted_text or item.raw_content or ""
    if not text.strip():
        logger.warning(f"Item {item.id} has no text to summarise.")
        return None

    # Check if API keys are configured
    provider = settings.summariser_provider.lower()
    if provider == "openai" and not settings.openai_api_key:
        logger.warning("OpenAI API key not set — skipping summarisation.")
        return None
    if provider == "anthropic" and not settings.anthropic_api_key:
        logger.warning("Anthropic API key not set — skipping summarisation.")
        return None

    try:
        if provider == "anthropic":
            card = _call_anthropic(text)
        else:
            card = _call_openai(text)

        # Validate expected keys
        if "summary" not in card:
            logger.error(f"LLM response missing 'summary' key for {item.id}")
            return None

        # Update item
        item.summary = card.get("summary", "")
        item.metadata["memory_card"] = card

        logger.info(f"Summarised item {item.id}: {item.summary[:80]}...")
        return card

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse LLM JSON for {item.id}: {e}")
        return None
    except Exception as e:
        logger.error(f"Summarisation failed for {item.id}: {e}")
        return None


# ── Test block ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    from models import IngestionItem, SourceType

    sample = IngestionItem(
        source_type=SourceType.THOUGHT,
        raw_content=(
            "GraphRAG by Microsoft improves retrieval-augmented generation by "
            "building a knowledge graph from documents and running community "
            "detection to create hierarchical summaries. This approach works "
            "better than naive RAG for multi-hop questions because it can "
            "traverse relationships between entities across different documents."
        ),
        title="Summariser Test",
    )
    sample.extracted_text = sample.raw_content

    print(f"Summarising item: {sample.id}")
    card = summarise(sample)

    if card:
        print(f"\nSummary: {card['summary']}")
        print(f"Key concepts: {card.get('key_concepts', [])}")
        print(f"Connections: {card.get('suggested_connections', [])}")
        print(f"Action: {card.get('action')}")
    else:
        print("Summarisation skipped (no API key configured).")

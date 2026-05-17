"""
second_brain/processing/entity_extractor.py
────────────────────────────────────────────
Extract named entities from IngestionItem text.

Uses spaCy for standard NER (PERSON, ORG, GPE, DATE, EVENT)
and optionally calls an LLM for custom labels (CONCEPT, TECHNOLOGY).

Entity types: PERSON, ORG, GPE, CONCEPT, TECHNOLOGY, DATE, EVENT

USAGE:
  from processing.entity_extractor import extract_entities
  entities = extract_entities(item)   # returns list[Entity]
"""

import sys
import os
import json
import logging
from pathlib import Path
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import settings
from models import IngestionItem, Entity

logger = logging.getLogger(__name__)

# ── spaCy model loading (lazy) ───────────────────────────────────────────────

_nlp = None

# Map spaCy NER labels to our schema
SPACY_LABEL_MAP = {
    "PERSON": "PERSON",
    "ORG": "ORG",
    "GPE": "GPE",
    "LOC": "GPE",
    "DATE": "DATE",
    "TIME": "DATE",
    "EVENT": "EVENT",
    "WORK_OF_ART": "CONCEPT",
    "PRODUCT": "TECHNOLOGY",
    "LANGUAGE": "TECHNOLOGY",
    "LAW": "CONCEPT",
    "NORP": "ORG",        # nationalities, religious/political groups
}

# Labels we want to keep
VALID_LABELS = {"PERSON", "ORG", "GPE", "CONCEPT", "TECHNOLOGY", "DATE", "EVENT"}


def _get_nlp():
    """Load spaCy model lazily. Falls back to sm if trf not available."""
    global _nlp
    if _nlp is not None:
        return _nlp

    import spacy

    for model_name in ["en_core_web_trf", "en_core_web_sm"]:
        try:
            _nlp = spacy.load(model_name)
            logger.info(f"Loaded spaCy model: {model_name}")
            return _nlp
        except OSError:
            continue

    raise RuntimeError(
        "No spaCy model found. Run: python -m spacy download en_core_web_sm"
    )


# ── Entity storage ───────────────────────────────────────────────────────────

ENTITIES_DIR = Path("./storage/entities")


def _save_entities(item_id: str, entities: list[Entity]):
    """Persist extracted entities to JSON file."""
    ENTITIES_DIR.mkdir(parents=True, exist_ok=True)
    path = ENTITIES_DIR / f"{item_id}.json"
    data = [e.model_dump() for e in entities]
    path.write_text(json.dumps(data, indent=2, default=str))


def load_entities(item_id: str) -> list[Entity]:
    """Load previously extracted entities for an item."""
    path = ENTITIES_DIR / f"{item_id}.json"
    if not path.exists():
        return []
    data = json.loads(path.read_text())
    return [Entity(**e) for e in data]


# ── spaCy extraction ─────────────────────────────────────────────────────────

def _extract_with_spacy(text: str, item_id: str) -> list[Entity]:
    """Run spaCy NER and map to our entity schema."""
    nlp = _get_nlp()

    # spaCy has a max length — truncate for safety
    max_len = 100_000
    doc = nlp(text[:max_len])

    # Collect entities, count occurrences for salience
    entity_counts: Counter = Counter()
    entity_labels: dict[str, str] = {}

    for ent in doc.ents:
        mapped_label = SPACY_LABEL_MAP.get(ent.label_)
        if mapped_label and mapped_label in VALID_LABELS:
            clean_text = ent.text.strip()
            if len(clean_text) < 2 or len(clean_text) > 100:
                continue
            entity_counts[clean_text] += 1
            entity_labels[clean_text] = mapped_label

    # Calculate salience based on frequency
    max_count = max(entity_counts.values()) if entity_counts else 1

    entities = []
    for text_val, count in entity_counts.items():
        salience = min(1.0, round(count / max_count, 2))
        entities.append(Entity(
            text=text_val,
            label=entity_labels[text_val],
            salience=salience,
            source_item_id=item_id,
        ))

    return entities


# ── LLM extraction (for CONCEPT + TECHNOLOGY) ───────────────────────────────

def _extract_with_llm(text: str, item_id: str) -> list[Entity]:
    """
    Use OpenAI to extract CONCEPT and TECHNOLOGY entities
    that spaCy typically misses.
    """
    if not settings.openai_api_key:
        return []

    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.openai_api_key)

        prompt = f"""Extract key concepts and technologies mentioned in this text.
Return ONLY a JSON array of objects, each with "text" and "label" fields.
Label must be exactly "CONCEPT" or "TECHNOLOGY".

Rules:
- TECHNOLOGY: specific tools, frameworks, languages, models, APIs (e.g. "Python", "GPT-4", "Neo4j", "Transformer")
- CONCEPT: abstract ideas, methodologies, principles (e.g. "knowledge graph", "retrieval-augmented generation", "attention mechanism")
- Return at most 10 items
- Skip generic words that aren't real concepts

Text:
{text[:3000]}

Respond ONLY with the JSON array, no markdown fences:"""

        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=500,
        )

        raw = resp.choices[0].message.content.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

        items = json.loads(raw)
        entities = []
        for item in items:
            if isinstance(item, dict) and "text" in item and "label" in item:
                if item["label"] in ("CONCEPT", "TECHNOLOGY"):
                    entities.append(Entity(
                        text=item["text"],
                        label=item["label"],
                        salience=0.6,
                        source_item_id=item_id,
                    ))
        return entities

    except Exception as e:
        logger.warning(f"LLM entity extraction failed: {e}")
        return []


# ── Main extraction function ─────────────────────────────────────────────────

def _dedup_entities(entities: list[Entity]) -> list[Entity]:
    """Deduplicate entities by (text_lower, label), keeping highest salience."""
    seen: dict[tuple[str, str], Entity] = {}
    for e in entities:
        key = (e.text.lower(), e.label)
        if key not in seen or e.salience > seen[key].salience:
            seen[key] = e
    return list(seen.values())


def extract_entities(item: IngestionItem) -> list[Entity]:
    """
    Full entity extraction pipeline:
    1. spaCy NER for standard entities
    2. LLM extraction for CONCEPT/TECHNOLOGY (if API key available)
    3. Dedup + save to storage/entities/<item_id>.json
    """
    text = item.extracted_text or item.raw_content or ""
    if not text.strip():
        logger.warning(f"Item {item.id} has no text for entity extraction.")
        return []

    try:
        # Phase 1: spaCy
        spacy_entities = _extract_with_spacy(text, item.id)
        logger.info(f"spaCy found {len(spacy_entities)} entities for {item.id}")

        # Phase 2: LLM (additive)
        llm_entities = _extract_with_llm(text, item.id)
        logger.info(f"LLM found {len(llm_entities)} entities for {item.id}")

        # Merge and dedup
        all_entities = _dedup_entities(spacy_entities + llm_entities)

        # Persist
        _save_entities(item.id, all_entities)

        return all_entities

    except Exception as e:
        logger.error(f"Entity extraction failed for {item.id}: {e}")
        return []


# ── Test block ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    from models import IngestionItem, SourceType

    sample = IngestionItem(
        source_type=SourceType.THOUGHT,
        raw_content=(
            "GraphRAG by Microsoft uses community detection on knowledge graphs "
            "built with Neo4j. Transformer architectures like GPT-4 and Claude "
            "can do multi-hop reasoning. Elon Musk invested in OpenAI. "
            "The paper was published on 2024-04-15 in San Francisco."
        ),
        title="Entity Extraction Test",
    )
    sample.extracted_text = sample.raw_content

    print(f"Extracting entities from item: {sample.id}")
    entities = extract_entities(sample)
    print(f"\nFound {len(entities)} entities:")
    for e in entities:
        print(f"  [{e.label:12s}] {e.text} (salience: {e.salience})")

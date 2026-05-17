"""
second_brain/processing/graph_writer.py
────────────────────────────────────────
Writes IngestionItems and their entities into Neo4j.

Graph schema:
  (:Item {id, title, source_type, created_at, summary})
  (:Entity {text, label})
  (Item)-[:MENTIONS {salience}]->(Entity)
  (Entity)-[:CO_OCCURS_WITH]->(Entity)     # same item
  (Item)-[:RELATED_TO {via}]->(Item)       # shared entities

All writes use MERGE — safe to re-run (idempotent).

USAGE:
  from processing.graph_writer import write_item_to_graph, get_neighbors
  write_item_to_graph(item, entities)
  neighbors = get_neighbors(item_id, depth=2)
"""

import sys
import os
import logging
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import settings
from models import IngestionItem, Entity, GraphNode, GraphEdge, GraphNeighborsResponse

logger = logging.getLogger(__name__)

# ── Neo4j driver (lazy singleton) ────────────────────────────────────────────

_driver = None


def _get_driver():
    """Get or create Neo4j driver. Returns None if Neo4j is unavailable."""
    global _driver
    if _driver is not None:
        return _driver

    try:
        from neo4j import GraphDatabase
        _driver = GraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )
        # Verify connectivity
        _driver.verify_connectivity()
        logger.info(f"Connected to Neo4j at {settings.neo4j_uri}")
        _ensure_indexes()
        return _driver
    except Exception as e:
        logger.warning(f"Neo4j unavailable ({e}) — graph writes will be skipped.")
        _driver = None
        return None


def _ensure_indexes():
    """Create indexes for fast lookups (idempotent)."""
    if _driver is None:
        return
    with _driver.session() as session:
        session.run("CREATE INDEX IF NOT EXISTS FOR (i:Item) ON (i.id)")
        session.run("CREATE INDEX IF NOT EXISTS FOR (e:Entity) ON (e.text, e.label)")


# ── Write operations ─────────────────────────────────────────────────────────

def write_item_to_graph(item: IngestionItem, entities: list[Entity]) -> bool:
    """
    Write an item and its entities to Neo4j.

    Creates:
      1. Item node (MERGE by id)
      2. Entity nodes (MERGE by text+label — deduped across items)
      3. MENTIONS relationships (item → entity)
      4. CO_OCCURS_WITH relationships (entity ↔ entity within same item)
      5. RELATED_TO relationships (item ↔ item via shared entities)

    Returns True if successful, False if Neo4j unavailable.
    """
    driver = _get_driver()
    if driver is None:
        logger.warning(f"Skipping graph write for {item.id} — Neo4j not available.")
        return False

    try:
        with driver.session() as session:
            # 1. Create/update Item node
            session.run(
                """
                MERGE (i:Item {id: $id})
                SET i.title = $title,
                    i.source_type = $source_type,
                    i.created_at = $created_at,
                    i.summary = $summary
                """,
                id=item.id,
                title=item.title or "",
                source_type=item.source_type.value if hasattr(item.source_type, 'value') else str(item.source_type),
                created_at=item.created_at.isoformat() if item.created_at else "",
                summary=item.summary or "",
            )

            # 2 & 3. Create Entity nodes + MENTIONS relationships
            for entity in entities:
                session.run(
                    """
                    MERGE (e:Entity {text: $text, label: $label})
                    WITH e
                    MATCH (i:Item {id: $item_id})
                    MERGE (i)-[r:MENTIONS]->(e)
                    SET r.salience = $salience
                    """,
                    text=entity.text,
                    label=entity.label,
                    item_id=item.id,
                    salience=entity.salience,
                )

            # 4. CO_OCCURS_WITH: link entities that appear in the same item
            if len(entities) > 1:
                entity_texts = [(e.text, e.label) for e in entities]
                for i in range(len(entity_texts)):
                    for j in range(i + 1, len(entity_texts)):
                        session.run(
                            """
                            MATCH (e1:Entity {text: $text1, label: $label1})
                            MATCH (e2:Entity {text: $text2, label: $label2})
                            MERGE (e1)-[:CO_OCCURS_WITH]->(e2)
                            """,
                            text1=entity_texts[i][0], label1=entity_texts[i][1],
                            text2=entity_texts[j][0], label2=entity_texts[j][1],
                        )

            # 5. RELATED_TO: link items that share entities
            session.run(
                """
                MATCH (i1:Item {id: $item_id})-[:MENTIONS]->(e:Entity)<-[:MENTIONS]-(i2:Item)
                WHERE i1.id <> i2.id
                MERGE (i1)-[r:RELATED_TO]->(i2)
                SET r.via = e.text
                """,
                item_id=item.id,
            )

        logger.info(f"Wrote item {item.id} to graph with {len(entities)} entities.")
        return True

    except Exception as e:
        logger.error(f"Graph write failed for {item.id}: {e}")
        return False


# ── Read operations (for API endpoints) ──────────────────────────────────────

def get_neighbors(item_id: str, depth: int = 2) -> GraphNeighborsResponse:
    """
    Get item + its neighbors up to given depth in the graph.
    Returns data shaped for the Phase 3 graph UI.
    """
    driver = _get_driver()
    if driver is None:
        return GraphNeighborsResponse(nodes=[], edges=[])

    try:
        with driver.session() as session:
            # Get all nodes and edges within depth
            result = session.run(
                """
                MATCH path = (start:Item {id: $item_id})-[*1..""" + str(min(depth, 4)) + """]->(connected)
                WITH start, connected, relationships(path) AS rels
                UNWIND rels AS r
                WITH start, connected, r,
                     startNode(r) AS src, endNode(r) AS tgt
                RETURN DISTINCT
                    labels(src)[0] AS src_type,
                    CASE WHEN 'Item' IN labels(src) THEN src.id ELSE src.text END AS src_id,
                    CASE WHEN 'Item' IN labels(src) THEN src.title ELSE src.text END AS src_label,
                    CASE WHEN 'Item' IN labels(src) THEN coalesce(src.community_id, null) ELSE null END AS src_community,
                    labels(tgt)[0] AS tgt_type,
                    CASE WHEN 'Item' IN labels(tgt) THEN tgt.id ELSE tgt.text END AS tgt_id,
                    CASE WHEN 'Item' IN labels(tgt) THEN tgt.title ELSE tgt.text END AS tgt_label,
                    CASE WHEN 'Item' IN labels(tgt) THEN coalesce(tgt.community_id, null) ELSE null END AS tgt_community,
                    type(r) AS relation,
                    coalesce(r.salience, 1.0) AS weight
                """,
                item_id=item_id,
            )

            nodes_map: dict[str, GraphNode] = {}
            edges: list[GraphEdge] = []

            for record in result:
                # Add source node
                src_id = record["src_id"]
                if src_id and src_id not in nodes_map:
                    nodes_map[src_id] = GraphNode(
                        id=src_id,
                        label=record["src_label"],
                        type=record["src_type"].lower(),
                        community_id=record["src_community"],
                    )

                # Add target node
                tgt_id = record["tgt_id"]
                if tgt_id and tgt_id not in nodes_map:
                    nodes_map[tgt_id] = GraphNode(
                        id=tgt_id,
                        label=record["tgt_label"],
                        type=record["tgt_type"].lower(),
                        community_id=record["tgt_community"],
                    )

                # Add edge
                if src_id and tgt_id:
                    edges.append(GraphEdge(
                        source=src_id,
                        target=tgt_id,
                        relation=record["relation"],
                        weight=record["weight"],
                    ))

            # Always include the starting node
            if item_id not in nodes_map:
                result2 = session.run(
                    "MATCH (i:Item {id: $id}) RETURN i.title AS title, i.community_id AS cid",
                    id=item_id,
                )
                rec = result2.single()
                if rec:
                    nodes_map[item_id] = GraphNode(
                        id=item_id,
                        label=rec["title"],
                        type="item",
                        community_id=rec["cid"],
                    )

        return GraphNeighborsResponse(
            nodes=list(nodes_map.values()),
            edges=edges,
        )

    except Exception as e:
        logger.error(f"get_neighbors failed for {item_id}: {e}")
        return GraphNeighborsResponse(nodes=[], edges=[])


def search_entities_in_graph(entity_texts: list[str], limit: int = 10) -> list[dict]:
    """
    Given entity texts from a query, find items that mention them in the graph.
    Returns list of {item_id, title, entity_text, salience}.
    """
    driver = _get_driver()
    if driver is None:
        return []

    try:
        with driver.session() as session:
            result = session.run(
                """
                UNWIND $entities AS entity_text
                MATCH (i:Item)-[r:MENTIONS]->(e:Entity)
                WHERE toLower(e.text) = toLower(entity_text)
                RETURN DISTINCT i.id AS item_id, i.title AS title,
                       e.text AS entity_text, r.salience AS salience
                ORDER BY r.salience DESC
                LIMIT $limit
                """,
                entities=entity_texts,
                limit=limit,
            )
            return [dict(record) for record in result]

    except Exception as e:
        logger.error(f"Entity graph search failed: {e}")
        return []


# ── Test block ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    from models import IngestionItem, SourceType, Entity

    sample_item = IngestionItem(
        source_type=SourceType.THOUGHT,
        raw_content="GraphRAG by Microsoft uses community detection.",
        title="Graph Writer Test",
    )

    sample_entities = [
        Entity(text="GraphRAG", label="TECHNOLOGY", salience=0.9, source_item_id=sample_item.id),
        Entity(text="Microsoft", label="ORG", salience=0.8, source_item_id=sample_item.id),
        Entity(text="community detection", label="CONCEPT", salience=0.7, source_item_id=sample_item.id),
    ]

    print(f"Writing item {sample_item.id} to graph...")
    ok = write_item_to_graph(sample_item, sample_entities)
    print(f"Result: {'SUCCESS' if ok else 'SKIPPED (Neo4j not available)'}")

    if ok:
        print(f"\nFetching neighbors...")
        resp = get_neighbors(sample_item.id, depth=2)
        print(f"Nodes: {len(resp.nodes)}, Edges: {len(resp.edges)}")
        for n in resp.nodes:
            print(f"  Node: {n.id} ({n.type}) — {n.label}")

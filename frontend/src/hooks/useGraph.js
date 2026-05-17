import { useEffect, useCallback, useRef } from 'react';
import { getItems, getNeighbors, getCommunities, getStats } from '../api/client';
import useGraphStore from '../store/graphStore';

/*
  Fetches items, builds a node/edge graph from neighbor data,
  and loads communities. Called once on mount, then by realtime hook.
*/

const SOURCE_TYPE_ICONS = {
  thought: '💭', screenshot: '📸', ai_chat: '🤖', url: '🔗',
  video: '🎬', audio: '🎙', document: '📄',
};

// Deterministic community color
function communityColor(id) {
  if (id == null) return '#333333';
  const palette = [
    '#00FFB2', '#FF6B6B', '#7B61FF', '#FFB800',
    '#00C8FF', '#FF9F43', '#A29BFE', '#FD79A8',
  ];
  return palette[id % palette.length];
}

export default function useGraph() {
  const setNodes = useGraphStore(s => s.setNodes);
  const setEdges = useGraphStore(s => s.setEdges);
  const setCommunities = useGraphStore(s => s.setCommunities);
  const setStats = useGraphStore(s => s.setStats);
  const setItems = useGraphStore(s => s.setItems);
  const loadedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const [items, commData, stats] = await Promise.all([
        getItems(500),
        getCommunities().catch(() => ({ communities: [] })),
        getStats().catch(() => ({ total: 0, by_source_type: {}, by_status: {} })),
      ]);

      setItems(items);
      setStats(stats);

      const communities = commData.communities || commData || [];
      setCommunities(Array.isArray(communities) ? communities : []);

      // Build community lookup: itemId → communityId
      const itemCommunity = {};
      (Array.isArray(communities) ? communities : []).forEach(c => {
        (c.item_ids || []).forEach(id => { itemCommunity[id] = c.id; });
      });

      // Build nodes from items
      const nodeMap = new Map();
      const allEdges = [];

      items.forEach(item => {
        const cid = item.metadata?.community_id ?? itemCommunity[item.id] ?? null;
        nodeMap.set(item.id, {
          id: item.id,
          label: item.title || item.raw_content?.slice(0, 50) || 'Untitled',
          type: 'item',
          sourceType: item.source_type,
          icon: SOURCE_TYPE_ICONS[item.source_type] || '📄',
          communityId: cid,
          color: communityColor(cid),
          summary: item.summary || '',
          status: item.status,
          createdAt: item.created_at,
          connectionCount: 0,
        });
      });

      // Fetch neighbors for items that have valid IDs
      const validItems = items.filter(item => item.id).slice(0, 100);
      const neighborPromises = validItems.map(item =>
        getNeighbors(item.id, 1).catch(() => ({ nodes: [], edges: [] }))
      );
      const neighborResults = await Promise.all(neighborPromises);

      neighborResults.forEach((result) => {
        const { nodes: gNodes = [], edges: gEdges = [] } = result;

        gNodes.forEach(gn => {
          if (!nodeMap.has(gn.id)) {
            nodeMap.set(gn.id, {
              id: gn.id,
              label: gn.label || gn.id,
              type: gn.type || 'entity',
              sourceType: null,
              icon: '🔹',
              communityId: gn.community_id ?? null,
              color: communityColor(gn.community_id ?? null),
              connectionCount: 0,
            });
          }
        });

        gEdges.forEach(ge => {
          // Avoid duplicate edges
          const edgeKey = `${ge.source}-${ge.target}-${ge.relation}`;
          allEdges.push({
            id: edgeKey,
            source: ge.source,
            target: ge.target,
            relation: ge.relation || 'RELATED_TO',
            weight: ge.weight || 1,
          });
        });
      });

      // Count connections per node
      allEdges.forEach(e => {
        const src = nodeMap.get(e.source);
        const tgt = nodeMap.get(e.target);
        if (src) src.connectionCount++;
        if (tgt) tgt.connectionCount++;
      });

      // Deduplicate edges
      const edgeSet = new Set();
      const uniqueEdges = allEdges.filter(e => {
        if (edgeSet.has(e.id)) return false;
        edgeSet.add(e.id);
        return true;
      });

      setNodes(Array.from(nodeMap.values()));
      setEdges(uniqueEdges);
      loadedRef.current = true;
    } catch (err) {
      console.error('[useGraph] Failed to load graph data:', err);
    }
  }, [setNodes, setEdges, setCommunities, setStats, setItems]);

  useEffect(() => {
    if (!loadedRef.current) load();
  }, [load]);

  return { reload: load };
}

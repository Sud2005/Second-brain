import { useEffect, useRef } from 'react';
import { getItems } from '../api/client';
import useGraphStore from '../store/graphStore';

/*
  Polls GET /items?limit=20 every 10 seconds.
  Detects new items by comparing IDs against known set.
  Triggers toast + addNode for new arrivals.
*/
export default function useRealtime() {
  const items = useGraphStore(s => s.items);
  const addItem = useGraphStore(s => s.addItem);
  const addNode = useGraphStore(s => s.addNode);
  const showToast = useGraphStore(s => s.showToast);
  const knownIds = useRef(new Set());

  // Seed known IDs from initial load
  useEffect(() => {
    items.forEach(i => knownIds.current.add(i.id));
  }, [items]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const recent = await getItems(20);
        recent.forEach(item => {
          if (!knownIds.current.has(item.id)) {
            knownIds.current.add(item.id);
            addItem(item);
            addNode({
              id: item.id,
              label: item.title || item.raw_content?.slice(0, 50) || 'New item',
              type: 'item',
              sourceType: item.source_type,
              icon: '✨',
              communityId: null,
              color: '#00FFB2',
              status: item.status,
              createdAt: item.created_at,
              connectionCount: 0,
            });
            showToast(`New: ${item.title || item.raw_content?.slice(0, 40) || 'item'}`, 'success');
          } else {
            // Existing item: check if status changed
            const existingItem = useGraphStore.getState().items.find(i => i.id === item.id);
            if (existingItem && existingItem.status !== item.status) {
              useGraphStore.getState().updateItem(item.id, { status: item.status, title: item.title });
              useGraphStore.getState().updateNode(item.id, { status: item.status, label: item.title });
              
              if (item.status === 'done') {
                showToast(`Processed: ${item.title || 'item'}`, 'success');
                // Force Inspector to refresh if this item is selected
                if (useGraphStore.getState().selectedNodeId === item.id) {
                  // Hack to trigger useEffect in Inspector:
                  const id = item.id;
                  useGraphStore.getState().setSelectedNode(null);
                  setTimeout(() => useGraphStore.getState().setSelectedNode(id), 50);
                }
              }
            }
          }
        });
      } catch {
        // Silently ignore polling failures
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [addItem, addNode, showToast]);
}

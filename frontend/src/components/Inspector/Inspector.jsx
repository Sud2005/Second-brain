import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { getItem, getNeighbors } from '../../api/client';
import useGraphStore from '../../store/graphStore';
import MemoryCard from './MemoryCard';
import RelatedNodes from './RelatedNodes';
import './Inspector.css';

const ICONS = {
  thought: '💭', screenshot: '📸', ai_chat: '🤖', url: '🔗',
  video: '🎬', audio: '🎙', document: '📄',
};

const LABEL_COLORS = {
  CONCEPT: 'var(--accent-purple)',
  TECHNOLOGY: 'var(--accent-blue)',
  PERSON: 'var(--accent-green)',
  ORG: 'var(--accent-yellow)',
  GPE: 'var(--accent-red)',
  DATE: 'var(--text-secondary)',
  EVENT: 'var(--community-5)',
};

export default function Inspector() {
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const inspectorOpen = useGraphStore(s => s.inspectorOpen);
  const nodes = useGraphStore(s => s.nodes);
  const setSelectedNode = useGraphStore(s => s.setSelectedNode);

  const [itemDetail, setItemDetail] = useState(null);
  const [neighbors, setNeighbors] = useState([]);
  const [showRaw, setShowRaw] = useState(false);

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  useEffect(() => {
    if (!selectedNodeId) { setItemDetail(null); setNeighbors([]); return; }

    // Fetch full item detail
    getItem(selectedNodeId)
      .then(setItemDetail)
      .catch(() => setItemDetail(null));

    // Fetch neighbors
    getNeighbors(selectedNodeId, 1)
      .then(data => {
        const neighborNodes = (data.nodes || [])
          .filter(n => n.id !== selectedNodeId)
          .map(n => ({
            ...n,
            color: n.community_id != null
              ? ['#00FFB2','#FF6B6B','#7B61FF','#FFB800','#00C8FF','#FF9F43','#A29BFE','#FD79A8'][n.community_id % 8]
              : '#333',
          }));
        setNeighbors(neighborNodes);
      })
      .catch(() => setNeighbors([]));
  }, [selectedNodeId]);

  if (!inspectorOpen || !selectedNodeId) return null;

  const isItem = selectedNode?.type === 'item';
  const isEntity = selectedNode?.type === 'entity';

  const memoryCard = itemDetail?.metadata?.memory_card || null;
  const timeAgo = itemDetail?.created_at
    ? formatDistanceToNow(new Date(itemDetail.created_at), { addSuffix: true })
    : '';

  return (
    <aside className="inspector glass-panel">
      <div className="inspector__header">
        <button className="inspector__close" onClick={() => setSelectedNode(null)}>✕</button>
      </div>

      <div className="inspector__body">
        {isItem && itemDetail && (
          <>
            {/* Title */}
            <h2 className="inspector__title">
              {itemDetail.title || itemDetail.raw_content?.slice(0, 60) || 'Untitled'}
            </h2>

            {/* Badges */}
            <div className="inspector__badges">
              <span className="pill">
                {ICONS[itemDetail.source_type] || '📄'} {itemDetail.source_type}
              </span>
              {itemDetail.platform && (
                <span className="pill">{itemDetail.platform}</span>
              )}
              <span className={`status-dot status-dot--${itemDetail.status || 'pending'}`} />
              <span className="secondary mono" style={{ fontSize: 11 }}>{itemDetail.status}</span>
            </div>

            {/* Time */}
            <div className="inspector__time mono">{timeAgo}</div>

            {/* Tags */}
            {itemDetail.tags?.length > 0 && (
              <div className="inspector__tags">
                {itemDetail.tags.map((t, i) => (
                  <span key={i} className="pill">#{t}</span>
                ))}
              </div>
            )}

            {/* Memory Card */}
            {memoryCard && (
              <div className="inspector__section">
                <span className="inspector__section-label mono">Memory Card</span>
                <MemoryCard card={memoryCard} />
              </div>
            )}

            {/* Related Nodes */}
            {neighbors.length > 0 && (
              <div className="inspector__section">
                <RelatedNodes neighbors={neighbors} />
              </div>
            )}

            {/* Open original */}
            {(itemDetail.source_url || itemDetail.file_path) && (
              <a
                className="inspector__open-btn mono"
                href={itemDetail.source_url || `file://${itemDetail.file_path}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Original →
              </a>
            )}

            {/* Raw text toggle */}
            <div className="inspector__section">
              <button
                className="inspector__toggle mono"
                onClick={() => setShowRaw(!showRaw)}
              >
                {showRaw ? '▾' : '▸'} Extracted Text
              </button>
              {showRaw && (
                <pre className="inspector__raw mono">
                  {itemDetail.extracted_text || itemDetail.raw_content || '[No text]'}
                </pre>
              )}
            </div>
          </>
        )}

        {isEntity && selectedNode && (
          <>
            <h2 className="inspector__title">{selectedNode.label}</h2>
            <div className="inspector__badges">
              <span className="pill" style={{
                color: LABEL_COLORS[selectedNode.entityLabel] || 'var(--text-secondary)',
                borderColor: LABEL_COLORS[selectedNode.entityLabel] || 'var(--border)',
              }}>
                {selectedNode.entityLabel || 'ENTITY'}
              </span>
            </div>

            {neighbors.length > 0 && (
              <div className="inspector__section">
                <span className="inspector__section-label mono">
                  Appears in {neighbors.filter(n => n.type === 'item').length} items
                </span>
                <RelatedNodes neighbors={neighbors} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Phase 4 placeholder */}
      <div className="inspector__footer mono dim">
        Agent queue — coming in Phase 4
      </div>
    </aside>
  );
}

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import { getItem, getNeighbors } from '../../api/client';
import useGraphStore from '../../store/graphStore';
import MemoryCard from './MemoryCard';
import RelatedNodes from './RelatedNodes';
import { sourceIcon, Close, Node, Expand } from '../icons/Icons';
import './Inspector.css';

const LABEL_COLORS = {
  CONCEPT: 'var(--node-2)',
  TECHNOLOGY: 'var(--node-4)',
  PERSON: 'var(--node-0)',
  ORG: 'var(--node-3)',
  GPE: 'var(--node-1)',
  DATE: 'var(--text-secondary)',
  EVENT: 'var(--node-5)',
};

const panelVariants = {
  hidden: { x: 40, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.22, ease: [0.2, 0.9, 0.2, 1] },
  },
  exit: { x: 60, opacity: 0, transition: { duration: 0.2, ease: [0.2, 0.9, 0.2, 1] } },
};

export default function Inspector() {
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const inspectorOpen = useGraphStore(s => s.inspectorOpen);
  const nodes = useGraphStore(s => s.nodes);
  const setSelectedNode = useGraphStore(s => s.setSelectedNode);

  const [itemDetail, setItemDetail] = useState(null);
  const [neighbors, setNeighbors] = useState([]);
  const [showRaw, setShowRaw] = useState(false);
  const [loading, setLoading] = useState(false);

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  useEffect(() => {
    if (!selectedNodeId) {
      setItemDetail(null);
      setNeighbors([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setShowRaw(false);

    // Fetch full item detail — fast, single GET
    getItem(selectedNodeId)
      .then(data => { setItemDetail(data); setLoading(false); })
      .catch(() => { setItemDetail(null); setLoading(false); });

    // Fetch neighbors in parallel — non-blocking
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

  // Don't render if panel is closed or nothing selected
  if (!inspectorOpen || !selectedNodeId) return null;

  // Determine the display type from node OR from fetched detail
  const isEntity = selectedNode?.type === 'entity';
  // Show as item if it's explicitly an item node, OR if we got item detail from the API
  const isItem = selectedNode?.type === 'item' || (!isEntity && itemDetail);

  const memoryCard = itemDetail?.metadata?.memory_card || null;
  const summary = itemDetail?.summary || itemDetail?.metadata?.summary || null;
  const timeAgo = itemDetail?.created_at
    ? formatDistanceToNow(new Date(itemDetail.created_at), { addSuffix: true })
    : '';

  const SourceIcon = isItem && itemDetail ? sourceIcon(itemDetail.source_type) : Node;

  return (
    <motion.aside
      className="inspector glass-panel"
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <div className="inspector__header">
        <div className="inspector__header-info">
          <span className="inspector__header-icon">
            <SourceIcon size={16} />
          </span>
          <div className="inspector__header-text">
            <span className="inspector__type mono uppercase">
              {isItem && itemDetail ? itemDetail.source_type : selectedNode?.entityLabel || 'ENTITY'}
            </span>
            {timeAgo && <span className="inspector__timestamp mono uppercase">{timeAgo}</span>}
          </div>
        </div>
        <button className="inspector__close" onClick={() => setSelectedNode(null)}>
          <Close size={14} />
        </button>
      </div>

      <div className="inspector__body">
        {/* Loading state */}
        {loading && !itemDetail && (
          <div className="inspector__loading mono">Loading…</div>
        )}

        {isItem && itemDetail && (
          <>
            {/* Title */}
            <h2 className="inspector__title">
              {itemDetail.title || itemDetail.raw_content?.slice(0, 60) || 'Untitled'}
            </h2>

            {/* Badges */}
            <div className="inspector__badges">
              <span className="pill">
                <SourceIcon size={12} />
                {itemDetail.source_type}
              </span>
              {itemDetail.platform && (
                <span className="pill">{itemDetail.platform}</span>
              )}
              <span className={`status-dot status-dot--${itemDetail.status || 'pending'}`} />
              <span className="secondary mono uppercase" style={{ fontSize: 10 }}>{itemDetail.status}</span>
            </div>

            {/* Time */}
            {/* Tags */}
            {itemDetail.tags?.length > 0 && (
              <div className="inspector__tags">
                {itemDetail.tags.map((t, i) => (
                  <span key={i} className="pill">#{t}</span>
                ))}
              </div>
            )}

            {/* Overview / Summary */}
            <div className="inspector__section">
              <span className="inspector__section-label mono uppercase">Memory Card</span>
              {memoryCard ? (
                <MemoryCard card={memoryCard} />
              ) : summary ? (
                <blockquote className="inspector__summary">"{summary}"</blockquote>
              ) : (
                <p className="inspector__summary dim">No overview available yet. The background worker might still be processing it.</p>
              )}
            </div>

            {/* Related Nodes */}
            {neighbors.length > 0 && (
              <div className="inspector__section">
                <RelatedNodes neighbors={neighbors} />
              </div>
            )}

            {/* Open original */}
            {(itemDetail.source_url || itemDetail.file_path) && (
              <a
                className="inspector__open-btn mono uppercase"
                href={itemDetail.source_url || `file://${itemDetail.file_path}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Expand size={12} />
                Open Original
              </a>
            )}

            {/* Raw text toggle */}
            <div className="inspector__section">
              <button
                className="inspector__toggle mono uppercase"
                onClick={() => setShowRaw(!showRaw)}
              >
                {showRaw ? 'Hide' : 'Show'} Raw Text
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
                  <span className="inspector__section-label mono uppercase">
                    Appears in {neighbors.filter(n => n.type === 'item').length} items
                  </span>
                  <RelatedNodes neighbors={neighbors} />
                </div>
            )}
          </>
        )}
      </div>

      {/* Phase 4 placeholder */}
      <div className="inspector__footer mono dim uppercase">
        Agent queue — coming in Phase 4
      </div>
    </motion.aside>
  );
}

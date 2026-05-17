import { formatDistanceToNow } from 'date-fns';
import useGraphStore from '../../store/graphStore';
import './ItemCard.css';

const ICONS = {
  thought: '💭', screenshot: '📸', ai_chat: '🤖', url: '🔗',
  video: '🎬', audio: '🎙', document: '📄',
};

export default function ItemCard({ item }) {
  const setSelectedNode = useGraphStore(s => s.setSelectedNode);
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const isSelected = selectedNodeId === item.id;

  const icon = ICONS[item.source_type] || '📄';
  const title = item.title || item.raw_content?.slice(0, 50) || 'Untitled';
  const timeAgo = item.created_at
    ? formatDistanceToNow(new Date(item.created_at), { addSuffix: true })
    : '';

  return (
    <button
      className={`item-card ${isSelected ? 'item-card--selected' : ''}`}
      onClick={() => setSelectedNode(item.id)}
    >
      <div className="item-card__row">
        <span className="item-card__icon">{icon}</span>
        <span className="item-card__title">{title}</span>
        <span className={`status-dot status-dot--${item.status || 'pending'}`} />
      </div>
      <div className="item-card__meta mono">
        <span className="item-card__time">{timeAgo}</span>
      </div>
    </button>
  );
}

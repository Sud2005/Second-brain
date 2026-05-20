import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import useGraphStore from '../../store/graphStore';
import { sourceIcon } from '../icons/Icons';
import './ItemCard.css';

export default function ItemCard({ item }) {
  const setSelectedNode = useGraphStore(s => s.setSelectedNode);
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const isSelected = selectedNodeId === item.id;

  const Icon = sourceIcon(item.source_type);
  const title = item.title || item.raw_content?.slice(0, 50) || 'Untitled';
  const timeAgo = item.created_at
    ? formatDistanceToNow(new Date(item.created_at), { addSuffix: true })
    : '';

  return (
    <motion.button
      className={`item-card ${isSelected ? 'item-card--selected' : ''}`}
      onClick={() => setSelectedNode(item.id)}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.2, 0.9, 0.2, 1] }}
      whileHover={{ x: 2 }}
    >
      <div className="item-card__row">
        <span className="item-card__icon"><Icon size={14} /></span>
        <span className="item-card__title">{title}</span>
        <span className={`status-dot status-dot--${item.status || 'pending'}`} />
      </div>
      <div className="item-card__meta mono">
        <span className="item-card__time">{timeAgo}</span>
      </div>
    </motion.button>
  );
}

import { motion } from 'framer-motion';
import useGraphStore from '../../store/graphStore';
import './CommunityFilter.css';

const COLORS = [
  '#00FFD1', '#FF4B6E', '#A259FF', '#FFB800',
  '#00A8FF', '#FF6B35', '#00FF8C', '#FF3CAC',
];

const rowVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: (i) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.03, duration: 0.2, ease: [0.2, 0.9, 0.2, 1] },
  }),
};

export default function CommunityFilter() {
  const communities = useGraphStore(s => s.communities);
  const activeCommunityFilter = useGraphStore(s => s.activeCommunityFilter);
  const filterByCommunity = useGraphStore(s => s.filterByCommunity);

  if (!communities || communities.length === 0) return null;

  return (
    <div className="community-filter glass-panel">
      <div className="community-filter__header mono uppercase">
        <span>Clusters</span>
        {activeCommunityFilter != null && (
          <button
            className="community-filter__reset mono uppercase"
            onClick={() => filterByCommunity(activeCommunityFilter)}
          >
            Show All
          </button>
        )}
      </div>
      <div className="community-filter__list">
        {communities.slice(0, 12).map((c, i) => {
          const color = COLORS[c.id % COLORS.length];
          const isActive = activeCommunityFilter === c.id;
          return (
            <motion.button
              key={c.id}
              className={`community-filter__item ${isActive ? 'community-filter__item--active' : ''}`}
              onClick={() => filterByCommunity(c.id)}
              variants={rowVariants}
              initial="hidden"
              animate="visible"
              custom={i}
            >
              <span className="community-filter__bar" style={{ background: color }} />
              <span className="community-filter__label">
                {c.key_entities?.slice(0, 2).join(' / ') || `CLUSTER ${c.id}`}
              </span>
              <span className="community-filter__count mono">{c.size} ITEMS</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

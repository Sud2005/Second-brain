import useGraphStore from '../../store/graphStore';
import './CommunityFilter.css';

const COLORS = [
  '#00FFB2', '#FF6B6B', '#7B61FF', '#FFB800',
  '#00C8FF', '#FF9F43', '#A29BFE', '#FD79A8',
];

export default function CommunityFilter() {
  const communities = useGraphStore(s => s.communities);
  const activeCommunityFilter = useGraphStore(s => s.activeCommunityFilter);
  const filterByCommunity = useGraphStore(s => s.filterByCommunity);

  if (!communities || communities.length === 0) return null;

  return (
    <div className="community-filter glass-panel">
      <div className="community-filter__header mono">
        <span>Themes</span>
        {activeCommunityFilter != null && (
          <button
            className="community-filter__reset"
            onClick={() => filterByCommunity(activeCommunityFilter)}
          >
            Show All
          </button>
        )}
      </div>
      <div className="community-filter__list">
        {communities.slice(0, 12).map(c => {
          const color = COLORS[c.id % COLORS.length];
          const isActive = activeCommunityFilter === c.id;
          return (
            <button
              key={c.id}
              className={`community-filter__item ${isActive ? 'community-filter__item--active' : ''}`}
              onClick={() => filterByCommunity(c.id)}
            >
              <span
                className="community-filter__dot"
                style={{ background: color, boxShadow: `0 0 8px ${color}50` }}
              />
              <span className="community-filter__label">
                {c.key_entities?.slice(0, 2).join(', ') || `Theme ${c.id}`}
              </span>
              <span className="community-filter__count mono">{c.size}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

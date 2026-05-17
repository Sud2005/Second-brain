import { useMemo } from 'react';
import useGraphStore from '../../store/graphStore';
import SearchBar from './SearchBar';
import ItemCard from './ItemCard';
import './Sidebar.css';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'thought', label: '💭' },
  { id: 'screenshot', label: '📸' },
  { id: 'ai_chat', label: '🤖' },
  { id: 'url', label: '🔗' },
];

export default function Sidebar() {
  const items = useGraphStore(s => s.items);
  const sidebarTab = useGraphStore(s => s.sidebarTab);
  const setSidebarTab = useGraphStore(s => s.setSidebarTab);
  const searchResults = useGraphStore(s => s.searchResults);
  const searchQuery = useGraphStore(s => s.searchQuery);
  const searchEntities = useGraphStore(s => s.searchEntities);
  const setSelectedNode = useGraphStore(s => s.setSelectedNode);

  const filtered = useMemo(() => {
    const sorted = [...items].sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
    );
    if (sidebarTab === 'all') return sorted;
    return sorted.filter(i => i.source_type === sidebarTab);
  }, [items, sidebarTab]);

  const hasSearchResults = searchQuery.length >= 2 && searchResults.length > 0;

  return (
    <aside className="sidebar glass-panel">
      <SearchBar />

      {/* Search entity chips */}
      {searchEntities.length > 0 && (
        <div className="sidebar__entities">
          {searchEntities.map((e, i) => (
            <span key={i} className="pill pill--accent">{e}</span>
          ))}
        </div>
      )}

      {/* Search results */}
      {hasSearchResults && (
        <div className="sidebar__search-results">
          <div className="sidebar__section-label mono">Search Results</div>
          {searchResults.map((r, i) => (
            <button
              key={r.item_id || i}
              className="search-result"
              onClick={() => setSelectedNode(r.item_id)}
            >
              <div className="search-result__title">{r.title || 'Untitled'}</div>
              <div className="search-result__meta mono">
                <span className="search-result__score" style={{
                  color: r.score >= 0.7 ? 'var(--accent-green)' : r.score >= 0.4 ? 'var(--accent-yellow)' : 'var(--text-dim)',
                }}>
                  {(r.score * 100).toFixed(0)}%
                </span>
                {(r.matched_via || []).map((m, j) => (
                  <span key={j} className="pill">{m}</span>
                ))}
              </div>
              {r.summary && (
                <div className="search-result__summary">{r.summary.slice(0, 100)}...</div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="sidebar__tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`sidebar__tab ${sidebarTab === t.id ? 'sidebar__tab--active' : ''}`}
            onClick={() => setSidebarTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Item list */}
      <div className="sidebar__list">
        {filtered.length === 0 ? (
          <div className="sidebar__empty mono">No items yet.</div>
        ) : (
          filtered.map(item => <ItemCard key={item.id} item={item} />)
        )}
      </div>
    </aside>
  );
}

import useSearch from '../../hooks/useSearch';
import useGraphStore from '../../store/graphStore';
import './SearchBar.css';

export default function SearchBar() {
  const searchQuery = useGraphStore(s => s.searchQuery);
  const isSearching = useGraphStore(s => s.isSearching);
  const { doSearch } = useSearch();

  return (
    <div className="search-bar">
      <div className="search-bar__input-wrapper">
        <span className="search-bar__icon">⌕</span>
        <input
          className="search-bar__input mono"
          type="text"
          placeholder="Search your brain..."
          value={searchQuery}
          onChange={(e) => doSearch(e.target.value)}
        />
        {isSearching && <span className="search-bar__spinner">⟳</span>}
      </div>
    </div>
  );
}

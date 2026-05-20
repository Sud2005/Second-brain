import useSearch from '../../hooks/useSearch';
import useGraphStore from '../../store/graphStore';
import { Search } from '../icons/Icons';
import './SearchBar.css';

export default function SearchBar() {
  const searchQuery = useGraphStore(s => s.searchQuery);
  const isSearching = useGraphStore(s => s.isSearching);
  const { doSearch } = useSearch();

  return (
    <div className="search-bar">
      <div className="search-bar__input-wrapper">
        <Search size={14} color="currentColor" className="search-bar__icon" />
        <input
          className="search-bar__input mono"
          type="text"
          placeholder="SEARCH YOUR BRAIN..."
          value={searchQuery}
          onChange={(e) => doSearch(e.target.value)}
        />
        {isSearching && <span className="search-bar__spinner" />}
      </div>
    </div>
  );
}

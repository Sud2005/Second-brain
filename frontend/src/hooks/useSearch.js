import { useCallback, useRef } from 'react';
import { search as searchApi } from '../api/client';
import useGraphStore from '../store/graphStore';

/*
  Debounced search hook — calls GET /search?q=...
  with a 300ms debounce to avoid hammering the API.
*/
export default function useSearch() {
  const setSearchResults = useGraphStore(s => s.setSearchResults);
  const setIsSearching = useGraphStore(s => s.setIsSearching);
  const setSearchQuery = useGraphStore(s => s.setSearchQuery);
  const timerRef = useRef(null);

  const doSearch = useCallback((query) => {
    setSearchQuery(query);

    if (timerRef.current) clearTimeout(timerRef.current);

    if (!query || query.trim().length < 2) {
      setSearchResults([], []);
      return;
    }

    setIsSearching(true);

    timerRef.current = setTimeout(async () => {
      try {
        const data = await searchApi(query, 10);
        setSearchResults(
          data.results || [],
          data.query_entities || [],
        );
      } catch (err) {
        console.error('[useSearch] Search failed:', err);
        setSearchResults([], []);
      }
    }, 300);
  }, [setSearchResults, setIsSearching, setSearchQuery]);

  return { doSearch };
}

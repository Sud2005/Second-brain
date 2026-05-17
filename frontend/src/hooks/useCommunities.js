import { useEffect } from 'react';
import { getCommunities } from '../api/client';
import useGraphStore from '../store/graphStore';

/*
  Fetches and caches community data.
  Called once on mount.
*/
export default function useCommunities() {
  const setCommunities = useGraphStore(s => s.setCommunities);
  const communities = useGraphStore(s => s.communities);

  useEffect(() => {
    if (communities.length > 0) return;

    getCommunities()
      .then(data => {
        const list = data.communities || data || [];
        setCommunities(Array.isArray(list) ? list : []);
      })
      .catch(() => setCommunities([]));
  }, [setCommunities, communities.length]);

  return communities;
}

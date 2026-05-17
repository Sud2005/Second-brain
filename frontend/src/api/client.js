const BASE = '/api';

async function request(path, options = {}) {
  const url = `${BASE}${path}`;
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.error(`[API] ${options.method || 'GET'} ${path} failed:`, err);
    throw err;
  }
}

export const getItems = (limit = 100, status = null) => {
  const params = new URLSearchParams({ limit });
  if (status) params.set('status', status);
  return request(`/items?${params}`);
};

export const getItem = (id) => request(`/items/${id}`);

export const getStats = () => request('/stats');

export const search = (query, limit = 10) =>
  request(`/search?q=${encodeURIComponent(query)}&limit=${limit}`);

export const getNeighbors = (itemId, depth = 2) =>
  request(`/graph/neighbors/${itemId}?depth=${depth}`);

export const getCommunities = () => request('/communities');

export const getCommunity = (id) => request(`/communities/${id}`);

export const ingestThought = (content, tags = []) =>
  request('/ingest/thought', {
    method: 'POST',
    body: JSON.stringify({ content, tags }),
  });

export const ingestUrl = (url, title = null, tags = []) =>
  request('/ingest/url', {
    method: 'POST',
    body: JSON.stringify({ url, title, tags }),
  });

export const ingestFile = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BASE}/ingest/file`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
};

export const ingestChat = (platform, content, tags = []) =>
  request('/ingest/chat', {
    method: 'POST',
    body: JSON.stringify({ platform, content, tags }),
  });

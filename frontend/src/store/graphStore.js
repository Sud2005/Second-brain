import { create } from 'zustand';

const useGraphStore = create((set, get) => ({
  // ── Graph data ──────────────────────────────────────
  nodes: [],
  edges: [],
  communities: [],
  stats: { total: 0, by_source_type: {}, by_status: {} },
  items: [],

  // ── Selection ───────────────────────────────────────
  selectedNodeId: null,
  hoveredNodeId: null,

  // ── UI state ────────────────────────────────────────
  viewMode: '3d',               // '3d' | '2d' | 'timeline'
  activeCommunityFilter: null,
  sidebarTab: 'all',            // 'all' | 'thought' | 'screenshot' | 'ai_chat' | 'url'
  inspectorOpen: false,
  quickCaptureOpen: false,
  captureModalOpen: false,

  // ── Search ──────────────────────────────────────────
  searchQuery: '',
  searchResults: [],
  searchEntities: [],
  isSearching: false,

  // ── Toasts ──────────────────────────────────────────
  toasts: [],

  // ── Actions ─────────────────────────────────────────
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setCommunities: (communities) => set({ communities }),
  setStats: (stats) => set({ stats }),
  setItems: (items) => set({ items }),

  setSelectedNode: (id) => set({
    selectedNodeId: id,
    inspectorOpen: id !== null,
  }),

  setHoveredNode: (id) => set({ hoveredNodeId: id }),

  setViewMode: (mode) => set({ viewMode: mode }),

  filterByCommunity: (id) => set({
    activeCommunityFilter: get().activeCommunityFilter === id ? null : id,
  }),

  setSidebarTab: (tab) => set({ sidebarTab: tab }),

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (results, entities) => set({
    searchResults: results,
    searchEntities: entities || [],
    isSearching: false,
  }),
  setIsSearching: (val) => set({ isSearching: val }),

  toggleQuickCapture: () => set({ quickCaptureOpen: !get().quickCaptureOpen }),
  openCaptureModal: () => set({ quickCaptureOpen: false, captureModalOpen: true }),
  closeCaptureModal: () => set({ captureModalOpen: false }),

  showToast: (message, type = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    set({ toasts: [...get().toasts, { id, message, type }] });
    setTimeout(() => {
      set({ toasts: get().toasts.filter(t => t.id !== id) });
    }, 3000);
  },

  // Add a new node dynamically (used by realtime polling)
  addNode: (node) => {
    const existing = get().nodes.find(n => n.id === node.id);
    if (!existing) {
      set({ nodes: [...get().nodes, { ...node, _isNew: true }] });
    }
  },

  // Add a new item
  addItem: (item) => {
    const existing = get().items.find(i => i.id === item.id);
    if (!existing) {
      set({ items: [item, ...get().items] });
    }
  },
}));

export default useGraphStore;

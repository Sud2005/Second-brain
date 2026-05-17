import useGraph from './hooks/useGraph';
import useRealtime from './hooks/useRealtime';
import useGraphStore from './store/graphStore';

import Sidebar from './components/Sidebar/Sidebar';
import Inspector from './components/Inspector/Inspector';
import HUD from './components/HUD/HUD';
import CommunityFilter from './components/HUD/CommunityFilter';
import QuickCapture from './components/Capture/QuickCapture';
import CaptureModal from './components/Capture/CaptureModal';
import GraphCanvas from './components/Graph/GraphCanvas';
import Graph2D from './components/Graph/Graph2D';
import Timeline from './components/Graph/Timeline';
import GraphErrorBoundary from './components/Graph/GraphErrorBoundary';

export default function App() {
  const { reload } = useGraph();
  useRealtime();

  const viewMode = useGraphStore(s => s.viewMode);
  const nodes = useGraphStore(s => s.nodes);
  const toast = useGraphStore(s => s.toast);

  const isEmpty = nodes.length === 0;

  return (
    <>
      <HUD />

      <div className="app-layout">
        <Sidebar />

        <div className="graph-container">
          {isEmpty && (
            <div className="empty-state">
              <h2>Your brain is empty</h2>
              <p>
                Press <kbd>Ctrl</kbd> + <kbd>K</kbd> to capture your first thought.
              </p>
            </div>
          )}

          {!isEmpty && viewMode === '3d' && (
            <GraphErrorBoundary fallback={<Graph2D />}>
              <GraphCanvas />
            </GraphErrorBoundary>
          )}

          {!isEmpty && viewMode === '2d' && <Graph2D />}

          {!isEmpty && viewMode === 'timeline' && <Timeline />}
        </div>
      </div>

      <CommunityFilter />
      <Inspector />
      <QuickCapture />
      <CaptureModal />

      {/* Toast notification */}
      {toast && (
        <div className={`toast toast--${toast.type}`}>
          {toast.message}
        </div>
      )}
    </>
  );
}

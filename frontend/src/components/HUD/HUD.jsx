import useGraphStore from '../../store/graphStore';
import ViewSwitcher from './ViewSwitcher';
import './HUD.css';

export default function HUD() {
  const stats = useGraphStore(s => s.stats);
  const edges = useGraphStore(s => s.edges);
  const communities = useGraphStore(s => s.communities);
  const toggleQuickCapture = useGraphStore(s => s.toggleQuickCapture);

  return (
    <header className="hud glass-panel">
      <div className="hud__left">
        <h1 className="hud__wordmark serif">Second Brain</h1>
      </div>

      <div className="hud__center mono">
        <span className="hud__stat">
          <span className="hud__stat-value accent-green">{stats.total || 0}</span> nodes
        </span>
        <span className="hud__divider">·</span>
        <span className="hud__stat">
          <span className="hud__stat-value accent-purple">{edges.length}</span> connections
        </span>
        <span className="hud__divider">·</span>
        <span className="hud__stat">
          <span className="hud__stat-value accent-blue">{communities.length}</span> themes
        </span>
      </div>

      <div className="hud__right">
        <ViewSwitcher />
        <button className="hud__capture-btn" onClick={toggleQuickCapture} title="Quick Capture (Ctrl+K)">
          <span>⌘K</span>
        </button>
      </div>
    </header>
  );
}

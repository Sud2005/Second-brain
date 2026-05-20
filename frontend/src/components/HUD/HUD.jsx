import useGraphStore from '../../store/graphStore';
import ViewSwitcher from './ViewSwitcher';
import { Capture } from '../icons/Icons';
import './HUD.css';

export default function HUD() {
  const stats = useGraphStore(s => s.stats);
  const edges = useGraphStore(s => s.edges);
  const communities = useGraphStore(s => s.communities);
  const toggleQuickCapture = useGraphStore(s => s.toggleQuickCapture);

  return (
    <header className="hud glass-panel">
      <div className="hud__left">
        <div className="hud__wordmark hud-font">
          SECOND BRAIN
          <span className="hud__version mono">V0.3.0</span>
        </div>
      </div>

      <div className="hud__center">
        <div className="hud__stat">
          <span className="hud__stat-value hud-font">{stats.total || 0}</span>
          <span className="hud__stat-label uppercase">NODES</span>
        </div>
        <div className="hud__stat">
          <span className="hud__stat-value hud-font">{edges.length}</span>
          <span className="hud__stat-label uppercase">CONNECTIONS</span>
        </div>
        <div className="hud__stat">
          <span className="hud__stat-value hud-font">{communities.length}</span>
          <span className="hud__stat-label uppercase">COMMUNITIES</span>
        </div>
      </div>

      <div className="hud__right">
        <ViewSwitcher />
        <button className="hud__capture-btn" onClick={toggleQuickCapture} title="Quick Capture (Ctrl+K)">
          <Capture size={14} color="currentColor" />
          <span className="uppercase">CAPTURE</span>
        </button>
      </div>
    </header>
  );
}

import useGraphStore from '../../store/graphStore';
import './ViewSwitcher.css';

export default function ViewSwitcher() {
  const viewMode = useGraphStore(s => s.viewMode);
  const setViewMode = useGraphStore(s => s.setViewMode);

  const modes = [
    { id: '3d', label: '3D' },
    { id: '2d', label: '2D' },
    { id: 'timeline', label: 'TIME' },
  ];

  return (
    <div className="view-switcher">
      {modes.map(m => (
        <button
          key={m.id}
          className={`view-switcher__btn ${viewMode === m.id ? 'view-switcher__btn--active' : ''}`}
          onClick={() => setViewMode(m.id)}
          title={`Switch to ${m.label} view`}
        >
          <span className="view-switcher__label">{m.label}</span>
        </button>
      ))}
    </div>
  );
}

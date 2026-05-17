import useGraphStore from '../../store/graphStore';
import './RelatedNodes.css';

export default function RelatedNodes({ neighbors }) {
  const setSelectedNode = useGraphStore(s => s.setSelectedNode);

  if (!neighbors || neighbors.length === 0) return null;

  return (
    <div className="related-nodes">
      <span className="related-nodes__label mono">Connected Nodes</span>
      <div className="related-nodes__list">
        {neighbors.map((n, i) => (
          <button
            key={n.id || i}
            className="related-node"
            onClick={() => setSelectedNode(n.id)}
          >
            <span
              className="related-node__dot"
              style={{ background: n.color || '#333' }}
            />
            <span className="related-node__label">{n.label?.slice(0, 30)}</span>
            <span className="related-node__type pill">{n.type}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

import useGraphStore from '../../store/graphStore';
import { Node } from '../icons/Icons';
import './MemoryCard.css';

export default function MemoryCard({ card }) {
  if (!card) return null;

  return (
    <div className="memory-card">
      {/* Summary */}
      {card.summary && (
        <blockquote className="memory-card__summary">
          "{card.summary}"
        </blockquote>
      )}

      {/* Key concepts */}
      {card.key_concepts?.length > 0 && (
        <div className="memory-card__section">
          <span className="memory-card__label mono uppercase">Key Concepts</span>
          <div className="memory-card__chips">
            {card.key_concepts.map((c, i) => (
              <button
                key={i}
                className="pill pill--accent"
                onClick={() => {
                  // Trigger a search for this concept
                  useGraphStore.getState().setSearchQuery(c);
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Suggested connections */}
      {card.suggested_connections?.length > 0 && (
        <div className="memory-card__section">
          <span className="memory-card__label mono uppercase">Connections</span>
          <ul className="memory-card__list">
            {card.suggested_connections.map((c, i) => (
              <li key={i} className="memory-card__list-item">{c}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Action */}
      {card.action && (
        <div className="memory-card__action">
          <span className="memory-card__action-icon"><Node size={12} /></span>
          <span>{card.action}</span>
        </div>
      )}
    </div>
  );
}

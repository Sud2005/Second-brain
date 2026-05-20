import { useMemo, useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import useGraphStore from '../../store/graphStore';
import './Timeline.css';

const COLORS = [
  '#00FFB2', '#FF6B6B', '#7B61FF', '#FFB800',
  '#00C8FF', '#FF9F43', '#A29BFE', '#FD79A8',
];

// Safe date formatter to prevent any RangeError crashes
function safeFormat(dateStr, formatStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return format(d, formatStr);
  } catch (e) {
    return '';
  }
}

export default function Timeline() {
  const items = useGraphStore(s => s.items);
  const communities = useGraphStore(s => s.communities);
  const setSelectedNode = useGraphStore(s => s.setSelectedNode);
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const [playback, setPlayback] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const playRef = useRef(null);

  // Build community lookup
  const itemCommunity = useMemo(() => {
    const map = {};
    communities.forEach(c => {
      (c.item_ids || []).forEach(id => { map[id] = c.id; });
    });
    return map;
  }, [communities]);

  // Sort items by date (safely filtering invalid dates)
  const sorted = useMemo(() =>
    [...items]
      .filter(i => i.created_at && !isNaN(new Date(i.created_at).getTime()))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [items]
  );

  // Community lanes
  const lanes = useMemo(() => {
    const map = {};
    let laneIdx = 0;
    sorted.forEach(item => {
      const cid = item.metadata?.community_id ?? itemCommunity[item.id] ?? -1;
      if (!(cid in map)) { map[cid] = laneIdx++; }
    });
    return map;
  }, [sorted, itemCommunity]);

  const laneCount = Math.max(Object.keys(lanes).length, 1);

  // Reset visible count when items change
  useEffect(() => { setVisibleCount(sorted.length); }, [sorted.length]);

  // Playback animation
  useEffect(() => {
    if (playback) {
      setVisibleCount(0);
      let count = 0;
      playRef.current = setInterval(() => {
        count++;
        setVisibleCount(count);
        if (count >= sorted.length) {
          clearInterval(playRef.current);
          setPlayback(false);
        }
      }, 200);
    }
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [playback, sorted.length]);

  const visible = sorted.slice(0, visibleCount);

  return (
    <div className="timeline">
      <div className="timeline__controls">
        <button
          className="timeline__play-btn mono"
          onClick={() => setPlayback(true)}
          disabled={playback}
        >
          {playback ? '▶ Playing...' : '▶ Play Growth'}
        </button>
        <input
          type="range"
          className="timeline__scrubber"
          min={0}
          max={sorted.length}
          value={visibleCount}
          onChange={e => setVisibleCount(Number(e.target.value))}
        />
        <span className="timeline__count mono">
          {visibleCount} / {sorted.length}
        </span>
      </div>

      <div className="timeline__canvas">
        {/* Lane labels */}
        <div className="timeline__lanes" style={{ height: `${laneCount * 60 + 40}px` }}>
          {visible.map((item, i) => {
            const cid = item.metadata?.community_id ?? itemCommunity[item.id] ?? -1;
            const lane = lanes[cid] ?? 0;
            const color = cid >= 0 ? COLORS[cid % COLORS.length] : '#333';
            const xPercent = sorted.length > 1
              ? (i / (sorted.length - 1)) * 100
              : 50;
            const isSelected = item.id === selectedNodeId;

            return (
              <button
                key={item.id}
                className={`timeline__node ${isSelected ? 'timeline__node--selected' : ''}`}
                style={{
                  left: `${xPercent}%`,
                  top: `${lane * 60 + 20}px`,
                  background: color,
                  boxShadow: `0 0 12px ${color}40`,
                  animation: 'spawn 0.3s ease-out',
                }}
                onClick={() => setSelectedNode(item.id)}
                title={`${item.title || 'Untitled'}\n${safeFormat(item.created_at, 'MMM d, yyyy')}`}
              />
            );
          })}
        </div>

        {/* Date axis */}
        {sorted.length > 0 && (
          <div className="timeline__axis mono">
            <span>{safeFormat(sorted[0].created_at, 'MMM d')}</span>
            <span>{safeFormat(sorted[sorted.length - 1].created_at, 'MMM d, yyyy')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

import { useRef, useEffect, useCallback } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceX, forceY } from 'd3-force-3d';
import useGraphStore from '../../store/graphStore';
import './Graph2D.css';

/*
  2D canvas fallback for devices without WebGL.
  Uses plain <canvas> with d3-force for layout.
*/

const COLORS = [
  '#00FFB2', '#FF6B6B', '#7B61FF', '#FFB800',
  '#00C8FF', '#FF9F43', '#A29BFE', '#FD79A8',
];

export default function Graph2D() {
  const canvasRef = useRef(null);
  const nodes = useGraphStore(s => s.nodes);
  const edges = useGraphStore(s => s.edges);
  const setSelectedNode = useGraphStore(s => s.setSelectedNode);
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const activeCommunityFilter = useGraphStore(s => s.activeCommunityFilter);
  const simRef = useRef(null);
  const posRef = useRef({});

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.parentElement.clientWidth;
    const h = canvas.height = canvas.parentElement.clientHeight;
    const cx = w / 2;
    const cy = h / 2;

    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, w, h);

    // Draw edges
    edges.forEach(e => {
      const sp = posRef.current[e.source];
      const tp = posRef.current[e.target];
      if (!sp || !tp) return;
      ctx.beginPath();
      ctx.moveTo(cx + sp.x, cy + sp.y);
      ctx.lineTo(cx + tp.x, cy + tp.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    });

    // Draw nodes
    nodes.forEach(n => {
      const p = posRef.current[n.id];
      if (!p) return;

      const color = n.communityId != null
        ? COLORS[n.communityId % COLORS.length]
        : '#333';

      const isFaded = activeCommunityFilter != null && n.communityId !== activeCommunityFilter;
      const isSelected = n.id === selectedNodeId;
      const radius = n.type === 'item' ? Math.max(3, Math.min(8, 3 + n.connectionCount * 0.5)) : 2;

      // Glow
      if (!isFaded) {
        const gradient = ctx.createRadialGradient(cx + p.x, cy + p.y, 0, cx + p.x, cy + p.y, radius * 3);
        gradient.addColorStop(0, color + '30');
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx + p.x, cy + p.y, radius * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Node
      ctx.beginPath();
      ctx.arc(cx + p.x, cy + p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = isFaded ? '#1a1a2e' : color;
      ctx.fill();

      // Selection ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(cx + p.x, cy + p.y, radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });

    requestAnimationFrame(draw);
  }, [nodes, edges, selectedNodeId, activeCommunityFilter]);

  useEffect(() => {
    const simNodes = nodes.map(n => ({ id: n.id, x: (Math.random() - 0.5) * 300, y: (Math.random() - 0.5) * 300 }));
    const nodeIndex = {};
    simNodes.forEach((n, i) => { nodeIndex[n.id] = i; });

    const simLinks = edges
      .filter(e => nodeIndex[e.source] !== undefined && nodeIndex[e.target] !== undefined)
      .map(e => ({ source: nodeIndex[e.source], target: nodeIndex[e.target] }));

    const sim = forceSimulation(simNodes, 2)
      .force('link', forceLink(simLinks).distance(40).strength(0.2))
      .force('charge', forceManyBody().strength(-30))
      .force('x', forceX(0).strength(0.02))
      .force('y', forceY(0).strength(0.02))
      .on('tick', () => {
        const pos = {};
        simNodes.forEach(n => { pos[n.id] = { x: n.x, y: n.y }; });
        posRef.current = pos;
      });

    simRef.current = sim;
    draw();

    return () => sim.stop();
  }, [nodes, edges, draw]);

  // Click detection
  const handleClick = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left - canvas.width / 2;
    const my = e.clientY - rect.top - canvas.height / 2;

    let closest = null;
    let closestDist = 15;
    nodes.forEach(n => {
      const p = posRef.current[n.id];
      if (!p) return;
      const d = Math.sqrt((p.x - mx) ** 2 + (p.y - my) ** 2);
      if (d < closestDist) { closest = n.id; closestDist = d; }
    });
    setSelectedNode(closest);
  }, [nodes, setSelectedNode]);

  return (
    <div className="graph-2d">
      <canvas ref={canvasRef} onClick={handleClick} />
    </div>
  );
}

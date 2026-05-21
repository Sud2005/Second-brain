import { useRef, useEffect, useCallback } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceX, forceY } from 'd3-force-3d';
import useGraphStore from '../../store/graphStore';
import './Graph2D.css';

/*
  2D canvas fallback for devices without WebGL.
  Uses plain <canvas> with d3-force for layout.
*/

const COLORS = [
  '#00FFD1', '#FF4B6E', '#A259FF', '#FFB800',
  '#00A8FF', '#FF6B35', '#00FF8C', '#FF3CAC',
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

  // 1. D3 Force simulation setup (re-runs only when structure changes)
  useEffect(() => {
    if (nodes.length === 0) return;

    const simNodes = nodes.map(n => ({ 
      id: n.id, 
      x: (Math.random() - 0.5) * 300, 
      y: (Math.random() - 0.5) * 300 
    }));
    
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
      .alpha(1)
      .alphaDecay(0.015)
      .alphaMin(0.0008)
      .velocityDecay(0.28)
      .on('tick', () => {
        const pos = {};
        simNodes.forEach(n => { pos[n.id] = { x: n.x, y: n.y }; });
        posRef.current = pos;
      });

    simRef.current = sim;
    const keepAlive = setInterval(() => {
      if (sim.alpha() < 0.05) {
        sim.alpha(0.16).restart();
      }
    }, 2000);

    return () => {
      clearInterval(keepAlive);
      sim.stop();
    };
  }, [nodes, edges]);

  // 2. Single Frame Drawing Function
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;
    
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.parentElement.clientWidth || 800;
    const h = canvas.height = canvas.parentElement.clientHeight || 600;
    const cx = w / 2;
    const cy = h / 2;

    ctx.fillStyle = '#00020A';
    ctx.fillRect(0, 0, w, h);

    const nodeMap = {};
    nodes.forEach(n => { nodeMap[n.id] = n; });

    // Draw edges
    edges.forEach(e => {
      const sp = posRef.current[e.source];
      const tp = posRef.current[e.target];
      if (!sp || !tp) return;
      ctx.beginPath();
      ctx.moveTo(cx + sp.x, cy + sp.y);
      ctx.lineTo(cx + tp.x, cy + tp.y);
      const relation = e.relation || 'RELATED_TO';
      const sourceNode = nodeMap[e.source];
      const edgeColor = sourceNode?.color || '#00D2FF';
      if (relation === 'CO_OCCURS_WITH') {
        ctx.setLineDash([4, 6]);
      } else {
        ctx.setLineDash([]);
      }
      if (relation === 'MENTIONS') {
        ctx.strokeStyle = 'rgba(232, 244, 255, 0.18)';
        ctx.lineWidth = 0.5;
      } else {
        ctx.strokeStyle = relation === 'RELATED_TO'
          ? `${edgeColor}99`
          : `${edgeColor}55`;
        ctx.lineWidth = relation === 'RELATED_TO' ? 1 : 0.6;
      }
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // Draw nodes
    nodes.forEach(n => {
      const p = posRef.current[n.id];
      if (!p) return;

      const color = n.color || (n.communityId != null
        ? COLORS[n.communityId % COLORS.length]
        : '#333333');

      const isFaded = activeCommunityFilter != null && n.communityId !== activeCommunityFilter;
      const isSelected = n.id === selectedNodeId;
      const radius = n.type === 'item' ? Math.max(3, Math.min(8, 3 + (n.connectionCount || 0) * 0.5)) : 2;

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
      ctx.fillStyle = isFaded ? '#0b1624' : color;
      ctx.fill();

      // Selection ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(cx + p.x, cy + p.y, radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#00D2FF';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    });
  }, [nodes, edges, selectedNodeId, activeCommunityFilter]);

  // Keep a mutable ref to draw so we don't restart the rendering loop
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  // 3. Continuous rendering loop running while component is mounted
  useEffect(() => {
    let animId;
    const loop = () => {
      if (drawRef.current) {
        drawRef.current();
      }
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

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

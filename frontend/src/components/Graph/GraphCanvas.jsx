import { useRef, useMemo, useEffect, useCallback, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Html, Billboard, Text } from '@react-three/drei';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
} from 'd3-force-3d';
import * as THREE from 'three';
import useGraphStore from '../../store/graphStore';

/* ── 3D Force layout engine ────────────────────────── */

function useForceLayout(nodes, edges) {
  const [positions, setPositions] = useState({});

  useEffect(() => {
    if (nodes.length === 0) return;

    const simNodes = nodes.map(n => ({
      id: n.id,
      x: (Math.random() - 0.5) * 100,
      y: (Math.random() - 0.5) * 100,
      z: (Math.random() - 0.5) * 100,
    }));

    const nodeIndex = {};
    simNodes.forEach((n, i) => { nodeIndex[n.id] = i; });

    const simLinks = edges
      .filter(e => nodeIndex[e.source] !== undefined && nodeIndex[e.target] !== undefined)
      .map(e => ({
        source: nodeIndex[e.source],
        target: nodeIndex[e.target],
      }));

    const sim = forceSimulation(simNodes, 3)
      .force('link', forceLink(simLinks).distance(30).strength(0.3))
      .force('charge', forceManyBody().strength(-60))
      .force('center', forceCenter(0, 0, 0))
      .alpha(1)
      .alphaDecay(0.02);

    // Run simulation synchronously for initial layout
    for (let i = 0; i < 120; i++) sim.tick();

    const pos = {};
    simNodes.forEach(n => {
      pos[n.id] = [n.x || 0, n.y || 0, n.z || 0];
    });
    setPositions(pos);

    return () => sim.stop();
  }, [nodes, edges]);

  return positions;
}

/* ── Individual Node ───────────────────────────────── */

function GraphNode3D({ node, position, isSelected, isHovered, isFaded, onSelect, onHover }) {
  const meshRef = useRef();
  const glowRef = useRef();
  const isItem = node.type === 'item';
  const baseRadius = isItem ? Math.max(0.8, Math.min(2.5, 0.8 + node.connectionCount * 0.15)) : 0.5;
  const color = new THREE.Color(node.color || '#333');

  useFrame((state) => {
    if (!meshRef.current) return;
    const scale = isHovered ? 1.3 : isSelected ? 1.15 : 1;
    meshRef.current.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.1);

    if (glowRef.current) {
      glowRef.current.material.opacity = isSelected
        ? 0.3 + Math.sin(state.clock.elapsedTime * 3) * 0.15
        : isHovered ? 0.2 : 0;
    }
  });

  return (
    <group position={position}>
      {/* Glow halo */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[baseRadius * 2.5, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0} side={THREE.BackSide} />
      </mesh>

      {/* Main node */}
      <mesh
        ref={meshRef}
        onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
        onPointerOver={(e) => { e.stopPropagation(); onHover(node.id); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { onHover(null); document.body.style.cursor = 'default'; }}
      >
        {isItem
          ? <sphereGeometry args={[baseRadius, 24, 24]} />
          : <octahedronGeometry args={[baseRadius, 0]} />
        }
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isFaded ? 0.05 : isSelected ? 0.8 : isHovered ? 0.6 : 0.35}
          transparent
          opacity={isFaded ? 0.1 : 1}
          roughness={0.3}
          metalness={0.6}
        />
      </mesh>

      {/* Label billboard — only when hovered or selected */}
      {(isHovered || isSelected) && (
        <Billboard position={[0, baseRadius + 1.2, 0]}>
          <Text
            fontSize={1}
            color="#ffffff"
            anchorX="center"
            anchorY="bottom"
            font="/fonts/JetBrainsMono-Regular.ttf"
            maxWidth={20}
          >
            {node.icon} {node.label?.slice(0, 40)}
          </Text>
        </Billboard>
      )}
    </group>
  );
}

/* ── Edges ─────────────────────────────────────────── */

function GraphEdges({ edges, positions, activeCommunityFilter, nodes }) {
  const linesRef = useRef();

  const lineData = useMemo(() => {
    const pts = [];
    const colors = [];
    const nodeMap = {};
    nodes.forEach(n => { nodeMap[n.id] = n; });

    edges.forEach(e => {
      const sp = positions[e.source];
      const tp = positions[e.target];
      if (!sp || !tp) return;

      const sourceNode = nodeMap[e.source];
      const targetNode = nodeMap[e.target];

      let opacity = 0.15;
      let col = new THREE.Color('#ffffff');

      if (e.relation === 'RELATED_TO' || e.relation === 'CO_OCCURS_WITH') {
        const cid = sourceNode?.communityId ?? targetNode?.communityId;
        if (cid != null) col = new THREE.Color(sourceNode?.color || '#333');
        opacity = e.relation === 'RELATED_TO' ? 0.3 : 0.08;
      }

      if (activeCommunityFilter != null) {
        const srcMatch = sourceNode?.communityId === activeCommunityFilter;
        const tgtMatch = targetNode?.communityId === activeCommunityFilter;
        if (!srcMatch && !tgtMatch) opacity = 0.02;
      }

      col.multiplyScalar(opacity / 0.15);

      pts.push(sp[0], sp[1], sp[2], tp[0], tp[1], tp[2]);
      colors.push(col.r, col.g, col.b, col.r, col.g, col.b);
    });

    return { positions: new Float32Array(pts), colors: new Float32Array(colors) };
  }, [edges, positions, activeCommunityFilter, nodes]);

  if (lineData.positions.length === 0) return null;

  return (
    <lineSegments ref={linesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={lineData.positions}
          count={lineData.positions.length / 3}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          array={lineData.colors}
          count={lineData.colors.length / 3}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial vertexColors transparent opacity={0.6} />
    </lineSegments>
  );
}

/* ── Camera animator ───────────────────────────────── */

function CameraAnimator({ targetPosition }) {
  const { camera } = useThree();
  const targetRef = useRef(null);

  useEffect(() => {
    if (targetPosition) {
      targetRef.current = new THREE.Vector3(
        targetPosition[0] + 15,
        targetPosition[1] + 10,
        targetPosition[2] + 15,
      );
    }
  }, [targetPosition]);

  useFrame(() => {
    if (targetRef.current) {
      camera.position.lerp(targetRef.current, 0.03);
      if (camera.position.distanceTo(targetRef.current) < 0.5) {
        targetRef.current = null;
      }
    }
  });

  return null;
}

/* ── Grid floor ────────────────────────────────────── */

function GridFloor() {
  return (
    <gridHelper
      args={[200, 40, '#111828', '#0a0f1a']}
      position={[0, -30, 0]}
    />
  );
}

/* ── Scene content ─────────────────────────────────── */

function SceneContent({ nodes, edges }) {
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const hoveredNodeId = useGraphStore(s => s.hoveredNodeId);
  const activeCommunityFilter = useGraphStore(s => s.activeCommunityFilter);
  const setSelectedNode = useGraphStore(s => s.setSelectedNode);
  const setHoveredNode = useGraphStore(s => s.setHoveredNode);

  const positions = useForceLayout(nodes, edges);

  const selectedPos = selectedNodeId ? positions[selectedNodeId] : null;

  return (
    <>
      <ambientLight intensity={0.15} />
      <pointLight position={[50, 50, 50]} intensity={0.4} color="#ffffff" />
      <pointLight position={[-50, -30, -50]} intensity={0.2} color="#7B61FF" />

      <Stars radius={200} depth={100} count={2000} factor={3} saturation={0} fade speed={0.5} />
      <GridFloor />

      <GraphEdges
        edges={edges}
        positions={positions}
        activeCommunityFilter={activeCommunityFilter}
        nodes={nodes}
      />

      {nodes.map(node => {
        const pos = positions[node.id];
        if (!pos) return null;

        const isFaded = activeCommunityFilter != null && node.communityId !== activeCommunityFilter;

        return (
          <GraphNode3D
            key={node.id}
            node={node}
            position={pos}
            isSelected={selectedNodeId === node.id}
            isHovered={hoveredNodeId === node.id}
            isFaded={isFaded}
            onSelect={setSelectedNode}
            onHover={setHoveredNode}
          />
        );
      })}

      <CameraAnimator targetPosition={selectedPos} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.05}
        minDistance={5}
        maxDistance={300}
      />
    </>
  );
}

/* ── Main canvas export ────────────────────────────── */

export default function GraphCanvas() {
  const nodes = useGraphStore(s => s.nodes);
  const edges = useGraphStore(s => s.edges);
  const setSelectedNode = useGraphStore(s => s.setSelectedNode);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Canvas
        camera={{ position: [60, 40, 60], fov: 60, near: 0.1, far: 1000 }}
        onPointerMissed={() => setSelectedNode(null)}
        gl={{ antialias: true, alpha: false }}
        style={{ background: '#050810' }}
      >
        <color attach="background" args={['#050810']} />
        <fog attach="fog" args={['#050810', 100, 350]} />
        <SceneContent nodes={nodes} edges={edges} />
      </Canvas>
    </div>
  );
}

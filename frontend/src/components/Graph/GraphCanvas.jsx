import { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Billboard, Text } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
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
      x: (Math.random() - 0.5) * 80,
      y: (Math.random() - 0.5) * 80,
      z: (Math.random() - 0.5) * 80,
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
      .force('link', forceLink(simLinks).distance(20).strength(0.3))
      .force('charge', forceManyBody().strength(-40))
      .force('center', forceCenter(0, 0, 0))
      .alpha(1)
      .alphaDecay(0.03);

    for (let i = 0; i < 80; i++) sim.tick();

    const pos = {};
    simNodes.forEach(n => {
      pos[n.id] = [n.x || 0, n.y || 0, n.z || 0];
    });
    setPositions(pos);

    return () => sim.stop();
  }, [nodes, edges]);

  return positions;
}

/* ── Individual Sci-Fi Node ────────────────────────── */

function SciFiNode({ node, position, isSelected, isHovered, isFaded, onSelect, onHover }) {
  const groupRef = useRef();
  const ring1Ref = useRef();
  const ring2Ref = useRef();
  const ring3Ref = useRef();
  const particlesRef = useRef();

  const isItem = node.type === 'item';
  const baseRadius = isItem
    ? Math.max(1.5, Math.min(3.5, 1.5 + (node.connectionCount || 0) * 0.3))
    : 1.0;
  
  // High-tech neon colors
  const baseColor = new THREE.Color(node.color || '#00e5ff');
  const coreColor = new THREE.Color(isSelected ? '#ffffff' : baseColor).multiplyScalar(isSelected ? 2 : 1.5);
  const shellColor = baseColor.clone().multiplyScalar(1.2);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    
    // Hover/Select scaling
    const targetScale = isHovered ? 1.4 : isSelected ? 1.25 : 1;
    groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);

    // Rotate concentric rings on different axes for "atomic orbital" look
    if (ring1Ref.current) ring1Ref.current.rotation.x += delta * 0.5;
    if (ring2Ref.current) ring2Ref.current.rotation.y += delta * 0.7;
    if (ring3Ref.current) ring3Ref.current.rotation.z -= delta * 0.4;
    
    // Rotate floating particles
    if (particlesRef.current) {
      particlesRef.current.rotation.y += delta * 1.5;
      particlesRef.current.rotation.x += delta * 0.5;
    }
  });

  return (
    <group position={position} ref={groupRef}>
      {/* 1. Ultra-bright Core (Triggers intense Bloom) */}
      <mesh
        onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
        onPointerOver={(e) => { e.stopPropagation(); onHover(node.id); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { onHover(null); document.body.style.cursor = 'default'; }}
      >
        {isItem ? <sphereGeometry args={[baseRadius * 0.4, 32, 32]} /> : <octahedronGeometry args={[baseRadius * 0.5, 0]} />}
        <meshBasicMaterial color={coreColor} toneMapped={false} />
      </mesh>

      {/* 2. Transparent Holographic Shell */}
      <mesh>
        {isItem ? <sphereGeometry args={[baseRadius * 0.8, 32, 32]} /> : <octahedronGeometry args={[baseRadius * 0.9, 0]} />}
        <meshPhysicalMaterial 
          color={shellColor} 
          emissive={shellColor}
          emissiveIntensity={0.5}
          transparent 
          opacity={isFaded ? 0.05 : isSelected ? 0.6 : 0.3} 
          roughness={0.1}
          transmission={0.9} // glass-like
          thickness={0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 3. Atomic Orbital Energy Rings */}
      {isItem && !isFaded && (
        <>
          <mesh ref={ring1Ref}>
            <torusGeometry args={[baseRadius * 1.2, 0.02, 16, 64]} />
            <meshBasicMaterial color={baseColor} transparent opacity={isSelected ? 0.8 : 0.3} blending={THREE.AdditiveBlending} toneMapped={false} />
          </mesh>
          <mesh ref={ring2Ref} rotation={[Math.PI / 3, 0, 0]}>
            <torusGeometry args={[baseRadius * 1.3, 0.015, 16, 64]} />
            <meshBasicMaterial color={baseColor} transparent opacity={isSelected ? 0.6 : 0.2} blending={THREE.AdditiveBlending} toneMapped={false} />
          </mesh>
          {(isSelected || isHovered) && (
            <mesh ref={ring3Ref} rotation={[0, Math.PI / 4, Math.PI / 6]}>
              <torusGeometry args={[baseRadius * 1.5, 0.01, 16, 64]} />
              <meshBasicMaterial color={'#ffffff'} transparent opacity={0.5} blending={THREE.AdditiveBlending} toneMapped={false} />
            </mesh>
          )}
        </>
      )}

      {/* 4. Floating Data Particles (Only for items, more if selected) */}
      {isItem && !isFaded && (
        <group ref={particlesRef}>
          {Array.from({ length: isSelected ? 6 : 3 }).map((_, i) => {
            const angle = (i / (isSelected ? 6 : 3)) * Math.PI * 2;
            const r = baseRadius * 1.8;
            return (
              <mesh key={i} position={[Math.cos(angle) * r, Math.sin(angle * 2) * 0.5, Math.sin(angle) * r]}>
                <sphereGeometry args={[0.08, 8, 8]} />
                <meshBasicMaterial color="#ffffff" toneMapped={false} blending={THREE.AdditiveBlending} />
              </mesh>
            );
          })}
        </group>
      )}

      {/* Label Billboard */}
      {(isHovered || isSelected) && (
        <Billboard position={[0, baseRadius * 2 + 1, 0]}>
          <Text
            fontSize={1.2}
            color="#ffffff"
            anchorX="center"
            anchorY="bottom"
            maxWidth={25}
            outlineWidth={0.05}
            outlineColor="#001122"
          >
            {node.icon} {node.label?.slice(0, 40)}
          </Text>
        </Billboard>
      )}
    </group>
  );
}

/* ── Sci-Fi Energy Beam Edges ──────────────────────── */

function PlasmaEdges({ edges, positions, activeCommunityFilter, nodes }) {
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

      let opacity = 0.3;
      let col = new THREE.Color('#00ffff'); // default cyan

      if (e.relation === 'RELATED_TO' || e.relation === 'CO_OCCURS_WITH') {
        const cid = sourceNode?.communityId ?? targetNode?.communityId;
        if (cid != null) col = new THREE.Color(sourceNode?.color || '#00e5ff');
        opacity = e.relation === 'RELATED_TO' ? 0.6 : 0.2;
      }

      if (activeCommunityFilter != null) {
        const srcMatch = sourceNode?.communityId === activeCommunityFilter;
        const tgtMatch = targetNode?.communityId === activeCommunityFilter;
        if (!srcMatch && !tgtMatch) opacity = 0.02;
      }

      // Boost color intensity for the glow
      col.multiplyScalar(opacity * 2.0);

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
      {/* Additive blending makes intersecting lines intensely bright like plasma */}
      <lineBasicMaterial vertexColors transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </lineSegments>
  );
}

/* ── Camera animator ───────────────────────────────── */

function CameraAnimator({ targetPosition }) {
  const { camera, controls } = useThree();
  const targetRef = useRef(null);

  useEffect(() => {
    if (targetPosition) {
      // Comfortably offset so nodes look elegant and not cut off/too close
      targetRef.current = new THREE.Vector3(
        targetPosition[0] + 22,
        targetPosition[1] + 14,
        targetPosition[2] + 22,
      );

      // Smoothly focus OrbitControls target on the selected node
      if (controls) {
        controls.target.set(targetPosition[0], targetPosition[1], targetPosition[2]);
      }
    }
  }, [targetPosition, controls]);

  useFrame(() => {
    if (targetRef.current) {
      camera.position.lerp(targetRef.current, 0.1);
      if (camera.position.distanceTo(targetRef.current) < 0.3) {
        targetRef.current = null;
      }
    }
  });

  return null;
}

/* ── Environment & Grid ────────────────────────────── */

function SciFiGrid() {
  return (
    <group position={[0, -30, 0]}>
      {/* Main coordinate grid */}
      <gridHelper args={[300, 60, '#00e5ff', '#001a2c']} />
      {/* Inner precise grid */}
      <gridHelper args={[100, 40, '#005577', '#001122']} position={[0, 0.1, 0]} />
    </group>
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
      <ambientLight intensity={0.1} color="#001122" />
      <pointLight position={[50, 50, 50]} intensity={1} color="#00e5ff" />
      <pointLight position={[-50, -30, -50]} intensity={0.5} color="#7B61FF" />

      {/* Space dust / tiny stars */}
      <Stars radius={150} depth={50} count={3000} factor={2} saturation={1} fade speed={1} />
      <SciFiGrid />

      <PlasmaEdges
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
          <SciFiNode
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

      {/* Post-processing Sci-Fi Effects */}
      <EffectComposer disableNormalPass>
        <Bloom 
          luminanceThreshold={1.0} 
          luminanceSmoothing={0.5} 
          intensity={2.5} 
          mipmapBlur 
        />
        <Noise opacity={0.03} />
        <Vignette eskil={false} offset={0.1} darkness={1.1} />
      </EffectComposer>
    </>
  );
}

/* ── Main canvas export ────────────────────────────── */

export default function GraphCanvas() {
  const nodes = useGraphStore(s => s.nodes);
  const edges = useGraphStore(s => s.edges);
  const setSelectedNode = useGraphStore(s => s.setSelectedNode);

  return (
    <div style={{ width: '100%', height: '100%', background: 'radial-gradient(circle at center, #020813 0%, #000000 100%)' }}>
      <Canvas
        camera={{ position: [40, 30, 40], fov: 60, near: 0.1, far: 1000 }}
        onPointerMissed={() => setSelectedNode(null)}
        gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
      >
        <fog attach="fog" args={['#01040a', 60, 250]} />
        <SceneContent nodes={nodes} edges={edges} />
      </Canvas>
    </div>
  );
}

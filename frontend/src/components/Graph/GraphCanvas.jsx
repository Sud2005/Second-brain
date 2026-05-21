import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Billboard, Text, Grid } from '@react-three/drei';
import { forceSimulation, forceLink, forceManyBody, forceCenter } from 'd3-force-3d';
import gsap from 'gsap';
import * as THREE from 'three';
import useGraphStore from '../../store/graphStore';

const LABEL_UPDATE_INTERVAL_MS = 500;
const LABEL_VISIBILITY_DISTANCE = 65;
const MAX_VISIBLE_LABELS = 70;

/* ── 3D Force layout engine ────────────────────────── */

function useForceLayout(nodes, edges) {
  const [positions, setPositions] = useState({});

  useEffect(() => {
    if (nodes.length === 0) return;

    const simNodes = nodes.map(n => ({
      id: n.id,
      x: (Math.random() - 0.5) * 90,
      y: (Math.random() - 0.5) * 60,
      z: (Math.random() - 0.5) * 90,
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
      .force('link', forceLink(simLinks).distance(24).strength(0.35))
      .force('charge', forceManyBody().strength(-45))
      .force('center', forceCenter(0, 0, 0))
      .alpha(1)
      .alphaDecay(0.03);

    for (let i = 0; i < 90; i++) sim.tick();

    const pos = {};
    simNodes.forEach(n => {
      pos[n.id] = [n.x || 0, n.y || 0, n.z || 0];
    });
    setPositions(pos);

    return () => sim.stop();
  }, [nodes, edges]);

  return positions;
}

/* ── Texture helpers ───────────────────────────────── */

function createGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.15)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/* ── Individual Node Component ─────────────────────── */

function Node({ node, position, isSelected, isHovered, isFaded, onSelect, onHover, glowTexture }) {
  const meshRef = useRef();

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    
    const base = node.type === 'item' ? 1.1 : 0.9;
    const baseScale = base + Math.min(2.4, (node.connectionCount || 0) * 0.08);
    const targetScale = baseScale 
      * (isSelected ? 1.7 : isHovered ? 1.35 : 1)
      * (isFaded ? 0.7 : 1);
      
    const currentScale = THREE.MathUtils.damp(meshRef.current.scale.x, targetScale, 6, delta);
    meshRef.current.scale.setScalar(currentScale);
  });

  const baseColor = useMemo(() => new THREE.Color(node.color || '#00D2FF'), [node.color]);
  const color = useMemo(() => {
    const c = baseColor.clone();
    let intensity = isFaded ? 0.15 : 1;
    if (isHovered) intensity += 0.5;
    if (isSelected) intensity += 0.9;
    return c.multiplyScalar(intensity);
  }, [baseColor, isSelected, isHovered, isFaded]);

  return (
    <group position={position}>
      {/* Node Sphere */}
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(node.id);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHover(null);
          document.body.style.cursor = 'default';
        }}
      >
        <sphereGeometry args={[1, 16, 16]} />
        <meshPhysicalMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isSelected ? 1.5 : 1.1}
          metalness={0.6}
          roughness={0.25}
          transparent
          opacity={isFaded ? 0.2 : 0.7}
          depthWrite={false}
        />
      </mesh>

      {/* Atom glow halo */}
      {!isFaded && (
        <Billboard>
          <mesh scale={isSelected ? 5.5 : isHovered ? 4.8 : 4.2}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial
              map={glowTexture}
              color={node.color || '#00D2FF'}
              transparent
              opacity={isSelected ? 0.75 : isHovered ? 0.55 : 0.4}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </Billboard>
      )}
    </group>
  );
}

/* ── Instanced Nodes Container ─────────────────────── */

function NodeInstances({
  nodes,
  positions,
  selectedNodeId,
  hoveredNodeId,
  activeCommunityFilter,
  onSelect,
  onHover,
}) {
  const glowTexture = useMemo(() => createGlowTexture(), []);

  return (
    <>
      {nodes.map(node => {
        const pos = positions[node.id];
        if (!pos) return null;
        return (
          <Node
            key={node.id}
            node={node}
            position={pos}
            isSelected={node.id === selectedNodeId}
            isHovered={node.id === hoveredNodeId}
            isFaded={activeCommunityFilter != null && node.communityId !== activeCommunityFilter}
            onSelect={onSelect}
            onHover={onHover}
            glowTexture={glowTexture}
          />
        );
      })}
    </>
  );
}

/* ── Edge rendering ─────────────────────────────────── */

function EdgeSegments({ edges, positions, nodes, activeCommunityFilter }) {
  const nodeMap = useMemo(() => {
    const map = new Map();
    nodes.forEach(n => map.set(n.id, n));
    return map;
  }, [nodes]);

  const { mention, related, cooccur } = useMemo(() => {
    const mentionPts = [];
    const mentionColors = [];
    const relatedPts = [];
    const relatedColors = [];
    const coPts = [];
    const coColors = [];

    edges.forEach(e => {
      const sp = positions[e.source];
      const tp = positions[e.target];
      if (!sp || !tp) return;
      const relation = e.relation || 'RELATED_TO';
      const sourceNode = nodeMap.get(e.source);
      const targetNode = nodeMap.get(e.target);
      const cid = sourceNode?.communityId ?? targetNode?.communityId ?? null;
      const filteredOut = activeCommunityFilter != null && cid !== activeCommunityFilter;

      if (relation === 'MENTIONS') {
        const color = new THREE.Color('#E8F4FF').multiplyScalar(filteredOut ? 0.08 : 0.2);
        mentionPts.push(...sp, ...tp);
        mentionColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      } else if (relation === 'CO_OCCURS_WITH') {
        const base = new THREE.Color(sourceNode?.color || '#00D2FF');
        const color = base.multiplyScalar(filteredOut ? 0.1 : 0.45);
        coPts.push(...sp, ...tp);
        coColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      } else {
        const base = new THREE.Color(sourceNode?.color || '#00D2FF');
        const color = base.multiplyScalar(filteredOut ? 0.08 : 0.7);
        relatedPts.push(...sp, ...tp);
        relatedColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
    });

    return {
      mention: {
        positions: new Float32Array(mentionPts),
        colors: new Float32Array(mentionColors),
      },
      related: {
        positions: new Float32Array(relatedPts),
        colors: new Float32Array(relatedColors),
      },
      cooccur: {
        positions: new Float32Array(coPts),
        colors: new Float32Array(coColors),
      },
    };
  }, [edges, positions, nodeMap, activeCommunityFilter]);

  const dashedRef = useRef();
  useEffect(() => {
    if (dashedRef.current) dashedRef.current.computeLineDistances();
  }, [cooccur.positions]);

  return (
    <>
      {mention.positions.length > 0 && (
        <lineSegments frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              array={mention.positions}
              count={mention.positions.length / 3}
              itemSize={3}
            />
            <bufferAttribute
              attach="attributes-color"
              array={mention.colors}
              count={mention.colors.length / 3}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial
            vertexColors
            transparent
            opacity={0.9}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </lineSegments>
      )}
      {related.positions.length > 0 && (
        <lineSegments frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              array={related.positions}
              count={related.positions.length / 3}
              itemSize={3}
            />
            <bufferAttribute
              attach="attributes-color"
              array={related.colors}
              count={related.colors.length / 3}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial
            vertexColors
            transparent
            opacity={0.85}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </lineSegments>
      )}
      {cooccur.positions.length > 0 && (
        <lineSegments ref={dashedRef} frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              array={cooccur.positions}
              count={cooccur.positions.length / 3}
              itemSize={3}
            />
            <bufferAttribute
              attach="attributes-color"
              array={cooccur.colors}
              count={cooccur.colors.length / 3}
              itemSize={3}
            />
          </bufferGeometry>
          <lineDashedMaterial
            vertexColors
            transparent
            opacity={0.8}
            dashSize={2}
            gapSize={4}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </lineSegments>
      )}
    </>
  );
}

/* ── Individual Data Packet Component ──────────────── */

function Packet({ packet }) {
  const meshRef = useRef();

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = (clock.elapsedTime * packet.speed + packet.offset) % 1;
    meshRef.current.position.lerpVectors(packet.start, packet.end, t);
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.32, 8, 8]} />
      <meshBasicMaterial
        color={packet.color}
        transparent
        opacity={0.9}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/* ── Data packets Container ─────────────────────────── */

function DataPackets({ edges, positions, nodes, activeCommunityFilter }) {
  const packets = useMemo(() => {
    const nodeMap = new Map();
    nodes.forEach(n => nodeMap.set(n.id, n));
    const list = [];
    edges.forEach(e => {
      if ((e.relation || 'RELATED_TO') !== 'RELATED_TO') return;
      const sp = positions[e.source];
      const tp = positions[e.target];
      if (!sp || !tp) return;
      const sourceNode = nodeMap.get(e.source);
      const targetNode = nodeMap.get(e.target);
      const cid = sourceNode?.communityId ?? targetNode?.communityId ?? null;
      if (activeCommunityFilter != null && cid !== activeCommunityFilter) return;
      const color = sourceNode?.color || '#00D2FF';
      list.push({
        start: new THREE.Vector3(sp[0], sp[1], sp[2]),
        end: new THREE.Vector3(tp[0], tp[1], tp[2]),
        speed: 0.18 + Math.random() * 0.15,
        offset: Math.random(),
        color,
      });
    });
    return list.slice(0, 150); // limit to 150 for maximum performance
  }, [edges, positions, nodes, activeCommunityFilter]);

  return (
    <>
      {packets.map((p, i) => (
        <Packet key={i} packet={p} />
      ))}
    </>
  );
}

/* ── Labels ─────────────────────────────────────────── */

function NodeLabels({ nodes, positions }) {
  const { camera } = useThree();
  const hoveredNodeId = useGraphStore(s => s.hoveredNodeId);
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const [visible, setVisible] = useState(new Set());
  const visibleRef = useRef(new Set());
  const lastUpdateRef = useRef(0);
  const tempVec = useRef(new THREE.Vector3());

  const setsEqual = (a, b) => {
    if (a.size !== b.size) return false;
    for (const v of a) {
      if (!b.has(v)) return false;
    }
    return true;
  };

  useFrame(({ clock }) => {
    if ((clock.elapsedTime - lastUpdateRef.current) * 1000 < LABEL_UPDATE_INTERVAL_MS) return;
    lastUpdateRef.current = clock.elapsedTime;
    const candidates = [];
    nodes.forEach(n => {
      const pos = positions[n.id];
      if (!pos) return;
      tempVec.current.set(pos[0], pos[1], pos[2]);
      const dist = camera.position.distanceTo(tempVec.current);
      if (dist < LABEL_VISIBILITY_DISTANCE) candidates.push({ id: n.id, dist });
    });
    candidates.sort((a, b) => a.dist - b.dist);

    const next = new Set(candidates.slice(0, MAX_VISIBLE_LABELS).map(c => c.id));
    if (hoveredNodeId) next.add(hoveredNodeId);
    if (selectedNodeId) next.add(selectedNodeId);

    if (!setsEqual(next, visibleRef.current)) {
      visibleRef.current = next;
      setVisible(next);
    }
  });

  return (
    <>
      {nodes.map(node => {
        const pos = positions[node.id];
        if (!pos) return null;
        const shouldShow = visible.has(node.id) || node.id === hoveredNodeId || node.id === selectedNodeId;
        if (!shouldShow) return null;
        const label = (node.label || 'NODE').toUpperCase();
        const clipped = label.length > 18 ? `${label.slice(0, 18)}...` : label;
        const color = node.id === hoveredNodeId ? '#00D2FF' : node.id === selectedNodeId ? '#E8F4FF' : '#6B8FA8';
        return (
          <Billboard key={node.id} position={[pos[0], pos[1] + 2.6, pos[2]]}>
            <Text
              fontSize={1.05}
              color={color}
              anchorX="center"
              anchorY="bottom"
              maxWidth={20}
              letterSpacing={0.22}
            >
              {clipped}
            </Text>
          </Billboard>
        );
      })}
    </>
  );
}

/* ── Camera rig ─────────────────────────────────────── */

function CameraRig({ target }) {
  const { camera, controls } = useThree();
  const lastTargetRef = useRef(null);

  useEffect(() => {
    if (!target || !controls) return;
    const nextTarget = new THREE.Vector3(target[0], target[1], target[2]);
    if (lastTargetRef.current && nextTarget.equals(lastTargetRef.current)) return;
    lastTargetRef.current = nextTarget.clone();

    const offset = new THREE.Vector3(24, 14, 24);
    const destination = nextTarget.clone().add(offset);

    gsap.to(camera.position, {
      x: destination.x,
      y: destination.y,
      z: destination.z,
      duration: 1.2,
      ease: 'power3.inOut',
    });

    gsap.to(controls.target, {
      x: nextTarget.x,
      y: nextTarget.y,
      z: nextTarget.z,
      duration: 1.2,
      ease: 'power3.inOut',
      onUpdate: () => controls.update(),
    });
  }, [target, camera, controls]);

  return null;
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
      <color attach="background" args={['#1e1e1e']} />
      <fog attach="fog" args={['#1e1e1e', 80, 200]} />
      <ambientLight intensity={0.4} color="#ffffff" />
      <pointLight position={[40, 50, 40]} intensity={0.8} color="#ffffff" />
      <pointLight position={[-40, -30, -40]} intensity={0.6} color="#cccccc" />

      <Stars radius={300} depth={60} count={3000} factor={1.5} saturation={0} fade speed={0.5} />
      <Grid
        position={[0, -15, 0]}
        args={[200, 200]}
        cellSize={4}
        cellThickness={0.4}
        sectionSize={20}
        sectionThickness={1}
        cellColor="#003349"
        sectionColor="#00D2FF"
        fadeDistance={90}
        fadeStrength={1}
        infiniteGrid
      />

      <EdgeSegments
        edges={edges}
        positions={positions}
        nodes={nodes}
        activeCommunityFilter={activeCommunityFilter}
      />
      <DataPackets
        edges={edges}
        positions={positions}
        nodes={nodes}
        activeCommunityFilter={activeCommunityFilter}
      />

      <NodeInstances
        nodes={nodes}
        positions={positions}
        selectedNodeId={selectedNodeId}
        hoveredNodeId={hoveredNodeId}
        activeCommunityFilter={activeCommunityFilter}
        onSelect={setSelectedNode}
        onHover={setHoveredNode}
      />

      <NodeLabels nodes={nodes} positions={positions} />

      <CameraRig target={selectedPos} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={8} maxDistance={260} />
    </>
  );
}

/* ── Main canvas export ────────────────────────────── */

export default function GraphCanvas() {
  const nodes = useGraphStore(s => s.nodes);
  const edges = useGraphStore(s => s.edges);

  return (
    <div className="graph-canvas">
      <Canvas
        camera={{ position: [40, 30, 40], fov: 60, near: 0.1, far: 1000 }}
        gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
        dpr={[1, 1.5]}
      >
        <SceneContent nodes={nodes} edges={edges} />
      </Canvas>
    </div>
  );
}

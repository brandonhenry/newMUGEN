import { Bounds, ContactShadows, Environment, OrbitControls, useAnimations, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CharacterDefinition, FighterRuntime, FighterState, MatchSnapshot, MoveInput } from '../types';
import { activeMoveProgress } from '../engine/fightEngine';

type GameSceneProps = {
  match: MatchSnapshot;
};

export type PreviewPose = Exclude<FighterState, 'attack'> | MoveInput;

export function GameScene({ match }: GameSceneProps) {
  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0, 3.3, 6.8], fov: 46 }} data-testid="fight-canvas">
      <color attach="background" args={['#101114']} />
      <fog attach="fog" args={['#101114', 8, 18]} />
      <Suspense fallback={null}>
        <Environment preset="city" />
      </Suspense>
      <ambientLight intensity={0.55} />
      <directionalLight castShadow position={[3, 6, 4]} intensity={1.8} color={match.stage.light} shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-4, 2, -3]} color={match.fighters[0].character.colors.primary} intensity={8} distance={7} />
      <pointLight position={[4, 2, 3]} color={match.fighters[1].character.colors.primary} intensity={8} distance={7} />
      <CameraRig match={match} />
      <Arena stage={match.stage} />
      <FighterRig fighter={match.fighters[0]} />
      <FighterRig fighter={match.fighters[1]} />
      <ContactShadows position={[0, -0.01, 0]} opacity={0.45} scale={12} blur={2.4} far={3} />
    </Canvas>
  );
}

export function CharacterPreviewCanvas({
  character,
  pose,
  rotationTurn,
  zoom
}: {
  character: CharacterDefinition;
  pose: PreviewPose;
  rotationTurn: number;
  zoom: number;
}) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [0, 1.7, 4.4], fov: 38 }}
      data-testid="character-viewer-canvas"
      aria-label="3D character model viewer"
    >
      <color attach="background" args={['#111418']} />
      <Suspense fallback={null}>
        <Environment preset="city" />
      </Suspense>
      <ambientLight intensity={0.7} />
      <directionalLight castShadow position={[2.8, 4.6, 3.4]} intensity={2.1} color="#f7f7f2" shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-2, 1.8, 2]} color={character.colors.primary} intensity={6} distance={5} />
      <pointLight position={[2.2, 1.2, -2.2]} color={character.colors.accent} intensity={4} distance={5} />
      <PreviewFloor color={character.colors.primary} />
      <PreviewFighter character={character} pose={pose} rotationTurn={rotationTurn} />
      <PreviewCamera zoom={zoom} />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom
        minDistance={2.25}
        maxDistance={6.2}
        minPolarAngle={Math.PI * 0.22}
        maxPolarAngle={Math.PI * 0.52}
        target={[0, 1, 0]}
        rotateSpeed={0.75}
        zoomSpeed={0.72}
      />
      <ContactShadows position={[0, -0.01, 0]} opacity={0.5} scale={5} blur={2.2} far={2.6} />
    </Canvas>
  );
}

function PreviewCamera({ zoom }: { zoom: number }) {
  const { camera } = useThree();
  const lastZoom = useRef(zoom);
  const active = useRef(true);
  useFrame((_, delta) => {
    if (lastZoom.current !== zoom) {
      lastZoom.current = zoom;
      active.current = true;
    }
    if (!active.current) return;
    const distance = THREE.MathUtils.lerp(5.2, 2.35, zoom);
    const desired = new THREE.Vector3(0, 1.45 + zoom * 0.28, distance);
    camera.position.lerp(desired, 1 - Math.pow(0.001, delta));
    camera.lookAt(0, 1.05, 0);
    if (camera.position.distanceTo(desired) < 0.01) active.current = false;
  });
  return null;
}

function PreviewFloor({ color }: { color: string }) {
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.55, 72]} />
        <meshStandardMaterial color="#181c22" roughness={0.72} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.24, 1.3, 72]} />
        <meshBasicMaterial color={color} transparent opacity={0.32} />
      </mesh>
    </group>
  );
}

function PreviewFighter({
  character,
  pose,
  rotationTurn
}: {
  character: CharacterDefinition;
  pose: PreviewPose;
  rotationTurn: number;
}) {
  const fighter = useRef(createPreviewFighter(character));
  const rotator = useRef<THREE.Group>(null);

  useEffect(() => {
    fighter.current = createPreviewFighter(character);
  }, [character]);

  useFrame((state, delta) => {
    const runtime = fighter.current;
    const t = state.clock.elapsedTime;
    runtime.character = character;
    runtime.facing = 1;
    runtime.position.x = 0;
    runtime.position.z = 0;
    runtime.blockFlash = pose === 'block' ? 0.7 : 0;
    runtime.hitFlash = pose === 'hit' ? 0.8 : 0;
    runtime.currentMove = null;
    runtime.actionTimer = 0;
    runtime.velocityY = 0;

    if (isMovePose(pose)) {
      const move = character.moves.find((candidate) => candidate.input === pose) ?? character.moves[0] ?? null;
      const total = move ? move.startup + move.active + move.recovery : 1;
      const phase = (t * 1.35) % 1;
      runtime.state = 'attack';
      runtime.currentMove = move;
      runtime.actionTimer = total * (1 - phase);
      runtime.position.y = 0;
    } else {
      runtime.state = pose;
      runtime.position.y = pose === 'jump' ? Math.abs(Math.sin(t * 2.4)) * 0.95 : 0;
    }

    if (rotator.current) {
      const target = rotationTurn * (Math.PI / 4);
      rotator.current.rotation.y = THREE.MathUtils.lerp(rotator.current.rotation.y, target, 1 - Math.pow(0.001, delta));
    }
  });

  return (
    <group ref={rotator} position={[0, 0, 0]}>
      <FighterRig fighter={fighter.current} />
    </group>
  );
}

function isMovePose(pose: PreviewPose): pose is MoveInput {
  return pose === 'jab' || pose === 'kick' || pose === 'heavy' || pose === 'special';
}

function createPreviewFighter(character: CharacterDefinition): FighterRuntime {
  return {
    slot: 1,
    character,
    hp: character.stats.health,
    position: { x: 0, y: 0, z: 0 },
    velocityY: 0,
    facing: 1,
    facingYaw: Math.PI / 2,
    state: 'idle',
    sidestepTimer: 0,
    sidestepDirection: 0,
    jumpInputHeld: false,
    currentMove: null,
    actionTimer: 0,
    hitConnected: false,
    roundsWon: 0,
    stunTimer: 0,
    blockFlash: 0,
    hitFlash: 0
  };
}

function CameraRig({ match }: { match: MatchSnapshot }) {
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, delta) => {
    const [p1, p2] = match.fighters;
    const midX = (p1.position.x + p2.position.x) / 2;
    const midZ = (p1.position.z + p2.position.z) / 2;
    const dx = p2.position.x - p1.position.x;
    const dz = p2.position.z - p1.position.z;
    const distance = Math.hypot(dx, dz);
    const lineLength = distance || 1;
    let cameraX = -dz / lineLength;
    let cameraZ = dx / lineLength;
    if (cameraZ < 0) {
      cameraX *= -1;
      cameraZ *= -1;
    }
    const shake = match.cameraShake * Math.sin(performance.now() * 0.055) * 0.18;
    const cameraDistance = 5.7 + distance * 0.34;
    const desired = new THREE.Vector3(midX + cameraX * cameraDistance + shake, 2.7 + distance * 0.16, midZ + cameraZ * cameraDistance);
    camera.position.lerp(desired, 1 - Math.pow(0.001, delta));
    target.set(midX, 1.05, midZ);
    camera.lookAt(target);
  });
  return null;
}

function Arena({ stage }: { stage: MatchSnapshot['stage'] }) {
  return (
    <group>
      {stage.worldModelPath && <WorldStage stage={stage} />}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[11.2, 8.2, 24, 18]} />
        <meshStandardMaterial color={stage.floor} roughness={0.74} metalness={0.16} transparent opacity={stage.worldModelPath ? 0.74 : 1} />
      </mesh>
      <mesh receiveShadow position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[10.2, 7.4, 22, 16]} />
        <meshStandardMaterial color={stage.floor} roughness={0.62} metalness={0.24} />
      </mesh>
      <gridHelper args={[10, 10, stage.rail, '#3a4048']} position={[0, 0.032, 0]} />
      {[-3.85, 3.85].map((z) => (
        <mesh key={z} position={[0, 0.22, z]} castShadow>
          <boxGeometry args={[10.4, 0.13, 0.13]} />
          <meshStandardMaterial color={stage.rail} emissive={stage.rail} emissiveIntensity={0.45} />
        </mesh>
      ))}
      {[-5.1, 5.1].map((x) => (
        <mesh key={x} position={[x, 0.22, 0]} castShadow>
          <boxGeometry args={[0.13, 0.13, 7.9]} />
          <meshStandardMaterial color={stage.rail} emissive={stage.rail} emissiveIntensity={0.28} />
        </mesh>
      ))}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.25, 3.7, 72]} />
        <meshBasicMaterial color={stage.rail} transparent opacity={0.18} />
      </mesh>
    </group>
  );
}

function WorldStage({ stage }: { stage: MatchSnapshot['stage'] }) {
  const gltf = useGLTF(stage.worldModelPath ?? '');
  const model = useMemo(() => {
    const scene = clone(gltf.scene);
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        object.frustumCulled = true;
      }
    });
    return scene;
  }, [gltf.scene]);
  const scale = stage.worldModelScale ?? 1;
  const position = stage.worldModelPosition ?? [0, 0, 0];
  const rotation = stage.worldModelRotation ?? [0, 0, 0];
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <primitive object={model} />
    </group>
  );
}

function FighterRig({ fighter }: { fighter: FighterRuntime }) {
  const group = useRef<THREE.Group>(null);
  const progress = activeMoveProgress(fighter);
  useFrame((state) => {
    if (!group.current) return;
    const bob = fighter.state === 'idle' ? Math.sin(state.clock.elapsedTime * 4 + fighter.slot) * 0.025 : 0;
    const hitLean = fighter.state === 'hit' ? -fighter.facing * 0.16 : 0;
    const attackLean = fighter.state === 'attack' ? fighter.facing * Math.sin(progress * Math.PI) * 0.2 : 0;
    group.current.position.set(fighter.position.x, fighter.position.y + bob, fighter.position.z);
    group.current.rotation.set(fighter.state === 'knockdown' ? -0.85 : 0, fighter.facingYaw, hitLean + attackLean);
  });

  const color = fighter.hitFlash > 0 ? '#ffffff' : fighter.blockFlash > 0 ? fighter.character.colors.accent : fighter.character.colors.primary;
  return (
    <group ref={group} scale={fighter.character.scale}>
      <Bounds fit={false}>
        {fighter.character.renderMode === 'spriteVoxel' || fighter.character.modelPath.startsWith('spritevoxel://') ? (
          fighter.character.voxelProfile === 'image-source' ? (
            <ImageVoxelFighter fighter={fighter} progress={progress} />
          ) : (
            <VoxelSpriteFighter fighter={fighter} progress={progress} />
          )
        ) : fighter.character.modelPath.startsWith('builtin://') ? (
          <ProceduralFighter fighter={fighter} color={color} progress={progress} />
        ) : (
          <ExternalFighter fighter={fighter} url={fighter.character.modelPath} progress={progress} />
        )}
      </Bounds>
    </group>
  );
}

type ImageVoxelPart = 'head' | 'torso' | 'leadArm' | 'rearArm' | 'leadLeg' | 'rearLeg';

type ImageVoxel = {
  part: ImageVoxelPart;
  position: [number, number, number];
  size: [number, number, number];
  color: string;
};

const imageVoxelCache = new Map<string, Promise<ImageVoxel[]>>();

function ImageVoxelFighter({ fighter, progress }: { fighter: FighterRuntime; progress: number }) {
  const root = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const leadArm = useRef<THREE.Group>(null);
  const rearArm = useRef<THREE.Group>(null);
  const leadLeg = useRef<THREE.Group>(null);
  const rearLeg = useRef<THREE.Group>(null);
  const activeFrameSrc = useRef(getImageVoxelFramePath(fighter, progress, 0));
  const [frameSrc, setFrameSrc] = useState(activeFrameSrc.current);
  const [voxels, setVoxels] = useState<ImageVoxel[]>([]);

  useEffect(() => {
    let canceled = false;
    if (!frameSrc) return undefined;
    getCachedImageVoxels(frameSrc).then((nextVoxels) => {
      if (!canceled) setVoxels(nextVoxels);
    });
    return () => {
      canceled = true;
    };
  }, [frameSrc]);

  const parts = useMemo(() => buildVoxelParts(voxels), [voxels]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const nextFrameSrc = getImageVoxelFramePath(fighter, progress, t);
    if (nextFrameSrc !== activeFrameSrc.current) {
      activeFrameSrc.current = nextFrameSrc;
      setFrameSrc(nextFrameSrc);
    }
    const moving = fighter.state === 'walk' || fighter.state === 'sidestep';
    const walk = moving ? Math.sin(t * 12) : 0;
    const attack = fighter.state === 'attack' ? Math.sin(progress * Math.PI) : 0;
    const block = fighter.state === 'block' ? 1 : 0;
    const crouch = fighter.state === 'crouch' ? 1 : 0;
    const hit = fighter.state === 'hit' ? fighter.hitFlash : 0;
    const jump = fighter.state === 'jump' ? 1 : 0;
    const smooth = 1 - Math.pow(0.001, delta);

    if (root.current) {
      root.current.position.y = THREE.MathUtils.lerp(root.current.position.y, crouch ? -0.28 : 0, smooth);
      root.current.scale.y = THREE.MathUtils.lerp(root.current.scale.y, crouch ? 0.84 : jump ? 1.04 : 1, smooth);
    }
    if (torso.current) {
      torso.current.rotation.x = THREE.MathUtils.lerp(torso.current.rotation.x, -block * 0.26 - crouch * 0.18 + hit * 0.2, smooth);
      torso.current.rotation.z = THREE.MathUtils.lerp(torso.current.rotation.z, attack * 0.11 * fighter.facing, smooth);
    }
    if (head.current) {
      head.current.position.y = THREE.MathUtils.lerp(
        head.current.position.y,
        parts.head.anchor[1] - crouch * 0.12 + Math.sin(t * 4) * 0.012,
        smooth
      );
      head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, hit * 0.2, smooth);
    }
    if (leadArm.current) {
      leadArm.current.rotation.x = THREE.MathUtils.lerp(leadArm.current.rotation.x, -attack * 0.95 - block * 0.62 + walk * 0.2, smooth);
      leadArm.current.rotation.z = THREE.MathUtils.lerp(leadArm.current.rotation.z, block * 0.32 + attack * 0.18, smooth);
      leadArm.current.position.z = THREE.MathUtils.lerp(leadArm.current.position.z, attack * 0.42 + block * 0.12, smooth);
    }
    if (rearArm.current) {
      rearArm.current.rotation.x = THREE.MathUtils.lerp(rearArm.current.rotation.x, attack * 0.26 - block * 0.5 - walk * 0.2, smooth);
      rearArm.current.rotation.z = THREE.MathUtils.lerp(rearArm.current.rotation.z, -block * 0.24, smooth);
      rearArm.current.position.z = THREE.MathUtils.lerp(rearArm.current.position.z, block * 0.1, smooth);
    }
    if (leadLeg.current) {
      leadLeg.current.rotation.x = THREE.MathUtils.lerp(leadLeg.current.rotation.x, walk * 0.34 + jump * 0.22 - crouch * 0.26, smooth);
    }
    if (rearLeg.current) {
      rearLeg.current.rotation.x = THREE.MathUtils.lerp(rearLeg.current.rotation.x, -walk * 0.34 - jump * 0.2 - crouch * 0.2, smooth);
    }
  });

  if (voxels.length === 0) {
    return <VoxelSpriteFighter fighter={fighter} progress={progress} />;
  }

  return (
    <group ref={root} rotation={[0, -Math.PI / 2, 0]}>
      <ImageVoxelPartGroup part={parts.head} groupRef={head} />
      <ImageVoxelPartGroup part={parts.torso} groupRef={torso} />
      <ImageVoxelPartGroup part={parts.leadArm} groupRef={leadArm} />
      <ImageVoxelPartGroup part={parts.rearArm} groupRef={rearArm} />
      <ImageVoxelPartGroup part={parts.leadLeg} groupRef={leadLeg} />
      <ImageVoxelPartGroup part={parts.rearLeg} groupRef={rearLeg} />
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.32, 0.38, 32]} />
        <meshBasicMaterial color={fighter.character.colors.accent} transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

function getCachedImageVoxels(src: string): Promise<ImageVoxel[]> {
  const cached = imageVoxelCache.get(src);
  if (cached) return cached;
  const request = loadImageVoxels(src);
  imageVoxelCache.set(src, request);
  return request;
}

function getImageVoxelFramePath(fighter: FighterRuntime, progress: number, elapsedTime: number) {
  const frames = fighter.character.animationFrames;
  if (!frames) return fighter.character.spriteSheetPath;
  const key = getImageVoxelAnimationKey(fighter);
  const sequence = frames[key] ?? frames.idle;
  if (!sequence?.length) return fighter.character.spriteSheetPath;
  const fps = fighter.character.animationFps ?? 8;
  const frameIndex =
    fighter.state === 'attack'
      ? Math.min(sequence.length - 1, Math.floor(progress * sequence.length))
      : key === 'idle' || key === 'crouch' || key === 'block' || key === 'hitLight' || key === 'hitHeavy' || key === 'win' || key === 'lose'
        ? 0
      : Math.floor(elapsedTime * fps) % sequence.length;
  return sequence[frameIndex];
}

function getImageVoxelAnimationKey(fighter: FighterRuntime) {
  if (fighter.state === 'attack') return fighter.currentMove?.input ?? 'jab';
  if (fighter.state === 'walk') return fighter.facing === 1 ? 'walkForward' : 'walkBack';
  if (fighter.state === 'sidestep') return fighter.sidestepDirection < 0 ? 'sidestepLeft' : 'sidestepRight';
  if (fighter.state === 'hit') return fighter.hitFlash > 0.45 ? 'hitHeavy' : 'hitLight';
  return fighter.state;
}

function ImageVoxelPartGroup({
  part,
  groupRef
}: {
  part: { anchor: [number, number, number]; voxels: ImageVoxel[] };
  groupRef: React.RefObject<THREE.Group>;
}) {
  const mesh = useMemo(() => buildInstancedVoxelMesh(part), [part]);

  useEffect(() => {
    return () => {
      mesh?.geometry.dispose();
      const material = mesh?.material;
      if (Array.isArray(material)) {
        material.forEach((entry) => entry.dispose());
      } else {
        material?.dispose();
      }
    };
  }, [mesh]);

  return (
    <group ref={groupRef} position={part.anchor}>
      {mesh && <primitive object={mesh} />}
    </group>
  );
}

function buildInstancedVoxelMesh(part: { anchor: [number, number, number]; voxels: ImageVoxel[] }) {
  if (part.voxels.length === 0) return null;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.56,
    metalness: 0.06,
    vertexColors: true
  });
  const mesh = new THREE.InstancedMesh(geometry, material, part.voxels.length);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const color = new THREE.Color();

  part.voxels.forEach((voxel, index) => {
    position.set(voxel.position[0] - part.anchor[0], voxel.position[1] - part.anchor[1], voxel.position[2] - part.anchor[2]);
    scale.set(voxel.size[0], voxel.size[1], voxel.size[2]);
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, color.set(voxel.color));
  });

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function buildVoxelParts(voxels: ImageVoxel[]) {
  const partNames: ImageVoxelPart[] = ['head', 'torso', 'leadArm', 'rearArm', 'leadLeg', 'rearLeg'];
  return Object.fromEntries(
    partNames.map((part) => {
      const partVoxels = voxels.filter((voxel) => voxel.part === part);
      return [part, { anchor: getPartAnchor(part, partVoxels), voxels: partVoxels }];
    })
  ) as Record<ImageVoxelPart, { anchor: [number, number, number]; voxels: ImageVoxel[] }>;
}

function getPartAnchor(part: ImageVoxelPart, voxels: ImageVoxel[]): [number, number, number] {
  const fallback: Record<ImageVoxelPart, [number, number, number]> = {
    head: [0, 1.55, 0],
    torso: [0, 1.08, 0],
    leadArm: [0.5, 1.1, 0],
    rearArm: [-0.5, 1.1, 0],
    leadLeg: [0.17, 0.48, 0],
    rearLeg: [-0.17, 0.48, 0]
  };
  if (voxels.length === 0) return fallback[part];
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const voxel of voxels) {
    min.min(new THREE.Vector3(...voxel.position));
    max.max(new THREE.Vector3(...voxel.position));
  }
  return [(min.x + max.x) / 2, (min.y + max.y) / 2, 0];
}

async function extractImageVoxels(src: string): Promise<ImageVoxel[]> {
  const image = new Image();
  image.src = src;
  await image.decode();

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return [];
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const background = averageCornerColor(imageData);
  const bounds = getForegroundBounds(imageData, background);
  if (!bounds) return [];

  const bboxWidth = bounds.maxX - bounds.minX + 1;
  const bboxHeight = bounds.maxY - bounds.minY + 1;
  const rows = 24;
  const columns = Math.max(18, Math.min(26, Math.round(rows * (bboxWidth / bboxHeight))));
  const aspect = bboxWidth / bboxHeight;
  const maxModelWidth = 2.65;
  const modelHeight = Math.min(2.05, maxModelWidth / aspect);
  const modelWidth = modelHeight * aspect;
  const cellWidth = modelWidth / columns;
  const cellHeight = modelHeight / rows;
  const voxels: ImageVoxel[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const sample = sampleCell(imageData, bounds, background, column, row, columns, rows);
      if (!sample) continue;
      const x = ((column + 0.5) / columns) * modelWidth - modelWidth / 2;
      const y = modelHeight - (row + 0.5) * cellHeight + 0.02;
      const topRatio = row / rows;
      const xRatio = (column + 0.5) / columns - 0.5;
      const depth = 0.1 + sample.foregroundRatio * 0.08;
      voxels.push({
        part: classifyImageVoxel(topRatio, xRatio),
        position: [x, y, sample.brightness > 150 ? 0.02 : -0.01],
        size: [cellWidth * 0.96, cellHeight * 0.96, depth],
        color: sample.color
      });
    }
  }

  return voxels;
}

async function loadPrecomputedImageVoxels(src: string) {
  const path = getPrecomputedVoxelPath(src);
  if (!path) return null;
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    return (await response.json()) as ImageVoxel[];
  } catch {
    return null;
  }
}

function getPrecomputedVoxelPath(src: string) {
  const match = src.match(/^(\/characters\/[\w-]+)\/frames\/(frame-\d+)\.png$/);
  if (!match) return null;
  return `${match[1]}/voxels/${match[2]}.json`;
}

async function loadImageVoxels(src: string) {
  return (await loadPrecomputedImageVoxels(src)) ?? extractImageVoxels(src);
}

function getForegroundBounds(imageData: ImageData, background: [number, number, number]) {
  const { width, height, data } = imageData;
  const bounds = { minX: width, minY: height, maxX: 0, maxY: 0 };
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const offset = (y * width + x) * 4;
      if (!isForegroundPixel(data[offset], data[offset + 1], data[offset + 2], data[offset + 3], background)) continue;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  if (bounds.minX >= bounds.maxX || bounds.minY >= bounds.maxY) return null;
  const padX = Math.round((bounds.maxX - bounds.minX) * 0.02);
  const padY = Math.round((bounds.maxY - bounds.minY) * 0.02);
  return {
    minX: Math.max(0, bounds.minX - padX),
    minY: Math.max(0, bounds.minY - padY),
    maxX: Math.min(width - 1, bounds.maxX + padX),
    maxY: Math.min(height - 1, bounds.maxY + padY)
  };
}

function averageCornerColor(imageData: ImageData): [number, number, number] {
  const { width, height, data } = imageData;
  const points = [
    [2, 2],
    [width - 3, 2],
    [2, height - 3],
    [width - 3, height - 3]
  ];
  const total = points.reduce(
    (sum, [x, y]) => {
      const offset = (y * width + x) * 4;
      return [sum[0] + data[offset], sum[1] + data[offset + 1], sum[2] + data[offset + 2]];
    },
    [0, 0, 0]
  );
  return [total[0] / points.length, total[1] / points.length, total[2] / points.length];
}

function sampleCell(
  imageData: ImageData,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  background: [number, number, number],
  column: number,
  row: number,
  columns: number,
  rows: number
) {
  const { width, data } = imageData;
  const cellMinX = Math.floor(bounds.minX + ((bounds.maxX - bounds.minX) * column) / columns);
  const cellMaxX = Math.floor(bounds.minX + ((bounds.maxX - bounds.minX) * (column + 1)) / columns);
  const cellMinY = Math.floor(bounds.minY + ((bounds.maxY - bounds.minY) * row) / rows);
  const cellMaxY = Math.floor(bounds.minY + ((bounds.maxY - bounds.minY) * (row + 1)) / rows);
  let foreground = 0;
  let samples = 0;
  let red = 0;
  let green = 0;
  let blue = 0;

  for (let y = cellMinY; y <= cellMaxY; y += Math.max(1, Math.floor((cellMaxY - cellMinY) / 4))) {
    for (let x = cellMinX; x <= cellMaxX; x += Math.max(1, Math.floor((cellMaxX - cellMinX) / 4))) {
      const offset = (y * width + x) * 4;
      samples += 1;
      if (!isForegroundPixel(data[offset], data[offset + 1], data[offset + 2], data[offset + 3], background)) continue;
      foreground += 1;
      red += data[offset];
      green += data[offset + 1];
      blue += data[offset + 2];
    }
  }

  const foregroundRatio = samples > 0 ? foreground / samples : 0;
  if (foregroundRatio < 0.22 || foreground === 0) return null;
  const color = quantizeColor(red / foreground, green / foreground, blue / foreground);
  return {
    color,
    brightness: (red + green + blue) / foreground / 3,
    foregroundRatio
  };
}

function isForegroundPixel(red: number, green: number, blue: number, alpha: number, background: [number, number, number]) {
  if (alpha < 24) return false;
  const blueScreen = blue > 165 && blue > red * 1.7 && blue > green * 1.2;
  if (blueScreen) return false;
  const distance = Math.hypot(red - background[0], green - background[1], blue - background[2]);
  return distance > 72;
}

function quantizeColor(red: number, green: number, blue: number) {
  const snap = (value: number) => Math.max(0, Math.min(255, Math.round(value / 17) * 17));
  return `#${[snap(red), snap(green), snap(blue)].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function classifyImageVoxel(topRatio: number, xRatio: number): ImageVoxelPart {
  if (topRatio < 0.29) return 'head';
  if (topRatio > 0.58) return xRatio >= 0 ? 'leadLeg' : 'rearLeg';
  if (Math.abs(xRatio) > 0.26) return xRatio >= 0 ? 'leadArm' : 'rearArm';
  return 'torso';
}

function VoxelSpriteFighter({ fighter, progress }: { fighter: FighterRuntime; progress: number }) {
  const root = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const leadArm = useRef<THREE.Group>(null);
  const rearArm = useRef<THREE.Group>(null);
  const leadLeg = useRef<THREE.Group>(null);
  const rearLeg = useRef<THREE.Group>(null);
  const palette = getVoxelPalette(fighter.character);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const moving = fighter.state === 'walk' || fighter.state === 'sidestep';
    const walk = moving ? Math.sin(t * 12) : 0;
    const attack = fighter.state === 'attack' ? Math.sin(progress * Math.PI) : 0;
    const block = fighter.state === 'block' ? 1 : 0;
    const crouch = fighter.state === 'crouch' ? 1 : 0;
    const hit = fighter.state === 'hit' ? fighter.hitFlash : 0;
    const jump = fighter.state === 'jump' ? 1 : 0;

    const smooth = 1 - Math.pow(0.001, delta);
    if (root.current) {
      root.current.position.y = THREE.MathUtils.lerp(root.current.position.y, crouch ? -0.28 : 0, smooth);
      root.current.scale.y = THREE.MathUtils.lerp(root.current.scale.y, crouch ? 0.84 : jump ? 1.04 : 1, smooth);
    }
    if (torso.current) {
      torso.current.rotation.x = THREE.MathUtils.lerp(torso.current.rotation.x, -block * 0.28 - crouch * 0.18 + hit * 0.2, smooth);
      torso.current.rotation.z = THREE.MathUtils.lerp(torso.current.rotation.z, attack * 0.12 * fighter.facing, smooth);
    }
    if (head.current) {
      head.current.position.y = THREE.MathUtils.lerp(head.current.position.y, 1.63 - crouch * 0.12 + Math.sin(t * 4) * 0.012, smooth);
      head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, hit * 0.2, smooth);
    }
    if (leadArm.current) {
      leadArm.current.position.z = THREE.MathUtils.lerp(leadArm.current.position.z, 0.08 + attack * 0.52 + block * 0.18, smooth);
      leadArm.current.rotation.x = THREE.MathUtils.lerp(leadArm.current.rotation.x, -0.2 - attack * 1.25 - block * 0.78 + walk * 0.22, smooth);
      leadArm.current.rotation.z = THREE.MathUtils.lerp(leadArm.current.rotation.z, 0.18 + block * 0.32, smooth);
    }
    if (rearArm.current) {
      rearArm.current.position.z = THREE.MathUtils.lerp(rearArm.current.position.z, -0.06 + block * 0.16, smooth);
      rearArm.current.rotation.x = THREE.MathUtils.lerp(rearArm.current.rotation.x, 0.1 + attack * 0.35 - walk * 0.2 - block * 0.62, smooth);
      rearArm.current.rotation.z = THREE.MathUtils.lerp(rearArm.current.rotation.z, -0.12 - block * 0.24, smooth);
    }
    if (leadLeg.current) {
      leadLeg.current.rotation.x = THREE.MathUtils.lerp(leadLeg.current.rotation.x, walk * 0.42 + jump * 0.28 - crouch * 0.3, smooth);
    }
    if (rearLeg.current) {
      rearLeg.current.rotation.x = THREE.MathUtils.lerp(rearLeg.current.rotation.x, -walk * 0.42 - jump * 0.24 - crouch * 0.24, smooth);
    }
  });

  return (
    <group ref={root}>
      <group ref={head} position={[0, 1.63, 0]}>
        <VoxelBox position={[0, 0, 0]} size={[0.36, 0.28, 0.3]} color={palette.skin} />
        <VoxelBox position={[0, 0.18, -0.02]} size={[0.44, 0.16, 0.34]} color={palette.hair} />
        <VoxelBox position={[0, 0.07, 0.17]} size={[0.42, 0.06, 0.04]} color={palette.headband} />
        <VoxelBox position={[-0.24, 0.12, 0]} size={[0.08, 0.08, 0.22]} color={palette.hair} />
        <VoxelBox position={[0.24, 0.12, 0]} size={[0.08, 0.08, 0.22]} color={palette.hair} />
      </group>
      <group ref={torso} position={[0, 1.12, 0]}>
        <VoxelBox position={[0, 0.08, 0]} size={[0.5, 0.46, 0.32]} color={palette.jacket} />
        <VoxelBox position={[0, 0.12, 0.18]} size={[0.42, 0.12, 0.04]} color={palette.trim} />
        <VoxelBox position={[0, -0.2, 0]} size={[0.42, 0.16, 0.3]} color={palette.belt} />
        <VoxelBox position={[0, 0.34, 0]} size={[0.56, 0.1, 0.34]} color={palette.shoulder} />
      </group>
      <group ref={leadArm} position={[0.34, 1.24, 0.08]}>
        <VoxelBox position={[0, -0.16, 0]} size={[0.16, 0.34, 0.16]} color={palette.sleeve} />
        <VoxelBox position={[0, -0.42, 0.02]} size={[0.14, 0.3, 0.14]} color={palette.skin} />
        <VoxelBox position={[0, -0.6, 0.05]} size={[0.16, 0.1, 0.16]} color={palette.glove} />
      </group>
      <group ref={rearArm} position={[-0.34, 1.22, -0.06]}>
        <VoxelBox position={[0, -0.16, 0]} size={[0.16, 0.34, 0.16]} color={palette.sleeve} />
        <VoxelBox position={[0, -0.42, 0]} size={[0.14, 0.3, 0.14]} color={palette.skin} />
        <VoxelBox position={[0, -0.6, 0.02]} size={[0.16, 0.1, 0.16]} color={palette.glove} />
      </group>
      <group ref={leadLeg} position={[0.16, 0.78, 0.04]}>
        <VoxelBox position={[0, -0.24, 0]} size={[0.18, 0.5, 0.18]} color={palette.pants} />
        <VoxelBox position={[0.02, -0.56, 0.08]} size={[0.22, 0.12, 0.28]} color={palette.boot} />
      </group>
      <group ref={rearLeg} position={[-0.16, 0.78, -0.04]}>
        <VoxelBox position={[0, -0.24, 0]} size={[0.18, 0.5, 0.18]} color={palette.pants} />
        <VoxelBox position={[-0.02, -0.56, 0.06]} size={[0.22, 0.12, 0.28]} color={palette.boot} />
      </group>
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.32, 0.38, 32]} />
        <meshBasicMaterial color={palette.energy} transparent opacity={0.32} />
      </mesh>
    </group>
  );
}

function VoxelBox({ position, size, color }: { position: [number, number, number]; size: [number, number, number]; color: string }) {
  return (
    <mesh castShadow receiveShadow position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.56} metalness={0.06} />
    </mesh>
  );
}

function getVoxelPalette(character: CharacterDefinition) {
  if (character.voxelProfile === 'shinobi-blue') {
    return {
      skin: '#e8c7ad',
      hair: '#11131b',
      headband: '#d9e3ff',
      jacket: '#3157ff',
      shoulder: '#1d2f90',
      sleeve: '#1b1d26',
      trim: '#d9e3ff',
      belt: '#11131b',
      pants: '#1b1d26',
      boot: '#d9e3ff',
      glove: '#10131d',
      energy: '#9b5cff'
    };
  }
  return {
    skin: '#f2c7a0',
    hair: '#ffd447',
    headband: '#f7f7f2',
    jacket: '#ff8a1f',
    shoulder: '#cc5d12',
    sleeve: '#f2c7a0',
    trim: '#202dff',
    belt: '#202dff',
    pants: '#202dff',
    boot: '#f7f7f2',
    glove: '#f7f7f2',
    energy: '#2ee6ff'
  };
}

function ExternalFighter({ fighter, url, progress }: { fighter: FighterRuntime; url: string; progress: number }) {
  const gltf = useGLTF(url);
  const model = useMemo(() => clone(gltf.scene), [gltf.scene]);
  const wrapper = useRef<THREE.Group>(null);
  const { actions, names } = useAnimations(gltf.animations, model);
  const desiredClip = chooseClip(names, fighter);

  useEffect(() => {
    if (!desiredClip) return;
    for (const [name, action] of Object.entries(actions)) {
      if (!action) continue;
      if (name === desiredClip) {
        action.reset().fadeIn(0.12).play();
      } else {
        action.fadeOut(0.12);
      }
    }
  }, [actions, desiredClip]);

  useFrame((_, delta) => {
    if (!wrapper.current) return;
    const attack = fighter.state === 'attack' ? Math.sin(progress * Math.PI) : 0;
    const hit = fighter.state === 'hit' ? fighter.hitFlash : 0;
    const block = fighter.state === 'block' ? 1 : 0;
    const crouch = fighter.state === 'crouch' ? 1 : 0;
    const knockdown = fighter.state === 'knockdown' ? 1 : 0;
    wrapper.current.rotation.x = THREE.MathUtils.lerp(wrapper.current.rotation.x, knockdown * -0.85 + block * -0.18 + crouch * -0.28 + hit * 0.18, 1 - Math.pow(0.001, delta));
    wrapper.current.rotation.z = THREE.MathUtils.lerp(wrapper.current.rotation.z, attack * 0.22 * fighter.facing - hit * 0.12 * fighter.facing, 1 - Math.pow(0.001, delta));
    wrapper.current.position.y = THREE.MathUtils.lerp(wrapper.current.position.y, crouch ? -0.22 : block ? -0.06 : 0, 1 - Math.pow(0.001, delta));
  });

  return (
    <group ref={wrapper}>
      <primitive object={model} />
    </group>
  );
}

function chooseClip(names: string[], fighter: FighterRuntime) {
  if (names.length === 0) return null;
  const normalized = names.map((name) => ({ name, key: name.toLowerCase() }));
  const find = (...needles: string[]) =>
    normalized.find((clip) => needles.some((needle) => clip.key.includes(needle)))?.name;
  if (fighter.state === 'attack') return find('punch', 'attack', 'wave') ?? names[0];
  if (fighter.state === 'walk' || fighter.state === 'sidestep') return find('walk', 'run', 'animation') ?? names[0];
  if (fighter.state === 'jump') return find('jump', 'walk', 'run', 'idle') ?? names[0];
  if (fighter.state === 'crouch') return find('crouch', 'idle', 'standing') ?? names[0];
  if (fighter.state === 'block') return find('idle', 'standing') ?? names[0];
  if (fighter.state === 'hit' || fighter.state === 'knockdown') return find('death', 'no', 'idle') ?? names[0];
  if (fighter.state === 'win') return find('dance', 'yes', 'wave') ?? names[0];
  if (fighter.state === 'lose') return find('death', 'no') ?? names[0];
  return find('idle', 'standing') ?? names[0];
}

function ProceduralFighter({
  fighter,
  color,
  progress
}: {
  fighter: FighterRuntime;
  color: string;
  progress: number;
}) {
  const root = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Mesh>(null);
  const head = useRef<THREE.Mesh>(null);
  const leadArm = useRef<THREE.Group>(null);
  const rearArm = useRef<THREE.Group>(null);
  const leadLeg = useRef<THREE.Group>(null);
  const rearLeg = useRef<THREE.Group>(null);
  const secondary = fighter.character.colors.secondary;
  const accent = fighter.character.colors.accent;
  const bulk = fighter.character.id === 'dax' ? 1.12 : 0.95;

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const moving = fighter.state === 'walk' || fighter.state === 'sidestep';
    const walk = moving ? Math.sin(t * 11) : 0;
    const side = fighter.state === 'sidestep' ? Math.sin(t * 13) * 0.16 : 0;
    const attack = fighter.state === 'attack' ? Math.sin(progress * Math.PI) : 0;
    const block = fighter.state === 'block' ? 1 : 0;
    const hit = fighter.state === 'hit' ? fighter.hitFlash : 0;
    const crouch = fighter.state === 'crouch' ? -0.3 : block ? -0.12 : 0;
    const jump = fighter.state === 'jump' ? 1 : 0;

    if (root.current) {
      root.current.position.y = THREE.MathUtils.lerp(root.current.position.y, crouch, 1 - Math.pow(0.001, delta));
    }
    if (torso.current) {
      torso.current.rotation.x = THREE.MathUtils.lerp(torso.current.rotation.x, block * -0.32 - jump * 0.16 + hit * 0.22, 0.35);
      torso.current.rotation.z = THREE.MathUtils.lerp(torso.current.rotation.z, side + attack * 0.1, 0.32);
    }
    if (head.current) {
      head.current.position.y = 1.72 + Math.sin(t * 4 + fighter.slot) * 0.018;
      head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, hit * 0.24, 0.28);
    }
    if (leadArm.current) {
      leadArm.current.position.z = 0.06 + attack * 0.52 + block * 0.16;
      leadArm.current.position.y = 1.28 - block * 0.08;
      leadArm.current.rotation.x = -0.18 - attack * 1.35 - block * 0.86 + walk * 0.22;
      leadArm.current.rotation.z = 0.18 + block * 0.36;
    }
    if (rearArm.current) {
      rearArm.current.position.z = -0.04 + block * 0.14;
      rearArm.current.position.y = 1.23 - block * 0.04;
      rearArm.current.rotation.x = 0.12 + attack * 0.38 - walk * 0.2 - block * 0.7;
      rearArm.current.rotation.z = -0.12 - block * 0.28;
    }
    if (leadLeg.current) {
      leadLeg.current.rotation.x = walk * 0.34 + side * 0.5 + jump * 0.28;
      leadLeg.current.rotation.z = side * 0.3;
    }
    if (rearLeg.current) {
      rearLeg.current.rotation.x = -walk * 0.34 - side * 0.5 - jump * 0.28;
      rearLeg.current.rotation.z = -side * 0.3;
    }
  });

  return (
    <group ref={root}>
      <mesh ref={head} castShadow position={[0, 1.72, 0]}>
        <sphereGeometry args={[0.24 * bulk, 20, 16]} />
        <meshStandardMaterial color={color} roughness={0.48} metalness={0.2} emissive={color} emissiveIntensity={0.08} />
      </mesh>
      <mesh ref={torso} castShadow position={[0, 1.22, 0]}>
        <capsuleGeometry args={[0.28 * bulk, 0.72, 8, 18]} />
        <meshStandardMaterial color={secondary} roughness={0.62} metalness={0.28} />
      </mesh>
      <group ref={leadArm} position={[0.23, 1.22, 0.08]}>
        <mesh castShadow position={[0, -0.22, 0]}>
          <capsuleGeometry args={[0.07, 0.62, 6, 12]} />
          <meshStandardMaterial color={accent} roughness={0.5} />
        </mesh>
      </group>
      <group ref={rearArm} position={[-0.23, 1.22, -0.05]}>
        <mesh castShadow position={[0, -0.2, 0]}>
          <capsuleGeometry args={[0.07, 0.58, 6, 12]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      </group>
      <group ref={leadLeg} position={[0.15, 0.78, 0.04]}>
        <mesh castShadow position={[0, -0.3, 0]}>
          <capsuleGeometry args={[0.09, 0.76, 6, 12]} />
          <meshStandardMaterial color={color} roughness={0.54} />
        </mesh>
      </group>
      <group ref={rearLeg} position={[-0.15, 0.78, -0.04]}>
        <mesh castShadow position={[0, -0.3, 0]}>
          <capsuleGeometry args={[0.09, 0.76, 6, 12]} />
          <meshStandardMaterial color={accent} roughness={0.54} />
        </mesh>
      </group>
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.32, 0.38, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

import { Bounds, ContactShadows, Environment, OrbitControls, useAnimations, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useLoader, useThree, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CharacterDefinition, FighterRuntime, FighterState, GameSettings, MatchSnapshot, MoveInput, StageDefinition, StageLayerDefinition, StagePropDefinition } from '../types';
import { activeMoveProgress } from '../engine/fightEngine';
import { debugLogThrottled } from '../lib/debugLogger';

type GameSceneProps = {
  match: MatchSnapshot;
  cameraSettings?: GameSettings['camera'];
};

const defaultCameraSettings: GameSettings['camera'] = {
  distance: 1,
  height: 1,
  smoothing: 1,
  zoomBias: 1
};

const DEFAULT_SKYBOX_PATH = '/stages/shared/default-skybox.png';

export type PreviewPose = Exclude<FighterState, 'attack'> | MoveInput;

export function GameScene({ match, cameraSettings = defaultCameraSettings }: GameSceneProps) {
  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0, 3.3, 6.8], fov: 46 }} data-testid="fight-canvas">
      <color attach="background" args={['#8deeff']} />
      <fog attach="fog" args={['#a7f0ff', 34, 145]} />
      <Suspense fallback={null}>
        <Environment preset="city" />
      </Suspense>
      <DefaultSkybox imagePath={match.stage.skyboxPath ?? DEFAULT_SKYBOX_PATH} />
      <ambientLight intensity={0.55} />
      <directionalLight castShadow position={[3, 6, 4]} intensity={1.8} color={match.stage.light} shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-4, 2, -3]} color={match.fighters[0].character.colors.primary} intensity={8} distance={7} />
      <pointLight position={[4, 2, 3]} color={match.fighters[1].character.colors.primary} intensity={8} distance={7} />
      <CameraRig match={match} settings={cameraSettings} />
      <Arena stage={match.stage} />
      <FighterRig fighter={match.fighters[0]} />
      <FighterRig fighter={match.fighters[1]} />
      <ContactShadows position={[0, -0.01, 0]} opacity={0.45} scale={18} blur={2.4} far={3} />
    </Canvas>
  );
}

type StagePreviewCanvasProps = {
  stage: StageDefinition;
  interactive?: boolean;
  selectedPropId?: string;
  onSelectProp?: (propId: string) => void;
};

export function StagePreviewCanvas({ stage, interactive = false, selectedPropId, onSelectProp }: StagePreviewCanvasProps) {
  return (
    <Canvas
      shadows
      frameloop={interactive ? 'always' : 'demand'}
      dpr={[1, 1.25]}
      camera={{ position: [0, 7.4, 12.4], fov: 38 }}
      data-testid={`stage-preview-canvas-${stage.id}`}
      aria-label={`${stage.name} stage preview`}
    >
      <color attach="background" args={['#8deeff']} />
      <fog attach="fog" args={['#a7f0ff', 30, 145]} />
      <DefaultSkybox imagePath={stage.skyboxPath ?? DEFAULT_SKYBOX_PATH} />
      <ambientLight intensity={0.58} color="#dbe8ff" />
      <directionalLight castShadow position={[4, 8, 5]} intensity={1.9} color={stage.light} shadow-mapSize={[512, 512]} />
      <pointLight position={[-5, 2.2, 3]} color={stage.rail} intensity={5.2} distance={9} />
      <StagePreviewCamera />
      <group position={[0, -0.05, 0]} scale={0.82}>
        <Arena stage={stage} selectedPropId={selectedPropId} onSelectProp={onSelectProp} />
      </group>
      {interactive && (
        <OrbitControls
          makeDefault
          enableDamping
          enablePan
          enableRotate
          enableZoom
          minDistance={5}
          maxDistance={32}
          target={[0, 0.8, -2.4]}
        />
      )}
    </Canvas>
  );
}

function StagePreviewCamera() {
  const { camera, invalidate } = useThree();
  useEffect(() => {
    camera.lookAt(0, 0.2, -0.8);
    invalidate();
  }, [camera, invalidate]);
  return null;
}

function DefaultSkybox({ imagePath }: { imagePath: string }) {
  const texture = useLoader(THREE.TextureLoader, imagePath);
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(1, 1);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;
  }, [texture]);

  return (
    <mesh scale={[1, 0.72, 1]} rotation={[0, Math.PI, 0]} renderOrder={-1000}>
      <sphereGeometry args={[190, 64, 32]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} depthWrite={false} depthTest={false} toneMapped={false} fog={false} />
    </mesh>
  );
}

export function MenuAttractScene({ match }: GameSceneProps) {
  return (
    <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 2.55, 7.8], fov: 42 }} data-testid="menu-attract-canvas">
      <color attach="background" args={['#020615']} />
      <fog attach="fog" args={['#071337', 8, 24]} />
      <ambientLight intensity={0.42} color="#a9c7ff" />
      <directionalLight castShadow position={[-3, 6, 3]} intensity={1.65} color="#dbe8ff" shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-3.3, 1.6, 2.1]} color={match.fighters[0].character.colors.primary} intensity={5.2} distance={6} />
      <pointLight position={[3.3, 1.6, 2.1]} color={match.fighters[1].character.colors.primary} intensity={5.2} distance={6} />
      <MenuAttractCamera match={match} />
      <MenuMoonStage />
      <group position={[0, 0, 1.75]} scale={0.82}>
        <FighterRig fighter={match.fighters[0]} />
        <FighterRig fighter={match.fighters[1]} />
      </group>
      <ContactShadows position={[0, -0.01, 1.75]} opacity={0.32} scale={10} blur={3} far={3.5} />
    </Canvas>
  );
}

function MenuAttractCamera({ match }: { match: MatchSnapshot }) {
  const { camera, size } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, delta) => {
    const [p1, p2] = match.fighters;
    const midX = (p1.position.x + p2.position.x) / 2;
    const midZ = (p1.position.z + p2.position.z) / 2 + 1.75;
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
    const perspective = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const verticalFov = THREE.MathUtils.degToRad(perspective.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
    const horizontalFit = (distance * 0.5 + 1.25) / Math.tan(horizontalFov / 2);
    const verticalFit = (2.2 + Math.max(p1.position.y, p2.position.y) * 0.45) / Math.tan(verticalFov / 2);
    const cameraDistance = THREE.MathUtils.clamp(Math.max(horizontalFit, verticalFit, 6.4), 6.4, 13.5);
    const height = THREE.MathUtils.clamp(2.25 + cameraDistance * 0.08 + Math.max(p1.position.y, p2.position.y) * 0.18, 2.35, 3.75);
    const drift = Math.sin(state.clock.elapsedTime * 0.18) * 0.22;
    const desired = new THREE.Vector3(midX + cameraX * cameraDistance + drift, height, midZ + cameraZ * cameraDistance);
    camera.position.lerp(desired, 1 - Math.pow(0.00001, delta));
    target.set(midX, 0.95 + Math.max(p1.position.y, p2.position.y) * 0.14, midZ);
    camera.lookAt(target);
  });
  return null;
}

function MenuMoonStage() {
  const silhouettes = useMemo(
    () => [
      [-5.5, 0.04, -4.6, 1.4, 1.15],
      [-4.1, 0.04, -4.9, 1.8, 0.88],
      [-2.5, 0.04, -4.7, 1.1, 1.32],
      [2.1, 0.04, -4.8, 1.55, 1.05],
      [3.9, 0.04, -4.6, 1.2, 1.28],
      [5.2, 0.04, -4.9, 1.7, 0.92]
    ],
    []
  );
  return (
    <group>
      <mesh position={[0, 3.9, -6.7]}>
        <circleGeometry args={[1.55, 72]} />
        <meshBasicMaterial color="#f1f5ff" transparent opacity={0.92} />
      </mesh>
      <mesh position={[0, 3.9, -6.72]}>
        <ringGeometry args={[1.55, 1.9, 72]} />
        <meshBasicMaterial color="#7db8ff" transparent opacity={0.18} />
      </mesh>
      {silhouettes.map(([x, y, z, width, height], index) => (
        <mesh key={index} position={[x, y + height / 2, z]}>
          <coneGeometry args={[width, height, 3]} />
          <meshBasicMaterial color="#030712" transparent opacity={0.78} />
        </mesh>
      ))}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.035, 1.1]}>
        <planeGeometry args={[18, 10, 28, 20]} />
        <meshStandardMaterial color="#07182c" roughness={0.22} metalness={0.68} transparent opacity={0.92} />
      </mesh>
      <mesh position={[0, -0.018, 1.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.25, 3.7, 96]} />
        <meshBasicMaterial color="#2ee6ff" transparent opacity={0.22} />
      </mesh>
      <mesh position={[0, -0.012, 1.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.25, 96]} />
        <meshStandardMaterial color="#0d2140" emissive="#0a2c5a" emissiveIntensity={0.35} roughness={0.34} metalness={0.35} transparent opacity={0.55} />
      </mesh>
      <gridHelper args={[12, 12, '#2ee6ff', '#14345d']} position={[0, 0.004, 1.1]} />
    </group>
  );
}

export function CharacterPreviewCanvas({
  character,
  pose,
  animationKey,
  rotationTurn,
  zoom
}: {
  character: CharacterDefinition;
  pose: PreviewPose;
  animationKey?: string;
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
      <ambientLight intensity={1.05} />
      <directionalLight castShadow position={[2.8, 4.6, 3.4]} intensity={2.65} color="#f7f7f2" shadow-mapSize={[1024, 1024]} />
      <pointLight position={[0, 2.4, 3.2]} color="#ffffff" intensity={5} distance={6} />
      <pointLight position={[-2, 1.8, 2]} color={character.colors.primary} intensity={6} distance={5} />
      <pointLight position={[2.2, 1.2, -2.2]} color={character.colors.accent} intensity={4} distance={5} />
      <PreviewFloor color={character.colors.primary} />
      <PreviewFighter key={character.id} character={character} pose={pose} animationKey={animationKey} rotationTurn={rotationTurn} />
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
  animationKey,
  rotationTurn
}: {
  character: CharacterDefinition;
  pose: PreviewPose;
  animationKey?: string;
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
    runtime.previewAnimationKey = animationKey;
    runtime.position.x = 0;
    runtime.position.z = 0;
    runtime.blockFlash = 0;
    runtime.hitFlash = 0;
    runtime.currentMove = null;
    runtime.actionTimer = 0;
    runtime.actionFramesRemaining = 0;
    runtime.moveFrame = 0;
    runtime.velocityY = 0;

    if (isMovePose(pose)) {
      const move = character.moves.find((candidate) => candidate.input === pose) ?? character.moves[0] ?? null;
      const total = move ? move.startupFrames + move.activeFrames + move.recoveryFrames : 1;
      const phase = (t * 1.35) % 1;
      runtime.state = 'attack';
      runtime.currentMove = move;
      runtime.moveFrame = Math.round(total * phase);
      runtime.actionFramesRemaining = Math.max(0, total - runtime.moveFrame);
      runtime.actionTimer = runtime.actionFramesRemaining / 60;
      runtime.position.y = 0;
    } else {
      runtime.state = pose;
      runtime.sidestepDirection = animationKey === 'sidestepLeft' ? -1 : animationKey === 'sidestepRight' ? 1 : 0;
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
    actionFramesRemaining: 0,
    moveFrame: 0,
    hitConnected: false,
    previewAnimationKey: undefined,
    commandHistory: [],
    previousDirectionToken: 'N',
    comboTimer: 0,
    comboStep: 0,
    comboSequence: [],
    previousAttackInputs: { jab: false, kick: false, heavy: false, special: false },
    wasCrouching: false,
    roundsWon: 0,
    stunTimer: 0,
    stunFramesRemaining: 0,
    blockstunFramesRemaining: 0,
    getupInvulnerableFrames: 0,
    getupForward: 0,
    getupLane: 0,
    getupStarted: false,
    juggleDamage: 0,
    blockFlash: 0,
    hitFlash: 0
  };
}

function CameraRig({ match, settings }: { match: MatchSnapshot; settings: GameSettings['camera'] }) {
  const { camera, size } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, delta) => {
    const [p1, p2] = match.fighters;
    const midX = (p1.position.x + p2.position.x) / 2;
    const midZ = (p1.position.z + p2.position.z) / 2;
    const midY = Math.max(0.92, 0.86 + (p1.position.y + p2.position.y) * 0.18);
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

    const perspective = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const verticalFov = THREE.MathUtils.degToRad(perspective.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
    const horizontalFit = (distance * 0.5 + 1.55) / Math.tan(horizontalFov / 2);
    const verticalSpan = 2.65 + Math.max(p1.position.y, p2.position.y) * 0.55;
    const verticalFit = verticalSpan / Math.tan(verticalFov / 2);
    const distanceScale = settings.distance * settings.zoomBias;
    const cameraDistance = THREE.MathUtils.clamp(Math.max(horizontalFit, verticalFit, 5.2) * distanceScale, 4.8, 21);
    const cameraHeight = THREE.MathUtils.clamp((2.35 + cameraDistance * 0.13 + Math.max(p1.position.y, p2.position.y) * 0.22) * settings.height, 2.2, 6.4);
    const desired = new THREE.Vector3(midX + cameraX * cameraDistance, cameraHeight, midZ + cameraZ * cameraDistance);
    camera.position.lerp(desired, 1 - Math.pow(0.00001, delta * settings.smoothing));
    target.set(midX, midY, midZ);
    camera.lookAt(target);
  });
  return null;
}

function Arena({
  stage,
  selectedPropId,
  onSelectProp
}: {
  stage: MatchSnapshot['stage'];
  selectedPropId?: string;
  onSelectProp?: (propId: string) => void;
}) {
  const horizonBlocks = useMemo(
    () => [
      [-18, 0.55, -12, 4.8, 1.1, 0.5],
      [-12, 0.72, -13.2, 3.2, 1.44, 0.5],
      [-6.4, 0.46, -12.4, 4.1, 0.92, 0.5],
      [7, 0.58, -12.8, 5.4, 1.16, 0.5],
      [14.8, 0.82, -13.6, 3.8, 1.64, 0.5],
      [21, 0.42, -12.2, 6.2, 0.84, 0.5]
    ] as const,
    []
  );

  if (stage.renderMode === 'spriteCutout') {
    return <SpriteCutoutStage stage={stage} selectedPropId={selectedPropId} onSelectProp={onSelectProp} />;
  }

  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.045, 0]}>
        <planeGeometry args={[96, 42, 48, 24]} />
        <meshStandardMaterial color={stage.floor} roughness={0.34} metalness={0.46} transparent opacity={0.96} />
      </mesh>
      <mesh receiveShadow position={[0, -0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[38, 19, 36, 18]} />
        <meshStandardMaterial color="#0d2140" emissive="#08284f" emissiveIntensity={0.2} roughness={0.42} metalness={0.35} transparent opacity={0.74} />
      </mesh>
      <gridHelper args={[48, 48, stage.rail, '#14345d']} position={[0, 0.004, 0]} />
      <gridHelper args={[96, 48, '#174d88', '#071d35']} position={[0, -0.006, 0]} />
      <mesh position={[0, -0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[4.2, 96]} />
        <meshStandardMaterial color="#102a4c" emissive="#0a2c5a" emissiveIntensity={0.24} roughness={0.34} metalness={0.35} transparent opacity={0.48} />
      </mesh>
      <mesh position={[0, -0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.2, 4.72, 96]} />
        <meshBasicMaterial color={stage.rail} transparent opacity={0.22} />
      </mesh>
      {[-10, 10].map((x) => (
        <mesh key={`lane-${x}`} position={[x, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.04, 18]} />
          <meshBasicMaterial color={stage.rail} transparent opacity={0.28} />
        </mesh>
      ))}
      <mesh position={[0, 0.012, -9]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[0.04, 36]} />
        <meshBasicMaterial color={stage.rail} transparent opacity={0.24} />
      </mesh>
      {horizonBlocks.map(([x, y, z, width, height, depth], index) => (
        <mesh key={`horizon-${index}`} position={[x, y, z]} castShadow receiveShadow>
          <boxGeometry args={[width, height, depth]} />
          <meshStandardMaterial color="#030712" emissive="#061326" emissiveIntensity={0.32} roughness={0.62} metalness={0.12} transparent opacity={0.74} />
        </mesh>
      ))}
      <mesh position={[0, 3.65, -14.4]}>
        <circleGeometry args={[1.65, 72]} />
        <meshBasicMaterial color="#f1f5ff" transparent opacity={0.58} />
      </mesh>
      <mesh position={[0, 3.65, -14.42]}>
        <ringGeometry args={[1.65, 2.05, 72]} />
        <meshBasicMaterial color={stage.rail} transparent opacity={0.15} />
      </mesh>
    </group>
  );
}

function SpriteCutoutStage({
  stage,
  selectedPropId,
  onSelectProp
}: {
  stage: StageDefinition;
  selectedPropId?: string;
  onSelectProp?: (propId: string) => void;
}) {
  const hillColor = stage.world?.backgroundColor ?? '#10291c';
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.052, 0]}>
        <planeGeometry args={[96, 42, 32, 18]} />
        <meshStandardMaterial color={stage.floor} roughness={0.78} metalness={0.02} />
      </mesh>
      <mesh receiveShadow position={[0, -0.028, 0.05]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[5.35, 72]} />
        <meshStandardMaterial color="#d7be6d" roughness={0.84} metalness={0.02} />
      </mesh>
      <mesh receiveShadow position={[0, -0.024, 0.05]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[14.8, 5.6]} />
        <meshStandardMaterial color="#d2b35e" roughness={0.86} metalness={0.02} transparent opacity={0.78} />
      </mesh>
      <mesh receiveShadow position={[0, -0.018, 3.7]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[34, 9.2]} />
        <meshStandardMaterial color="#2f7a3c" roughness={0.9} transparent opacity={0.76} />
      </mesh>
      <mesh receiveShadow position={[0, -0.018, -5.6]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[42, 12]} />
        <meshStandardMaterial color="#265f33" roughness={0.9} transparent opacity={0.72} />
      </mesh>
      <mesh position={[-7, 1.15, -14]} rotation={[0, 0, -0.14]}>
        <coneGeometry args={[4.9, 2.4, 3]} />
        <meshStandardMaterial color={hillColor} roughness={0.95} />
      </mesh>
      <mesh position={[-1.4, 1.3, -14.8]} rotation={[0, 0, 0.08]}>
        <coneGeometry args={[5.8, 2.7, 3]} />
        <meshStandardMaterial color="#2f8c82" roughness={0.96} />
      </mesh>
      <mesh position={[5.8, 1.1, -14.2]} rotation={[0, 0, 0.18]}>
        <coneGeometry args={[4.6, 2.2, 3]} />
        <meshStandardMaterial color="#4aa08c" roughness={0.96} />
      </mesh>
      <mesh position={[0, 1.75, -15.2]}>
        <boxGeometry args={[42, 0.18, 0.2]} />
        <meshBasicMaterial color="#b9edf5" transparent opacity={0.32} />
      </mesh>
      <gridHelper args={[28, 14, '#6bbf58', '#325f30']} position={[0, 0.002, 0]} />
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.8, 5.05, 72]} />
        <meshBasicMaterial color="#f0d27b" transparent opacity={0.26} />
      </mesh>
      {(stage.backgroundLayers ?? []).map((layer) => (
        <StageTexturePlane key={layer.id} imagePath={layer.imagePath} position={layer.position} scale={layer.scale} rotation={layer.rotation} opacity={layer.opacity ?? 1} />
      ))}
      {(stage.props ?? []).filter((prop) => !prop.hidden).map((prop) => (
        <StagePropPlane key={prop.id} prop={prop} selected={prop.id === selectedPropId} onSelectProp={onSelectProp} />
      ))}
    </group>
  );
}

function StageTexturePlane({
  imagePath,
  position,
  scale,
  rotation,
  opacity
}: {
  imagePath: string;
  position: [number, number, number];
  scale: [number, number, number];
  rotation?: [number, number, number];
  opacity: number;
}) {
  const texture = useLoader(THREE.TextureLoader, imagePath);
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
  }, [texture]);
  return (
    <mesh position={position} rotation={rotation ?? [0, 0, 0]} scale={scale} renderOrder={position[2] < 0 ? -10 : 2}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} transparent opacity={opacity} alphaTest={0.04} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function StagePropPlane({
  prop,
  selected = false,
  onSelectProp
}: {
  prop: StagePropDefinition;
  selected?: boolean;
  onSelectProp?: (propId: string) => void;
}) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    if (prop.billboard && group.current) {
      group.current.quaternion.copy(camera.quaternion);
    }
  });
  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!onSelectProp) return;
    event.stopPropagation();
    onSelectProp(prop.id);
  };
  return (
    <group ref={group} position={prop.position} rotation={prop.rotation ?? [0, 0, 0]} onPointerDown={handlePointerDown}>
      {onSelectProp && <StagePropHitTarget prop={prop} onPointerDown={handlePointerDown} />}
      {prop.renderMode === 'voxel' ? (
        <StageVoxelProp prop={prop} />
      ) : (
        <StageTexturePlane imagePath={prop.imagePath} position={[0, 0, 0]} scale={prop.scale} opacity={prop.opacity ?? 1} />
      )}
      {selected && <StagePropSelectionFrame prop={prop} />}
    </group>
  );
}

function StagePropHitTarget({
  prop,
  onPointerDown
}: {
  prop: StagePropDefinition;
  onPointerDown: (event: ThreeEvent<PointerEvent>) => void;
}) {
  return (
    <mesh scale={[Math.max(0.28, Math.abs(prop.scale[0]) * 1.22), Math.max(0.28, Math.abs(prop.scale[1]) * 1.22), 1]} position={[0, 0, 0.1]} onPointerDown={onPointerDown} renderOrder={20}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.001} depthWrite={false} depthTest={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function StagePropSelectionFrame({ prop }: { prop: StagePropDefinition }) {
  return (
    <mesh scale={[Math.max(0.05, Math.abs(prop.scale[0]) * 1.08), Math.max(0.05, Math.abs(prop.scale[1]) * 1.08), 1]} position={[0, 0, 0.04]} renderOrder={12}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color="#2ee6ff" wireframe transparent opacity={0.9} depthTest={false} />
    </mesh>
  );
}

function StageVoxelProp({ prop }: { prop: StagePropDefinition }) {
  const texture = useLoader(THREE.TextureLoader, prop.imagePath);
  const geometry = useMemo(() => buildStageVoxelGeometry(texture, prop), [texture, prop.imagePath, prop.voxelDepth, prop.voxelScale]);

  useEffect(() => {
    return () => geometry?.dispose();
  }, [geometry]);

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
  }, [texture]);

  if (!geometry) {
    return <StageTexturePlane imagePath={prop.imagePath} position={[0, 0, 0]} scale={prop.scale} opacity={prop.opacity ?? 1} />;
  }

  return (
    <mesh geometry={geometry} scale={prop.scale} castShadow receiveShadow>
      <meshStandardMaterial color="#ffffff" vertexColors roughness={0.82} metalness={0.02} transparent opacity={prop.opacity ?? 1} />
    </mesh>
  );
}

function buildStageVoxelGeometry(texture: THREE.Texture, prop: StagePropDefinition) {
  const image = texture.image as CanvasImageSource & { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
  const width = Math.round(Number(image?.naturalWidth ?? image?.width ?? 0));
  const height = Math.round(Number(image?.naturalHeight ?? image?.height ?? 0));
  if (!image || width <= 0 || height <= 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const sampleStep = Math.max(2, Math.min(12, Math.round(prop.voxelScale ?? 4)));
  const depth = Math.max(0.04, Math.min(0.6, prop.voxelDepth ?? 0.16));
  const cellWidth = 1 / Math.ceil(width / sampleStep);
  const cellHeight = 1 / Math.ceil(height / sampleStep);
  const geometries: THREE.BoxGeometry[] = [];
  const base = new THREE.BoxGeometry(cellWidth * 0.98, cellHeight * 0.98, depth);

  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const sample = sampleStageVoxelColor(pixels, x, y, sampleStep);
      if (!sample) continue;
      const geometry = base.clone();
      const color = new THREE.Color(sample.color);
      const colors = new Float32Array((geometry.getAttribute('position').count ?? 0) * 3);
      for (let index = 0; index < colors.length; index += 3) {
        colors[index] = color.r;
        colors[index + 1] = color.g;
        colors[index + 2] = color.b;
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const localX = ((x + sampleStep * 0.5) / width) - 0.5;
      const localY = 0.5 - ((y + sampleStep * 0.5) / height);
      const localZ = (sample.brightness - 128) / 1800;
      geometry.translate(localX, localY, localZ);
      geometries.push(geometry);
    }
  }

  base.dispose();
  if (geometries.length === 0) return null;
  const geometry = mergeGeometries(geometries, false);
  geometries.forEach((entry) => entry.dispose());
  return geometry;
}

function sampleStageVoxelColor(imageData: ImageData, originX: number, originY: number, sampleStep: number) {
  const { width, height, data } = imageData;
  let red = 0;
  let green = 0;
  let blue = 0;
  let alpha = 0;
  let count = 0;
  for (let y = originY; y < Math.min(height, originY + sampleStep); y += 1) {
    for (let x = originX; x < Math.min(width, originX + sampleStep); x += 1) {
      const offset = (y * width + x) * 4;
      if (data[offset + 3] <= 24) continue;
      red += data[offset];
      green += data[offset + 1];
      blue += data[offset + 2];
      alpha += data[offset + 3];
      count += 1;
    }
  }
  if (count / (sampleStep * sampleStep) < 0.16) return null;
  const r = red / count;
  const g = green / count;
  const b = blue / count;
  const snap = (value: number) => Math.max(0, Math.min(255, Math.round(value / 12) * 12));
  return {
    color: `#${[snap(r), snap(g), snap(b)].map((value) => value.toString(16).padStart(2, '0')).join('')}`,
    brightness: (r + g + b + alpha / count) / 4
  };
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

  const color = fighter.character.colors.primary;
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
    const hit = 0;
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
  const fps = fighter.character.animationFrameRates?.[key] ?? fighter.character.animationFps ?? 8;
  const frameIndex =
    fighter.state === 'attack'
      ? Math.min(sequence.length - 1, Math.floor(progress * sequence.length))
      : key === 'idle' || key === 'crouch' || key === 'block' || key === 'hitLight' || key === 'win' || key === 'lose'
        ? 0
      : Math.floor(elapsedTime * fps) % sequence.length;
  debugLogThrottled(9, 'voxel animation key resolved', {
    characterId: fighter.character.id,
    slot: fighter.slot,
    state: fighter.state,
    animationKey: key,
    fps,
    sequence: sequence.map((frame) => frame.match(/frame-(\d+)\.png$/)?.[1] ?? frame)
  });
  debugLogThrottled(10, 'voxel frame source selected', {
    characterId: fighter.character.id,
    slot: fighter.slot,
    animationKey: key,
    frameIndex,
    frameSource: sequence[frameIndex],
    elapsedTime: Number(elapsedTime.toFixed(2)),
    progress: Number(progress.toFixed(2))
  });
  return sequence[frameIndex];
}

function getImageVoxelAnimationKey(fighter: FighterRuntime) {
  if (fighter.previewAnimationKey) return fighter.previewAnimationKey;
  if (fighter.state === 'attack') return fighter.currentMove?.animationKey ?? fighter.currentMove?.input ?? 'jab';
  if (fighter.state === 'walk') return fighter.facing === 1 ? 'walkForward' : 'walkBack';
  if (fighter.state === 'sidestep') return fighter.sidestepDirection < 0 ? 'sidestepLeft' : 'sidestepRight';
  if (fighter.state === 'hit') return 'hitLight';
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
  const baseGeometry = new THREE.BoxGeometry(1, 1, 1);
  const geometries = part.voxels.map((voxel) => {
    const geometry = baseGeometry.clone();
    const color = new THREE.Color(voxel.color);
    const colors = new Float32Array((geometry.getAttribute('position').count ?? 0) * 3);
    for (let index = 0; index < colors.length; index += 3) {
      colors[index] = color.r;
      colors[index + 1] = color.g;
      colors[index + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(voxel.position[0] - part.anchor[0], voxel.position[1] - part.anchor[1], voxel.position[2] - part.anchor[2]),
        new THREE.Quaternion(),
        new THREE.Vector3(voxel.size[0], voxel.size[1], voxel.size[2])
      )
    );
    return geometry;
  });
  baseGeometry.dispose();
  const geometry = mergeGeometries(geometries, false);
  geometries.forEach((entry) => entry.dispose());
  if (!geometry) return null;
  const material = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    vertexColors: true,
    toneMapped: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
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
    const hit = 0;
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
    const hit = 0;
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
    const hit = 0;
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

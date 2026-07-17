import { Html, OrthographicCamera, useTexture } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { CuboidCollider, Physics, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BarChart3, BookOpen, CheckCircle2, Clock3, ContactRound, DoorOpen, Dumbbell, Gamepad2, Gauge, Globe2, Handshake, History, Keyboard, LockKeyhole, LogOut, Map, Palette, Pause, Pencil, Play, RotateCcw, Settings, Swords, Trophy, UserPlus, UserRound, UsersRound, Wifi, WifiOff, X, XCircle, type LucideIcon } from 'lucide-react';
import { Suspense, type CSSProperties, type MutableRefObject, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OnlinePlayerProfile } from '../lib/online/leaderboard';
import { addFriendEntry, isFriend, readMatchHistory } from '../lib/socialHistory';
import type { InputFrame } from '../types';
import { connectStoryHubMultiplayer, readOrCreateStoryHubGuestIdentity, readStoryHubOnlinePreference, STORY_HUB_CHALLENGE_TIMEOUT_MS, writeStoryHubOnlinePreference, type StoryHubMultiplayerSession } from './hubMultiplayer';
import { KORE_CENTRAL_HUB } from './hubData';
import { StoryAvatarRig, type StoryAvatarPose } from './StoryAvatarRig';
import type { HubDestination, StoryHubChallenge, StoryHubConnectionStatus, StoryHubDefinition, StoryHubPlayerState, StoryHubPresence, StoryPlatformDefinition, StoryPortalDefinition, StoryProfileV4 } from './types';

type StoryHubInput = Pick<InputFrame, 'left' | 'right' | 'down' | 'up' | 'jump' | 'confirm' | 'jab' | 'kick' | 'heavy' | 'special' | 'block' | 'back' | 'pause'>;
type SetVirtualAction = (player: 1 | 2, action: keyof InputFrame, pressed: boolean) => void;

const CITY_ASSET_ROOT = '/story/hub/warped-city-2';
const PORTAL_ASSET_ROOT = '/story/hub/warped-city-portals';
const AVATAR_GROUNDING_OFFSET_Y = -0.5;

const DESTINATION_ICONS: Record<HubDestination, LucideIcon> = {
  story: BookOpen,
  friends: ContactRound,
  online: Globe2,
  arcade: Gamepad2,
  versus: Swords,
  training: Dumbbell,
  tournament: Trophy,
  characters: UserRound,
  avatarStudio: Palette,
  options: Settings,
  exit: LogOut
};

const DESTINATION_STOREFRONTS: Record<HubDestination, string> = {
  story: 'story.png',
  friends: 'friends.png',
  online: 'online.png',
  arcade: 'arcade.png',
  versus: 'versus.png',
  training: 'training.png',
  tournament: 'tournament.png',
  characters: 'characters.png',
  avatarStudio: 'avatar-studio.png',
  options: 'options.png',
  exit: 'exit.png'
};

function configurePixelTexture(texture: THREE.Texture, repeatX = 1) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(repeatX, 1);
  texture.needsUpdate = true;
  return texture;
}

function PixelLayer({ path, position, size, repeatX, opacity = 1 }: { path: string; position: [number, number, number]; size: [number, number]; repeatX: number; opacity?: number }) {
  const source = useTexture(path);
  const texture = useMemo(() => configurePixelTexture(source.clone(), repeatX), [repeatX, source]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={position}>
    <planeGeometry args={size} />
    <meshBasicMaterial map={texture} transparent opacity={opacity} alphaTest={0.02} depthWrite={false} toneMapped={false} />
  </mesh>;
}

function PixelProp({ path, position, size }: { path: string; position: [number, number, number]; size: [number, number] }) {
  const texture = useTexture(path);
  useMemo(() => configurePixelTexture(texture), [texture]);
  return <mesh position={position}>
    <planeGeometry args={size} />
    <meshBasicMaterial map={texture} transparent alphaTest={0.02} depthWrite={false} toneMapped={false} />
  </mesh>;
}

function HubWorld({ reducedMotion }: { reducedMotion: boolean }) {
  const particles = useMemo(() => Array.from({ length: 28 }, (_, index) => ({
    x: -31 + ((index * 17.3) % 62),
    y: 1.5 + ((index * 2.7) % 8),
    speed: 0.25 + (index % 5) * 0.06
  })), []);
  const particleGroup = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!reducedMotion && particleGroup.current) particleGroup.current.position.y = Math.sin(state.clock.elapsedTime * 0.35) * 0.12;
  });
  return <>
    <color attach="background" args={['#260036']} />
    <ambientLight intensity={1.15} />
    <pointLight position={[0, 5, 4]} color="#ff2f79" intensity={7} distance={22} />
    <pointLight position={[-18, 4, 3]} color="#2ee6ff" intensity={5} distance={17} />
    <pointLight position={[19, 4, 3]} color="#9b72ff" intensity={5} distance={17} />

    <PixelLayer path={`${CITY_ASSET_ROOT}/city-back.png`} position={[0, 7.2, -12]} size={[78, 20]} repeatX={12} />
    <PixelLayer path={`${CITY_ASSET_ROOT}/city-middle.png`} position={[0, 5.5, -9]} size={[78, 16]} repeatX={8} />
    <PixelLayer path={`${CITY_ASSET_ROOT}/city-front.png`} position={[0, 4.1, -6]} size={[78, 12]} repeatX={4} />

    {[-28, -20, -12, -4, 4, 12, 20, 28].map((x) => <PixelProp
      key={`light-${x}`}
      path={`${CITY_ASSET_ROOT}/street-light.png`}
      position={[x, 2.15, -0.9]}
      size={[1.55, 1.92]}
    />)}
    {[-24, -10, 10, 24].map((x, index) => <PixelProp
      key={`banner-${x}`}
      path={`${CITY_ASSET_ROOT}/${index % 2 ? 'banner-tall.png' : 'banner-wide.png'}`}
      position={[x, index % 2 ? 6.4 : 6.05, -2.5]}
      size={index % 2 ? [1.4, 2.3] : [3.15, 2.1]}
    />)}

    <group ref={particleGroup} position={[0, 0, -2]}>
      {particles.map((particle, index) => <mesh key={index} position={[particle.x, particle.y, 0]} scale={0.05 + particle.speed * 0.07}>
        <octahedronGeometry />
        <meshBasicMaterial color={index % 3 === 0 ? '#ffe071' : '#2ee6ff'} transparent opacity={0.5} />
      </mesh>)}
    </group>

  </>;
}

function PlatformVisual({ platform }: { platform: StoryPlatformDefinition }) {
  const source = useTexture(`${CITY_ASSET_ROOT}/ground-platform.png`);
  const tileWorldWidth = 2;
  const visualHeight = 1;
  const repeatX = Math.max(1, platform.size[0] / tileWorldWidth);
  const visualCenterY = platform.size[1] / 2 - visualHeight / 2;
  const texture = useMemo(() => configurePixelTexture(source.clone(), repeatX), [repeatX, source]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <group>
    <mesh position={[0, visualCenterY, 0.2]}>
      <planeGeometry args={[platform.size[0], visualHeight]} />
      <meshBasicMaterial map={texture} transparent alphaTest={0.02} toneMapped={false} />
    </mesh>
  </group>;
}

function PortalVisual({ portal, nearby }: { portal: StoryPortalDefinition; nearby: boolean }) {
  const storefront = useTexture(`${PORTAL_ASSET_ROOT}/${DESTINATION_STOREFRONTS[portal.destination]}`);
  useMemo(() => configurePixelTexture(storefront), [storefront]);
  const DestinationIcon = DESTINATION_ICONS[portal.destination];
  const storefrontSize = portal.destination === 'story' ? 4.45 : portal.position[1] > 4 ? 3.15 : 3.55;
  return <group position={[portal.position[0], portal.position[1], 0]}>
    <mesh position={[0, 0, -0.25]} scale={nearby ? 1.06 : 1}>
      <planeGeometry args={[storefrontSize, storefrontSize]} />
      <meshBasicMaterial map={storefront} transparent alphaTest={0.02} toneMapped={false} />
    </mesh>
    <Html center position={[0, portal.size[1] / 2 + 0.52, 0.7]} zIndexRange={[8, 0]} className="story-destination-sign-shell">
      <div data-testid={`story-destination-${portal.id}`} className={`story-destination-sign ${nearby ? 'is-nearby' : ''} ${portal.locked ? 'is-locked' : ''}`} style={{ '--story-destination-accent': portal.accent } as CSSProperties}>
        <span aria-hidden="true">{portal.locked ? <LockKeyhole size={16} /> : <DestinationIcon size={16} />}</span>
        <strong>{portal.label}</strong>
        <small>{portal.subtitle}</small>
      </div>
    </Html>
  </group>;
}

function HubCamera({ playerPosition, bounds }: { playerPosition: MutableRefObject<THREE.Vector3>; bounds: StoryHubDefinition['bounds'] }) {
  const { camera, size } = useThree();
  const desired = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, delta) => {
    const orthographic = camera as THREE.OrthographicCamera;
    const halfWidth = Math.max(5, size.width / Math.max(1, orthographic.zoom) / 2);
    desired.set(
      THREE.MathUtils.clamp(playerPosition.current.x, bounds.minX + halfWidth, bounds.maxX - halfWidth),
      THREE.MathUtils.clamp(4.6 + Math.max(0, playerPosition.current.y - 1) * 0.22, 4.6, 5.6),
      18
    );
    const blend = 1 - Math.pow(0.0005, delta);
    camera.position.lerp(desired, blend);
    camera.lookAt(camera.position.x, camera.position.y - 0.2, 0);
  });
  return null;
}

function RemoteStoryPlayer({ presence, reducedMotion, lane, selected, onSelect }: {
  presence: StoryHubPresence;
  reducedMotion: boolean;
  lane: number;
  selected: boolean;
  onSelect: (presence: StoryHubPresence) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Vector3(presence.x, presence.y, 0.35 + lane * 0.025), [lane, presence.x, presence.y]);
  useFrame((_, delta) => {
    if (!groupRef.current) return;
    target.set(presence.x, presence.y, 0.35 + lane * 0.025);
    groupRef.current.position.lerp(target, 1 - Math.pow(0.008, delta));
  });
  return <group ref={groupRef} position={[presence.x, presence.y, 0.35 + lane * 0.025]} onClick={(event) => {
    event.stopPropagation();
    onSelect(presence);
  }}>
    <group position={[0, AVATAR_GROUNDING_OFFSET_Y, 0]}>
      <StoryAvatarRig avatar={presence.avatar} pose={presence.pose} facing={presence.facing} reducedMotion={reducedMotion} />
    </group>
    <mesh position={[0, 1.42, 0.1]} renderOrder={50}>
      <planeGeometry args={[0.74, 0.09]} />
      <meshBasicMaterial color={selected ? '#ffe071' : '#2ee6ff'} transparent opacity={selected ? 1 : 0.78} depthWrite={false} />
    </mesh>
    <Html center position={[0, 1.75, 0.4]} zIndexRange={[12, 1]} className="story-remote-player-tag-shell">
      <button
        type="button"
        data-testid={`story-hub-player-${presence.sessionId}`}
        className={`story-remote-player-tag ${selected ? 'is-selected' : ''}`}
        onClick={(event) => { event.stopPropagation(); onSelect(presence); }}
      >
        <strong>{presence.displayName}</strong>
        <small>{selected ? 'Player menu open' : 'View player'}</small>
      </button>
    </Html>
  </group>;
}

function StoryPlayerController({ hub, avatar, playerPosition, readInput, disabled, reducedMotion, onNearbyPortal, onActivatePortal, onExit, onPause, onStateSample, onReady }: {
  hub: StoryHubDefinition;
  avatar: StoryProfileV4['avatar'];
  playerPosition: MutableRefObject<THREE.Vector3>;
  readInput: () => StoryHubInput;
  disabled: boolean;
  reducedMotion: boolean;
  onNearbyPortal: (portal: StoryPortalDefinition | null) => void;
  onActivatePortal: (portal: StoryPortalDefinition) => void;
  onExit: () => void;
  onPause: () => void;
  onStateSample: (state: StoryHubPlayerState) => void;
  onReady?: () => void;
}) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const position = useRef({ x: hub.spawn[0], y: hub.spawn[1] });
  const velocityY = useRef(0);
  const facing = useRef<-1 | 1>(1);
  const [visualState, setVisualState] = useState<{ pose: StoryAvatarPose; facing: -1 | 1 }>({ pose: 'idle', facing: 1 });
  const groundedUntil = useRef(0);
  const groundedPlatform = useRef<string | null>('ground');
  const jumpsUsed = useRef(0);
  const jumpBufferedUntil = useRef(0);
  const dropThroughUntil = useRef(0);
  const previousButtons = useRef({ jump: false, interact: false, attack: false, back: false, pause: false });
  const attackUntil = useRef(0);
  const actionInputArmed = useRef(false);
  const releasedInputFrames = useRef(0);
  const nearbyId = useRef<string | null>(null);
  const lastSampleAt = useRef(0);

  useEffect(() => onReady?.(), [onReady]);
  useEffect(() => {
    if (!disabled) return;
    actionInputArmed.current = false;
    releasedInputFrames.current = 0;
  }, [disabled]);

  useFrame((state, frameDelta) => {
    const now = state.clock.elapsedTime;
    const delta = Math.min(frameDelta, 1 / 30);
    const input = disabled ? { left: false, right: false, down: false, up: false, jump: false, confirm: false, jab: false, kick: false, heavy: false, special: false, block: false, back: false, pause: false } : readInput();
    const jumpPressed = Boolean(input.jump || input.up);
    const interactPressed = Boolean(input.confirm || input.special);
    const attackPressed = Boolean(input.jab || input.kick || input.heavy);
    const backPressed = Boolean(input.back);
    const pausePressed = Boolean(input.pause);
    const jumpEdge = actionInputArmed.current && jumpPressed && !previousButtons.current.jump;
    const interactEdge = actionInputArmed.current && interactPressed && !previousButtons.current.interact;
    const attackEdge = actionInputArmed.current && attackPressed && !previousButtons.current.attack;
    const backEdge = actionInputArmed.current && backPressed && !previousButtons.current.back;
    const pauseEdge = actionInputArmed.current && pausePressed && !previousButtons.current.pause;

    // A confirm used to enter the hub can still be held on its first frames. Wait
    // for a clean release before accepting action edges so it cannot trigger the
    // portal beside the spawn or lock the player in a dialog.
    if (!actionInputArmed.current) {
      if (!jumpPressed && !interactPressed && !attackPressed && !backPressed && !pausePressed) releasedInputFrames.current += 1;
      else releasedInputFrames.current = 0;
      if (releasedInputFrames.current >= 2) actionInputArmed.current = true;
    }

    if (backEdge) onExit();
    if (pauseEdge) onPause();
    if (attackEdge) attackUntil.current = now + 0.66;
    if (jumpEdge && groundedUntil.current < now && jumpsUsed.current < 2) {
      velocityY.current = 11.4;
      jumpsUsed.current = 2;
      groundedPlatform.current = null;
      groundedUntil.current = 0;
      jumpBufferedUntil.current = 0;
    } else if (jumpEdge) {
      jumpBufferedUntil.current = now + 0.12;
    }
    if (jumpEdge && input.down && groundedPlatform.current && groundedPlatform.current !== 'ground') {
      dropThroughUntil.current = now + 0.28;
      groundedPlatform.current = null;
      groundedUntil.current = 0;
      position.current.y -= 0.08;
      velocityY.current = -1.5;
      jumpBufferedUntil.current = 0;
    }

    const horizontal = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const sprinting = horizontal !== 0 && input.block;
    if (horizontal !== 0) facing.current = horizontal > 0 ? 1 : -1;
    if (jumpBufferedUntil.current >= now && groundedUntil.current >= now) {
      velocityY.current = 7.8;
      jumpsUsed.current = 1;
      groundedPlatform.current = null;
      groundedUntil.current = 0;
      jumpBufferedUntil.current = 0;
    }
    velocityY.current += -22 * delta;
    const moveSpeed = sprinting ? 8.4 : 5.2;
    let nextX = THREE.MathUtils.clamp(position.current.x + horizontal * moveSpeed * delta, hub.bounds.minX + 0.5, hub.bounds.maxX - 0.5);
    let nextY = position.current.y + velocityY.current * delta;
    let landing: StoryPlatformDefinition | null = null;
    let landingX = nextX;
    if (velocityY.current <= 0) {
      for (const platform of hub.platforms) {
        if (platform.oneWay && now < dropThroughUntil.current) continue;
        const top = platform.position[1] + platform.size[1] / 2;
        const previousBottom = position.current.y - 0.82;
        const nextBottom = nextY - 0.82;
        const left = platform.position[0] - platform.size[0] / 2;
        const right = platform.position[0] + platform.size[0] / 2;
        const edgeCatch = platform.oneWay ? 0.72 : 0.46;
        const withinX = nextX >= left - edgeCatch && nextX <= right + edgeCatch;
        const crossesForgivingTop = previousBottom >= top - 0.42 && nextBottom <= top + 0.16;
        if (withinX && crossesForgivingTop) {
          if (!landing || top > landing.position[1] + landing.size[1] / 2) {
            landing = platform;
            landingX = THREE.MathUtils.clamp(nextX, left + 0.12, right - 0.12);
          }
        }
      }
    }
    if (landing) {
      nextX = landingX;
      nextY = landing.position[1] + landing.size[1] / 2 + 0.82;
      velocityY.current = 0;
      groundedUntil.current = now + 0.1;
      groundedPlatform.current = landing.id;
      jumpsUsed.current = 0;
    }
    if (nextY < hub.bounds.floorY + 0.82) {
      nextY = hub.bounds.floorY + 0.82;
      velocityY.current = 0;
      groundedUntil.current = now + 0.1;
      groundedPlatform.current = 'ground';
      jumpsUsed.current = 0;
    }
    position.current = { x: nextX, y: nextY };
    playerPosition.current.set(nextX, nextY, 0);
    bodyRef.current?.setNextKinematicTranslation({ x: nextX, y: nextY, z: 0 });

    const nextPose: StoryAvatarPose = attackUntil.current > now ? 'attack' : groundedUntil.current < now ? 'jump' : sprinting ? 'sprint' : horizontal !== 0 ? 'walk' : 'idle';
    if (visualState.pose !== nextPose || visualState.facing !== facing.current) setVisualState({ pose: nextPose, facing: facing.current });

    const nearby = hub.portals
      .filter((portal) => Math.abs(nextX - portal.position[0]) <= portal.size[0] / 2 + 0.85 && Math.abs(nextY - portal.position[1]) <= portal.size[1] / 2 + 0.9)
      .sort((a, b) => Math.abs(nextX - a.position[0]) - Math.abs(nextX - b.position[0]))[0] ?? null;
    if ((nearby?.id ?? null) !== nearbyId.current) {
      nearbyId.current = nearby?.id ?? null;
      onNearbyPortal(nearby);
    }
    if (interactEdge && nearby) onActivatePortal(nearby);
    if (now - lastSampleAt.current > 0.12) {
      lastSampleAt.current = now;
      onStateSample({ x: nextX, y: nextY, pose: nextPose, facing: facing.current });
    }
    previousButtons.current = { jump: jumpPressed, interact: interactPressed, attack: attackPressed, back: backPressed, pause: pausePressed };
  });

  return <RigidBody ref={bodyRef} type="kinematicPosition" position={[hub.spawn[0], hub.spawn[1], 0]} colliders={false} enabledRotations={[false, false, false]}>
    <CuboidCollider args={[0.36, 0.8, 0.3]} />
    <group position={[0, AVATAR_GROUNDING_OFFSET_Y, 0]}>
      <StoryAvatarRig avatar={avatar} pose={visualState.pose} facing={visualState.facing} reducedMotion={reducedMotion} />
    </group>
  </RigidBody>;
}

function HubCanvas({ profile, reducedMotion, readInput, disabled, nearbyPortal, remotePlayers, selectedPlayerSessionId, onSelectPlayer, onNearbyPortal, onActivatePortal, onExit, onPause, onStateSample, onReady }: {
  profile: StoryProfileV4;
  reducedMotion: boolean;
  readInput: () => StoryHubInput;
  disabled: boolean;
  nearbyPortal: StoryPortalDefinition | null;
  remotePlayers: StoryHubPresence[];
  selectedPlayerSessionId?: string;
  onSelectPlayer: (presence: StoryHubPresence) => void;
  onNearbyPortal: (portal: StoryPortalDefinition | null) => void;
  onActivatePortal: (portal: StoryPortalDefinition) => void;
  onExit: () => void;
  onPause: () => void;
  onStateSample: (state: StoryHubPlayerState) => void;
  onReady: () => void;
}) {
  const hub = KORE_CENTRAL_HUB;
  const playerPosition = useRef(new THREE.Vector3(hub.spawn[0], hub.spawn[1], 0));
  return <Canvas shadows dpr={[0.65, 1.25]} gl={{ antialias: true, powerPreference: 'high-performance' }} data-testid="story-hub-canvas">
    <OrthographicCamera makeDefault position={[hub.spawn[0], 4.6, 18]} zoom={58} near={0.1} far={100} />
    <HubCamera playerPosition={playerPosition} bounds={hub.bounds} />
    <Suspense fallback={null}>
      <HubWorld reducedMotion={reducedMotion} />
      <Physics gravity={[0, -22, 0]} timeStep="vary">
        {hub.platforms.map((platform) => <RigidBody key={platform.id} type="fixed" colliders={false} position={[platform.position[0], platform.position[1], 0]}>
          <CuboidCollider args={[platform.size[0] / 2, platform.size[1] / 2, 1]} sensor={Boolean(platform.oneWay)} />
          <PlatformVisual platform={platform} />
        </RigidBody>)}
        {hub.portals.map((portal) => <PortalVisual key={portal.id} portal={portal} nearby={nearbyPortal?.id === portal.id} />)}
        {remotePlayers.map((presence, index) => <RemoteStoryPlayer key={presence.sessionId} presence={presence} reducedMotion={reducedMotion} lane={index % 5} selected={selectedPlayerSessionId === presence.sessionId} onSelect={onSelectPlayer} />)}
        <StoryPlayerController hub={hub} avatar={profile.avatar} playerPosition={playerPosition} readInput={readInput} disabled={disabled} reducedMotion={reducedMotion} onNearbyPortal={onNearbyPortal} onActivatePortal={onActivatePortal} onExit={onExit} onPause={onPause} onStateSample={onStateSample} onReady={onReady} />
      </Physics>
    </Suspense>
  </Canvas>;
}

function TouchButton({ label, action, setVirtualAction, className, children }: { label: string; action: keyof InputFrame; setVirtualAction: SetVirtualAction; className?: string; children: ReactNode }) {
  const release = useCallback(() => setVirtualAction(1, action, false), [action, setVirtualAction]);
  return <button
    type="button"
    className={className}
    aria-label={label}
    onPointerDown={(event) => { event.preventDefault(); setVirtualAction(1, action, true); }}
    onPointerUp={release}
    onPointerCancel={release}
    onPointerLeave={release}
  >{children}</button>;
}

export default function StoryHubScreen({ profile, onlineProfile, reducedMotion, peekInputs, setVirtualAction, onDestination, onOnlineSpar, onExit }: {
  profile: StoryProfileV4;
  onlineProfile?: OnlinePlayerProfile | null;
  reducedMotion: boolean;
  peekInputs: () => [InputFrame, InputFrame];
  setVirtualAction: SetVirtualAction;
  onDestination: (destination: HubDestination) => void;
  onOnlineSpar: (opponent: StoryHubPresence) => void;
  onExit: () => void;
}) {
  const [nearbyPortal, setNearbyPortal] = useState<StoryPortalDefinition | null>(null);
  const [storyLockedOpen, setStoryLockedOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [playerX, setPlayerX] = useState(KORE_CENTRAL_HUB.spawn[0]);
  const [playerY, setPlayerY] = useState(KORE_CENTRAL_HUB.spawn[1]);
  const [playerPose, setPlayerPose] = useState<StoryAvatarPose>('idle');
  const [hubReady, setHubReady] = useState(false);
  const [onlineEnabled, setOnlineEnabled] = useState(readStoryHubOnlinePreference);
  const [connectionStatus, setConnectionStatus] = useState<StoryHubConnectionStatus>(onlineEnabled ? 'connecting' : 'offline');
  const [remotePlayers, setRemotePlayers] = useState<StoryHubPresence[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<StoryHubPresence | null>(null);
  const [playerPanelView, setPlayerPanelView] = useState<'actions' | 'stats' | 'history'>('actions');
  const [playerActionMessage, setPlayerActionMessage] = useState('');
  const [challenges, setChallenges] = useState<StoryHubChallenge[]>([]);
  const [challengeNotice, setChallengeNotice] = useState<{ id: string; text: string } | null>(null);
  const [challengeClock, setChallengeClock] = useState(Date.now());
  const [localSessionId, setLocalSessionId] = useState('');
  const [socialRevision, setSocialRevision] = useState(0);
  const multiplayerSessionRef = useRef<StoryHubMultiplayerSession | null>(null);
  const launchedChallengeIdsRef = useRef(new Set<string>());
  const noticedChallengeIdsRef = useRef(new Set<string>());
  const pauseGuardUntilRef = useRef(0);
  const pauseKeyHeldRef = useRef(false);
  const playerStateRef = useRef<StoryHubPlayerState>({ x: KORE_CENTRAL_HUB.spawn[0], y: KORE_CENTRAL_HUB.spawn[1], pose: 'idle', facing: 1 });
  const readInput = useCallback(() => peekInputs()[0], [peekInputs]);
  const handleHubReady = useCallback(() => setHubReady(true), []);
  const handlePlayerState = useCallback((state: StoryHubPlayerState) => {
    playerStateRef.current = state;
    setPlayerX(state.x);
    setPlayerY(state.y);
    setPlayerPose(state.pose);
    multiplayerSessionRef.current?.update(state);
  }, []);
  const toggleOnline = useCallback(() => {
    setOnlineEnabled((current) => writeStoryHubOnlinePreference(!current));
  }, []);
  const closePause = useCallback(() => {
    setVirtualAction(1, 'pause', false);
    pauseGuardUntilRef.current = Date.now() + 400;
    setPauseOpen(false);
  }, [setVirtualAction]);
  const openPause = useCallback(() => {
    setVirtualAction(1, 'pause', false);
    if (Date.now() < pauseGuardUntilRef.current) return;
    setPauseOpen(true);
  }, [setVirtualAction]);
  const editAvatarFromPause = useCallback(() => {
    closePause();
    onDestination('avatarStudio');
  }, [closePause, onDestination]);
  const activatePortal = useCallback((portal: StoryPortalDefinition) => {
    if (portal.locked || portal.destination === 'story') {
      setStoryLockedOpen(true);
      return;
    }
    onDestination(portal.destination);
  }, [onDestination]);

  useEffect(() => {
    const onShift = (event: KeyboardEvent, pressed: boolean) => {
      if (event.code !== 'ShiftLeft' && event.code !== 'ShiftRight') return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      setVirtualAction(1, 'block', pressed);
    };
    const onKeyDown = (event: KeyboardEvent) => onShift(event, true);
    const onKeyUp = (event: KeyboardEvent) => onShift(event, false);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      setVirtualAction(1, 'block', false);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [setVirtualAction]);

  useEffect(() => {
    multiplayerSessionRef.current?.close();
    multiplayerSessionRef.current = null;
    setRemotePlayers([]);
    setChallenges([]);
    setLocalSessionId('');
    if (!onlineEnabled) {
      setConnectionStatus('offline');
      return undefined;
    }
    const session = connectStoryHubMultiplayer({
      profile,
      onlineProfile,
      initialState: playerStateRef.current,
      onPlayers: setRemotePlayers,
      onChallenges: setChallenges,
      onStatus: setConnectionStatus
    });
    multiplayerSessionRef.current = session;
    setLocalSessionId(session.sessionId);
    return () => {
      session.close();
      if (multiplayerSessionRef.current === session) multiplayerSessionRef.current = null;
    };
  }, [onlineEnabled, onlineProfile, profile]);

  useEffect(() => {
    if (!selectedPlayer) return;
    const current = remotePlayers.find((presence) => presence.sessionId === selectedPlayer.sessionId);
    if (current) setSelectedPlayer(current);
    else setSelectedPlayer(null);
  }, [remotePlayers, selectedPlayer?.sessionId]);

  const socialProfile = useMemo<OnlinePlayerProfile>(() => onlineProfile ?? readOrCreateStoryHubGuestIdentity(), [onlineProfile]);
  const selectedHistory = useMemo(() => selectedPlayer
    ? readMatchHistory(socialProfile).filter((entry) => entry.opponent.playerId === selectedPlayer.playerId || entry.opponent.displayName === selectedPlayer.displayName)
    : [], [selectedPlayer, socialProfile, socialRevision]);
  const selectedStats = useMemo(() => ({
    matches: selectedHistory.length,
    wins: selectedHistory.filter((entry) => entry.result === 'win').length,
    losses: selectedHistory.filter((entry) => entry.result === 'loss').length,
    draws: selectedHistory.filter((entry) => entry.result === 'draw').length
  }), [selectedHistory]);
  const selectedIsFriend = selectedPlayer ? isFriend(socialProfile, selectedPlayer.playerId) : false;
  const outgoingChallenge = challenges.find((challenge) => challenge.challengerSessionId === localSessionId && challenge.status === 'pending' && challenge.expiresAt > challengeClock) ?? null;
  const incomingChallenge = challenges.find((challenge) => challenge.targetSessionId === localSessionId && challenge.status === 'pending' && challenge.expiresAt > challengeClock) ?? null;

  useEffect(() => {
    if (!outgoingChallenge && !incomingChallenge) return undefined;
    const timer = window.setInterval(() => setChallengeClock(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [incomingChallenge?.id, outgoingChallenge?.id]);

  useEffect(() => {
    const accepted = challenges.find((challenge) => challenge.status === 'accepted'
      && (challenge.challengerSessionId === localSessionId || challenge.targetSessionId === localSessionId)
      && !launchedChallengeIdsRef.current.has(challenge.id));
    if (!accepted || !localSessionId) return;
    const opponentSessionId = accepted.challengerSessionId === localSessionId ? accepted.targetSessionId : accepted.challengerSessionId;
    const opponent = remotePlayers.find((presence) => presence.sessionId === opponentSessionId);
    if (!opponent) return;
    launchedChallengeIdsRef.current.add(accepted.id);
    onOnlineSpar(opponent);
  }, [challenges, localSessionId, onOnlineSpar, remotePlayers]);

  useEffect(() => {
    const terminal = challenges.find((challenge) => challenge.status !== 'pending'
      && challenge.status !== 'accepted'
      && (challenge.challengerSessionId === localSessionId || challenge.targetSessionId === localSessionId)
      && !noticedChallengeIdsRef.current.has(`${challenge.id}:${challenge.status}`));
    if (!terminal || !localSessionId) return;
    noticedChallengeIdsRef.current.add(`${terminal.id}:${terminal.status}`);
    const opponentName = terminal.challengerSessionId === localSessionId ? terminal.targetDisplayName : terminal.challengerDisplayName;
    const text = terminal.status === 'declined'
      ? `${opponentName} declined the spar.`
      : terminal.status === 'revoked'
        ? `${opponentName} revoked the challenge.`
        : `The challenge with ${opponentName} expired.`;
    setChallengeNotice({ id: `${terminal.id}:${terminal.status}`, text });
    const timer = window.setTimeout(() => setChallengeNotice(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [challenges, localSessionId]);

  const selectRemotePlayer = useCallback((presence: StoryHubPresence) => {
    setSelectedPlayer(presence);
    setPlayerPanelView('actions');
    setPlayerActionMessage('');
  }, []);
  const addSelectedFriend = useCallback(() => {
    if (!selectedPlayer) return;
    addFriendEntry(socialProfile, { playerId: selectedPlayer.playerId, displayName: selectedPlayer.displayName });
    setSocialRevision((current) => current + 1);
    setPlayerActionMessage(`${selectedPlayer.displayName} added to Friends.`);
  }, [selectedPlayer, socialProfile]);
  const challengeSelectedPlayer = useCallback(() => {
    if (!selectedPlayer || !onlineEnabled || outgoingChallenge || incomingChallenge) return;
    multiplayerSessionRef.current?.challenge(selectedPlayer);
    setChallengeClock(Date.now());
    setPlayerActionMessage(`Challenge sent to ${selectedPlayer.displayName}.`);
  }, [incomingChallenge, onlineEnabled, outgoingChallenge, selectedPlayer]);
  const respondToIncomingChallenge = useCallback((response: 'accepted' | 'declined') => {
    if (!incomingChallenge) return;
    multiplayerSessionRef.current?.respondToChallenge(incomingChallenge, response);
    setChallengeClock(Date.now());
  }, [incomingChallenge]);
  const revokeOutgoingChallenge = useCallback(() => {
    if (!outgoingChallenge) return;
    multiplayerSessionRef.current?.revokeChallenge(outgoingChallenge);
    setChallengeClock(Date.now());
  }, [outgoingChallenge]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || storyLockedOpen) return;
      if (event.repeat || pauseKeyHeldRef.current) return;
      pauseKeyHeldRef.current = true;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (selectedPlayer) {
        setSelectedPlayer(null);
        return;
      }
      if (controlsOpen) {
        setControlsOpen(false);
        return;
      }
      if (pauseOpen) closePause();
      else openPause();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Escape') pauseKeyHeldRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [closePause, controlsOpen, openPause, pauseOpen, selectedPlayer, storyLockedOpen]);

  useEffect(() => {
    if (!storyLockedOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      setStoryLockedOpen(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [storyLockedOpen]);

  const playerCount = onlineEnabled ? remotePlayers.length + 1 : 1;
  const statusLabel = connectionStatus === 'online' ? 'Live' : connectionStatus === 'local' ? 'Local Link' : connectionStatus === 'reconnecting' ? 'Reconnecting' : connectionStatus === 'connecting' ? 'Connecting' : 'Offline';
  const incomingSeconds = incomingChallenge ? Math.max(0, Math.ceil((incomingChallenge.expiresAt - challengeClock) / 1_000)) : 0;
  const outgoingSeconds = outgoingChallenge ? Math.max(0, Math.ceil((outgoingChallenge.expiresAt - challengeClock) / 1_000)) : 0;

  return <div className="story-hub-screen" data-testid="story-hub-screen" data-hub-ready={hubReady ? 'true' : 'false'} data-controls-open={controlsOpen ? 'true' : 'false'} data-player-x={playerX.toFixed(2)} data-player-y={playerY.toFixed(2)} data-player-pose={playerPose} data-nearby-portal={nearbyPortal?.id ?? ''} data-online={onlineEnabled ? 'true' : 'false'} data-connection-status={connectionStatus} data-player-count={playerCount}>
    <div className="story-hub-canvas-shell">
      <HubCanvas profile={profile} reducedMotion={reducedMotion} readInput={readInput} disabled={storyLockedOpen || pauseOpen || controlsOpen || Boolean(selectedPlayer) || Boolean(incomingChallenge)} nearbyPortal={nearbyPortal} remotePlayers={remotePlayers} selectedPlayerSessionId={selectedPlayer?.sessionId} onSelectPlayer={selectRemotePlayer} onNearbyPortal={setNearbyPortal} onActivatePortal={activatePortal} onExit={onExit} onPause={openPause} onStateSample={handlePlayerState} onReady={handleHubReady} />
    </div>

    <header className="story-hub-header story-enter-1">
      <div className="story-hub-location">
        <span><Map size={16} /> Central District</span>
        <h1>{KORE_CENTRAL_HUB.name}</h1>
        <p>{KORE_CENTRAL_HUB.subtitle}</p>
      </div>
      <div className="story-hub-header-actions">
        <button type="button" className="story-hub-controls-toggle" aria-expanded={controlsOpen} aria-controls="story-hub-controls-panel" onClick={() => setControlsOpen((current) => !current)}>
          <Keyboard size={19} /> <span>Controls</span>
        </button>
        <div className={`story-hub-presence-card is-${connectionStatus}`}>
          <span className="story-hub-presence-icon" aria-hidden="true">
            <Wifi className="is-online-icon" size={16} />
            <WifiOff className="is-offline-icon" size={16} />
          </span>
          <span><small>{statusLabel}</small><strong><UsersRound size={15} /> {playerCount} {playerCount === 1 ? 'Player' : 'Players'}</strong></span>
          <div className="story-hub-remote-names" aria-label="Players in K.O.R.E. Central">
            {remotePlayers.slice(0, 3).map((presence) => <i key={presence.sessionId} data-testid={`story-hub-remote-${presence.sessionId}`}>{presence.displayName}</i>)}
          </div>
        </div>
        <div className="story-hub-player-card">
          <span>Story Avatar</span>
          <strong>{profile.avatar.name}</strong>
        </div>
      </div>
    </header>

    {selectedPlayer && <section className="story-player-panel" role="dialog" aria-modal="false" aria-labelledby="story-player-panel-title" data-testid="story-player-panel">
      <header>
        <div className="story-player-panel-status" aria-hidden="true"><span /></div>
        <div>
          <small>Central Citizen</small>
          <h2 id="story-player-panel-title">{selectedPlayer.displayName}</h2>
          <p>{selectedPlayer.playerId.slice(0, 24)}</p>
        </div>
        <button type="button" className="story-player-panel-close" aria-label="Close player menu" onClick={() => setSelectedPlayer(null)}><X size={19} /></button>
      </header>

      <nav className="story-player-panel-tabs" aria-label="Player information">
        <button type="button" className={playerPanelView === 'actions' ? 'is-active' : ''} onClick={() => setPlayerPanelView('actions')}><Handshake size={17} /> Actions</button>
        <button type="button" className={playerPanelView === 'stats' ? 'is-active' : ''} onClick={() => setPlayerPanelView('stats')}><BarChart3 size={17} /> Stats</button>
        <button type="button" className={playerPanelView === 'history' ? 'is-active' : ''} onClick={() => setPlayerPanelView('history')}><History size={17} /> History</button>
      </nav>

      {playerPanelView === 'actions' && <div className="story-player-actions">
        <button type="button" className="is-spar" disabled={!onlineEnabled || Boolean(outgoingChallenge || incomingChallenge)} onClick={challengeSelectedPlayer}>
          <Swords size={20} /><span><strong>Online Spar</strong><small>{onlineEnabled ? 'Send a 30-second challenge' : 'Go online from Pause first'}</small></span>
        </button>
        <button type="button" disabled={selectedIsFriend} onClick={addSelectedFriend}>
          {selectedIsFriend ? <CheckCircle2 size={20} /> : <UserPlus size={20} />}<span><strong>{selectedIsFriend ? 'Friend Added' : 'Add Friend'}</strong><small>{selectedIsFriend ? 'Already in your friend list' : 'Save this player locally'}</small></span>
        </button>
        <button type="button" onClick={() => setPlayerPanelView('stats')}>
          <BarChart3 size={20} /><span><strong>View Stats</strong><small>See your head-to-head record</small></span>
        </button>
        <button type="button" onClick={() => setPlayerPanelView('history')}>
          <History size={20} /><span><strong>Match History</strong><small>Review recent fights together</small></span>
        </button>
      </div>}

      {playerPanelView === 'stats' && <div className="story-player-stats" data-testid="story-player-stats">
        <div><strong>{selectedStats.matches}</strong><span>Matches</span></div>
        <div><strong>{selectedStats.wins}</strong><span>Wins</span></div>
        <div><strong>{selectedStats.losses}</strong><span>Losses</span></div>
        <div><strong>{selectedStats.draws}</strong><span>Draws</span></div>
        <p>{selectedStats.matches ? 'Head-to-head results stored on this device.' : 'No shared matches recorded on this device yet.'}</p>
      </div>}

      {playerPanelView === 'history' && <div className="story-player-history" data-testid="story-player-history">
        {selectedHistory.length === 0 && <div className="story-player-empty"><Clock3 size={24} /><strong>No matches yet</strong><span>Challenge this player to start your history.</span></div>}
        {selectedHistory.slice(0, 6).map((entry) => <article key={entry.id} className={`is-${entry.result}`}>
          <span>{entry.result}</span>
          <div><strong>{entry.score[0]}–{entry.score[1]}</strong><small>{entry.mode.replace('trainingOnline', 'online spar')} · {entry.opponent.characterId}</small></div>
          <time dateTime={new Date(entry.createdAt).toISOString()}>{new Date(entry.createdAt).toLocaleDateString()}</time>
        </article>)}
      </div>}

      {playerActionMessage && <p className="story-player-action-message" role="status">{playerActionMessage}</p>}
    </section>}

    {incomingChallenge && <aside className="story-challenge-card is-incoming" role="dialog" aria-modal="false" aria-labelledby="story-incoming-challenge-title" data-testid="story-incoming-challenge">
      <div className="story-challenge-timer"><Clock3 size={17} /><strong>{incomingSeconds}s</strong></div>
      <small>Online Spar Challenge</small>
      <h2 id="story-incoming-challenge-title">{incomingChallenge.challengerDisplayName}</h2>
      <p>wants to fight you in K.O.R.E. Online.</p>
      <div>
        <button type="button" className="is-accept" autoFocus onClick={() => respondToIncomingChallenge('accepted')}><CheckCircle2 size={18} /> Accept</button>
        <button type="button" onClick={() => respondToIncomingChallenge('declined')}><XCircle size={18} /> Decline</button>
      </div>
    </aside>}

    {outgoingChallenge && <aside className="story-challenge-card is-outgoing" aria-live="polite" data-testid="story-outgoing-challenge">
      <div className="story-challenge-timer"><Clock3 size={17} /><strong>{outgoingSeconds}s</strong></div>
      <small>Challenge Sent</small>
      <h2>{outgoingChallenge.targetDisplayName}</h2>
      <p>Waiting for their answer. You can revoke at any time.</p>
      <button type="button" className="story-challenge-revoke" onClick={revokeOutgoingChallenge}><RotateCcw size={17} /> Revoke Challenge</button>
    </aside>}

    {challengeNotice && <aside className="story-challenge-notice" role="status" data-testid="story-challenge-notice">
      <XCircle size={18} /><span>{challengeNotice.text}</span><button type="button" aria-label="Dismiss challenge notice" onClick={() => setChallengeNotice(null)}><X size={16} /></button>
    </aside>}

    {controlsOpen && <section id="story-hub-controls-panel" className="story-hub-controls-panel" role="dialog" aria-modal="false" aria-labelledby="story-hub-controls-title">
      <header>
        <span><Keyboard size={18} /> Navigation Guide</span>
        <h2 id="story-hub-controls-title">K.O.R.E. Controls</h2>
        <button type="button" aria-label="Close controls" onClick={() => setControlsOpen(false)}><X size={18} /></button>
      </header>
      <div className="story-hub-controls-grid">
        <div><strong>Move</strong><kbd>← →</kbd><span>Left stick / D-pad</span></div>
        <div><strong>Run</strong><kbd>Shift</kbd><span>L1 / R1</span></div>
        <div><strong>Double Jump</strong><kbd>Space ×2</kbd><span>South button ×2</span></div>
        <div><strong>Attack</strong><kbd>U / J / I</kbd><span>Face buttons</span></div>
        <div><strong>Interact</strong><kbd>K / Enter</kbd><span>Special button</span></div>
        <div><strong>Pause</strong><kbd>Esc</kbd><span>Start / Menu</span></div>
      </div>
      <p>Touch controls appear automatically on touch devices.</p>
    </section>}

    <div className={`story-portal-prompt ${nearbyPortal ? 'is-visible' : ''}`} aria-live="polite">
      <div style={{ '--story-portal-accent': nearbyPortal?.accent ?? '#2ee6ff' } as CSSProperties}>
        {nearbyPortal?.locked ? <LockKeyhole size={22} /> : <DoorOpen size={22} />}
        <span><small>{nearbyPortal?.subtitle}</small><strong>{nearbyPortal?.label ?? 'Destination'}</strong></span>
      </div>
      <button type="button" disabled={!nearbyPortal} onClick={() => nearbyPortal && activatePortal(nearbyPortal)}>{nearbyPortal?.locked ? 'Inspect' : 'Enter'}</button>
    </div>

    <div className="story-hub-control-hint story-enter-3" aria-hidden="true">
      <span>Move</span><b>← →</b><span>Run</span><b>Shift</b><span>Double Jump</span><b>Space ×2</b><span>Attack</span><b>U / J</b><span>Interact</span><b>K / Enter</b><span>Pause</span><b>Esc</b>
    </div>

    <div className="story-touch-controls" aria-label="Story hub touch controls">
      <div>
        <TouchButton label="Move left" action="left" setVirtualAction={setVirtualAction}><ArrowLeft /></TouchButton>
        <TouchButton label="Drop through platform" action="down" setVirtualAction={setVirtualAction}><ArrowDown /></TouchButton>
        <TouchButton label="Move right" action="right" setVirtualAction={setVirtualAction}><ArrowRight /></TouchButton>
      </div>
      <div className="story-touch-actions">
        <TouchButton label="Jump or double jump" action="jump" setVirtualAction={setVirtualAction}><ArrowUp /></TouchButton>
        <TouchButton label="Run" action="block" className="is-run" setVirtualAction={setVirtualAction}><Gauge /></TouchButton>
        <TouchButton label="Attack" action="jab" className="is-attack" setVirtualAction={setVirtualAction}><Swords /></TouchButton>
        <TouchButton label="Interact" action="confirm" className="is-interact" setVirtualAction={setVirtualAction}><DoorOpen /></TouchButton>
        <TouchButton label="Pause hub" action="pause" setVirtualAction={setVirtualAction}><Pause /></TouchButton>
      </div>
    </div>

    {pauseOpen && <div className="story-gate-overlay story-hub-pause-overlay" role="presentation">
      <section className="story-gate-dialog story-hub-pause-dialog" role="dialog" aria-modal="true" aria-labelledby="story-hub-pause-title">
        <div className="story-gate-lock"><Pause size={30} /></div>
        <span>K.O.R.E. Central</span>
        <h2 id="story-hub-pause-title">Hub Paused</h2>
        <p>Your online preference is saved on this device. Going offline removes your avatar from the shared hub immediately.</p>
        <button type="button" className="story-primary-button" autoFocus onClick={closePause}><Play size={19} /> Resume</button>
        <button type="button" className="story-pause-edit" onClick={editAvatarFromPause}><Pencil size={19} /> Edit Avatar</button>
        <button type="button" className={`story-online-toggle ${onlineEnabled ? 'is-online' : 'is-offline'}`} role="switch" aria-checked={onlineEnabled} onClick={toggleOnline}>
          <span aria-hidden="true"><Wifi size={19} /><WifiOff size={19} /></span>
          <span><strong>{onlineEnabled ? 'Online' : 'Offline'}</strong><small>{onlineEnabled ? 'Visible in the shared world' : 'Playing privately'}</small></span>
        </button>
        <button type="button" className="story-pause-exit" onClick={onExit}><LogOut size={19} /> Return to Main Menu</button>
      </section>
    </div>}

    {storyLockedOpen && <div className="story-gate-overlay" role="presentation">
      <section className="story-gate-dialog" role="dialog" aria-modal="true" aria-labelledby="story-gate-title">
        <div className="story-gate-lock"><LockKeyhole size={30} /></div>
        <span>Story Gate</span>
        <h2 id="story-gate-title">The route is still sealed</h2>
        <p>K.O.R.E. Central is open, but Chapter One is still being prepared. Explore the hub and train for what comes next.</p>
        <button type="button" className="story-primary-button" autoFocus onClick={() => setStoryLockedOpen(false)}><X size={19} /> Return to Hub</button>
      </section>
    </div>}
  </div>;
}

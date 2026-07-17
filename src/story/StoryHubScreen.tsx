import { Html, OrthographicCamera, useTexture } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { CuboidCollider, Physics, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { Activity, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BarChart3, BookOpen, Brain, CheckCircle2, Clock3, ContactRound, Crosshair, DoorOpen, Dumbbell, Footprints, Gamepad2, Gauge, Globe2, Handshake, Heart, History, Keyboard, LockKeyhole, LogOut, Map, Palette, Pause, Pencil, Play, Plus, RotateCcw, Settings, Shield, Sparkles, Swords, Trophy, UserPlus, UserRound, UsersRound, Wifi, WifiOff, X, XCircle, Zap, type LucideIcon } from 'lucide-react';
import { Suspense, type CSSProperties, type MutableRefObject, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OnlinePlayerProfile } from '../lib/online/leaderboard';
import { addFriendEntry, isFriend, readMatchHistory } from '../lib/socialHistory';
import type { InputFrame } from '../types';
import { STORY_ADVENTURE_ASSET_PATHS, STORY_ENEMY_SPRITE_PATHS, storyWorldAssetPath } from './adventureAssets';
import { adventureAttackHits, createAdventureDamageFeedback, createAdventureHitReaction, getAdventureEnemyStats, resolveAdventurePlayerAttack, resolveAdventurePlayerDamage, shouldRespawnAdventureEnemy, stepAdventureProjectile, type AdventureDamageFeedback } from './adventureCombat';
import { STORY_ADVENTURE_STAT_CAP, STORY_ADVENTURE_STAT_KEYS, allocateAdventureStat, awardAdventureExperience, canRespecAdventureStats, experienceToNextLevel, getAdventureDerivedStats, readAdventureProgress, respecAdventureStats, writeAdventureProgress, type StoryAdventureProgressV1, type StoryAdventureStatKey } from './adventureProgress';
import { STORY_ADVENTURE_REGION_IDS, STORY_ADVENTURE_REGION_LABELS, STORY_WORLDS, isStoryAdventureRegionId, isStoryAdventureWorldId, isStoryWorldId } from './adventureWorlds';
import { STORY_GROUNDED_ACTOR_CENTER_Y, storyAvatarGroundingOffsetForWorld } from './actorGrounding';
import { connectStoryHubMultiplayer, readOrCreateStoryHubGuestIdentity, readStoryHubOnlinePreference, STORY_HUB_CHALLENGE_TIMEOUT_MS, writeStoryHubOnlinePreference, type StoryHubMultiplayerSession } from './hubMultiplayer';
import { KORE_CENTRAL_HUB } from './hubData';
import { storyPlatformSurfacePlacement } from './platformGrounding';
import { getStorySpriteAnimationDurationMs } from './streetAvatarCatalog';
import { StoryAvatarRig, type StoryAvatarPose } from './StoryAvatarRig';
import type { HubDestination, StoryEnemySpawnDefinition, StoryHubChallenge, StoryHubConnectionStatus, StoryHubDefinition, StoryHubPlayerState, StoryHubPresence, StoryPlatformDefinition, StoryPortalDefinition, StoryPortalDestination, StoryProfileV4, StoryWorldBackdropLayerDefinition, StoryWorldId, StoryWorldLandmarkDefinition, StoryWorldPropDefinition, StoryWorldThemeId } from './types';

type StoryHubInput = Pick<InputFrame, 'left' | 'right' | 'down' | 'up' | 'jump' | 'confirm' | 'jab' | 'kick' | 'heavy' | 'special' | 'block' | 'back' | 'pause'>;
type SetVirtualAction = (player: 1 | 2, action: keyof InputFrame, pressed: boolean) => void;

const CITY_ASSET_ROOT = '/story/hub/warped-city-2';
const PORTAL_ASSET_ROOT = '/story/hub/warped-city-portals';
const DOOR_ASSET_ROOT = '/story/hub/door-transitions';
const ARCADE_ASSET_ROOT = '/story/hub/arcade-machines';
const MODE_DOOR_BASELINE_OFFSET_Y = -0.62;
const DOOR_TRAVEL_FRAME_SEQUENCE = [0, 1, 2, 3, 4, 5, 5, 4, 3, 2, 1, 0, 0, 1, 2, 3, 4, 5, 5, 4, 3, 2, 1, 0] as const;

const DESTINATION_ICONS: Record<StoryPortalDestination, LucideIcon> = {
  central: Map,
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
  exit: LogOut,
  'world-route': Map,
  greenhollow: Heart,
  thornwood: Sparkles,
  ironroot: Activity,
  bonevault: Shield,
  emberdeep: Zap,
  frostpeak: Sparkles,
  sunscar: Activity,
  skyglass: Crosshair
};

const DESTINATION_STOREFRONTS: Record<HubDestination, string> = {
  central: 'online.png',
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

function isHubDestination(value: string): value is HubDestination {
  return Object.prototype.hasOwnProperty.call(DESTINATION_STOREFRONTS, value);
}

type StoryAdventureAttackEvent = { id: number; x: number; y: number; facing: -1 | 1; damage: number; critical: boolean };
type StoryPlayerImpactEvent = { id: number; sourceX: number; knockback: number; respawn?: [number, number] };

function configurePixelTexture(texture: THREE.Texture, repeatX = 1, repeatY = 1) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = repeatY === 1 ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.needsUpdate = true;
  return texture;
}

function PixelLayer({ path, position, size, repeatX, opacity = 1, color = '#ffffff' }: { path: string; position: [number, number, number]; size: [number, number]; repeatX: number; opacity?: number; color?: string }) {
  const source = useTexture(path);
  const texture = useMemo(() => configurePixelTexture(source.clone(), repeatX), [repeatX, source]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={position}>
    <planeGeometry args={size} />
    <meshBasicMaterial map={texture} color={color} transparent opacity={opacity} alphaTest={0.02} depthWrite={false} toneMapped={false} />
  </mesh>;
}

function PixelProp({ path, position, size, mirrored = false, opacity = 1 }: { path: string; position: [number, number, number]; size: [number, number]; mirrored?: boolean; opacity?: number }) {
  const texture = useTexture(path);
  useMemo(() => {
    configurePixelTexture(texture);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
  }, [texture]);
  return <mesh position={position} scale={[mirrored ? -1 : 1, 1, 1]}>
    <planeGeometry args={size} />
    <meshBasicMaterial map={texture} transparent opacity={opacity} alphaTest={0.02} depthWrite={false} toneMapped={false} />
  </mesh>;
}

function atlasGeometry(frame: [number, number, number, number], atlasSize: [number, number], size: [number, number]) {
  const geometry = new THREE.PlaneGeometry(size[0], size[1]);
  const [x, y, width, height] = frame;
  const [atlasWidth, atlasHeight] = atlasSize;
  const u0 = x / atlasWidth;
  const u1 = (x + width) / atlasWidth;
  const v0 = 1 - (y + height) / atlasHeight;
  const v1 = 1 - y / atlasHeight;
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  uv.setXY(0, u0, v1);
  uv.setXY(1, u1, v1);
  uv.setXY(2, u0, v0);
  uv.setXY(3, u1, v0);
  uv.needsUpdate = true;
  return geometry;
}

function CroppedAtlasSprite({ prop }: { prop: StoryWorldPropDefinition }) {
  const source = useTexture(storyWorldAssetPath(prop.asset));
  useMemo(() => configurePixelTexture(source), [source]);
  const geometry = useMemo(() => atlasGeometry(prop.frame, prop.atlasSize, prop.size), [prop.atlasSize, prop.frame, prop.size]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh position={prop.position} scale={[prop.mirrored ? -1 : 1, 1, 1]} geometry={geometry}>
    <meshBasicMaterial map={source} transparent opacity={prop.opacity ?? 1} alphaTest={0.02} depthWrite={false} toneMapped={false} />
  </mesh>;
}

function AtlasSprite({ prop }: { prop: StoryWorldPropDefinition }) {
  const fullImage = prop.frame[0] === 0 && prop.frame[1] === 0 && prop.frame[2] === prop.atlasSize[0] && prop.frame[3] === prop.atlasSize[1];
  return fullImage
    ? <PixelProp path={storyWorldAssetPath(prop.asset)} position={prop.position} size={prop.size} mirrored={prop.mirrored} opacity={prop.opacity} />
    : <CroppedAtlasSprite prop={prop} />;
}

type AdventureThemeId = Exclude<StoryWorldThemeId, 'city' | 'arcade' | 'versus' | 'online' | 'training' | 'tournament'>;

const THEME_STYLE: Record<AdventureThemeId, { background: string; haze: string; light: string; ground: string; tile: [number, number, number, number] }> = {
  route: { background: '#10243a', haze: '#2a6f78', light: '#ffe071', ground: '#294a45', tile: [96, 0, 16, 16] },
  village: { background: '#163127', haze: '#3d7043', light: '#7ee787', ground: '#345d38', tile: [96, 0, 16, 16] },
  forest: { background: '#0b201d', haze: '#1f4b38', light: '#52e1a1', ground: '#243e2e', tile: [112, 0, 16, 16] },
  mine: { background: '#211a1c', haze: '#5d3b2e', light: '#d9a066', ground: '#4a3430', tile: [96, 56, 16, 16] },
  crypt: { background: '#141424', haze: '#34304f', light: '#b8a8ff', ground: '#353248', tile: [0, 0, 16, 16] },
  underworld: { background: '#2a0e18', haze: '#7d271f', light: '#ff6b45', ground: '#5b2625', tile: [112, 56, 16, 16] },
  snow: { background: '#10223d', haze: '#386a8c', light: '#8ee8ff', ground: '#d8f4ff', tile: [0, 0, 16, 16] },
  desert: { background: '#382217', haze: '#9a6032', light: '#ffd166', ground: '#8a603c', tile: [96, 112, 16, 16] },
  ruins: { background: '#28173e', haze: '#68458d', light: '#ff83d1', ground: '#6c4576', tile: [192, 0, 16, 16] }
};

function adventureTheme(themeId?: StoryWorldThemeId) {
  return themeId && Object.prototype.hasOwnProperty.call(THEME_STYLE, themeId) ? THEME_STYLE[themeId as AdventureThemeId] : THEME_STYLE.route;
}

function useParallax(group: MutableRefObject<THREE.Group | null>, amount: number) {
  const { camera } = useThree();
  useFrame(() => {
    if (group.current) group.current.position.x = camera.position.x * amount;
  });
}

function AssetBackdropLayer({ layer, worldWidth }: { layer: StoryWorldBackdropLayerDefinition; worldWidth: number }) {
  const group = useRef<THREE.Group>(null);
  const instances = useRef<THREE.InstancedMesh>(null);
  useParallax(group, layer.parallax);
  const source = useTexture(storyWorldAssetPath(layer.asset!));
  useMemo(() => {
    configurePixelTexture(source);
    source.wrapS = THREE.ClampToEdgeWrapping;
    source.wrapT = THREE.ClampToEdgeWrapping;
    source.needsUpdate = true;
  }, [source]);
  const tileWidth = layer.repeatEvery ?? 12;
  const count = Math.min(80, Math.max(3, Math.ceil((worldWidth + 48) / tileWidth) + 1));
  useLayoutEffect(() => {
    if (!instances.current) return;
    const matrix = new THREE.Matrix4();
    const startX = -(count * tileWidth) / 2 + tileWidth / 2;
    for (let index = 0; index < count; index += 1) {
      matrix.makeTranslation(startX + index * tileWidth, layer.y, layer.depth);
      instances.current.setMatrixAt(index, matrix);
    }
    instances.current.instanceMatrix.needsUpdate = true;
  }, [count, layer.depth, layer.y, tileWidth]);
  return <group ref={group}>
    <instancedMesh ref={instances} args={[undefined, undefined, count]}>
      <planeGeometry args={[tileWidth + 0.015, layer.height]} />
      <meshBasicMaterial map={source} color={layer.color} transparent opacity={layer.opacity} alphaTest={0.02} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  </group>;
}

function MotifBackdropLayer({ layer, bounds }: { layer: StoryWorldBackdropLayerDefinition; bounds: StoryHubDefinition['bounds'] }) {
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.InstancedMesh>(null);
  useParallax(group, layer.parallax);
  const repeatEvery = layer.repeatEvery ?? 6;
  const count = Math.min(72, Math.ceil((bounds.maxX - bounds.minX + 160) / repeatEvery));
  const shapes = useMemo(() => Array.from({ length: count }, (_, index) => {
    const motifFactor = layer.motif === 'forest' ? 1.18 : layer.motif === 'servers' || layer.motif === 'laboratory' ? 0.8 : layer.motif === 'mountains' || layer.motif === 'volcanic' ? 1.25 : 1;
    const height = layer.height * (0.28 + ((index * 7) % 9) / 16) * motifFactor;
    const angled = layer.motif === 'mountains' || layer.motif === 'volcanic' || layer.motif === 'dunes';
    const width = repeatEvery * (layer.motif === 'forest' ? 0.24 : angled ? 1.02 : 0.58 + (index % 3) * 0.12);
    return { x: bounds.minX - 80 + index * repeatEvery, width, height, rotation: angled ? Math.PI / 4 : 0 };
  }), [bounds.minX, count, layer.height, layer.motif, repeatEvery]);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const matrix = new THREE.Matrix4();
    shapes.forEach((shape, index) => {
      const baseY = layer.y - layer.height / 2;
      const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), shape.rotation);
      matrix.compose(new THREE.Vector3(shape.x, baseY + shape.height / 2, layer.depth), rotation, new THREE.Vector3(shape.width, shape.height, 1));
      mesh.current!.setMatrixAt(index, matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  }, [layer.depth, layer.height, layer.y, shapes]);
  return <group ref={group}>
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color={layer.color} transparent opacity={layer.opacity} depthWrite={false} />
    </instancedMesh>
  </group>;
}

function WorldBackdropLayer({ layer, hub }: { layer: StoryWorldBackdropLayerDefinition; hub: StoryHubDefinition }) {
  const worldWidth = hub.bounds.maxX - hub.bounds.minX;
  return layer.asset ? <AssetBackdropLayer layer={layer} worldWidth={worldWidth} /> : <MotifBackdropLayer layer={layer} bounds={hub.bounds} />;
}

function WorldLandmark({ landmark }: { landmark: StoryWorldLandmarkDefinition }) {
  const [, height] = landmark.size;
  return <group position={landmark.position}>
    <mesh position={[0, -height * 0.48, 0.14]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.3, 0.48, 20]} />
      <meshBasicMaterial color={landmark.color} transparent opacity={landmark.kind === 'secret' ? 0.32 : 0.58} depthWrite={false} />
    </mesh>
    <mesh position={[0, -height * 0.08, 0.08]}>
      <planeGeometry args={[0.035, Math.max(1.8, height * 0.52)]} />
      <meshBasicMaterial color={landmark.color} transparent opacity={0.24} depthWrite={false} />
    </mesh>
    <Html center position={[0, 0.05, 0.45]} zIndexRange={[5, 0]} className="story-world-landmark-shell">
      <div className={`story-world-landmark is-${landmark.kind}`} style={{ '--story-landmark-color': landmark.color } as CSSProperties}>
        <small>{landmark.kind}</small><strong>{landmark.label}</strong><span>{landmark.subtitle}</span>
      </div>
    </Html>
  </group>;
}

function WorldParticles({ hub, reducedMotion }: { hub: StoryHubDefinition; reducedMotion: boolean }) {
  const environment = hub.environment!;
  const group = useRef<THREE.Group>(null);
  const width = hub.bounds.maxX - hub.bounds.minX;
  const particles = useMemo(() => Array.from({ length: Math.min(64, Math.max(28, Math.round(width / 2.5))) }, (_, index) => ({
    x: hub.bounds.minX + 2 + ((index * 13.7) % Math.max(4, width - 4)), y: 0.9 + ((index * 2.13) % 10), size: 0.035 + index % 4 * 0.018
  })), [hub.bounds.minX, width]);
  useFrame((state) => {
    if (!reducedMotion && group.current) {
      group.current.position.y = Math.sin(state.clock.elapsedTime * (environment.particle === 'snow' ? 0.2 : 0.42)) * 0.18;
      group.current.position.x = environment.particle === 'sand' ? Math.sin(state.clock.elapsedTime * 0.26) * 0.45 : 0;
    }
  });
  if (environment.particle === 'none') return null;
  return <group ref={group} position={[0, 0, -1.5]}>
    {particles.map((particle, index) => <mesh key={index} position={[particle.x, particle.y, 0]} scale={particle.size * (environment.particle === 'snow' ? 1.8 : 1)}>
      {environment.particle === 'data' ? <boxGeometry /> : environment.particle === 'snow' || environment.particle === 'sand' ? <circleGeometry args={[1, 4]} /> : <octahedronGeometry />}
      <meshBasicMaterial color={index % 4 === 0 ? '#ffffff' : environment.accent} transparent opacity={environment.particle === 'embers' ? 0.62 : 0.4} depthWrite={false} />
    </mesh>)}
  </group>;
}

function AuthoredWorld({ hub, reducedMotion }: { hub: StoryHubDefinition; reducedMotion: boolean }) {
  const environment = hub.environment!;
  return <>
    <color attach="background" args={[environment.background]} />
    <ambientLight intensity={1.18} />
    <pointLight position={[0, 6, 5]} color={environment.light} intensity={7} distance={38} />
    <mesh position={[0, 5, -16]}><planeGeometry args={[hub.bounds.maxX - hub.bounds.minX + 180, 28]} /><meshBasicMaterial color={environment.haze} transparent opacity={0.25} depthWrite={false} /></mesh>
    {environment.layers.map((layer) => <WorldBackdropLayer key={layer.id} layer={layer} hub={hub} />)}
    {hub.landmarks?.map((entry) => <WorldLandmark key={entry.id} landmark={entry} />)}
    {hub.props?.map((prop) => <AtlasSprite key={prop.id} prop={prop} />)}
    <WorldParticles hub={hub} reducedMotion={reducedMotion} />
  </>;
}

function CityHubWorld({ reducedMotion }: { reducedMotion: boolean }) {
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

function HubWorld({ hub, reducedMotion }: { hub: StoryHubDefinition; reducedMotion: boolean }) {
  return hub.environment ? <AuthoredWorld hub={hub} reducedMotion={reducedMotion} /> : <CityHubWorld reducedMotion={reducedMotion} />;
}

function PackPlatformVisual({ platform, hub }: { platform: StoryPlatformDefinition; hub: StoryHubDefinition }) {
  const theme = adventureTheme(hub.theme);
  const surface = hub.environment?.surface;
  const source = useTexture(surface ? storyWorldAssetPath(surface.asset) : STORY_ADVENTURE_ASSET_PATHS['pixel-terrain']);
  useMemo(() => configurePixelTexture(source), [source]);
  const tileSize = platform.oneWay ? 0.9 : 1.05;
  const surfacePlacement = storyPlatformSurfacePlacement(platform, surface);
  const count = Math.max(1, Math.ceil(platform.size[0] / tileSize));
  const frame = surface?.frame ?? theme.tile;
  const atlasSize = surface?.atlasSize ?? [352, 176];
  const geometry = useMemo(() => atlasGeometry(frame, atlasSize, [tileSize + 0.03, surfacePlacement.height]), [atlasSize, frame, surfacePlacement.height, tileSize]);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ map: source, transparent: true, alphaTest: 0.02, toneMapped: false }), [source]);
  const instances = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!instances.current) return;
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < count; index += 1) {
      const x = -platform.size[0] / 2 + tileSize / 2 + index * tileSize;
      matrix.makeTranslation(x, surfacePlacement.centerY, 0.24);
      instances.current.setMatrixAt(index, matrix);
    }
    instances.current.instanceMatrix.needsUpdate = true;
  }, [count, platform.size, surfacePlacement.centerY, tileSize]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  return <group>
    <mesh position={[0, platform.id === 'ground' ? -3.5 : 0, 0.06]}>
      <planeGeometry args={[platform.size[0], platform.id === 'ground' ? 7 : platform.size[1]]} />
      <meshBasicMaterial color={hub.environment?.ground ?? theme.ground} />
    </mesh>
    <instancedMesh ref={instances} args={[geometry, material, count]} />
  </group>;
}

function CityPlatformVisual({ platform, color = '#ffffff' }: { platform: StoryPlatformDefinition; color?: string }) {
  const source = useTexture(`${CITY_ASSET_ROOT}/ground-platform.png`);
  const fillSource = useTexture(`${CITY_ASSET_ROOT}/ground-fill.png`);
  const tileWorldWidth = 2;
  const visualHeight = 1;
  const repeatX = Math.max(1, platform.size[0] / tileWorldWidth);
  const visualCenterY = platform.size[1] / 2 - visualHeight / 2;
  const texture = useMemo(() => configurePixelTexture(source.clone(), repeatX), [repeatX, source]);
  const fillDepth = platform.id === 'ground' ? 7 : 0;
  const fillTexture = useMemo(() => configurePixelTexture(fillSource.clone(), repeatX, Math.max(1, fillDepth / 2)), [fillDepth, fillSource, repeatX]);
  useEffect(() => () => { texture.dispose(); fillTexture.dispose(); }, [fillTexture, texture]);
  return <group>
    {fillDepth > 0 && <mesh position={[0, visualCenterY - visualHeight / 2 - fillDepth / 2 + 0.02, 0.08]}>
      <planeGeometry args={[platform.size[0], fillDepth]} />
      <meshBasicMaterial map={fillTexture} color={color} toneMapped={false} />
    </mesh>}
    <mesh position={[0, visualCenterY, 0.2]}>
      <planeGeometry args={[platform.size[0], visualHeight]} />
      <meshBasicMaterial map={texture} color={color} transparent alphaTest={0.02} toneMapped={false} />
    </mesh>
  </group>;
}

function PlatformVisual({ platform, hub }: { platform: StoryPlatformDefinition; hub: StoryHubDefinition }) {
  return hub.environment?.surface ? <PackPlatformVisual platform={platform} hub={hub} /> : <CityPlatformVisual platform={platform} color={hub.environment?.ground} />;
}

const CABINET_FRAMES = Array.from({ length: 16 }, (_, index) => `${ARCADE_ASSET_ROOT}/red-${String(index).padStart(2, '0')}.png`);

function AnimatedCabinet({ position = [0, 0, 0], mirrored = false, scale = 1, reducedMotion = false }: { position?: [number, number, number]; mirrored?: boolean; scale?: number; reducedMotion?: boolean }) {
  const textures = useTexture(CABINET_FRAMES) as THREE.Texture[];
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  useMemo(() => textures.forEach((texture) => configurePixelTexture(texture)), [textures]);
  useFrame((state) => {
    if (!materialRef.current) return;
    const next = reducedMotion ? textures[0] : textures[Math.floor(state.clock.elapsedTime * 9) % textures.length];
    if (materialRef.current.map !== next) materialRef.current.map = next;
  });
  return <mesh position={position} scale={[mirrored ? -scale : scale, scale, scale]} renderOrder={20}>
    <planeGeometry args={[2.25, 2.25]} />
    <meshBasicMaterial ref={materialRef} map={textures[0]} transparent alphaTest={0.02} toneMapped={false} depthWrite={false} />
  </mesh>;
}

function ModeDoor({ emphasized }: { emphasized: boolean }) {
  const texture = useTexture(`${DOOR_ASSET_ROOT}/frame-0.png`);
  useMemo(() => configurePixelTexture(texture), [texture]);
  return <mesh position={[0, MODE_DOOR_BASELINE_OFFSET_Y, -0.18]} scale={emphasized ? 1.06 : 1}>
    <planeGeometry args={[2.45, 3.4]} />
    <meshBasicMaterial map={texture} transparent alphaTest={0.02} toneMapped={false} />
  </mesh>;
}

function RecalibrationShrine({ emphasized, reducedMotion }: { emphasized: boolean; reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (group.current) group.current.rotation.z = reducedMotion ? 0 : Math.sin(state.clock.elapsedTime * 0.9) * 0.035;
  });
  return <group ref={group} position={[0, -0.24, -0.08]} scale={emphasized ? 1.08 : 1}>
    <mesh position={[0, -0.68, 0]}><cylinderGeometry args={[0.72, 0.92, 0.32, 6]} /><meshBasicMaterial color="#26364f" /></mesh>
    <mesh position={[0, 0.08, 0]}><octahedronGeometry args={[0.62]} /><meshBasicMaterial color="#ffe071" transparent opacity={0.94} /></mesh>
    <pointLight position={[0, 0.08, 0.5]} color="#ffe071" intensity={emphasized ? 5 : 2.5} distance={5} />
  </group>;
}

function Storefront({ destination, size, emphasized }: { destination: HubDestination; size: number; emphasized: boolean }) {
  const texture = useTexture(`${PORTAL_ASSET_ROOT}/${DESTINATION_STOREFRONTS[destination]}`);
  useMemo(() => configurePixelTexture(texture), [texture]);
  return <mesh position={[0, 0, -0.25]} scale={emphasized ? 1.06 : 1}>
    <planeGeometry args={[size, size]} />
    <meshBasicMaterial map={texture} transparent alphaTest={0.02} toneMapped={false} />
  </mesh>;
}

function PortalVisual({ portal, nearby, assigned, reducedMotion }: { portal: StoryPortalDefinition; nearby: boolean; assigned: boolean; reducedMotion: boolean }) {
  const hubDestination = isHubDestination(portal.destination) ? portal.destination : 'story';
  const DestinationIcon = DESTINATION_ICONS[portal.destination];
  const storefrontSize = portal.destination === 'story' ? 4.45 : portal.position[1] > 4 ? 3.15 : 3.55;
  return <group position={[portal.position[0], portal.position[1], 0]}>
    <mesh position={[0, -1.08, 0.04]} renderOrder={18}>
      <ringGeometry args={[0.68, portal.kind === 'mode-door' || portal.kind === 'adventure-gate' ? 0.98 : 0.86, 24]} />
      <meshBasicMaterial color={assigned ? '#ffe071' : portal.accent} transparent opacity={nearby || assigned ? 0.78 : 0.3} depthWrite={false} />
    </mesh>
    {(portal.kind === 'mode-door' || portal.kind === 'adventure-gate') && <mesh position={[0, -1.08, 0.035]} renderOrder={17}>
      <ringGeometry args={[1.08, 1.17, 24]} />
      <meshBasicMaterial color={portal.accent} transparent opacity={nearby ? 0.55 : 0.2} depthWrite={false} />
    </mesh>}
    {portal.kind === 'mode-door' || portal.kind === 'adventure-gate' ? <ModeDoor emphasized={nearby || assigned} /> : portal.kind === 'shrine' ? <RecalibrationShrine emphasized={nearby} reducedMotion={reducedMotion} /> : portal.kind === 'arcade-machine' ? <AnimatedCabinet position={[0, -0.14, 0]} scale={nearby || assigned ? 1.08 : 1} reducedMotion={reducedMotion} /> : portal.kind === 'versus-machine' ? <>
      <AnimatedCabinet position={[-0.56, -0.14, -0.18]} scale={nearby || assigned ? 0.94 : 0.88} reducedMotion={reducedMotion} />
      <AnimatedCabinet position={[0.56, -0.14, -0.16]} mirrored scale={nearby || assigned ? 0.94 : 0.88} reducedMotion={reducedMotion} />
    </> : portal.kind === 'terminal' ? <>
      <AnimatedCabinet position={[0, -0.14, 0]} scale={nearby || assigned ? 1.08 : 1} reducedMotion={reducedMotion} />
      <mesh position={[0, 0.04, 0.02]} renderOrder={22}><planeGeometry args={[0.72, 0.48]} /><meshBasicMaterial color={portal.accent} transparent opacity={0.42} depthWrite={false} /></mesh>
    </> : <Storefront destination={hubDestination} size={storefrontSize} emphasized={nearby} />}
    {assigned && <mesh position={[0, -1.08, 0.05]} renderOrder={23}><ringGeometry args={[0.72, 0.9, 24]} /><meshBasicMaterial color="#ffe071" transparent opacity={0.9} depthWrite={false} /></mesh>}
    <Html center position={[0, portal.size[1] / 2 + 0.52, 0.7]} zIndexRange={[8, 0]} className="story-destination-sign-shell">
      <div data-testid={`story-destination-${portal.id}`} className={`story-destination-sign ${nearby ? 'is-nearby' : ''} ${assigned ? 'is-assigned' : ''} ${portal.locked ? 'is-locked' : ''}`} style={{ '--story-destination-accent': portal.accent } as CSSProperties}>
        <span aria-hidden="true">{portal.locked ? <LockKeyhole size={16} /> : <DestinationIcon size={16} />}</span>
        <strong>{assigned ? `Go Here · ${portal.label}` : portal.label}</strong>
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

function RemoteStoryPlayer({ presence, reducedMotion, groundingOffsetY, lane, selected, onSelect }: {
  presence: StoryHubPresence;
  reducedMotion: boolean;
  groundingOffsetY: number;
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
    <group position={[0, groundingOffsetY, 0]}>
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

const DAWN_ENEMY_ATLASES: Record<'slime' | 'demon' | 'elemental' | 'reptile', [number, number]> = {
  slime: [128, 80],
  demon: [128, 144],
  elemental: [128, 176],
  reptile: [128, 248]
};

function EnemySprite({ sprite, facing, flashUntil }: { sprite: StoryEnemySpawnDefinition['sprite']; facing: -1 | 1; flashUntil: MutableRefObject<number> }) {
  const source = useTexture(STORY_ENEMY_SPRITE_PATHS[sprite]);
  const texture = useMemo(() => {
    const clone = source.clone();
    configurePixelTexture(clone);
    clone.wrapS = THREE.ClampToEdgeWrapping;
    clone.wrapT = THREE.ClampToEdgeWrapping;
    if (sprite === 'skeleton' || sprite === 'skeleton-mage' || sprite === 'orc' || sprite === 'orc-shaman') {
      clone.repeat.set(0.25, 1);
      clone.offset.set(0, 0);
    } else {
      const [width, height] = DAWN_ENEMY_ATLASES[sprite];
      clone.repeat.set(16 / width, 16 / height);
      clone.offset.set(0, 1 - 16 / height);
    }
    clone.needsUpdate = true;
    return clone;
  }, [source, sprite]);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const crawler = sprite === 'skeleton' || sprite === 'skeleton-mage' || sprite === 'orc' || sprite === 'orc-shaman';
  useFrame((state) => {
    if (crawler) texture.offset.x = (Math.floor(state.clock.elapsedTime * 5) % 4) * 0.25;
    if (material.current) material.current.color.set(performance.now() < flashUntil.current ? '#ff6f91' : '#ffffff');
  });
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh scale={[facing, 1, 1]}>
    <planeGeometry args={crawler ? [1.7, 1.7] : [1.45, 1.45]} />
    <meshBasicMaterial ref={material} map={texture} transparent alphaTest={0.02} depthWrite={false} toneMapped={false} />
  </mesh>;
}

type AdventureProjectileRuntime = { active: boolean; x: number; y: number; velocityX: number; velocityY: number; expiresAt: number };
type AdventureDamagePop = AdventureDamageFeedback & { id: number };

function AdventureEnemy({ spawn, level, playerPosition, attackEvent, reducedMotion, onPlayerDamage, onDefeated }: {
  spawn: StoryEnemySpawnDefinition;
  level: number;
  playerPosition: MutableRefObject<THREE.Vector3>;
  attackEvent: StoryAdventureAttackEvent | null;
  reducedMotion: boolean;
  onPlayerDamage: (damage: number, sourceX: number) => void;
  onDefeated: (xp: number) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const enemyBody = useRef<THREE.Group>(null);
  const damageLayer = useRef<THREE.Group>(null);
  const projectileMeshes = useRef<Array<THREE.Mesh | null>>([]);
  const projectiles = useRef<AdventureProjectileRuntime[]>(Array.from({ length: 3 }, () => ({ active: false, x: 0, y: 0, velocityX: 0, velocityY: 0, expiresAt: 0 })));
  const stats = useMemo(() => getAdventureEnemyStats(spawn.archetype, level), [level, spawn.archetype]);
  const x = useRef(spawn.position[0]);
  const y = useRef(spawn.position[1]);
  const facing = useRef<-1 | 1>(-1);
  const health = useRef(stats.maxHealth);
  const alive = useRef(true);
  const defeatedAt = useRef(0);
  const defeatLingerMs = useRef(190);
  const flashUntil = useRef(0);
  const shakeStartedAt = useRef(0);
  const shakeUntil = useRef(0);
  const shakeStrength = useRef(0);
  const shakeDirection = useRef<-1 | 1>(1);
  const staggerUntil = useRef(0);
  const lastAttackAt = useRef(0);
  const damageSequence = useRef(0);
  const damageTimers = useRef<number[]>([]);
  const [damagePops, setDamagePops] = useState<AdventureDamagePop[]>([]);
  const [visual, setVisual] = useState({ health: stats.maxHealth, alive: true, critical: false, facing: -1 as -1 | 1 });
  const { camera } = useThree();

  useEffect(() => {
    health.current = stats.maxHealth;
    alive.current = true;
    x.current = spawn.position[0];
    y.current = spawn.position[1];
    setDamagePops([]);
    setVisual({ health: stats.maxHealth, alive: true, critical: false, facing: -1 });
  }, [spawn.id, spawn.position, stats.maxHealth]);

  useEffect(() => () => damageTimers.current.forEach((timer) => window.clearTimeout(timer)), []);

  useEffect(() => {
    if (!attackEvent || !alive.current) return;
    for (const projectile of projectiles.current) {
      if (projectile.active && adventureAttackHits({ playerX: attackEvent.x, playerY: attackEvent.y, facing: attackEvent.facing, enemyX: projectile.x, enemyY: projectile.y })) projectile.active = false;
    }
    if (!adventureAttackHits({ playerX: attackEvent.x, playerY: attackEvent.y, facing: attackEvent.facing, enemyX: x.current, enemyY: y.current })) return;
    health.current = Math.max(0, health.current - attackEvent.damage);
    const hitAt = performance.now();
    const finishing = health.current <= 0;
    const popId = ++damageSequence.current;
    const feedback = createAdventureDamageFeedback({ damage: attackEvent.damage, critical: attackEvent.critical, finishing, sequence: popId, reducedMotion });
    const reaction = createAdventureHitReaction(attackEvent.critical, reducedMotion);
    setDamagePops((current) => [...current.slice(-3), { id: popId, ...feedback }]);
    const damageTimer = window.setTimeout(() => {
      setDamagePops((current) => current.filter((pop) => pop.id !== popId));
      damageTimers.current = damageTimers.current.filter((timer) => timer !== damageTimer);
    }, feedback.durationMs);
    damageTimers.current.push(damageTimer);
    x.current += attackEvent.facing * 0.46;
    flashUntil.current = hitAt + (reducedMotion ? 90 : 240);
    shakeStartedAt.current = hitAt;
    shakeUntil.current = hitAt + reaction.shakeDurationMs;
    shakeStrength.current = reaction.shakeStrength;
    shakeDirection.current = attackEvent.facing;
    staggerUntil.current = hitAt + reaction.staggerMs;
    defeatLingerMs.current = reaction.defeatLingerMs;
    if (health.current <= 0) {
      alive.current = false;
      defeatedAt.current = hitAt;
      setVisual({ health: 0, alive: false, critical: attackEvent.critical, facing: facing.current });
      onDefeated(stats.xp);
      return;
    }
    setVisual({ health: health.current, alive: true, critical: attackEvent.critical, facing: facing.current });
  }, [attackEvent, onDefeated, reducedMotion, stats.xp]);

  useFrame((state, frameDelta) => {
    const now = performance.now();
    const delta = Math.min(frameDelta, 1 / 30);
    if (!group.current) return;
    if (damageLayer.current) damageLayer.current.position.set(x.current, y.current, 0.9);
    if (enemyBody.current) {
      if (!reducedMotion && now < shakeUntil.current) {
        const duration = Math.max(1, shakeUntil.current - shakeStartedAt.current);
        const progress = THREE.MathUtils.clamp((now - shakeStartedAt.current) / duration, 0, 1);
        const envelope = 1 - progress;
        const wave = Math.sin(progress * Math.PI * 7);
        enemyBody.current.position.x = wave * shakeStrength.current * envelope * shakeDirection.current;
        enemyBody.current.position.y = Math.abs(wave) * shakeStrength.current * 0.18 * envelope;
        enemyBody.current.rotation.z = wave * 0.065 * envelope;
      } else {
        enemyBody.current.position.set(0, 0, 0);
        enemyBody.current.rotation.z = 0;
      }
    }
    if (!alive.current) {
      group.current.visible = now - defeatedAt.current < defeatLingerMs.current;
      const onScreen = Math.abs(x.current - camera.position.x) < 12;
      if (shouldRespawnAdventureEnemy(now, defeatedAt.current, onScreen)) {
        alive.current = true;
        health.current = stats.maxHealth;
        x.current = spawn.position[0];
        y.current = spawn.position[1];
        setVisual({ health: stats.maxHealth, alive: true, critical: false, facing: facing.current });
      }
      return;
    }
    group.current.visible = true;
    const playerX = playerPosition.current.x;
    const playerY = playerPosition.current.y;
    const dx = playerX - x.current;
    const distance = Math.abs(dx);
    const direction = dx >= 0 ? 1 : -1;
    let move = 0;
    if (spawn.archetype === 'ranged') {
      if (distance < 3.7) move = -direction;
      else if (distance > 6.5 && distance < 10) move = direction;
      if (distance < 9 && Math.abs(playerY - y.current) < 4 && now - lastAttackAt.current >= stats.attackCooldownMs) {
        const projectile = projectiles.current.find((candidate) => !candidate.active);
        if (projectile) {
          projectile.active = true;
          projectile.x = x.current;
          projectile.y = y.current + 0.15;
          projectile.velocityX = direction * 5.4;
          projectile.velocityY = (playerY - y.current) * 0.28;
          projectile.expiresAt = now + 2_400;
          lastAttackAt.current = now;
        }
      }
    } else if (distance < (spawn.archetype === 'flying' ? 9 : 7)) {
      move = direction;
    } else {
      move = Math.sin(state.clock.elapsedTime * 0.72 + spawn.position[0]) >= 0 ? 1 : -1;
    }
    if (now >= staggerUntil.current) x.current += move * stats.speed * delta;
    x.current = THREE.MathUtils.clamp(x.current, spawn.position[0] - spawn.patrolRadius * 2.5, spawn.position[0] + spawn.patrolRadius * 2.5);
    if (move !== 0 && facing.current !== (move > 0 ? 1 : -1)) {
      facing.current = move > 0 ? 1 : -1;
      setVisual((current) => ({ ...current, facing: facing.current }));
    }
    y.current = spawn.archetype === 'flying' && !reducedMotion ? spawn.position[1] + Math.sin(state.clock.elapsedTime * 2.1 + spawn.position[0]) * 0.34 : spawn.position[1];
    group.current.position.set(x.current, y.current, 0.42);

    if (spawn.archetype !== 'ranged' && Math.abs(playerX - x.current) < 0.72 && Math.abs(playerY - y.current) < 1.05 && now - lastAttackAt.current >= stats.attackCooldownMs) {
      lastAttackAt.current = now;
      onPlayerDamage(stats.damage, x.current);
    }
    projectiles.current.forEach((projectile, index) => {
      const mesh = projectileMeshes.current[index];
      if (!mesh) return;
      if (!projectile.active || now >= projectile.expiresAt) {
        projectile.active = false;
        mesh.visible = false;
        return;
      }
      const next = stepAdventureProjectile({ ...projectile, deltaSeconds: delta });
      projectile.x = next.x;
      projectile.y = next.y;
      mesh.visible = true;
      mesh.position.set(projectile.x, projectile.y, 0.58);
      if (Math.abs(playerX - projectile.x) < 0.55 && Math.abs(playerY - projectile.y) < 0.8) {
        projectile.active = false;
        mesh.visible = false;
        onPlayerDamage(stats.damage, projectile.x);
      }
    });
  });

  return <>
    <group ref={group} position={[spawn.position[0], spawn.position[1], 0.42]} name={`story-enemy-${spawn.id}`}>
      <group ref={enemyBody}>
        <EnemySprite sprite={spawn.sprite} facing={visual.facing} flashUntil={flashUntil} />
      </group>
      <Html center position={[0, 1.18, 0.3]} zIndexRange={[7, 0]} className="story-enemy-bar-shell">
        <div className={`story-enemy-bar ${visual.critical ? 'is-critical' : ''}`} data-testid={`story-enemy-health-${spawn.id}`}>
          <span><i style={{ width: `${Math.max(0, visual.health / stats.maxHealth) * 100}%` }} /></span>
          <small>{spawn.name} · Lv {level}</small>
        </div>
      </Html>
    </group>
    <group ref={damageLayer} position={[spawn.position[0], spawn.position[1], 0.9]}>
      {damagePops.map((pop) => <Html key={pop.id} center position={[0, 1.02, 0.7]} zIndexRange={[10, 0]} className="story-enemy-damage-shell">
        <output
          className={`story-enemy-damage palette-${(pop.id - 1) % 5} ${pop.critical ? 'is-critical' : ''} ${pop.finishing ? 'is-finishing' : ''} ${reducedMotion ? 'is-reduced-motion' : ''}`}
          data-testid={`story-enemy-damage-${spawn.id}-${pop.id}`}
          aria-label={`${pop.damage} damage${pop.critical ? ', critical hit' : ''}${pop.finishing ? ', finishing hit' : ''}`}
          style={{ '--story-damage-accent': spawn.accent, '--story-damage-x': `${pop.offsetX}px`, '--story-damage-end-x': `${pop.endOffsetX}px` } as CSSProperties}
        >
          <span>{pop.damage}</span>
          {pop.critical && <small>{pop.finishing ? 'FINISH!' : 'CRITICAL!'}</small>}
        </output>
      </Html>)}
    </group>
    {projectiles.current.map((_, index) => <mesh key={index} ref={(mesh) => { projectileMeshes.current[index] = mesh; }} visible={false}>
      <circleGeometry args={[0.18, 8]} />
      <meshBasicMaterial color={spawn.accent} />
    </mesh>)}
  </>;
}

function AdventureEnemies(props: Omit<Parameters<typeof AdventureEnemy>[0], 'spawn'> & { spawns: StoryEnemySpawnDefinition[] }) {
  const { spawns, ...enemyProps } = props;
  return <>{spawns.map((spawn) => <AdventureEnemy key={spawn.id} spawn={spawn} {...enemyProps} />)}</>;
}

function StoryPlayerController({ hub, avatar, avatarVisible, groundingOffsetY, playerPosition, readInput, disabled, reducedMotion, quickMatchAvailable, derivedStats, impactEvent, onAttack, onQuickMatch, onNearbyPortal, onActivatePortal, onExit, onPause, onStateSample, onReady }: {
  hub: StoryHubDefinition;
  avatar: StoryProfileV4['avatar'];
  avatarVisible: boolean;
  groundingOffsetY: number;
  playerPosition: MutableRefObject<THREE.Vector3>;
  readInput: () => StoryHubInput;
  disabled: boolean;
  reducedMotion: boolean;
  quickMatchAvailable: boolean;
  derivedStats: ReturnType<typeof getAdventureDerivedStats>;
  impactEvent: StoryPlayerImpactEvent | null;
  onAttack: (x: number, y: number, facing: -1 | 1) => void;
  onQuickMatch: () => void;
  onNearbyPortal: (portal: StoryPortalDefinition | null) => void;
  onActivatePortal: (portal: StoryPortalDefinition) => void;
  onExit: () => void;
  onPause: () => void;
  onStateSample: (state: StoryHubPlayerState) => void;
  onReady?: () => void;
}) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const avatarGroup = useRef<THREE.Group>(null);
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
  const flashUntil = useRef(0);
  const attackDurationSeconds = useMemo(
    () => (getStorySpriteAnimationDurationMs(avatar.avatarSet, 'attack') + 100) / 1000,
    [avatar.avatarSet],
  );

  useEffect(() => onReady?.(), [onReady]);
  useEffect(() => {
    if (!impactEvent) return;
    flashUntil.current = performance.now() + (reducedMotion ? 90 : 420);
    if (impactEvent.respawn) {
      position.current = { x: impactEvent.respawn[0], y: impactEvent.respawn[1] };
      velocityY.current = 0;
      groundedUntil.current = 0;
      groundedPlatform.current = 'ground';
      playerPosition.current.set(impactEvent.respawn[0], impactEvent.respawn[1], 0);
      bodyRef.current?.setNextKinematicTranslation({ x: impactEvent.respawn[0], y: impactEvent.respawn[1], z: 0 });
      return;
    }
    const direction = position.current.x >= impactEvent.sourceX ? 1 : -1;
    position.current.x = THREE.MathUtils.clamp(position.current.x + direction * impactEvent.knockback, hub.bounds.minX + 0.5, hub.bounds.maxX - 0.5);
  }, [hub.bounds.maxX, hub.bounds.minX, impactEvent, playerPosition, reducedMotion]);
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
    if (!actionInputArmed.current && !disabled) {
      if (!jumpPressed && !interactPressed && !attackPressed && !backPressed && !pausePressed) releasedInputFrames.current += 1;
      else releasedInputFrames.current = 0;
      if (releasedInputFrames.current >= 2) actionInputArmed.current = true;
    }

    if (backEdge) onExit();
    if (pauseEdge) onPause();
    if (attackEdge && attackUntil.current <= now) {
      attackUntil.current = now + attackDurationSeconds;
      onAttack(position.current.x, position.current.y, facing.current);
    }
    const standingPlatform = groundedPlatform.current
      ? hub.platforms.find((platform) => platform.id === groundedPlatform.current)
      : undefined;
    const droppingThrough = Boolean(input.down && standingPlatform?.oneWay && groundedUntil.current >= now);
    if (droppingThrough) {
      dropThroughUntil.current = now + 0.28;
      groundedPlatform.current = null;
      groundedUntil.current = 0;
      position.current.y -= 0.12;
      velocityY.current = -2.2;
      jumpBufferedUntil.current = 0;
    } else if (jumpEdge && groundedUntil.current < now && jumpsUsed.current < 2) {
      velocityY.current = 11.4;
      jumpsUsed.current = 2;
      groundedPlatform.current = null;
      groundedUntil.current = 0;
      jumpBufferedUntil.current = 0;
    } else if (jumpEdge) {
      jumpBufferedUntil.current = now + 0.12;
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
    const moveSpeed = sprinting ? derivedStats.sprintSpeed : derivedStats.walkSpeed;
    let nextX = THREE.MathUtils.clamp(position.current.x + horizontal * moveSpeed * delta, hub.bounds.minX + 0.5, hub.bounds.maxX - 0.5);
    let nextY = position.current.y + velocityY.current * delta;
    let landing: StoryPlatformDefinition | null = null;
    let landingX = nextX;
    if (velocityY.current <= 0) {
      for (const platform of hub.platforms) {
        if (platform.oneWay && now < dropThroughUntil.current) continue;
        const top = platform.position[1] + platform.size[1] / 2;
        const previousBottom = position.current.y - STORY_GROUNDED_ACTOR_CENTER_Y;
        const nextBottom = nextY - STORY_GROUNDED_ACTOR_CENTER_Y;
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
      nextY = landing.position[1] + landing.size[1] / 2 + STORY_GROUNDED_ACTOR_CENTER_Y;
      velocityY.current = 0;
      groundedUntil.current = now + 0.1;
      groundedPlatform.current = landing.id;
      jumpsUsed.current = 0;
    }
    if (nextY < hub.bounds.floorY + STORY_GROUNDED_ACTOR_CENTER_Y) {
      nextY = hub.bounds.floorY + STORY_GROUNDED_ACTOR_CENTER_Y;
      velocityY.current = 0;
      groundedUntil.current = now + 0.1;
      groundedPlatform.current = 'ground';
      jumpsUsed.current = 0;
    }
    position.current = { x: nextX, y: nextY };
    playerPosition.current.set(nextX, nextY, 0);
    bodyRef.current?.setNextKinematicTranslation({ x: nextX, y: nextY, z: 0 });
    if (avatarGroup.current) avatarGroup.current.visible = avatarVisible && (performance.now() >= flashUntil.current || Math.floor(performance.now() / 70) % 2 === 0);

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
    else if (interactEdge && quickMatchAvailable) onQuickMatch();
    if (now - lastSampleAt.current > 0.12) {
      lastSampleAt.current = now;
      onStateSample({ x: nextX, y: nextY, pose: nextPose, facing: facing.current });
    }
    previousButtons.current = { jump: jumpPressed, interact: interactPressed, attack: attackPressed, back: backPressed, pause: pausePressed };
  });

  return <RigidBody ref={bodyRef} type="kinematicPosition" position={[hub.spawn[0], hub.spawn[1], 0]} colliders={false} enabledRotations={[false, false, false]}>
    <CuboidCollider args={[0.36, 0.8, 0.3]} />
    <group ref={avatarGroup} position={[0, groundingOffsetY, 0]} visible={avatarVisible}>
      <StoryAvatarRig avatar={avatar} pose={visualState.pose} facing={visualState.facing} reducedMotion={reducedMotion} />
    </group>
  </RigidBody>;
}

function HubCanvas({ hub, profile, reducedMotion, readInput, disabled, avatarVisible, quickMatchAvailable, assignedPortalId, nearbyPortal, remotePlayers, selectedPlayerSessionId, progress, attackEvent, impactEvent, onAttack, onPlayerDamage, onEnemyDefeated, onQuickMatch, onSelectPlayer, onNearbyPortal, onActivatePortal, onExit, onPause, onStateSample, onReady }: {
  hub: StoryHubDefinition;
  profile: StoryProfileV4;
  reducedMotion: boolean;
  readInput: () => StoryHubInput;
  disabled: boolean;
  avatarVisible: boolean;
  quickMatchAvailable: boolean;
  assignedPortalId?: string;
  onQuickMatch: () => void;
  nearbyPortal: StoryPortalDefinition | null;
  remotePlayers: StoryHubPresence[];
  selectedPlayerSessionId?: string;
  progress: StoryAdventureProgressV1;
  attackEvent: StoryAdventureAttackEvent | null;
  impactEvent: StoryPlayerImpactEvent | null;
  onAttack: (x: number, y: number, facing: -1 | 1) => void;
  onPlayerDamage: (damage: number, sourceX: number) => void;
  onEnemyDefeated: (xp: number) => void;
  onSelectPlayer: (presence: StoryHubPresence) => void;
  onNearbyPortal: (portal: StoryPortalDefinition | null) => void;
  onActivatePortal: (portal: StoryPortalDefinition) => void;
  onExit: () => void;
  onPause: () => void;
  onStateSample: (state: StoryHubPlayerState) => void;
  onReady: () => void;
}) {
  const playerPosition = useRef(new THREE.Vector3(hub.spawn[0], hub.spawn[1], 0));
  const derivedStats = useMemo(() => getAdventureDerivedStats(progress), [progress]);
  const groundingOffsetY = storyAvatarGroundingOffsetForWorld(Boolean(hub.enemySpawns?.some((enemy) => enemy.archetype !== 'flying')));
  return <Canvas shadows dpr={[0.65, 1.25]} gl={{ antialias: true, powerPreference: 'high-performance' }} data-testid="story-hub-canvas">
    <OrthographicCamera makeDefault position={[hub.spawn[0], 4.6, 18]} zoom={58} near={0.1} far={100} />
    <HubCamera playerPosition={playerPosition} bounds={hub.bounds} />
    <Suspense fallback={null}>
      <HubWorld hub={hub} reducedMotion={reducedMotion} />
      <Physics gravity={[0, -22, 0]} timeStep="vary">
        {hub.platforms.map((platform) => <RigidBody key={platform.id} type="fixed" colliders={false} position={[platform.position[0], platform.position[1], 0]}>
          <CuboidCollider args={[platform.size[0] / 2, platform.size[1] / 2, 1]} sensor={Boolean(platform.oneWay)} />
          <PlatformVisual platform={platform} hub={hub} />
        </RigidBody>)}
        {hub.portals.map((portal) => <PortalVisual key={portal.id} portal={portal} nearby={nearbyPortal?.id === portal.id} assigned={assignedPortalId === portal.id} reducedMotion={reducedMotion} />)}
        {remotePlayers.map((presence, index) => <RemoteStoryPlayer key={presence.sessionId} presence={presence} reducedMotion={reducedMotion} groundingOffsetY={groundingOffsetY} lane={index % 5} selected={selectedPlayerSessionId === presence.sessionId} onSelect={onSelectPlayer} />)}
        {hub.enemySpawns && hub.enemySpawns.length > 0 && <AdventureEnemies spawns={hub.enemySpawns} level={progress.level} playerPosition={playerPosition} attackEvent={attackEvent} reducedMotion={reducedMotion} onPlayerDamage={onPlayerDamage} onDefeated={onEnemyDefeated} />}
        <StoryPlayerController hub={hub} avatar={profile.avatar} avatarVisible={avatarVisible} groundingOffsetY={groundingOffsetY} playerPosition={playerPosition} readInput={readInput} disabled={disabled} reducedMotion={reducedMotion} quickMatchAvailable={quickMatchAvailable} derivedStats={derivedStats} impactEvent={impactEvent} onAttack={onAttack} onQuickMatch={onQuickMatch} onNearbyPortal={onNearbyPortal} onActivatePortal={onActivatePortal} onExit={onExit} onPause={onPause} onStateSample={onStateSample} onReady={onReady} />
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

const ADVENTURE_STAT_META: Record<StoryAdventureStatKey, { label: string; description: string; Icon: LucideIcon }> = {
  power: { label: 'Power', description: '+2% melee damage', Icon: Swords },
  vitality: { label: 'Vitality', description: '+5 maximum HP', Icon: Heart },
  agility: { label: 'Agility', description: '+1% movement speed', Icon: Footprints },
  guard: { label: 'Guard', description: '-1% damage · -2% knockback', Icon: Shield },
  critical: { label: 'Critical', description: '+1% critical chance', Icon: Crosshair },
  insight: { label: 'Insight', description: '+2% earned XP', Icon: Brain }
};

function AdventureHud({ progress, health, maxHealth, onMap, onStats }: {
  progress: StoryAdventureProgressV1;
  health: number;
  maxHealth: number;
  onMap: () => void;
  onStats: () => void;
}) {
  const requiredXp = experienceToNextLevel(progress.level);
  const xpPercent = progress.level >= 100 ? 100 : requiredXp > 0 ? progress.xp / requiredXp * 100 : 0;
  return <aside className="story-adventure-hud" aria-label="Adventure status" data-testid="story-adventure-hud">
    <div className="story-adventure-vitals">
      <div className="story-adventure-level"><small>Level</small><strong>{progress.level}</strong></div>
      <div className="story-adventure-bars">
        <div><span><Heart size={12} /> HP</span><strong>{Math.round(health)} / {maxHealth}</strong><i><b style={{ width: `${Math.max(0, Math.min(100, health / maxHealth * 100))}%` }} /></i></div>
        <div><span><Sparkles size={12} /> XP</span><strong>{progress.level >= 100 ? 'MAX' : `${progress.xp} / ${requiredXp}`}</strong><i className="is-xp"><b style={{ width: `${xpPercent}%` }} /></i></div>
      </div>
    </div>
    <div className="story-adventure-hud-actions">
      <button type="button" onClick={onMap} aria-label="Open route map"><Map size={18} /><kbd>M</kbd></button>
      <button type="button" onClick={onStats} aria-label="Open adventure stats"><BarChart3 size={18} /><kbd>P</kbd>{progress.unspentPoints > 0 && <em>{progress.unspentPoints}</em>}</button>
    </div>
  </aside>;
}

function AdventureRouteMap({ activeWorldId, onClose }: { activeWorldId: StoryWorldId; onClose: () => void }) {
  return <div className="story-adventure-overlay" role="presentation">
    <section className="story-adventure-map" role="dialog" aria-modal="true" aria-labelledby="story-adventure-map-title" data-testid="story-adventure-map">
      <header>
        <div><span><Map size={17} /> World Network</span><h2 id="story-adventure-map-title">Central Route Map</h2></div>
        <button type="button" aria-label="Close route map" onClick={onClose}><X size={19} /></button>
      </header>
      <div className="story-adventure-map-network">
        <div className={`story-map-kore ${activeWorldId === 'central' ? 'is-current' : ''}`}><strong>K.O.R.E. Central</strong><small>Main hub</small></div>
        <div className="story-map-connector" aria-hidden="true" />
        <div className={`story-map-route ${activeWorldId === 'world-route' ? 'is-current' : ''}`}><Map size={20} /><strong>Central Route</strong><small>All worlds connect here</small></div>
        <div className="story-map-regions">
          {STORY_ADVENTURE_REGION_IDS.map((id, index) => {
            const Icon = DESTINATION_ICONS[id];
            return <div key={id} className={activeWorldId === id ? 'is-current' : ''} style={{ '--story-map-accent': STORY_WORLDS[id].portals[0]?.accent ?? '#2ee6ff' } as CSSProperties}>
              <span><Icon size={17} /></span><strong>{STORY_ADVENTURE_REGION_LABELS[id]}</strong><small>Region {String(index + 1).padStart(2, '0')}</small>
            </div>;
          })}
        </div>
      </div>
      <footer><span>The map shows routes only; travel through a gate to move.</span><small>Art: DragonDePlatino · DawnBringer · Anokolisa · Pixel Frog</small></footer>
    </section>
  </div>;
}

function AdventureStatsPanel({ progress, canRespec, onAllocate, onRespec, onClose }: {
  progress: StoryAdventureProgressV1;
  canRespec: boolean;
  onAllocate: (stat: StoryAdventureStatKey) => void;
  onRespec: () => void;
  onClose: () => void;
}) {
  return <div className="story-adventure-overlay" role="presentation">
    <section className="story-adventure-stats" role="dialog" aria-modal="true" aria-labelledby="story-adventure-stats-title" data-testid="story-adventure-stats">
      <header>
        <div><span><BarChart3 size={17} /> Build Profile</span><h2 id="story-adventure-stats-title">Adventure Stats</h2></div>
        <button type="button" aria-label="Close adventure stats" onClick={onClose}><X size={19} /></button>
      </header>
      <div className="story-adventure-stat-summary">
        <span><small>Level</small><strong>{progress.level}</strong></span>
        <span className={progress.unspentPoints > 0 ? 'has-points' : ''}><small>Available</small><strong>{progress.unspentPoints}</strong></span>
        <span><small>Defeated</small><strong>{progress.lifetimeDefeats}</strong></span>
      </div>
      <div className="story-adventure-stat-list">
        {STORY_ADVENTURE_STAT_KEYS.map((stat) => {
          const meta = ADVENTURE_STAT_META[stat];
          const Icon = meta.Icon;
          const capped = progress.stats[stat] >= STORY_ADVENTURE_STAT_CAP;
          return <div key={stat}>
            <span><Icon size={19} /></span>
            <div><strong>{meta.label}</strong><small>{meta.description}</small></div>
            <output>{progress.stats[stat]}<small>/{STORY_ADVENTURE_STAT_CAP}</small></output>
            <button type="button" aria-label={`Add point to ${meta.label}`} disabled={progress.unspentPoints <= 0 || capped} onClick={() => onAllocate(stat)}><Plus size={18} /></button>
          </div>;
        })}
      </div>
      <footer>
        <button type="button" disabled={!canRespec} onClick={onRespec}><RotateCcw size={17} /> Reset all points</button>
        <p>{canRespec ? 'The Recalibration Shrine will also restore all health.' : 'Visit the Recalibration Shrine in Central Route to reset points.'}</p>
      </footer>
    </section>
  </div>;
}

function readDevPreviewWorldId(): StoryWorldId {
  if (typeof window === 'undefined' || !['localhost', '127.0.0.1'].includes(window.location.hostname)) return 'central';
  const candidate = new URLSearchParams(window.location.search).get('storyWorld');
  return isStoryWorldId(candidate) ? candidate : 'central';
}

function devPreviewHub(hub: StoryHubDefinition): StoryHubDefinition {
  if (typeof window === 'undefined' || !['localhost', '127.0.0.1'].includes(window.location.hostname)) return hub;
  const previewParam = new URLSearchParams(window.location.search).get('storyX');
  if (previewParam === null) return hub;
  const previewX = Number(previewParam);
  if (!Number.isFinite(previewX)) return hub;
  return { ...hub, spawn: [THREE.MathUtils.clamp(previewX, hub.bounds.minX + 1, hub.bounds.maxX - 1), hub.spawn[1]] };
}

export default function StoryHubScreen({ profile, onlineProfile, reducedMotion, readInputs, setVirtualAction, onDestination, onOnlineSpar, onExit }: {
  profile: StoryProfileV4;
  onlineProfile?: OnlinePlayerProfile | null;
  reducedMotion: boolean;
  readInputs: () => [InputFrame, InputFrame];
  setVirtualAction: SetVirtualAction;
  onDestination: (destination: HubDestination) => void;
  onOnlineSpar: (opponent: StoryHubPresence) => void;
  onExit: () => void;
}) {
  const [activeWorldId, setActiveWorldId] = useState<StoryWorldId>(readDevPreviewWorldId);
  const activeHub = useMemo(() => devPreviewHub(STORY_WORLDS[activeWorldId]), [activeWorldId]);
  const [nearbyPortal, setNearbyPortal] = useState<StoryPortalDefinition | null>(null);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [adventureProgress, setAdventureProgress] = useState(readAdventureProgress);
  const derivedAdventureStats = useMemo(() => getAdventureDerivedStats(adventureProgress), [adventureProgress]);
  const [playerHealth, setPlayerHealth] = useState(() => getAdventureDerivedStats(readAdventureProgress()).maxHealth);
  const [attackEvent, setAttackEvent] = useState<StoryAdventureAttackEvent | null>(null);
  const [impactEvent, setImpactEvent] = useState<StoryPlayerImpactEvent | null>(null);
  const [playerX, setPlayerX] = useState(activeHub.spawn[0]);
  const [playerY, setPlayerY] = useState(activeHub.spawn[1]);
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
  const [doorTravel, setDoorTravel] = useState<{ target: StoryWorldId; step: number } | null>(null);
  const [quickMatch, setQuickMatch] = useState<{ status: 'idle' | 'searching' | 'assigned' | 'offline'; portalId?: string }>({ status: 'idle' });
  const multiplayerSessionRef = useRef<StoryHubMultiplayerSession | null>(null);
  const launchedChallengeIdsRef = useRef(new Set<string>());
  const noticedChallengeIdsRef = useRef(new Set<string>());
  const pauseGuardUntilRef = useRef(0);
  const pauseKeyHeldRef = useRef(false);
  const adventureProgressRef = useRef(adventureProgress);
  const playerHealthRef = useRef(playerHealth);
  const playerInvulnerableUntilRef = useRef(0);
  const attackSequenceRef = useRef(0);
  const impactSequenceRef = useRef(0);
  const playerStateRef = useRef<StoryHubPlayerState>({ x: activeHub.spawn[0], y: activeHub.spawn[1], pose: 'idle', facing: 1, worldId: activeWorldId });
  const readInput = useCallback(() => readInputs()[0], [readInputs]);
  const handleHubReady = useCallback(() => setHubReady(true), []);
  const handlePlayerState = useCallback((state: StoryHubPlayerState) => {
    const worldState = { ...state, worldId: activeWorldId };
    playerStateRef.current = worldState;
    setPlayerX(state.x);
    setPlayerY(state.y);
    setPlayerPose(state.pose);
    multiplayerSessionRef.current?.update(worldState);
  }, [activeWorldId]);
  useEffect(() => { adventureProgressRef.current = adventureProgress; }, [adventureProgress]);
  useEffect(() => {
    playerHealthRef.current = Math.min(playerHealthRef.current, derivedAdventureStats.maxHealth);
    setPlayerHealth(playerHealthRef.current);
  }, [derivedAdventureStats.maxHealth]);
  const updateAdventureProgress = useCallback((next: StoryAdventureProgressV1) => {
    const saved = writeAdventureProgress(next);
    adventureProgressRef.current = saved;
    setAdventureProgress(saved);
    return saved;
  }, []);
  const allocateStat = useCallback((stat: StoryAdventureStatKey) => {
    const beforeMaxHealth = getAdventureDerivedStats(adventureProgressRef.current).maxHealth;
    const next = updateAdventureProgress(allocateAdventureStat(adventureProgressRef.current, stat));
    const nextMaxHealth = getAdventureDerivedStats(next).maxHealth;
    if (nextMaxHealth > beforeMaxHealth) {
      playerHealthRef.current = Math.min(nextMaxHealth, playerHealthRef.current + (nextMaxHealth - beforeMaxHealth));
      setPlayerHealth(playerHealthRef.current);
    }
  }, [updateAdventureProgress]);
  const respecStats = useCallback(() => {
    if (!canRespecAdventureStats(activeWorldId, nearbyPortal?.kind)) return;
    const next = updateAdventureProgress(respecAdventureStats(adventureProgressRef.current));
    const maxHealth = getAdventureDerivedStats(next).maxHealth;
    playerHealthRef.current = maxHealth;
    setPlayerHealth(maxHealth);
  }, [activeWorldId, nearbyPortal?.kind, updateAdventureProgress]);
  const handleAdventureAttack = useCallback((x: number, y: number, facing: -1 | 1) => {
    if (!isStoryAdventureRegionId(activeWorldId)) return;
    const resolved = resolveAdventurePlayerAttack(adventureProgressRef.current);
    setAttackEvent({ id: ++attackSequenceRef.current, x, y, facing, ...resolved });
  }, [activeWorldId]);
  const handlePlayerDamage = useCallback((baseDamage: number, sourceX: number) => {
    if (!isStoryAdventureRegionId(activeWorldId) || performance.now() < playerInvulnerableUntilRef.current) return;
    playerInvulnerableUntilRef.current = performance.now() + 650;
    const resolved = resolveAdventurePlayerDamage(baseDamage, adventureProgressRef.current);
    const nextHealth = Math.max(0, playerHealthRef.current - resolved.damage);
    if (nextHealth <= 0) {
      const maxHealth = getAdventureDerivedStats(adventureProgressRef.current).maxHealth;
      const checkpoint = activeHub.checkpoint ?? activeHub.spawn;
      playerHealthRef.current = maxHealth;
      setPlayerHealth(maxHealth);
      setImpactEvent({ id: ++impactSequenceRef.current, sourceX, knockback: resolved.knockback, respawn: checkpoint });
      return;
    }
    playerHealthRef.current = nextHealth;
    setPlayerHealth(nextHealth);
    setImpactEvent({ id: ++impactSequenceRef.current, sourceX, knockback: resolved.knockback });
  }, [activeHub.checkpoint, activeHub.spawn, activeWorldId]);
  const handleEnemyDefeated = useCallback((baseXp: number) => {
    const result = awardAdventureExperience(adventureProgressRef.current, baseXp);
    const next = updateAdventureProgress(result.progress);
    if (result.levelsGained > 0) {
      const maxHealth = getAdventureDerivedStats(next).maxHealth;
      playerHealthRef.current = maxHealth;
      setPlayerHealth(maxHealth);
    }
  }, [updateAdventureProgress]);
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

  const beginWorldTravel = useCallback((target: StoryWorldId) => {
    if (doorTravel || target === activeWorldId) return;
    setNearbyPortal(null);
    setSelectedPlayer(null);
    setMapOpen(false);
    setStatsOpen(false);
    setDoorTravel({ target, step: 0 });
  }, [activeWorldId, doorTravel]);

  const activatePortal = useCallback((portal: StoryPortalDefinition) => {
    if (portal.kind === 'shrine') {
      const maxHealth = getAdventureDerivedStats(adventureProgressRef.current).maxHealth;
      playerHealthRef.current = maxHealth;
      setPlayerHealth(maxHealth);
      setStatsOpen(true);
      return;
    }
    if (portal.locked) return;
    if (portal.destination === 'story') {
      beginWorldTravel('world-route');
      return;
    }
    if (quickMatch.status === 'assigned' && portal.id === quickMatch.portalId) {
      setQuickMatch({ status: 'idle' });
      onDestination('online');
      return;
    }
    if (portal.destination === 'central') {
      beginWorldTravel('central');
      return;
    }
    if (isStoryAdventureWorldId(portal.destination) || (activeWorldId === 'central' && isStoryWorldId(portal.destination))) {
      beginWorldTravel(portal.destination);
      return;
    }
    if (isHubDestination(portal.destination)) onDestination(portal.destination);
  }, [activeWorldId, beginWorldTravel, onDestination, quickMatch.portalId, quickMatch.status]);

  const exitCurrentWorld = useCallback(() => {
    if (activeWorldId === 'central') onExit();
    else if (isStoryAdventureRegionId(activeWorldId)) beginWorldTravel('world-route');
    else beginWorldTravel('central');
  }, [activeWorldId, beginWorldTravel, onExit]);

  const quickMatchPortals = useMemo(() => activeHub.portals.filter((portal) => portal.quickMatch), [activeHub]);
  const quickMatchAvailable = quickMatchPortals.length > 0;
  const startQuickMatch = useCallback(() => {
    if (!quickMatchAvailable) return;
    if (quickMatch.status === 'searching') {
      setQuickMatch({ status: 'idle' });
      return;
    }
    if (!onlineEnabled) {
      setQuickMatch({ status: 'offline' });
      return;
    }
    if (quickMatch.status === 'assigned') {
      setQuickMatch({ status: 'idle' });
      return;
    }
    setQuickMatch({ status: 'searching' });
  }, [onlineEnabled, quickMatch.status, quickMatchAvailable]);

  useEffect(() => {
    if (!doorTravel) return undefined;
    const timer = window.setTimeout(() => {
      setDoorTravel((current) => {
        if (!current) return null;
        const nextStep = current.step + 1;
        if (nextStep === 12) {
          const nextHub = STORY_WORLDS[current.target];
          setActiveWorldId(current.target);
          setNearbyPortal(null);
          setHubReady(false);
          setPlayerX(nextHub.spawn[0]);
          setPlayerY(nextHub.spawn[1]);
          setPlayerPose('idle');
          playerStateRef.current = { x: nextHub.spawn[0], y: nextHub.spawn[1], pose: 'idle', facing: 1, worldId: current.target };
          multiplayerSessionRef.current?.update(playerStateRef.current);
        }
        return nextStep >= 24 ? null : { ...current, step: nextStep };
      });
    }, reducedMotion ? 35 : 70);
    return () => window.clearTimeout(timer);
  }, [doorTravel, reducedMotion]);

  useEffect(() => {
    setQuickMatch({ status: 'idle' });
  }, [activeWorldId]);

  useEffect(() => {
    if (quickMatch.status !== 'searching') return undefined;
    const timer = window.setTimeout(() => {
      const seed = Array.from(profile.avatar.name).reduce((total, character) => total + character.charCodeAt(0), 0);
      const assigned = quickMatchPortals[seed % Math.max(1, quickMatchPortals.length)];
      setQuickMatch(assigned ? { status: 'assigned', portalId: assigned.id } : { status: 'idle' });
    }, reducedMotion ? 300 : 1_600);
    return () => window.clearTimeout(timer);
  }, [profile.avatar.name, quickMatch.status, quickMatchPortals, reducedMotion]);

  useEffect(() => {
    if (!quickMatchAvailable) return undefined;
    const onFindMatch = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'f' || event.repeat) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || pauseOpen || controlsOpen || mapOpen || statsOpen || doorTravel) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      startQuickMatch();
    };
    window.addEventListener('keydown', onFindMatch, true);
    return () => window.removeEventListener('keydown', onFindMatch, true);
  }, [controlsOpen, doorTravel, mapOpen, pauseOpen, quickMatchAvailable, startQuickMatch, statsOpen]);

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
      if (event.repeat || !activeHub.adventure || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key.toLowerCase() === 'm') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setStatsOpen(false);
        setMapOpen((current) => !current);
      }
      if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setMapOpen(false);
        setStatsOpen((current) => !current);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [activeHub.adventure]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (event.repeat || pauseKeyHeldRef.current) return;
      pauseKeyHeldRef.current = true;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (mapOpen) {
        setMapOpen(false);
        return;
      }
      if (statsOpen) {
        setStatsOpen(false);
        return;
      }
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
  }, [closePause, controlsOpen, mapOpen, openPause, pauseOpen, selectedPlayer, statsOpen]);

  const visibleRemotePlayers = remotePlayers.filter((presence) => (presence.worldId ?? 'central') === activeWorldId);
  const playerCount = onlineEnabled ? visibleRemotePlayers.length + 1 : 1;
  const statusLabel = connectionStatus === 'online' ? 'Live' : connectionStatus === 'local' ? 'Local Link' : connectionStatus === 'reconnecting' ? 'Reconnecting' : connectionStatus === 'connecting' ? 'Connecting' : 'Offline';
  const incomingSeconds = incomingChallenge ? Math.max(0, Math.ceil((incomingChallenge.expiresAt - challengeClock) / 1_000)) : 0;
  const outgoingSeconds = outgoingChallenge ? Math.max(0, Math.ceil((outgoingChallenge.expiresAt - challengeClock) / 1_000)) : 0;

  const assignedPortal = quickMatch.status === 'assigned' ? activeHub.portals.find((portal) => portal.id === quickMatch.portalId) : null;
  const doorFrame = doorTravel ? DOOR_TRAVEL_FRAME_SEQUENCE[doorTravel.step] ?? 0 : 0;

  return <div className="story-hub-screen" data-testid="story-hub-screen" data-world={activeWorldId} data-hub-ready={hubReady ? 'true' : 'false'} data-controls-open={controlsOpen ? 'true' : 'false'} data-map-open={mapOpen ? 'true' : 'false'} data-stats-open={statsOpen ? 'true' : 'false'} data-quick-match={quickMatchAvailable ? 'true' : 'false'} data-player-x={playerX.toFixed(2)} data-player-y={playerY.toFixed(2)} data-player-pose={playerPose} data-player-health={playerHealth} data-player-level={adventureProgress.level} data-nearby-portal={nearbyPortal?.id ?? ''} data-online={onlineEnabled ? 'true' : 'false'} data-connection-status={connectionStatus} data-player-count={playerCount}>
    <div className="story-hub-canvas-shell">
      <HubCanvas key={activeHub.id} hub={activeHub} profile={profile} reducedMotion={reducedMotion} readInput={readInput} disabled={pauseOpen || controlsOpen || mapOpen || statsOpen || Boolean(selectedPlayer) || Boolean(incomingChallenge) || Boolean(doorTravel)} avatarVisible={!doorTravel || doorTravel.step < 4 || doorTravel.step >= 18} quickMatchAvailable={quickMatchAvailable} assignedPortalId={quickMatch.portalId} nearbyPortal={nearbyPortal} remotePlayers={visibleRemotePlayers} selectedPlayerSessionId={selectedPlayer?.sessionId} progress={adventureProgress} attackEvent={attackEvent} impactEvent={impactEvent} onAttack={handleAdventureAttack} onPlayerDamage={handlePlayerDamage} onEnemyDefeated={handleEnemyDefeated} onQuickMatch={startQuickMatch} onSelectPlayer={selectRemotePlayer} onNearbyPortal={setNearbyPortal} onActivatePortal={activatePortal} onExit={exitCurrentWorld} onPause={openPause} onStateSample={handlePlayerState} onReady={handleHubReady} />
    </div>

    <header className="story-hub-header story-enter-1">
      <div className="story-hub-location">
        <span><Map size={16} /> {activeWorldId === 'central' ? 'Central District' : activeHub.adventure ? 'Adventure Network' : `${activeWorldId} world`}</span>
        <h1>{activeHub.name}</h1>
        <p>{activeHub.subtitle}</p>
      </div>
      <div className="story-hub-header-actions">
        <button type="button" className="story-hub-controls-toggle" aria-label="Controls" aria-expanded={controlsOpen} aria-controls="story-hub-controls-panel" onClick={() => setControlsOpen((current) => !current)}>
          <Keyboard size={19} /> <span>Controls</span>
        </button>
        <div className={`story-hub-presence-card is-${connectionStatus}`}>
          <span className="story-hub-presence-icon" aria-hidden="true">
            <Wifi className="is-online-icon" size={16} />
            <WifiOff className="is-offline-icon" size={16} />
          </span>
          <span><small>{statusLabel}</small><strong><UsersRound size={15} /> {playerCount} {playerCount === 1 ? 'Player' : 'Players'}</strong></span>
          <div className="story-hub-remote-names" aria-label={`Players in ${activeHub.name}`}>
            {visibleRemotePlayers.slice(0, 3).map((presence) => <i key={presence.sessionId} data-testid={`story-hub-remote-${presence.sessionId}`}>{presence.displayName}</i>)}
          </div>
        </div>
        <div className="story-hub-player-card">
          <span>Story Avatar</span>
          <strong>{profile.avatar.name}</strong>
        </div>
      </div>
    </header>

    {activeHub.adventure && <AdventureHud progress={adventureProgress} health={playerHealth} maxHealth={derivedAdventureStats.maxHealth} onMap={() => { setStatsOpen(false); setMapOpen(true); }} onStats={() => { setMapOpen(false); setStatsOpen(true); }} />}

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
        <div><strong>Drop Through</strong><kbd>Hold ↓</kbd><span>Down on D-pad / stick</span></div>
        <div><strong>Attack</strong><kbd>U / J / I</kbd><span>Face buttons</span></div>
        <div><strong>Interact</strong><kbd>K / Enter</kbd><span>Special button</span></div>
        {activeHub.adventure && <div><strong>World Map</strong><kbd>M</kbd><span>Route network</span></div>}
        {activeHub.adventure && <div><strong>Stats</strong><kbd>P</kbd><span>Allocate level points</span></div>}
        {quickMatchAvailable && <div><strong>Find Match</strong><kbd>F / Y</kbd><span>Queue from anywhere</span></div>}
        <div><strong>Pause</strong><kbd>Esc</kbd><span>Start / Menu</span></div>
      </div>
      <p>Touch controls appear automatically on touch devices.</p>
    </section>}

    <div className={`story-portal-prompt ${nearbyPortal ? 'is-visible' : ''}`} aria-live="polite">
      <div style={{ '--story-portal-accent': nearbyPortal?.accent ?? '#2ee6ff' } as CSSProperties}>
        {nearbyPortal?.locked ? <LockKeyhole size={22} /> : nearbyPortal?.kind === 'shrine' ? <Sparkles size={22} /> : <DoorOpen size={22} />}
        <span><small>{nearbyPortal?.subtitle}</small><strong>{nearbyPortal?.label ?? 'Destination'}</strong></span>
      </div>
      <button type="button" disabled={!nearbyPortal} onClick={() => nearbyPortal && activatePortal(nearbyPortal)}>{nearbyPortal?.locked ? 'Inspect' : nearbyPortal?.kind === 'shrine' ? 'Recalibrate' : 'Enter'}</button>
    </div>

    {quickMatchAvailable && <button type="button" className={`story-quick-match is-${quickMatch.status}`} onClick={startQuickMatch} aria-live="polite" data-testid="story-quick-match">
      <span className="story-quick-match-key"><kbd>F</kbd><i>/</i><kbd>Y</kbd></span>
      <span>
        <small>{quickMatch.status === 'searching' ? 'Searching network…' : quickMatch.status === 'assigned' ? `Station ${String(assignedPortal?.stationNumber ?? '').padStart(2, '0')} ready` : quickMatch.status === 'offline' ? 'Offline mode enabled' : 'Instant matchmaking'}</small>
        <strong>{quickMatch.status === 'searching' ? 'Cancel Search' : quickMatch.status === 'assigned' ? `Go to ${assignedPortal?.label ?? 'assigned station'}` : quickMatch.status === 'offline' ? 'Go online from Pause' : 'Find Match'}</strong>
      </span>
      <Gamepad2 size={21} />
    </button>}

    <div className="story-hub-control-hint story-enter-3" aria-hidden="true">
      <span>Move</span><b>← →</b><span>Run</span><b>Shift</b><span>Double Jump</span><b>Space ×2</b><span>Drop</span><b>Hold ↓</b><span>Attack</span><b>U / J</b>{activeHub.adventure && <><span>Map</span><b>M</b><span>Stats</span><b>P</b></>}{quickMatchAvailable && <><span>Match</span><b>F / Y</b></>}<span>Interact</span><b>K / Enter</b><span>Pause</span><b>Esc</b>
    </div>

    {doorTravel && <div className="story-door-transition" aria-label={`Traveling to ${STORY_WORLDS[doorTravel.target].name}`} data-testid="story-door-transition">
      <div className="story-door-transition-glow" />
      <img src={`${DOOR_ASSET_ROOT}/frame-${doorFrame}.png`} alt="" />
      <span>{doorTravel.step < 12 ? 'Departing' : `Arriving · ${STORY_WORLDS[doorTravel.target].name}`}</span>
    </div>}

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
        {activeHub.adventure && <button type="button" className="story-pause-edit" onClick={() => { closePause(); setMapOpen(true); }}><Map size={19} /> Route Map</button>}
        {activeHub.adventure && <button type="button" className="story-pause-edit" onClick={() => { closePause(); setStatsOpen(true); }}><BarChart3 size={19} /> Adventure Stats</button>}
        <button type="button" className="story-pause-edit" onClick={editAvatarFromPause}><Pencil size={19} /> Edit Avatar</button>
        <button type="button" className={`story-online-toggle ${onlineEnabled ? 'is-online' : 'is-offline'}`} role="switch" aria-checked={onlineEnabled} onClick={toggleOnline}>
          <span aria-hidden="true"><Wifi size={19} /><WifiOff size={19} /></span>
          <span><strong>{onlineEnabled ? 'Online' : 'Offline'}</strong><small>{onlineEnabled ? 'Visible in the shared world' : 'Playing privately'}</small></span>
        </button>
        <button type="button" className="story-pause-exit" onClick={onExit}><LogOut size={19} /> Return to Main Menu</button>
      </section>
    </div>}

    {mapOpen && <AdventureRouteMap activeWorldId={activeWorldId} onClose={() => setMapOpen(false)} />}
    {statsOpen && <AdventureStatsPanel progress={adventureProgress} canRespec={canRespecAdventureStats(activeWorldId, nearbyPortal?.kind)} onAllocate={allocateStat} onRespec={respecStats} onClose={() => setStatsOpen(false)} />}
  </div>;
}

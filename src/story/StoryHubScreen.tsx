import { Html, OrthographicCamera, useTexture } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { CuboidCollider, Physics, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { Activity, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Backpack, BarChart3, Beaker, BookOpen, Brain, CheckCircle2, Clock3, ContactRound, Crosshair, DoorOpen, Dumbbell, Footprints, Gamepad2, Gauge, Gem, Globe2, Hammer, Handshake, Heart, History, Keyboard, LockKeyhole, LogOut, Map, PackageOpen, Palette, Pause, Pencil, Play, Plus, RotateCcw, Settings, Shield, Sparkles, Swords, Trophy, UserPlus, UserRound, UsersRound, Wifi, WifiOff, X, XCircle, Zap, type LucideIcon } from 'lucide-react';
import { Suspense, type CSSProperties, type MutableRefObject, type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OnlinePlayerProfile } from '../lib/online/leaderboard';
import { createAnalyticsId, type AnalyticsCapture } from '../lib/analytics';
import { addFriendEntry, isFriend, readMatchHistory } from '../lib/socialHistory';
import type { InputFrame } from '../types';
import { STORY_ADVENTURE_ASSET_PATHS, storyWorldAssetPath } from './adventureAssets';
import { emitAdventureAudioEvent } from './adventureAudio';
import { STORY_ATTACK_VISUAL_SYNC_DELAY_MS, advanceStoryAttackInputBuffer, adventureAttackHits, canAdventureEnemyDamagePlayer, createAdventureDamageFeedback, createAdventureHitReaction, getAdventureAttackFrameHitbox, getAdventureEnemyStats, getStoryAttackDurationMs, getStoryProjectileSpawnPosition, resolveAdventurePlayerAttack, resolveAdventurePlayerDamage, resolveStoryAttackInput, stepAdventureProjectile, storyPlayerProjectileHits, type AdventureDamageFeedback, type StoryBufferedAttackInput } from './adventureCombat';
import { makeStoryEncounterProgress, recordChallengerDefeat, recordRegularDefeat, rerollStoryRegularSpawns, resetActiveChallenger, storyEncounterMovementLock, type StoryEncounterProgress } from './adventureEncounters';
import { STORY_ADVENTURE_COMBAT_STAT_KEYS, STORY_ADVENTURE_PARTY_SIZE_CAP, STORY_ADVENTURE_STAT_CAP, acknowledgeAdventurePartyFeatureReveal, addAdventureMaterial, adventureResourceYieldModifiers, allocateAdventureStat, applyAdventureEnemyDefeat, awardMountMastery, beginAdventureVisit, canRespecAdventureStats, claimAdventureCache, collectAdventureRelic, consumeAdventureItem, craftAdventureRecipe, depleteAdventureResourceNode, discoverAdventureLandmark, discoverAdventureSurfaceMap, discoverAdventureVista, discoverAdventureWaystone, equipAdventureArmor, experienceToNextLevel, getAdventureDerivedStats, getAdventurePartySizeProgress, isAdventureResourceNodeAvailable, pinAdventureDaily, readAdventureProgress, respecAdventureStats, restoreAdventureShortcut, unlockAdventureMasteryRecipe, unlockAdventureMount, unlockAdventureSpecialistRecipes, upgradeAdventureWaystone, writeAdventureProgress, type StoryAdventureProgressV1, type StoryAdventureStatKey } from './adventureProgress';
import { STORY_ADVENTURE_REGION_IDS, STORY_ADVENTURE_REGION_LABELS, STORY_WORLDS, isStoryAdventureRegionId, isStoryAdventureWorldId, isStoryWorldId } from './adventureWorlds';
import { createAdventureVisitSeed, generateAdventureRunGraph, STORY_BREATH_DRAIN_PER_SECOND, STORY_BREATH_REFILL_PER_SECOND, STORY_MAX_BREATH, STORY_MOUNTS, STORY_WORLD_MOUNT, storyDepthZoneLabel, storyPartyEnemyHealthScale, type StoryPartyAiActor, type StoryPartyInstance, type StoryPartyInvite } from './adventureExploration';
import { getStoryEnemyAnimation, getStoryEnemyDefinition, storyEnemyPlaneSize, STORY_CHALLENGER_IDS, STORY_ENEMY_RUNTIME_SCALE, type StoryEnemyAttackDefinition } from './enemyCatalog';
import { STORY_GROUNDED_ACTOR_CENTER_Y, storyAvatarGroundingOffsetForWorld, storyGroundAnchoredPlaneCenterY, storyScaledGroundAnchorOffsetY } from './actorGrounding';
import { STORY_MODE_DOOR_DISPLAY_SIZE, storyPortalDoorFrame, type StoryBiomeDoorFrame } from './biomeDoors';
import { createStoryDepthEnvironment } from './depthEnvironment';
import { connectStoryHubMultiplayer, readOrCreateStoryHubGuestIdentity, readStoryHubOnlinePreference, STORY_HUB_CHALLENGE_TIMEOUT_MS, writeStoryHubOnlinePreference, type StoryHubMultiplayerSession } from './hubMultiplayer';
import { KORE_CENTRAL_HUB } from './hubData';
import { storyPlatformSurfacePlacement } from './platformGrounding';
import { getStorySpriteProjectile, STORY_ATTACK_POSES } from './streetAvatarCatalog';
import { StoryAvatarRig, type StoryAvatarPose } from './StoryAvatarRig';
import { acceptStoryPartyInvite, createStoryParty, heartbeatStoryParty, inviteToStoryParty, leaveStoryParty, listStoryPartyInvites, transferStoryPartyLeadership, updateStoryPartyRoom, type StoryPartyRegistration } from './storyParty';
import { unseenStoryPartyRewards, type StoryPartyAuthoritativeSnapshot, type StoryPartyRewardEvent } from './storyPartyProtocol';
import { createStoryPartyTransport, type StoryPartyTransport } from './storyPartyTransport';
import { createStoryWorldProps } from './worldEnvironments';
import { createAdventureSurfaceHub, firstStoryAdventureSurfaceMap, getStoryAdventureSurfaceMap } from './adventureSurfaceMaps';
import { STORY_NPC_SPRITES, STORY_NPC_VISIBLE_WORLD_HEIGHT, storyNpcFootContactSinkY, storyNpcPlaneSize } from './adventureNpcs';
import { adventureUtcDate, getStoryDailyActivities } from './adventureObjectives';
import { STORY_ARMOR_SET_BONUSES, STORY_BIOME_IDS, STORY_RECIPE_BY_ID, STORY_RECIPES, STORY_RESOURCES, canCraftRecipe, storyRecipeStationLabel, type StoryBiomeId, type StoryCraftingContext } from './adventureCrafting';
import { adventureAttackCanHitResource, adventureResourceHitStrength, createDepthResourceNodes, resourceYield } from './adventureResources';
import { AdventureStatPointNotification, type AdventureStatPointNotice } from './AdventureStatPointNotification';
import { getEquippedStoryAvatarSlots, normalizeStoryAvatarRoster, setActiveStoryAvatar } from './profile';
import type { AdventureMusicContext, AdventureMusicTrackDefinition, HubDestination, StoryAdventureRunGraph, StoryAttackInput, StoryAvatarSet, StoryEnemyDefeatEvent, StoryEnemyId, StoryEnemySpawnDefinition, StoryEnemyTier, StoryHubChallenge, StoryHubConnectionStatus, StoryHubDefinition, StoryHubPlayerState, StoryHubPresence, StoryMountDefinition, StoryMountId, StoryNpcDefinition, StoryPlatformDefinition, StoryPortalDefinition, StoryPortalDestination, StoryProfileV4, StoryResourceNodeDefinition, StorySpriteProjectileDefinition, StoryWorldBackdropLayerDefinition, StoryWorldId, StoryWorldLandmarkDefinition, StoryWorldPropDefinition, StoryWorldThemeId } from './types';

type StoryHubInput = Pick<InputFrame, 'left' | 'right' | 'down' | 'up' | 'jump' | 'jab' | 'kick' | 'heavy' | 'special' | 'block' | 'back' | 'pause'> & { interact: boolean };
type SetVirtualAction = (player: 1 | 2, action: keyof InputFrame, pressed: boolean) => void;

const CITY_ASSET_ROOT = '/story/hub/warped-city-2';
const PORTAL_ASSET_ROOT = '/story/hub/warped-city-portals';
const DOOR_ASSET_ROOT = '/story/hub/door-transitions';
const ARCADE_ASSET_ROOT = '/story/hub/arcade-machines';
// Preserve the authored threshold while scaling the door upward from the floor.
const MODE_DOOR_BASELINE_OFFSET_Y = 0.28;
const NPC_INTERACTION_REFUSAL_UNTIL = new globalThis.Map<string, number>();
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

type StoryAdventureAttackEvent = { id: number; x: number; y: number; facing: -1 | 1; damage: number; critical: boolean; knockbackMultiplier: number; attackInput: StoryAttackInput; avatarSet: StoryAvatarSet; startedAt: number; activeUntil: number; projectile?: StorySpriteProjectileDefinition };
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
    {hub.exploration?.waterVolumes.map((volume) => {
      const [minX, maxX, minY, maxY] = volume.bounds;
      return <group key={volume.id}>
        <mesh position={[(minX + maxX) / 2, (minY + maxY) / 2, 0.62]} renderOrder={28}>
          <planeGeometry args={[maxX - minX, maxY - minY]} />
          <meshBasicMaterial color="#159dc6" transparent opacity={0.28} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh position={[(minX + maxX) / 2, maxY, 0.64]} renderOrder={29}>
          <planeGeometry args={[maxX - minX, 0.12]} />
          <meshBasicMaterial color="#8ee8ff" transparent opacity={0.72} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>;
    })}
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

function storyHubGroundPlatform(hub: StoryHubDefinition): StoryPlatformDefinition | undefined {
  return hub.platforms.find((platform) => platform.id === 'ground')
    ?? hub.platforms.find((platform) => !platform.oneWay && Math.abs(platform.position[1] + platform.size[1] / 2 - hub.bounds.floorY) < 0.001);
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
    <planeGeometry args={[...STORY_MODE_DOOR_DISPLAY_SIZE]} />
    <meshBasicMaterial map={texture} transparent alphaTest={0.02} toneMapped={false} />
  </mesh>;
}

function BiomeDoor({ door, portalY, emphasized }: { door: StoryBiomeDoorFrame; portalY: number; emphasized: boolean }) {
  const texture = useTexture(door.asset);
  const geometry = useMemo(() => atlasGeometry(door.frame, [...door.atlasSize] as [number, number], [...door.displaySize] as [number, number]), [door]);
  const groundAlignedCenterY = door.displaySize[1] / 2 - portalY - (door.visibleBottomInset / door.frame[3]) * door.displaySize[1] - door.groundSinkY;
  useMemo(() => configurePixelTexture(texture), [texture]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh position={[0, groundAlignedCenterY, -0.18]} geometry={geometry}>
    <meshBasicMaterial map={texture} color={emphasized ? '#ffffff' : '#eef4ff'} transparent alphaTest={0.02} toneMapped={false} />
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

function AdventurePortalMarker({ kind, accent, emphasized }: { kind: StoryPortalDefinition['kind']; accent: string; emphasized: boolean }) {
  if (kind === 'npc') return null;
  if (kind === 'crafting') return <PixelProp path="/story/resources/workbench.png" position={[0, -0.08, 0]} size={[2.5, 2.5]} opacity={emphasized ? 1 : 0.9} />;
  if (kind === 'chest') return <group position={[0, -0.55, 0]} scale={emphasized ? 1.08 : 1}>
    <mesh><boxGeometry args={[1.15, 0.68, 0.5]} /><meshBasicMaterial color="#7d4c2d" /></mesh>
    <mesh position={[0, 0.24, 0.03]}><boxGeometry args={[1.08, 0.16, 0.52]} /><meshBasicMaterial color="#d9a066" /></mesh>
    <mesh position={[0, 0, 0.29]}><boxGeometry args={[0.18, 0.3, 0.05]} /><meshBasicMaterial color="#ffe071" /></mesh>
  </group>;
  if (kind === 'relic') return <group position={[0, -0.12, 0]} scale={emphasized ? 1.12 : 1}>
    <mesh><octahedronGeometry args={[0.55]} /><meshBasicMaterial color="#ffe071" transparent opacity={0.95} /></mesh>
    <pointLight color="#ffe071" intensity={emphasized ? 4 : 2} distance={4} />
  </group>;
  if (kind === 'restoration') return <group position={[0, -0.35, 0]} scale={emphasized ? 1.06 : 1}>
    <mesh><boxGeometry args={[1.45, 1.15, 0.16]} /><meshBasicMaterial color="#68472f" /></mesh>
    <mesh position={[0, 0, 0.1]}><planeGeometry args={[1.15, 0.82]} /><meshBasicMaterial color="#e7c98b" /></mesh>
  </group>;
  return <group position={[0, -0.18, 0]} scale={emphasized ? 1.08 : 1}>
    <mesh><octahedronGeometry args={[0.48]} /><meshBasicMaterial color={accent} transparent opacity={0.92} /></mesh>
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

function PortalVisual({ portal, theme, nearby, assigned, reducedMotion }: { portal: StoryPortalDefinition; theme?: StoryWorldThemeId; nearby: boolean; assigned: boolean; reducedMotion: boolean }) {
  const hubDestination = isHubDestination(portal.destination) ? portal.destination : 'story';
  const biomeDoor = storyPortalDoorFrame(portal, theme);
  const modeDoor = !biomeDoor && (portal.kind === 'mode-door' || portal.kind === 'adventure-gate');
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
    {['npc', 'chest', 'relic', 'checkpoint', 'restoration', 'crafting'].includes(portal.kind ?? '') ? <AdventurePortalMarker kind={portal.kind} accent={portal.accent} emphasized={nearby || assigned} /> : biomeDoor ? <BiomeDoor door={biomeDoor} portalY={portal.position[1]} emphasized={nearby || assigned} /> : portal.kind === 'mode-door' || portal.kind === 'adventure-gate' ? <ModeDoor emphasized={nearby || assigned} /> : portal.kind === 'shrine' ? <RecalibrationShrine emphasized={nearby} reducedMotion={reducedMotion} /> : portal.kind === 'arcade-machine' ? <AnimatedCabinet position={[0, -0.14, 0]} scale={nearby || assigned ? 1.08 : 1} reducedMotion={reducedMotion} /> : portal.kind === 'versus-machine' ? <>
      <AnimatedCabinet position={[-0.56, -0.14, -0.18]} scale={nearby || assigned ? 0.94 : 0.88} reducedMotion={reducedMotion} />
      <AnimatedCabinet position={[0.56, -0.14, -0.16]} mirrored scale={nearby || assigned ? 0.94 : 0.88} reducedMotion={reducedMotion} />
    </> : portal.kind === 'terminal' ? <>
      <AnimatedCabinet position={[0, -0.14, 0]} scale={nearby || assigned ? 1.08 : 1} reducedMotion={reducedMotion} />
      <mesh position={[0, 0.04, 0.02]} renderOrder={22}><planeGeometry args={[0.72, 0.48]} /><meshBasicMaterial color={portal.accent} transparent opacity={0.42} depthWrite={false} /></mesh>
    </> : <Storefront destination={hubDestination} size={storefrontSize} emphasized={nearby} />}
    {assigned && <mesh position={[0, -1.08, 0.05]} renderOrder={23}><ringGeometry args={[0.72, 0.9, 24]} /><meshBasicMaterial color="#ffe071" transparent opacity={0.9} depthWrite={false} /></mesh>}
    {(nearby || assigned || !['npc', 'chest', 'relic', 'checkpoint', 'restoration', 'crafting'].includes(portal.kind ?? '')) && <Html center position={[0, biomeDoor ? biomeDoor.displaySize[1] / 2 + 0.25 : modeDoor ? MODE_DOOR_BASELINE_OFFSET_Y + STORY_MODE_DOOR_DISPLAY_SIZE[1] / 2 + 0.25 : portal.size[1] / 2 + 0.52, 0.7]} zIndexRange={[8, 0]} className="story-destination-sign-shell">
      <div data-testid={`story-destination-${portal.id}`} className={`story-destination-sign ${nearby ? 'is-nearby' : ''} ${assigned ? 'is-assigned' : ''} ${portal.locked ? 'is-locked' : ''}`} style={{ '--story-destination-accent': portal.accent } as CSSProperties}>
        <span aria-hidden="true">{portal.locked ? <LockKeyhole size={16} /> : <DestinationIcon size={16} />}</span>
        <strong>{assigned ? `Go Here · ${portal.label}` : portal.label}</strong>
        <small>{portal.subtitle}</small>
      </div>
    </Html>}
  </group>;
}

function AdventureNpcVisual({ npc, attackEvent, playerPosition, maxHealth, reducedMotion, onPlayerDamage, surfaceInsetY = 0, surfacePixelWorldHeight = 0 }: {
  npc: StoryNpcDefinition;
  attackEvent: StoryAdventureAttackEvent | null;
  playerPosition: MutableRefObject<THREE.Vector3>;
  maxHealth: number;
  reducedMotion: boolean;
  onPlayerDamage: (damage: number, sourceX: number) => void;
  surfaceInsetY?: number;
  surfacePixelWorldHeight?: number;
}) {
  const sprite = STORY_NPC_SPRITES[npc.spriteId];
  const idleFrames = sprite?.actions.idle.frames ?? [];
  const protectFrames = sprite?.actions.protect.frames ?? idleFrames;
  const counterFrames = sprite?.actions.counter.frames ?? idleFrames;
  const paths = [...idleFrames, ...protectFrames, ...counterFrames];
  const textures = useTexture(paths.length > 0 ? paths : ['/story/npcs/characters/mina-quill/idle/01.png']);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const lastAttackId = useRef(0);
  const cooldownUntil = useRef(0);
  const provokedUntil = useRef(0);
  const counterTimer = useRef<number | null>(null);
  const calmTimer = useRef<number | null>(null);
  const phaseStartedAt = useRef(0);
  const [phase, setPhase] = useState<'idle' | 'protect' | 'counter'>('idle');
  const planeSize = storyNpcPlaneSize(sprite);
  const frameHeight = sprite?.frameSize.height ?? 192;
  const baseline = sprite?.frameSize.baseline ?? 188;
  const footAnchorFromBottom = (frameHeight - baseline) / frameHeight;
  const footContactSinkY = storyNpcFootContactSinkY(planeSize, frameHeight, surfacePixelWorldHeight);
  useMemo(() => textures.forEach((texture) => configurePixelTexture(texture)), [textures]);
  useEffect(() => () => {
    if (counterTimer.current !== null) window.clearTimeout(counterTimer.current);
    if (calmTimer.current !== null) window.clearTimeout(calmTimer.current);
  }, []);
  useEffect(() => {
    const now = performance.now();
    if (!attackEvent || attackEvent.id === lastAttackId.current || now < cooldownUntil.current) return;
    lastAttackId.current = attackEvent.id;
    if (Math.abs(attackEvent.x - npc.position[0]) > 2.5 || Math.abs(attackEvent.y - npc.position[1]) > 2.4) return;
    const repeatedThreat = now < provokedUntil.current;
    provokedUntil.current = now + npc.defense.warningMs;
    phaseStartedAt.current = now;
    setPhase('protect');
    if (counterTimer.current !== null) window.clearTimeout(counterTimer.current);
    if (calmTimer.current !== null) window.clearTimeout(calmTimer.current);
    counterTimer.current = window.setTimeout(() => {
      counterTimer.current = null;
      const distance = Math.abs(playerPosition.current.x - npc.position[0]);
      if (!repeatedThreat && distance > npc.defense.threatRadius) {
        provokedUntil.current = 0;
        setPhase('idle');
        return;
      }
      phaseStartedAt.current = performance.now();
      setPhase('counter');
      if (distance <= npc.defense.counterRange) onPlayerDamage(maxHealth * npc.defense.counterDamagePercent, npc.position[0]);
      calmTimer.current = window.setTimeout(() => {
        calmTimer.current = null;
        const refusalUntil = performance.now() + npc.defense.cooldownMs;
        cooldownUntil.current = refusalUntil;
        NPC_INTERACTION_REFUSAL_UNTIL.set(npc.id, refusalUntil);
        provokedUntil.current = 0;
        phaseStartedAt.current = performance.now();
        setPhase('idle');
      }, reducedMotion ? 280 : 720);
    }, repeatedThreat ? (reducedMotion ? Math.min(160, npc.defense.guardMs) : npc.defense.guardMs) : npc.defense.warningMs);
  }, [attackEvent, maxHealth, npc, onPlayerDamage, playerPosition, reducedMotion]);
  useFrame(() => {
    const frames = phase === 'protect' ? protectFrames : phase === 'counter' ? counterFrames : idleFrames;
    if (!materialRef.current || frames.length === 0) return;
    const duration = phase === 'idle' ? 180 : phase === 'protect' ? 115 : 90;
    const frameIndex = Math.floor((performance.now() - phaseStartedAt.current) / duration) % frames.length;
    const path = frames[frameIndex];
    const textureIndex = paths.indexOf(path);
    if (textureIndex >= 0) materialRef.current.map = textures[textureIndex];
  });
  return <group position={[npc.position[0], npc.position[1], -0.05]}>
    <mesh position={[0, storyGroundAnchoredPlaneCenterY(planeSize, footAnchorFromBottom) - surfaceInsetY - footContactSinkY, 0]}><planeGeometry args={[planeSize, planeSize]} /><meshBasicMaterial ref={materialRef} map={textures[0]} transparent alphaTest={0.02} depthWrite={false} toneMapped={false} /></mesh>
    {phase !== 'idle' && <Html center position={[0, STORY_NPC_VISIBLE_WORLD_HEIGHT - STORY_GROUNDED_ACTOR_CENTER_Y + 0.42, 0.6]} className="story-destination-sign-shell"><div className="story-destination-sign is-nearby"><strong>{phase === 'protect' ? npc.warningBark : `${npc.displayName} counters!`}</strong></div></Html>}
  </group>;
}

function AdventureHazards({ hub, progress, playerPosition, onPlayerDamage }: { hub: StoryHubDefinition; progress: StoryAdventureProgressV1; playerPosition: MutableRefObject<THREE.Vector3>; onPlayerDamage: (damage: number, sourceX: number) => void }) {
  const cooldowns = useRef<Record<string, number>>({});
  const stats = useMemo(() => getAdventureDerivedStats(progress), [progress]);
  useFrame(() => {
    const now = performance.now();
    for (const hazard of hub.hazards ?? []) {
      const [minX, maxX, minY, maxY] = hazard.bounds;
      if (playerPosition.current.x < minX || playerPosition.current.x > maxX || playerPosition.current.y < minY || playerPosition.current.y > maxY || now < (cooldowns.current[hazard.id] ?? 0)) continue;
      if (hazard.kind === 'wind' || hazard.kind === 'sinking-sand' || hazard.kind === 'drowning') continue;
      cooldowns.current[hazard.id] = now + 900;
      const protection = hazard.kind === 'lava' ? stats.lavaDamageMultiplier : hazard.kind === 'icicle' ? stats.icicleDamageMultiplier : 1;
      onPlayerDamage(hazard.damage * protection, (minX + maxX) / 2);
    }
  });
  return <>{(hub.hazards ?? []).map((hazard) => {
    const [minX, maxX, minY, maxY] = hazard.bounds;
    return <group key={hazard.id} position={[(minX + maxX) / 2, Math.max(0.08, (minY + maxY) / 2), -0.12]}>
      <mesh><boxGeometry args={[maxX - minX, Math.max(0.14, maxY - minY), 0.3]} /><meshBasicMaterial color={hazard.accent} transparent opacity={hazard.kind === 'wind' ? 0.18 : 0.62} /></mesh>
    </group>;
  })}</>;
}

function AdventureTraversalVisuals({ hub }: { hub: StoryHubDefinition }) {
  return <>{(hub.traversal ?? []).map((piece) => <group key={piece.id} position={[piece.position[0], piece.position[1], -0.22]}>
    <mesh><boxGeometry args={[piece.size[0], piece.size[1], 0.12]} /><meshBasicMaterial color={piece.route === 'critical' ? '#8ee8ff' : piece.route === 'mount' ? '#ffe071' : '#b8a8ff'} transparent opacity={piece.kind === 'updraft' || piece.kind === 'current' ? 0.16 : 0.32} /></mesh>
  </group>)}</>;
}

function HubCamera({ playerPosition, bounds, verticalBounds }: { playerPosition: MutableRefObject<THREE.Vector3>; bounds: StoryHubDefinition['bounds']; verticalBounds?: { minY: number; maxY: number } }) {
  const { camera, size } = useThree();
  const desired = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, delta) => {
    const orthographic = camera as THREE.OrthographicCamera;
    const halfWidth = Math.max(5, size.width / Math.max(1, orthographic.zoom) / 2);
    desired.set(
      THREE.MathUtils.clamp(playerPosition.current.x, bounds.minX + halfWidth, bounds.maxX - halfWidth),
      verticalBounds
        ? THREE.MathUtils.clamp(playerPosition.current.y + 3.7, verticalBounds.minY + 3.7, verticalBounds.maxY - 2.5)
        : THREE.MathUtils.clamp(4.6 + Math.max(0, playerPosition.current.y - 1) * 0.22, 4.6, 5.6),
      18
    );
    const blend = 1 - Math.pow(0.0005, delta);
    camera.position.lerp(desired, blend);
    camera.lookAt(camera.position.x, camera.position.y - 0.2, 0);
  });
  return null;
}

function RemoteStoryPlayer({ presence, reducedMotion, groundingOffsetY, surfaceInsetY, lane, selected, onSelect }: {
  presence: StoryHubPresence;
  reducedMotion: boolean;
  groundingOffsetY: number;
  surfaceInsetY: number;
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
    <group position={[0, groundingOffsetY - surfaceInsetY, 0]}>
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

function StoryPartyAiCompanion({ actor, index, profile, leaderPosition, reducedMotion, groundingOffsetY, surfaceInsetY }: {
  actor: StoryPartyAiActor;
  index: number;
  profile: StoryProfileV4;
  leaderPosition: MutableRefObject<THREE.Vector3>;
  reducedMotion: boolean;
  groundingOffsetY: number;
  surfaceInsetY: number;
}) {
  const group = useRef<THREE.Group>(null);
  const authored = profile.avatars.find((slot) => slot.id === actor.avatarId)?.avatar ?? profile.avatar;
  const avatar = useMemo(() => ({ ...authored, avatarSet: actor.avatarSet }), [actor.avatarSet, authored]);
  useFrame((_, delta) => {
    if (!group.current) return;
    const targetX = leaderPosition.current.x - (index + 1) * 1.25;
    const targetY = leaderPosition.current.y;
    const blend = 1 - Math.pow(0.02, delta);
    group.current.position.x = THREE.MathUtils.lerp(group.current.position.x, targetX, blend);
    group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, targetY, blend);
  });
  return <group ref={group} position={[leaderPosition.current.x - (index + 1) * 1.25, leaderPosition.current.y, 0.2 - index * 0.01]} visible={actor.state !== 'ko'}>
    <group position={[0, groundingOffsetY - surfaceInsetY, 0]}><StoryAvatarRig avatar={avatar} pose="sprint" facing={1} reducedMotion={reducedMotion} /></group>
    <Html center position={[0, 1.6, 0.3]} className="story-party-ai-tag"><span>AI</span></Html>
  </group>;
}

function EnemySprite({ enemyId, animationId, animationStartedAt, facing, flashUntil, fading = false }: {
  enemyId: StoryEnemyId;
  animationId: string;
  animationStartedAt: number;
  facing: -1 | 1;
  flashUntil: MutableRefObject<number>;
  fading?: boolean;
}) {
  const definition = getStoryEnemyDefinition(enemyId);
  const animation = getStoryEnemyAnimation(enemyId, animationId);
  const framePaths = useMemo(() => animation.frames.map((frame) => frame.path), [animation.frames]);
  const sources = useTexture(framePaths) as THREE.Texture[];
  const textures = useMemo(() => sources.map((source) => {
    const clone = source.clone();
    configurePixelTexture(clone);
    clone.wrapS = THREE.ClampToEdgeWrapping;
    clone.wrapT = THREE.ClampToEdgeWrapping;
    return clone;
  }), [sources]);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const elapsed = Math.max(0, performance.now() - animationStartedAt);
    const duration = Math.max(1, animation.frames.reduce((sum, frame) => sum + frame.durationMs, 0));
    const cursor = animation.loop ? elapsed % duration : Math.min(duration - 1, elapsed);
    let frameIndex = 0;
    let accumulated = 0;
    for (let index = 0; index < animation.frames.length; index += 1) {
      accumulated += animation.frames[index].durationMs;
      if (cursor < accumulated) { frameIndex = index; break; }
    }
    if (material.current && material.current.map !== textures[frameIndex]) {
      material.current.map = textures[frameIndex];
      material.current.needsUpdate = true;
    }
    if (material.current) {
      material.current.color.set(performance.now() < flashUntil.current ? '#ff6f91' : '#ffffff');
      material.current.opacity = fading ? Math.max(0, 1 - elapsed / 520) : 1;
    }
    if (mesh.current) mesh.current.scale.x = facing;
  });
  useEffect(() => () => textures.forEach((texture) => texture.dispose()), [textures]);
  const size = storyEnemyPlaneSize(definition);
  return <mesh ref={mesh} position={[0, storyGroundAnchoredPlaneCenterY(size), 0]} scale={[facing, 1, 1]}>
    <planeGeometry args={[size, size]} />
    <meshBasicMaterial ref={material} map={textures[0]} transparent opacity={1} alphaTest={0.02} depthWrite={false} toneMapped={false} />
  </mesh>;
}

type AdventureProjectileRuntime = { active: boolean; x: number; y: number; velocityX: number; velocityY: number; expiresAt: number; damage: number; radius: number; color: string };
type StoryPlayerProjectileRuntime = {
  active: boolean;
  released: boolean;
  x: number;
  y: number;
  facing: -1 | 1;
  releaseAt: number;
  expiresAt: number;
  attack: StoryAdventureAttackEvent;
  definition: StorySpriteProjectileDefinition;
};
type AdventureDamagePop = AdventureDamageFeedback & { id: number };

function StoryPlayerProjectile({ attackEvent, playerPosition, avatarRigOffset, runtime }: {
  attackEvent: StoryAdventureAttackEvent & { projectile: StorySpriteProjectileDefinition };
  playerPosition: MutableRefObject<THREE.Vector3>;
  avatarRigOffset: [number, number];
  runtime: MutableRefObject<StoryPlayerProjectileRuntime | null>;
}) {
  const group = useRef<THREE.Group>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const framePaths = useMemo(() => attackEvent.projectile.frames.map((frame) => frame.path), [attackEvent.projectile.frames]);
  const sourceTextures = useTexture(framePaths) as THREE.Texture[];
  const textures = useMemo(() => sourceTextures.map((source) => configurePixelTexture(source.clone())), [sourceTextures]);

  useEffect(() => {
    const definition = attackEvent.projectile;
    runtime.current = {
      active: false,
      released: false,
      x: attackEvent.x,
      y: attackEvent.y,
      facing: attackEvent.facing,
      releaseAt: attackEvent.startedAt + definition.releaseDelayMs,
      expiresAt: attackEvent.startedAt + definition.releaseDelayMs + definition.lifetimeMs,
      attack: attackEvent,
      definition
    };
    return () => {
      if (runtime.current?.attack.id === attackEvent.id) runtime.current = null;
    };
  }, [attackEvent, runtime]);
  useEffect(() => () => textures.forEach((texture) => texture.dispose()), [textures]);

  useFrame((_, delta) => {
    const mesh = group.current;
    const current = runtime.current;
    if (!mesh || !current || current.attack.id !== attackEvent.id) return;
    const now = performance.now();
    if (now < current.releaseAt || now >= current.expiresAt || !current.active && current.released) {
      if (now >= current.expiresAt) current.active = false;
      mesh.visible = false;
      return;
    }
    let justReleased = false;
    if (!current.released) {
      justReleased = true;
      current.released = true;
      current.active = true;
      const spawn = getStoryProjectileSpawnPosition({
        playerX: playerPosition.current.x,
        playerY: playerPosition.current.y,
        facing: current.facing,
        rigOffsetX: avatarRigOffset[0],
        rigOffsetY: avatarRigOffset[1],
        projectile: current.definition
      });
      current.x = spawn.x;
      current.y = spawn.y;
    }
    if (!current.active) {
      mesh.visible = false;
      return;
    }
    if (!justReleased) {
      const next = stepAdventureProjectile({
        x: current.x,
        y: current.y,
        velocityX: current.facing * current.definition.speed,
        velocityY: 0,
        deltaSeconds: delta
      });
      current.x = next.x;
      current.y = next.y;
    }
    const elapsed = Math.max(0, now - current.releaseAt);
    const frameIndex = Math.min(
      current.definition.frames.length - 1,
      Math.floor(elapsed / current.definition.lifetimeMs * current.definition.frames.length)
    );
    if (material.current?.map !== textures[frameIndex]) {
      material.current!.map = textures[frameIndex];
      material.current!.needsUpdate = true;
    }
    mesh.visible = true;
    mesh.position.set(current.x, current.y, 0.88);
    mesh.scale.x = current.facing;
  });

  return <group ref={group} visible={false} name={`story-player-projectile-${attackEvent.avatarSet}`}>
    <mesh>
      <planeGeometry args={attackEvent.projectile.worldSize} />
      <meshBasicMaterial ref={material} map={textures[0]} transparent alphaTest={0.02} depthWrite={false} toneMapped={false} />
    </mesh>
  </group>;
}

function AdventureResourceNode({ node, biomeId, progress, attackEvent, playerPosition, playerProjectile, reducedMotion, onHarvest }: {
  node: StoryResourceNodeDefinition;
  biomeId: StoryBiomeId;
  progress: StoryAdventureProgressV1;
  attackEvent: StoryAdventureAttackEvent | null;
  playerPosition: MutableRefObject<THREE.Vector3>;
  playerProjectile: MutableRefObject<StoryPlayerProjectileRuntime | null>;
  reducedMotion: boolean;
  onHarvest: (node: StoryResourceNodeDefinition) => void;
}) {
  const resource = STORY_RESOURCES.find((candidate) => candidate.id === node.resourceId)!;
  const sources = useTexture([...resource.nodeFrames]) as THREE.Texture[];
  const textures = useMemo(() => sources.map((source) => configurePixelTexture(source.clone())), [sources]);
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const aura = useRef<THREE.Mesh>(null);
  const shards = useRef<THREE.Group>(null);
  const lastAttackId = useRef(0);
  const hitFlashUntil = useRef(0);
  const shakeStartedAt = useRef(0);
  const shakeUntil = useRef(0);
  const shakeStrength = useRef(0);
  const shakeDirection = useRef<-1 | 1>(1);
  const breakStartedAt = useRef(0);
  const damageSequence = useRef(0);
  const damageTimers = useRef<number[]>([]);
  const [hits, setHits] = useState(0);
  const [damagePops, setDamagePops] = useState<AdventureDamagePop[]>([]);
  const available = isAdventureResourceNodeAvailable(progress, node, biomeId);
  const modifiers = adventureResourceYieldModifiers(progress, node);
  const toughness = Math.max(1, node.toughness - modifiers.toughnessReduction);
  const damaged = hits >= Math.ceil(toughness / 2);

  useEffect(() => () => textures.forEach((texture) => texture.dispose()), [textures]);
  useEffect(() => { if (available) setHits(0); }, [available, node.id]);
  useEffect(() => () => damageTimers.current.forEach((timer) => window.clearTimeout(timer)), []);

  useFrame((state) => {
    const now = performance.now();
    if (material.current) {
      material.current.map = available ? textures[damaged ? 1 : 0] : textures[2];
      material.current.color.set(now < hitFlashUntil.current ? '#ffffff' : resource.color);
      material.current.opacity = available ? 1 : 0.34;
    }
    if (aura.current) {
      const pulse = reducedMotion ? 1 : 1 + Math.sin(state.clock.elapsedTime * 2.8 + node.position[0]) * 0.12;
      aura.current.scale.setScalar(pulse);
    }
    if (mesh.current) {
      const shaking = now < shakeUntil.current && !reducedMotion;
      if (shaking) {
        const duration = Math.max(1, shakeUntil.current - shakeStartedAt.current);
        const progress = THREE.MathUtils.clamp((now - shakeStartedAt.current) / duration, 0, 1);
        const envelope = 1 - progress;
        const wave = Math.sin(progress * Math.PI * 7);
        mesh.current.position.set(wave * shakeStrength.current * envelope * shakeDirection.current, Math.abs(wave) * shakeStrength.current * 0.16 * envelope, 0);
        mesh.current.rotation.z = wave * 0.085 * envelope;
        mesh.current.scale.set(1 + Math.abs(wave) * 0.07 * envelope, 1 - Math.abs(wave) * 0.06 * envelope, 1);
      } else {
        mesh.current.position.set(0, 0, 0);
        mesh.current.rotation.z = 0;
        mesh.current.scale.set(1, 1, 1);
      }
    }
    if (shards.current) {
      const elapsed = now - breakStartedAt.current;
      shards.current.visible = breakStartedAt.current > 0 && elapsed < (reducedMotion ? 180 : 620);
      shards.current.children.forEach((child, index) => {
        const angle = index / 6 * Math.PI * 2;
        const travel = Math.min(1.4, elapsed / 330);
        child.position.set(Math.cos(angle) * travel, Math.sin(angle) * travel + 0.35 - travel * travel * 0.3, 0.5);
        child.scale.setScalar(Math.max(0.02, 0.16 * (1 - elapsed / 650)));
      });
    }
    if (!available || !attackEvent || !adventureAttackCanHitResource(lastAttackId.current, attackEvent.id) || now > attackEvent.activeUntil) return;
    let hit = false;
    if (attackEvent.projectile) {
      const projectile = playerProjectile.current;
      if (projectile?.active && projectile.attack.id === attackEvent.id && storyPlayerProjectileHits({ projectileX: projectile.x, projectileY: projectile.y, hitboxSize: projectile.definition.hitboxSize, targetX: node.position[0], targetY: node.position[1], targetHalfSize: { width: node.size[0] / 2, height: node.size[1] / 2 } })) {
        projectile.active = false;
        hit = true;
      }
    } else {
      const attackBox = getAdventureAttackFrameHitbox(attackEvent.avatarSet, attackEvent.attackInput, now - attackEvent.startedAt);
      hit = Boolean(attackBox && adventureAttackHits({ playerX: playerPosition.current.x, playerY: playerPosition.current.y, facing: attackEvent.facing, enemyX: node.position[0], enemyY: node.position[1], targetHalfSize: { width: node.size[0] / 2, height: node.size[1] / 2 }, attackBox }));
    }
    if (!hit) return;
    lastAttackId.current = attackEvent.id;
    hitFlashUntil.current = now + (reducedMotion ? 80 : 180);
    const hitStrength = adventureResourceHitStrength(attackEvent.attackInput);
    const next = hits + hitStrength;
    const finishing = next >= toughness;
    const forceful = attackEvent.attackInput === 'heavy' || attackEvent.critical;
    const reaction = createAdventureHitReaction(forceful, reducedMotion);
    shakeStartedAt.current = now;
    shakeUntil.current = now + reaction.shakeDurationMs;
    shakeStrength.current = reaction.shakeStrength * (node.major ? 1.08 : 0.82);
    shakeDirection.current = attackEvent.facing;
    setHits(next);
    const popId = ++damageSequence.current;
    const feedback = createAdventureDamageFeedback({ damage: hitStrength, critical: forceful, finishing, sequence: popId, reducedMotion });
    setDamagePops((current) => [...current.slice(-3), { id: popId, ...feedback }]);
    const damageTimer = window.setTimeout(() => {
      setDamagePops((current) => current.filter((pop) => pop.id !== popId));
      damageTimers.current = damageTimers.current.filter((timer) => timer !== damageTimer);
    }, feedback.durationMs);
    damageTimers.current.push(damageTimer);
    emitAdventureAudioEvent({ kind: 'resource-hit', attackInput: attackEvent.attackInput, material: resource.impactMaterial, broken: finishing, major: node.major, legendary: node.rarity === 'legendary', sequence: attackEvent.id });
    if (finishing) {
      breakStartedAt.current = now;
      onHarvest(node);
    }
  });

  return <group position={node.position} userData={{ resourceNodeId: node.id }}>
    {(node.major || node.rarity === 'legendary') && <mesh ref={aura} position={[0, -node.size[1] * 0.38, -0.1]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.58, 0.76, 20]} />
      <meshBasicMaterial color={resource.color} transparent opacity={available ? 0.54 : 0.12} depthWrite={false} />
    </mesh>}
    <mesh ref={mesh} renderOrder={24}>
      <planeGeometry args={node.size} />
      <meshBasicMaterial ref={material} map={textures[0]} transparent alphaTest={0.02} depthWrite={false} toneMapped={false} />
    </mesh>
    <group ref={shards} visible={false}>{Array.from({ length: 6 }, (_, index) => <mesh key={index}><planeGeometry args={[1, 1]} /><meshBasicMaterial color={index % 2 ? resource.color : '#ffffff'} transparent depthWrite={false} /></mesh>)}</group>
    {available && hits > 0 && <Html center position={[0, node.size[1] / 2 + 0.16, 0.7]} zIndexRange={[7, 0]} className="story-enemy-bar-shell story-resource-health-shell">
      <div className={`story-enemy-bar story-resource-health ${node.major ? 'is-elite' : ''}`} style={{ '--story-resource-accent': resource.color } as CSSProperties} data-testid={`story-resource-health-${node.id}`}>
        <span><i style={{ width: `${Math.max(0, 1 - hits / toughness) * 100}%` }} /></span>
        <small>{resource.label} · {Math.max(0, toughness - hits)}/{toughness}</small>
      </div>
    </Html>}
    {damagePops.map((pop) => <Html key={pop.id} center position={[0, node.size[1] / 2 + 0.05, 0.9]} zIndexRange={[10, 0]} className="story-enemy-damage-shell story-resource-damage-shell">
      <output
        className={`story-enemy-damage story-resource-damage ${pop.critical ? 'is-critical' : ''} ${pop.finishing ? 'is-finishing' : ''} ${reducedMotion ? 'is-reduced-motion' : ''}`}
        data-testid={`story-resource-damage-${node.id}-${pop.id}`}
        aria-label={`${pop.damage} resource damage${pop.finishing ? ', resource broken' : ''}`}
        style={{ '--story-damage-accent': resource.color, '--story-damage-bright': resource.color, '--story-damage-mid': resource.color, '--story-damage-x': `${pop.offsetX}px`, '--story-damage-end-x': `${pop.endOffsetX}px` } as CSSProperties}
      >
        <span>{pop.damage}</span>
        {(pop.critical || pop.finishing) && <small>{pop.finishing ? 'BREAK!' : 'HEAVY HIT'}</small>}
      </output>
    </Html>)}
    {node.rarity === 'legendary' && available && <Html center position={[0, node.size[1] / 2 + 0.35, 0.8]} className="story-resource-label"><span>Legendary</span><strong>{resource.label}</strong></Html>}
  </group>;
}

function AdventureEnemy({ spawn, level, activePartyMembers, paused, playerPosition, playerProjectile, attackEvent, reducedMotion, onPlayerDamage, onDefeated }: {
  spawn: StoryEnemySpawnDefinition;
  level: number;
  activePartyMembers: number;
  paused: boolean;
  playerPosition: MutableRefObject<THREE.Vector3>;
  playerProjectile: MutableRefObject<StoryPlayerProjectileRuntime | null>;
  attackEvent: StoryAdventureAttackEvent | null;
  reducedMotion: boolean;
  onPlayerDamage: (damage: number, sourceX: number) => void;
  onDefeated: (spawn: StoryEnemySpawnDefinition, xp: number, tier: StoryEnemyTier) => void;
}) {
  const definition = getStoryEnemyDefinition(spawn.enemyId);
  const archetype = definition.archetype;
  const displayScale = spawn.scale ?? 1;
  const group = useRef<THREE.Group>(null);
  const enemyBody = useRef<THREE.Group>(null);
  const damageLayer = useRef<THREE.Group>(null);
  const projectileMeshes = useRef<Array<THREE.Mesh | null>>([]);
  const projectiles = useRef<AdventureProjectileRuntime[]>(Array.from({ length: 3 }, () => ({ active: false, x: 0, y: 0, velocityX: 0, velocityY: 0, expiresAt: 0, damage: 0, radius: 0.2, color: spawn.accent })));
  const stats = useMemo(() => {
    const base = getAdventureEnemyStats(archetype, level);
    return {
      ...base,
      maxHealth: Math.round(base.maxHealth * definition.healthMultiplier * storyPartyEnemyHealthScale(activePartyMembers)),
      damage: Math.round(base.damage * definition.damageMultiplier),
      speed: base.speed * definition.speedMultiplier,
      xp: Math.round(base.xp * definition.xpMultiplier)
    };
  }, [activePartyMembers, archetype, definition, level]);
  const x = useRef(spawn.position[0]);
  const y = useRef(spawn.position[1]);
  const facing = useRef<-1 | 1>(-1);
  const health = useRef(stats.maxHealth);
  const alive = useRef(true);
  const defeatReported = useRef(false);
  const flashUntil = useRef(0);
  const shakeStartedAt = useRef(0);
  const shakeUntil = useRef(0);
  const shakeStrength = useRef(0);
  const shakeDirection = useRef<-1 | 1>(1);
  const staggerUntil = useRef(0);
  const lastAttackAt = useRef(0);
  const attackCursor = useRef(0);
  const activeEnemyAttack = useRef<{ definition: StoryEnemyAttackDefinition; startedAt: number; hit: boolean } | null>(null);
  const animationId = useRef('idle');
  const animationStartedAt = useRef(performance.now());
  const animationLockedUntil = useRef(0);
  const damageSequence = useRef(0);
  const lastRegisteredAttackId = useRef(0);
  const damageTimers = useRef<number[]>([]);
  const [damagePops, setDamagePops] = useState<AdventureDamagePop[]>([]);
  const [visual, setVisual] = useState({ health: stats.maxHealth, alive: true, critical: false, facing: -1 as -1 | 1, animationId: 'idle', animationStartedAt: performance.now() });

  const retireOffense = useCallback(() => {
    activeEnemyAttack.current = null;
    projectiles.current.forEach((projectile, index) => {
      projectile.active = false;
      const mesh = projectileMeshes.current[index];
      if (mesh) mesh.visible = false;
    });
  }, []);

  const playAnimation = useCallback((next: string, restart = false) => {
    if (!restart && animationId.current === next) return;
    animationId.current = next;
    animationStartedAt.current = performance.now();
    setVisual((current) => ({ ...current, animationId: next, animationStartedAt: animationStartedAt.current }));
  }, []);

  useEffect(() => {
    health.current = stats.maxHealth;
    alive.current = true;
    defeatReported.current = false;
    x.current = spawn.position[0];
    y.current = spawn.position[1];
    retireOffense();
    animationLockedUntil.current = 0;
    animationId.current = 'idle';
    animationStartedAt.current = performance.now();
    setDamagePops([]);
    setVisual({ health: stats.maxHealth, alive: true, critical: false, facing: -1, animationId: 'idle', animationStartedAt: animationStartedAt.current });
  }, [retireOffense, spawn.id, spawn.position, stats.maxHealth]);

  useEffect(() => () => {
    retireOffense();
    damageTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, [retireOffense]);

  const registerAttackHit = useCallback((currentAttack: StoryAdventureAttackEvent) => {
    if (!alive.current || lastRegisteredAttackId.current === currentAttack.id) return;
    lastRegisteredAttackId.current = currentAttack.id;
    health.current = Math.max(0, health.current - currentAttack.damage);
    const hitAt = performance.now();
    const finishing = health.current <= 0;
    const popId = ++damageSequence.current;
    const feedback = createAdventureDamageFeedback({ damage: currentAttack.damage, critical: currentAttack.critical, finishing, sequence: popId, reducedMotion });
    const reaction = createAdventureHitReaction(currentAttack.critical, reducedMotion);
    emitAdventureAudioEvent({ kind: 'enemy-hit', attackInput: currentAttack.attackInput, critical: currentAttack.critical, finishing });
    setDamagePops((current) => [...current.slice(-3), { id: popId, ...feedback }]);
    const damageTimer = window.setTimeout(() => {
      setDamagePops((current) => current.filter((pop) => pop.id !== popId));
      damageTimers.current = damageTimers.current.filter((timer) => timer !== damageTimer);
    }, feedback.durationMs);
    damageTimers.current.push(damageTimer);
    x.current += currentAttack.facing * 0.46 * currentAttack.knockbackMultiplier;
    flashUntil.current = hitAt + (reducedMotion ? 90 : 240);
    shakeStartedAt.current = hitAt;
    shakeUntil.current = hitAt + reaction.shakeDurationMs;
    shakeStrength.current = reaction.shakeStrength;
    shakeDirection.current = currentAttack.facing;
    staggerUntil.current = hitAt + reaction.staggerMs;
    if (health.current <= 0) {
      alive.current = false;
      retireOffense();
      const hasDeath = definition.animations.some((animation) => animation.id === 'dead');
      const deathAnimation = hasDeath ? getStoryEnemyAnimation(spawn.enemyId, 'dead') : getStoryEnemyAnimation(spawn.enemyId, 'idle');
      const deathDuration = hasDeath ? deathAnimation.frames.reduce((sum, frame) => sum + frame.durationMs, 0) : 520;
      animationId.current = hasDeath ? 'dead' : 'idle';
      animationStartedAt.current = hitAt;
      setVisual({ health: 0, alive: false, critical: currentAttack.critical, facing: facing.current, animationId: animationId.current, animationStartedAt: hitAt });
      const defeatTimer = window.setTimeout(() => {
        if (defeatReported.current) return;
        defeatReported.current = true;
        onDefeated(spawn, stats.xp, definition.tier);
      }, reducedMotion ? Math.min(180, deathDuration) : deathDuration);
      damageTimers.current.push(defeatTimer);
      return;
    }
    const hurtAnimation = getStoryEnemyAnimation(spawn.enemyId, 'hurt');
    const hurtDuration = hurtAnimation.frames.reduce((sum, frame) => sum + frame.durationMs, 0);
    animationLockedUntil.current = hitAt + (reducedMotion ? Math.min(120, hurtDuration) : hurtDuration);
    playAnimation('hurt', true);
    setVisual((current) => ({ ...current, health: health.current, alive: true, critical: currentAttack.critical, facing: facing.current }));
  }, [definition.animations, definition.tier, onDefeated, playAnimation, reducedMotion, retireOffense, spawn, stats.xp]);

  useFrame((state, frameDelta) => {
    if (paused) return;
    const now = performance.now();
    const delta = Math.min(frameDelta, 1 / 30);
    if (!group.current) return;
    const activationMin = (spawn.leash?.[0] ?? spawn.position[0] - 13) - 3;
    const activationMax = (spawn.leash?.[1] ?? spawn.position[0] + 13) + 3;
    if (playerPosition.current.x < activationMin || playerPosition.current.x > activationMax) {
      group.current.visible = false;
      projectiles.current.forEach((projectile) => { projectile.active = false; });
      return;
    }
    if (!alive.current) {
      retireOffense();
      group.current.visible = !defeatReported.current;
      return;
    }
    const launchedProjectile = playerProjectile.current;
    if (launchedProjectile?.active) {
      for (const enemyProjectile of projectiles.current) {
        if (enemyProjectile.active && storyPlayerProjectileHits({
          projectileX: launchedProjectile.x,
          projectileY: launchedProjectile.y,
          hitboxSize: launchedProjectile.definition.hitboxSize,
          targetX: enemyProjectile.x,
          targetY: enemyProjectile.y,
          targetKind: 'projectile'
        })) {
          enemyProjectile.active = false;
          launchedProjectile.active = false;
          break;
        }
      }
      if (alive.current
        && launchedProjectile.active
        && lastRegisteredAttackId.current !== launchedProjectile.attack.id
        && storyPlayerProjectileHits({
          projectileX: launchedProjectile.x,
          projectileY: launchedProjectile.y,
          hitboxSize: launchedProjectile.definition.hitboxSize,
          targetX: x.current,
          targetY: y.current,
          targetKind: archetype,
          targetHalfSize: { width: definition.hitbox[0] * STORY_ENEMY_RUNTIME_SCALE, height: definition.hitbox[1] * STORY_ENEMY_RUNTIME_SCALE }
        })) {
        launchedProjectile.active = false;
        registerAttackHit(launchedProjectile.attack);
      }
    }
    if (attackEvent && !attackEvent.projectile && now <= attackEvent.activeUntil) {
      const attackBox = getAdventureAttackFrameHitbox(attackEvent.avatarSet, attackEvent.attackInput, now - attackEvent.startedAt);
      if (attackBox) {
        const attackX = playerPosition.current.x;
        const attackY = playerPosition.current.y;
        for (const projectile of projectiles.current) {
          if (projectile.active && adventureAttackHits({ playerX: attackX, playerY: attackY, facing: attackEvent.facing, enemyX: projectile.x, enemyY: projectile.y, targetKind: 'projectile', attackBox })) projectile.active = false;
        }
        if (lastRegisteredAttackId.current !== attackEvent.id && adventureAttackHits({ playerX: attackX, playerY: attackY, facing: attackEvent.facing, enemyX: x.current, enemyY: y.current, targetKind: archetype, targetHalfSize: { width: definition.hitbox[0] * STORY_ENEMY_RUNTIME_SCALE, height: definition.hitbox[1] * STORY_ENEMY_RUNTIME_SCALE }, attackBox })) {
          registerAttackHit(attackEvent);
        }
      }
    }
    if (damageLayer.current) damageLayer.current.position.set(x.current, y.current, 0.9);
    if (enemyBody.current) {
      const groundedVisualOffset = storyScaledGroundAnchorOffsetY(displayScale);
      if (!reducedMotion && now < shakeUntil.current) {
        const duration = Math.max(1, shakeUntil.current - shakeStartedAt.current);
        const progress = THREE.MathUtils.clamp((now - shakeStartedAt.current) / duration, 0, 1);
        const envelope = 1 - progress;
        const wave = Math.sin(progress * Math.PI * 7);
        enemyBody.current.position.x = wave * shakeStrength.current * envelope * shakeDirection.current;
        enemyBody.current.position.y = groundedVisualOffset + Math.abs(wave) * shakeStrength.current * 0.18 * envelope;
        enemyBody.current.rotation.z = wave * 0.065 * envelope;
      } else {
        enemyBody.current.position.set(0, groundedVisualOffset, 0);
        enemyBody.current.rotation.z = 0;
      }
    }
    if (!alive.current) {
      group.current.visible = !defeatReported.current;
      return;
    }
    group.current.visible = true;
    const playerX = playerPosition.current.x;
    const playerY = playerPosition.current.y;
    const dx = playerX - x.current;
    const distance = Math.abs(dx);
    const direction = dx >= 0 ? 1 : -1;
    let move = 0;
    const currentEnemyAttack = activeEnemyAttack.current;
    if (currentEnemyAttack) {
      const animation = getStoryEnemyAnimation(spawn.enemyId, currentEnemyAttack.definition.animation);
      const elapsed = now - currentEnemyAttack.startedAt;
      const duration = animation.frames.reduce((sum, frame) => sum + frame.durationMs, 0);
      let frameIndex = animation.frames.length - 1;
      let frameEnd = 0;
      for (let index = 0; index < animation.frames.length; index += 1) {
        frameEnd += animation.frames[index].durationMs;
        if (elapsed < frameEnd) { frameIndex = index; break; }
      }
      const activeRange = animation.activeFrameRange ?? [Math.max(0, animation.frames.length - 2), animation.frames.length - 1];
      if (!currentEnemyAttack.hit && frameIndex >= activeRange[0] && frameIndex <= activeRange[1]) {
        currentEnemyAttack.hit = true;
        const projectileDefinition = currentEnemyAttack.definition.projectile;
        if (projectileDefinition) {
          const projectile = projectiles.current.find((candidate) => !candidate.active);
          if (projectile) {
            projectile.active = true;
            projectile.x = x.current + direction * 0.28;
            projectile.y = y.current + 0.25;
            projectile.velocityX = direction * projectileDefinition.speed;
            projectile.velocityY = (playerY - y.current) * 0.22;
            projectile.expiresAt = now + projectileDefinition.lifetimeMs;
            projectile.damage = Math.max(1, Math.round(stats.damage * currentEnemyAttack.definition.damageMultiplier));
            projectile.radius = projectileDefinition.radius;
            projectile.color = projectileDefinition.color;
          }
        } else if (canAdventureEnemyDamagePlayer(alive.current, distance <= currentEnemyAttack.definition.range * STORY_ENEMY_RUNTIME_SCALE && Math.abs(playerY - y.current) < 1.15 * STORY_ENEMY_RUNTIME_SCALE)) {
          onPlayerDamage(Math.max(1, Math.round(stats.damage * currentEnemyAttack.definition.damageMultiplier)), x.current);
        }
      }
      if (elapsed >= duration) {
        activeEnemyAttack.current = null;
        lastAttackAt.current = now;
        playAnimation('idle', true);
      }
    } else {
      const nextAttack = definition.attacks[attackCursor.current % definition.attacks.length];
      const canAttack = now - lastAttackAt.current >= nextAttack.cooldownMs
        && Math.abs(playerY - y.current) < (nextAttack.projectile ? 4 : 1.2)
        && distance <= nextAttack.range * (nextAttack.projectile ? 1 : STORY_ENEMY_RUNTIME_SCALE);
      if (canAttack && now >= staggerUntil.current && now >= animationLockedUntil.current) {
        attackCursor.current += 1;
        activeEnemyAttack.current = { definition: nextAttack, startedAt: now, hit: false };
        playAnimation(nextAttack.animation, true);
      } else if (definition.behavior === 'caster' || archetype === 'ranged') {
        if (distance < 3.7) move = -direction;
        else if (distance > 6.5 && distance < 10) move = direction;
      } else if (definition.behavior === 'duelist') {
        if (distance < 1.2 && now - lastAttackAt.current < nextAttack.cooldownMs * 0.55) move = -direction;
        else if (distance < 8) move = direction;
      } else if (definition.behavior === 'ambusher') {
        move = distance < 5.2 ? direction : 0;
      } else if (distance < (archetype === 'flying' ? 9 : 7)) {
        move = direction;
      } else {
        move = Math.sin(state.clock.elapsedTime * 0.72 + spawn.position[0]) >= 0 ? 1 : -1;
      }
    }
    if (now >= staggerUntil.current && now >= animationLockedUntil.current) x.current += move * stats.speed * delta;
    x.current = THREE.MathUtils.clamp(x.current, spawn.leash?.[0] ?? spawn.position[0] - spawn.patrolRadius * 2.5, spawn.leash?.[1] ?? spawn.position[0] + spawn.patrolRadius * 2.5);
    if (move !== 0 && facing.current !== (move > 0 ? 1 : -1)) {
      facing.current = move > 0 ? 1 : -1;
      setVisual((current) => ({ ...current, facing: facing.current }));
    }
    if (!activeEnemyAttack.current && now >= staggerUntil.current && now >= animationLockedUntil.current) playAnimation(move === 0 ? 'idle' : definition.animations.some((animation) => animation.id === 'run') ? 'run' : 'walk');
    y.current = archetype === 'flying' && !reducedMotion ? spawn.position[1] + Math.sin(state.clock.elapsedTime * 2.1 + spawn.position[0]) * 0.34 : spawn.position[1];
    group.current.position.set(x.current, y.current, 0.42);
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
      mesh.scale.setScalar(projectile.radius / 0.18);
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.color.set(projectile.color);
      if (canAdventureEnemyDamagePlayer(alive.current, projectile.active) && Math.abs(playerX - projectile.x) < 0.42 + projectile.radius && Math.abs(playerY - projectile.y) < 0.65 + projectile.radius) {
        projectile.active = false;
        mesh.visible = false;
        onPlayerDamage(projectile.damage, projectile.x);
      }
    });
  });

  return <>
    <group ref={group} position={[spawn.position[0], spawn.position[1], 0.42]} name={`story-enemy-${spawn.id}`}>
      <group ref={enemyBody} position={[0, storyScaledGroundAnchorOffsetY(displayScale), 0]} scale={[displayScale, displayScale, 1]}>
        <EnemySprite enemyId={spawn.enemyId} animationId={visual.animationId} animationStartedAt={visual.animationStartedAt} facing={visual.facing} flashUntil={flashUntil} fading={!visual.alive && !definition.animations.some((animation) => animation.id === 'dead')} />
      </group>
      <Html center position={[0, definition.visualHeight * displayScale - STORY_GROUNDED_ACTOR_CENTER_Y + 0.42, 0.3]} zIndexRange={[7, 0]} className="story-enemy-bar-shell">
        <div className={`story-enemy-bar ${visual.critical ? 'is-critical' : ''} ${definition.tier === 'challenger' ? 'is-elite' : ''}`} data-testid={`story-enemy-health-${spawn.id}`}>
          <span><i style={{ width: `${Math.max(0, visual.health / stats.maxHealth) * 100}%` }} /></span>
          <small>{definition.label} · Lv {level}</small>
        </div>
      </Html>
    </group>
    <group ref={damageLayer} position={[spawn.position[0], spawn.position[1], 0.9]}>
      {damagePops.map((pop) => <Html key={pop.id} center position={[0, definition.visualHeight * displayScale - STORY_GROUNDED_ACTOR_CENTER_Y + 0.12, 0.7]} zIndexRange={[10, 0]} className="story-enemy-damage-shell">
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

const MOUNT_ART: Record<StoryMountId, { path: string; frames: number; size: [number, number] }> = {
  'verdant-stag': { path: '/story/exploration/wildlife/Deer_Run.png', frames: 6, size: [2.55, 1.85] },
  'bramble-lynx': { path: '/story/exploration/wildlife/Wolf_Run.png', frames: 6, size: [2.65, 1.72] },
  'ironhorn-beetle': { path: '/story/exploration/wildlife/Bear_Run.png', frames: 5, size: [2.7, 1.55] },
  'pale-warg': { path: '/story/exploration/mounts/wolf-run.png', frames: 5, size: [2.7, 2.15] },
  'cinder-drake': { path: '/story/exploration/mounts/horse-run.png', frames: 5, size: [2.95, 2.35] },
  'frost-ram': { path: '/story/exploration/wildlife/Deer_Run.png', frames: 6, size: [2.6, 1.9] },
  'dune-strider': { path: '/story/exploration/mounts/horse-run.png', frames: 5, size: [3, 2.4] },
  glasswing: { path: '/story/exploration/wildlife/Deer_Run.png', frames: 6, size: [2.75, 2] }
};

function StoryMountVisual({ mount, facing }: { mount: StoryMountDefinition; facing: -1 | 1 }) {
  const art = MOUNT_ART[mount.id];
  const source = useTexture(art.path);
  const texture = useMemo(() => {
    const clone = source.clone();
    configurePixelTexture(clone);
    clone.wrapS = THREE.RepeatWrapping;
    clone.wrapT = THREE.ClampToEdgeWrapping;
    clone.repeat.set(1 / art.frames, 1);
    clone.offset.set(0, 0);
    return clone;
  }, [art.frames, source]);
  useFrame((state) => { texture.offset.x = (Math.floor(state.clock.elapsedTime * 8) % art.frames) / art.frames; });
  useEffect(() => () => texture.dispose(), [texture]);
  return <group position={[0, 0, -0.06]} scale={[facing, 1, 1]}>
    <mesh position={[0, -0.73, -0.02]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.65, 0.92, 24]} /><meshBasicMaterial color={mount.accent} transparent opacity={0.4} depthWrite={false} /></mesh>
    <mesh position={[0, storyGroundAnchoredPlaneCenterY(art.size[1], mount.footAnchor[1]), 0]}><planeGeometry args={art.size} /><meshBasicMaterial map={texture} transparent alphaTest={0.02} depthWrite={false} toneMapped={false} /></mesh>
  </group>;
}

function StoryPlayerController({ hub, avatar, avatarVisible, groundingOffsetY, playerPosition, movementLock, readInput, disabled, reducedMotion, quickMatchAvailable, derivedStats, mounted, mount, mountMasteryRank, impactEvent, onAttack, onQuickMatch, onNearbyPortal, onActivatePortal, onWaterState, onExit, onPause, onStateSample, onReady }: {
  hub: StoryHubDefinition;
  avatar: StoryProfileV4['avatar'];
  avatarVisible: boolean;
  groundingOffsetY: number;
  playerPosition: MutableRefObject<THREE.Vector3>;
  movementLock: [number, number] | null;
  readInput: () => StoryHubInput;
  disabled: boolean;
  reducedMotion: boolean;
  quickMatchAvailable: boolean;
  derivedStats: ReturnType<typeof getAdventureDerivedStats>;
  mounted: boolean;
  mount: StoryMountDefinition | null;
  mountMasteryRank: number;
  impactEvent: StoryPlayerImpactEvent | null;
  onAttack: (x: number, y: number, facing: -1 | 1, attackInput: StoryAttackInput, durationSeconds: number) => void;
  onQuickMatch: () => void;
  onNearbyPortal: (portal: StoryPortalDefinition | null) => void;
  onActivatePortal: (portal: StoryPortalDefinition) => void;
  onWaterState: (underwater: boolean, airPocket?: [number, number]) => void;
  onExit: () => void;
  onPause: () => void;
  onStateSample: (state: StoryHubPlayerState) => void;
  onReady?: () => void;
}) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const groundedVisualGroup = useRef<THREE.Group>(null);
  const avatarGroup = useRef<THREE.Group>(null);
  const position = useRef({ x: hub.spawn[0], y: hub.spawn[1] });
  const velocityY = useRef(0);
  const facing = useRef<-1 | 1>(1);
  const [visualState, setVisualState] = useState<{ pose: StoryAvatarPose; facing: -1 | 1; attackSequence: number }>({ pose: 'idle', facing: 1, attackSequence: 0 });
  const groundedUntil = useRef(0);
  const groundedPlatform = useRef<string | null>('ground');
  const jumpsUsed = useRef(0);
  const jumpBufferedUntil = useRef(0);
  const dropThroughUntil = useRef(0);
  const previousButtons = useRef({ jump: false, interact: false, jab: false, heavy: false, kick: false, special: false, back: false, pause: false });
  const previousWaterState = useRef(false);
  const attackUntil = useRef(0);
  const attackPose = useRef<StoryAvatarPose>('attack-jab');
  const attackSequence = useRef(0);
  const bufferedAttack = useRef<StoryBufferedAttackInput>(null);
  const actionInputArmed = useRef(false);
  const releasedInputFrames = useRef(0);
  const nearbyId = useRef<string | null>(null);
  const lastSampleAt = useRef(0);
  const flashUntil = useRef(0);
  const platformSurfaceInsets = useMemo(() => {
    const insets = new globalThis.Map(
      hub.platforms.map((platform) => [platform.id, storyPlatformSurfacePlacement(platform, hub.environment?.surface).surfaceInsetY])
    );
    const ground = storyHubGroundPlatform(hub);
    if (ground) insets.set('ground', insets.get(ground.id) ?? 0);
    return insets;
  }, [hub]);
  const initialSurfaceInsetY = platformSurfaceInsets.get('ground') ?? 0;
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
    bufferedAttack.current = null;
  }, [disabled]);

  useFrame((state, frameDelta) => {
    const now = state.clock.elapsedTime;
    const delta = Math.min(frameDelta, 1 / 30);
    const input = disabled ? { left: false, right: false, down: false, up: false, jump: false, interact: false, jab: false, kick: false, heavy: false, special: false, block: false, back: false, pause: false } : readInput();
    const horizontal = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const jumpPressed = Boolean(input.jump || input.up);
    const interactPressed = Boolean(input.interact);
    const attackButtons = { jab: Boolean(input.jab), heavy: Boolean(input.heavy), kick: Boolean(input.kick), special: Boolean(input.special) };
    const attackPressed = Object.values(attackButtons).some(Boolean);
    const backPressed = Boolean(input.back);
    const pausePressed = Boolean(input.pause);
    const jumpEdge = actionInputArmed.current && jumpPressed && !previousButtons.current.jump;
    const interactEdge = actionInputArmed.current && interactPressed && !previousButtons.current.interact;
    const attackEdges: Record<StoryAttackInput, boolean> = {
      special: actionInputArmed.current && attackButtons.special && !previousButtons.current.special,
      heavy: actionInputArmed.current && attackButtons.heavy && !previousButtons.current.heavy,
      kick: actionInputArmed.current && attackButtons.kick && !previousButtons.current.kick,
      jab: actionInputArmed.current && attackButtons.jab && !previousButtons.current.jab
    };
    const selectedAttack = resolveStoryAttackInput(attackEdges);
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
    if (horizontal !== 0) facing.current = horizontal > 0 ? 1 : -1;
    const bufferedAttackResult = advanceStoryAttackInputBuffer({
      buffered: bufferedAttack.current,
      pressed: selectedAttack,
      now,
      attackReady: attackUntil.current <= now
    });
    bufferedAttack.current = bufferedAttackResult.buffered;
    if (bufferedAttackResult.attackInput) {
      const attackDurationSeconds = getStoryAttackDurationMs(avatar.avatarSet, bufferedAttackResult.attackInput) / 1000;
      attackUntil.current = now + attackDurationSeconds;
      attackPose.current = STORY_ATTACK_POSES[bufferedAttackResult.attackInput];
      attackSequence.current += 1;
      onAttack(position.current.x, position.current.y, facing.current, bufferedAttackResult.attackInput, attackDurationSeconds);
    }
    const waterVolume = hub.exploration?.waterVolumes.find((volume) => position.current.x >= volume.bounds[0] && position.current.x <= volume.bounds[1] && position.current.y >= volume.bounds[2] && position.current.y <= volume.bounds[3]);
    const activeHazard = hub.hazards?.find((hazard) => position.current.x >= hazard.bounds[0] && position.current.x <= hazard.bounds[1] && position.current.y >= hazard.bounds[2] && position.current.y <= hazard.bounds[3]);
    const traversalPiece = hub.traversal?.find((piece) => Math.abs(position.current.x - piece.position[0]) <= piece.size[0] / 2 + 0.5 && Math.abs(position.current.y - piece.position[1]) <= piece.size[1] / 2 + 0.8);
    const airPocket = waterVolume?.airPockets.find((pocket) => Math.hypot(position.current.x - pocket[0], position.current.y - pocket[1]) <= 1.8);
    const swimming = Boolean(waterVolume && !airPocket);
    if (swimming !== previousWaterState.current || airPocket) {
      previousWaterState.current = swimming;
      onWaterState(swimming, airPocket);
    }
    const standingPlatform = groundedPlatform.current
      ? hub.platforms.find((platform) => platform.id === groundedPlatform.current)
      : undefined;
    const droppingThrough = Boolean(input.down && standingPlatform?.oneWay && groundedUntil.current >= now);
    if (swimming) {
      groundedPlatform.current = null;
      groundedUntil.current = 0;
      jumpsUsed.current = 0;
      jumpBufferedUntil.current = 0;
    } else if (droppingThrough) {
      dropThroughUntil.current = now + 0.28;
      groundedPlatform.current = null;
      groundedUntil.current = 0;
      position.current.y -= 0.12;
      velocityY.current = -2.2;
      jumpBufferedUntil.current = 0;
    } else if (jumpEdge && groundedUntil.current < now && jumpsUsed.current < 2) {
      velocityY.current = 11.4 * (mounted && mount ? mount.jumpMultiplier * (1 + mountMasteryRank * 0.008) : 1);
      jumpsUsed.current = 2;
      groundedPlatform.current = null;
      groundedUntil.current = 0;
      jumpBufferedUntil.current = 0;
    } else if (jumpEdge) {
      jumpBufferedUntil.current = now + 0.12;
    }

    const sprinting = horizontal !== 0 && input.block;
    if (!swimming && jumpBufferedUntil.current >= now && groundedUntil.current >= now) {
      velocityY.current = 7.8 * (mounted && mount ? mount.jumpMultiplier * (1 + mountMasteryRank * 0.008) : 1);
      jumpsUsed.current = 1;
      groundedPlatform.current = null;
      groundedUntil.current = 0;
      jumpBufferedUntil.current = 0;
    }
    const assistedClimb = traversalPiece && ['ladder', 'rope', 'lift', 'updraft'].includes(traversalPiece.kind);
    if (assistedClimb) {
      const vertical = (input.up || input.jump ? 1 : 0) - (input.down ? 1 : 0);
      velocityY.current = traversalPiece.kind === 'updraft' ? Math.max(1.8, vertical * 5.2) : vertical * (traversalPiece.speed ?? 4.6);
      if (vertical !== 0) { groundedPlatform.current = null; groundedUntil.current = 0; }
    } else if (swimming && waterVolume) {
      const vertical = (input.up || input.jump ? 1 : 0) - (input.down ? 1 : 0);
      velocityY.current = vertical * 4.1 + waterVolume.current[1];
    } else {
      velocityY.current += -22 * delta;
    }
    const baseMoveSpeed = sprinting ? derivedStats.sprintSpeed : derivedStats.walkSpeed;
    const mountSpeed = mounted && mount ? mount.speedMultiplier * (1 + mountMasteryRank * 0.012) : 1;
    const traversalMoveMultiplier = traversalPiece?.kind === 'slippery-surface' ? 1.22 : traversalPiece?.kind === 'current' ? 0.78 : 1;
    const sandMoveMultiplier = activeHazard?.kind === 'sinking-sand' ? 1 - 0.45 * derivedStats.sandSlowMultiplier : 1;
    const moveSpeed = baseMoveSpeed * mountSpeed * (swimming ? 0.64 : 1) * traversalMoveMultiplier * sandMoveMultiplier;
    const horizontalBounds: [number, number] = movementLock
      ? [Math.max(hub.bounds.minX, movementLock[0]) + 0.5, Math.min(hub.bounds.maxX, movementLock[1]) - 0.5]
      : [hub.bounds.minX + 0.5, hub.bounds.maxX - 0.5];
    let nextX = THREE.MathUtils.clamp(position.current.x + horizontal * moveSpeed * delta, horizontalBounds[0], horizontalBounds[1]);
    let nextY = position.current.y + velocityY.current * delta;
    if (activeHazard?.kind === 'wind') nextX = THREE.MathUtils.clamp(nextX + (activeHazard.knockback ?? 4.5) * 0.55 * derivedStats.windPushMultiplier * delta, horizontalBounds[0], horizontalBounds[1]);
    if (swimming && waterVolume) {
      nextX = THREE.MathUtils.clamp(nextX + waterVolume.current[0] * delta, waterVolume.bounds[0] + 0.4, waterVolume.bounds[1] - 0.4);
      nextY = THREE.MathUtils.clamp(nextY, waterVolume.bounds[2] + 0.5, waterVolume.bounds[3] - 0.25);
    }
    let landing: StoryPlatformDefinition | null = null;
    let landingX = nextX;
    if (!swimming && velocityY.current <= 0) {
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
    if (!swimming && nextY < hub.bounds.floorY + STORY_GROUNDED_ACTOR_CENTER_Y) {
      nextY = hub.bounds.floorY + STORY_GROUNDED_ACTOR_CENTER_Y;
      velocityY.current = 0;
      groundedUntil.current = now + 0.1;
      groundedPlatform.current = 'ground';
      jumpsUsed.current = 0;
    }
    position.current = { x: nextX, y: nextY };
    playerPosition.current.set(nextX, nextY, 0);
    bodyRef.current?.setNextKinematicTranslation({ x: nextX, y: nextY, z: 0 });
    if (groundedVisualGroup.current) {
      const surfaceInsetY = !swimming && groundedUntil.current >= now
        ? platformSurfaceInsets.get(groundedPlatform.current ?? '') ?? 0
        : 0;
      groundedVisualGroup.current.position.y = -surfaceInsetY;
    }
    if (avatarGroup.current) avatarGroup.current.visible = avatarVisible && (performance.now() >= flashUntil.current || Math.floor(performance.now() / 70) % 2 === 0);

    const nextPose: StoryAvatarPose = attackUntil.current > now ? attackPose.current : swimming || groundedUntil.current < now ? 'jump' : sprinting || mounted ? 'sprint' : horizontal !== 0 ? 'walk' : 'idle';
    if (visualState.pose !== nextPose || visualState.facing !== facing.current || visualState.attackSequence !== attackSequence.current) {
      setVisualState({ pose: nextPose, facing: facing.current, attackSequence: attackSequence.current });
    }

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
    previousButtons.current = { jump: jumpPressed, interact: interactPressed, ...attackButtons, back: backPressed, pause: pausePressed };
  });

  return <RigidBody ref={bodyRef} type="kinematicPosition" position={[hub.spawn[0], hub.spawn[1], 0]} colliders={false} enabledRotations={[false, false, false]}>
    <CuboidCollider args={[0.36, 0.8, 0.3]} />
    <group ref={groundedVisualGroup} position={[0, -initialSurfaceInsetY, 0]}>
      {mounted && mount && <StoryMountVisual mount={mount} facing={visualState.facing} />}
      <group ref={avatarGroup} position={[mount && mounted ? mount.riderOffset[0] : 0, groundingOffsetY + (mount && mounted ? mount.riderOffset[1] : 0), 0]} visible={avatarVisible}>
        <StoryAvatarRig avatar={avatar} pose={visualState.pose} facing={visualState.facing} reducedMotion={reducedMotion} restartToken={visualState.attackSequence} />
      </group>
    </group>
  </RigidBody>;
}

function readForcedChallengerId(): StoryEnemyId | undefined {
  if (typeof window === 'undefined' || !['localhost', '127.0.0.1'].includes(window.location.hostname)) return undefined;
  const candidate = new URLSearchParams(window.location.search).get('forceStoryChallenger');
  return STORY_CHALLENGER_IDS.includes(candidate as StoryEnemyId) ? candidate as StoryEnemyId : undefined;
}

function HubCanvas({ hub, profile, reducedMotion, readInput, disabled, avatarVisible, quickMatchAvailable, assignedPortalId, nearbyPortal, remotePlayers, selectedPlayerSessionId, progress, activePartyMembers, partyAiActors, mounted, mount, attackEvent, impactEvent, encounterSeed, initialEncounterProgress, onEncounterProgressChange, onChallengerStarted, onAttack, onPlayerDamage, onEnemyDefeated, onResourceHarvest, onQuickMatch, onSelectPlayer, onNearbyPortal, onActivatePortal, onWaterState, onExit, onPause, onStateSample, onReady }: {
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
  activePartyMembers: number;
  partyAiActors: StoryPartyAiActor[];
  mounted: boolean;
  mount: StoryMountDefinition | null;
  attackEvent: StoryAdventureAttackEvent | null;
  impactEvent: StoryPlayerImpactEvent | null;
  encounterSeed: string;
  initialEncounterProgress: StoryEncounterProgress;
  onEncounterProgressChange: (progress: StoryEncounterProgress) => void;
  onChallengerStarted: () => void;
  onAttack: (x: number, y: number, facing: -1 | 1, attackInput: StoryAttackInput, durationSeconds: number) => void;
  onPlayerDamage: (damage: number, sourceX: number) => void;
  onEnemyDefeated: (event: StoryEnemyDefeatEvent) => void;
  onResourceHarvest: (node: StoryResourceNodeDefinition) => void;
  onSelectPlayer: (presence: StoryHubPresence) => void;
  onNearbyPortal: (portal: StoryPortalDefinition | null) => void;
  onActivatePortal: (portal: StoryPortalDefinition) => void;
  onWaterState: (underwater: boolean, airPocket?: [number, number]) => void;
  onExit: () => void;
  onPause: () => void;
  onStateSample: (state: StoryHubPlayerState) => void;
  onReady: () => void;
}) {
  const playerPosition = useRef(new THREE.Vector3(hub.spawn[0], hub.spawn[1], 0));
  const playerProjectile = useRef<StoryPlayerProjectileRuntime | null>(null);
  const encounterProgressRef = useRef(initialEncounterProgress);
  const [encounterProgress, setEncounterProgress] = useState(initialEncounterProgress);
  const [challengerNoticeVisible, setChallengerNoticeVisible] = useState(Boolean(initialEncounterProgress.activeChallenge));
  const derivedStats = useMemo(() => getAdventureDerivedStats(progress), [progress]);
  const mountMasteryRank = mount ? progress.mounts[mount.id]?.masteryRank ?? 0 : 0;
  const enemySpawns = useMemo(() => rerollStoryRegularSpawns(encounterSeed, hub.enemySpawns ?? []), [encounterSeed, hub.enemySpawns]);
  const activeRegularSpawns = useMemo(() => enemySpawns.filter((spawn) => !encounterProgress.defeatedRegularIds.includes(spawn.id)), [encounterProgress.defeatedRegularIds, enemySpawns]);
  const activeChallenge = encounterProgress.activeChallenge;
  const movementLock = storyEncounterMovementLock(encounterProgress, hub.exploration?.encounters ?? []);
  const activeChallengerSpawn = useMemo((): StoryEnemySpawnDefinition | null => {
    if (!activeChallenge) return null;
    const zone = hub.exploration?.encounters.find((candidate) => candidate.id === activeChallenge.zoneId);
    if (!zone) return null;
    const definition = getStoryEnemyDefinition(activeChallenge.enemyId);
    return {
      id: `${hub.id}-${zone.id}-${activeChallenge.enemyId}-${activeChallenge.reset}`,
      enemyId: activeChallenge.enemyId,
      position: [zone.range[1] - 2.25, definition.archetype === 'flying' ? 3.4 : STORY_GROUNDED_ACTOR_CENTER_Y],
      patrolRadius: Math.max(2.8, (zone.range[1] - zone.range[0]) / 3),
      accent: '#ffe071',
      encounterZoneId: zone.id,
      encounterIndex: 4,
      leash: zone.range
    };
  }, [activeChallenge, hub.exploration?.encounters, hub.id]);
  const groundingOffsetY = storyAvatarGroundingOffsetForWorld(hub.id);
  const groundSurfaceInsetY = useMemo(() => {
    const ground = storyHubGroundPlatform(hub);
    return ground ? storyPlatformSurfacePlacement(ground, hub.environment?.surface).surfaceInsetY : 0;
  }, [hub]);
  const groundSurfacePixelWorldHeight = useMemo(() => {
    const ground = storyHubGroundPlatform(hub);
    const sourceHeight = hub.environment?.surface?.frame[3] ?? 0;
    return ground && sourceHeight > 0
      ? storyPlatformSurfacePlacement(ground, hub.environment?.surface).height / sourceHeight
      : 0;
  }, [hub]);

  const commitEncounterProgress = useCallback((next: StoryEncounterProgress) => {
    encounterProgressRef.current = next;
    setEncounterProgress(next);
    onEncounterProgressChange(next);
  }, [onEncounterProgressChange]);

  const handleEnemyDefeated = useCallback((spawn: StoryEnemySpawnDefinition, xp: number, tier: StoryEnemyTier) => {
    onEnemyDefeated({
      eventId: `${encounterSeed}:${spawn.id}:${tier}`,
      spawnId: spawn.id,
      enemyId: spawn.enemyId,
      tier,
      xp
    });
    if (tier === 'challenger') {
      commitEncounterProgress(recordChallengerDefeat(encounterProgressRef.current));
      return;
    }
    const zone = hub.exploration?.encounters.find((candidate) => candidate.id === spawn.encounterZoneId);
    if (!zone || !hub.biomeId) return;
    const result = recordRegularDefeat({
      progress: encounterProgressRef.current,
      spawnId: spawn.id,
      zone,
      encounterIndex: spawn.encounterIndex ?? 0,
      spawns: enemySpawns,
      seed: encounterSeed,
      biomeId: hub.biomeId,
      forceChallenger: readForcedChallengerId()
    });
    commitEncounterProgress(result.progress);
    if (result.challengeStarted) {
      setChallengerNoticeVisible(true);
      onChallengerStarted();
    }
  }, [commitEncounterProgress, encounterSeed, enemySpawns, hub.exploration?.encounters, onChallengerStarted, onEnemyDefeated]);

  useEffect(() => {
    encounterProgressRef.current = initialEncounterProgress;
    setEncounterProgress(initialEncounterProgress);
  }, [initialEncounterProgress]);

  useEffect(() => {
    if (!impactEvent?.respawn || !encounterProgressRef.current.activeChallenge) return;
    commitEncounterProgress(resetActiveChallenger(encounterProgressRef.current));
  }, [commitEncounterProgress, impactEvent]);

  useEffect(() => {
    if (!challengerNoticeVisible) return undefined;
    const timer = window.setTimeout(() => setChallengerNoticeVisible(false), reducedMotion ? 650 : 1_650);
    return () => window.clearTimeout(timer);
  }, [challengerNoticeVisible, reducedMotion, activeChallenge?.enemyId]);

  return <><Canvas shadows dpr={[0.65, 1.25]} gl={{ antialias: true, powerPreference: 'high-performance' }} data-testid="story-hub-canvas">
    <OrthographicCamera makeDefault position={[hub.spawn[0], 4.6, 18]} zoom={58} near={0.1} far={100} />
    <HubCamera playerPosition={playerPosition} bounds={hub.bounds} verticalBounds={hub.id === 'kore-central' ? undefined : hub.exploration?.camera} />
    <Suspense fallback={null}>
      <HubWorld hub={hub} reducedMotion={reducedMotion} />
      <Physics gravity={[0, -22, 0]} timeStep="vary">
        {hub.platforms.map((platform) => <RigidBody key={platform.id} type="fixed" colliders={false} position={[platform.position[0], platform.position[1], 0]}>
          <CuboidCollider args={[platform.size[0] / 2, platform.size[1] / 2, 1]} sensor={Boolean(platform.oneWay)} />
          <PlatformVisual platform={platform} hub={hub} />
        </RigidBody>)}
        <AdventureTraversalVisuals hub={hub} />
        <AdventureHazards hub={hub} progress={progress} playerPosition={playerPosition} onPlayerDamage={(damage, sourceX) => { if (!disabled) onPlayerDamage(damage, sourceX); }} />
        {hub.portals.map((portal) => <PortalVisual key={portal.id} portal={portal} theme={hub.theme} nearby={nearbyPortal?.id === portal.id} assigned={assignedPortalId === portal.id} reducedMotion={reducedMotion} />)}
        {(hub.npcs ?? []).map((npc) => <AdventureNpcVisual key={npc.id} npc={npc} attackEvent={attackEvent} playerPosition={playerPosition} maxHealth={derivedStats.maxHealth} reducedMotion={reducedMotion} onPlayerDamage={(damage, sourceX) => { if (!disabled) onPlayerDamage(damage, sourceX); }} surfaceInsetY={groundSurfaceInsetY} surfacePixelWorldHeight={groundSurfacePixelWorldHeight} />)}
        {hub.biomeId && (hub.resourceNodes ?? []).map((node) => <AdventureResourceNode key={node.id} node={node} biomeId={hub.biomeId!} progress={progress} attackEvent={attackEvent} playerPosition={playerPosition} playerProjectile={playerProjectile} reducedMotion={reducedMotion} onHarvest={onResourceHarvest} />)}
        {remotePlayers.map((presence, index) => <RemoteStoryPlayer key={presence.sessionId} presence={presence} reducedMotion={reducedMotion} groundingOffsetY={groundingOffsetY} surfaceInsetY={groundSurfaceInsetY} lane={index % 5} selected={selectedPlayerSessionId === presence.sessionId} onSelect={onSelectPlayer} />)}
        {partyAiActors.map((actor, index) => <StoryPartyAiCompanion key={actor.id} actor={actor} index={index} profile={profile} leaderPosition={playerPosition} reducedMotion={reducedMotion} groundingOffsetY={groundingOffsetY} surfaceInsetY={groundSurfaceInsetY} />)}
        {attackEvent?.projectile && <StoryPlayerProjectile key={attackEvent.id} attackEvent={attackEvent as StoryAdventureAttackEvent & { projectile: StorySpriteProjectileDefinition }} playerPosition={playerPosition} avatarRigOffset={[mounted && mount ? mount.riderOffset[0] : 0, groundingOffsetY - groundSurfaceInsetY + (mounted && mount ? mount.riderOffset[1] : 0)]} runtime={playerProjectile} />}
        {activeRegularSpawns.length > 0 && <AdventureEnemies spawns={activeRegularSpawns} level={progress.level} activePartyMembers={activePartyMembers} paused={disabled} playerPosition={playerPosition} playerProjectile={playerProjectile} attackEvent={attackEvent} reducedMotion={reducedMotion} onPlayerDamage={onPlayerDamage} onDefeated={handleEnemyDefeated} />}
        {activeChallengerSpawn && <AdventureEnemy key={activeChallengerSpawn.id} spawn={activeChallengerSpawn} level={progress.level} activePartyMembers={activePartyMembers} paused={disabled} playerPosition={playerPosition} playerProjectile={playerProjectile} attackEvent={attackEvent} reducedMotion={reducedMotion} onPlayerDamage={onPlayerDamage} onDefeated={handleEnemyDefeated} />}
        <StoryPlayerController hub={hub} avatar={profile.avatar} avatarVisible={avatarVisible} groundingOffsetY={groundingOffsetY} playerPosition={playerPosition} movementLock={movementLock} readInput={readInput} disabled={disabled} reducedMotion={reducedMotion} quickMatchAvailable={quickMatchAvailable} derivedStats={derivedStats} mounted={mounted} mount={mount} mountMasteryRank={mountMasteryRank} impactEvent={impactEvent} onAttack={onAttack} onQuickMatch={onQuickMatch} onNearbyPortal={onNearbyPortal} onActivatePortal={onActivatePortal} onWaterState={onWaterState} onExit={onExit} onPause={onPause} onStateSample={onStateSample} onReady={onReady} />
      </Physics>
    </Suspense>
  </Canvas>
    {challengerNoticeVisible && activeChallenge && <div className="story-challenger-banner" role="status" data-testid="story-challenger-banner">
      <small>Challenger Approaching</small>
      <strong>{getStoryEnemyDefinition(activeChallenge.enemyId).label}</strong>
    </div>}
  </>;
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
  insight: { label: 'Insight', description: '+2% earned XP', Icon: Brain },
  partySize: { label: 'Party Size', description: '+1 Adventure party slot when milestones are met', Icon: UsersRound }
};

function AdventureHud({ progress, profile, onlineParty, localSessionId, health, healthByAvatar, maxHealth, breath, underwater, mount, mounted, mountUnlocked, onMemberSelect, onMount, onMap, onStats, onPack }: {
  progress: StoryAdventureProgressV1;
  profile: StoryProfileV4;
  onlineParty: StoryPartyInstance | null;
  localSessionId: string;
  health: number;
  healthByAvatar: Record<string, number>;
  maxHealth: number;
  breath: number;
  underwater: boolean;
  mount: StoryMountDefinition | null;
  mounted: boolean;
  mountUnlocked: boolean;
  onMemberSelect: (avatarId: string) => void;
  onMount: () => void;
  onMap: () => void;
  onStats: () => void;
  onPack: () => void;
}) {
  const requiredXp = experienceToNextLevel(progress.level);
  const xpPercent = progress.level >= 100 ? 100 : requiredXp > 0 ? progress.xp / requiredXp * 100 : 0;
  const equipped = getEquippedStoryAvatarSlots(profile).slice(0, progress.stats.partySize);
  const portraits = onlineParty ? [
    ...onlineParty.members.map((member) => ({ id: member.sessionId, avatarId: member.avatarId, label: member.displayName, health: member.health, maximum: member.maxHealth, state: member.state === 'ko' ? 'ko' : 'human', selectable: member.sessionId === localSessionId && profile.equippedAvatarIds.includes(member.avatarId), active: member.sessionId === localSessionId })),
    ...onlineParty.aiActors.map((actor) => ({ id: actor.id, avatarId: actor.avatarId, label: `AI ${actor.slot}`, health: actor.health, maximum: actor.maxHealth, state: actor.state === 'ko' ? 'ko' : 'ai', selectable: actor.ownerSessionId === localSessionId && profile.equippedAvatarIds.includes(actor.avatarId), active: false }))
  ] : equipped.map((slot) => ({ id: slot.id, avatarId: slot.id, label: slot.avatar.name, health: healthByAvatar[slot.id] ?? maxHealth, maximum: maxHealth, state: (healthByAvatar[slot.id] ?? maxHealth) <= 0 ? 'ko' : slot.id === profile.activeAvatarId ? 'human' : 'benched', selectable: true, active: slot.id === profile.activeAvatarId }));
  return <aside className="story-adventure-hud" aria-label="Adventure status" data-testid="story-adventure-hud">
    <div className="story-adventure-hud-stack">
      <div className="story-adventure-vitals">
        <div className="story-adventure-level"><small>Level</small><strong>{progress.level}</strong></div>
        <div className="story-adventure-level"><small>Coins</small><strong>{progress.routeCoins}</strong></div>
        <div className="story-adventure-level"><small>Relics</small><strong>{progress.relics.length}</strong></div>
        <div className="story-adventure-bars">
          <div><span><Heart size={12} /> HP</span><strong>{Math.round(health)} / {maxHealth}</strong><i><b style={{ width: `${Math.max(0, Math.min(100, health / maxHealth * 100))}%` }} /></i></div>
          <div><span><Sparkles size={12} /> XP</span><strong>{progress.level >= 100 ? 'MAX' : `${progress.xp} / ${requiredXp}`}</strong><i className="is-xp"><b style={{ width: `${xpPercent}%` }} /></i></div>
          {(underwater || breath < STORY_MAX_BREATH) && <div className="is-breath"><span><Activity size={12} /> AIR</span><strong>{Math.ceil(breath)}%</strong><i><b style={{ width: `${breath}%` }} /></i></div>}
        </div>
      </div>
      {portraits.length > 1 && <nav className="story-party-portrait-rail" aria-label="Adventure party. Use Z and X to switch leader-owned members.">
        {portraits.map((portrait, index) => {
          const ko = portrait.health <= 0;
          return <button key={portrait.id} type="button" className={`${portrait.active ? 'is-active' : 'is-benched'} ${portrait.state === 'ai' ? 'is-ai' : ''} ${ko ? 'is-ko' : ''}`} data-party-member-state={portrait.state} disabled={ko || !portrait.selectable} onClick={() => onMemberSelect(portrait.avatarId)} aria-label={`${portrait.active ? 'Active' : portrait.state === 'ai' ? 'AI companion' : portrait.selectable ? 'Switch to' : 'Party member'} ${portrait.label}${ko ? ', knocked out' : `, ${Math.round(portrait.health)} health`}`}>
            <span aria-hidden="true">{portrait.state === 'ai' ? 'AI' : portrait.label.slice(0, 1).toUpperCase()}</span>
            <i><b style={{ width: `${Math.max(0, Math.min(100, portrait.health / portrait.maximum * 100))}%` }} /></i>
            <small>{index + 1}</small>
          </button>;
        })}
      </nav>}
    </div>
    <div className="story-adventure-hud-actions">
      {mount && <button type="button" className={mounted ? 'is-mounted' : ''} disabled={!mountUnlocked || underwater} onClick={onMount} aria-label={`${mounted ? 'Dismount' : 'Mount'} ${mount.label}`}><Gauge size={18} /><kbd>G</kbd></button>}
      <button type="button" onClick={onPack} aria-label="Open Adventure Pack"><Backpack size={18} /><kbd>B</kbd></button>
      <button type="button" onClick={onMap} aria-label="Open route map"><Map size={18} /><kbd>M</kbd></button>
      <button type="button" onClick={onStats} aria-label="Open adventure stats"><BarChart3 size={18} /><kbd>P</kbd>{progress.unspentPoints > 0 && <em>{progress.unspentPoints}</em>}</button>
    </div>
  </aside>;
}

const STORY_ATLAS_HOTSPOTS: Record<typeof STORY_ADVENTURE_REGION_IDS[number], { x: number; y: number; hazard: string; feature: string }> = {
  greenhollow: { x: 51, y: 16, hazard: 'Wild roads and flooded waterworks', feature: 'Village roofs · aquifer caves' },
  thornwood: { x: 78, y: 17, hazard: 'Thorns, canopy drops, deep roots', feature: 'Root tunnels · flooded grotto' },
  ironroot: { x: 83, y: 43, hazard: 'Collapsing shafts and ore guardians', feature: 'Mine rails · crystal caverns' },
  bonevault: { x: 78, y: 77, hazard: 'Sealed tombs and drowned cisterns', feature: 'Ossuary · hidden bell shaft' },
  emberdeep: { x: 50, y: 85, hazard: 'Lavafalls, vents, obsidian gaps', feature: 'Relic forge · magma caverns' },
  frostpeak: { x: 23, y: 77, hazard: 'Wind cliffs and limited under-ice air', feature: 'Frozen lake · mountain ruins' },
  sunscar: { x: 16, y: 48, hazard: 'Shifting dunes and buried drops', feature: 'Oasis aquifer · sunken temple' },
  skyglass: { x: 19, y: 19, hazard: 'Unstable bridges and open sky', feature: 'Floating towers · cloud caves' }
};

function AdventureRouteMap({ activeWorldId, activeSurfaceMapId, progress, runGraph, discoveredRunZones, currentDepthZoneId, onFastTravel, onPinDaily, onClose }: {
  activeWorldId: StoryWorldId;
  activeSurfaceMapId: string | null;
  progress: StoryAdventureProgressV1;
  runGraph: StoryAdventureRunGraph | null;
  discoveredRunZones: string[];
  currentDepthZoneId: string | null;
  onFastTravel: (waystoneId: string, position: [number, number]) => void;
  onPinDaily: (worldId: typeof STORY_ADVENTURE_REGION_IDS[number], activityId: string) => void;
  onClose: () => void;
}) {
  const initialRegion = isStoryAdventureRegionId(activeWorldId) ? activeWorldId : 'greenhollow';
  const [selectedRegion, setSelectedRegion] = useState<typeof STORY_ADVENTURE_REGION_IDS[number]>(initialRegion);
  const selectedWorld = STORY_WORLDS[selectedRegion];
  const selectedMount = STORY_MOUNTS[STORY_WORLD_MOUNT[selectedRegion]];
  const discovered = progress.discoveries.biomes.includes(selectedRegion);
  const surfaceMaps = selectedWorld.surfaceMaps ?? [];
  const knownSurfaceMaps = surfaceMaps.filter((map) => progress.discoveredSurfaceMaps.includes(map.id));
  const knownWaystones = selectedWorld.exploration?.waystones.filter((waystone) => progress.discoveries.waystones.includes(waystone.id)) ?? [];
  const explorationPercent = Math.round(((discovered ? 1 : 0) + knownWaystones.length + knownSurfaceMaps.length) / (1 + (selectedWorld.exploration?.waystones.length ?? 0) + surfaceMaps.length) * 100);
  const dailyActivities = getStoryDailyActivities(selectedRegion);
  return <div className="story-adventure-overlay" role="presentation">
    <section className="story-adventure-map" role="dialog" aria-modal="true" aria-labelledby="story-adventure-map-title" data-testid="story-adventure-map">
      <header>
        <div><span><Map size={17} /> Living World Atlas</span><h2 id="story-adventure-map-title">The K.O.R.E. Realms</h2></div>
        <button type="button" aria-label="Close route map" onClick={onClose}><X size={19} /></button>
      </header>
      <div className="story-adventure-map-layout">
        <span className="visually-hidden">{STORY_ADVENTURE_REGION_IDS.map((id) => STORY_ADVENTURE_REGION_LABELS[id]).join(' · ')}</span>
        <div className="story-atlas-stage">
          <img src="/story/map/kore-world-atlas.png" alt="Pixel-art atlas showing K.O.R.E. Central and the eight surrounding adventure biomes" />
          <div className={`story-atlas-central ${activeWorldId === 'central' || activeWorldId === 'world-route' ? 'is-current' : ''}`}><Map size={18} /><span>K.O.R.E.</span></div>
          {STORY_ADVENTURE_REGION_IDS.map((id) => {
            const hotspot = STORY_ATLAS_HOTSPOTS[id];
            const Icon = DESTINATION_ICONS[id];
            const known = progress.discoveries.biomes.includes(id);
            return <button
              key={id}
              type="button"
              className={`${selectedRegion === id ? 'is-selected' : ''} ${activeWorldId === id ? 'is-current' : ''} ${known ? 'is-known' : 'is-unknown'}`}
              style={{ '--story-hotspot-x': `${hotspot.x}%`, '--story-hotspot-y': `${hotspot.y}%`, '--story-map-accent': STORY_WORLDS[id].environment?.accent ?? '#2ee6ff' } as CSSProperties}
              aria-label={`${STORY_ADVENTURE_REGION_LABELS[id]}${known ? `, ${explorationPercent}% explored` : ', undiscovered'}`}
              onMouseEnter={() => setSelectedRegion(id)}
              onFocus={() => setSelectedRegion(id)}
              onClick={() => setSelectedRegion(id)}
            ><Icon size={18} /><span>{STORY_ADVENTURE_REGION_LABELS[id].split(' ')[0]}</span></button>;
          })}
        </div>
        <aside className="story-atlas-detail" style={{ '--story-map-accent': selectedWorld.environment?.accent ?? '#2ee6ff' } as CSSProperties}>
          <small>{discovered ? `${explorationPercent}% charted` : 'Uncharted biome'}</small>
          <h3>{STORY_ADVENTURE_REGION_LABELS[selectedRegion]}</h3>
          <p>{selectedWorld.subtitle}</p>
          <dl><div><dt>Hazards</dt><dd>{STORY_ATLAS_HOTSPOTS[selectedRegion].hazard}</dd></div><div><dt>Depths</dt><dd>{STORY_ATLAS_HOTSPOTS[selectedRegion].feature}</dd></div><div><dt>Biome mount</dt><dd>{selectedMount.label} · {selectedMount.ability}</dd></div></dl>
          <div className="story-run-map" aria-label={`${selectedRegion} surface route`}><strong>Surface route</strong><div>{surfaceMaps.map((map) => <span key={map.id} className={`${progress.discoveredSurfaceMaps.includes(map.id) ? 'is-discovered' : ''} ${activeWorldId === selectedRegion && map.id === activeSurfaceMapId ? 'is-current' : ''}`} title={map.name}>{map.order + 1}</span>)}</div><small>{surfaceMaps.map((map) => map.name).join(' → ')}</small></div>
          <div className="story-atlas-dailies"><strong>UTC daily routes</strong>{dailyActivities.map((activity) => { const pinned = progress.pinnedDaily?.date === activity.date && progress.pinnedDaily.activityId === activity.id; return <button key={activity.id} type="button" className={pinned ? 'is-pinned' : ''} onClick={() => onPinDaily(selectedRegion, activity.id)}><Clock3 size={14} /><span><b>{activity.label}</b><small>{activity.description} · {activity.rewardCoins} coins</small></span>{pinned ? 'Pinned' : 'Pin'}</button>; })}</div>
          {selectedRegion === activeWorldId && knownWaystones.length > 0 && <div className="story-atlas-waystones"><strong>Discovered waystones</strong>{knownWaystones.map((waystone) => <button key={waystone.id} type="button" onClick={() => onFastTravel(waystone.id, waystone.position)}><Zap size={14} /> {waystone.label}</button>)}</div>}
          {runGraph && selectedRegion === activeWorldId && <div className="story-run-map" aria-label="Current shifting-depth run map">
            <strong>Current depth route</strong>
            <div>{runGraph.zones.map((zone) => <span key={zone.id} className={`${discoveredRunZones.includes(zone.id) ? 'is-discovered' : ''} ${currentDepthZoneId === zone.id ? 'is-current' : ''} ${zone.hidden ? 'is-hidden' : ''}`} style={{ '--story-zone-depth': zone.depth } as CSSProperties} title={discoveredRunZones.includes(zone.id) ? storyDepthZoneLabel(zone.kind) : 'Unexplored room'}>{discoveredRunZones.includes(zone.id) ? zone.index + 1 : '?'}</span>)}</div>
            <small>Room fog resets when you leave the biome.</small>
          </div>}
        </aside>
      </div>
      <footer><span>Hover, focus, or tap a biome to inspect it. Generated rooms cannot be fast-traveled.</span><small>Atlas: original K.O.R.E. generated pixel art · Environment packs credited in manifest</small></footer>
    </section>
  </div>;
}

function AdventureStatsPanel({ progress, canRespec, onAllocate, onManageParty, onRespec, onClose }: {
  progress: StoryAdventureProgressV1;
  canRespec: boolean;
  onAllocate: (stat: StoryAdventureStatKey) => void;
  onManageParty: () => void;
  onRespec: () => void;
  onClose: () => void;
}) {
  const party = getAdventurePartySizeProgress(progress);
  const partyCapped = progress.stats.partySize >= STORY_ADVENTURE_PARTY_SIZE_CAP;
  const partyAvailable = progress.unspentPoints > 0 && progress.stats.partySize < party.maxEligibleSize && !partyCapped;
  const partyState = partyCapped ? 'MAX' : partyAvailable ? 'AVAILABLE' : 'LOCKED';
  const nextPartyDescription = progress.stats.partySize < party.maxEligibleSize
    ? `${partyState} · Spend 1 point to add a slot`
    : party.next
      ? `${partyState} · Next: level ${party.next.level} and ${party.next.challengerCount} unique challengers`
      : `${partyState} · All party slots unlocked`;
  return <div className="story-adventure-overlay" role="presentation">
    <section className="story-adventure-stats" role="dialog" aria-modal="true" aria-labelledby="story-adventure-stats-title" data-testid="story-adventure-stats">
      <header>
        <div><span><BarChart3 size={17} /> Build Profile</span><h2 id="story-adventure-stats-title">Adventure Stats</h2></div>
        <button type="button" aria-label="Close adventure stats" onClick={onClose}><X size={19} /></button>
      </header>
      <div className="story-adventure-stat-summary">
        <span><small>Level</small><strong>{progress.level}</strong></span>
        <span className={progress.unspentPoints > 0 ? 'has-points' : ''}><small>Available</small><strong>{progress.unspentPoints}</strong></span>
        <span><small>Challengers</small><strong>{progress.defeatedChallengerIds.length}</strong></span>
      </div>
      <div className="story-adventure-stat-list">
        {STORY_ADVENTURE_COMBAT_STAT_KEYS.map((stat) => {
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
        {progress.defeatedChallengerIds.length > 0 && <div className="is-party-size" data-testid="story-party-size-stat">
          <span><UsersRound size={19} /></span>
          <div><strong>Party Size</strong><small>{nextPartyDescription}</small><button type="button" className="story-manage-party-button" onClick={onManageParty}>Manage Party</button></div>
          <output>{progress.stats.partySize}<small>/{STORY_ADVENTURE_PARTY_SIZE_CAP}</small></output>
          <button type="button" aria-label="Add point to Party Size" title={partyCapped ? 'Maximum party size' : partyAvailable ? 'Spend one stat point' : nextPartyDescription} disabled={!partyAvailable} onClick={() => onAllocate('partySize')}>{partyCapped ? <CheckCircle2 size={18} /> : party.maxEligibleSize <= progress.stats.partySize ? <LockKeyhole size={18} /> : <Plus size={18} />}</button>
        </div>}
      </div>
      <footer>
        <button type="button" disabled={!canRespec} onClick={onRespec}><RotateCcw size={17} /> Reset all points</button>
        <p>{canRespec ? 'The Recalibration Shrine will also restore all health.' : 'Visit the Recalibration Shrine in Central Route to reset points.'}</p>
      </footer>
    </section>
  </div>;
}

function AdventurePackPanel({ progress, context, onCraft, onEquip, onUse, onClose }: {
  progress: StoryAdventureProgressV1;
  context: StoryCraftingContext;
  onCraft: (recipeId: string) => void;
  onEquip: (recipeId: string) => void;
  onUse: (recipeId: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'materials' | 'craft' | 'gear'>('materials');
  const knownRecipes = STORY_RECIPES.filter((recipe) => progress.knownRecipes.includes(recipe.id));
  const ownedArmor = progress.inventory.armor.map((id) => STORY_RECIPE_BY_ID[id]).filter(Boolean);
  const contextLabel = context.kind === 'workbench' ? 'Central Workbench' : context.kind === 'specialist' ? `${STORY_ADVENTURE_REGION_LABELS[context.biomeId]} Specialist` : 'Field Crafting';
  return <div className="story-adventure-overlay story-pack-overlay" role="presentation">
    <section className="story-adventure-pack" role="dialog" aria-modal="true" aria-labelledby="story-pack-title" data-testid="story-adventure-pack">
      <header>
        <div><span><Backpack size={17} /> {contextLabel}</span><h2 id="story-pack-title">Adventure Pack</h2></div>
        <button type="button" aria-label="Close Adventure Pack" autoFocus onClick={onClose}><X size={19} /></button>
      </header>
      <nav aria-label="Adventure Pack sections">
        <button type="button" className={tab === 'materials' ? 'is-active' : ''} onClick={() => setTab('materials')}><Gem size={17} /> Materials</button>
        <button type="button" className={tab === 'craft' ? 'is-active' : ''} onClick={() => setTab('craft')}><Hammer size={17} /> Craft <em>{knownRecipes.length}</em></button>
        <button type="button" className={tab === 'gear' ? 'is-active' : ''} onClick={() => setTab('gear')}><Shield size={17} /> Gear</button>
      </nav>
      {tab === 'materials' && <div className="story-pack-grid story-pack-materials">
        {STORY_RESOURCES.map((resource) => {
          const discovered = progress.discoveredMaterials.includes(resource.id);
          return <article key={resource.id} className={`${discovered ? 'is-discovered' : 'is-locked'} is-${resource.rarity}`}>
            <img src={resource.iconPath} alt="" />
            <div><small>{resource.biomeId ? STORY_ADVENTURE_REGION_LABELS[resource.biomeId] : 'All biomes'} · {resource.rarity}</small><strong>{discovered ? resource.label : 'Unknown material'}</strong></div>
            <output>{discovered ? progress.inventory.materials[resource.id] ?? 0 : '—'}</output>
          </article>;
        })}
      </div>}
      {tab === 'craft' && <div className="story-pack-grid story-pack-recipes">
        {knownRecipes.map((recipe) => {
          const owned = recipe.kind === 'armor' ? progress.inventory.armor.includes(recipe.id) : recipe.kind === 'utility' ? progress.utilityUnlocks.includes(recipe.id) : false;
          const craftable = !owned && canCraftRecipe(recipe, progress.inventory, context);
          return <article key={recipe.id} className={`${craftable ? 'is-craftable' : ''} is-${recipe.kind}`}>
            <img src={recipe.iconPath} alt="" />
            <div className="story-pack-recipe-copy"><small>{recipe.kind} · {storyRecipeStationLabel(recipe)}</small><strong>{recipe.label}</strong>{recipe.consumable && <p>{recipe.consumable.label}</p>}{recipe.armor && <p>+1 {recipe.armor.stat} · {STORY_ARMOR_SET_BONUSES[recipe.armor.setId]}</p>}</div>
            <ul>{Object.entries(recipe.ingredients).map(([id, needed]) => <li key={id} className={(progress.inventory.materials[id] ?? 0) >= needed ? 'has-enough' : ''}><span>{STORY_RESOURCES.find((resource) => resource.id === id)?.label ?? id}</span><b>{progress.inventory.materials[id] ?? 0}/{needed}</b></li>)}</ul>
            <button type="button" disabled={!craftable} onClick={() => onCraft(recipe.id)}>{owned ? 'Owned' : recipe.kind === 'armor' && context.kind === 'field' ? 'Needs station' : 'Craft'}</button>
          </article>;
        })}
      </div>}
      {tab === 'gear' && <div className="story-pack-gear">
        <div className="story-pack-equipped">{(['head', 'coat', 'boots'] as const).map((slot) => { const id = progress.equippedArmor[slot]; const recipe = id ? STORY_RECIPE_BY_ID[id] : null; return <article key={slot}><small>{slot}</small>{recipe ? <><img src={recipe.iconPath} alt="" /><strong>{recipe.label}</strong><button type="button" onClick={() => onEquip(recipe.id)}>Unequip</button></> : <><PackageOpen size={28} /><span>Empty slot</span></>}</article>; })}</div>
        <section><h3>Owned armor</h3><div className="story-pack-owned">{ownedArmor.length > 0 ? ownedArmor.map((recipe) => <button key={recipe.id} type="button" className={Object.values(progress.equippedArmor).includes(recipe.id) ? 'is-equipped' : ''} onClick={() => onEquip(recipe.id)}><img src={recipe.iconPath} alt="" /><span><small>{recipe.armor!.slot} · +1 {recipe.armor!.stat}</small><strong>{recipe.label}</strong></span></button>) : <p>Craft armor with a biome specialist or at the Central Workbench.</p>}</div></section>
        <section><h3>Consumables</h3><div className="story-pack-owned">{Object.entries(progress.inventory.consumables).filter(([, count]) => count > 0).map(([id, count]) => { const recipe = STORY_RECIPE_BY_ID[id]; return <button key={id} type="button" onClick={() => onUse(id)}><img src={recipe.iconPath} alt="" /><span><small>{recipe.consumable?.label}</small><strong>{recipe.label} ×{count}</strong></span></button>; })}</div></section>
        {progress.activeEffects.length > 0 && <section><h3>Active effects</h3><div className="story-pack-effects">{progress.activeEffects.map((effect) => <span key={effect.kind}><Beaker size={14} /> {STORY_RECIPE_BY_ID[effect.recipeId]?.label} <time>{Math.max(0, Math.ceil((effect.expiresAt - Date.now()) / 1000))}s</time></span>)}</div></section>}
      </div>}
    </section>
  </div>;
}

function PartySizeUnlockReveal({ progress, reducedMotion, onOpenStats, onContinue }: {
  progress: StoryAdventureProgressV1;
  reducedMotion: boolean;
  onOpenStats: () => void;
  onContinue: () => void;
}) {
  return <div className={`story-party-unlock-overlay ${reducedMotion ? 'is-reduced-motion' : ''}`} role="presentation" data-testid="story-party-unlock-reveal">
    <section className="story-party-unlock-dialog" role="dialog" aria-modal="true" aria-labelledby="story-party-unlock-title" aria-describedby="story-party-unlock-description">
      <div className="story-party-unlock-rings" aria-hidden="true"><UsersRound size={34} /></div>
      <span className="story-party-unlock-kicker">New Adventure Stat</span>
      <h2 id="story-party-unlock-title">Party Size Unlocked</h2>
      <p id="story-party-unlock-description">Build a squad of saved Story Avatars and switch fighters during solo encounters.</p>
      <div className="story-party-unlock-counter"><small>Current Capacity</small><strong>{progress.stats.partySize}<span>/{STORY_ADVENTURE_PARTY_SIZE_CAP}</span></strong></div>
      <div className="story-party-unlock-requirement"><LockKeyhole size={17} /><span><strong>First upgrade</strong><small>Reach level 2 and defeat 1 unique challenger</small></span></div>
      <p className="story-party-unlock-points"><Sparkles size={15} /> {progress.unspentPoints} stat {progress.unspentPoints === 1 ? 'point' : 'points'} available</p>
      <div className="story-party-unlock-actions">
        <button type="button" className="is-primary" autoFocus onClick={onOpenStats}><BarChart3 size={19} /> Open Stats</button>
        <button type="button" onClick={onContinue}><Play size={19} /> Continue</button>
      </div>
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

function createDepthHub(surface: StoryHubDefinition, graph: StoryAdventureRunGraph | null, zoneId: string | null): StoryHubDefinition {
  const zone = graph?.zones.find((candidate) => candidate.id === zoneId);
  if (!zone || !graph || !isStoryAdventureRegionId(surface.id.replace(/^kore-/, ''))) return surface;
  const width = zone.camera.maxX - zone.camera.minX;
  const links = graph.links.filter((link) => link.from === zone.id || link.to === zone.id);
  const sourceEnemies = surface.enemySpawns?.slice(0, zone.kind === 'sanctuary' ? 0 : zone.hidden ? 4 : 3) ?? [];
  const generatedEnemies = sourceEnemies.map((enemy, index): StoryEnemySpawnDefinition => ({
    ...enemy,
    id: `${zone.id}-enemy-${index + 1}`,
    position: [zone.camera.minX + width * (0.38 + index * 0.18), getStoryEnemyDefinition(enemy.enemyId).archetype === 'flying' ? 3.4 : STORY_GROUNDED_ACTOR_CENTER_Y],
    patrolRadius: 2.4,
    encounterZoneId: `${zone.id}-encounter`,
    encounterIndex: zone.hidden ? 4 : Math.min(4, Math.max(0, zone.depth)),
    leash: [zone.camera.minX + 4, zone.camera.maxX - 4]
  }));
  const returnPortal: StoryPortalDefinition = {
    id: 'depth-return-surface', label: 'Return to Surface', subtitle: 'Leave the shifting depths', destination: graph.worldId,
    position: [zone.camera.minX + 2.4, 1.7], size: [2.8, 3.4], accent: '#ffe071', kind: 'adventure-gate'
  };
  const linkPortals = links.map((link, index): StoryPortalDefinition => {
    const targetId = link.from === zone.id ? link.to : link.from;
    const target = graph.zones.find((candidate) => candidate.id === targetId)!;
    return {
      id: `depth-link:${targetId}`,
      label: storyDepthZoneLabel(target.kind),
      subtitle: `${link.traversal.replace('-', ' ')} route · depth ${target.depth}`,
      destination: graph.worldId,
      position: [zone.camera.maxX - 2.5 - index * 3.8, 1.7],
      size: [2.8, 3.4],
      accent: target.hidden ? '#ff83d1' : target.underwater ? '#2ee6ff' : '#b8a8ff',
      kind: 'adventure-gate'
    };
  });
  const waterVolumes = zone.underwater ? [{ id: `${zone.id}-water`, bounds: [zone.camera.minX, zone.camera.maxX, zone.camera.minY, zone.camera.maxY] as [number, number, number, number], current: [0.18, 0] as [number, number], airPockets: zone.airPockets }] : [];
  const environment = createStoryDepthEnvironment(surface.environment, zone);
  const depthCache = zone.hidden ? { id: `${graph.worldId}-depth-cache-${adventureUtcDate()}`, kind: 'chest' as const, label: 'Daily Depth Cache', subtitle: 'One claim per biome per UTC day', position: [zone.camera.maxX - 7, 1.05] as [number, number], rewardCoins: 75, oneTime: true } : null;
  const depthCachePortal: StoryPortalDefinition | null = depthCache ? { id: `chest:${depthCache.id}`, label: depthCache.label, subtitle: depthCache.subtitle, destination: graph.worldId, position: depthCache.position, size: [1.8, 2.2], accent: '#ffe071', kind: 'chest' } : null;
  const sanctuaryPortal: StoryPortalDefinition | null = zone.kind === 'sanctuary' ? { id: `mount-sanctuary:${STORY_WORLD_MOUNT[graph.worldId]}`, label: 'Mount Sanctuary', subtitle: 'Form the biome traversal bond', destination: graph.worldId, position: [0, 1.45], size: [2.4, 2.8], accent: surface.environment?.accent ?? '#ffe071', kind: 'shrine' } : null;
  return {
    ...surface,
    id: `${surface.id}:${zone.id}`,
    name: `${surface.name} · ${storyDepthZoneLabel(zone.kind)}`,
    subtitle: zone.hidden ? 'A hidden branch far below the stable route' : `Generated depth ${zone.depth} · ${zone.traversal.replace('-', ' ')}`,
    spawn: [zone.camera.minX + 5.5, STORY_GROUNDED_ACTOR_CENTER_Y],
    checkpoint: [zone.camera.minX + 5.5, STORY_GROUNDED_ACTOR_CENTER_Y],
    bounds: { minX: zone.camera.minX, maxX: zone.camera.maxX, floorY: zone.underwater ? zone.camera.minY + 1.5 : 0 },
    platforms: [
      { id: 'ground', position: [0, zone.underwater ? zone.camera.minY + 1 : -0.5], size: [width + 2, 1] },
      ...Array.from({ length: 6 }, (_, index) => ({ id: `${zone.id}-platform-${index + 1}`, position: [zone.camera.minX + 8 + index * (width - 16) / 5, 3 + index % 3 * 2.4] as [number, number], size: [5 + index % 2 * 3, 0.42] as [number, number], oneWay: true }))
    ],
    portals: [returnPortal, ...linkPortals, ...(sanctuaryPortal ? [sanctuaryPortal] : []), ...(depthCachePortal ? [depthCachePortal] : [])],
    environment,
    props: [
      ...createStoryWorldProps(surface.theme ?? 'route', zone.camera.minX, zone.camera.maxX),
      ...(zone.underwater ? [
        { id: `${zone.id}-bubbles`, asset: 'exploration:underwater/bubbles.png' as const, frame: [0, 0, 92, 40] as [number, number, number, number], atlasSize: [92, 40] as [number, number], position: [zone.camera.minX + width * 0.28, 4, -2] as [number, number, number], size: [4.6, 2] as [number, number], opacity: 0.78 },
        { id: `${zone.id}-fish`, asset: 'exploration:underwater/fish.png' as const, frame: [0, 0, 128, 32] as [number, number, number, number], atlasSize: [128, 32] as [number, number], position: [zone.camera.minX + width * 0.55, 2.5, -1.8] as [number, number, number], size: [6.4, 1.6] as [number, number], opacity: 0.9 },
        { id: `${zone.id}-fish-big`, asset: 'exploration:underwater/fish-big.png' as const, frame: [0, 0, 216, 49] as [number, number, number, number], atlasSize: [216, 49] as [number, number], position: [zone.camera.minX + width * 0.74, 6.2, -2.1] as [number, number, number], size: [8.4, 1.9] as [number, number], mirrored: true, opacity: 0.84 }
      ] : [])
    ],
    landmarks: [{ id: `${zone.id}-landmark`, label: storyDepthZoneLabel(zone.kind), subtitle: zone.hidden ? 'Secrets persist beyond the mapped route' : `Depth ${zone.depth}`, position: [0, 7, -1.2], size: [12, 8], color: surface.environment?.accent ?? '#2ee6ff', kind: zone.hidden ? 'secret' : zone.kind === 'sanctuary' ? 'lore' : 'district' }],
    enemySpawns: generatedEnemies,
    interactables: depthCache ? [depthCache] : [],
    resourceNodes: createDepthResourceNodes(graph.worldId, zone),
    exploration: surface.exploration ? {
      ...surface.exploration,
      safeApproach: [zone.camera.minX, zone.camera.minX + 9],
      districts: [{ id: `${zone.id}-district`, label: storyDepthZoneLabel(zone.kind), range: [zone.camera.minX, zone.camera.maxX] }],
      encounters: [{ id: `${zone.id}-encounter`, range: [zone.camera.minX + 10, zone.camera.maxX - 4], maxActive: Math.min(5, generatedEnemies.length) }],
      entrances: [],
      waterVolumes,
      waystones: [],
      camera: { minY: zone.camera.minY, maxY: zone.camera.maxY }
    } : undefined
  };
}

export default function StoryHubScreen({ profile, onlineProfile, reducedMotion, readInputs, setVirtualAction, onAnalytics, onProfileChange, onDestination, onOnlineSpar, onMusicContext, activeMusicTrack, onCredits, onExit }: {
  profile: StoryProfileV4;
  onlineProfile?: OnlinePlayerProfile | null;
  reducedMotion: boolean;
  readInputs: () => [InputFrame, InputFrame];
  setVirtualAction: SetVirtualAction;
  onAnalytics?: AnalyticsCapture<'app_version' | 'mode'>;
  onProfileChange: (profile: StoryProfileV4) => void;
  onDestination: (destination: HubDestination) => void;
  onOnlineSpar: (opponent: StoryHubPresence) => void;
  onMusicContext?: (context: AdventureMusicContext | null) => void;
  activeMusicTrack?: AdventureMusicTrackDefinition | null;
  onCredits?: () => void;
  onExit: () => void;
}) {
  const [activeWorldId, setActiveWorldId] = useState<StoryWorldId>(readDevPreviewWorldId);
  const [activeSurfaceMapId, setActiveSurfaceMapId] = useState<string | null>(null);
  const [surfaceEntry, setSurfaceEntry] = useState<'west' | 'east'>('west');
  const [runGraph, setRunGraph] = useState<StoryAdventureRunGraph | null>(null);
  const [partyInstance, setPartyInstance] = useState<StoryPartyInstance | null>(null);
  const [partyInvites, setPartyInvites] = useState<StoryPartyInvite[]>([]);
  const [partyPeerId, setPartyPeerId] = useState('');
  const [partyAuthorityLost, setPartyAuthorityLost] = useState(false);
  const [currentDepthZoneId, setCurrentDepthZoneId] = useState<string | null>(null);
  const [discoveredRunZones, setDiscoveredRunZones] = useState<string[]>([]);
  const [encounterProgressByHub, setEncounterProgressByHub] = useState<Record<string, StoryEncounterProgress>>({});
  const [visitChallengers, setVisitChallengers] = useState<StoryEnemyId[]>([]);
  const biomeHub = useMemo(() => devPreviewHub(STORY_WORLDS[activeWorldId]), [activeWorldId]);
  const baseHub = useMemo(() => {
    if (!isStoryAdventureRegionId(activeWorldId)) return biomeHub;
    const map = getStoryAdventureSurfaceMap(activeWorldId, activeSurfaceMapId);
    const surface = createAdventureSurfaceHub(biomeHub, map);
    if (surfaceEntry === 'east') surface.spawn = [surface.bounds.maxX - 7, surface.spawn[1]];
    return surface;
  }, [activeSurfaceMapId, activeWorldId, biomeHub, surfaceEntry]);
  const activeHub = useMemo(() => createDepthHub(baseHub, runGraph, currentDepthZoneId), [baseHub, currentDepthZoneId, runGraph]);
  const [nearbyPortal, setNearbyPortal] = useState<StoryPortalDefinition | null>(null);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [packOpen, setPackOpen] = useState(false);
  const [craftingContext, setCraftingContext] = useState<StoryCraftingContext>({ kind: 'field' });
  const [adventureProgress, setAdventureProgress] = useState(readAdventureProgress);
  const derivedAdventureStats = useMemo(() => getAdventureDerivedStats(adventureProgress), [adventureProgress]);
  const [playerHealth, setPlayerHealth] = useState(() => getAdventureDerivedStats(readAdventureProgress()).maxHealth);
  const [memberHealth, setMemberHealth] = useState<Record<string, number>>(() => {
    const maxHealth = getAdventureDerivedStats(readAdventureProgress()).maxHealth;
    return Object.fromEntries(getEquippedStoryAvatarSlots(profile).map((slot) => [slot.id, maxHealth]));
  });
  const [partyUnlockOpen, setPartyUnlockOpen] = useState(() => {
    const progress = readAdventureProgress();
    return progress.defeatedChallengerIds.length > 0 && !progress.partyFeatureRevealSeen;
  });
  const [breath, setBreath] = useState(STORY_MAX_BREATH);
  const [underwater, setUnderwater] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [attackEvent, setAttackEvent] = useState<StoryAdventureAttackEvent | null>(null);
  const [partyAttackEvent, setPartyAttackEvent] = useState<StoryAdventureAttackEvent | null>(null);
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
  const [npcNotice, setNpcNotice] = useState<{ id: string; name: string; text: string } | null>(null);
  const [harvestNotice, setHarvestNotice] = useState<{ id: number; label: string; quantity: number; learned: string[] } | null>(null);
  const [statPointNotice, setStatPointNotice] = useState<AdventureStatPointNotice | null>(null);
  const [musicCombatActive, setMusicCombatActive] = useState(false);
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
  const memberHealthRef = useRef(memberHealth);
  const rewardEventIdsRef = useRef(new Set<string>());
  const sharedRewardIdsRef = useRef(new Set<string>());
  const dismissedPartyInviteIdsRef = useRef(new Set<string>());
  const sharedRewardHandlerRef = useRef<(event: StoryEnemyDefeatEvent) => void>(() => undefined);
  const pendingPartyRewardsRef = useRef<StoryPartyRewardEvent[]>([]);
  const partyTransportRef = useRef<StoryPartyTransport | null>(null);
  const partyInstanceRef = useRef<StoryPartyInstance | null>(partyInstance);
  const partyAttackCooldownsRef = useRef(new globalThis.Map<string, number>());
  const partyIntentSequenceRef = useRef(0);
  const partySnapshotSequenceRef = useRef(0);
  const partyAuthorityEpochRef = useRef(1);
  const partySwapCooldownUntilRef = useRef(0);
  const playerInvulnerableUntilRef = useRef(0);
  const attackSequenceRef = useRef(0);
  const impactSequenceRef = useRef(0);
  const statPointNoticeSequenceRef = useRef(0);
  const lastAirPocketRef = useRef<[number, number] | null>(null);
  const lastMasteryXRef = useRef(activeHub.spawn[0]);
  const masteryDistanceRef = useRef(0);
  const lastVisitedWorldRef = useRef<string>('');
  const currentDepthZoneRef = useRef<string | null>(null);
  const storyInteractRef = useRef(false);
  const analyticsRef = useRef(onAnalytics);
  analyticsRef.current = onAnalytics;
  const activeVisitRef = useRef<{ id: string; worldId: StoryWorldId; startedAt: number } | null>(null);
  const encounterStartedAtRef = useRef<Record<string, number>>({});
  const playerStateRef = useRef<StoryHubPlayerState>({ x: activeHub.spawn[0], y: activeHub.spawn[1], pose: 'idle', facing: 1, worldId: activeWorldId });
  const activeHubBoundsRef = useRef(activeHub.bounds);
  const audioMotionRef = useRef<{ worldId: StoryWorldId; x: number; y: number; pose: StoryAvatarPose; distance: number }>({ worldId: activeWorldId, x: activeHub.spawn[0], y: activeHub.spawn[1], pose: 'idle', distance: 0 });
  const readInput = useCallback(() => {
    const input = readInputs()[0];
    return { ...input, interact: storyInteractRef.current || input.charge };
  }, [readInputs]);
  useEffect(() => {
    if (!statPointNotice) return undefined;
    if (statsOpen) {
      setStatPointNotice(null);
      return undefined;
    }
    const noticeId = statPointNotice.id;
    const timer = window.setTimeout(() => {
      setStatPointNotice((current) => current?.id === noticeId ? null : current);
    }, 7_500);
    return () => window.clearTimeout(timer);
  }, [statPointNotice, statsOpen]);
  useEffect(() => {
    const setInteract = (event: KeyboardEvent, pressed: boolean) => {
      if (event.code !== 'KeyE') return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      storyInteractRef.current = pressed;
    };
    const onKeyDown = (event: KeyboardEvent) => setInteract(event, true);
    const onKeyUp = (event: KeyboardEvent) => setInteract(event, false);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      storyInteractRef.current = false;
    };
  }, []);
  const handleHubReady = useCallback(() => setHubReady(true), []);
  const handlePlayerState = useCallback((state: StoryHubPlayerState) => {
    const worldState = { ...state, worldId: activeWorldId };
    const motion = audioMotionRef.current;
    if (motion.worldId !== activeWorldId) {
      audioMotionRef.current = { worldId: activeWorldId, x: state.x, y: state.y, pose: state.pose, distance: 0 };
    } else {
      if (motion.pose !== 'jump' && state.pose === 'jump') emitAdventureAudioEvent({ kind: 'jump' });
      if (motion.pose === 'jump' && state.pose !== 'jump') emitAdventureAudioEvent({ kind: 'land', intensity: Math.min(1, 0.65 + Math.abs(state.y - motion.y) * 0.12) });
      const travel = Math.abs(state.x - motion.x);
      const movingOnFoot = !mounted && !underwater && (state.pose === 'walk' || state.pose === 'sprint');
      motion.distance = movingOnFoot ? motion.distance + travel : 0;
      const stride = state.pose === 'sprint' ? 1.12 : 0.82;
      if (movingOnFoot && motion.distance >= stride) {
        emitAdventureAudioEvent({ kind: 'step', sprinting: state.pose === 'sprint' });
        motion.distance %= stride;
      }
      motion.x = state.x;
      motion.y = state.y;
      motion.pose = state.pose;
    }
    playerStateRef.current = worldState;
    setPlayerX(state.x);
    setPlayerY(state.y);
    setPlayerPose(state.pose);
    multiplayerSessionRef.current?.update(worldState);
  }, [activeWorldId, mounted, underwater]);
  const handleWaterState = useCallback((nextUnderwater: boolean, airPocket?: [number, number]) => {
    if (nextUnderwater !== underwater) emitAdventureAudioEvent({ kind: 'water', entered: nextUnderwater });
    setUnderwater(nextUnderwater);
    if (nextUnderwater) setMounted(false);
    if (airPocket) lastAirPocketRef.current = airPocket;
  }, [underwater]);
  useEffect(() => { adventureProgressRef.current = adventureProgress; }, [adventureProgress]);
  useEffect(() => { activeHubBoundsRef.current = activeHub.bounds; }, [activeHub.bounds]);
  useEffect(() => { partyInstanceRef.current = partyInstance; }, [partyInstance]);
  useEffect(() => { currentDepthZoneRef.current = currentDepthZoneId; }, [currentDepthZoneId]);
  useEffect(() => { memberHealthRef.current = memberHealth; }, [memberHealth]);
  useEffect(() => {
    playerHealthRef.current = Math.min(playerHealthRef.current, derivedAdventureStats.maxHealth);
    setPlayerHealth(playerHealthRef.current);
  }, [derivedAdventureStats.maxHealth]);
  useEffect(() => {
    const normalized = normalizeStoryAvatarRoster(profile, adventureProgress.stats.partySize);
    if (normalized.activeAvatarId !== profile.activeAvatarId || normalized.equippedAvatarIds.join('|') !== profile.equippedAvatarIds.join('|')) onProfileChange(normalized);
    setMemberHealth((current) => {
      const next = { ...current };
      normalized.avatars.forEach((slot) => { next[slot.id] = Math.min(derivedAdventureStats.maxHealth, next[slot.id] ?? derivedAdventureStats.maxHealth); });
      memberHealthRef.current = next;
      const activeHealth = next[normalized.activeAvatarId] ?? derivedAdventureStats.maxHealth;
      playerHealthRef.current = activeHealth;
      setPlayerHealth(activeHealth);
      return next;
    });
  }, [adventureProgress.stats.partySize, derivedAdventureStats.maxHealth, onProfileChange, profile]);
  const updateAdventureProgress = useCallback((next: StoryAdventureProgressV1) => {
    const saved = writeAdventureProgress(next);
    adventureProgressRef.current = saved;
    setAdventureProgress(saved);
    return saved;
  }, []);
  const switchPartyMember = useCallback((avatarId: string, force = false) => {
    if (avatarId === profile.activeAvatarId) return true;
    const equipped = getEquippedStoryAvatarSlots(profile).slice(0, adventureProgressRef.current.stats.partySize);
    if (!equipped.some((slot) => slot.id === avatarId) || (memberHealthRef.current[avatarId] ?? 0) <= 0) return false;
    const now = performance.now();
    const hasIncomingChallenge = challenges.some((challenge) => challenge.targetSessionId === localSessionId && challenge.status === 'pending' && challenge.expiresAt > Date.now());
    const movementBlocked = pauseOpen || controlsOpen || mapOpen || statsOpen || packOpen || partyUnlockOpen || Boolean(selectedPlayer) || hasIncomingChallenge || Boolean(doorTravel);
    const actionBlocked = playerPose.startsWith('attack');
    if (!force && (movementBlocked || actionBlocked || now < partySwapCooldownUntilRef.current)) return false;
    const health = { ...memberHealthRef.current, [profile.activeAvatarId]: playerHealthRef.current };
    memberHealthRef.current = health;
    setMemberHealth(health);
    const nextProfile = setActiveStoryAvatar(profile, avatarId);
    onProfileChange(nextProfile);
    const nextHealth = health[avatarId] ?? derivedAdventureStats.maxHealth;
    playerHealthRef.current = nextHealth;
    setPlayerHealth(nextHealth);
    partySwapCooldownUntilRef.current = now + 800;
    playerInvulnerableUntilRef.current = now + 900;
    setImpactEvent({ id: ++impactSequenceRef.current, sourceX: playerX, knockback: 0, respawn: [playerX, playerY] });
    return true;
  }, [challenges, controlsOpen, derivedAdventureStats.maxHealth, doorTravel, localSessionId, mapOpen, onProfileChange, packOpen, partyUnlockOpen, pauseOpen, playerPose, playerX, playerY, profile, selectedPlayer, statsOpen]);
  useEffect(() => {
    const onPartySwap = (event: KeyboardEvent) => {
      if (event.repeat || (event.code !== 'KeyZ' && event.code !== 'KeyX')) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) return;
      const equipped = getEquippedStoryAvatarSlots(profile).slice(0, adventureProgress.stats.partySize).filter((slot) => (memberHealthRef.current[slot.id] ?? derivedAdventureStats.maxHealth) > 0);
      if (equipped.length < 2) return;
      const activeIndex = Math.max(0, equipped.findIndex((slot) => slot.id === profile.activeAvatarId));
      const direction = event.code === 'KeyX' ? 1 : -1;
      event.preventDefault();
      switchPartyMember(equipped[(activeIndex + direction + equipped.length) % equipped.length].id);
    };
    window.addEventListener('keydown', onPartySwap, true);
    return () => window.removeEventListener('keydown', onPartySwap, true);
  }, [adventureProgress.stats.partySize, derivedAdventureStats.maxHealth, profile, switchPartyMember]);
  useEffect(() => {
    let frame = 0;
    let previousLeft = false;
    let previousRight = false;
    const poll = () => {
      const gamepad = typeof navigator !== 'undefined' ? Array.from(navigator.getGamepads?.() ?? []).find(Boolean) : null;
      const left = Boolean(gamepad?.buttons[4]?.pressed);
      const right = Boolean(gamepad?.buttons[5]?.pressed);
      if ((left && !previousLeft) || (right && !previousRight)) {
        const equipped = getEquippedStoryAvatarSlots(profile).slice(0, adventureProgress.stats.partySize).filter((slot) => (memberHealthRef.current[slot.id] ?? derivedAdventureStats.maxHealth) > 0);
        if (equipped.length > 1) {
          const activeIndex = Math.max(0, equipped.findIndex((slot) => slot.id === profile.activeAvatarId));
          const direction = right && !previousRight ? 1 : -1;
          switchPartyMember(equipped[(activeIndex + direction + equipped.length) % equipped.length].id);
        }
      }
      previousLeft = left;
      previousRight = right;
      frame = window.requestAnimationFrame(poll);
    };
    frame = window.requestAnimationFrame(poll);
    return () => window.cancelAnimationFrame(frame);
  }, [adventureProgress.stats.partySize, derivedAdventureStats.maxHealth, profile, switchPartyMember]);
  useEffect(() => {
    const current = activeVisitRef.current;
    if (current && current.worldId !== activeWorldId) {
      analyticsRef.current?.('adventure_visit_ended', {
        visit_id: current.id,
        world_id: current.worldId,
        level: adventureProgressRef.current.level,
        duration_seconds: Number(((performance.now() - current.startedAt) / 1000).toFixed(2)),
        exit_reason: 'region_changed'
      });
      activeVisitRef.current = null;
    }
    if (!isStoryAdventureRegionId(activeWorldId) || activeVisitRef.current) return;
    const visit = { id: createAnalyticsId('adventure-visit'), worldId: activeWorldId, startedAt: performance.now() };
    activeVisitRef.current = visit;
    analyticsRef.current?.('adventure_visit_started', {
      visit_id: visit.id,
      world_id: activeWorldId,
      level: adventureProgressRef.current.level
    });
    analyticsRef.current?.('adventure_region_entered', {
      visit_id: visit.id,
      world_id: activeWorldId,
      level: adventureProgressRef.current.level,
      surface_map_id: activeSurfaceMapId
    });
  }, [activeSurfaceMapId, activeWorldId]);
  useEffect(() => () => {
    const current = activeVisitRef.current;
    if (!current) return;
    analyticsRef.current?.('adventure_visit_ended', {
      visit_id: current.id,
      world_id: current.worldId,
      level: adventureProgressRef.current.level,
      duration_seconds: Number(((performance.now() - current.startedAt) / 1000).toFixed(2)),
      exit_reason: 'screen_exit'
    });
    activeVisitRef.current = null;
  }, []);
  useEffect(() => {
    if (!isStoryAdventureRegionId(activeWorldId)) return;
    const map = getStoryAdventureSurfaceMap(activeWorldId, activeSurfaceMapId);
    if (activeSurfaceMapId !== map.id) setActiveSurfaceMapId(map.id);
    if (!adventureProgressRef.current.discoveredSurfaceMaps.includes(map.id)) updateAdventureProgress(discoverAdventureSurfaceMap(adventureProgressRef.current, map.id));
  }, [activeSurfaceMapId, activeWorldId, updateAdventureProgress]);
  useEffect(() => {
    if (!isStoryAdventureRegionId(activeWorldId) || !activeHub.surfaceMapId?.endsWith('-mastery')) return;
    const hero = activeHub.landmarks?.[0];
    if (!hero || Math.abs(playerX - hero.position[0]) > Math.max(4, hero.size[0] / 2)) return;
    const result = unlockAdventureMasteryRecipe(adventureProgressRef.current, activeWorldId);
    if (result.learned.length === 0) return;
    updateAdventureProgress(result.progress);
    analyticsRef.current?.('adventure_recipes_learned', { source: 'mastery_landmark', world_id: activeWorldId, count: result.learned.length });
  }, [activeHub.landmarks, activeHub.surfaceMapId, activeWorldId, playerX, updateAdventureProgress]);
  const musicEncounter = activeHub.exploration?.encounters.find((encounter) => playerX >= encounter.range[0] && playerX <= encounter.range[1]);
  const musicEncounterProgress = encounterProgressByHub[activeHub.id] ?? makeStoryEncounterProgress();
  const musicThreatPresent = Boolean(musicEncounter && !musicEncounterProgress.resolvedZoneIds.includes(musicEncounter.id));
  useEffect(() => {
    const visit = activeVisitRef.current;
    if (!visit || !musicEncounter || !musicThreatPresent) return;
    const encounterKey = `${activeHub.id}:${musicEncounter.id}`;
    if (encounterStartedAtRef.current[encounterKey]) return;
    encounterStartedAtRef.current[encounterKey] = performance.now();
    analyticsRef.current?.('adventure_encounter_started', {
      visit_id: visit.id,
      encounter_id: encounterKey,
      world_id: visit.worldId,
      zone_id: musicEncounter.id,
      level: adventureProgressRef.current.level
    });
  }, [activeHub.id, musicEncounter?.id, musicThreatPresent]);
  useEffect(() => {
    const delay = musicThreatPresent ? 2_000 : 4_000;
    const timer = window.setTimeout(() => setMusicCombatActive(musicThreatPresent), delay);
    return () => window.clearTimeout(timer);
  }, [activeHub.id, musicThreatPresent]);
  useEffect(() => {
    if (!onMusicContext || !isStoryAdventureWorldId(activeWorldId)) return undefined;
    const basePhase = currentDepthZoneId ? (activeHub.musicPhase ?? 'mystery') : (activeHub.musicPhase ?? (activeWorldId === 'world-route' ? 'social' : 'explore'));
    const phase = musicCombatActive ? (musicEncounter?.elite || musicEncounterProgress.activeChallenge ? 'elite' : 'tension') : basePhase;
    onMusicContext({
      worldId: activeWorldId,
      mapId: activeHub.surfaceMapId,
      phase,
      encounterIntensity: musicCombatActive ? (phase === 'elite' ? 1 : 0.55) : 0,
      depth: Boolean(currentDepthZoneId),
      dailyActivity: adventureProgress.pinnedDaily?.date === adventureUtcDate() && adventureProgress.pinnedDaily.worldId === activeWorldId ? getStoryDailyActivities(adventureProgress.pinnedDaily.worldId).find((activity) => activity.id === adventureProgress.pinnedDaily?.activityId)?.kind : undefined
    });
    return () => onMusicContext(null);
  }, [activeHub.musicPhase, activeHub.surfaceMapId, activeWorldId, adventureProgress.pinnedDaily, currentDepthZoneId, musicCombatActive, musicEncounter?.elite, musicEncounterProgress.activeChallenge, onMusicContext]);
  const activeMountId: StoryMountId | null = isStoryAdventureRegionId(activeWorldId) ? STORY_WORLD_MOUNT[activeWorldId] : null;
  const activeMount = activeMountId ? STORY_MOUNTS[activeMountId] : null;
  const mountUnlocked = Boolean(activeMountId && adventureProgress.mounts[activeMountId]?.unlocked);
  const toggleMount = useCallback(() => {
    if (!activeMountId || !mountUnlocked || underwater || currentDepthZoneId) return;
    setMounted((current) => !current);
  }, [activeMountId, currentDepthZoneId, mountUnlocked, underwater]);

  useEffect(() => {
    if (!isStoryAdventureRegionId(activeWorldId)) {
      lastVisitedWorldRef.current = '';
      setEncounterProgressByHub({});
      setVisitChallengers([]);
      setRunGraph(null);
      setCurrentDepthZoneId(null);
      setDiscoveredRunZones([]);
      setMounted(false);
      setUnderwater(false);
      setBreath(STORY_MAX_BREATH);
      return;
    }
    if (lastVisitedWorldRef.current === activeWorldId) return;
    lastVisitedWorldRef.current = activeWorldId;
    const next = updateAdventureProgress(beginAdventureVisit(adventureProgressRef.current, activeWorldId));
    const visit = next.visitCounters[activeWorldId] ?? 1;
    const seed = createAdventureVisitSeed(activeWorldId, String(visit), localSessionId || 'solo');
    const graph = generateAdventureRunGraph(activeWorldId, seed, STORY_WORLDS[activeWorldId].exploration!);
    setEncounterProgressByHub({});
    setVisitChallengers([]);
    setRunGraph(graph);
    setCurrentDepthZoneId(null);
    setDiscoveredRunZones([graph.entryZoneId]);
    setBreath(STORY_MAX_BREATH);
  }, [activeWorldId, localSessionId, updateAdventureProgress]);

  const partyRegistration = useMemo<StoryPartyRegistration>(() => ({
    peerId: partyPeerId || `story-peer-${localSessionId}`,
    displayName: onlineProfile?.displayName ?? profile.avatar.name,
    avatarId: profile.activeAvatarId,
    avatarSet: profile.avatar.avatarSet,
    equippedAvatars: getEquippedStoryAvatarSlots(profile).slice(0, adventureProgress.stats.partySize).map((slot) => ({ avatarId: slot.id, avatarSet: slot.avatar.avatarSet })),
    capacity: adventureProgress.stats.partySize,
    health: playerHealth,
    maxHealth: derivedAdventureStats.maxHealth,
    state: playerHealth <= 0 ? 'ko' : 'active'
  }), [adventureProgress.stats.partySize, derivedAdventureStats.maxHealth, localSessionId, onlineProfile?.displayName, partyPeerId, playerHealth, profile]);

  useEffect(() => {
    if (!onlineEnabled || !localSessionId) {
      setPartyInvites([]);
      return undefined;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const invites = await listStoryPartyInvites(localSessionId);
        if (!cancelled) setPartyInvites(invites.filter((invite) => !dismissedPartyInviteIdsRef.current.has(invite.id)));
      } catch {
        // Hub presence remains available when party invitation storage is offline.
      }
    };
    void poll();
    const timer = window.setInterval(poll, 2_500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [localSessionId, onlineEnabled]);

  useEffect(() => {
    if (!onlineEnabled || !localSessionId || !partyInstance || !isStoryAdventureRegionId(activeWorldId) || partyInstance.worldId !== activeWorldId) return undefined;
    let cancelled = false;
    const heartbeat = async () => {
      try {
        const next = await heartbeatStoryParty(partyInstance.id, localSessionId, activeWorldId, partyRegistration);
        if (!next || cancelled) return;
        setPartyInstance(next);
        const graph = generateAdventureRunGraph(activeWorldId, next.seed, STORY_WORLDS[activeWorldId].exploration!);
        setRunGraph(graph);
        if (next.leaderSessionId !== localSessionId) {
          if (next.roomId.startsWith('surface')) {
            setCurrentDepthZoneId(null);
            const surfaceMapId = next.roomId.split(':')[1];
            if (surfaceMapId && STORY_WORLDS[activeWorldId].surfaceMaps?.some((map) => map.id === surfaceMapId)) setActiveSurfaceMapId(surfaceMapId);
          } else setCurrentDepthZoneId(graph.zones.some((zone) => zone.id === next.roomId) ? next.roomId : null);
        }
        setDiscoveredRunZones((current) => Array.from(new Set([graph.entryZoneId, ...current.filter((id) => graph.zones.some((zone) => zone.id === id))])));
      } catch {
        // Keep the last authoritative party snapshot through transient reconnects.
      }
    };
    void heartbeat();
    const timer = window.setInterval(heartbeat, 2_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [activeWorldId, localSessionId, onlineEnabled, partyInstance?.id, partyRegistration]);

  useEffect(() => {
    if (!partyInstance || partyInstance.leaderSessionId !== localSessionId) return;
    const roomId = currentDepthZoneId ?? `surface:${activeSurfaceMapId ?? (isStoryAdventureRegionId(activeWorldId) ? firstStoryAdventureSurfaceMap(activeWorldId).id : 'arrival')}`;
    if (partyInstance.roomId === roomId) return;
    void updateStoryPartyRoom(partyInstance, localSessionId, roomId).then((next) => { if (next) setPartyInstance(next); }).catch(() => undefined);
  }, [activeSurfaceMapId, activeWorldId, currentDepthZoneId, localSessionId, partyInstance]);

  useEffect(() => {
    if (!partyInstance || !localSessionId) {
      partyTransportRef.current?.close();
      partyTransportRef.current = null;
      setPartyPeerId('');
      return undefined;
    }
    let cancelled = false;
    void createStoryPartyTransport({
      party: partyInstance,
      sessionId: localSessionId,
      onIntent: (intent) => {
        if (!intent.attack) return;
        const currentParty = partyInstanceRef.current;
        const member = currentParty?.members.find((candidate) => candidate.sessionId === intent.senderSessionId);
        if (!currentParty || currentParty.leaderSessionId !== localSessionId || !member) return;
        const bounds = activeHubBoundsRef.current;
        if (intent.predictedX < bounds.minX + 0.5 || intent.predictedX > bounds.maxX - 0.5 || intent.predictedY < -20 || intent.predictedY > 40) return;
        const now = performance.now();
        if (now < (partyAttackCooldownsRef.current.get(member.sessionId) ?? 0)) return;
        const durationMs = getStoryAttackDurationMs(member.avatarSet, intent.attack);
        partyAttackCooldownsRef.current.set(member.sessionId, now + durationMs);
        const projectile = intent.attack === 'special' ? getStorySpriteProjectile(member.avatarSet) : undefined;
        setPartyAttackEvent({ id: ++attackSequenceRef.current, x: intent.predictedX, y: intent.predictedY, facing: intent.moveX < 0 ? -1 : 1, attackInput: intent.attack, avatarSet: member.avatarSet, startedAt: now + STORY_ATTACK_VISUAL_SYNC_DELAY_MS, activeUntil: now + STORY_ATTACK_VISUAL_SYNC_DELAY_MS + Math.max(100, durationMs, projectile ? projectile.releaseDelayMs + projectile.lifetimeMs : 0), projectile, ...resolveAdventurePlayerAttack(adventureProgressRef.current, intent.attack) });
      },
      onSnapshot: (snapshot: StoryPartyAuthoritativeSnapshot) => {
        setPartyAuthorityLost(snapshot.rewardsPaused);
        unseenStoryPartyRewards(snapshot, localSessionId, sharedRewardIdsRef.current).forEach((reward) => sharedRewardHandlerRef.current({ eventId: reward.id, spawnId: reward.spawnId, enemyId: reward.enemyId, tier: reward.tier, xp: reward.xp }));
      },
      onAuthorityLoss: () => setPartyAuthorityLost(true)
    }).then((transport) => {
      if (cancelled) { transport.close(); return; }
      partyTransportRef.current = transport;
      setPartyPeerId(transport.peerId);
    }).catch(() => setPartyAuthorityLost(true));
    return () => {
      cancelled = true;
      partyTransportRef.current?.close();
      partyTransportRef.current = null;
    };
  }, [localSessionId, partyInstance?.id]);

  useEffect(() => {
    if (!partyInstance) return;
    partyTransportRef.current?.updateParty(partyInstance);
    if (partyInstance.leaderSessionId === localSessionId && partyAuthorityLost) {
      partyAuthorityEpochRef.current += 1;
      partySnapshotSequenceRef.current = 0;
      setPartyAuthorityLost(false);
    }
  }, [localSessionId, partyAuthorityLost, partyInstance]);

  useEffect(() => {
    if (!partyInstance || !partyTransportRef.current || partyInstance.leaderSessionId === localSessionId) return undefined;
    const timer = window.setInterval(() => {
      const input = readInput();
      partyTransportRef.current?.sendIntent({ sequence: ++partyIntentSequenceRef.current, clientTime: Date.now(), moveX: Number(input.right) - Number(input.left), moveY: Number(input.up) - Number(input.down), predictedX: playerStateRef.current.x, predictedY: playerStateRef.current.y, jump: input.jump, block: input.block, attack: input.jab ? 'jab' : input.heavy ? 'heavy' : input.kick ? 'kick' : input.special ? 'special' : undefined });
    }, 50);
    return () => window.clearInterval(timer);
  }, [localSessionId, partyInstance, readInput]);

  useEffect(() => {
    if (!partyInstance || partyInstance.leaderSessionId !== localSessionId || !partyTransportRef.current) return undefined;
    const timer = window.setInterval(() => {
      const rewards = pendingPartyRewardsRef.current.slice(-64);
      partyTransportRef.current?.broadcastSnapshot({
        authorityEpoch: partyAuthorityEpochRef.current,
        sequence: ++partySnapshotSequenceRef.current,
        serverTime: Date.now(),
        roomId: currentDepthZoneRef.current ?? 'surface',
        actors: [
          { id: localSessionId, ownerSessionId: localSessionId, avatarId: profile.activeAvatarId, human: true, x: playerStateRef.current.x, y: playerStateRef.current.y, facing: playerStateRef.current.facing, health: playerHealthRef.current, maxHealth: derivedAdventureStats.maxHealth, ko: playerHealthRef.current <= 0, pose: playerStateRef.current.pose },
          ...partyInstance.aiActors.map((actor, index) => ({ id: actor.id, ownerSessionId: actor.ownerSessionId, avatarId: actor.avatarId, human: false, x: playerStateRef.current.x - 1.4 * (index + 1), y: playerStateRef.current.y, facing: playerStateRef.current.facing, health: actor.health, maxHealth: actor.maxHealth, ko: actor.state === 'ko', pose: 'idle' }))
        ],
        enemies: [],
        projectiles: [],
        encounterState: encounterProgressByHub[activeHub.id] ?? makeStoryEncounterProgress(),
        rewardsPaused: partyAuthorityLost,
        rewardEvents: rewards
      });
    }, 50);
    return () => window.clearInterval(timer);
  }, [activeHub.id, derivedAdventureStats.maxHealth, encounterProgressByHub, localSessionId, partyAuthorityLost, partyInstance, profile.activeAvatarId]);

  useEffect(() => {
    if (!partyInstance || partyInstance.leaderSessionId !== localSessionId || partyInstance.aiActors.length === 0 || partyAuthorityLost) return undefined;
    let cursor = 0;
    const timer = window.setInterval(() => {
      if (pauseOpen || controlsOpen || mapOpen || statsOpen || packOpen || partyUnlockOpen) return;
      const actors = partyInstance.aiActors.filter((actor) => actor.state !== 'ko');
      const actor = actors[cursor++ % Math.max(1, actors.length)];
      if (!actor) return;
      const now = performance.now();
      setPartyAttackEvent({ id: ++attackSequenceRef.current, x: playerStateRef.current.x - ((actor.slot + 1) * 0.45), y: playerStateRef.current.y, facing: playerStateRef.current.facing, attackInput: 'jab', avatarSet: actor.avatarSet, startedAt: now + STORY_ATTACK_VISUAL_SYNC_DELAY_MS, activeUntil: now + STORY_ATTACK_VISUAL_SYNC_DELAY_MS + getStoryAttackDurationMs(actor.avatarSet, 'jab'), ...resolveAdventurePlayerAttack(adventureProgressRef.current, 'jab') });
    }, 810);
    return () => window.clearInterval(timer);
  }, [controlsOpen, localSessionId, mapOpen, packOpen, partyAuthorityLost, partyInstance, partyUnlockOpen, pauseOpen, statsOpen]);

  useEffect(() => {
    if (!isStoryAdventureRegionId(activeWorldId) || currentDepthZoneId) return;
    for (const waystone of baseHub.exploration?.waystones ?? []) {
      if (Math.abs(playerX - waystone.position[0]) <= 2.4 && !adventureProgressRef.current.discoveries.waystones.includes(waystone.id)) {
        updateAdventureProgress(discoverAdventureWaystone(adventureProgressRef.current, waystone.id));
      }
    }
    for (const landmark of baseHub.landmarks ?? []) {
      if (Math.abs(playerX - landmark.position[0]) > Math.max(4, landmark.size[0] / 2)) continue;
      const known = adventureProgressRef.current.discoveries.landmarks[activeWorldId] ?? [];
      if (!known.includes(landmark.id)) updateAdventureProgress(discoverAdventureLandmark(adventureProgressRef.current, activeWorldId, landmark.id));
      if (landmark.kind === 'vista' && !adventureProgressRef.current.discoveries.vistas.includes(landmark.id)) {
        updateAdventureProgress(discoverAdventureVista(adventureProgressRef.current, landmark.id));
      }
    }
    const sanctuary = baseHub.exploration?.mountSanctuary;
    if (sanctuary && Math.abs(playerX - sanctuary.position[0]) <= 2.8 && !adventureProgressRef.current.mounts[sanctuary.mountId]?.unlocked) {
      updateAdventureProgress(unlockAdventureMount(adventureProgressRef.current, sanctuary.mountId));
    }
  }, [activeWorldId, baseHub.exploration, currentDepthZoneId, playerX, updateAdventureProgress]);

  useEffect(() => {
    if (!mounted || !activeMountId) {
      lastMasteryXRef.current = playerX;
      return;
    }
    const distance = Math.abs(playerX - lastMasteryXRef.current);
    lastMasteryXRef.current = playerX;
    if (distance > 4) return;
    masteryDistanceRef.current += distance;
    if (masteryDistanceRef.current >= 40) {
      const awards = Math.floor(masteryDistanceRef.current / 40) * 40;
      masteryDistanceRef.current %= 40;
      updateAdventureProgress(awardMountMastery(adventureProgressRef.current, activeMountId, awards));
    }
  }, [activeMountId, mounted, playerX, updateAdventureProgress]);

  useEffect(() => {
    if (!activeHub.adventure) return undefined;
    const timer = window.setInterval(() => {
      if (underwater) {
        setBreath((current) => Math.max(0, current - STORY_BREATH_DRAIN_PER_SECOND * 0.25 / derivedAdventureStats.breathMultiplier));
      } else {
        setBreath((current) => Math.min(STORY_MAX_BREATH, current + STORY_BREATH_REFILL_PER_SECOND * 0.25));
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [activeHub.adventure, derivedAdventureStats.breathMultiplier, underwater]);

  useEffect(() => {
    if (breath > 0 || !underwater || !isStoryAdventureRegionId(activeWorldId)) return undefined;
    const timer = window.setInterval(() => {
      const nextHealth = Math.max(0, playerHealthRef.current - 14);
      if (nextHealth > 0) {
        playerHealthRef.current = nextHealth;
        const health = { ...memberHealthRef.current, [profile.activeAvatarId]: nextHealth };
        memberHealthRef.current = health;
        setMemberHealth(health);
        setPlayerHealth(nextHealth);
        return;
      }
      const maxHealth = getAdventureDerivedStats(adventureProgressRef.current).maxHealth;
      const rescue = lastAirPocketRef.current ?? activeHub.checkpoint ?? activeHub.spawn;
      const restored = Object.fromEntries(profile.avatars.map((slot) => [slot.id, maxHealth]));
      memberHealthRef.current = restored;
      setMemberHealth(restored);
      playerHealthRef.current = maxHealth;
      setPlayerHealth(maxHealth);
      setBreath(STORY_MAX_BREATH);
      setImpactEvent({ id: ++impactSequenceRef.current, sourceX: rescue[0], knockback: 0, respawn: rescue });
    }, 650);
    return () => window.clearInterval(timer);
  }, [activeHub.checkpoint, activeHub.spawn, activeWorldId, breath, profile, underwater]);
  const allocateStat = useCallback((stat: StoryAdventureStatKey) => {
    const beforeMaxHealth = getAdventureDerivedStats(adventureProgressRef.current).maxHealth;
    const next = updateAdventureProgress(allocateAdventureStat(adventureProgressRef.current, stat));
    const nextMaxHealth = getAdventureDerivedStats(next).maxHealth;
    if (nextMaxHealth > beforeMaxHealth) {
      const delta = nextMaxHealth - beforeMaxHealth;
      const health = Object.fromEntries(Object.entries(memberHealthRef.current).map(([id, value]) => [id, Math.min(nextMaxHealth, value + delta)]));
      memberHealthRef.current = health;
      setMemberHealth(health);
      playerHealthRef.current = health[profile.activeAvatarId] ?? Math.min(nextMaxHealth, playerHealthRef.current + delta);
      setPlayerHealth(playerHealthRef.current);
    }
  }, [profile.activeAvatarId, updateAdventureProgress]);
  const respecStats = useCallback(() => {
    if (!canRespecAdventureStats(activeWorldId, nearbyPortal?.kind)) return;
    const next = updateAdventureProgress(respecAdventureStats(adventureProgressRef.current));
    const maxHealth = getAdventureDerivedStats(next).maxHealth;
    const health = Object.fromEntries(profile.avatars.map((slot) => [slot.id, maxHealth]));
    memberHealthRef.current = health;
    setMemberHealth(health);
    playerHealthRef.current = maxHealth;
    setPlayerHealth(maxHealth);
    const normalized = normalizeStoryAvatarRoster(profile, 1);
    onProfileChange(normalized);
  }, [activeWorldId, nearbyPortal?.kind, onProfileChange, profile, updateAdventureProgress]);
  const handleAdventureAttack = useCallback((x: number, y: number, facing: -1 | 1, attackInput: StoryAttackInput, durationSeconds: number) => {
    emitAdventureAudioEvent({ kind: 'attack', attackInput });
    const resolved = resolveAdventurePlayerAttack(adventureProgressRef.current, attackInput);
    const startedAt = performance.now() + STORY_ATTACK_VISUAL_SYNC_DELAY_MS;
    const projectile = attackInput === 'special' ? getStorySpriteProjectile(profile.avatar.avatarSet) : undefined;
    const projectileEnd = projectile ? projectile.releaseDelayMs + projectile.lifetimeMs : 0;
    setAttackEvent({
      id: ++attackSequenceRef.current,
      x,
      y,
      facing,
      attackInput,
      avatarSet: profile.avatar.avatarSet,
      startedAt,
      activeUntil: startedAt + Math.max(100, durationSeconds * 1_000, projectileEnd),
      projectile,
      ...resolved
    });
  }, [profile.avatar.avatarSet]);
  const openAdventurePack = useCallback((context: StoryCraftingContext = { kind: 'field' }) => {
    setCraftingContext(context);
    setMapOpen(false);
    setStatsOpen(false);
    setPauseOpen(false);
    setPackOpen(true);
  }, []);
  const handleResourceHarvest = useCallback((node: StoryResourceNodeDefinition) => {
    if (!isStoryAdventureRegionId(activeWorldId) || !isAdventureResourceNodeAvailable(adventureProgressRef.current, node, activeWorldId)) return;
    const modifiers = adventureResourceYieldModifiers(adventureProgressRef.current, node);
    const quantity = resourceYield(node, String(attackEvent?.id ?? Date.now()), modifiers.multiplier) + modifiers.flatBonus;
    let next = depleteAdventureResourceNode(adventureProgressRef.current, node, activeWorldId);
    const result = addAdventureMaterial(next, node.resourceId, quantity);
    next = result.progress;
    if (node.secondaryResourceId) next = addAdventureMaterial(next, node.secondaryResourceId, 2 + Math.floor(quantity / 3)).progress;
    updateAdventureProgress(next);
    const resource = STORY_RESOURCES.find((candidate) => candidate.id === node.resourceId)!;
    const notice = { id: Date.now(), label: resource.label, quantity, learned: result.learned };
    setHarvestNotice(notice);
    window.setTimeout(() => setHarvestNotice((current) => current?.id === notice.id ? null : current), reducedMotion ? 900 : 2_800);
    analyticsRef.current?.('adventure_resource_harvested', { world_id: activeWorldId, resource_id: node.resourceId, rarity: node.rarity, quantity, recipe_unlocks: result.learned.length });
  }, [activeWorldId, attackEvent?.id, reducedMotion, updateAdventureProgress]);
  const craftRecipe = useCallback((recipeId: string) => {
    const result = craftAdventureRecipe(adventureProgressRef.current, recipeId, craftingContext);
    if (!result.crafted) return;
    updateAdventureProgress(result.progress);
    analyticsRef.current?.('adventure_item_crafted', { recipe_id: recipeId, crafting_context: craftingContext.kind });
  }, [craftingContext, updateAdventureProgress]);
  const equipArmor = useCallback((recipeId: string) => {
    const before = getAdventureDerivedStats(adventureProgressRef.current).maxHealth;
    const next = updateAdventureProgress(equipAdventureArmor(adventureProgressRef.current, recipeId));
    const after = getAdventureDerivedStats(next).maxHealth;
    if (after > before) {
      playerHealthRef.current = Math.min(after, playerHealthRef.current + after - before);
      setPlayerHealth(playerHealthRef.current);
    } else if (after < before) {
      playerHealthRef.current = Math.min(after, playerHealthRef.current);
      setPlayerHealth(playerHealthRef.current);
    }
    analyticsRef.current?.('adventure_armor_equipped', { recipe_id: recipeId, equipped: Object.values(next.equippedArmor).includes(recipeId) });
  }, [updateAdventureProgress]);
  const useConsumable = useCallback((recipeId: string) => {
    const result = consumeAdventureItem(adventureProgressRef.current, recipeId);
    if (!result.consumed) return;
    const next = updateAdventureProgress(result.progress);
    if (result.healing > 0) {
      playerHealthRef.current = Math.min(getAdventureDerivedStats(next).maxHealth, playerHealthRef.current + result.healing);
      const health = { ...memberHealthRef.current, [profile.activeAvatarId]: playerHealthRef.current };
      memberHealthRef.current = health;
      setMemberHealth(health);
      setPlayerHealth(playerHealthRef.current);
    }
    analyticsRef.current?.('adventure_consumable_used', { recipe_id: recipeId, healing: result.healing });
  }, [profile.activeAvatarId, updateAdventureProgress]);
  const handlePlayerDamage = useCallback((baseDamage: number, sourceX: number) => {
    if (!isStoryAdventureRegionId(activeWorldId) || performance.now() < playerInvulnerableUntilRef.current) return;
    playerInvulnerableUntilRef.current = performance.now() + 650;
    if (mounted) setMounted(false);
    const resolved = resolveAdventurePlayerDamage(baseDamage, adventureProgressRef.current);
    emitAdventureAudioEvent({ kind: 'player-hit', damage: resolved.damage });
    const nextHealth = Math.max(0, playerHealthRef.current - resolved.damage);
    if (nextHealth <= 0) {
      const maxHealth = getAdventureDerivedStats(adventureProgressRef.current).maxHealth;
      const health = { ...memberHealthRef.current, [profile.activeAvatarId]: 0 };
      memberHealthRef.current = health;
      setMemberHealth(health);
      playerHealthRef.current = 0;
      const nextMember = getEquippedStoryAvatarSlots(profile).slice(0, adventureProgressRef.current.stats.partySize).find((slot) => slot.id !== profile.activeAvatarId && (health[slot.id] ?? maxHealth) > 0);
      if (nextMember) {
        switchPartyMember(nextMember.id, true);
        setImpactEvent({ id: ++impactSequenceRef.current, sourceX, knockback: resolved.knockback, respawn: [playerX, playerY] });
        return;
      }
      const checkpoint = activeHub.checkpoint ?? activeHub.spawn;
      const restored = Object.fromEntries(profile.avatars.map((slot) => [slot.id, maxHealth]));
      memberHealthRef.current = restored;
      setMemberHealth(restored);
      playerHealthRef.current = maxHealth;
      setPlayerHealth(maxHealth);
      setImpactEvent({ id: ++impactSequenceRef.current, sourceX, knockback: resolved.knockback, respawn: checkpoint });
      return;
    }
    playerHealthRef.current = nextHealth;
    const health = { ...memberHealthRef.current, [profile.activeAvatarId]: nextHealth };
    memberHealthRef.current = health;
    setMemberHealth(health);
    setPlayerHealth(nextHealth);
    setImpactEvent({ id: ++impactSequenceRef.current, sourceX, knockback: resolved.knockback });
  }, [activeHub.checkpoint, activeHub.spawn, activeWorldId, mounted, playerX, playerY, profile, switchPartyMember]);
  const handleEnemyDefeated = useCallback((event: StoryEnemyDefeatEvent) => {
    if (partyAuthorityLost || (partyInstance && partyInstance.leaderSessionId !== localSessionId && !sharedRewardIdsRef.current.has(event.eventId))) return;
    const result = applyAdventureEnemyDefeat(adventureProgressRef.current, event, rewardEventIdsRef.current);
    if (result.duplicate) return;
    if (rewardEventIdsRef.current.size > 256) rewardEventIdsRef.current.delete(rewardEventIdsRef.current.values().next().value!);
    const next = updateAdventureProgress(result.progress);
    if (partyInstance?.leaderSessionId === localSessionId) {
      pendingPartyRewardsRef.current.push({ id: event.eventId, spawnId: event.spawnId, enemyId: event.enemyId, tier: event.tier, xp: event.xp, recipients: partyInstance.members.filter((member) => member.state !== 'disconnected').map((member) => member.sessionId) });
      if (pendingPartyRewardsRef.current.length > 64) pendingPartyRewardsRef.current.splice(0, pendingPartyRewardsRef.current.length - 64);
    }
    if (result.uniqueChallenger && !next.partyFeatureRevealSeen) setPartyUnlockOpen(true);
    if (result.levelsGained > 0) {
      const maxHealth = getAdventureDerivedStats(next).maxHealth;
      const health = Object.fromEntries(profile.avatars.map((slot) => [slot.id, maxHealth]));
      memberHealthRef.current = health;
      setMemberHealth(health);
      playerHealthRef.current = maxHealth;
      setPlayerHealth(maxHealth);
      setStatPointNotice({
        id: ++statPointNoticeSequenceRef.current,
        gained: result.levelsGained,
        available: next.unspentPoints,
        level: next.level
      });
      const visit = activeVisitRef.current;
      if (visit) analyticsRef.current?.('adventure_progression_reached', {
        visit_id: visit.id,
        world_id: visit.worldId,
        milestone_type: 'level_up',
        level: next.level,
        levels_gained: result.levelsGained
      });
    }
  }, [localSessionId, partyAuthorityLost, partyInstance, profile.avatars, updateAdventureProgress]);
  sharedRewardHandlerRef.current = handleEnemyDefeated;
  const acknowledgePartyUnlock = useCallback((openStats: boolean) => {
    updateAdventureProgress(acknowledgeAdventurePartyFeatureReveal(adventureProgressRef.current));
    setPartyUnlockOpen(false);
    if (openStats) {
      setMapOpen(false);
      setStatsOpen(true);
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
    setImpactEvent(null);
    setAttackEvent(null);
    setNearbyPortal(null);
    setSelectedPlayer(null);
    setMapOpen(false);
    setStatsOpen(false);
    setPackOpen(false);
    setDoorTravel({ target, step: 0 });
  }, [activeWorldId, doorTravel]);

  const activatePortal = useCallback((portal: StoryPortalDefinition) => {
    if (portal.kind === 'adventure-gate' || portal.kind === 'mode-door' || portal.kind === 'shrine') emitAdventureAudioEvent({ kind: 'portal' });
    if (portal.surfaceMapTarget && isStoryAdventureRegionId(activeWorldId)) {
      setCurrentDepthZoneId(null);
      setSurfaceEntry(portal.surfaceEntry === 'east' ? 'east' : 'west');
      setActiveSurfaceMapId(portal.surfaceMapTarget);
      setNearbyPortal(null);
      setMounted(false);
      setUnderwater(false);
      setBreath(STORY_MAX_BREATH);
      setHubReady(false);
      return;
    }
    if (portal.id.startsWith('npc:')) {
      const npc = activeHub.npcs?.find((entry) => entry.id === portal.id.slice('npc:'.length));
      if (npc) {
        const refusing = performance.now() < (NPC_INTERACTION_REFUSAL_UNTIL.get(npc.id) ?? 0);
        setNpcNotice({ id: npc.id, name: npc.displayName, text: refusing ? 'I need a moment. Keep your distance.' : npc.bark });
        window.setTimeout(() => setNpcNotice((current) => current?.id === npc.id ? null : current), 4_500);
        if (!refusing && npc.role === 'specialist' && isStoryAdventureRegionId(npc.biomeId)) {
          const result = unlockAdventureSpecialistRecipes(adventureProgressRef.current, npc.biomeId);
          updateAdventureProgress(result.progress);
          openAdventurePack({ kind: 'specialist', biomeId: npc.biomeId });
          analyticsRef.current?.('adventure_recipes_learned', { source: 'specialist', world_id: npc.biomeId, count: result.learned.length });
        }
      }
      return;
    }
    if (portal.id.startsWith('chest:')) {
      const id = portal.id.slice('chest:'.length);
      const chest = activeHub.interactables?.find((entry) => entry.id === id && entry.kind === 'chest');
      if (chest) {
        updateAdventureProgress(claimAdventureCache(adventureProgressRef.current, chest.id, chest.rewardCoins ?? 0).progress);
        const visit = activeVisitRef.current;
        if (visit) analyticsRef.current?.('adventure_reward_collected', { visit_id: visit.id, world_id: visit.worldId, reward_type: 'cache', level: adventureProgressRef.current.level });
      }
      return;
    }
    if (portal.id.startsWith('relic:')) {
      const id = portal.id.slice('relic:'.length);
      const relic = activeHub.interactables?.find((entry) => entry.id === id && entry.kind === 'relic');
      if (relic?.relicId) {
        updateAdventureProgress(collectAdventureRelic(adventureProgressRef.current, relic.relicId));
        const visit = activeVisitRef.current;
        if (visit) analyticsRef.current?.('adventure_reward_collected', { visit_id: visit.id, world_id: visit.worldId, reward_type: 'relic', level: adventureProgressRef.current.level });
      }
      return;
    }
    if (portal.id === 'crafting:route-workbench') { openAdventurePack({ kind: 'workbench' }); return; }
    if (portal.id === 'restoration:route-board') { setMapOpen(true); return; }
    if (portal.id.startsWith('restoration:') && isStoryAdventureRegionId(activeWorldId)) {
      const id = portal.id.slice('restoration:'.length);
      if (adventureProgressRef.current.restoredShortcuts.includes(id)) {
        setSurfaceEntry('west');
        setActiveSurfaceMapId(firstStoryAdventureSurfaceMap(activeWorldId).id);
      } else {
        updateAdventureProgress(restoreAdventureShortcut(adventureProgressRef.current, id, 100).progress);
      }
      return;
    }
    if (portal.id === 'depth-return-surface') {
      setCurrentDepthZoneId(null);
      setUnderwater(false);
      setBreath(STORY_MAX_BREATH);
      return;
    }
    if (portal.id.startsWith('depth-link:')) {
      const target = portal.id.slice('depth-link:'.length);
      if (runGraph?.zones.some((zone) => zone.id === target)) {
        setCurrentDepthZoneId(target);
        setDiscoveredRunZones((current) => Array.from(new Set([...current, target])));
        setMounted(false);
      }
      return;
    }
    if (portal.id.startsWith('depth-entry:') && runGraph) {
      setCurrentDepthZoneId(runGraph.entryZoneId);
      setDiscoveredRunZones((current) => Array.from(new Set([...current, runGraph.entryZoneId])));
      setMounted(false);
      return;
    }
    if (portal.id.startsWith('waystone:')) {
      const waystoneId = portal.id.slice('waystone:'.length);
      const current = adventureProgressRef.current;
      updateAdventureProgress(current.discoveries.waystones.includes(waystoneId) ? upgradeAdventureWaystone(current, waystoneId, 250).progress : discoverAdventureWaystone(current, waystoneId));
      return;
    }
    if (portal.id.startsWith('mount-sanctuary:') && isStoryAdventureRegionId(activeWorldId)) {
      const mountId = STORY_WORLD_MOUNT[activeWorldId];
      updateAdventureProgress(unlockAdventureMount(adventureProgressRef.current, mountId));
      return;
    }
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
  }, [activeHub.interactables, activeHub.npcs, activeWorldId, beginWorldTravel, onDestination, openAdventurePack, quickMatch.portalId, quickMatch.status, runGraph, updateAdventureProgress]);

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
          if (isStoryAdventureRegionId(current.target)) {
            setActiveSurfaceMapId(firstStoryAdventureSurfaceMap(current.target).id);
            setSurfaceEntry('west');
          } else {
            setActiveSurfaceMapId(null);
          }
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
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || pauseOpen || controlsOpen || mapOpen || statsOpen || packOpen || doorTravel) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      startQuickMatch();
    };
    window.addEventListener('keydown', onFindMatch, true);
    return () => window.removeEventListener('keydown', onFindMatch, true);
  }, [controlsOpen, doorTravel, mapOpen, packOpen, pauseOpen, quickMatchAvailable, startQuickMatch, statsOpen]);

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
    analyticsRef.current?.('story_challenge_completed', { status: 'accepted' });
    onOnlineSpar(opponent);
  }, [challenges, localSessionId, onOnlineSpar, remotePlayers]);

  useEffect(() => {
    const terminal = challenges.find((challenge) => challenge.status !== 'pending'
      && challenge.status !== 'accepted'
      && (challenge.challengerSessionId === localSessionId || challenge.targetSessionId === localSessionId)
      && !noticedChallengeIdsRef.current.has(`${challenge.id}:${challenge.status}`));
    if (!terminal || !localSessionId) return;
    noticedChallengeIdsRef.current.add(`${terminal.id}:${terminal.status}`);
    analyticsRef.current?.('story_challenge_completed', { status: terminal.status });
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
  const inviteSelectedPlayerToParty = useCallback(async () => {
    if (!selectedPlayer || !localSessionId || !onlineEnabled || !isStoryAdventureRegionId(activeWorldId)) return;
    try {
      let party = partyInstance;
      if (!party) {
        party = await createStoryParty(localSessionId, activeWorldId, partyRegistration);
        if (!party) throw new Error('Party creation failed');
        setPartyInstance(party);
      }
      if (party.leaderSessionId !== localSessionId) {
        setPlayerActionMessage('Only the party leader can send invitations.');
        return;
      }
      await inviteToStoryParty(party, localSessionId, selectedPlayer.sessionId, partyRegistration.displayName);
      setPlayerActionMessage(`Party invitation sent to ${selectedPlayer.displayName}.`);
    } catch {
      setPlayerActionMessage('The party invitation could not be sent. Check your capacity and connection.');
    }
  }, [activeWorldId, localSessionId, onlineEnabled, partyInstance, partyRegistration, selectedPlayer]);
  const acceptPartyInvite = useCallback(async (invite: StoryPartyInvite) => {
    if (!localSessionId || partyInstance) return;
    try {
      const joined = await acceptStoryPartyInvite(invite, localSessionId, partyRegistration);
      if (!joined) return;
      setPartyInstance(joined);
      setPartyInvites((current) => current.filter((candidate) => candidate.id !== invite.id));
      if (activeWorldId !== joined.worldId) setActiveWorldId(joined.worldId);
      const graph = generateAdventureRunGraph(joined.worldId, joined.seed, STORY_WORLDS[joined.worldId].exploration!);
      setRunGraph(graph);
      if (joined.roomId.startsWith('surface')) {
        setCurrentDepthZoneId(null);
        const surfaceMapId = joined.roomId.split(':')[1];
        if (surfaceMapId && STORY_WORLDS[joined.worldId].surfaceMaps?.some((map) => map.id === surfaceMapId)) setActiveSurfaceMapId(surfaceMapId);
      } else setCurrentDepthZoneId(graph.zones.some((zone) => zone.id === joined.roomId) ? joined.roomId : null);
      setDiscoveredRunZones([graph.entryZoneId, ...(joined.roomId.startsWith('surface') ? [] : [joined.roomId])]);
    } catch {
      setPartyInvites((current) => current.filter((candidate) => candidate.id !== invite.id));
      setChallengeNotice({ id: invite.id, text: 'That party invitation expired or the party is full.' });
    }
  }, [activeWorldId, localSessionId, partyInstance, partyRegistration]);
  const leaveCurrentParty = useCallback(() => {
    if (!partyInstance || !localSessionId) return;
    leaveStoryParty(partyInstance, localSessionId);
    setPartyInstance(null);
  }, [localSessionId, partyInstance]);
  const transferToSelectedPlayer = useCallback(async () => {
    if (!partyInstance || !selectedPlayer || partyInstance.leaderSessionId !== localSessionId || !partyInstance.members.some((member) => member.sessionId === selectedPlayer.sessionId)) return;
    try {
      const next = await transferStoryPartyLeadership(partyInstance, localSessionId, selectedPlayer.sessionId);
      if (next) setPartyInstance(next);
      setPlayerActionMessage(`${selectedPlayer.displayName} is now party leader.`);
    } catch {
      setPlayerActionMessage('Leadership transfer failed.');
    }
  }, [localSessionId, partyInstance, selectedPlayer]);
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
        setPackOpen(false);
        setMapOpen((current) => !current);
      }
      if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setMapOpen(false);
        setPackOpen(false);
        setStatsOpen((current) => !current);
      }
      if (event.key.toLowerCase() === 'b') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (packOpen) setPackOpen(false);
        else openAdventurePack({ kind: 'field' });
      }
      if (event.key.toLowerCase() === 'g') {
        event.preventDefault();
        event.stopImmediatePropagation();
        toggleMount();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [activeHub.adventure, openAdventurePack, packOpen, toggleMount]);

  useEffect(() => {
    if (!activeHub.adventure) return undefined;
    let frame = 0;
    let r3Held = false;
    const poll = () => {
      const pressed = Boolean(navigator.getGamepads?.()[0]?.buttons[11]?.pressed);
      if (pressed && !r3Held && !pauseOpen && !mapOpen && !statsOpen && !packOpen) toggleMount();
      r3Held = pressed;
      frame = window.requestAnimationFrame(poll);
    };
    frame = window.requestAnimationFrame(poll);
    return () => window.cancelAnimationFrame(frame);
  }, [activeHub.adventure, mapOpen, packOpen, pauseOpen, statsOpen, toggleMount]);

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
      if (packOpen) {
        setPackOpen(false);
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
  }, [closePause, controlsOpen, mapOpen, openPause, packOpen, pauseOpen, selectedPlayer, statsOpen]);

  const visibleRemotePlayers = remotePlayers.filter((presence) => (presence.worldId ?? 'central') === activeWorldId);
  const playerCount = onlineEnabled ? visibleRemotePlayers.length + 1 : 1;
  const statusLabel = connectionStatus === 'online' ? 'Live' : connectionStatus === 'local' ? 'Local Link' : connectionStatus === 'reconnecting' ? 'Reconnecting' : connectionStatus === 'connecting' ? 'Connecting' : 'Offline';
  const incomingSeconds = incomingChallenge ? Math.max(0, Math.ceil((incomingChallenge.expiresAt - challengeClock) / 1_000)) : 0;
  const outgoingSeconds = outgoingChallenge ? Math.max(0, Math.ceil((outgoingChallenge.expiresAt - challengeClock) / 1_000)) : 0;

  const assignedPortal = quickMatch.status === 'assigned' ? activeHub.portals.find((portal) => portal.id === quickMatch.portalId) : null;
  const doorFrame = doorTravel ? DOOR_TRAVEL_FRAME_SEQUENCE[doorTravel.step] ?? 0 : 0;
  const encounterSeed = partyInstance?.seed ?? runGraph?.seed ?? `${activeWorldId}:central`;
  const activeEncounterProgress = useMemo(
    () => ({ ...(encounterProgressByHub[activeHub.id] ?? makeStoryEncounterProgress()), selectedChallengers: visitChallengers }),
    [activeHub.id, encounterProgressByHub, visitChallengers]
  );
  const handleEncounterProgressChange = useCallback((next: StoryEncounterProgress) => {
    const previous = encounterProgressByHub[activeHub.id] ?? makeStoryEncounterProgress();
    const newlyResolved = next.resolvedZoneIds.filter((zoneId) => !previous.resolvedZoneIds.includes(zoneId));
    if (newlyResolved.length > 0) {
      const reviveHealth = Math.max(1, Math.ceil(derivedAdventureStats.maxHealth * 0.25));
      const health = Object.fromEntries(Object.entries(memberHealthRef.current).map(([id, value]) => [id, value <= 0 ? reviveHealth : value]));
      memberHealthRef.current = health;
      setMemberHealth(health);
    }
    const visit = activeVisitRef.current;
    if (visit) {
      newlyResolved.forEach((zoneId) => {
        const encounterKey = `${activeHub.id}:${zoneId}`;
        const startedAt = encounterStartedAtRef.current[encounterKey] ?? performance.now();
        analyticsRef.current?.('adventure_encounter_completed', {
          visit_id: visit.id,
          encounter_id: encounterKey,
          world_id: visit.worldId,
          zone_id: zoneId,
          level: adventureProgressRef.current.level,
          duration_seconds: Number(((performance.now() - startedAt) / 1000).toFixed(2)),
          result: 'victory'
        });
        delete encounterStartedAtRef.current[encounterKey];
      });
    }
    setVisitChallengers(next.selectedChallengers);
    setEncounterProgressByHub((current) => ({ ...current, [activeHub.id]: next }));
  }, [activeHub.id, derivedAdventureStats.maxHealth, encounterProgressByHub]);
  const handleChallengerStarted = useCallback(() => setMounted(false), []);
  const fastTravelToWaystone = useCallback((waystoneId: string, position: [number, number]) => {
    if (!adventureProgressRef.current.discoveries.waystones.includes(waystoneId) || !isStoryAdventureRegionId(activeWorldId)) return;
    setCurrentDepthZoneId(null);
    setMounted(false);
    setUnderwater(false);
    setBreath(STORY_MAX_BREATH);
    setMapOpen(false);
    setImpactEvent({ id: ++impactSequenceRef.current, sourceX: position[0], knockback: 0, respawn: position });
  }, [activeWorldId]);
  const pinDailyActivity = useCallback((worldId: typeof STORY_ADVENTURE_REGION_IDS[number], activityId: string) => {
    updateAdventureProgress(pinAdventureDaily(adventureProgressRef.current, adventureUtcDate(), worldId, activityId));
  }, [updateAdventureProgress]);
  const effectiveAttackEvent = partyAttackEvent && (!attackEvent || partyAttackEvent.id > attackEvent.id) ? partyAttackEvent : attackEvent;

  return <div className="story-hub-screen" data-testid="story-hub-screen" data-world={activeWorldId} data-hub-ready={hubReady ? 'true' : 'false'} data-controls-open={controlsOpen ? 'true' : 'false'} data-map-open={mapOpen ? 'true' : 'false'} data-stats-open={statsOpen ? 'true' : 'false'} data-quick-match={quickMatchAvailable ? 'true' : 'false'} data-player-x={playerX.toFixed(2)} data-player-y={playerY.toFixed(2)} data-player-pose={playerPose} data-player-projectile-asset={effectiveAttackEvent?.projectile?.frames[0]?.path ?? ''} data-player-projectile-launch={effectiveAttackEvent?.projectile?.launchPoint.join(',') ?? ''} data-player-health={playerHealth} data-player-level={adventureProgress.level} data-party-id={partyInstance?.id ?? ''} data-nearby-portal={nearbyPortal?.id ?? ''} data-online={onlineEnabled ? 'true' : 'false'} data-connection-status={connectionStatus} data-player-count={playerCount}>
    <div className="story-hub-canvas-shell">
      <HubCanvas key={activeHub.id} hub={activeHub} profile={profile} reducedMotion={reducedMotion} readInput={readInput} disabled={pauseOpen || controlsOpen || mapOpen || statsOpen || packOpen || partyUnlockOpen || Boolean(selectedPlayer) || Boolean(incomingChallenge) || Boolean(doorTravel)} avatarVisible={!doorTravel || doorTravel.step < 4 || doorTravel.step >= 18} quickMatchAvailable={quickMatchAvailable} assignedPortalId={quickMatch.portalId} nearbyPortal={nearbyPortal} remotePlayers={visibleRemotePlayers} selectedPlayerSessionId={selectedPlayer?.sessionId} progress={adventureProgress} activePartyMembers={partyInstance ? partyInstance.members.length + partyInstance.aiActors.length : 1} partyAiActors={partyInstance?.aiActors ?? []} mounted={mounted} mount={activeMount} attackEvent={effectiveAttackEvent} impactEvent={impactEvent} encounterSeed={encounterSeed} initialEncounterProgress={activeEncounterProgress} onEncounterProgressChange={handleEncounterProgressChange} onChallengerStarted={handleChallengerStarted} onAttack={handleAdventureAttack} onPlayerDamage={handlePlayerDamage} onEnemyDefeated={handleEnemyDefeated} onResourceHarvest={handleResourceHarvest} onQuickMatch={startQuickMatch} onSelectPlayer={selectRemotePlayer} onNearbyPortal={setNearbyPortal} onActivatePortal={activatePortal} onWaterState={handleWaterState} onExit={exitCurrentWorld} onPause={openPause} onStateSample={handlePlayerState} onReady={handleHubReady} />
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
          <div className="story-hub-remote-names" data-analytics-private="true" aria-label={`Players in ${activeHub.name}`}>
            {visibleRemotePlayers.slice(0, 3).map((presence) => <i key={presence.sessionId} data-testid={`story-hub-remote-${presence.sessionId}`}>{presence.displayName}</i>)}
          </div>
        </div>
        <div className="story-hub-player-card" data-analytics-private="true">
          <span>Story Avatar</span>
          <strong>{profile.avatar.name}</strong>
        </div>
      </div>
    </header>

    {activeHub.adventure && <AdventureHud progress={adventureProgress} profile={profile} onlineParty={partyInstance} localSessionId={localSessionId} health={playerHealth} healthByAvatar={memberHealth} maxHealth={derivedAdventureStats.maxHealth} breath={breath} underwater={underwater} mount={activeMount} mounted={mounted} mountUnlocked={mountUnlocked} onMemberSelect={switchPartyMember} onMount={toggleMount} onMap={() => { setStatsOpen(false); setPackOpen(false); setMapOpen(true); }} onStats={() => { setMapOpen(false); setPackOpen(false); setStatsOpen(true); }} onPack={() => openAdventurePack()} />}
    {statPointNotice && !statsOpen && <AdventureStatPointNotification key={statPointNotice.id} notice={statPointNotice} reducedMotion={reducedMotion} onUpgrade={() => { setStatPointNotice(null); setMapOpen(false); setStatsOpen(true); }} onDismiss={() => setStatPointNotice(null)} />}
    {partyUnlockOpen && <PartySizeUnlockReveal progress={adventureProgress} reducedMotion={reducedMotion} onOpenStats={() => acknowledgePartyUnlock(true)} onContinue={() => acknowledgePartyUnlock(false)} />}

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
        {isStoryAdventureRegionId(activeWorldId) && <button type="button" className="is-party" disabled={!onlineEnabled || adventureProgress.stats.partySize <= (partyInstance?.members.length ?? 1) || Boolean(partyInstance && partyInstance.leaderSessionId !== localSessionId) || Boolean(partyInstance?.members.some((member) => member.sessionId === selectedPlayer.sessionId))} onClick={inviteSelectedPlayerToParty}>
          <UsersRound size={20} /><span><strong>Invite to Party</strong><small>{partyInstance?.members.some((member) => member.sessionId === selectedPlayer.sessionId) ? 'Already in your party' : `Leader capacity ${partyInstance?.leaderCapacity ?? adventureProgress.stats.partySize}/5`}</small></span>
        </button>}
        {partyInstance?.leaderSessionId === localSessionId && partyInstance.members.some((member) => member.sessionId === selectedPlayer.sessionId) && <button type="button" onClick={transferToSelectedPlayer}>
          <Handshake size={20} /><span><strong>Transfer Leadership</strong><small>Use their Party Size without ejecting humans</small></span>
        </button>}
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

    {partyInstance && <aside className="story-party-status-card" aria-label="Online Adventure party" data-testid="story-party-status">
      <span><UsersRound size={17} /> {partyInstance.leaderSessionId === localSessionId ? 'Party Leader' : 'Party Member'}</span>
      <strong>{partyInstance.members.length + partyInstance.aiActors.length}/{partyInstance.leaderCapacity} active slots</strong>
      <small>{partyInstance.members.length} human · {partyInstance.aiActors.length} AI · {partyInstance.roomId === 'surface' ? 'Surface' : 'Depth room'}</small>
      <button type="button" onClick={leaveCurrentParty}><LogOut size={15} /> Leave Party</button>
    </aside>}

    {!partyInstance && partyInvites[0] && <aside className="story-challenge-card story-party-invite-card is-incoming" role="dialog" aria-modal="false" aria-labelledby="story-party-invite-title" data-testid="story-party-invite">
      <div className="story-challenge-timer"><Clock3 size={17} /><strong>{Math.max(0, Math.ceil((partyInvites[0].expiresAt - Date.now()) / 1_000))}s</strong></div>
      <small>Adventure Party Invitation</small>
      <h2 id="story-party-invite-title">{partyInvites[0].inviterDisplayName}</h2>
      <p>invited you to join their squad in {STORY_ADVENTURE_REGION_LABELS[partyInvites[0].worldId]}.</p>
      <div>
        <button type="button" className="is-accept" onClick={() => acceptPartyInvite(partyInvites[0])}><CheckCircle2 size={18} /> Join Party</button>
        <button type="button" onClick={() => { dismissedPartyInviteIdsRef.current.add(partyInvites[0].id); setPartyInvites((current) => current.slice(1)); }}><XCircle size={18} /> Dismiss</button>
      </div>
    </aside>}

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
    {npcNotice && <aside className="story-challenge-notice is-npc" role="status" data-testid="story-npc-dialogue">
      <ContactRound size={18} /><span><strong>{npcNotice.name}</strong> · {npcNotice.text}</span><button type="button" aria-label="Dismiss dialogue" onClick={() => setNpcNotice(null)}><X size={16} /></button>
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
        <div><strong>Double Jump</strong><kbd>Space ×2</kbd><span>R2 ×2</span></div>
        <div><strong>Drop Through</strong><kbd>Hold ↓</kbd><span>Down on D-pad / stick</span></div>
        <div><strong>Jab</strong><kbd>U</kbd><span>South face button</span></div>
        <div><strong>Heavy</strong><kbd>I</kbd><span>West face button</span></div>
        <div><strong>Kick</strong><kbd>J</kbd><span>East face button</span></div>
        <div><strong>Special</strong><kbd>K</kbd><span>North face button</span></div>
        <div><strong>Interact</strong><kbd>E</kbd><span>L2 / dedicated touch control</span></div>
        {activeHub.adventure && <div><strong>World Map</strong><kbd>M</kbd><span>Route network</span></div>}
        {activeHub.adventure && <div><strong>Stats</strong><kbd>P</kbd><span>Allocate level points</span></div>}
        {activeHub.adventure && <div><strong>Adventure Pack</strong><kbd>B</kbd><span>Materials, crafting, and gear</span></div>}
        {activeMount && <div><strong>Mount</strong><kbd>G</kbd><span>R3 · {mountUnlocked ? activeMount.label : 'Unlock at sanctuary'}</span></div>}
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
      <button type="button" disabled={!nearbyPortal} onClick={() => nearbyPortal && activatePortal(nearbyPortal)}>{nearbyPortal?.locked ? 'Inspect' : nearbyPortal?.kind === 'shrine' ? 'Recalibrate' : nearbyPortal?.kind === 'npc' ? 'Talk' : nearbyPortal?.kind === 'chest' ? 'Open' : nearbyPortal?.kind === 'relic' ? 'Claim' : nearbyPortal?.kind === 'restoration' ? 'Restore' : nearbyPortal?.kind === 'checkpoint' ? 'Attune' : nearbyPortal?.kind === 'crafting' ? 'Craft' : 'Enter'}</button>
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
      <span>Move</span><b>← →</b><span>Run</span><b>Shift</b><span>Attacks</span><b>U</b><b>I</b><b>J</b><b>K</b>{activeHub.adventure && <><span>Pack</span><b>B</b><span>Map</span><b>M</b><span>Stats</span><b>P</b>{activeMount && <><span>Mount</span><b>G / R3</b></>}</>}{quickMatchAvailable && <><span>Match</span><b>F / Y</b></>}<span>Interact</span><b>E / L2</b><span>Pause</span><b>Esc</b>
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
        <div className="story-touch-attack-cluster" aria-label="Attacks">
          <TouchButton label="Jab attack U" action="jab" className="is-attack is-jab" setVirtualAction={setVirtualAction}><span>U</span></TouchButton>
          <TouchButton label="Heavy attack I" action="heavy" className="is-attack is-heavy" setVirtualAction={setVirtualAction}><span>I</span></TouchButton>
          <TouchButton label="Kick attack J" action="kick" className="is-attack is-kick" setVirtualAction={setVirtualAction}><span>J</span></TouchButton>
          <TouchButton label="Special attack K" action="special" className="is-attack is-special" setVirtualAction={setVirtualAction}><span>K</span></TouchButton>
        </div>
        <TouchButton label="Interact" action="charge" className="is-interact" setVirtualAction={setVirtualAction}><DoorOpen /></TouchButton>
        {activeMount && <button type="button" className={`story-touch-mount ${mounted ? 'is-mounted' : ''}`} disabled={!mountUnlocked || underwater} aria-label={`${mounted ? 'Dismount' : 'Mount'} ${activeMount.label}`} onClick={toggleMount}><Gauge /></button>}
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
        {activeHub.adventure && <button type="button" className="story-pause-edit" onClick={() => openAdventurePack({ kind: 'field' })}><Backpack size={19} /> Adventure Pack</button>}
        {activeMusicTrack && <p className="story-adventure-now-playing"><strong>{activeMusicTrack.title}</strong> — Stimmerman</p>}
        {onCredits && <button type="button" className="story-pause-edit" onClick={onCredits}><BookOpen size={19} /> Credits &amp; Licenses</button>}
        <button type="button" className="story-pause-edit" onClick={editAvatarFromPause}><Pencil size={19} /> Edit Avatar</button>
        <button type="button" className={`story-online-toggle ${onlineEnabled ? 'is-online' : 'is-offline'}`} role="switch" aria-checked={onlineEnabled} onClick={toggleOnline}>
          <span aria-hidden="true"><Wifi size={19} /><WifiOff size={19} /></span>
          <span><strong>{onlineEnabled ? 'Online' : 'Offline'}</strong><small>{onlineEnabled ? 'Visible in the shared world' : 'Playing privately'}</small></span>
        </button>
        <button type="button" className="story-pause-exit" onClick={onExit}><LogOut size={19} /> Return to Main Menu</button>
      </section>
    </div>}

    {mapOpen && <AdventureRouteMap activeWorldId={activeWorldId} activeSurfaceMapId={activeSurfaceMapId} progress={adventureProgress} runGraph={runGraph} discoveredRunZones={discoveredRunZones} currentDepthZoneId={currentDepthZoneId} onFastTravel={fastTravelToWaystone} onPinDaily={pinDailyActivity} onClose={() => setMapOpen(false)} />}
    {statsOpen && <AdventureStatsPanel progress={adventureProgress} canRespec={canRespecAdventureStats(activeWorldId, nearbyPortal?.kind)} onAllocate={allocateStat} onManageParty={() => onDestination('avatarStudio')} onRespec={respecStats} onClose={() => setStatsOpen(false)} />}
    {packOpen && <AdventurePackPanel progress={adventureProgress} context={craftingContext} onCraft={craftRecipe} onEquip={equipArmor} onUse={useConsumable} onClose={() => setPackOpen(false)} />}
    {harvestNotice && <aside className="story-harvest-toast" role="status" data-testid="story-harvest-toast"><Gem size={18} /><span><strong>+{harvestNotice.quantity} {harvestNotice.label}</strong>{harvestNotice.learned.length > 0 && <small>{harvestNotice.learned.length} new {harvestNotice.learned.length === 1 ? 'recipe' : 'recipes'} discovered</small>}</span></aside>}
  </div>;
}

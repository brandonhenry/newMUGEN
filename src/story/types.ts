export const STORY_PROFILE_VERSION = 4 as const;
export const STORY_PROFILE_STORAGE_KEY = 'kore.story.profile.v4';
export const LEGACY_STORY_PROFILE_STORAGE_KEY = 'kore.story.profile.v3';
export const STORY_PROFILE_V2_STORAGE_KEY = 'kore.story.profile.v2';
export const ORIGINAL_STORY_PROFILE_STORAGE_KEY = 'kore.story.profile.v1';

export type StoryBodyPreset = 'compact' | 'standard' | 'tall';
export type StoryBodyTone = 'blue' | 'dark' | 'gray' | 'green' | 'light' | 'pale' | 'red' | 'tan' | 'white' | 'yellow';
export type StoryAvatarLineage = 'human' | 'sylvan' | 'emberkin' | 'synth';
export type StoryHairStyle = 'short' | 'spiked' | 'bob' | 'locs' | 'ponytail' | 'curls' | 'undercut' | 'swept';
export type StoryOutfit = 'kore-cyan' | 'solar-runner' | 'royal-circuit' | 'signal-striker' | 'forest-scout' | 'mono-steel' | 'neon-street' | 'arena-varsity' | 'tech-nomad' | 'void-operative';
export type StoryLegStyle = 'fitted' | 'cargo' | 'joggers' | 'wide' | 'runner' | 'armored' | 'techwear' | 'utility';
export type StoryAccessory = 'none' | 'headband' | 'glasses' | 'headphones' | 'scarf' | 'cyber-visor' | 'street-cap' | 'comms-headset' | 'holo-pin';
export type StoryAvatarSet =
  | 'solar-runner' | 'street-shadow' | 'crimson-ranger' | 'rose-blade'
  | 'neon-courier' | 'ember-scout' | 'synth-drifter' | 'forest-warden'
  | 'solar-brawler' | 'void-operative' | 'circuit-mage' | 'street-medic'
  | 'arena-rebel' | 'tech-nomad';

export type StoryAttackInput = 'jab' | 'heavy' | 'kick' | 'special';
export type StoryAttackAnimationId = 'attack' | 'attack-heavy' | 'attack-kick' | 'attack-special';

export type StorySpriteFrame = {
  id: string;
  path: string;
  durationMs: number;
  contentBounds: [number, number, number, number];
  bodyAnchorX: number;
  /** Uniform world-space correction used to keep the authored head/body scale stable across frames. */
  visualScale?: number;
};

export type StorySpriteAnimation = {
  id: string;
  loop: boolean;
  activeFrameRange?: [number, number];
  frames: StorySpriteFrame[];
};

export type StorySpriteSourceProvenance = {
  kind: string;
  sha256: string;
  originalFile: string;
};

export type StorySpriteProjectileFrame = {
  id: string;
  path: string;
  durationMs: number;
  contentBounds: [number, number, number, number];
};

export type StorySpriteProjectileDefinition = {
  id: 'special';
  source: StorySpriteSourceProvenance;
  frameSize: { width: number; height: number };
  frames: StorySpriteProjectileFrame[];
  releaseDelayMs: number;
  speed: number;
  lifetimeMs: number;
  launchPoint: [number, number];
  worldSize: [number, number];
  hitboxSize: [number, number];
};

export type StorySpriteSetDefinition = {
  id: StoryAvatarSet;
  label: string;
  frameCount: number;
  source: StorySpriteSourceProvenance;
  attackSource: StorySpriteSourceProvenance;
  projectile?: StorySpriteProjectileDefinition;
  animations: StorySpriteAnimation[];
};

export type StorySpriteManifest = {
  version: 3;
  avatarStyle: 'kore-street-v1';
  defaultSet: StoryAvatarSet;
  frameSize: { width: number; height: number; baseline: number };
  facing: 'right';
  frameCount: number;
  sets: StorySpriteSetDefinition[];
};

export type StoryAvatarDefinition = {
  name: string;
  avatarSet: StoryAvatarSet;
  lineage: StoryAvatarLineage;
  bodyPreset: StoryBodyPreset;
  bodyTone: StoryBodyTone;
  hairStyle: StoryHairStyle;
  hairColor: string;
  outfit: StoryOutfit;
  legStyle: StoryLegStyle;
  accessory: StoryAccessory;
};

export type LegacyStoryAvatarDefinitionV3 = {
  name: string;
  lineage: StoryAvatarLineage;
  bodyPreset: StoryBodyPreset;
  skinTone: string;
  hairStyle: 'short' | 'spiked' | 'bob' | 'locs';
  hairColor: string;
  outfitPalette: string;
  accessory: 'none' | 'headband' | 'glasses' | 'headphones' | 'scarf';
};

export type StoryProfileV1 = {
  version: 1;
  avatar: Omit<LegacyStoryAvatarDefinitionV3, 'lineage'> & { lineage?: StoryAvatarLineage };
  createdAt: number;
  updatedAt: number;
};

export type StoryProfileV2 = {
  version: 2;
  avatarStyle: 'kore-chibi-v1';
  avatar: Omit<LegacyStoryAvatarDefinitionV3, 'lineage'> & { lineage?: StoryAvatarLineage };
  createdAt: number;
  updatedAt: number;
};

export type StoryProfileV3 = {
  version: 3;
  avatarStyle: 'kore-chibi-action-v3';
  avatar: LegacyStoryAvatarDefinitionV3;
  createdAt: number;
  updatedAt: number;
};

export type StoryProfileV4 = {
  version: typeof STORY_PROFILE_VERSION;
  avatarStyle: 'kore-street-v1';
  avatar: StoryAvatarDefinition;
  createdAt: number;
  updatedAt: number;
  reviewedAt: number | null;
};

export type StoryHubAvatarPose = 'idle' | 'walk' | 'sprint' | 'jump' | 'attack-jab' | 'attack-heavy' | 'attack-kick' | 'attack-special';

export type StoryHubPlayerState = {
  x: number;
  y: number;
  pose: StoryHubAvatarPose;
  facing: -1 | 1;
  worldId?: StoryWorldId;
};

export type StoryHubChallengeStatus = 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';

export type StoryHubChallenge = {
  id: string;
  challengerSessionId: string;
  challengerPlayerId: string;
  challengerDisplayName: string;
  targetSessionId: string;
  targetPlayerId: string;
  targetDisplayName: string;
  status: StoryHubChallengeStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
};

export type StoryHubPresence = StoryHubPlayerState & {
  sessionId: string;
  playerId: string;
  displayName: string;
  avatar: StoryAvatarDefinition;
  updatedAt: number;
  challenge?: StoryHubChallenge;
};

export type StoryHubPresenceResult = {
  players: StoryHubPresence[];
  serverTime: number;
};

export type StoryHubConnectionStatus = 'connecting' | 'online' | 'local' | 'reconnecting' | 'offline';

export type HubDestination =
  | 'central'
  | 'story'
  | 'friends'
  | 'online'
  | 'arcade'
  | 'versus'
  | 'training'
  | 'tournament'
  | 'characters'
  | 'avatarStudio'
  | 'options'
  | 'exit';

export type StoryModeWorldId = 'central' | 'arcade' | 'versus' | 'online' | 'training' | 'tournament';
export type StoryAdventureWorldId =
  | 'world-route'
  | 'greenhollow'
  | 'thornwood'
  | 'ironroot'
  | 'bonevault'
  | 'emberdeep'
  | 'frostpeak'
  | 'sunscar'
  | 'skyglass';
export type StoryWorldId = StoryModeWorldId | StoryAdventureWorldId;
export type StoryPortalDestination = HubDestination | StoryAdventureWorldId;
export type StoryPortalKind = 'storefront' | 'mode-door' | 'adventure-gate' | 'shrine' | 'arcade-machine' | 'versus-machine' | 'terminal' | 'chest' | 'npc' | 'relic' | 'checkpoint' | 'restoration';
export type StoryWorldThemeId =
  | 'city'
  | 'arcade'
  | 'versus'
  | 'online'
  | 'training'
  | 'tournament'
  | 'route'
  | 'village'
  | 'forest'
  | 'mine'
  | 'crypt'
  | 'underworld'
  | 'snow'
  | 'desert'
  | 'ruins';
export type StoryEnemyArchetype = 'ground' | 'flying' | 'ranged';
export type StoryEnemyId =
  | 'veil-shade' | 'cinder-wisp' | 'nightshade-bulb' | 'graveblade'
  | 'tide-slime' | 'venom-slime' | 'volt-slime' | 'magma-slime'
  | 'ember-fist' | 'dusk-ronin' | 'crescent-rogue' | 'chimera-android'
  | 'silver-duelist' | 'crimson-countess' | 'laughing-oni' | 'hollow-bride';
export type StoryEnemyTier = 'regular' | 'challenger';
export type StoryEnemyBehavior = 'chaser' | 'bruiser' | 'ambusher' | 'duelist' | 'caster' | 'flying';
export type StoryMountId = 'verdant-stag' | 'bramble-lynx' | 'ironhorn-beetle' | 'pale-warg' | 'cinder-drake' | 'frost-ram' | 'dune-strider' | 'glasswing';
export type StoryTraversalKind = 'walk' | 'climb' | 'ladder' | 'lift' | 'break-wall' | 'swim' | 'glide' | 'updraft' | 'drop';
export type StoryAdventureMapRole = 'arrival' | 'field-a' | 'field-b' | 'mastery';
export type StoryAdventureHazardKind = 'spikes' | 'saw' | 'lava' | 'wind' | 'sinking-sand' | 'collapsing-floor' | 'icicle' | 'drowning';
export type StoryAdventureTraversalPieceKind = 'ladder' | 'rope' | 'lift' | 'moving-platform' | 'falling-platform' | 'breakable-wall' | 'updraft' | 'current' | 'slippery-surface';
export type StoryAdventureInteractableKind = 'chest' | 'npc' | 'objective' | 'lever' | 'restoration' | 'checkpoint' | 'waystone' | 'relic';
export type StoryAdventureActivityKind = 'hunt' | 'rescue' | 'race' | 'defense' | 'collection';
export type AdventureMusicPhase = 'social' | 'safe' | 'explore' | 'mystery' | 'tension' | 'elite' | 'race' | 'sanctuary' | 'victory';
export type StoryDepthZoneKind = 'cave' | 'underwater' | 'tower' | 'ruin' | 'mine' | 'crypt' | 'grotto' | 'sanctuary';
export type StoryAdventureAssetId =
  | 'dawn-tree'
  | 'dawn-wall'
  | 'dawn-ore'
  | 'dawn-reptile'
  | 'crawler-buildings'
  | 'crawler-dungeon'
  | 'crawler-tree'
  | 'pixel-terrain'
  | 'pixel-trap';

export type StoryWorldAssetId = StoryAdventureAssetId
  | 'city-back'
  | 'city-middle'
  | 'city-front'
  | 'city-light'
  | 'city-banner-wide'
  | 'city-banner-tall'
  | `world:${string}`
  | `exploration:${string}`;

export type StoryWorldBackdropMotif =
  | 'city'
  | 'arena'
  | 'servers'
  | 'laboratory'
  | 'stadium'
  | 'village'
  | 'forest'
  | 'cavern'
  | 'crypt'
  | 'volcanic'
  | 'mountains'
  | 'dunes'
  | 'ruins';

export type StoryWorldBackdropLayerDefinition = {
  id: string;
  depth: number;
  y: number;
  height: number;
  opacity: number;
  parallax: number;
  color: string;
  asset?: StoryWorldAssetId;
  motif?: StoryWorldBackdropMotif;
  repeatEvery?: number;
};

export type StoryWorldEnvironmentDefinition = {
  background: string;
  haze: string;
  light: string;
  ground: string;
  accent: string;
  particle: 'none' | 'embers' | 'snow' | 'sand' | 'motes' | 'data';
  layers: StoryWorldBackdropLayerDefinition[];
  surface?: {
    asset: StoryWorldAssetId;
    frame: [number, number, number, number];
    atlasSize: [number, number];
    /** Source-pixel inset for atlases whose painted cap sits below the physics walk line. */
    walkSurfaceInsetPixels?: number;
  };
};

export type StoryWorldLandmarkDefinition = {
  id: string;
  label: string;
  subtitle: string;
  position: [number, number, number];
  size: [number, number];
  color: string;
  kind: 'district' | 'vista' | 'lore' | 'secret';
};

export type StoryAtlasFrame = {
  asset: StoryWorldAssetId;
  frame: [number, number, number, number];
  atlasSize: [number, number];
};

export type StoryWorldPropDefinition = StoryAtlasFrame & {
  id: string;
  position: [number, number, number];
  size: [number, number];
  mirrored?: boolean;
  opacity?: number;
};

export type StoryEnemySpawnDefinition = {
  id: string;
  enemyId: StoryEnemyId;
  position: [number, number];
  patrolRadius: number;
  accent: string;
  encounterZoneId?: string;
  encounterIndex?: number;
  scale?: number;
  leash?: [number, number];
};

export type StoryWorldDistrictDefinition = {
  id: string;
  label: string;
  range: [number, number];
  safe?: boolean;
};

export type StoryEncounterZoneDefinition = {
  id: string;
  range: [number, number];
  maxActive: number;
  safe?: boolean;
  elite?: boolean;
};

export type StoryWaterVolumeDefinition = {
  id: string;
  bounds: [number, number, number, number];
  current: [number, number];
  airPockets: Array<[number, number]>;
};

export type StoryWaystoneDefinition = {
  id: string;
  label: string;
  position: [number, number];
};

export type StoryMountSanctuaryDefinition = {
  id: string;
  mountId: StoryMountId;
  position: [number, number];
  challenge: StoryTraversalKind;
};

export type StoryDepthTemplateDefinition = {
  id: string;
  kind: StoryDepthZoneKind;
  weight: number;
  traversal: StoryTraversalKind[];
  underwater?: boolean;
  connectors?: Array<'west' | 'east' | 'up' | 'down' | 'secret'>;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  enemyLanes?: Array<[number, number]>;
  safeSlots?: Array<[number, number]>;
  rewardSlots?: Array<[number, number]>;
};

export type StoryAdventureExplorationDefinition = {
  safeApproach: [number, number];
  districts: StoryWorldDistrictDefinition[];
  encounters: StoryEncounterZoneDefinition[];
  entrances: Array<{ id: string; label: string; position: [number, number]; kinds: StoryDepthZoneKind[] }>;
  waterVolumes: StoryWaterVolumeDefinition[];
  waystones: StoryWaystoneDefinition[];
  mountSanctuary: StoryMountSanctuaryDefinition;
  depthTemplates: StoryDepthTemplateDefinition[];
  camera: { minY: number; maxY: number };
};

export type StoryGeneratedDepthZone = {
  id: string;
  index: number;
  kind: StoryDepthZoneKind;
  depth: number;
  critical: boolean;
  hidden: boolean;
  finale: boolean;
  difficulty: 1 | 2 | 3 | 4 | 5;
  underwater: boolean;
  traversal: StoryTraversalKind;
  camera: { minX: number; maxX: number; minY: number; maxY: number };
  airPockets: Array<[number, number]>;
  roomTemplateId: string;
  geometrySeed: number;
  enemyLanes: Array<[number, number]>;
  safeSlots: Array<[number, number]>;
  rewardSlots: Array<[number, number]>;
  rewardAfterChallenge: boolean;
};

export type StoryGeneratedDepthLink = {
  id: string;
  from: string;
  to: string;
  traversal: StoryTraversalKind;
};

export type StoryAdventureRunGraph = {
  version: 2;
  worldId: Exclude<StoryAdventureWorldId, 'world-route'>;
  seed: string;
  entryZoneId: string;
  sanctuaryZoneId: string;
  finaleZoneId: string;
  usedFallback: boolean;
  validationFailures: string[];
  zones: StoryGeneratedDepthZone[];
  links: StoryGeneratedDepthLink[];
};

export type StoryMountDefinition = {
  id: StoryMountId;
  worldId: Exclude<StoryAdventureWorldId, 'world-route'>;
  label: string;
  ability: string;
  traversal: StoryTraversalKind[];
  speedMultiplier: number;
  jumpMultiplier: number;
  footAnchor: [number, number];
  riderOffset: [number, number];
  accent: string;
};

export type StoryPortalDefinition = {
  id: string;
  label: string;
  subtitle: string;
  destination: StoryPortalDestination;
  position: [number, number];
  size: [number, number];
  accent: string;
  locked?: boolean;
  kind?: StoryPortalKind;
  stationNumber?: number;
  quickMatch?: boolean;
  surfaceMapTarget?: string;
  surfaceEntry?: 'west' | 'east' | 'spawn';
};

export type StoryHazardDefinition = {
  id: string;
  kind: StoryAdventureHazardKind;
  bounds: [number, number, number, number];
  damage: number;
  knockback: number;
  telegraphMs: number;
  accent: string;
};

export type StoryTraversalPieceDefinition = {
  id: string;
  kind: StoryAdventureTraversalPieceKind;
  position: [number, number];
  size: [number, number];
  route: 'critical' | 'optional' | 'mount';
  speed?: number;
};

export type StoryInteractableDefinition = {
  id: string;
  kind: StoryAdventureInteractableKind;
  label: string;
  subtitle: string;
  position: [number, number];
  rewardCoins?: number;
  relicId?: string;
  cost?: number;
  oneTime?: boolean;
};

export type StoryNpcDefenseProfile = {
  invulnerable: true;
  attackerOnly: true;
  warningMs: number;
  threatRadius: number;
  guardMs: number;
  counterDamagePercent: number;
  knockback: number;
  cooldownMs: number;
  counterRange: number;
};

export type StoryNpcSpriteManifest = {
  id: string;
  sheetPath: string;
  previewPath: string;
  facing: 'right';
  frameSize: { width: number; height: number; baseline: number };
  referenceContentBounds: [number, number, number, number];
  actions: Record<'idle' | 'dialogue' | 'walk' | 'protect' | 'counter', { frames: string[]; durationMs: number; loop: boolean }>;
  source: { kind: 'user-supplied' | 'imagegen'; sha256: string; prompt?: string; model?: string; sourceReferences?: Array<{ path: string; sha256: string }> };
};

export type StoryNpcDefinition = {
  id: string;
  displayName: string;
  role: 'guide' | 'specialist' | 'resident' | 'archivist' | 'warden' | 'steward';
  biomeId: StoryAdventureWorldId;
  mapId: string;
  position: [number, number];
  safeAnchor: [number, number];
  patrolRange?: [number, number];
  spriteId: string;
  bark: string;
  warningBark: string;
  defense: StoryNpcDefenseProfile;
};

export type StoryAdventureMapDefinition = {
  id: string;
  biomeId: Exclude<StoryAdventureWorldId, 'world-route'>;
  role: StoryAdventureMapRole;
  order: number;
  name: string;
  subtitle: string;
  bounds: { minX: number; maxX: number; floorY: number };
  spawn: [number, number];
  checkpoint: [number, number];
  platforms: StoryPlatformDefinition[];
  portals: StoryPortalDefinition[];
  landmarks: StoryWorldLandmarkDefinition[];
  props: StoryWorldPropDefinition[];
  enemySpawns: StoryEnemySpawnDefinition[];
  encounters: StoryEncounterZoneDefinition[];
  hazards: StoryHazardDefinition[];
  traversal: StoryTraversalPieceDefinition[];
  interactables: StoryInteractableDefinition[];
  npcs: StoryNpcDefinition[];
  musicPhase: AdventureMusicPhase;
  heroLandmarkId: string;
};

export type AdventureMusicContext = {
  worldId: StoryAdventureWorldId;
  mapId?: string;
  phase: AdventureMusicPhase;
  encounterIntensity: number;
  depth: boolean;
  dailyActivity?: StoryAdventureActivityKind;
};

export type AdventureMusicTrackDefinition = {
  id: string;
  artist: 'Stimmerman';
  collectionId: string;
  collectionTitle: string;
  title: string;
  path: string;
  durationSeconds: number;
  biomes: StoryAdventureWorldId[];
  phases: AdventureMusicPhase[];
  sha256: string;
};

export type AdventureMusicPoolDefinition = {
  id: string;
  worldId: StoryAdventureWorldId;
  phase: AdventureMusicPhase;
  trackIds: string[];
};

export type StoryPlatformDefinition = {
  id: string;
  position: [number, number];
  size: [number, number];
  oneWay?: boolean;
};

export type StoryHubDefinition = {
  id: string;
  name: string;
  subtitle: string;
  spawn: [number, number];
  bounds: { minX: number; maxX: number; floorY: number };
  platforms: StoryPlatformDefinition[];
  portals: StoryPortalDefinition[];
  theme?: StoryWorldThemeId;
  environment?: StoryWorldEnvironmentDefinition;
  landmarks?: StoryWorldLandmarkDefinition[];
  checkpoint?: [number, number];
  props?: StoryWorldPropDefinition[];
  enemySpawns?: StoryEnemySpawnDefinition[];
  exploration?: StoryAdventureExplorationDefinition;
  adventure?: boolean;
  biomeId?: Exclude<StoryAdventureWorldId, 'world-route'>;
  surfaceMapId?: string;
  surfaceMaps?: StoryAdventureMapDefinition[];
  hazards?: StoryHazardDefinition[];
  traversal?: StoryTraversalPieceDefinition[];
  interactables?: StoryInteractableDefinition[];
  npcs?: StoryNpcDefinition[];
  musicPhase?: AdventureMusicPhase;
};

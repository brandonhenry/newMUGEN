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

export type StorySpriteFrame = {
  id: string;
  path: string;
  durationMs: number;
  contentBounds: [number, number, number, number];
  bodyAnchorX: number;
};

export type StorySpriteAnimation = {
  id: string;
  loop: boolean;
  frames: StorySpriteFrame[];
};

export type StorySpriteSetDefinition = {
  id: StoryAvatarSet;
  label: string;
  frameCount: number;
  source: {
    kind: string;
    sha256: string;
    originalFile: string;
  };
  animations: StorySpriteAnimation[];
};

export type StorySpriteManifest = {
  version: 2;
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

export type StoryHubAvatarPose = 'idle' | 'walk' | 'sprint' | 'jump' | 'attack';

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
export type StoryPortalKind = 'storefront' | 'mode-door' | 'adventure-gate' | 'shrine' | 'arcade-machine' | 'versus-machine' | 'terminal';
export type StoryWorldThemeId =
  | 'city'
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
export type StoryAdventureAssetId =
  | 'dawn-tree'
  | 'dawn-wall'
  | 'dawn-ore'
  | 'dawn-reptile'
  | 'dawn-slime'
  | 'dawn-undead'
  | 'dawn-demon'
  | 'dawn-elemental'
  | 'crawler-buildings'
  | 'crawler-dungeon'
  | 'crawler-tree'
  | 'pixel-terrain'
  | 'pixel-trap';

export type StoryAtlasFrame = {
  asset: StoryAdventureAssetId;
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
  name: string;
  archetype: StoryEnemyArchetype;
  position: [number, number];
  patrolRadius: number;
  sprite: 'skeleton' | 'skeleton-mage' | 'orc' | 'orc-shaman' | 'slime' | 'demon' | 'elemental' | 'reptile';
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
  checkpoint?: [number, number];
  props?: StoryWorldPropDefinition[];
  enemySpawns?: StoryEnemySpawnDefinition[];
  adventure?: boolean;
};

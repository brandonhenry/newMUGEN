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
};

export type StoryHubPresence = StoryHubPlayerState & {
  sessionId: string;
  playerId: string;
  displayName: string;
  avatar: StoryAvatarDefinition;
  updatedAt: number;
};

export type StoryHubPresenceResult = {
  players: StoryHubPresence[];
  serverTime: number;
};

export type StoryHubConnectionStatus = 'connecting' | 'online' | 'local' | 'reconnecting' | 'offline';

export type HubDestination =
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

export type StoryPortalDefinition = {
  id: string;
  label: string;
  subtitle: string;
  destination: HubDestination;
  position: [number, number];
  size: [number, number];
  accent: string;
  locked?: boolean;
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
};

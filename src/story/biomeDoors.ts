import type { StoryAdventureWorldId, StoryPortalDefinition, StoryPortalDestination, StoryWorldThemeId } from './types';

export const STORY_BIOME_DOOR_ASSET = '/story/exploration/doors/biome-doors.png';
export const STORY_NORMAL_BIOME_DOOR_ASSET = '/story/exploration/doors/normal-biome-doors.png';
export const STORY_DEPTH_ENTRANCE_ASSET = '/story/exploration/doors/depth-entrances.png';
export const STORY_SANCTUARY_ENTRANCE_ASSET = '/story/exploration/doors/sanctuary-entrances.png';
export const STORY_BIOME_DOOR_ATLAS_SIZE = [1536, 1024] as const;
export const STORY_BIOME_DOOR_GROUND_SINK_Y = 0.32;

export type StoryBiomeId = Exclude<StoryAdventureWorldId, 'world-route'>;
export type StoryBiomeDoorTier = 'normal' | 'biome-gate' | 'depth' | 'sanctuary';

export type StoryBiomeDoorFrame = {
  biome: StoryBiomeId;
  tier: StoryBiomeDoorTier;
  asset: string;
  atlasSize: readonly [number, number];
  frame: [number, number, number, number];
  displaySize: readonly [number, number];
  visibleBottomInset: number;
  groundSinkY: number;
};

type FrameSpec = Omit<StoryBiomeDoorFrame, 'biome' | 'tier' | 'asset' | 'atlasSize' | 'displaySize' | 'groundSinkY'>;

const HERO_GATE_BY_BIOME: Record<StoryBiomeId, FrameSpec> = {
  greenhollow: { frame: [0, 0, 384, 512], visibleBottomInset: 28 },
  thornwood: { frame: [384, 0, 384, 512], visibleBottomInset: 26 },
  ironroot: { frame: [768, 0, 384, 512], visibleBottomInset: 23 },
  bonevault: { frame: [1152, 0, 384, 512], visibleBottomInset: 0 },
  emberdeep: { frame: [0, 512, 384, 512], visibleBottomInset: 95 },
  frostpeak: { frame: [384, 512, 384, 512], visibleBottomInset: 98 },
  sunscar: { frame: [768, 512, 384, 512], visibleBottomInset: 87 },
  skyglass: { frame: [1152, 512, 384, 512], visibleBottomInset: 82 }
};

const BIOME_ORDER: StoryBiomeId[] = ['greenhollow', 'thornwood', 'ironroot', 'bonevault', 'emberdeep', 'frostpeak', 'sunscar', 'skyglass'];

const BIOME_BY_THEME: Partial<Record<StoryWorldThemeId, StoryBiomeId>> = {
  village: 'greenhollow',
  forest: 'thornwood',
  mine: 'ironroot',
  crypt: 'bonevault',
  underworld: 'emberdeep',
  snow: 'frostpeak',
  desert: 'sunscar',
  ruins: 'skyglass'
};

function biomeFor(destination: StoryPortalDestination, currentTheme?: StoryWorldThemeId): StoryBiomeId | null {
  if (BIOME_ORDER.includes(destination as StoryBiomeId)) return destination as StoryBiomeId;
  return currentTheme ? BIOME_BY_THEME[currentTheme] ?? null : null;
}

function heroFrame(biome: StoryBiomeId, tier: Exclude<StoryBiomeDoorTier, 'normal'>): StoryBiomeDoorFrame {
  const index = BIOME_ORDER.indexOf(biome);
  if (tier === 'biome-gate') return {
    biome,
    tier,
    asset: STORY_BIOME_DOOR_ASSET,
    atlasSize: STORY_BIOME_DOOR_ATLAS_SIZE,
    displaySize: [4.4, 5.8],
    groundSinkY: STORY_BIOME_DOOR_GROUND_SINK_Y,
    ...HERO_GATE_BY_BIOME[biome]
  };
  const frame: [number, number, number, number] = [(index % 4) * 384, Math.floor(index / 4) * 512, 384, 512];
  return {
    biome,
    tier,
    asset: tier === 'depth' ? STORY_DEPTH_ENTRANCE_ASSET : STORY_SANCTUARY_ENTRANCE_ASSET,
    atlasSize: STORY_BIOME_DOOR_ATLAS_SIZE,
    frame,
    displaySize: [4.35, 5.75],
    visibleBottomInset: tier === 'depth' ? 28 : 22,
    groundSinkY: tier === 'depth' ? 0.24 : 0.2
  };
}

function normalVariant(portalId: string) {
  if (portalId.endsWith('-field-a')) return 1;
  if (portalId.endsWith('-field-b')) return 2;
  if (portalId.endsWith('-mastery')) return 0;
  return 0;
}

function normalFrame(biome: StoryBiomeId, portalId: string): StoryBiomeDoorFrame {
  const biomeIndex = BIOME_ORDER.indexOf(biome);
  const groupIndex = biomeIndex * 3 + normalVariant(portalId);
  const row = Math.floor(groupIndex / 6);
  const column = groupIndex % 6;
  return {
    biome,
    tier: 'normal',
    asset: STORY_NORMAL_BIOME_DOOR_ASSET,
    atlasSize: STORY_BIOME_DOOR_ATLAS_SIZE,
    frame: [column * 256, row * 256, 256, 256],
    displaySize: [4.6, 4.6],
    visibleBottomInset: 20,
    groundSinkY: 0.08
  };
}

/** Main Central Route gate retained for compatibility with map and atlas tooling. */
export function storyBiomeDoorFrame(destination: StoryPortalDestination, currentTheme?: StoryWorldThemeId): StoryBiomeDoorFrame | null {
  const biome = biomeFor(destination, currentTheme);
  return biome ? heroFrame(biome, 'biome-gate') : null;
}

/** Chooses entrance rarity from gameplay meaning, never from a random visual swap. */
export function storyPortalDoorFrame(portal: Pick<StoryPortalDefinition, 'id' | 'destination' | 'kind'>, currentTheme?: StoryWorldThemeId): StoryBiomeDoorFrame | null {
  const biome = biomeFor(portal.destination, currentTheme);
  if (!biome) return null;
  if (portal.id.startsWith('mount-sanctuary:')) return heroFrame(biome, 'sanctuary');
  if (portal.id.startsWith('depth-entry:') || portal.id.startsWith('depth-link:') || portal.id === 'depth-return-surface') return heroFrame(biome, 'depth');
  if (portal.id.startsWith('surface-map:')) return normalFrame(biome, portal.id);
  return portal.kind === 'adventure-gate' ? heroFrame(biome, 'biome-gate') : null;
}

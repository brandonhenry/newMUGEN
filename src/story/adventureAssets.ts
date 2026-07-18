import type { StoryAdventureAssetId, StoryWorldAssetId } from './types';

export const STORY_ADVENTURE_ASSET_PATHS: Record<StoryAdventureAssetId, string> = {
  'dawn-tree': '/story/adventure/dawnlike/Tree0.png',
  'dawn-wall': '/story/adventure/dawnlike/Wall.png',
  'dawn-ore': '/story/adventure/dawnlike/Ore0.png',
  'dawn-reptile': '/story/adventure/dawnlike/Reptile0.png',
  'dawn-slime': '/story/adventure/dawnlike/Slime0.png',
  'dawn-undead': '/story/adventure/dawnlike/Undead0.png',
  'dawn-demon': '/story/adventure/dawnlike/Demon0.png',
  'dawn-elemental': '/story/adventure/dawnlike/Elemental0.png',
  'crawler-buildings': '/story/adventure/pixel-crawler/building-props.png',
  'crawler-dungeon': '/story/adventure/pixel-crawler/Dungeon_Tiles.png',
  'crawler-tree': '/story/adventure/pixel-crawler/tree-large.png',
  'pixel-terrain': '/story/adventure/pixel-adventure/terrain.png',
  'pixel-trap': '/story/adventure/pixel-adventure/saw.png'
};

export const STORY_ENEMY_SPRITE_PATHS = {
  skeleton: '/story/adventure/pixel-crawler/skeleton-idle.png',
  'skeleton-mage': '/story/adventure/pixel-crawler/skeleton-mage-idle.png',
  orc: '/story/adventure/pixel-crawler/orc-idle.png',
  'orc-shaman': '/story/adventure/pixel-crawler/orc-shaman-idle.png',
  slime: '/story/adventure/dawnlike/Slime0.png',
  demon: '/story/adventure/dawnlike/Demon0.png',
  elemental: '/story/adventure/dawnlike/Elemental0.png',
  reptile: '/story/adventure/dawnlike/Reptile0.png'
} as const;

export const STORY_WORLD_ASSET_PATHS: Partial<Record<StoryWorldAssetId, string>> = {
  ...STORY_ADVENTURE_ASSET_PATHS,
  'city-back': '/story/hub/warped-city-2/city-back.png',
  'city-middle': '/story/hub/warped-city-2/city-middle.png',
  'city-front': '/story/hub/warped-city-2/city-front.png',
  'city-light': '/story/hub/warped-city-2/street-light.png',
  'city-banner-wide': '/story/hub/warped-city-2/banner-wide.png',
  'city-banner-tall': '/story/hub/warped-city-2/banner-tall.png'
};

export function worldPackAsset(relativePath: string): StoryWorldAssetId {
  return `world:${relativePath}`;
}

export function isStoryWorldAssetId(value: unknown): value is StoryWorldAssetId {
  return typeof value === 'string' && (
    Object.prototype.hasOwnProperty.call(STORY_WORLD_ASSET_PATHS, value) ||
    /^world:[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9.-]*)+\.png$/.test(value) ||
    /^exploration:[a-z0-9][a-z0-9-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)+\.png$/.test(value)
  );
}

export function storyWorldAssetPath(asset: StoryWorldAssetId): string {
  if (asset.startsWith('world:')) return `/story/worlds/${asset.slice('world:'.length)}`;
  if (asset.startsWith('exploration:')) return `/story/exploration/${asset.slice('exploration:'.length)}`;
  const path = STORY_WORLD_ASSET_PATHS[asset];
  if (!path) throw new Error(`Unknown story world asset: ${asset}`);
  return path;
}

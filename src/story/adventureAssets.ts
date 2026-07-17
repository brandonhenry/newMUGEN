import type { StoryAdventureAssetId } from './types';

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

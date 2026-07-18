import type { StoryPortalDestination, StoryWorldThemeId } from './types';

export const STORY_BIOME_DOOR_ASSET = '/story/exploration/doors/biome-doors.png';
export const STORY_BIOME_DOOR_ATLAS_SIZE = [1536, 1024] as const;

export type StoryBiomeDoorFrame = {
  biome: Exclude<StoryPortalDestination, 'central' | 'story' | 'friends' | 'online' | 'arcade' | 'versus' | 'training' | 'tournament' | 'characters' | 'avatarStudio' | 'options' | 'exit' | 'world-route'>;
  frame: [number, number, number, number];
};

const FRAME_BY_BIOME: Record<StoryBiomeDoorFrame['biome'], StoryBiomeDoorFrame['frame']> = {
  greenhollow: [0, 0, 384, 512],
  thornwood: [384, 0, 384, 512],
  ironroot: [768, 0, 384, 512],
  bonevault: [1152, 0, 384, 512],
  emberdeep: [0, 512, 384, 512],
  frostpeak: [384, 512, 384, 512],
  sunscar: [768, 512, 384, 512],
  skyglass: [1152, 512, 384, 512]
};

const BIOME_BY_THEME: Partial<Record<StoryWorldThemeId, StoryBiomeDoorFrame['biome']>> = {
  village: 'greenhollow',
  forest: 'thornwood',
  mine: 'ironroot',
  crypt: 'bonevault',
  underworld: 'emberdeep',
  snow: 'frostpeak',
  desert: 'sunscar',
  ruins: 'skyglass'
};

export function storyBiomeDoorFrame(destination: StoryPortalDestination, currentTheme?: StoryWorldThemeId): StoryBiomeDoorFrame | null {
  const biome = Object.prototype.hasOwnProperty.call(FRAME_BY_BIOME, destination)
    ? destination as StoryBiomeDoorFrame['biome']
    : currentTheme ? BIOME_BY_THEME[currentTheme] : undefined;
  return biome ? { biome, frame: FRAME_BY_BIOME[biome] } : null;
}

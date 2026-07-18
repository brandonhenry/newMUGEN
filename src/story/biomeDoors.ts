import type { StoryPortalDestination, StoryWorldThemeId } from './types';

export const STORY_BIOME_DOOR_ASSET = '/story/exploration/doors/biome-doors.png';
export const STORY_BIOME_DOOR_ATLAS_SIZE = [1536, 1024] as const;
export const STORY_BIOME_DOOR_GROUND_SINK_Y = 0.32;

export type StoryBiomeDoorFrame = {
  biome: Exclude<StoryPortalDestination, 'central' | 'story' | 'friends' | 'online' | 'arcade' | 'versus' | 'training' | 'tournament' | 'characters' | 'avatarStudio' | 'options' | 'exit' | 'world-route'>;
  frame: [number, number, number, number];
  visibleBottomInset: number;
};

const DOOR_BY_BIOME: Record<StoryBiomeDoorFrame['biome'], Omit<StoryBiomeDoorFrame, 'biome'>> = {
  greenhollow: { frame: [0, 0, 384, 512], visibleBottomInset: 28 },
  thornwood: { frame: [384, 0, 384, 512], visibleBottomInset: 26 },
  ironroot: { frame: [768, 0, 384, 512], visibleBottomInset: 23 },
  bonevault: { frame: [1152, 0, 384, 512], visibleBottomInset: 0 },
  emberdeep: { frame: [0, 512, 384, 512], visibleBottomInset: 95 },
  frostpeak: { frame: [384, 512, 384, 512], visibleBottomInset: 98 },
  sunscar: { frame: [768, 512, 384, 512], visibleBottomInset: 87 },
  skyglass: { frame: [1152, 512, 384, 512], visibleBottomInset: 82 }
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
  const biome = Object.prototype.hasOwnProperty.call(DOOR_BY_BIOME, destination)
    ? destination as StoryBiomeDoorFrame['biome']
    : currentTheme ? BIOME_BY_THEME[currentTheme] : undefined;
  return biome ? { biome, ...DOOR_BY_BIOME[biome] } : null;
}

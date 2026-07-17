import type { StoryPlatformDefinition } from './types';

export type StoryPlatformSurfacePlacement = {
  height: number;
  centerY: number;
};

export function storyPlatformSurfacePlacement(platform: StoryPlatformDefinition): StoryPlatformSurfacePlacement {
  const height = platform.oneWay ? 0.52 : 0.82;
  const colliderTop = platform.size[1] / 2;
  return { height, centerY: colliderTop - height / 2 };
}

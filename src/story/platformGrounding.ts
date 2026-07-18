import type { StoryPlatformDefinition, StoryWorldEnvironmentDefinition } from './types';

export type StoryPlatformSurfacePlacement = {
  height: number;
  centerY: number;
  surfaceInsetY: number;
};

export function storyPlatformSurfacePlacement(
  platform: StoryPlatformDefinition,
  surface?: Omit<NonNullable<StoryWorldEnvironmentDefinition['surface']>, 'frame' | 'atlasSize'> & {
    readonly frame: readonly [number, number, number, number];
    readonly atlasSize: readonly [number, number];
  }
): StoryPlatformSurfacePlacement {
  const height = platform.oneWay ? 0.52 : 0.82;
  const colliderTop = platform.size[1] / 2;
  const sourceHeight = surface?.frame[3] ?? 0;
  const insetPixels = Math.min(sourceHeight, Math.max(0, surface?.walkSurfaceInsetPixels ?? 0));
  const visualInset = sourceHeight > 0 ? height * insetPixels / sourceHeight : 0;
  return { height, centerY: colliderTop - height / 2 - visualInset, surfaceInsetY: visualInset };
}

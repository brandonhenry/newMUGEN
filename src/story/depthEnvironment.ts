import type { StoryGeneratedDepthZone, StoryWorldEnvironmentDefinition } from './types';

type DepthEnvironmentZone = Pick<StoryGeneratedDepthZone, 'kind' | 'underwater'>;

const CAVE_ZONE_KINDS = new Set<StoryGeneratedDepthZone['kind']>(['cave', 'mine', 'grotto']);

export function createStoryDepthEnvironment(
  surfaceEnvironment: StoryWorldEnvironmentDefinition | undefined,
  zone: DepthEnvironmentZone
): StoryWorldEnvironmentDefinition | undefined {
  if (!surfaceEnvironment) return undefined;

  if (zone.underwater) {
    return {
      ...surfaceEnvironment,
      background: '#052644',
      haze: '#0a5573',
      light: '#8ee8ff',
      ground: '#174d62',
      accent: '#65f4ff',
      particle: 'motes',
      layers: [
        { id: 'underwater-back', asset: 'exploration:underwater/background.png', depth: -16, y: 6, height: 24, opacity: 1, parallax: 0.04, color: '#ffffff', repeatEvery: 27 },
        { id: 'underwater-mid', asset: 'exploration:underwater/midground.png', depth: -8, y: 5, height: 22, opacity: 0.84, parallax: 0.25, color: '#ffffff', repeatEvery: 41 },
        ...surfaceEnvironment.layers.slice(-1)
      ],
      surface: { asset: 'exploration:underwater/tiles.png', frame: [0, 0, 32, 32], atlasSize: [480, 656], surfaceMaterial: 'water' }
    };
  }

  if (CAVE_ZONE_KINDS.has(zone.kind)) {
    return {
      ...surfaceEnvironment,
      background: '#080d18',
      haze: '#1d2738',
      // The first two pack layers are composed scenery. Later layers can be
      // sprite atlases intended for cropped props, not full-screen backdrops.
      layers: surfaceEnvironment.layers.slice(0, 2)
    };
  }

  return surfaceEnvironment;
}

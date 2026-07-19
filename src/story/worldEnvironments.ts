import { worldPackAsset } from './adventureAssets';
import type { StorySurfaceMaterial, StoryWorldBackdropLayerDefinition, StoryWorldEnvironmentDefinition, StoryWorldPropDefinition, StoryWorldThemeId } from './types';

type EnvironmentPalette = Omit<StoryWorldEnvironmentDefinition, 'layers'>;
type LayerInput = [file: string, depth: number, height: number, parallax: number, repeatEvery: number, opacity?: number, y?: number];
type PropInput = [file: string, pixels: [number, number], size: [number, number], y?: number, opacity?: number];

const PALETTES: Record<StoryWorldThemeId, EnvironmentPalette> = {
  city: { background: '#160721', haze: '#30143d', light: '#ff2f79', ground: '#25122f', accent: '#2ee6ff', particle: 'data' },
  arcade: { background: '#0b0618', haze: '#2f133d', light: '#ff9d35', ground: '#24112f', accent: '#ff5d69', particle: 'data' },
  versus: { background: '#07051b', haze: '#171c56', light: '#ff5d69', ground: '#191638', accent: '#2ee6ff', particle: 'motes' },
  online: { background: '#03101d', haze: '#0a3048', light: '#2ee6ff', ground: '#0c3041', accent: '#9b72ff', particle: 'data' },
  training: { background: '#031516', haze: '#0a3232', light: '#52e1a1', ground: '#103c39', accent: '#b9ffdd', particle: 'motes' },
  tournament: { background: '#120c17', haze: '#31233e', light: '#ffe071', ground: '#3b2a20', accent: '#fff1a6', particle: 'motes' },
  route: { background: '#121026', haze: '#28254b', light: '#ffe071', ground: '#263f46', accent: '#2ee6ff', particle: 'motes' },
  village: { background: '#321b36', haze: '#704459', light: '#ffd38a', ground: '#394d35', accent: '#d8ffb5', particle: 'motes' },
  forest: { background: '#061514', haze: '#153728', light: '#52e1a1', ground: '#20372a', accent: '#9effc9', particle: 'motes' },
  mine: { background: '#120a1a', haze: '#381b48', light: '#d9a066', ground: '#36202d', accent: '#ffd08d', particle: 'motes' },
  crypt: { background: '#100719', haze: '#361039', light: '#b8a8ff', ground: '#2e1f38', accent: '#ddd5ff', particle: 'motes' },
  underworld: { background: '#1a060d', haze: '#571116', light: '#ff6b45', ground: '#4b1b1b', accent: '#ffb06f', particle: 'embers' },
  snow: { background: '#edf6ff', haze: '#afcce7', light: '#8ee8ff', ground: '#d8f4ff', accent: '#ffffff', particle: 'snow' },
  desert: { background: '#ff674f', haze: '#f49a68', light: '#ffd166', ground: '#9a5e3c', accent: '#fff0a6', particle: 'sand' },
  ruins: { background: '#727cd7', haze: '#9da6ec', light: '#ff83d1', ground: '#51427a', accent: '#c8f7ff', particle: 'motes' }
};

const LAYERS: Record<StoryWorldThemeId, LayerInput[]> = {
  city: [
    ['warped-city/skyline-a.png', -15, 20, 0.06, 10.7], ['warped-city/skyline-b.png', -13, 20, 0.12, 10.7],
    ['warped-city/buildings.png', -10, 17, 0.22, 19.7], ['warped-city/near-buildings.png', -6, 14, 0.4, 33]
  ],
  arcade: [
    ['city-parallax/background.png', -16, 18, 0.05, 32], ['city-parallax/middle.png', -13, 18, 0.13, 32],
    ['stomper/back.png', -10, 18, 0.22, 9.6], ['stomper/back-glow.png', -8, 18, 0.3, 9.6, 0.74],
    ['city-parallax/foreground.png', -5.5, 18, 0.46, 32, 0.38]
  ],
  versus: [
    ['city-parallax/background.png', -17, 18, 0.04, 32], ['city-parallax/middle.png', -14, 18, 0.1, 32, 0.66],
    ['zone-202/back.png', -11, 18, 0.2, 7.7], ['zone-202/back-2.png', -8, 18, 0.34, 15.4],
    ['zone-202/tileset.png', -5, 18, 0.5, 7.7, 0.9]
  ],
  online: [
    ['ocean-view/night-back.png', -17, 18, 0.04, 25.2], ['space-background/stars.png', -15, 18, 0.08, 30.6],
    ['space-background/far-planets.png', -13, 18, 0.13, 30.6], ['space-background/big-planet.png', -11, 10, 0.18, 10.1, 0.9, 9],
    ['space-background/ring-planet.png', -10, 13, 0.22, 5.8, 0.82, 8], ['ocean-view/night-middle.png', -7, 18, 0.36, 10.8],
    ['ocean-view/night-clouds.png', -5, 18, 0.5, 24]
  ],
  training: [
    ['sci-fi-lab/back.png', -15, 18, 0.06, 24], ['sci-fi-lab/middle.png', -10, 18, 0.22, 24],
    ['sci-fi-lab/front.png', -5, 18, 0.48, 24]
  ],
  tournament: [
    ['tournament-gold/mountains.png', -15, 18, 0.06, 16.9], ['tournament-gold/back.png', -10, 18, 0.2, 4.25],
    ['tournament-cathedral/backgrounds.png', -7, 14, 0.34, 39, 0.9], ['tournament-gold/front.png', -4.5, 9, 0.5, 8.75, 0.62]
  ],
  route: [
    ['magical-road/back.png', -16, 19, 0.05, 8.9], ['warped-city/skyline-a.png', -14, 19, 0.1, 10.1, 0.8],
    ['warped-city/skyline-b.png', -12, 19, 0.16, 10.1, 0.86], ['warped-city/buildings.png', -9, 16, 0.28, 18.6],
    ['magical-road/middle.png', -6.5, 19, 0.4, 5.1], ['warped-city/near-buildings.png', -5, 12, 0.52, 28.3, 0.78]
  ],
  village: [
    ['gothic-town/background.png', -16, 18, 0.05, 24], ['gothic-town/background.png', -13, 18, 0.12, 24, 0.72],
    ['gothic-town/middleground.png', -9, 18, 0.27, 24], ['gothic-town/middleground.png', -5, 18, 0.5, 24, 0.58]
  ],
  forest: [
    ['thornwood/sky.png', -17, 19, 0.04, 7], ['thornwood/clouds.png', -14, 19, 0.1, 41.5, 0.72],
    ['thornwood/far-grounds.png', -10, 12, 0.24, 50.4], ['thornwood/sea.png', -6, 7, 0.46, 11.2, 0.56]
  ],
  mine: [
    ['warped-caves/background.png', -15, 18, 0.05, 24.5], ['warped-caves/middleground.png', -9, 18, 0.24, 27.8],
    ['warped-caves/walls.png', -4.5, 14, 0.5, 17.5]
  ],
  crypt: [
    ['gothic-cemetery/background.png', -16, 18, 0.04, 30.9], ['gothic-cemetery/mountains.png', -13, 18, 0.12, 19.3],
    ['gothic-cemetery/graveyard.png', -9, 10, 0.28, 31.2]
  ],
  underworld: [
    ['emberdeep/background.png', -15, 18, 0.05, 24.5], ['emberdeep/middleground.png', -9, 18, 0.24, 27.8],
    ['emberdeep/walls.png', -4.5, 14, 0.5, 17.5], ['moten-lava/lava-surface.png', -2.8, 1.6, 0.68, 3.2, 0.95, 0.15]
  ],
  snow: [
    ['sunnyland-winter/sky.png', -17, 18, 0.04, 29.3], ['sunnyland-winter/mountains.png', -14, 18, 0.1, 24.8],
    ['sunnyland-winter/mid-layer-a.png', -10, 18, 0.24, 45.4], ['sunnyland-winter/mid-layer-b.png', -5, 18, 0.48, 45.4]
  ],
  desert: [
    ['yeehaw/parallax-c.png', -16, 18, 0.05, 24], ['yeehaw/parallax-b.png', -11, 18, 0.2, 24],
    ['yeehaw/parallax-a.png', -6, 18, 0.46, 24]
  ],
  ruins: [
    ['skyglass/back.png', -15, 18, 0.06, 38.4], ['skyglass/middle.png', -10, 18, 0.24, 38.4],
    ['skyglass/near.png', -5, 18, 0.5, 38.4]
  ]
};

const PROPS: Record<StoryWorldThemeId, PropInput[]> = {
  city: [['warped-city/monitor.png', [21, 18], [2.3, 2]], ['warped-city/neon-banner.png', [19, 48], [1.5, 3.8]], ['warped-city/antenna.png', [22, 96], [1.4, 6]], ['warped-city/arrow.png', [16, 34], [1.4, 3]]],
  arcade: [['stomper/plant.png', [31, 33], [2.4, 2.5]], ['warped-city/monitor.png', [21, 18], [2.8, 2.4]], ['warped-city/neon-banner.png', [19, 48], [1.6, 4]], ['warped-city/arrow.png', [16, 34], [1.5, 3.2]]],
  versus: [['fort-illusion/flag.png', [16, 63], [1.4, 5.5]], ['fort-illusion/banner.png', [48, 59], [3.6, 4.4]], ['fort-illusion/door.png', [96, 80], [5.5, 4.6]], ['warped-city/monitor.png', [21, 18], [2.5, 2.2]]],
  online: [['ocean-view/night-tower.png', [16, 112], [1.4, 8]], ['ocean-view/night-dome.png', [80, 96], [5, 6]], ['warped-city/antenna.png', [22, 96], [1.4, 6]], ['warped-city/monitor.png', [21, 18], [2.5, 2.2]]],
  training: [['sci-fi-lab/tank-1.png', [48, 122], [3, 7.6]], ['sci-fi-lab/tank-2.png', [48, 122], [3, 7.6]], ['sci-fi-lab/tank-3.png', [48, 122], [3, 7.6]], ['sci-fi-lab/support.png', [16, 240], [1.1, 11]], ['warped-city/monitor.png', [21, 18], [2.5, 2.2]]],
  tournament: [['tournament-gold/flag.png', [16, 63], [1.4, 5.5]], ['tournament-gold/banner.png', [48, 59], [3.6, 4.4]], ['tournament-gold/door.png', [96, 80], [5.5, 4.6]], ['tournament-cathedral/column.png', [114, 190], [4.6, 7.7], undefined, 0.84]],
  route: [['magical-road/tree.png', [86, 181], [5.5, 11.6], undefined, 0.9], ['warped-city/monitor.png', [21, 18], [2.4, 2]], ['warped-city/antenna.png', [22, 96], [1.5, 6.5]], ['warped-city/arrow.png', [16, 34], [1.5, 3.2]], ['warped-city/neon-banner.png', [19, 48], [1.5, 3.8]]],
  village: [['gothic-town/house-a.png', [168, 183], [9, 9.8]], ['gothic-town/house-b.png', [210, 244], [9, 10.5]], ['gothic-town/house-c.png', [221, 183], [10, 8.3]], ['gothic-town/well.png', [65, 65], [3.4, 3.4]], ['gothic-town/wagon.png', [93, 75], [4.5, 3.6]], ['gothic-town/street-lamp.png', [35, 108], [1.5, 4.6]]],
  forest: [['tall-forest/plant.png', [42, 27], [3.8, 2.5]], ['tall-forest/rock.png', [32, 32], [2.8, 2.8]], ['magical-road/tree.png', [86, 181], [6, 12], undefined, 0.9], ['gothic-cemetery/tree.png', [166, 117], [8, 5.6], undefined, 0.84]],
  mine: [['warped-caves/gate.png', [48, 48], [5.2, 5.2]], ['warped-caves/stalactite.png', [38, 53], [3.2, 4.5], 7], ['warped-caves/stone-head.png', [55, 51], [4, 3.7]]],
  crypt: [['gothic-cemetery/tree.png', [166, 117], [9, 6.4]], ['gothic-cemetery/statue.png', [63, 75], [3.6, 4.3]], ['gothic-cemetery/stone.png', [27, 33], [2.2, 2.7]], ['gothic-church/column.png', [114, 190], [5.2, 8.7]]],
  underworld: [['emberdeep/gate.png', [48, 48], [5.2, 5.2]], ['emberdeep/stone-head.png', [55, 51], [4, 3.7]], ['emberdeep/stalactite.png', [38, 53], [3.2, 4.5], 7], ['rocky-pass/crystal-1.png', [25, 25], [2.2, 2.2]]],
  snow: [['sunnyland-winter/house.png', [170, 126], [8.5, 6.3]], ['sunnyland-winter/pine-snow.png', [47, 99], [3.4, 7.2]], ['sunnyland-winter/tall-tree.png', [89, 172], [5.2, 10]], ['sunnyland-winter/fence.png', [96, 37], [5.2, 2]]],
  desert: [['yeehaw/frontier-facade.png', [192, 176], [9, 8.25]], ['yeehaw/cactus.png', [48, 64], [3, 4]], ['yeehaw/sun.png', [192, 64], [6, 2]], ['yeehaw/wanted-poster.png', [16, 32], [1.2, 2.4]], ['yeehaw/bottle.png', [16, 32], [1.1, 2.2]], ['yeehaw/tin-can.png', [16, 32], [1.1, 2.2]]],
  ruins: [['skyglass/crystal-1.png', [25, 25], [2.4, 2.4]], ['skyglass/crystal-2.png', [26, 20], [2.8, 2.2]], ['skyglass/crystal-1.png', [25, 25], [3.6, 3.6]], ['skyglass/crystal-2.png', [26, 20], [4.2, 3.3], undefined, 0.78]]
};

type SurfaceInput = [string, [number, number, number, number], [number, number], walkSurfaceInsetPixels?: number];

const SURFACES: Record<StoryWorldThemeId, SurfaceInput> = {
  city: ['warped-city/tileset.png', [48, 16, 32, 16], [384, 256]],
  arcade: ['stomper/brick.png', [0, 0, 16, 16], [16, 16]],
  versus: ['zone-202/tileset.png', [0, 0, 48, 16], [48, 112]],
  online: ['ocean-view/tile.png', [48, 16, 32, 16], [176, 128]],
  training: ['warped-city/tileset.png', [48, 16, 32, 16], [384, 256]],
  tournament: ['tournament-gold/tileset.png', [0, 16, 32, 16], [208, 128]],
  route: ['magical-road/tileset.png', [32, 16, 32, 16], [128, 96]],
  village: ['gothic-town/tileset.png', [48, 16, 32, 16], [592, 192], 1],
  forest: ['thornwood/tileset.png', [16, 16, 32, 16], [928, 320], 1],
  mine: ['warped-caves/tileset.png', [32, 16, 32, 16], [384, 192]],
  crypt: ['gothic-cemetery/tileset.png', [336, 16, 32, 16], [448, 160]],
  underworld: ['emberdeep/tileset.png', [32, 16, 32, 16], [384, 192]],
  snow: ['sunnyland-winter/tileset.png', [48, 16, 32, 16], [320, 240], 1],
  desert: ['yeehaw/tileset.png', [0, 0, 32, 16], [256, 256]],
  ruins: ['skyglass/tileset.png', [48, 16, 32, 16], [224, 128]]
};

const SURFACE_MATERIALS: Record<StoryWorldThemeId, StorySurfaceMaterial> = {
  city: 'metal', arcade: 'stone', versus: 'stone', online: 'metal', training: 'metal', tournament: 'stone',
  route: 'grass', village: 'grass', forest: 'grass', mine: 'stone', crypt: 'stone', underworld: 'stone',
  snow: 'snow', desert: 'sand', ruins: 'crystal'
};

/**
 * Authored neighboring cap pieces from each biome atlas. The renderer selects
 * among these per platform, which keeps one collision language while avoiding
 * the previous single-tile wallpaper effect.
 */
const SURFACE_VARIANT_FRAMES: Partial<Record<StoryWorldThemeId, Array<[number, number, number, number]>>> = {
  village: [[16, 16, 32, 16], [48, 16, 32, 16], [80, 16, 32, 16]],
  forest: [[16, 16, 32, 16], [48, 16, 32, 16], [80, 16, 32, 16]],
  mine: [[0, 16, 32, 16], [32, 16, 32, 16], [64, 16, 32, 16]],
  crypt: [[304, 16, 32, 16], [336, 16, 32, 16], [368, 16, 32, 16]],
  underworld: [[0, 16, 32, 16], [32, 16, 32, 16], [64, 16, 32, 16]],
  snow: [[16, 16, 32, 16], [48, 16, 32, 16], [80, 16, 32, 16]],
  desert: [[0, 0, 32, 16], [32, 0, 32, 16], [64, 0, 32, 16]],
  ruins: [[16, 16, 32, 16], [48, 16, 32, 16], [80, 16, 32, 16]]
};

function makeLayer(theme: StoryWorldThemeId, input: LayerInput, index: number): StoryWorldBackdropLayerDefinition {
  const [file, depth, height, parallax, repeatEvery, opacity = 1, y = height / 2 - 0.5] = input;
  return { id: `${theme}-art-${index + 1}`, asset: worldPackAsset(file), depth, y, height, opacity, parallax, color: '#ffffff', repeatEvery };
}

const BACKUP_ENVIRONMENT_ART: Record<string, { layers: LayerInput[]; surface: SurfaceInput }> = {
  'greenhollow-backup-kings': {
    layers: [['kings-pigs/terrain.png', -14, 18, 0.07, 26.3, 0.42], ['kings-pigs/decorations.png', -7, 14, 0.31, 16.3, 0.72]],
    surface: ['kings-pigs/terrain.png', [32, 32, 32, 32], [608, 416]]
  },
  'thornwood-backup-pixel': {
    layers: [['pixel-thornwood/background-purple.png', -15, 18, 0.05, 18], ['pixel-thornwood/terrain.png', -7, 12, 0.34, 36, 0.5]],
    surface: ['pixel-thornwood/terrain.png', [96, 0, 16, 16], [352, 176], 1]
  },
  'ironroot-backup-grafx': {
    layers: [['grafx-cave/background.png', -15, 18, 0.05, 24.9], ['grafx-cave/scaffolding.png', -7, 13, 0.32, 27.1, 0.58]],
    surface: ['grafx-cave/gray-terrain.png', [160, 96, 16, 16], [528, 352]]
  },
  'bonevault-backup-moon': {
    layers: [['moon-graveyard/background-0.png', -16, 18, 0.04, 33.2], ['moon-graveyard/background-1.png', -12, 18, 0.12, 33.2], ['moon-graveyard/grass-1.png', -6, 18, 0.42, 15.2, 0.72]],
    surface: ['moon-graveyard/tiles.png', [32, 0, 32, 32], [352, 384]]
  },
  'emberdeep-backup-grafx': {
    layers: [['grafx-ember/background.png', -15, 18, 0.05, 24.9], ['grafx-ember/scaffolding.png', -7, 13, 0.32, 27.1, 0.62], ['seasonal/lava.png', -3, 1.7, 0.66, 2.2, 0.96, 0.2]],
    surface: ['grafx-ember/gray-terrain.png', [160, 96, 16, 16], [528, 352]]
  },
  'frostpeak-backup-seasonal': {
    layers: [['seasonal/snow-big-mountain.png', -16, 18, 0.04, 28], ['seasonal/snow-small-mountains.png', -11, 18, 0.16, 28], ['seasonal/snow-foreground.png', -6, 13, 0.4, 28, 0.78]],
    surface: ['seasonal/snow-terrain.png', [48, 16, 16, 16], [272, 160], 1]
  },
  'sunscar-backup-pixel': {
    layers: [['pixel-sunscar/background-yellow.png', -15, 18, 0.05, 18], ['pixel-sunscar/terrain.png', -7, 12, 0.34, 36, 0.46]],
    surface: ['pixel-sunscar/terrain.png', [96, 64, 16, 16], [352, 176], 1]
  },
  'skyglass-backup-space': {
    layers: [['space-skyglass/tileset.png', -15, 18, 0.05, 19.6, 0.46], ['space-skyglass/tileset.png', -7, 13, 0.32, 14.2, 0.62]],
    surface: ['space-skyglass/tileset.png', [0, 48, 16, 16], [192, 176]]
  }
};

export function createStoryWorldEnvironment(theme: StoryWorldThemeId): StoryWorldEnvironmentDefinition {
  const [file, frame, atlasSize, walkSurfaceInsetPixels] = SURFACES[theme];
  return {
    ...PALETTES[theme],
    layers: LAYERS[theme].map((input, index) => makeLayer(theme, input, index)),
    surface: {
      asset: worldPackAsset(file),
      frame,
      atlasSize,
      surfaceMaterial: SURFACE_MATERIALS[theme],
      ...(walkSurfaceInsetPixels ? { walkSurfaceInsetPixels } : {}),
      ...(SURFACE_VARIANT_FRAMES[theme] ? {
        variants: SURFACE_VARIANT_FRAMES[theme]!.map((variantFrame, index) => ({
          id: `${theme}-terrain-${index + 1}`,
          frame: variantFrame,
          surfaceMaterial: SURFACE_MATERIALS[theme],
          ...(walkSurfaceInsetPixels ? { walkSurfaceInsetPixels } : {})
        }))
      } : {})
    }
  };
}

export function createStoryBiomeVisualSetEnvironment(theme: StoryWorldThemeId, visualSetId: string | undefined): StoryWorldEnvironmentDefinition {
  const art = visualSetId ? BACKUP_ENVIRONMENT_ART[visualSetId] : undefined;
  if (!art) return createStoryWorldEnvironment(theme);
  const [file, frame, atlasSize, walkSurfaceInsetPixels] = art.surface;
  return {
    ...PALETTES[theme],
    layers: art.layers.map((input, index) => {
      const [layerFile, depth, height, parallax, repeatEvery, opacity = 1, y = height / 2 - 0.5] = input;
      return { id: `${visualSetId}-art-${index + 1}`, asset: worldPackAsset(layerFile), depth, y, height, opacity, parallax, color: '#ffffff', repeatEvery };
    }),
    surface: { asset: worldPackAsset(file), frame, atlasSize, surfaceMaterial: SURFACE_MATERIALS[theme], ...(walkSurfaceInsetPixels ? { walkSurfaceInsetPixels } : {}) }
  };
}

export function createStoryWorldProps(theme: StoryWorldThemeId, minX: number, maxX: number): StoryWorldPropDefinition[] {
  const templates = PROPS[theme];
  const width = maxX - minX;
  const count = Math.min(48, Math.max(9, Math.ceil(width / 14)));
  const positions = Array.from({ length: count }, (_, index) => {
    const ratio = count === 1 ? 0.5 : 0.02 + (index / (count - 1)) * 0.96;
    const stagger = ((index * 7 + theme.length) % 5 - 2) * Math.min(0.45, width / 420);
    return minX + width * ratio + stagger;
  });
  return positions.map((x, index) => {
    const [file, pixels, size, authoredY, authoredOpacity] = templates[index % templates.length];
    const depthTier = index % 4;
    const scale = [0.86, 1, 0.92, 1.08][depthTier];
    const scaledSize: [number, number] = [size[0] * scale, size[1] * scale];
    return {
      id: `${theme}-pack-prop-${index + 1}`,
      asset: worldPackAsset(file),
      frame: [0, 0, pixels[0], pixels[1]],
      atlasSize: pixels,
      position: [x, authoredY ?? scaledSize[1] / 2 - 0.08, -2.18 - depthTier * 0.16],
      size: scaledSize,
      mirrored: index % 4 === 3 || index % 7 === 5,
      opacity: authoredOpacity ?? [0.98, 0.94, 0.9, 0.86][depthTier]
    };
  });
}

export const STORY_WORLD_ENVIRONMENTS = Object.fromEntries(
  (Object.keys(PALETTES) as StoryWorldThemeId[]).map((theme) => [theme, createStoryWorldEnvironment(theme)])
) as Record<StoryWorldThemeId, StoryWorldEnvironmentDefinition>;

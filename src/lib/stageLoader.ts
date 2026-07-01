import { stages as fallbackStages } from '../data/stages';
import type { StageDefinition, StageFloorEffects } from '../types';

export type StageLoadResult = {
  stages: StageDefinition[];
  warnings: Record<string, string[]>;
};

export async function loadStageRoster(): Promise<StageLoadResult> {
  try {
    const index = (await fetch('/stages/index.json').then((response) => response.json())) as {
      stages?: string[];
    };
    const ids = Array.isArray(index.stages) ? index.stages : [];
    const loaded = (
      await Promise.all(
        ids.map(async (id) => {
          try {
            const response = await fetch(`/stages/${id}/stage.json`);
            if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return null;
            return await response.json() as StageDefinition;
          } catch {
            return null;
          }
        })
      )
    ).filter((stage): stage is StageDefinition => Boolean(stage));
    const normalizedLoaded = loaded.map(normalizeStage);
    const fallback = fallbackStages
      .map(normalizeStage)
      .filter((stage) => !normalizedLoaded.some((loadedStage) => loadedStage.id === stage.id));
    const stages = normalizedLoaded.length > 0 ? [...normalizedLoaded, ...fallback] : fallback;
    return {
      stages,
      warnings: Object.fromEntries(stages.map((stage) => [stage.id, validateStage(stage)]))
    };
  } catch {
    const stages = fallbackStages.map(normalizeStage);
    return {
      stages,
      warnings: Object.fromEntries(stages.map((stage) => [stage.id, validateStage(stage)]))
    };
  }
}

export function normalizeStage(stage: StageDefinition): StageDefinition {
  return {
    ...stage,
    renderMode: stage.renderMode ?? 'procedural',
    hidden: stage.hidden === true,
    floor: stage.floor ?? '#07182c',
    floorAssetId: stage.floorAssetId,
    floorTexturePath: stage.floorTexturePath,
    floorTextureRepeat: Array.isArray(stage.floorTextureRepeat)
      ? [finiteOr(stage.floorTextureRepeat[0], 24), finiteOr(stage.floorTextureRepeat[1], 24)]
      : undefined,
    floorSounds: stage.floorSounds && typeof stage.floorSounds === 'object' ? stage.floorSounds : undefined,
    floorEffects: normalizeFloorEffects(stage.floorEffects),
    rail: stage.rail ?? '#2ee6ff',
    light: stage.light ?? '#dbe8ff',
    skyboxAssetId: stage.skyboxAssetId,
    skyboxPath: stage.skyboxPath,
    world: stage.world
      ? {
          width: finiteOr(stage.world.width, 96),
          depth: finiteOr(stage.world.depth, 42),
          floorY: finiteOr(stage.world.floorY, -0.045),
          backgroundColor: stage.world.backgroundColor ?? '#101114'
        }
      : undefined,
    backgroundLayers: Array.isArray(stage.backgroundLayers) ? stage.backgroundLayers : [],
    props: Array.isArray(stage.props) ? stage.props : []
  };
}

function validateStage(stage: StageDefinition) {
  const warnings: string[] = [];
  if (!stage.id) warnings.push('Missing id.');
  if (!stage.name) warnings.push('Missing name.');
  if (stage.renderMode === 'spriteCutout') {
    if (!stage.sourcePath) warnings.push('Sprite-cutout stage is missing sourcePath.');
    if (!stage.backgroundLayers?.length && !stage.props?.length) warnings.push('Sprite-cutout stage has no visual layers or props.');
  }
  return warnings;
}

function finiteOr(value: unknown, fallback: number) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function normalizeFloorEffects(value: unknown): StageFloorEffects | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as StageFloorEffects;
  const grass = source.grass;
  const effects: StageFloorEffects = {};
  if (grass && typeof grass === 'object') {
    effects.grass = {
      enabled: grass.enabled === true,
      density: clamp(finiteOr(grass.density, 0.45), 0.05, 1),
      height: clamp(finiteOr(grass.height, 0.28), 0.04, 1.8),
      patchWidth: clamp(finiteOr(grass.patchWidth, 220), 4, 520),
      patchDepth: clamp(finiteOr(grass.patchDepth, 220), 4, 520),
      windStrength: clamp(finiteOr(grass.windStrength, 0.14), 0, 0.8),
      windSpeed: clamp(finiteOr(grass.windSpeed, 1.1), 0, 4),
      colorBottom: typeof grass.colorBottom === 'string' ? grass.colorBottom : '#174d25',
      colorTop: typeof grass.colorTop === 'string' ? grass.colorTop : '#7bd34d'
    };
  }
  ([
    'dust',
    'footsteps',
    'impact',
    'petals',
    'snow',
    'rainPuddles',
    'ripples',
    'energy',
    'fog',
    'heat',
    'glowTrails',
    'windStreaks',
    'cherryBurst',
    'tileShimmer',
    'debris'
  ] as const).forEach((key) => {
    const effect = source[key];
    if (effect && typeof effect === 'object') effects[key] = normalizeSimpleFloorEffect(effect);
  });
  return Object.keys(effects).length ? effects : undefined;
}

function normalizeSimpleFloorEffect(value: unknown) {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    enabled: source.enabled === true,
    intensity: clamp(finiteOr(source.intensity, 0.6), 0, 2),
    density: clamp(finiteOr(source.density, 0.45), 0, 1),
    size: clamp(finiteOr(source.size, 1), 0.05, 12),
    speed: clamp(finiteOr(source.speed, 1), 0, 6),
    opacity: clamp(finiteOr(source.opacity, 0.55), 0, 1),
    radius: clamp(finiteOr(source.radius, 1.4), 0.05, 24),
    strength: clamp(finiteOr(source.strength, 0.35), 0, 2),
    lifetime: clamp(finiteOr(source.lifetime, 900), 100, 6000),
    amount: clamp(finiteOr(source.amount, 80), 0, 800),
    windStrength: clamp(finiteOr(source.windStrength, 0.35), 0, 2),
    fallSpeed: clamp(finiteOr(source.fallSpeed, 0.8), 0, 4),
    pulseSpeed: clamp(finiteOr(source.pulseSpeed, 1.2), 0, 6),
    color: typeof source.color === 'string' ? source.color : undefined,
    colorA: typeof source.colorA === 'string' ? source.colorA : undefined,
    colorB: typeof source.colorB === 'string' ? source.colorB : undefined
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

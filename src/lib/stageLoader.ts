import { stages as fallbackStages } from '../data/stages';
import type { StageDefinition, StageFloorEffects, StageModelDefinition, StagePropDefinition, Vec3Tuple } from '../types';
import { inferStageVisualStylePreset, normalizeStageVisualStyle } from './stageVisualStyle';

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
  const normalized: StageDefinition = {
    ...stage,
    renderMode: stage.renderMode ?? 'procedural',
    hidden: stage.hidden === true,
    floor: stage.floor ?? '#07182c',
    floorAssetId: stage.floorAssetId,
    floorTexturePath: stage.floorTexturePath,
    floorTextureRepeat: Array.isArray(stage.floorTextureRepeat)
      ? [finiteOr(stage.floorTextureRepeat[0], 24), finiteOr(stage.floorTextureRepeat[1], 24)]
      : undefined,
    safePlatform: normalizeSafePlatform(stage.safePlatform),
    floorSounds: stage.floorSounds && typeof stage.floorSounds === 'object' ? stage.floorSounds : undefined,
    floorEffects: normalizeFloorEffects(stage.floorEffects),
    rail: stage.rail ?? '#2ee6ff',
    light: stage.light ?? '#dbe8ff',
    skyboxAssetId: stage.skyboxAssetId,
    skyboxPath: stage.skyboxPath,
    fightPlane: normalizeFightPlane(stage.fightPlane),
    spawns: normalizeSpawns(stage.spawns),
    collision: normalizeCollision(stage.collision),
    model: normalizeStageModel(stage.model),
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
  const visualStylePreset = inferStageVisualStylePreset(normalized);
  return {
    ...normalized,
    visualStylePreset,
    visualStyle: normalizeStageVisualStyle({ ...normalized, visualStylePreset })
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
  if (stage.renderMode === 'model' && !stage.model?.path) warnings.push('Model stage is missing model.path.');
  return warnings;
}

function normalizeSafePlatform(value: StageDefinition['safePlatform']): StageDefinition['safePlatform'] {
  if (!value || typeof value !== 'object') return undefined;
  return {
    enabled: value.enabled !== false,
    shape: value.shape === 'octagon' ? value.shape : 'octagon',
    texturePath: typeof value.texturePath === 'string' ? value.texturePath : undefined,
    textureRepeat: Array.isArray(value.textureRepeat)
      ? [finiteOr(value.textureRepeat[0], 6), finiteOr(value.textureRepeat[1], 6)]
      : undefined,
    radius: clamp(finiteOr(value.radius, 38), 4, 120),
    height: clamp(finiteOr(value.height, 0.16), 0.02, 2),
    yOffset: clamp(finiteOr(value.yOffset, 0.06), -0.5, 2),
    color: typeof value.color === 'string' ? value.color : undefined,
    edgeColor: typeof value.edgeColor === 'string' ? value.edgeColor : undefined,
    edgeOpacity: clamp(finiteOr(value.edgeOpacity, 0.92), 0, 1)
  };
}

function finiteOr(value: unknown, fallback: number) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function normalizeStageModel(value: unknown): StageModelDefinition | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as StageModelDefinition;
  const path = typeof source.path === 'string' && source.path.trim()
    ? source.path
    : typeof source.url === 'string' && source.url.trim()
      ? source.url
      : '';
  if (!path) return undefined;
  return {
    path,
    url: typeof source.url === 'string' && source.url.trim() ? source.url : path,
    format: source.format === 'gltf' || source.format === 'fbx' ? source.format : 'glb',
    position: normalizeVec3(source.position, [0, 0, 0]),
    scale: normalizeVec3(source.scale, [1, 1, 1]),
    rotation: normalizeVec3(source.rotation, [0, 0, 0]),
    focus: normalizeVec3(source.focus, [0, 0.8, 0]),
    bounds: source.bounds && typeof source.bounds === 'object'
      ? {
          center: normalizeVec3(source.bounds.center, [0, 0, 0]),
          size: normalizeVec3(source.bounds.size, [1, 1, 1]),
          radius: clamp(finiteOr(source.bounds.radius, 0), 0, 1000)
        }
      : undefined,
    castShadow: source.castShadow !== false,
    receiveShadow: source.receiveShadow !== false,
    decorativeProps: Array.isArray(source.decorativeProps) ? source.decorativeProps.filter(isStagePropDefinition) : []
  };
}

function normalizeFightPlane(value: unknown): StageDefinition['fightPlane'] {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as NonNullable<StageDefinition['fightPlane']>;
  return {
    center: normalizeVec3(source.center, [0, 0, 0]),
    width: clamp(finiteOr(source.width, 24), 4, 220),
    depth: clamp(finiteOr(source.depth, 16), 4, 220),
    y: finiteOr(source.y, 0)
  };
}

function normalizeSpawns(value: unknown): StageDefinition['spawns'] {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as NonNullable<StageDefinition['spawns']>;
  return {
    p1: normalizeVec3(source.p1, [-2.2, 0, 0]),
    p2: normalizeVec3(source.p2, [2.2, 0, 0])
  };
}

function normalizeCollision(value: unknown): StageDefinition['collision'] {
  if (!value || typeof value !== 'object') return undefined;
  const mode = (value as NonNullable<StageDefinition['collision']>).mode;
  return { mode: mode === 'mesh' || mode === 'none' ? mode : 'box' };
}

function normalizeVec3(value: unknown, fallback: Vec3Tuple): Vec3Tuple {
  if (!Array.isArray(value) || value.length < 3) return fallback;
  return [finiteOr(value[0], fallback[0]), finiteOr(value[1], fallback[1]), finiteOr(value[2], fallback[2])];
}

function isStagePropDefinition(value: unknown): value is StagePropDefinition {
  return Boolean(value && typeof value === 'object' && typeof (value as StagePropDefinition).id === 'string' && typeof (value as StagePropDefinition).imagePath === 'string');
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
      bladeCount: clamp(finiteOr(grass.bladeCount, 0), 0, 120000),
      bladeWidth: clamp(finiteOr(grass.bladeWidth, 0.075), 0.01, 0.4),
      segments: Math.round(clamp(finiteOr(grass.segments, 5), 2, 10)),
      coverageScale: clamp(finiteOr(grass.coverageScale, 1.08), 0.2, 2),
      colorVariation: clamp(finiteOr(grass.colorVariation, 0.18), 0, 1),
      windDirection: Array.isArray(grass.windDirection) ? [finiteOr(grass.windDirection[0], 1), finiteOr(grass.windDirection[1], 0.35)] : [1, 0.35],
      windNoiseScale: clamp(finiteOr(grass.windNoiseScale, 0.58), 0.02, 4),
      quality: normalizeQuality(grass.quality, 'medium'),
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
    'rain',
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
    maxParticles: Math.round(clamp(finiteOr(source.maxParticles, 0), 0, 5000)),
    maxDecals: Math.round(clamp(finiteOr(source.maxDecals, 0), 0, 256)),
    spread: clamp(finiteOr(source.spread, 1), 0, 4),
    coverageScale: clamp(finiteOr(source.coverageScale, 1.08), 0.2, 2),
    decay: clamp(finiteOr(source.decay, 0.86), 0, 1),
    atlasPath: typeof source.atlasPath === 'string' ? source.atlasPath : undefined,
    frameCount: Math.round(clamp(finiteOr(source.frameCount, 1), 1, 64)),
    reactive: typeof source.reactive === 'boolean' ? source.reactive : undefined,
    quality: normalizeQuality(source.quality),
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

function normalizeQuality(value: unknown, fallback?: 'low' | 'medium' | 'high') {
  return value === 'low' || value === 'medium' || value === 'high' ? value : fallback;
}

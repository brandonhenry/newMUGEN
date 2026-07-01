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
  if (!grass || typeof grass !== 'object') return undefined;
  return {
    grass: {
      enabled: grass.enabled === true,
      density: clamp(finiteOr(grass.density, 0.45), 0.05, 1),
      height: clamp(finiteOr(grass.height, 0.48), 0.08, 1.8),
      patchWidth: clamp(finiteOr(grass.patchWidth, 32), 4, 220),
      patchDepth: clamp(finiteOr(grass.patchDepth, 16), 4, 220),
      windStrength: clamp(finiteOr(grass.windStrength, 0.14), 0, 0.8),
      windSpeed: clamp(finiteOr(grass.windSpeed, 1.1), 0, 4),
      colorBottom: typeof grass.colorBottom === 'string' ? grass.colorBottom : '#174d25',
      colorTop: typeof grass.colorTop === 'string' ? grass.colorTop : '#7bd34d'
    }
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

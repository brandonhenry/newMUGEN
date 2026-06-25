import { stages as fallbackStages } from '../data/stages';
import type { StageDefinition } from '../types';

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
    const loaded = await Promise.all(
      ids.map((id) =>
        fetch(`/stages/${id}/stage.json`).then((response) => response.json() as Promise<StageDefinition>)
      )
    );
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
    floor: stage.floor ?? '#07182c',
    rail: stage.rail ?? '#2ee6ff',
    light: stage.light ?? '#dbe8ff',
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

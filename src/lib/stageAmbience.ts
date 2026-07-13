import rawStageAmbiencePresets from '../data/stageAmbiencePresets.json';
import type { StageAmbiencePresetDefinition, StageAmbiencePresetId, StageDefinition } from '../types';

const rawPresetCatalog: Record<StageAmbiencePresetId, unknown> = rawStageAmbiencePresets;

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? Number(value) : fallback));
}

function isAmbienceAssetPath(value: unknown): value is string {
  return typeof value === 'string' && /^\/sounds\/stage-ambience\/[a-z0-9-]+\.mp3$/.test(value);
}

export function normalizeStageAmbiencePresetDefinition(value: unknown): StageAmbiencePresetDefinition | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const loops = (Array.isArray(source.loops) ? source.loops : [])
    .filter((loop): loop is Record<string, unknown> => Boolean(loop && typeof loop === 'object'))
    .map((loop) => ({
      path: loop.path,
      volume: clampNumber(loop.volume, 0, 1, 0)
    }))
    .filter((loop): loop is { path: string; volume: number } => isAmbienceAssetPath(loop.path));
  if (loops.length === 0) return undefined;
  const cues = (Array.isArray(source.cues) ? source.cues : [])
    .filter((cue): cue is Record<string, unknown> => Boolean(cue && typeof cue === 'object'))
    .map((cue) => {
      const paths = (Array.isArray(cue.paths) ? cue.paths : []).filter(isAmbienceAssetPath);
      const minDelaySeconds = clampNumber(cue.minDelaySeconds, 5, 300, 30);
      return {
        paths,
        volume: clampNumber(cue.volume, 0, 1, 0),
        minDelaySeconds,
        maxDelaySeconds: clampNumber(cue.maxDelaySeconds, minDelaySeconds, 300, minDelaySeconds)
      };
    })
    .filter((cue) => cue.paths.length > 0);
  return cues.length > 0 ? { loops, cues } : { loops };
}

export const stageAmbiencePresets = Object.fromEntries(
  Object.entries(rawPresetCatalog).map(([id, preset]) => {
    const normalized = normalizeStageAmbiencePresetDefinition(preset);
    if (!normalized) throw new Error(`Invalid stage ambience preset: ${id}`);
    return [id, normalized];
  })
) as Record<StageAmbiencePresetId, StageAmbiencePresetDefinition>;

const presetIds = new Set<string>(Object.keys(stageAmbiencePresets));

export function isStageAmbiencePresetId(value: unknown): value is StageAmbiencePresetId {
  return typeof value === 'string' && presetIds.has(value);
}

export function resolveStageAmbience(stage: Pick<StageDefinition, 'ambiencePreset'> | null | undefined) {
  if (!stage?.ambiencePreset) return undefined;
  return stageAmbiencePresets[stage.ambiencePreset];
}

export function stageAmbienceAssetPaths() {
  return [...new Set(Object.values(stageAmbiencePresets).flatMap((preset) => [
    ...preset.loops.map((loop) => loop.path),
    ...(preset.cues ?? []).flatMap((cue) => cue.paths)
  ]))];
}

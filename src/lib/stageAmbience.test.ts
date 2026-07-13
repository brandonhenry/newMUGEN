import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { stages as fallbackStages } from '../data/stages';
import type { StageDefinition } from '../types';
import { isStageAmbiencePresetId, normalizeStageAmbiencePresetDefinition, resolveStageAmbience, stageAmbienceAssetPaths, stageAmbiencePresets } from './stageAmbience';

describe('stage ambience', () => {
  it('resolves known presets and rejects unknown values', () => {
    expect(isStageAmbiencePresetId('clean-tech')).toBe(true);
    expect(isStageAmbiencePresetId('missing-preset')).toBe(false);
    expect(resolveStageAmbience({ ambiencePreset: 'clean-tech' })).toBe(stageAmbiencePresets['clean-tech']);
    expect(resolveStageAmbience({})).toBeUndefined();
  });

  it('drops unsafe paths and clamps preset volumes and cue delays', () => {
    expect(normalizeStageAmbiencePresetDefinition({
      loops: [
        { path: '/sounds/stage-ambience/wind-calm.mp3', volume: 4 },
        { path: 'https://example.com/tracker.mp3', volume: 0.5 }
      ],
      cues: [{
        paths: ['/sounds/stage-ambience/door-wood-open.mp3', '/other/cue.mp3'],
        volume: -2,
        minDelaySeconds: -4,
        maxDelaySeconds: 2
      }]
    })).toEqual({
      loops: [{ path: '/sounds/stage-ambience/wind-calm.mp3', volume: 1 }],
      cues: [{
        paths: ['/sounds/stage-ambience/door-wood-open.mp3'],
        volume: 0,
        minDelaySeconds: 5,
        maxDelaySeconds: 5
      }]
    });
  });

  it('assigns valid matching presets to every indexed and fallback stage', () => {
    const root = process.cwd();
    const index = JSON.parse(readFileSync(path.join(root, 'public/stages/index.json'), 'utf8')) as { stages: string[] };
    expect(index.stages).toHaveLength(60);
    for (const id of index.stages) {
      const stage = JSON.parse(readFileSync(path.join(root, 'public/stages', id, 'stage.json'), 'utf8')) as StageDefinition;
      const manifest = JSON.parse(readFileSync(path.join(root, 'public/stages', id, 'manifest.json'), 'utf8')) as StageDefinition;
      expect(isStageAmbiencePresetId(stage.ambiencePreset), id).toBe(true);
      expect(manifest.ambiencePreset, id).toBe(stage.ambiencePreset);
    }
    const runtimeIds = new Set([...index.stages, ...fallbackStages.map((stage) => stage.id)]);
    expect(runtimeIds.size).toBe(62);
    for (const stage of fallbackStages) expect(isStageAmbiencePresetId(stage.ambiencePreset), stage.id).toBe(true);
  });

  it('references a curated ambience library within the 25 MB budget', () => {
    const root = process.cwd();
    const paths = stageAmbienceAssetPaths();
    expect(paths).toHaveLength(28);
    const bytes = paths.reduce((total, assetPath) => {
      const filePath = path.join(root, 'public', assetPath.slice(1));
      expect(existsSync(filePath), assetPath).toBe(true);
      return total + statSync(filePath).size;
    }, 0);
    expect(bytes).toBeLessThanOrEqual(25 * 1024 * 1024);
  });
});

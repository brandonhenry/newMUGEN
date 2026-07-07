import { describe, expect, it } from 'vitest';
import type { StageDefinition } from '../types';
import { getStageAssetStatus, isModelStage, markStageAssetReady, resolveStageModelUrl } from './stageAssets';

describe('stage asset helpers', () => {
  it('classifies model stages from render mode, model metadata, and known ids', () => {
    expect(isModelStage({ id: 'plain', renderMode: 'procedural' })).toBe(false);
    expect(isModelStage({ id: 'model-render-mode', renderMode: 'model' })).toBe(true);
    expect(isModelStage({ id: 'model-path', renderMode: 'procedural', model: { path: '/stages/test/stage.glb' } as StageDefinition['model'] })).toBe(true);
    expect(isModelStage({ id: 'hidden-leaf-village', renderMode: 'procedural' })).toBe(true);
  });

  it('uses one stable versioned URL for stage model loads', () => {
    const stage = {
      id: 'arena',
      name: 'Arena',
      renderMode: 'model',
      model: {
        path: '/stages/arena/stage.glb?v=asset-build',
        url: '/stages/arena/stage.glb?v=asset-build'
      }
    } as StageDefinition;

    const url = resolveStageModelUrl(stage);

    expect(url).toContain('/stages/arena/stage.glb?v=asset-build');
    expect(url).toContain('&koreVersion=');
    expect(resolveStageModelUrl({ ...stage, model: { ...stage.model, path: url } })).toBe(url);
  });

  it('stores ready status for warmed stages', () => {
    markStageAssetReady('arena-ready', '/stages/arena-ready/stage.glb');

    expect(getStageAssetStatus('arena-ready')).toMatchObject({
      phase: 'ready',
      progress: 100,
      ready: true,
      url: '/stages/arena-ready/stage.glb'
    });
  });
});

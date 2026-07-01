import { describe, expect, it } from 'vitest';
import type { StageDefinition, StageVisualStyle } from '../types';
import { normalizeStage } from './stageLoader';
import { normalizeStageVisualStyle } from './stageVisualStyle';

function makeStage(patch: Partial<StageDefinition> = {}): StageDefinition {
  return {
    id: 'test-stage',
    name: 'Test Stage',
    subtitle: 'Style test',
    renderMode: 'procedural',
    floor: '#223344',
    rail: '#7deaff',
    light: '#ffffff',
    world: {
      width: 220,
      depth: 220,
      floorY: -0.045,
      backgroundColor: '#9bdfff'
    },
    ...patch
  };
}

describe('stage visual style normalization', () => {
  it('adds a complete anime-daylight visual style when a stage has no style metadata', () => {
    const normalized = normalizeStage(makeStage());

    expect(normalized.visualStylePreset).toBe('anime-daylight');
    expect(normalized.visualStyle?.lighting.keyIntensity).toBeGreaterThan(0);
    expect(normalized.visualStyle?.outline.enabled).toBe(true);
    expect(normalized.visualStyle?.post.bloomEnabled).toBe(false);
    expect(normalized.visualStyle?.post.bloomStrength).toBe(0);
  });

  it('merges partial visual style overrides into the selected preset and clamps unsafe values', () => {
    const style = normalizeStageVisualStyle(makeStage({
      visualStylePreset: 'void-boss',
      visualStyle: {
        lighting: {
          keyIntensity: 99,
          keyPosition: [400, 7, -400]
        },
        post: {
          bloomStrength: 99,
          warmth: -99
        },
        outline: {
          fighterThickness: 99
        },
        combatFx: {
          reducedMotionScale: 5
        }
      } as Partial<StageVisualStyle> as StageVisualStyle
    }));

    expect(style.lighting.keyIntensity).toBe(8);
    expect(style.lighting.keyPosition).toEqual([100, 7, -100]);
    expect(style.post.bloomEnabled).toBe(false);
    expect(style.post.bloomStrength).toBe(0);
    expect(style.post.warmth).toBe(-1);
    expect(style.outline.fighterThickness).toBe(6);
    expect(style.combatFx.reducedMotionScale).toBe(1);
    expect(style.post.contrast).toBeGreaterThan(1);
  });

  it('falls back from invalid presets using stage colors and effect metadata', () => {
    const normalized = normalizeStage(makeStage({
      id: 'dark-arena',
      visualStylePreset: 'not-real' as StageDefinition['visualStylePreset'],
      rail: '#05070a',
      world: {
        width: 220,
        depth: 220,
        backgroundColor: '#101114'
      }
    }));

    expect(normalized.visualStylePreset).toBe('anime-night');
    expect(normalized.visualStyle?.post.bloomEnabled).toBe(false);
    expect(normalized.visualStyle?.post.bloomStrength).toBe(0);
  });

  it('preserves normalized floor effects while adding visual style defaults', () => {
    const normalized = normalizeStage(makeStage({
      floorEffects: {
        impact: {
          enabled: true,
          maxDecals: 999,
          reactive: true,
          quality: 'low'
        }
      }
    }));

    expect(normalized.floorEffects?.impact).toMatchObject({
      enabled: true,
      maxDecals: 256,
      reactive: true,
      quality: 'low'
    });
    expect(normalized.visualStylePreset).toBe('anime-daylight');
    expect(normalized.visualStyle?.combatFx.shockwaveStrength).toBeGreaterThan(0);
  });
});

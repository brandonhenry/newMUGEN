import { describe, expect, it } from 'vitest';
import type { CharacterProjectileDefinition } from '../types';
import {
  BLAST_ELECTRICITY_MAX_VERTICES,
  getBlastElectricityProfile,
  writeBlastElectricitySegments
} from './blastElectricity';

function blastDefinition(overrides: Partial<CharacterProjectileDefinition> = {}): CharacterProjectileDefinition {
  return {
    id: 'test-blast',
    name: 'Test Blast',
    kind: 'blast',
    frames: [],
    animationFrames: {},
    fps: 18,
    loop: true,
    billboard: false,
    blendMode: 'additive',
    defaultScale: [1, 1, 1],
    defaultRotation: [0, 0, 0],
    color: '#58d7ff',
    blastVisual: {
      glowColor: '#42bfff',
      outerColor: '#245dff'
    },
    ...overrides
  };
}

describe('blast electricity', () => {
  it('derives a color-matched default profile from the blast palette', () => {
    expect(getBlastElectricityProfile(blastDefinition(), false)).toEqual({
      color: '#245dff',
      intensity: 1,
      size: 1,
      count: 4,
      refreshFrames: 4
    });
  });

  it('uses authored lightning settings while bounding cost and reduced motion', () => {
    const definition = blastDefinition({
      proceduralLayers: [{
        id: 'electric-shell',
        kind: 'lightning',
        color: '#fff36b',
        intensity: 7,
        size: 4,
        count: 40
      }]
    });

    expect(getBlastElectricityProfile(definition, false)).toEqual({
      color: '#fff36b',
      intensity: 2.5,
      size: 2.5,
      count: 8,
      refreshFrames: 4
    });
    expect(getBlastElectricityProfile(definition, true)).toMatchObject({
      count: 2,
      refreshFrames: 18
    });
  });

  it('writes deterministic beam and orb segments into a reusable buffer', () => {
    const first = new Float32Array(BLAST_ELECTRICITY_MAX_VERTICES * 3);
    const second = new Float32Array(BLAST_ELECTRICITY_MAX_VERTICES * 3);
    const options = { mode: 'beam' as const, length: 5, radius: 0.4, arcCount: 4, seed: 73, phase: 6 };

    const firstCount = writeBlastElectricitySegments(first, options);
    const secondCount = writeBlastElectricitySegments(second, options);

    expect(firstCount).toBe(64);
    expect(secondCount).toBe(firstCount);
    expect(second).toEqual(first);
    expect(Array.from(first.slice(0, firstCount * 3)).every(Number.isFinite)).toBe(true);

    const orbCount = writeBlastElectricitySegments(second, { ...options, mode: 'orb' });
    expect(orbCount).toBe(firstCount);
    expect(second).not.toEqual(first);
  });
});

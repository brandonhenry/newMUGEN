import { describe, expect, it } from 'vitest';
import hitPack from '../assets/hit-effect-01.voxels.json';
import smokePack from '../assets/movement-smoke.voxels.json';
import { normalizedVoxelPixelSize, resolveMovementSmokeAxes } from './voxelEffects';

describe('voxel effect normalization', () => {
  it('preserves square source pixels and full-frame aspect ratio', () => {
    expect(hitPack.normalization).toEqual({ coordinateSpace: 'full-frame', pixelAspect: 1, maxFrameSpan: 48 });
    expect(smokePack.normalization).toEqual({ coordinateSpace: 'full-frame', pixelAspect: 1 });
    expect(normalizedVoxelPixelSize(48, 48, 4) * 48).toBeCloseTo(4);
    expect(normalizedVoxelPixelSize(224, 61, 1.6) * 224).toBeCloseTo(1.6);
    expect(normalizedVoxelPixelSize(224, 61, 1.6) * 61).toBeCloseTo(1.6 * 61 / 224);
  });

  it('stores occupied bounds without changing full-frame coordinates', () => {
    for (const variant of hitPack.variants) {
      expect(variant.frameBounds).toHaveLength(variant.frames.length);
      variant.frames.forEach((frame, index) => {
        const bounds = variant.frameBounds[index];
        expect(bounds === null).toBe(frame.length === 0);
        if (!bounds) return;
        expect(bounds[0]).toBe(Math.min(...frame.map(([x]) => x)));
        expect(bounds[1]).toBe(Math.min(...frame.map(([, y]) => y)));
        expect(bounds[2]).toBe(Math.max(...frame.map(([x]) => x)));
        expect(bounds[3]).toBe(Math.max(...frame.map(([, y]) => y)));
      });
    }
  });
});

describe('movement smoke orientation', () => {
  it('mirrors the trail correctly when fighters swap sides', () => {
    expect(resolveMovementSmokeAxes(Math.PI / 2, 'sprint').trail[0]).toBeCloseTo(-1);
    expect(resolveMovementSmokeAxes(-Math.PI / 2, 'sprint').trail[0]).toBeCloseTo(1);
    expect(resolveMovementSmokeAxes(Math.PI / 2, 'backHop').trail[0]).toBeCloseTo(1);
    expect(resolveMovementSmokeAxes(-Math.PI / 2, 'backHop').trail[0]).toBeCloseTo(-1);
  });
});

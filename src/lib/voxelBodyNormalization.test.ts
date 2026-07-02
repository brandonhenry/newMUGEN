import { describe, expect, it } from 'vitest';
import {
  applyVoxelBodyScale,
  computeVoxelBodyNormalization,
  measureVoxelBodyMetrics,
  type VoxelBodyMask
} from './voxelBodyNormalization';

function maskFromRects(width: number, height: number, rects: Array<[number, number, number, number]>): VoxelBodyMask {
  return {
    width,
    height,
    isForeground: (x, y) => rects.some(([left, top, right, bottom]) => x >= left && x <= right && y >= top && y <= bottom)
  };
}

describe('voxel body normalization', () => {
  it('returns scale 1 for matching body metrics', () => {
    const reference = measureVoxelBodyMetrics(maskFromRects(64, 64, [[26, 8, 38, 58]]));
    const current = measureVoxelBodyMetrics(maskFromRects(64, 64, [[26, 8, 38, 58]]));

    expect(computeVoxelBodyNormalization(reference, current).scale).toBe(1);
  });

  it('scales up a narrower body toward the reference width', () => {
    const reference = measureVoxelBodyMetrics(maskFromRects(64, 64, [[24, 8, 40, 58]]));
    const current = measureVoxelBodyMetrics(maskFromRects(64, 64, [[28, 8, 36, 58]]));

    expect(computeVoxelBodyNormalization(reference, current).scale).toBe(1.35);
  });

  it('ignores disconnected weapon spans away from the body center', () => {
    const reference = measureVoxelBodyMetrics(maskFromRects(96, 64, [[40, 8, 56, 58]]));
    const current = measureVoxelBodyMetrics(maskFromRects(96, 64, [
      [40, 8, 56, 58],
      [5, 25, 28, 30]
    ]));

    expect(computeVoxelBodyNormalization(reference, current).scale).toBe(1);
  });

  it('applies scale around the feet anchor', () => {
    const voxels = [{ x: 1, y: 1.02, z: 0, w: 0.5, h: 0.5, d: 0.2 }];

    expect(applyVoxelBodyScale(voxels, 1.2, { x: 0, y: 0.02 })).toEqual([
      { x: 1.2, y: 1.22, z: 0, w: 0.6, h: 0.6, d: 0.24 }
    ]);
  });
});

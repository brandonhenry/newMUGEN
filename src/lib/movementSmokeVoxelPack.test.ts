import { describe, expect, it } from 'vitest';
import pack from '../assets/movement-smoke.voxels.json';

describe('movement smoke voxel pack', () => {
  it('contains complete non-empty animation families for every selectable style', () => {
    expect(pack.version).toBe(2);
    expect(pack.normalization).toEqual({ coordinateSpace: 'full-frame', pixelAspect: 1 });
    expect(pack.styles.map((style) => style.id)).toEqual(['speed-trail', 'soft-puff', 'burst-puff', 'dust-ring']);
    expect(pack.styles.map((style) => style.frames.length)).toEqual([9, 6, 6, 18]);
    for (const style of pack.styles) {
      expect(style.frameWidth).toBeGreaterThan(0);
      expect(style.frameHeight).toBeGreaterThan(0);
      expect(style.palette.length).toBeGreaterThan(0);
      expect(style.frames.some((frame) => frame.length > 0)).toBe(true);
      expect(style.frameBounds).toHaveLength(style.frames.length);
      for (const frame of style.frames) {
        for (const [x, y, paletteIndex] of frame) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(style.frameWidth);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThan(style.frameHeight);
          expect(paletteIndex).toBeGreaterThanOrEqual(0);
          expect(paletteIndex).toBeLessThan(style.palette.length);
        }
      }
    }
  });
});

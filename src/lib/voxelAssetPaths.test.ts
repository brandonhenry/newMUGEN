import { describe, expect, it } from 'vitest';
import { getPrecomputedVoxelPath, getVoxelAssetRoot, getVoxelPackFrameName } from './voxelAssetPaths';

describe('voxel asset paths', () => {
  it('resolves character frame assets', () => {
    const source = '/characters/naruto/frames/frame-012.png?v=3';
    expect(getVoxelAssetRoot(source)).toBe('/characters/naruto');
    expect(getVoxelPackFrameName(source)).toBe('frame-012');
    expect(getPrecomputedVoxelPath(source, true)).toBe('/characters/naruto/voxels-hd/frame-012.json?v=3');
  });

  it('resolves nested projectile frame assets', () => {
    const source = '/characters/train-heartnet/projectiles/firearm-bullet-projectile/frames/frame-001.png';
    expect(getVoxelAssetRoot(source)).toBe('/characters/train-heartnet/projectiles/firearm-bullet-projectile');
    expect(getVoxelPackFrameName(source)).toBe('frame-001');
    expect(getPrecomputedVoxelPath(source, true)).toBe(
      '/characters/train-heartnet/projectiles/firearm-bullet-projectile/voxels-hd/frame-001.json'
    );
  });

  it('rejects unrelated images', () => {
    expect(getVoxelAssetRoot('/stages/test/frame-001.png')).toBeNull();
    expect(getVoxelPackFrameName('/characters/naruto/face-card.png')).toBeNull();
    expect(getPrecomputedVoxelPath('/characters/naruto/face-card.png', true)).toBeNull();
  });
});

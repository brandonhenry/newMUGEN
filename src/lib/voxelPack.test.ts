import { describe, expect, it } from 'vitest';
import { buildVoxelPack, decodeVoxelPackFrame, decodeVoxelPackFrameRecords, normalizeHdVoxelPayload, voxelPackFrameByteRange, type HdVoxelPayload } from './voxelPack';

const payload: HdVoxelPayload = {
  format: 'kore-hd-voxels-v1',
  palette: ['#112233', '#abcdef', '#fedcba'],
  voxels: [
    { part: 'head', x: 0.1, y: 1.2, z: 0.03, w: 0.2, h: 0.3, d: 0.1, c: 0, s: 1 },
    { part: 'torso', x: -0.4, y: 0.8, z: -0.02, w: 0.5, h: 0.6, d: 0.2, c: 2 },
    { part: 'leadArm', x: 0.7, y: 0.9, z: 0, w: 0.12, h: 0.24, d: 0.08, c: 1, s: 2 }
  ]
};

describe('voxel pack', () => {
  it('decodes packed frames to the same render voxels as HD JSON', () => {
    const expected = normalizeHdVoxelPayload(payload);
    const pack = buildVoxelPack('test-fighter', [{ frame: 'frame-000', payload }]);
    const decoded = decodeVoxelPackFrame(pack.manifest, pack.records, 'frame-000');

    expect(decoded).toEqual(expected);
  });

  it('returns null for missing frames so callers can fall back to JSON', () => {
    const pack = buildVoxelPack('test-fighter', [{ frame: 'frame-000', payload }]);

    expect(decodeVoxelPackFrame(pack.manifest, pack.records, 'frame-999')).toBeNull();
  });

  it('computes exact byte ranges for individual packed frames', () => {
    const pack = buildVoxelPack('test-fighter', [
      { frame: 'frame-000', payload },
      { frame: 'frame-001', payload }
    ]);
    const first = voxelPackFrameByteRange(pack.manifest, 'frame-000');
    const second = voxelPackFrameByteRange(pack.manifest, 'frame-001');

    expect(first).toMatchObject({ start: 0, end: payload.voxels.length * 9 * 8 - 1, count: payload.voxels.length });
    expect(second).toMatchObject({
      start: payload.voxels.length * 9 * 8,
      end: payload.voxels.length * 9 * 8 * 2 - 1,
      count: payload.voxels.length
    });
  });

  it('decodes a ranged frame slice exactly like the full pack', () => {
    const pack = buildVoxelPack('test-fighter', [
      { frame: 'frame-000', payload },
      { frame: 'frame-001', payload }
    ]);
    const range = voxelPackFrameByteRange(pack.manifest, 'frame-001');
    expect(range).not.toBeNull();
    const start = (range?.start ?? 0) / 8;
    const end = ((range?.end ?? 0) + 1) / 8;
    const slice = pack.records.slice(start, end);

    expect(decodeVoxelPackFrameRecords(pack.manifest, slice, 0, range?.count ?? 0)).toEqual(decodeVoxelPackFrame(pack.manifest, pack.records, 'frame-001'));
  });
});

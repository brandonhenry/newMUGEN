export const VOXEL_PACK_FORMAT = 'kore-voxel-pack-v1';
export const VOXEL_PACK_RECORD_FIELDS = 9;

export type VoxelPackPart = 'head' | 'torso' | 'leadArm' | 'rearArm' | 'leadLeg' | 'rearLeg';

export const voxelPackParts: VoxelPackPart[] = ['head', 'torso', 'leadArm', 'rearArm', 'leadLeg', 'rearLeg'];

export type HdVoxelPayload = {
  format: 'kore-hd-voxels-v1';
  palette: string[];
  voxels: Array<{
    part: VoxelPackPart;
    x: number;
    y: number;
    z: number;
    w: number;
    h: number;
    d: number;
    c: number;
    s?: number;
  }>;
};

export type PackedImageVoxel = {
  part: VoxelPackPart;
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  sideColor?: string;
  source: 'hd';
};

export type VoxelPackFrame = {
  frame: string;
  offset: number;
  count: number;
};

export type VoxelPackManifest = {
  format: typeof VOXEL_PACK_FORMAT;
  characterId: string;
  source: 'voxels-hd';
  binary: string;
  recordType: 'float64-le';
  recordFields: typeof VOXEL_PACK_RECORD_FIELDS;
  parts: VoxelPackPart[];
  palette: string[];
  frames: VoxelPackFrame[];
};

export type VoxelPackBuildFrame = {
  frame: string;
  payload: HdVoxelPayload;
};

export function normalizeHdVoxelPayload(payload: unknown): PackedImageVoxel[] | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as HdVoxelPayload;
  if (candidate.format !== 'kore-hd-voxels-v1' || !Array.isArray(candidate.palette) || !Array.isArray(candidate.voxels)) return null;
  return candidate.voxels.map((voxel) => ({
    part: voxel.part,
    position: [voxel.x, voxel.y, voxel.z],
    size: [voxel.w, voxel.h, voxel.d],
    color: candidate.palette[voxel.c] ?? '#ffffff',
    sideColor: candidate.palette[voxel.s ?? voxel.c] ?? candidate.palette[voxel.c] ?? '#ffffff',
    source: 'hd'
  }));
}

export function buildVoxelPack(characterId: string, frames: VoxelPackBuildFrame[]) {
  const palette: string[] = [];
  const paletteIndex = new Map<string, number>();
  const records: number[] = [];
  const manifestFrames: VoxelPackFrame[] = [];

  const indexColor = (color: string) => {
    const existing = paletteIndex.get(color);
    if (existing !== undefined) return existing;
    const next = palette.length;
    palette.push(color);
    paletteIndex.set(color, next);
    return next;
  };

  for (const frame of frames) {
    const offset = records.length / VOXEL_PACK_RECORD_FIELDS;
    for (const voxel of frame.payload.voxels) {
      records.push(
        voxelPackParts.indexOf(voxel.part),
        indexColor(frame.payload.palette[voxel.c] ?? '#ffffff'),
        indexColor(frame.payload.palette[voxel.s ?? voxel.c] ?? frame.payload.palette[voxel.c] ?? '#ffffff'),
        voxel.x,
        voxel.y,
        voxel.z,
        voxel.w,
        voxel.h,
        voxel.d
      );
    }
    manifestFrames.push({
      frame: frame.frame,
      offset,
      count: frame.payload.voxels.length
    });
  }

  const manifest: VoxelPackManifest = {
    format: VOXEL_PACK_FORMAT,
    characterId,
    source: 'voxels-hd',
    binary: 'voxel-pack-v1.bin',
    recordType: 'float64-le',
    recordFields: VOXEL_PACK_RECORD_FIELDS,
    parts: voxelPackParts,
    palette,
    frames: manifestFrames
  };

  return {
    manifest,
    records: new Float64Array(records)
  };
}

export function decodeVoxelPackFrame(manifest: VoxelPackManifest, records: Float64Array, frame: string): PackedImageVoxel[] | null {
  if (manifest.format !== VOXEL_PACK_FORMAT || manifest.recordFields !== VOXEL_PACK_RECORD_FIELDS) return null;
  const frameEntry = manifest.frames.find((candidate) => candidate.frame === frame);
  if (!frameEntry) return null;
  return decodeVoxelPackFrameRecords(manifest, records, frameEntry.offset, frameEntry.count);
}

export function voxelPackFrameByteRange(manifest: VoxelPackManifest, frame: string) {
  if (manifest.format !== VOXEL_PACK_FORMAT || manifest.recordFields !== VOXEL_PACK_RECORD_FIELDS) return null;
  const frameEntry = manifest.frames.find((candidate) => candidate.frame === frame);
  if (!frameEntry) return null;
  const bytesPerRecord = VOXEL_PACK_RECORD_FIELDS * Float64Array.BYTES_PER_ELEMENT;
  const start = frameEntry.offset * bytesPerRecord;
  const length = frameEntry.count * bytesPerRecord;
  return {
    start,
    end: start + length - 1,
    length,
    offset: frameEntry.offset,
    count: frameEntry.count
  };
}

export function decodeVoxelPackFrameRecords(
  manifest: VoxelPackManifest,
  records: Float64Array,
  recordOffset: number,
  count: number
): PackedImageVoxel[] | null {
  if (manifest.format !== VOXEL_PACK_FORMAT || manifest.recordFields !== VOXEL_PACK_RECORD_FIELDS) return null;
  const voxels: PackedImageVoxel[] = [];
  for (let index = 0; index < count; index += 1) {
    const base = (recordOffset === 0 ? 0 : recordOffset * VOXEL_PACK_RECORD_FIELDS) + index * VOXEL_PACK_RECORD_FIELDS;
    const part = manifest.parts[Math.round(records[base] ?? 0)] ?? 'torso';
    const color = manifest.palette[Math.round(records[base + 1] ?? 0)] ?? '#ffffff';
    const sideColor = manifest.palette[Math.round(records[base + 2] ?? records[base + 1] ?? 0)] ?? color;
    voxels.push({
      part,
      position: [records[base + 3] ?? 0, records[base + 4] ?? 0, records[base + 5] ?? 0],
      size: [records[base + 6] ?? 0, records[base + 7] ?? 0, records[base + 8] ?? 0],
      color,
      sideColor,
      source: 'hd'
    });
  }
  return voxels;
}

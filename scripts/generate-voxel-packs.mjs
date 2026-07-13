import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const charactersRoot = path.join(repoRoot, 'public', 'characters');
const parts = ['head', 'torso', 'leadArm', 'rearArm', 'leadLeg', 'rearLeg'];
const recordFields = 9;
const validate = process.argv.includes('--validate');
const projectiles = process.argv.includes('--projectiles');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function buildVoxelPack(characterId, frameFiles) {
  const palette = [];
  const paletteIndex = new Map();
  const records = [];
  const frames = [];

  const indexColor = (color) => {
    const key = color || '#ffffff';
    const existing = paletteIndex.get(key);
    if (existing !== undefined) return existing;
    const next = palette.length;
    palette.push(key);
    paletteIndex.set(key, next);
    return next;
  };

  for (const file of frameFiles) {
    const payload = readJson(file);
    if (payload.format !== 'kore-hd-voxels-v1' || !Array.isArray(payload.palette) || !Array.isArray(payload.voxels)) {
      throw new Error(`Unsupported HD voxel payload: ${file}`);
    }
    const frame = path.basename(file, '.json');
    const offset = records.length / recordFields;
    for (const voxel of payload.voxels) {
      records.push(
        Math.max(0, parts.indexOf(voxel.part)),
        indexColor(payload.palette[voxel.c] ?? '#ffffff'),
        indexColor(payload.palette[voxel.s ?? voxel.c] ?? payload.palette[voxel.c] ?? '#ffffff'),
        voxel.x ?? 0,
        voxel.y ?? 0,
        voxel.z ?? 0,
        voxel.w ?? 0,
        voxel.h ?? 0,
        voxel.d ?? 0
      );
    }
    frames.push({ frame, offset, count: payload.voxels.length });
  }

  return {
    manifest: {
      format: 'kore-voxel-pack-v1',
      characterId,
      source: 'voxels-hd',
      binary: 'voxel-pack-v1.bin',
      recordType: 'float64-le',
      recordFields,
      parts,
      palette,
      frames
    },
    records: new Float64Array(records)
  };
}

function targetIdsFromArgs() {
  return process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
}

function voxelTargets() {
  const requestedIds = targetIdsFromArgs();
  if (!projectiles) {
    const characterIds = requestedIds.length > 0
      ? requestedIds
      : fs.readdirSync(charactersRoot).filter((id) => fs.existsSync(path.join(charactersRoot, id, 'voxels-hd')));
    return characterIds.map((characterId) => ({
      id: characterId,
      voxelDir: path.join(charactersRoot, characterId, 'voxels-hd')
    }));
  }

  const targets = [];
  for (const characterId of fs.readdirSync(charactersRoot).sort()) {
    const projectilesRoot = path.join(charactersRoot, characterId, 'projectiles');
    if (!fs.existsSync(projectilesRoot)) continue;
    for (const projectileId of fs.readdirSync(projectilesRoot).sort()) {
      const id = `${characterId}/projectiles/${projectileId}`;
      if (requestedIds.length > 0 && !requestedIds.includes(characterId) && !requestedIds.includes(id)) continue;
      const voxelDir = path.join(projectilesRoot, projectileId, 'voxels-hd');
      if (fs.existsSync(voxelDir)) targets.push({ id, voxelDir });
    }
  }
  return targets;
}

function assertPackMatchesSource(targetId, frameFiles, manifest, records) {
  if (manifest.format !== 'kore-voxel-pack-v1') throw new Error(`${targetId}: invalid pack format`);
  if (manifest.recordType !== 'float64-le') throw new Error(`${targetId}: invalid record type`);
  if (manifest.recordFields !== recordFields) throw new Error(`${targetId}: invalid record field count`);
  if (manifest.frames.length !== frameFiles.length) throw new Error(`${targetId}: frame count mismatch`);
  for (const [frameIndex, file] of frameFiles.entries()) {
    const payload = readJson(file);
    const frame = manifest.frames[frameIndex];
    const expectedFrameName = path.basename(file, '.json');
    if (frame.frame !== expectedFrameName) throw new Error(`${targetId}/${expectedFrameName}: frame name mismatch`);
    if (frame.count !== payload.voxels.length) throw new Error(`${targetId}/${expectedFrameName}: voxel count mismatch`);
    for (let index = 0; index < payload.voxels.length; index += 1) {
      const voxel = payload.voxels[index];
      const base = (frame.offset + index) * recordFields;
      const color = payload.palette[voxel.c] ?? '#ffffff';
      const sideColor = payload.palette[voxel.s ?? voxel.c] ?? color;
      const packedPart = parts[Math.round(records[base] ?? 0)];
      const packedColor = manifest.palette[Math.round(records[base + 1] ?? 0)] ?? '#ffffff';
      const packedSideColor = manifest.palette[Math.round(records[base + 2] ?? 0)] ?? packedColor;
      if (
        packedPart !== voxel.part ||
        packedColor !== color ||
        packedSideColor !== sideColor ||
        records[base + 3] !== voxel.x ||
        records[base + 4] !== voxel.y ||
        records[base + 5] !== voxel.z ||
        records[base + 6] !== voxel.w ||
        records[base + 7] !== voxel.h ||
        records[base + 8] !== voxel.d
      ) {
        throw new Error(`${targetId}/${expectedFrameName}: voxel ${index} mismatch`);
      }
    }
  }
}

for (const { id: targetId, voxelDir } of voxelTargets()) {
  if (!fs.existsSync(voxelDir)) {
    console.warn(`[voxel-pack] skipped ${targetId}: missing voxels-hd`);
    continue;
  }
  const frameFiles = fs.readdirSync(voxelDir)
    .filter((file) => /^frame-\d+\.json$/.test(file))
    .sort()
    .map((file) => path.join(voxelDir, file));
  if (frameFiles.length === 0) {
    console.warn(`[voxel-pack] skipped ${targetId}: no frame JSON files`);
    continue;
  }

  const { manifest, records } = buildVoxelPack(targetId, frameFiles);
  fs.writeFileSync(path.join(voxelDir, 'voxel-pack-v1.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(voxelDir, 'voxel-pack-v1.bin'), Buffer.from(records.buffer));
  if (validate) assertPackMatchesSource(targetId, frameFiles, manifest, records);
  console.log(`[voxel-pack] ${targetId}: ${manifest.frames.length} frames, ${records.length / recordFields} voxels`);
}

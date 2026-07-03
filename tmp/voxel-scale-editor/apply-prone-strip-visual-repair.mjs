import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const charactersRoot = path.join(repoRoot, 'public/characters');
const outPath = path.join(repoRoot, 'tmp/voxel-scale-editor/family-passes/prone-strip-visual-repair.json');
const dryRun = process.argv.includes('--dry-run');
const proneKeys = new Set(['knockdown', 'getupStand', 'getupRollUp', 'getupRollDown', 'getupRollBack', 'lose']);

function frameIndexFromPath(framePath) {
  const match = /frame-(\d+)\.png$/i.exec(framePath);
  return match ? Number(match[1]) : NaN;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function median(values) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function globalScale(character) {
  const legacy = clamp(character.scale ?? 1, 0.25, 2.5);
  return {
    width: clamp(character.modelScale?.width ?? legacy, 0.25, 2.5),
    height: clamp(character.modelScale?.height ?? legacy, 0.25, 2.5)
  };
}

function animationScaleFor(character, key, frameIndex) {
  const frameScale = character.animationFrameScales?.[key]?.[String(frameIndex)];
  const animationScale = character.animationScales?.[key];
  const selected = frameScale ?? animationScale ?? {};
  const global = globalScale(character);
  const width = clamp(selected.width ?? 1, 0.25, 2.5);
  const height = clamp(selected.height ?? 1, 0.25, 2.5);
  return {
    width,
    height,
    effectiveWidth: width * global.width,
    effectiveHeight: height * global.height,
    offsetX: clamp(frameScale?.offsetX ?? animationScale?.offsetX ?? 0, -6, 6)
  };
}

async function voxelBounds(characterId, frameIndex) {
  const file = path.join(charactersRoot, characterId, 'voxels-hd', `frame-${String(frameIndex).padStart(3, '0')}.json`);
  const payload = await readJson(file);
  const voxels = Array.isArray(payload) ? payload : payload.voxels;
  if (!Array.isArray(voxels) || !voxels.length) return { width: 1, height: 1 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const voxel of voxels) {
    minX = Math.min(minX, Number(voxel.x) - Number(voxel.w) / 2);
    maxX = Math.max(maxX, Number(voxel.x) + Number(voxel.w) / 2);
    minY = Math.min(minY, Number(voxel.y) - Number(voxel.h) / 2);
    maxY = Math.max(maxY, Number(voxel.y) + Number(voxel.h) / 2);
  }
  return { width: Math.max(0.01, maxX - minX), height: Math.max(0.01, maxY - minY) };
}

const changes = [];
const entries = await fs.readdir(charactersRoot, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const id = entry.name;
  if (id === 'near') continue;
  const manifestPath = path.join(charactersRoot, id, 'character.json');
  if (!fsSync.existsSync(manifestPath)) continue;
  const character = await readJson(manifestPath);
  if (character.unplayable || !character.animationFrames?.idle?.length) continue;

  const idleRows = [];
  for (const framePath of character.animationFrames.idle) {
    const frame = frameIndexFromPath(framePath);
    if (!Number.isFinite(frame)) continue;
    const bounds = await voxelBounds(id, frame);
    const scale = animationScaleFor(character, 'idle', frame);
    idleRows.push({ width: bounds.width * scale.effectiveWidth, height: bounds.height * scale.effectiveHeight });
  }
  const idleWidth = median(idleRows.map((row) => row.width)) || 1;
  const idleHeight = median(idleRows.map((row) => row.height)) || 1;
  let dirty = false;

  for (const key of proneKeys) {
    for (const framePath of character.animationFrames?.[key] ?? []) {
      const frame = frameIndexFromPath(framePath);
      if (!Number.isFinite(frame)) continue;
      const bounds = await voxelBounds(id, frame);
      const scale = animationScaleFor(character, key, frame);
      const widthRatio = bounds.width * scale.effectiveWidth / idleWidth;
      const heightRatio = bounds.height * scale.effectiveHeight / idleHeight;
      const paperThin = widthRatio > 2.0 && heightRatio < 0.48;
      const veryLong = widthRatio > 2.35 && heightRatio < 0.6;
      if (!paperThin && !veryLong) continue;
      const targetWidth = veryLong ? 1.9 : 1.85;
      const targetHeight = heightRatio < 0.4 ? 0.52 : 0.56;
      const nextWidth = round(clamp(scale.width * targetWidth / widthRatio, 0.25, 2.5));
      const nextHeight = round(clamp(scale.height * targetHeight / heightRatio, 0.25, 2.5));
      if (Math.abs(nextWidth - scale.width) < 0.005 && Math.abs(nextHeight - scale.height) < 0.005) continue;
      character.animationFrameScales ??= {};
      character.animationFrameScales[key] ??= {};
      character.animationFrameScales[key][String(frame)] = { width: nextWidth, height: nextHeight, offsetX: scale.offsetX };
      dirty = true;
      changes.push({
        id,
        key,
        frame,
        reason: paperThin ? 'prone-strip-too-thin-vs-idle-ghost' : 'prone-strip-too-long-vs-idle-ghost',
        ratioBefore: { width: round(widthRatio), height: round(heightRatio) },
        ratioTarget: { width: targetWidth, height: targetHeight },
        scaleBefore: { width: scale.width, height: scale.height, offsetX: scale.offsetX },
        scaleAfter: { width: nextWidth, height: nextHeight, offsetX: scale.offsetX }
      });
    }
  }
  if (dirty && !dryRun) await fs.writeFile(manifestPath, `${JSON.stringify(character, null, 2)}\n`);
}

await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  dryRun,
  changes: changes.length,
  touchedCharacters: [...new Set(changes.map((change) => change.id))].sort(),
  byCharacter: changes.reduce((acc, change) => {
    acc[change.id] = (acc[change.id] ?? 0) + 1;
    return acc;
  }, {}),
  changeDetails: changes
}, null, 2));
console.log(JSON.stringify({
  dryRun,
  changes: changes.length,
  touchedCharacters: [...new Set(changes.map((change) => change.id))].length,
  outPath: path.relative(repoRoot, outPath)
}, null, 2));

import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const metricsPath = path.join(repoRoot, 'tmp/voxel-visual-proof/metrics/frame-metrics.csv');
const charactersRoot = path.join(repoRoot, 'public/characters');
const outPath = path.join(repoRoot, 'tmp/voxel-scale-editor/family-passes/movement-visual-batch.json');

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === ',') {
      values.push(value);
      value = '';
    } else if (char === '"') {
      quoted = true;
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}

function frameIndexFromPath(framePath) {
  const match = /frame-(\d+)\.png$/i.exec(framePath);
  return match ? Number(match[1]) : NaN;
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function targetFor(row) {
  const id = row.characterId;
  const key = row.animation;
  const frame = Number(row.frame);
  const wr = num(row.widthRatio);
  const hr = num(row.heightRatio);
  if (key !== 'sprint') return null;

  // This list was chosen from the movement ghost-overlay pages, not from this
  // file's thresholds. The conditions below only translate those visual choices
  // into repeatable target ratios for the selected low-volume sprint poses.
  const lowFlatSprint = hr < 0.72 && wr > 1.08;
  const midFlatSprint = hr < 0.78 && wr > 1.35;
  const visiblySmallLean = hr < 0.86 && wr < 1.1 && ['toshiro-hitsugaya', 'momotaro-tsurugi', 'renji-abarai', 'kazuki-muto'].includes(id);
  if (!lowFlatSprint && !midFlatSprint && !visiblySmallLean) return null;

  let targetH = hr;
  let targetW = wr;
  if (hr < 0.62) targetH = 0.74;
  else if (hr < 0.7) targetH = 0.78;
  else if (hr < 0.78) targetH = 0.82;
  else targetH = 0.9;

  if (wr < 1.0) targetW = 1.0;
  else if (wr < 1.25) targetW = wr * 1.04;
  else if (wr < 1.8) targetW = wr * 1.025;
  else targetW = wr * 1.015;

  // Frames that are already very wide should stay wide, but avoid runaway scale.
  targetW = clamp(targetW, 0.9, 3.35);
  targetH = clamp(targetH, 0.68, 0.9);
  return { targetW, targetH, reason: 'visual-sprint-low-body-volume-vs-idle-ghost' };
}

const text = await fs.readFile(metricsPath, 'utf8');
const lines = text.trim().split(/\r?\n/);
const headers = parseCsvLine(lines[0]);
const rows = lines.slice(1).map((line) => {
  const values = parseCsvLine(line);
  return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
});

const cache = new Map();
const changes = [];
for (const row of rows) {
  const target = targetFor(row);
  if (!target) continue;
  const id = row.characterId;
  const key = row.animation;
  const frame = Number(row.frame);
  const manifestPath = path.join(charactersRoot, id, 'character.json');
  if (!cache.has(id)) cache.set(id, { manifestPath, character: await readJson(manifestPath), dirty: false });
  const entry = cache.get(id);
  const character = entry.character;
  const used = character.animationFrames?.[key]?.some((framePath) => frameIndexFromPath(framePath) === frame);
  if (!used) continue;
  const frameScale = character.animationFrameScales?.[key]?.[String(frame)];
  const animationScale = character.animationScales?.[key] ?? {};
  const selected = frameScale ?? animationScale;
  const currentWidth = Number(selected.width ?? 1);
  const currentHeight = Number(selected.height ?? 1);
  const offsetX = Number(frameScale?.offsetX ?? animationScale.offsetX ?? 0);
  const wr = num(row.widthRatio);
  const hr = num(row.heightRatio);
  const nextWidth = round(clamp(currentWidth * target.targetW / wr, 0.25, 2.5));
  const nextHeight = round(clamp(currentHeight * target.targetH / hr, 0.25, 2.5));
  if (Math.abs(nextWidth - currentWidth) < 0.005 && Math.abs(nextHeight - currentHeight) < 0.005) continue;
  character.animationFrameScales ??= {};
  character.animationFrameScales[key] ??= {};
  character.animationFrameScales[key][String(frame)] = { width: nextWidth, height: nextHeight, offsetX };
  entry.dirty = true;
  changes.push({
    id,
    key,
    frame,
    reason: target.reason,
    ratioBefore: { width: round(wr), height: round(hr) },
    ratioTarget: { width: round(target.targetW), height: round(target.targetH) },
    scaleBefore: { width: round(currentWidth), height: round(currentHeight), offsetX },
    scaleAfter: { width: nextWidth, height: nextHeight, offsetX }
  });
}

for (const entry of cache.values()) {
  if (entry.dirty) await fs.writeFile(entry.manifestPath, `${JSON.stringify(entry.character, null, 2)}\n`);
}

await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  changes: changes.length,
  touchedCharacters: [...new Set(changes.map((change) => change.id))].sort(),
  byCharacter: changes.reduce((acc, change) => {
    acc[change.id] = (acc[change.id] ?? 0) + 1;
    return acc;
  }, {}),
  changeDetails: changes
}, null, 2));
console.log(JSON.stringify({
  changes: changes.length,
  touchedCharacters: [...new Set(changes.map((change) => change.id))].length,
  outPath: path.relative(repoRoot, outPath)
}, null, 2));

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const charactersRoot = path.join(repoRoot, 'public/characters');
const outPath = path.join(repoRoot, 'tmp/voxel-scale-editor/family-passes/ghost-volume-visual-fix.json');
const dryRun = process.argv.includes('--dry-run');

const families = {
  crouchBlock: new Set(['crouch', 'block', 'crouchBlock']),
  movement: new Set(['walkForward', 'walkBack', 'sprint', 'sidestepLeft', 'sidestepRight', 'chargeKi']),
  airborne: new Set(['jump', 'backflip', 'juggle']),
  proneRecovery: new Set(['knockdown', 'getupStand', 'getupRollUp', 'getupRollDown', 'getupRollBack', 'lose']),
  reactions: new Set(['hitLight', 'hitHeavy', 'win'])
};

function familyFor(key) {
  for (const [family, keys] of Object.entries(families)) if (keys.has(key)) return family;
  return key === 'idle' ? 'idle' : 'attacks';
}

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
    globalWidth: global.width,
    globalHeight: global.height,
    effectiveWidth: width * global.width,
    effectiveHeight: height * global.height,
    offsetX: clamp(frameScale?.offsetX ?? animationScale?.offsetX ?? 0, -6, 6),
    source: frameScale ? 'frame' : animationScale ? 'animation' : 'default'
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

function bandFor(row) {
  const { key, family, widthRatio: w, heightRatio: h } = row;
  if (family === 'crouchBlock' && key !== 'block') return { min: 0.6, max: 0.95, target: 0.74, reason: 'crouch/body-volume' };
  if (family === 'crouchBlock' && key === 'block') return { min: 0.82, max: 1.25, target: 1.0, reason: 'block/body-volume' };
  if (family === 'movement' && key === 'sprint') return { min: 0.82, max: 1.45, target: 1.12, reason: 'sprint/body-volume' };
  if (family === 'movement') return { min: 0.82, max: 1.25, target: 1.0, reason: 'movement/body-volume' };
  if (family === 'airborne') return { min: 0.72, max: 1.35, target: 1.0, reason: 'airborne/body-volume' };
  if (family === 'proneRecovery') {
    const proneLike = h < 0.82 || w > 1.35;
    return proneLike
      ? { min: 0.62, max: 1.15, target: 0.86, reason: 'prone/body-volume' }
      : { min: 0.78, max: 1.25, target: 1.0, reason: 'recovery/body-volume' };
  }
  if (family === 'reactions') return { min: 0.78, max: 1.25, target: 1.0, reason: 'reaction/body-volume' };
  if (family === 'attacks') {
    if (w > 1.7 || h < 0.72) return { min: 0.65, max: 1.65, target: 1.0, reason: 'wide-attack/body-volume' };
    return { min: 0.72, max: 1.35, target: 1.0, reason: 'attack/body-volume' };
  }
  return null;
}

function targetFor(row, sequence) {
  const band = bandFor(row);
  if (!band) return null;
  const area = row.widthRatio * row.heightRatio;
  const aspectDistortion = Math.max(row.scale.width, row.scale.height) / Math.max(0.01, Math.min(row.scale.width, row.scale.height));
  const reasons = [];
  let targetArea = area;

  if (area < band.min) {
    targetArea = band.target;
    reasons.push(`${band.reason}-too-small`);
  } else if (area > band.max) {
    targetArea = band.target;
    reasons.push(`${band.reason}-too-large`);
  }

  if (row.family !== 'crouchBlock' && aspectDistortion > 1.28) {
    targetArea = clamp(targetArea, band.min, band.max);
    reasons.push('restore-sprite-aspect');
  }

  if (row.family === 'movement' && row.key === 'sprint') {
    if (row.widthRatio > 2.35 && area > 1.25) {
      targetArea = Math.min(targetArea, 1.18);
      reasons.push('sprint-too-massive');
    }
    if (row.heightRatio < 0.58 && area < 1.05) {
      targetArea = Math.max(targetArea, 1.05);
      reasons.push('sprint-too-thin');
    }
  }

  if (row.family === 'proneRecovery') {
    if (row.widthRatio > 2.15 && area > 0.95) {
      targetArea = Math.min(targetArea, 0.9);
      reasons.push('prone-too-long');
    }
    if (row.heightRatio < 0.36 && area < 0.95) {
      targetArea = Math.max(targetArea, 0.8);
      reasons.push('prone-too-thin');
    }
  }

  const seqArea = sequence.map((item) => item.widthRatio * item.heightRatio);
  const seqMedian = median(seqArea);
  if (row.family !== 'attacks' && row.family !== 'proneRecovery' && sequence.length > 1) {
    if (area < seqMedian * 0.6 && area < band.max) {
      targetArea = Math.max(targetArea, Math.min(band.target, seqMedian * 0.9));
      reasons.push('sequence-volume-pop-small');
    }
    if (area > seqMedian * 1.65 && area > band.min) {
      targetArea = Math.min(targetArea, Math.max(band.target, seqMedian * 1.1));
      reasons.push('sequence-volume-pop-large');
    }
  }

  if (!reasons.length) return null;
  if (Math.abs(targetArea - area) < 0.045 && aspectDistortion <= 1.28) return null;
  return { targetArea: clamp(targetArea, 0.45, 1.45), reason: [...new Set(reasons)].join(',') };
}

async function collectSequences(id, character) {
  const idleRows = [];
  for (const framePath of character.animationFrames?.idle ?? []) {
    const frame = frameIndexFromPath(framePath);
    if (!Number.isFinite(frame)) continue;
    const bounds = await voxelBounds(id, frame);
    const scale = animationScaleFor(character, 'idle', frame);
    idleRows.push({ width: bounds.width * scale.effectiveWidth, height: bounds.height * scale.effectiveHeight });
  }
  const idleWidth = median(idleRows.map((row) => row.width)) || 1;
  const idleHeight = median(idleRows.map((row) => row.height)) || 1;
  const sequences = [];
  for (const [key, framePaths] of Object.entries(character.animationFrames ?? {})) {
    if (key === 'idle' || !framePaths?.length) continue;
    const rows = [];
    for (const framePath of framePaths) {
      const frame = frameIndexFromPath(framePath);
      if (!Number.isFinite(frame)) continue;
      const bounds = await voxelBounds(id, frame);
      const scale = animationScaleFor(character, key, frame);
      const renderWidth = bounds.width * scale.effectiveWidth;
      const renderHeight = bounds.height * scale.effectiveHeight;
      rows.push({
        id,
        key,
        family: familyFor(key),
        frame,
        bounds,
        scale,
        rawWidthRatio: (bounds.width * scale.globalWidth) / idleWidth,
        rawHeightRatio: (bounds.height * scale.globalHeight) / idleHeight,
        widthRatio: renderWidth / idleWidth,
        heightRatio: renderHeight / idleHeight
      });
    }
    sequences.push(rows);
  }
  return sequences;
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
  const sequences = await collectSequences(id, character);
  let dirty = false;
  for (const sequence of sequences) {
    for (const row of sequence) {
      const target = targetFor(row, sequence);
      if (!target) continue;
      const rawArea = row.rawWidthRatio * row.rawHeightRatio;
      if (rawArea <= 0) continue;
      const uniform = round(clamp(Math.sqrt(target.targetArea / rawArea), 0.25, 2.5));
      if (Math.abs(uniform - row.scale.width) < 0.005 && Math.abs(uniform - row.scale.height) < 0.005) continue;
      character.animationFrameScales ??= {};
      character.animationFrameScales[row.key] ??= {};
      character.animationFrameScales[row.key][String(row.frame)] = {
        width: uniform,
        height: uniform,
        offsetX: row.scale.offsetX
      };
      dirty = true;
      changes.push({
        id,
        key: row.key,
        frame: row.frame,
        family: row.family,
        reason: target.reason,
        ratioBefore: { width: round(row.widthRatio), height: round(row.heightRatio), area: round(row.widthRatio * row.heightRatio) },
        targetArea: round(target.targetArea),
        scaleBefore: { width: row.scale.width, height: row.scale.height, offsetX: row.scale.offsetX },
        scaleAfter: { width: uniform, height: uniform, offsetX: row.scale.offsetX }
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
  byFamily: changes.reduce((acc, change) => {
    acc[change.family] = (acc[change.family] ?? 0) + 1;
    return acc;
  }, {}),
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
  byFamily: changes.reduce((acc, change) => {
    acc[change.family] = (acc[change.family] ?? 0) + 1;
    return acc;
  }, {}),
  outPath: path.relative(repoRoot, outPath)
}, null, 2));

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const charactersRoot = path.join(root, 'public', 'characters');
const outDir = path.join(root, 'tmp', 'voxel-scale-editor', 'attack-scale-audit');
const stateKeys = new Set([
  'idle', 'walkForward', 'walkBack', 'sprint', 'sidestepLeft', 'sidestepRight',
  'chargeKi', 'jump', 'backflip', 'backHop', 'juggle', 'crouch', 'block', 'crouchBlock',
  'knockdown', 'getupStand', 'getupRollUp', 'getupRollDown', 'getupRollBack',
  'lose', 'hitLight', 'hitHeavy', 'win'
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const round = (value) => Math.round(value * 1000) / 1000;
const frameIndex = (source) => Number(/frame-(\d+)\.png$/i.exec(source)?.[1]);

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function voxelBounds(payload) {
  const voxels = Array.isArray(payload) ? payload : payload.voxels;
  if (!Array.isArray(voxels) || !voxels.length) return null;
  const result = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const voxel of voxels) {
    result.minX = Math.min(result.minX, Number(voxel.x) - Number(voxel.w) / 2);
    result.maxX = Math.max(result.maxX, Number(voxel.x) + Number(voxel.w) / 2);
    result.minY = Math.min(result.minY, Number(voxel.y) - Number(voxel.h) / 2);
    result.maxY = Math.max(result.maxY, Number(voxel.y) + Number(voxel.h) / 2);
  }
  return { width: result.maxX - result.minX, height: result.maxY - result.minY };
}

function scaleFor(character, key, index) {
  const frameScale = character.animationFrameScales?.[key]?.[String(index)];
  const animationScale = character.animationScales?.[key];
  const selected = frameScale ?? animationScale ?? {};
  return {
    width: clamp(selected.width ?? 1, 0.1, 10),
    height: clamp(selected.height ?? 1, 0.1, 10),
    voxelScaleX: clamp(selected.voxelScaleX ?? 1, 0.1, 10),
    voxelScaleY: clamp(selected.voxelScaleY ?? 1, 0.1, 10),
    source: frameScale ? 'frame' : animationScale ? 'animation' : 'default'
  };
}

async function readVoxel(id, index) {
  const file = path.join(charactersRoot, id, 'voxels-hd', `frame-${String(index).padStart(3, '0')}.json`);
  if (!fsSync.existsSync(file)) return null;
  const payload = JSON.parse(await fs.readFile(file, 'utf8'));
  const bounds = voxelBounds(payload);
  return bounds ? { payload, bounds } : null;
}

function metricBand(heightRatio) {
  if (heightRatio < 0.55) return 'under-0.55';
  if (heightRatio < 0.75) return '0.55-0.75';
  if (heightRatio <= 1.25) return '0.75-1.25';
  if (heightRatio <= 1.5) return '1.25-1.50';
  return 'over-1.50';
}

function classifyDisposition(item) {
  const renderedOutlier = item.heightRatio < 0.75 || item.heightRatio > 1.25;
  if (!renderedOutlier) return 'within-tolerance';
  if (item.sourceHeightRatio < 0.75 && item.heightRatio < 0.75 && item.sourcePreservationRatio >= 0.75 && item.sourcePreservationRatio <= 1.33) {
    return 'source-authored-small-pose-no-touch';
  }
  if (item.sourceHeightRatio > 1.25 && item.heightRatio > 1.25 && item.sourcePreservationRatio >= 0.75 && item.sourcePreservationRatio <= 1.33) {
    return 'source-authored-large-pose-no-touch';
  }
  if (item.sourcePreservationRatio < 0.75) return 'likely-rendered-too-small';
  if (item.sourcePreservationRatio > 1.33) return 'likely-rendered-too-large';
  return 'source-authored-size-no-touch';
}

function candidateReason(item) {
  const reasons = [];
  if (item.disposition === 'likely-rendered-too-large') reasons.push('rendered-height-exceeds-source-relative-height');
  if (item.disposition === 'likely-rendered-too-small') reasons.push('rendered-height-falls-below-source-relative-height');
  if (item.disposition.startsWith('likely-') && Math.max(item.scale.width, item.scale.height) > 1.6) reasons.push('large-manifest-scale');
  if (item.disposition.startsWith('likely-') && Math.min(item.scale.width, item.scale.height) < 0.5) reasons.push('small-manifest-scale');
  return reasons;
}

const characters = [];
const usages = [];
const missing = [];
for (const entry of (await fs.readdir(charactersRoot, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory()) continue;
  const id = entry.name;
  const manifestPath = path.join(charactersRoot, id, 'character.json');
  if (!fsSync.existsSync(manifestPath)) continue;
  const character = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (character.unplayable || !character.animationFrames?.idle?.length) continue;
  const legacy = Number(character.scale) || 1;
  const global = {
    width: Number(character.modelScale?.width) || legacy,
    height: Number(character.modelScale?.height) || legacy
  };
  const idleHeights = [];
  const idleSourceHeights = [];
  for (const source of character.animationFrames.idle) {
    const index = frameIndex(source);
    const voxel = await readVoxel(id, index);
    if (!voxel) continue;
    const scale = scaleFor(character, 'idle', index);
    idleHeights.push(voxel.bounds.height * global.height * scale.height * scale.voxelScaleY);
    const sourceHeight = Number(voxel.payload.source?.foregroundHeight);
    if (sourceHeight > 0) idleSourceHeights.push(sourceHeight);
  }
  const idleHeight = median(idleHeights);
  const idleSourceHeight = median(idleSourceHeights);
  if (!(idleHeight > 0) || !(idleSourceHeight > 0)) continue;
  let characterUsages = 0;
  let attackRows = 0;
  for (const [key, sources] of Object.entries(character.animationFrames)) {
    if (stateKeys.has(key) || !sources?.length) continue;
    attackRows += 1;
    for (let sequenceIndex = 0; sequenceIndex < sources.length; sequenceIndex += 1) {
      const index = frameIndex(sources[sequenceIndex]);
      const voxel = await readVoxel(id, index);
      if (!voxel) {
        missing.push({ characterId: id, animationKey: key, frame: index });
        continue;
      }
      const scale = scaleFor(character, key, index);
      const renderWidth = voxel.bounds.width * global.width * scale.width * scale.voxelScaleX;
      const renderHeight = voxel.bounds.height * global.height * scale.height * scale.voxelScaleY;
      const item = {
        characterId: id,
        displayName: character.displayName ?? id,
        animationKey: key,
        sequenceIndex,
        frame: index,
        idleHeight: round(idleHeight),
        idleSourceHeight: round(idleSourceHeight),
        renderWidth: round(renderWidth),
        renderHeight: round(renderHeight),
        heightRatio: round(renderHeight / idleHeight),
        widthToIdleHeight: round(renderWidth / idleHeight),
        scale,
        rawForegroundWidth: voxel.payload.source?.foregroundWidth,
        rawForegroundHeight: voxel.payload.source?.foregroundHeight
      };
      item.sourceHeightRatio = round((Number(item.rawForegroundHeight) || idleSourceHeight) / idleSourceHeight);
      item.sourcePreservationRatio = round(item.heightRatio / Math.max(0.001, item.sourceHeightRatio));
      item.band = metricBand(item.heightRatio);
      item.disposition = classifyDisposition(item);
      item.candidateReasons = candidateReason(item);
      usages.push(item);
      characterUsages += 1;
    }
  }
  characters.push({ characterId: id, displayName: character.displayName ?? id, idleHeight: round(idleHeight), idleSourceHeight: round(idleSourceHeight), attackRows, attackFrameUsages: characterUsages });
}

const uniqueFrames = new Set(usages.map((item) => `${item.characterId}:${item.frame}`));
const candidates = usages.filter((item) => item.candidateReasons.length > 0);
const sourceAuthoredNoTouch = usages.filter((item) => item.disposition.includes('no-touch'));
const bands = Object.fromEntries(['under-0.55', '0.55-0.75', '0.75-1.25', '1.25-1.50', 'over-1.50'].map((band) => [band, usages.filter((item) => item.band === band).length]));
const candidateCharacters = new Map();
for (const item of candidates) {
  const entry = candidateCharacters.get(item.characterId) ?? { characterId: item.characterId, displayName: item.displayName, candidates: 0, frames: new Set(), minHeightRatio: Infinity, maxHeightRatio: -Infinity };
  entry.candidates += 1;
  entry.frames.add(item.frame);
  entry.minHeightRatio = Math.min(entry.minHeightRatio, item.heightRatio);
  entry.maxHeightRatio = Math.max(entry.maxHeightRatio, item.heightRatio);
  candidateCharacters.set(item.characterId, entry);
}
const characterSummary = [...candidateCharacters.values()]
  .map((entry) => ({ ...entry, frames: [...entry.frames].sort((a, b) => a - b), minHeightRatio: round(entry.minHeightRatio), maxHeightRatio: round(entry.maxHeightRatio) }))
  .sort((a, b) => b.candidates - a.candidates || a.displayName.localeCompare(b.displayName));

await fs.mkdir(outDir, { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  thresholds: {
    normalHeightBand: [0.75, 1.25],
    sourcePreservationBand: [0.75, 1.33],
    note: 'Rendered outliers whose relative height follows the transparent-cropped source PNG are source-authored and marked no-touch. Remaining candidates require black-proof visual review because bounds can still include weapons and effects.'
  },
  totals: {
    characters: characters.length,
    attackRows: characters.reduce((sum, item) => sum + item.attackRows, 0),
    attackFrameUsages: usages.length,
    uniqueSourceFrames: uniqueFrames.size,
    candidateUsages: candidates.length,
    candidateCharacters: characterSummary.length,
    sourceAuthoredNoTouchUsages: sourceAuthoredNoTouch.length,
    missingVoxelFrames: missing.length
  },
  bands,
  dispositions: Object.fromEntries([...new Set(usages.map((item) => item.disposition))].sort().map((disposition) => [disposition, usages.filter((item) => item.disposition === disposition).length])),
  characters,
  candidateCharacters: characterSummary,
  candidates,
  usages,
  missing
};
await fs.writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ totals: report.totals, bands }, null, 2));

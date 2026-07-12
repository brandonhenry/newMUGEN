import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

/**
 * Lock crouch scale width/height while preserving the pose's visible shrink.
 *
 * Measurement rule:
 *   rendered crouch top-to-bottom height
 *     === first rendered idle height * crouch-to-idle source height ratio
 *
 * The source ratio comes from the visible foreground height captured in the HD
 * voxel payload. Ratios above 0.90 are capped so crouch states remain shorter
 * than idle. Only crouch/crouchBlock manifest overrides are changed.
 *
 * Usage:
 *   node scripts/lock-crouch-voxel-height.mjs
 *   node scripts/lock-crouch-voxel-height.mjs --write
 *   node scripts/lock-crouch-voxel-height.mjs --write --character vegito
 */

const root = process.cwd();
const charactersRoot = path.join(root, 'public', 'characters');
const write = process.argv.includes('--write');
const onlyIndex = process.argv.indexOf('--character');
const onlyCharacter = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : null;
const stateKeys = ['crouch', 'crouchBlock'];
const round = (value) => Math.round(value * 100000) / 100000;
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const frameIndex = (source) => Number(/frame-(\d+)\.png$/i.exec(typeof source === 'string' ? source : source?.src ?? source?.path ?? '')?.[1]);

function bounds(voxels) {
  if (!voxels.length) return null;
  return voxels.reduce((result, voxel) => ({
    minY: Math.min(result.minY, voxel.y - voxel.h / 2),
    maxY: Math.max(result.maxY, voxel.y + voxel.h / 2)
  }), { minY: Infinity, maxY: -Infinity });
}

function sourceVisibleHeight(payload, currentBounds) {
  const source = payload?.source ?? {};
  const metricsBounds = source.normalization?.metrics?.bounds;
  const metricsHeight = Number(metricsBounds?.maxY) - Number(metricsBounds?.minY) + 1;
  return Number(source.foregroundHeight)
    || (Number.isFinite(metricsHeight) && metricsHeight > 0 ? metricsHeight : null)
    || (currentBounds ? currentBounds.maxY - currentBounds.minY : null);
}

async function readFrame(id, index) {
  const voxelPath = path.join(charactersRoot, id, 'voxels-hd', `frame-${String(index).padStart(3, '0')}.json`);
  if (!fsSync.existsSync(voxelPath)) return null;
  const payload = JSON.parse(await fs.readFile(voxelPath, 'utf8'));
  const currentBounds = bounds(Array.isArray(payload) ? payload : payload.voxels ?? []);
  if (!currentBounds) return null;
  return {
    payload,
    bounds: currentBounds,
    rawHeight: currentBounds.maxY - currentBounds.minY,
    sourceHeight: sourceVisibleHeight(payload, currentBounds)
  };
}

async function idleReference(character, id, globalHeight) {
  for (const source of character.animationFrames?.idle ?? []) {
    const index = frameIndex(source);
    if (!Number.isFinite(index)) continue;
    const frame = await readFrame(id, index);
    if (!frame) continue;
    const scale = character.animationFrameScales?.idle?.[String(index)] ?? character.animationScales?.idle ?? {};
    const frameHeight = Number(scale.height) || 1;
    const voxelScaleY = Number(scale.voxelScaleY) || 1;
    if (!(Number(frame.sourceHeight) > 0)) continue;
    return {
      renderedHeight: frame.rawHeight * globalHeight * frameHeight * voxelScaleY,
      sourceHeight: Number(frame.sourceHeight),
      frame: index
    };
  }
  return { renderedHeight: null, sourceHeight: null, frame: null };
}

const changes = [];
const skipped = [];
const entries = (await fs.readdir(charactersRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && (!onlyCharacter || entry.name === onlyCharacter))
  .sort((a, b) => a.name.localeCompare(b.name));

for (const entry of entries) {
  const id = entry.name;
  const manifestPath = path.join(charactersRoot, id, 'character.json');
  if (!fsSync.existsSync(manifestPath)) continue;
  const character = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (character.unplayable || !stateKeys.some((key) => character.animationFrames?.[key]?.length)) continue;
  const legacyScale = Number(character.scale) || 1;
  const globalHeight = Number(character.modelScale?.height) || legacyScale;
  const idle = await idleReference(character, id, globalHeight);
  if (!(idle.renderedHeight > 0) || !(idle.sourceHeight > 0)) {
    skipped.push({ id, reason: 'missing-idle-height-reference' });
    continue;
  }

  let manifestChanged = false;
  character.animationFrameScales ??= {};
  for (const state of stateKeys) {
    for (const source of character.animationFrames?.[state] ?? []) {
      const index = frameIndex(source);
      if (!Number.isFinite(index)) continue;
      const frame = await readFrame(id, index);
      if (!frame) {
        skipped.push({ id, state, frame: index, reason: 'missing-hd-voxel' });
        continue;
      }
      if (!(frame.sourceHeight > 0)) {
        skipped.push({ id, state, frame: index, reason: 'missing-source-height' });
        continue;
      }
      const frameKey = String(index);
      const prior = character.animationFrameScales?.[state]?.[frameKey]
        ?? character.animationScales?.[state]
        ?? {};
      const voxelScaleY = Number(prior.voxelScaleY) || 1;
      const sourceHeightRatio = Number(frame.sourceHeight) / idle.sourceHeight;
      const targetHeightRatio = clamp(sourceHeightRatio, 0.25, 0.90);
      const targetRenderedHeight = idle.renderedHeight * targetHeightRatio;
      const lockedScale = clamp(
        targetRenderedHeight / Math.max(0.001, frame.rawHeight * globalHeight * voxelScaleY),
        0.1,
        3
      );
      character.animationFrameScales[state] ??= {};
      character.animationFrameScales[state][frameKey] = {
        ...prior,
        width: round(lockedScale),
        height: round(lockedScale),
        offsetX: Number(prior.offsetX) || 0
      };
      manifestChanged = true;
      changes.push({
        id,
        state,
        frame: index,
        frameScaleBefore: {
          width: Number(prior.width) || 1,
          height: Number(prior.height) || 1
        },
        frameScaleAfter: {
          width: round(lockedScale),
          height: round(lockedScale)
        },
        sourceHeightRatio: round(sourceHeightRatio),
        targetHeightRatio: round(targetHeightRatio),
        renderedHeightBefore: round(frame.rawHeight * globalHeight * (Number(prior.height) || 1) * voxelScaleY),
        renderedHeightAfter: round(frame.rawHeight * globalHeight * lockedScale * voxelScaleY),
        idleRenderedHeight: round(idle.renderedHeight)
      });
    }
  }

  if (write && manifestChanged) await fs.writeFile(manifestPath, `${JSON.stringify(character, null, 2)}\n`);
}

console.log(JSON.stringify({
  write,
  measurementRule: 'crouch-rendered-height-equals-first-idle-height-times-capped-source-height-ratio',
  maxCrouchToIdleHeightRatio: 0.9,
  changedFrames: changes.length,
  changedCharacters: new Set(changes.map((change) => change.id)).size,
  skippedFrames: skipped.length,
  changes,
  skipped
}, null, 2));

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * Keep KORE knockdowns the same perceived size as their character's idle pose.
 *
 * Measurement rule:
 *   rendered knockdown long axis (normally left-to-right width)
 *     === median rendered idle top-to-bottom height
 *
 * The visible Width and Height values stay locked. Legacy HD frames that are also
 * used by non-prone animations receive knockdown-only voxelScaleX/voxelScaleY
 * correction, so attacks and hit reactions using the same source frame do not
 * change. Exclusive prone frames are corrected directly in voxels-hd and their
 * packed HD assets are rebuilt automatically.
 *
 * Usage:
 *   node scripts/lock-knockdown-voxel-aspect.mjs          # preview JSON report
 *   node scripts/lock-knockdown-voxel-aspect.mjs --write  # apply + rebuild packs
 *   node scripts/lock-knockdown-voxel-aspect.mjs --write --character vegito
 */

const root = process.cwd();
const charactersRoot = path.join(root, 'public', 'characters');
const write = process.argv.includes('--write');
const onlyIndex = process.argv.indexOf('--character');
const onlyCharacter = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : null;
const skipPacks = process.argv.includes('--skip-packs');
const proneKeys = new Set(['knockdown', 'getupStand', 'getupRollUp', 'getupRollDown', 'getupRollBack', 'lose']);
const round = (value) => Math.round(value * 100000) / 100000;
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const frameIndex = (source) => Number(/frame-(\d+)\.png$/i.exec(source)?.[1]);

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function bounds(voxels) {
  if (!voxels.length) return null;
  return voxels.reduce((result, voxel) => ({
    minX: Math.min(result.minX, voxel.x - voxel.w / 2),
    maxX: Math.max(result.maxX, voxel.x + voxel.w / 2),
    minY: Math.min(result.minY, voxel.y - voxel.h / 2),
    maxY: Math.max(result.maxY, voxel.y + voxel.h / 2)
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
}

async function measuredIdleWorldHeight(character, id, globalHeight) {
  const heights = [];
  for (const source of character.animationFrames?.idle ?? []) {
    const index = frameIndex(source);
    if (!Number.isFinite(index)) continue;
    const voxelPath = path.join(charactersRoot, id, 'voxels-hd', `frame-${String(index).padStart(3, '0')}.json`);
    if (!fsSync.existsSync(voxelPath)) continue;
    const payload = JSON.parse(await fs.readFile(voxelPath, 'utf8'));
    const currentBounds = bounds(Array.isArray(payload) ? payload : payload.voxels ?? []);
    if (!currentBounds) continue;
    const frameScale = character.animationFrameScales?.idle?.[String(index)] ?? character.animationScales?.idle ?? {};
    heights.push((currentBounds.maxY - currentBounds.minY) * globalHeight * (Number(frameScale.height) || 1));
  }
  return median(heights);
}

function transformPayload(payload, scaleX, scaleY, anchorY) {
  return {
    ...payload,
    voxels: payload.voxels.map((voxel) => ({
      ...voxel,
      x: round(voxel.x * scaleX),
      y: round(anchorY + (voxel.y - anchorY) * scaleY),
      z: round(voxel.z * scaleX),
      w: round(voxel.w * scaleX),
      h: round(voxel.h * scaleY),
      d: round(voxel.d * scaleX)
    }))
  };
}

const changes = [];
const skipped = [];
const packCharacters = new Set();
const entries = (await fs.readdir(charactersRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && (!onlyCharacter || entry.name === onlyCharacter))
  .sort((a, b) => a.name.localeCompare(b.name));

for (const entry of entries) {
  const id = entry.name;
  const manifestPath = path.join(charactersRoot, id, 'character.json');
  if (!fsSync.existsSync(manifestPath)) continue;
  const character = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (character.unplayable || !character.animationFrames?.knockdown?.length) continue;
  const legacyScale = Number(character.scale) || 1;
  const globalWidth = Number(character.modelScale?.width) || legacyScale;
  const globalHeight = Number(character.modelScale?.height) || legacyScale;
  const idleWorldHeight = await measuredIdleWorldHeight(character, id, globalHeight);
  let manifestChanged = false;

  for (const frameSource of character.animationFrames.knockdown) {
    const index = frameIndex(frameSource);
    if (!Number.isFinite(index)) continue;
    const otherUses = Object.entries(character.animationFrames)
      .filter(([key, frames]) => !proneKeys.has(key) && frames.some((source) => frameIndex(source) === index))
      .map(([key]) => key);
    const voxelPath = path.join(charactersRoot, id, 'voxels-hd', `frame-${String(index).padStart(3, '0')}.json`);
    if (!fsSync.existsSync(voxelPath)) {
      skipped.push({ id, frame: index, reason: 'missing-hd-voxel' });
      continue;
    }
    const payload = JSON.parse(await fs.readFile(voxelPath, 'utf8'));
    const voxels = Array.isArray(payload) ? payload : payload.voxels;
    const normalization = payload.source?.idleVisualNormalization;
    const currentBounds = bounds(voxels ?? []);
    const targetHeight = Number(normalization?.targetHeight);
    const sourceWidth = Number(payload.source?.foregroundWidth);
    const sourceHeight = Number(payload.source?.foregroundHeight);
    if (!currentBounds || !normalization?.enabled || !(targetHeight > 0) || !(sourceWidth > 0) || !(sourceHeight > 0)) {
      skipped.push({ id, frame: index, reason: 'missing-visual-normalization' });
      continue;
    }
    const currentWidth = currentBounds.maxX - currentBounds.minX;
    const currentHeight = currentBounds.maxY - currentBounds.minY;
    const horizontal = sourceWidth > sourceHeight;
    const desiredWidth = horizontal
      ? targetHeight * (globalHeight / Math.max(0.001, globalWidth))
      : targetHeight * (sourceWidth / sourceHeight);
    const desiredHeight = horizontal
      ? desiredWidth * (sourceHeight / sourceWidth)
      : targetHeight;
    // Always correct from the currently stored geometry to absolute measured
    // target bounds. This makes repeated workflow runs idempotent even when an
    // older run wrote stale normalization scale metadata.
    const voxelScaleX = clamp(desiredWidth / Math.max(0.001, currentWidth), 0.01, 100);
    const voxelScaleY = clamp(desiredHeight / Math.max(0.001, currentHeight), 0.01, 100);
    const nextPayload = transformPayload(payload, voxelScaleX, voxelScaleY, currentBounds.minY);
    const nextBounds = bounds(nextPayload.voxels);
    const correctedLongWorldSize = horizontal
      ? (nextBounds.maxX - nextBounds.minX) * globalWidth
      : (nextBounds.maxY - nextBounds.minY) * globalHeight;
    const measuredLockedScale = clamp(
      (idleWorldHeight ?? targetHeight * globalHeight) / Math.max(0.001, correctedLongWorldSize),
      0.1,
      3
    );
    if (!otherUses.length) {
      nextPayload.source = {
        ...nextPayload.source,
        idleVisualWidth: round(nextBounds.maxX - nextBounds.minX),
        idleVisualHeight: round(nextBounds.maxY - nextBounds.minY),
        idleVisualNormalization: {
          ...normalization,
          scaleX: round(desiredWidth / Math.max(0.001, Number(payload.source?.modelWidth) || sourceWidth)),
          scaleY: round(desiredHeight / Math.max(0.001, Number(payload.source?.modelHeight) || sourceHeight)),
          rawScaleX: round(desiredWidth / Math.max(0.001, Number(payload.source?.modelWidth) || sourceWidth)),
          rawScaleY: round(desiredHeight / Math.max(0.001, Number(payload.source?.modelHeight) || sourceHeight)),
          wideException: false,
          proneException: true,
          proneTargetWidth: round(desiredWidth),
          proneTargetHeight: round(desiredHeight),
          proneSourceAspect: round(sourceWidth / sourceHeight)
        }
      };
    }

    const frameKey = String(index);
    const proneUses = Object.entries(character.animationFrames)
      .filter(([key, frames]) => proneKeys.has(key) && frames.some((source) => frameIndex(source) === index))
      .map(([key]) => key);
    const scaleChanges = [];
    character.animationFrameScales ??= {};
    for (const animationKey of proneUses) {
      const prior = character.animationFrameScales?.[animationKey]?.[frameKey]
        ?? character.animationScales?.[animationKey]
        ?? {};
      const oldWidthScale = Number(prior.width) || 1;
      const oldHeightScale = Number(prior.height) || 1;
      const renderedReferenceBefore = horizontal ? currentWidth * oldWidthScale : currentHeight * oldHeightScale;
      const lockedScale = measuredLockedScale;
      character.animationFrameScales[animationKey] ??= {};
      character.animationFrameScales[animationKey][frameKey] = {
        ...prior,
        width: round(lockedScale),
        height: round(lockedScale),
        ...(otherUses.length
          ? { voxelScaleX: round(voxelScaleX), voxelScaleY: round(voxelScaleY) }
          : { voxelScaleX: 1, voxelScaleY: 1 }),
        offsetX: Number(prior.offsetX) || 0
      };
      scaleChanges.push({
        animationKey,
        frameScaleBefore: { width: oldWidthScale, height: oldHeightScale },
        frameScaleAfter: { width: round(lockedScale), height: round(lockedScale) },
        renderedReferenceBefore: round(renderedReferenceBefore),
        renderedReferenceAfter: round(correctedLongWorldSize * lockedScale),
        targetIdleWorldHeight: round(idleWorldHeight ?? targetHeight * globalHeight)
      });
    }
    manifestChanged = true;
    changes.push({
      id,
      frame: index,
      geometryCorrection: { width: round(voxelScaleX), height: round(voxelScaleY) },
      targetVoxelBounds: { width: round(desiredWidth), height: round(desiredHeight) },
      orientation: horizontal ? 'horizontal' : 'vertical',
      sharedNonProneFrame: otherUses.length > 0,
      otherUses,
      measuredLockedScale: round(measuredLockedScale),
      worldTargetRatio: horizontal ? round((nextBounds.maxX - nextBounds.minX) * globalWidth / (targetHeight * globalHeight)) : 1,
      scaleChanges
    });
    if (write && !otherUses.length) {
      await fs.writeFile(voxelPath, `${JSON.stringify(nextPayload)}\n`);
      packCharacters.add(id);
    }
  }

  if (write && manifestChanged) await fs.writeFile(manifestPath, `${JSON.stringify(character, null, 2)}\n`);
}

if (write && !skipPacks && packCharacters.size > 0) {
  const ids = [...packCharacters].sort();
  for (let index = 0; index < ids.length; index += 16) {
    execFileSync(process.execPath, [
      path.join(root, 'scripts', 'generate-voxel-packs.mjs'),
      '--validate',
      ...ids.slice(index, index + 16)
    ], { cwd: root, stdio: 'ignore' });
  }
}

console.log(JSON.stringify({
  write,
  measurementRule: 'knockdown-long-axis-equals-median-rendered-idle-height',
  changedFrames: changes.length,
  changedCharacters: new Set(changes.map((change) => change.id)).size,
  rebuiltPackCharacters: write && !skipPacks ? packCharacters.size : 0,
  skippedFrames: skipped.length,
  changes,
  skipped
}, null, 2));

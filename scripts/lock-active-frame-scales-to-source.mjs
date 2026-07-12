#!/usr/bin/env node

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const charactersRoot = path.join(repoRoot, 'public', 'characters');
const reportPath = path.join(repoRoot, 'tmp', 'voxel-scale-editor', 'source-locked-roster-pass.json');
const write = process.argv.includes('--write');
const onlyCharacterIndex = process.argv.indexOf('--character');
const onlyCharacter = onlyCharacterIndex >= 0 ? process.argv[onlyCharacterIndex + 1] : null;
const preservationMin = 0.75;
const preservationMax = 1.33;

const round = (value) => Number(value.toFixed(5));
const finite = (value, fallback = 1) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min = 0.1, max = 10) => Math.max(min, Math.min(max, finite(value)));
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const frameIndex = (source) => Number(/frame-(\d+)\.png$/i.exec(String(source))?.[1]);

function globalScale(character) {
  const legacy = finite(character.scale, 1);
  return {
    width: clamp(character.modelScale?.width, 0.1, 10) || legacy,
    height: clamp(character.modelScale?.height, 0.1, 10) || legacy
  };
}

function selectedScale(character, animationKey, frame) {
  const frameScale = character.animationFrameScales?.[animationKey]?.[String(frame)];
  const animationScale = character.animationScales?.[animationKey];
  const selected = frameScale ?? animationScale ?? {};
  return {
    width: clamp(selected.width ?? 1),
    height: clamp(selected.height ?? 1),
    voxelScaleX: clamp(selected.voxelScaleX ?? 1),
    voxelScaleY: clamp(selected.voxelScaleY ?? 1),
    offsetX: finite(selected.offsetX, 0),
    ...(selected.flipX === true ? { flipX: true } : {}),
    ...(selected.flipY === true ? { flipY: true } : {}),
    source: frameScale ? 'frame' : animationScale ? 'animation' : 'default'
  };
}

function voxelData(characterId, frame) {
  const file = path.join(charactersRoot, characterId, 'voxels-hd', `frame-${String(frame).padStart(3, '0')}.json`);
  if (!fsSync.existsSync(file)) return null;
  const payload = JSON.parse(fsSync.readFileSync(file, 'utf8'));
  const voxels = Array.isArray(payload) ? payload : payload.voxels;
  if (!Array.isArray(voxels) || !voxels.length) return null;
  const bounds = voxels.reduce((result, voxel) => ({
    minX: Math.min(result.minX, finite(voxel.x, 0) - finite(voxel.w, 0) / 2),
    maxX: Math.max(result.maxX, finite(voxel.x, 0) + finite(voxel.w, 0) / 2),
    minY: Math.min(result.minY, finite(voxel.y, 0) - finite(voxel.h, 0) / 2),
    maxY: Math.max(result.maxY, finite(voxel.y, 0) + finite(voxel.h, 0) / 2)
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const foregroundWidth = Number(payload.source?.foregroundWidth);
  const foregroundHeight = Number(payload.source?.foregroundHeight);
  return {
    bounds: { width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY },
    source: Number.isFinite(foregroundWidth) && foregroundWidth > 0 && Number.isFinite(foregroundHeight) && foregroundHeight > 0
      ? { width: foregroundWidth, height: foregroundHeight }
      : null
  };
}

function explicitBinding(scale) {
  return {
    width: round(scale.width),
    height: round(scale.height),
    voxelScaleX: round(scale.voxelScaleX),
    voxelScaleY: round(scale.voxelScaleY),
    offsetX: round(scale.offsetX),
    ...(scale.flipX === true ? { flipX: true } : {}),
    ...(scale.flipY === true ? { flipY: true } : {})
  };
}

function materiallyDifferent(left, right) {
  if (!left) return true;
  for (const key of ['width', 'height', 'voxelScaleX', 'voxelScaleY', 'offsetX']) {
    if (Math.abs(finite(left[key], key === 'offsetX' ? 0 : 1) - finite(right[key], key === 'offsetX' ? 0 : 1)) > 0.00001) return true;
  }
  return Boolean(left.flipX) !== Boolean(right.flipX) || Boolean(left.flipY) !== Boolean(right.flipY);
}

const changes = [];
const skipped = [];
const characterSummaries = [];
const entries = (await fs.readdir(charactersRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && (!onlyCharacter || entry.name === onlyCharacter))
  .sort((a, b) => a.name.localeCompare(b.name));

for (const entry of entries) {
  const id = entry.name;
  const manifestPath = path.join(charactersRoot, id, 'character.json');
  if (!fsSync.existsSync(manifestPath)) continue;
  const character = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (character.unplayable || !character.animationFrames?.idle?.length) continue;
  const global = globalScale(character);
  const idleRows = [];
  for (const source of character.animationFrames.idle) {
    const frame = frameIndex(source);
    if (!Number.isFinite(frame)) continue;
    const voxel = voxelData(id, frame);
    if (!voxel?.source) continue;
    const scale = selectedScale(character, 'idle', frame);
    idleRows.push({
      sourceWidth: voxel.source.width,
      sourceHeight: voxel.source.height,
      renderedWidth: voxel.bounds.width * global.width * scale.width * scale.voxelScaleX,
      renderedHeight: voxel.bounds.height * global.height * scale.height * scale.voxelScaleY
    });
  }
  const idle = {
    sourceWidth: median(idleRows.map((row) => row.sourceWidth)),
    sourceHeight: median(idleRows.map((row) => row.sourceHeight)),
    renderedWidth: median(idleRows.map((row) => row.renderedWidth)),
    renderedHeight: median(idleRows.map((row) => row.renderedHeight))
  };
  if (!Object.values(idle).every((value) => Number.isFinite(value) && value > 0)) {
    skipped.push({ id, reason: 'missing-idle-source-or-voxel-reference' });
    continue;
  }

  let bindingsAdded = 0;
  let driftCorrections = 0;
  let manifestChanged = false;
  character.animationFrameScales ??= {};
  for (const [animationKey, sources] of Object.entries(character.animationFrames ?? {})) {
    if (!Array.isArray(sources) || !sources.length) continue;
    const seen = new Set();
    for (const source of sources) {
      const frame = frameIndex(source);
      if (!Number.isFinite(frame) || seen.has(frame)) continue;
      seen.add(frame);
      const voxel = voxelData(id, frame);
      const current = selectedScale(character, animationKey, frame);
      const existingBinding = character.animationFrameScales?.[animationKey]?.[String(frame)] ?? null;
      if (!voxel?.source) {
        const next = explicitBinding(current);
        character.animationFrameScales[animationKey] ??= {};
        if (materiallyDifferent(existingBinding, next)) {
          character.animationFrameScales[animationKey][String(frame)] = next;
          manifestChanged = true;
          if (!existingBinding) bindingsAdded += 1;
          changes.push({ id, animationKey, frame, decision: 'explicit-fallback-missing-source-or-voxel', before: existingBinding, after: next });
        }
        skipped.push({ id, animationKey, frame, reason: 'missing-source-or-voxel' });
        continue;
      }

      const rendered = {
        width: voxel.bounds.width * global.width * current.width * current.voxelScaleX,
        height: voxel.bounds.height * global.height * current.height * current.voxelScaleY
      };
      const target = {
        width: idle.renderedWidth * (voxel.source.width / idle.sourceWidth),
        height: idle.renderedHeight * (voxel.source.height / idle.sourceHeight)
      };
      const preservation = {
        width: rendered.width / Math.max(0.00001, target.width),
        height: rendered.height / Math.max(0.00001, target.height)
      };
      const hasDrift = animationKey !== 'idle' && (
        preservation.width < preservationMin || preservation.width > preservationMax ||
        preservation.height < preservationMin || preservation.height > preservationMax
      );
      let next;
      let decision;
      if (hasDrift) {
        const targetEffectiveX = target.width / Math.max(0.00001, voxel.bounds.width * global.width);
        const targetEffectiveY = target.height / Math.max(0.00001, voxel.bounds.height * global.height);
        const lockedScale = clamp(Math.sqrt(targetEffectiveX * targetEffectiveY));
        next = explicitBinding({
          width: lockedScale,
          height: lockedScale,
          voxelScaleX: clamp(targetEffectiveX / lockedScale),
          voxelScaleY: clamp(targetEffectiveY / lockedScale),
          offsetX: current.offsetX,
          flipX: current.flipX,
          flipY: current.flipY
        });
        decision = 'source-relative-drift-correction';
        driftCorrections += 1;
      } else {
        next = explicitBinding(current);
        decision = existingBinding ? 'preserve-source-compatible-binding' : 'explicit-source-compatible-fallback';
      }
      character.animationFrameScales[animationKey] ??= {};
      if (materiallyDifferent(existingBinding, next)) {
        character.animationFrameScales[animationKey][String(frame)] = next;
        manifestChanged = true;
        if (!existingBinding) bindingsAdded += 1;
        changes.push({
          id,
          animationKey,
          frame,
          decision,
          preservationBefore: { width: round(preservation.width), height: round(preservation.height) },
          sourceRelative: { width: round(voxel.source.width / idle.sourceWidth), height: round(voxel.source.height / idle.sourceHeight) },
          before: existingBinding,
          after: next
        });
      }
    }
  }
  if (write && manifestChanged) await fs.writeFile(manifestPath, `${JSON.stringify(character, null, 2)}\n`);
  characterSummaries.push({ id, bindingsAdded, driftCorrections, manifestChanged });
}

await fs.mkdir(path.dirname(reportPath), { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  write,
  preservationBand: [preservationMin, preservationMax],
  measurementRule: 'active rendered alpha bounds preserve source alpha bounds relative to median idle',
  characters: characterSummaries.length,
  changedCharacters: characterSummaries.filter((value) => value.manifestChanged).length,
  bindingsAdded: characterSummaries.reduce((sum, value) => sum + value.bindingsAdded, 0),
  driftCorrections: characterSummaries.reduce((sum, value) => sum + value.driftCorrections, 0),
  changedBindings: changes.length,
  skipped: skipped.length,
  characterSummaries,
  changes,
  skippedDetails: skipped
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  write,
  characters: report.characters,
  changedCharacters: report.changedCharacters,
  bindingsAdded: report.bindingsAdded,
  driftCorrections: report.driftCorrections,
  changedBindings: report.changedBindings,
  skipped: report.skipped,
  report: path.relative(repoRoot, reportPath)
}, null, 2));

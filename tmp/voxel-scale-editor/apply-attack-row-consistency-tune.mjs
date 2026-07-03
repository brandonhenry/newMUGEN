import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const charactersRoot = path.join(repoRoot, 'public/characters');
const outFile = path.join(repoRoot, 'tmp/voxel-scale-editor/family-passes/attack-row-consistency-tune.json');

const families = {
  crouchBlock: ['crouch', 'block', 'crouchBlock'],
  movement: ['walkForward', 'walkBack', 'sprint', 'sidestepLeft', 'sidestepRight', 'chargeKi'],
  airborne: ['jump', 'backflip', 'juggle'],
  proneRecovery: ['knockdown', 'getupStand', 'getupRollUp', 'getupRollDown', 'getupRollBack', 'lose'],
  reactions: ['hitLight', 'hitHeavy', 'win']
};

const nonAttackKeys = new Set(Object.values(families).flat().concat(['idle']));

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

function round2(value) {
  return Math.round(value * 100) / 100;
}

function globalScale(character) {
  const legacy = clamp(character.scale ?? 1, 0.25, 2.5);
  return {
    width: clamp(character.modelScale?.width ?? legacy, 0.25, 2.5),
    height: clamp(character.modelScale?.height ?? legacy, 0.25, 2.5)
  };
}

function localScaleFor(character, key, frameIndex) {
  const frameScale = character.animationFrameScales?.[key]?.[String(frameIndex)];
  const animationScale = character.animationScales?.[key];
  const selected = frameScale ?? animationScale ?? {};
  return {
    width: clamp(selected.width ?? 1, 0.25, 2.5),
    height: clamp(selected.height ?? 1, 0.25, 2.5),
    offsetX: clamp(selected.offsetX ?? animationScale?.offsetX ?? 0, -6, 6),
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

function attackFrameCandidate(frame, frames, index) {
  const neighborHrs = [frames[index - 1]?.heightRatio, frames[index + 1]?.heightRatio].filter(Number.isFinite);
  const maxRawHeight = Math.max(...frames.map((item) => item.rawHeightRatio));
  const medianHeight = median(frames.map((item) => item.heightRatio));
  const nearFullSourceHeight = frame.rawHeightRatio >= maxRawHeight * 0.86;
  const bodyLooksSmall = frame.heightRatio < 0.96 && (frame.localScale.height < 0.98 || frame.widthRatio > 1.2);
  const rowDip = frame.heightRatio < Math.min(0.98, Math.max(0.94, medianHeight - 0.08));
  const neighborDip = neighborHrs.length > 0 && frame.heightRatio + 0.08 < Math.max(...neighborHrs);
  return nearFullSourceHeight && bodyLooksSmall && (rowDip || neighborDip);
}

function targetForRow(frames) {
  const stable = frames
    .map((frame) => frame.heightRatio)
    .filter((heightRatio) => heightRatio >= 0.96 && heightRatio <= 1.08);
  if (stable.length) return clamp(round2(median(stable)), 0.98, 1.03);
  return clamp(round2(Math.max(...frames.map((frame) => frame.heightRatio))), 0.98, 1.03);
}

async function main() {
  const characterIds = (await fs.readdir(charactersRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const changes = [];
  for (const id of characterIds) {
    const manifestPath = path.join(charactersRoot, id, 'character.json');
    if (!fsSync.existsSync(manifestPath)) continue;

    const character = await readJson(manifestPath);
    if (character.unplayable || id === 'near' || !character.animationFrames?.idle?.length) continue;

    const global = globalScale(character);
    const idleFrames = [];
    for (const framePath of character.animationFrames.idle) {
      const frame = frameIndexFromPath(framePath);
      const bounds = await voxelBounds(id, frame);
      const scale = localScaleFor(character, 'idle', frame);
      idleFrames.push({
        width: bounds.width * scale.width * global.width,
        height: bounds.height * scale.height * global.height
      });
    }
    const idleWidth = median(idleFrames.map((frame) => frame.width)) || 1;
    const idleHeight = median(idleFrames.map((frame) => frame.height)) || 1;
    let changed = false;

    for (const key of Object.keys(character.animationFrames ?? {}).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
      if (nonAttackKeys.has(key)) continue;
      const framePaths = character.animationFrames[key];
      if (!framePaths?.length || framePaths.length < 3) continue;

      const frames = [];
      for (const framePath of framePaths) {
        const frame = frameIndexFromPath(framePath);
        if (!Number.isFinite(frame)) continue;
        const bounds = await voxelBounds(id, frame);
        const localScale = localScaleFor(character, key, frame);
        frames.push({
          frame,
          bounds,
          localScale,
          rawHeightRatio: bounds.height / idleHeight,
          widthRatio: (bounds.width * localScale.width * global.width) / idleWidth,
          heightRatio: (bounds.height * localScale.height * global.height) / idleHeight
        });
      }

      const target = targetForRow(frames);
      for (let index = 0; index < frames.length; index += 1) {
        const item = frames[index];
        if (!attackFrameCandidate(item, frames, index)) continue;
        const nextUniform = clamp(round2(item.localScale.height * (target / item.heightRatio)), 0.25, 2.5);
        if (nextUniform <= Math.max(item.localScale.width, item.localScale.height) + 0.005) continue;

        character.animationFrameScales ??= {};
        character.animationFrameScales[key] ??= {};
        const before = character.animationFrameScales[key][String(item.frame)] ?? character.animationScales?.[key] ?? {};
        character.animationFrameScales[key][String(item.frame)] = {
          width: nextUniform,
          height: nextUniform,
          offsetX: item.localScale.offsetX
        };
        changed = true;
        changes.push({
          id,
          key,
          frame: item.frame,
          before,
          after: character.animationFrameScales[key][String(item.frame)],
          previousHeightRatio: round2(item.heightRatio),
          previousWidthRatio: round2(item.widthRatio),
          targetHeightRatio: target,
          reason: 'attack row had an internal body-scale dip versus neighboring/source-similar frames'
        });
      }
    }

    if (changed) {
      await fs.writeFile(manifestPath, `${JSON.stringify(character, null, 2)}\n`);
    }
  }

  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, `${JSON.stringify({ generatedAt: new Date().toISOString(), changes }, null, 2)}\n`);
  console.log(`attack row consistency tune changes: ${changes.length}`);
  const byCharacter = new Map();
  for (const change of changes) byCharacter.set(change.id, (byCharacter.get(change.id) ?? 0) + 1);
  for (const [id, count] of [...byCharacter.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`${id}: ${count}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

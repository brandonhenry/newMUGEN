import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const charactersRoot = path.join(repoRoot, 'public/characters');
const outFile = path.join(repoRoot, 'tmp/voxel-scale-editor/family-passes/attack-body-height-rescue.json');

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

function targetHeightRatio(widthRatio, heightRatio) {
  if (heightRatio < 0.55 && widthRatio > 1.8) return 0.78;
  if (heightRatio < 0.7 && widthRatio > 1.5) return 0.88;
  if (heightRatio < 0.85) return 0.95;
  return 0.98;
}

function shouldRescue(widthRatio, heightRatio, localScale) {
  if (heightRatio < 0.9 && (widthRatio > 1.12 || localScale.width < 0.92 || localScale.height < 0.92)) {
    return true;
  }
  if (widthRatio < 0.9 && heightRatio < 0.92) {
    return true;
  }
  return false;
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
      const frames = character.animationFrames[key];
      if (!frames?.length) continue;

      for (const framePath of frames) {
        const frame = frameIndexFromPath(framePath);
        if (!Number.isFinite(frame)) continue;

        const bounds = await voxelBounds(id, frame);
        const scale = localScaleFor(character, key, frame);
        const widthRatio = (bounds.width * scale.width * global.width) / idleWidth;
        const heightRatio = (bounds.height * scale.height * global.height) / idleHeight;
        if (!shouldRescue(widthRatio, heightRatio, scale)) continue;

        const target = targetHeightRatio(widthRatio, heightRatio);
        const nextUniform = clamp(round2(scale.height * (target / heightRatio)), 0.25, 2.5);
        if (nextUniform <= Math.max(scale.width, scale.height) + 0.005) continue;

        character.animationFrameScales ??= {};
        character.animationFrameScales[key] ??= {};
        const before = character.animationFrameScales[key][String(frame)] ?? character.animationScales?.[key] ?? {};
        character.animationFrameScales[key][String(frame)] = {
          width: nextUniform,
          height: nextUniform,
          offsetX: scale.offsetX
        };
        changed = true;
        changes.push({
          id,
          key,
          frame,
          before,
          after: character.animationFrameScales[key][String(frame)],
          widthRatio: round2(widthRatio),
          heightRatio: round2(heightRatio),
          targetHeightRatio: target,
          reason: 'attack body/head appeared too small against idle ghost; preserve sprite aspect and allow reach to extend'
        });
      }
    }

    if (changed) {
      await fs.writeFile(manifestPath, `${JSON.stringify(character, null, 2)}\n`);
    }
  }

  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, `${JSON.stringify({ generatedAt: new Date().toISOString(), changes }, null, 2)}\n`);
  console.log(`attack body height rescue changes: ${changes.length}`);
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

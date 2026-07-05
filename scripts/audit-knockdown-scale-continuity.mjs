import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = new Set(process.argv.slice(2));
const repo = resolve(process.cwd());
const charactersDir = join(repo, 'public', 'characters');
const strict = args.has('--strict');
const json = args.has('--json');
const includeRenderJumps = args.has('--include-render-jumps');
const ASPECT_JUMP_THRESHOLD = 2.5;
const RENDER_JUMP_THRESHOLD = 1.45;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function frameIndexFromPath(path) {
  const match = path?.match(/frame-(\d+)\.png/);
  return match ? Number(match[1]) : null;
}

function finiteNumber(value, fallback = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getGlobalScale(character) {
  const fallback = finiteNumber(character.scale, 1);
  return {
    width: finiteNumber(character.modelScale?.width, fallback),
    height: finiteNumber(character.modelScale?.height, fallback)
  };
}

function getAnimationFrameScale(character, animationKey, frameIndex) {
  const frameScale = character.animationFrameScales?.[animationKey]?.[String(frameIndex)];
  const animationScale = character.animationScales?.[animationKey];
  const scale = frameScale ?? animationScale ?? {};
  return {
    width: finiteNumber(scale.width, 1),
    height: finiteNumber(scale.height, 1),
    offsetX: finiteNumber(scale.offsetX, 0)
  };
}

function normalizeVoxels(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.voxels)) return payload.voxels;
  return [];
}

function getVoxelBounds(voxels) {
  if (voxels.length === 0) return null;
  return voxels.reduce(
    (bounds, voxel) => ({
      minX: Math.min(bounds.minX, finiteNumber(voxel.x, 0) - Math.max(0.001, finiteNumber(voxel.w, 0.001)) / 2),
      maxX: Math.max(bounds.maxX, finiteNumber(voxel.x, 0) + Math.max(0.001, finiteNumber(voxel.w, 0.001)) / 2),
      minY: Math.min(bounds.minY, finiteNumber(voxel.y, 0) - Math.max(0.001, finiteNumber(voxel.h, 0.001)) / 2),
      maxY: Math.max(bounds.maxY, finiteNumber(voxel.y, 0) + Math.max(0.001, finiteNumber(voxel.h, 0.001)) / 2)
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  );
}

function getFrameMetrics(character, animationKey, frameSource) {
  const frameIndex = frameIndexFromPath(frameSource);
  if (!Number.isFinite(frameIndex)) return null;
  const voxelPath = join(charactersDir, character.id, 'voxels-hd', `frame-${String(frameIndex).padStart(3, '0')}.json`);
  if (!existsSync(voxelPath)) return null;
  const scale = getAnimationFrameScale(character, animationKey, frameIndex);
  const globalScale = getGlobalScale(character);
  const bounds = getVoxelBounds(normalizeVoxels(readJson(voxelPath)));
  if (!bounds) return null;
  const rawWidth = bounds.maxX - bounds.minX;
  const rawHeight = bounds.maxY - bounds.minY;
  return {
    frameIndex,
    scale,
    scaleAspect: scale.width / Math.max(0.001, scale.height),
    renderedWidth: rawWidth * scale.width * globalScale.width,
    renderedHeight: rawHeight * scale.height * globalScale.height
  };
}

function jumpRatio(a, b) {
  return Math.max(a, b) / Math.max(0.001, Math.min(a, b));
}

const findings = [];

for (const characterId of readdirSync(charactersDir).sort()) {
  const manifestPath = join(charactersDir, characterId, 'character.json');
  if (!existsSync(manifestPath)) continue;
  const character = readJson(manifestPath);
  const sequence = character.animationFrames?.knockdown ?? [];
  if (sequence.length < 2) continue;
  const frames = sequence.map((frame) => getFrameMetrics(character, 'knockdown', frame)).filter(Boolean);
  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1];
    const current = frames[index];
    const scaleAspectJump = jumpRatio(previous.scaleAspect, current.scaleAspect);
    const renderedWidthJump = jumpRatio(previous.renderedWidth, current.renderedWidth);
    const renderedHeightJump = jumpRatio(previous.renderedHeight, current.renderedHeight);
    const renderedMaxJump = Math.max(renderedWidthJump, renderedHeightJump);
    const hasScaleAspectJump = scaleAspectJump >= ASPECT_JUMP_THRESHOLD;
    const hasRenderedJump = renderedMaxJump >= RENDER_JUMP_THRESHOLD;
    if (!hasScaleAspectJump && (!includeRenderJumps || !hasRenderedJump)) continue;
    findings.push({
      characterId,
      pair: `${index - 1}->${index}`,
      frames: `${previous.frameIndex}->${current.frameIndex}`,
      scaleAspect: `${previous.scaleAspect.toFixed(2)}->${current.scaleAspect.toFixed(2)}`,
      scale: `${previous.scale.width}/${previous.scale.height}->${current.scale.width}/${current.scale.height}`,
      renderedSize: `${previous.renderedWidth.toFixed(2)}x${previous.renderedHeight.toFixed(2)}->${current.renderedWidth.toFixed(2)}x${current.renderedHeight.toFixed(2)}`,
      scaleAspectJump: Number(scaleAspectJump.toFixed(2)),
      renderedMaxJump: Number(renderedMaxJump.toFixed(2)),
      kind: hasScaleAspectJump ? 'scale-aspect-jump' : 'render-jump'
    });
  }
}

if (json) {
  console.log(JSON.stringify({ findings }, null, 2));
} else if (findings.length === 0) {
  console.log('No knockdown scale continuity findings.');
} else {
  console.table(findings);
  console.log(`${findings.length} knockdown scale continuity finding${findings.length === 1 ? '' : 's'}.`);
}

if (strict && findings.length > 0) {
  process.exitCode = 1;
}

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const options = parseArgs(process.argv.slice(2));
const repo = resolve(options.repo ?? process.cwd());
const charactersDir = join(repo, 'public', 'characters');
const strict = Boolean(options.strict);
const json = Boolean(options.json);
const includeRenderJumps = !options.scaleAspectOnly;
const includeUnplayable = Boolean(options.includeUnplayable);
const animationKeys = String(options.animations ?? 'knockdown,getupRollUp,getupRollDown,getupRollBack')
  .split(',')
  .map((key) => key.trim())
  .filter(Boolean);
const ASPECT_JUMP_THRESHOLD = finiteNumber(options.aspectJumpThreshold, 2.5);
const RENDER_JUMP_THRESHOLD = finiteNumber(options.renderJumpThreshold, 1.45);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (['strict', 'json', 'scale-aspect-only', 'include-unplayable'].includes(key)) {
      parsed[toCamelCase(key)] = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      parsed[toCamelCase(key)] = true;
      continue;
    }
    parsed[toCamelCase(key)] = value;
    index += 1;
  }
  return parsed;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function frameIndexFromPath(frameSource) {
  if (typeof frameSource === 'number') return frameSource;
  const path =
    typeof frameSource === 'string'
      ? frameSource
      : frameSource?.src ?? frameSource?.path ?? frameSource?.image ?? frameSource?.file ?? '';
  if (Number.isFinite(frameSource?.index)) return Number(frameSource.index);
  const match = path?.match(/frame-(\d+)\.(?:png|json)$/);
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
  const voxels = Array.isArray(payload) ? payload : Array.isArray(payload?.voxels) ? payload.voxels : [];
  return voxels.map((voxel) => {
    if (Number.isFinite(voxel?.x) || Number.isFinite(voxel?.w)) return voxel;
    const [x = 0, y = 0] = Array.isArray(voxel?.position) ? voxel.position : [];
    const [w = 0.001, h = 0.001] = Array.isArray(voxel?.size) ? voxel.size : [];
    return { x, y, w, h };
  });
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
    animationKey,
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
  if (character.unplayable && !includeUnplayable) continue;
  for (const animationKey of animationKeys) {
    const sequence = character.animationFrames?.[animationKey] ?? [];
    if (sequence.length < 2) continue;
    const frames = sequence.map((frame) => getFrameMetrics(character, animationKey, frame)).filter(Boolean);
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
        animationKey,
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
}

const summary = findings.reduce(
  (accumulator, finding) => {
    accumulator.total += 1;
    accumulator.byKind[finding.kind] = (accumulator.byKind[finding.kind] ?? 0) + 1;
    accumulator.byAnimation[finding.animationKey] = (accumulator.byAnimation[finding.animationKey] ?? 0) + 1;
    accumulator.characters.add(finding.characterId);
    return accumulator;
  },
  { total: 0, byKind: {}, byAnimation: {}, characters: new Set() }
);
const printableSummary = {
  total: summary.total,
  characters: summary.characters.size,
  byKind: summary.byKind,
  byAnimation: summary.byAnimation,
  animations: animationKeys,
  aspectJumpThreshold: ASPECT_JUMP_THRESHOLD,
  renderJumpThreshold: RENDER_JUMP_THRESHOLD,
  repo
};

if (json) {
  console.log(JSON.stringify({ summary: printableSummary, findings }, null, 2));
} else if (findings.length === 0) {
  console.log(`No knockdown scale continuity findings across ${animationKeys.join(', ')}.`);
} else {
  console.table(findings);
  console.log(JSON.stringify(printableSummary, null, 2));
}

if (strict && findings.length > 0) {
  process.exitCode = 1;
}

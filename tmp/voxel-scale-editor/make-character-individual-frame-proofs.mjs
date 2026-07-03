import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const repoRoot = process.cwd();
const charactersRoot = path.join(repoRoot, 'public/characters');
const outRoot = path.join(repoRoot, 'tmp/voxel-scale-editor/individual-frame-proofs');
const characterId = process.argv.find((arg) => arg.startsWith('--character='))?.split('=')[1];

const stanceOrder = [
  'idle',
  'walkForward',
  'walkBack',
  'sprint',
  'backflip',
  'sidestepLeft',
  'sidestepRight',
  'jump',
  'crouch',
  'block',
  'crouchBlock',
  'chargeKi',
  'jableft',
  'jabright',
  'kickleft',
  'kickright',
  'hitLight',
  'hitHeavy',
  'juggle',
  'knockdown',
  'getupStand',
  'getupRollUp',
  'getupRollDown',
  'getupRollBack',
  'win',
  'lose'
];

if (!characterId) throw new Error('Usage: node tmp/voxel-scale-editor/make-character-individual-frame-proofs.mjs --character=<id>');

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function median(values) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

function frameIndexFromPath(framePath) {
  const match = /frame-(\d+)\.png$/i.exec(framePath);
  return match ? Number(match[1]) : NaN;
}

function keySort(a, b) {
  const ai = stanceOrder.indexOf(a);
  const bi = stanceOrder.indexOf(b);
  if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  return a.localeCompare(b, undefined, { numeric: true });
}

function safeName(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, '_');
}

function globalScale(character) {
  const legacy = clamp(character.scale ?? 1, 0.25, 3);
  return {
    width: clamp(character.modelScale?.width ?? legacy, 0.25, 3),
    height: clamp(character.modelScale?.height ?? legacy, 0.25, 3)
  };
}

function animationScaleFor(character, key, frameIndex) {
  const frameScale = character.animationFrameScales?.[key]?.[String(frameIndex)];
  const animationScale = character.animationScales?.[key];
  const selected = frameScale ?? animationScale ?? {};
  const global = globalScale(character);
  const width = clamp(selected.width ?? 1, 0.25, 3);
  const height = clamp(selected.height ?? 1, 0.25, 3);
  const offsetX = clamp(selected.offsetX ?? animationScale?.offsetX ?? 0, -8, 8);
  return {
    width,
    height,
    effectiveWidth: width * global.width,
    effectiveHeight: height * global.height,
    offsetX,
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

async function cropBuffer(file) {
  const image = sharp(file).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let maxX = -1;
  let minY = info.height;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] <= 0) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return fs.readFile(file);
  return sharp(file).extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }).png().toBuffer();
}

function svgText(text, x, y, size = 14, color = '#f5f5f5') {
  const escaped = String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
  return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" fill="${color}">${escaped}</text>`;
}

async function renderFrame(characterId, frameIndex, renderWidth, renderHeight, pixelsPerUnit) {
  const source = await cropBuffer(path.join(charactersRoot, characterId, 'frames', `frame-${String(frameIndex).padStart(3, '0')}.png`));
  const width = Math.max(1, Math.round(renderWidth * pixelsPerUnit));
  const height = Math.max(1, Math.round(renderHeight * pixelsPerUnit));
  return {
    buffer: await sharp(source).resize({ width, height, fit: 'fill', kernel: 'nearest' }).png().toBuffer(),
    width,
    height
  };
}

const manifestPath = path.join(charactersRoot, characterId, 'character.json');
if (!fsSync.existsSync(manifestPath)) throw new Error(`Character not found: ${characterId}`);
const character = await readJson(manifestPath);
const animationKeys = Object.keys(character.animationFrames ?? {})
  .filter((key) => character.animationFrames?.[key]?.length)
  .sort(keySort);

const idleMetrics = [];
for (const framePath of character.animationFrames?.idle ?? []) {
  const frame = frameIndexFromPath(framePath);
  const bounds = await voxelBounds(characterId, frame);
  const scale = animationScaleFor(character, 'idle', frame);
  idleMetrics.push({ frame, renderWidth: bounds.width * scale.effectiveWidth, renderHeight: bounds.height * scale.effectiveHeight });
}
if (!idleMetrics.length) throw new Error(`Character ${characterId} has no idle frames.`);

const idleWidth = median(idleMetrics.map((item) => item.renderWidth)) || 1;
const idleHeight = median(idleMetrics.map((item) => item.renderHeight)) || 1;
const idleFrame = idleMetrics[0];
const pixelsPerUnit = 220 / idleHeight;
const idleRendered = await renderFrame(characterId, idleFrame.frame, idleFrame.renderWidth, idleFrame.renderHeight, pixelsPerUnit);

const outDir = path.join(outRoot, characterId);
await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

let ordinal = 0;
const index = [];
for (const key of animationKeys) {
  const keyDir = path.join(outDir, safeName(key));
  await fs.mkdir(keyDir, { recursive: true });
  for (let sequenceIndex = 0; sequenceIndex < character.animationFrames[key].length; sequenceIndex += 1) {
    const frame = frameIndexFromPath(character.animationFrames[key][sequenceIndex]);
    if (!Number.isFinite(frame)) continue;
    const bounds = await voxelBounds(characterId, frame);
    const scale = animationScaleFor(character, key, frame);
    const renderWidth = bounds.width * scale.effectiveWidth;
    const renderHeight = bounds.height * scale.effectiveHeight;
    const target = await renderFrame(characterId, frame, renderWidth, renderHeight, pixelsPerUnit);
    const pad = 22;
    const gap = 34;
    const baselinePad = 34;
    const labelH = 44;
    const baseline = labelH + Math.max(idleRendered.height, target.height) + pad;
    const width = pad * 2 + idleRendered.width + gap + target.width;
    const height = baseline + baselinePad;
    const targetLeft = pad + idleRendered.width + gap;
    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += '<rect width="100%" height="100%" fill="#080808"/>';
    svg += `<rect x="${pad - 8}" y="${baseline - idleRendered.height - 8}" width="${idleRendered.width + 16}" height="${idleRendered.height + 16}" fill="#101010" stroke="#3a3f48"/>`;
    svg += `<rect x="${targetLeft - 8}" y="${baseline - target.height - 8}" width="${target.width + 16}" height="${target.height + 16}" fill="#101010" stroke="#6b7280"/>`;
    svg += svgText('idle ref', pad - 8, 22, 14, '#cbd5e1');
    svg += svgText(`${key} frame ${String(frame).padStart(3, '0')}`, targetLeft - 8, 22, 14, '#f8fafc');
    svg += svgText(`${(renderWidth / idleWidth).toFixed(2)}w ${(renderHeight / idleHeight).toFixed(2)}h scale ${scale.width.toFixed(2)} ${scale.height.toFixed(2)}`, targetLeft - 8, 40, 12, '#a7b0bd');
    svg += `<line x1="0" y1="${baseline}" x2="${width}" y2="${baseline}" stroke="#3a3f48" stroke-width="2"/>`;
    svg += '</svg>';
    const file = path.join(keyDir, `${String(++ordinal).padStart(4, '0')}-${safeName(key)}-frame-${String(frame).padStart(3, '0')}.png`);
    await sharp(Buffer.from(svg), { limitInputPixels: false })
      .composite([
        { input: idleRendered.buffer, left: pad, top: Math.round(baseline - idleRendered.height) },
        { input: target.buffer, left: targetLeft, top: Math.round(baseline - target.height) }
      ])
      .png()
      .toFile(file);
    index.push({ key, frame, sequenceIndex, file: path.relative(outDir, file) });
  }
}

const html = `<!doctype html><meta charset="utf-8"><title>${characterId} individual frame proofs</title><style>body{margin:0;background:#151515;color:white;font-family:sans-serif}h2{margin:14px 10px 6px;font:18px sans-serif}.grid{display:flex;flex-wrap:wrap;gap:12px;padding:10px}img{background:#080808;max-width:none}</style>${animationKeys.map((key) => `<h2>${key}</h2><div class="grid">${index.filter((item) => item.key === key).map((item) => `<img src="${item.file}?t=${Date.now()}" loading="lazy">`).join('')}</div>`).join('')}`;
await fs.writeFile(path.join(outDir, 'index.html'), html);
await fs.writeFile(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2));
console.log(outDir);
console.log(path.join(outDir, 'index.html'));

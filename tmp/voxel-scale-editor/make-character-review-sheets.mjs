import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const repoRoot = process.cwd();
const charactersRoot = path.join(repoRoot, 'public/characters');
const outRoot = path.join(repoRoot, 'tmp/voxel-scale-editor/character-review-sheets');
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

if (!characterId) {
  throw new Error('Usage: node tmp/voxel-scale-editor/make-character-review-sheets.mjs --character=<id>');
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

function svgText(text, x, y, size = 12, weight = 400, color = '#f5f5f5') {
  const escaped = String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
  return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${escaped}</text>`;
}

function keySort(a, b) {
  const ai = stanceOrder.indexOf(a);
  const bi = stanceOrder.indexOf(b);
  if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  return a.localeCompare(b, undefined, { numeric: true });
}

async function renderFrame(frame, pixelsPerUnit) {
  const source = await cropBuffer(frame.file);
  const width = Math.max(1, Math.round(frame.renderWidth * pixelsPerUnit));
  const height = Math.max(1, Math.round(frame.renderHeight * pixelsPerUnit));
  const image = await sharp(source)
    .resize({ width, height, fit: 'fill', kernel: 'nearest' })
    .png()
    .toBuffer();
  return { image, width, height };
}

async function makeSheet({ character, rows, idleFrame, idleWidth, idleHeight, ghost }) {
  const targetIdleHeight = ghost ? 86 : 68;
  const pixelsPerUnit = targetIdleHeight / idleHeight;
  const labelW = 78;
  const gap = ghost ? 18 : 0;
  const rowGap = ghost ? 10 : 1;
  const padX = ghost ? 10 : 0;
  const padY = ghost ? 10 : 0;
  const composites = [];
  const renderedRows = [];
  const idleRendered = await renderFrame(idleFrame, pixelsPerUnit);
  const idleGhost = await sharp(idleRendered.image)
    .ensureAlpha()
    .linear([1, 1, 1, ghost ? 0.2 : 0], [0, 0, 0, 0])
    .png()
    .toBuffer();

  let maxWidth = 0;
  let totalHeight = padY;
  for (const row of rows) {
    const renderedFrames = [];
    let rowW = labelW + padX;
    let rowH = 0;
    for (const frame of row.frames) {
      const rendered = await renderFrame(frame, pixelsPerUnit);
      renderedFrames.push({ frame, rendered });
      rowW += rendered.width + gap;
      rowH = Math.max(rowH, rendered.height, idleRendered.height);
    }
    rowH += ghost ? 32 : 2;
    maxWidth = Math.max(maxWidth, rowW + padX);
    renderedRows.push({ row, renderedFrames, rowH });
    totalHeight += rowH + rowGap;
  }

  const width = Math.max(ghost ? 900 : 456, Math.ceil(maxWidth));
  const height = Math.ceil(totalHeight + padY);
  const background = ghost ? '#ffffff' : '#101010';
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="100%" height="100%" fill="${background}"/>`;

  let y = padY;
  for (const renderedRow of renderedRows) {
    const baseline = y + renderedRow.rowH - (ghost ? 21 : 1);
    svg += svgText(renderedRow.row.key, 1, baseline - 4, 12, 400, ghost ? '#111827' : '#f5f5f5');
    if (ghost) {
      svg += `<line x1="${labelW}" y1="${baseline}" x2="${width - 8}" y2="${baseline}" stroke="#ff3153" stroke-width="2"/>`;
      svg += `<line x1="${labelW}" y1="${baseline - idleHeight * pixelsPerUnit}" x2="${width - 8}" y2="${baseline - idleHeight * pixelsPerUnit}" stroke="#3b82f6" stroke-width="2" stroke-dasharray="6 6"/>`;
    }
    let x = labelW;
    for (const item of renderedRow.renderedFrames) {
      if (ghost) {
        composites.push({
          input: idleGhost,
          left: Math.round(x + item.rendered.width / 2 - idleRendered.width / 2),
          top: Math.round(baseline - idleRendered.height)
        });
      }
      composites.push({
        input: item.rendered.image,
        left: Math.round(x + item.frame.scale.offsetX * pixelsPerUnit),
        top: Math.round(baseline - item.rendered.height)
      });
      if (ghost) {
        svg += svgText(
          `${String(item.frame.frame).padStart(3, '0')} ${item.frame.widthRatio.toFixed(2)}w ${item.frame.heightRatio.toFixed(2)}h`,
          x,
          baseline + 14,
          10,
          400,
          '#475569'
        );
      }
      x += item.rendered.width + gap;
    }
    y += renderedRow.rowH + rowGap;
  }

  svg += '</svg>';
  const file = path.join(outRoot, `${characterId}-${ghost ? 'ghost-secondary' : 'black-primary'}.png`);
  await sharp(Buffer.from(svg), { limitInputPixels: false }).composite(composites).png().toFile(file);
  return file;
}

async function makeBoxSheet({ rows, idleHeight }) {
  const pixelsPerUnit = 86 / idleHeight;
  const labelW = 82;
  const pad = 5;
  const gap = 6;
  const rowGap = 8;
  const composites = [];
  const renderedRows = [];
  let width = 520;
  let height = 8;

  for (const row of rows) {
    const renderedFrames = [];
    let rowWidth = labelW;
    let rowHeight = 0;
    for (const frame of row.frames) {
      const rendered = await renderFrame(frame, pixelsPerUnit);
      renderedFrames.push({ frame, rendered });
      rowWidth += rendered.width + pad * 2 + gap;
      rowHeight = Math.max(rowHeight, rendered.height + pad * 2 + 16);
    }
    rowHeight = Math.max(rowHeight, 34);
    width = Math.max(width, rowWidth + 8);
    height += rowHeight + rowGap;
    renderedRows.push({ row, renderedFrames, rowHeight });
  }

  let svg = `<svg width="${Math.ceil(width)}" height="${Math.ceil(height + 8)}" xmlns="http://www.w3.org/2000/svg">`;
  svg += '<rect width="100%" height="100%" fill="#050505"/>';
  let y = 8;
  for (const renderedRow of renderedRows) {
    const baseline = y + renderedRow.rowHeight - 17;
    svg += svgText(renderedRow.row.key, 1, baseline - 2, 12, 400, '#f5f5f5');
    let x = labelW;
    for (const item of renderedRow.renderedFrames) {
      const boxW = item.rendered.width + pad * 2;
      const boxH = item.rendered.height + pad * 2;
      const boxTop = baseline - item.rendered.height - pad;
      svg += `<rect x="${x}" y="${boxTop}" width="${boxW}" height="${boxH}" fill="#101010" stroke="#555b66" stroke-width="1"/>`;
      composites.push({
        input: item.rendered.image,
        left: Math.round(x + pad + item.frame.scale.offsetX * pixelsPerUnit),
        top: Math.round(baseline - item.rendered.height)
      });
      svg += svgText(String(item.frame.frame).padStart(3, '0'), x + 3, baseline + 12, 10, 400, '#cbd5e1');
      x += boxW + gap;
    }
    y += renderedRow.rowHeight + rowGap;
  }
  svg += '</svg>';
  const file = path.join(outRoot, `${characterId}-black-boxes.png`);
  await sharp(Buffer.from(svg), { limitInputPixels: false }).composite(composites).png().toFile(file);
  return file;
}

const manifestPath = path.join(charactersRoot, characterId, 'character.json');
if (!fsSync.existsSync(manifestPath)) {
  throw new Error(`Character not found: ${characterId}`);
}

const character = await readJson(manifestPath);
const animationKeys = Object.keys(character.animationFrames ?? {})
  .filter((key) => character.animationFrames?.[key]?.length)
  .sort(keySort);

const idleFrames = [];
for (const framePath of character.animationFrames?.idle ?? []) {
  const frame = frameIndexFromPath(framePath);
  const bounds = await voxelBounds(characterId, frame);
  const scale = animationScaleFor(character, 'idle', frame);
  idleFrames.push({
    key: 'idle',
    frame,
    file: path.join(charactersRoot, characterId, 'frames', `frame-${String(frame).padStart(3, '0')}.png`),
    renderWidth: bounds.width * scale.effectiveWidth,
    renderHeight: bounds.height * scale.effectiveHeight,
    scale,
    widthRatio: 1,
    heightRatio: 1
  });
}

if (!idleFrames.length) {
  throw new Error(`Character ${characterId} has no idle animation frames.`);
}

const idleWidth = median(idleFrames.map((item) => item.renderWidth)) || 1;
const idleHeight = median(idleFrames.map((item) => item.renderHeight)) || 1;
const idleFrame = idleFrames[0];
const rows = [];

for (const key of animationKeys) {
  const frames = [];
  for (const framePath of character.animationFrames[key]) {
    const frame = frameIndexFromPath(framePath);
    if (!Number.isFinite(frame)) continue;
    const bounds = await voxelBounds(characterId, frame);
    const scale = animationScaleFor(character, key, frame);
    const renderWidth = bounds.width * scale.effectiveWidth;
    const renderHeight = bounds.height * scale.effectiveHeight;
    frames.push({
      key,
      frame,
      file: path.join(charactersRoot, characterId, 'frames', `frame-${String(frame).padStart(3, '0')}.png`),
      renderWidth,
      renderHeight,
      scale,
      widthRatio: renderWidth / idleWidth,
      heightRatio: renderHeight / idleHeight
    });
  }
  if (frames.length) rows.push({ key, frames });
}

await fs.mkdir(outRoot, { recursive: true });
const blackFile = await makeSheet({ character, rows, idleFrame, idleWidth, idleHeight, ghost: false });
const boxFile = await makeBoxSheet({ rows, idleHeight });
const ghostFile = await makeSheet({ character, rows, idleFrame, idleWidth, idleHeight, ghost: true });
const html = `<!doctype html><meta charset="utf-8"><title>${characterId} review sheets</title><style>body{margin:0;background:#202020;color:white;font-family:sans-serif}h2{font:16px sans-serif;margin:10px}img{display:block;max-width:none;margin:0 0 18px}</style><h2>Black primary</h2><img src="${path.basename(blackFile)}?t=${Date.now()}"><h2>Black variable boxes</h2><img src="${path.basename(boxFile)}?t=${Date.now()}"><h2>White ghost secondary</h2><img src="${path.basename(ghostFile)}?t=${Date.now()}">`;
await fs.writeFile(path.join(outRoot, `${characterId}.html`), html);
console.log(blackFile);
console.log(boxFile);
console.log(ghostFile);

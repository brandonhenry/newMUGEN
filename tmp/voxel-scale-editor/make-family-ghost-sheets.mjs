import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const repoRoot = process.cwd();
const charactersRoot = path.join(repoRoot, 'public/characters');
const outRoot = path.join(repoRoot, 'tmp/voxel-scale-editor/family-ghost-sheets');
const family = process.argv.find((arg) => arg.startsWith('--family='))?.split('=')[1] ?? 'crouchBlock';

const families = {
  crouchBlock: ['crouch', 'block', 'crouchBlock'],
  movement: ['walkForward', 'walkBack', 'sprint', 'sidestepLeft', 'sidestepRight', 'chargeKi'],
  airborne: ['jump', 'backflip', 'juggle'],
  proneRecovery: ['knockdown', 'getupStand', 'getupRollUp', 'getupRollDown', 'getupRollBack', 'lose'],
  reactions: ['hitLight', 'hitHeavy', 'win']
};

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
  const legacy = clamp(character.scale ?? 1, 0.25, 2.5);
  return {
    width: clamp(character.modelScale?.width ?? legacy, 0.25, 2.5),
    height: clamp(character.modelScale?.height ?? legacy, 0.25, 2.5)
  };
}

function animationScaleFor(character, key, frameIndex) {
  const frameScale = character.animationFrameScales?.[key]?.[String(frameIndex)];
  const animationScale = character.animationScales?.[key];
  const selected = frameScale ?? animationScale ?? {};
  const global = globalScale(character);
  const width = clamp(selected.width ?? 1, 0.25, 2.5);
  const height = clamp(selected.height ?? 1, 0.25, 2.5);
  return {
    width,
    height,
    effectiveWidth: width * global.width,
    effectiveHeight: height * global.height,
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

function svgText(text, x, y, size = 12, weight = 400, color = '#111827') {
  const escaped = String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${escaped}</text>`;
}

async function collectCharacters() {
  const entries = await fs.readdir(charactersRoot, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const manifestPath = path.join(charactersRoot, id, 'character.json');
    if (!fsSync.existsSync(manifestPath)) continue;
    const character = await readJson(manifestPath);
    if (character.unplayable || id === 'near' || !character.animationFrames?.idle?.length) continue;
    const idleFrames = [];
    for (const framePath of character.animationFrames.idle) {
      const frame = frameIndexFromPath(framePath);
      const bounds = await voxelBounds(id, frame);
      const scale = animationScaleFor(character, 'idle', frame);
      idleFrames.push({ frame, bounds, scale, renderWidth: bounds.width * scale.effectiveWidth, renderHeight: bounds.height * scale.effectiveHeight });
    }
    out.push({
      id,
      displayName: character.displayName ?? id,
      character,
      idleFrame: idleFrames[0],
      idleWidth: median(idleFrames.map((item) => item.renderWidth)) || 1,
      idleHeight: median(idleFrames.map((item) => item.renderHeight)) || 1
    });
  }
  out.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return out;
}

async function makeSheet(characters, keys) {
  await fs.mkdir(outRoot, { recursive: true });
  const cellW = 104;
  const rowH = 132;
  const leftW = 216;
  const headerH = 32;
  const rows = [];
  for (const entry of characters) {
    for (const key of keys) {
      const framePaths = entry.character.animationFrames?.[key];
      if (!framePaths?.length) continue;
      const frames = [];
      for (const framePath of framePaths) {
        const frame = frameIndexFromPath(framePath);
        const bounds = await voxelBounds(entry.id, frame);
        const scale = animationScaleFor(entry.character, key, frame);
        frames.push({
          key,
          frame,
          file: path.join(charactersRoot, entry.id, 'frames', `frame-${String(frame).padStart(3, '0')}.png`),
          renderWidth: bounds.width * scale.effectiveWidth,
          renderHeight: bounds.height * scale.effectiveHeight,
          scale,
          widthRatio: (bounds.width * scale.effectiveWidth) / entry.idleWidth,
          heightRatio: (bounds.height * scale.effectiveHeight) / entry.idleHeight
        });
      }
      rows.push({ entry, key, frames });
    }
  }
  const maxFrames = Math.max(1, ...rows.map((row) => row.frames.length));
  const width = Math.max(1200, leftW + maxFrames * cellW + 24);
  const rowsPerPage = 22;
  const pageFiles = [];
  for (let pageStart = 0; pageStart < rows.length; pageStart += rowsPerPage) {
  const pageRows = rows.slice(pageStart, pageStart + rowsPerPage);
  const height = headerH + pageRows.length * rowH + 24;
  const composites = [];
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="100%" height="100%" fill="#f8fafc"/>`;
  svg += svgText(`${family} ghost overlay review page ${Math.floor(pageStart / rowsPerPage) + 1}`, 14, 22, 18, 700);
  let y = headerH;
  for (const row of pageRows) {
    const { entry } = row;
    const px = Math.max(10, Math.min(78 / entry.idleHeight, 86 / Math.max(entry.idleWidth, ...row.frames.map((frame) => frame.renderWidth))));
    const baseline = y + rowH - 30;
    const idleTop = baseline - entry.idleHeight * px;
    svg += `<rect x="0" y="${y}" width="${width}" height="${rowH}" fill="#fff" stroke="#d1d5db"/>`;
    svg += svgText(entry.displayName, 12, y + 21, 13, 700);
    svg += svgText(`${entry.id} / ${row.key}`, 12, y + 39, 11, 400, '#475569');
    svg += `<line x1="${leftW}" y1="${baseline}" x2="${width - 16}" y2="${baseline}" stroke="#ff3153" stroke-width="3"/>`;
    svg += `<line x1="${leftW}" y1="${idleTop}" x2="${width - 16}" y2="${idleTop}" stroke="#75a7ff" stroke-width="2" stroke-dasharray="6 6"/>`;
    const idleBuffer = await cropBuffer(path.join(charactersRoot, entry.id, 'frames', `frame-${String(entry.idleFrame.frame).padStart(3, '0')}.png`));
    const idleW = Math.max(1, Math.round(entry.idleFrame.renderWidth * px));
    const idleH = Math.max(1, Math.round(entry.idleFrame.renderHeight * px));
    const idleRendered = await sharp(idleBuffer).resize({ width: idleW, height: idleH, fit: 'fill', kernel: 'nearest' }).modulate({ saturation: 0 }).png().toBuffer();
    for (let i = 0; i < row.frames.length; i += 1) {
      const frame = row.frames[i];
      const x = leftW + i * cellW;
      const idleOpacity = await sharp(idleRendered).ensureAlpha().linear([1, 1, 1, 0.24], [0, 0, 0, 0]).png().toBuffer();
      composites.push({ input: idleOpacity, left: Math.round(x + cellW / 2 - idleW / 2), top: Math.round(baseline - idleH) });
      const source = await cropBuffer(frame.file);
      const renderW = Math.max(1, Math.round(frame.renderWidth * px));
      const renderH = Math.max(1, Math.round(frame.renderHeight * px));
      const rendered = await sharp(source).resize({ width: renderW, height: renderH, fit: 'fill', kernel: 'nearest' }).png().toBuffer();
      composites.push({ input: rendered, left: Math.round(x + cellW / 2 - renderW / 2 + frame.scale.offsetX * 6), top: Math.round(baseline - renderH) });
      svg += svgText(String(frame.frame).padStart(3, '0'), x + 35, baseline + 16, 11, 700);
      svg += svgText(`${frame.widthRatio.toFixed(2)}w ${frame.heightRatio.toFixed(2)}h`, x + 18, baseline + 30, 10, 400, '#64748b');
      svg += svgText(`${frame.scale.width.toFixed(2)} ${frame.scale.height.toFixed(2)}`, x + 25, baseline + 43, 9, 400, '#64748b');
    }
    y += rowH;
  }
  svg += '</svg>';
  const file = path.join(outRoot, `${family}-page-${String(Math.floor(pageStart / rowsPerPage) + 1).padStart(2, '0')}.png`);
  await sharp(Buffer.from(svg), { limitInputPixels: false }).composite(composites).png().toFile(file);
  pageFiles.push(file);
  }
  const html = `<!doctype html><meta charset="utf-8"><title>${family} ghost sheet</title><style>body{margin:0;background:#111;color:white;font-family:sans-serif}img{display:block;max-width:none;margin-bottom:20px}</style>${pageFiles.map((file) => `<img src="${path.basename(file)}?t=${Date.now()}">`).join('')}`;
  await fs.writeFile(path.join(outRoot, `${family}.html`), html);
  return pageFiles;
}

const keys = family === 'attacks'
  ? null
  : families[family];
if (!keys) {
  throw new Error(`Use one of: ${Object.keys(families).join(', ')}`);
}
const characters = await collectCharacters();
const files = await makeSheet(characters, keys);
console.log(files.join('\n'));

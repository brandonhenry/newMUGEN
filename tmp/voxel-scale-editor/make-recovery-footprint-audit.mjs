import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const repoRoot = process.cwd();
const charactersRoot = path.join(repoRoot, 'public/characters');
const outRoot = path.join(repoRoot, 'tmp/voxel-scale-editor/recovery-footprint-audit');
const apply = process.argv.includes('--apply');

const auditKeys = new Set([
  'juggle',
  'knockdown',
  'getupStand',
  'getupRollUp',
  'getupRollDown',
  'getupRollBack',
  'lose',
  'hitLight',
  'hitHeavy'
]);

function frameIndexFromPath(framePath) {
  const match = /frame-(\d+)\.png$/i.exec(framePath);
  return match ? Number(match[1]) : NaN;
}

function pad3(value) {
  return String(value).padStart(3, '0');
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function median(values) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
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
    globalWidth: global.width,
    globalHeight: global.height,
    effectiveWidth: width * global.width,
    effectiveHeight: height * global.height,
    offsetX: clamp(frameScale?.offsetX ?? animationScale?.offsetX ?? 0, -6, 6),
    source: frameScale ? 'frame' : animationScale ? 'animation' : 'default'
  };
}

async function voxelBounds(characterId, frameIndex) {
  const file = path.join(charactersRoot, characterId, 'voxels-hd', `frame-${pad3(frameIndex)}.json`);
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

function classify(row) {
  const longestToIdleHeight = Math.max(row.renderWidth, row.renderHeight) / row.idleHeight;
  const heightToIdle = row.renderHeight / row.idleHeight;
  const widthToIdleHeight = row.renderWidth / row.idleHeight;
  const isProneish = row.key !== 'juggle' && (row.renderWidth > row.renderHeight * 1.18 || heightToIdle < 0.72);
  const scaleDistortion = Math.max(row.scale.width, row.scale.height) / Math.max(0.01, Math.min(row.scale.width, row.scale.height));
  const reasons = [];

  if (scaleDistortion > 1.08) reasons.push('non-uniform-scale-distorts-sprite');
  if (isProneish) {
    if (widthToIdleHeight < 0.78) reasons.push('prone-footprint-too-small-vs-idle-height');
    if (widthToIdleHeight > 1.18) reasons.push('prone-footprint-too-large-vs-idle-height');
    if (heightToIdle > 0.82 && widthToIdleHeight > 1.0) reasons.push('prone-too-tall-for-lying-pose');
  } else {
    if (heightToIdle < 0.78) reasons.push('upright-recovery-too-small-vs-idle-height');
    if (heightToIdle > 1.22) reasons.push('upright-recovery-too-large-vs-idle-height');
  }

  return { isProneish, longestToIdleHeight, heightToIdle, widthToIdleHeight, scaleDistortion, reasons };
}

function proposedScale(row, classification) {
  const currentUniform = Math.sqrt(row.scale.width * row.scale.height);
  const currentRenderedTarget = classification.isProneish ? row.renderWidth : row.renderHeight;
  const target = row.idleHeight * (classification.isProneish ? 0.96 : 1.0);
  let next = currentUniform * target / Math.max(0.01, currentRenderedTarget);
  if (classification.scaleDistortion > 1.08 && classification.reasons.length === 1) next = currentUniform;
  return {
    width: round(clamp(next, 0.25, 2.5)),
    height: round(clamp(next, 0.25, 2.5)),
    offsetX: row.scale.offsetX
  };
}

async function collect() {
  const rows = [];
  const entries = await fs.readdir(charactersRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    if (id === 'near') continue;
    const manifestPath = path.join(charactersRoot, id, 'character.json');
    if (!fsSync.existsSync(manifestPath)) continue;
    const character = await readJson(manifestPath);
    if (character.unplayable || !character.animationFrames?.idle?.length) continue;

    const idleSizes = [];
    for (const framePath of character.animationFrames.idle) {
      const frame = frameIndexFromPath(framePath);
      if (!Number.isFinite(frame)) continue;
      const bounds = await voxelBounds(id, frame);
      const scale = animationScaleFor(character, 'idle', frame);
      idleSizes.push({ width: bounds.width * scale.effectiveWidth, height: bounds.height * scale.effectiveHeight });
    }
    const idleWidth = median(idleSizes.map((item) => item.width)) || 1;
    const idleHeight = median(idleSizes.map((item) => item.height)) || 1;

    for (const key of auditKeys) {
      const framePaths = character.animationFrames?.[key];
      if (!Array.isArray(framePaths) || !framePaths.length) continue;
      for (const framePath of framePaths) {
        const frame = frameIndexFromPath(framePath);
        if (!Number.isFinite(frame)) continue;
        const bounds = await voxelBounds(id, frame);
        const scale = animationScaleFor(character, key, frame);
        const renderWidth = bounds.width * scale.effectiveWidth;
        const renderHeight = bounds.height * scale.effectiveHeight;
        const row = {
          id,
          displayName: character.displayName ?? character.name ?? id,
          key,
          frame,
          file: path.join(charactersRoot, id, 'frames', `frame-${pad3(frame)}.png`),
          idleWidth,
          idleHeight,
          rawWidth: bounds.width,
          rawHeight: bounds.height,
          renderWidth,
          renderHeight,
          scale
        };
        const classification = classify(row);
        if (!classification.reasons.length) continue;
        const nextScale = proposedScale(row, classification);
        if (
          Math.abs(nextScale.width - scale.width) < 0.005
          && Math.abs(nextScale.height - scale.height) < 0.005
          && Math.abs(scale.width - scale.height) < 0.005
        ) continue;
        rows.push({
          ...row,
          ...classification,
          reasons: classification.reasons,
          nextScale,
          before: {
            widthToIdleHeight: round(classification.widthToIdleHeight),
            heightToIdle: round(classification.heightToIdle),
            longestToIdleHeight: round(classification.longestToIdleHeight),
            scale: { width: scale.width, height: scale.height, offsetX: scale.offsetX }
          },
          after: {
            scale: nextScale
          }
        });
      }
    }
  }
  rows.sort((a, b) => (
    a.displayName.localeCompare(b.displayName, undefined, { numeric: true })
    || a.key.localeCompare(b.key, undefined, { numeric: true })
    || a.frame - b.frame
  ));
  return rows;
}

async function applyRows(rows) {
  const byId = new Map();
  for (const row of rows) {
    if (!byId.has(row.id)) byId.set(row.id, await readJson(path.join(charactersRoot, row.id, 'character.json')));
    const character = byId.get(row.id);
    character.animationFrameScales ??= {};
    character.animationFrameScales[row.key] ??= {};
    character.animationFrameScales[row.key][String(row.frame)] = row.nextScale;
  }
  for (const [id, character] of byId.entries()) {
    await fs.writeFile(path.join(charactersRoot, id, 'character.json'), `${JSON.stringify(character, null, 2)}\n`);
  }
}

async function makeSheets(rows) {
  await fs.mkdir(outRoot, { recursive: true });
  const pageWidth = 1500;
  const cellW = 250;
  const cellH = 200;
  const cols = 6;
  const rowsPerPage = 4;
  const perPage = cols * rowsPerPage;
  const pageFiles = [];
  for (let start = 0; start < rows.length; start += perPage) {
    const items = rows.slice(start, start + perPage);
    const page = Math.floor(start / perPage) + 1;
    const height = 50 + rowsPerPage * cellH + 24;
    const composites = [];
    let svg = `<svg width="${pageWidth}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += '<rect width="100%" height="100%" fill="#f8fafc"/>';
    svg += svgText(`Recovery/juggle footprint candidates page ${page}`, 16, 30, 21, 700);
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * cellW + 10;
      const y = 50 + row * cellH;
      const baseline = y + cellH - 44;
      const px = Math.min(80 / item.idleHeight, 112 / Math.max(item.renderWidth, item.idleHeight), 80 / Math.max(item.renderHeight, item.idleHeight));
      svg += `<rect x="${x}" y="${y}" width="${cellW - 14}" height="${cellH - 10}" fill="#fff" stroke="#cbd5e1"/>`;
      svg += svgText(item.displayName, x + 8, y + 18, 12, 700);
      svg += svgText(`${item.id} / ${item.key} / ${pad3(item.frame)}`, x + 8, y + 34, 10, 400, '#475569');
      svg += `<line x1="${x + 8}" y1="${baseline}" x2="${x + cellW - 24}" y2="${baseline}" stroke="#ff3153" stroke-width="3"/>`;
      svg += `<line x1="${x + 8}" y1="${baseline - item.idleHeight * px}" x2="${x + cellW - 24}" y2="${baseline - item.idleHeight * px}" stroke="#75a7ff" stroke-width="2" stroke-dasharray="6 6"/>`;
      const source = await cropBuffer(item.file);
      const renderW = Math.max(1, Math.round(item.renderWidth * px));
      const renderH = Math.max(1, Math.round(item.renderHeight * px));
      const rendered = await sharp(source).resize({ width: renderW, height: renderH, fit: 'fill', kernel: 'nearest' }).png().toBuffer();
      composites.push({ input: rendered, left: Math.round(x + cellW / 2 - renderW / 2), top: Math.round(baseline - renderH) });
      svg += svgText(`${item.before.widthToIdleHeight}wH ${item.before.heightToIdle}h`, x + 8, baseline + 16, 10, 400, '#334155');
      svg += svgText(`${item.scale.width.toFixed(2)}x${item.scale.height.toFixed(2)} -> ${item.nextScale.width.toFixed(2)}`, x + 8, baseline + 31, 10, 400, '#b91c1c');
      svg += svgText(item.reasons.join(', ').slice(0, 34), x + 8, baseline + 46, 9, 400, '#b91c1c');
    }
    svg += '</svg>';
    const file = path.join(outRoot, `candidates-page-${pad3(page)}.png`);
    await sharp(Buffer.from(svg), { limitInputPixels: false }).composite(composites).png().toFile(file);
    pageFiles.push(file);
  }
  await fs.writeFile(
    path.join(outRoot, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>Recovery footprint audit</title><style>body{margin:0;background:#111;color:white;font-family:system-ui,sans-serif}.wrap{padding:16px}img{display:block;max-width:100%;height:auto;margin-bottom:20px}</style><div class="wrap"><h1>Recovery footprint audit</h1><p>${rows.length} candidates. Apply mode: ${apply}</p></div>${pageFiles.map((file) => `<img src="${path.basename(file)}?t=${Date.now()}">`).join('')}`
  );
  return pageFiles;
}

await fs.rm(outRoot, { recursive: true, force: true });
await fs.mkdir(outRoot, { recursive: true });
const rows = await collect();
if (apply) await applyRows(rows);
const pages = await makeSheets(rows);
await fs.writeFile(path.join(outRoot, 'candidates.json'), `${JSON.stringify({ apply, candidates: rows }, null, 2)}\n`);
await fs.writeFile(
  path.join(outRoot, 'candidates.csv'),
  [
    'characterId,displayName,key,frame,reasons,widthToIdleHeight,heightToIdle,currentWidth,currentHeight,nextWidth,nextHeight',
    ...rows.map((row) => [
      row.id,
      `"${String(row.displayName).replaceAll('"', '""')}"`,
      row.key,
      row.frame,
      `"${row.reasons.join(';')}"`,
      row.before.widthToIdleHeight,
      row.before.heightToIdle,
      row.scale.width,
      row.scale.height,
      row.nextScale.width,
      row.nextScale.height
    ].join(','))
  ].join('\n')
);
console.log(JSON.stringify({
  apply,
  candidates: rows.length,
  touchedCharacters: [...new Set(rows.map((row) => row.id))].length,
  outRoot: path.relative(repoRoot, outRoot),
  pages: pages.map((file) => path.relative(repoRoot, file))
}, null, 2));

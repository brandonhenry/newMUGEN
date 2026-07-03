import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const repoRoot = process.cwd();
const charactersRoot = path.join(repoRoot, 'public/characters');
const outRoot = path.join(repoRoot, 'tmp/voxel-scale-editor/idle-gap-review');
const gapThreshold = Number(process.argv.find((arg) => arg.startsWith('--gap='))?.split('=')[1] ?? 0.18);
const localDipThreshold = Number(process.argv.find((arg) => arg.startsWith('--dip='))?.split('=')[1] ?? 0.17);
const bodyGapThreshold = Number(process.argv.find((arg) => arg.startsWith('--body-gap='))?.split('=')[1] ?? 0.22);

const excludedKeys = new Set([
  'idle',
  'crouch',
  'crouchBlock',
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

async function croppedRaw(file) {
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
  if (maxX < minX || maxY < minY) return { data, info };
  return sharp(file)
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

function colorBin(r, g, b) {
  return `${r >> 4},${g >> 4},${b >> 4}`;
}

async function idleColorBins(file) {
  const { data, info } = await croppedRaw(file);
  const bins = new Set();
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * 4;
      if (data[offset + 3] <= 32) continue;
      bins.add(colorBin(data[offset], data[offset + 1], data[offset + 2]));
    }
  }
  return bins;
}

function hasNearbyBin(bins, r, g, b) {
  const br = r >> 4;
  const bg = g >> 4;
  const bb = b >> 4;
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dg = -1; dg <= 1; dg += 1) {
      for (let db = -1; db <= 1; db += 1) {
        if (bins.has(`${br + dr},${bg + dg},${bb + db}`)) return true;
      }
    }
  }
  return false;
}

async function idleColorBodyBounds(file, bins) {
  const { data, info } = await croppedRaw(file);
  const mask = new Uint8Array(info.width * info.height);
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * 4;
      if (data[offset + 3] <= 32) continue;
      if (hasNearbyBin(bins, data[offset], data[offset + 1], data[offset + 2])) {
        mask[y * info.width + x] = 1;
      }
    }
  }

  const visited = new Uint8Array(mask.length);
  let best = null;
  const stack = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    visited[start] = 1;
    stack.push(start);
    let area = 0;
    let minX = info.width;
    let maxX = -1;
    let minY = info.height;
    let maxY = -1;
    while (stack.length) {
      const current = stack.pop();
      const x = current % info.width;
      const y = Math.floor(current / info.width);
      area += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          if (!ox && !oy) continue;
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || nx >= info.width || ny < 0 || ny >= info.height) continue;
          const next = ny * info.width + nx;
          if (!mask[next] || visited[next]) continue;
          visited[next] = 1;
          stack.push(next);
        }
      }
    }
    if (area < 8) continue;
    const component = { area, minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
    const reachesLowerBody = maxY >= info.height * 0.35;
    if (!best || (reachesLowerBody && !best.reachesLowerBody) || (reachesLowerBody === best.reachesLowerBody && area > best.area)) {
      best = { ...component, reachesLowerBody };
    }
  }

  if (!best) return { width: info.width, height: info.height, cropWidth: info.width, cropHeight: info.height, area: 0 };
  return { ...best, cropWidth: info.width, cropHeight: info.height };
}

function svgText(text, x, y, size = 12, weight = 400, color = '#111827') {
  const escaped = String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
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
      idleFrames.push({
        frame,
        bounds,
        scale,
        renderWidth: bounds.width * scale.effectiveWidth,
        renderHeight: bounds.height * scale.effectiveHeight
      });
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

async function collectRows() {
  const rows = [];
  const report = [];
  for (const entry of await collectCharacters()) {
    const idleBins = await idleColorBins(path.join(charactersRoot, entry.id, 'frames', `frame-${String(entry.idleFrame.frame).padStart(3, '0')}.png`));
    const keys = Object.keys(entry.character.animationFrames ?? {})
      .filter((key) => entry.character.animationFrames?.[key]?.length && !excludedKeys.has(key))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const key of keys) {
      const frames = [];
      for (const framePath of entry.character.animationFrames[key]) {
        const frame = frameIndexFromPath(framePath);
        const bounds = await voxelBounds(entry.id, frame);
        const scale = animationScaleFor(entry.character, key, frame);
        const renderWidth = bounds.width * scale.effectiveWidth;
        const renderHeight = bounds.height * scale.effectiveHeight;
        const bodyBounds = await idleColorBodyBounds(path.join(charactersRoot, entry.id, 'frames', `frame-${String(frame).padStart(3, '0')}.png`), idleBins);
        const bodyRenderHeight = renderHeight * (bodyBounds.height / Math.max(1, bodyBounds.cropHeight));
        frames.push({
          key,
          frame,
          file: path.join(charactersRoot, entry.id, 'frames', `frame-${String(frame).padStart(3, '0')}.png`),
          rawWidth: bounds.width * globalScale(entry.character).width,
          rawHeight: bounds.height * globalScale(entry.character).height,
          renderWidth,
          renderHeight,
          scale,
          widthRatio: renderWidth / entry.idleWidth,
          heightRatio: renderHeight / entry.idleHeight,
          gapRatio: Math.max(0, entry.idleHeight - renderHeight) / entry.idleHeight,
          bodyHeightRatio: bodyRenderHeight / entry.idleHeight,
          bodyGapRatio: Math.max(0, entry.idleHeight - bodyRenderHeight) / entry.idleHeight,
          localDip: 0,
          suspect: false,
          reasons: []
        });
      }
      const localReference = median(frames.map((frame) => frame.heightRatio).filter((ratio) => ratio > 0.84 && ratio < 1.24)) || median(frames.map((frame) => frame.heightRatio)) || 1;
      for (const frame of frames) {
        frame.localDip = Math.max(0, localReference - frame.heightRatio);
        if (frame.gapRatio >= gapThreshold && frame.heightRatio < 0.9) {
          frame.suspect = true;
          frame.reasons.push(`idle-gap:${frame.gapRatio.toFixed(2)}`);
        }
        if (frame.localDip >= localDipThreshold && frame.heightRatio < 0.95) {
          frame.suspect = true;
          frame.reasons.push(`seq-dip:${frame.localDip.toFixed(2)}`);
        }
        if (frame.bodyGapRatio >= bodyGapThreshold && frame.heightRatio >= 0.9) {
          frame.suspect = true;
          frame.reasons.push(`body-gap:${frame.bodyGapRatio.toFixed(2)}`);
        }
      }
      if (!frames.some((frame) => frame.suspect)) continue;
      rows.push({ entry, key, frames, localReference });
      for (const frame of frames.filter((item) => item.suspect)) {
        report.push({
          character: entry.id,
          displayName: entry.displayName,
          key,
          frame: frame.frame,
          heightRatio: Number(frame.heightRatio.toFixed(3)),
          widthRatio: Number(frame.widthRatio.toFixed(3)),
          gapRatio: Number(frame.gapRatio.toFixed(3)),
          bodyHeightRatio: Number(frame.bodyHeightRatio.toFixed(3)),
          bodyGapRatio: Number(frame.bodyGapRatio.toFixed(3)),
          localDip: Number(frame.localDip.toFixed(3)),
          scaleWidth: frame.scale.width,
          scaleHeight: frame.scale.height,
          source: frame.scale.source,
          reasons: frame.reasons
        });
      }
    }
  }
  return { rows, report };
}

async function makeSheet(rows) {
  await fs.mkdir(outRoot, { recursive: true });
  const cellW = 104;
  const rowH = 132;
  const leftW = 244;
  const headerH = 34;
  const rowsPerPage = 18;
  const files = [];
  for (let pageStart = 0; pageStart < rows.length; pageStart += rowsPerPage) {
    const pageRows = rows.slice(pageStart, pageStart + rowsPerPage);
    const maxFrames = Math.max(1, ...pageRows.map((row) => row.frames.length));
    const width = Math.max(1400, leftW + maxFrames * cellW + 24);
    const height = headerH + pageRows.length * rowH + 24;
    const composites = [];
    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<rect width="100%" height="100%" fill="#f8fafc"/>`;
    svg += svgText(`idle gap candidates page ${Math.floor(pageStart / rowsPerPage) + 1} (gap >= ${gapThreshold}, local dip >= ${localDipThreshold}, body gap >= ${bodyGapThreshold})`, 14, 23, 18, 700);
    let y = headerH;
    for (const row of pageRows) {
      const { entry } = row;
      const px = Math.max(10, Math.min(78 / entry.idleHeight, 86 / Math.max(entry.idleWidth, ...row.frames.map((frame) => frame.renderWidth))));
      const baseline = y + rowH - 30;
      const idleTop = baseline - entry.idleHeight * px;
      svg += `<rect x="0" y="${y}" width="${width}" height="${rowH}" fill="#fff" stroke="#d1d5db"/>`;
      svg += svgText(entry.displayName, 12, y + 21, 13, 700);
      svg += svgText(`${entry.id} / ${row.key}`, 12, y + 39, 11, 400, '#475569');
      svg += svgText(`seq ref ${row.localReference.toFixed(2)}h`, 12, y + 57, 10, 400, '#64748b');
      svg += `<line x1="${leftW}" y1="${baseline}" x2="${width - 16}" y2="${baseline}" stroke="#ff3153" stroke-width="3"/>`;
      svg += `<line x1="${leftW}" y1="${idleTop}" x2="${width - 16}" y2="${idleTop}" stroke="#75a7ff" stroke-width="2" stroke-dasharray="6 6"/>`;
      const idleBuffer = await cropBuffer(path.join(charactersRoot, entry.id, 'frames', `frame-${String(entry.idleFrame.frame).padStart(3, '0')}.png`));
      const idleW = Math.max(1, Math.round(entry.idleFrame.renderWidth * px));
      const idleH = Math.max(1, Math.round(entry.idleFrame.renderHeight * px));
      const idleRendered = await sharp(idleBuffer)
        .resize({ width: idleW, height: idleH, fit: 'fill', kernel: 'nearest' })
        .modulate({ saturation: 0 })
        .ensureAlpha()
        .linear([1, 1, 1, 0.24], [0, 0, 0, 0])
        .png()
        .toBuffer();
      for (let i = 0; i < row.frames.length; i += 1) {
        const frame = row.frames[i];
        const x = leftW + i * cellW;
        composites.push({ input: idleRendered, left: Math.round(x + cellW / 2 - idleW / 2), top: Math.round(baseline - idleH) });
        const source = await cropBuffer(frame.file);
        const renderW = Math.max(1, Math.round(frame.renderWidth * px));
        const renderH = Math.max(1, Math.round(frame.renderHeight * px));
        const rendered = await sharp(source).resize({ width: renderW, height: renderH, fit: 'fill', kernel: 'nearest' }).png().toBuffer();
        composites.push({ input: rendered, left: Math.round(x + cellW / 2 - renderW / 2 + frame.scale.offsetX * 6), top: Math.round(baseline - renderH) });
        if (frame.suspect) {
          svg += `<rect x="${x + 4}" y="${y + 4}" width="${cellW - 8}" height="${rowH - 12}" fill="none" stroke="#ef4444" stroke-width="2"/>`;
        }
        svg += svgText(String(frame.frame).padStart(3, '0'), x + 35, baseline + 16, 11, 700);
        svg += svgText(`${frame.widthRatio.toFixed(2)}w ${frame.heightRatio.toFixed(2)}h`, x + 17, baseline + 30, 10, 400, frame.suspect ? '#b91c1c' : '#64748b');
        svg += svgText(`gap ${frame.gapRatio.toFixed(2)} body ${frame.bodyGapRatio.toFixed(2)}`, x + 10, baseline + 43, 9, 400, frame.suspect ? '#b91c1c' : '#64748b');
      }
      y += rowH;
    }
    svg += '</svg>';
    const file = path.join(outRoot, `idle-gap-candidates-page-${String(files.length + 1).padStart(2, '0')}.png`);
    await sharp(Buffer.from(svg), { limitInputPixels: false }).composite(composites).png().toFile(file);
    files.push(file);
  }
  const html = `<!doctype html><meta charset="utf-8"><title>Idle Gap Candidates</title><style>body{margin:0;background:#111;color:white;font-family:sans-serif}img{display:block;max-width:none;margin-bottom:20px}</style>${files.map((file) => `<img src="${path.basename(file)}?t=${Date.now()}">`).join('')}`;
  await fs.writeFile(path.join(outRoot, 'idle-gap-candidates.html'), html);
  return files;
}

const { rows, report } = await collectRows();
await fs.mkdir(outRoot, { recursive: true });
await fs.writeFile(path.join(outRoot, 'idle-gap-candidates.json'), JSON.stringify(report, null, 2));
const csv = [
  'character,displayName,key,frame,widthRatio,heightRatio,gapRatio,bodyHeightRatio,bodyGapRatio,localDip,scaleWidth,scaleHeight,source,reasons',
  ...report.map((item) => [
    item.character,
    JSON.stringify(item.displayName),
    JSON.stringify(item.key),
    item.frame,
    item.widthRatio,
    item.heightRatio,
    item.gapRatio,
    item.bodyHeightRatio,
    item.bodyGapRatio,
    item.localDip,
    item.scaleWidth,
    item.scaleHeight,
    item.source,
    JSON.stringify(item.reasons.join('|'))
  ].join(','))
].join('\n');
await fs.writeFile(path.join(outRoot, 'idle-gap-candidates.csv'), csv);
const files = await makeSheet(rows);
console.log(`rows=${rows.length} candidates=${report.length}`);
console.log(files.map((file) => path.resolve(file)).join('\n'));

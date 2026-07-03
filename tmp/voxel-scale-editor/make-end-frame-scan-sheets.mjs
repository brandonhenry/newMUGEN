import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const repoRoot = process.cwd();
const charactersRoot = path.join(repoRoot, 'public/characters');
const outRoot = path.join(repoRoot, 'tmp/voxel-scale-editor/end-frame-scan');

function frameIndexFromPath(framePath) {
  const match = /frame-(\d+)\.png$/i.exec(framePath);
  return match ? Number(match[1]) : NaN;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
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
  return sharp(file)
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .png()
    .toBuffer();
}

function svgText(text, x, y, size = 12, weight = 400, color = '#111827') {
  const escaped = String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
  return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${escaped}</text>`;
}

async function collectRows() {
  const rows = [];
  const entries = await fs.readdir(charactersRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const manifestPath = path.join(charactersRoot, id, 'character.json');
    if (!fsSync.existsSync(manifestPath)) continue;
    const character = await readJson(manifestPath);
    if (character.unplayable || id === 'near' || !character.animationFrames?.idle?.length) continue;
    for (const [key, framePaths] of Object.entries(character.animationFrames ?? {})) {
      if (!Array.isArray(framePaths) || !framePaths.length) continue;
      const tail = framePaths.slice(-3).map((framePath) => ({
        frame: frameIndexFromPath(framePath),
        file: path.join(charactersRoot, id, 'frames', `frame-${String(frameIndexFromPath(framePath)).padStart(3, '0')}.png`)
      })).filter((item) => Number.isFinite(item.frame) && fsSync.existsSync(item.file));
      rows.push({
        id,
        displayName: character.displayName ?? id,
        key,
        count: framePaths.length,
        tail
      });
    }
  }
  rows.sort((a, b) => (
    a.displayName.localeCompare(b.displayName, undefined, { numeric: true })
    || a.key.localeCompare(b.key, undefined, { numeric: true })
  ));
  return rows;
}

async function makeSheets(rows) {
  await fs.rm(outRoot, { recursive: true, force: true });
  await fs.mkdir(outRoot, { recursive: true });
  const width = 1220;
  const leftW = 310;
  const cellW = 150;
  const rowH = 128;
  const headerH = 34;
  const rowsPerPage = 18;
  const pageFiles = [];
  for (let pageStart = 0; pageStart < rows.length; pageStart += rowsPerPage) {
    const pageRows = rows.slice(pageStart, pageStart + rowsPerPage);
    const height = headerH + pageRows.length * rowH + 24;
    const composites = [];
    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += '<rect width="100%" height="100%" fill="#f8fafc"/>';
    svg += svgText(`End-frame source scan page ${Math.floor(pageStart / rowsPerPage) + 1}`, 14, 23, 18, 700);
    let y = headerH;
    for (const row of pageRows) {
      svg += `<rect x="0" y="${y}" width="${width}" height="${rowH}" fill="#fff" stroke="#d1d5db"/>`;
      svg += svgText(row.displayName, 12, y + 22, 13, 700);
      svg += svgText(`${row.id} / ${row.key} (${row.count} frames)`, 12, y + 42, 11, 400, '#475569');
      svg += `<line x1="${leftW}" y1="${y + rowH - 28}" x2="${width - 18}" y2="${y + rowH - 28}" stroke="#ff3153" stroke-width="3"/>`;
      for (let i = 0; i < row.tail.length; i += 1) {
        const item = row.tail[i];
        const x = leftW + i * cellW;
        const source = await cropBuffer(item.file);
        const meta = await sharp(source).metadata();
        const maxW = 118;
        const maxH = 88;
        const scale = Math.min(maxW / Math.max(1, meta.width), maxH / Math.max(1, meta.height), 4);
        const renderW = Math.max(1, Math.round(meta.width * scale));
        const renderH = Math.max(1, Math.round(meta.height * scale));
        const rendered = await sharp(source).resize({ width: renderW, height: renderH, fit: 'fill', kernel: 'nearest' }).png().toBuffer();
        composites.push({ input: rendered, left: Math.round(x + cellW / 2 - renderW / 2), top: Math.round(y + rowH - 28 - renderH) });
        svg += svgText(String(item.frame).padStart(3, '0'), x + 55, y + rowH - 8, 12, 700);
      }
      y += rowH;
    }
    svg += '</svg>';
    const file = path.join(outRoot, `end-frames-page-${String(Math.floor(pageStart / rowsPerPage) + 1).padStart(2, '0')}.png`);
    await sharp(Buffer.from(svg), { limitInputPixels: false }).composite(composites).png().toFile(file);
    pageFiles.push(file);
  }
  const html = `<!doctype html><meta charset="utf-8"><title>End-frame source scan</title><style>body{margin:0;background:#111;color:white;font-family:sans-serif}img{display:block;max-width:none;margin-bottom:20px}</style>${pageFiles.map((file) => `<img src="${path.basename(file)}?t=${Date.now()}">`).join('')}`;
  await fs.writeFile(path.join(outRoot, 'index.html'), html);
  return pageFiles;
}

const rows = await collectRows();
const files = await makeSheets(rows);
console.log(files.join('\n'));
console.log(`rows=${rows.length}`);

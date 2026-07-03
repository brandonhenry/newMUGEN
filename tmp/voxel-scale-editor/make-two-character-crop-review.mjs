import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const repoRoot = process.cwd();
const charactersRoot = path.join(repoRoot, 'public/characters');
const outRoot = path.join(repoRoot, 'tmp/voxel-scale-editor/two-character-crop-review');
const alphaThreshold = 16;

function pad3(value) {
  return String(value).padStart(3, '0');
}

function frameIndexFromFile(file) {
  const match = /frame-(\d+)\.png$/i.exec(path.basename(file));
  return match ? Number(match[1]) : NaN;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function listCharacterIds() {
  const entries = await fs.readdir(charactersRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && fsSync.existsSync(path.join(charactersRoot, entry.name, 'character.json')))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function findAlphaBounds(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let area = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] <= alphaThreshold) continue;
      area += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return maxX >= minX ? { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1, area } : null;
}

function findComponents(data, width, height) {
  const visited = new Uint8Array(width * height);
  const components = [];
  const queue = [];
  const dirs = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1]
  ];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (visited[start] || data[start * 4 + 3] <= alphaThreshold) continue;
      visited[start] = 1;
      queue.length = 0;
      queue.push(start);
      let qi = 0;
      let area = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;

      while (qi < queue.length) {
        const index = queue[qi++];
        const cx = index % width;
        const cy = Math.floor(index / width);
        area += 1;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        for (const [dx, dy] of dirs) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const next = ny * width + nx;
          if (visited[next] || data[next * 4 + 3] <= alphaThreshold) continue;
          visited[next] = 1;
          queue.push(next);
        }
      }

      components.push({
        area,
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2
      });
    }
  }
  return components.sort((a, b) => b.area - a.area);
}

function classifyFrame(bounds, components) {
  if (!bounds || components.length < 2) return null;
  const meaningful = components.filter((component) => {
    if (component.area < 24) return false;
    if (component.width < 5 || component.height < 5) return false;
    if (component.area / bounds.area < 0.025) return false;
    return true;
  });
  if (meaningful.length < 2) return null;

  const [largest, second] = meaningful;
  const areaRatio = second.area / largest.area;
  const verticalSeparation = Math.abs(second.centerY - largest.centerY) / Math.max(1, Math.max(largest.height, second.height));
  const horizontalSeparation = Math.abs(second.centerX - largest.centerX) / Math.max(1, Math.max(largest.width, second.width));
  const bothBodySized = areaRatio >= 0.28 && second.height >= largest.height * 0.45 && second.width >= largest.width * 0.35;
  const stackedBodySized = bothBodySized && verticalSeparation >= 0.55;
  const sideBySideBodySized = bothBodySized && horizontalSeparation >= 0.7;
  const manyMajor = meaningful.filter((component) => component.area / largest.area >= 0.18).length >= 3;

  if (!stackedBodySized && !sideBySideBodySized && !manyMajor) return null;
  return {
    reason: stackedBodySized ? 'stacked-body-sized-components' : sideBySideBodySized ? 'side-by-side-body-sized-components' : 'many-major-components',
    componentCount: components.length,
    meaningfulCount: meaningful.length,
    areaRatio: Number(areaRatio.toFixed(3)),
    verticalSeparation: Number(verticalSeparation.toFixed(3)),
    horizontalSeparation: Number(horizontalSeparation.toFixed(3)),
    components: meaningful.slice(0, 5)
  };
}

function svgText(text, x, y, size = 12, weight = 400, color = '#111827') {
  const escaped = String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
  return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${escaped}</text>`;
}

async function cropToAlpha(file) {
  const image = sharp(file).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const bounds = findAlphaBounds(data, info.width, info.height);
  if (!bounds) return { buffer: await fs.readFile(file), bounds: null, meta: info };
  const pad = 3;
  const left = Math.max(0, bounds.minX - pad);
  const top = Math.max(0, bounds.minY - pad);
  const right = Math.min(info.width - 1, bounds.maxX + pad);
  const bottom = Math.min(info.height - 1, bounds.maxY + pad);
  return {
    buffer: await sharp(file).extract({ left, top, width: right - left + 1, height: bottom - top + 1 }).png().toBuffer(),
    bounds,
    meta: info
  };
}

async function scanFrame(character, file) {
  const image = sharp(file).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const bounds = findAlphaBounds(data, info.width, info.height);
  const components = findComponents(data, info.width, info.height);
  const classification = classifyFrame(bounds, components);
  if (!classification) return null;
  return {
    characterId: character.id,
    displayName: character.displayName ?? character.name ?? character.id,
    unplayable: Boolean(character.unplayable),
    frameIndex: frameIndexFromFile(file),
    file,
    width: info.width,
    height: info.height,
    bounds,
    ...classification
  };
}

async function collectCandidates() {
  const candidates = [];
  for (const id of await listCharacterIds()) {
    const character = await readJson(path.join(charactersRoot, id, 'character.json'));
    const framesDir = path.join(charactersRoot, id, 'frames');
    if (!fsSync.existsSync(framesDir)) continue;
    const files = (await fs.readdir(framesDir))
      .filter((file) => /^frame-\d+\.png$/i.test(file))
      .sort((a, b) => frameIndexFromFile(a) - frameIndexFromFile(b))
      .map((file) => path.join(framesDir, file));
    for (const file of files) {
      const candidate = await scanFrame({ ...character, id }, file);
      if (candidate) candidates.push(candidate);
    }
  }
  candidates.sort((a, b) => (
    Number(a.unplayable) - Number(b.unplayable)
    || a.displayName.localeCompare(b.displayName, undefined, { numeric: true })
    || a.frameIndex - b.frameIndex
  ));
  return candidates;
}

async function writeIndividualCandidates(candidates) {
  const framesOut = path.join(outRoot, 'frames');
  await fs.mkdir(framesOut, { recursive: true });
  for (const candidate of candidates) {
    const { buffer } = await cropToAlpha(candidate.file);
    const meta = await sharp(buffer).metadata();
    const scale = Math.min(8, Math.max(1, Math.floor(220 / Math.max(meta.width ?? 1, meta.height ?? 1))));
    const rendered = await sharp(buffer)
      .resize({ width: Math.max(1, (meta.width ?? 1) * scale), height: Math.max(1, (meta.height ?? 1) * scale), fit: 'fill', kernel: 'nearest' })
      .png()
      .toBuffer();
    const outFile = path.join(framesOut, `${candidate.characterId}-frame-${pad3(candidate.frameIndex)}.png`);
    await sharp({
      create: {
        width: (meta.width ?? 1) * scale + 24,
        height: (meta.height ?? 1) * scale + 48,
        channels: 4,
        background: '#ffffff'
      }
    })
      .composite([
        { input: rendered, left: 12, top: 10 },
        {
          input: Buffer.from(`<svg width="${(meta.width ?? 1) * scale + 24}" height="48" xmlns="http://www.w3.org/2000/svg">${svgText(`${candidate.displayName} / ${pad3(candidate.frameIndex)}`, 12, 24, 18, 700)}${svgText(candidate.reason, 12, 42, 12, 400, '#475569')}</svg>`),
          left: 0,
          top: (meta.height ?? 1) * scale + 6
        }
      ])
      .png()
      .toFile(outFile);
    candidate.reviewImage = path.relative(outRoot, outFile);
  }
}

async function makeContactSheets(candidates) {
  const pageFiles = [];
  const pageWidth = 1400;
  const cellW = 280;
  const cellH = 210;
  const cols = 5;
  const rowsPerPage = 4;
  const perPage = cols * rowsPerPage;

  for (let start = 0; start < candidates.length; start += perPage) {
    const items = candidates.slice(start, start + perPage);
    const page = Math.floor(start / perPage) + 1;
    const height = 44 + rowsPerPage * cellH + 24;
    const composites = [];
    let svg = `<svg width="${pageWidth}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += '<rect width="100%" height="100%" fill="#f8fafc"/>';
    svg += svgText(`Possible two-character source crops page ${page}`, 16, 28, 20, 700);
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * cellW + 10;
      const y = 44 + row * cellH;
      svg += `<rect x="${x}" y="${y}" width="${cellW - 14}" height="${cellH - 10}" fill="#fff" stroke="#cbd5e1"/>`;
      svg += svgText(`${item.displayName}`, x + 8, y + 20, 13, 700);
      svg += svgText(`${item.characterId} / ${pad3(item.frameIndex)}`, x + 8, y + 38, 11, 400, '#475569');
      svg += svgText(`${item.reason} ratio ${item.areaRatio}`, x + 8, y + cellH - 16, 10, 400, '#b91c1c');

      const { buffer } = await cropToAlpha(item.file);
      const meta = await sharp(buffer).metadata();
      const maxW = cellW - 34;
      const maxH = cellH - 76;
      const scale = Math.min(maxW / Math.max(1, meta.width ?? 1), maxH / Math.max(1, meta.height ?? 1), 5);
      const renderW = Math.max(1, Math.round((meta.width ?? 1) * scale));
      const renderH = Math.max(1, Math.round((meta.height ?? 1) * scale));
      const rendered = await sharp(buffer).resize({ width: renderW, height: renderH, fit: 'fill', kernel: 'nearest' }).png().toBuffer();
      composites.push({ input: rendered, left: Math.round(x + (cellW - 14) / 2 - renderW / 2), top: Math.round(y + 46 + (maxH - renderH) / 2) });
    }
    svg += '</svg>';
    const file = path.join(outRoot, `candidates-page-${pad3(page)}.png`);
    await sharp(Buffer.from(svg), { limitInputPixels: false }).composite(composites).png().toFile(file);
    pageFiles.push(file);
  }

  const html = `<!doctype html><meta charset="utf-8"><title>Two-character crop review</title><style>body{margin:0;background:#111;color:white;font-family:system-ui,sans-serif}a{color:#67e8f9}img{display:block;max-width:100%;height:auto;margin:0 0 20px}.wrap{padding:14px}</style><div class="wrap"><h1>Two-character crop review</h1><p>${candidates.length} candidates. Individual zooms are in <a href="frames/">frames/</a>.</p></div>${pageFiles.map((file) => `<img src="${path.basename(file)}?t=${Date.now()}">`).join('')}`;
  await fs.writeFile(path.join(outRoot, 'index.html'), html);
  return pageFiles;
}

await fs.rm(outRoot, { recursive: true, force: true });
await fs.mkdir(outRoot, { recursive: true });
const candidates = await collectCandidates();
await writeIndividualCandidates(candidates);
const pageFiles = await makeContactSheets(candidates);
await fs.writeFile(path.join(outRoot, 'candidates.json'), `${JSON.stringify(candidates, null, 2)}\n`);
await fs.writeFile(
  path.join(outRoot, 'candidates.csv'),
  [
    'characterId,displayName,unplayable,frameIndex,reason,areaRatio,verticalSeparation,horizontalSeparation,file,reviewImage',
    ...candidates.map((item) => [
      item.characterId,
      `"${String(item.displayName).replaceAll('"', '""')}"`,
      item.unplayable,
      item.frameIndex,
      item.reason,
      item.areaRatio,
      item.verticalSeparation,
      item.horizontalSeparation,
      path.relative(repoRoot, item.file),
      item.reviewImage
    ].join(','))
  ].join('\n')
);

console.log(`candidates=${candidates.length}`);
console.log(`out=${outRoot}`);
console.log(pageFiles.join('\n'));

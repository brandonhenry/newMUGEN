import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const repoRoot = process.argv.includes('--repo')
  ? path.resolve(process.argv[process.argv.indexOf('--repo') + 1])
  : process.cwd();
const outRoot = path.join(repoRoot, 'tmp/voxel-visual-proof');
const charactersRoot = path.join(repoRoot, 'public/characters');
const excludedIds = new Set(['near']);
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
const proneKeys = new Set(['knockdown', 'getupStand', 'getupRollUp', 'getupRollDown', 'getupRollBack', 'lose']);
const crouchKeys = new Set(['crouch', 'crouchBlock']);
const airborneKeys = new Set(['jump', 'backflip', 'juggle']);
const reactionKeys = new Set(['hitLight', 'hitHeavy']);

function escapeCsv(value) {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function median(values) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (clean.length === 0) return 0;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

function frameIndexFromPath(framePath) {
  const match = /frame-(\d+)\.png$/i.exec(framePath);
  return match ? Number(match[1]) : NaN;
}

function framePngPath(characterId, frameIndex) {
  return path.join(charactersRoot, characterId, 'frames', `frame-${String(frameIndex).padStart(3, '0')}.png`);
}

function frameVoxelPath(characterId, frameIndex) {
  return path.join(charactersRoot, characterId, 'voxels-hd', `frame-${String(frameIndex).padStart(3, '0')}.json`);
}

function voxelBounds(payload) {
  const voxels = Array.isArray(payload?.voxels) ? payload.voxels : [];
  if (voxels.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const voxel of voxels) {
    minX = Math.min(minX, voxel.x - voxel.w / 2);
    maxX = Math.max(maxX, voxel.x + voxel.w / 2);
    minY = Math.min(minY, voxel.y - voxel.h / 2);
    maxY = Math.max(maxY, voxel.y + voxel.h / 2);
    minZ = Math.min(minZ, voxel.z - voxel.d / 2);
    maxZ = Math.max(maxZ, voxel.z + voxel.d / 2);
  }
  return {
    width: maxX - minX,
    height: maxY - minY,
    depth: maxZ - minZ,
    minX,
    maxX,
    minY,
    maxY
  };
}

function effectiveScale(character, key, frameIndex) {
  const model = character.modelScale ?? {};
  const animationScale = character.animationScales?.[key] ?? {};
  const frameScale = character.animationFrameScales?.[key]?.[String(frameIndex)];
  const selected = frameScale ?? animationScale;
  return {
    width: Number(model.width ?? 1) * Number(selected.width ?? 1),
    height: Number(model.height ?? 1) * Number(selected.height ?? 1),
    offsetX: Number(selected.offsetX ?? animationScale.offsetX ?? 0),
    source: frameScale ? 'frame' : animationScale.width != null || animationScale.height != null ? 'animation' : 'default'
  };
}

async function alphaBox(pngPath) {
  const image = sharp(pngPath).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let maxX = -1;
  let minY = info.height;
  let maxY = -1;
  let opaque = 0;
  const colorSet = new Set();
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const i = (y * info.width + x) * 4;
      const alpha = data[i + 3];
      if (alpha <= 12) continue;
      opaque += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      if (colorSet.size < 128) colorSet.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    }
  }
  if (maxX < 0 || maxY < 0) {
    return { width: info.width, height: info.height, x: 0, y: 0, w: 0, h: 0, opaque, colors: colorSet.size, blank: true };
  }
  return {
    width: info.width,
    height: info.height,
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
    opaque,
    colors: colorSet.size,
    blank: false
  };
}

async function connectedComponentSignal(pngPath) {
  const meta = await sharp(pngPath).metadata();
  const maxSide = 96;
  const ratio = Math.min(1, maxSide / Math.max(meta.width ?? 1, meta.height ?? 1));
  const width = Math.max(1, Math.round((meta.width ?? 1) * ratio));
  const height = Math.max(1, Math.round((meta.height ?? 1) * ratio));
  const { data, info } = await sharp(pngPath)
    .resize(width, height, { fit: 'fill', kernel: 'nearest' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const seen = new Uint8Array(info.width * info.height);
  const components = [];
  const stack = [];
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = y * info.width + x;
      if (seen[index] || data[index * 4 + 3] <= 16) continue;
      seen[index] = 1;
      stack.push(index);
      let area = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      while (stack.length > 0) {
        const current = stack.pop();
        const cx = current % info.width;
        const cy = Math.floor(current / info.width);
        area += 1;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (nx < 0 || ny < 0 || nx >= info.width || ny >= info.height) continue;
          const ni = ny * info.width + nx;
          if (seen[ni] || data[ni * 4 + 3] <= 16) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
      components.push({ area, minX, maxX, minY, maxY });
    }
  }
  components.sort((a, b) => b.area - a.area);
  const total = components.reduce((sum, part) => sum + part.area, 0);
  const large = components.filter((part) => part.area > total * 0.12 && part.area > 28);
  const separatedLarge = large.length >= 2 && Math.abs(((large[0].minX + large[0].maxX) / 2) - ((large[1].minX + large[1].maxX) / 2)) > info.width * 0.28;
  return { components: components.length, largeComponents: large.length, separatedLarge };
}

function keySort(a, b) {
  const ai = stanceOrder.indexOf(a);
  const bi = stanceOrder.indexOf(b);
  if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  return a.localeCompare(b, undefined, { numeric: true });
}

function animationClass(key) {
  if (proneKeys.has(key)) return 'prone';
  if (crouchKeys.has(key)) return 'crouch';
  if (airborneKeys.has(key)) return 'airborne';
  if (reactionKeys.has(key)) return 'reaction';
  if (key === 'idle') return 'idle';
  return 'standing';
}

function classifyFrame(metric) {
  if (metric.missingFrame || metric.missingVoxel || metric.blankSprite || metric.blankVoxel) return 'FAIL';
  return metric.flags.length > 0 ? 'REVIEW' : 'PASS';
}

function flagMetric(metric, animationMetrics) {
  const flags = [];
  if (metric.componentSignal?.separatedLarge) flags.push('possible-two-character-crop');
  if (metric.spriteColors <= 1 && metric.opaquePixels > 0) flags.push('low-color-frame');
  if (metric.className === 'standing' || metric.className === 'idle' || metric.className === 'reaction') {
    if (metric.heightRatio < 0.58) flags.push('tiny-height-vs-idle');
    if (metric.heightRatio > 1.48) flags.push('huge-height-vs-idle');
    if (metric.widthRatio > 2.65 && !metric.key.startsWith('cmd:')) flags.push('wide-body-vs-idle');
  }
  if (metric.className === 'crouch') {
    if (metric.heightRatio < 0.34) flags.push('tiny-crouch-vs-idle');
    if (metric.heightRatio > 1.18) flags.push('tall-crouch-vs-idle');
  }
  if (metric.className === 'prone') {
    if (metric.maxFootprintToIdleHeight < 0.34) flags.push('tiny-prone-footprint-vs-idle-height');
    if (metric.maxFootprintToIdleHeight > 1.25) flags.push('huge-prone-footprint-vs-idle-height');
  }
  const sameAnimation = animationMetrics.filter((candidate) => candidate.key === metric.key);
  const medianHeight = median(sameAnimation.map((candidate) => candidate.renderHeight));
  const medianFootprint = median(sameAnimation.map((candidate) => Math.max(candidate.renderWidth, candidate.renderHeight)));
  if (sameAnimation.length >= 3 && metric.className !== 'airborne') {
    if (medianHeight > 0 && metric.renderHeight / medianHeight < 0.55) flags.push('tiny-frame-vs-animation');
    if (medianHeight > 0 && metric.renderHeight / medianHeight > 1.58) flags.push('huge-frame-vs-animation');
    if (metric.className === 'prone' && medianFootprint > 0 && Math.max(metric.renderWidth, metric.renderHeight) / medianFootprint > 1.55) {
      flags.push('huge-prone-frame-vs-animation');
    }
  }
  return flags;
}

async function loadRoster() {
  const entries = await fs.readdir(charactersRoot, { withFileTypes: true });
  const roster = [];
  const skipped = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(charactersRoot, entry.name, 'character.json');
    try {
      const character = await readJson(manifestPath);
      const idleFrames = character.animationFrames?.idle ?? [];
      if (character.unplayable) {
        skipped.push({ id: character.id ?? entry.name, displayName: character.displayName ?? entry.name, reason: 'unplayable' });
        continue;
      }
      if (excludedIds.has(character.id ?? entry.name)) {
        skipped.push({ id: character.id ?? entry.name, displayName: character.displayName ?? entry.name, reason: 'user-excluded' });
        continue;
      }
      if (idleFrames.length === 0) {
        skipped.push({ id: character.id ?? entry.name, displayName: character.displayName ?? entry.name, reason: 'no-idle-animation' });
        continue;
      }
      roster.push({ id: character.id ?? entry.name, displayName: character.displayName ?? entry.name, manifestPath, character });
    } catch (error) {
      skipped.push({ id: entry.name, displayName: entry.name, reason: `manifest-error:${error.message}` });
    }
  }
  roster.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return { roster, skipped };
}

async function collectCharacterMetrics(entry) {
  const { id, character } = entry;
  const animationFrames = character.animationFrames ?? {};
  const keys = Object.keys(animationFrames)
    .filter((key) => Array.isArray(animationFrames[key]) && animationFrames[key].length > 0)
    .sort(keySort);
  const cache = new Map();
  async function frameFacts(framePath) {
    const frameIndex = frameIndexFromPath(framePath);
    if (cache.has(frameIndex)) return cache.get(frameIndex);
    const pngPath = framePngPath(id, frameIndex);
    const voxelPath = frameVoxelPath(id, frameIndex);
    let missingFrame = false;
    let missingVoxel = false;
    let spriteBox = null;
    let componentSignal = null;
    let bounds = null;
    try {
      await fs.access(pngPath);
      spriteBox = await alphaBox(pngPath);
      componentSignal = await connectedComponentSignal(pngPath);
    } catch {
      missingFrame = true;
    }
    try {
      const voxel = await readJson(voxelPath);
      bounds = voxelBounds(voxel);
    } catch {
      missingVoxel = true;
    }
    const facts = { frameIndex, pngPath, voxelPath, missingFrame, missingVoxel, spriteBox, componentSignal, bounds };
    cache.set(frameIndex, facts);
    return facts;
  }

  const idleRawMetrics = [];
  for (const framePath of animationFrames.idle ?? []) {
    const facts = await frameFacts(framePath);
    if (!facts.bounds) continue;
    const scale = effectiveScale(character, 'idle', facts.frameIndex);
    idleRawMetrics.push({
      renderWidth: facts.bounds.width * scale.width,
      renderHeight: facts.bounds.height * scale.height,
      spriteHeight: (facts.spriteBox?.h ?? 0) * scale.height
    });
  }
  const idleWidth = median(idleRawMetrics.map((metric) => metric.renderWidth));
  const idleHeight = median(idleRawMetrics.map((metric) => metric.renderHeight));
  const idleSpriteHeight = median(idleRawMetrics.map((metric) => metric.spriteHeight));
  const metrics = [];
  for (const key of keys) {
    const className = animationClass(key);
    for (const framePath of animationFrames[key]) {
      const facts = await frameFacts(framePath);
      const scale = effectiveScale(character, key, facts.frameIndex);
      const renderWidth = facts.bounds ? facts.bounds.width * scale.width : 0;
      const renderHeight = facts.bounds ? facts.bounds.height * scale.height : 0;
      const metric = {
        characterId: id,
        displayName: entry.displayName,
        key,
        className,
        framePath,
        frameIndex: facts.frameIndex,
        pngPath: facts.pngPath,
        voxelPath: facts.voxelPath,
        missingFrame: facts.missingFrame,
        missingVoxel: facts.missingVoxel,
        blankSprite: Boolean(facts.spriteBox?.blank),
        blankVoxel: !facts.missingVoxel && !facts.bounds,
        rawWidth: facts.bounds?.width ?? 0,
        rawHeight: facts.bounds?.height ?? 0,
        renderWidth,
        renderHeight,
        idleWidth,
        idleHeight,
        widthRatio: idleWidth > 0 ? renderWidth / idleWidth : 0,
        heightRatio: idleHeight > 0 ? renderHeight / idleHeight : 0,
        maxFootprintToIdleHeight: idleHeight > 0 ? Math.max(renderWidth, renderHeight) / idleHeight : 0,
        scaleWidth: scale.width,
        scaleHeight: scale.height,
        scaleSource: scale.source,
        offsetX: scale.offsetX,
        spriteBox: facts.spriteBox,
        componentSignal: facts.componentSignal,
        opaquePixels: facts.spriteBox?.opaque ?? 0,
        spriteColors: facts.spriteBox?.colors ?? 0,
        flags: []
      };
      metrics.push(metric);
    }
  }
  for (const metric of metrics) {
    metric.flags = flagMetric(metric, metrics);
    metric.status = classifyFrame(metric);
  }
  return { ...entry, keys, metrics, idleWidth, idleHeight, idleSpriteHeight };
}

function svgText(text, x, y, size = 14, weight = 400, color = '#17202a') {
  const escaped = String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
  return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${escaped}</text>`;
}

async function cropPngBuffer(metric) {
  const box = metric.spriteBox;
  if (!box || box.blank || metric.missingFrame) return null;
  return sharp(metric.pngPath)
    .extract({ left: box.x, top: box.y, width: box.w, height: box.h })
    .png()
    .toBuffer();
}

async function makeCharacterSheet(characterAudit) {
  const rows = [];
  const grouped = new Map();
  for (const metric of characterAudit.metrics) {
    if (!grouped.has(metric.key)) grouped.set(metric.key, []);
    grouped.get(metric.key).push(metric);
  }
  for (const key of characterAudit.keys) rows.push({ key, metrics: grouped.get(key) ?? [] });
  const cellW = 104;
  const cellH = 126;
  const headerH = 42;
  const rowGap = 9;
  const leftPad = 18;
  const maxFrames = Math.max(1, ...rows.map((row) => row.metrics.length));
  const width = Math.max(960, Math.min(2600, leftPad * 2 + maxFrames * cellW));
  const contentMaxW = width - leftPad * 2;
  const height = headerH + rows.length * (cellH + rowGap) + 22;
  const maxRenderWidth = Math.max(...characterAudit.metrics.map((metric) => metric.renderWidth), characterAudit.idleWidth);
  const maxRenderHeight = Math.max(...characterAudit.metrics.map((metric) => metric.renderHeight), characterAudit.idleHeight);
  const pxPerWorld = Math.max(
    12,
    Math.min(74 / Math.max(0.01, characterAudit.idleHeight), (cellW - 14) / Math.max(0.01, maxRenderWidth), (cellH - 42) / Math.max(0.01, maxRenderHeight))
  );
  const composites = [];
  const statusCounts = {
    PASS: characterAudit.metrics.filter((metric) => metric.status === 'PASS').length,
    REVIEW: characterAudit.metrics.filter((metric) => metric.status === 'REVIEW').length,
    FAIL: characterAudit.metrics.filter((metric) => metric.status === 'FAIL').length
  };
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="100%" height="100%" fill="#f8fafc"/>`;
  svg += svgText(`${characterAudit.displayName} (${characterAudit.id})`, leftPad, 23, 18, 700);
  svg += svgText(`animations ${rows.length} | frames ${characterAudit.metrics.length} | PASS ${statusCounts.PASS} | REVIEW ${statusCounts.REVIEW} | FAIL ${statusCounts.FAIL}`, leftPad, 39, 12, 400, '#4b5563');
  let y = headerH;
  for (const row of rows) {
    const rowStatus = row.metrics.some((metric) => metric.status === 'FAIL') ? 'FAIL' : row.metrics.some((metric) => metric.status === 'REVIEW') ? 'REVIEW' : 'PASS';
    const statusColor = rowStatus === 'FAIL' ? '#b91c1c' : rowStatus === 'REVIEW' ? '#b45309' : '#047857';
    svg += `<rect x="0" y="${y - 1}" width="${width}" height="${cellH + 1}" fill="#ffffff" stroke="#d1d5db"/>`;
    svg += svgText(`${row.key} (${row.metrics.length})`, leftPad, y + 17, 13, 700, statusColor);
    svg += svgText(row.metrics.flatMap((metric) => metric.flags).slice(0, 3).join(', '), leftPad + 215, y + 17, 11, 400, '#6b7280');
    const baselineY = y + cellH - 22;
    const idleTopY = baselineY - characterAudit.idleHeight * pxPerWorld;
    svg += `<line x1="${leftPad}" y1="${baselineY}" x2="${width - leftPad}" y2="${baselineY}" stroke="#e11d48" stroke-width="2"/>`;
    svg += `<line x1="${leftPad}" y1="${idleTopY}" x2="${width - leftPad}" y2="${idleTopY}" stroke="#2563eb" stroke-width="1" stroke-dasharray="4 4"/>`;
    for (let i = 0; i < row.metrics.length; i += 1) {
      const metric = row.metrics[i];
      const x = leftPad + i * cellW;
      const renderW = Math.max(1, Math.round(metric.renderWidth * pxPerWorld));
      const renderH = Math.max(1, Math.round(metric.renderHeight * pxPerWorld));
      const imageBuffer = await cropPngBuffer(metric);
      if (imageBuffer) {
        const resized = await sharp(imageBuffer)
          .resize({ width: renderW, height: renderH, fit: 'inside', withoutEnlargement: false })
          .png()
          .toBuffer();
        const imgMeta = await sharp(resized).metadata();
        composites.push({
          input: resized,
          left: Math.round(x + cellW / 2 - (imgMeta.width ?? renderW) / 2 + metric.offsetX * 6),
          top: Math.round(baselineY - (imgMeta.height ?? renderH))
        });
      } else {
        svg += `<rect x="${x + 22}" y="${baselineY - 58}" width="60" height="40" fill="#fee2e2" stroke="#b91c1c"/>`;
        svg += svgText('MISSING', x + 26, baselineY - 34, 10, 700, '#b91c1c');
      }
      const labelColor = metric.status === 'FAIL' ? '#b91c1c' : metric.status === 'REVIEW' ? '#b45309' : '#4b5563';
      svg += svgText(String(metric.frameIndex).padStart(3, '0'), x + 35, baselineY + 14, 10, 400, labelColor);
      svg += svgText(`${metric.heightRatio.toFixed(2)}h ${metric.widthRatio.toFixed(2)}w`, x + 18, baselineY + 27, 9, 400, labelColor);
      if (metric.status !== 'PASS') svg += `<circle cx="${x + cellW - 13}" cy="${y + 17}" r="5" fill="${labelColor}"/>`;
    }
    y += cellH + rowGap;
  }
  svg += '</svg>';
  const sheet = await sharp(Buffer.from(svg)).composite(composites).png().toBuffer();
  const outFile = path.join(outRoot, 'sheets', `${characterAudit.id}.png`);
  await fs.writeFile(outFile, sheet);
  return outFile;
}

async function makeReviewPages(characterAudits) {
  const sheetFiles = characterAudits.map((audit) => path.join(outRoot, 'sheets', `${audit.id}.png`));
  const pageFiles = [];
  const pageWidth = 1600;
  const pageHeight = 2000;
  let page = 1;
  let composites = [];
  let y = 0;
  for (const sheetFile of sheetFiles) {
    const source = sharp(sheetFile);
    const meta = await source.metadata();
    const scale = Math.min(1, pageWidth / (meta.width ?? pageWidth), pageHeight / (meta.height ?? pageHeight));
    const targetWidth = Math.min(pageWidth, Math.max(1, Math.floor((meta.width ?? pageWidth) * scale)));
    const targetHeight = Math.min(pageHeight, Math.max(1, Math.floor((meta.height ?? pageHeight) * scale)));
    const resized = await source.resize({ width: targetWidth, height: targetHeight, fit: 'inside' }).png().toBuffer();
    const resizedMeta = await sharp(resized).metadata();
    if (y > 0 && y + (resizedMeta.height ?? 0) > pageHeight) {
      const pageFile = path.join(outRoot, 'pages', `page-${String(page).padStart(2, '0')}.png`);
      await sharp({ create: { width: pageWidth, height: pageHeight, channels: 4, background: '#f8fafc' } }).composite(composites).png().toFile(pageFile);
      pageFiles.push(pageFile);
      page += 1;
      composites = [];
      y = 0;
    }
    composites.push({ input: resized, left: 0, top: y });
    y += (resizedMeta.height ?? 0) + 18;
  }
  if (composites.length > 0) {
    const pageFile = path.join(outRoot, 'pages', `page-${String(page).padStart(2, '0')}.png`);
    await sharp({ create: { width: pageWidth, height: pageHeight, channels: 4, background: '#f8fafc' } }).composite(composites).png().toFile(pageFile);
    pageFiles.push(pageFile);
  }
  return pageFiles;
}

async function writeReport(characterAudits, skipped, pageFiles) {
  const allMetrics = characterAudits.flatMap((audit) => audit.metrics);
  const counts = {
    characters: characterAudits.length,
    animations: characterAudits.reduce((sum, audit) => sum + audit.keys.length, 0),
    frames: allMetrics.length,
    pass: allMetrics.filter((metric) => metric.status === 'PASS').length,
    review: allMetrics.filter((metric) => metric.status === 'REVIEW').length,
    fail: allMetrics.filter((metric) => metric.status === 'FAIL').length
  };
  const suspectRows = allMetrics.filter((metric) => metric.status !== 'PASS');
  const csvRows = [
    ['characterId', 'displayName', 'animation', 'frame', 'status', 'flags', 'widthRatio', 'heightRatio', 'footprintToIdleHeight', 'scaleWidth', 'scaleHeight', 'scaleSource', 'offsetX', 'framePath', 'voxelPath'].join(',')
  ];
  for (const metric of allMetrics) {
    csvRows.push([
      metric.characterId,
      metric.displayName,
      metric.key,
      metric.frameIndex,
      metric.status,
      metric.flags.join('|'),
      metric.widthRatio.toFixed(4),
      metric.heightRatio.toFixed(4),
      metric.maxFootprintToIdleHeight.toFixed(4),
      metric.scaleWidth.toFixed(4),
      metric.scaleHeight.toFixed(4),
      metric.scaleSource,
      metric.offsetX.toFixed(4),
      path.relative(repoRoot, metric.pngPath),
      path.relative(repoRoot, metric.voxelPath)
    ].map(escapeCsv).join(','));
  }
  await fs.writeFile(path.join(outRoot, 'metrics', 'frame-metrics.csv'), csvRows.join('\n'));
  await fs.writeFile(path.join(outRoot, 'metrics', 'suspects.json'), JSON.stringify(suspectRows, null, 2));
  await fs.writeFile(path.join(outRoot, 'metrics', 'included-characters.json'), JSON.stringify(characterAudits.map((audit) => ({
    id: audit.id,
    displayName: audit.displayName,
    animations: audit.keys.length,
    frames: audit.metrics.length,
    sheet: path.relative(repoRoot, path.join(outRoot, 'sheets', `${audit.id}.png`))
  })), null, 2));
  await fs.writeFile(path.join(outRoot, 'metrics', 'skipped-characters.json'), JSON.stringify(skipped, null, 2));

  const lines = [];
  lines.push('# Exhaustive KORE Voxel Visual Proof Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Included playable idle-backed characters: ${counts.characters}`);
  lines.push(`- Skipped characters: ${skipped.length}`);
  lines.push(`- Audited animation sequences: ${counts.animations}`);
  lines.push(`- Audited frame references: ${counts.frames}`);
  lines.push(`- PASS frame checks: ${counts.pass}`);
  lines.push(`- REVIEW frame checks: ${counts.review}`);
  lines.push(`- FAIL frame checks: ${counts.fail}`);
  lines.push('');
  lines.push('## Evidence');
  lines.push('');
  lines.push('- Per-character sheets: `tmp/voxel-visual-proof/sheets/`');
  lines.push('- Review pages: `tmp/voxel-visual-proof/pages/`');
  lines.push('- Metrics CSV: `tmp/voxel-visual-proof/metrics/frame-metrics.csv`');
  lines.push('- Suspect details: `tmp/voxel-visual-proof/metrics/suspects.json`');
  lines.push('- Included roster: `tmp/voxel-visual-proof/metrics/included-characters.json`');
  lines.push('- Skipped roster: `tmp/voxel-visual-proof/metrics/skipped-characters.json`');
  lines.push('');
  lines.push('## Review Pages');
  lines.push('');
  for (const pageFile of pageFiles) lines.push(`- ${path.relative(repoRoot, pageFile)}`);
  lines.push('');
  lines.push('## Suspects');
  lines.push('');
  if (suspectRows.length === 0) {
    lines.push('No `REVIEW` or `FAIL` candidates were found by the proof metrics.');
  } else {
    for (const metric of suspectRows.slice(0, 250)) {
      lines.push(`- ${metric.status}: ${metric.displayName} \`${metric.key}\` frame ${String(metric.frameIndex).padStart(3, '0')} (${metric.flags.join(', ') || 'asset problem'})`);
    }
    if (suspectRows.length > 250) lines.push(`- ... ${suspectRows.length - 250} additional suspect frames in suspects.json`);
  }
  lines.push('');
  lines.push('## Skipped Characters');
  lines.push('');
  for (const skip of skipped) lines.push(`- ${skip.displayName} (${skip.id}): ${skip.reason}`);
  lines.push('');
  lines.push('## Status Meaning');
  lines.push('');
  lines.push('- `PASS`: no missing assets, no blank voxels/sprites, and no scale/crop metric exceeded the review thresholds.');
  lines.push('- `REVIEW`: frame exists but should be visually inspected because metrics found a possible scale/crop outlier.');
  lines.push('- `FAIL`: missing/blank source or voxel asset.');
  await fs.writeFile(path.join(outRoot, 'report.md'), lines.join('\n'));
  return counts;
}

async function main() {
  await fs.mkdir(path.join(outRoot, 'sheets'), { recursive: true });
  await fs.mkdir(path.join(outRoot, 'pages'), { recursive: true });
  await fs.mkdir(path.join(outRoot, 'metrics'), { recursive: true });
  const { roster, skipped } = await loadRoster();
  const audits = [];
  for (const entry of roster) {
    process.stdout.write(`auditing ${entry.displayName} (${entry.id})...\n`);
    const audit = await collectCharacterMetrics(entry);
    await makeCharacterSheet(audit);
    audits.push(audit);
  }
  const pageFiles = await makeReviewPages(audits);
  const counts = await writeReport(audits, skipped, pageFiles);
  console.log(JSON.stringify({ outRoot: path.relative(repoRoot, outRoot), ...counts }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const repoRoot = process.cwd();
const charactersRoot = path.join(repoRoot, 'public/characters');
const outRoot = path.join(repoRoot, 'tmp/voxel-scale-editor/family-ghost-sheets/ghost-difference-review');

const options = {
  heightLow: numberArg('--height-low', 0.97),
  heightHigh: numberArg('--height-high', 1.08),
  bodyHeightLow: numberArg('--body-height-low', 0.92),
  bodyHeightHigh: numberArg('--body-height-high', 1.12),
  widthLow: numberArg('--width-low', 0.82),
  widthHigh: numberArg('--width-high', 1.55),
  nonAttackWidthHigh: numberArg('--non-attack-width-high', 1.24),
  areaLow: numberArg('--area-low', 0.72),
  areaHigh: numberArg('--area-high', 1.45),
  includeNear: process.argv.includes('--include-near')
};

const knownNonAttackKeys = new Set([
  'idle',
  'walkForward',
  'walkBack',
  'sprint',
  'sidestepLeft',
  'sidestepRight',
  'jump',
  'backflip',
  'crouch',
  'block',
  'crouchBlock',
  'chargeKi',
  'hitLight',
  'hitHeavy',
  'juggle',
  'knockdown',
  'getupStand',
  'getupRollUp',
  'getupRollDown',
  'getupRollBack',
  'lose',
  'win'
]);

function numberArg(name, fallback) {
  const raw = process.argv.find((arg) => arg.startsWith(`${name}=`))?.split('=')[1];
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
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
  return {
    width,
    height,
    effectiveWidth: width * global.width,
    effectiveHeight: height * global.height,
    offsetX: clamp(selected.offsetX ?? animationScale?.offsetX ?? 0, -8, 8),
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

async function alphaCropRaw(file) {
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

function colorBin(r, g, b) {
  return `${r >> 4},${g >> 4},${b >> 4}`;
}

async function idleColorBins(file) {
  const { data, info } = await alphaCropRaw(file);
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
  const { data, info } = await alphaCropRaw(file);
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
  const stack = [];
  const components = [];
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
    components.push({ area, minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 });
  }

  components.sort((a, b) => b.area - a.area);
  const best = components[0];
  if (!best) {
    return { width: info.width, height: info.height, cropWidth: info.width, cropHeight: info.height, area: 0, componentCount: 0 };
  }
  const second = components.find((item) => item.area >= best.area * 0.24);
  return {
    ...best,
    cropWidth: info.width,
    cropHeight: info.height,
    componentCount: components.length,
    hasLargeSecondComponent: Boolean(second && second !== best)
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

function isAttackKey(key) {
  return !knownNonAttackKeys.has(key);
}

function poseWidthReference(entry, frame, key) {
  const looksProne = frame.heightRatio < 0.78 && frame.renderWidth > frame.renderHeight * 1.15;
  const recoveryLike = /knockdown|getup|lose|juggle/i.test(key);
  if (looksProne || recoveryLike) return { value: entry.idleHeight, label: 'idleH' };
  return { value: entry.idleWidth, label: 'idleW' };
}

async function collectCharacters() {
  const entries = await fs.readdir(charactersRoot, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    if (id === 'near' && !options.includeNear) continue;
    const manifestPath = path.join(charactersRoot, id, 'character.json');
    if (!fsSync.existsSync(manifestPath)) continue;
    const character = await readJson(manifestPath);
    if (character.unplayable || !character.animationFrames?.idle?.length) continue;
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
      idleHeight: median(idleFrames.map((item) => item.renderHeight)) || 1,
      idleArea: (median(idleFrames.map((item) => item.renderWidth)) || 1) * (median(idleFrames.map((item) => item.renderHeight)) || 1)
    });
  }
  out.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return out;
}

async function collectRows() {
  const rows = [];
  const report = [];
  const characters = await collectCharacters();
  for (const entry of characters) {
    const idleFile = path.join(charactersRoot, entry.id, 'frames', `frame-${String(entry.idleFrame.frame).padStart(3, '0')}.png`);
    const idleBins = await idleColorBins(idleFile);
    const explicitScaleUses = new Map();
    for (const [scaleKey, frameScales] of Object.entries(entry.character.animationFrameScales ?? {})) {
      for (const [frame, scale] of Object.entries(frameScales ?? {})) {
        if (!explicitScaleUses.has(frame)) explicitScaleUses.set(frame, []);
        explicitScaleUses.get(frame).push({
          key: scaleKey,
          width: Number(scale.width ?? 1),
          height: Number(scale.height ?? 1)
        });
      }
    }
    const keys = Object.keys(entry.character.animationFrames ?? {})
      .filter((key) => key !== 'idle' && entry.character.animationFrames?.[key]?.length)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    for (const key of keys) {
      const frames = [];
      for (const framePath of entry.character.animationFrames[key]) {
        const frame = frameIndexFromPath(framePath);
        const file = path.join(charactersRoot, entry.id, 'frames', `frame-${String(frame).padStart(3, '0')}.png`);
        const bounds = await voxelBounds(entry.id, frame);
        const scale = animationScaleFor(entry.character, key, frame);
        const renderWidth = bounds.width * scale.effectiveWidth;
        const renderHeight = bounds.height * scale.effectiveHeight;
        const bodyBounds = await idleColorBodyBounds(file, idleBins);
        const bodyRenderWidth = renderWidth * (bodyBounds.width / Math.max(1, bodyBounds.cropWidth));
        const bodyRenderHeight = renderHeight * (bodyBounds.height / Math.max(1, bodyBounds.cropHeight));
        const item = {
          key,
          frame,
          file,
          bounds,
          renderWidth,
          renderHeight,
          bodyRenderWidth,
          bodyRenderHeight,
          bodyBounds,
          scale,
          isAttack: isAttackKey(key),
          widthRatio: renderWidth / entry.idleWidth,
          heightRatio: renderHeight / entry.idleHeight,
          bodyWidthRatio: bodyRenderWidth / entry.idleWidth,
          bodyHeightRatio: bodyRenderHeight / entry.idleHeight,
          areaRatio: (renderWidth * renderHeight) / entry.idleArea,
          bodyAreaRatio: (bodyRenderWidth * bodyRenderHeight) / entry.idleArea,
          expectedWidthRatio: 1,
          expectedWidthLabel: 'idleW',
          suspect: false,
          reasons: []
        };
        const widthReference = poseWidthReference(entry, item, key);
        item.expectedWidthRatio = renderWidth / widthReference.value;
        item.expectedWidthLabel = widthReference.label;
        frames.push(item);
      }

      const localHeight = median(frames.map((frame) => frame.heightRatio).filter((ratio) => ratio > 0.72 && ratio < 1.35)) || median(frames.map((frame) => frame.heightRatio)) || 1;
      const localBodyHeight = median(frames.map((frame) => frame.bodyHeightRatio).filter((ratio) => ratio > 0.55 && ratio < 1.35)) || median(frames.map((frame) => frame.bodyHeightRatio)) || 1;
      const localArea = median(frames.map((frame) => frame.areaRatio).filter((ratio) => ratio > 0.45 && ratio < 2.1)) || median(frames.map((frame) => frame.areaRatio)) || 1;

      for (const frame of frames) {
        const widthHigh = frame.isAttack ? options.widthHigh : options.nonAttackWidthHigh;
        if (frame.heightRatio < options.heightLow) frame.reasons.push(`below-blue:${frame.heightRatio.toFixed(2)}h`);
        if (frame.heightRatio > options.heightHigh) frame.reasons.push(`above-blue:${frame.heightRatio.toFixed(2)}h`);
        if (frame.bodyBounds.area >= 16 && frame.bodyHeightRatio < options.bodyHeightLow) {
          frame.reasons.push(`body-below:${frame.bodyHeightRatio.toFixed(2)}h`);
        }
        if (frame.bodyBounds.area >= 16 && frame.bodyHeightRatio > options.bodyHeightHigh) {
          frame.reasons.push(`body-above:${frame.bodyHeightRatio.toFixed(2)}h`);
        }
        if (frame.expectedWidthRatio < options.widthLow) {
          frame.reasons.push(`too-narrow:${frame.expectedWidthRatio.toFixed(2)}x-${frame.expectedWidthLabel}`);
        }
        if (frame.expectedWidthRatio > widthHigh) {
          frame.reasons.push(`too-wide:${frame.expectedWidthRatio.toFixed(2)}x-${frame.expectedWidthLabel}`);
        }
        if (frame.areaRatio < options.areaLow) frame.reasons.push(`low-area:${frame.areaRatio.toFixed(2)}`);
        if (frame.areaRatio > options.areaHigh) frame.reasons.push(`high-area:${frame.areaRatio.toFixed(2)}`);
        if (frame.heightRatio < localHeight - 0.08 && frame.heightRatio < 1.02) {
          frame.reasons.push(`seq-height-dip:${(localHeight - frame.heightRatio).toFixed(2)}`);
        }
        if (frame.bodyBounds.area >= 16 && frame.bodyHeightRatio < localBodyHeight - 0.10) {
          frame.reasons.push(`seq-body-dip:${(localBodyHeight - frame.bodyHeightRatio).toFixed(2)}`);
        }
        if (frame.areaRatio < localArea - 0.30) frame.reasons.push(`seq-area-low:${(localArea - frame.areaRatio).toFixed(2)}`);
        if (frame.bodyBounds.hasLargeSecondComponent && frame.expectedWidthRatio > 1.35) {
          frame.reasons.push('multi-component-review');
        }
        const sourceScaleUses = explicitScaleUses.get(String(frame.frame)) ?? [];
        const otherScaleUses = sourceScaleUses.filter((use) => use.key !== frame.key);
        if (otherScaleUses.length && frame.scale.source === 'default') {
          frame.reasons.push(`same-source-scaled:${otherScaleUses.map((use) => use.key).slice(0, 3).join('/')}`);
        }
        if (sourceScaleUses.length > 1) {
          const widths = sourceScaleUses.map((use) => use.width);
          const heights = sourceScaleUses.map((use) => use.height);
          const widthSpread = Math.max(...widths) - Math.min(...widths);
          const heightSpread = Math.max(...heights) - Math.min(...heights);
          if (widthSpread > 0.04 || heightSpread > 0.04) {
            frame.reasons.push(`same-source-scale-diff:${Math.max(widthSpread, heightSpread).toFixed(2)}`);
          }
        }
        frame.suspect = frame.reasons.length > 0;
      }

      if (!frames.some((frame) => frame.suspect)) continue;
      rows.push({ entry, key, frames, localHeight, localBodyHeight, localArea });
      for (const frame of frames.filter((item) => item.suspect)) {
        report.push({
          character: entry.id,
          displayName: entry.displayName,
          key,
          frame: frame.frame,
          isAttack: frame.isAttack,
          widthRatio: round(frame.widthRatio),
          heightRatio: round(frame.heightRatio),
          bodyWidthRatio: round(frame.bodyWidthRatio),
          bodyHeightRatio: round(frame.bodyHeightRatio),
          expectedWidthRatio: round(frame.expectedWidthRatio),
          expectedWidthLabel: frame.expectedWidthLabel,
          areaRatio: round(frame.areaRatio),
          bodyAreaRatio: round(frame.bodyAreaRatio),
          scaleWidth: frame.scale.width,
          scaleHeight: frame.scale.height,
          scaleSource: frame.scale.source,
          sameSourceScaleUses: (explicitScaleUses.get(String(frame.frame)) ?? []).map((use) => `${use.key}:${use.width}/${use.height}`),
          reasons: frame.reasons
        });
      }
    }
  }
  return { rows, report, characters };
}

function round(value) {
  return Number(value.toFixed(3));
}

async function makeSheet(rows, report) {
  await fs.mkdir(outRoot, { recursive: true });
  const cellW = 116;
  const rowH = 154;
  const leftW = 272;
  const headerH = 44;
  const rowsPerPage = 14;
  const files = [];
  for (let pageStart = 0; pageStart < rows.length; pageStart += rowsPerPage) {
    const pageRows = rows.slice(pageStart, pageStart + rowsPerPage);
    const maxFrames = Math.max(1, ...pageRows.map((row) => row.frames.length));
    const width = Math.max(1500, leftW + maxFrames * cellW + 24);
    const height = headerH + pageRows.length * rowH + 24;
    const composites = [];
    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<rect width="100%" height="100%" fill="#f8fafc"/>`;
    svg += svgText(`ghost difference candidates page ${files.length + 1} - rows ${pageStart + 1}-${pageStart + pageRows.length} of ${rows.length}, candidates ${report.length}`, 14, 28, 18, 700);
    let y = headerH;
    for (const row of pageRows) {
      const { entry } = row;
      const px = Math.max(
        7,
        Math.min(
          86 / entry.idleHeight,
          104 / Math.max(entry.idleWidth, ...row.frames.map((frame) => frame.renderWidth)),
          112 / Math.max(entry.idleHeight, ...row.frames.map((frame) => frame.renderHeight))
        )
      );
      const baseline = y + rowH - 38;
      const idleTop = baseline - entry.idleHeight * px;
      svg += `<rect x="0" y="${y}" width="${width}" height="${rowH}" fill="#fff" stroke="#d1d5db"/>`;
      svg += svgText(entry.displayName, 12, y + 22, 13, 700);
      svg += svgText(`${entry.id} / ${row.key}`, 12, y + 40, 11, 400, '#475569');
      svg += svgText(`seq ${row.localHeight.toFixed(2)}h body ${row.localBodyHeight.toFixed(2)}h area ${row.localArea.toFixed(2)}`, 12, y + 58, 10, 400, '#64748b');
      svg += `<line x1="${leftW}" y1="${baseline}" x2="${width - 16}" y2="${baseline}" stroke="#ff3153" stroke-width="3"/>`;
      svg += `<line x1="${leftW}" y1="${idleTop}" x2="${width - 16}" y2="${idleTop}" stroke="#75a7ff" stroke-width="2" stroke-dasharray="7 7"/>`;

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
        svg += svgText(String(frame.frame).padStart(3, '0'), x + 40, baseline + 16, 12, 700, frame.suspect ? '#991b1b' : '#111827');
        svg += svgText(`${frame.widthRatio.toFixed(2)}w ${frame.heightRatio.toFixed(2)}h`, x + 18, baseline + 31, 10, 400, frame.suspect ? '#b91c1c' : '#64748b');
        svg += svgText(`body ${frame.bodyWidthRatio.toFixed(2)}w ${frame.bodyHeightRatio.toFixed(2)}h`, x + 13, baseline + 44, 9, 400, frame.suspect ? '#b91c1c' : '#64748b');
        svg += svgText(`${frame.expectedWidthLabel} ${frame.expectedWidthRatio.toFixed(2)} area ${frame.areaRatio.toFixed(2)}`, x + 11, baseline + 56, 9, 400, frame.suspect ? '#b91c1c' : '#64748b');
      }
      y += rowH;
    }
    svg += '</svg>';
    const file = path.join(outRoot, `candidates-page-${String(files.length + 1).padStart(3, '0')}.png`);
    await sharp(Buffer.from(svg), { limitInputPixels: false }).composite(composites).png().toFile(file);
    files.push(file);
  }

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ghost Difference Review</title>
  <style>
    :root { font-family: Inter, Arial, sans-serif; background: #0f1117; color: #f8fafc; }
    body { margin: 0; }
    header { position: sticky; top: 0; z-index: 10; background: rgba(15,17,23,0.96); border-bottom: 1px solid #2f3542; padding: 14px 18px; }
    h1 { margin: 0 0 6px; font-size: 22px; }
    p { margin: 4px 0; color: #cbd5e1; line-height: 1.4; }
    a { color: #071217; background: #31d8ef; text-decoration: none; border-radius: 6px; padding: 5px 8px; font-weight: 800; display: inline-block; margin: 3px; }
    figure { margin: 0 18px 24px; background: #f8fafc; color: #111827; border: 1px solid #cbd5e1; }
    figcaption { padding: 8px 10px; font-weight: 800; background: #e2e8f0; border-bottom: 1px solid #cbd5e1; }
    img { display: block; width: 100%; height: auto; }
    code { color: #e2e8f0; }
  </style>
</head>
<body>
  <header>
    <h1>Ghost Difference Review</h1>
    <p>Candidate-only rows. Red boxes are frames flagged as below/above the idle blue line, too wide/narrow, low/high area, sequence dips, or possible multi-component frames. The grey sprite behind each frame is that character's idle ghost using current game scales.</p>
    <p><code>candidates.json</code> and <code>candidates.csv</code> are in this folder. Thresholds: ${Object.entries(options).map(([key, value]) => `${key}=${value}`).join(', ')}</p>
    <nav>${files.map((file, index) => `<a href="#page-${index + 1}">${index + 1}</a>`).join('')}</nav>
  </header>
  ${files.map((file, index) => `<figure id="page-${index + 1}"><figcaption>Candidate page ${index + 1} / ${files.length}</figcaption><img src="${path.basename(file)}?t=${Date.now()}" alt="candidate page ${index + 1}"></figure>`).join('\n')}
</body>
</html>`;
  await fs.writeFile(path.join(outRoot, 'index.html'), html);
  return files;
}

function csvEscape(value) {
  if (Array.isArray(value)) return csvEscape(value.join('|'));
  const text = String(value ?? '');
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

const { rows, report, characters } = await collectRows();
await fs.rm(outRoot, { recursive: true, force: true });
await fs.mkdir(outRoot, { recursive: true });
await fs.writeFile(path.join(outRoot, 'candidates.json'), JSON.stringify(report, null, 2));
const csv = [
  [
    'character',
    'displayName',
    'key',
    'frame',
    'isAttack',
    'widthRatio',
    'heightRatio',
    'bodyWidthRatio',
    'bodyHeightRatio',
    'expectedWidthRatio',
    'expectedWidthLabel',
    'areaRatio',
    'bodyAreaRatio',
    'scaleWidth',
    'scaleHeight',
    'scaleSource',
    'sameSourceScaleUses',
    'reasons'
  ].join(','),
  ...report.map((item) => [
    item.character,
    item.displayName,
    item.key,
    item.frame,
    item.isAttack,
    item.widthRatio,
    item.heightRatio,
    item.bodyWidthRatio,
    item.bodyHeightRatio,
    item.expectedWidthRatio,
    item.expectedWidthLabel,
    item.areaRatio,
    item.bodyAreaRatio,
    item.scaleWidth,
    item.scaleHeight,
    item.scaleSource,
    item.sameSourceScaleUses,
    item.reasons
  ].map(csvEscape).join(','))
].join('\n');
await fs.writeFile(path.join(outRoot, 'candidates.csv'), csv);
const reasonCounts = report.reduce((acc, item) => {
  for (const reason of item.reasons) {
    const key = reason.split(':')[0];
    acc[key] = (acc[key] ?? 0) + 1;
  }
  return acc;
}, {});
const files = await makeSheet(rows, report);
const summary = [
  '# Ghost Difference Review',
  '',
  `Generated ${new Date().toISOString()}.`,
  '',
  `- Characters scanned: ${characters.length}`,
  `- Candidate rows: ${rows.length}`,
  `- Candidate frames: ${report.length}`,
  `- Pages: ${files.length}`,
  '',
  '## Reason Counts',
  '',
  ...Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => `- ${key}: ${count}`),
  '',
  '## Files',
  '',
  '- index.html',
  '- candidates.json',
  '- candidates.csv',
  ...files.map((file) => `- ${path.basename(file)}`)
].join('\n');
await fs.writeFile(path.join(outRoot, 'report.md'), summary);
console.log(`characters=${characters.length} rows=${rows.length} candidates=${report.length} pages=${files.length}`);
console.log(path.join(outRoot, 'index.html'));

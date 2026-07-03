import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const repoRoot = process.cwd();
const charactersRoot = path.join(repoRoot, 'public/characters');
const metricsPath = path.join(repoRoot, 'tmp/voxel-visual-proof/metrics/frame-metrics.csv');
const outDir = path.join(repoRoot, 'tmp/voxel-scale-editor/family-passes');
const family = process.argv.find((arg) => arg.startsWith('--family='))?.split('=')[1] ?? 'movement';
const dryRun = process.argv.includes('--dry-run');

const familyKeys = {
  crouchBlock: new Set(['crouch', 'crouchBlock', 'block']),
  movement: new Set(['sprint', 'walkForward', 'walkBack', 'sidestepLeft', 'sidestepRight', 'chargeKi']),
  airborne: new Set(['jump', 'backflip', 'juggle']),
  proneRecovery: new Set(['knockdown', 'getupStand', 'getupRollUp', 'getupRollDown', 'getupRollBack', 'lose']),
  reactions: new Set(['hitLight', 'hitHeavy', 'win'])
};

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === ',') {
      values.push(value);
      value = '';
    } else if (char === '"') {
      quoted = true;
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}

function frameIndexFromPath(framePath) {
  const match = /frame-(\d+)\.png$/i.exec(framePath);
  return match ? Number(match[1]) : NaN;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundScale(value) {
  return Math.round(value * 1000) / 1000;
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function median(values) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (clean.length === 0) return 0;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

const opaqueCache = new Map();
async function opaquePixels(file) {
  if (opaqueCache.has(file)) return opaqueCache.get(file);
  const { data } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 12) opaque += 1;
  }
  opaqueCache.set(file, opaque);
  return opaque;
}

function selectedKeys(rows) {
  if (family === 'attacks') {
    const known = new Set(Object.values(familyKeys).flatMap((keys) => [...keys]));
    return new Set(rows.map((row) => row.animation).filter((key) => key !== 'idle' && !known.has(key)));
  }
  const keys = familyKeys[family];
  if (!keys) {
    throw new Error(`Unknown family "${family}". Use one of ${[...Object.keys(familyKeys), 'attacks'].join(', ')}`);
  }
  return keys;
}

function frameTarget(row, pixelAreaRatio) {
  const key = row.animation;
  const wr = num(row.widthRatio);
  const hr = num(row.heightRatio);
  const foot = num(row.footprintToIdleHeight);
  const bboxArea = wr * hr;
  const flags = String(row.flags ?? '');
  if (wr <= 0 || hr <= 0 || flags.includes('low-color-frame')) return null;

  let targetW = wr;
  let targetH = hr;
  const reasons = [];

  const boostBothForArea = (targetArea, maxBoost = 1.22) => {
    if (bboxArea >= targetArea) return;
    const boost = clamp(Math.sqrt(targetArea / Math.max(0.01, bboxArea)), 1.015, maxBoost);
    targetW = Math.max(targetW, wr * boost);
    targetH = Math.max(targetH, hr * boost);
    reasons.push('bbox-volume');
  };
  const boostBothForPixels = (targetArea, maxBoost = 1.18) => {
    if (pixelAreaRatio >= targetArea) return;
    const boost = clamp(Math.sqrt(targetArea / Math.max(0.01, pixelAreaRatio)), 1.015, maxBoost);
    targetW = Math.max(targetW, wr * boost);
    targetH = Math.max(targetH, hr * boost);
    reasons.push('pixel-volume');
  };

  if (family === 'crouchBlock') {
    if (key === 'crouch' || key === 'crouchBlock') {
      if (wr < 0.98) {
        targetW = Math.max(targetW, 0.98);
        reasons.push('ghost-foot-width');
      }
      if (hr < 0.72) {
        targetH = Math.max(targetH, 0.72);
        reasons.push('low-body-height');
      }
      boostBothForPixels(0.64, 1.12);
    } else {
      if (wr < 0.9) {
        targetW = Math.max(targetW, 0.9);
        reasons.push('narrow-block');
      }
      if (hr < 0.9) {
        targetH = Math.max(targetH, 0.9);
        reasons.push('short-block');
      }
      boostBothForArea(0.78, 1.12);
    }
  } else if (family === 'movement') {
    if (wr < 0.9) {
      targetW = Math.max(targetW, 0.9);
      reasons.push('narrow-move');
    }
    if (hr < 0.68) {
      targetH = Math.max(targetH, 0.68);
      reasons.push('short-move');
    }
    boostBothForArea(0.74, 1.18);
    boostBothForPixels(0.74, 1.16);
    if (targetH > hr && targetW === wr) {
      targetW = Math.max(targetW, wr * 1.035);
      reasons.push('paired-width-adjustment');
    }
  } else if (family === 'airborne') {
    if (wr < 0.86) {
      targetW = Math.max(targetW, 0.88);
      reasons.push('narrow-air');
    }
    if (hr < 0.86) {
      targetH = Math.max(targetH, 0.88);
      reasons.push('short-air');
    }
    boostBothForArea(0.74, 1.16);
  } else if (family === 'proneRecovery') {
    if (hr < 0.56) {
      targetH = Math.max(targetH, 0.6);
      reasons.push('thin-prone');
    }
    if (foot < 0.92 && wr < 1.1) {
      targetW = Math.max(targetW, wr * clamp(0.92 / Math.max(0.01, foot), 1.02, 1.14));
      reasons.push('small-prone-footprint');
    }
    boostBothForPixels(0.42, 1.18);
    if (bboxArea < 0.76 && pixelAreaRatio < 0.78) boostBothForArea(0.78, 1.16);
    if (targetH > hr && targetW === wr) {
      targetW = Math.max(targetW, wr * 1.025);
      reasons.push('paired-width-adjustment');
    }
  } else if (family === 'reactions') {
    if (wr < 0.88) {
      targetW = Math.max(targetW, 0.9);
      reasons.push('narrow-reaction');
    }
    if (hr < 0.88) {
      targetH = Math.max(targetH, 0.9);
      reasons.push('short-reaction');
    }
    boostBothForArea(0.76, 1.14);
  } else if (family === 'attacks') {
    const narrowTall = wr < 0.82 && hr > 1.12;
    if (narrowTall) return null;
    if (wr < 0.84 && hr < 0.98) {
      targetW = Math.max(targetW, 0.88);
      targetH = Math.max(targetH, 0.88);
      reasons.push('small-attack-body');
    }
    boostBothForArea(0.7, 1.14);
    boostBothForPixels(0.72, 1.12);
  }

  targetW = clamp(targetW, 0.25, 2.65);
  targetH = clamp(targetH, 0.25, 2.65);
  if (reasons.length === 0) return null;
  if (Math.abs(targetW - wr) < 0.012 && Math.abs(targetH - hr) < 0.012) return null;
  return { targetW, targetH, reason: [...new Set(reasons)].join('+') };
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const text = await fs.readFile(metricsPath, 'utf8');
  const lines = text.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
  const keys = selectedKeys(rows);

  const rowsByCharacter = new Map();
  for (const row of rows) {
    if (!rowsByCharacter.has(row.characterId)) rowsByCharacter.set(row.characterId, []);
    rowsByCharacter.get(row.characterId).push(row);
  }
  const idlePixelAreaByCharacter = new Map();
  for (const [id, characterRows] of rowsByCharacter) {
    const idleAreas = [];
    for (const row of characterRows) {
      if (row.animation !== 'idle') continue;
      const opaque = await opaquePixels(path.join(repoRoot, row.framePath));
      idleAreas.push(opaque * num(row.scaleWidth) * num(row.scaleHeight));
    }
    idlePixelAreaByCharacter.set(id, median(idleAreas) || 1);
  }

  const manifestCache = new Map();
  const changes = [];
  const skipped = [];

  for (const row of rows) {
    if (!keys.has(row.animation)) continue;
    const idlePixelArea = idlePixelAreaByCharacter.get(row.characterId) ?? 1;
    const opaque = await opaquePixels(path.join(repoRoot, row.framePath));
    const pixelAreaRatio = idlePixelArea > 0 ? (opaque * num(row.scaleWidth) * num(row.scaleHeight)) / idlePixelArea : 0;
    const target = frameTarget(row, pixelAreaRatio);
    if (!target) continue;

    const id = row.characterId;
    const key = row.animation;
    const frame = Number(row.frame);
    const manifestPath = path.join(charactersRoot, id, 'character.json');
    if (!manifestCache.has(id)) {
      try {
        manifestCache.set(id, { manifestPath, character: await readJson(manifestPath), dirty: false });
      } catch (error) {
        skipped.push({ id, key, frame, reason: `manifest-read-failed:${error.message}` });
        continue;
      }
    }
    const entry = manifestCache.get(id);
    const character = entry.character;
    const frames = character.animationFrames?.[key] ?? [];
    const used = frames.some((framePath) => frameIndexFromPath(framePath) === frame);
    if (!used) {
      skipped.push({ id, key, frame, reason: 'frame-not-used-by-animation' });
      continue;
    }

    const frameScale = character.animationFrameScales?.[key]?.[String(frame)];
    const animationScale = character.animationScales?.[key] ?? {};
    const selected = frameScale ?? animationScale;
    const currentWidth = Number(selected.width ?? 1);
    const currentHeight = Number(selected.height ?? 1);
    const currentOffsetX = Number(frameScale?.offsetX ?? animationScale.offsetX ?? 0);
    const wr = num(row.widthRatio);
    const hr = num(row.heightRatio);
    if (!Number.isFinite(currentWidth) || !Number.isFinite(currentHeight) || wr <= 0 || hr <= 0) {
      skipped.push({ id, key, frame, reason: 'invalid-current-scale-or-ratio' });
      continue;
    }

    const nextWidth = roundScale(clamp(currentWidth * target.targetW / wr, 0.25, 2.5));
    const nextHeight = roundScale(clamp(currentHeight * target.targetH / hr, 0.25, 2.5));
    if (Math.abs(nextWidth - currentWidth) < 0.005 && Math.abs(nextHeight - currentHeight) < 0.005) continue;

    changes.push({
      id,
      key,
      frame,
      reason: target.reason,
      ratiosBefore: {
        width: roundScale(wr),
        height: roundScale(hr),
        bboxArea: roundScale(wr * hr),
        pixelArea: roundScale(pixelAreaRatio),
        footprintToIdleHeight: roundScale(num(row.footprintToIdleHeight))
      },
      ratiosTarget: {
        width: roundScale(target.targetW),
        height: roundScale(target.targetH),
        bboxArea: roundScale(target.targetW * target.targetH)
      },
      scaleBefore: { width: roundScale(currentWidth), height: roundScale(currentHeight), offsetX: currentOffsetX },
      scaleAfter: { width: nextWidth, height: nextHeight, offsetX: currentOffsetX }
    });

    if (!dryRun) {
      character.animationFrameScales ??= {};
      character.animationFrameScales[key] ??= {};
      character.animationFrameScales[key][String(frame)] = { width: nextWidth, height: nextHeight, offsetX: currentOffsetX };
      entry.dirty = true;
    }
  }

  if (!dryRun) {
    for (const entry of manifestCache.values()) {
      if (!entry.dirty) continue;
      await fs.writeFile(entry.manifestPath, `${JSON.stringify(entry.character, null, 2)}\n`);
    }
  }

  const summary = {
    dryRun,
    family,
    generatedAt: new Date().toISOString(),
    changes: changes.length,
    skipped: skipped.length,
    touchedCharacters: [...new Set(changes.map((change) => change.id))].sort(),
    byAnimation: changes.reduce((acc, change) => {
      acc[change.key] = (acc[change.key] ?? 0) + 1;
      return acc;
    }, {}),
    byReason: changes.reduce((acc, change) => {
      acc[change.reason] = (acc[change.reason] ?? 0) + 1;
      return acc;
    }, {}),
    skippedDetails: skipped,
    changeDetails: changes
  };
  const outFile = path.join(outDir, `${family}.json`);
  await fs.writeFile(outFile, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({
    dryRun,
    family,
    changes: summary.changes,
    skipped: summary.skipped,
    touchedCharacters: summary.touchedCharacters.length,
    byAnimation: Object.fromEntries(Object.entries(summary.byAnimation).sort((a, b) => b[1] - a[1])),
    byReason: summary.byReason,
    outFile: path.relative(repoRoot, outFile)
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

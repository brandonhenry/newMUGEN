import sharp from 'sharp';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const baseInputToKey = {
  jab: 'jableft',
  heavy: 'jabright',
  kick: 'kickleft',
  special: 'kickright'
};

const baseKeyToInput = {
  jableft: 'jab',
  jabright: 'heavy',
  kickleft: 'kick',
  kickright: 'special'
};

const buttonToInput = {
  '1': 'jab',
  '2': 'heavy',
  '3': 'kick',
  '4': 'special'
};

const timingKeys = ['startupFrames', 'activeFrames', 'recoveryFrames'];
const forceKeys = ['forwardForce', 'forwardForceStartFrame', 'forwardForceEndFrame'];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function finiteNumber(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function normalizeCommandKey(key) {
  return key.startsWith('cmd:') ? key.slice(4) : key;
}

function commandInput(commandOrKey = '') {
  const button = [...String(commandOrKey).matchAll(/[1-4]/g)].at(-1)?.[0];
  return button ? buttonToInput[button] ?? 'jab' : baseKeyToInput[commandOrKey] ?? 'jab';
}

function isBaseButtonKey(key) {
  return Boolean(baseKeyToInput[key]);
}

function totalMoveFrames(move) {
  return Math.max(
    1,
    Math.round(finiteNumber(move?.startupFrames, 10) + finiteNumber(move?.activeFrames, 2) + finiteNumber(move?.recoveryFrames, 16))
  );
}

function resolveBaseMove(character, input) {
  return character.moves?.find((move) => move.input === input) ?? character.moves?.[0] ?? null;
}

function mergeMoveData(baseMove, override = {}) {
  return {
    ...(baseMove ?? {}),
    ...(override ?? {}),
    startupFrames: finiteNumber(override.startupFrames, finiteNumber(baseMove?.startupFrames, 10)),
    activeFrames: finiteNumber(override.activeFrames, finiteNumber(baseMove?.activeFrames, 2)),
    recoveryFrames: finiteNumber(override.recoveryFrames, finiteNumber(baseMove?.recoveryFrames, 16)),
    damage: finiteNumber(override.damage, finiteNumber(baseMove?.damage, 8)),
    range: finiteNumber(override.range, finiteNumber(baseMove?.range, 1.3)),
    input: override.input ?? baseMove?.input ?? 'jab'
  };
}

function resolveAnimationFrameSequence(frames, key) {
  if (!frames || !key) return null;
  const fallbackKeys = [
    key,
    isBaseButtonKey(key) ? undefined : baseInputToKey[commandInput(key)],
    baseInputToKey[key],
    key.startsWith('cmd:') ? normalizeCommandKey(key) : `cmd:${key}`,
    'idle'
  ];
  for (const fallbackKey of fallbackKeys) {
    if (!fallbackKey) continue;
    const sequence = frames[fallbackKey];
    if (Array.isArray(sequence) && sequence.length > 0) return { key: fallbackKey, sequence };
  }
  return null;
}

function resolveMoveAnimation(character, key, move) {
  const animationKey = move.animationKey ?? (isBaseButtonKey(key) ? key : key.startsWith('cmd:') ? key : baseInputToKey[move.input]);
  return resolveAnimationFrameSequence(character.animationFrames, animationKey);
}

function resolveFramePath(repoRoot, frameSource) {
  if (!frameSource || typeof frameSource !== 'string') return null;
  if (frameSource.startsWith('/characters/')) return join(repoRoot, 'public', frameSource.slice(1));
  if (frameSource.startsWith('characters/')) return join(repoRoot, 'public', frameSource);
  if (frameSource.startsWith('/')) return join(repoRoot, 'public', frameSource.slice(1));
  return resolve(repoRoot, frameSource);
}

async function measurePngFrame(repoRoot, frameSource, cache) {
  const path = resolveFramePath(repoRoot, frameSource);
  if (!path || !existsSync(path)) return null;
  if (cache.has(path)) return cache.get(path);
  const pending = sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => {
      let minX = info.width;
      let maxX = -1;
      let minY = info.height;
      let maxY = -1;
      let weightedX = 0;
      let weightedY = 0;
      let weight = 0;
      let pixels = 0;
      for (let y = 0; y < info.height; y += 1) {
        for (let x = 0; x < info.width; x += 1) {
          const alpha = data[(y * info.width + x) * info.channels + 3] ?? 0;
          if (alpha <= 12) continue;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          weightedX += x * alpha;
          weightedY += y * alpha;
          weight += alpha;
          pixels += 1;
        }
      }
      if (maxX < minX || maxY < minY || weight <= 0) {
        return { empty: true, width: info.width, height: info.height, area: 0, centroidX: info.width / 2, centroidY: info.height / 2, leadingX: info.width / 2, bodyWidth: 1, bodyHeight: 1 };
      }
      return {
        empty: false,
        width: info.width,
        height: info.height,
        area: pixels,
        minX,
        maxX,
        minY,
        maxY,
        centroidX: weightedX / weight,
        centroidY: weightedY / weight,
        leadingX: maxX,
        bodyWidth: Math.max(1, maxX - minX + 1),
        bodyHeight: Math.max(1, maxY - minY + 1)
      };
    });
  cache.set(path, pending);
  return pending;
}

export function combatFrameWindowForSpriteIndex(spriteIndex, spriteCount, totalFrames) {
  const count = Math.max(1, Math.round(spriteCount));
  const total = Math.max(1, Math.round(totalFrames));
  const index = clamp(Math.round(spriteIndex), 0, count - 1);
  const startFrame = clamp(Math.ceil((index * total) / count), 1, total);
  const endFrame = index === count - 1
    ? total
    : clamp(Math.ceil(((index + 1) * total) / count) - 1, startFrame, total);
  return { startFrame, endFrame };
}

function fallbackVisualWindow(move) {
  const total = totalMoveFrames(move);
  const startup = Math.max(1, Math.round(finiteNumber(move.startupFrames, 10)));
  const active = Math.max(1, Math.round(finiteNumber(move.activeFrames, 2)));
  const startFrame = clamp(Math.max(1, startup - 2), 1, total);
  const endFrame = clamp(startup + active + Math.ceil(Math.max(1, active) * 0.5), startFrame, total);
  return { startFrame, endFrame, confidence: 0, fallback: true, visualTravel: 0 };
}

export function detectVisualForwardWindow(metrics, totalFrames) {
  const usable = metrics.filter(Boolean);
  if (usable.length < 2) return null;
  const deltas = [];
  for (let index = 1; index < usable.length; index += 1) {
    const previous = usable[index - 1];
    const current = usable[index];
    if (previous.empty || current.empty) {
      deltas.push({ index, score: 0, raw: 0 });
      continue;
    }
    const scale = Math.max(12, (previous.bodyWidth + current.bodyWidth) / 2);
    const centroidDelta = (current.centroidX - previous.centroidX) / scale;
    const leadingDelta = (current.leadingX - previous.leadingX) / scale;
    const widthDelta = (current.bodyWidth - previous.bodyWidth) / scale;
    const raw = centroidDelta * 0.58 + leadingDelta * 0.36 + Math.max(0, widthDelta) * 0.14;
    deltas.push({ index, score: Math.max(0, raw), raw });
  }
  const max = Math.max(...deltas.map((delta) => delta.score));
  if (max < 0.025) return null;
  const threshold = Math.max(0.018, max * 0.38);
  let peak = deltas.findIndex((delta) => delta.score === max);
  let start = peak;
  let end = peak;
  while (start > 0 && deltas[start - 1].score >= threshold) start -= 1;
  while (end < deltas.length - 1 && deltas[end + 1].score >= threshold) end += 1;
  const startSpriteIndex = deltas[start].index;
  const endSpriteIndex = deltas[end].index;
  const startWindow = combatFrameWindowForSpriteIndex(startSpriteIndex, usable.length, totalFrames);
  const endWindow = combatFrameWindowForSpriteIndex(endSpriteIndex, usable.length, totalFrames);
  const visualTravel = deltas.slice(start, end + 1).reduce((sum, delta) => sum + Math.max(0, delta.raw), 0);
  return {
    startFrame: startWindow.startFrame,
    endFrame: endWindow.endFrame,
    confidence: round(clamp(max * 2.4, 0.05, 1), 3),
    fallback: false,
    visualTravel: round(visualTravel, 4)
  };
}

function classifyMove(key, move, visualWindow) {
  const command = normalizeCommandKey(move.command ?? move.notation ?? key);
  const label = `${move.label ?? ''} ${command}`.toLowerCase();
  const hasForwardCommand = /\bf\b|f\+|d\/f|wr|qcf|hcf|dp|dash|rush|drive|lunge|slide|burst|charge/.test(label);
  const isCharge = command.includes('O+') || label.includes('charge') || label.includes('burst') || label.includes('rush');
  const isState = /(?:^|:)cmd:(?:FC|WS|SS)|\bfc\+|\bws\+|\bss\+/.test(key) || /(?:^|[^a-z])(fc|ws|ss)\+/.test(command.toLowerCase());
  const isMotion = /qcf|qcb|hcf|hcb|dp|wr|cd/.test(command.toLowerCase());
  const isMulti = (command.match(/[1-4]/g) ?? []).length > 1;
  const isBase = isBaseButtonKey(key);
  return { command, label, hasForwardCommand, isCharge, isState, isMotion, isMulti, isBase, visualTravel: visualWindow.visualTravel ?? 0 };
}

export function calculateForwardForce(key, move, visualWindow) {
  if (move.forwardForce !== undefined) return round(clamp(finiteNumber(move.forwardForce, 0.5), 0.25, 4), 2);
  const info = classifyMove(key, move, visualWindow);
  let force =
    move.input === 'jab' ? 0.35 :
    move.input === 'heavy' ? 0.48 :
    move.input === 'kick' ? 0.55 :
    0.68;
  if (!info.isBase) force += 0.2;
  if (info.hasForwardCommand) force += 0.28;
  if (info.isMulti) force += 0.22;
  if (info.isState) force += 0.34;
  if (info.isMotion) force += 0.58;
  if (info.isCharge) force += 0.92;
  if ((move.range ?? 1.3) >= 1.65) force += 0.15;
  if ((move.range ?? 1.3) >= 1.95) force += 0.22;
  if (move.launchHeight || move.tornado || move.knockdown) force += 0.24;
  if (move.jumpBeforeMove) force += 0.32;
  force += clamp(info.visualTravel * 2.4, 0, 1.3);
  if (info.isBase && move.input === 'jab') force = Math.min(force, 0.5);
  if (info.isBase && move.input === 'heavy') force = Math.min(force, 0.85);
  if (info.isBase && move.input === 'kick') force = Math.min(force, 0.95);
  if (info.isBase && move.input === 'special') force = Math.min(force, 1.2);
  if (info.isCharge || info.isMotion) force = Math.max(force, 1.15);
  if (info.isState && info.visualTravel > 0.12) force = Math.max(force, 1.25);
  return round(clamp(force, 0.25, 4), 2);
}

function computeWhiffRecovery(move, force) {
  if (force < 2) return move.whiffRecoveryFrames;
  const recovery = Math.round(finiteNumber(move.recoveryFrames, 16));
  const existing = move.whiffRecoveryFrames;
  const penalty = Math.ceil(force * 1.8 + (move.launchHeight || move.tornado || move.knockdown ? 2 : 0));
  const target = Math.max(0, recovery + penalty);
  return existing === undefined ? target : Math.max(existing, target);
}

async function visualWindowForMove(repoRoot, character, key, move, frameCache) {
  const total = totalMoveFrames(move);
  const resolved = resolveMoveAnimation(character, key, move);
  if (!resolved?.sequence?.length) return { ...fallbackVisualWindow(move), animationKey: undefined, frameCount: 0, reason: 'missing-animation' };
  const metrics = await Promise.all(resolved.sequence.map((frame) => measurePngFrame(repoRoot, frame, frameCache)));
  const detected = detectVisualForwardWindow(metrics, total);
  if (detected) return { ...detected, animationKey: resolved.key, frameCount: resolved.sequence.length, reason: 'visual' };
  if (move.forwardForceStartFrame !== undefined || move.forwardForceEndFrame !== undefined) {
    return {
      startFrame: clamp(Math.round(finiteNumber(move.forwardForceStartFrame, 1)), 1, total),
      endFrame: clamp(Math.round(finiteNumber(move.forwardForceEndFrame, total)), 1, total),
      confidence: 0.1,
      fallback: true,
      visualTravel: 0,
      animationKey: resolved.key,
      frameCount: resolved.sequence.length,
      reason: 'existing-window'
    };
  }
  return { ...fallbackVisualWindow(move), animationKey: resolved.key, frameCount: resolved.sequence.length, reason: 'fallback-impact-window' };
}

function timingSnapshot(character) {
  const snapshot = {};
  character.moves?.forEach((move, index) => {
    timingKeys.forEach((key) => {
      if (move[key] !== undefined) snapshot[`moves.${index}.${key}`] = move[key];
    });
  });
  Object.entries(character.moveOverrides ?? {}).forEach(([key, override]) => {
    timingKeys.forEach((timingKey) => {
      if (override?.[timingKey] !== undefined) snapshot[`moveOverrides.${key}.${timingKey}`] = override[timingKey];
    });
  });
  return snapshot;
}

function assertTimingPreserved(before, after, characterId) {
  const beforeSnapshot = timingSnapshot(before);
  const afterSnapshot = timingSnapshot(after);
  for (const [key, value] of Object.entries(beforeSnapshot)) {
    if (afterSnapshot[key] !== value) {
      throw new Error(`${characterId}: ${key} changed from ${value} to ${afterSnapshot[key]}`);
    }
  }
  for (const key of Object.keys(afterSnapshot)) {
    if (!(key in beforeSnapshot) && timingKeys.some((timingKey) => key.endsWith(`.${timingKey}`))) {
      throw new Error(`${characterId}: new timing field ${key} was added`);
    }
  }
}

function isAttackOverride(character, key, override) {
  if (!override || typeof override !== 'object') return false;
  if (key === 'chargeKi') return false;
  if (isBaseButtonKey(key) || key.startsWith('cmd:')) return true;
  if (override.input || override.command || override.animationKey) return true;
  return ['damage', 'onHitFrames', 'onBlockFrames', 'range', 'hitLevel'].some((field) => override[field] !== undefined);
}

async function tuneMove(repoRoot, character, key, baseMove, override, frameCache) {
  const move = mergeMoveData(baseMove, override);
  const window = await visualWindowForMove(repoRoot, character, key, move, frameCache);
  const force = calculateForwardForce(key, move, window);
  const total = totalMoveFrames(move);
  const startFrame = clamp(Math.round(window.startFrame), 1, total);
  const endFrame = clamp(Math.round(window.endFrame), startFrame, total);
  const whiffRecoveryFrames = computeWhiffRecovery(move, force);
  return {
    patch: {
      forwardForce: force,
      forwardForceStartFrame: startFrame,
      forwardForceEndFrame: endFrame,
      ...(whiffRecoveryFrames !== undefined && whiffRecoveryFrames !== override?.whiffRecoveryFrames ? { whiffRecoveryFrames } : {})
    },
    report: {
      key,
      force,
      startFrame,
      endFrame,
      totalFrames: total,
      animationKey: window.animationKey,
      frameCount: window.frameCount,
      reason: window.reason,
      confidence: window.confidence,
      visualTravel: window.visualTravel
    }
  };
}

export async function expandCharacterForwardForce(character, { repoRoot = process.cwd(), frameCache = new Map() } = {}) {
  const next = structuredClone(character);
  const report = [];
  next.moves = [];
  for (const move of character.moves ?? []) {
    const key = baseInputToKey[move.input] ?? move.input;
    const { patch, report: entry } = await tuneMove(repoRoot, character, key, move, move, frameCache);
    next.moves.push({ ...move, ...patch });
    report.push({ ...entry, scope: 'move', input: move.input });
  }
  next.moveOverrides = { ...(character.moveOverrides ?? {}) };
  for (const [key, override] of Object.entries(character.moveOverrides ?? {})) {
    if (!isAttackOverride(character, key, override)) continue;
    const input = override.input ?? commandInput(override.command ?? key);
    const baseMove = resolveBaseMove(character, input);
    const { patch, report: entry } = await tuneMove(repoRoot, character, key, baseMove, override, frameCache);
    next.moveOverrides[key] = { ...override, ...patch };
    report.push({ ...entry, scope: 'override', input });
  }
  assertTimingPreserved(character, next, character.id ?? character.displayName ?? 'unknown-character');
  return { character: next, report };
}

export async function expandRoster(repoRoot, { write = false, reportLimit = 12 } = {}) {
  const charactersDir = join(repoRoot, 'public', 'characters');
  const frameCache = new Map();
  const changed = [];
  const reports = [];
  for (const characterId of readdirSync(charactersDir).sort()) {
    const manifestPath = join(charactersDir, characterId, 'character.json');
    if (!existsSync(manifestPath)) continue;
    const originalText = readFileSync(manifestPath, 'utf8');
    const original = JSON.parse(originalText);
    const { character: expanded, report } = await expandCharacterForwardForce(original, { repoRoot, frameCache });
    assertTimingPreserved(original, expanded, original.id ?? characterId);
    const expandedText = `${JSON.stringify(expanded, null, 2)}\n`;
    const fallbackCount = report.filter((entry) => entry.reason !== 'visual').length;
    reports.push({
      id: original.id ?? characterId,
      displayName: original.displayName ?? characterId,
      moveCount: report.length,
      fallbackCount,
      samples: report.slice(0, reportLimit)
    });
    if (expandedText !== originalText) {
      changed.push(manifestPath);
      if (write) writeFileSync(manifestPath, expandedText);
    }
  }
  return { changed, reports };
}

function printReport(result, { write }) {
  console.log(`${write ? 'Updated' : 'Would update'} ${result.changed.length} character manifests`);
  const totals = result.reports.reduce((acc, entry) => {
    acc.moves += entry.moveCount;
    acc.fallbacks += entry.fallbackCount;
    return acc;
  }, { moves: 0, fallbacks: 0 });
  console.log(`Analyzed ${totals.moves} attacks; ${totals.fallbacks} used fallback/existing timing windows`);
  for (const entry of result.reports.filter((item) => item.fallbackCount > 0).slice(0, 12)) {
    console.log(`- ${entry.displayName}: ${entry.fallbackCount}/${entry.moveCount} fallback windows`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoRoot = process.argv.includes('--repo')
    ? process.argv[process.argv.indexOf('--repo') + 1]
    : process.cwd();
  const write = process.argv.includes('--write');
  const result = await expandRoster(repoRoot, { write });
  printReport(result, { write });
}

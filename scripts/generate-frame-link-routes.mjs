import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const baseInputToKey = {
  jab: 'jableft',
  heavy: 'jabright',
  kick: 'kickleft',
  special: 'kickright'
};

const buttonToInput = {
  '1': 'jab',
  '2': 'heavy',
  '3': 'kick',
  '4': 'special'
};

const commandSpecs = [
  ['1+2', 'multi'],
  ['1+3', 'multi'],
  ['1+4', 'multi'],
  ['2+3', 'multi'],
  ['2+4', 'multi'],
  ['3+4', 'multi'],
  ['f+1', 'direction'],
  ['f+2', 'direction'],
  ['f+3', 'direction'],
  ['d+1', 'direction'],
  ['d+3', 'direction'],
  ['d/f+2', 'launcher'],
  ['d/f+3', 'direction'],
  ['qcf+1', 'motion'],
  ['qcf+3', 'motion'],
  ['qcf+4', 'motion'],
  ['FC+1', 'state'],
  ['FC+2', 'state'],
  ['WS+2', 'state'],
  ['WS+4', 'state'],
  ['SS+3', 'state'],
  ['SS+4', 'state'],
  ['O+1', 'special'],
  ['O+4', 'special']
].map(([command, family]) => ({ command, family, key: `cmd:${command}` }));

const timingKeys = ['startupFrames', 'activeFrames', 'recoveryFrames'];

export function commandInput(command) {
  const button = [...command.matchAll(/[1-4]/g)].at(-1)?.[0] ?? '1';
  return buttonToInput[button] ?? 'jab';
}

export function isPlainNeutralCommand(command) {
  return command === '1' || command === '2' || command === '3' || command === '4';
}

function baseKeyForCommand(command) {
  return baseInputToKey[commandInput(command)];
}

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resolveBaseMove(character, command) {
  const input = commandInput(command);
  return character.moves?.find((move) => move.input === input) ?? character.moves?.[0] ?? null;
}

function routeTuning(command, family, baseMove) {
  const startup = finiteNumber(baseMove?.startupFrames, 14);
  const active = finiteNumber(baseMove?.activeFrames, 3);
  const damage = finiteNumber(baseMove?.damage, 9);
  const isFast = startup <= 12;
  const isLauncher = family === 'launcher';
  const isSpecial = family === 'special';
  const isMotion = family === 'motion';
  const isState = family === 'state';
  const activePenalty = Math.max(0, active - 3);
  const reward = isLauncher ? 24 : isSpecial ? 22 : isMotion ? 21 : isState ? 19 : family === 'direction' ? 17 : 15;
  const risk = isLauncher ? -14 : isSpecial ? -11 : isMotion ? -10 : isState ? -8 : family === 'direction' ? -7 : -5;
  const counterHit = !isPlainNeutralCommand(command);
  const counterBonus = isLauncher ? 11 : isSpecial || isMotion ? 9 : isState ? 8 : 7;
  return {
    label: `${command} Frame Link`,
    route: `${family}:frame-link`,
    onBlockFrames: clamp(risk - activePenalty - (damage >= 14 ? 1 : 0) + (isFast ? -1 : 0), -20, 2),
    onHitFrames: clamp(reward - activePenalty - (isFast ? 1 : 0), 8, 28),
    onCounterHitFrames: clamp(reward + counterBonus - Math.floor(activePenalty / 2), 14, 38),
    counterHit,
    counterHitStunBonusFrames: isSpecial || isMotion ? 2 : undefined,
    whiffRecoveryFrames: clamp(4 + activePenalty + (isLauncher ? 6 : isSpecial || isMotion ? 5 : isState ? 3 : 2), 2, 18),
    cancelable: false
  };
}

function baseMoveTuning(move) {
  const active = finiteNumber(move.activeFrames, 2);
  const damage = finiteNumber(move.damage, 8);
  const activePenalty = Math.max(0, active - 2);
  const input = move.input;
  if (input === 'jab') {
    return {
      onBlockFrames: clamp(1 - activePenalty, -2, 1),
      onHitFrames: clamp(13 - activePenalty, 9, 14),
      onCounterHitFrames: clamp(16 - activePenalty, 12, 18),
      counterHit: false,
      cancelable: false
    };
  }
  if (input === 'heavy') {
    return {
      onBlockFrames: clamp(-5 - activePenalty - (damage > 10 ? 1 : 0), -10, -3),
      onHitFrames: clamp(14 - activePenalty, 8, 16),
      onCounterHitFrames: clamp(18 - activePenalty, 13, 21),
      counterHit: false,
      cancelable: false
    };
  }
  if (input === 'kick') {
    return {
      onBlockFrames: clamp(-4 - activePenalty, -8, -2),
      onHitFrames: clamp(15 - activePenalty, 9, 17),
      onCounterHitFrames: clamp(19 - activePenalty, 14, 22),
      counterHit: false,
      cancelable: false
    };
  }
  return {
    onBlockFrames: clamp(-8 - activePenalty, -14, -5),
    onHitFrames: clamp(17 - activePenalty, 10, 20),
    onCounterHitFrames: clamp(23 - activePenalty, 16, 27),
    counterHit: false,
    cancelable: false
  };
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

export function expandCharacterFrameLinks(character) {
  const next = structuredClone(character);
  next.animationFrames = { ...(next.animationFrames ?? {}) };
  next.animationFrameRates = { ...(next.animationFrameRates ?? {}) };
  next.moveOverrides = { ...(next.moveOverrides ?? {}) };

  next.moves = (next.moves ?? []).map((move) => ({
    ...move,
    ...baseMoveTuning(move)
  }));

  for (const spec of commandSpecs) {
    const baseMove = resolveBaseMove(next, spec.command);
    const baseKey = baseKeyForCommand(spec.command);
    const baseFrames = next.animationFrames[baseKey] ?? [];
    if (!Array.isArray(baseFrames) || baseFrames.length === 0) continue;

    if (!Array.isArray(next.animationFrames[spec.key]) || next.animationFrames[spec.key].length === 0) {
      next.animationFrames[spec.key] = [...baseFrames];
    }
    if (next.animationFrameRates[spec.key] === undefined && next.animationFrameRates[baseKey] !== undefined) {
      next.animationFrameRates[spec.key] = next.animationFrameRates[baseKey];
    }

    const existing = next.moveOverrides[spec.key] ?? {};
    const tuning = routeTuning(spec.command, spec.family, baseMove);
    next.moveOverrides[spec.key] = {
      ...existing,
      input: commandInput(spec.command),
      command: spec.command,
      notation: spec.command,
      animationKey: spec.key,
      comboKey: `${spec.command}:link`,
      ...tuning
    };
  }

  return next;
}

export function expandRoster(repoRoot, { write = false } = {}) {
  const charactersDir = join(repoRoot, 'public', 'characters');
  const changed = [];
  for (const characterId of readdirSync(charactersDir).sort()) {
    const manifestPath = join(charactersDir, characterId, 'character.json');
    if (!existsSync(manifestPath)) continue;
    const originalText = readFileSync(manifestPath, 'utf8');
    const original = JSON.parse(originalText);
    const expanded = expandCharacterFrameLinks(original);
    assertTimingPreserved(original, expanded, original.id ?? characterId);
    const expandedText = `${JSON.stringify(expanded, null, 2)}\n`;
    if (expandedText !== originalText) {
      changed.push(manifestPath);
      if (write) writeFileSync(manifestPath, expandedText);
    }
  }
  return changed;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoRoot = process.argv.includes('--repo')
    ? process.argv[process.argv.indexOf('--repo') + 1]
    : process.cwd();
  const write = process.argv.includes('--write');
  const changed = expandRoster(repoRoot, { write });
  console.log(`${write ? 'Updated' : 'Would update'} ${changed.length} character manifests`);
}

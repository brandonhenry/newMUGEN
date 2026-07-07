import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const timingKeys = ['startupFrames', 'activeFrames', 'recoveryFrames'];
const retunedKeys = ['damage', 'blockDamage', 'onComboHitFrames', 'onJuggleHitFrames', 'comboRepeatPenaltyFrames', 'juggleRepeatPenaltyFrames'];
const baseKeys = new Set(['jableft', 'jabright', 'kickleft', 'kickright']);
const buttonToInput = { 1: 'jab', 2: 'heavy', 3: 'kick', 4: 'special' };

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isPlainNeutralCommand(command) {
  return command === '1' || command === '2' || command === '3' || command === '4';
}

function resolvedCommandForMove(move) {
  return move.command ?? move.notation;
}

function isAdvancedCommand(command) {
  return Boolean(command && !isPlainNeutralCommand(command));
}

function commandInput(command) {
  const matches = [...String(command).matchAll(/[1-4]/g)];
  const button = matches[matches.length - 1]?.[0] ?? '1';
  return buttonToInput[button] ?? 'jab';
}

function defaultOnComboHitFrames(move) {
  const command = resolvedCommandForMove(move);
  const commitmentCredit = isAdvancedCommand(command) ? 4 : 0;
  const risk =
    (move.launchHeight ? 4 : 0) +
    (move.tornado ? 3 : 0) +
    (move.knockdown ? 2 : 0) +
    Math.max(0, Math.round(((move.damage ?? 0) - 12) / 4)) +
    Math.max(0, (move.activeFrames ?? 2) - 3) +
    Math.max(0, Math.round(((move.forwardForce ?? 0) - 1.4) * 1.5));
  const lowCredit = move.hitLevel === 'low' ? 1 : 0;
  return clamp(Math.round((move.onHitFrames ?? 8) * 0.88) + 1 + commitmentCredit + lowCredit - risk, 5, Math.max(5, (move.onHitFrames ?? 8) + 4));
}

function defaultOnJuggleHitFrames(move) {
  const command = resolvedCommandForMove(move);
  const explicitJuggleCredit = move.tornado ? 13 : move.juggleRefloatVelocity ? 7 : 0;
  const commandCredit = isAdvancedCommand(command) ? 4 : 0;
  const propertyRisk =
    (move.launchHeight ? 7 : 0) +
    (move.knockdown ? 4 : 0) +
    Math.max(0, Math.round(((move.damage ?? 0) - 10) / 3)) +
    Math.max(0, (move.activeFrames ?? 2) - 3) +
    Math.max(0, Math.round(((move.forwardForce ?? 0) - 1) * 1.4));
  return clamp(Math.round((move.onHitFrames ?? 8) * 0.68) + 1 + explicitJuggleCredit + commandCredit - propertyRisk, 4, move.tornado ? 30 : 24);
}

function defaultComboRepeatPenaltyFrames(move) {
  const command = resolvedCommandForMove(move);
  const commandRelief = isAdvancedCommand(command) ? -1 : 1;
  return clamp(4 + commandRelief + Math.max(0, Math.round(((move.damage ?? 0) - 10) / 5)) + (move.launchHeight ? 3 : 0) + (move.tornado ? 3 : 0) + (move.knockdown ? 2 : 0), 3, 12);
}

function defaultJuggleRepeatPenaltyFrames(move) {
  const command = resolvedCommandForMove(move);
  const commandRelief = isAdvancedCommand(command) ? -1 : 1;
  return clamp(6 + commandRelief + Math.max(0, Math.round(((move.damage ?? 0) - 8) / 4)) + (move.launchHeight ? 6 : 0) + (move.tornado ? 6 : 0) + (move.knockdown ? 3 : 0), 5, 18);
}

function neutralAdvantageFields(move) {
  const activePenalty = Math.max(0, (move.activeFrames ?? 2) - 2);
  const damage = move.damage ?? 8;
  if (move.input === 'jab') {
    return {
      onBlockFrames: clamp(1 - activePenalty, -2, 1),
      onHitFrames: clamp(14 - activePenalty, 10, 15),
      onCounterHitFrames: clamp(18 - activePenalty, 14, 20),
      counterHit: false
    };
  }
  if (move.input === 'heavy') {
    return {
      onBlockFrames: clamp(-5 - activePenalty - (damage > 11 ? 1 : 0), -11, -3),
      onHitFrames: clamp(16 - activePenalty, 11, 18),
      onCounterHitFrames: clamp(21 - activePenalty, 16, 24),
      counterHit: false
    };
  }
  if (move.input === 'kick') {
    return {
      onBlockFrames: clamp(-4 - activePenalty - (damage > 12 ? 1 : 0), -10, -2),
      onHitFrames: clamp(17 - activePenalty, 11, 19),
      onCounterHitFrames: clamp(22 - activePenalty, 16, 25),
      counterHit: false
    };
  }
  return {
    onBlockFrames: clamp(-8 - activePenalty - (damage > 15 ? 1 : 0), -15, -5),
    onHitFrames: clamp(19 - activePenalty, 12, 22),
    onCounterHitFrames: clamp(26 - activePenalty, 18, 30),
    counterHit: false
  };
}

function commandAdvantageFields(move) {
  const command = resolvedCommandForMove(move);
  if (!isAdvancedCommand(command)) return neutralAdvantageFields(move);
  const activePenalty = Math.max(0, (move.activeFrames ?? 2) - 3);
  const damage = move.damage ?? 9;
  const isLauncher = Boolean(move.launchHeight);
  const isTornado = Boolean(move.tornado);
  const isSpecial = /^O\+|^H\.|^R\.|qcf|qcb|hcf|hcb|dp|rdp|cd/.test(command);
  const isState = /^(FC|WS|SS|SSL|SSR|BT)/.test(command);
  const isChord = /^[1-4]\+[1-4]/.test(command);
  const reward = isLauncher ? 27 : isTornado ? 24 : isSpecial ? 23 : isState ? 22 : isChord ? 20 : 19;
  const risk = isLauncher ? -15 : isTornado ? -13 : isSpecial ? -11 : isState ? -8 : isChord ? -7 : -6;
  return {
    onBlockFrames: clamp(risk - activePenalty - (damage >= 16 ? 1 : 0), -22, 1),
    onHitFrames: clamp(reward - activePenalty, 12, isLauncher ? 30 : 26),
    onCounterHitFrames: clamp(reward + (isLauncher ? 10 : isTornado ? 9 : isSpecial ? 8 : 7) - Math.floor(activePenalty / 2), 18, 40),
    counterHit: true
  };
}

function damageBudgetFields(move) {
  if ((move.damage ?? 0) <= 0) return {};
  const command = resolvedCommandForMove(move);
  const advanced = isAdvancedCommand(command);
  const currentDamage = Math.max(1, Math.round(move.damage ?? 1));
  const isKi = Boolean(move.usesKi || move.kiBurst || (command && /^O\+/.test(command)));
  const isLauncher = Boolean(move.launchHeight);
  const isTornado = Boolean(move.tornado);
  const isLow = move.hitLevel === 'low';
  let target = currentDamage;

  if (!advanced) {
    if (move.input === 'jab') target = clamp(currentDamage, 5, 8);
    else if (move.input === 'heavy') target = clamp(currentDamage, 7, 11);
    else if (move.input === 'kick') target = clamp(currentDamage, 7, 12);
    else target = clamp(currentDamage, 9, 14);
  } else if (isKi) {
    target = clamp(currentDamage, 16, 22);
  } else if (isLauncher) {
    target = clamp(currentDamage, 12, 16);
  } else if (isTornado) {
    target = clamp(currentDamage, 10, 16);
  } else if (isLow) {
    target = clamp(currentDamage, 8, 12);
  } else if (move.knockdown) {
    target = clamp(currentDamage, 10, 17);
  } else {
    target = clamp(currentDamage, 8, 16);
  }

  const blockDamage = Math.max(0, Math.min(Math.round(move.blockDamage ?? 0), Math.floor(target * 0.25)));
  return {
    damage: target,
    blockDamage
  };
}

function contextualFields(move) {
  const tunedMove = { ...move, ...damageBudgetFields(move) };
  return {
    ...damageBudgetFields(move),
    onComboHitFrames: defaultOnComboHitFrames(tunedMove),
    onJuggleHitFrames: defaultOnJuggleHitFrames(tunedMove),
    comboRepeatPenaltyFrames: defaultComboRepeatPenaltyFrames(tunedMove),
    juggleRepeatPenaltyFrames: defaultJuggleRepeatPenaltyFrames(tunedMove)
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

function assertTimingPreserved(before, after, id) {
  const beforeSnapshot = timingSnapshot(before);
  const afterSnapshot = timingSnapshot(after);
  if (JSON.stringify(beforeSnapshot) !== JSON.stringify(afterSnapshot)) {
    throw new Error(`${id}: startup/active/recovery changed`);
  }
}

function assertOnlyRetunedFieldsChanged(before, after, id) {
  const changes = [];
  collectChanges(before, after, '', changes);
  const illegal = changes.filter((path) => {
    if (!path.startsWith('moves.') && !path.startsWith('moveOverrides.')) return false;
    return !retunedKeys.some((key) => path.endsWith(`.${key}`));
  });
  if (illegal.length > 0) {
    throw new Error(`${id}: unexpected field changes: ${illegal.slice(0, 8).join(', ')}`);
  }
}

function collectChanges(before, after, prefix, changes) {
  if (before === after) return;
  if (Array.isArray(before) || Array.isArray(after)) {
    if (JSON.stringify(before) !== JSON.stringify(after)) changes.push(prefix);
    return;
  }
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') {
    changes.push(prefix);
    return;
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    collectChanges(before[key], after[key], prefix ? `${prefix}.${key}` : key, changes);
  }
}

function mergeMove(base, override = {}) {
  return {
    ...base,
    ...override,
    hitbox: override.hitbox && base.hitbox
      ? {
          offset: override.hitbox.offset ?? base.hitbox.offset,
          size: override.hitbox.size ?? base.hitbox.size
        }
      : override.hitbox ?? base.hitbox
  };
}

function isAttackOverride(key, override) {
  if (!override || key === 'chargeKi') return false;
  if (baseKeys.has(key) || key.startsWith('cmd:')) return true;
  return Boolean(override.input || override.command || override.animationKey || override.damage || override.onHitFrames || override.range || override.hitLevel);
}

function resolveBaseMove(character, key, override) {
  const command = override.command ?? (key.startsWith('cmd:') ? key.slice(4) : undefined);
  const input = override.input ?? (command ? commandInput(command) : undefined);
  return character.moves?.find((move) => move.input === input) ?? character.moves?.[0] ?? null;
}

export function expandCharacterContextualComboFrames(character) {
  const next = structuredClone(character);
  next.moves = (next.moves ?? []).map((move) => ({
    ...move,
    ...contextualFields(move)
  }));
  next.moveOverrides = { ...(next.moveOverrides ?? {}) };
  for (const [key, override] of Object.entries(next.moveOverrides)) {
    if (!isAttackOverride(key, override)) continue;
    const base = resolveBaseMove(next, key, override);
    if (!base) continue;
    const command = override.command ?? (key.startsWith('cmd:') ? key.slice(4) : undefined);
    const merged = mergeMove(base, {
      ...override,
      command,
      notation: override.notation ?? command,
      input: override.input ?? (command ? commandInput(command) : override.input)
    });
    next.moveOverrides[key] = {
      ...override,
      ...contextualFields(merged)
    };
  }
  assertTimingPreserved(character, next, character.id ?? 'unknown');
  assertOnlyRetunedFieldsChanged(character, next, character.id ?? 'unknown');
  return next;
}

export function expandRoster(repoRoot, { write = false } = {}) {
  const charactersDir = join(repoRoot, 'public', 'characters');
  const changed = [];
  for (const id of readdirSync(charactersDir).sort()) {
    const manifestPath = join(charactersDir, id, 'character.json');
    if (!existsSync(manifestPath)) continue;
    const originalText = readFileSync(manifestPath, 'utf8');
    const original = JSON.parse(originalText);
    const expanded = expandCharacterContextualComboFrames(original);
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

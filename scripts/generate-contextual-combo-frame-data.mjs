import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const timingKeys = ['startupFrames', 'activeFrames', 'recoveryFrames'];
const baseKeys = new Set(['jableft', 'jabright', 'kickleft', 'kickright']);
const buttonToInput = { 1: 'jab', 2: 'heavy', 3: 'kick', 4: 'special' };

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isPlainNeutralCommand(command) {
  return command === '1' || command === '2' || command === '3' || command === '4';
}

function commandInput(command) {
  const matches = [...String(command).matchAll(/[1-4]/g)];
  const button = matches[matches.length - 1]?.[0] ?? '1';
  return buttonToInput[button] ?? 'jab';
}

function defaultOnComboHitFrames(move) {
  const command = move.command ?? move.notation;
  const commitmentCredit = command && !isPlainNeutralCommand(command) ? 2 : 0;
  const risk =
    (move.launchHeight ? 3 : 0) +
    (move.tornado ? 2 : 0) +
    (move.knockdown ? 2 : 0) +
    Math.max(0, Math.round(((move.damage ?? 0) - 12) / 4)) +
    Math.max(0, (move.activeFrames ?? 2) - 3) +
    Math.max(0, Math.round(((move.forwardForce ?? 0) - 1.4) * 1.5));
  const lowCredit = move.hitLevel === 'low' ? 1 : 0;
  return clamp(Math.round((move.onHitFrames ?? 8) * 0.84) + 1 + commitmentCredit + lowCredit - risk, 5, Math.max(5, (move.onHitFrames ?? 8) + 2));
}

function defaultOnJuggleHitFrames(move) {
  const command = move.command ?? move.notation;
  const explicitJuggleCredit = move.tornado ? 11 : move.juggleRefloatVelocity ? 6 : 0;
  const commandCredit = command && !isPlainNeutralCommand(command) ? 2 : 0;
  const propertyRisk =
    (move.launchHeight ? 5 : 0) +
    (move.knockdown ? 4 : 0) +
    Math.max(0, Math.round(((move.damage ?? 0) - 10) / 3)) +
    Math.max(0, (move.activeFrames ?? 2) - 3) +
    Math.max(0, Math.round(((move.forwardForce ?? 0) - 1) * 1.4));
  return clamp(Math.round((move.onHitFrames ?? 8) * 0.62) + 1 + explicitJuggleCredit + commandCredit - propertyRisk, 4, move.tornado ? 30 : 20);
}

function defaultComboRepeatPenaltyFrames(move) {
  const command = move.command ?? move.notation;
  const commandRelief = command && !isPlainNeutralCommand(command) ? -1 : 0;
  return clamp(3 + commandRelief + Math.max(0, Math.round(((move.damage ?? 0) - 10) / 5)) + (move.launchHeight ? 2 : 0) + (move.tornado ? 2 : 0) + (move.knockdown ? 1 : 0), 2, 10);
}

function defaultJuggleRepeatPenaltyFrames(move) {
  const command = move.command ?? move.notation;
  const commandRelief = command && !isPlainNeutralCommand(command) ? -1 : 0;
  return clamp(5 + commandRelief + Math.max(0, Math.round(((move.damage ?? 0) - 8) / 4)) + (move.launchHeight ? 4 : 0) + (move.tornado ? 5 : 0) + (move.knockdown ? 2 : 0), 4, 16);
}

function contextualFields(move) {
  return {
    onComboHitFrames: defaultOnComboHitFrames(move),
    onJuggleHitFrames: defaultOnJuggleHitFrames(move),
    comboRepeatPenaltyFrames: defaultComboRepeatPenaltyFrames(move),
    juggleRepeatPenaltyFrames: defaultJuggleRepeatPenaltyFrames(move)
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
    const merged = mergeMove(base, override);
    next.moveOverrides[key] = {
      ...override,
      ...contextualFields(merged)
    };
  }
  assertTimingPreserved(character, next, character.id ?? 'unknown');
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

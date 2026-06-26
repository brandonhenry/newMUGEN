import { starterCharacters } from '../data/characters';
import type { BoxSpec, CharacterDefinition, HitLevel, MoveDefinition, MoveTracking, Vec3Tuple } from '../types';
import { sanitizeEffects, sanitizeMoveEffects } from './effects';
import { debugLog } from './debugLogger';

const requiredClips = [
  'idle',
  'walkForward',
  'walkBack',
  'sidestepLeft',
  'sidestepRight',
  'crouch',
  'jump',
  'block',
  'jab',
  'kick',
  'heavy',
  'special',
  'hitLight',
  'hitHeavy',
  'knockdown',
  'win',
  'lose'
];

export type CharacterLoadResult = {
  characters: CharacterDefinition[];
  warnings: Record<string, string[]>;
};

const framesPerSecond = 60;
const baseInputToAnimationKey = {
  jab: 'jableft',
  heavy: 'jabright',
  kick: 'kickleft',
  special: 'kickright'
} as const;
const rawButtonCommandToBaseAnimationKey: Record<string, string> = {
  '1': 'jableft',
  '2': 'jabright',
  '3': 'kickleft',
  '4': 'kickright'
};

export function normalizeCharacter(character: CharacterDefinition): CharacterDefinition {
  return {
    ...character,
    animationFrames: canonicalizeBaseButtonRecord(character.animationFrames ?? {}),
    animationFrameRates: canonicalizeBaseButtonRecord(character.animationFrameRates ?? {}),
    moves: (character.moves ?? []).map(normalizeMove),
    moveOverrides: sanitizeMoveOverrides(character.moveOverrides ?? {}),
    effects: sanitizeEffects(character.effects ?? []),
    moveEffects: sanitizeMoveEffects(canonicalizeBaseButtonRecord(character.moveEffects ?? {})),
    hurtboxes:
      Array.isArray(character.hurtboxes) && character.hurtboxes.length > 0
        ? character.hurtboxes.map((box) => normalizeBoxSpec(box, { offset: [0, 1, 0], size: [0.86, 1.9, 0.58] }))
        : [{ offset: [0, 1, 0], size: [0.86, 1.9, 0.58] }]
  };
}

export function normalizeMove(move: MoveDefinition): MoveDefinition {
  const legacyStartup = typeof move.startup === 'number' ? move.startup : undefined;
  const legacyActive = typeof move.active === 'number' ? move.active : undefined;
  const legacyRecovery = typeof move.recovery === 'number' ? move.recovery : undefined;
  const startupFrames = normalizeFrameCount(move.startupFrames, legacyStartup, 10);
  const activeFrames = normalizeFrameCount(move.activeFrames, legacyActive, 2);
  const recoveryFrames = normalizeFrameCount(move.recoveryFrames, legacyRecovery, 16);
  const hitstunFrames = normalizeFrameCount(undefined, move.hitstun, 12);
  const pushback = finiteOr(move.pushback, finiteOr(move.push, 0.7));
  return {
    ...move,
    startupFrames,
    activeFrames,
    recoveryFrames,
    damage: Math.max(1, Math.round(finiteOr(move.damage, 1))),
    blockDamage: Math.max(0, Math.round(finiteOr(move.blockDamage, 0))),
    hitLevel: normalizeHitLevel(move.hitLevel),
    onBlockFrames: Math.round(finiteOr(move.onBlockFrames, -Math.max(1, recoveryFrames - 12))),
    onHitFrames: Math.round(finiteOr(move.onHitFrames, Math.max(2, hitstunFrames - recoveryFrames))),
    onCounterHitFrames: Math.round(finiteOr(move.onCounterHitFrames, Math.max(4, hitstunFrames + 2 - recoveryFrames))),
    whiffRecoveryFrames: move.whiffRecoveryFrames === undefined ? undefined : Math.max(0, Math.round(finiteOr(move.whiffRecoveryFrames, recoveryFrames))),
    range: Math.max(0.1, finiteOr(move.range, 1.3)),
    pushback,
    blockPushback: finiteOr(move.blockPushback, pushback * 0.45),
    launchHeight: move.launchHeight === undefined ? undefined : Math.max(0, finiteOr(move.launchHeight, 0)),
    launchVelocity: move.launchVelocity === undefined ? undefined : clamp(finiteOr(move.launchVelocity, 5.95), 3.2, 7.2),
    juggleRefloatVelocity: move.juggleRefloatVelocity === undefined ? undefined : clamp(finiteOr(move.juggleRefloatVelocity, 4.35), 2.2, 6.4),
    juggleGravityScale: move.juggleGravityScale === undefined ? undefined : clamp(finiteOr(move.juggleGravityScale, 0.52), 0.28, 1.2),
    tornado: Boolean(move.tornado),
    tracking: normalizeTracking(move.tracking),
    armorStartFrame: normalizeNullableFrame(move.armorStartFrame),
    armorEndFrame: normalizeNullableFrame(move.armorEndFrame),
    cancelWindows: Array.isArray(move.cancelWindows)
      ? move.cancelWindows
          .map((window) => ({
            startFrame: Math.max(1, Math.round(finiteOr(window.startFrame, 1))),
            endFrame: Math.max(1, Math.round(finiteOr(window.endFrame, window.startFrame))),
            into: window.into
          }))
          .filter((window) => window.endFrame >= window.startFrame)
      : undefined,
    knockdown: Boolean(move.knockdown),
    hitbox: normalizeBoxSpec(move.hitbox, { offset: [0, 1, 0.65], size: [0.72, 0.5, 0.62] }),
    hurtboxes: Array.isArray(move.hurtboxes) ? move.hurtboxes.map((box) => normalizeBoxSpec(box, { offset: [0, 1, 0], size: [0.86, 1.9, 0.58] })) : undefined,
    hurtboxOffset: normalizeVec3(move.hurtboxOffset)
  };
}

function sanitizeMoveOverrides(overrides: CharacterDefinition['moveOverrides']) {
  return canonicalizeBaseButtonRecord(Object.fromEntries(
    Object.entries(overrides ?? {})
      .filter(([key, value]) => key.length > 0 && value && typeof value === 'object')
      .map(([key, value]) => [key, value])
  ));
}

function canonicalizeBaseButtonRecord<T>(record: Record<string, T> = {}) {
  const next = { ...record };
  Object.entries(baseInputToAnimationKey).forEach(([legacyKey, baseKey]) => {
    if (next[baseKey] === undefined && next[legacyKey] !== undefined) next[baseKey] = next[legacyKey];
    delete next[legacyKey];
  });
  Object.entries(rawButtonCommandToBaseAnimationKey).forEach(([command, baseKey]) => {
    const legacyCommandKey = `cmd:${command}`;
    if (next[baseKey] === undefined && next[legacyCommandKey] !== undefined) next[baseKey] = next[legacyCommandKey];
    delete next[legacyCommandKey];
  });
  return next;
}

function normalizeFrameCount(value: unknown, legacySeconds: number | undefined, fallback: number) {
  if (Number.isFinite(value)) return Math.max(1, Math.round(Number(value)));
  if (Number.isFinite(legacySeconds)) return Math.max(1, Math.round(Number(legacySeconds) * framesPerSecond));
  return fallback;
}

function normalizeNullableFrame(value: unknown) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return Math.max(1, Math.round(Number(value)));
}

function finiteOr(value: unknown, fallback: number) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHitLevel(value: unknown): HitLevel {
  return value === 'high' || value === 'mid' || value === 'low' || value === 'throw' || value === 'special' ? value : 'mid';
}

function normalizeTracking(value: unknown): MoveTracking {
  return value === 'none' || value === 'weakLeft' || value === 'weakRight' || value === 'medium' || value === 'strong' || value === 'homing'
    ? value
    : 'medium';
}

function normalizeBoxSpec(box: unknown, fallback: BoxSpec): BoxSpec {
  if (!box || typeof box !== 'object') return fallback;
  const candidate = box as Partial<BoxSpec>;
  const normalizedSize = normalizeVec3(candidate.size);
  return {
    offset: normalizeVec3(candidate.offset) ?? fallback.offset,
    size: normalizedSize ? (normalizedSize.map((value) => Math.max(0.01, value)) as Vec3Tuple) : fallback.size
  };
}

function normalizeVec3(value: unknown): Vec3Tuple | undefined {
  if (!Array.isArray(value) || value.length < 3) return undefined;
  const next: Vec3Tuple = [finiteOr(value[0], 0), finiteOr(value[1], 0), finiteOr(value[2], 0)];
  return next;
}

export function validateCharacter(character: CharacterDefinition): string[] {
  const warnings: string[] = [];
  if (!character.id) warnings.push('Missing id.');
  if (!character.displayName) warnings.push('Missing displayName.');
  if (!character.modelPath) warnings.push('Missing modelPath.');
  if (character.renderMode === 'spriteVoxel' && !character.spriteSheetPath) {
    warnings.push('Sprite-voxel character is missing spriteSheetPath.');
  }
  if ((character.voxelProfile === 'image-source' || character.voxelProfile === 'hd-image-source') && !character.animationFrames && !character.spriteSheetPath) {
    warnings.push('Image-source voxel character needs animationFrames or spriteSheetPath.');
  }
  if (!character.moves.length) warnings.push('No moves defined.');
  for (const clip of requiredClips) {
    if (!character.animations[clip]) {
      warnings.push(`Missing animation clip mapping: ${clip}. Fallback pose will be used.`);
    }
  }
  for (const move of character.moves) {
    const total = move.startupFrames + move.activeFrames + move.recoveryFrames;
    if (total <= 0) warnings.push(`${move.id} has invalid timing.`);
    if (move.damage <= 0) warnings.push(`${move.id} should deal positive damage.`);
    if (!move.hitLevel) warnings.push(`${move.id} is missing hit level.`);
  }
  return warnings;
}

export async function loadCharacterRoster(): Promise<CharacterLoadResult> {
  try {
    const index = (await fetch('/characters/index.json', { cache: 'no-store' }).then((response) => response.json())) as {
      characters: string[];
    };
    debugLog(2, 'character index fetched', { characterIds: index.characters });
    const loaded = await Promise.all(
      index.characters.map((id) =>
        fetch(`/characters/${id}/character.json`, { cache: 'no-store' }).then((response) => response.json() as Promise<CharacterDefinition>)
      )
    );
    const characters = (loaded.length > 0 ? loaded : starterCharacters).map(normalizeCharacter);
    debugLog(2, 'character manifests loaded', {
      characters: characters.map((character) => ({
        id: character.id,
        displayName: character.displayName,
        walkForward: character.animationFrames?.walkForward?.map((frame) => frame.match(/frame-(\d+)\.png$/)?.[1]),
        walkForwardFps: character.animationFrameRates?.walkForward ?? character.animationFps
      }))
    });
    return {
      characters,
      warnings: Object.fromEntries(characters.map((character) => [character.id, validateCharacter(character)]))
    };
  } catch {
    debugLog(2, 'manifest load failed, using bundled starter characters');
    return {
      characters: starterCharacters.map(normalizeCharacter),
      warnings: Object.fromEntries(starterCharacters.map((character) => [character.id, validateCharacter(normalizeCharacter(character))]))
    };
  }
}

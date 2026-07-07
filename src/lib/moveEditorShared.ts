import type { PreviewPose } from '../components/GameScene';
import type {
  CharacterDefinition,
  CharacterSpriteSheet,
  HitLevel,
  MoveDefinition,
  MoveInput,
  MoveOverride,
  MoveTracking
} from '../types';
import { normalizeCharacterModelScale } from './characterScale';
import { sanitizeEffects, sanitizeMoveEffects } from './effects';
import { sanitizeMoveProjectiles, sanitizeProjectiles } from './projectiles';

export type AnimationSlot = {
  key: string;
  label: string;
  pose: PreviewPose;
  notation: string[];
  category: 'stance' | 'raw' | 'direction' | 'motion' | 'state' | 'special';
  command?: string;
};

export type MoveEditorRow = {
  animationKey: string;
  slot: AnimationSlot;
  move: MoveDefinition;
  frames: string[];
  frameRate: number;
  durationFrames: number;
};

export const hitLevelOptions: HitLevel[] = ['high', 'mid', 'low', 'throw', 'special'];
export const trackingOptions: MoveTracking[] = ['none', 'weakLeft', 'weakRight', 'medium', 'strong', 'homing'];

const baseAnimationSlots: AnimationSlot[] = [
  { key: 'idle', label: 'Neutral', pose: 'idle', notation: ['N'], category: 'stance' },
  { key: 'walkForward', label: 'Forward', pose: 'walk', notation: ['f'], category: 'stance' },
  { key: 'walkBack', label: 'Back', pose: 'walk', notation: ['b'], category: 'stance' },
  { key: 'sprint', label: 'Forward Sprint', pose: 'walk', notation: ['f,f'], category: 'stance' },
  { key: 'backHop', label: 'Back Hop', pose: 'jump', notation: ['b,b'], category: 'stance' },
  { key: 'sidestepLeft', label: 'Side Up', pose: 'sidestep', notation: ['up', 'up'], category: 'stance' },
  { key: 'sidestepRight', label: 'Side Down', pose: 'sidestep', notation: ['down', 'down'], category: 'stance' },
  { key: 'jump', label: 'Jump', pose: 'jump', notation: ['u'], category: 'stance' },
  { key: 'crouch', label: 'Crouch', pose: 'crouch', notation: ['d'], category: 'stance' },
  { key: 'block', label: 'Block', pose: 'block', notation: ['b'], category: 'stance' },
  { key: 'crouchBlock', label: 'Crouch Block', pose: 'crouchBlock', notation: ['D/B'], category: 'stance' },
  { key: 'chargeKi', label: 'Charge Ki', pose: 'chargeKi', notation: ['O'], category: 'stance' },
  { key: 'jableft', label: 'Left Punch', pose: 'jab', notation: ['1'], category: 'stance' },
  { key: 'jabright', label: 'Right Punch', pose: 'heavy', notation: ['2'], category: 'stance' },
  { key: 'kickleft', label: 'Left Kick', pose: 'kick', notation: ['3'], category: 'stance' },
  { key: 'kickright', label: 'Right Kick', pose: 'special', notation: ['4'], category: 'stance' },
  { key: 'hitLight', label: 'Hit', pose: 'hit', notation: ['HIT'], category: 'stance' },
  { key: 'juggle', label: 'Juggle', pose: 'juggle', notation: ['AIR'], category: 'stance' },
  { key: 'knockdown', label: 'Knockdown', pose: 'knockdown', notation: ['KD'], category: 'stance' },
  { key: 'getupStand', label: 'Stand Up', pose: 'getup', notation: ['GETUP'], category: 'stance' },
  { key: 'getupRollUp', label: 'Roll Up Getup', pose: 'getup', notation: ['ROLL up'], category: 'stance' },
  { key: 'getupRollDown', label: 'Roll Down Getup', pose: 'getup', notation: ['ROLL down'], category: 'stance' },
  { key: 'getupRollBack', label: 'Roll Back Getup', pose: 'getup', notation: ['ROLL b'], category: 'stance' },
  { key: 'win', label: 'Win', pose: 'win', notation: ['WIN'], category: 'stance' },
  { key: 'lose', label: 'Lose', pose: 'lose', notation: ['LOSE'], category: 'stance' }
];

const buttonCombos = [
  '1',
  '2',
  '3',
  '4',
  '1+2',
  '1+3',
  '1+4',
  '2+3',
  '2+4',
  '3+4',
  '1+2+3',
  '1+2+4',
  '1+3+4',
  '2+3+4',
  '1+2+3+4'
];
const directionPrefixes = ['f', 'F', 'b', 'B', 'd', 'D', 'u', 'U', 'd/f', 'D/F', 'd/b', 'D/B', 'u/f', 'U/F', 'u/b', 'U/B'];
const motionPrefixes = ['f,f', 'b,b', 'f,F', 'qcf', 'qcb', 'hcf', 'hcb', 'dp', 'rdp', 'cd'];
const statePrefixes = ['WR', 'WS', 'FC', 'SS', 'SSL', 'SSR', 'BT', 'iWS', 'iWR', 'cc'];
const specialPrefixes = ['H.', 'R.'];
const rawButtonCommandToBaseKey: Record<string, string> = {
  '1': 'jableft',
  '2': 'jabright',
  '3': 'kickleft',
  '4': 'kickright'
};
const legacyBaseInputToDataKey: Record<MoveInput, string> = {
  jab: 'jableft',
  heavy: 'jabright',
  kick: 'kickleft',
  special: 'kickright'
};

export const animationSlots = buildAnimationSlots();

function buildAnimationSlots(): AnimationSlot[] {
  const commandSlots: AnimationSlot[] = [];
  const pushCommand = (command: string, category: AnimationSlot['category'], label = command) => {
    commandSlots.push({
      key: commandAnimationKey(command),
      label,
      pose: commandPose(command),
      notation: parseNotationTokens(command),
      category,
      command
    });
  };

  buttonCombos.forEach((combo) => pushCommand(combo, 'raw'));
  directionPrefixes.forEach((prefix) => buttonCombos.forEach((combo) => pushCommand(`${prefix}+${combo}`, 'direction')));
  motionPrefixes.forEach((prefix) => buttonCombos.forEach((combo) => pushCommand(`${prefix}+${combo}`, 'motion')));
  statePrefixes.forEach((prefix) => buttonCombos.forEach((combo) => pushCommand(`${prefix}+${combo}`, 'state')));
  buttonCombos.forEach((combo) => pushCommand(`O+${combo}`, 'special', `Charge ${combo}`));
  specialPrefixes.forEach((prefix) => buttonCombos.forEach((combo) => pushCommand(`${prefix}${combo}`, 'special')));

  return [...baseAnimationSlots, ...commandSlots];
}

export function commandAnimationKey(command: string) {
  return `cmd:${command}`;
}

function getCanonicalCommandDataKey(command?: string) {
  return command ? rawButtonCommandToBaseKey[command] : undefined;
}

export function getSlotDataKey(slot: AnimationSlot) {
  return getCanonicalCommandDataKey(slot.command) ?? slot.key;
}

function getLegacyRawButtonDataKey(dataKey: string) {
  const command = Object.entries(rawButtonCommandToBaseKey).find(([, baseKey]) => baseKey === dataKey)?.[0];
  return command ? commandAnimationKey(command) : undefined;
}

function getLegacyBaseInputDataKey(dataKey: string) {
  return Object.entries(legacyBaseInputToDataKey).find(([, baseKey]) => baseKey === dataKey)?.[0];
}

export function canonicalizeRawButtonRecord<T>(record: Record<string, T> = {}) {
  const next = { ...record };
  Object.entries(legacyBaseInputToDataKey).forEach(([legacyKey, baseKey]) => {
    if (next[baseKey] === undefined && next[legacyKey] !== undefined) next[baseKey] = next[legacyKey];
    delete next[legacyKey];
  });
  Object.entries(rawButtonCommandToBaseKey).forEach(([command, baseKey]) => {
    const legacyKey = commandAnimationKey(command);
    if (next[baseKey] === undefined && next[legacyKey] !== undefined) next[baseKey] = next[legacyKey];
    delete next[legacyKey];
  });
  return next;
}

export function commandPose(command: string): PreviewPose {
  if (command.includes('3')) return 'kick';
  if (command.includes('4')) return 'special';
  if (command.includes('2')) return 'heavy';
  return 'jab';
}

function parseNotationTokens(command: string): string[] {
  return command.split(/([,+~<:_\[\]*])/).filter(Boolean);
}

export function resolveSlotMove(character: CharacterDefinition, slot: AnimationSlot): MoveDefinition | null {
  if (!isMoveSlotPose(slot.pose) && !slot.command) return null;
  const dataKey = getSlotDataKey(slot);
  const baseInput = isMoveSlotPose(slot.pose) ? slot.pose : commandPose(slot.command ?? slot.label);
  const baseMove = character.moves.find((move) => move.input === baseInput) ?? character.moves[0] ?? null;
  if (!baseMove) return null;
  const overrideKeys = [
    getLegacyRawButtonDataKey(dataKey),
    getLegacyBaseInputDataKey(dataKey),
    slot.command && dataKey === slot.key ? slot.command : undefined,
    baseMove.id,
    baseMove.input,
    dataKey
  ].filter(Boolean) as string[];
  return [...new Set(overrideKeys)].reduce<MoveDefinition>((move, key) => {
    const override = character.moveOverrides?.[key];
    return override ? mergeMoveOverride(move, override) : move;
  }, baseMove);
}

function isMoveSlotPose(pose: PreviewPose): pose is MoveInput {
  return pose === 'jab' || pose === 'kick' || pose === 'heavy' || pose === 'special';
}

function mergeMoveOverride(move: MoveDefinition, override: MoveOverride): MoveDefinition {
  return {
    ...move,
    ...override,
    hitbox: override.hitbox
      ? {
          offset: override.hitbox.offset ?? move.hitbox.offset,
          size: override.hitbox.size ?? move.hitbox.size
        }
      : move.hitbox
  };
}

export function getConfiguredAttackRows(character: CharacterDefinition): MoveEditorRow[] {
  return animationSlots.flatMap((slot) => {
    if (!isMoveSlotPose(slot.pose) && !slot.command) return [];
    const dataKey = getSlotDataKey(slot);
    const frames = character.animationFrames?.[dataKey] ?? [];
    if (frames.length === 0) return [];
    const move = resolveSlotMove(character, slot);
    if (!move || move.damage <= 0 && move.hitLevel === 'special' && !move.usesKi) return [];
    const frameRate = character.animationFrameRates?.[dataKey] ?? character.animationFps ?? 8;
    return [{
      animationKey: dataKey,
      slot,
      move,
      frames,
      frameRate,
      durationFrames: getAnimationDurationFrames(frames.length, frameRate)
    }];
  });
}

export function getAnimationDurationFrames(frameCount: number, fps: number) {
  if (frameCount <= 0 || fps <= 0) return 0;
  return Math.max(1, Math.round((frameCount / fps) * 60));
}

export function formatMoveSlotLabel(slot: AnimationSlot, move?: MoveDefinition | null) {
  return move?.label || slot.label;
}

export function signedFrame(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

export function formatFrameSummary(move?: MoveDefinition | null) {
  if (!move) return 'No move data';
  const properties = [
    `i${move.startupFrames}`,
    `${move.activeFrames}a`,
    `${move.recoveryFrames}r`,
    `${move.damage} dmg`,
    `${signedFrame(move.onBlockFrames)} block`,
    `${signedFrame(move.onHitFrames)} hit`,
    move.tornado ? 'T!' : null,
    (move.launchHeight ?? 0) > 0 ? `launch ${move.launchHeight}` : null,
    move.knockdown ? 'KD' : null,
    move.tracking !== 'none' ? move.tracking : null
  ].filter(Boolean);
  return properties.join(' / ');
}

export function sanitizeMoveOverrideMap(overrides: Record<string, MoveOverride> = {}) {
  return canonicalizeRawButtonRecord(Object.fromEntries(
    Object.entries(overrides)
      .filter(([key, value]) => key.length > 0 && value && typeof value === 'object')
      .map(([key, value]) => [key, sanitizeMoveOverride(value)])
  ));
}

export function sanitizeMoveOverride(override: MoveOverride): MoveOverride {
  const next: MoveOverride = {};
  const numericKeys: Array<keyof MoveOverride> = [
    'startupFrames',
    'activeFrames',
    'recoveryFrames',
    'damage',
    'blockDamage',
    'onBlockFrames',
    'onHitFrames',
    'onCounterHitFrames',
    'counterHitStunBonusFrames',
    'whiffRecoveryFrames',
    'range',
    'forwardForce',
    'forwardForceStartFrame',
    'forwardForceEndFrame',
    'moveJumpForce',
    'moveJumpGravity',
    'homingSpeed',
    'pushback',
    'blockPushback',
    'launchHeight',
    'launchVelocity',
    'juggleRefloatVelocity',
    'juggleGravityScale',
    'kiCost',
    'healAmount',
    'armorStartFrame',
    'armorEndFrame'
  ];
  numericKeys.forEach((key) => {
    const value = override[key];
    if (Number.isFinite(value)) (next as Record<string, number>)[key] = Number(value);
  });
  if (typeof override.label === 'string') next.label = override.label;
  if (typeof override.description === 'string') next.description = override.description;
  if (override.hitLevel && hitLevelOptions.includes(override.hitLevel)) next.hitLevel = override.hitLevel;
  if (override.tracking && trackingOptions.includes(override.tracking)) next.tracking = override.tracking;
  if (typeof override.knockdown === 'boolean') next.knockdown = override.knockdown;
  if (typeof override.tornado === 'boolean') next.tornado = override.tornado;
  if (typeof override.throwCapture === 'boolean') next.throwCapture = override.throwCapture;
  if (typeof override.endsInCrouch === 'boolean') next.endsInCrouch = override.endsInCrouch;
  if (typeof override.holdable === 'boolean') next.holdable = override.holdable;
  if (typeof override.cancelable === 'boolean') next.cancelable = override.cancelable;
  if (typeof override.counterHit === 'boolean') next.counterHit = override.counterHit;
  if (typeof override.jumpBeforeMove === 'boolean') next.jumpBeforeMove = override.jumpBeforeMove;
  if (typeof override.usesKi === 'boolean') next.usesKi = override.usesKi;
  if (typeof override.healsHp === 'boolean') next.healsHp = override.healsHp;
  if (Array.isArray(override.cancelWindows)) next.cancelWindows = override.cancelWindows;
  if (Array.isArray(override.soundCues) && override.soundCues.length > 0) next.soundCues = override.soundCues;
  if (next.healsHp) next.usesKi = true;
  return next;
}

export function getFrameIndex(path: string) {
  const match = path.match(/frame-(\d+)\.png$/);
  return match ? Number(match[1]) : -1;
}

export function isLocalDevHost() {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(window.location.hostname);
}

export async function saveCharacterManifestToDev(character: CharacterDefinition) {
  const modelScale = normalizeCharacterModelScale(character.modelScale, character.scale);
  const response = await fetch('/__kore/dev/save-character-manifest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      characterId: character.id,
      locked: Boolean(character.locked),
      unplayable: Boolean(character.unplayable),
      variant: Boolean(character.variant),
      variantOf: character.variantOf ?? '',
      hasTransform: Boolean(character.hasTransform),
      transformCharacterId: character.transformCharacterId ?? '',
      faceCardPath: character.faceCardPath ?? '',
      modelScale,
      animationFrames: canonicalizeRawButtonRecord(character.animationFrames ?? {}),
      animationFrameRates: canonicalizeRawButtonRecord(character.animationFrameRates ?? {}),
      animationScales: canonicalizeRawButtonRecord(character.animationScales ?? {}),
      animationFrameScales: canonicalizeRawButtonRecord(character.animationFrameScales ?? {}),
      moveOverrides: sanitizeMoveOverrideMap(character.moveOverrides ?? {}),
      getupFrameOverrides: character.getupFrameOverrides ?? {},
      effects: sanitizeEffects(character.effects ?? []),
      moveEffects: sanitizeMoveEffects(canonicalizeRawButtonRecord(character.moveEffects ?? {})),
      projectiles: sanitizeProjectiles(character.projectiles ?? []),
      moveProjectiles: sanitizeMoveProjectiles(canonicalizeRawButtonRecord(character.moveProjectiles ?? {})),
      spriteFrameEdits: character.spriteFrameEdits ?? {},
      spriteSheets: getCharacterSpriteSheets(character),
      voxelProfile: character.voxelProfile ?? 'image-source',
      voxelFidelity: character.voxelFidelity ?? {}
    })
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json().catch(() => ({ ok: true })) as Promise<{ ok?: boolean; manifestPath?: string }>;
}

function getCharacterSpriteSheets(character: CharacterDefinition): CharacterSpriteSheet[] {
  if (character.spriteSheets && character.spriteSheets.length > 0) return character.spriteSheets;
  if (!character.spriteSheetPath) return [];
  const frameCount =
    character.spriteFrameCount ??
    Math.max(0, ...Object.values(character.animationFrames ?? {}).flat().map(getFrameIndex)) + 1;
  return [{
    id: 'base',
    name: 'Base Sheet',
    path: character.spriteSheetPath,
    frameStart: 0,
    frameCount
  }];
}

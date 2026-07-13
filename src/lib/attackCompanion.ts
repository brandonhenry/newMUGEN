import type { CharacterDefinition, FighterRuntime, MoveDefinition, MoveInput } from '../types';

const baseInputAnimationKeys: Record<MoveInput, string> = {
  jab: 'jableft',
  heavy: 'jabright',
  kick: 'kickleft',
  special: 'kickright'
};

export type ResolvedAttackCompanionAnimation = {
  key: string;
  frames: string[];
  fps: number;
};

export function getAttackCompanionMoveKeys(move: MoveDefinition) {
  const commandKeys = move.command
    ? [move.command, move.command.startsWith('cmd:') ? move.command.slice(4) : `cmd:${move.command}`]
    : [];
  return [...new Set([
    move.animationKey,
    ...commandKeys,
    move.comboKey,
    move.id,
    baseInputAnimationKeys[move.input],
    move.input
  ].filter((key): key is string => Boolean(key)))];
}

export function resolveAttackCompanionAnimation(
  character: CharacterDefinition,
  move: MoveDefinition | null | undefined
): ResolvedAttackCompanionAnimation | null {
  const companion = character.attackCompanion;
  if (!companion || !move) return null;

  const mappedKey = getAttackCompanionMoveKeys(move)
    .map((moveKey) => companion.moveAnimations[moveKey] ?? (companion.animations[moveKey]?.length ? moveKey : undefined))
    .find((animationKey): animationKey is string => Boolean(animationKey && companion.animations[animationKey]?.length));
  const fallbackKey = companion.inputFallbacks?.[move.input];
  const key = mappedKey ?? (fallbackKey && companion.animations[fallbackKey]?.length ? fallbackKey : undefined);
  if (!key) return null;
  return {
    key,
    frames: companion.animations[key],
    fps: companion.animationFrameRates?.[key] ?? character.animationFps ?? 8
  };
}

export function getAttackCompanionRenderSignature(
  fighter: Pick<FighterRuntime, 'state' | 'currentMove' | 'moveInstanceId' | 'character'>
) {
  if (fighter.state !== 'attack' || !fighter.currentMove) return '';
  const animation = resolveAttackCompanionAnimation(fighter.character, fighter.currentMove);
  return animation ? `${fighter.moveInstanceId}:${animation.key}` : '';
}

export function getAttackCompanionPosition(fighter: Pick<FighterRuntime, 'character' | 'position' | 'facingYaw'>) {
  const companion = fighter.character.attackCompanion;
  if (!companion) return { ...fighter.position };
  return {
    x: fighter.position.x + Math.sin(fighter.facingYaw) * companion.forwardOffset,
    y: fighter.position.y + (companion.verticalOffset ?? 0),
    z: fighter.position.z + Math.cos(fighter.facingYaw) * companion.forwardOffset
  };
}

export function getAttackCompanionRangeBonus(character: CharacterDefinition) {
  return Math.max(0, character.attackCompanion?.forwardOffset ?? 0);
}

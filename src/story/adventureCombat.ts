import { getAdventureDerivedStats, sanitizeAdventureProgress, type StoryAdventureProgressV1 } from './adventureProgress';
import { STORY_AVATAR_GROUNDING_OFFSET_Y, STORY_AVATAR_MESH_CENTER_Y, storyAvatarPlaneHeight } from './actorGrounding';
import { getStorySpriteAnimation, STORY_SPRITE_MANIFEST, storyAttackAnimationId } from './streetAvatarCatalog';
import type { StoryAttackInput, StoryAvatarSet, StoryEnemyArchetype, StorySpriteProjectileDefinition } from './types';

export const STORY_ATTACK_REACH = 2.45;
export const STORY_ATTACK_REAR_OVERLAP = 0.45;
export const STORY_ATTACK_BOTTOM_OFFSET = -0.45;
export const STORY_ATTACK_TOP_OFFSET = 2.2;
export const STORY_ATTACK_VISUAL_SYNC_DELAY_MS = 24;
export const STORY_PLAYER_INVULNERABILITY_MS = 650;
export const STORY_DAMAGE_POP_MS = 760;
export const STORY_DAMAGE_POP_REDUCED_MS = 260;

export type StoryAttackProfile = {
  damageMultiplier: number;
  knockbackMultiplier: number;
  recoveryMs: number;
};

export const STORY_ATTACK_PROFILES: Record<StoryAttackInput, StoryAttackProfile> = {
  jab: { damageMultiplier: 1, knockbackMultiplier: 1, recoveryMs: 100 },
  heavy: { damageMultiplier: 1.45, knockbackMultiplier: 1.35, recoveryMs: 160 },
  kick: { damageMultiplier: 1.15, knockbackMultiplier: 1.15, recoveryMs: 120 },
  special: { damageMultiplier: 1.75, knockbackMultiplier: 1.6, recoveryMs: 220 }
};

export function resolveStoryAttackInput(input: Partial<Record<StoryAttackInput, boolean>>): StoryAttackInput | null {
  return (['special', 'heavy', 'kick', 'jab'] as const).find((attackInput) => input[attackInput]) ?? null;
}

export type AdventureDamageFeedback = {
  damage: number;
  critical: boolean;
  finishing: boolean;
  offsetX: number;
  endOffsetX: number;
  durationMs: number;
};

export type AdventureHitReaction = {
  shakeDurationMs: number;
  shakeStrength: number;
  staggerMs: number;
  defeatLingerMs: number;
};

export function createAdventureHitReaction(critical: boolean, reducedMotion: boolean): AdventureHitReaction {
  return {
    shakeDurationMs: reducedMotion ? 0 : critical ? 230 : 170,
    shakeStrength: reducedMotion ? 0 : critical ? 0.24 : 0.16,
    staggerMs: critical ? 150 : 105,
    defeatLingerMs: reducedMotion ? 80 : 190
  };
}

export function createAdventureDamageFeedback(input: {
  damage: number;
  critical: boolean;
  finishing: boolean;
  sequence: number;
  reducedMotion: boolean;
}): AdventureDamageFeedback {
  const lane = [-18, 2, 20][Math.abs(Math.round(input.sequence)) % 3];
  return {
    damage: Math.max(1, Math.round(Number.isFinite(input.damage) ? input.damage : 1)),
    critical: Boolean(input.critical),
    finishing: Boolean(input.finishing),
    offsetX: lane,
    endOffsetX: lane + (lane <= 0 ? -8 : 8),
    durationMs: input.reducedMotion ? STORY_DAMAGE_POP_REDUCED_MS : STORY_DAMAGE_POP_MS
  };
}

export type AdventureEnemyScaledStats = {
  maxHealth: number;
  damage: number;
  speed: number;
  xp: number;
  attackCooldownMs: number;
};

const ARCHETYPE_BASE: Record<StoryEnemyArchetype, AdventureEnemyScaledStats> = {
  ground: { maxHealth: 60, damage: 10, speed: 1.8, xp: 20, attackCooldownMs: 950 },
  flying: { maxHealth: 48, damage: 9, speed: 2.25, xp: 24, attackCooldownMs: 1_150 },
  ranged: { maxHealth: 44, damage: 8, speed: 1.35, xp: 28, attackCooldownMs: 1_700 }
};

function safeLevel(level: number) {
  return Math.max(1, Math.min(100, Math.round(Number.isFinite(level) ? level : 1)));
}

export function getAdventureEnemyStats(archetype: StoryEnemyArchetype, level: number): AdventureEnemyScaledStats {
  const base = ARCHETYPE_BASE[archetype];
  const levelOffset = safeLevel(level) - 1;
  return {
    maxHealth: Math.round(base.maxHealth * (1 + levelOffset * 0.025)),
    damage: Math.round(base.damage * (1 + levelOffset * 0.015)),
    speed: base.speed * Math.min(1.35, 1 + levelOffset * 0.0035),
    xp: Math.round(base.xp + (archetype === 'ground' ? 2 : archetype === 'flying' ? 2.4 : 2.8) * safeLevel(level)),
    attackCooldownMs: base.attackCooldownMs
  };
}

export function resolveAdventurePlayerAttack(
  progress: StoryAdventureProgressV1,
  inputOrRoll: StoryAttackInput | number = 'jab',
  roll = Math.random()
) {
  const attackInput = typeof inputOrRoll === 'number' ? 'jab' : inputOrRoll;
  const criticalRoll = typeof inputOrRoll === 'number' ? inputOrRoll : roll;
  const profile = STORY_ATTACK_PROFILES[attackInput];
  const current = sanitizeAdventureProgress(progress);
  const derived = getAdventureDerivedStats(current);
  const critical = Math.max(0, Math.min(0.999999, criticalRoll)) < derived.criticalChance;
  return {
    damage: Math.max(1, Math.round(derived.attackDamage * profile.damageMultiplier * (critical ? derived.criticalMultiplier : 1))),
    critical,
    knockbackMultiplier: profile.knockbackMultiplier
  };
}

export function getStoryAttackDurationMs(avatarSet: StoryAvatarSet, attackInput: StoryAttackInput): number {
  const animation = getStorySpriteAnimation(avatarSet, storyAttackAnimationId(attackInput));
  return animation.frames.reduce((total, frame) => total + frame.durationMs, 0) + STORY_ATTACK_PROFILES[attackInput].recoveryMs;
}

export function resolveAdventurePlayerDamage(baseDamage: number, progress: StoryAdventureProgressV1) {
  const derived = getAdventureDerivedStats(progress);
  return {
    damage: Math.max(1, Math.round(Math.max(0, baseDamage) * derived.damageTakenMultiplier)),
    knockback: 1.15 * derived.knockbackMultiplier
  };
}

export type AdventureAttackTargetKind = StoryEnemyArchetype | 'projectile';

export type AdventureAttackBox = {
  forwardReach: number;
  rearReach: number;
  bottomOffset: number;
  topOffset: number;
};

const ATTACK_TARGET_HALF_SIZE: Record<AdventureAttackTargetKind, { width: number; height: number }> = {
  ground: { width: 0.85, height: 0.85 },
  flying: { width: 0.78, height: 0.78 },
  ranged: { width: 0.85, height: 0.85 },
  projectile: { width: 0.2, height: 0.2 }
};

export function getAdventureAttackFrameHitbox(avatarSet: StoryAvatarSet, elapsedMs: number): AdventureAttackBox | null;
export function getAdventureAttackFrameHitbox(avatarSet: StoryAvatarSet, attackInput: StoryAttackInput, elapsedMs: number): AdventureAttackBox | null;
export function getAdventureAttackFrameHitbox(
  avatarSet: StoryAvatarSet,
  inputOrElapsed: StoryAttackInput | number,
  maybeElapsed?: number
): AdventureAttackBox | null {
  const attackInput = typeof inputOrElapsed === 'number' ? 'jab' : inputOrElapsed;
  const elapsedMs = typeof inputOrElapsed === 'number' ? inputOrElapsed : maybeElapsed ?? -1;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  const animation = getStorySpriteAnimation(avatarSet, storyAttackAnimationId(attackInput));
  let frameStartMs = 0;
  let frameIndex = -1;
  for (let index = 0; index < animation.frames.length; index += 1) {
    const frameEndMs = frameStartMs + animation.frames[index].durationMs;
    if (elapsedMs < frameEndMs) {
      frameIndex = index;
      break;
    }
    frameStartMs = frameEndMs;
  }
  const activeFrames = animation.activeFrameRange;
  if (!activeFrames) return null;
  if (frameIndex < activeFrames[0] || frameIndex > activeFrames[1]) return null;
  const frame = animation.frames[frameIndex];
  const pixelsToWorld = storyAvatarPlaneHeight() / STORY_SPRITE_MANIFEST.frameSize.height;
  const [left, top, right, bottom] = frame.contentBounds;
  const planeTop = STORY_AVATAR_GROUNDING_OFFSET_Y + STORY_AVATAR_MESH_CENTER_Y + storyAvatarPlaneHeight() / 2;
  return {
    forwardReach: Math.max(0, (right - frame.bodyAnchorX) * pixelsToWorld),
    rearReach: Math.max(0, (frame.bodyAnchorX - left) * pixelsToWorld),
    bottomOffset: planeTop - bottom * pixelsToWorld,
    topOffset: planeTop - top * pixelsToWorld
  };
}

export function adventureAttackHits(input: {
  playerX: number;
  playerY: number;
  facing: -1 | 1;
  enemyX: number;
  enemyY: number;
  targetKind?: AdventureAttackTargetKind;
  targetHalfSize?: { width: number; height: number };
  attackBox?: AdventureAttackBox;
}) {
  const target = input.targetHalfSize ?? ATTACK_TARGET_HALF_SIZE[input.targetKind ?? 'ground'];
  const attackBox = input.attackBox ?? {
    forwardReach: STORY_ATTACK_REACH,
    rearReach: STORY_ATTACK_REAR_OVERLAP,
    bottomOffset: STORY_ATTACK_BOTTOM_OFFSET,
    topOffset: STORY_ATTACK_TOP_OFFSET
  };
  const horizontal = (input.enemyX - input.playerX) * input.facing;
  const overlapsHorizontally = horizontal + target.width >= -attackBox.rearReach
    && horizontal - target.width <= attackBox.forwardReach;
  const attackBottom = input.playerY + attackBox.bottomOffset;
  const attackTop = input.playerY + attackBox.topOffset;
  const overlapsVertically = input.enemyY + target.height >= attackBottom
    && input.enemyY - target.height <= attackTop;
  return overlapsHorizontally && overlapsVertically;
}

export function storyPlayerProjectileHits(input: {
  projectileX: number;
  projectileY: number;
  hitboxSize: [number, number];
  targetX: number;
  targetY: number;
  targetKind?: AdventureAttackTargetKind;
  targetHalfSize?: { width: number; height: number };
}) {
  const [width, height] = input.hitboxSize;
  return adventureAttackHits({
    playerX: input.projectileX,
    playerY: input.projectileY,
    facing: 1,
    enemyX: input.targetX,
    enemyY: input.targetY,
    targetKind: input.targetKind,
    targetHalfSize: input.targetHalfSize,
    attackBox: {
      forwardReach: Math.max(0, width / 2),
      rearReach: Math.max(0, width / 2),
      bottomOffset: -Math.max(0, height / 2),
      topOffset: Math.max(0, height / 2)
    }
  });
}

export function getStoryProjectileSpawnPosition(input: {
  playerX: number;
  playerY: number;
  facing: -1 | 1;
  rigOffsetX: number;
  rigOffsetY: number;
  projectile: StorySpriteProjectileDefinition;
}) {
  const planeHeight = storyAvatarPlaneHeight();
  const pixelsToWorld = planeHeight / STORY_SPRITE_MANIFEST.frameSize.height;
  const launchX = input.playerX + input.rigOffsetX
    + input.facing * (input.projectile.launchPoint[0] - STORY_SPRITE_MANIFEST.frameSize.width / 2) * pixelsToWorld;
  const launchY = input.playerY + input.rigOffsetY + STORY_AVATAR_MESH_CENTER_Y + planeHeight / 2
    - input.projectile.launchPoint[1] * pixelsToWorld;
  const [left, top, , bottom] = input.projectile.frames[0].contentBounds;
  const contentLeftFromPlaneCenter = (left / input.projectile.frameSize.width - 0.5) * input.projectile.worldSize[0];
  const contentCenterFromPlaneCenter = (0.5 - (top + bottom) / 2 / input.projectile.frameSize.height) * input.projectile.worldSize[1];
  return {
    x: launchX - input.facing * contentLeftFromPlaneCenter,
    y: launchY - contentCenterFromPlaneCenter,
    launchX,
    launchY
  };
}

export function canDamageAdventurePlayer(nowMs: number, invulnerableUntilMs: number) {
  return nowMs >= invulnerableUntilMs;
}

export function stepAdventureProjectile(input: {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  deltaSeconds: number;
}) {
  const delta = Math.max(0, Math.min(0.1, input.deltaSeconds));
  return {
    x: input.x + input.velocityX * delta,
    y: input.y + input.velocityY * delta
  };
}

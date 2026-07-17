import { getAdventureDerivedStats, sanitizeAdventureProgress, type StoryAdventureProgressV1 } from './adventureProgress';
import { STORY_AVATAR_GROUNDING_OFFSET_Y, STORY_AVATAR_MESH_CENTER_Y, storyAvatarPlaneHeight } from './actorGrounding';
import { getStorySpriteAnimation, STORY_SPRITE_MANIFEST } from './streetAvatarCatalog';
import type { StoryAvatarSet, StoryEnemyArchetype } from './types';

export const STORY_ATTACK_REACH = 2.45;
export const STORY_ATTACK_REAR_OVERLAP = 0.45;
export const STORY_ATTACK_BOTTOM_OFFSET = -0.45;
export const STORY_ATTACK_TOP_OFFSET = 2.2;
export const STORY_ATTACK_VISUAL_SYNC_DELAY_MS = 24;
export const STORY_PLAYER_INVULNERABILITY_MS = 650;
export const STORY_ENEMY_RESPAWN_MS = 10_000;
export const STORY_DAMAGE_POP_MS = 760;
export const STORY_DAMAGE_POP_REDUCED_MS = 260;

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

export function resolveAdventurePlayerAttack(progress: StoryAdventureProgressV1, roll = Math.random()) {
  const current = sanitizeAdventureProgress(progress);
  const derived = getAdventureDerivedStats(current);
  const critical = Math.max(0, Math.min(0.999999, roll)) < derived.criticalChance;
  return {
    damage: Math.max(1, Math.round(derived.attackDamage * (critical ? derived.criticalMultiplier : 1))),
    critical
  };
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

const STORY_ATTACK_ACTIVE_FRAMES: Record<StoryAvatarSet, readonly [first: number, last: number]> = {
  'arena-rebel': [3, 6],
  'circuit-mage': [1, 4],
  'crimson-ranger': [3, 6],
  'ember-scout': [3, 6],
  'forest-warden': [3, 6],
  'neon-courier': [3, 5],
  'rose-blade': [3, 5],
  'solar-brawler': [2, 5],
  'solar-runner': [3, 4],
  'street-medic': [2, 6],
  'street-shadow': [5, 7],
  'synth-drifter': [0, 5],
  'tech-nomad': [0, 5],
  'void-operative': [1, 5]
};

const ATTACK_TARGET_HALF_SIZE: Record<AdventureAttackTargetKind, { width: number; height: number }> = {
  ground: { width: 0.85, height: 0.85 },
  flying: { width: 0.78, height: 0.78 },
  ranged: { width: 0.85, height: 0.85 },
  projectile: { width: 0.2, height: 0.2 }
};

export function getAdventureAttackFrameHitbox(avatarSet: StoryAvatarSet, elapsedMs: number): AdventureAttackBox | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  const animation = getStorySpriteAnimation(avatarSet, 'attack');
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
  const activeFrames = STORY_ATTACK_ACTIVE_FRAMES[avatarSet];
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
  attackBox?: AdventureAttackBox;
}) {
  const target = ATTACK_TARGET_HALF_SIZE[input.targetKind ?? 'ground'];
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

export function canDamageAdventurePlayer(nowMs: number, invulnerableUntilMs: number) {
  return nowMs >= invulnerableUntilMs;
}

export function shouldRespawnAdventureEnemy(nowMs: number, defeatedAtMs: number, onScreen: boolean) {
  return !onScreen && nowMs - defeatedAtMs >= STORY_ENEMY_RESPAWN_MS;
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

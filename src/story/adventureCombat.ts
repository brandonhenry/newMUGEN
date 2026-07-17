import { getAdventureDerivedStats, sanitizeAdventureProgress, type StoryAdventureProgressV1 } from './adventureProgress';
import type { StoryEnemyArchetype } from './types';

export const STORY_ATTACK_REACH = 1.65;
export const STORY_ATTACK_VERTICAL_REACH = 1.25;
export const STORY_PLAYER_INVULNERABILITY_MS = 650;
export const STORY_ENEMY_RESPAWN_MS = 10_000;

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

export function adventureAttackHits(input: {
  playerX: number;
  playerY: number;
  facing: -1 | 1;
  enemyX: number;
  enemyY: number;
}) {
  const horizontal = (input.enemyX - input.playerX) * input.facing;
  return horizontal >= -0.2 && horizontal <= STORY_ATTACK_REACH && Math.abs(input.enemyY - input.playerY) <= STORY_ATTACK_VERTICAL_REACH;
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

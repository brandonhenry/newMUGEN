import { describe, expect, it } from 'vitest';
import { sanitizeAdventureProgress } from './adventureProgress';
import {
  STORY_ENEMY_RESPAWN_MS,
  STORY_DAMAGE_POP_MS,
  STORY_DAMAGE_POP_REDUCED_MS,
  adventureAttackHits,
  canDamageAdventurePlayer,
  createAdventureDamageFeedback,
  createAdventureHitReaction,
  getAdventureAttackFrameHitbox,
  getAdventureEnemyStats,
  resolveAdventurePlayerAttack,
  resolveAdventurePlayerDamage,
  shouldRespawnAdventureEnemy,
  stepAdventureProjectile
} from './adventureCombat';

describe('story adventure combat math', () => {
  it('scales distinct enemy archetypes to the player level', () => {
    const ground = getAdventureEnemyStats('ground', 1);
    const ranged = getAdventureEnemyStats('ranged', 100);
    expect(ground).toMatchObject({ maxHealth: 60, damage: 10, xp: 22 });
    expect(ranged.maxHealth).toBeGreaterThan(ground.maxHealth);
    expect(ranged.xp).toBeGreaterThan(ground.xp);
    expect(ranged.attackCooldownMs).toBeGreaterThan(ground.attackCooldownMs);
  });

  it('resolves attack reach, critical hits, guard, and invulnerability', () => {
    const attacker = sanitizeAdventureProgress({ level: 26, stats: { critical: 25, power: 0, vitality: 0, agility: 0, guard: 0, insight: 0 } });
    expect(resolveAdventurePlayerAttack(attacker, 0.1).critical).toBe(true);
    expect(resolveAdventurePlayerAttack(attacker, 0.9).critical).toBe(false);
    expect(adventureAttackHits({ playerX: 0, playerY: 1, facing: 1, enemyX: 1.4, enemyY: 1.5 })).toBe(true);
    expect(adventureAttackHits({ playerX: 0, playerY: 1, facing: -1, enemyX: 1.4, enemyY: 1 })).toBe(false);
    const guarded = sanitizeAdventureProgress({ level: 26, stats: { guard: 25 } });
    expect(resolveAdventurePlayerDamage(20, guarded)).toMatchObject({ damage: 15, knockback: 0.575 });
    expect(canDamageAdventurePlayer(1_000, 999)).toBe(true);
    expect(canDamageAdventurePlayer(1_000, 1_001)).toBe(false);
  });

  it('registers visible attack-box overlap for every enemy archetype', () => {
    expect(adventureAttackHits({ playerX: 0, playerY: 0.82, facing: 1, enemyX: 2.9, enemyY: 0.82, targetKind: 'ground' })).toBe(true);
    expect(adventureAttackHits({ playerX: 0, playerY: 0.82, facing: 1, enemyX: 1.5, enemyY: 3.2, targetKind: 'flying' })).toBe(true);
    expect(adventureAttackHits({ playerX: 0, playerY: 0.82, facing: -1, enemyX: -2.9, enemyY: 0.82, targetKind: 'ranged' })).toBe(true);
  });

  it('counts body overlap across the player without hitting distant or non-overlapping targets', () => {
    expect(adventureAttackHits({ playerX: 0, playerY: 0.82, facing: 1, enemyX: -1.1, enemyY: 0.82, targetKind: 'ground' })).toBe(true);
    expect(adventureAttackHits({ playerX: 0, playerY: 0.82, facing: 1, enemyX: -1.4, enemyY: 0.82, targetKind: 'ground' })).toBe(false);
    expect(adventureAttackHits({ playerX: 0, playerY: 0.82, facing: 1, enemyX: 4, enemyY: 0.82, targetKind: 'ranged' })).toBe(false);
    expect(adventureAttackHits({ playerX: 0, playerY: 0.82, facing: 1, enemyX: 1.5, enemyY: 4.2, targetKind: 'flying' })).toBe(false);
  });

  it('opens hit detection on authored contact frames and follows the visible frame reach', () => {
    expect(getAdventureAttackFrameHitbox('arena-rebel', 245)).toBeNull();
    const earlyContact = getAdventureAttackFrameHitbox('arena-rebel', 246);
    const extendedContact = getAdventureAttackFrameHitbox('arena-rebel', 410);
    expect(earlyContact).not.toBeNull();
    expect(extendedContact).not.toBeNull();
    expect(adventureAttackHits({ playerX: 0, playerY: 0.82, facing: 1, enemyX: 2.4, enemyY: 0.82, targetKind: 'ground', attackBox: earlyContact! })).toBe(false);
    expect(adventureAttackHits({ playerX: 0, playerY: 0.82, facing: 1, enemyX: 2.4, enemyY: 0.82, targetKind: 'ground', attackBox: extendedContact! })).toBe(true);
    expect(getAdventureAttackFrameHitbox('arena-rebel', 574)).toBeNull();
  });

  it('steps projectiles safely and waits for offscreen enemy respawns', () => {
    expect(stepAdventureProjectile({ x: 0, y: 1, velocityX: 10, velocityY: -2, deltaSeconds: 0.25 })).toEqual({ x: 1, y: 0.8 });
    expect(shouldRespawnAdventureEnemy(STORY_ENEMY_RESPAWN_MS, 0, true)).toBe(false);
    expect(shouldRespawnAdventureEnemy(STORY_ENEMY_RESPAWN_MS - 1, 0, false)).toBe(false);
    expect(shouldRespawnAdventureEnemy(STORY_ENEMY_RESPAWN_MS, 0, false)).toBe(true);
  });

  it('creates staggered normal, critical, finishing, and reduced-motion damage feedback', () => {
    const normal = createAdventureDamageFeedback({ damage: 12.4, critical: false, finishing: false, sequence: 0, reducedMotion: false });
    const critical = createAdventureDamageFeedback({ damage: 35, critical: true, finishing: false, sequence: 1, reducedMotion: false });
    const finishing = createAdventureDamageFeedback({ damage: 90, critical: true, finishing: true, sequence: 2, reducedMotion: true });
    expect(normal).toMatchObject({ damage: 12, critical: false, finishing: false, durationMs: STORY_DAMAGE_POP_MS });
    expect(critical.critical).toBe(true);
    expect(new Set([normal.offsetX, critical.offsetX, finishing.offsetX]).size).toBe(3);
    expect(finishing).toMatchObject({ damage: 90, critical: true, finishing: true, durationMs: STORY_DAMAGE_POP_REDUCED_MS });
  });

  it('gives confirmed hits a damped shake and brief stagger while respecting reduced motion', () => {
    expect(createAdventureHitReaction(false, false)).toEqual({ shakeDurationMs: 170, shakeStrength: 0.16, staggerMs: 105, defeatLingerMs: 190 });
    expect(createAdventureHitReaction(true, false)).toEqual({ shakeDurationMs: 230, shakeStrength: 0.24, staggerMs: 150, defeatLingerMs: 190 });
    expect(createAdventureHitReaction(true, true)).toEqual({ shakeDurationMs: 0, shakeStrength: 0, staggerMs: 150, defeatLingerMs: 80 });
  });
});

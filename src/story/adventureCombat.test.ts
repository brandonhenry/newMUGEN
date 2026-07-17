import { describe, expect, it } from 'vitest';
import { sanitizeAdventureProgress } from './adventureProgress';
import {
  STORY_ENEMY_RESPAWN_MS,
  adventureAttackHits,
  canDamageAdventurePlayer,
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

  it('steps projectiles safely and waits for offscreen enemy respawns', () => {
    expect(stepAdventureProjectile({ x: 0, y: 1, velocityX: 10, velocityY: -2, deltaSeconds: 0.25 })).toEqual({ x: 1, y: 0.8 });
    expect(shouldRespawnAdventureEnemy(STORY_ENEMY_RESPAWN_MS, 0, true)).toBe(false);
    expect(shouldRespawnAdventureEnemy(STORY_ENEMY_RESPAWN_MS - 1, 0, false)).toBe(false);
    expect(shouldRespawnAdventureEnemy(STORY_ENEMY_RESPAWN_MS, 0, false)).toBe(true);
  });
});

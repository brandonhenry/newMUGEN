import { describe, expect, it } from 'vitest';
import { sanitizeAdventureProgress } from './adventureProgress';
import {
  STORY_ENEMY_RESPAWN_MS,
  STORY_DAMAGE_POP_MS,
  STORY_DAMAGE_POP_REDUCED_MS,
  STORY_ATTACK_PROFILES,
  adventureAttackHits,
  canDamageAdventurePlayer,
  createAdventureDamageFeedback,
  createAdventureHitReaction,
  getAdventureAttackFrameHitbox,
  getAdventureEnemyStats,
  getStoryAttackDurationMs,
  resolveAdventurePlayerAttack,
  resolveAdventurePlayerDamage,
  resolveStoryAttackInput,
  shouldRespawnAdventureEnemy,
  stepAdventureProjectile,
  storyPlayerProjectileHits
} from './adventureCombat';
import { getStorySpriteProjectile } from './streetAvatarCatalog';

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

  it('applies all four move multipliers, authored cooldowns, and simultaneous-input priority', () => {
    const attacker = sanitizeAdventureProgress({ level: 1, stats: {} });
    const jab = resolveAdventurePlayerAttack(attacker, 'jab', 0.99);
    const heavy = resolveAdventurePlayerAttack(attacker, 'heavy', 0.99);
    const kick = resolveAdventurePlayerAttack(attacker, 'kick', 0.99);
    const special = resolveAdventurePlayerAttack(attacker, 'special', 0.99);
    expect(heavy.damage).toBe(Math.round(jab.damage * STORY_ATTACK_PROFILES.heavy.damageMultiplier));
    expect(kick.damage).toBe(Math.round(jab.damage * STORY_ATTACK_PROFILES.kick.damageMultiplier));
    expect(special.damage).toBe(Math.round(jab.damage * STORY_ATTACK_PROFILES.special.damageMultiplier));
    expect([jab.knockbackMultiplier, heavy.knockbackMultiplier, kick.knockbackMultiplier, special.knockbackMultiplier]).toEqual([1, 1.35, 1.15, 1.6]);
    expect(getStoryAttackDurationMs('arena-rebel', 'heavy')).toBe(1_040);
    expect(getStoryAttackDurationMs('arena-rebel', 'kick')).toBe(776);
    expect(getStoryAttackDurationMs('arena-rebel', 'special')).toBe(1_220);
    expect(resolveStoryAttackInput({ jab: true, kick: true, heavy: true, special: true })).toBe('special');
    expect(resolveStoryAttackInput({ jab: true, kick: true, heavy: true })).toBe('heavy');
    expect(resolveStoryAttackInput({ jab: true, kick: true })).toBe('kick');
    expect(resolveStoryAttackInput({ jab: true })).toBe('jab');
  });

  it('uses manifest active ranges for each added move', () => {
    expect(getAdventureAttackFrameHitbox('arena-rebel', 'heavy', 329)).toBeNull();
    expect(getAdventureAttackFrameHitbox('arena-rebel', 'heavy', 330)).not.toBeNull();
    expect(getAdventureAttackFrameHitbox('arena-rebel', 'heavy', 660)).toBeNull();
    expect(getAdventureAttackFrameHitbox('arena-rebel', 'kick', 163)).toBeNull();
    expect(getAdventureAttackFrameHitbox('arena-rebel', 'kick', 164)).not.toBeNull();
    expect(getAdventureAttackFrameHitbox('arena-rebel', 'special', 374)).toBeNull();
    expect(getAdventureAttackFrameHitbox('arena-rebel', 'special', 375)).not.toBeNull();
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

  it('moves special projectile PNG entities independently and collides from their own bounds', () => {
    const projectile = getStorySpriteProjectile('solar-runner')!;
    expect(projectile.frames.every((frame) => frame.path.includes('/projectiles/special/'))).toBe(true);
    expect(stepAdventureProjectile({ x: 2, y: 1.6, velocityX: projectile.speed, velocityY: 0, deltaSeconds: 0.1 })).toEqual({ x: 3, y: 1.6 });
    expect(storyPlayerProjectileHits({ projectileX: 3, projectileY: 1.6, hitboxSize: projectile.hitboxSize, targetX: 3.8, targetY: 1.6, targetKind: 'ground' })).toBe(true);
    expect(storyPlayerProjectileHits({ projectileX: 3, projectileY: 1.6, hitboxSize: projectile.hitboxSize, targetX: 5.5, targetY: 1.6, targetKind: 'ground' })).toBe(false);
    expect(storyPlayerProjectileHits({ projectileX: 3, projectileY: 1.6, hitboxSize: projectile.hitboxSize, targetX: 3.4, targetY: 1.6, targetKind: 'projectile' })).toBe(true);
    expect(getStorySpriteProjectile('street-shadow')).toBeUndefined();
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

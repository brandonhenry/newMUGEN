import { describe, expect, it } from 'vitest';
import { defaultCharacterProjectile, sanitizeMoveProjectileInstance, sanitizeProjectile } from './projectiles';

describe('projectile opt-in behavior', () => {
  it('keeps velocity alignment disabled unless authored', () => {
    expect(defaultCharacterProjectile().alignToVelocity).toBe(false);
    expect(sanitizeProjectile({ id: 'legacy' }).alignToVelocity).toBe(false);
    expect(sanitizeProjectile({ id: 'arrow', alignToVelocity: true }).alignToVelocity).toBe(true);
  });

  it('keeps additional hit delivery as the backwards-compatible default', () => {
    expect(sanitizeMoveProjectileInstance({ id: 'legacy', projectileId: 'bullet' }).delivery).toBe('additional');
    expect(sanitizeMoveProjectileInstance({
      id: 'replacement',
      projectileId: 'arrow',
      delivery: 'replaceMoveHit'
    }).delivery).toBe('replaceMoveHit');
  });

  it('sanitizes authored web traps and rejects unknown trap kinds', () => {
    expect(sanitizeMoveProjectileInstance({
      id: 'web',
      projectileId: 'web-shot',
      trap: { kind: 'web', durationFrames: 240, escapePresses: 12, visualProjectileId: 'web-prison' }
    }).trap).toEqual({
      kind: 'web',
      durationFrames: 240,
      escapePresses: 12,
      visualProjectileId: 'web-prison'
    });
    expect(sanitizeMoveProjectileInstance({
      id: 'unknown',
      projectileId: 'shot',
      trap: { kind: 'ice' }
    }).trap).toBeUndefined();
  });
});

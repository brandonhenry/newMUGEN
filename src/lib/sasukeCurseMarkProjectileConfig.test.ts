import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CharacterDefinition } from '../types';

const character = JSON.parse(readFileSync(
  join(process.cwd(), 'public', 'characters', 'sasuke-curse-mark', 'character.json'),
  'utf8'
)) as CharacterDefinition;

describe('Sasuke Curse Mark fireball configuration', () => {
  it('uses the hand-seal and release sequence for Fireball Jutsu', () => {
    expect(character.animationFrames?.['cmd:qcf+4']).toEqual(
      Array.from({ length: 14 }, (_, index) => (
        `/characters/sasuke-curse-mark/frames/frame-${String(180 + index).padStart(3, '0')}.png`
      ))
    );
    expect(character.moveOverrides?.['cmd:qcf+4']?.label).toBe('Fire Style: Fireball Jutsu');
  });

  it('binds the sprite-derived fireball at the move startup boundary', () => {
    expect(character.moveProjectiles?.['cmd:qcf+4']).toEqual([
      expect.objectContaining({
        projectileId: 'fireball-jutsu',
        spawnFrame: 28,
        forwardVelocity: 8.5,
        delivery: 'replaceMoveHit'
      })
    ]);
  });

  it('registers all twelve extracted flame frames', () => {
    const projectile = character.projectiles?.find(({ id }) => id === 'fireball-jutsu');
    expect(projectile?.frames).toHaveLength(12);
    for (const frame of projectile?.frames ?? []) {
      expect(existsSync(join(process.cwd(), 'public', frame))).toBe(true);
    }
  });
});

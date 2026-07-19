import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { starterCharacters } from '../data/characters';
import { stages } from '../data/stages';
import { createMatch, stepMatch } from '../engine/fightEngine';
import { emptyInputFrame, type CharacterDefinition } from '../types';
import { normalizeCharacter } from './characterLoader';

const character = JSON.parse(readFileSync(
  join(process.cwd(), 'public', 'characters', 'impmon', 'character.json'),
  'utf8'
)) as CharacterDefinition;

describe('Impmon Aura Drive projectile configuration', () => {
  it('keeps projectile-only cells out of the fighter animation', () => {
    expect(character.animationFrames?.['cmd:O+2']).toEqual(
      [96, 97, 98, 99, 101, 103, 104, 105].map((frame) => (
        `/characters/impmon/frames/frame-${String(frame).padStart(3, '0')}.png`
      ))
    );
  });

  it('registers the removed green-orb cells as a dedicated projectile', () => {
    const projectile = character.projectiles?.find(({ id }) => id === 'aura-drive-green-orb');
    expect(projectile).toMatchObject({
      kind: 'projectile',
      alignToVelocity: true,
      frames: [
        '/characters/impmon/projectiles/aura-drive-green-orb/frames/frame-000.png',
        '/characters/impmon/projectiles/aura-drive-green-orb/frames/frame-001.png'
      ]
    });
    for (const frame of projectile?.frames ?? []) {
      expect(existsSync(join(process.cwd(), 'public', frame))).toBe(true);
    }
  });

  it('spawns the green orb when Aura Drive reaches its active boundary', () => {
    const impmon = normalizeCharacter(character);
    let match = createMatch(impmon, starterCharacters[1], stages[0], 'local2p', 3, { controlScheme: 'kore' });
    match.fighters[0].ki = 35;

    const auraDriveInput = emptyInputFrame();
    auraDriveInput.charge = true;
    auraDriveInput.heavy = true;
    match = stepMatch(match, auraDriveInput, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].currentMove?.animationKey).toBe('cmd:O+2');
    expect(match.projectiles).toHaveLength(0);

    for (let frame = 0; frame < 30; frame += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.projectiles).toContainEqual(expect.objectContaining({
      projectileId: 'aura-drive-green-orb',
      move: expect.objectContaining({ animationKey: 'cmd:O+2' })
    }));
  });

  it('uses projectile hit delivery at frame 30', () => {
    expect(character.moveProjectiles?.['cmd:O+2']).toEqual([
      expect.objectContaining({
        projectileId: 'aura-drive-green-orb',
        spawnFrame: 30,
        delivery: 'replaceMoveHit'
      })
    ]);
  });
});

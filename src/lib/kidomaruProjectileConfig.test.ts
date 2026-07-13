import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CharacterDefinition } from '../types';

const character = JSON.parse(readFileSync(
  join(process.cwd(), 'public', 'characters', 'kidomaru-curse-mark', 'character.json'),
  'utf8'
)) as CharacterDefinition;

describe('Kidomaru Curse Mark projectile configuration', () => {
  it('uses coherent fighter-only bow sequences for all eight commands', () => {
    const expectedFrames: Record<string, number[]> = {
      'cmd:f+1': [136, 137, 138],
      'cmd:d/f+2': [161, 162, 163],
      'cmd:qcf+4': [186, 187, 188, 189],
      'cmd:WS+4': [212, 213, 214, 215, 216, 218, 220],
      'cmd:FC+1': [228, 231, 232, 233, 234, 236],
      'cmd:FC+2': [244, 247, 248, 249, 250, 252],
      'cmd:2+4': [108, 109, 110, 111, 112],
      'cmd:3+4': [258, 262, 265, 266, 267, 269, 275]
    };

    for (const [command, frameNumbers] of Object.entries(expectedFrames)) {
      expect(character.animationFrames?.[command]).toEqual(frameNumbers.map((frame) => (
        `/characters/kidomaru-curse-mark/frames/frame-${String(frame).padStart(3, '0')}.png`
      )));
    }
  });

  it('binds authored trajectories at each move startup boundary', () => {
    const expected: Record<string, { spawnFrame: number; verticalVelocity: number }> = {
      'cmd:f+1': { spawnFrame: 14, verticalVelocity: 0 },
      'cmd:d/f+2': { spawnFrame: 19, verticalVelocity: 6.91 },
      'cmd:qcf+4': { spawnFrame: 20, verticalVelocity: -6.91 },
      'cmd:WS+4': { spawnFrame: 13, verticalVelocity: 0 },
      'cmd:FC+1': { spawnFrame: 13, verticalVelocity: 2.76 },
      'cmd:FC+2': { spawnFrame: 17, verticalVelocity: 11.71 },
      'cmd:2+4': { spawnFrame: 29, verticalVelocity: -2.76 }
    };

    for (const [command, trajectory] of Object.entries(expected)) {
      const instances = character.moveProjectiles?.[command] ?? [];
      expect(instances).toHaveLength(1);
      expect(instances[0]).toMatchObject({
        projectileId: 'spider-war-arrow',
        forwardVelocity: 13,
        delivery: 'replaceMoveHit',
        ...trajectory
      });
    }
  });

  it('creates a three-arrow fan without exceeding the source move damage budget', () => {
    const fan = character.moveProjectiles?.['cmd:3+4'] ?? [];
    expect(fan).toHaveLength(3);
    expect(fan.map((instance) => instance.verticalVelocity)).toEqual([-5.79, 0, 5.79]);
    expect(fan.reduce((total, instance) => total + instance.damageScale, 0)).toBeCloseTo(1, 6);
    expect(fan.every((instance) => instance.spawnFrame === 22 && instance.delivery === 'replaceMoveHit')).toBe(true);
  });

  it('uses the sprite-derived arrow asset with velocity alignment enabled', () => {
    expect(character.projectiles).toHaveLength(1);
    expect(character.projectiles?.[0]).toMatchObject({
      id: 'spider-war-arrow',
      alignToVelocity: true,
      frames: ['/characters/kidomaru-curse-mark/projectiles/spider-war-arrow/frames/frame-000.png']
    });
  });
});

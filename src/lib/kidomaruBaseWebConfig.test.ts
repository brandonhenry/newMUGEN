import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CharacterDefinition } from '../types';

const character = JSON.parse(readFileSync(
  join(process.cwd(), 'public', 'characters', 'kidomaru', 'character.json'),
  'utf8'
)) as CharacterDefinition;

describe('Kidomaru base web configuration', () => {
  it('keeps projectile-only cells out of fighter animations', () => {
    const expected: Record<string, number[]> = {
      'cmd:FC+1': [195, 199, 202],
      'cmd:1+3': [75, 77, 79, 81, 83],
      'cmd:2+3': [103, 105, 107, 109, 111],
      'cmd:2+4': [119, 121, 124, 127],
      'cmd:3+4': [168, 172, 175]
    };
    for (const [key, frames] of Object.entries(expected)) {
      expect(character.animationFrames?.[key]).toEqual(frames.map((frame) => (
        `/characters/kidomaru/frames/frame-${String(frame).padStart(3, '0')}.png`
      )));
    }
  });

  it('binds every web move to the reusable web-prison trap', () => {
    const webMoves = ['jableft', 'kickright', 'cmd:FC+1', 'cmd:1+3', 'cmd:2+3', 'cmd:2+4', 'cmd:3+4'];
    for (const key of webMoves) {
      const web = character.moveProjectiles?.[key]?.find((instance) => instance.projectileId === 'spider-web-shot');
      expect(web).toMatchObject({
        delivery: 'replaceMoveHit',
        trap: { kind: 'web', visualProjectileId: 'spider-web-prison' }
      });
    }
  });

  it('uses separate sprite-derived assets for the traveling web, prison, and golden volley', () => {
    expect(character.projectiles?.map((projectile) => projectile.id)).toEqual([
      'spider-web-shot',
      'spider-web-prison',
      'spider-gold-volley'
    ]);
    expect(character.projectiles?.every((projectile) => projectile.voxelProfile === 'hd-image-source')).toBe(true);
  });
});

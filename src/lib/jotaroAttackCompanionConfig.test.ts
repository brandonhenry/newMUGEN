import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CharacterDefinition } from '../types';

const characterDir = join(process.cwd(), 'public', 'characters', 'jotaro-kujo');
const character = JSON.parse(readFileSync(join(characterDir, 'character.json'), 'utf8')) as CharacterDefinition;
const framesManifest = JSON.parse(readFileSync(join(characterDir, 'frames', 'frames.json'), 'utf8')) as {
  count: number;
  sheets: Array<{ id: string; frameStart: number; frameCount: number }>;
  frames: Array<{ index: number; sheetId?: string }>;
};

function voxelBounds(payload: { voxels: Array<{ x: number; y: number; w: number; h: number }> }) {
  return payload.voxels.reduce((bounds, voxel) => ({
    minX: Math.min(bounds.minX, voxel.x - voxel.w / 2),
    maxX: Math.max(bounds.maxX, voxel.x + voxel.w / 2),
    minY: Math.min(bounds.minY, voxel.y - voxel.h / 2),
    maxY: Math.max(bounds.maxY, voxel.y + voxel.h / 2)
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
}

describe('Jotaro Kujo Star Platinum configuration', () => {
  it('maps every authored route and future base input to a valid Stand animation', () => {
    const companion = character.attackCompanion;
    expect(companion).toBeDefined();
    for (const key of Object.keys(character.moveOverrides ?? {})) {
      const animation = companion?.moveAnimations[key];
      expect(animation, key).toBeTruthy();
      expect(companion?.animations[animation!]?.length, key).toBeGreaterThan(0);
    }
    for (const input of ['jab', 'heavy', 'kick', 'special'] as const) {
      const fallback = companion?.inputFallbacks?.[input];
      expect(companion?.animations[fallback!]?.length, input).toBeGreaterThan(0);
    }
  });

  it('registers the secondary sheet after the preserved original frame range', () => {
    expect(framesManifest.count).toBe(277);
    expect(framesManifest.sheets).toContainEqual(expect.objectContaining({
      id: 'star-platinum',
      frameStart: 195,
      frameCount: 82
    }));
    expect(framesManifest.frames.filter((frame) => frame.sheetId === 'star-platinum')).toHaveLength(82);
    const originalFrameDigest = createHash('sha256');
    for (let index = 0; index <= 194; index += 1) {
      originalFrameDigest.update(readFileSync(join(characterDir, 'frames', `frame-${String(index).padStart(3, '0')}.png`)));
    }
    expect(originalFrameDigest.digest('hex')).toBe('a0c98a17b7104cbf6211985e2ebcd55b0db0ff33d83bb073d4ffe54109615126');
  });

  it('keeps every appended frame on disk at sampleStep 1 and within 5% of Jotaro idle height', () => {
    const idle = JSON.parse(readFileSync(join(characterDir, 'voxels-hd', 'frame-000.json'), 'utf8')) as {
      source: { sampleStep: number };
      voxels: Array<{ x: number; y: number; w: number; h: number }>;
    };
    const idleBounds = voxelBounds(idle);
    const idleHeight = idleBounds.maxY - idleBounds.minY;
    let hasWideRush = false;
    for (let index = 195; index <= 276; index += 1) {
      expect(existsSync(join(characterDir, 'frames', `frame-${String(index).padStart(3, '0')}.png`))).toBe(true);
      const payload = JSON.parse(readFileSync(join(characterDir, 'voxels-hd', `frame-${String(index).padStart(3, '0')}.json`), 'utf8')) as typeof idle;
      const bounds = voxelBounds(payload);
      expect(payload.source.sampleStep, `frame-${index}`).toBe(1);
      expect(Math.abs((bounds.maxY - bounds.minY) / idleHeight - 1), `frame-${index}`).toBeLessThanOrEqual(0.05);
      hasWideRush ||= bounds.maxX - bounds.minX > (idleBounds.maxX - idleBounds.minX) * 1.5;
    }
    expect(hasWideRush).toBe(true);
  });

  it('authors O+3 as a free-standing, zero-damage 100 Ki utility activation', () => {
    const move = character.moveOverrides?.['cmd:O+3'];
    expect(character.animationFrames?.['cmd:O+3']).toHaveLength(3);
    expect(move).toMatchObject({
      startupFrames: 36,
      damage: 0,
      blockDamage: 0,
      usesKi: true,
      kiCost: 100,
      timeStopFrames: 120
    });
  });
});

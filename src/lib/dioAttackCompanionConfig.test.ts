import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CharacterDefinition } from '../types';

const characterDir = join(process.cwd(), 'public', 'characters', 'dio');
const character = JSON.parse(readFileSync(join(characterDir, 'character.json'), 'utf8')) as CharacterDefinition;
const framesManifest = JSON.parse(readFileSync(join(characterDir, 'frames', 'frames.json'), 'utf8')) as {
  count: number;
  sheets: Array<{ id: string; frameStart: number; frameCount: number }>;
  frames: Array<{ index: number; sheetId?: string }>;
};

describe('DIO attack companion configuration', () => {
  it('maps every authored attack route to a valid The World animation', () => {
    const companion = character.attackCompanion;
    expect(companion).toBeDefined();
    const mappedMoveKeys = new Set(Object.keys(companion?.moveAnimations ?? {}));
    for (const key of Object.keys(character.moveOverrides ?? {})) {
      expect(mappedMoveKeys.has(key), key).toBe(true);
      expect(companion?.animations[companion.moveAnimations[key]]?.length, key).toBeGreaterThan(0);
    }
  });

  it('keeps all Stand frames in the appended frame range and on disk', () => {
    const paths = Object.values(character.attackCompanion?.animations ?? {}).flat();
    expect(new Set(paths).size).toBe(60);
    for (const frame of paths) {
      const index = Number(frame.match(/frame-(\d+)\.png$/)?.[1]);
      expect(index).toBeGreaterThanOrEqual(210);
      expect(index).toBeLessThanOrEqual(269);
      expect(existsSync(join(process.cwd(), 'public', frame))).toBe(true);
    }
  });

  it('registers The World as a secondary sheet without replacing DIO frames', () => {
    expect(framesManifest.count).toBe(270);
    expect(framesManifest.sheets).toContainEqual(expect.objectContaining({
      id: 'the-world',
      frameStart: 210,
      frameCount: 60
    }));
    expect(framesManifest.frames.filter((frame) => frame.sheetId === 'the-world')).toHaveLength(60);
    const dioFrames = Object.values(character.animationFrames ?? {}).flat();
    expect(dioFrames.some((frame) => /frame-2(?:1\d|[2-6]\d)\.png$/.test(frame))).toBe(false);
  });

  it('normalizes Stand voxel height to DIO while preserving wide attacks', () => {
    const idle = JSON.parse(readFileSync(join(characterDir, 'voxels-hd', 'frame-000.json'), 'utf8')) as {
      source: { idleVisualWidth: number; idleVisualHeight: number; sampleStep: number; foregroundHeight: number };
    };
    const standPayloads = Array.from({ length: 60 }, (_, offset) => JSON.parse(readFileSync(
      join(characterDir, 'voxels-hd', `frame-${210 + offset}.json`),
      'utf8'
    )) as { source: { idleVisualWidth: number; idleVisualHeight: number; sampleStep: number; foregroundHeight: number } });
    for (const payload of standPayloads) {
      expect(Math.abs(payload.source.idleVisualHeight / idle.source.idleVisualHeight - 1)).toBeLessThanOrEqual(0.05);
      expect(payload.source.sampleStep).toBe(idle.source.sampleStep);
      expect(payload.source.foregroundHeight).toBeGreaterThanOrEqual(idle.source.foregroundHeight);
    }
    expect(standPayloads.some((payload) => payload.source.idleVisualWidth > idle.source.idleVisualWidth * 1.5)).toBe(true);
  });
});

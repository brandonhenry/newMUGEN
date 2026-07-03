import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CharacterDefinition } from '../types';

const {
  combatFrameWindowForSpriteIndex,
  detectVisualForwardWindow,
  expandCharacterForwardForce
// @ts-ignore The roster generator is an executable ESM script with named exports for tests.
} = await import('../../scripts/generate-move-forward-force.mjs') as {
  combatFrameWindowForSpriteIndex: (spriteIndex: number, spriteCount: number, totalFrames: number) => { startFrame: number; endFrame: number };
  detectVisualForwardWindow: (metrics: Array<Record<string, number | boolean>>, totalFrames: number) => { startFrame: number; endFrame: number; fallback: boolean } | null;
  expandCharacterForwardForce: (
    character: CharacterDefinition,
    options: { repoRoot: string }
  ) => Promise<{ character: CharacterDefinition; report: Array<Record<string, unknown>> }>;
};

const repoRoot = process.cwd();
const timingKeys = ['startupFrames', 'activeFrames', 'recoveryFrames'] as const;
const baseKeys = new Set(['jableft', 'jabright', 'kickleft', 'kickright']);

function readCharacter(id: string): CharacterDefinition {
  return JSON.parse(readFileSync(join(repoRoot, 'public', 'characters', id, 'character.json'), 'utf8')) as CharacterDefinition;
}

function timingSnapshot(character: CharacterDefinition) {
  const snapshot: Record<string, number> = {};
  character.moves.forEach((move, index) => {
    timingKeys.forEach((key) => {
      snapshot[`moves.${index}.${key}`] = move[key];
    });
  });
  Object.entries(character.moveOverrides ?? {}).forEach(([key, override]) => {
    timingKeys.forEach((timingKey) => {
      const value = override[timingKey];
      if (typeof value === 'number') snapshot[`moveOverrides.${key}.${timingKey}`] = value;
    });
  });
  return snapshot;
}

function commandInput(key: string) {
  const matches = [...key.matchAll(/[1-4]/g)];
  const button = matches[matches.length - 1]?.[0];
  return button === '2' ? 'heavy' : button === '3' ? 'kick' : button === '4' ? 'special' : 'jab';
}

function isAttackOverride(key: string, override: NonNullable<CharacterDefinition['moveOverrides']>[string]) {
  if (!override || typeof override !== 'object' || key === 'chargeKi') return false;
  if (baseKeys.has(key) || key.startsWith('cmd:')) return true;
  return Boolean(override.input || override.command || override.animationKey || override.damage || override.onHitFrames || override.range || override.hitLevel);
}

function totalFramesFor(character: CharacterDefinition, input: string, override: NonNullable<CharacterDefinition['moveOverrides']>[string] = {}) {
  const base = character.moves.find((move) => move.input === (override.input ?? input)) ?? character.moves[0];
  const startup = override.startupFrames ?? base.startupFrames ?? 10;
  const active = override.activeFrames ?? base.activeFrames ?? 2;
  const recovery = override.recoveryFrames ?? base.recoveryFrames ?? 16;
  return startup + active + recovery;
}

describe('visual forward-force generator', () => {
  it('maps sprite indexes into combat-frame windows using attack progress slices', () => {
    expect(combatFrameWindowForSpriteIndex(0, 5, 30)).toEqual({ startFrame: 1, endFrame: 5 });
    expect(combatFrameWindowForSpriteIndex(2, 5, 30)).toEqual({ startFrame: 12, endFrame: 17 });
    expect(combatFrameWindowForSpriteIndex(4, 5, 30)).toEqual({ startFrame: 24, endFrame: 30 });
  });

  it('detects the strongest visual travel segment from frame metrics', () => {
    const metrics = [10, 10.4, 17.5, 22, 22.2].map((x) => ({
      empty: false,
      bodyWidth: 20,
      centroidX: x,
      leadingX: x + 9,
      area: 100,
      width: 32,
      height: 32
    }));
    expect(detectVisualForwardWindow(metrics, 30)).toMatchObject({ startFrame: 12, endFrame: 23, fallback: false });
  });

  it('preserves authored startup active and recovery values', async () => {
    const naruto = readCharacter('kiro');
    const before = timingSnapshot(naruto);
    const { character } = await expandCharacterForwardForce(naruto, { repoRoot });
    expect(timingSnapshot(character)).toEqual(before);
  });

  it('keeps Naruto and Sasuke reference moves in the intended force tiers', async () => {
    const naruto = (await expandCharacterForwardForce(readCharacter('kiro'), { repoRoot })).character;
    const sasuke = (await expandCharacterForwardForce(readCharacter('riven'), { repoRoot })).character;

    expect(naruto.moveOverrides?.kickleft?.forwardForce).toBe(0.5);
    expect(naruto.moveOverrides?.['cmd:O+2']?.forwardForce).toBe(4);
    expect(naruto.moveOverrides?.['cmd:FC+3']?.forwardForce).toBe(3);
    expect(sasuke.moveOverrides?.jabright?.forwardForce).toBe(2);
    expect(sasuke.moveOverrides?.['cmd:O+1']?.forwardForce).toBe(3);
  });

  it('has forward force and valid timing windows on every generated roster attack', () => {
    const charactersDir = join(repoRoot, 'public', 'characters');
    const manifests = readdirSync(charactersDir)
      .map((id) => join(charactersDir, id, 'character.json'))
      .filter((path) => existsSync(path));

    expect(manifests.length).toBeGreaterThan(0);
    for (const manifestPath of manifests) {
      const character = JSON.parse(readFileSync(manifestPath, 'utf8')) as CharacterDefinition;
      for (const move of character.moves) {
        const total = totalFramesFor(character, move.input, move);
        expect(move.forwardForce, `${character.id}:${move.input}`).toBeGreaterThan(0);
        expect(move.forwardForce).toBeLessThanOrEqual(4);
        expect(move.forwardForceStartFrame).toBeGreaterThanOrEqual(1);
        expect(move.forwardForceEndFrame).toBeGreaterThanOrEqual(move.forwardForceStartFrame ?? 1);
        expect(move.forwardForceEndFrame).toBeLessThanOrEqual(total);
      }
      for (const [key, override] of Object.entries(character.moveOverrides ?? {})) {
        if (!isAttackOverride(key, override)) continue;
        const total = totalFramesFor(character, commandInput(key), override);
        expect(override.forwardForce, `${character.id}:${key}`).toBeGreaterThan(0);
        expect(override.forwardForce).toBeLessThanOrEqual(4);
        expect(override.forwardForceStartFrame).toBeGreaterThanOrEqual(1);
        expect(override.forwardForceEndFrame).toBeGreaterThanOrEqual(override.forwardForceStartFrame ?? 1);
        expect(override.forwardForceEndFrame).toBeLessThanOrEqual(total);
      }
    }
  });
});

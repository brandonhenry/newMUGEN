import { describe, expect, it } from 'vitest';
import { starterCharacters } from '../data/characters';
import type { CharacterDefinition } from '../types';

// @ts-expect-error The roster generator is an executable ESM script with named exports for tests.
const { expandCharacterFrameLinks } = await import('../../scripts/generate-frame-link-routes.mjs') as {
  expandCharacterFrameLinks: (character: CharacterDefinition) => CharacterDefinition;
};

const timingKeys = ['startupFrames', 'activeFrames', 'recoveryFrames'] as const;

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

describe('frame-link route generator', () => {
  it('does not modify authored startup active or recovery values', () => {
    const character = starterCharacters[0];
    const before = timingSnapshot(character);
    const expanded = expandCharacterFrameLinks(character);
    expect(timingSnapshot(expanded)).toEqual(before);
  });

  it('keeps neutral base buttons ineligible for counter hit routes', () => {
    const expanded = expandCharacterFrameLinks(starterCharacters[0]);
    expect(expanded.moves.map((move) => [move.input, move.counterHit])).toEqual([
      ['jab', false],
      ['kick', false],
      ['heavy', false],
      ['special', false]
    ]);
  });

  it('adds counter hit only to advanced command overrides without adding timing fields', () => {
    const expanded = expandCharacterFrameLinks({
      ...starterCharacters[0],
      animationFrames: {
        ...(starterCharacters[0].animationFrames ?? {}),
        jableft: ['/frame-1.png']
      },
      moveOverrides: {}
    });
    const forwardOne = expanded.moveOverrides?.['cmd:f+1'];
    expect(forwardOne).toMatchObject({ counterHit: true, command: 'f+1' });
    expect(forwardOne).not.toHaveProperty('startupFrames');
    expect(forwardOne).not.toHaveProperty('activeFrames');
    expect(forwardOne).not.toHaveProperty('recoveryFrames');
  });
});

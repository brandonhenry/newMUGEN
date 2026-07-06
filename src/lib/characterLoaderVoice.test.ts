import { describe, expect, it } from 'vitest';
import type { CharacterDefinition } from '../types';
import { normalizeCharacter } from './characterLoader';

function makeCharacter(overrides: Partial<CharacterDefinition> = {}): CharacterDefinition {
  return {
    id: 'voice-test',
    displayName: 'Voice Test',
    modelPath: '/characters/voice-test/model.glb',
    scale: 1,
    cameraOffset: [0, 1, 0],
    stats: {
      health: 100,
      speed: 5,
      sidestepSpeed: 4,
      jumpForce: 8,
      gravity: 18
    },
    animations: {},
    animationFrames: {},
    moves: [],
    moveOverrides: {},
    hurtboxes: [],
    inputMap: {},
    colors: {
      primary: '#ffffff',
      secondary: '#999999',
      accent: '#ffcc66'
    },
    aiProfile: {
      aggression: 0.5,
      guard: 0.5,
      spacing: 0.5,
      specialChance: 0.5
    },
    ...overrides
  };
}

describe('normalizeCharacter voice', () => {
  it('keeps supported voice categories and removes empty duplicate clips', () => {
    const normalized = normalizeCharacter(makeCharacter({
      voice: {
        hit: ['/hit.wav', ' ', '/hit.wav'],
        attackLand: [],
        launcher: ['/launcher.wav'],
        tornado: ['/tornado.wav'],
        win: ['/win.wav'],
        stageIntro: ['/intro.wav'],
        shadowClone: ['/clone.wav']
      }
    }));

    expect(normalized.voice).toEqual({
      hit: ['/hit.wav'],
      launcher: ['/launcher.wav'],
      tornado: ['/tornado.wav'],
      win: ['/win.wav'],
      stageIntro: ['/intro.wav'],
      shadowClone: ['/clone.wav']
    });
  });

  it('drops the voice object when no usable clips remain', () => {
    const normalized = normalizeCharacter(makeCharacter({
      voice: {
        hit: [],
        attackLand: ['']
      }
    }));

    expect(normalized.voice).toBeUndefined();
  });
});

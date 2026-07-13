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

describe('normalizeCharacter animation frame paths', () => {
  it('resolves character-relative frame paths to public character URLs', () => {
    const normalized = normalizeCharacter(makeCharacter({
      id: 'model-px',
      animationFrames: {
        idle: [
          'frames/frame-014.png',
          './frames/frame-015.png',
          '/frames/frame-016.png',
          'frame-017.png',
          'characters/model-px/frames/frame-018.png'
        ],
        walkForward: ['/characters/model-px/frames/frame-019.png']
      }
    }));

    expect(normalized.animationFrames?.idle).toEqual([
      '/characters/model-px/frames/frame-014.png',
      '/characters/model-px/frames/frame-015.png',
      '/characters/model-px/frames/frame-016.png',
      '/characters/model-px/frames/frame-017.png',
      '/characters/model-px/frames/frame-018.png'
    ]);
    expect(normalized.animationFrames?.walkForward).toEqual(['/characters/model-px/frames/frame-019.png']);
  });

  it('normalizes attack companion frames and removes broken mappings', () => {
    const normalized = normalizeCharacter(makeCharacter({
      id: 'dio-test',
      attackCompanion: {
        id: 'the-world',
        displayName: 'The World',
        animations: { punch: ['frames/frame-210.png'] },
        moveAnimations: { jableft: 'punch', kickleft: 'missing' },
        inputFallbacks: { jab: 'punch', kick: 'missing' },
        animationFrameRates: { punch: 12, missing: 99 },
        modelScale: { width: 1.1, height: 1.2 },
        forwardOffset: 0.65
      }
    }));

    expect(normalized.attackCompanion).toMatchObject({
      animations: { punch: ['/characters/dio-test/frames/frame-210.png'] },
      moveAnimations: { jableft: 'punch' },
      inputFallbacks: { jab: 'punch' },
      animationFrameRates: { punch: 12 },
      forwardOffset: 0.65
    });
  });

  it('leaves absolute and generated frame sources untouched', () => {
    const normalized = normalizeCharacter(makeCharacter({
      animationFrames: {
        idle: [
          'https://example.test/frame.png',
          'data:image/png;base64,abc',
          'blob:http://localhost/frame'
        ]
      }
    }));

    expect(normalized.animationFrames?.idle).toEqual([
      'https://example.test/frame.png',
      'data:image/png;base64,abc',
      'blob:http://localhost/frame'
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import type { CharacterDefinition, FighterRuntime, MoveDefinition } from '../types';
import { getAttackCompanionPosition, resolveAttackCompanionAnimation } from './attackCompanion';

const move = {
  id: 'test-jab',
  input: 'jab',
  animationKey: 'cmd:f+1'
} as MoveDefinition;

const character = {
  id: 'dio-test',
  animationFps: 6,
  attackCompanion: {
    id: 'the-world',
    displayName: 'The World',
    animations: {
      straight: ['/characters/dio-test/frames/frame-210.png'],
      fallback: ['/characters/dio-test/frames/frame-211.png']
    },
    moveAnimations: { 'cmd:f+1': 'straight' },
    inputFallbacks: { jab: 'fallback' },
    animationFrameRates: { straight: 12 },
    forwardOffset: 0.65,
    verticalOffset: 0.1
  }
} as unknown as CharacterDefinition;

describe('attack companion resolution', () => {
  it('prefers an authored move mapping and carries its frame rate', () => {
    expect(resolveAttackCompanionAnimation(character, move)).toEqual({
      key: 'straight',
      frames: ['/characters/dio-test/frames/frame-210.png'],
      fps: 12
    });
  });

  it('falls back by base input for future move routes', () => {
    const futureMove = { ...move, id: 'future-jab', animationKey: 'future-route' };
    expect(resolveAttackCompanionAnimation(character, futureMove)?.key).toBe('fallback');
  });

  it('places the companion along facing yaw with its vertical offset', () => {
    const fighter = {
      character,
      position: { x: 2, y: 0.25, z: -1 },
      facingYaw: Math.PI / 2
    } as FighterRuntime;
    expect(getAttackCompanionPosition(fighter)).toEqual({ x: 2.65, y: 0.35, z: -1 });
  });
});

import { describe, expect, it } from 'vitest';
import { starterCharacters } from '../../data/characters';
import { stages } from '../../data/stages';
import { createMatch } from '../../engine/fightEngine';
import { emptyInputFrame } from '../../types';
import { compactMatchSnapshot, decodeInputFrame, encodeInputFrame, hydrateMatchSnapshot } from './codec';

describe('online codec', () => {
  it('round-trips compact input bitmasks', () => {
    const input = emptyInputFrame();
    input.right = true;
    input.jab = true;
    input.block = true;
    input.charge = true;

    const decoded = decodeInputFrame(encodeInputFrame(input));

    expect(decoded).toEqual(input);
  });

  it('hydrates render-critical match state from a compact snapshot', () => {
    const match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'online', 3, { aiSeed: 9090, playIntro: true });
    match.fighters[0].hp = 42;
    match.fighters[0].ki = 78;
    match.fighters[0].position.x = 1.25;
    match.fighters[0].state = 'juggle';
    match.fighters[0].moveInstanceId = 12;
    match.fighters[0].juggleDamage = 31;
    match.fighters[0].juggleSequenceDamage = 9;
    match.fighters[0].juggleTornadoCount = 2;
    match.fighters[1].roundsWon = 1;
    match.phase = 'roundOver';
    match.message = 'K.O.';
    match.clashState = {
      id: 4,
      status: 'input',
      sequence: ['jab', 'heavy', 'special'],
      elapsedFrames: 33,
      introFrames: 45,
      inputFrames: 150,
      resultFrames: 54,
      winnerSlot: null,
      damage: 0,
      contactPoint: [0.2, 1.4, -0.1],
      p1: { progress: 1, inputs: ['jab'], completedFrame: null, failed: false, mistakes: 0, lastInput: 'jab' },
      p2: { progress: 0, inputs: [], completedFrame: null, failed: false, mistakes: 0, lastInput: null }
    };

    const snapshot = compactMatchSnapshot(match, 7);
    const base = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'online');
    const hydrated = hydrateMatchSnapshot(base, snapshot);

    expect(hydrated.phase).toBe('roundOver');
    expect(hydrated.message).toBe('K.O.');
    expect(hydrated.fighters[0].hp).toBe(42);
    expect(hydrated.fighters[0].ki).toBe(78);
    expect(hydrated.fighters[0].position.x).toBe(1.25);
    expect(hydrated.fighters[0].moveInstanceId).toBe(12);
    expect(hydrated.fighters[0].juggleDamage).toBe(31);
    expect(hydrated.fighters[0].juggleSequenceDamage).toBe(9);
    expect(hydrated.fighters[0].juggleTornadoCount).toBe(2);
    expect(hydrated.fighters[1].roundsWon).toBe(1);
    expect(hydrated.aiSeed).toBe(match.aiSeed);
    expect(hydrated.roundAiSeed).toBe(match.roundAiSeed);
    expect(hydrated.clashState.status).toBe('input');
    expect(hydrated.clashState.sequence).toEqual(['jab', 'heavy', 'special']);
    expect(hydrated.clashState.p1.progress).toBe(1);
    expect(hydrated.clashState.contactPoint).toEqual([0.2, 1.4, -0.1]);
  });
});

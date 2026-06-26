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
  });
});

import { describe, expect, it } from 'vitest';
import { starterCharacters } from '../data/characters';
import { stages } from '../data/stages';
import { validateCharacter } from '../lib/characterLoader';
import { emptyInputFrame } from '../types';
import { createMatch, stepMatch } from './fightEngine';

describe('character manifests', () => {
  it('ships starter characters without loader warnings', () => {
    expect(starterCharacters.map((character) => [character.id, validateCharacter(character)])).toEqual([
      ['astra', []],
      ['dax', []]
    ]);
  });
});

describe('fight engine', () => {
  it('moves fighters toward each other with right input', () => {
    const match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    const p1 = emptyInputFrame();
    p1.right = true;
    const next = stepMatch(match, p1, emptyInputFrame(), 1 / 60);
    expect(next.fighters[0].position.x).toBeGreaterThan(match.fighters[0].position.x);
  });

  it('applies block chip instead of full damage', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.7;
    match.fighters[1].position.x = 0.7;
    const attack = emptyInputFrame();
    attack.jab = true;
    const block = emptyInputFrame();
    block.block = true;
    for (let i = 0; i < 18; i += 1) {
      match = stepMatch(match, attack, block, 1 / 60);
      attack.jab = false;
    }
    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health - 1);
  });

  it('finishes a round when health reaches zero', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.fighters[1].hp = 1;
    match.fighters[0].position.x = -0.7;
    match.fighters[1].position.x = 0.7;
    const attack = emptyInputFrame();
    attack.heavy = true;
    for (let i = 0; i < 40; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.heavy = false;
    }
    expect(match.phase).toBe('roundOver');
    expect(match.fighters[0].roundsWon).toBe(1);
  });

  it('keeps the fight phase active and accepts movement after a normal hit', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.7;
    match.fighters[1].position.x = 0.7;
    const attack = emptyInputFrame();
    attack.jab = true;
    for (let i = 0; i < 12; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.jab = false;
    }
    const zBefore = match.fighters[1].position.z;
    const moveAfterHit = emptyInputFrame();
    moveAfterHit.up = true;
    match = stepMatch(match, emptyInputFrame(), moveAfterHit, 1 / 60);
    expect(match.phase).toBe('fighting');
    expect(match.fighters[1].position.z).toBeLessThan(zBefore);
  });
});

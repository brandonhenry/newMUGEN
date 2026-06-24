import { describe, expect, it } from 'vitest';
import { starterCharacters } from '../data/characters';
import { stages } from '../data/stages';
import { validateCharacter } from '../lib/characterLoader';
import { emptyInputFrame } from '../types';
import { createMatch, stepMatch } from './fightEngine';

describe('character manifests', () => {
  it('ships starter characters without loader warnings', () => {
    expect(starterCharacters.map((character) => [character.id, validateCharacter(character)])).toEqual([
      ['kiro', []],
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

  it('uses up for jump, down for crouch, and lane inputs for 3D movement', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;

    const jump = emptyInputFrame();
    jump.up = true;
    match = stepMatch(match, jump, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].state).toBe('jump');
    expect(match.fighters[0].velocityY).toBeGreaterThan(0);
    expect(match.fighters[0].position.z).toBe(0);

    for (let i = 0; i < 80; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    const crouch = emptyInputFrame();
    crouch.down = true;
    match = stepMatch(match, crouch, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].state).toBe('crouch');
    expect(match.fighters[0].position.z).toBe(0);

    const laneWalk = emptyInputFrame();
    laneWalk.sidewalkDown = true;
    const radiusBefore = Math.hypot(
      match.fighters[0].position.x - match.fighters[1].position.x,
      match.fighters[0].position.z - match.fighters[1].position.z
    );
    const xBeforeWalk = match.fighters[0].position.x;
    const beforeWalk = match.fighters[0].position.z;
    match = stepMatch(match, laneWalk, emptyInputFrame(), 10 / 60);
    const radiusAfter = Math.hypot(
      match.fighters[0].position.x - match.fighters[1].position.x,
      match.fighters[0].position.z - match.fighters[1].position.z
    );
    expect(match.fighters[0].position.z).toBeGreaterThan(beforeWalk + 0.35);
    expect(match.fighters[0].position.x).not.toBeCloseTo(xBeforeWalk, 3);
    expect(radiusAfter).toBeCloseTo(radiusBefore, 1);
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
    const xBefore = match.fighters[1].position.x;
    const moveAfterHit = emptyInputFrame();
    moveAfterHit.sidewalkUp = true;
    match = stepMatch(match, emptyInputFrame(), moveAfterHit, 1 / 60);
    expect(match.phase).toBe('fighting');
    expect(Math.abs(match.fighters[1].position.z - zBefore) + Math.abs(match.fighters[1].position.x - xBefore)).toBeGreaterThan(0.01);
  });
});

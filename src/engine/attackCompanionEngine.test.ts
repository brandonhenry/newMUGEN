import { describe, expect, it } from 'vitest';
import { starterCharacters } from '../data/characters';
import { stages } from '../data/stages';
import { normalizeCharacter } from '../lib/characterLoader';
import { emptyInputFrame, type CharacterDefinition } from '../types';
import { createMatch, stepMatch } from './fightEngine';

function makeCompanionCharacter(withCompanion: boolean): CharacterDefinition {
  const baseMove = starterCharacters[1].moves[0];
  return normalizeCharacter({
    ...starterCharacters[1],
    id: withCompanion ? 'shared-hit-companion' : 'shared-hit-control',
    displayName: withCompanion ? 'Shared Hit Companion' : 'Shared Hit Control',
    moves: [{
      ...baseMove,
      id: 'shared-hit-jab',
      input: 'jab',
      animationKey: 'jableft',
      startupFrames: 1,
      activeFrames: 5,
      recoveryFrames: 5,
      damage: 10,
      range: 0.1,
      hitbox: { offset: [0, 1, 0.2], size: [0.5, 1, 0.3] }
    }],
    moveOverrides: {},
    attackCompanion: withCompanion ? {
      id: 'the-world',
      displayName: 'The World',
      animations: { straight: ['frames/frame-210.png'] },
      moveAnimations: { jableft: 'straight' },
      inputFallbacks: { jab: 'straight' },
      animationFrameRates: { straight: 10 },
      modelScale: { width: 1, height: 1 },
      forwardOffset: 0.65
    } : undefined
  });
}

function runJab(character: CharacterDefinition, defenderX: number) {
  let match = createMatch(character, starterCharacters[0], stages[0], 'local2p', 3, { trainingInfiniteHealth: false });
  match.fighters[0].position = { x: 0, y: 0, z: 0 };
  match.fighters[1].position = { x: defenderX, y: 0, z: 0 };
  const jab = emptyInputFrame();
  jab.jab = true;
  match = stepMatch(match, jab, emptyInputFrame(), 1 / 60);
  for (let frame = 0; frame < 10; frame += 1) {
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
  }
  return match;
}

describe('attack companion collision', () => {
  it('extends the source move reach while applying its damage only once', () => {
    const control = runJab(makeCompanionCharacter(false), 0.95);
    const companion = runJab(makeCompanionCharacter(true), 0.95);
    expect(control.fighters[1].hp).toBe(control.fighters[1].maxHp);
    expect(companion.fighters[1].maxHp - companion.fighters[1].hp).toBe(10);
    expect(companion.fighters[0].comboHits).toBe(1);
  });

  it('does not hit beyond the combined companion reach', () => {
    const match = runJab(makeCompanionCharacter(true), 1.8);
    expect(match.fighters[1].hp).toBe(match.fighters[1].maxHp);
  });
});

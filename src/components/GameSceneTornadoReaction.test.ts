import { describe, expect, it } from 'vitest';
import { starterCharacters } from '../data/characters';
import { stages } from '../data/stages';
import { createMatch } from '../engine/fightEngine';
import { getImageVoxelAnimationKey } from './GameScene';

describe('tornado reaction rendering', () => {
  it('uses knockdown frames only while the juggled defender has an active tornado cue', () => {
    const match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    const fighter = match.fighters[1];
    fighter.character = {
      ...fighter.character,
      animationFrames: {
        ...(fighter.character.animationFrames ?? {}),
        juggle: ['/juggle-frame.png'],
        knockdown: ['/knockdown-frame.png'],
        hitHeavy: ['/hit-heavy-frame.png']
      }
    };
    fighter.state = 'juggle';
    fighter.tornadoReactionFrames = 12;

    expect(getImageVoxelAnimationKey(fighter)).toBe('knockdown');

    fighter.tornadoReactionFrames = 0;

    expect(getImageVoxelAnimationKey(fighter)).toBe('juggle');
  });
});

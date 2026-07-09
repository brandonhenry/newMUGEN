import { describe, expect, it } from 'vitest';
import { starterCharacters } from '../data/characters';
import { stages } from '../data/stages';
import { createMatch } from '../engine/fightEngine';
import { getImageVoxelAnimationKey, getTornadoRibbonProfile } from './GameScene';

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

  it('widens the ribbon around wide voxel knockdown reaction frames', () => {
    const match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    const fighter = match.fighters[1];
    fighter.character = {
      ...fighter.character,
      voxelProfile: 'hd-image-source',
      modelScale: { width: 1, height: 1 },
      animationFrames: {
        ...(fighter.character.animationFrames ?? {}),
        knockdown: ['/characters/test/frames/frame-042.png']
      },
      animationFrameScales: {
        ...(fighter.character.animationFrameScales ?? {}),
        knockdown: {
          '42': { width: 2.8, height: 1.1 }
        }
      }
    };
    fighter.state = 'juggle';
    fighter.tornadoReactionFrames = 12;

    const profile = getTornadoRibbonProfile(fighter);

    expect(profile.source).toBe('image-voxel');
    expect(profile.radius).toBeGreaterThan(0.38);
    expect(profile.radius).toBeGreaterThanOrEqual(profile.visualWidth * 0.34);
  });
});

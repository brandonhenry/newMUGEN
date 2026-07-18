import { describe, expect, it } from 'vitest';
import { STORY_ADVENTURE_WORLDS } from './adventureWorlds';
import { createStoryDepthEnvironment } from './depthEnvironment';

describe('generated depth environments', () => {
  it('uses Emberdeep composed scenery instead of a repeated cave asset sheet', () => {
    const environment = createStoryDepthEnvironment(STORY_ADVENTURE_WORLDS.emberdeep.environment, {
      kind: 'cave',
      underwater: false
    });

    expect(environment?.layers.map((layer) => layer.asset)).toEqual([
      'world:emberdeep/background.png',
      'world:emberdeep/middleground.png'
    ]);
    expect(environment?.layers.some((layer) => layer.asset === 'exploration:caves/grafxkid-cave-assets.png')).toBe(false);
  });
});

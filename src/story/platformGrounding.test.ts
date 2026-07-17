import { describe, expect, it } from 'vitest';
import { STORY_WORLDS } from './adventureWorlds';
import { storyPlatformSurfacePlacement } from './platformGrounding';

describe('story world visual grounding', () => {
  it('aligns every packed surface top with its physics collider top', () => {
    for (const world of Object.values(STORY_WORLDS)) {
      for (const platform of world.platforms) {
        const placement = storyPlatformSurfacePlacement(platform);
        expect(placement.centerY + placement.height / 2, `${world.id}/${platform.id}`).toBeCloseTo(platform.size[1] / 2, 8);
      }
    }
  });

  it('keeps ground and one-way surface depths without changing their top edge', () => {
    const ground = storyPlatformSurfacePlacement({ id: 'ground', position: [0, -0.5], size: [10, 1] });
    const oneWay = storyPlatformSurfacePlacement({ id: 'ledge', position: [0, 3], size: [8, 0.45], oneWay: true });
    expect(ground.height).toBe(0.82);
    expect(ground.centerY).toBeCloseTo(0.09, 8);
    expect(oneWay.height).toBe(0.52);
    expect(oneWay.centerY).toBeCloseTo(-0.035, 8);
  });
});

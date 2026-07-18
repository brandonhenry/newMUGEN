import { describe, expect, it } from 'vitest';
import { STORY_WORLDS } from './adventureWorlds';
import { storyPlatformSurfacePlacement } from './platformGrounding';

describe('story world visual grounding', () => {
  it('aligns flat surfaces and applies only their authored source-pixel inset', () => {
    for (const world of Object.values(STORY_WORLDS)) {
      for (const platform of world.platforms) {
        const surface = world.environment?.surface;
        const placement = storyPlatformSurfacePlacement(platform, surface);
        const inset = surface?.walkSurfaceInsetPixels ?? 0;
        const expectedTop = platform.size[1] / 2 - placement.height * inset / (surface?.frame[3] ?? 1);
        expect(placement.centerY + placement.height / 2, `${world.id}/${platform.id}`).toBeCloseTo(expectedTop, 8);
        expect(placement.surfaceInsetY, `${world.id}/${platform.id} inset`).toBeCloseTo(platform.size[1] / 2 - expectedTop, 8);
      }
    }
  });

  it('limits the raised-cap correction to the three matching terrain atlases', () => {
    const adjusted = Object.values(STORY_WORLDS)
      .filter((world) => (world.environment?.surface?.walkSurfaceInsetPixels ?? 0) > 0)
      .map((world) => world.theme)
      .sort();
    expect(adjusted).toEqual(['forest', 'snow', 'village']);
  });

  it('keeps ground and one-way surface depths without changing their top edge', () => {
    const ground = storyPlatformSurfacePlacement({ id: 'ground', position: [0, -0.5], size: [10, 1] });
    const oneWay = storyPlatformSurfacePlacement({ id: 'ledge', position: [0, 3], size: [8, 0.45], oneWay: true });
    expect(ground.height).toBe(0.82);
    expect(ground.centerY).toBeCloseTo(0.09, 8);
    expect(ground.surfaceInsetY).toBe(0);
    expect(oneWay.height).toBe(0.52);
    expect(oneWay.centerY).toBeCloseTo(-0.035, 8);
    expect(oneWay.surfaceInsetY).toBe(0);
  });

  it('converts one source pixel into the correct ground and ledge optical inset', () => {
    const surface = { asset: 'world:seasonal/snow-terrain.png', frame: [48, 16, 32, 16], atlasSize: [272, 160], walkSurfaceInsetPixels: 1 } as const;
    const ground = storyPlatformSurfacePlacement({ id: 'ground', position: [0, -0.5], size: [10, 1] }, surface);
    const oneWay = storyPlatformSurfacePlacement({ id: 'ledge', position: [0, 3], size: [8, 0.45], oneWay: true }, surface);
    expect(ground.centerY + ground.height / 2).toBeCloseTo(0.5 - 0.82 / 16, 8);
    expect(oneWay.centerY + oneWay.height / 2).toBeCloseTo(0.225 - 0.52 / 16, 8);
  });
});

import { describe, expect, it } from 'vitest';
import { STORY_BIOME_DOOR_ATLAS_SIZE, STORY_BIOME_DOOR_GROUND_SINK_Y, storyBiomeDoorFrame } from './biomeDoors';

describe('biome door atlas', () => {
  it('assigns a distinct frame to every adventure biome', () => {
    const biomes = ['greenhollow', 'thornwood', 'ironroot', 'bonevault', 'emberdeep', 'frostpeak', 'sunscar', 'skyglass'] as const;
    const frames = biomes.map((biome) => storyBiomeDoorFrame(biome)?.frame.join(','));
    expect(frames.every(Boolean)).toBe(true);
    expect(new Set(frames).size).toBe(biomes.length);
    expect(biomes.every((biome) => (storyBiomeDoorFrame(biome)?.visibleBottomInset ?? -1) >= 0)).toBe(true);
  });

  it('uses the current biome for return and depth doors without replacing route or mode doors', () => {
    expect(storyBiomeDoorFrame('world-route', 'snow')?.biome).toBe('frostpeak');
    expect(storyBiomeDoorFrame('central', 'route')).toBeNull();
    expect(storyBiomeDoorFrame('arcade', 'arcade')).toBeNull();
    expect(STORY_BIOME_DOOR_ATLAS_SIZE).toEqual([1536, 1024]);
    expect(STORY_BIOME_DOOR_GROUND_SINK_Y).toBeGreaterThan(0);
  });
});

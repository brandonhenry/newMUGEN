import { describe, expect, it } from 'vitest';
import {
  STORY_BIOME_DOOR_ATLAS_SIZE,
  STORY_BIOME_DOOR_GROUND_SINK_Y,
  STORY_DEPTH_ENTRANCE_ASSET,
  STORY_NORMAL_BIOME_DOOR_ASSET,
  STORY_SANCTUARY_ENTRANCE_ASSET,
  storyBiomeDoorFrame,
  storyPortalDoorFrame
} from './biomeDoors';
import type { StoryAdventureWorldId, StoryPortalDefinition } from './types';

const BIOMES = ['greenhollow', 'thornwood', 'ironroot', 'bonevault', 'emberdeep', 'frostpeak', 'sunscar', 'skyglass'] as const;
type Biome = Exclude<StoryAdventureWorldId, 'world-route'>;

function portal(biome: Biome, id: string, kind: StoryPortalDefinition['kind'] = 'adventure-gate') {
  return { id, destination: biome, kind };
}

describe('biome entrance library', () => {
  it('keeps a distinct hero gate for every Central Route biome', () => {
    const frames = BIOMES.map((biome) => storyBiomeDoorFrame(biome)?.frame.join(','));
    expect(frames.every(Boolean)).toBe(true);
    expect(new Set(frames).size).toBe(BIOMES.length);
    expect(BIOMES.every((biome) => storyBiomeDoorFrame(biome)?.tier === 'biome-gate')).toBe(true);
  });

  it('uses all three ordinary door variants for normal surface travel', () => {
    for (const biome of BIOMES) {
      const frames = ['arrival', 'field-a', 'field-b'].map((role) => storyPortalDoorFrame(portal(biome, `surface-map:${biome}-${role}`))!);
      expect(frames.every((frame) => frame.tier === 'normal' && frame.asset === STORY_NORMAL_BIOME_DOOR_ASSET)).toBe(true);
      expect(new Set(frames.map((frame) => frame.frame.join(','))).size).toBe(3);
    }
  });

  it('reserves generated depth and sanctuary entrances for special locations', () => {
    for (const biome of BIOMES) {
      const depth = storyPortalDoorFrame(portal(biome, `depth-entry:${biome}-depth`));
      const sanctuary = storyPortalDoorFrame(portal(biome, `mount-sanctuary:${biome}-mount`, 'shrine'));
      expect(depth).toMatchObject({ biome, tier: 'depth', asset: STORY_DEPTH_ENTRANCE_ASSET });
      expect(sanctuary).toMatchObject({ biome, tier: 'sanctuary', asset: STORY_SANCTUARY_ENTRANCE_ASSET });
      expect(depth?.frame).toEqual(sanctuary?.frame);
    }
  });

  it('uses the current biome for return and internal depth doors without replacing mode doors', () => {
    expect(storyBiomeDoorFrame('world-route', 'snow')?.biome).toBe('frostpeak');
    expect(storyPortalDoorFrame({ id: 'depth-return-surface', destination: 'frostpeak', kind: 'adventure-gate' }, 'snow')?.tier).toBe('depth');
    expect(storyBiomeDoorFrame('central', 'route')).toBeNull();
    expect(storyBiomeDoorFrame('arcade', 'arcade')).toBeNull();
    expect(STORY_BIOME_DOOR_ATLAS_SIZE).toEqual([1536, 1024]);
    expect(STORY_BIOME_DOOR_GROUND_SINK_Y).toBeGreaterThan(0);
  });
});

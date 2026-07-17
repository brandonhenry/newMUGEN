import { describe, expect, it } from 'vitest';
import { STORY_ADVENTURE_REGION_IDS, STORY_ADVENTURE_WORLDS, STORY_WORLDS, isStoryWorldId } from './adventureWorlds';

describe('story adventure world network', () => {
  it('provides eight directly reachable regions from the central route', () => {
    const route = STORY_ADVENTURE_WORLDS['world-route'];
    expect(STORY_ADVENTURE_REGION_IDS).toHaveLength(8);
    expect(route.bounds.maxX - route.bounds.minX).toBeGreaterThanOrEqual(84);
    expect(route.portals.filter((portal) => STORY_ADVENTURE_REGION_IDS.includes(portal.destination as typeof STORY_ADVENTURE_REGION_IDS[number]))).toHaveLength(8);
    expect(route.portals.some((portal) => portal.kind === 'shrine')).toBe(true);
  });

  it('gives every region traversal, checkpoints, props, and ten local enemies', () => {
    for (const id of STORY_ADVENTURE_REGION_IDS) {
      const world = STORY_ADVENTURE_WORLDS[id];
      expect(world.adventure).toBe(true);
      expect(world.checkpoint).toBeDefined();
      expect(world.props?.length).toBeGreaterThan(0);
      expect(world.enemySpawns).toHaveLength(10);
      expect(world.portals.filter((portal) => portal.destination === 'world-route')).toHaveLength(2);
      expect(new Set(world.enemySpawns?.map((enemy) => enemy.archetype))).toEqual(new Set(['ground', 'flying', 'ranged']));
    }
  });

  it('retains every existing mode world in the unified registry', () => {
    expect(Object.keys(STORY_WORLDS)).toHaveLength(15);
    expect(isStoryWorldId('central')).toBe(true);
    expect(isStoryWorldId('emberdeep')).toBe(true);
    expect(isStoryWorldId('missing')).toBe(false);
  });
});

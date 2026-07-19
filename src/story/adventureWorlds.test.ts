import { describe, expect, it } from 'vitest';
import { STORY_ADVENTURE_REGION_IDS, STORY_ADVENTURE_WORLDS, STORY_WORLDS, isStoryWorldId } from './adventureWorlds';
import { STORY_REGULAR_ENEMY_IDS } from './enemyCatalog';

describe('story adventure world network', () => {
  it('provides eight directly reachable regions from the central route', () => {
    const route = STORY_ADVENTURE_WORLDS['world-route'];
    expect(STORY_ADVENTURE_REGION_IDS).toHaveLength(8);
    expect(route.bounds.maxX - route.bounds.minX).toBeGreaterThanOrEqual(84);
    expect(route.portals.filter((portal) => STORY_ADVENTURE_REGION_IDS.includes(portal.destination as typeof STORY_ADVENTURE_REGION_IDS[number]))).toHaveLength(8);
    expect(route.portals.some((portal) => portal.kind === 'shrine')).toBe(true);
    const tutorialSigns = route.portals.filter((portal) => portal.kind === 'tutorial');
    expect(tutorialSigns).toHaveLength(1);
    expect(tutorialSigns[0]).toMatchObject({ id: 'route-tutorial-sign', destination: 'world-route' });
    expect(Math.abs(tutorialSigns[0].position[0] - route.spawn[0])).toBeLessThanOrEqual(5);
    expect(route.environment?.layers.length).toBeGreaterThanOrEqual(3);
    expect(route.environment?.layers.every((layer) => layer.asset?.startsWith('world:'))).toBe(true);
    expect(route.environment?.surface?.asset.startsWith('world:')).toBe(true);
    expect(route.landmarks?.length).toBeGreaterThanOrEqual(6);
  });

  it('gives every region full-width authored traversal, scenery, and ten local enemies', () => {
    for (const id of STORY_ADVENTURE_REGION_IDS) {
      const world = STORY_ADVENTURE_WORLDS[id];
      expect(world.adventure).toBe(true);
      expect(world.bounds.maxX - world.bounds.minX, `${id} width`).toBeGreaterThanOrEqual(144);
      expect(world.checkpoint).toBeDefined();
      expect(world.props?.length, `${id} props`).toBeGreaterThanOrEqual(6);
      expect(world.environment?.layers.length, `${id} layers`).toBeGreaterThanOrEqual(3);
      expect(world.environment?.layers.every((layer) => layer.asset?.startsWith('world:')), `${id} real art layers`).toBe(true);
      expect(world.environment?.layers.every((layer) => !layer.motif), `${id} placeholder motifs`).toBe(true);
      expect(world.environment?.surface?.asset.startsWith('world:'), `${id} authored traversal surface`).toBe(true);
      expect(world.props?.filter((prop) => prop.asset.startsWith('world:')).length, `${id} pack props`).toBeGreaterThanOrEqual(7);
      const propPoints = [world.bounds.minX, ...(world.props?.filter((prop) => prop.asset.startsWith('world:')).map(({ position }) => position[0]) ?? []).sort((a, b) => a - b), world.bounds.maxX];
      expect(Math.max(...propPoints.slice(1).map((point, index) => point - propPoints[index])), `${id} prop coverage`).toBeLessThanOrEqual(18);
      expect(world.landmarks?.length, `${id} landmarks`).toBeGreaterThanOrEqual(5);
      expect(new Set(world.environment?.layers.map(({ id: layerId }) => layerId)).size).toBe(world.environment?.layers.length);
      expect(world.enemySpawns).toHaveLength(10);
      expect(world.portals.filter((portal) => portal.destination === 'world-route')).toHaveLength(2);
      expect(world.enemySpawns?.every((enemy) => STORY_REGULAR_ENEMY_IDS.includes(enemy.enemyId))).toBe(true);
      expect(world.exploration?.encounters).toHaveLength(5);
      expect(world.exploration?.encounters.every((encounter) => world.enemySpawns?.filter((enemy) => enemy.encounterZoneId === encounter.id).length === 2)).toBe(true);
      expect(world.exploration?.districts).toHaveLength(8);
      expect(world.exploration?.safeApproach[1]! - world.exploration?.safeApproach[0]!).toBeGreaterThanOrEqual(80);
    }
  });

  it('retains every existing mode world in the unified registry', () => {
    expect(Object.keys(STORY_WORLDS)).toHaveLength(15);
    expect(isStoryWorldId('central')).toBe(true);
    expect(isStoryWorldId('emberdeep')).toBe(true);
    expect(isStoryWorldId('missing')).toBe(false);
  });
});

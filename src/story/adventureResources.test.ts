import { describe, expect, it, vi } from 'vitest';
import { STORY_BIOME_RESOURCE_IDS, STORY_RESOURCE_BY_ID } from './adventureCrafting';
import { STORY_ADVENTURE_SURFACE_MAPS } from './adventureSurfaceMaps';
import { generateAdventureRunGraph } from './adventureExploration';
import { STORY_ADVENTURE_REGION_IDS, STORY_ADVENTURE_WORLDS } from './adventureWorlds';
import { generateAdventureFloor } from './adventureEndless';
import {
  adventureAttackCanHitResource,
  adventureResourceHitStrength,
  createDepthResourceNodes,
  createEndlessFloorResourceNodes,
  groundedResourceNodeCenterY,
  resourceYield
} from './adventureResources';
import {
  beginAdventureVisit,
  depleteAdventureResourceNode,
  isAdventureResourceNodeAvailable,
  makeDefaultAdventureProgress,
  sanitizeAdventureProgress
} from './adventureProgress';

describe('Adventure gathering nodes', () => {
  it('renders every enlarged node with its visible alpha foot sunk into the floor', () => {
    const nodes = Object.values(STORY_ADVENTURE_SURFACE_MAPS).flatMap((maps) => maps.flatMap((map) => map.resourceNodes));
    for (const node of nodes) {
      const resource = STORY_RESOURCE_BY_ID[node.resourceId];
      const visibleFootY = node.position[1] + node.size[1] * (0.5 - resource.footAnchorY);
      const map = Object.values(STORY_ADVENTURE_SURFACE_MAPS).flat().find((candidate) => candidate.resourceNodes.includes(node))!;
      const supportTop = Math.max(...map.platforms
        .filter((platform) => platform.collision === 'solid' && node.position[0] >= platform.position[0] - platform.size[0] / 2 && node.position[0] <= platform.position[0] + platform.size[0] / 2)
        .map((platform) => platform.position[1] + platform.size[1] / 2)
        .filter((top) => top <= visibleFootY + 0.1));
      expect(visibleFootY, node.id).toBeCloseTo(supportTop - 0.035, 8);
      expect(node.position[1] - supportTop, node.id).toBeCloseTo(groundedResourceNodeCenterY(node.size[1], resource.footAnchorY), 8);
      if (node.kind === 'tree') {
        expect(node.size[0], node.id).toBeGreaterThanOrEqual(3.25);
        expect(node.size[1], node.id).toBeGreaterThanOrEqual(4.5);
      } else if (node.kind === 'berry') {
        expect(node.size[0], node.id).toBeGreaterThanOrEqual(2.25);
        expect(node.size[1], node.id).toBeGreaterThanOrEqual(2.05);
      } else if (node.kind === 'plant') {
        expect(node.size[0], node.id).toBeGreaterThanOrEqual(1.9);
        expect(node.size[1], node.id).toBeGreaterThanOrEqual(1.8);
      } else {
        expect(node.size[0], node.id).toBeGreaterThanOrEqual(2.4);
        expect(node.size[1], node.id).toBeGreaterThanOrEqual(2.05);
      }
    }
  });

  it('covers all 32 surface maps deterministically with authored counts and restrictions', () => {
    const maps = Object.values(STORY_ADVENTURE_SURFACE_MAPS).flat();
    expect(maps).toHaveLength(32);
    for (const map of maps) {
      expect(map.resourceNodes.length, map.id).toBeGreaterThanOrEqual(12);
      expect(map.resourceNodes.length, map.id).toBeLessThanOrEqual(18);
      const universal = new Set(['routewood', 'wildberry', 'medicinal-herb', 'fieldstone']);
      expect([...universal].every((id) => map.resourceNodes.some((node) => node.resourceId === id)), map.id).toBe(true);
      for (const node of map.resourceNodes) {
        expect(node.position[0], node.id).toBeGreaterThan(map.bounds.minX + 4);
        expect(node.position[0], node.id).toBeLessThan(map.bounds.maxX - 4);
        expect(map.portals.every((portal) => Math.abs(node.position[0] - portal.position[0]) >= portal.size[0] / 2 + 2.2), node.id).toBe(true);
        if (node.rarity === 'legendary') expect(map.role).toBe('mastery');
      }
      if (map.role === 'mastery') expect(map.resourceNodes.some(({ resourceId }) => resourceId === STORY_BIOME_RESOURCE_IDS[map.biomeId][3])).toBe(true);
      else expect(map.resourceNodes.some(({ rarity }) => rarity === 'legendary')).toBe(false);
    }
  });

  it('places 6–10 nodes in procedural depths and restricts legendaries to hidden/finale zones', () => {
    for (const biome of STORY_ADVENTURE_REGION_IDS) {
      const graph = generateAdventureRunGraph(biome, 'resource-coverage', STORY_ADVENTURE_WORLDS[biome].exploration!);
      for (const zone of graph.zones) {
        const nodes = createDepthResourceNodes(biome, zone);
        expect(nodes.length).toBeGreaterThanOrEqual(6);
        expect(nodes.length).toBeLessThanOrEqual(10);
        expect(nodes.every((node) => node.position[0] > zone.camera.minX && node.position[0] < zone.camera.maxX)).toBe(true);
        if (nodes.some(({ rarity }) => rarity === 'legendary')) expect(zone.hidden || zone.finale).toBe(true);
      }
    }
  });

  it('makes harvest floors dense, peaceful, and correctly grounds resources in raised branches', () => {
    for (const biome of STORY_ADVENTURE_REGION_IDS) {
      const floor = Array.from({ length: 100 }, (_, index) => generateAdventureFloor(biome, `harvest-review-${index}`, 2)).find((candidate) => candidate.intent === 'harvest');
      expect(floor, `${biome} harvest floor`).toBeDefined();
      expect(floor!.enemySpawns).toEqual([]);
      expect(floor!.hazards).toEqual([]);
      const nodes = createEndlessFloorResourceNodes(biome, floor!);
      expect(nodes.length).toBeGreaterThanOrEqual(18);
      for (const node of nodes) {
        const room = floor!.rooms.find((candidate) => node.id.startsWith(`${candidate.id}-resource-`))!;
        const resource = STORY_RESOURCE_BY_ID[node.resourceId];
        const visibleFootY = node.position[1] + node.size[1] * (0.5 - resource.footAnchorY);
        expect(visibleFootY, node.id).toBeCloseTo(room.bounds[2] + (floor!.version === 5 ? 2 : 0) - 0.035, 8);
      }
    }
  });

  it('uses one hit per attack ID, heavy strength two, and correct base yields', () => {
    expect(adventureAttackCanHitResource(12, 12)).toBe(false);
    expect(adventureAttackCanHitResource(12, 13)).toBe(true);
    expect(adventureResourceHitStrength('heavy')).toBe(2);
    expect(adventureResourceHitStrength('special')).toBe(1);
    const map = STORY_ADVENTURE_SURFACE_MAPS.ironroot[1];
    for (const node of map.resourceNodes) {
      const yieldAmount = resourceYield(node, 'fixed-seed');
      if (node.rarity === 'legendary') expect(yieldAmount).toBe(1);
      else if (node.major) expect(yieldAmount).toBeGreaterThanOrEqual(4);
      else if (node.kind === 'plant') expect(yieldAmount).toBeGreaterThanOrEqual(1);
      else expect(yieldAmount).toBeGreaterThanOrEqual(2);
    }
  });

  it('resets visit, twenty-minute, and UTC-day depletion independently', () => {
    vi.useFakeTimers();
    const start = new Date('2026-07-18T12:00:00Z').getTime();
    vi.setSystemTime(start);
    const nodes = STORY_ADVENTURE_SURFACE_MAPS.greenhollow[3].resourceNodes;
    const visitNode = nodes.find(({ respawn }) => respawn === 'visit')!;
    const timedNode = nodes.find(({ respawn }) => respawn === 'timed')!;
    const dailyNode = nodes.find(({ respawn }) => respawn === 'daily')!;
    let progress = beginAdventureVisit(makeDefaultAdventureProgress(), 'greenhollow');
    progress = depleteAdventureResourceNode(progress, visitNode, 'greenhollow', start);
    progress = depleteAdventureResourceNode(progress, timedNode, 'greenhollow', start);
    progress = depleteAdventureResourceNode(progress, dailyNode, 'greenhollow', start);
    expect(isAdventureResourceNodeAvailable(progress, visitNode, 'greenhollow', start)).toBe(false);
    expect(isAdventureResourceNodeAvailable(progress, timedNode, 'greenhollow', start + 19 * 60_000)).toBe(false);
    expect(isAdventureResourceNodeAvailable(progress, timedNode, 'greenhollow', start + 20 * 60_000)).toBe(true);
    expect(isAdventureResourceNodeAvailable(progress, dailyNode, 'greenhollow', new Date('2026-07-19T00:00:01Z').getTime())).toBe(true);
    progress = beginAdventureVisit(progress, 'greenhollow');
    expect(isAdventureResourceNodeAvailable(progress, visitNode, 'greenhollow', start)).toBe(true);
    vi.useRealTimers();
  });

  it('prunes expired effects and timed depletion from malformed saves', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T12:00:00Z'));
    const progress = sanitizeAdventureProgress({
      ...makeDefaultAdventureProgress(),
      activeEffects: [{ recipeId: 'stoneguard-tonic', kind: 'guard', multiplier: 0.8, expiresAt: Date.now() - 1 }],
      harvestState: { expired: { readyAt: Date.now() - 1 }, future: { readyAt: Date.now() + 1_000 } }
    });
    expect(progress.activeEffects).toEqual([]);
    expect(progress.harvestState.expired).toBeUndefined();
    expect(progress.harvestState.future).toBeDefined();
    vi.useRealTimers();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { STORY_BIOME_RESOURCE_IDS } from './adventureCrafting';
import { STORY_ADVENTURE_SURFACE_MAPS } from './adventureSurfaceMaps';
import { generateAdventureRunGraph } from './adventureExploration';
import { STORY_ADVENTURE_REGION_IDS, STORY_ADVENTURE_WORLDS } from './adventureWorlds';
import {
  adventureAttackCanHitResource,
  adventureResourceHitStrength,
  createDepthResourceNodes,
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

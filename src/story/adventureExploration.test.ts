import { describe, expect, it } from 'vitest';
import { STORY_ADVENTURE_WORLDS } from './adventureWorlds';
import { adventureRunIsReachable, adventureRunValidationErrors, createAdventureVisitSeed, electStoryPartyLeader, generateAdventureFallbackGraph, generateAdventureRunGraph, sanitizeStoryPartyInstance, STORY_DEPTH_ZONE_MAX, STORY_DEPTH_ZONE_MIN, STORY_MAX_ACTIVE_ENEMIES } from './adventureExploration';

describe('adventure depth generation', () => {
  it('is deterministic, reachable, and contains the required authored structure', () => {
    const world = STORY_ADVENTURE_WORLDS.thornwood;
    const seed = createAdventureVisitSeed('thornwood', 'visit-7', 'party-2');
    const first = generateAdventureRunGraph('thornwood', seed, world.exploration!);
    const second = generateAdventureRunGraph('thornwood', seed, world.exploration!);
    expect(first).toEqual(second);
    expect(first.zones.length).toBeGreaterThanOrEqual(STORY_DEPTH_ZONE_MIN);
    expect(first.zones.length).toBeLessThanOrEqual(STORY_DEPTH_ZONE_MAX);
    expect(first.zones.some((zone) => zone.hidden)).toBe(true);
    expect(first.zones.some((zone) => zone.kind === 'sanctuary')).toBe(true);
    expect(first.zones.filter((zone) => zone.finale)).toHaveLength(1);
    expect(first.finaleZoneId).not.toBe(first.sanctuaryZoneId);
    expect(adventureRunValidationErrors(first)).toEqual([]);
    expect(first.zones.filter((zone) => zone.critical).length).toBeGreaterThanOrEqual(4);
    expect(first.zones.filter((zone) => zone.critical).length).toBeLessThanOrEqual(6);
    expect(first.zones.filter((zone) => !zone.critical).length).toBeGreaterThanOrEqual(2);
    expect(first.zones.filter((zone) => !zone.critical).length).toBeLessThanOrEqual(4);
    expect(first.links.some((link) => ['climb', 'ladder', 'lift', 'updraft'].includes(link.traversal))).toBe(true);
    expect(adventureRunIsReachable(first)).toBe(true);
  });

  it('provides a prevalidated safe chain while preserving a rejected seed', () => {
    const world = STORY_ADVENTURE_WORLDS.emberdeep;
    const fallback = generateAdventureFallbackGraph('emberdeep', 'rejected-seed', world.exploration!, ['forced-test']);
    expect(fallback.seed).toBe('rejected-seed');
    expect(fallback.usedFallback).toBe(true);
    expect(fallback.validationFailures).toEqual(['forced-test']);
    expect(adventureRunValidationErrors(fallback)).toEqual([]);
  });

  it('gives underwater rooms air pockets', () => {
    for (let visit = 0; visit < 40; visit += 1) {
      const world = STORY_ADVENTURE_WORLDS.frostpeak;
      const graph = generateAdventureRunGraph('frostpeak', String(visit), world.exploration!);
      for (const zone of graph.zones.filter((item) => item.underwater)) expect(zone.airPockets.length).toBeGreaterThan(0);
    }
  });

  it('preserves graph contracts across every biome and many visit seeds', () => {
    for (const [worldId, world] of Object.entries(STORY_ADVENTURE_WORLDS)) {
      if (worldId === 'world-route') continue;
      for (let visit = 0; visit < 64; visit += 1) {
        const graph = generateAdventureRunGraph(worldId as Exclude<keyof typeof STORY_ADVENTURE_WORLDS, 'world-route'>, `property-${visit}`, world.exploration!);
        expect(adventureRunIsReachable(graph)).toBe(true);
        expect(graph.zones.filter((zone) => zone.critical).length).toBeGreaterThanOrEqual(4);
        expect(graph.zones.filter((zone) => zone.critical).length).toBeLessThanOrEqual(6);
        expect(graph.zones.filter((zone) => !zone.critical).length).toBeGreaterThanOrEqual(2);
        expect(graph.zones.filter((zone) => !zone.critical).length).toBeLessThanOrEqual(4);
        expect(graph.zones.filter((zone) => zone.hidden)).toHaveLength(1);
        expect(graph.links.some((link) => ['climb', 'ladder', 'lift', 'updraft'].includes(link.traversal))).toBe(true);
      }
    }
  });
});

describe('party generation state', () => {
  it('elects the oldest member and sanitizes stale members', () => {
    expect(electStoryPartyLeader([
      { sessionId: 'later', joinedAt: 20, lastSeenAt: 100 },
      { sessionId: 'first', joinedAt: 10, lastSeenAt: 100 }
    ])).toBe('first');
    expect(sanitizeStoryPartyInstance({
      version: 1,
      id: 'party',
      worldId: 'greenhollow',
      seed: 'shared',
      generationVersion: 2,
      members: [{ sessionId: 'first', joinedAt: 10, lastSeenAt: 1000 }]
    }, 1000)?.leaderSessionId).toBe('first');
    expect(sanitizeStoryPartyInstance({
      version: 1,
      id: 'future-party',
      worldId: 'greenhollow',
      seed: 'shared',
      generationVersion: 3,
      members: [{ sessionId: 'first', joinedAt: 10, lastSeenAt: 1000 }]
    }, 1000)).toBeNull();
  });
});

describe('adventure encounter contracts', () => {
  it('keeps safe approaches and a five-enemy activation cap', () => {
    for (const [id, world] of Object.entries(STORY_ADVENTURE_WORLDS)) {
      if (id === 'world-route') continue;
      expect(world.bounds.maxX - world.bounds.minX).toBeGreaterThanOrEqual(480);
      expect(world.exploration?.safeApproach[1]! - world.exploration?.safeApproach[0]!).toBeGreaterThanOrEqual(80);
      expect(world.enemySpawns).toHaveLength(10);
      expect(world.exploration?.encounters.every((zone) => zone.maxActive <= STORY_MAX_ACTIVE_ENEMIES)).toBe(true);
      expect(world.enemySpawns?.every((enemy) => enemy.position[0] > world.exploration!.safeApproach[1])).toBe(true);
      const encounters = world.exploration?.encounters ?? [];
      for (let index = 1; index < encounters.length; index += 1) expect(encounters[index].range[0] - encounters[index - 1].range[1]).toBeGreaterThanOrEqual(22);
    }
  });
});

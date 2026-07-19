import { describe, expect, it } from 'vitest';
import { STORY_ADVENTURE_REGION_IDS } from './adventureWorlds';
import {
  adventureFloorValidationErrors,
  generateAdventureFallbackFloor,
  generateAdventureFloor,
  storyBoonChoices,
  storyEncounterCombinationAllowed,
  storyEndlessEnemyScaling,
  storyEndlessPressure,
  storyEndlessRewardScale
} from './adventureEndless';

const REPRESENTATIVE_FLOORS = [1, 2, 3, 4, 5, 6, 7, 8, 100, 10_000, Number.MAX_SAFE_INTEGER];

describe('endless adventure generation', () => {
  it('is deterministic without accumulated history', () => {
    for (const biome of STORY_ADVENTURE_REGION_IDS) {
      for (const floorNumber of REPRESENTATIVE_FLOORS) {
        const first = generateAdventureFloor(biome, 'deterministic-run', floorNumber);
        const second = generateAdventureFloor(biome, 'deterministic-run', floorNumber);
        expect(second).toEqual(first);
      }
    }
  });

  it('keeps v4 runs legacy while new v5 floors are enclosed and tiered', () => {
    const legacy = generateAdventureFloor('greenhollow', 'legacy-run', 3, 4);
    expect(legacy.version).toBe(4);
    expect(legacy.terrainTiles).toBeUndefined();
    const tiers = new Set<number>();
    for (let floorNumber = 1; floorNumber <= 9; floorNumber += 1) {
      const floor = generateAdventureFloor('greenhollow', 'tiered-run', floorNumber, 5);
      tiers.add(floor.entranceTier!);
      expect(floor.terrainTiles?.length).toBeGreaterThan(0);
      expect(floor.bounds).toMatchObject({ minY: 0, maxY: 36 });
      expect(floor.levelMeta?.topologySignature).toBeTruthy();
    }
    expect(tiers).toEqual(new Set([0, 1, 2]));
  });

  it('validates 1,000 seeds per biome across early and direct high floors', () => {
    for (const biome of STORY_ADVENTURE_REGION_IDS) {
      const templateIds = new Set<string>();
      const intents = new Set<string>();
      for (let index = 0; index < 1_000; index += 1) {
        const floorNumber = REPRESENTATIVE_FLOORS[index % REPRESENTATIVE_FLOORS.length];
        const floor = generateAdventureFloor(biome, `property-${index}`, floorNumber);
        intents.add(floor.intent);
        floor.rooms.forEach((room) => templateIds.add(room.templateId));
        expect(adventureFloorValidationErrors(floor), `${biome} seed ${index} floor ${floorNumber}`).toEqual([]);
        expect(floor.criticalRoomIds.length).toBeGreaterThanOrEqual(4);
        expect(floor.criticalRoomIds.length).toBeLessThanOrEqual(7);
        if (floor.boss) expect(floor.rooms.filter((room) => room.optional)).toHaveLength(0);
        if (!floor.boss) {
          expect(floor.rooms.filter((room) => room.optional).length).toBeGreaterThanOrEqual(2);
          expect(floor.rooms.filter((room) => room.optional).length).toBeLessThanOrEqual(4);
        }
        if (floor.intent === 'harvest' || floor.intent === 'exploration') {
          expect(floor.encounters, `${biome} ${floor.intent} encounters`).toEqual([]);
          expect(floor.enemySpawns, `${biome} ${floor.intent} enemies`).toEqual([]);
        }
        if (floor.intent === 'harvest') expect(floor.hazards, `${biome} harvest hazards`).toEqual([]);
        expect(floor.platforms.some((platform) => platform.terrainRole === 'wall'), `${biome} structural terrain`).toBe(true);
        expect(floor.platforms.every((platform) => Number.isInteger(platform.surfaceVariant)), `${biome} terrain variants`).toBe(true);
      }
      expect(templateIds.size).toBeGreaterThanOrEqual(8);
      expect(intents).toEqual(new Set(['combat', 'harvest', 'exploration', 'boss']));
    }
  }, 30_000);

  it('keeps boss cadence, rotation, events, and fallback floors safe', () => {
    for (const biome of STORY_ADVENTURE_REGION_IDS) {
      const priorBosses: string[] = [];
      let previousEvent: string | null = null;
      for (let floorNumber = 1; floorNumber <= 48; floorNumber += 1) {
        const floor = generateAdventureFloor(biome, 'cadence-run', floorNumber);
        expect(floor.boss).toBe(floorNumber % 4 === 0);
        if (floor.boss) {
          expect(floor.event).toBeNull();
          expect(priorBosses.slice(-2)).not.toContain(floor.bossEnemyId);
          priorBosses.push(floor.bossEnemyId!);
        }
        if (floor.event) {
          expect(floor.event.kind).not.toBe(previousEvent);
          previousEvent = floor.event.kind;
        } else previousEvent = null;
      }
      expect(adventureFloorValidationErrors(generateAdventureFallbackFloor(biome, 'fallback-run', 3))).toEqual([]);
      expect(adventureFloorValidationErrors(generateAdventureFallbackFloor(biome, 'fallback-run', 4))).toEqual([]);
    }
  });

  it('scales monotonically with bounded speed, pressure, rewards, and boon caps', () => {
    let previous = storyEndlessEnemyScaling(1);
    for (const floorNumber of [2, 8, 100, 10_000, Number.MAX_SAFE_INTEGER]) {
      const next = storyEndlessEnemyScaling(floorNumber);
      expect(Number.isFinite(next.health)).toBe(true);
      expect(Number.isFinite(next.damage)).toBe(true);
      expect(next.health).toBeGreaterThan(previous.health);
      expect(next.damage).toBeGreaterThan(previous.damage);
      expect(next.speed).toBeLessThanOrEqual(1.25);
      expect(next.attackCooldown).toBeGreaterThanOrEqual(0.65);
      previous = next;
    }
    expect(storyEndlessRewardScale(Number.MAX_SAFE_INTEGER)).toBe(3);
    expect(storyEndlessPressure(199, 200).rank).toBe(0);
    expect(storyEndlessPressure(200, 200)).toMatchObject({ rank: 1, hunterCount: 1 });
    expect(storyEndlessPressure(230, 200)).toMatchObject({ rank: 2, hunterCount: 2 });
    expect(storyEndlessPressure(10_000, 200)).toMatchObject({ hunterCount: 2, hazardScale: 2, telegraphScale: 0.5 });
    expect(storyBoonChoices('boons', 4, { fleetstep: 9, bulwark: 8, focus: 10 })).not.toEqual(expect.arrayContaining(['fleetstep', 'bulwark', 'focus']));
    expect(storyBoonChoices('boons', 4, {}, 1)).not.toEqual(storyBoonChoices('boons', 4, {}, 0));
  });

  it('allows approved encounter combinations and rejects unfair ones', () => {
    expect(storyEncounterCombinationAllowed({ hazardKind: 'wind', traversalKind: 'moving-platform', roomWidth: 28, rangedEnemies: 1, flyingEnemies: 1, enemyCount: 3 })).toBe(true);
    expect(storyEncounterCombinationAllowed({ eventKind: 'stranded-explorer', hazardKind: 'lava', roomWidth: 28, rangedEnemies: 0, flyingEnemies: 0, enemyCount: 1 })).toBe(false);
    expect(storyEncounterCombinationAllowed({ hazardKind: null, roomWidth: 18, rangedEnemies: 3, flyingEnemies: 0, enemyCount: 3 })).toBe(false);
    expect(storyEncounterCombinationAllowed({ hazardKind: 'drowning', roomWidth: 28, rangedEnemies: 0, flyingEnemies: 0, enemyCount: 2, hasAirPockets: false })).toBe(false);
  });
});

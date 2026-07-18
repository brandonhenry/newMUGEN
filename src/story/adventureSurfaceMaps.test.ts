import { describe, expect, it } from 'vitest';
import { STORY_ADVENTURE_REGION_IDS, STORY_ADVENTURE_WORLDS } from './adventureWorlds';
import { STORY_ADVENTURE_SURFACE_MAPS } from './adventureSurfaceMaps';
import { STORY_NPCS, STORY_NPC_SPRITES, STORY_NPC_VISIBLE_WORLD_HEIGHT, storyNpcFootContactSinkY, storyNpcPlaneSize } from './adventureNpcs';
import { storyAvatarGroundingOffsetForWorld, storyAvatarVisibleFootWorldY, storyGroundAnchoredPlaneCenterY } from './actorGrounding';
import { adventureRunIsReachable, generateAdventureRunGraph } from './adventureExploration';
import { storyPlatformSurfacePlacement } from './platformGrounding';

describe('authored Adventure surface campaign', () => {
  it('ships four intentionally paced maps and six one-time discoveries per biome', () => {
    expect(Object.values(STORY_ADVENTURE_SURFACE_MAPS).flat()).toHaveLength(32);
    for (const biome of STORY_ADVENTURE_REGION_IDS) {
      const maps = STORY_ADVENTURE_SURFACE_MAPS[biome];
      expect(maps.map((map) => map.role)).toEqual(['arrival', 'field-a', 'field-b', 'mastery']);
      expect(maps[0].encounters).toHaveLength(0);
      expect(maps[1].encounters).toHaveLength(2);
      expect(maps[2].encounters).toHaveLength(2);
      expect(maps[3].encounters.some((encounter) => encounter.elite)).toBe(true);
      expect(maps.flatMap((map) => map.interactables).filter((item) => item.kind === 'chest')).toHaveLength(3);
      expect(maps.flatMap((map) => map.interactables).filter((item) => item.kind === 'relic')).toHaveLength(3);
      expect(maps.flatMap((map) => map.npcs)).toHaveLength(3);
      for (const map of maps) {
        expect(map.bounds.maxX - map.bounds.minX).toBeGreaterThanOrEqual(100);
        expect(map.landmarks.filter((landmark) => landmark.id === map.heroLandmarkId)).toHaveLength(1);
        expect(map.landmarks.length).toBeLessThanOrEqual(2);
        expect(map.spawn[0]).toBeGreaterThan(map.bounds.minX);
        expect(map.spawn[0]).toBeLessThan(map.bounds.maxX);
      }
    }
  });

  it('registers the three starter NPCs and three unique residents per biome', () => {
    expect(STORY_NPCS).toHaveLength(27);
    expect(new Set(STORY_NPCS.map((npc) => npc.id)).size).toBe(27);
    expect(STORY_NPCS.filter((npc) => npc.biomeId === 'world-route')).toHaveLength(3);
    for (const biome of STORY_ADVENTURE_REGION_IDS) {
      const residents = STORY_NPCS.filter((npc) => npc.biomeId === biome);
      expect(residents).toHaveLength(3);
      expect(residents.every((npc) => npc.defense.invulnerable && npc.defense.attackerOnly && npc.defense.counterDamagePercent >= 0.10 && npc.defense.counterDamagePercent <= 0.18)).toBe(true);
    }
    for (const npc of STORY_NPCS) {
      const sprite = STORY_NPC_SPRITES[npc.spriteId];
      const visiblePixels = sprite.referenceContentBounds[3] - sprite.referenceContentBounds[1];
      const renderedVisibleHeight = storyNpcPlaneSize(sprite) * visiblePixels / sprite.frameSize.height;
      expect(renderedVisibleHeight, npc.id).toBeCloseTo(STORY_NPC_VISIBLE_WORLD_HEIGHT, 4);
    }
  });

  it('places player and NPC visible feet on each authored tile surface', () => {
    for (const maps of Object.values(STORY_ADVENTURE_SURFACE_MAPS)) {
      for (const map of maps) {
        const world = STORY_ADVENTURE_WORLDS[map.biomeId];
        const ground = map.platforms.find((platform) => platform.id.endsWith('-ground'))!;
        const placement = storyPlatformSurfacePlacement(ground, world.environment?.surface);
        const tileTopY = ground.position[1] + placement.centerY + placement.height / 2;
        const playerFootY = storyAvatarVisibleFootWorldY(map.spawn[1], storyAvatarGroundingOffsetForWorld()) - placement.surfaceInsetY;
        expect(playerFootY, `${map.id}/player`).toBeCloseTo(tileTopY, 8);
        for (const npc of map.npcs) {
          const sprite = STORY_NPC_SPRITES[npc.spriteId];
          const planeSize = storyNpcPlaneSize(sprite);
          const footAnchorFromBottom = (sprite.frameSize.height - sprite.frameSize.baseline) / sprite.frameSize.height;
          const surfacePixelWorldHeight = placement.height / world.environment!.surface!.frame[3];
          const footContactSinkY = storyNpcFootContactSinkY(planeSize, sprite.frameSize.height, surfacePixelWorldHeight);
          const npcFootY = npc.position[1]
            + storyGroundAnchoredPlaneCenterY(planeSize, footAnchorFromBottom)
            - placement.surfaceInsetY
            - footContactSinkY
            - planeSize / 2
            + planeSize * footAnchorFromBottom;
          expect(npcFootY, `${map.id}/${npc.id}`).toBeCloseTo(tileTopY - footContactSinkY, 8);
          expect(npcFootY, `${map.id}/${npc.id} contact`).toBeLessThan(tileTopY);
          expect(npcFootY, `${map.id}/${npc.id} contact`).toBeGreaterThan(tileTopY - 0.06);
        }
      }
    }
  });

  it('validates 1,000 deterministic procedural seeds per biome', () => {
    for (const biome of STORY_ADVENTURE_REGION_IDS) {
      const exploration = STORY_ADVENTURE_WORLDS[biome].exploration!;
      for (let seed = 0; seed < 1_000; seed += 1) {
        const graph = generateAdventureRunGraph(biome, `acceptance-${seed}`, exploration);
        if (!adventureRunIsReachable(graph)) throw new Error(`${biome} seed ${seed} is unreachable`);
        if (graph.zones.filter((zone) => zone.hidden).length !== 1) throw new Error(`${biome} seed ${seed} hidden branch contract failed`);
        if (!graph.zones.some((zone) => zone.kind === 'sanctuary')) throw new Error(`${biome} seed ${seed} sanctuary missing`);
        if (graph.zones.filter((zone) => zone.finale).length !== 1) throw new Error(`${biome} seed ${seed} finale missing`);
        if (!graph.zones.filter((zone) => zone.kind !== 'sanctuary').every((zone) => zone.rewardAfterChallenge)) throw new Error(`${biome} seed ${seed} reward ordering failed`);
      }
    }
  });
});

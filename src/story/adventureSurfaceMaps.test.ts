import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STORY_ADVENTURE_REGION_IDS, STORY_ADVENTURE_WORLDS } from './adventureWorlds';
import { STORY_ADVENTURE_SURFACE_MAPS } from './adventureSurfaceMaps';
import { STORY_HAZARD_ENTRY_CLEARANCE, STORY_HAZARD_SPRITES, storyHazardDealsContactDamage, storyHazardHasVisibleDamageSprite, storyHazardIsClearOfEntry } from './adventureHazards';
import { STORY_NPCS, STORY_NPC_ENTRANCE_SIDE_CLEARANCE, STORY_NPC_SPRITES, STORY_NPC_VISIBLE_WORLD_HEIGHT, storyNpcFootContactSinkY, storyNpcPlaneSize } from './adventureNpcs';
import { STORY_GROUNDED_ACTOR_CENTER_Y, storyAvatarGroundingOffsetForWorld, storyAvatarVisibleFootWorldY, storyGroundAnchoredPlaneCenterY } from './actorGrounding';
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
      expect(maps.flatMap((map) => map.npcs)).toHaveLength(12);
      for (const map of maps) {
        expect(map.npcs).toHaveLength(3);
        for (const hazard of map.hazards) {
          expect(hazard.damage > 0).toBe(storyHazardDealsContactDamage(hazard.kind));
          expect(storyHazardHasVisibleDamageSprite(hazard), `${map.id}/${hazard.id}`).toBe(true);
        }
        expect(new Set(map.npcs.map((npc) => npc.role))).toEqual(new Set(['guide', 'specialist', 'resident']));
        expect(map.bounds.maxX - map.bounds.minX).toBeGreaterThanOrEqual(100);
        expect(map.landmarks.filter((landmark) => landmark.id === map.heroLandmarkId)).toHaveLength(1);
        expect(map.landmarks.length).toBeLessThanOrEqual(2);
        expect(map.spawn[0]).toBeGreaterThan(map.bounds.minX);
        expect(map.spawn[0]).toBeLessThan(map.bounds.maxX);
      }
    }
  });

  it('registers the three route starters and twelve unique residents per biome', () => {
    expect(STORY_NPCS).toHaveLength(99);
    expect(new Set(STORY_NPCS.map((npc) => npc.id)).size).toBe(99);
    expect(STORY_NPCS.filter((npc) => npc.biomeId === 'world-route')).toHaveLength(3);
    for (const biome of STORY_ADVENTURE_REGION_IDS) {
      const residents = STORY_NPCS.filter((npc) => npc.biomeId === biome);
      expect(residents).toHaveLength(12);
      expect(residents.every((npc) => !npc.defense.invulnerable && npc.defense.attackerOnly && npc.defense.counterDamagePercent >= 0.10 && npc.defense.counterDamagePercent <= 0.18)).toBe(true);
    }
    for (const npc of STORY_NPCS) {
      const sprite = STORY_NPC_SPRITES[npc.spriteId];
      const visiblePixels = sprite.referenceContentBounds[3] - sprite.referenceContentBounds[1];
      const renderedVisibleHeight = storyNpcPlaneSize(sprite) * visiblePixels / sprite.frameSize.height;
      expect(renderedVisibleHeight, npc.id).toBeCloseTo(STORY_NPC_VISIBLE_WORLD_HEIGHT, 4);
    }
  });

  it('keeps authored hazard volumes out of enemy spawn and patrol space', () => {
    const playerHalfWidth = 0.45;
    for (const maps of Object.values(STORY_ADVENTURE_SURFACE_MAPS)) {
      for (const map of maps) {
        for (const enemy of map.enemySpawns) {
          const patrolHalfWidth = enemy.patrolRadius * 2.5;
          const enemyMinX = enemy.position[0] - patrolHalfWidth - playerHalfWidth;
          const enemyMaxX = enemy.position[0] + patrolHalfWidth + playerHalfWidth;
          for (const hazard of map.hazards) {
            const [hazardMinX, hazardMaxX] = hazard.bounds;
            const overlaps = enemyMaxX >= hazardMinX && enemyMinX <= hazardMaxX;
            expect(overlaps, `${map.id}/${enemy.id}/${hazard.id}`).toBe(false);
          }
        }
      }
    }
  });

  it('renders contact-damage hazards as stationary environmental props', () => {
    for (const definition of Object.values(STORY_HAZARD_SPRITES)) {
      expect(definition.displayFrame).toBe(0);
      expect(definition.path.endsWith('.png')).toBe(true);
      expect(existsSync(join(process.cwd(), 'public', definition.path.replace(/^\//, ''))), definition.path).toBe(true);
    }
  });

  it('keeps every hazard well clear of both entry spawns and visible doorways', () => {
    const entranceKinds = new Set(['adventure-gate', 'mode-door', 'shrine']);
    for (const maps of Object.values(STORY_ADVENTURE_SURFACE_MAPS)) {
      for (const map of maps) {
        const entries = [
          { id: 'west-spawn', x: map.spawn[0], halfWidth: 0.45 },
          { id: 'east-spawn', x: map.bounds.maxX - 7, halfWidth: 0.45 },
          ...map.portals
            .filter((portal) => portal.kind && entranceKinds.has(portal.kind))
            .map((portal) => ({ id: portal.id, x: portal.position[0], halfWidth: portal.size[0] / 2 }))
        ];
        for (const hazard of map.hazards) {
          for (const entry of entries) {
            expect(storyHazardIsClearOfEntry(hazard, entry.x, entry.halfWidth), `${map.id}/${hazard.id}/${entry.id}`).toBe(true);
            const [hazardMinX, hazardMaxX] = hazard.bounds;
            const nearestDistance = entry.x < hazardMinX ? hazardMinX - (entry.x + entry.halfWidth) : entry.x > hazardMaxX ? entry.x - entry.halfWidth - hazardMaxX : 0;
            expect(nearestDistance, `${map.id}/${hazard.id}/${entry.id}`).toBeGreaterThanOrEqual(STORY_HAZARD_ENTRY_CLEARANCE);
          }
        }
      }
    }
  });

  it('places every NPC beside entrances instead of inside their doorway corridor', () => {
    const entranceKinds = new Set(['adventure-gate', 'mode-door', 'storefront', 'shrine']);
    const worlds = [STORY_ADVENTURE_WORLDS['world-route'], ...Object.values(STORY_ADVENTURE_SURFACE_MAPS).flat()];
    for (const world of worlds) {
      const entrances = world.portals.filter((portal) => portal.kind && entranceKinds.has(portal.kind));
      for (const npc of world.npcs ?? []) {
        for (const entrance of entrances) {
          const minimumSideDistance = entrance.size[0] / 2 + STORY_NPC_ENTRANCE_SIDE_CLEARANCE;
          expect(Math.abs(npc.position[0] - entrance.position[0]), `${world.id}/${npc.id}/${entrance.id}`).toBeGreaterThanOrEqual(minimumSideDistance);
        }
      }
    }
  });

  it('keeps every surface interaction on reachable compiled collision', () => {
    for (const maps of Object.values(STORY_ADVENTURE_SURFACE_MAPS)) {
      for (const map of maps) {
        expect(new Set(map.portals.map((portal) => portal.id)).size, `${map.id}/unique-portals`).toBe(map.portals.length);
        for (const interactable of map.interactables) {
          const portal = map.portals.find((candidate) => candidate.id === `${interactable.kind}:${interactable.id}`);
          expect(portal, `${map.id}/${interactable.id}/portal`).toBeDefined();
          expect(portal?.position, `${map.id}/${interactable.id}/position`).toEqual(interactable.position);
        }
        for (const npc of map.npcs) {
          expect(map.portals.some((portal) => portal.id === `npc:${npc.id}`), `${map.id}/${npc.id}/portal`).toBe(true);
        }
        for (const portal of map.portals) {
          const terrainCaps = (map.terrainTiles ?? [])
            .filter((tile) => ['top', 'outer-top-left', 'outer-top-right'].includes(tile.role) && portal.position[0] >= tile.position[0] - tile.size[0] / 2 && portal.position[0] <= tile.position[0] + tile.size[0] / 2)
            .map((tile) => tile.position[1] + tile.size[1] / 2);
          const oneWayCaps = map.platforms
            .filter((platform) => (platform.oneWay || platform.collision === 'one-way') && portal.position[0] >= platform.position[0] - platform.size[0] / 2 && portal.position[0] <= platform.position[0] + platform.size[0] / 2)
            .map((platform) => platform.position[1] + platform.size[1] / 2);
          const supportTops = [...terrainCaps, ...oneWayCaps]
            .filter((top) => top <= portal.position[1] + 0.1)
            .sort((left, right) => right - left);
          expect(supportTops.length, `${map.id}/${portal.id}/support`).toBeGreaterThan(0);
          expect(portal.position[1], `${map.id}/${portal.id}/grounding`).toBeCloseTo(supportTops[0] + STORY_GROUNDED_ACTOR_CENTER_Y, 8);
        }
      }
    }
  });

  it('places player and NPC visible feet on each authored tile surface', () => {
    for (const maps of Object.values(STORY_ADVENTURE_SURFACE_MAPS)) {
      for (const map of maps) {
        const world = STORY_ADVENTURE_WORLDS[map.biomeId];
        const supportingPlatform = (x: number, bodyY: number) => map.platforms
          .filter((platform) => x >= platform.position[0] - platform.size[0] / 2 && x <= platform.position[0] + platform.size[0] / 2 && platform.position[1] + platform.size[1] / 2 <= bodyY + 0.2)
          .sort((left, right) => right.position[1] + right.size[1] / 2 - (left.position[1] + left.size[1] / 2))[0]!;
        const playerPlatform = supportingPlatform(map.spawn[0], map.spawn[1]);
        const playerPlacement = storyPlatformSurfacePlacement(playerPlatform, world.environment?.surface);
        const playerTileTopY = playerPlatform.position[1] + playerPlacement.centerY + playerPlacement.height / 2;
        const playerFootY = storyAvatarVisibleFootWorldY(map.spawn[1], storyAvatarGroundingOffsetForWorld()) - playerPlacement.surfaceInsetY;
        expect(playerFootY, `${map.id}/player`).toBeCloseTo(playerTileTopY, 8);
        for (const npc of map.npcs) {
          const ground = supportingPlatform(npc.position[0], npc.position[1]);
          const placement = storyPlatformSurfacePlacement(ground, world.environment?.surface);
          const tileTopY = ground.position[1] + placement.centerY + placement.height / 2;
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

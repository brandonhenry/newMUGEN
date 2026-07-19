import { describe, expect, it } from 'vitest';
import { storyChallengerSpawnPosition } from './adventureEncounterPlacement';
import { STORY_ADVENTURE_SURFACE_MAPS } from './adventureSurfaceMaps';
import { STORY_GROUNDED_ACTOR_CENTER_Y } from './actorGrounding';

describe('Adventure challenger placement', () => {
  it('arrives at the last defeated regular instead of the far edge of the arena', () => {
    const zone = { id: 'arena', range: [10, 40] as [number, number], maxActive: 2 };
    const regularSpawns = [
      { id: 'near', enemyId: 'graveblade' as const, position: [16, 4.82] as [number, number], patrolRadius: 2, accent: '#fff', encounterZoneId: zone.id },
      { id: 'far', enemyId: 'tide-slime' as const, position: [34, 4.82] as [number, number], patrolRadius: 2, accent: '#fff', encounterZoneId: zone.id }
    ];

    expect(storyChallengerSpawnPosition({
      zone,
      regularSpawns,
      spawnAnchorId: 'near',
      challengerArchetype: 'ground',
      floorY: 0
    })).toEqual([16, 4.82]);
  });

  it('preserves the authored elevation of every surface-map encounter', () => {
    for (const map of Object.values(STORY_ADVENTURE_SURFACE_MAPS).flat()) {
      for (const zone of map.encounters) {
        const anchors = map.enemySpawns.filter((spawn) => spawn.encounterZoneId === zone.id);
        for (const anchor of anchors) {
          const position = storyChallengerSpawnPosition({
            zone,
            regularSpawns: map.enemySpawns,
            spawnAnchorId: anchor.id,
            challengerArchetype: 'ground',
            floorY: map.bounds.floorY
          });
          expect(position[0], `${map.id}/${zone.id}/${anchor.id} x`).toBe(anchor.position[0]);
          expect(position[1], `${map.id}/${zone.id}/${anchor.id} y`).toBeGreaterThanOrEqual(map.bounds.floorY + STORY_GROUNDED_ACTOR_CENTER_Y);
        }
      }
    }
  });

  it('falls back inside the arena when loading legacy challenge state without an anchor', () => {
    const zone = { id: 'arena', range: [10, 12] as [number, number], maxActive: 1 };
    const position = storyChallengerSpawnPosition({ zone, regularSpawns: [], challengerArchetype: 'ranged', floorY: 3 });
    expect(position).toEqual([11, 3 + STORY_GROUNDED_ACTOR_CENTER_Y]);
  });
});

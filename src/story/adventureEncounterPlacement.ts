import { STORY_GROUNDED_ACTOR_CENTER_Y } from './actorGrounding';
import { getStoryEnemyDefinition } from './enemyCatalog';
import type { StoryEnemyArchetype, StoryEnemySpawnDefinition, StoryEncounterZoneDefinition } from './types';

const STORY_FLYING_ENEMY_CENTER_ABOVE_FLOOR = 3.4;
const STORY_CHALLENGER_ARENA_INSET = 2.25;

function enemyCenterAboveFloor(archetype: StoryEnemyArchetype): number {
  return archetype === 'flying' ? STORY_FLYING_ENEMY_CENTER_ABOVE_FLOOR : STORY_GROUNDED_ACTOR_CENTER_Y;
}

/**
 * Places a newly selected challenger at the last defeated regular's valid arena
 * position. Besides keeping the arrival in view, the anchor preserves authored
 * room elevation instead of assuming every encounter lives at world Y=0.
 */
export function storyChallengerSpawnPosition(input: {
  zone: StoryEncounterZoneDefinition;
  regularSpawns: StoryEnemySpawnDefinition[];
  spawnAnchorId?: string;
  challengerArchetype: StoryEnemyArchetype;
  floorY: number;
}): [number, number] {
  const anchor = input.regularSpawns.find((spawn) => spawn.id === input.spawnAnchorId && spawn.encounterZoneId === input.zone.id);
  const arenaWidth = input.zone.range[1] - input.zone.range[0];
  const inset = Math.min(STORY_CHALLENGER_ARENA_INSET, Math.max(0, arenaWidth / 2));
  const minX = input.zone.range[0] + inset;
  const maxX = input.zone.range[1] - inset;
  const fallbackX = maxX;
  const x = Math.max(minX, Math.min(maxX, anchor?.position[0] ?? fallbackX));

  const anchorFloorY = anchor
    ? anchor.position[1] - enemyCenterAboveFloor(getStoryEnemyDefinition(anchor.enemyId).archetype)
    : input.floorY;
  const groundY = Math.max(input.floorY, anchorFloorY);
  return [x, groundY + enemyCenterAboveFloor(input.challengerArchetype)];
}

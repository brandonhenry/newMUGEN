import { STORY_GROUNDED_ACTOR_CENTER_Y } from './actorGrounding';
import { STORY_MOVEMENT_PROFILE } from './movementProfile';
import type { StoryPlatformDefinition } from './types';

export type StoryTerrainMotionResult = {
  x: number;
  y: number;
  velocityY: number;
  landing: StoryPlatformDefinition | null;
};

/** Pure kinematic collision used by both the live controller and witnesses. */
export function resolveStoryTerrainMotion(input: {
  previous: { x: number; y: number };
  proposed: { x: number; y: number };
  velocityY: number;
  platforms: StoryPlatformDefinition[];
  horizontalDirection: number;
  dropThrough: boolean;
}): StoryTerrainMotionResult {
  let x = input.proposed.x;
  let y = input.proposed.y;
  let velocityY = input.velocityY;
  const solids = input.platforms.filter((platform) => !platform.oneWay && platform.collision !== 'one-way');
  for (const platform of solids) {
    const left = platform.position[0] - platform.size[0] / 2;
    const right = platform.position[0] + platform.size[0] / 2;
    const bottom = platform.position[1] - platform.size[1] / 2;
    const top = platform.position[1] + platform.size[1] / 2;
    const verticallyOverlaps = y + STORY_MOVEMENT_PROFILE.avatarHalfHeight > bottom && y - STORY_MOVEMENT_PROFILE.avatarHalfHeight < top;
    if (!verticallyOverlaps) continue;
    const movingRightAcross = input.horizontalDirection > 0 && input.previous.x + STORY_MOVEMENT_PROFILE.avatarHalfWidth <= left && x + STORY_MOVEMENT_PROFILE.avatarHalfWidth > left;
    const movingLeftAcross = input.horizontalDirection < 0 && input.previous.x - STORY_MOVEMENT_PROFILE.avatarHalfWidth >= right && x - STORY_MOVEMENT_PROFILE.avatarHalfWidth < right;
    if (movingRightAcross) x = left - STORY_MOVEMENT_PROFILE.avatarHalfWidth;
    else if (movingLeftAcross) x = right + STORY_MOVEMENT_PROFILE.avatarHalfWidth;
  }
  if (velocityY > 0) for (const platform of solids) {
    const left = platform.position[0] - platform.size[0] / 2;
    const right = platform.position[0] + platform.size[0] / 2;
    const bottom = platform.position[1] - platform.size[1] / 2;
    const horizontallyOverlaps = x + STORY_MOVEMENT_PROFILE.avatarHalfWidth > left && x - STORY_MOVEMENT_PROFILE.avatarHalfWidth < right;
    const crossedUnderside = input.previous.y + STORY_MOVEMENT_PROFILE.avatarHalfHeight <= bottom && y + STORY_MOVEMENT_PROFILE.avatarHalfHeight > bottom;
    if (horizontallyOverlaps && crossedUnderside) { y = bottom - STORY_MOVEMENT_PROFILE.avatarHalfHeight; velocityY = 0; }
  }
  let landing: StoryPlatformDefinition | null = null;
  if (velocityY <= 0) for (const platform of input.platforms) {
    if ((platform.oneWay || platform.collision === 'one-way') && input.dropThrough) continue;
    const top = platform.position[1] + platform.size[1] / 2;
    const previousBottom = input.previous.y - STORY_GROUNDED_ACTOR_CENTER_Y;
    const nextBottom = y - STORY_GROUNDED_ACTOR_CENTER_Y;
    const left = platform.position[0] - platform.size[0] / 2;
    const right = platform.position[0] + platform.size[0] / 2;
    const edgeCatch = platform.oneWay || platform.collision === 'one-way' ? STORY_MOVEMENT_PROFILE.oneWayEdgeCatch : STORY_MOVEMENT_PROFILE.solidEdgeCatch;
    if (x < left - edgeCatch || x > right + edgeCatch || previousBottom < top - 0.42 || nextBottom > top + 0.16) continue;
    if (!landing || top > landing.position[1] + landing.size[1] / 2) landing = platform;
  }
  if (landing) {
    const left = landing.position[0] - landing.size[0] / 2;
    const right = landing.position[0] + landing.size[0] / 2;
    x = Math.max(left + 0.12, Math.min(right - 0.12, x));
    y = landing.position[1] + landing.size[1] / 2 + STORY_GROUNDED_ACTOR_CENTER_Y;
    velocityY = 0;
  }
  return { x, y, velocityY, landing };
}

import { describe, expect, it } from 'vitest';
import { STORY_AVATAR_GROUNDING_OFFSET_Y, STORY_CENTRAL_AVATAR_GROUNDING_OFFSET_Y, STORY_GROUNDED_ACTOR_CENTER_Y, storyAvatarGroundingOffsetForWorld, storyAvatarGroundingOffsetY, storyAvatarVisibleFootWorldY, storyGroundAnchoredPlaneCenterY, storyScaledGroundAnchorOffsetY } from './actorGrounding';
import { STORY_WORLDS } from './adventureWorlds';
import { getStoryEnemyDefinition } from './enemyCatalog';

describe('story actor visual grounding', () => {
  it('places the player sprite baseline on the authored enemy foot line', () => {
    expect(STORY_AVATAR_GROUNDING_OFFSET_Y).toBeCloseTo(0.113636, 6);
    expect(storyAvatarVisibleFootWorldY(STORY_GROUNDED_ACTOR_CENTER_Y)).toBeCloseTo(0, 8);
  });

  it('preserves K.O.R.E. Central grounding outside enemy combat regions', () => {
    expect(storyAvatarGroundingOffsetForWorld(false)).toBe(STORY_CENTRAL_AVATAR_GROUNDING_OFFSET_Y);
    expect(STORY_CENTRAL_AVATAR_GROUNDING_OFFSET_Y).toBe(-0.5);
    expect(storyAvatarGroundingOffsetForWorld(true)).toBe(STORY_AVATAR_GROUNDING_OFFSET_Y);
  });

  it('derives the offset for elevated platforms instead of changing the actor baseline', () => {
    const platformTop = 3.125;
    const bodyCenterY = platformTop + STORY_GROUNDED_ACTOR_CENTER_Y;
    expect(storyAvatarVisibleFootWorldY(bodyCenterY)).toBeCloseTo(platformTop, 8);
    expect(storyAvatarGroundingOffsetY(bodyCenterY, platformTop)).toBeCloseTo(STORY_AVATAR_GROUNDING_OFFSET_Y, 8);
  });

  it('keeps every grounded story enemy on the same authored center line as the player', () => {
    for (const world of Object.values(STORY_WORLDS)) {
      for (const enemy of world.enemySpawns ?? []) {
        if (getStoryEnemyDefinition(enemy.enemyId).archetype === 'flying') continue;
        expect(enemy.position[1], `${world.id}/${enemy.id}`).toBe(STORY_GROUNDED_ACTOR_CENTER_Y);
      }
    }
  });

  it('keeps normal, elite, and mount sprite feet on the collision-derived contact line', () => {
    for (const [height, scale] of [[1.45, 1], [1.7, 1], [1.85, 1], [1.7, 2.35]] as const) {
      const planeCenter = storyGroundAnchoredPlaneCenterY(height);
      const scaledRoot = storyScaledGroundAnchorOffsetY(scale);
      const visibleBottom = STORY_GROUNDED_ACTOR_CENTER_Y + scaledRoot + scale * (planeCenter - height / 2);
      expect(visibleBottom).toBeCloseTo(0, 8);
    }
  });
});

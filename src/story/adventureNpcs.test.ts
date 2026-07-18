import { describe, expect, it } from 'vitest';
import { STORY_NPC_POPUP_ANCHOR_Y, STORY_NPC_VISIBLE_WORLD_HEIGHT, storyNpcWatchFacing } from './adventureNpcs';
import { STORY_GROUNDED_ACTOR_CENTER_Y } from './actorGrounding';

describe('story NPC watching', () => {
  it('anchors NPC popups above visible head height', () => {
    const visibleHeadY = STORY_NPC_VISIBLE_WORLD_HEIGHT - STORY_GROUNDED_ACTOR_CENTER_Y;

    expect(STORY_NPC_POPUP_ANCHOR_Y).toBeGreaterThan(visibleHeadY);
    expect(STORY_NPC_POPUP_ANCHOR_Y - visibleHeadY).toBeGreaterThanOrEqual(0.8);
  });

  it('faces a nearby player on either side without changing any position', () => {
    const npcPosition = [10, 1] as const;

    expect(storyNpcWatchFacing(npcPosition, { x: 7, y: 1 }, 1)).toBe(-1);
    expect(storyNpcWatchFacing(npcPosition, { x: 13, y: 1 }, -1)).toBe(1);
  });

  it('keeps its current facing when the player is far away or directly overhead', () => {
    const npcPosition = [10, 1] as const;

    expect(storyNpcWatchFacing(npcPosition, { x: 16, y: 1 }, -1)).toBe(-1);
    expect(storyNpcWatchFacing(npcPosition, { x: 12, y: 5 }, -1)).toBe(-1);
    expect(storyNpcWatchFacing(npcPosition, { x: 10.02, y: 1 }, 1)).toBe(1);
  });
});

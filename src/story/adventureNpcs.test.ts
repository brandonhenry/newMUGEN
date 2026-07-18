import { describe, expect, it } from 'vitest';
import { storyNpcWatchFacing } from './adventureNpcs';

describe('story NPC watching', () => {
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

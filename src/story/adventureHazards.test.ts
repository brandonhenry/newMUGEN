import { describe, expect, it } from 'vitest';
import { STORY_HAZARD_ENTRY_CLEARANCE, storyHazardContactDamageReady, storyHazardHasVisibleDamageSprite, storyHazardIsClearOfEntry } from './adventureHazards';

describe('story adventure hazard contact timing', () => {
  it('waits for the authored warning before dealing contact damage', () => {
    expect(storyHazardContactDamageReady(1_349, 1_000, 350)).toBe(false);
    expect(storyHazardContactDamageReady(1_350, 1_000, 350)).toBe(true);
  });

  it('continues to honor the repeat-damage cooldown after the warning', () => {
    expect(storyHazardContactDamageReady(2_000, 1_000, 350, 2_001)).toBe(false);
    expect(storyHazardContactDamageReady(2_001, 1_000, 350, 2_001)).toBe(true);
  });

  it('requires damaging volumes to have visible PNG sprites', () => {
    const hazard = { id: 'test', kind: 'spikes' as const, bounds: [0, 4, 0, 1] as [number, number, number, number], damage: 12, knockback: 4, telegraphMs: 350, accent: '#fff' };
    expect(storyHazardHasVisibleDamageSprite(hazard)).toBe(true);
    expect(storyHazardHasVisibleDamageSprite({ ...hazard, kind: 'wind' })).toBe(false);
    expect(storyHazardHasVisibleDamageSprite({ ...hazard, kind: 'wind', damage: 0 })).toBe(true);
  });

  it('measures doorway clearance from the visible edges of both volumes', () => {
    const hazard = { id: 'test', kind: 'spikes' as const, bounds: [10, 14, 0, 1] as [number, number, number, number], damage: 12, knockback: 4, telegraphMs: 350, accent: '#fff' };
    expect(storyHazardIsClearOfEntry(hazard, 0, 2)).toBe(true);
    expect(storyHazardIsClearOfEntry(hazard, 0, 2, STORY_HAZARD_ENTRY_CLEARANCE + 1)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import type { StoryEnemyId } from './types';
import { STORY_ENEMY_CATALOG, STORY_ENEMY_IDS, getStoryEnemyDefinition } from './enemyCatalog';

describe('Story enemy runtime safety', () => {
  it('registers only enemies that have complete runtime definitions', () => {
    expect(STORY_ENEMY_IDS.length).toBeGreaterThan(0);
    expect(STORY_ENEMY_IDS.every((id) => Boolean(STORY_ENEMY_CATALOG[id]))).toBe(true);
  });

  it('falls back safely when a stale or unfinished enemy id is requested', () => {
    const fallback = getStoryEnemyDefinition('unfinished-enemy' as StoryEnemyId);
    expect(fallback).toBeDefined();
    expect(fallback.animations.some((animation) => animation.id === 'idle')).toBe(true);
    expect(fallback.attacks.length).toBeGreaterThan(0);
  });
});

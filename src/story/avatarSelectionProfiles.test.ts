import { describe, expect, it } from 'vitest';
import { STORY_AVATAR_SELECTION_PROFILES, STORY_AVATAR_SETS } from './avatarCatalog';

describe('Adventure avatar selection profiles', () => {
  it('gives every hero a player-facing identity and combat explanation', () => {
    expect(Object.keys(STORY_AVATAR_SELECTION_PROFILES)).toHaveLength(STORY_AVATAR_SETS.length);
    STORY_AVATAR_SETS.forEach((avatarSet) => {
      const profile = STORY_AVATAR_SELECTION_PROFILES[avatarSet];
      expect(profile.role.length).toBeGreaterThan(3);
      expect(profile.description.length).toBeGreaterThan(20);
      expect(profile.strengths.length).toBeGreaterThan(20);
      expect(profile.special.length).toBeGreaterThan(20);
    });
  });

  it('keeps implementation language out of hero descriptions', () => {
    const copy = JSON.stringify(STORY_AVATAR_SELECTION_PROFILES).toLowerCase();
    ['runtime', 'procedural', 'preset', 'recolor', 'frame', 'sprite', 'asset', 'manifest'].forEach((term) => {
      expect(copy).not.toContain(term);
    });
  });
});

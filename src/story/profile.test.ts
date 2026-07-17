import { beforeEach, describe, expect, it } from 'vitest';
import { makeDefaultStoryAvatar, sanitizeStoryAvatar, sanitizeStoryName, STORY_ACCESSORIES, STORY_AVATAR_SETS, STORY_BODY_TONES, STORY_HAIR_STYLES, STORY_LEG_STYLES, STORY_OUTFITS } from './avatarCatalog';
import { migrateStoryProfileV3, readStoryProfile, sanitizeStoryProfile, writeStoryProfile } from './profile';
import { LEGACY_STORY_PROFILE_STORAGE_KEY, STORY_PROFILE_STORAGE_KEY } from './types';

describe('full-frame street avatar profile', () => {
  beforeEach(() => window.localStorage.clear());

  it('sanitizes names and exposes the expanded customization catalog', () => {
    expect(sanitizeStoryName('  Hero!* 99  ')).toBe('HERO 99');
    expect(STORY_AVATAR_SETS).toHaveLength(14);
    expect(STORY_AVATAR_SETS).toContain('tech-nomad');
    expect(STORY_BODY_TONES).toHaveLength(10);
    expect(STORY_HAIR_STYLES).toHaveLength(8);
    expect(STORY_OUTFITS).toHaveLength(10);
    expect(STORY_LEG_STYLES).toHaveLength(8);
    expect(STORY_ACCESSORIES).toHaveLength(9);
    expect(sanitizeStoryAvatar({ name: 'Nova', bodyPreset: 'giant', bodyTone: 'missing', hairStyle: 'missing' })).toMatchObject({
      name: 'NOVA', avatarSet: 'street-shadow', lineage: 'human', bodyPreset: 'standard', bodyTone: 'tan', hairStyle: 'short', outfit: 'kore-cyan', legStyle: 'fitted'
    });
  });

  it('writes and reads a reviewed V4 street avatar profile', () => {
    const saved = writeStoryProfile({ ...makeDefaultStoryAvatar(), name: 'ASTRA' }, null, 1000);
    expect(saved).toMatchObject({ version: 4, avatarStyle: 'kore-street-v1', createdAt: 1000, updatedAt: 1000, reviewedAt: 1000, avatar: { name: 'ASTRA', avatarSet: 'street-shadow', bodyTone: 'tan', legStyle: 'fitted' } });
    expect(readStoryProfile()).toEqual(saved);
  });

  it('preserves creation time on edits and rejects corrupt or unknown versions', () => {
    const first = writeStoryProfile(makeDefaultStoryAvatar('FIRST'), null, 1000);
    const edited = writeStoryProfile({ ...first.avatar, accessory: 'cyber-visor' }, first, 2000);
    expect(edited.createdAt).toBe(1000);
    expect(edited.updatedAt).toBe(2000);
    window.localStorage.setItem(STORY_PROFILE_STORAGE_KEY, '{not json');
    expect(readStoryProfile()).toBeNull();
    expect(sanitizeStoryProfile({ version: 5, avatar: first.avatar })).toBeNull();
  });

  it('migrates V3 values into an unreviewed creator draft', () => {
    const legacy = {
      version: 3,
      avatarStyle: 'kore-chibi-action-v3',
      avatar: { name: 'LEGACY', lineage: 'sylvan', bodyPreset: 'compact', skinTone: '#e7b98e', hairStyle: 'bob', hairColor: '#9f49c8', outfitPalette: 'royal-violet', accessory: 'glasses' },
      createdAt: 100,
      updatedAt: 200
    };
    expect(migrateStoryProfileV3(legacy, undefined, 300)).toMatchObject({ reviewedAt: null, avatar: { name: 'LEGACY', avatarSet: 'street-shadow', bodyTone: 'light', outfit: 'royal-circuit' } });
    window.localStorage.setItem(LEGACY_STORY_PROFILE_STORAGE_KEY, JSON.stringify(legacy));
    expect(readStoryProfile()).toMatchObject({ reviewedAt: null, avatar: { name: 'LEGACY' } });
    expect(window.localStorage.getItem(STORY_PROFILE_STORAGE_KEY)).toBeNull();
  });
});

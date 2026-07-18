import { beforeEach, describe, expect, it } from 'vitest';
import { makeDefaultStoryAvatar, sanitizeStoryAvatar, sanitizeStoryName, STORY_ACCESSORIES, STORY_AVATAR_SETS, STORY_BODY_TONES, STORY_HAIR_STYLES, STORY_LEG_STYLES, STORY_OUTFITS } from './avatarCatalog';
import { createStoryAvatar, getEquippedStoryAvatarSlots, migrateStoryProfileV3, migrateStoryProfileV4, normalizeStoryAvatarRoster, readStoryProfile, removeStoryAvatar, sanitizeStoryProfile, setActiveStoryAvatar, setEquippedStoryAvatars, updateStoryAvatar, writeStoryProfile } from './profile';
import { LEGACY_STORY_PROFILE_STORAGE_KEY, PREVIOUS_STORY_PROFILE_STORAGE_KEY, STORY_PROFILE_STORAGE_KEY } from './types';

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

  it('writes and reads a reviewed V5 street avatar roster', () => {
    const saved = writeStoryProfile({ ...makeDefaultStoryAvatar(), name: 'ASTRA' }, null, 1000);
    expect(saved).toMatchObject({ version: 5, avatarStyle: 'kore-street-v1', createdAt: 1000, updatedAt: 1000, reviewedAt: 1000, activeAvatarId: 'avatar-1', equippedAvatarIds: ['avatar-1'], avatar: { name: 'ASTRA', avatarSet: 'street-shadow', bodyTone: 'tan', legStyle: 'fitted' } });
    expect(saved.avatars).toHaveLength(1);
    expect(readStoryProfile()).toEqual(saved);
  });

  it('preserves creation time on edits and rejects corrupt or unknown versions', () => {
    const first = writeStoryProfile(makeDefaultStoryAvatar('FIRST'), null, 1000);
    const edited = writeStoryProfile({ ...first.avatar, accessory: 'cyber-visor' }, first, 2000);
    expect(edited.createdAt).toBe(1000);
    expect(edited.updatedAt).toBe(2000);
    window.localStorage.setItem(STORY_PROFILE_STORAGE_KEY, '{not json');
    expect(readStoryProfile()).toBeNull();
    expect(sanitizeStoryProfile({ version: 6, avatar: first.avatar })).toBeNull();
  });

  it('migrates V4 into a one-member V5 roster', () => {
    const legacy = { version: 4, avatarStyle: 'kore-street-v1', avatar: makeDefaultStoryAvatar('V4 HERO'), createdAt: 100, updatedAt: 200, reviewedAt: 200 };
    expect(migrateStoryProfileV4(legacy, undefined, 300)).toMatchObject({ version: 5, activeAvatarId: 'avatar-1', equippedAvatarIds: ['avatar-1'], avatar: { name: 'V4 HERO' } });
    window.localStorage.setItem(LEGACY_STORY_PROFILE_STORAGE_KEY, JSON.stringify(legacy));
    expect(readStoryProfile()).toMatchObject({ version: 5, avatar: { name: 'V4 HERO' } });
    expect(window.localStorage.getItem(STORY_PROFILE_STORAGE_KEY)).toContain('"version":5');
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
    window.localStorage.setItem(PREVIOUS_STORY_PROFILE_STORAGE_KEY, JSON.stringify(legacy));
    expect(readStoryProfile()).toMatchObject({ reviewedAt: null, avatar: { name: 'LEGACY' } });
    expect(window.localStorage.getItem(STORY_PROFILE_STORAGE_KEY)).toBeNull();
  });

  it('creates, edits, equips, activates, benches, and removes up to five avatars', () => {
    let profile = writeStoryProfile(makeDefaultStoryAvatar('ONE'), null, 1000);
    profile = createStoryAvatar(profile, makeDefaultStoryAvatar('TWO'), 2, 1100);
    expect(profile.avatars.map((slot) => slot.avatar.name)).toEqual(['ONE', 'TWO']);
    expect(createStoryAvatar(profile, makeDefaultStoryAvatar('BLOCKED'), 2, 1150)).toEqual(profile);
    profile = updateStoryAvatar(profile, 'avatar-2', { ...makeDefaultStoryAvatar('EDITED'), avatarSet: 'crimson-ranger' }, 1200);
    profile = setEquippedStoryAvatars(profile, ['avatar-2', 'avatar-1'], 2, 1250);
    expect(getEquippedStoryAvatarSlots(profile).map((slot) => slot.id)).toEqual(['avatar-2', 'avatar-1']);
    profile = setActiveStoryAvatar(profile, 'avatar-2', 1300);
    expect(profile.avatar).toMatchObject({ name: 'EDITED', avatarSet: 'crimson-ranger' });
    profile = normalizeStoryAvatarRoster(profile, 1);
    expect(profile.avatars).toHaveLength(2);
    expect(profile.equippedAvatarIds).toEqual(['avatar-2']);
    expect(profile.activeAvatarId).toBe('avatar-2');
    profile = setEquippedStoryAvatars(profile, ['avatar-2'], 1, 1400);
    expect(profile.activeAvatarId).toBe('avatar-2');
    profile = removeStoryAvatar(profile, 'avatar-1', 1500);
    expect(profile.avatars.map((slot) => slot.id)).toEqual(['avatar-2']);
    expect(removeStoryAvatar(profile, 'avatar-2', 1600)).toEqual(profile);
  });
});

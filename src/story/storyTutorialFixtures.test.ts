import { beforeEach, describe, expect, it } from 'vitest';
import { STORY_ADVENTURE_PROGRESS_KEY, readAdventureProgress } from './adventureProgress';
import { readStoryProfile } from './profile';
import { applyStoryTutorialFixture, isStoryTutorialFixtureId } from './storyTutorialFixtures';

describe('finite Story tutorial fixtures', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('rejects arbitrary fixture strings', () => {
    expect(isStoryTutorialFixtureId('unlocking-roll')).toBe(true);
    expect(isStoryTutorialFixtureId('greenhollow-showcase:mastery')).toBe(true);
    expect(isStoryTutorialFixtureId('greenhollow-showcase:javascript')).toBe(false);
    expect(isStoryTutorialFixtureId('eval:alert(1)')).toBe(false);
  });

  it('seeds the roll threshold and deterministic roll showcase', () => {
    const result = applyStoryTutorialFixture('unlocking-roll');
    expect(result.screen).toBe('storyHub');
    expect(readAdventureProgress().stats.agility).toBe(10);
    expect(new URL(window.location.href).searchParams.get('storyRollShowcase')).toBe('1');
  });

  it('seeds recipe, equipment, party, biome, and Endless states', () => {
    applyStoryTutorialFixture('crafting-stations-and-recipes');
    expect(readAdventureProgress().knownRecipes.length).toBeGreaterThan(10);

    applyStoryTutorialFixture('armor-and-set-bonuses');
    expect(Object.values(readAdventureProgress().equippedArmor).every(Boolean)).toBe(true);

    const party = applyStoryTutorialFixture('online-adventure-parties');
    expect(party.profile?.avatars).toHaveLength(4);
    expect(readStoryProfile()?.equippedAvatarIds).toHaveLength(4);

    applyStoryTutorialFixture('skyglass-showcase:field-b');
    let url = new URL(window.location.href);
    expect(url.searchParams.get('storyWorld')).toBe('skyglass');
    expect(url.searchParams.get('storyLevel')).toBe('skyglass-field-b');

    applyStoryTutorialFixture('endless-boons');
    url = new URL(window.location.href);
    expect(url.searchParams.get('storyFloor')).toBe('4');
    expect(url.searchParams.get('storyEndlessSeed')).toBe('tutorial-endless-boons');
    expect(window.localStorage.getItem(STORY_ADVENTURE_PROGRESS_KEY)).toContain('endlessUnlockedBiomes');
  });
});

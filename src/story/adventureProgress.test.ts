import { beforeEach, describe, expect, it } from 'vitest';
import {
  STORY_ADVENTURE_PROGRESS_KEY,
  allocateAdventureStat,
  awardMountMastery,
  awardAdventureExperience,
  beginAdventureVisit,
  canRespecAdventureStats,
  discoverAdventureLandmark,
  discoverAdventureVista,
  experienceToNextLevel,
  getAdventureDerivedStats,
  makeDefaultAdventureProgress,
  readAdventureProgress,
  respecAdventureStats,
  sanitizeAdventureProgress,
  unlockAdventureMount,
  writeAdventureProgress
} from './adventureProgress';

describe('story adventure progression', () => {
  beforeEach(() => window.localStorage.clear());

  it('recovers malformed progress and constrains points to earned levels', () => {
    expect(sanitizeAdventureProgress(null)).toEqual(makeDefaultAdventureProgress());
    const sanitized = sanitizeAdventureProgress({
      level: 3,
      xp: 99999,
      stats: { power: 25, vitality: 25, critical: -8 },
      lifetimeDefeats: -4
    });
    expect(sanitized.level).toBe(3);
    expect(sanitized.stats.power).toBe(2);
    expect(sanitized.stats.vitality).toBe(0);
    expect(sanitized.unspentPoints).toBe(0);
    expect(sanitized.xp).toBeLessThan(experienceToNextLevel(3));
    expect(sanitized.lifetimeDefeats).toBe(0);
    expect(sanitized.version).toBe(2);
    expect(sanitized.discoveries.biomes).toEqual([]);
  });

  it('migrates V1 fields and persists discovery and mount mastery', () => {
    const migrated = sanitizeAdventureProgress({ version: 1, level: 8, xp: 12, stats: { power: 3 }, lifetimeDefeats: 4 });
    expect(migrated).toMatchObject({ version: 2, level: 8, xp: 12, lifetimeDefeats: 4 });
    const visiting = beginAdventureVisit(migrated, 'greenhollow');
    expect(visiting.discoveries.biomes).toContain('greenhollow');
    expect(visiting.visitCounters.greenhollow).toBe(1);
    const learned = discoverAdventureVista(discoverAdventureLandmark(visiting, 'greenhollow', 'green-square'), 'green-roofs');
    expect(learned.discoveries.landmarks.greenhollow).toEqual(['green-square']);
    expect(learned.discoveries.vistas).toEqual(['green-roofs']);
    const unlocked = unlockAdventureMount(visiting, 'verdant-stag');
    expect(unlocked.mounts['verdant-stag']?.unlocked).toBe(true);
    const ranked = awardMountMastery(unlocked, 'verdant-stag', 20_000);
    expect(ranked.mounts['verdant-stag']?.masteryRank).toBe(10);
    expect(ranked.mounts['verdant-stag']?.variants).toEqual([4, 7, 10]);
  });

  it('levels to 100, awards one point per level, and applies insight XP', () => {
    const levelTwo = awardAdventureExperience(makeDefaultAdventureProgress(), 100);
    expect(levelTwo.progress).toMatchObject({ level: 2, xp: 0, unspentPoints: 1, lifetimeDefeats: 1 });
    const insightful = sanitizeAdventureProgress({ ...levelTwo.progress, level: 26, stats: { ...levelTwo.progress.stats, insight: 25 } });
    expect(awardAdventureExperience(insightful, 100).xpAwarded).toBe(150);
    const capped = awardAdventureExperience(sanitizeAdventureProgress({ level: 99, xp: 0 }), 100000);
    expect(capped.progress.level).toBe(100);
    expect(capped.progress.xp).toBe(0);
  });

  it('allocates, derives, respecs, and persists all six stats', () => {
    let progress = sanitizeAdventureProgress({ level: 7 });
    progress = allocateAdventureStat(progress, 'power');
    progress = allocateAdventureStat(progress, 'vitality');
    progress = allocateAdventureStat(progress, 'agility');
    progress = allocateAdventureStat(progress, 'guard');
    progress = allocateAdventureStat(progress, 'critical');
    progress = allocateAdventureStat(progress, 'insight');
    expect(progress.unspentPoints).toBe(0);
    expect(getAdventureDerivedStats(progress)).toMatchObject({
      maxHealth: 111,
      criticalChance: 0.01,
      criticalMultiplier: 1.5,
      xpMultiplier: 1.02
    });
    const reset = respecAdventureStats(progress);
    expect(reset.unspentPoints).toBe(6);
    expect(Object.values(reset.stats).every((value) => value === 0)).toBe(true);
    writeAdventureProgress(progress);
    expect(readAdventureProgress()).toEqual(progress);
    expect(window.localStorage.getItem(STORY_ADVENTURE_PROGRESS_KEY)).toContain('"level":7');
    expect(canRespecAdventureStats('world-route', 'shrine')).toBe(true);
    expect(canRespecAdventureStats('world-route', 'adventure-gate')).toBe(false);
    expect(canRespecAdventureStats('emberdeep', 'shrine')).toBe(false);
  });
});

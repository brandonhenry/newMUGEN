import { beforeEach, describe, expect, it } from 'vitest';
import {
  STORY_ADVENTURE_PROGRESS_KEY,
  allocateAdventureStat,
  awardAdventureExperience,
  canRespecAdventureStats,
  experienceToNextLevel,
  getAdventureDerivedStats,
  makeDefaultAdventureProgress,
  readAdventureProgress,
  respecAdventureStats,
  sanitizeAdventureProgress,
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

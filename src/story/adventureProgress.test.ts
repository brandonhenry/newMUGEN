import { beforeEach, describe, expect, it } from 'vitest';
import {
  STORY_ADVENTURE_PROGRESS_KEY,
  STORY_ADVENTURE_PARTY_SIZE_CAP,
  STORY_ADVENTURE_COMBAT_STAT_KEYS,
  STORY_ROUTE_COIN_CAP,
  acknowledgeAdventurePartyFeatureReveal,
  allocateAdventureStat,
  applyAdventureEnemyDefeat,
  awardRouteCoins,
  awardMountMastery,
  awardAdventureExperience,
  bankAdventureRunLedger,
  beginAdventureEndlessRun,
  beginAdventureVisit,
  claimAdventureCache,
  claimAdventureDaily,
  canRespecAdventureStats,
  discoverAdventureLandmark,
  discoverAdventureVista,
  collectAdventureRelic,
  experienceToNextLevel,
  getAdventureDerivedStats,
  getAdventurePartySizeEligibility,
  makeDefaultAdventureProgress,
  readAdventureProgress,
  recordAdventureChallengerDefeat,
  restoreAdventureShortcut,
  respecAdventureStats,
  sanitizeAdventureProgress,
  unlockAdventureEndlessBiome,
  unlockAdventureMount,
  writeAdventureProgress
} from './adventureProgress';
import { emptyStoryRunLedger } from './adventureEndless';

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
    expect(sanitized.version).toBe(6);
    expect(sanitized.stats.partySize).toBe(1);
    expect(sanitized.discoveries.biomes).toEqual([]);
  });

  it('migrates V1 fields and persists discovery and mount mastery', () => {
    const migrated = sanitizeAdventureProgress({ version: 1, level: 8, xp: 12, stats: { power: 3 }, lifetimeDefeats: 4 });
    expect(migrated).toMatchObject({ version: 6, level: 8, xp: 12, lifetimeDefeats: 4, defeatedChallengerIds: [], partyFeatureRevealSeen: false, wildlifeSightings: [], collectedCurios: [] });
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

  it('migrates v4 endless unlocks and banks chapter rewards idempotently', () => {
    const migrated = sanitizeAdventureProgress({ version: 4, discoveredSurfaceMaps: ['greenhollow-mastery'], routeCoins: 10 });
    expect(migrated.version).toBe(6);
    expect(migrated.endlessUnlockedBiomes).toContain('greenhollow');
    const unlocked = unlockAdventureEndlessBiome(migrated, 'thornwood');
    const firstRun = beginAdventureEndlessRun(unlocked, 'thornwood');
    const secondRun = beginAdventureEndlessRun(firstRun.progress, 'thornwood');
    expect([firstRun.runSerial, secondRun.runSerial]).toEqual([1, 2]);
    const ledger = { ...emptyStoryRunLedger(), xp: 25, routeCoins: 40, materials: { fieldstone: 3 }, cacheIds: ['chapter-cache'] };
    const firstBank = bankAdventureRunLedger(secondRun.progress, 'thornwood', ledger, 'bank:thornwood:1', Date.UTC(2026, 6, 18));
    const repeated = bankAdventureRunLedger(firstBank.progress, 'thornwood', ledger, 'bank:thornwood:1', Date.UTC(2026, 6, 18));
    expect(firstBank.banked).toBe(true);
    expect(firstBank.dailyBonus).toBe(true);
    expect(repeated.banked).toBe(false);
    expect(repeated.progress.routeCoins).toBe(firstBank.progress.routeCoins);
    expect(firstBank.progress.inventory.materials.fieldstone).toBe(3);
    expect(firstBank.progress.endlessBossesDefeated).toBe(1);
  });

  it('caps coins and makes caches, relics, dailies, and restoration one-time', () => {
    let progress = awardRouteCoins(makeDefaultAdventureProgress(), STORY_ROUTE_COIN_CAP + 500);
    expect(progress.routeCoins).toBe(STORY_ROUTE_COIN_CAP);
    const cache = claimAdventureCache(progress, 'green-cache-1', 40);
    expect(cache.claimed).toBe(true);
    expect(claimAdventureCache(cache.progress, 'green-cache-1', 40).claimed).toBe(false);
    progress = collectAdventureRelic(cache.progress, 'green-relic-1');
    expect(collectAdventureRelic(progress, 'green-relic-1').relics).toHaveLength(1);
    const restored = restoreAdventureShortcut(progress, 'green-shortcut');
    expect(restored.restored).toBe(true);
    expect(restored.progress.routeCoins).toBe(STORY_ROUTE_COIN_CAP - 100);
    const daily = claimAdventureDaily(restored.progress, '2026-07-18', 'green-hunt', 60);
    expect(daily.claimed).toBe(true);
    expect(claimAdventureDaily(daily.progress, '2026-07-18', 'green-hunt', 60).claimed).toBe(false);
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
    expect(STORY_ADVENTURE_COMBAT_STAT_KEYS.every((stat) => reset.stats[stat] === 0)).toBe(true);
    expect(reset.stats.partySize).toBe(1);
    writeAdventureProgress(progress);
    expect(readAdventureProgress()).toEqual(progress);
    expect(window.localStorage.getItem(STORY_ADVENTURE_PROGRESS_KEY)).toContain('"level":7');
    expect(canRespecAdventureStats('world-route', 'shrine')).toBe(true);
    expect(canRespecAdventureStats('world-route', 'adventure-gate')).toBe(false);
    expect(canRespecAdventureStats('emberdeep', 'shrine')).toBe(false);
  });

  it('unlocks Party Size from unique challenger and level milestones', () => {
    let progress = sanitizeAdventureProgress({ level: 2, stats: {} });
    expect(getAdventurePartySizeEligibility(progress.level, 0).maxEligibleSize).toBe(1);
    const first = recordAdventureChallengerDefeat(progress, 'silver-duelist');
    expect(first.unique).toBe(true);
    expect(first.progress.partyFeatureRevealSeen).toBe(false);
    progress = allocateAdventureStat(first.progress, 'partySize');
    expect(progress.stats.partySize).toBe(2);
    expect(progress.unspentPoints).toBe(0);
    expect(allocateAdventureStat(progress, 'partySize').stats.partySize).toBe(2);

    const repeat = recordAdventureChallengerDefeat(progress, 'silver-duelist');
    expect(repeat.unique).toBe(false);
    expect(repeat.progress.defeatedChallengerIds).toEqual(['silver-duelist']);
    const revealed = acknowledgeAdventurePartyFeatureReveal(repeat.progress);
    expect(revealed.partyFeatureRevealSeen).toBe(true);
  });

  it('applies structured challenger rewards once, with XP and unique credit in one ordered result', () => {
    const seen = new Set<string>();
    const event = { eventId: 'visit:spawn-1:challenger', spawnId: 'spawn-1', enemyId: 'silver-duelist' as const, tier: 'challenger' as const, xp: 100 };
    const first = applyAdventureEnemyDefeat(makeDefaultAdventureProgress(), event, seen);
    expect(first).toMatchObject({ duplicate: false, uniqueChallenger: true, levelsGained: 1, xpAwarded: 100 });
    expect(first.progress).toMatchObject({ level: 2, lifetimeDefeats: 1, defeatedChallengerIds: ['silver-duelist'] });
    const duplicate = applyAdventureEnemyDefeat(first.progress, event, seen);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.progress).toEqual(first.progress);
  });

  it('gates every Party Size tier, spends points, and refunds on respec', () => {
    const defeatedChallengerIds = ['silver-duelist', 'crescent-rogue', 'chimera-android', 'hollow-bride', 'ember-fist', 'laughing-oni', 'dusk-ronin', 'crimson-countess', 'harvest-warden', 'millstorm-sage'];
    let progress = sanitizeAdventureProgress({ level: 30, defeatedChallengerIds, stats: {} });
    expect(getAdventurePartySizeEligibility(30, 1).maxEligibleSize).toBe(2);
    expect(getAdventurePartySizeEligibility(10, 3).maxEligibleSize).toBe(3);
    expect(getAdventurePartySizeEligibility(20, 6).maxEligibleSize).toBe(4);
    expect(getAdventurePartySizeEligibility(30, 10).maxEligibleSize).toBe(5);
    for (let index = 1; index < STORY_ADVENTURE_PARTY_SIZE_CAP; index += 1) progress = allocateAdventureStat(progress, 'partySize');
    expect(progress.stats.partySize).toBe(5);
    const reset = respecAdventureStats(progress);
    expect(reset.stats.partySize).toBe(1);
    expect(reset.unspentPoints).toBe(29);
  });
});

import { STORY_MOUNTS } from './adventureExploration';
import { STORY_ROSTER_CHALLENGER_IDS } from './enemyRosterIds';
import type { StoryAdventureWorldId, StoryEnemyDefeatEvent, StoryEnemyId, StoryMountId, StoryResourceNodeDefinition, StoryRunRewardLedger } from './types';
import { STORY_RECIPE_BY_ID, STORY_RECIPES, STORY_RESOURCE_BY_ID, STORY_STARTER_RECIPE_IDS, advancedRecipesLearned, canCraftRecipe, recipeLearnedFromMastery, recipeLearnedFromRareResource, recipesLearnedFromSpecialist, type StoryActiveEffect, type StoryAdventureInventory, type StoryArmorSlot, type StoryBiomeId, type StoryCraftingContext } from './adventureCrafting';

export const STORY_ADVENTURE_PROGRESS_VERSION = 6 as const;
export const STORY_ADVENTURE_PROGRESS_KEY = 'kore.story.adventure.v6';
export const PREVIOUS_STORY_ADVENTURE_PROGRESS_KEY = 'kore.story.adventure.v5';
export const LEGACY_STORY_ADVENTURE_PROGRESS_KEY = 'kore.story.adventure.v4';
export const ORIGINAL_STORY_ADVENTURE_PROGRESS_KEY = 'kore.story.adventure.v3';
export const FIRST_STORY_ADVENTURE_PROGRESS_KEY = 'kore.story.adventure.v2';
export const EARLIEST_STORY_ADVENTURE_PROGRESS_KEY = 'kore.story.adventure.v1';
export const STORY_ADVENTURE_MAX_LEVEL = 100;
export const STORY_ADVENTURE_STAT_CAP = 25;
export const STORY_ADVENTURE_PARTY_SIZE_CAP = 5;
export const STORY_ROUTE_COIN_CAP = 99_999;

export const STORY_ADVENTURE_COMBAT_STAT_KEYS = ['power', 'vitality', 'agility', 'guard', 'critical', 'insight'] as const;
export const STORY_ADVENTURE_STAT_KEYS = [...STORY_ADVENTURE_COMBAT_STAT_KEYS, 'partySize'] as const;
export type StoryAdventureStatKey = typeof STORY_ADVENTURE_STAT_KEYS[number];
export type StoryAdventureCombatStatKey = typeof STORY_ADVENTURE_COMBAT_STAT_KEYS[number];
export type StoryAdventureStats = Record<StoryAdventureCombatStatKey, number> & { partySize: number };

export const STORY_PARTY_SIZE_MILESTONES = [
  { size: 2, challengerCount: 1, level: 2 },
  { size: 3, challengerCount: 3, level: 10 },
  { size: 4, challengerCount: 6, level: 20 },
  { size: 5, challengerCount: 10, level: 30 }
] as const;

export type LegacyStoryAdventureProgressV1 = {
  version: 1;
  level: number;
  xp: number;
  unspentPoints: number;
  stats: StoryAdventureStats;
  lifetimeDefeats: number;
};

export type StoryMountProgress = {
  unlocked: boolean;
  masteryRank: number;
  masteryXp: number;
  variants: number[];
};

export type StoryAdventureProgressV2 = {
  version: 2;
  level: number;
  xp: number;
  unspentPoints: number;
  stats: StoryAdventureStats;
  lifetimeDefeats: number;
  discoveries: {
    biomes: Exclude<StoryAdventureWorldId, 'world-route'>[];
    landmarks: Partial<Record<Exclude<StoryAdventureWorldId, 'world-route'>, string[]>>;
    waystones: string[];
    vistas: string[];
    sanctuaries: string[];
  };
  mounts: Partial<Record<StoryMountId, StoryMountProgress>>;
  visitCounters: Partial<Record<Exclude<StoryAdventureWorldId, 'world-route'>, number>>;
};

export type StoryAdventureProgressV3 = Omit<StoryAdventureProgressV2, 'version'> & {
  version: 3;
  routeCoins: number;
  relics: string[];
  claimedCaches: string[];
  claimedObjectives: string[];
  dailyClaims: Record<string, string[]>;
  pinnedDaily?: { date: string; worldId: Exclude<StoryAdventureWorldId, 'world-route'>; activityId: string };
  restoredShortcuts: string[];
  upgradedWaystones: string[];
  discoveredSurfaceMaps: string[];
  depthGenerationVersion: number;
};

export type StoryAdventureProgressV4 = Omit<StoryAdventureProgressV3, 'version' | 'stats'> & {
  version: 4;
  stats: StoryAdventureStats;
  defeatedChallengerIds: StoryEnemyId[];
  partyFeatureRevealSeen: boolean;
  inventory: StoryAdventureInventory;
  knownRecipes: string[];
  utilityUnlocks: string[];
  equippedArmor: Record<StoryArmorSlot, string | null>;
  activeEffects: StoryActiveEffect[];
  harvestState: Record<string, { visit?: number; readyAt?: number; day?: string }>;
  discoveredMaterials: string[];
};

export type StoryAdventureProgressV5 = Omit<StoryAdventureProgressV4, 'version'> & {
  version: 5;
  endlessUnlockedBiomes: Exclude<StoryAdventureWorldId, 'world-route'>[];
  bestDepthByBiome: Partial<Record<Exclude<StoryAdventureWorldId, 'world-route'>, number>>;
  endlessRunCounters: Partial<Record<Exclude<StoryAdventureWorldId, 'world-route'>, number>>;
  endlessBossesDefeated: number;
};

export type StoryAdventureProgressV6 = Omit<StoryAdventureProgressV5, 'version'> & {
  version: typeof STORY_ADVENTURE_PROGRESS_VERSION;
  wildlifeSightings: string[];
  collectedCurios: string[];
};

/** @deprecated Kept as a source-compatible alias while callers migrate to V2. */
export type StoryAdventureProgressV1 = StoryAdventureProgressV6;

export type StoryAdventureDerivedStats = {
  effectiveAgility: number;
  rollUnlocked: boolean;
  maxHealth: number;
  attackDamage: number;
  walkSpeed: number;
  sprintSpeed: number;
  jumpMultiplier: number;
  damageTakenMultiplier: number;
  knockbackMultiplier: number;
  criticalChance: number;
  criticalMultiplier: number;
  xpMultiplier: number;
  gatherMultiplier: number;
  plantYieldBonus: number;
  woodYieldBonus: number;
  oreYieldBonus: number;
  lavaDamageMultiplier: number;
  icicleDamageMultiplier: number;
  sandSlowMultiplier: number;
  windPushMultiplier: number;
  breathMultiplier: number;
};

const EMPTY_STATS: StoryAdventureStats = {
  power: 0,
  vitality: 0,
  agility: 0,
  guard: 0,
  critical: 0,
  insight: 0,
  partySize: 1
};

function finiteInteger(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function experienceToNextLevel(level: number) {
  const safeLevel = clamp(finiteInteger(level, 1), 1, STORY_ADVENTURE_MAX_LEVEL);
  return safeLevel >= STORY_ADVENTURE_MAX_LEVEL ? 0 : 100 + 10 * (safeLevel - 1);
}

export function makeDefaultAdventureProgress(): StoryAdventureProgressV1 {
  return {
    version: STORY_ADVENTURE_PROGRESS_VERSION,
    level: 1,
    xp: 0,
    unspentPoints: 0,
    stats: { ...EMPTY_STATS },
    lifetimeDefeats: 0,
    discoveries: { biomes: [], landmarks: {}, waystones: [], vistas: [], sanctuaries: [] },
    mounts: {},
    visitCounters: {},
    routeCoins: 0,
    relics: [],
    claimedCaches: [],
    claimedObjectives: [],
    dailyClaims: {},
    restoredShortcuts: [],
    upgradedWaystones: [],
    discoveredSurfaceMaps: [],
    depthGenerationVersion: 3,
    defeatedChallengerIds: [],
    partyFeatureRevealSeen: false,
    inventory: { materials: {}, consumables: {}, armor: [] },
    knownRecipes: [...STORY_STARTER_RECIPE_IDS],
    utilityUnlocks: [],
    equippedArmor: { head: null, coat: null, boots: null },
    activeEffects: [],
    harvestState: {},
    discoveredMaterials: [],
    endlessUnlockedBiomes: [],
    bestDepthByBiome: {},
    endlessRunCounters: {},
    endlessBossesDefeated: 0,
    wildlifeSightings: [],
    collectedCurios: []
  };
}

export function getAdventurePartySizeEligibility(level: number, challengerCount: number) {
  const safeLevel = clamp(finiteInteger(level, 1), 1, STORY_ADVENTURE_MAX_LEVEL);
  const safeCount = Math.max(0, finiteInteger(challengerCount));
  const eligible = STORY_PARTY_SIZE_MILESTONES.filter((milestone) => safeLevel >= milestone.level && safeCount >= milestone.challengerCount);
  const maxEligibleSize = eligible.length > 0 ? eligible[eligible.length - 1].size : 1;
  return {
    maxEligibleSize,
    next: STORY_PARTY_SIZE_MILESTONES.find((milestone) => milestone.size > maxEligibleSize) ?? null
  };
}

export function getAdventurePartySizeProgress(progress: Pick<StoryAdventureProgressV1, 'level' | 'stats' | 'defeatedChallengerIds'>) {
  return {
    currentSize: progress.stats.partySize,
    ...getAdventurePartySizeEligibility(progress.level, progress.defeatedChallengerIds.length)
  };
}

export function sanitizeAdventureProgress(value: unknown): StoryAdventureProgressV1 {
  if (!value || typeof value !== 'object') return makeDefaultAdventureProgress();
  const record = value as Partial<StoryAdventureProgressV6>;
  const level = clamp(finiteInteger(record.level, 1), 1, STORY_ADVENTURE_MAX_LEVEL);
  const rawStats = record.stats && typeof record.stats === 'object' ? record.stats as Partial<StoryAdventureStats> : {};
  const uniqueStrings = (input: unknown, limit = 256) => Array.from(new Set(Array.isArray(input) ? input.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0).slice(0, limit) : []));
  const defeatedChallengerIds = uniqueStrings(record.defeatedChallengerIds, 64).filter((id): id is StoryEnemyId => STORY_ROSTER_CHALLENGER_IDS.includes(id as StoryEnemyId));
  const stats = STORY_ADVENTURE_COMBAT_STAT_KEYS.reduce((result, key) => {
    result[key] = clamp(finiteInteger(rawStats[key]), 0, STORY_ADVENTURE_STAT_CAP);
    return result;
  }, { ...EMPTY_STATS });

  let pointsRemaining = level - 1;
  for (const key of STORY_ADVENTURE_COMBAT_STAT_KEYS) {
    const accepted = Math.min(stats[key], pointsRemaining);
    stats[key] = accepted;
    pointsRemaining -= accepted;
  }
  const maxEligiblePartySize = getAdventurePartySizeEligibility(level, defeatedChallengerIds.length).maxEligibleSize;
  const requestedPartySize = clamp(finiteInteger(rawStats.partySize, 1), 1, maxEligiblePartySize);
  const acceptedPartyPoints = Math.min(requestedPartySize - 1, pointsRemaining);
  stats.partySize = 1 + acceptedPartyPoints;
  pointsRemaining -= acceptedPartyPoints;

  const required = experienceToNextLevel(level);
  const validBiomes = Object.values(STORY_MOUNTS).map((mount) => mount.worldId);
  const rawDiscoveries = record.discoveries && typeof record.discoveries === 'object' ? record.discoveries as StoryAdventureProgressV2['discoveries'] : makeDefaultAdventureProgress().discoveries;
  const biomes = uniqueStrings(rawDiscoveries.biomes).filter((id): id is Exclude<StoryAdventureWorldId, 'world-route'> => validBiomes.includes(id as Exclude<StoryAdventureWorldId, 'world-route'>));
  const landmarks = Object.fromEntries(validBiomes.flatMap((id) => {
    const items = uniqueStrings(rawDiscoveries.landmarks?.[id]);
    return items.length > 0 ? [[id, items]] : [];
  })) as StoryAdventureProgressV2['discoveries']['landmarks'];
  const rawMounts = record.mounts && typeof record.mounts === 'object' ? record.mounts : {};
  const mounts = Object.fromEntries(Object.keys(STORY_MOUNTS).flatMap((id) => {
    const mountId = id as StoryMountId;
    const candidate = rawMounts[mountId];
    if (!candidate || typeof candidate !== 'object') return [];
    const masteryRank = clamp(finiteInteger(candidate.masteryRank, 1), 1, 10);
    const variants = Array.from(new Set(Array.isArray(candidate.variants) ? candidate.variants.map(Number).filter((variant) => [4, 7, 10].includes(variant)) : []));
    return [[mountId, { unlocked: Boolean(candidate.unlocked), masteryRank, masteryXp: Math.max(0, finiteInteger(candidate.masteryXp)), variants }]];
  })) as StoryAdventureProgressV2['mounts'];
  const visitCounters = Object.fromEntries(validBiomes.flatMap((id) => {
    const count = finiteInteger(record.visitCounters?.[id]);
    return count > 0 ? [[id, count]] : [];
  })) as StoryAdventureProgressV2['visitCounters'];
  const dailyClaims = Object.fromEntries(Object.entries(record.dailyClaims && typeof record.dailyClaims === 'object' ? record.dailyClaims : {}).flatMap(([date, claims]) => /^\d{4}-\d{2}-\d{2}$/.test(date) ? [[date, uniqueStrings(claims, 64)]] : []).slice(-14));
  const pinned = record.pinnedDaily && typeof record.pinnedDaily === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(record.pinnedDaily.date ?? '') && validBiomes.includes(record.pinnedDaily.worldId as Exclude<StoryAdventureWorldId, 'world-route'>) && typeof record.pinnedDaily.activityId === 'string'
    ? { date: record.pinnedDaily.date, worldId: record.pinnedDaily.worldId as Exclude<StoryAdventureWorldId, 'world-route'>, activityId: record.pinnedDaily.activityId.slice(0, 160) }
    : undefined;
  const rawInventory = record.inventory && typeof record.inventory === 'object' ? record.inventory : makeDefaultAdventureProgress().inventory;
  const materials = Object.fromEntries(Object.entries(rawInventory.materials ?? {}).flatMap(([id, quantity]) => STORY_RESOURCE_BY_ID[id] ? [[id, clamp(finiteInteger(quantity), 0, 999)]] : []).filter(([, quantity]) => Number(quantity) > 0));
  const consumables = Object.fromEntries(Object.entries(rawInventory.consumables ?? {}).flatMap(([id, quantity]) => STORY_RECIPE_BY_ID[id]?.kind === 'consumable' ? [[id, clamp(finiteInteger(quantity), 0, 99)]] : []).filter(([, quantity]) => Number(quantity) > 0));
  const armor = uniqueStrings(rawInventory.armor, 32).filter((id) => STORY_RECIPE_BY_ID[id]?.kind === 'armor');
  const inventory: StoryAdventureInventory = { materials, consumables, armor };
  const knownRecipes = Array.from(new Set([...STORY_STARTER_RECIPE_IDS, ...uniqueStrings(record.knownRecipes, 96).filter((id) => Boolean(STORY_RECIPE_BY_ID[id]))]));
  const utilityUnlocks = uniqueStrings(record.utilityUnlocks, 16).filter((id) => STORY_RECIPE_BY_ID[id]?.kind === 'utility');
  const equippedArmor = (['head', 'coat', 'boots'] as const).reduce((result, slot) => {
    const id = record.equippedArmor?.[slot];
    result[slot] = typeof id === 'string' && armor.includes(id) && STORY_RECIPE_BY_ID[id]?.armor?.slot === slot ? id : null;
    return result;
  }, { head: null, coat: null, boots: null } as Record<StoryArmorSlot, string | null>);
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const activeEffects = (Array.isArray(record.activeEffects) ? record.activeEffects : []).flatMap((effect) => {
    if (!effect || typeof effect !== 'object' || !STORY_RECIPE_BY_ID[effect.recipeId]?.consumable?.kind) return [];
    const expiresAt = Math.min(now + 86_400_000, Math.max(0, Number(effect.expiresAt)));
    if (expiresAt <= now) return [];
    return [{ recipeId: effect.recipeId, kind: STORY_RECIPE_BY_ID[effect.recipeId].consumable!.kind!, multiplier: Number.isFinite(effect.multiplier) ? clamp(Number(effect.multiplier), 0, 4) : 1, expiresAt }];
  }).slice(-12);
  const harvestState = Object.fromEntries(Object.entries(record.harvestState && typeof record.harvestState === 'object' ? record.harvestState : {}).slice(-1024).flatMap(([id, state]) => {
    if (!state || typeof state !== 'object' || !id) return [];
    const visit = finiteInteger(state.visit);
    const readyAt = Number(state.readyAt);
    const day = typeof state.day === 'string' && state.day === today ? state.day : undefined;
    if (Number.isFinite(readyAt) && readyAt <= now && !visit && !day) return [];
    const clean = { ...(visit > 0 ? { visit } : {}), ...(Number.isFinite(readyAt) && readyAt > now ? { readyAt: Math.min(readyAt, now + 86_400_000) } : {}), ...(day ? { day } : {}) };
    return Object.keys(clean).length > 0 ? [[id.slice(0, 180), clean]] : [];
  }));
  const discoveredMaterials = uniqueStrings(record.discoveredMaterials, 64).filter((id) => Boolean(STORY_RESOURCE_BY_ID[id]));
  const grandfatheredEndless = validBiomes.filter((id) => record.discoveredSurfaceMaps?.includes(`${id}-mastery`) || Object.values(STORY_MOUNTS).some((mount) => mount.worldId === id && record.mounts?.[mount.id]?.unlocked));
  const endlessUnlockedBiomes = Array.from(new Set([...grandfatheredEndless, ...uniqueStrings(record.endlessUnlockedBiomes, 16)])).filter((id): id is Exclude<StoryAdventureWorldId, 'world-route'> => validBiomes.includes(id as Exclude<StoryAdventureWorldId, 'world-route'>));
  const bestDepthByBiome = Object.fromEntries(validBiomes.flatMap((id) => {
    const depth = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, finiteInteger(record.bestDepthByBiome?.[id])));
    return depth > 0 ? [[id, depth]] : [];
  }));
  const endlessRunCounters = Object.fromEntries(validBiomes.flatMap((id) => {
    const count = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, finiteInteger(record.endlessRunCounters?.[id])));
    return count > 0 ? [[id, count]] : [];
  }));
  return {
    version: STORY_ADVENTURE_PROGRESS_VERSION,
    level,
    xp: required > 0 ? clamp(finiteInteger(record.xp), 0, required - 1) : 0,
    unspentPoints: pointsRemaining,
    stats,
    lifetimeDefeats: Math.max(0, finiteInteger(record.lifetimeDefeats)),
    discoveries: {
      biomes,
      landmarks,
      waystones: uniqueStrings(rawDiscoveries.waystones),
      vistas: uniqueStrings(rawDiscoveries.vistas),
      sanctuaries: uniqueStrings(rawDiscoveries.sanctuaries)
    },
    mounts,
    visitCounters,
    routeCoins: clamp(finiteInteger(record.routeCoins), 0, STORY_ROUTE_COIN_CAP),
    relics: uniqueStrings(record.relics, 24),
    claimedCaches: uniqueStrings(record.claimedCaches, 256),
    claimedObjectives: uniqueStrings(record.claimedObjectives, 256),
    dailyClaims,
    ...(pinned ? { pinnedDaily: pinned } : {}),
    restoredShortcuts: uniqueStrings(record.restoredShortcuts, 16),
    upgradedWaystones: uniqueStrings(record.upgradedWaystones, 64),
    discoveredSurfaceMaps: uniqueStrings(record.discoveredSurfaceMaps, 64),
    depthGenerationVersion: Math.max(3, finiteInteger(record.depthGenerationVersion, 3)),
    defeatedChallengerIds,
    partyFeatureRevealSeen: Boolean(record.partyFeatureRevealSeen),
    inventory,
    knownRecipes,
    utilityUnlocks,
    equippedArmor,
    activeEffects,
    harvestState,
    discoveredMaterials,
    endlessUnlockedBiomes,
    bestDepthByBiome,
    endlessRunCounters,
    endlessBossesDefeated: Math.max(0, finiteInteger(record.endlessBossesDefeated)),
    wildlifeSightings: uniqueStrings(record.wildlifeSightings, 256),
    collectedCurios: uniqueStrings(record.collectedCurios, 64)
  };
}

export function readAdventureProgress(): StoryAdventureProgressV1 {
  if (typeof window === 'undefined') return makeDefaultAdventureProgress();
  try {
    const current = window.localStorage.getItem(STORY_ADVENTURE_PROGRESS_KEY);
    const legacy = window.localStorage.getItem(PREVIOUS_STORY_ADVENTURE_PROGRESS_KEY) ?? window.localStorage.getItem(LEGACY_STORY_ADVENTURE_PROGRESS_KEY) ?? window.localStorage.getItem(ORIGINAL_STORY_ADVENTURE_PROGRESS_KEY) ?? window.localStorage.getItem(FIRST_STORY_ADVENTURE_PROGRESS_KEY) ?? window.localStorage.getItem(EARLIEST_STORY_ADVENTURE_PROGRESS_KEY);
    const sanitized = sanitizeAdventureProgress(JSON.parse(current ?? legacy ?? 'null'));
    if (!current && legacy) window.localStorage.setItem(STORY_ADVENTURE_PROGRESS_KEY, JSON.stringify(sanitized));
    return sanitized;
  } catch {
    return makeDefaultAdventureProgress();
  }
}

export function writeAdventureProgress(progress: StoryAdventureProgressV1) {
  const sanitized = sanitizeAdventureProgress(progress);
  if (typeof window !== 'undefined') window.localStorage.setItem(STORY_ADVENTURE_PROGRESS_KEY, JSON.stringify(sanitized));
  return sanitized;
}

export function allocateAdventureStat(progress: StoryAdventureProgressV1, stat: StoryAdventureStatKey) {
  const current = sanitizeAdventureProgress(progress);
  if (current.unspentPoints <= 0) return current;
  if (stat === 'partySize') {
    const maxEligibleSize = getAdventurePartySizeProgress(current).maxEligibleSize;
    if (current.stats.partySize >= maxEligibleSize || current.stats.partySize >= STORY_ADVENTURE_PARTY_SIZE_CAP) return current;
  } else if (current.stats[stat] >= STORY_ADVENTURE_STAT_CAP) return current;
  return sanitizeAdventureProgress({
    ...current,
    stats: { ...current.stats, [stat]: current.stats[stat] + 1 }
  });
}

export function respecAdventureStats(progress: StoryAdventureProgressV1) {
  const current = sanitizeAdventureProgress(progress);
  return sanitizeAdventureProgress({ ...current, stats: { ...EMPTY_STATS } });
}

export function recordAdventureChallengerDefeat(progress: StoryAdventureProgressV1, enemyId: StoryEnemyId) {
  const current = sanitizeAdventureProgress(progress);
  if (!STORY_ROSTER_CHALLENGER_IDS.includes(enemyId) || current.defeatedChallengerIds.includes(enemyId)) return { progress: current, unique: false };
  return {
    progress: sanitizeAdventureProgress({ ...current, defeatedChallengerIds: [...current.defeatedChallengerIds, enemyId] }),
    unique: true
  };
}

export function acknowledgeAdventurePartyFeatureReveal(progress: StoryAdventureProgressV1) {
  const current = sanitizeAdventureProgress(progress);
  return current.defeatedChallengerIds.length > 0
    ? sanitizeAdventureProgress({ ...current, partyFeatureRevealSeen: true })
    : current;
}

export function applyAdventureEnemyDefeat(progress: StoryAdventureProgressV1, event: StoryEnemyDefeatEvent, seenEventIds: Set<string>) {
  const current = sanitizeAdventureProgress(progress);
  if (seenEventIds.has(event.eventId)) return { progress: current, duplicate: true, uniqueChallenger: false, levelsGained: 0, xpAwarded: 0 };
  seenEventIds.add(event.eventId);
  const experience = awardAdventureExperience(current, event.xp);
  const challenger = event.tier === 'challenger'
    ? recordAdventureChallengerDefeat(experience.progress, event.enemyId)
    : { progress: experience.progress, unique: false };
  return { progress: challenger.progress, duplicate: false, uniqueChallenger: challenger.unique, levelsGained: experience.levelsGained, xpAwarded: experience.xpAwarded };
}

export function canRespecAdventureStats(worldId: string, nearbyPortalKind?: string) {
  return worldId === 'world-route' && nearbyPortalKind === 'shrine';
}

export function awardAdventureExperience(progress: StoryAdventureProgressV1, baseXp: number) {
  const current = sanitizeAdventureProgress(progress);
  if (current.level >= STORY_ADVENTURE_MAX_LEVEL) return { progress: current, levelsGained: 0, xpAwarded: 0 };
  const xpAwarded = Math.max(0, Math.round(baseXp * getAdventureDerivedStats(current).xpMultiplier));
  let level = current.level;
  let xp = current.xp + xpAwarded;
  let levelsGained = 0;
  while (level < STORY_ADVENTURE_MAX_LEVEL) {
    const required = experienceToNextLevel(level);
    if (xp < required) break;
    xp -= required;
    level += 1;
    levelsGained += 1;
  }
  if (level >= STORY_ADVENTURE_MAX_LEVEL) xp = 0;
  const next = sanitizeAdventureProgress({
    ...current,
    level,
    xp,
    lifetimeDefeats: current.lifetimeDefeats + 1
  });
  return { progress: next, levelsGained, xpAwarded };
}

export function getAdventureDerivedStats(progress: StoryAdventureProgressV1, now = Date.now()): StoryAdventureDerivedStats {
  const current = sanitizeAdventureProgress(progress);
  const { level } = current;
  const armorRecipes = Object.values(current.equippedArmor).flatMap((id) => id && STORY_RECIPE_BY_ID[id]?.armor ? [STORY_RECIPE_BY_ID[id]] : []);
  const armorStats = armorRecipes.reduce((result, recipe) => ({ ...result, [recipe.armor!.stat]: result[recipe.armor!.stat] + 1 }), { power: 0, vitality: 0, agility: 0, guard: 0, critical: 0, insight: 0 } as Record<StoryAdventureCombatStatKey, number>);
  const stats = STORY_ADVENTURE_COMBAT_STAT_KEYS.reduce((result, key) => ({ ...result, [key]: current.stats[key] + armorStats[key] }), { ...current.stats });
  const fullSet = armorRecipes.length === 3 && armorRecipes.every((recipe) => recipe.armor?.setId === armorRecipes[0].armor?.setId) ? armorRecipes[0].armor!.setId : null;
  const effects = current.activeEffects.filter((effect) => effect.expiresAt > now);
  const effect = (kind: StoryActiveEffect['kind'], fallback = 1) => {
    const matches = effects.filter((candidate) => candidate.kind === kind);
    return matches[matches.length - 1]?.multiplier ?? fallback;
  };
  const levelOffset = level - 1;
  const speedMultiplier = (1 + stats.agility * 0.01) * effect('speed');
  const tempered = effects.some((candidate) => candidate.recipeId === 'tempered-elixir');
  const rimeguard = effects.some((candidate) => candidate.recipeId === 'rimeguard');
  const pathfinder = effects.some((candidate) => candidate.recipeId === 'pathfinder-elixir');
  return {
    effectiveAgility: stats.agility,
    rollUnlocked: stats.agility >= 10,
    maxHealth: 100 + levelOffset + stats.vitality * 5,
    attackDamage: 20 * (1 + levelOffset * 0.02) * (1 + stats.power * 0.02) * effect('attack'),
    walkSpeed: 5.2 * speedMultiplier,
    sprintSpeed: 8.4 * speedMultiplier,
    jumpMultiplier: 1,
    damageTakenMultiplier: (1 - stats.guard * 0.01) * effect('guard'),
    knockbackMultiplier: (1 - stats.guard * 0.02) * (fullSet === 'bonevault' ? 0.7 : 1),
    criticalChance: stats.critical * 0.01 + (pathfinder ? 0.1 : 0),
    criticalMultiplier: 1.5,
    xpMultiplier: (1 + stats.insight * 0.02) * effect('xp'),
    gatherMultiplier: effect('gather'),
    plantYieldBonus: (fullSet === 'greenhollow' ? 0.25 : 0) + (current.utilityUnlocks.includes('field-pouch') ? 1 : 0),
    woodYieldBonus: (fullSet === 'thornwood' ? 0.25 : 0),
    oreYieldBonus: (fullSet === 'ironroot' ? 1 : 0) + (current.utilityUnlocks.includes('prospector-kit') ? 1 : 0) + (current.utilityUnlocks.includes('soul-sieve') ? 1 : 0),
    lavaDamageMultiplier: effect('lava') * (fullSet === 'emberdeep' ? 0.5 : 1) * (current.utilityUnlocks.includes('basalt-flask') ? 0.85 : 1),
    icicleDamageMultiplier: (tempered ? 0 : effect('icicle')) * (fullSet === 'frostpeak' ? 0.5 : 1),
    sandSlowMultiplier: effect('sand') * (fullSet === 'sunscar' ? 0.5 : 1) * (current.utilityUnlocks.includes('sand-cleats') ? 0.75 : 1),
    windPushMultiplier: effect('wind') * (fullSet === 'skyglass' ? 0.5 : 1) * (current.utilityUnlocks.includes('wind-sail') ? 0.75 : 1),
    breathMultiplier: (rimeguard ? 1.5 : 1) * (current.utilityUnlocks.includes('thermal-lining') ? 1.25 : 1)
  };
}

export function discoverAdventureBiome(progress: StoryAdventureProgressV1, worldId: Exclude<StoryAdventureWorldId, 'world-route'>) {
  const current = sanitizeAdventureProgress(progress);
  return sanitizeAdventureProgress({ ...current, discoveries: { ...current.discoveries, biomes: [...current.discoveries.biomes, worldId] } });
}

export function discoverAdventureWaystone(progress: StoryAdventureProgressV1, waystoneId: string) {
  const current = sanitizeAdventureProgress(progress);
  return sanitizeAdventureProgress({ ...current, discoveries: { ...current.discoveries, waystones: [...current.discoveries.waystones, waystoneId] } });
}

export function discoverAdventureLandmark(progress: StoryAdventureProgressV1, worldId: Exclude<StoryAdventureWorldId, 'world-route'>, landmarkId: string) {
  const current = sanitizeAdventureProgress(progress);
  const known = current.discoveries.landmarks[worldId] ?? [];
  return sanitizeAdventureProgress({
    ...current,
    discoveries: { ...current.discoveries, landmarks: { ...current.discoveries.landmarks, [worldId]: [...known, landmarkId] } }
  });
}

export function discoverAdventureVista(progress: StoryAdventureProgressV1, vistaId: string) {
  const current = sanitizeAdventureProgress(progress);
  return sanitizeAdventureProgress({ ...current, discoveries: { ...current.discoveries, vistas: [...current.discoveries.vistas, vistaId] } });
}

export function beginAdventureVisit(progress: StoryAdventureProgressV1, worldId: Exclude<StoryAdventureWorldId, 'world-route'>) {
  const current = discoverAdventureBiome(progress, worldId);
  const visit = (current.visitCounters[worldId] ?? 0) + 1;
  return sanitizeAdventureProgress({ ...current, visitCounters: { ...current.visitCounters, [worldId]: visit } });
}

export function unlockAdventureMount(progress: StoryAdventureProgressV1, mountId: StoryMountId) {
  const current = sanitizeAdventureProgress(progress);
  const existing = current.mounts[mountId];
  const sanctuaryId = `${STORY_MOUNTS[mountId].worldId}-mount-sanctuary`;
  return sanitizeAdventureProgress({
    ...current,
    discoveries: { ...current.discoveries, sanctuaries: [...current.discoveries.sanctuaries, sanctuaryId] },
    mounts: { ...current.mounts, [mountId]: { unlocked: true, masteryRank: existing?.masteryRank ?? 1, masteryXp: existing?.masteryXp ?? 0, variants: existing?.variants ?? [] } }
  });
}

export function awardMountMastery(progress: StoryAdventureProgressV1, mountId: StoryMountId, amount: number) {
  const current = sanitizeAdventureProgress(progress);
  const existing = current.mounts[mountId];
  if (!existing?.unlocked) return current;
  let rank = existing.masteryRank;
  let xp = existing.masteryXp + Math.max(0, Math.round(amount));
  while (rank < 10) {
    const required = rank * 250;
    if (xp < required) break;
    xp -= required;
    rank += 1;
  }
  const variants = [4, 7, 10].filter((milestone) => rank >= milestone);
  return sanitizeAdventureProgress({ ...current, mounts: { ...current.mounts, [mountId]: { unlocked: true, masteryRank: rank, masteryXp: xp, variants } } });
}

export function awardRouteCoins(progress: StoryAdventureProgressV1, amount: number) {
  const current = sanitizeAdventureProgress(progress);
  return sanitizeAdventureProgress({ ...current, routeCoins: current.routeCoins + Math.max(0, finiteInteger(amount)) });
}

export function claimAdventureCache(progress: StoryAdventureProgressV1, cacheId: string, rewardCoins: number) {
  const current = sanitizeAdventureProgress(progress);
  if (!cacheId || current.claimedCaches.includes(cacheId)) return { progress: current, claimed: false };
  return { progress: sanitizeAdventureProgress({ ...current, routeCoins: current.routeCoins + Math.max(0, finiteInteger(rewardCoins)), claimedCaches: [...current.claimedCaches, cacheId] }), claimed: true };
}

export function collectAdventureRelic(progress: StoryAdventureProgressV1, relicId: string) {
  const current = sanitizeAdventureProgress(progress);
  if (!relicId || current.relics.includes(relicId)) return current;
  return sanitizeAdventureProgress({ ...current, relics: [...current.relics, relicId] });
}

export function discoverAdventureSurfaceMap(progress: StoryAdventureProgressV1, mapId: string) {
  const current = sanitizeAdventureProgress(progress);
  if (!mapId || current.discoveredSurfaceMaps.includes(mapId)) return current;
  return sanitizeAdventureProgress({ ...current, discoveredSurfaceMaps: [...current.discoveredSurfaceMaps, mapId] });
}

export function unlockAdventureEndlessBiome(progress: StoryAdventureProgressV1, biomeId: Exclude<StoryAdventureWorldId, 'world-route'>) {
  const current = sanitizeAdventureProgress(progress);
  if (current.endlessUnlockedBiomes.includes(biomeId)) return current;
  return sanitizeAdventureProgress({ ...current, endlessUnlockedBiomes: [...current.endlessUnlockedBiomes, biomeId] });
}

export function beginAdventureEndlessRun(progress: StoryAdventureProgressV1, biomeId: Exclude<StoryAdventureWorldId, 'world-route'>) {
  const current = sanitizeAdventureProgress(progress);
  if (!current.endlessUnlockedBiomes.includes(biomeId)) return { progress: current, runSerial: 0, started: false };
  const runSerial = (current.endlessRunCounters[biomeId] ?? 0) + 1;
  return {
    progress: sanitizeAdventureProgress({ ...current, endlessRunCounters: { ...current.endlessRunCounters, [biomeId]: runSerial } }),
    runSerial,
    started: true
  };
}

export function recordAdventureBestDepth(progress: StoryAdventureProgressV1, biomeId: Exclude<StoryAdventureWorldId, 'world-route'>, floorNumber: number) {
  const current = sanitizeAdventureProgress(progress);
  const floor = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, finiteInteger(floorNumber)));
  if (floor <= (current.bestDepthByBiome[biomeId] ?? 0)) return current;
  return sanitizeAdventureProgress({ ...current, bestDepthByBiome: { ...current.bestDepthByBiome, [biomeId]: floor } });
}

export function bankAdventureRunLedger(
  progress: StoryAdventureProgressV1,
  biomeId: Exclude<StoryAdventureWorldId, 'world-route'>,
  ledger: StoryRunRewardLedger,
  bankEventId: string,
  now = Date.now()
) {
  const current = sanitizeAdventureProgress(progress);
  if (!bankEventId || current.claimedObjectives.includes(bankEventId)) return { progress: current, banked: false, dailyBonus: false };
  let next = awardAdventureExperience(current, ledger.xp).progress;
  next = sanitizeAdventureProgress({
    ...next,
    lifetimeDefeats: current.lifetimeDefeats + Math.max(0, finiteInteger(ledger.defeats)),
    routeCoins: next.routeCoins + Math.max(0, finiteInteger(ledger.routeCoins)),
    claimedCaches: [...next.claimedCaches, ...ledger.cacheIds, ...ledger.pickupIds],
    claimedObjectives: [...next.claimedObjectives, bankEventId],
    endlessBossesDefeated: next.endlessBossesDefeated + 1,
    collectedCurios: [...next.collectedCurios, ...ledger.curioIds]
  });
  for (const [resourceId, quantity] of Object.entries(ledger.materials)) next = addAdventureMaterial(next, resourceId, quantity).progress;
  const consumables = { ...next.inventory.consumables };
  for (const [recipeId, quantity] of Object.entries(ledger.consumables ?? {})) {
    if (STORY_RECIPE_BY_ID[recipeId]?.kind === 'consumable') consumables[recipeId] = clamp((consumables[recipeId] ?? 0) + finiteInteger(quantity), 0, 99);
  }
  next = sanitizeAdventureProgress({ ...next, inventory: { ...next.inventory, consumables } });
  for (const enemyId of ledger.challengerIds) next = recordAdventureChallengerDefeat(next, enemyId).progress;
  const date = new Date(now).toISOString().slice(0, 10);
  const dailyId = `endless-boss:${biomeId}`;
  const claims = next.dailyClaims[date] ?? [];
  const dailyBonus = !claims.includes(dailyId);
  if (dailyBonus) next = sanitizeAdventureProgress({ ...next, routeCoins: next.routeCoins + 75, dailyClaims: { ...next.dailyClaims, [date]: [...claims, dailyId] } });
  return { progress: next, banked: true, dailyBonus };
}

export function recordAdventureWildlifeSighting(progress: StoryAdventureProgressV1, speciesId: string) {
  const current = sanitizeAdventureProgress(progress);
  if (!speciesId || current.wildlifeSightings.includes(speciesId)) return current;
  return sanitizeAdventureProgress({ ...current, wildlifeSightings: [...current.wildlifeSightings, speciesId] });
}

export function collectAdventureCurio(progress: StoryAdventureProgressV1, curioId: string) {
  const current = sanitizeAdventureProgress(progress);
  if (!curioId || current.collectedCurios.includes(curioId)) return current;
  return sanitizeAdventureProgress({ ...current, collectedCurios: [...current.collectedCurios, curioId] });
}

export function restoreAdventureShortcut(progress: StoryAdventureProgressV1, shortcutId: string, cost = 100) {
  const current = sanitizeAdventureProgress(progress);
  if (!shortcutId || current.restoredShortcuts.includes(shortcutId) || current.routeCoins < cost) return { progress: current, restored: false };
  return { progress: sanitizeAdventureProgress({ ...current, routeCoins: current.routeCoins - cost, restoredShortcuts: [...current.restoredShortcuts, shortcutId] }), restored: true };
}

export function upgradeAdventureWaystone(progress: StoryAdventureProgressV1, waystoneId: string, cost = 250) {
  const current = sanitizeAdventureProgress(progress);
  if (!waystoneId || current.upgradedWaystones.includes(waystoneId) || current.routeCoins < cost) return { progress: current, upgraded: false };
  return { progress: sanitizeAdventureProgress({ ...current, routeCoins: current.routeCoins - cost, upgradedWaystones: [...current.upgradedWaystones, waystoneId] }), upgraded: true };
}

export function pinAdventureDaily(progress: StoryAdventureProgressV1, date: string, worldId: Exclude<StoryAdventureWorldId, 'world-route'>, activityId: string) {
  const current = sanitizeAdventureProgress(progress);
  return sanitizeAdventureProgress({ ...current, pinnedDaily: { date, worldId, activityId } });
}

export function claimAdventureDaily(progress: StoryAdventureProgressV1, date: string, activityId: string, rewardCoins: number) {
  const current = sanitizeAdventureProgress(progress);
  const claims = current.dailyClaims[date] ?? [];
  if (claims.includes(activityId)) return { progress: current, claimed: false };
  return { progress: sanitizeAdventureProgress({ ...current, routeCoins: current.routeCoins + rewardCoins, dailyClaims: { ...current.dailyClaims, [date]: [...claims, activityId] } }), claimed: true };
}

export function unlockAdventureRecipes(progress: StoryAdventureProgressV1, recipeIds: string[]) {
  const current = sanitizeAdventureProgress(progress);
  const accepted = recipeIds.filter((id) => STORY_RECIPE_BY_ID[id] && !current.knownRecipes.includes(id));
  return { progress: accepted.length > 0 ? sanitizeAdventureProgress({ ...current, knownRecipes: [...current.knownRecipes, ...accepted] }) : current, learned: accepted };
}

export function unlockAdventureSpecialistRecipes(progress: StoryAdventureProgressV1, biomeId: StoryBiomeId) {
  return unlockAdventureRecipes(progress, recipesLearnedFromSpecialist(biomeId));
}

export function unlockAdventureMasteryRecipe(progress: StoryAdventureProgressV1, biomeId: StoryBiomeId) {
  const id = recipeLearnedFromMastery(biomeId);
  return unlockAdventureRecipes(progress, id ? [id] : []);
}

export function addAdventureMaterial(progress: StoryAdventureProgressV1, resourceId: string, quantity: number) {
  const current = sanitizeAdventureProgress(progress);
  if (!STORY_RESOURCE_BY_ID[resourceId] || quantity <= 0) return { progress: current, learned: [] as string[] };
  const materials = { ...current.inventory.materials, [resourceId]: clamp((current.inventory.materials[resourceId] ?? 0) + finiteInteger(quantity), 0, 999) };
  const rareRecipe = recipeLearnedFromRareResource(resourceId);
  const candidate = sanitizeAdventureProgress({ ...current, inventory: { ...current.inventory, materials }, discoveredMaterials: [...current.discoveredMaterials, resourceId] });
  return unlockAdventureRecipes(candidate, [...(rareRecipe ? [rareRecipe] : []), ...advancedRecipesLearned(materials)]);
}

export function craftAdventureRecipe(progress: StoryAdventureProgressV1, recipeId: string, context: StoryCraftingContext) {
  const current = sanitizeAdventureProgress(progress);
  const recipe = STORY_RECIPE_BY_ID[recipeId];
  if (!recipe || !current.knownRecipes.includes(recipeId) || !canCraftRecipe(recipe, current.inventory, context) || (recipe.kind === 'utility' && current.utilityUnlocks.includes(recipeId))) return { progress: current, crafted: false };
  const materials = { ...current.inventory.materials };
  for (const [resourceId, quantity] of Object.entries(recipe.ingredients)) materials[resourceId] = Math.max(0, (materials[resourceId] ?? 0) - quantity);
  const inventory: StoryAdventureInventory = { ...current.inventory, materials };
  let utilityUnlocks = current.utilityUnlocks;
  if (recipe.kind === 'armor') inventory.armor = [...inventory.armor, recipe.id];
  if (recipe.kind === 'consumable') inventory.consumables = { ...inventory.consumables, [recipe.id]: Math.min(99, (inventory.consumables[recipe.id] ?? 0) + 1) };
  if (recipe.kind === 'utility') utilityUnlocks = [...utilityUnlocks, recipe.id];
  return { progress: sanitizeAdventureProgress({ ...current, inventory, utilityUnlocks }), crafted: true };
}

export function equipAdventureArmor(progress: StoryAdventureProgressV1, recipeId: string) {
  const current = sanitizeAdventureProgress(progress);
  const recipe = STORY_RECIPE_BY_ID[recipeId];
  if (!recipe?.armor || !current.inventory.armor.includes(recipeId)) return current;
  return sanitizeAdventureProgress({ ...current, equippedArmor: { ...current.equippedArmor, [recipe.armor.slot]: current.equippedArmor[recipe.armor.slot] === recipeId ? null : recipeId } });
}

export function consumeAdventureItem(progress: StoryAdventureProgressV1, recipeId: string, now = Date.now()) {
  const current = sanitizeAdventureProgress(progress);
  const recipe = STORY_RECIPE_BY_ID[recipeId];
  if (!recipe?.consumable || (current.inventory.consumables[recipeId] ?? 0) <= 0) return { progress: current, consumed: false, healing: 0 };
  const consumables = { ...current.inventory.consumables, [recipeId]: current.inventory.consumables[recipeId] - 1 };
  const activeEffects = recipe.consumable.kind && recipe.consumable.durationMs
    ? [...current.activeEffects.filter((effect) => effect.kind !== recipe.consumable!.kind), { recipeId, kind: recipe.consumable.kind, multiplier: recipe.consumable.multiplier ?? 1, expiresAt: now + recipe.consumable.durationMs }]
    : current.activeEffects;
  return { progress: sanitizeAdventureProgress({ ...current, inventory: { ...current.inventory, consumables }, activeEffects }), consumed: true, healing: recipe.consumable.healing ?? 0 };
}

export function isAdventureResourceNodeAvailable(progress: StoryAdventureProgressV1, node: StoryResourceNodeDefinition, biomeId: StoryBiomeId, now = Date.now()) {
  const state = progress.harvestState[node.id];
  if (!state) return true;
  if (node.respawn === 'visit') return state.visit !== (progress.visitCounters[biomeId] ?? 0);
  if (node.respawn === 'timed') return (state.readyAt ?? 0) <= now;
  return state.day !== new Date(now).toISOString().slice(0, 10);
}

export function depleteAdventureResourceNode(progress: StoryAdventureProgressV1, node: StoryResourceNodeDefinition, biomeId: StoryBiomeId, now = Date.now()) {
  const current = sanitizeAdventureProgress(progress);
  const state = node.respawn === 'visit'
    ? { visit: current.visitCounters[biomeId] ?? 0 }
    : node.respawn === 'timed'
      ? { readyAt: now + 20 * 60_000 }
      : { day: new Date(now).toISOString().slice(0, 10) };
  return sanitizeAdventureProgress({ ...current, harvestState: { ...current.harvestState, [node.id]: state } });
}

export function adventureResourceYieldModifiers(progress: StoryAdventureProgressV1, node: StoryResourceNodeDefinition) {
  const derived = getAdventureDerivedStats(progress);
  const plant = node.kind === 'plant' || node.kind === 'berry';
  const wood = node.kind === 'tree';
  const ore = node.kind === 'ore' || node.kind === 'rock';
  return {
    multiplier: derived.gatherMultiplier * (plant && derived.plantYieldBonus > 0 && derived.plantYieldBonus < 1 ? 1 + derived.plantYieldBonus : 1) * (wood ? 1 + derived.woodYieldBonus : 1),
    flatBonus: (plant && derived.plantYieldBonus >= 1 ? derived.plantYieldBonus : 0) + (ore ? derived.oreYieldBonus : 0),
    toughnessReduction: wood && currentUtility(progress, 'felling-wrap') ? 1 : 0
  };
}

function currentUtility(progress: StoryAdventureProgressV1, id: string) {
  return progress.utilityUnlocks.includes(id);
}

export const STORY_CRAFTABLE_RECIPE_COUNT = STORY_RECIPES.length;

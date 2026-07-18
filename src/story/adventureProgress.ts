import { STORY_MOUNTS } from './adventureExploration';
import type { StoryAdventureWorldId, StoryMountId } from './types';

export const STORY_ADVENTURE_PROGRESS_VERSION = 3 as const;
export const STORY_ADVENTURE_PROGRESS_KEY = 'kore.story.adventure.v3';
export const LEGACY_STORY_ADVENTURE_PROGRESS_KEY = 'kore.story.adventure.v2';
export const ORIGINAL_STORY_ADVENTURE_PROGRESS_KEY = 'kore.story.adventure.v1';
export const STORY_ADVENTURE_MAX_LEVEL = 100;
export const STORY_ADVENTURE_STAT_CAP = 25;
export const STORY_ROUTE_COIN_CAP = 99_999;

export const STORY_ADVENTURE_STAT_KEYS = ['power', 'vitality', 'agility', 'guard', 'critical', 'insight'] as const;
export type StoryAdventureStatKey = typeof STORY_ADVENTURE_STAT_KEYS[number];
export type StoryAdventureStats = Record<StoryAdventureStatKey, number>;

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
  version: typeof STORY_ADVENTURE_PROGRESS_VERSION;
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

/** @deprecated Kept as a source-compatible alias while callers migrate to V2. */
export type StoryAdventureProgressV1 = StoryAdventureProgressV3;

export type StoryAdventureDerivedStats = {
  maxHealth: number;
  attackDamage: number;
  walkSpeed: number;
  sprintSpeed: number;
  damageTakenMultiplier: number;
  knockbackMultiplier: number;
  criticalChance: number;
  criticalMultiplier: number;
  xpMultiplier: number;
};

const EMPTY_STATS: StoryAdventureStats = {
  power: 0,
  vitality: 0,
  agility: 0,
  guard: 0,
  critical: 0,
  insight: 0
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
    depthGenerationVersion: 2
  };
}

export function sanitizeAdventureProgress(value: unknown): StoryAdventureProgressV1 {
  if (!value || typeof value !== 'object') return makeDefaultAdventureProgress();
  const record = value as Partial<StoryAdventureProgressV3> & Partial<StoryAdventureProgressV2> & Partial<LegacyStoryAdventureProgressV1>;
  const level = clamp(finiteInteger(record.level, 1), 1, STORY_ADVENTURE_MAX_LEVEL);
  const rawStats = record.stats && typeof record.stats === 'object' ? record.stats as Partial<StoryAdventureStats> : {};
  const stats = STORY_ADVENTURE_STAT_KEYS.reduce((result, key) => {
    result[key] = clamp(finiteInteger(rawStats[key]), 0, STORY_ADVENTURE_STAT_CAP);
    return result;
  }, { ...EMPTY_STATS });

  let pointsRemaining = level - 1;
  for (const key of STORY_ADVENTURE_STAT_KEYS) {
    const accepted = Math.min(stats[key], pointsRemaining);
    stats[key] = accepted;
    pointsRemaining -= accepted;
  }

  const required = experienceToNextLevel(level);
  const validBiomes = Object.values(STORY_MOUNTS).map((mount) => mount.worldId);
  const rawDiscoveries = record.discoveries && typeof record.discoveries === 'object' ? record.discoveries as StoryAdventureProgressV2['discoveries'] : makeDefaultAdventureProgress().discoveries;
  const uniqueStrings = (input: unknown, limit = 256) => Array.from(new Set(Array.isArray(input) ? input.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0).slice(0, limit) : []));
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
    depthGenerationVersion: Math.max(2, finiteInteger(record.depthGenerationVersion, 2))
  };
}

export function readAdventureProgress(): StoryAdventureProgressV1 {
  if (typeof window === 'undefined') return makeDefaultAdventureProgress();
  try {
    const current = window.localStorage.getItem(STORY_ADVENTURE_PROGRESS_KEY);
    const legacy = window.localStorage.getItem(LEGACY_STORY_ADVENTURE_PROGRESS_KEY) ?? window.localStorage.getItem(ORIGINAL_STORY_ADVENTURE_PROGRESS_KEY);
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
  if (current.unspentPoints <= 0 || current.stats[stat] >= STORY_ADVENTURE_STAT_CAP) return current;
  return sanitizeAdventureProgress({
    ...current,
    stats: { ...current.stats, [stat]: current.stats[stat] + 1 }
  });
}

export function respecAdventureStats(progress: StoryAdventureProgressV1) {
  const current = sanitizeAdventureProgress(progress);
  return sanitizeAdventureProgress({ ...current, stats: { ...EMPTY_STATS } });
}

export function canRespecAdventureStats(worldId: string, nearbyPortalKind?: string) {
  return worldId === 'world-route' && nearbyPortalKind === 'shrine';
}

export function awardAdventureExperience(progress: StoryAdventureProgressV1, baseXp: number) {
  const current = sanitizeAdventureProgress(progress);
  if (current.level >= STORY_ADVENTURE_MAX_LEVEL) return { progress: current, levelsGained: 0, xpAwarded: 0 };
  const xpAwarded = Math.max(0, Math.round(baseXp * (1 + current.stats.insight * 0.02)));
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

export function getAdventureDerivedStats(progress: StoryAdventureProgressV1): StoryAdventureDerivedStats {
  const current = sanitizeAdventureProgress(progress);
  const { level, stats } = current;
  const levelOffset = level - 1;
  const speedMultiplier = 1 + stats.agility * 0.01;
  return {
    maxHealth: 100 + levelOffset + stats.vitality * 5,
    attackDamage: 20 * (1 + levelOffset * 0.02) * (1 + stats.power * 0.02),
    walkSpeed: 5.2 * speedMultiplier,
    sprintSpeed: 8.4 * speedMultiplier,
    damageTakenMultiplier: 1 - stats.guard * 0.01,
    knockbackMultiplier: 1 - stats.guard * 0.02,
    criticalChance: stats.critical * 0.01,
    criticalMultiplier: 1.5,
    xpMultiplier: 1 + stats.insight * 0.02
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

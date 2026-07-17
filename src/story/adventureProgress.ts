export const STORY_ADVENTURE_PROGRESS_VERSION = 1 as const;
export const STORY_ADVENTURE_PROGRESS_KEY = 'kore.story.adventure.v1';
export const STORY_ADVENTURE_MAX_LEVEL = 100;
export const STORY_ADVENTURE_STAT_CAP = 25;

export const STORY_ADVENTURE_STAT_KEYS = ['power', 'vitality', 'agility', 'guard', 'critical', 'insight'] as const;
export type StoryAdventureStatKey = typeof STORY_ADVENTURE_STAT_KEYS[number];
export type StoryAdventureStats = Record<StoryAdventureStatKey, number>;

export type StoryAdventureProgressV1 = {
  version: typeof STORY_ADVENTURE_PROGRESS_VERSION;
  level: number;
  xp: number;
  unspentPoints: number;
  stats: StoryAdventureStats;
  lifetimeDefeats: number;
};

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
    lifetimeDefeats: 0
  };
}

export function sanitizeAdventureProgress(value: unknown): StoryAdventureProgressV1 {
  if (!value || typeof value !== 'object') return makeDefaultAdventureProgress();
  const record = value as Partial<StoryAdventureProgressV1>;
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
  return {
    version: STORY_ADVENTURE_PROGRESS_VERSION,
    level,
    xp: required > 0 ? clamp(finiteInteger(record.xp), 0, required - 1) : 0,
    unspentPoints: pointsRemaining,
    stats,
    lifetimeDefeats: Math.max(0, finiteInteger(record.lifetimeDefeats))
  };
}

export function readAdventureProgress(): StoryAdventureProgressV1 {
  if (typeof window === 'undefined') return makeDefaultAdventureProgress();
  try {
    return sanitizeAdventureProgress(JSON.parse(window.localStorage.getItem(STORY_ADVENTURE_PROGRESS_KEY) ?? 'null'));
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

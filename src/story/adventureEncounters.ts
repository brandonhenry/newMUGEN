import { STORY_CHALLENGER_IDS } from './enemyCatalog';
import type { StoryEnemyId, StoryEnemySpawnDefinition, StoryEncounterZoneDefinition } from './types';

export const STORY_CHALLENGER_ODDS = [0, 0, 0.35, 0.65, 1] as const;

export type StoryEncounterProgress = {
  defeatedRegularIds: string[];
  resolvedZoneIds: string[];
  selectedChallengers: StoryEnemyId[];
  activeChallenge: { zoneId: string; enemyId: StoryEnemyId; reset: number } | null;
};

export function makeStoryEncounterProgress(): StoryEncounterProgress {
  return { defeatedRegularIds: [], resolvedZoneIds: [], selectedChallengers: [], activeChallenge: null };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function storyEncounterRoll(seed: string, zoneId: string): number {
  return hashString(`${seed}:${zoneId}:challenger`) / 4294967296;
}

export function storyChallengerChance(encounterIndex: number): number {
  return STORY_CHALLENGER_ODDS[Math.max(0, Math.min(4, Math.round(encounterIndex)))] ?? 0;
}

export function selectStoryChallenger(seed: string, zoneId: string, selected: StoryEnemyId[], forced?: StoryEnemyId): StoryEnemyId {
  if (forced && STORY_CHALLENGER_IDS.includes(forced)) return forced;
  const available = STORY_CHALLENGER_IDS.filter((id) => !selected.includes(id));
  const pool = available.length > 0 ? available : STORY_CHALLENGER_IDS;
  return [...pool].sort((left, right) => hashString(`${seed}:${zoneId}:${left}`) - hashString(`${seed}:${zoneId}:${right}`))[0];
}

export function encounterRegulars(zoneId: string, spawns: StoryEnemySpawnDefinition[]): StoryEnemySpawnDefinition[] {
  return spawns.filter((spawn) => spawn.encounterZoneId === zoneId);
}

export function rerollStoryRegularSpawns(seed: string, spawns: StoryEnemySpawnDefinition[]): StoryEnemySpawnDefinition[] {
  const pool = Array.from(new Set(spawns.map((spawn) => spawn.enemyId)));
  if (pool.length < 2) return spawns;
  return spawns.map((spawn, index) => ({
    ...spawn,
    enemyId: pool[hashString(`${seed}:${spawn.encounterZoneId ?? 'open'}:${spawn.id}:${index}`) % pool.length]
  }));
}

export function recordRegularDefeat(input: {
  progress: StoryEncounterProgress;
  spawnId: string;
  zone: StoryEncounterZoneDefinition;
  encounterIndex: number;
  spawns: StoryEnemySpawnDefinition[];
  seed: string;
  forceChallenger?: StoryEnemyId;
}): { progress: StoryEncounterProgress; challengeStarted: boolean } {
  const defeatedRegularIds = Array.from(new Set([...input.progress.defeatedRegularIds, input.spawnId]));
  if (input.progress.resolvedZoneIds.includes(input.zone.id) || input.progress.activeChallenge?.zoneId === input.zone.id) {
    return { progress: { ...input.progress, defeatedRegularIds }, challengeStarted: false };
  }
  const regulars = encounterRegulars(input.zone.id, input.spawns);
  if (!regulars.every((spawn) => defeatedRegularIds.includes(spawn.id))) {
    return { progress: { ...input.progress, defeatedRegularIds }, challengeStarted: false };
  }
  const chance = input.forceChallenger ? 1 : storyChallengerChance(input.encounterIndex);
  if (storyEncounterRoll(input.seed, input.zone.id) >= chance) {
    return {
      progress: { ...input.progress, defeatedRegularIds, resolvedZoneIds: [...input.progress.resolvedZoneIds, input.zone.id] },
      challengeStarted: false
    };
  }
  const enemyId = selectStoryChallenger(input.seed, input.zone.id, input.progress.selectedChallengers, input.forceChallenger);
  return {
    progress: {
      ...input.progress,
      defeatedRegularIds,
      selectedChallengers: [...input.progress.selectedChallengers, enemyId],
      activeChallenge: { zoneId: input.zone.id, enemyId, reset: 0 }
    },
    challengeStarted: true
  };
}

export function recordChallengerDefeat(progress: StoryEncounterProgress): StoryEncounterProgress {
  if (!progress.activeChallenge) return progress;
  return {
    ...progress,
    resolvedZoneIds: Array.from(new Set([...progress.resolvedZoneIds, progress.activeChallenge.zoneId])),
    activeChallenge: null
  };
}

export function resetActiveChallenger(progress: StoryEncounterProgress): StoryEncounterProgress {
  return progress.activeChallenge
    ? { ...progress, activeChallenge: { ...progress.activeChallenge, reset: progress.activeChallenge.reset + 1 } }
    : progress;
}

export function storyEncounterMovementLock(progress: StoryEncounterProgress, zones: StoryEncounterZoneDefinition[]): [number, number] | null {
  if (!progress.activeChallenge) return null;
  return zones.find((zone) => zone.id === progress.activeChallenge?.zoneId)?.range ?? null;
}

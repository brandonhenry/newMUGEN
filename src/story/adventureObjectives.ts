import type { StoryAdventureActivityKind, StoryAdventureWorldId } from './types';

type BiomeId = Exclude<StoryAdventureWorldId, 'world-route'>;

export type StoryDailyActivity = {
  id: string;
  worldId: BiomeId;
  date: string;
  kind: StoryAdventureActivityKind;
  label: string;
  description: string;
  target: number;
  rewardCoins: number;
};

const KINDS: StoryAdventureActivityKind[] = ['hunt', 'rescue', 'race', 'defense', 'collection'];
const META: Record<StoryAdventureActivityKind, { label: string; description: string; target: number; rewardCoins: number }> = {
  hunt: { label: 'Trail Hunt', description: 'Clear marked encounter lanes', target: 6, rewardCoins: 90 },
  rescue: { label: 'Route Rescue', description: 'Reach stranded route markers', target: 3, rewardCoins: 100 },
  race: { label: 'Waystone Sprint', description: 'Cross the timed traversal gates', target: 1, rewardCoins: 110 },
  defense: { label: 'Hold the Landmark', description: 'Defend the biome landmark', target: 3, rewardCoins: 120 },
  collection: { label: 'Relic Survey', description: 'Collect marked biome fragments', target: 8, rewardCoins: 95 }
};

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function adventureUtcDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function getStoryDailyActivities(worldId: BiomeId, date = adventureUtcDate()): [StoryDailyActivity, StoryDailyActivity] {
  const firstIndex = hash(`${date}:${worldId}:first`) % KINDS.length;
  let secondIndex = hash(`${date}:${worldId}:second`) % KINDS.length;
  if (secondIndex === firstIndex) secondIndex = (secondIndex + 1) % KINDS.length;
  return [firstIndex, secondIndex].map((index, slot) => {
    const kind = KINDS[index];
    const meta = META[kind];
    return { id: `${date}:${worldId}:${kind}:${slot + 1}`, worldId, date, kind, ...meta };
  }) as [StoryDailyActivity, StoryDailyActivity];
}

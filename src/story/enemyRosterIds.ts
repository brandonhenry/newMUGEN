import rosterExpansion from './storyRosterExpansion.json';
import type { StoryAdventureWorldId, StoryEnemyId, StoryEnemyTier } from './types';

const LEGACY_CHALLENGER_IDS: StoryEnemyId[] = ['ember-fist', 'dusk-ronin', 'crescent-rogue', 'chimera-android', 'silver-duelist', 'crimson-countess', 'laughing-oni', 'hollow-bride'];
type ExpansionEnemyRow = [StoryEnemyId, string, StoryEnemyTier, ...unknown[]];
type ExpansionBiome = { enemies: ExpansionEnemyRow[] };
type BiomeId = Exclude<StoryAdventureWorldId, 'world-route'>;
const LEGACY_CHALLENGER_BY_BIOME: Record<BiomeId, StoryEnemyId> = { greenhollow: 'silver-duelist', thornwood: 'crescent-rogue', ironroot: 'chimera-android', bonevault: 'hollow-bride', emberdeep: 'ember-fist', frostpeak: 'laughing-oni', sunscar: 'dusk-ronin', skyglass: 'crimson-countess' };
const EXPANSION_BIOMES = rosterExpansion.biomes as unknown as Record<BiomeId, ExpansionBiome>;

export const STORY_ROSTER_CHALLENGER_IDS: readonly StoryEnemyId[] = Array.from(new Set([
  ...LEGACY_CHALLENGER_IDS,
  ...Object.values(EXPANSION_BIOMES).flatMap((biome) => biome.enemies.filter((enemy) => enemy[2] === 'challenger').map((enemy) => enemy[0]))
]));

export const STORY_ROSTER_CHALLENGER_IDS_BY_BIOME = Object.fromEntries((Object.keys(EXPANSION_BIOMES) as BiomeId[]).map((biomeId) => [biomeId, [LEGACY_CHALLENGER_BY_BIOME[biomeId], ...EXPANSION_BIOMES[biomeId].enemies.filter((enemy) => enemy[2] === 'challenger').map((enemy) => enemy[0])]])) as unknown as Record<BiomeId, readonly StoryEnemyId[]>;

export function isStoryRosterChallengerId(value: string): value is StoryEnemyId {
  return STORY_ROSTER_CHALLENGER_IDS.includes(value as StoryEnemyId);
}

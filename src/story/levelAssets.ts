import { worldPackAsset } from './adventureAssets';
import type { StoryAdventureWorldId } from './types';
import type { StoryLevelAssetDefinition, StoryLevelAssetRole, StoryLevelSlot } from './levelTypes';

type BiomeId = Exclude<StoryAdventureWorldId, 'world-route'>;

function asset(
  id: string,
  biome: BiomeId | 'universal',
  file: string,
  pixelSize: [number, number],
  footprint: [number, number],
  roles: StoryLevelAssetRole[],
  tags: string[],
  family: string,
  occlusion: StoryLevelAssetDefinition['occlusion'] = 'low'
): StoryLevelAssetDefinition {
  return {
    id,
    asset: worldPackAsset(file),
    biomes: [biome],
    roles,
    tags,
    family,
    layers: roles.includes('background') ? ['background'] : roles.includes('framing') ? ['midground', 'foreground'] : ['midground', 'play-plane'],
    pixelSize,
    footprint,
    anchor: [0.5, 1],
    scaleRange: [0.82, 1.18],
    mirrorable: true,
    occlusion,
    densityCost: roles.includes('hero') ? 5 : roles.includes('structural') ? 3 : 1,
    repetitionLimit: roles.includes('hero') ? 1 : roles.includes('structural') ? 4 : 7,
    sourcePack: file.split('/')[0],
    license: 'CC0-1.0'
  };
}

/** Semantic metadata layered over the provenance-first world asset manifest. */
export const STORY_LEVEL_ASSET_REGISTRY: StoryLevelAssetDefinition[] = [
  asset('village-house-a', 'greenhollow', 'gothic-town/house-a.png', [168, 183], [9, 9.8], ['structural', 'hero'], ['house', 'settlement', 'warm', 'landmark'], 'gothic-town', 'medium'),
  asset('village-well', 'greenhollow', 'gothic-town/well.png', [65, 65], [3.4, 3.4], ['clutter', 'hero'], ['well', 'water', 'square', 'reward'], 'gothic-town'),
  asset('village-lamp', 'greenhollow', 'gothic-town/street-lamp.png', [35, 108], [1.5, 4.6], ['framing', 'clutter'], ['lamp', 'path', 'safe', 'entrance'], 'gothic-town'),

  asset('forest-tree', 'thornwood', 'magical-road/tree.png', [86, 181], [6, 12], ['structural', 'hero', 'foliage'], ['tree', 'root', 'canopy', 'landmark'], 'verdant', 'medium'),
  asset('forest-plant', 'thornwood', 'tall-forest/plant.png', [42, 27], [3.8, 2.5], ['foliage', 'clutter'], ['plant', 'ground', 'soft'], 'verdant'),
  asset('forest-rock', 'thornwood', 'tall-forest/rock.png', [32, 32], [2.8, 2.8], ['structural', 'clutter'], ['rock', 'ground', 'cover'], 'verdant'),

  asset('mine-gate', 'ironroot', 'warped-caves/gate.png', [48, 48], [5.2, 5.2], ['structural', 'hero', 'framing'], ['gate', 'shaft', 'entrance', 'timber'], 'warped-caves', 'medium'),
  asset('mine-stalactite', 'ironroot', 'warped-caves/stalactite.png', [38, 53], [3.2, 4.5], ['framing', 'hazard'], ['stalactite', 'ceiling', 'danger'], 'warped-caves'),
  asset('mine-stone-head', 'ironroot', 'warped-caves/stone-head.png', [55, 51], [4, 3.7], ['clutter', 'hero'], ['stone', 'ore', 'relic'], 'warped-caves'),

  asset('crypt-column', 'bonevault', 'gothic-church/column.png', [114, 190], [5.2, 8.7], ['structural', 'framing', 'hero'], ['column', 'arch', 'tomb', 'landmark'], 'gothic', 'medium'),
  asset('crypt-statue', 'bonevault', 'gothic-cemetery/statue.png', [63, 75], [3.6, 4.3], ['hero', 'clutter'], ['statue', 'tomb', 'lore'], 'gothic'),
  asset('crypt-stone', 'bonevault', 'gothic-cemetery/stone.png', [27, 33], [2.2, 2.7], ['clutter'], ['grave', 'stone', 'ground'], 'gothic'),

  asset('ember-gate', 'emberdeep', 'emberdeep/gate.png', [48, 48], [5.2, 5.2], ['structural', 'hero', 'framing'], ['forge', 'gate', 'basalt', 'entrance'], 'emberdeep', 'medium'),
  asset('ember-stalactite', 'emberdeep', 'emberdeep/stalactite.png', [38, 53], [3.2, 4.5], ['hazard', 'framing'], ['lava', 'ceiling', 'danger'], 'emberdeep'),
  asset('ember-crystal', 'emberdeep', 'rocky-pass/crystal-1.png', [25, 25], [2.2, 2.2], ['clutter', 'hero'], ['crystal', 'glow', 'reward'], 'emberdeep'),

  asset('snow-house', 'frostpeak', 'frostpeak-details/house.png', [240, 96], [10, 4], ['structural', 'hero'], ['shelter', 'snow', 'safe', 'landmark'], 'frostpeak', 'medium'),
  asset('snow-crystal', 'frostpeak', 'rocky-pass/crystal-2.png', [26, 20], [2.5, 1.9], ['clutter', 'hero'], ['ice', 'crystal', 'reward'], 'frostpeak'),
  asset('snow-rock', 'frostpeak', 'tall-forest/rock.png', [32, 32], [2.8, 2.8], ['structural', 'clutter'], ['snow', 'rock', 'ground'], 'frostpeak'),

  asset('desert-house', 'sunscar', 'sunscar-settlement/house-a.png', [168, 183], [7.5, 8.2], ['structural', 'hero'], ['settlement', 'shade', 'ruin', 'landmark'], 'sunscar', 'medium'),
  asset('desert-well', 'sunscar', 'sunscar-settlement/well.png', [65, 65], [3.4, 3.4], ['hero', 'clutter'], ['oasis', 'water', 'reward'], 'sunscar'),
  asset('desert-wagon', 'sunscar', 'sunscar-settlement/wagon.png', [93, 75], [4.5, 3.6], ['clutter', 'framing'], ['caravan', 'path', 'entrance'], 'sunscar'),

  asset('ruins-column', 'skyglass', 'gothic-church/column.png', [114, 190], [4.6, 7.7], ['structural', 'framing', 'hero'], ['column', 'floating', 'sanctum', 'landmark'], 'skyglass', 'medium'),
  asset('ruins-crystal-a', 'skyglass', 'rocky-pass/crystal-1.png', [25, 25], [2.4, 2.4], ['clutter', 'hero'], ['glass', 'crystal', 'chime'], 'skyglass'),
  asset('ruins-crystal-b', 'skyglass', 'rocky-pass/crystal-2.png', [26, 20], [2.8, 2.2], ['clutter'], ['glass', 'crystal', 'path'], 'skyglass')
];

function scoreAsset(candidate: StoryLevelAssetDefinition, biomeId: BiomeId, tags: string[], role?: StoryLevelAssetRole) {
  const exactBiome = candidate.biomes.includes(biomeId);
  const universal = candidate.biomes.includes('universal');
  if (!exactBiome && !universal) return -Infinity;
  let score = exactBiome ? 100 : 40;
  if (role && candidate.roles.includes(role)) score += 30;
  score += tags.filter((tag) => candidate.tags.includes(tag)).length * 12;
  return score;
}

export function resolveStoryLevelAsset(biomeId: BiomeId, slot: Pick<StoryLevelSlot, 'semanticTags'>, role?: StoryLevelAssetRole, salt = 0) {
  const ranked = STORY_LEVEL_ASSET_REGISTRY
    .map((candidate) => ({ candidate, score: scoreAsset(candidate, biomeId, slot.semanticTags, role) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((left, right) => right.score - left.score || left.candidate.id.localeCompare(right.candidate.id));
  if (ranked.length === 0) return undefined;
  const bestScore = ranked[0].score;
  const best = ranked.filter(({ score }) => score === bestScore);
  return best[Math.abs(salt) % best.length].candidate;
}

export function storyLevelAssetCoverage() {
  const biomes = ['greenhollow', 'thornwood', 'ironroot', 'bonevault', 'emberdeep', 'frostpeak', 'sunscar', 'skyglass'] as BiomeId[];
  return biomes.map((biomeId) => ({
    biomeId,
    assets: STORY_LEVEL_ASSET_REGISTRY.filter((entry) => entry.biomes.includes(biomeId)).length,
    roles: Array.from(new Set(STORY_LEVEL_ASSET_REGISTRY.filter((entry) => entry.biomes.includes(biomeId)).flatMap((entry) => entry.roles))).sort()
  }));
}

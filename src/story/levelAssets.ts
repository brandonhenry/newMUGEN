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
  const sourcePack = file.split('/')[0];
  const license = sourcePack === 'sunnyland-winter'
    ? 'Free commercial use and modification; attribution not required'
    : sourcePack === 'yeehaw'
      ? 'Free commercial and non-commercial use and modification'
      : sourcePack === 'moten-lava'
        ? 'No copyright; free to use'
        : 'CC0-1.0';
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
    sourcePack,
    license
  };
}

/** Semantic metadata layered over the provenance-first world asset manifest. */
export const STORY_LEVEL_ASSET_REGISTRY: StoryLevelAssetDefinition[] = [
  asset('village-house-a', 'greenhollow', 'gothic-town/house-a.png', [168, 183], [9, 9.8], ['structural', 'hero'], ['house', 'settlement', 'warm', 'landmark'], 'gothic-town', 'medium'),
  asset('village-house-b', 'greenhollow', 'gothic-town/house-b.png', [210, 244], [9, 10.5], ['structural', 'framing'], ['house', 'settlement', 'tall', 'cluster-left'], 'gothic-town', 'medium'),
  asset('village-house-c', 'greenhollow', 'gothic-town/house-c.png', [221, 183], [10, 8.3], ['structural', 'framing'], ['house', 'settlement', 'wide', 'cluster-right'], 'gothic-town', 'medium'),
  asset('village-well', 'greenhollow', 'gothic-town/well.png', [65, 65], [3.4, 3.4], ['clutter', 'hero'], ['well', 'water', 'square', 'reward'], 'gothic-town'),
  asset('village-wagon', 'greenhollow', 'gothic-town/wagon.png', [93, 75], [4.5, 3.6], ['clutter', 'framing'], ['wagon', 'market', 'path', 'cluster-right'], 'gothic-town'),
  asset('village-lamp', 'greenhollow', 'gothic-town/street-lamp.png', [35, 108], [1.5, 4.6], ['framing', 'clutter'], ['lamp', 'path', 'safe', 'entrance'], 'gothic-town'),

  asset('forest-tree', 'thornwood', 'magical-road/tree.png', [86, 181], [6, 12], ['structural', 'hero', 'foliage'], ['tree', 'root', 'canopy', 'landmark'], 'thornwood', 'medium'),
  asset('forest-cemetery-tree', 'thornwood', 'gothic-cemetery/tree.png', [166, 117], [8, 5.6], ['structural', 'framing', 'foliage'], ['tree', 'fallen', 'old', 'cluster-right'], 'thornwood', 'medium'),
  asset('forest-plant', 'thornwood', 'tall-forest/plant.png', [42, 27], [3.8, 2.5], ['foliage', 'clutter'], ['plant', 'ground', 'soft'], 'thornwood'),
  asset('forest-rock', 'thornwood', 'tall-forest/rock.png', [32, 32], [2.8, 2.8], ['structural', 'clutter'], ['rock', 'ground', 'cover'], 'thornwood'),

  asset('mine-gate', 'ironroot', 'warped-caves/gate.png', [48, 48], [5.2, 5.2], ['structural', 'hero', 'framing'], ['gate', 'shaft', 'entrance', 'timber'], 'warped-caves', 'medium'),
  asset('mine-stalactite', 'ironroot', 'warped-caves/stalactite.png', [38, 53], [3.2, 4.5], ['framing', 'hazard'], ['stalactite', 'ceiling', 'danger'], 'warped-caves'),
  asset('mine-stone-head', 'ironroot', 'warped-caves/stone-head.png', [55, 51], [4, 3.7], ['clutter', 'hero'], ['stone', 'ore', 'relic'], 'warped-caves'),
  asset('mine-crystal', 'ironroot', 'rocky-pass/crystal-1.png', [25, 25], [2.2, 2.2], ['clutter', 'framing'], ['crystal', 'ore', 'reward', 'cluster-right'], 'warped-caves'),

  asset('crypt-column', 'bonevault', 'gothic-church/column.png', [114, 190], [5.2, 8.7], ['structural', 'framing', 'hero'], ['column', 'arch', 'tomb', 'landmark'], 'gothic-cemetery', 'medium'),
  asset('crypt-tree', 'bonevault', 'gothic-cemetery/tree.png', [166, 117], [9, 6.4], ['structural', 'framing'], ['dead-tree', 'graveyard', 'tomb', 'cluster-left'], 'gothic-cemetery', 'medium'),
  asset('crypt-statue', 'bonevault', 'gothic-cemetery/statue.png', [63, 75], [3.6, 4.3], ['hero', 'clutter'], ['statue', 'tomb', 'lore'], 'gothic-cemetery'),
  asset('crypt-stone', 'bonevault', 'gothic-cemetery/stone.png', [27, 33], [2.2, 2.7], ['clutter'], ['grave', 'stone', 'ground'], 'gothic-cemetery'),

  asset('ember-gate', 'emberdeep', 'emberdeep/gate.png', [48, 48], [5.2, 5.2], ['structural', 'hero', 'framing'], ['forge', 'gate', 'basalt', 'entrance'], 'emberdeep', 'medium'),
  asset('ember-stone-head', 'emberdeep', 'emberdeep/stone-head.png', [55, 51], [4, 3.7], ['structural', 'clutter'], ['basalt', 'stone', 'forge', 'cluster-left'], 'emberdeep'),
  asset('ember-stalactite', 'emberdeep', 'emberdeep/stalactite.png', [38, 53], [3.2, 4.5], ['hazard', 'framing'], ['lava', 'ceiling', 'danger'], 'emberdeep'),
  asset('ember-crystal', 'emberdeep', 'rocky-pass/crystal-1.png', [25, 25], [2.2, 2.2], ['clutter', 'hero'], ['crystal', 'glow', 'reward'], 'emberdeep'),
  asset('ember-crystal-cluster', 'emberdeep', 'rocky-pass/crystal-2.png', [26, 20], [2.6, 2], ['foliage', 'clutter'], ['crystal', 'magma', 'cluster-right'], 'emberdeep'),

  asset('snow-house', 'frostpeak', 'sunnyland-winter/house.png', [170, 126], [8.5, 6.3], ['structural', 'hero', 'framing'], ['shelter', 'snow', 'safe', 'landmark'], 'sunnyland-winter', 'medium'),
  asset('snow-pine', 'frostpeak', 'sunnyland-winter/pine-snow.png', [47, 99], [3.4, 7.2], ['foliage', 'framing'], ['snow', 'pine', 'cluster-left'], 'sunnyland-winter'),
  asset('snow-pine-shadow', 'frostpeak', 'sunnyland-winter/pine.png', [47, 99], [3.4, 7.2], ['foliage', 'framing'], ['pine', 'shadow', 'cluster-right'], 'sunnyland-winter'),
  asset('snow-tall-tree', 'frostpeak', 'sunnyland-winter/tall-tree.png', [89, 172], [5.2, 10], ['structural', 'hero', 'foliage'], ['ice', 'tree', 'landmark'], 'sunnyland-winter', 'medium'),
  asset('snow-fence', 'frostpeak', 'sunnyland-winter/fence.png', [96, 37], [5.2, 2], ['structural', 'clutter'], ['snow', 'fence', 'ground'], 'sunnyland-winter'),

  asset('desert-facade', 'sunscar', 'yeehaw/frontier-facade.png', [192, 176], [9, 8.25], ['structural', 'hero'], ['settlement', 'shade', 'frontier', 'landmark'], 'yeehaw', 'medium'),
  asset('desert-cactus', 'sunscar', 'yeehaw/cactus.png', [48, 64], [3, 4], ['structural', 'foliage', 'hero'], ['cactus', 'desert', 'cluster-left'], 'yeehaw'),
  asset('desert-sun', 'sunscar', 'yeehaw/sun.png', [192, 64], [6, 2], ['hero', 'framing'], ['sun', 'heat', 'landmark'], 'yeehaw'),
  asset('desert-poster', 'sunscar', 'yeehaw/wanted-poster.png', [16, 32], [1.2, 2.4], ['clutter', 'framing'], ['wanted', 'settlement', 'path'], 'yeehaw'),
  asset('desert-bottle', 'sunscar', 'yeehaw/bottle.png', [16, 32], [1.1, 2.2], ['clutter'], ['bottle', 'saloon', 'ground'], 'yeehaw'),
  asset('desert-tin-can', 'sunscar', 'yeehaw/tin-can.png', [16, 32], [1.1, 2.2], ['clutter'], ['tin', 'frontier', 'ground'], 'yeehaw'),

  asset('ruins-crystal-spire', 'skyglass', 'skyglass/crystal-1.png', [25, 25], [3.6, 3.6], ['structural', 'framing', 'hero'], ['glass', 'floating', 'sanctum', 'landmark'], 'skyglass', 'medium'),
  asset('ruins-crystal-cluster', 'skyglass', 'skyglass/crystal-2.png', [26, 20], [4.2, 3.3], ['hero', 'structural', 'clutter'], ['glass', 'floating', 'sanctum', 'cluster-left'], 'skyglass'),
  asset('ruins-crystal-a', 'skyglass', 'skyglass/crystal-1.png', [25, 25], [2.4, 2.4], ['clutter', 'hero'], ['glass', 'crystal', 'chime'], 'skyglass'),
  asset('ruins-crystal-b', 'skyglass', 'skyglass/crystal-2.png', [26, 20], [2.8, 2.2], ['clutter'], ['glass', 'crystal', 'path'], 'skyglass')
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

export function resolveStoryLevelAsset(biomeId: BiomeId, slot: Pick<StoryLevelSlot, 'semanticTags'>, role?: StoryLevelAssetRole, salt = 0, diversify = false, permittedFamilies?: string[]) {
  const ranked = STORY_LEVEL_ASSET_REGISTRY
    .filter((candidate) => !permittedFamilies?.length || permittedFamilies.includes(candidate.family))
    .map((candidate) => ({ candidate, score: scoreAsset(candidate, biomeId, slot.semanticTags, role) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((left, right) => right.score - left.score || left.candidate.id.localeCompare(right.candidate.id));
  if (ranked.length === 0) return undefined;
  if (diversify) {
    const compatible = role ? ranked.filter(({ candidate }) => candidate.roles.includes(role)) : ranked;
    const pool = compatible.length > 0 ? compatible : ranked;
    return pool[Math.abs(salt) % pool.length].candidate;
  }
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

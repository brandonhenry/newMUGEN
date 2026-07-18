import type { StoryAdventureWorldId, StoryResourceKind, StoryResourceRarity } from './types';

export type StoryBiomeId = Exclude<StoryAdventureWorldId, 'world-route'>;
export type StoryArmorSlot = 'head' | 'coat' | 'boots';
export type StoryCraftedItemKind = 'armor' | 'consumable' | 'utility';
export type StoryAdventureStatName = 'power' | 'vitality' | 'agility' | 'guard' | 'critical' | 'insight';
export type StoryEffectKind = 'attack' | 'guard' | 'speed' | 'critical' | 'xp' | 'gather' | 'breath' | 'lava' | 'icicle' | 'sand' | 'wind';
export type StoryCraftingContext = { kind: 'field' } | { kind: 'specialist'; biomeId: StoryBiomeId } | { kind: 'workbench' };
export type StoryResourceImpactMaterial = 'foliage' | 'wood' | 'stone' | 'metal' | 'bone' | 'crystal' | 'ice' | 'volcanic';

export type StoryResourceDefinition = {
  id: string;
  label: string;
  biomeId?: StoryBiomeId;
  kind: StoryResourceKind;
  rarity: StoryResourceRarity;
  color: string;
  impactMaterial: StoryResourceImpactMaterial;
  iconPath: string;
  nodeFrames: readonly [string, string, string];
};

export type StoryConsumableEffect = {
  kind?: StoryEffectKind;
  multiplier?: number;
  durationMs?: number;
  healing?: number;
  label: string;
};

export type StoryRecipeDefinition = {
  id: string;
  label: string;
  biomeId?: StoryBiomeId;
  kind: StoryCraftedItemKind;
  iconPath: string;
  ingredients: Record<string, number>;
  armor?: { slot: StoryArmorSlot; stat: StoryAdventureStatName; setId: StoryBiomeId };
  consumable?: StoryConsumableEffect;
  utilityId?: string;
};

export type StoryActiveEffect = {
  recipeId: string;
  kind: StoryEffectKind;
  multiplier: number;
  expiresAt: number;
};

export type StoryAdventureInventory = {
  materials: Record<string, number>;
  consumables: Record<string, number>;
  armor: string[];
};

export const STORY_BIOME_IDS: StoryBiomeId[] = ['greenhollow', 'thornwood', 'ironroot', 'bonevault', 'emberdeep', 'frostpeak', 'sunscar', 'skyglass'];

const UNIVERSAL: Array<[string, string, StoryResourceKind, string]> = [
  ['routewood', 'Routewood', 'tree', '#ba7b4d'],
  ['wildberry', 'Wildberry', 'berry', '#e95c9a'],
  ['medicinal-herb', 'Medicinal Herb', 'plant', '#65d684'],
  ['fieldstone', 'Fieldstone', 'rock', '#a8acb5']
];

const BIOME_MATERIALS: Record<StoryBiomeId, Array<[string, string, StoryResourceKind, string]>> = {
  greenhollow: [['greenbark', 'Greenbark', 'tree', '#79b85a'], ['brook-berry', 'Brook Berry', 'berry', '#65c5d8'], ['copperleaf', 'Copperleaf', 'plant', '#c8894d'], ['gale-seed', 'Gale Seed', 'plant', '#ecf7a1']],
  thornwood: [['ironbark', 'Ironbark', 'tree', '#66735a'], ['thornberry', 'Thornberry', 'berry', '#bd456f'], ['glowcap', 'Glowcap', 'plant', '#79efc4'], ['heartwood-amber', 'Heartwood Amber', 'tree', '#ffc65c']],
  ironroot: [['coal', 'Coal', 'rock', '#4b4650'], ['iron-ore', 'Iron Ore', 'ore', '#969ca7'], ['silver-ore', 'Silver Ore', 'ore', '#d8e2ec'], ['sunstone', 'Sunstone', 'ore', '#ffd45f']],
  bonevault: [['gravebone', 'Gravebone', 'rock', '#ddd5ca'], ['grave-moss', 'Grave Moss', 'plant', '#687e62'], ['soul-salt', 'Soul Salt', 'ore', '#a8d8dc'], ['violet-core', 'Violet Core', 'ore', '#bd76ff']],
  emberdeep: [['basalt', 'Basalt', 'rock', '#56424a'], ['obsidian', 'Obsidian', 'ore', '#332b4d'], ['fire-blossom', 'Fire Blossom', 'plant', '#ff764a'], ['emberheart', 'Emberheart', 'ore', '#ffcf55']],
  frostpeak: [['frost-pine', 'Frost Pine', 'tree', '#8cb4bd'], ['iceberry', 'Iceberry', 'berry', '#6cd5f5'], ['glacial-crystal', 'Glacial Crystal', 'ore', '#b5efff'], ['everfrost', 'Everfrost', 'ore', '#f0ffff']],
  sunscar: [['palmwood', 'Palmwood', 'tree', '#ba8851'], ['cactus-fruit', 'Cactus Fruit', 'berry', '#e35a73'], ['glass-sand', 'Glass Sand', 'rock', '#f3d08b'], ['sunscar-opal', 'Sunscar Opal', 'ore', '#ffef9b']],
  skyglass: [['cloud-reed', 'Cloud Reed', 'plant', '#b8efff'], ['charged-ore', 'Charged Ore', 'ore', '#6ea8ff'], ['prism-bloom', 'Prism Bloom', 'plant', '#f08bdc'], ['skyglass-prism', 'Skyglass Prism', 'ore', '#f4d8ff']]
};

const RARITIES: StoryResourceRarity[] = ['common', 'uncommon', 'rare', 'legendary'];
const nodeFrames = (atlas: string, id: string) => [`/story/resources/nodes/${atlas}/${id}-intact.png`, `/story/resources/nodes/${atlas}/${id}-damaged.png`, `/story/resources/nodes/${atlas}/${id}-depleted.png`] as const;

export function storyResourceImpactMaterial(id: string, kind: StoryResourceKind, biomeId?: StoryBiomeId): StoryResourceImpactMaterial {
  if (id === 'gravebone') return 'bone';
  if (kind === 'plant' || kind === 'berry') return 'foliage';
  if (kind === 'tree') return 'wood';
  if (biomeId === 'frostpeak' && kind === 'ore') return 'ice';
  if (['sunstone', 'soul-salt', 'violet-core', 'obsidian', 'sunscar-opal', 'charged-ore', 'skyglass-prism'].includes(id)) return 'crystal';
  if (biomeId === 'emberdeep') return 'volcanic';
  return kind === 'ore' ? 'metal' : 'stone';
}

export const STORY_RESOURCES: StoryResourceDefinition[] = [
  ...UNIVERSAL.map(([id, label, kind, color], index) => ({ id, label, kind, color, impactMaterial: storyResourceImpactMaterial(id, kind), rarity: index < 2 ? 'common' as const : 'uncommon' as const, iconPath: `/story/resources/icons/universal/${id}.png`, nodeFrames: nodeFrames('universal', id) })),
  ...STORY_BIOME_IDS.flatMap((biomeId) => BIOME_MATERIALS[biomeId].map(([id, label, kind, color], index) => ({ id, label, kind, color, biomeId, impactMaterial: storyResourceImpactMaterial(id, kind, biomeId), rarity: RARITIES[index], iconPath: `/story/resources/icons/${biomeId}/${id}.png`, nodeFrames: nodeFrames(biomeId, id) })))
];

export const STORY_RESOURCE_BY_ID = Object.fromEntries(STORY_RESOURCES.map((resource) => [resource.id, resource])) as Record<string, StoryResourceDefinition>;

export const STORY_BIOME_RESOURCE_IDS = Object.fromEntries(STORY_BIOME_IDS.map((biomeId) => [biomeId, BIOME_MATERIALS[biomeId].map(([id]) => id)])) as Record<StoryBiomeId, [string, string, string, string]>;

const BIOME_META: Record<StoryBiomeId, { set: string; stats: [StoryAdventureStatName, StoryAdventureStatName, StoryAdventureStatName]; potion: [string, string, StoryEffectKind, number]; utility: [string, string] }> = {
  greenhollow: { set: 'Wayfarer', stats: ['insight', 'vitality', 'agility'], potion: ['gale-tonic', 'Gale Tonic', 'speed', 1.15], utility: ['field-pouch', 'Field Pouch'] },
  thornwood: { set: 'Heartwood', stats: ['critical', 'guard', 'power'], potion: ['briar-brew', 'Briar Brew', 'attack', 1.15], utility: ['felling-wrap', 'Felling Wrap'] },
  ironroot: { set: 'Delver', stats: ['insight', 'guard', 'power'], potion: ['miners-focus', "Miner's Focus", 'gather', 1.35], utility: ['prospector-kit', 'Prospector Kit'] },
  bonevault: { set: 'Warden', stats: ['insight', 'vitality', 'guard'], potion: ['spirit-ward', 'Spirit Ward', 'guard', 0.5], utility: ['soul-sieve', 'Soul Sieve'] },
  emberdeep: { set: 'Cinder', stats: ['critical', 'power', 'guard'], potion: ['fireguard', 'Fireguard', 'lava', 0.25], utility: ['basalt-flask', 'Basalt Flask'] },
  frostpeak: { set: 'Rime', stats: ['insight', 'vitality', 'guard'], potion: ['rimeguard', 'Rimeguard', 'icicle', 0.25], utility: ['thermal-lining', 'Thermal Lining'] },
  sunscar: { set: 'Dune', stats: ['insight', 'vitality', 'agility'], potion: ['sandstep', 'Sandstep', 'sand', 0], utility: ['sand-cleats', 'Sand Cleats'] },
  skyglass: { set: 'Prism', stats: ['critical', 'insight', 'agility'], potion: ['windward', 'Windward', 'wind', 0], utility: ['wind-sail', 'Wind Sail'] }
};

const iconPath = (biome: StoryBiomeId | 'universal', id: string) => `/story/resources/icons/${biome}/${id}.png`;
const armorIngredients = (biomeId: StoryBiomeId, slot: StoryArmorSlot) => {
  const [common, uncommon, rare, legendary] = STORY_BIOME_RESOURCE_IDS[biomeId];
  if (slot === 'head') return { routewood: 6, [common]: 4, [uncommon]: 2 };
  if (slot === 'coat') return { routewood: 8, fieldstone: 4, [common]: 6, [uncommon]: 4, [legendary]: 1 };
  return { routewood: 6, fieldstone: 4, [common]: 5, [rare]: 2 };
};

const ARMOR_SLOTS: Array<[StoryArmorSlot, string]> = [['head', 'Hood'], ['coat', 'Coat'], ['boots', 'Boots']];
const ARMOR_RECIPES: StoryRecipeDefinition[] = STORY_BIOME_IDS.flatMap((biomeId) => ARMOR_SLOTS.map(([slot, suffix], index) => {
  const id = `${biomeId}-${slot}`;
  return { id, label: `${BIOME_META[biomeId].set} ${suffix}`, biomeId, kind: 'armor', iconPath: iconPath(biomeId, id), ingredients: armorIngredients(biomeId, slot), armor: { slot, stat: BIOME_META[biomeId].stats[index], setId: biomeId } };
}));

const STARTER_CONSUMABLES: StoryRecipeDefinition[] = [
  { id: 'berry-tonic', label: 'Berry Tonic', kind: 'consumable', iconPath: iconPath('universal', 'berry-tonic'), ingredients: { wildberry: 3, 'medicinal-herb': 1 }, consumable: { healing: 30, label: 'Restores 30 health' } },
  { id: 'herbal-draught', label: 'Herbal Draught', kind: 'consumable', iconPath: iconPath('universal', 'herbal-draught'), ingredients: { wildberry: 2, 'medicinal-herb': 3 }, consumable: { healing: 60, label: 'Restores 60 health' } },
  { id: 'stoneguard-tonic', label: 'Stoneguard Tonic', kind: 'consumable', iconPath: iconPath('universal', 'stoneguard-tonic'), ingredients: { 'medicinal-herb': 2, fieldstone: 3 }, consumable: { kind: 'guard', multiplier: 0.8, durationMs: 120_000, label: '20% less damage for 2 minutes' } },
  { id: 'gatherers-tea', label: "Gatherer's Tea", kind: 'consumable', iconPath: iconPath('universal', 'gatherers-tea'), ingredients: { wildberry: 2, 'medicinal-herb': 2, routewood: 1 }, consumable: { kind: 'gather', multiplier: 1.5, durationMs: 180_000, label: '50% more materials for 3 minutes' } }
];

const REGIONAL_CONSUMABLES: StoryRecipeDefinition[] = STORY_BIOME_IDS.map((biomeId) => {
  const [id, label, kind, multiplier] = BIOME_META[biomeId].potion;
  const [common, , rare] = STORY_BIOME_RESOURCE_IDS[biomeId];
  return { id, label, biomeId, kind: 'consumable', iconPath: iconPath(biomeId, id), ingredients: { wildberry: 2, 'medicinal-herb': 1, [common]: 2, [rare]: 1 }, consumable: { kind, multiplier, durationMs: 180_000, label: `${label} active for 3 minutes` } };
});

const ADVANCED: Array<[string, string, StoryBiomeId, StoryBiomeId, StoryConsumableEffect]> = [
  ['wildheart-elixir', 'Wildheart Elixir', 'greenhollow', 'thornwood', { kind: 'gather', multiplier: 2, durationMs: 300_000, label: 'Double gathering yield for 5 minutes' }],
  ['titan-elixir', 'Titan Elixir', 'ironroot', 'bonevault', { kind: 'attack', multiplier: 1.25, durationMs: 120_000, label: '25% more attack for 2 minutes' }],
  ['tempered-elixir', 'Tempered Elixir', 'emberdeep', 'frostpeak', { kind: 'lava', multiplier: 0, durationMs: 180_000, label: 'Lava immunity for 3 minutes' }],
  ['pathfinder-elixir', 'Pathfinder Elixir', 'sunscar', 'skyglass', { kind: 'xp', multiplier: 1.25, durationMs: 300_000, label: '25% more XP for 5 minutes' }]
];

const ADVANCED_CONSUMABLES: StoryRecipeDefinition[] = ADVANCED.map(([id, label, first, second, consumable]) => ({
  id, label, kind: 'consumable', iconPath: iconPath('universal', id), ingredients: { 'medicinal-herb': 2, wildberry: 2, [STORY_BIOME_RESOURCE_IDS[first][3]]: 1, [STORY_BIOME_RESOURCE_IDS[second][3]]: 1 }, consumable
}));

const UTILITY_RECIPES: StoryRecipeDefinition[] = STORY_BIOME_IDS.map((biomeId) => {
  const [id, label] = BIOME_META[biomeId].utility;
  const [common, uncommon, rare, legendary] = STORY_BIOME_RESOURCE_IDS[biomeId];
  return { id, label, biomeId, kind: 'utility', iconPath: iconPath(biomeId, id), ingredients: { routewood: 8, fieldstone: 8, [common]: 4, [uncommon]: 3, [rare]: 2, [legendary]: 1 }, utilityId: id };
});

export const STORY_RECIPES: StoryRecipeDefinition[] = [...ARMOR_RECIPES, ...STARTER_CONSUMABLES, ...REGIONAL_CONSUMABLES, ...ADVANCED_CONSUMABLES, ...UTILITY_RECIPES];
export const STORY_RECIPE_BY_ID = Object.fromEntries(STORY_RECIPES.map((recipe) => [recipe.id, recipe])) as Record<string, StoryRecipeDefinition>;
export const STORY_STARTER_RECIPE_IDS = STARTER_CONSUMABLES.map(({ id }) => id);

export function recipesLearnedFromSpecialist(biomeId: StoryBiomeId) {
  return ARMOR_RECIPES.filter((recipe) => recipe.biomeId === biomeId).map(({ id }) => id);
}

export function recipeLearnedFromRareResource(resourceId: string) {
  const biomeId = STORY_BIOME_IDS.find((candidate) => STORY_BIOME_RESOURCE_IDS[candidate][2] === resourceId);
  return biomeId ? REGIONAL_CONSUMABLES.find((recipe) => recipe.biomeId === biomeId)?.id : undefined;
}

export function recipeLearnedFromMastery(biomeId: StoryBiomeId) {
  return UTILITY_RECIPES.find((recipe) => recipe.biomeId === biomeId)?.id;
}

export function advancedRecipesLearned(materials: Record<string, number>) {
  return ADVANCED.filter(([, , first, second]) => materials[STORY_BIOME_RESOURCE_IDS[first][3]] > 0 && materials[STORY_BIOME_RESOURCE_IDS[second][3]] > 0).map(([id]) => id);
}

export function canCraftRecipe(recipe: StoryRecipeDefinition, inventory: StoryAdventureInventory, context: StoryCraftingContext) {
  if (recipe.kind === 'armor' && context.kind === 'field') return false;
  if (recipe.kind === 'armor' && context.kind === 'specialist' && recipe.biomeId !== context.biomeId) return false;
  if (recipe.kind === 'armor' && inventory.armor.includes(recipe.id)) return false;
  return Object.entries(recipe.ingredients).every(([id, quantity]) => (inventory.materials[id] ?? 0) >= quantity);
}

export function storyRecipeStationLabel(recipe: StoryRecipeDefinition) {
  return recipe.kind === 'armor' ? 'Specialist or Central Workbench' : 'Field craft';
}

export const STORY_ARMOR_SET_BONUSES: Record<StoryBiomeId, string> = {
  greenhollow: '+25% plant and berry yield', thornwood: '+25% wood yield', ironroot: '+1 ore yield', bonevault: '-30% knockback', emberdeep: '-50% lava damage', frostpeak: '-50% icicle damage', sunscar: '-50% sinking-sand slowdown', skyglass: '-50% wind push'
};

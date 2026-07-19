import { STORY_RESOURCE_BY_ID, STORY_RESOURCES } from './adventureCrafting';
import { sanitizeAdventureProgress, type StoryAdventureProgressV1 } from './adventureProgress';

export type StoryMarketCurioDefinition = {
  id: string;
  label: string;
  biomeId: string;
  price: number;
  iconPath: string;
  lore: string;
};

export const STORY_REQUIRED_MARKET_GOODS = [
  { resourceId: 'artisan-thread', label: 'Artisan Thread', price: 12 },
  { resourceId: 'precision-clasp', label: 'Precision Clasp', price: 18 },
  { resourceId: 'alchemical-vial', label: 'Alchemical Vial', price: 15 },
  { resourceId: 'guild-catalyst', label: 'Guild Catalyst', price: 40 }
] as const;

export const STORY_MARKET_CURIOS: StoryMarketCurioDefinition[] = [
  ['greenhollow-curio', 'Millwright Seal', 'greenhollow', 80, '/story/ecology/atlases/svor/key1.png', 'A brass guild seal carried by the first route surveyors.'],
  ['thornwood-curio', 'Sleeping Thornseed', 'thornwood', 90, '/story/ecology/atlases/svor/mushroom-.png', 'It curls away from an open flame.'],
  ['ironroot-curio', 'Silent Miner Badge', 'ironroot', 100, '/story/ecology/atlases/svor/key2.png', 'Stamped for a shift that never returned.'],
  ['bonevault-curio', 'Gravekeeper Token', 'bonevault', 110, '/story/ecology/atlases/svor/skull.png', 'A promise to remember a name.'],
  ['emberdeep-curio', 'Banked Ember Core', 'emberdeep', 120, '/story/ecology/atlases/svor/gemstone2-.png', 'Warm, but never hot enough to burn.'],
  ['frostpeak-curio', 'Expedition Crest', 'frostpeak', 110, '/story/ecology/atlases/svor/gemstone1-.png', 'Its enamel survived the whiteout.'],
  ['sunscar-curio', 'Sunscar Waykey', 'sunscar', 100, '/story/ecology/atlases/svor/key1.png', 'Cut for a door buried under the old road.'],
  ['skyglass-curio', 'Prism Ring', 'skyglass', 130, '/story/ecology/atlases/svor/mysterious-object-.png', 'It hums when the high bridges move.']
].map(([id, label, biomeId, price, iconPath, lore]) => ({ id: String(id), label: String(label), biomeId: String(biomeId), price: Number(price), iconPath: String(iconPath), lore: String(lore) }));

export const STORY_MATERIAL_SELL_VALUES = { common: 2, uncommon: 5, rare: 12, legendary: 30 } as const;

export function storyRouteMarketStock(daySeed = '') {
  const hash = [...daySeed].reduce((value, character) => Math.imul(value ^ character.charCodeAt(0), 16777619) >>> 0, 2166136261);
  return {
    required: STORY_REQUIRED_MARKET_GOODS,
    curio: STORY_MARKET_CURIOS[hash % STORY_MARKET_CURIOS.length]
  };
}

export function buyStoryMarketMaterial(progress: StoryAdventureProgressV1, resourceId: string, quantity = 1) {
  const current = sanitizeAdventureProgress(progress);
  const good = STORY_REQUIRED_MARKET_GOODS.find((entry) => entry.resourceId === resourceId);
  const amount = Math.max(1, Math.min(99, Math.floor(quantity)));
  const cost = good ? good.price * amount : 0;
  if (!good || current.routeCoins < cost || (current.inventory.materials[resourceId] ?? 0) + amount > 999) return { progress: current, purchased: false, cost: 0 };
  return {
    progress: sanitizeAdventureProgress({ ...current, routeCoins: current.routeCoins - cost, inventory: { ...current.inventory, materials: { ...current.inventory.materials, [resourceId]: (current.inventory.materials[resourceId] ?? 0) + amount } } }),
    purchased: true, cost
  };
}

export function buyStoryMarketCurio(progress: StoryAdventureProgressV1, curioId: string) {
  const current = sanitizeAdventureProgress(progress);
  const curio = STORY_MARKET_CURIOS.find((entry) => entry.id === curioId);
  if (!curio || current.collectedCurios.includes(curioId) || current.routeCoins < curio.price) return { progress: current, purchased: false, cost: 0 };
  return { progress: sanitizeAdventureProgress({ ...current, routeCoins: current.routeCoins - curio.price, collectedCurios: [...current.collectedCurios, curioId] }), purchased: true, cost: curio.price };
}

export function sellStoryMarketMaterial(progress: StoryAdventureProgressV1, resourceId: string, quantity = 1) {
  const current = sanitizeAdventureProgress(progress);
  const resource = STORY_RESOURCE_BY_ID[resourceId];
  const owned = current.inventory.materials[resourceId] ?? 0;
  const amount = Math.max(1, Math.min(owned, Math.floor(quantity)));
  if (!resource || resource.acquisition !== 'harvest' || owned <= 0) return { progress: current, sold: false, proceeds: 0 };
  const proceeds = STORY_MATERIAL_SELL_VALUES[resource.rarity] * amount;
  const materials = { ...current.inventory.materials, [resourceId]: owned - amount };
  return { progress: sanitizeAdventureProgress({ ...current, routeCoins: current.routeCoins + proceeds, inventory: { ...current.inventory, materials } }), sold: true, proceeds };
}

export const STORY_SELLABLE_MATERIALS = STORY_RESOURCES.filter((resource) => resource.acquisition === 'harvest');

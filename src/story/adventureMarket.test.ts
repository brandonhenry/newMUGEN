import { describe, expect, it } from 'vitest';
import { STORY_RECIPES, STORY_RESOURCES } from './adventureCrafting';
import { STORY_MARKET_CURIOS, STORY_REQUIRED_MARKET_GOODS, buyStoryMarketCurio, buyStoryMarketMaterial, sellStoryMarketMaterial, storyRouteMarketStock } from './adventureMarket';
import { craftAdventureRecipe, makeDefaultAdventureProgress, sanitizeAdventureProgress } from './adventureProgress';

describe('Route Market and non-mineable crafting goods', () => {
  it('keeps every required component in permanent stock and enforces funds/caps', () => {
    expect(storyRouteMarketStock('2026-07-19').required).toEqual(STORY_REQUIRED_MARKET_GOODS);
    expect(STORY_REQUIRED_MARKET_GOODS.map(({ price }) => price)).toEqual([12, 18, 15, 40]);
    let progress = sanitizeAdventureProgress({ ...makeDefaultAdventureProgress(), routeCoins: 100 });
    const purchased = buyStoryMarketMaterial(progress, 'artisan-thread', 2);
    expect(purchased.purchased).toBe(true);
    expect(purchased.cost).toBe(24);
    expect(purchased.progress.inventory.materials['artisan-thread']).toBe(2);
    progress = purchased.progress;
    expect(buyStoryMarketMaterial(progress, 'guild-catalyst', 99).purchased).toBe(false);
    expect(sellStoryMarketMaterial(progress, 'artisan-thread').sold).toBe(false);
  });

  it('sells only harvested goods at 2/5/12/30 and never permanent goods', () => {
    for (const [rarity, proceeds] of [['common', 2], ['uncommon', 5], ['rare', 12], ['legendary', 30]] as const) {
      const resource = STORY_RESOURCES.find((entry) => entry.acquisition === 'harvest' && entry.rarity === rarity)!;
      const progress = sanitizeAdventureProgress({ ...makeDefaultAdventureProgress(), inventory: { materials: { [resource.id]: 2 }, consumables: {}, armor: [] } });
      expect(sellStoryMarketMaterial(progress, resource.id).proceeds).toBe(proceeds);
    }
  });

  it('collects each curio once and all 48 recipes remain craftable with market stock', () => {
    let progress = sanitizeAdventureProgress({ ...makeDefaultAdventureProgress(), routeCoins: 99_999, knownRecipes: STORY_RECIPES.map(({ id }) => id), inventory: { materials: Object.fromEntries(STORY_RESOURCES.map(({ id }) => [id, 999])), consumables: {}, armor: [] } });
    for (const curio of STORY_MARKET_CURIOS) {
      const result = buyStoryMarketCurio(progress, curio.id);
      expect(result.purchased).toBe(true);
      progress = result.progress;
      expect(buyStoryMarketCurio(progress, curio.id).purchased).toBe(false);
    }
    for (const recipe of STORY_RECIPES) {
      const context = recipe.kind === 'armor' ? { kind: 'specialist' as const, biomeId: recipe.biomeId! } : { kind: 'field' as const };
      const result = craftAdventureRecipe(progress, recipe.id, context);
      expect(result.crafted, recipe.id).toBe(true);
      progress = result.progress;
    }
  });
});

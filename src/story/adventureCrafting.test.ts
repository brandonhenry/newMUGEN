import { describe, expect, it, vi } from 'vitest';
import {
  STORY_BIOME_IDS,
  STORY_BIOME_RESOURCE_IDS,
  STORY_RECIPES,
  STORY_RESOURCES,
  STORY_STARTER_RECIPE_IDS,
  advancedRecipesLearned,
  recipeLearnedFromMastery,
  recipeLearnedFromRareResource,
  recipesLearnedFromSpecialist,
  storyResourceImpactMaterial
} from './adventureCrafting';
import {
  addAdventureMaterial,
  consumeAdventureItem,
  craftAdventureRecipe,
  equipAdventureArmor,
  getAdventureDerivedStats,
  makeDefaultAdventureProgress,
  sanitizeAdventureProgress,
  unlockAdventureMasteryRecipe,
  unlockAdventureSpecialistRecipes
} from './adventureProgress';

describe('Adventure crafting catalog', () => {
  it('defines 36 unique resources and exactly 48 valid unique recipes', () => {
    expect(STORY_RESOURCES).toHaveLength(36);
    expect(new Set(STORY_RESOURCES.map(({ id }) => id)).size).toBe(36);
    expect(STORY_RECIPES).toHaveLength(48);
    expect(new Set(STORY_RECIPES.map(({ id }) => id)).size).toBe(48);
    const resources = new Set(STORY_RESOURCES.map(({ id }) => id));
    for (const recipe of STORY_RECIPES) {
      expect(Object.keys(recipe.ingredients).length, recipe.id).toBeGreaterThan(0);
      expect(Object.keys(recipe.ingredients).every((id) => resources.has(id)), recipe.id).toBe(true);
      expect(Object.values(recipe.ingredients).every((quantity) => Number.isInteger(quantity) && quantity > 0), recipe.id).toBe(true);
    }
    expect(STORY_RECIPES.filter(({ kind }) => kind === 'armor')).toHaveLength(24);
    expect(STORY_RECIPES.filter(({ kind }) => kind === 'consumable')).toHaveLength(16);
    expect(STORY_RECIPES.filter(({ kind }) => kind === 'utility')).toHaveLength(8);
  });

  it('maps each resource to a specific physical impact family', () => {
    expect(storyResourceImpactMaterial('wildberry', 'berry')).toBe('foliage');
    expect(storyResourceImpactMaterial('routewood', 'tree')).toBe('wood');
    expect(storyResourceImpactMaterial('fieldstone', 'rock')).toBe('stone');
    expect(storyResourceImpactMaterial('iron-ore', 'ore', 'ironroot')).toBe('metal');
    expect(storyResourceImpactMaterial('gravebone', 'rock', 'bonevault')).toBe('bone');
    expect(storyResourceImpactMaterial('obsidian', 'ore', 'emberdeep')).toBe('crystal');
    expect(storyResourceImpactMaterial('everfrost', 'ore', 'frostpeak')).toBe('ice');
    expect(storyResourceImpactMaterial('basalt', 'rock', 'emberdeep')).toBe('volcanic');
    expect(new Set(STORY_RESOURCES.map(({ impactMaterial }) => impactMaterial))).toEqual(new Set(['foliage', 'wood', 'stone', 'metal', 'bone', 'crystal', 'ice', 'volcanic']));
  });

  it('discovers starter, specialist, rare, mastery, and paired legendary recipes naturally', () => {
    let progress = makeDefaultAdventureProgress();
    expect(progress.knownRecipes).toEqual(STORY_STARTER_RECIPE_IDS);
    for (const biome of STORY_BIOME_IDS) {
      const specialist = unlockAdventureSpecialistRecipes(progress, biome);
      expect(specialist.learned).toEqual(recipesLearnedFromSpecialist(biome));
      expect(specialist.learned).toHaveLength(3);
      const mastery = unlockAdventureMasteryRecipe(specialist.progress, biome);
      expect(mastery.learned).toEqual([recipeLearnedFromMastery(biome)]);
      const rare = STORY_BIOME_RESOURCE_IDS[biome][2];
      expect(addAdventureMaterial(mastery.progress, rare, 1).learned).toContain(recipeLearnedFromRareResource(rare));
    }
    const [greenLegendary] = [STORY_BIOME_RESOURCE_IDS.greenhollow[3]];
    progress = addAdventureMaterial(progress, greenLegendary, 1).progress;
    expect(advancedRecipesLearned(progress.inventory.materials)).toEqual([]);
    progress = addAdventureMaterial(progress, STORY_BIOME_RESOURCE_IDS.thornwood[3], 1).progress;
    expect(progress.knownRecipes).toContain('wildheart-elixir');
  });

  it('crafts atomically, enforces armor stations, equips slots, and grants full-set bonuses', () => {
    let progress = unlockAdventureSpecialistRecipes(makeDefaultAdventureProgress(), 'ironroot').progress;
    const armorIds = recipesLearnedFromSpecialist('ironroot');
    const ingredients = armorIds.flatMap((id) => Object.entries(STORY_RECIPES.find((recipe) => recipe.id === id)!.ingredients));
    const totals = Object.fromEntries(ingredients.map(([id]) => [id, 99]));
    progress = sanitizeAdventureProgress({ ...progress, inventory: { ...progress.inventory, materials: totals } });
    const fieldAttempt = craftAdventureRecipe(progress, armorIds[0], { kind: 'field' });
    expect(fieldAttempt.crafted).toBe(false);
    const before = { ...progress.inventory.materials };
    const wrongSpecialist = craftAdventureRecipe(progress, armorIds[0], { kind: 'specialist', biomeId: 'greenhollow' });
    expect(wrongSpecialist.progress.inventory.materials).toEqual(before);
    for (const id of armorIds) {
      const crafted = craftAdventureRecipe(progress, id, { kind: 'workbench' });
      expect(crafted.crafted).toBe(true);
      progress = equipAdventureArmor(crafted.progress, id);
    }
    expect(Object.values(progress.equippedArmor)).toEqual(expect.arrayContaining(armorIds));
    expect(getAdventureDerivedStats(progress).oreYieldBonus).toBe(1);
    expect(craftAdventureRecipe(progress, armorIds[0], { kind: 'workbench' }).crafted).toBe(false);
  });

  it('caps inventory and refreshes equal potion effects without stacking different kinds', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T12:00:00Z'));
    let progress = sanitizeAdventureProgress({
      ...makeDefaultAdventureProgress(),
      inventory: { materials: { routewood: 5_000 }, consumables: { 'stoneguard-tonic': 500, 'gatherers-tea': 2 }, armor: [] }
    });
    expect(progress.inventory.materials.routewood).toBe(999);
    expect(progress.inventory.consumables['stoneguard-tonic']).toBe(99);
    const first = consumeAdventureItem(progress, 'stoneguard-tonic', Date.now());
    const second = consumeAdventureItem(first.progress, 'stoneguard-tonic', Date.now() + 10_000);
    const third = consumeAdventureItem(second.progress, 'gatherers-tea', Date.now() + 20_000);
    expect(second.progress.activeEffects.filter(({ kind }) => kind === 'guard')).toHaveLength(1);
    expect(second.progress.activeEffects[0].expiresAt).toBeGreaterThan(first.progress.activeEffects[0].expiresAt);
    expect(new Set(third.progress.activeEffects.map(({ kind }) => kind))).toEqual(new Set(['guard', 'gather']));
    vi.useRealTimers();
  });

  it('completes a discovery, tonic, specialist armor, and full-set journey', () => {
    let progress = makeDefaultAdventureProgress();
    const biome = 'greenhollow' as const;
    const [common, uncommon, rare, legendary] = STORY_BIOME_RESOURCE_IDS[biome];

    for (const [resourceId, quantity] of [
      ['routewood', 99], ['fieldstone', 99], ['wildberry', 20], ['medicinal-herb', 20],
      [common, 99], [uncommon, 99], [rare, 99], [legendary, 4]
    ] as const) progress = addAdventureMaterial(progress, resourceId, quantity).progress;

    expect(progress.knownRecipes).toContain('gale-tonic');
    progress = unlockAdventureSpecialistRecipes(progress, biome).progress;
    progress = unlockAdventureMasteryRecipe(progress, biome).progress;

    const tonic = craftAdventureRecipe(progress, 'gatherers-tea', { kind: 'field' });
    expect(tonic.crafted).toBe(true);
    const used = consumeAdventureItem(tonic.progress, 'gatherers-tea', Date.now());
    expect(used.consumed).toBe(true);
    expect(used.progress.activeEffects.map(({ kind }) => kind)).toContain('gather');
    progress = used.progress;

    for (const recipeId of recipesLearnedFromSpecialist(biome)) {
      const crafted = craftAdventureRecipe(progress, recipeId, { kind: 'specialist', biomeId: biome });
      expect(crafted.crafted).toBe(true);
      progress = equipAdventureArmor(crafted.progress, recipeId);
    }

    expect(Object.values(progress.equippedArmor).filter(Boolean)).toHaveLength(3);
    expect(getAdventureDerivedStats(progress).plantYieldBonus).toBeGreaterThan(0);
  });
});

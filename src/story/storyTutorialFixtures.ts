import { makeDefaultStoryAvatar, STORY_AVATAR_SETS } from './avatarCatalog';
import { STORY_RECIPES, STORY_RESOURCES } from './adventureCrafting';
import { STORY_MOUNTS } from './adventureExploration';
import { makeDefaultAdventureProgress, writeAdventureProgress } from './adventureProgress';
import { STORY_ADVENTURE_REGION_IDS } from './adventureWorlds';
import { STORY_ROSTER_CHALLENGER_IDS } from './enemyRosterIds';
import { createStoryAvatar, setEquippedStoryAvatars, writeStoryProfile } from './profile';
import { STORY_PROFILE_STORAGE_KEY, type StoryAdventureWorldId, type StoryProfileV4 } from './types';

export const STORY_TUTORIAL_BASE_FIXTURE_IDS = [
  'entering-story-mode', 'avatar-styles-and-editing', 'central-hub-and-destinations', 'world-route-and-eight-realms',
  'story-controls', 'movement-basics', 'platforming-basics', 'adventure-hud', 'leveling-stats-and-respec', 'unlocking-roll',
  'story-attacks', 'story-projectiles', 'combat-stats', 'enemy-archetypes', 'enemy-behaviors-and-affixes',
  'encounter-zones', 'challengers-and-party-credit', 'damage-ko-and-respawn', 'surface-routes', 'atlas-progress',
  'waystones-and-safe-exit', 'chests-caches-and-relics', 'checkpoints-shortcuts-and-shrine', 'mechanical-traversal',
  'environmental-traversal', 'hazards-spikes-saws-lava-wind', 'hazards-sand-floors-icicles-drowning',
  'swimming-and-breath', 'npcs-and-services', 'daily-activities', 'wildlife-pickups-and-curios', 'harvesting-resources',
  'resource-rarity-and-respawning', 'material-and-recipe-discovery', 'crafting-stations-and-recipes',
  'consumables-and-effects', 'armor-and-set-bonuses', 'utility-unlocks', 'route-market', 'mount-basics',
  'mount-mastery-and-abilities', 'party-size-and-saved-heroes', 'solo-parties-and-switching', 'online-adventure-parties',
  'shared-hub-and-quick-match', 'greenhollow-showcase', 'thornwood-showcase', 'ironroot-showcase', 'bonevault-showcase',
  'emberdeep-showcase', 'frostpeak-showcase', 'sunscar-showcase', 'skyglass-showcase', 'unlocking-endless-descent',
  'endless-generated-floors', 'endless-instability', 'endless-loot-ledger', 'endless-events', 'endless-boss-and-banking',
  'endless-boons', 'endless-loss-and-coop'
] as const;

export type StoryTutorialBaseFixtureId = typeof STORY_TUTORIAL_BASE_FIXTURE_IDS[number];
export type StoryTutorialFixtureId = StoryTutorialBaseFixtureId | `${StoryTutorialBaseFixtureId}:${'arrival' | 'field-a' | 'field-b' | 'mastery' | 'floor-1' | 'floor-2' | 'floor-3' | 'floor-4'}`;

const BASE_FIXTURE_SET = new Set<string>(STORY_TUTORIAL_BASE_FIXTURE_IDS);
const BIOME_BY_FIXTURE: Array<[string, Exclude<StoryAdventureWorldId, 'world-route'>]> = STORY_ADVENTURE_REGION_IDS.map((id) => [id, id]);

function fixtureParts(value: string) {
  const [base, variant] = value.split(':');
  return { base, variant };
}

export function isStoryTutorialFixtureId(value: unknown): value is StoryTutorialFixtureId {
  if (typeof value !== 'string') return false;
  const { base, variant } = fixtureParts(value);
  return BASE_FIXTURE_SET.has(base) && (!variant || ['arrival', 'field-a', 'field-b', 'mastery', 'floor-1', 'floor-2', 'floor-3', 'floor-4'].includes(variant));
}

function makeTutorialProfile(heroCount: number) {
  let profile = writeStoryProfile({ ...makeDefaultStoryAvatar('NOVA'), avatarSet: 'crimson-ranger' });
  for (let index = 1; index < heroCount; index += 1) {
    profile = createStoryAvatar(profile, {
      ...makeDefaultStoryAvatar(['ECHO', 'EMBER', 'RUNE', 'SKY'][index - 1]),
      avatarSet: STORY_AVATAR_SETS[(index * 3) % STORY_AVATAR_SETS.length]
    }, 5);
  }
  return setEquippedStoryAvatars(profile, profile.avatars.map((slot) => slot.id), 5);
}

function storyBiomeForFixture(base: string): Exclude<StoryAdventureWorldId, 'world-route'> {
  return BIOME_BY_FIXTURE.find(([token]) => base.includes(token))?.[1]
    ?? (base.includes('lava') || base.includes('combat') || base.includes('enemy') || base.includes('challenger') ? 'emberdeep'
      : base.includes('swimming') || base.includes('drowning') ? 'frostpeak'
        : base.includes('sand') ? 'sunscar'
          : base.includes('environmental') ? 'skyglass'
            : base.includes('mechanical') ? 'ironroot'
              : 'greenhollow');
}

function storyMapRole(base: string, variant?: string) {
  if (variant && ['arrival', 'field-a', 'field-b', 'mastery'].includes(variant)) return variant;
  if (base.includes('mount') || base.includes('endless')) return 'mastery';
  if (base.includes('waystone') || base.includes('surface-routes')) return 'arrival';
  if (base.includes('npc') || base.includes('craft') || base.includes('market')) return 'field-b';
  return 'field-a';
}

function storyWorldForFixture(base: string): StoryAdventureWorldId | 'central' {
  if (['central-hub-and-destinations', 'story-controls', 'shared-hub-and-quick-match'].includes(base)) return 'central';
  if (['world-route-and-eight-realms', 'adventure-hud', 'leveling-stats-and-respec', 'checkpoints-shortcuts-and-shrine', 'party-size-and-saved-heroes', 'route-market'].includes(base)) return 'world-route';
  return storyBiomeForFixture(base);
}

function makeTutorialProgress(base: string) {
  const progress = makeDefaultAdventureProgress();
  const fullCollection = base.includes('showcase') || base.includes('atlas') || base.includes('mount') || base.includes('endless');
  progress.level = base === 'adventure-hud' ? 8 : 24;
  progress.xp = 72;
  progress.unspentPoints = base.includes('leveling') || base.includes('party-size') ? 7 : 2;
  progress.stats = {
    power: base.includes('combat-stats') ? 12 : 5,
    vitality: 6,
    agility: base.includes('unlocking-roll') || base.includes('movement') || fullCollection ? 10 : 5,
    guard: 6,
    critical: 7,
    insight: 5,
    partySize: base.includes('party') ? 4 : 2
  };
  progress.routeCoins = 2800;
  progress.relics = ['tutorial-relic-1', 'tutorial-relic-2', 'tutorial-relic-3'];
  progress.defeatedChallengerIds = STORY_ROSTER_CHALLENGER_IDS.slice(0, base.includes('party') ? 8 : 3);
  progress.partyFeatureRevealSeen = !base.includes('challengers-and-party-credit');
  progress.discoveries.biomes = fullCollection ? [...STORY_ADVENTURE_REGION_IDS] : [storyBiomeForFixture(base)];
  progress.discoveredSurfaceMaps = progress.discoveries.biomes.flatMap((id) => ['arrival', 'field-a', 'field-b', 'mastery'].map((role) => `${id}-${role}`));
  progress.discoveries.waystones = progress.discoveries.biomes.map((id) => `${id}-waystone-arrival`);
  progress.knownRecipes = STORY_RECIPES.map((recipe) => recipe.id);
  progress.discoveredMaterials = STORY_RESOURCES.map((resource) => resource.id);
  progress.inventory.materials = Object.fromEntries(STORY_RESOURCES.map((resource, index) => [resource.id, 12 + index % 9]));
  progress.inventory.consumables = Object.fromEntries(STORY_RECIPES.filter((recipe) => recipe.kind === 'consumable').slice(0, 6).map((recipe) => [recipe.id, 3]));
  progress.inventory.armor = STORY_RECIPES.filter((recipe) => recipe.kind === 'armor').map((recipe) => recipe.id);
  progress.utilityUnlocks = STORY_RECIPES.filter((recipe) => recipe.kind === 'utility').map((recipe) => recipe.id);
  progress.collectedCurios = ['woven-sun', 'root-cipher', 'glass-feather'];
  progress.wildlifeSightings = ['route-hare', 'bellwing-moth', 'dune-lizard'];
  progress.restoredShortcuts = progress.discoveries.biomes.map((id) => `${id}-shortcut`);
  progress.endlessUnlockedBiomes = fullCollection || base.includes('endless') ? [...STORY_ADVENTURE_REGION_IDS] : [];
  progress.bestDepthByBiome = Object.fromEntries(STORY_ADVENTURE_REGION_IDS.map((id, index) => [id, index + 4]));
  progress.mounts = Object.fromEntries(Object.values(STORY_MOUNTS).map((mount) => [mount.id, { unlocked: true, masteryRank: base.includes('mount-mastery') ? 8 : 4, masteryXp: 180, variants: [4, 7] }]));
  const armor = STORY_RECIPES.filter((recipe) => recipe.kind === 'armor' && recipe.armor?.setId === storyBiomeForFixture(base));
  progress.equippedArmor = {
    head: armor.find((recipe) => recipe.armor?.slot === 'head')?.id ?? null,
    coat: armor.find((recipe) => recipe.armor?.slot === 'coat')?.id ?? null,
    boots: armor.find((recipe) => recipe.armor?.slot === 'boots')?.id ?? null
  };
  return writeAdventureProgress(progress);
}

export function applyStoryTutorialFixture(id: StoryTutorialFixtureId): { screen: 'avatarCreator' | 'storyHub'; profile: StoryProfileV4 | null } {
  if (!isStoryTutorialFixtureId(id)) throw new Error(`Unknown Story tutorial fixture: ${id}`);
  const { base, variant } = fixtureParts(id);
  const creator = base === 'entering-story-mode';
  if (creator) window.localStorage.removeItem(STORY_PROFILE_STORAGE_KEY);
  const profile = creator ? null : makeTutorialProfile(base.includes('part') ? 4 : 1);
  makeTutorialProgress(base);
  window.localStorage.setItem('kore.story.hub.online.v1', 'offline');

  const url = new URL(window.location.href);
  ['storyWorld', 'storyLevel', 'storyPortal', 'storyX', 'storyY', 'storyEndlessSeed', 'storyFloor', 'storyRollShowcase', 'storyTutorialFixture'].forEach((key) => url.searchParams.delete(key));
  url.searchParams.set('storyTutorialFixture', id);
  if (!creator && base !== 'avatar-styles-and-editing') {
    const world = storyWorldForFixture(base);
    url.searchParams.set('storyWorld', world);
    if (world !== 'central' && world !== 'world-route') url.searchParams.set('storyLevel', `${world}-${storyMapRole(base, variant)}`);
    if (base === 'leveling-stats-and-respec' || base === 'checkpoints-shortcuts-and-shrine') url.searchParams.set('storyPortal', 'route-respec-shrine');
    if (base === 'route-market') url.searchParams.set('storyX', '19');
    if (base === 'unlocking-roll') url.searchParams.set('storyRollShowcase', '1');
    if (base.startsWith('endless-')) {
      url.searchParams.set('storyEndlessSeed', `tutorial-${base}`);
      const floor = variant?.startsWith('floor-') ? variant.slice(6) : base.includes('boss') || base.includes('boons') ? '4' : base.includes('instability') ? '3' : '1';
      url.searchParams.set('storyFloor', floor);
    }
  }
  window.history.replaceState({}, '', url);
  return { screen: creator || base === 'avatar-styles-and-editing' ? 'avatarCreator' : 'storyHub', profile };
}

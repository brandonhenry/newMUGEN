import type { StoryAdventureWorldId, StoryWorldThemeId } from './types';

export type StoryBiomeId = Exclude<StoryAdventureWorldId, 'world-route'>;

export type StoryBiomeVisualSetDefinition = {
  id: string;
  biomeId: StoryBiomeId;
  theme: StoryWorldThemeId;
  terrainKitId: string;
  propFamily: string;
  sourcePacks: string[];
  kind: 'primary' | 'backup';
};

const SETS: StoryBiomeVisualSetDefinition[] = [
  { id: 'greenhollow-primary', biomeId: 'greenhollow', theme: 'village', terrainKitId: 'village-source-terrain-v2', propFamily: 'gothic-town', sourcePacks: ['gothic-town'], kind: 'primary' },
  { id: 'greenhollow-backup-kings', biomeId: 'greenhollow', theme: 'village', terrainKitId: 'village-kings-source-terrain-v2', propFamily: 'kings-pigs', sourcePacks: ['kings-pigs'], kind: 'backup' },
  { id: 'thornwood-primary', biomeId: 'thornwood', theme: 'forest', terrainKitId: 'forest-source-terrain-v2', propFamily: 'thornwood', sourcePacks: ['thornwood', 'magical-road', 'gothic-cemetery', 'tall-forest'], kind: 'primary' },
  { id: 'thornwood-backup-pixel', biomeId: 'thornwood', theme: 'forest', terrainKitId: 'forest-pixel-source-terrain-v2', propFamily: 'pixel-thornwood', sourcePacks: ['pixel-thornwood'], kind: 'backup' },
  { id: 'ironroot-primary', biomeId: 'ironroot', theme: 'mine', terrainKitId: 'mine-source-terrain-v2', propFamily: 'warped-caves', sourcePacks: ['warped-caves', 'rocky-pass'], kind: 'primary' },
  { id: 'ironroot-backup-grafx', biomeId: 'ironroot', theme: 'mine', terrainKitId: 'mine-grafx-source-terrain-v2', propFamily: 'grafx-cave', sourcePacks: ['grafx-cave'], kind: 'backup' },
  { id: 'bonevault-primary', biomeId: 'bonevault', theme: 'crypt', terrainKitId: 'crypt-source-terrain-v2', propFamily: 'gothic-cemetery', sourcePacks: ['gothic-cemetery', 'gothic-church'], kind: 'primary' },
  { id: 'bonevault-backup-moon', biomeId: 'bonevault', theme: 'crypt', terrainKitId: 'crypt-moon-source-terrain-v2', propFamily: 'moon-graveyard', sourcePacks: ['moon-graveyard'], kind: 'backup' },
  { id: 'emberdeep-primary', biomeId: 'emberdeep', theme: 'underworld', terrainKitId: 'underworld-source-terrain-v2', propFamily: 'emberdeep', sourcePacks: ['emberdeep', 'moten-lava', 'rocky-pass'], kind: 'primary' },
  { id: 'emberdeep-backup-grafx', biomeId: 'emberdeep', theme: 'underworld', terrainKitId: 'underworld-grafx-source-terrain-v2', propFamily: 'grafx-ember', sourcePacks: ['grafx-ember', 'seasonal'], kind: 'backup' },
  { id: 'frostpeak-primary', biomeId: 'frostpeak', theme: 'snow', terrainKitId: 'snow-source-terrain-v2', propFamily: 'sunnyland-winter', sourcePacks: ['sunnyland-winter'], kind: 'primary' },
  { id: 'frostpeak-backup-seasonal', biomeId: 'frostpeak', theme: 'snow', terrainKitId: 'snow-seasonal-source-terrain-v2', propFamily: 'seasonal', sourcePacks: ['seasonal'], kind: 'backup' },
  { id: 'sunscar-primary', biomeId: 'sunscar', theme: 'desert', terrainKitId: 'desert-source-terrain-v2', propFamily: 'yeehaw', sourcePacks: ['yeehaw'], kind: 'primary' },
  { id: 'sunscar-backup-pixel', biomeId: 'sunscar', theme: 'desert', terrainKitId: 'desert-pixel-source-terrain-v2', propFamily: 'pixel-sunscar', sourcePacks: ['pixel-sunscar'], kind: 'backup' },
  { id: 'skyglass-primary', biomeId: 'skyglass', theme: 'ruins', terrainKitId: 'ruins-source-terrain-v2', propFamily: 'skyglass', sourcePacks: ['skyglass'], kind: 'primary' },
  { id: 'skyglass-backup-space', biomeId: 'skyglass', theme: 'ruins', terrainKitId: 'ruins-space-source-terrain-v2', propFamily: 'space-skyglass', sourcePacks: ['space-skyglass'], kind: 'backup' }
];

export const STORY_BIOME_VISUAL_SETS = Object.fromEntries(SETS.map((set) => [set.id, set])) as Record<string, StoryBiomeVisualSetDefinition>;

export function storyBiomeVisualSets(biomeId: StoryBiomeId) {
  return SETS.filter((set) => set.biomeId === biomeId);
}

export function storyBiomeVisualSet(id: string | undefined) {
  return id ? STORY_BIOME_VISUAL_SETS[id] : undefined;
}

export function storyPrimaryBiomeVisualSet(biomeId: StoryBiomeId) {
  return storyBiomeVisualSets(biomeId).find((set) => set.kind === 'primary')!;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

/** Select once per floor. Adjacent depths alternate while the run seed chooses the starting family. */
export function storyBiomeVisualSetForFloor(biomeId: StoryBiomeId, runSeed: string, floorNumber: number) {
  const sets = storyBiomeVisualSets(biomeId);
  return sets[(hashString(`${biomeId}:${runSeed}:visual-set`) + Math.max(1, floorNumber) - 1) % sets.length];
}

export function storyBiomeVisualSetCoverageErrors() {
  const errors: string[] = [];
  for (const biomeId of ['greenhollow', 'thornwood', 'ironroot', 'bonevault', 'emberdeep', 'frostpeak', 'sunscar', 'skyglass'] as StoryBiomeId[]) {
    const sets = storyBiomeVisualSets(biomeId);
    if (sets.length !== 2 || sets.filter((set) => set.kind === 'primary').length !== 1 || sets.filter((set) => set.kind === 'backup').length !== 1) errors.push(`visual-set-count:${biomeId}`);
    for (const set of sets) if (!set.terrainKitId || !set.propFamily || set.sourcePacks.length === 0) errors.push(`visual-set-contract:${set.id}`);
  }
  return errors;
}

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { adventureFloorValidationErrors, generateAdventureFloor } from './adventureEndless';
import { storyFloorContainerValidationErrors } from './adventureLoot';
import { STORY_BIOME_GAMEPLAY_ASSET_CONTRACTS, storyTraversalGameplayVisual } from './biomeGameplayAssets';
import { storyBiomeVisualSet } from './biomeVisualSets';
import type { StoryFloorLootOutcome } from './types';

describe('Endless family gameplay assets and supply caches', () => {
  it('keeps every gameplay asset inside its selected visual-set source contract', () => {
    expect(Object.keys(STORY_BIOME_GAMEPLAY_ASSET_CONTRACTS)).toHaveLength(5);
    for (const contract of Object.values(STORY_BIOME_GAMEPLAY_ASSET_CONTRACTS)) {
      const visualSet = storyBiomeVisualSet(contract.visualSetId)!;
      expect(visualSet.kind).toBe('backup');
      for (const asset of [...contract.containers, ...contract.pickups, ...contract.traversal]) {
        expect(visualSet.sourcePacks, `${contract.visualSetId}:${asset.id}`).toContain(asset.sourcePack);
        expect(existsSync(resolve(process.cwd(), 'public/story/worlds', asset.asset.slice(6))), asset.id).toBe(true);
      }
    }
    expect(storyTraversalGameplayVisual('ironroot-backup-grafx', 'lift')?.id).toBe('grafx-mine-lift-frame');
    expect(storyTraversalGameplayVisual('ironroot-backup-grafx', 'updraft')).toBeUndefined();
  });

  it('uses optional reward alcoves and never mixes or hazard-blocks container visuals', () => {
    for (const contract of Object.values(STORY_BIOME_GAMEPLAY_ASSET_CONTRACTS)) {
      const visualSet = storyBiomeVisualSet(contract.visualSetId)!;
      const floors = Array.from({ length: 40 }, (_, index) => generateAdventureFloor(visualSet.biomeId, `cache-placement-${index}`, index % 3 + 1));
      const matching = floors.filter((floor) => floor.visualSetId === contract.visualSetId);
      expect(matching.length, contract.visualSetId).toBeGreaterThan(0);
      for (const floor of matching) {
        expect(floor.containers.length, `${contract.visualSetId}:${floor.seed}`).toBeGreaterThan(0);
        expect(storyFloorContainerValidationErrors(floor), `${contract.visualSetId}:${floor.seed}`).toEqual([]);
        expect(adventureFloorValidationErrors(floor), `${contract.visualSetId}:${floor.seed}`).toEqual([]);
      }
    }
  });

  it('produces empty, junk, coin, material, and useful consumable outcomes deterministically', () => {
    const outcomes = new Set<StoryFloorLootOutcome>();
    for (let index = 0; index < 500; index += 1) {
      for (const contract of Object.values(STORY_BIOME_GAMEPLAY_ASSET_CONTRACTS)) {
        const visualSet = storyBiomeVisualSet(contract.visualSetId)!;
        const floor = generateAdventureFloor(visualSet.biomeId, `cache-outcomes-${index}`, index % 3 + 1);
        if (floor.visualSetId === contract.visualSetId) floor.containers.forEach((container) => outcomes.add(container.outcome));
      }
    }
    expect(outcomes).toEqual(new Set<StoryFloorLootOutcome>(['empty', 'junk', 'coins', 'material', 'consumable']));
  });

  it('preserves v7 replay output without generated containers', () => {
    expect(generateAdventureFloor('greenhollow', 'legacy-cache-run', 1, 7).containers).toEqual([]);
  });
});

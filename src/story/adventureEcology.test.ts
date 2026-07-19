import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STORY_BIOME_IDS } from './adventureCrafting';
import { STORY_COLLECTIBLE_FAMILIES, STORY_WILDLIFE_BY_ID, storyFloorEcologyValidationErrors } from './adventureEcology';
import { generateAdventureFloor } from './adventureEndless';

describe('v9 procedural ecology and collectibles', () => {
  it('preserves v7/v8 compatibility without backfilling ecology arrays', () => {
    const v7 = generateAdventureFloor('emberdeep', 'legacy-emberdeep', 3, 7);
    const v8 = generateAdventureFloor('emberdeep', 'legacy-emberdeep', 3, 8);
    expect(v7.containers).toEqual([]);
    expect(v7.pickups).toEqual([]);
    expect(v7.wildlife).toEqual([]);
    expect(v8.pickups).toEqual([]);
    expect(v8.wildlife).toEqual([]);
  });

  it('is deterministic, floor-family exclusive, safe, peaceful-aware, and encounter-budget neutral', () => {
    for (const biome of STORY_BIOME_IDS) {
      for (let seed = 0; seed < 250; seed += 1) {
        const floor = generateAdventureFloor(biome, `ecology:${biome}:${seed}`, 1 + seed % 12, 9);
        expect(generateAdventureFloor(biome, `ecology:${biome}:${seed}`, 1 + seed % 12, 9)).toEqual(floor);
        expect(floor.usedFallback, `${biome}:${seed}`).toBe(false);
        expect(storyFloorEcologyValidationErrors(floor), `${biome}:${seed}`).toEqual([]);
        expect(new Set(floor.wildlife.map(({ packId }) => packId))).toEqual(new Set([floor.ecologyFamilyId]));
        if (floor.pickups.length > 0) expect(new Set(floor.pickups.map(({ familyId }) => familyId))).toEqual(new Set([floor.collectibleFamilyId]));
        expect(STORY_COLLECTIBLE_FAMILIES).toContain(floor.collectibleFamilyId);
        expect(floor.wildlife.every(({ speciesId }) => STORY_WILDLIFE_BY_ID[speciesId]?.biomes.includes(biome))).toBe(true);
        expect(floor.wildlife.filter(({ behavior }) => behavior === 'hostile').length).toBeLessThanOrEqual(floor.enemySpawns.length);
        if (floor.intent === 'harvest' || floor.intent === 'exploration') expect(floor.wildlife.some(({ behavior }) => behavior === 'hostile')).toBe(false);
      }
    }
  }, 40_000);

  it('ships only registered runtime PNGs with integrity and semantic roles', () => {
    const root = resolve(process.cwd(), 'public');
    const manifest = JSON.parse(readFileSync(resolve(root, 'story/ecology/asset-manifest.json'), 'utf8'));
    const integrity = JSON.parse(readFileSync(resolve(root, 'story/ecology/asset-integrity.json'), 'utf8'));
    expect(manifest.assets.length).toBeGreaterThanOrEqual(79);
    expect(Object.values(manifest.sources).every((source: any) => source.tier === 'free' && /^[a-f0-9]{64}$/.test(source.archiveSha256))).toBe(true);
    for (const asset of manifest.assets) {
      expect(asset.role).toBeTruthy();
      const bytes = readFileSync(resolve(root, asset.path.replace(/^\//, '')));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(integrity.files[asset.path]);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { STORY_LEVEL_ASSET_REGISTRY, resolveStoryLevelAsset, storyLevelAssetCoverage } from './levelAssets';
import { STORY_SURFACE_LEVEL_BLUEPRINTS, storySurfaceRouteSignature } from './levelBlueprints';
import { STORY_ENDLESS_CHUNK_BLUEPRINTS, storyAuthoredRoomTemplate, storyChunkCoverageErrors } from './levelChunks';
import { compileStoryLevelBlueprint, renderStoryLevelBlueprintSvg, validateStoryLevelBlueprint } from './levelCompiler';
import { STORY_MOVEMENT_PROFILE, storyConservativeDoubleJumpRise, storyConservativeJumpRun, storyMaximumJumpRise } from './movementProfile';
import { STORY_TERRAIN_KITS, STORY_TERRAIN_KITS_BY_ID, storyTerrainGrammarCoverageErrors } from './terrainGrammar';
import { STORY_BIOME_VISUAL_SETS, storyBiomeVisualSetCoverageErrors } from './biomeVisualSets';
import { createStoryBiomeVisualSetEnvironment } from './worldEnvironments';
import { storyResourceVisualDefinition } from './adventureCrafting';
import type { StoryLevelBlueprintV1, StoryLevelGeometry } from './levelTypes';

describe('KORE AI Level Director', () => {
  it('keeps all 32 surface maps structurally distinct and valid', () => {
    const blueprints = Object.values(STORY_SURFACE_LEVEL_BLUEPRINTS);
    expect(blueprints).toHaveLength(32);
    expect(new Set(blueprints.map(storySurfaceRouteSignature))).toHaveLength(32);
    for (const blueprint of blueprints) {
      const validation = validateStoryLevelBlueprint(blueprint);
      expect(validation.errors, blueprint.id).toEqual([]);
      expect(validation.witnessRoute.length, blueprint.id).toBeGreaterThanOrEqual(4);
    }
  });

  it('compiles byte-equivalent output for an identical blueprint and seed', () => {
    const blueprint = STORY_SURFACE_LEVEL_BLUEPRINTS['greenhollow-arrival'];
    const first = compileStoryLevelBlueprint(blueprint, 'deterministic-seed', 4);
    const second = compileStoryLevelBlueprint(blueprint, 'deterministic-seed', 4);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(renderStoryLevelBlueprintSvg(blueprint)).toBe(renderStoryLevelBlueprintSvg(blueprint));
    expect(first.meta.seed).toBe('deterministic-seed');
  });

  it('retains the V1 parser and compiler path for legacy authored runs', () => {
    const { terrain: _terrain, ...v2Chunk } = STORY_ENDLESS_CHUNK_BLUEPRINTS[0];
    const legacy: StoryLevelBlueprintV1 = {
      ...v2Chunk,
      version: 1,
      geometry: v2Chunk.geometry.filter((geometry): geometry is StoryLevelGeometry => geometry.kind !== 'carve')
    };
    const validation = validateStoryLevelBlueprint(legacy);
    const compiled = compileStoryLevelBlueprint(legacy, 'legacy-migration', 3);
    expect(validation.errors).toEqual([]);
    expect(compiled.meta.blueprintVersion).toBe(1);
    expect(compiled.meta.generationVersion).toBe(3);
    expect(compiled.terrainTiles).toEqual([]);
  });

  it('provides four authored variants for every Endless chunk role', () => {
    expect(STORY_ENDLESS_CHUNK_BLUEPRINTS).toHaveLength(48);
    expect(storyChunkCoverageErrors()).toEqual([]);
    const roleCounts = new Map<string, number>();
    for (const chunk of STORY_ENDLESS_CHUNK_BLUEPRINTS) {
      expect(chunk.version).toBe(2);
      expect(chunk.geometry.some((geometry) => geometry.kind === 'carve'), chunk.id).toBe(true);
      roleCounts.set(chunk.chunkRole!, (roleCounts.get(chunk.chunkRole!) ?? 0) + 1);
      expect(chunk.geometry.filter((geometry) => geometry.kind === 'solid' && geometry.surfaceIntent === 'wall').length, chunk.id).toBeGreaterThanOrEqual(2);
      expect(chunk.slots.filter((slot) => slot.kind === 'prop').length, chunk.id).toBeGreaterThanOrEqual(4);
    }
    expect(new Set(roleCounts.values())).toEqual(new Set([4]));
    expect(storyAuthoredRoomTemplate('junction', ['west', 'east', 'up'], 0).connectors).toEqual(['west', 'east', 'up']);
  });

  it('resolves registered semantic assets for every biome', () => {
    expect(storyTerrainGrammarCoverageErrors()).toEqual([]);
    expect(STORY_LEVEL_ASSET_REGISTRY.length).toBeGreaterThanOrEqual(38);
    for (const coverage of storyLevelAssetCoverage()) {
      expect(coverage.assets, coverage.biomeId).toBeGreaterThanOrEqual(4);
      const selected = resolveStoryLevelAsset(coverage.biomeId, { semanticTags: ['landmark'] }, 'hero', 0);
      expect(selected?.biomes, coverage.biomeId).toContain(coverage.biomeId);
      expect(selected?.roles, coverage.biomeId).toContain('hero');
    }
  });

  it('compiles clustered surface dressing and stable terrain variants', () => {
    for (const blueprint of Object.values(STORY_SURFACE_LEVEL_BLUEPRINTS)) {
      const compiled = compileStoryLevelBlueprint(blueprint, 'dressing-review', 4);
      expect(compiled.props.length, blueprint.id).toBeGreaterThanOrEqual(4);
      expect(compiled.platforms.every((platform) => Number.isInteger(platform.surfaceVariant)), blueprint.id).toBe(true);
      expect(new Set(compiled.platforms.map((platform) => platform.surfaceVariant)).size, blueprint.id).toBeGreaterThanOrEqual(2);
      expect(compiled.terrainKitId, blueprint.id).toBeTruthy();
      expect(compiled.terrainTiles.every((tile) => tile.kitId && tile.frameId), blueprint.id).toBe(true);
      expect(compiled.cavityTiles.every((tile) => tile.kitId && tile.frameId), blueprint.id).toBe(true);
      const columns = Math.round((blueprint.bounds[1] - blueprint.bounds[0]) / 2);
      const rows = Math.round((blueprint.bounds[3] - blueprint.bounds[2]) / 2);
      expect(compiled.terrainTiles.length + compiled.cavityTiles.length, blueprint.id).toBe(columns * rows);
    }
  });

  it('provides three provenance-complete frames for every terrain role in all sixteen kits', () => {
    const kits = Object.values(STORY_TERRAIN_KITS_BY_ID);
    expect(Object.values(STORY_TERRAIN_KITS)).toHaveLength(8);
    expect(kits).toHaveLength(16);
    for (const kit of kits) {
      expect(kit!.tilePixels).toBe(32);
      expect(kit!.runtimeScale).toBe(2);
      for (const role of ['fill', 'top', 'underside', 'left-wall', 'right-wall', 'outer-top-left', 'outer-top-right', 'outer-bottom-left', 'outer-bottom-right', 'inner-top-left', 'inner-top-right', 'inner-bottom-left', 'inner-bottom-right', 'connector-lip', 'background-rock', 'sky-window-edge', 'secret-overlay', 'damage-overlay']) {
        const frames = kit!.frames.filter((frame) => frame.role === role);
        expect(frames, `${kit!.id}:${role}`).toHaveLength(3);
        expect(frames.every((frame) => frame.rotations.length === 1 && frame.rotations[0] === 0 && !frame.mirroring)).toBe(true);
        expect(frames.every((frame) => frame.sourceHash && frame.license && frame.generationMethod)).toBe(true);
      }
    }
  });

  it('keeps every backup visual set self-contained across terrain, environment, and props', () => {
    expect(storyBiomeVisualSetCoverageErrors()).toEqual([]);
    for (const visualSet of Object.values(STORY_BIOME_VISUAL_SETS)) {
      const kit = STORY_TERRAIN_KITS_BY_ID[visualSet.terrainKitId];
      const environment = createStoryBiomeVisualSetEnvironment(visualSet.theme, visualSet.id);
      const familyAssets = STORY_LEVEL_ASSET_REGISTRY.filter((asset) => asset.biomes.includes(visualSet.biomeId) && asset.family === visualSet.propFamily);
      expect(kit?.visualSetId, visualSet.id).toBe(visualSet.id);
      expect(familyAssets.length, visualSet.id).toBeGreaterThanOrEqual(3);
      expect(environment.layers.length, visualSet.id).toBeGreaterThanOrEqual(2);
      const environmentPacks = [environment.surface?.asset, ...environment.layers.map((layer) => layer.asset)].filter(Boolean).map((asset) => asset!.slice(6).split('/')[0]);
      expect(environmentPacks.every((pack) => visualSet.sourcePacks.includes(pack)), visualSet.id).toBe(true);
      expect(familyAssets.every((asset) => visualSet.sourcePacks.includes(asset.sourcePack)), visualSet.id).toBe(true);
    }
  });

  it('keeps resource inventory IDs while resolving biome-specific visual skins', () => {
    expect(storyResourceVisualDefinition('routewood', 'sunscar').id).toBe('palmwood');
    expect(storyResourceVisualDefinition('wildberry', 'sunscar').id).toBe('cactus-fruit');
    expect(storyResourceVisualDefinition('fieldstone', 'sunscar').id).toBe('glass-sand');
    expect(storyResourceVisualDefinition('routewood', 'ironroot').id).toBe('routewood');
  });

  it('derives conservative movement bounds from the shared runtime profile', () => {
    expect(STORY_MOVEMENT_PROFILE.maximumJumps).toBe(2);
    expect(storyMaximumJumpRise()).toBeCloseTo(STORY_MOVEMENT_PROFILE.jumpVelocity ** 2 / (2 * STORY_MOVEMENT_PROFILE.gravity), 8);
    expect(storyConservativeDoubleJumpRise()).toBeLessThan(storyMaximumJumpRise() * STORY_MOVEMENT_PROFILE.maximumJumps);
    expect(storyConservativeDoubleJumpRise()).toBeGreaterThan(storyMaximumJumpRise());
    expect(storyConservativeJumpRun()).toBeGreaterThan(3);
  });
});

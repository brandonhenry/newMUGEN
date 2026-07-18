import { describe, expect, it } from 'vitest';
import { STORY_LEVEL_ASSET_REGISTRY, resolveStoryLevelAsset, storyLevelAssetCoverage } from './levelAssets';
import { STORY_SURFACE_LEVEL_BLUEPRINTS, storySurfaceRouteSignature } from './levelBlueprints';
import { STORY_ENDLESS_CHUNK_BLUEPRINTS, storyAuthoredRoomTemplate, storyChunkCoverageErrors } from './levelChunks';
import { compileStoryLevelBlueprint, renderStoryLevelBlueprintSvg, validateStoryLevelBlueprint } from './levelCompiler';
import { STORY_MOVEMENT_PROFILE, storyConservativeDoubleJumpRise, storyConservativeJumpRun, storyMaximumJumpRise } from './movementProfile';

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

  it('provides four authored variants for every Endless chunk role', () => {
    expect(STORY_ENDLESS_CHUNK_BLUEPRINTS).toHaveLength(48);
    expect(storyChunkCoverageErrors()).toEqual([]);
    const roleCounts = new Map<string, number>();
    for (const chunk of STORY_ENDLESS_CHUNK_BLUEPRINTS) {
      roleCounts.set(chunk.chunkRole!, (roleCounts.get(chunk.chunkRole!) ?? 0) + 1);
      expect(chunk.geometry.filter((geometry) => geometry.kind === 'solid' && geometry.surfaceIntent === 'wall').length, chunk.id).toBeGreaterThanOrEqual(2);
      expect(chunk.slots.filter((slot) => slot.kind === 'prop').length, chunk.id).toBeGreaterThanOrEqual(4);
    }
    expect(new Set(roleCounts.values())).toEqual(new Set([4]));
    expect(storyAuthoredRoomTemplate('junction', ['west', 'east', 'up'], 0).connectors).toEqual(['west', 'east', 'up']);
  });

  it('resolves registered semantic assets for every biome', () => {
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
    }
  });

  it('derives conservative movement bounds from the shared runtime profile', () => {
    expect(STORY_MOVEMENT_PROFILE.maximumJumps).toBe(2);
    expect(storyMaximumJumpRise()).toBeCloseTo(STORY_MOVEMENT_PROFILE.jumpVelocity ** 2 / (2 * STORY_MOVEMENT_PROFILE.gravity), 8);
    expect(storyConservativeDoubleJumpRise()).toBeLessThan(storyMaximumJumpRise() * STORY_MOVEMENT_PROFILE.maximumJumps);
    expect(storyConservativeDoubleJumpRise()).toBeGreaterThan(storyMaximumJumpRise());
    expect(storyConservativeJumpRun()).toBeGreaterThan(3);
  });
});

import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADVENTURE_RESOURCE_SFX } from './adventureAudio';
import { STORY_RECIPES, STORY_RESOURCES } from './adventureCrafting';

const root = resolve(process.cwd(), 'public');

function pngDimensions(path: string) {
  const data = readFileSync(path);
  expect(data.toString('ascii', 1, 4)).toBe('PNG');
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), colorType: data[25] };
}

describe('Adventure resource assets', () => {
  it('ships every referenced node state and item icon as alpha PNGs', () => {
    const paths = [
      ...STORY_RESOURCES.filter((resource) => resource.acquisition === 'harvest').flatMap((resource) => [resource.iconPath, ...resource.nodeFrames]),
      ...STORY_RECIPES.map((recipe) => recipe.iconPath),
      '/story/resources/workbench.png'
    ];
    for (const relative of paths) {
      const absolute = resolve(root, relative.replace(/^\//, ''));
      expect(statSync(absolute).size, relative).toBeGreaterThan(100);
      const dimensions = pngDimensions(absolute);
      expect(dimensions.colorType, relative).toBe(6);
      expect([256, 512]).toContain(dimensions.width);
      expect(dimensions.height).toBe(dimensions.width);
    }
  });

  it('records deterministic provenance, dimensions, and checksums for every runtime output', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'story/resources/asset-manifest.json'), 'utf8'));
    expect(manifest.builder).toBe('scripts/build-story-resource-assets.py');
    expect(manifest.toolMode).toContain('imagegen');
    expect(manifest.model).toBeTruthy();
    expect(manifest.references.length).toBeGreaterThanOrEqual(16);
    expect(manifest.sources).toHaveLength(13);
    expect(manifest.outputs).toHaveLength(193);
    expect(manifest.outputs.every((entry: { sha256: string; dimensions: number[]; alphaBounds: number[] | null }) => /^[a-f0-9]{64}$/.test(entry.sha256) && entry.dimensions.length === 2 && entry.alphaBounds?.length === 4)).toBe(true);
    const outputs = new Map<string, { dimensions: number[]; alphaBounds: number[] }>(manifest.outputs.map((entry: { path: string; dimensions: number[]; alphaBounds: number[] }) => [entry.path, entry]));
    for (const resource of STORY_RESOURCES.filter((resource) => resource.acquisition === 'harvest')) {
      for (const frame of resource.nodeFrames) {
        const entry = outputs.get(`public${frame}`)!;
        expect(entry, frame).toBeDefined();
        expect(entry.alphaBounds[3] / entry.dimensions[1], frame).toBeCloseTo(resource.footAnchorY, 8);
      }
    }
  });

  it('ships every referenced resource impact clip and its CC0 provenance', () => {
    const paths = new Set(Object.values(ADVENTURE_RESOURCE_SFX).flatMap((profile) => [...profile.hit, ...profile.broken, ...(profile.breakLayer ? [profile.breakLayer] : [])]));
    expect(paths.size).toBe(17);
    for (const relative of paths) {
      const absolute = resolve(root, relative.replace(/^\//, ''));
      expect(statSync(absolute).size, relative).toBeGreaterThan(1_000);
      expect(readFileSync(absolute).toString('ascii', 0, 4), relative).toBe('OggS');
    }
    const credits = readFileSync(resolve(root, 'story/audio/resource-impacts/CREDITS.md'), 'utf8');
    expect(credits).toContain('Creative Commons Zero (CC0)');
    expect(credits).toContain('75 CC0 breaking / falling / hit SFX');
    expect(credits).toContain('Bones 2');
  });
});

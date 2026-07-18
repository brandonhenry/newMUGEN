import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type ExplorationAssetManifest = {
  version: number;
  packs: Array<{
    id: string;
    author: string;
    source: string;
    archiveUrls: string[];
    archiveSha256: string[];
    license: string;
    runtimeReferences: string[];
    assets: Array<{ file: string; sourceFile: string; width: number; height: number; sha256: string }>;
  }>;
};

const root = resolve(process.cwd(), 'public/story/exploration');
const manifest = JSON.parse(readFileSync(resolve(root, 'asset-manifest.json'), 'utf8')) as ExplorationAssetManifest;

describe('exploration art intake', () => {
  it('records reviewed provenance and a real runtime purpose for every pack', () => {
    expect(manifest.version).toBe(1);
    expect(manifest.packs).toHaveLength(5);
    expect(new Set(manifest.packs.map((pack) => pack.id)).size).toBe(manifest.packs.length);
    for (const pack of manifest.packs) {
      expect(pack.author.length).toBeGreaterThan(0);
      expect(pack.source).toMatch(/^https:\/\//);
      expect(['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0']).toContain(pack.license);
      expect(pack.archiveUrls.length).toBeGreaterThan(0);
      expect(pack.archiveUrls).toHaveLength(pack.archiveSha256.length);
      expect(pack.archiveUrls.every((url) => url.startsWith('https://'))).toBe(true);
      expect(pack.archiveSha256.every((checksum) => /^[a-f0-9]{64}$/.test(checksum))).toBe(true);
      expect(pack.runtimeReferences.length).toBeGreaterThan(0);
    }
    expect(readdirSync(root).some((file) => file.toLowerCase().endsWith('.zip'))).toBe(false);
  });

  it('pins each selected source output by dimensions and SHA-256', () => {
    const files = new Set<string>();
    for (const pack of manifest.packs) {
      for (const asset of pack.assets) {
        expect(files.has(asset.file), asset.file).toBe(false);
        files.add(asset.file);
        expect(asset.sourceFile.length).toBeGreaterThan(0);
        expect(asset.width).toBeGreaterThan(0);
        expect(asset.height).toBeGreaterThan(0);
        const path = resolve(root, asset.file);
        expect(existsSync(path), asset.file).toBe(true);
        expect(createHash('sha256').update(readFileSync(path)).digest('hex'), asset.file).toBe(asset.sha256);
      }
    }
    expect(files.size).toBe(15);
  });
});

describe('generated K.O.R.E. atlas', () => {
  it('ships generation metadata and the checksum-pinned pixel atlas', () => {
    const atlasRoot = resolve(process.cwd(), 'public/story/map');
    const atlas = JSON.parse(readFileSync(resolve(atlasRoot, 'atlas-manifest.json'), 'utf8')) as {
      file: string; width: number; height: number; sha256: string; license: string; generator: string; prompt: string;
    };
    expect(atlas.license).toBe('project-owned-generated');
    expect(atlas.generator).toContain('OpenAI');
    expect(atlas.prompt).toContain('eight distinct');
    expect(atlas.prompt.toLowerCase()).toContain('no characters');
    expect(atlas.width).toBeGreaterThanOrEqual(1024);
    expect(atlas.height).toBeGreaterThanOrEqual(1024);
    const path = resolve(atlasRoot, atlas.file);
    expect(existsSync(path)).toBe(true);
    expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(atlas.sha256);
  });
});

describe('generated biome doors', () => {
  it('ships eight distinct checksum-pinned project-owned entrance frames', () => {
    const doorRoot = resolve(process.cwd(), 'public/story/exploration/doors');
    const doors = JSON.parse(readFileSync(resolve(doorRoot, 'biome-doors-manifest.json'), 'utf8')) as {
      file: string; width: number; height: number; columns: number; rows: number; frameWidth: number; frameHeight: number;
      sha256: string; license: string; generator: string; prompt: string; frames: Array<{ biome: string; x: number; y: number; width: number; height: number; visibleBottomInset: number }>;
    };
    expect(doors.license).toBe('project-owned-generated');
    expect(doors.generator).toContain('OpenAI');
    expect(doors.columns * doors.rows).toBe(8);
    expect(doors.frames).toHaveLength(8);
    expect(new Set(doors.frames.map((frame) => frame.biome)).size).toBe(8);
    expect(doors.frames.every((frame) => frame.width === doors.frameWidth && frame.height === doors.frameHeight)).toBe(true);
    expect(doors.frames.every((frame) => frame.visibleBottomInset >= 0 && frame.visibleBottomInset < frame.height)).toBe(true);
    expect(doors.prompt).toContain('eight large side-view biome entrances');
    const path = resolve(doorRoot, doors.file);
    expect(existsSync(path)).toBe(true);
    expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(doors.sha256);
  });
});

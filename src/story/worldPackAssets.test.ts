import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STORY_WORLDS } from './adventureWorlds';

type WorldAssetManifest = {
  version: number;
  packs: Array<{
    id: string;
    author: string;
    source: string;
    archive: string;
    archiveSha256: string;
    license: string;
    assets: Array<{ file: string; sourceFile: string; width: number; height: number; sha256: string }>;
  }>;
};

const root = resolve(process.cwd(), 'public/story/worlds');
const manifest = JSON.parse(readFileSync(resolve(root, 'asset-manifest.json'), 'utf8')) as WorldAssetManifest;
const integrity = JSON.parse(readFileSync(resolve(root, 'asset-integrity.json'), 'utf8')) as { algorithm: string; files: Record<string, string> };
const shippedFiles = new Set(manifest.packs.flatMap((pack) => pack.assets.map((asset) => asset.file)));

describe('play-mode world pack pipeline', () => {
  it('tracks every imported pack with source, author, license, and pinned archive checksum', () => {
    expect(manifest.version).toBe(1);
    expect(manifest.packs).toHaveLength(22);
    expect(new Set(manifest.packs.map((pack) => pack.id)).size).toBe(manifest.packs.length);
    for (const pack of manifest.packs) {
      expect(pack.author.length).toBeGreaterThan(0);
      expect(pack.source).toMatch(/^https:\/\//);
      expect(pack.license).toBe('CC0-1.0');
      expect(pack.archiveSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(pack.assets.length).toBeGreaterThan(0);
    }
    expect(readdirSync(root).some((file) => file.toLowerCase().endsWith('.zip'))).toBe(false);
  });

  it('verifies every optimized PNG by dimensions and SHA-256', () => {
    expect(integrity.algorithm).toBe('sha256');
    expect(Object.keys(integrity.files)).toHaveLength(130);
    for (const pack of manifest.packs) {
      for (const asset of pack.assets) {
        const path = resolve(root, asset.file);
        expect(existsSync(path), asset.file).toBe(true);
        expect(asset.width, asset.file).toBeGreaterThan(0);
        expect(asset.height, asset.file).toBeGreaterThan(0);
        const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
        expect(hash, asset.file).toBe(asset.sha256);
        expect(integrity.files[asset.file], asset.file).toBe(hash);
      }
    }
  });

  it('backs every authored layer, surface, and pack prop with a shipped file', () => {
    for (const world of Object.values(STORY_WORLDS)) {
      if (!world.environment) continue;
      expect(world.environment.layers.length, world.id).toBeGreaterThanOrEqual(3);
      expect(world.environment.layers.every((layer) => layer.asset?.startsWith('world:')), world.id).toBe(true);
      for (const layer of world.environment.layers) expect(shippedFiles.has(layer.asset!.slice(6)), `${world.id}: ${layer.asset}`).toBe(true);
      expect(world.environment.surface?.asset.startsWith('world:'), world.id).toBe(true);
      expect(shippedFiles.has(world.environment.surface!.asset.slice(6)), `${world.id}: surface`).toBe(true);
      for (const prop of world.props ?? []) {
        if (!prop.asset.startsWith('world:')) continue;
        expect(shippedFiles.has(prop.asset.slice(6)), `${world.id}: ${prop.asset}`).toBe(true);
      }
    }
  });
});

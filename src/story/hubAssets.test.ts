import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type HubAssetManifest = {
  id: string;
  author: string;
  license: string;
  sourcePage: string;
  sourceSha256: string;
  files: Array<{ file: string; size: [number, number]; sha256: string }>;
};

const assetRoot = join(process.cwd(), 'public', 'story', 'hub', 'warped-city-2');
const manifest = JSON.parse(readFileSync(join(assetRoot, 'manifest.json'), 'utf8')) as HubAssetManifest;
const portalAssetRoot = join(process.cwd(), 'public', 'story', 'hub', 'warped-city-portals');
const portalManifest = JSON.parse(readFileSync(join(portalAssetRoot, 'manifest.json'), 'utf8')) as HubAssetManifest;

describe('K.O.R.E. Central city assets', () => {
  it('keeps reviewed CC0 source provenance and the locked archive checksum', () => {
    expect(manifest).toMatchObject({
      id: 'warped-city-2',
      author: 'Ansimuz',
      license: 'CC0-1.0',
      sourcePage: 'https://opengameart.org/content/warped-city-2',
      sourceSha256: 'f584233c8543e3048b6e51881ea576294987e431a18bbd00e9a433c96b89abac'
    });
  });

  it('commits every selected pixel-art layer and preserves its checksum', () => {
    expect(manifest.files).toHaveLength(11);
    expect(new Set(manifest.files.map(({ file }) => file)).size).toBe(manifest.files.length);

    for (const asset of manifest.files) {
      const filePath = join(assetRoot, asset.file);
      expect(existsSync(filePath), `${asset.file} should exist`).toBe(true);
      const bytes = readFileSync(filePath);
      expect(bytes.subarray(0, 8).toString('hex'), `${asset.file} should be a PNG`).toBe('89504e470d0a1a0a');
      expect(createHash('sha256').update(bytes).digest('hex'), `${asset.file} checksum`).toBe(asset.sha256);
      expect(asset.size[0]).toBeGreaterThan(0);
      expect(asset.size[1]).toBeGreaterThan(0);
    }
  });

  it('provides a unique CC0 silhouette for every hub destination', () => {
    expect(portalManifest).toMatchObject({
      id: 'warped-city-portals',
      author: 'Ansimuz',
      license: 'CC0-1.0',
      sourcePage: 'https://opengameart.org/content/warped-city',
      sourceSha256: 'cf0e69a203206f529adbaf1f82d4c5f165ca9cdb49d3995ec88d135b37e40e3e'
    });
    expect(portalManifest.files.map(({ file }) => file).sort()).toEqual([
      'arcade.png', 'avatar-studio.png', 'characters.png', 'exit.png', 'friends.png', 'online.png',
      'options.png', 'story.png', 'tournament.png', 'training.png', 'versus.png'
    ]);
    expect(new Set(portalManifest.files.map(({ sha256 }) => sha256)).size).toBe(11);

    for (const asset of portalManifest.files) {
      const bytes = readFileSync(join(portalAssetRoot, asset.file));
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
      expect(asset.size).toEqual([112, 112]);
    }
  });
});

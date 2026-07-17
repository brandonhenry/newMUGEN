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
});

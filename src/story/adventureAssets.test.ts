import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type AdventureAssetManifest = {
  version: number;
  packs: Array<{
    id: string;
    authors: string[];
    license: string;
    licenseFile?: string;
    requiredEasterEgg?: string;
    assets: Array<{ file: string; sourceFile: string; sheet: [number, number]; frame: [number, number] }>;
  }>;
};

const assetRoot = resolve(process.cwd(), 'public/story/adventure');
const manifest = JSON.parse(readFileSync(resolve(assetRoot, 'asset-manifest.json'), 'utf8')) as AdventureAssetManifest;
const integrity = JSON.parse(readFileSync(resolve(assetRoot, 'asset-integrity.json'), 'utf8')) as { algorithm: string; files: Record<string, string> };

describe('story adventure asset manifest', () => {
  it('tracks each shipped source sheet with dimensions, attribution, and a license', () => {
    expect(manifest.version).toBe(1);
    expect(manifest.packs.map((pack) => pack.id)).toEqual(['dawnlike', 'pixel-crawler', 'pixel-adventure']);

    manifest.packs.forEach((pack) => {
      expect(pack.authors.length).toBeGreaterThan(0);
      expect(pack.license.length).toBeGreaterThan(0);
      pack.assets.forEach((asset) => {
        expect(asset.sourceFile).toMatch(/\.png$/i);
        expect(asset.sheet.every((value) => value > 0)).toBe(true);
        expect(asset.frame.every((value) => value > 0)).toBe(true);
        expect(existsSync(resolve(assetRoot, pack.id, asset.file))).toBe(true);
      });
      if (pack.licenseFile) expect(existsSync(resolve(assetRoot, pack.licenseFile))).toBe(true);
    });
  });

  it('preserves required credits without shipping source archives', () => {
    const dawnlike = manifest.packs.find((pack) => pack.id === 'dawnlike');
    const crawler = manifest.packs.find((pack) => pack.id === 'pixel-crawler');
    expect(dawnlike?.authors).toEqual(expect.arrayContaining(['DragonDePlatino', 'DawnBringer']));
    expect(dawnlike?.requiredEasterEgg).toContain('Emberdeep');
    expect(crawler?.authors).toContain('Anokolisa');
    expect(readdirSync(assetRoot).some((file) => file.toLowerCase().endsWith('.zip'))).toBe(false);
  });

  it('pins every shipped adventure sheet to a reviewed SHA-256 checksum', () => {
    expect(integrity.algorithm).toBe('sha256');
    expect(Object.keys(integrity.files)).toHaveLength(21);
    for (const [file, expected] of Object.entries(integrity.files)) {
      const contents = readFileSync(resolve(assetRoot, file));
      expect(createHash('sha256').update(contents).digest('hex'), file).toBe(expected);
    }
  });
});

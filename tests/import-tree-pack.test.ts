import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { pairTreePackAssets } from '../scripts/import-tree-pack.mjs';

const validModels = [
  ...Array.from({ length: 36 }, (_, index) => `tree${String(index + 1).padStart(2, '0')}.fbx`),
  ...Array.from({ length: 8 }, (_, index) => `bush${String(index + 1).padStart(2, '0')}.fbx`)
];
const validTextures = validModels.map((name) => name.replace('.fbx', '.png'));

describe('tree pack importer', () => {
  it('requires the complete 36-tree and 8-bush source set', () => {
    const pairs = pairTreePackAssets(validModels, validTextures);
    expect(pairs).toHaveLength(44);
    expect(pairs[0]).toMatchObject({ id: 'tree01', kind: 'tree' });
    expect(pairs.at(-1)).toMatchObject({ id: 'bush08', kind: 'bush' });
  });

  it('rejects missing texture pairs and incomplete packs', () => {
    expect(() => pairTreePackAssets(validModels, validTextures.slice(1))).toThrow(/unmatched assets/i);
    expect(() => pairTreePackAssets(validModels.slice(1), validTextures.slice(1))).toThrow(/Expected 36 trees/i);
  });

  it('ships one bounded GLB with all named meshes and one atlas material', async () => {
    const manifest = JSON.parse(await readFile('public/stage-props/tree-pack-1.1/manifest.json', 'utf8'));
    const document = await new NodeIO().read('public/stage-props/tree-pack-1.1/tree-pack.glb');
    expect(manifest).toMatchObject({ assetCount: 44, treeCount: 36, bushCount: 8 });
    expect(manifest.sizeBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(document.getRoot().listMeshes().map((mesh) => mesh.getName())).toEqual(validModels.map((name) => name.replace('.fbx', '')));
    expect(document.getRoot().listMaterials()).toHaveLength(1);
    expect(document.getRoot().listTextures()).toHaveLength(1);
    expect(document.getRoot().listMaterials()[0].getAlphaMode()).toBe('MASK');
  });
});

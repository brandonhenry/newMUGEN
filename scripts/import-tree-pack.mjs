#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { Document, NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const EXPECTED_TREES = 36;
const EXPECTED_BUSHES = 8;
const ATLAS_COLUMNS = 8;
const ATLAS_ROWS = 8;
const TILE_SIZE = 128;
const MAX_PACK_BYTES = 2 * 1024 * 1024;
const MODEL_PATTERN = /^(tree|bush)(\d{2})\.fbx$/i;
const TEXTURE_PATTERN = /^(tree|bush)(\d{2})\.png$/i;

export function pairTreePackAssets(modelNames, textureNames) {
  const models = collectNames(modelNames, MODEL_PATTERN, 'model');
  const textures = collectNames(textureNames, TEXTURE_PATTERN, 'texture');
  const ids = [...new Set([...models.keys(), ...textures.keys()])].sort(naturalIdSort);
  const missing = ids.flatMap((id) => [
    ...(models.has(id) ? [] : [`${id}.fbx`]),
    ...(textures.has(id) ? [] : [`${id}.png`])
  ]);
  if (missing.length > 0) throw new Error(`Tree pack has unmatched assets: ${missing.join(', ')}`);
  const pairs = ids.map((id) => ({ id, kind: id.startsWith('tree') ? 'tree' : 'bush', modelName: models.get(id), textureName: textures.get(id) }));
  const treeCount = pairs.filter((pair) => pair.kind === 'tree').length;
  const bushCount = pairs.filter((pair) => pair.kind === 'bush').length;
  if (treeCount !== EXPECTED_TREES || bushCount !== EXPECTED_BUSHES) {
    throw new Error(`Expected ${EXPECTED_TREES} trees and ${EXPECTED_BUSHES} bushes, found ${treeCount} trees and ${bushCount} bushes.`);
  }
  return pairs;
}

function collectNames(names, pattern, label) {
  const found = new Map();
  for (const name of names) {
    const match = path.basename(name).match(pattern);
    if (!match) continue;
    const id = `${match[1].toLowerCase()}${match[2]}`;
    if (found.has(id)) throw new Error(`Tree pack has duplicate ${label} for ${id}.`);
    found.set(id, name);
  }
  return found;
}

function naturalIdSort(a, b) {
  const kindOrder = a.startsWith('tree') === b.startsWith('tree') ? 0 : a.startsWith('tree') ? -1 : 1;
  return kindOrder || Number(a.slice(-2)) - Number(b.slice(-2));
}

export async function importTreePack({ archivePath, outputDir }) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'kore-tree-pack-'));
  try {
    await execFileAsync('unzip', ['-q', archivePath, '-d', temporaryRoot]);
    const sourceRoot = await findSourceRoot(temporaryRoot);
    const modelDir = path.join(sourceRoot, 'models');
    const textureDir = path.join(sourceRoot, 'textures');
    const pairs = pairTreePackAssets(await readdir(modelDir), await readdir(textureDir));
    const atlas = await buildAtlas(pairs, textureDir);
    const convertedDir = path.join(temporaryRoot, 'converted');
    await mkdir(convertedDir, { recursive: true });
    const converted = [];
    for (const pair of pairs) {
      const inputPath = path.join(modelDir, pair.modelName);
      const outputPath = path.join(convertedDir, `${pair.id}.glb`);
      await convertFbx(inputPath, outputPath);
      converted.push({ ...pair, outputPath });
    }
    const { document, assets } = await buildPackDocument(converted, atlas);
    await mkdir(outputDir, { recursive: true });
    const packPath = path.join(outputDir, 'tree-pack.glb');
    await new NodeIO().write(packPath, document);
    const sizeBytes = (await stat(packPath)).size;
    if (sizeBytes > MAX_PACK_BYTES) {
      throw new Error(`Generated tree pack is ${(sizeBytes / 1024 / 1024).toFixed(2)} MB, above the 2 MB budget.`);
    }
    const manifest = {
      id: 'tree-pack-1.1',
      version: 1,
      sourceArchive: path.basename(archivePath),
      sourceRoot: path.basename(sourceRoot),
      license: null,
      modelPath: '/stage-props/tree-pack-1.1/tree-pack.glb',
      sizeBytes,
      assetCount: assets.length,
      treeCount: assets.filter((asset) => asset.kind === 'tree').length,
      bushCount: assets.filter((asset) => asset.kind === 'bush').length,
      atlas: {
        embedded: true,
        width: ATLAS_COLUMNS * TILE_SIZE,
        height: ATLAS_ROWS * TILE_SIZE,
        columns: ATLAS_COLUMNS,
        rows: ATLAS_ROWS,
        tileSize: TILE_SIZE
      },
      assets
    };
    await writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function findSourceRoot(root) {
  const queue = [root];
  while (queue.length > 0) {
    const candidate = queue.shift();
    const entries = await readdir(candidate, { withFileTypes: true });
    const directories = new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name));
    if (directories.has('models') && directories.has('textures')) return candidate;
    queue.push(...entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(candidate, entry.name)));
  }
  throw new Error('Archive does not contain sibling models/ and textures/ directories.');
}

async function buildAtlas(pairs, textureDir) {
  const width = ATLAS_COLUMNS * TILE_SIZE;
  const height = ATLAS_ROWS * TILE_SIZE;
  const composites = pairs.map((pair, index) => ({
    input: path.join(textureDir, pair.textureName),
    left: (index % ATLAS_COLUMNS) * TILE_SIZE,
    top: Math.floor(index / ATLAS_COLUMNS) * TILE_SIZE
  }));
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function convertFbx(inputPath, outputPath) {
  const executable = path.join(process.cwd(), 'node_modules', 'fbx2gltf', 'bin', os.type(), `FBX2glTF${os.type() === 'Windows_NT' ? '.exe' : ''}`);
  const outputBase = outputPath.replace(/\.glb$/i, '');
  await execFileAsync(executable, ['--input', inputPath, '--output', outputBase, '--binary']);
}

async function buildPackDocument(converted, atlas) {
  const io = new NodeIO();
  const output = new Document();
  const buffer = output.createBuffer('tree-pack-buffer');
  const texture = output.createTexture('tree-pack-atlas').setImage(atlas).setMimeType('image/png');
  const material = output.createMaterial('tree-pack-alpha-mask')
    .setBaseColorTexture(texture)
    .setMetallicFactor(0)
    .setRoughnessFactor(1)
    .setDoubleSided(true)
    .setAlphaMode('MASK')
    .setAlphaCutoff(0.45);
  const scene = output.createScene('Tree Pack 1.1');
  const assets = [];

  for (let index = 0; index < converted.length; index += 1) {
    const item = converted[index];
    const source = await io.read(item.outputPath);
    const sourcePrimitive = source.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives())[0];
    if (!sourcePrimitive) throw new Error(`${item.id} did not contain a mesh primitive after FBX conversion.`);
    const position = sourcePrimitive.getAttribute('POSITION');
    const normal = sourcePrimitive.getAttribute('NORMAL');
    const uv = sourcePrimitive.getAttribute('TEXCOORD_0');
    const indices = sourcePrimitive.getIndices();
    if (!position || !normal || !uv || !indices) throw new Error(`${item.id} is missing positions, normals, UVs, or indices.`);

    const positions = new Float32Array(position.getArray());
    const normals = new Float32Array(normal.getArray());
    const uvs = new Float32Array(uv.getArray());
    const sourceIndices = indices.getArray();
    const copiedIndices = sourceIndices instanceof Uint32Array ? new Uint32Array(sourceIndices) : new Uint16Array(sourceIndices);
    const bounds = boundsForPositions(positions);
    for (let offset = 1; offset < positions.length; offset += 3) positions[offset] -= bounds.min[1];
    const column = index % ATLAS_COLUMNS;
    const row = Math.floor(index / ATLAS_COLUMNS);
    for (let offset = 0; offset < uvs.length; offset += 2) {
      uvs[offset] = (column + uvs[offset]) / ATLAS_COLUMNS;
      uvs[offset + 1] = (row + uvs[offset + 1]) / ATLAS_ROWS;
    }

    const primitive = output.createPrimitive()
      .setAttribute('POSITION', output.createAccessor(`${item.id}-position`, buffer).setType('VEC3').setArray(positions))
      .setAttribute('NORMAL', output.createAccessor(`${item.id}-normal`, buffer).setType('VEC3').setArray(normals))
      .setAttribute('TEXCOORD_0', output.createAccessor(`${item.id}-uv`, buffer).setType('VEC2').setArray(uvs))
      .setIndices(output.createAccessor(`${item.id}-indices`, buffer).setType('SCALAR').setArray(copiedIndices))
      .setMaterial(material);
    const mesh = output.createMesh(item.id).addPrimitive(primitive);
    scene.addChild(output.createNode(item.id).setMesh(mesh));
    assets.push({
      id: item.id,
      kind: item.kind,
      meshName: item.id,
      sourceModel: item.modelName,
      sourceTexture: item.textureName,
      atlasTile: [column, row],
      bounds: {
        min: roundVector([bounds.min[0], 0, bounds.min[2]]),
        max: roundVector([bounds.max[0], bounds.max[1] - bounds.min[1], bounds.max[2]]),
        size: roundVector([bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]])
      }
    });
  }
  return { document: output, assets };
}

function boundsForPositions(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[offset + axis]);
      max[axis] = Math.max(max[axis], positions[offset + axis]);
    }
  }
  return { min, max };
}

function roundVector(vector) {
  return vector.map((value) => Math.round(value * 1000) / 1000);
}

async function main() {
  const archivePath = path.resolve(process.argv[2] ?? path.join(os.homedir(), 'Downloads', 'tree_pack_1.1.zip'));
  const outputDir = path.resolve(process.argv[3] ?? path.join(process.cwd(), 'public', 'stage-props', 'tree-pack-1.1'));
  const manifest = await importTreePack({ archivePath, outputDir });
  console.log(`Imported ${manifest.treeCount} trees and ${manifest.bushCount} bushes to ${outputDir} (${manifest.sizeBytes} bytes).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

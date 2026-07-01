#!/usr/bin/env node
import { createRequire } from 'node:module';
import { access, copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const defaultSourceRoot = '/Users/brandonhenry/Documents/Kore/Stages/Naruto/Hidden Leaf Village - Complete';
const args = new Map();
const flags = new Set();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (value.startsWith('--')) {
    const key = value.slice(2);
    const next = process.argv[index + 1];
    if (next && !next.startsWith('--')) {
      args.set(key, next);
      index += 1;
    } else {
      flags.add(key);
    }
  }
}

const sourceRoot = resolve(args.get('source') ?? defaultSourceRoot);
const publicStagesRoot = resolve(repoRoot, 'public', 'stages');
const skipUnavailable = flags.has('skip-unavailable');
const hiddenLeafBudgetMb = numberArg('hidden-leaf-budget-mb', 30);
const hiddenLeafSimplifyRatio = numberArg('hidden-leaf-simplify-ratio', 0.16);
const hiddenLeafSimplifyError = numberArg('hidden-leaf-simplify-error', 0.02);
const hiddenLeafTextureSize = Math.round(numberArg('hidden-leaf-texture-size', 256));

const stages = [
  {
    id: 'hidden-leaf-village',
    name: 'Hidden Leaf Village',
    subtitle: 'Complete 3D village arena',
    source: join(sourceRoot, 'Hidden Leaf Village - Complete.blend'),
    sourceKind: 'blend',
    thumbnail: join(sourceRoot, 'photo.png'),
    manifest: {
      renderMode: 'model',
      type: 'model-stage',
      visualStylePreset: 'anime-daylight',
      hidden: false,
      floor: '#4f7942',
      floorTexturePath: '/stages/grasslands/floor-texture.png',
      floorTextureRepeat: [16, 16],
      safePlatform: {
        enabled: true,
        shape: 'octagon',
        texturePath: '/stages/shared/handpainted-stone-platform.png',
        textureRepeat: [8, 8],
        radius: 18,
        height: 0.16,
        yOffset: 0.08,
        color: '#777777',
        edgeColor: '#f0b35a',
        edgeOpacity: 0.72
      },
      floorEffects: {
        grass: {
          enabled: true,
          density: 0.62,
          height: 0.18,
          patchWidth: 76,
          patchDepth: 54,
          bladeCount: 8200,
          bladeWidth: 0.06,
          segments: 4,
          windStrength: 0.12,
          windSpeed: 0.85,
          quality: 'medium',
          colorBottom: '#24481f',
          colorTop: '#78c14c'
        },
        dust: {
          enabled: true,
          intensity: 0.45,
          density: 0.42,
          size: 1.1,
          speed: 0.72,
          opacity: 0.32,
          color: '#c8b48a',
          quality: 'medium',
          maxParticles: 320,
          reactive: true
        },
        petals: {
          enabled: true,
          intensity: 0.36,
          density: 0.34,
          size: 0.42,
          speed: 0.72,
          opacity: 0.68,
          windStrength: 0.32,
          fallSpeed: 0.46,
          colorA: '#ff9ac5',
          colorB: '#fff4fb',
          quality: 'low',
          maxParticles: 260,
          reactive: false
        }
      },
      rail: '#f0b35a',
      light: '#fff1d0',
      skyboxPath: '/stages/shared/default-skybox.png',
      world: { width: 72, depth: 72, floorY: -0.045, backgroundColor: '#9bdfff' },
      fightPlane: { center: [0, 0, 0], width: 30, depth: 22, y: 0 },
      spawns: { p1: [-3.2, 0, 0], p2: [3.2, 0, 0] },
      camera: { previewPosition: [24, 24, 64], previewTarget: [0, 3.2, 0], target: [0, 1.4, 0], distance: 8, height: 3.4, fov: 38 },
      collision: { mode: 'box' },
      model: {
        path: '/stages/hidden-leaf-village/stage.glb',
        url: '/stages/hidden-leaf-village/stage.glb',
        format: 'glb',
        position: [0, 0, 0],
        scale: [1, 1, 1],
        rotation: [0, 0, 0],
        focus: [0, 3.2, 0],
        castShadow: true,
        receiveShadow: true
      }
    }
  },
  {
    id: 'naruto-apartment',
    name: "Naruto's Apartment",
    subtitle: 'Compact 3D interior arena',
    source: join(sourceRoot, "Naruto's Apartment Room Anime Recreation - Complete.blend"),
    sourceKind: 'blend',
    thumbnail: join(sourceRoot, 'Naruto apartment', 'Stage2.bmp'),
    manifest: apartmentManifest('naruto-apartment', {
      name: "Naruto's Apartment",
      subtitle: 'Compact 3D interior arena',
      sourceLabel: 'Original FBX recreation'
    })
  },
  {
    id: 'naruto-apartment-fix',
    name: "Naruto's Apartment Fix",
    subtitle: 'Revised 3D interior arena',
    source: join(sourceRoot, 'Naruto apartment', 'Apartment Fix.blend'),
    sourceKind: 'blend',
    thumbnail: join(sourceRoot, 'Naruto apartment', 'Stage5.bmp'),
    manifest: apartmentManifest('naruto-apartment-fix', {
      name: "Naruto's Apartment Fix",
      subtitle: 'Revised 3D interior arena',
      sourceLabel: 'Apartment Fix.blend'
    })
  },
  {
    id: 'naruto-apartment-fix-2',
    name: "Naruto's Apartment Fix 2",
    subtitle: 'Second revised 3D interior arena',
    source: join(sourceRoot, 'Naruto apartment', 'Apartment Fix 2.blend'),
    sourceKind: 'blend',
    thumbnail: join(sourceRoot, 'Naruto apartment', 'Stage6.bmp'),
    manifest: apartmentManifest('naruto-apartment-fix-2', {
      name: "Naruto's Apartment Fix 2",
      subtitle: 'Second revised 3D interior arena',
      sourceLabel: 'Apartment Fix 2.blend'
    })
  }
];

const unavailable = [];
for (const stage of stages) {
  try {
    await importStage(stage);
    console.log(`Imported ${stage.id}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!skipUnavailable) throw new Error(`${stage.id}: ${message}`);
    unavailable.push(`${stage.id}: ${message}`);
    console.warn(`Skipped ${stage.id}: ${message}`);
  }
}

if (unavailable.length) {
  console.warn('\nUnavailable stages:');
  unavailable.forEach((message) => console.warn(`- ${message}`));
  console.warn('Install Blender or set KORE_BLENDER=/absolute/path/to/blender to import .blend-only stages.');
}

function apartmentManifest(id, options) {
  return {
    renderMode: 'model',
    type: 'model-stage',
    visualStylePreset: 'dojo-sunset',
    hidden: false,
    floor: '#6d5743',
    floorTexturePath: '/stages/dust-arena/floor-texture.png',
    floorTextureRepeat: [9, 9],
    safePlatform: {
      enabled: true,
      shape: 'octagon',
      texturePath: '/stages/shared/handpainted-stone-platform.png',
      textureRepeat: [6, 6],
      radius: 11,
      height: 0.14,
      yOffset: 0.07,
      color: '#7a6a58',
      edgeColor: '#ffd28a',
      edgeOpacity: 0.68
    },
    floorEffects: {
      dust: {
        enabled: true,
        intensity: 0.38,
        density: 0.34,
        size: 0.82,
        speed: 0.62,
        opacity: 0.28,
        color: '#d0b08a',
        quality: 'low',
        maxParticles: 180,
        reactive: true
      },
      footsteps: {
        enabled: true,
        intensity: 0.28,
        density: 0.26,
        size: 0.72,
        speed: 0.7,
        opacity: 0.22,
        color: '#f4e6c9',
        quality: 'low',
        maxDecals: 48,
        reactive: true
      }
    },
    rail: '#ffd28a',
    light: '#ffe8bd',
    skyboxPath: '/stages/shared/default-skybox.png',
    world: { width: 24, depth: 24, floorY: -0.045, backgroundColor: '#3a2d24' },
    fightPlane: { center: [0, 0, 0], width: 10, depth: 7, y: 0 },
    spawns: { p1: [-2.2, 0, 0], p2: [2.2, 0, 0] },
    camera: { previewPosition: [0, 5.8, 12], previewTarget: [0, 1.5, 0], target: [0, 1.2, 0], distance: 7.5, height: 3, fov: 35 },
    collision: { mode: 'box' },
    model: {
      path: `/stages/${id}/stage.glb`,
      url: `/stages/${id}/stage.glb`,
      format: 'glb',
      position: [0, 0, 0],
      scale: [1, 1, 1],
      rotation: [0, 0, 0],
      focus: [0, 1.5, 0],
      castShadow: true,
      receiveShadow: true
    },
    mugen: {
      sourceDef: options.sourceLabel,
      warnings: []
    },
    name: options.name,
    subtitle: options.subtitle
  };
}

async function importStage(stage) {
  await assertReadable(stage.source);
  const stageDir = join(publicStagesRoot, stage.id);
  await mkdir(stageDir, { recursive: true });
  const rawGlbPath = join(stageDir, 'stage.raw.glb');
  const finalGlbPath = join(stageDir, 'stage.glb');
  const previewPath = join(stageDir, 'preview.png');
  const exportMetaPath = join(stageDir, 'stage-export-meta.json');
  await rm(rawGlbPath, { force: true });
  await rm(finalGlbPath, { force: true });
  await rm(previewPath, { force: true });
  await rm(exportMetaPath, { force: true });

  if (stage.sourceKind === 'fbx') {
    await convertFbx(stage.source, rawGlbPath);
  } else if (stage.sourceKind === 'blend') {
    await convertBlend(stage.source, rawGlbPath, previewPath, exportMetaPath, stage);
  } else {
    throw new Error(`Unsupported source kind: ${stage.sourceKind}`);
  }

  await optimizeGlb(rawGlbPath, finalGlbPath, stage);
  await rm(rawGlbPath, { force: true });
  const thumbnailPath = existsSync(previewPath) ? `/stages/${stage.id}/preview.png` : await copyThumbnail(stage.thumbnail, stageDir);
  const exportMeta = await readJsonIfExists(exportMetaPath);
  const model = stage.manifest.model ? await versionModelPaths(stage.manifest.model, finalGlbPath) : undefined;
  const manifest = {
    id: stage.id,
    name: stage.manifest.name ?? stage.name,
    subtitle: stage.manifest.subtitle ?? stage.subtitle,
    ...stage.manifest,
    model: {
      ...model,
      bounds: exportMeta?.bounds ?? stage.manifest.model?.bounds
    },
    mugen: {
      ...stage.manifest.mugen,
      exportMeta: exportMeta?.source
    },
    thumbnailPath
  };
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(join(stageDir, 'stage.json'), manifestJson, 'utf8');
  await writeFile(join(stageDir, 'manifest.json'), manifestJson, 'utf8');
  await updateStageIndex(stage.id);
}

async function versionModelPaths(model, modelPath) {
  const stats = await stat(modelPath);
  const version = `${Math.round(stats.mtimeMs).toString(36)}-${stats.size.toString(36)}`;
  return {
    ...model,
    path: appendAssetVersion(model.path, version),
    url: appendAssetVersion(model.url ?? model.path, version)
  };
}

function appendAssetVersion(path, version) {
  if (typeof path !== 'string' || !path.trim()) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}v=${version}`;
}

async function convertFbx(sourcePath, outputPath) {
  let convert;
  try {
    convert = require('fbx2gltf');
  } catch {
    throw new Error('Missing dev dependency "fbx2gltf". Run npm install first.');
  }
  await convert(sourcePath, outputPath);
}

async function convertBlend(sourcePath, outputPath, previewPath, exportMetaPath, stage) {
  const blender = await resolveBlenderExecutable();
  if (!blender) {
    throw new Error(`Blender is required for ${basename(sourcePath)}. Install Blender or set KORE_BLENDER=/absolute/path/to/blender.`);
  }
  await run(blender, [
    '-b',
    sourcePath,
    '--python',
    join(repoRoot, 'scripts', 'blender-export-stage.py'),
    '--',
    outputPath,
    previewPath,
    exportMetaPath,
    stage.id
  ]);
}

async function resolveBlenderExecutable() {
  const candidates = [
    process.env.KORE_BLENDER,
    resolve(repoRoot, 'tools', 'blender', 'Blender.app', 'Contents', 'MacOS', 'Blender'),
    resolve(repoRoot, 'tools', 'blender', 'blender'),
    await findExecutable('blender')
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

async function optimizeGlb(inputPath, outputPath, stage) {
  const gltfTransform = resolve(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'gltf-transform.cmd' : 'gltf-transform');
  if (!existsSync(gltfTransform)) {
    await rename(inputPath, outputPath);
    return;
  }
  try {
    const hiddenLeaf = stage.id === 'hidden-leaf-village';
    await run(gltfTransform, [
      'optimize',
      inputPath,
      outputPath,
      '--compress',
      hiddenLeaf ? 'quantize' : 'false',
      '--texture-compress',
      hiddenLeaf ? 'webp' : 'false',
      '--simplify',
      hiddenLeaf ? 'true' : 'false',
      '--simplify-ratio',
      hiddenLeaf ? String(hiddenLeafSimplifyRatio) : '0',
      '--simplify-error',
      hiddenLeaf ? String(hiddenLeafSimplifyError) : '0.0001',
      '--texture-size',
      hiddenLeaf ? String(hiddenLeafTextureSize) : '2048',
      '--palette',
      'false'
    ]);
    if (hiddenLeaf) {
      await centerGlb(outputPath);
      await assertGlbBudget(outputPath, hiddenLeafBudgetMb, stage.id);
    }
    await run(gltfTransform, ['inspect', outputPath]);
  } catch (error) {
    await rm(outputPath, { force: true });
    if (stage.id === 'hidden-leaf-village') {
      throw error;
    }
    await rename(inputPath, outputPath);
    console.warn(`gltf-transform optimize failed; kept raw GLB. ${error instanceof Error ? error.message : error}`);
  }
}

async function assertGlbBudget(outputPath, budgetMb, stageId) {
  const stats = await stat(outputPath);
  const sizeMb = stats.size / 1024 / 1024;
  if (sizeMb <= budgetMb) return;
  throw new Error(
    `${stageId} optimized GLB is ${sizeMb.toFixed(1)} MB, above the ${budgetMb} MB budget. ` +
    'Raise --hidden-leaf-budget-mb intentionally or lower --hidden-leaf-simplify-ratio / --hidden-leaf-texture-size.'
  );
}

async function centerGlb(outputPath) {
  const gltfTransform = resolve(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'gltf-transform.cmd' : 'gltf-transform');
  const centeredPath = `${outputPath}.centered.glb`;
  await rm(centeredPath, { force: true });
  await run(gltfTransform, ['center', outputPath, centeredPath, '--pivot', 'below']);
  await rm(outputPath, { force: true });
  await rename(centeredPath, outputPath);
}

async function copyThumbnail(thumbnail, stageDir) {
  if (!thumbnail || !existsSync(thumbnail)) return undefined;
  const extension = extname(thumbnail).toLowerCase() || '.png';
  const destination = join(stageDir, `thumbnail${extension}`);
  await copyFile(thumbnail, destination);
  return `/stages/${basename(stageDir)}/thumbnail${extension}`;
}

async function readJsonIfExists(path) {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    console.warn(`Could not read ${path}: ${error instanceof Error ? error.message : error}`);
    return undefined;
  }
}

async function updateStageIndex(stageId) {
  const indexPath = join(publicStagesRoot, 'index.json');
  let stageIds = [];
  try {
    const index = JSON.parse(await readFile(indexPath, 'utf8'));
    stageIds = Array.isArray(index.stages) ? index.stages : [];
  } catch {
    stageIds = [];
  }
  if (!stageIds.includes(stageId)) stageIds.push(stageId);
  await writeFile(indexPath, `${JSON.stringify({ stages: stageIds }, null, 2)}\n`, 'utf8');
}

async function assertReadable(path) {
  try {
    await access(path, constants.R_OK);
  } catch {
    throw new Error(`Missing source file: ${path}`);
  }
}

async function findExecutable(name) {
  const paths = (process.env.PATH ?? '').split(':').filter(Boolean);
  for (const path of paths) {
    const candidate = join(path, name);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

async function run(command, args) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 && !/Traceback \(most recent call last\):|Fatal Python error|TypeError:|ModuleNotFoundError:/.test(output)) {
        resolvePromise();
        return;
      }
      reject(new Error(output.trim() || `${command} exited with ${code}`));
    });
  });
}

function numberArg(name, fallback) {
  const raw = args.get(name) ?? process.env[`KORE_${name.toUpperCase().replace(/-/g, '_')}`];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

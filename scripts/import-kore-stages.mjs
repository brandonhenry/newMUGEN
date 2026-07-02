#!/usr/bin/env node
import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const repoRoot = resolve(new URL('..', import.meta.url).pathname);
const defaultSourceRoot = '/Users/brandonhenry/Documents/Kore/Stages';
const publicStagesRoot = resolve(repoRoot, 'public', 'stages');
const sourcePriority = ['blend', 'mmd', 'xps', 'mesh', 'fbx', 'dae', 'obj'];
const supportedExtensions = new Set(['.blend', '.xps', '.mesh', '.fbx', '.dae', '.obj', '.pmx', '.pmd']);
const mmdOperators = [
  'mmd_tools.import_model',
  'import_scene.mmd',
  'import_scene.pmx',
  'import_scene.pmd'
];
const xpsOperators = [
  'xps_tools.import_model',
  'import_scene.xps',
  'import_scene.xnalara_model',
  'import_scene.xnalara'
];
const args = new Map();
const flags = new Set();

for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (!value.startsWith('--')) continue;
  const key = value.slice(2);
  const next = process.argv[index + 1];
  if (next && !next.startsWith('--')) {
    args.set(key, next);
    index += 1;
  } else {
    flags.add(key);
  }
}

const sourceRoot = resolve(args.get('source') ?? defaultSourceRoot);
const skipUnavailable = flags.has('skip-unavailable');
const dryRun = flags.has('dry-run') || flags.has('list');
const onlyStageId = args.get('stage');
const hiddenLeafBudgetMb = numberArg('hidden-leaf-budget-mb', 60);
const hiddenLeafSimplifyRatio = numberArg('hidden-leaf-simplify-ratio', 0.35);
const hiddenLeafSimplifyError = numberArg('hidden-leaf-simplify-error', 0.012);
const hiddenLeafTextureSize = Math.round(numberArg('hidden-leaf-texture-size', 512));
const hiddenLeafTextureCompress = args.get('hidden-leaf-texture-compress') ?? process.env.KORE_HIDDEN_LEAF_TEXTURE_COMPRESS ?? 'webp';
const hiddenLeafGeometryCompress = args.get('hidden-leaf-geometry-compress') ?? process.env.KORE_HIDDEN_LEAF_GEOMETRY_COMPRESS ?? 'false';
const installAddons = !flags.has('no-addon-install') && process.env.KORE_STAGE_AUTO_INSTALL_ADDONS !== 'false';
const duplicateSkips = [];

await assertReadable(sourceRoot, 'source root');
let stages = await discoverStages(sourceRoot);
if (onlyStageId) stages = stages.filter((stage) => stage.id === onlyStageId);
if (onlyStageId && stages.length === 0) {
  throw new Error(`Unknown stage id "${onlyStageId}". Run with --dry-run to list discovered ids.`);
}

if (dryRun) {
  printDiscovery(stages);
  process.exit(0);
}

const report = {
  imported: [],
  skipped: [...duplicateSkips],
  failed: []
};

const blender = await resolveBlenderExecutable();
if (!blender) {
  const message = 'Blender is required. Install Blender or set KORE_BLENDER=/absolute/path/to/blender.';
  if (!skipUnavailable) throw new Error(message);
  report.skipped.push(...stages.map((stage) => ({
    id: stage.id,
    name: stage.name,
    sourceKind: stage.sourceKind,
    source: stage.source,
    message
  })));
  printReport(report);
  process.exit(0);
}
try {
  await preflightImportAddons(blender, stages);
} catch (error) {
  if (!skipUnavailable) throw error;
  const message = error instanceof Error ? error.message : String(error);
  const unavailableKinds = unavailableSourceKinds(error);
  const skippedStages = stages.filter((stage) => unavailableKinds.has(stage.sourceKind));
  const fallbackStages = [];
  for (const stage of skippedStages) {
    const fallback = firstBuiltInFallback(stage);
    if (fallback) {
      console.warn(`Falling back ${stage.id} from ${stage.sourceKind} to ${fallback.kind}: ${basename(fallback.path)}`);
      fallbackStages.push({
        ...stage,
        source: fallback.path,
        sourceKind: fallback.kind,
        alternateSources: stage.alternateSources.filter((source) => source.path !== fallback.path)
      });
    } else {
      report.skipped.push({
        id: stage.id,
        name: stage.name,
        sourceKind: stage.sourceKind,
        source: stage.source,
        message
      });
    }
  }
  stages = [
    ...stages.filter((stage) => !unavailableKinds.has(stage.sourceKind)),
    ...fallbackStages
  ].sort((a, b) => a.id.localeCompare(b.id));
}

for (const stage of stages) {
  try {
    const result = await importStage(stage, blender);
    report.imported.push(result);
    console.log(`Imported ${stage.id} (${stage.sourceKind}, ${formatBytes(result.bytes)})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const entry = {
      id: stage.id,
      name: stage.name,
      sourceKind: stage.sourceKind,
      source: stage.source,
      message
    };
    if (!skipUnavailable) {
      report.failed.push(entry);
      printReport(report);
      throw new Error(`${stage.id}: ${message}`);
    }
    report.skipped.push(entry);
    console.warn(`Skipped ${stage.id}: ${message}`);
  }
}

printReport(report);

async function discoverStages(root) {
  const grouped = new Map();
  await walk(root, async (path, dirent) => {
    if (!dirent.isFile()) return;
    const kind = sourceKindForFile(path);
    if (!kind) return;
    const folder = dirname(path);
    const files = grouped.get(folder) ?? [];
    files.push({ path, kind });
    grouped.set(folder, files);
  });

  const deduped = new Set();
  const usedIds = new Map();
  const discovered = [];
  for (const [folder, files] of [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sources = chooseSources(folder, files);
    if (!sources.length) continue;
    const source = sources[0];
    const relativeFolder = relative(root, folder);
    const stage = buildStageDefinition(root, folder, relativeFolder, source, usedIds);
    stage.alternateSources = sources.slice(1);
    const duplicateKey = stageDuplicateKey(stage);
    if (deduped.has(duplicateKey)) {
      duplicateSkips.push({
        id: stage.id,
        name: stage.name,
        sourceKind: stage.sourceKind,
        source: stage.source,
        message: `Duplicate download copy of ${duplicateKey}`
      });
      continue;
    }
    deduped.add(duplicateKey);
    discovered.push(stage);
  }
  return discovered;
}

async function walk(root, visitor) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.mesh.ascii') continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      await walk(path, visitor);
    } else {
      await visitor(path, entry);
    }
  }
}

function sourceKindForFile(path) {
  const name = basename(path).toLowerCase();
  if (name.endsWith('.mesh.ascii')) return 'mesh';
  if (name.endsWith('.pmx') || name.endsWith('.pmd')) return 'mmd';
  const extension = extname(name);
  if (!supportedExtensions.has(extension)) return undefined;
  return extension.slice(1);
}

function chooseSources(folder, files) {
  return [...files].sort((a, b) => {
    const priorityDelta = sourcePriority.indexOf(a.kind) - sourcePriority.indexOf(b.kind);
    if (priorityDelta !== 0) return priorityDelta;
    return sourceScore(folder, a.path) - sourceScore(folder, b.path) || a.path.localeCompare(b.path);
  });
}

function sourceScore(folder, path) {
  const folderName = normalizeText(basename(folder));
  const stem = normalizeText(basename(path).replace(/\.mesh\.ascii$/i, '').replace(/\.[^.]+$/i, ''));
  let score = 50;
  if (stem === folderName) score -= 40;
  if (stem.includes(folderName) || folderName.includes(stem)) score -= 18;
  if (stem === 'xps' || stem === 'generic-item' || stem === 'stage') score += 8;
  if (stem.includes('final')) score -= 5;
  if (stem.includes('apartment') && !folderName.includes('apartment')) score += 25;
  if (stem.includes('fix')) score += 6;
  return score;
}

function firstBuiltInFallback(stage) {
  return stage.alternateSources.find((source) => source.kind === 'blend' || source.kind === 'fbx' || source.kind === 'dae' || source.kind === 'obj');
}

function buildStageDefinition(root, folder, relativeFolder, source, usedIds) {
  const parts = relativeFolder.split(sep).filter(Boolean);
  const category = inferCategory(parts, folder, source);
  const folderName = displayNameSource(folder, source);
  const override = knownStageOverride(category, folderName);
  const cleanName = override?.name ?? cleanStageName(folderName);
  const baseId = override?.id ?? slugify([category, cleanName].filter(Boolean).join(' '));
  const id = uniqueId(baseId, usedIds);
  const sourceKind = source.kind;
  return {
    id,
    name: cleanName,
    subtitle: override?.subtitle ?? `${titleize(category)} model arena`,
    category: titleize(category),
    source: source.path,
    sourceKind,
    sourceFolder: folder,
    sourceRoot: root,
    thumbnail: findThumbnail(folder),
    manifest: override?.manifest?.(id) ?? genericManifest(id, {
      name: cleanName,
      subtitle: `${titleize(category)} model arena`,
      source,
      sourceFolder: folder,
      category: titleize(category)
    })
  };
}

function inferCategory(parts, folder, source) {
  const text = [relative(sourceRoot, folder), basename(source.path)].join(' ').toLowerCase();
  if (text.includes('bleach') || text.includes('ichigo') || text.includes('senkaimon') || text.includes('urahara') || text.includes('seireitei')) return 'bleach';
  if (text.includes('naruto') || text.includes('nuns') || text.includes('konoha') || text.includes('kumogakure') || text.includes('uzumaki')) return 'naruto';
  if (text.includes('one_piece') || text.includes('one piece') || text.includes('opbw') || text.includes('opbr') || text.includes('opfp') || text.includes('opdp')) return 'one-piece';
  if (text.includes('dbfz') || text.includes('dbxv') || text.includes('dbs') || text.includes('dbz') || text.includes('sdbh') || text.includes('dragon')) return 'dbz';
  if (text.includes('jujutsu') || text.includes('jjk') || text.includes('jjbts')) return 'jujutsu-kaisen';
  if (text.includes('mha') || text.includes('mhaui')) return 'my-hero-academia';
  if (text.includes('shaman')) return 'shaman-king';
  if (text.includes('rumble')) return 'rumble-roses';
  return 'general';
}

function displayNameSource(folder, source) {
  const folderName = basename(folder);
  const fileStem = basename(source.path)
    .replace(/\.mesh\.ascii$/i, '')
    .replace(/\.[^.]+$/i, '');
  const folderScore = noisyNameScore(folderName);
  const fileScore = noisyNameScore(fileStem);
  if (/xfbin|xps|generic[-_ ]?item/i.test(fileStem) && !/xfbin|xps|generic[-_ ]?item/i.test(folderName)) {
    return folderName;
  }
  if (!['xps', 'generic_item', 'generic-item', 'stage'].includes(normalizeText(fileStem)) && fileScore + 8 < folderScore) {
    return fileStem;
  }
  return folderName;
}

function noisyNameScore(value) {
  const normalized = value.toLowerCase();
  let score = normalized.length / 4;
  for (const token of [' by ', 'xps', 'obj', 'blend', 'fbx', 'mmd', 'download', ' dl', 'deviantart', '___', '__', '_']) {
    if (normalized.includes(token)) score += 12;
  }
  if (/d[a-z0-9]{5,}$/i.test(normalized)) score += 8;
  return score;
}

function stageDuplicateKey(stage) {
  return [
    normalizeText(stage.category),
    normalizeText(stage.name),
    stage.sourceKind,
    basename(stage.source).toLowerCase()
  ].join(':');
}

function knownStageOverride(category, folderName) {
  const normalizedCategory = category.toLowerCase();
  if (normalizedCategory === 'naruto' && folderName === 'Hidden Leaf Village - Complete') {
    return {
      id: 'hidden-leaf-village',
      name: 'Hidden Leaf Village',
      subtitle: 'Complete 3D village arena',
      manifest: hiddenLeafManifest
    };
  }
  if (normalizedCategory === 'naruto' && folderName === 'Naruto apartment') {
    return {
      id: 'naruto-apartment',
      name: "Naruto's Apartment",
      subtitle: 'Compact 3D interior arena'
    };
  }
  return undefined;
}

function uniqueId(baseId, usedIds) {
  const count = usedIds.get(baseId) ?? 0;
  usedIds.set(baseId, count + 1);
  return count === 0 ? baseId : `${baseId}-${count + 1}`;
}

function genericManifest(id, options) {
  return {
    renderMode: 'model',
    type: 'model-stage',
    visualStylePreset: 'anime-daylight',
    hidden: false,
    floor: '#4f7942',
    floorTexturePath: '/stages/grasslands/floor-texture.png',
    floorTextureRepeat: [10, 10],
    safePlatform: {
      enabled: true,
      shape: 'octagon',
      texturePath: '/stages/shared/handpainted-stone-platform.png',
      textureRepeat: [6, 6],
      radius: 11,
      height: 0.14,
      yOffset: 0.07,
      color: '#777777',
      edgeColor: '#f0b35a',
      edgeOpacity: 0.72
    },
    floorEffects: {
      dust: {
        enabled: true,
        intensity: 0.3,
        density: 0.25,
        size: 0.82,
        speed: 0.62,
        opacity: 0.24,
        color: '#c8b48a',
        quality: 'low',
        maxParticles: 160,
        reactive: true
      }
    },
    rail: '#f0b35a',
    light: '#fff1d0',
    skyboxPath: '/stages/shared/default-skybox.png',
    world: { width: 24, depth: 24, floorY: -0.045, backgroundColor: '#9bdfff' },
    fightPlane: { center: [0, 0, 0], width: 10, depth: 7, y: 0 },
    spawns: { p1: [-2.2, 0, 0], p2: [2.2, 0, 0] },
    camera: { previewPosition: [0, 6, 13], previewTarget: [0, 1.5, 0], target: [0, 1.2, 0], distance: 7.8, height: 3, fov: 36 },
    collision: { mode: 'box' },
    model: modelManifest(id),
    mugen: sourceMetadata(options),
    name: options.name,
    subtitle: options.subtitle
  };
}

function hiddenLeafManifest(id) {
  return {
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
    model: modelManifest(id, 'stage.flattened.glb', [0, 3.2, 0]),
    mugen: {
      sourceDef: 'Hidden Leaf Village - Complete.blend',
      warnings: []
    },
    name: 'Hidden Leaf Village',
    subtitle: 'Complete 3D village arena'
  };
}

function modelManifest(id, fileName = 'stage.glb', focus = [0, 1.5, 0]) {
  return {
    path: `/stages/${id}/${fileName}`,
    url: `/stages/${id}/${fileName}`,
    format: 'glb',
    position: [0, 0, 0],
    scale: [1, 1, 1],
    rotation: [0, 0, 0],
    focus,
    castShadow: true,
    receiveShadow: true
  };
}

function sourceMetadata(options) {
  return {
    sourceDef: options.source.path,
    sourceKind: options.source.kind,
    sourceFolder: options.sourceFolder,
    category: options.category,
    warnings: []
  };
}

async function importStage(stage, blender) {
  await assertReadable(stage.source, 'source file');
  const stageDir = join(publicStagesRoot, stage.id);
  await mkdir(stageDir, { recursive: true });
  const rawGlbPath = join(stageDir, 'stage.raw.glb');
  const finalName = stage.id === 'hidden-leaf-village' ? 'stage.flattened.glb' : 'stage.glb';
  const finalGlbPath = join(stageDir, finalName);
  const previewPath = join(stageDir, 'preview.png');
  const exportMetaPath = join(stageDir, 'stage-export-meta.json');

  for (const path of [rawGlbPath, finalGlbPath, join(stageDir, 'stage.glb'), join(stageDir, 'stage.flattened.glb'), previewPath, exportMetaPath]) {
    await rm(path, { force: true });
  }

  await convertWithBlender(blender, stage, rawGlbPath, previewPath, exportMetaPath);
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
      sourceDef: stage.source,
      sourceKind: stage.sourceKind,
      sourceFolder: stage.sourceFolder,
      category: stage.category,
      warnings: [
        ...(stage.manifest.mugen?.warnings ?? []),
        ...(exportMeta?.source?.warnings ?? [])
      ],
      exportMeta: exportMeta?.source
    },
    thumbnailPath
  };
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(join(stageDir, 'stage.json'), manifestJson, 'utf8');
  await writeFile(join(stageDir, 'manifest.json'), manifestJson, 'utf8');
  await updateStageIndex(stage.id);
  const stats = await stat(finalGlbPath);
  return {
    id: stage.id,
    name: stage.name,
    sourceKind: stage.sourceKind,
    source: stage.source,
    output: finalGlbPath,
    bytes: stats.size,
    warnings: manifest.mugen.warnings
  };
}

async function convertWithBlender(blender, stage, outputPath, previewPath, exportMetaPath) {
  const blenderArgs = ['-b'];
  if (stage.sourceKind === 'blend') blenderArgs.push(stage.source);
  blenderArgs.push(
    '--python',
    join(repoRoot, 'scripts', 'blender-export-stage.py'),
    '--',
    outputPath,
    previewPath,
    exportMetaPath,
    stage.id,
    stage.source,
    stage.sourceKind
  );
  await run(blender, blenderArgs, {
    env: {
      ...process.env,
      KORE_STAGE_SOURCE_ROOT: stage.sourceFolder
    }
  });
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
      hiddenLeaf ? hiddenLeafGeometryCompress : 'false',
      '--texture-compress',
      hiddenLeaf ? hiddenLeafTextureCompress : 'false',
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
    if (stage.id === 'hidden-leaf-village') throw error;
    await rename(inputPath, outputPath);
    console.warn(`gltf-transform optimize failed for ${stage.id}; kept raw GLB. ${error instanceof Error ? error.message : error}`);
  }
}

async function centerGlb(outputPath) {
  const gltfTransform = resolve(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'gltf-transform.cmd' : 'gltf-transform');
  const centeredPath = `${outputPath}.centered.glb`;
  await rm(centeredPath, { force: true });
  await run(gltfTransform, ['center', outputPath, centeredPath, '--pivot', 'below']);
  await rm(outputPath, { force: true });
  await rename(centeredPath, outputPath);
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

async function copyThumbnail(thumbnail, stageDir) {
  if (!thumbnail || !existsSync(thumbnail)) return undefined;
  const extension = extname(thumbnail).toLowerCase() || '.png';
  const destination = join(stageDir, `thumbnail${extension}`);
  await copyFile(thumbnail, destination);
  return `/stages/${basename(stageDir)}/thumbnail${extension}`;
}

function findThumbnail(folder) {
  const preferred = ['preview.png', 'photo.png', 'thumbnail.png', 'stage.png', 'Stage.png', 'Stage2.bmp', 'Stage5.bmp', 'Stage6.bmp'];
  for (const name of preferred) {
    const path = join(folder, name);
    if (existsSync(path)) return path;
  }
  return undefined;
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

async function preflightImportAddons(blender, stagesToImport) {
  const missing = [];
  if (stagesToImport.some((stage) => stage.sourceKind === 'mmd')) {
    const available = await ensureBlenderOperators(blender, {
      label: 'MMD Tools',
      operators: mmdOperators,
      extensionPackages: ['mmd_tools'],
      fallbackDownloads: [
        {
          url: 'https://github.com/MMD-Blender/blender_mmd_tools/archive/refs/heads/main.zip',
          module: 'mmd_tools'
        }
      ]
    });
    if (!available) missing.push({ label: 'MMD Tools for .pmx/.pmd', kinds: ['mmd'] });
  }
  if (stagesToImport.some((stage) => stage.sourceKind === 'xps' || stage.sourceKind === 'mesh')) {
    const available = await ensureBlenderOperators(blender, {
      label: 'XPS/XNALara',
      operators: xpsOperators,
      extensionPackages: ['io_xnalara', 'io-xnalara'],
      fallbackDownloads: [
        {
          url: 'https://github.com/johnzero7/XNALaraMesh/archive/refs/heads/master.zip',
          module: 'xps_tools'
        }
      ]
    });
    if (!available) missing.push({ label: 'XPS/XNALara importer for .xps/.mesh', kinds: ['xps', 'mesh'] });
  }
  if (!missing.length) return;
  const error = new Error(
    `${missing.map((entry) => entry.label).join(' and ')} sources were discovered, but the required Blender import operators are unavailable. ` +
    'The importer will use built-in .blend/.fbx/.dae/.obj fallbacks where present.'
  );
  error.missingKinds = new Set(missing.flatMap((entry) => entry.kinds));
  throw error;
}

function unavailableSourceKinds(error) {
  if (error && error.missingKinds instanceof Set) return error.missingKinds;
  const message = error instanceof Error ? error.message : String(error);
  const kinds = new Set();
  if (/MMD/i.test(message)) kinds.add('mmd');
  if (/XPS|XNALara|mesh/i.test(message)) {
    kinds.add('xps');
    kinds.add('mesh');
  }
  if (!kinds.size) {
    kinds.add('xps');
    kinds.add('mesh');
    kinds.add('mmd');
  }
  return kinds;
}

async function ensureBlenderOperators(blender, options) {
  if (await hasBlenderOperators(blender, options.operators)) return true;
  if (!installAddons) return false;

  for (const packageId of options.extensionPackages) {
    try {
      console.log(`Installing Blender extension ${packageId} for ${options.label}...`);
      await run(blender, ['--online-mode', '--command', 'extension', 'install', '-s', '-e', packageId]);
      if (await hasBlenderOperators(blender, options.operators)) return true;
    } catch (error) {
      console.warn(`Could not install Blender extension ${packageId}: ${error instanceof Error ? error.message : error}`);
    }
  }

  for (const download of options.fallbackDownloads) {
    try {
      console.log(`Installing Blender addon fallback for ${options.label} from ${download.url}...`);
      const addonZip = await downloadToTempFile(download.url, `${download.module}.zip`);
      await installAddonZip(blender, addonZip, download.module);
      if (await hasBlenderOperators(blender, options.operators)) return true;
    } catch (error) {
      console.warn(`Could not install Blender addon fallback ${download.module}: ${error instanceof Error ? error.message : error}`);
    }
  }

  return false;
}

async function hasBlenderOperators(blender, operators) {
  const script = [
    'import bpy, sys',
    `known = ${JSON.stringify(operators)}`,
    'def has_op(name):',
    '    group, op = name.split(".", 1)',
    '    ops_group = getattr(bpy.ops, group, None)',
    '    if not ops_group:',
    '        return False',
    '    try:',
    '        getattr(ops_group, op).get_rna_type()',
    '        return True',
    '    except Exception:',
    '        return False',
    'available = [name for name in known if has_op(name)]',
    'print("KORE_IMPORT_OPERATORS=" + ",".join(available))',
    'sys.exit(0 if available else 3)'
  ].join('\n');
  try {
    await run(blender, ['-b', '--python-expr', script]);
    return true;
  } catch (error) {
    return false;
  }
}

async function downloadToTempFile(url, fileName) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  const tempDirectory = await mkdtemp(join(tmpdir(), 'kore-stage-addon-'));
  const destination = join(tempDirectory, fileName);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(destination, buffer);
  return destination;
}

async function installAddonZip(blender, addonZip, moduleName) {
  const script = [
    'import bpy, sys',
    `addon_zip = ${JSON.stringify(addonZip)}`,
    `module_name = ${JSON.stringify(moduleName)}`,
    'bpy.ops.preferences.addon_install(filepath=addon_zip, overwrite=True)',
    'try:',
    '    bpy.ops.preferences.addon_enable(module=module_name)',
    'except Exception as error:',
    '    print(f"KORE addon enable warning: {error}")',
    'bpy.ops.wm.save_userpref()'
  ].join('\n');
  await run(blender, ['-b', '--python-expr', script]);
}

async function resolveBlenderExecutable() {
  const candidates = [
    process.env.KORE_BLENDER,
    resolve(repoRoot, 'tools', 'blender', 'Blender.app', 'Contents', 'MacOS', 'Blender'),
    resolve(repoRoot, 'tools', 'blender', 'blender'),
    '/Applications/Blender.app/Contents/MacOS/Blender',
    await findExecutable('blender')
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

async function findExecutable(name) {
  const paths = (process.env.PATH ?? '').split(':').filter(Boolean);
  for (const path of paths) {
    const candidate = join(path, name);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

async function assertReadable(path, label) {
  try {
    await access(path, constants.R_OK);
  } catch {
    throw new Error(`Missing or unreadable ${label}: ${path}`);
  }
}

async function run(command, runArgs, options = {}) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, runArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: options.env ?? process.env
    });
    let output = '';
    const appendOutput = (chunk) => {
      output += chunk;
      if (output.length > 30000) output = output.slice(-30000);
    };
    child.stdout.on('data', appendOutput);
    child.stderr.on('data', appendOutput);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 && !/Traceback \(most recent call last\):|Fatal Python error|TypeError:|ModuleNotFoundError:/.test(output)) {
        resolvePromise(output);
        return;
      }
      reject(new Error(output.trim() || `${command} exited with ${code}`));
    });
  });
}

function printDiscovery(discovered) {
  console.log(`Discovered ${discovered.length} stage source folders under ${sourceRoot}`);
  for (const stage of discovered) {
    console.log(`${stage.id}\t${stage.sourceKind}\t${relative(sourceRoot, stage.source)}`);
  }
}

function printReport(report) {
  console.log('\nKORE stage import report');
  console.log(`Imported: ${report.imported.length}`);
  for (const entry of report.imported) {
    const warnings = entry.warnings?.length ? ` warnings=${entry.warnings.length}` : '';
    console.log(`- ${entry.id} (${entry.sourceKind}, ${formatBytes(entry.bytes)})${warnings}`);
  }
  console.log(`Skipped: ${report.skipped.length}`);
  for (const entry of report.skipped) {
    console.log(`- ${entry.id} (${entry.sourceKind}): ${entry.message}`);
  }
  console.log(`Failed: ${report.failed.length}`);
  for (const entry of report.failed) {
    console.log(`- ${entry.id} (${entry.sourceKind}): ${entry.message}`);
  }
}

function normalizeText(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_]+/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function slugify(value) {
  return normalizeText(value) || 'stage';
}

function titleize(value) {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function cleanStageName(value) {
  let name = titleize(value)
    .replace(/\bDbfz\b/g, 'DBFZ')
    .replace(/\bDbs\b/g, 'DBS')
    .replace(/\bDbxv2?\b/g, (match) => match.toUpperCase())
    .replace(/\bSdbh\b/g, 'SDBH')
    .replace(/\bMha\b/g, 'MHA')
    .replace(/\bMhaui\b/g, 'MHAUI')
    .replace(/\bJjbts\b/g, 'JJBTS')
    .replace(/\bKkrt\b/g, 'KKRT')
    .replace(/\bNuns3\b/g, 'NUNS3')
    .replace(/\bNuns4\b/g, 'NUNS4')
    .replace(/\bNunsc\b/g, 'NUNSC')
    .replace(/\bXps\b/g, 'XPS')
    .replace(/\bObj\b/g, 'OBJ')
    .replace(/\bFbx\b/g, 'FBX')
    .replace(/\bMmd\b/g, 'MMD')
    .replace(/\bDl\b/g, 'DL')
    .replace(/\bOpbw\b/g, 'OPBW')
    .replace(/\bOpbr\b/g, 'OPBR')
    .replace(/\bOpdp\b/g, 'OPDP')
    .replace(/\bOpfp\b/g, 'OPFP')
    .replace(/\bOpmje\b/g, 'OPMJE')
    .replace(/^MMD\s+/i, '')
    .replace(/^MHAUI\s+/i, '')
    .replace(/^MHA\s+TSH\s+/i, '')
    .replace(/^MHA\s+/i, '')
    .replace(/^JJBTS\s+/i, '')
    .replace(/^Jujutsu Battles Tokyo Saga\s+/i, '')
    .replace(/^Bleach\s+KKRT\s+/i, '')
    .replace(/^Bleach Mobile 3D\s+/i, '')
    .replace(/^Bleach Soul Reaper\s+/i, '')
    .replace(/^Bleach Soul Resonance\s+/i, '')
    .replace(/^Naruto Slugfest\s+/i, '')
    .replace(/^Naruto Mobile Tencent\s+/i, '')
    .replace(/^Naruto Mobile\s+/i, '')
    .replace(/^Naruto Stage\s+/i, '')
    .replace(/^NUNS3\s+/i, '')
    .replace(/^NUNS4\s+/i, '')
    .replace(/^NUNSC\s+/i, '')
    .replace(/^One Piece Burning Will\s+/i, '')
    .replace(/^One Piece UWR\s+/i, '')
    .replace(/^Shaman King Funbari Chronicle\s+/i, '')
    .replace(/^OPBW\s+/i, '')
    .replace(/^OPBR\s+/i, '')
    .replace(/^OPDP\s+/i, '')
    .replace(/^OPFP\s+/i, '')
    .replace(/^OPMJE\s+/i, '')
    .replace(/^DBFZ\s+/i, '')
    .replace(/^DBS\s+/i, '')
    .replace(/^DBXV2?Mod\s+/i, '')
    .replace(/^DBXV2?\s+/i, '')
    .replace(/^DBZ Kakarot\s+/i, '')
    .replace(/^SDBH WM\s+/i, '')
    .replace(/\s+(?:XPS|OBJ|BLEND|FBX|MMD)(?:\s+(?:OBJ|BLEND|FBX|MMD))*\s+By\s+.+$/i, '')
    .replace(/\s+(?:XPS|OBJ|BLEND|FBX|MMD)(?:\s+(?:Stage|Pack))?$/i, '')
    .replace(/\s+By\s+.+$/i, '')
    .replace(/\s+For\s+XPS$/i, '')
    .replace(/\s+Stage\s+DL$/i, ' Stage')
    .replace(/\s+DL$/i, '')
    .replace(/\s+d(?=[a-z0-9]*\d)[a-z0-9]{5,}$/i, '')
    .replace(/\(([^)]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  name = name
    .replace(/'S\b/g, "'s")
    .replace(/\s+(?:XPS|OBJ|BLEND|FBX|MMD)$/i, '')
    .trim();
  if (name.toLowerCase() === 'gm namek') name = 'Namek';
  if (name.toLowerCase() === 'templo de poseidon') name = 'Temple Of Poseidon';
  if (name.toLowerCase() === 'rrxx canyon final') name = 'Canyon Arena';
  if (name.toLowerCase() === 'rrxx canyon stage') name = 'Canyon Arena';
  if (name.toLowerCase() === 'canyon stage') name = 'Canyon Arena';
  return name || titleize(value);
}

function formatBytes(bytes) {
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
}

function numberArg(name, fallback) {
  const raw = args.get(name) ?? process.env[`KORE_${name.toUpperCase().replace(/-/g, '_')}`];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

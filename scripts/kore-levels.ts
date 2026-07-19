import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { STORY_ADVENTURE_REGION_IDS } from '../src/story/adventureWorlds';
import { generateAdventureFloor } from '../src/story/adventureEndless';
import { STORY_LEVEL_ASSET_REGISTRY, storyLevelAssetCoverage } from '../src/story/levelAssets';
import { STORY_ENDLESS_CHUNK_BLUEPRINTS, storyChunkCoverageErrors } from '../src/story/levelChunks';
import { compileStoryLevelBlueprint, renderStoryLevelBlueprintSvg, validateStoryLevelBlueprint } from '../src/story/levelCompiler';
import { STORY_SURFACE_LEVEL_BLUEPRINTS } from '../src/story/levelBlueprints';
import type { StoryLevelBlueprint, StoryLevelBlueprintV2 } from '../src/story/levelTypes';
import { STORY_TERRAIN_KITS_BY_ID, storyTerrainGrammarCoverageErrors } from '../src/story/terrainGrammar';
import { STORY_BIOME_VISUAL_SETS, storyBiomeVisualSetCoverageErrors } from '../src/story/biomeVisualSets';

const repoRoot = resolve(import.meta.dirname, '..');
const outputRoot = join(repoRoot, 'tmp', 'level-director');
const [command = 'validate', ...commandArguments] = process.argv.slice(2);
const positionalArguments = commandArguments.filter((argument, index) =>
  !argument.startsWith('--') && (index === 0 || !commandArguments[index - 1].startsWith('--'))
);
const target = positionalArguments[0];
const option = (name: string, fallback?: string) => {
  const index = commandArguments.indexOf(`--${name}`);
  return index >= 0 ? commandArguments[index + 1] : fallback;
};

await mkdir(outputRoot, { recursive: true });

function allBlueprints() {
  return [...Object.values(STORY_SURFACE_LEVEL_BLUEPRINTS), ...STORY_ENDLESS_CHUNK_BLUEPRINTS];
}

function findBlueprint(id?: string): StoryLevelBlueprint {
  const blueprint = id ? allBlueprints().find((candidate) => candidate.id === id) : undefined;
  if (!blueprint) throw new Error(`Unknown blueprint: ${id || '(missing id)'}`);
  return blueprint;
}

async function writeJson(name: string, value: unknown) {
  const path = join(outputRoot, name);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return path;
}

async function inventory() {
  const terrainKits = Object.values(STORY_TERRAIN_KITS_BY_ID);
  const payload = { generatedAt: new Date().toISOString(), coverage: storyLevelAssetCoverage(), assets: STORY_LEVEL_ASSET_REGISTRY, terrainKits };
  const jsonPath = await writeJson('asset-inventory.json', payload);
  const rows = STORY_LEVEL_ASSET_REGISTRY.map((asset) => `<li><img src="../../public/story/worlds/${asset.asset.replace(/^world:/, '')}" alt=""><span><strong>${asset.id}</strong><small>${asset.biomes.join(', ')} · ${asset.roles.join(', ')} · ${asset.tags.join(', ')}</small></span></li>`).join('');
  const htmlPath = join(outputRoot, 'asset-inventory.html');
  const kits = terrainKits.map((kit) => `<article><h2>${kit!.biome} · ${kit!.primaryFamily}</h2><img src="../../public/story/worlds/${kit!.contactSheet.replace(/^world:/, '')}" alt="${kit!.theme} terrain kit contact sheet"><p>${kit!.frames.length} resolved frames · ${kit!.enclosureStyle}</p></article>`).join('');
  await writeFile(htmlPath, `<!doctype html><meta charset="utf-8"><title>KORE level asset inventory</title><style>body{margin:24px;background:#07111e;color:#eaf8ff;font:14px system-ui}section,ul{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px;padding:0}article,li{padding:12px;border:1px solid #23445a;border-radius:12px;background:#0d1b2a}li{display:flex;gap:12px;align-items:center}li img{width:80px;height:80px;object-fit:contain}article img{width:100%;image-rendering:pixelated;background:#03080e}span{display:grid;gap:5px}small,p{color:#8da9bc}</style><h1>KORE terrain kits</h1><section>${kits}</section><h1>Semantic props</h1><ul>${rows}</ul>`, 'utf8');
  return { jsonPath, htmlPath, assets: payload.assets.length };
}

async function scaffold() {
  const id = target?.replace(/[^a-z0-9-]/g, '');
  if (!id) throw new Error('Usage: npm run levels -- new <level-id> --biome <biome>');
  const biome = option('biome', 'greenhollow');
  const template = structuredClone(STORY_SURFACE_LEVEL_BLUEPRINTS['greenhollow-arrival']);
  template.id = id;
  template.biomeId = biome as StoryLevelBlueprintV2['biomeId'];
  template.brief.heroLandmark = 'TODO hero landmark';
  template.brief.primaryMechanic = 'TODO primary mechanic';
  const draftRoot = join(repoRoot, 'src', 'story', 'levels', 'drafts');
  await mkdir(draftRoot, { recursive: true });
  const path = join(draftRoot, `${id}.level.json`);
  await writeFile(path, `${JSON.stringify(template, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return { path };
}

async function compile() {
  const blueprint = findBlueprint(target);
  const compiled = compileStoryLevelBlueprint(blueprint, option('seed', blueprint.id), 1);
  const path = await writeJson(`${blueprint.id}.compiled.json`, compiled);
  return { path, meta: compiled.meta, validation: compiled.validation };
}

function validateAll() {
  const failures = allBlueprints().flatMap((blueprint) => {
    const result = validateStoryLevelBlueprint(blueprint);
    return result.errors.map((error) => `${blueprint.id}:${error}`);
  });
  failures.push(...storyChunkCoverageErrors());
  failures.push(...storyTerrainGrammarCoverageErrors());
  failures.push(...storyBiomeVisualSetCoverageErrors());
  const surfaceSignatures = new Set(Object.values(STORY_SURFACE_LEVEL_BLUEPRINTS).map((blueprint) => blueprint.geometry.filter((piece) => piece.kind === 'carve').map((piece) => piece.rect.join(':')).join('|')));
  if (surfaceSignatures.size !== 32) failures.push(`surface-signatures:${surfaceSignatures.size}`);
  const assetCoverage = STORY_ADVENTURE_REGION_IDS.map((biomeId) => {
    const used = new Set(Object.values(STORY_SURFACE_LEVEL_BLUEPRINTS)
      .filter((blueprint) => blueprint.biomeId === biomeId)
      .flatMap((blueprint) => compileStoryLevelBlueprint(blueprint, blueprint.id, 1).meta.assetResolution.map((entry) => entry.assetId)));
    const surfaceFamilies = new Set(Object.values(STORY_SURFACE_LEVEL_BLUEPRINTS).filter((blueprint) => blueprint.biomeId === biomeId).flatMap((blueprint) => blueprint.visual.permittedPropFamilies));
    const approved = STORY_LEVEL_ASSET_REGISTRY.filter((asset) => asset.biomes.includes(biomeId) && surfaceFamilies.has(asset.family) && asset.roles.some((role) => ['hero', 'structural', 'framing', 'foliage', 'clutter'].includes(role))).map((asset) => asset.id);
    return { biomeId, used: used.size, approved: approved.length, gaps: approved.filter((id) => !used.has(id)) };
  });
  for (const coverage of assetCoverage) if (coverage.gaps.length > 0) failures.push(`asset-coverage:${coverage.biomeId}:${coverage.gaps.join(',')}`);
  for (const blueprint of Object.values(STORY_SURFACE_LEVEL_BLUEPRINTS)) {
    const compiled = compileStoryLevelBlueprint(blueprint, blueprint.id, 1);
    const allowed = new Set(blueprint.visual.permittedPropFamilies);
    for (const resolution of compiled.meta.assetResolution) {
      const asset = STORY_LEVEL_ASSET_REGISTRY.find((candidate) => candidate.id === resolution.assetId);
      if (!asset || !allowed.has(asset.family)) failures.push(`prop-family:${blueprint.id}:${resolution.assetId}`);
    }
    if (!compiled.terrainKitId || compiled.terrainTiles.some((tile) => !tile.frameId) || compiled.cavityTiles.some((tile) => !tile.frameId)) failures.push(`terrain-art:${blueprint.id}`);
  }
  for (const visualSet of Object.values(STORY_BIOME_VISUAL_SETS)) {
    if (STORY_TERRAIN_KITS_BY_ID[visualSet.terrainKitId]?.visualSetId !== visualSet.id) failures.push(`visual-set-kit:${visualSet.id}`);
    if (STORY_LEVEL_ASSET_REGISTRY.filter((asset) => asset.biomes.includes(visualSet.biomeId) && asset.family === visualSet.propFamily).length < 3) failures.push(`visual-set-props:${visualSet.id}`);
  }
  return { valid: failures.length === 0, failures, blueprints: allBlueprints().length, surfaces: Object.keys(STORY_SURFACE_LEVEL_BLUEPRINTS).length, chunks: STORY_ENDLESS_CHUNK_BLUEPRINTS.length, assetCoverage };
}

async function sample() {
  const count = Math.max(1, Number(option('count', '250')) || 250);
  const failures: string[] = [];
  const signatures = new Set<string>();
  const intents = { combat: 0, harvest: 0, exploration: 0, boss: 0 };
  let fallbacks = 0;
  const entranceTiers = [0, 0, 0];
  const visualSets: Record<string, number> = {};
  for (const biome of STORY_ADVENTURE_REGION_IDS) for (let index = 0; index < count; index += 1) {
    const floorNumber = [1, 2, 3, 4, 8, 100, Number.MAX_SAFE_INTEGER][index % 7];
    const floor = generateAdventureFloor(biome, `level-director-${index}`, floorNumber);
    intents[floor.intent] += 1;
    if (floor.usedFallback) fallbacks += 1;
    if (floor.entranceTier !== undefined) entranceTiers[floor.entranceTier] += 1;
    if (floor.visualSetId) visualSets[floor.visualSetId] = (visualSets[floor.visualSetId] ?? 0) + 1;
    failures.push(...floor.validationFailures.map((failure) => `${biome}:${index}:${failure}`));
    if ((floor.intent === 'harvest' || floor.intent === 'exploration') && floor.enemySpawns.length > 0) failures.push(`${biome}:${index}:peaceful-floor-enemies`);
    if (!floor.platforms.some((platform) => platform.terrainRole === 'wall')) failures.push(`${biome}:${index}:missing-structural-terrain`);
    if (floor.version >= 6 && (!floor.terrainKitId || !floor.cavityTiles?.length || floor.terrainTiles?.some((tile) => !tile.frameId))) failures.push(`${biome}:${index}:missing-world-art`);
    if (floor.version >= 7 && STORY_BIOME_VISUAL_SETS[floor.visualSetId ?? '']?.terrainKitId !== floor.terrainKitId) failures.push(`${biome}:${index}:mixed-visual-set`);
    signatures.add(floor.rooms.filter((room) => room.critical).sort((a, b) => a.column - b.column || a.row - b.row).map((room) => `${room.column}:${room.row}:${room.templateId}`).join('|'));
  }
  const result = { valid: failures.length === 0 && fallbacks === 0 && entranceTiers.every((value) => value > 0) && Object.keys(visualSets).length === 16, seeds: count * STORY_ADVENTURE_REGION_IDS.length, fallbacks, failures, uniqueSignatures: signatures.size, intents, entranceTiers, visualSets };
  await writeJson(`sample-${count}.json`, result);
  return result;
}

async function render() {
  const blueprints = target ? [findBlueprint(target)] : Object.values(STORY_SURFACE_LEVEL_BLUEPRINTS);
  const renderRoot = join(outputRoot, 'renders');
  await mkdir(renderRoot, { recursive: true });
  for (const blueprint of blueprints) await writeFile(join(renderRoot, `${blueprint.id}.svg`), renderStoryLevelBlueprintSvg(blueprint), 'utf8');
  return { renderRoot, count: blueprints.length };
}

async function report() {
  const validation = validateAll();
  const sampling = await sample();
  const rendered = await render();
  const cards = Object.values(STORY_SURFACE_LEVEL_BLUEPRINTS).map((blueprint) => `<article><h2>${blueprint.id}</h2><p>${blueprint.brief.primaryMechanic}</p><img src="renders/${blueprint.id}.svg" alt="${blueprint.id} plan"></article>`).join('');
  const terrainCards = Object.values(STORY_TERRAIN_KITS_BY_ID).map((kit) => `<article><h2>${kit!.biome} terrain kit</h2><p>${kit!.primaryFamily} · ${kit!.enclosureStyle}</p><img src="../../public/story/worlds/${kit!.contactSheet.replace(/^world:/, '')}" alt="${kit!.biome} terrain kit"></article>`).join('');
  const reportPath = join(outputRoot, 'report.html');
  await writeFile(reportPath, `<!doctype html><meta charset="utf-8"><title>KORE Level Director report</title><style>body{margin:24px;background:#07111e;color:#ecf8ff;font:14px system-ui}header{position:sticky;top:0;padding:14px;background:#07111eee;backdrop-filter:blur(12px)}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(480px,1fr));gap:16px}article{padding:14px;border:1px solid #23445a;border-radius:14px;background:#0d1b2a}img{width:100%;image-rendering:pixelated}p{color:#91adbf}</style><header><h1>KORE Enclosed World Art Report</h1><p>Blueprints ${validation.blueprints} · surfaces ${validation.surfaces} · chunks ${validation.chunks} · seeds ${sampling.seeds} · fallbacks ${sampling.fallbacks} · ${validation.valid && sampling.valid ? 'PASS' : 'FAIL'}</p></header><main>${terrainCards}${cards}</main>`, 'utf8');
  await writeJson('report.json', { validation, sampling, rendered, reportPath });
  return { reportPath, validation, sampling };
}

async function loadDraft() {
  if (!target) throw new Error('Draft path required');
  return JSON.parse(await readFile(resolve(repoRoot, target), 'utf8')) as StoryLevelBlueprint;
}

let result: unknown;
if (command === 'inventory') result = await inventory();
else if (command === 'new') result = await scaffold();
else if (command === 'compile') result = await compile();
else if (command === 'validate') result = validateAll();
else if (command === 'sample') result = await sample();
else if (command === 'render') result = await render();
else if (command === 'report') result = await report();
else if (command === 'validate-file') result = validateStoryLevelBlueprint(await loadDraft());
else throw new Error(`Unknown command: ${command}`);

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (typeof result === 'object' && result && 'valid' in result && !(result as { valid: boolean }).valid) process.exitCode = 1;

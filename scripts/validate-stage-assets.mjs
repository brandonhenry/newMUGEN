import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const publicDir = path.join(root, 'public');
const indexPath = path.join(publicDir, 'stages', 'index.json');
const ambienceCatalogPath = path.join(root, 'src', 'data', 'stageAmbiencePresets.json');
const modelBudgetMb = Number(process.env.KORE_STAGE_MODEL_BUDGET_MB ?? 35);
const ambienceBudgetMb = Number(process.env.KORE_STAGE_AMBIENCE_BUDGET_MB ?? 25);

function publicPathToFile(assetPath) {
  if (!assetPath || !assetPath.startsWith('/')) return null;
  const cleanPath = assetPath.split(/[?#]/, 1)[0];
  return path.join(publicDir, cleanPath.slice(1));
}

function isLocalStageModel(stage) {
  return stage?.renderMode === 'model' || Boolean(stage?.model?.path || stage?.model?.url);
}

function readJson(filePath) {
  return readFile(filePath, 'utf8').then((contents) => JSON.parse(contents));
}

const failures = [];
const index = await readJson(indexPath);
const ambiencePresets = await readJson(ambienceCatalogPath);
const ids = Array.isArray(index.stages) ? index.stages : [];
const ambienceAssetPaths = new Set();

for (const [presetId, preset] of Object.entries(ambiencePresets)) {
  if (!Array.isArray(preset?.loops) || preset.loops.length === 0) {
    failures.push(`ambience preset ${presetId}: requires at least one loop`);
    continue;
  }
  for (const loop of preset.loops) {
    if (typeof loop?.path !== 'string' || !loop.path.startsWith('/sounds/stage-ambience/')) {
      failures.push(`ambience preset ${presetId}: invalid loop path ${String(loop?.path)}`);
    } else {
      ambienceAssetPaths.add(loop.path);
    }
    if (!Number.isFinite(loop?.volume) || loop.volume < 0 || loop.volume > 1) failures.push(`ambience preset ${presetId}: loop volume must be between 0 and 1`);
  }
  for (const cue of Array.isArray(preset?.cues) ? preset.cues : []) {
    if (!Array.isArray(cue?.paths) || cue.paths.length === 0) failures.push(`ambience preset ${presetId}: cue requires at least one path`);
    for (const cuePath of Array.isArray(cue?.paths) ? cue.paths : []) {
      if (typeof cuePath !== 'string' || !cuePath.startsWith('/sounds/stage-ambience/')) failures.push(`ambience preset ${presetId}: invalid cue path ${String(cuePath)}`);
      else ambienceAssetPaths.add(cuePath);
    }
    if (!Number.isFinite(cue?.volume) || cue.volume < 0 || cue.volume > 1) failures.push(`ambience preset ${presetId}: cue volume must be between 0 and 1`);
    if (!Number.isFinite(cue?.minDelaySeconds) || !Number.isFinite(cue?.maxDelaySeconds) || cue.minDelaySeconds < 5 || cue.maxDelaySeconds < cue.minDelaySeconds) {
      failures.push(`ambience preset ${presetId}: cue delay range is invalid`);
    }
  }
}

let ambienceBytes = 0;
for (const assetPath of ambienceAssetPaths) {
  const assetFile = publicPathToFile(assetPath);
  if (!assetFile || !existsSync(assetFile)) failures.push(`stage ambience: missing asset ${assetPath}`);
  else ambienceBytes += (await stat(assetFile)).size;
}
const ambienceSizeMb = ambienceBytes / 1024 / 1024;
if (Number.isFinite(ambienceBudgetMb) && ambienceSizeMb > ambienceBudgetMb) failures.push(`stage ambience: ${ambienceSizeMb.toFixed(1)} MB exceeds the ${ambienceBudgetMb} MB budget`);

for (const id of ids) {
  const stagePath = path.join(publicDir, 'stages', id, 'stage.json');
  if (!existsSync(stagePath)) {
    failures.push(`${id}: missing stage.json`);
    continue;
  }
  const stage = await readJson(stagePath);
  if (typeof stage.ambiencePreset !== 'string' || !Object.hasOwn(ambiencePresets, stage.ambiencePreset)) {
    failures.push(`${id}: missing or unknown ambience preset ${String(stage.ambiencePreset)}`);
  }
  const vegetationPath = stage.edgeVegetation?.packPath;
  if (vegetationPath) {
    const vegetationFile = publicPathToFile(vegetationPath);
    if (!vegetationFile || !existsSync(vegetationFile)) {
      failures.push(`${id}: missing edge vegetation asset ${vegetationPath}`);
    } else {
      const header = await readFile(vegetationFile, { encoding: null, flag: 'r' }).then((buffer) => buffer.subarray(0, 4).toString('utf8'));
      if (header !== 'glTF') failures.push(`${id}: ${vegetationPath} does not start with GLB magic bytes`);
      const sizeMb = (await stat(vegetationFile)).size / 1024 / 1024;
      if (sizeMb > 2) failures.push(`${id}: ${vegetationPath} is ${sizeMb.toFixed(1)} MB, above the 2 MB vegetation budget`);
    }
  }
  if (!isLocalStageModel(stage)) continue;
  const modelPath = stage.model?.path || stage.model?.url || `/stages/${id}/stage.glb`;
  const modelFile = publicPathToFile(modelPath);
  if (!modelFile) continue;
  if (!existsSync(modelFile)) {
    failures.push(`${id}: missing model asset ${modelPath}`);
    continue;
  }
  const header = await readFile(modelFile, { encoding: null, flag: 'r' }).then((buffer) => buffer.subarray(0, 4).toString('utf8'));
  if (header !== 'glTF') failures.push(`${id}: ${modelPath} does not start with GLB magic bytes`);
  const sizeMb = (await stat(modelFile)).size / 1024 / 1024;
  if (Number.isFinite(modelBudgetMb) && sizeMb > modelBudgetMb) {
    failures.push(`${id}: ${modelPath} is ${sizeMb.toFixed(1)} MB, above the ${modelBudgetMb} MB stage model budget`);
  }
}

if (failures.length > 0) {
  console.error(`Stage asset validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Stage asset validation passed for ${ids.length} indexed stages and ${ambienceAssetPaths.size} ambience assets (${ambienceSizeMb.toFixed(1)} MB).`);

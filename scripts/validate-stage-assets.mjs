import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const publicDir = path.join(root, 'public');
const indexPath = path.join(publicDir, 'stages', 'index.json');
const modelBudgetMb = Number(process.env.KORE_STAGE_MODEL_BUDGET_MB ?? 35);

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
const ids = Array.isArray(index.stages) ? index.stages : [];

for (const id of ids) {
  const stagePath = path.join(publicDir, 'stages', id, 'stage.json');
  if (!existsSync(stagePath)) {
    failures.push(`${id}: missing stage.json`);
    continue;
  }
  const stage = await readJson(stagePath);
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

console.log(`Stage asset validation passed for ${ids.length} indexed stages.`);

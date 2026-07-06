import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const manifestPath = 'public/installers/manifest.json';
const installerDir = dirname(manifestPath);
const assetBase = (process.env.KORE_INSTALLER_ASSET_BASE || 'https://playkore.com/installers').replace(/\/$/, '');
const skipFetch = process.env.KORE_SKIP_INSTALLER_FETCH === '1';

function uniqueAssets(manifest) {
  const assets = new Map();
  for (const installer of manifest.installers ?? []) {
    if (installer?.filename && installer?.url) assets.set(installer.filename, installer);
    for (const asset of installer?.assets ?? []) {
      if (asset?.filename && asset?.url) assets.set(asset.filename, asset);
    }
  }
  return [...assets.values()].filter((asset) => {
    const filename = String(asset.filename);
    return !filename.endsWith('.sh') && filename !== 'manifest.json';
  });
}

async function sha256(path) {
  const hash = createHash('sha256');
  const { createReadStream } = await import('node:fs');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

async function verifyAsset(path, asset) {
  const stats = await stat(path);
  if (Number.isFinite(asset.size) && stats.size !== asset.size) {
    throw new Error(`${path} size mismatch: expected ${asset.size}, got ${stats.size}`);
  }
  if (typeof asset.sha256 === 'string' && asset.sha256.length > 0) {
    const actual = await sha256(path);
    if (actual !== asset.sha256) {
      throw new Error(`${path} sha256 mismatch: expected ${asset.sha256}, got ${actual}`);
    }
  }
}

async function downloadAsset(asset) {
  const filename = basename(String(asset.filename));
  const target = join(installerDir, filename);
  const tempTarget = `${target}.download`;
  const sourceUrl = `${assetBase}/${encodeURIComponent(filename)}`;
  console.log(`Restoring installer artifact ${filename} from ${sourceUrl}`);
  const response = await fetch(sourceUrl);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${sourceUrl}: HTTP ${response.status}`);
  }
  await mkdir(installerDir, { recursive: true });
  await pipeline(response.body, createWriteStream(tempTarget));
  try {
    await verifyAsset(tempTarget, asset);
    await rename(tempTarget, target);
  } catch (error) {
    await unlink(tempTarget).catch(() => undefined);
    throw error;
  }
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const assets = uniqueAssets(manifest);
if (assets.length === 0) {
  console.log('No installer artifacts listed in manifest.');
  process.exit(0);
}

for (const asset of assets) {
  const target = join(installerDir, basename(String(asset.filename)));
  const exists = await stat(target).then(() => true, () => false);
  if (!exists) {
    if (skipFetch) {
      console.warn(`Installer artifact missing and fetch skipped: ${target}`);
      continue;
    }
    await downloadAsset(asset);
  }
  await verifyAsset(target, asset);
}

console.log(`Installer artifact check passed for ${assets.length} file${assets.length === 1 ? '' : 's'}.`);

import {
  decodeVoxelPackFrameRecords,
  normalizeHdVoxelPayload,
  voxelPackFrameByteRange,
  type PackedImageVoxel,
  type VoxelPackManifest
} from './voxelPack';
import { getPrecomputedVoxelPath, getVoxelAssetRoot, getVoxelPackFrameName } from './voxelAssetPaths';

type WorkerRequest =
  | { id: number; type: 'loadFrame'; characterId: string; frameSource: string }
  | { id: number; type: 'prewarm'; characterId: string; frameSources: string[] }
  | { id: number; type: 'cancelCharacter'; characterId: string };

type WorkerResponse =
  | { id: number; ok: true; voxels: PackedImageVoxel[]; source: 'range' | 'json' | 'cache'; timings: VoxelFrameWorkerTimings }
  | { id: number; ok: false; error: string; timings?: VoxelFrameWorkerTimings };

export type VoxelFrameWorkerTimings = {
  totalMs: number;
  manifestMs?: number;
  rangeMs?: number;
  jsonMs?: number;
  decodeMs?: number;
  byteLength?: number;
};

const manifestCache = new Map<string, Promise<VoxelPackManifest | null>>();
const frameCache = new Map<string, PackedImageVoxel[]>();
const cancelledCharacters = new Set<string>();
const MAX_FRAME_CACHE_ENTRIES = 96;

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === 'cancelCharacter') {
    cancelledCharacters.add(request.characterId);
    postMessage({ id: request.id, ok: true, voxels: [], source: 'cache', timings: { totalMs: 0 } } satisfies WorkerResponse);
    return;
  }
  if (request.type === 'prewarm') {
    cancelledCharacters.delete(request.characterId);
    void prewarmFrames(request);
    postMessage({ id: request.id, ok: true, voxels: [], source: 'cache', timings: { totalMs: 0 } } satisfies WorkerResponse);
    return;
  }
  cancelledCharacters.delete(request.characterId);
  void loadFrame(request).then((response) => postMessage(response));
};

async function prewarmFrames(request: Extract<WorkerRequest, { type: 'prewarm' }>) {
  for (const frameSource of request.frameSources) {
    if (cancelledCharacters.has(request.characterId)) return;
    const frame = getVoxelPackFrameName(frameSource);
    const assetRoot = getVoxelAssetRoot(frameSource);
    if (!frame || !assetRoot) continue;
    const cacheKey = makeFrameCacheKey(assetRoot, frame);
    if (frameCache.has(cacheKey)) continue;
    await loadFrame({ id: request.id, type: 'loadFrame', characterId: request.characterId, frameSource }).catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function loadFrame(request: Extract<WorkerRequest, { type: 'loadFrame' }>): Promise<WorkerResponse> {
  const startedAt = now();
  const frame = getVoxelPackFrameName(request.frameSource);
  const assetRoot = getVoxelAssetRoot(request.frameSource);
  if (!frame || !assetRoot) {
    return { id: request.id, ok: false, error: 'missing-frame-name' };
  }
  const cacheKey = makeFrameCacheKey(assetRoot, frame);
  const cached = frameCache.get(cacheKey);
  if (cached) {
    frameCache.delete(cacheKey);
    frameCache.set(cacheKey, cached);
    return { id: request.id, ok: true, voxels: cached, source: 'cache', timings: { totalMs: roundMs(now() - startedAt) } };
  }

  const timings: VoxelFrameWorkerTimings = { totalMs: 0 };
  const rangeResult = await loadFrameFromRange(assetRoot, frame, timings);
  if (rangeResult) {
    setFrameCache(cacheKey, rangeResult);
    timings.totalMs = roundMs(now() - startedAt);
    return { id: request.id, ok: true, voxels: rangeResult, source: 'range', timings };
  }

  const jsonResult = await loadFrameFromJson(request.frameSource, timings);
  if (jsonResult) {
    setFrameCache(cacheKey, jsonResult);
    timings.totalMs = roundMs(now() - startedAt);
    return { id: request.id, ok: true, voxels: jsonResult, source: 'json', timings };
  }

  timings.totalMs = roundMs(now() - startedAt);
  return { id: request.id, ok: false, error: 'frame-load-failed', timings };
}

async function loadFrameFromRange(assetRoot: string, frame: string, timings: VoxelFrameWorkerTimings) {
  const manifestStartedAt = now();
  const manifest = await getManifest(assetRoot);
  timings.manifestMs = roundMs(now() - manifestStartedAt);
  if (!manifest) return null;
  const range = voxelPackFrameByteRange(manifest, frame);
  if (!range || range.length <= 0) return null;

  const rangeStartedAt = now();
  const response = await fetch(`${assetRoot}/voxels-hd/${manifest.binary}`, {
    cache: 'no-cache',
    headers: { Range: `bytes=${range.start}-${range.end}` }
  });
  timings.rangeMs = roundMs(now() - rangeStartedAt);
  if (response.status !== 206) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }

  const decodeStartedAt = now();
  const buffer = await response.arrayBuffer();
  timings.byteLength = buffer.byteLength;
  const records = new Float64Array(buffer);
  const voxels = decodeVoxelPackFrameRecords(manifest, records, 0, range.count);
  timings.decodeMs = roundMs(now() - decodeStartedAt);
  return voxels;
}

async function loadFrameFromJson(frameSource: string, timings: VoxelFrameWorkerTimings) {
  const path = getPrecomputedVoxelPath(frameSource, true);
  if (!path) return null;
  const startedAt = now();
  const response = await fetch(path);
  if (!response.ok) return null;
  const payload = await response.json();
  const voxels = normalizeHdVoxelPayload(payload);
  timings.jsonMs = roundMs(now() - startedAt);
  return voxels;
}

async function getManifest(assetRoot: string) {
  const cached = manifestCache.get(assetRoot);
  if (cached) return cached;
  const request = fetch(`${assetRoot}/voxels-hd/voxel-pack-v1.json`, { cache: 'no-cache' })
    .then((response) => response.ok ? response.json() as Promise<VoxelPackManifest> : null)
    .catch(() => null);
  manifestCache.set(assetRoot, request);
  return request;
}

function setFrameCache(key: string, voxels: PackedImageVoxel[]) {
  frameCache.delete(key);
  frameCache.set(key, voxels);
  while (frameCache.size > MAX_FRAME_CACHE_ENTRIES) {
    const oldest = frameCache.keys().next().value;
    if (!oldest) break;
    frameCache.delete(oldest);
  }
}

function makeFrameCacheKey(assetRoot: string, frame: string) {
  return `${assetRoot}:${frame}`;
}

function roundMs(value: number) {
  return Number(value.toFixed(2));
}

import type { CharacterDefinition } from '../types';
import type { PackedImageVoxel } from './voxelPack';
import type { VoxelFrameWorkerTimings } from './voxelFrameWorker';

type VoxelFrameWindow = Window & {
  __KORE_VOXEL_FREEZE__?: {
    activeRequests: number;
    frameLoads: Array<{
      characterId: string;
      frameSource: string;
      source: 'range' | 'json' | 'cache' | 'main-json' | 'main-extract';
      totalMs: number;
      byteLength?: number;
    }>;
    longTasks: number[];
  };
};

type WorkerRequest =
  | { id: number; type: 'loadFrame'; characterId: string; frameSource: string }
  | { id: number; type: 'prewarm'; characterId: string; frameSources: string[] }
  | { id: number; type: 'cancelCharacter'; characterId: string };

type WorkerResponse =
  | { id: number; ok: true; voxels: PackedImageVoxel[]; source: 'range' | 'json' | 'cache'; timings: VoxelFrameWorkerTimings }
  | { id: number; ok: false; error: string; timings?: VoxelFrameWorkerTimings };

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, {
  resolve: (value: WorkerResponse) => void;
  reject: (error: Error) => void;
}>();

export function loadHdVoxelFrameInWorker(character: CharacterDefinition, frameSource: string) {
  if (typeof window === 'undefined' || !frameSource) return Promise.resolve(null);
  const startedAt = performance.now();
  const request = sendWorkerRequest({ id: 0, type: 'loadFrame', characterId: character.id, frameSource });
  return request.then((response) => {
    if (!response.ok) return null;
    recordVoxelFrameLoad(character.id, frameSource, response.source, response.timings);
    return response.voxels;
  }).catch(() => {
    recordVoxelFrameLoad(character.id, frameSource, 'main-json', { totalMs: performance.now() - startedAt });
    return null;
  });
}

export function prewarmHdVoxelFramesInWorker(character: CharacterDefinition, frameSources: string[]) {
  if (typeof window === 'undefined' || frameSources.length === 0) return;
  void sendWorkerRequest({ id: 0, type: 'prewarm', characterId: character.id, frameSources }).catch(() => undefined);
}

export function cancelHdVoxelPrewarm(characterId: string) {
  if (typeof window === 'undefined' || !characterId) return;
  void sendWorkerRequest({ id: 0, type: 'cancelCharacter', characterId }).catch(() => undefined);
}

export function installVoxelFreezeMonitor() {
  if (typeof window === 'undefined') return;
  const probe = voxelFreezeProbe();
  if (!probe || (window as typeof window & { __KORE_VOXEL_FREEZE_MONITOR_INSTALLED__?: boolean }).__KORE_VOXEL_FREEZE_MONITOR_INSTALLED__) return;
  (window as typeof window & { __KORE_VOXEL_FREEZE_MONITOR_INSTALLED__?: boolean }).__KORE_VOXEL_FREEZE_MONITOR_INSTALLED__ = true;
  if (!('PerformanceObserver' in window)) return;
  try {
    const observer = new PerformanceObserver((list) => {
      probe.longTasks.push(...list.getEntries().map((entry) => Number(entry.duration.toFixed(2))));
      if (probe.longTasks.length > 120) probe.longTasks.splice(0, probe.longTasks.length - 120);
    });
    observer.observe({ type: 'longtask', buffered: true });
  } catch {
    // Long Task support varies by browser.
  }
}

function sendWorkerRequest(request: WorkerRequest) {
  const instance = getWorker();
  if (!instance) return Promise.reject(new Error('voxel-worker-unavailable'));
  const id = nextRequestId;
  nextRequestId += 1;
  const message = { ...request, id } as WorkerRequest;
  voxelFreezeProbe().activeRequests += message.type === 'loadFrame' ? 1 : 0;
  return new Promise<WorkerResponse>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    instance.postMessage(message);
  }).finally(() => {
    if (message.type === 'loadFrame') voxelFreezeProbe().activeRequests = Math.max(0, voxelFreezeProbe().activeRequests - 1);
  });
}

function getWorker() {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./voxelFrameWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const resolver = pending.get(event.data.id);
      if (!resolver) return;
      pending.delete(event.data.id);
      resolver.resolve(event.data);
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || 'voxel-worker-error');
      pending.forEach((resolver) => resolver.reject(error));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
    return worker;
  } catch {
    return null;
  }
}

function recordVoxelFrameLoad(
  characterId: string,
  frameSource: string,
  source: 'range' | 'json' | 'cache' | 'main-json' | 'main-extract',
  timings: Partial<VoxelFrameWorkerTimings>
) {
  const probe = voxelFreezeProbe();
  probe.frameLoads.push({
    characterId,
    frameSource,
    source,
    totalMs: Number((timings.totalMs ?? 0).toFixed(2)),
    byteLength: timings.byteLength
  });
  if (probe.frameLoads.length > 160) probe.frameLoads.splice(0, probe.frameLoads.length - 160);
}

function voxelFreezeProbe() {
  const probeWindow = window as VoxelFrameWindow;
  probeWindow.__KORE_VOXEL_FREEZE__ ??= {
    activeRequests: 0,
    frameLoads: [],
    longTasks: []
  };
  return probeWindow.__KORE_VOXEL_FREEZE__;
}

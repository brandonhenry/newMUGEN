import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { StageDefinition, StageModelDefinition } from '../types';
import { KORE_APP_VERSION } from '../appVersion';

export const STAGE_DRACO_DECODER_PATH = '/vendor/three/draco/gltf/';
export const STAGE_BASIS_TRANSCODER_PATH = '/vendor/three/basis/';

export const MODEL_STAGE_IDS = new Set(['hidden-leaf-village', 'naruto-apartment', 'naruto-apartment-fix', 'naruto-apartment-fix-2']);

export type StageAssetPhase = 'idle' | 'downloading' | 'decoded' | 'gpuWarm' | 'ready' | 'error';

export type StageAssetStatus = {
  stageId: string;
  phase: StageAssetPhase;
  progress: number;
  ready: boolean;
  url?: string;
  error?: string;
  updatedAtMs: number;
};

type StageAssetListener = (status: StageAssetStatus) => void;

const statusByStageId = new Map<string, StageAssetStatus>();
const preloadPromises = new Map<string, Promise<StageAssetStatus>>();
const listeners = new Set<StageAssetListener>();

let sharedDracoLoader: DRACOLoader | null = null;
let decodersPrefetched = false;

export function isModelStage(stage: Pick<StageDefinition, 'id' | 'renderMode' | 'model'>) {
  return stage.renderMode === 'model' || Boolean(stage.model?.path ?? stage.model?.url) || MODEL_STAGE_IDS.has(stage.id);
}

export function resolveStageModelDefinition(stage: StageDefinition): StageModelDefinition | undefined {
  if (stage.model?.path || stage.model?.url) return stage.model;
  if (!MODEL_STAGE_IDS.has(stage.id)) return undefined;
  return {
    path: `/stages/${stage.id}/stage.glb`,
    url: `/stages/${stage.id}/stage.glb`,
    format: 'glb',
    position: stage.id === 'hidden-leaf-village' ? [-16, 0, -8] : [0, 0, 0],
    scale: [1, 1, 1],
    rotation: [0, 0, 0],
    focus: stage.id === 'hidden-leaf-village' ? [0, 2.1, 0] : [0, 1.5, 0],
    castShadow: true,
    receiveShadow: true,
    decorativeProps: []
  };
}

export function resolveStageModelUrl(stage: StageDefinition) {
  const model = resolveStageModelDefinition(stage);
  const rawPath = model?.path || model?.url || '';
  return withStageAssetVersion(rawPath);
}

export function withStageAssetVersion(path: string) {
  if (!path || path.startsWith('data:') || path.startsWith('blob:')) return path;
  if (/[?&]koreVersion=/.test(path)) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}koreVersion=${encodeURIComponent(KORE_APP_VERSION)}`;
}

export function getStageAssetStatus(stageId: string): StageAssetStatus {
  return statusByStageId.get(stageId) ?? {
    stageId,
    phase: 'idle',
    progress: 0,
    ready: false,
    updatedAtMs: 0
  };
}

export function subscribeStageAssetStatus(listener: StageAssetListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function markStageAssetDecoded(stageId: string, url?: string) {
  return setStageAssetStatus(stageId, { phase: 'decoded', progress: 78, ready: false, url, error: undefined });
}

export function markStageAssetGpuWarm(stageId: string, url?: string) {
  return setStageAssetStatus(stageId, { phase: 'gpuWarm', progress: 94, ready: false, url, error: undefined });
}

export function markStageAssetReady(stageId: string, url?: string) {
  return setStageAssetStatus(stageId, { phase: 'ready', progress: 100, ready: true, url, error: undefined });
}

export function markStageAssetError(stageId: string, error: unknown, url?: string) {
  return setStageAssetStatus(stageId, {
    phase: 'error',
    progress: 100,
    ready: false,
    url,
    error: error instanceof Error ? error.message : String(error)
  });
}

export async function preloadStageModel(stage: StageDefinition): Promise<StageAssetStatus> {
  if (!isModelStage(stage)) return markStageAssetReady(stage.id);
  prefetchStageModelDecoders();
  const url = resolveStageModelUrl(stage);
  if (!url) return markStageAssetError(stage.id, 'Model stage is missing model URL.');
  const current = getStageAssetStatus(stage.id);
  if (current.ready && current.url === url) return current;
  const cached = preloadPromises.get(url);
  if (cached) return cached;
  const promise = loadStageModelForWarmCache(stage.id, url);
  preloadPromises.set(url, promise);
  return promise;
}

export function prefetchStageModelDecoders() {
  if (decodersPrefetched || typeof document === 'undefined') return;
  decodersPrefetched = true;
  [
    `${STAGE_DRACO_DECODER_PATH}draco_wasm_wrapper.js`,
    `${STAGE_DRACO_DECODER_PATH}draco_decoder.wasm`,
    `${STAGE_BASIS_TRANSCODER_PATH}basis_transcoder.js`,
    `${STAGE_BASIS_TRANSCODER_PATH}basis_transcoder.wasm`
  ].forEach((href) => {
    const link = document.createElement('link');
    link.rel = href.endsWith('.wasm') ? 'preload' : 'prefetch';
    link.href = href;
    if (href.endsWith('.wasm')) {
      link.as = 'fetch';
      link.crossOrigin = 'anonymous';
    }
    document.head.appendChild(link);
  });
}

async function loadStageModelForWarmCache(stageId: string, url: string) {
  setStageAssetStatus(stageId, { phase: 'downloading', progress: 18, ready: false, url, error: undefined });
  try {
    const loader = new GLTFLoader();
    loader.setDRACOLoader(getSharedDracoLoader());
    loader.setMeshoptDecoder(MeshoptDecoder);
    await loader.loadAsync(url);
    return markStageAssetDecoded(stageId, url);
  } catch (error) {
    return markStageAssetError(stageId, error, url);
  } finally {
    preloadPromises.delete(url);
  }
}

function getSharedDracoLoader() {
  if (!sharedDracoLoader) {
    sharedDracoLoader = new DRACOLoader();
    sharedDracoLoader.setDecoderPath(STAGE_DRACO_DECODER_PATH);
  }
  return sharedDracoLoader;
}

function setStageAssetStatus(stageId: string, next: Omit<StageAssetStatus, 'stageId' | 'updatedAtMs'>) {
  const status: StageAssetStatus = {
    stageId,
    ...next,
    updatedAtMs: Date.now()
  };
  statusByStageId.set(stageId, status);
  listeners.forEach((listener) => listener(status));
  return status;
}

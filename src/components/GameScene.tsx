import { Bounds, ContactShadows, Environment, OrbitControls, useAnimations, useGLTF, useProgress } from '@react-three/drei';
import { Canvas, useFrame, useLoader, useThree, type ThreeEvent } from '@react-three/fiber';
import { Component, Suspense, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ErrorInfo, type MutableRefObject, type ReactNode, type RefObject } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KTX2Loader } from 'three-stdlib';
import type {
  CharacterDefinition,
  CharacterEffectDefinition,
  CharacterProjectileDefinition,
  BreakTargetMiniGameSnapshot,
  BreakTargetRuntime,
  EnemyRushMiniGameSnapshot,
  EnemyRushRuntime,
  EffectSoundCue,
  EffectTransform,
  FighterRuntime,
  FighterState,
  GameSettings,
  GetupAction,
  InputFrame,
  ImpactSparkEvent,
  MenuAttractPerformanceMode,
  MatchSnapshot,
  MoveEffectInstance,
  MoveDefinition,
  MoveInput,
  MoveProjectileInstance,
  ProjectileRuntime,
  StageDefinition,
  StageLayerDefinition,
  StageModelDefinition,
  StagePropDefinition,
  StageVisualStyle,
  Vec3Tuple
} from '../types';
import { emptyInputFrame } from '../types';
import { activeMoveProgress, createMatch, stepMatch } from '../engine/fightEngine';
import { getCharacterGlobalScale } from '../lib/characterScale';
import { debugLogThrottled } from '../lib/debugLogger';
import { findCameraSightlineBlockers, isCameraOutsideStageSafetyEnvelope, resolveCameraBoundaryNudge, type CameraSafetyCollider } from '../lib/cameraSafety';
import { effectIsVisibleAt, effectTransformAt, shouldFireEffectCue } from '../lib/effects';
import { cameraScreenRightStageAlignment, shouldFlipCameraSideForControls, stableFightCameraSide } from '../lib/fightCamera';
import { defaultGameSettings } from '../lib/gameSettings';
import { getStageVisualStylePresetDefaults, resolveStageVisualStyle } from '../lib/stageVisualStyle';
import { getDuplicateFighterHueShift, shiftHueColor } from '../lib/fighterHue';
import { normalizeHdVoxelPayload, type VoxelPackPart } from '../lib/voxelPack';
import { installVoxelFreezeMonitor, loadHdVoxelFrameInWorker } from '../lib/voxelFrameClient';
import { applyQueuedPressesToInputs, enqueueInputPress, getKeyboardBindingsForEvent, type QueuedInputPress } from '../hooks/useControls';
import { StageFloorEffects as UpgradedStageFloorEffects } from './StageFloorEffects';
import { KORE_APP_VERSION } from '../appVersion';
import { makePreviewInput, previewScriptLength, type TrainingPreviewFrame } from '../lib/trainingTrials';
import {
  MODEL_STAGE_IDS,
  STAGE_BASIS_TRANSCODER_PATH,
  STAGE_DRACO_DECODER_PATH,
  isModelStage,
  markStageAssetDecoded,
  markStageAssetError,
  markStageAssetGpuWarm,
  markStageAssetReady,
  prefetchStageModelDecoders,
  preloadStageModel,
  resolveStageModelDefinition,
  resolveStageModelUrl
} from '../lib/stageAssets';

type GameSceneProps = {
  match: MatchSnapshot;
  cameraSettings?: GameSettings['camera'];
  sparkSettings?: GameSettings['display']['impactSparks'];
  audioSettings?: GameSettings['audio'];
  reducedMotion?: boolean;
  onAssetLoadingChange?: (state: AssetLoadingState) => void;
};

export type AssetLoadingState = {
  active: boolean;
  progress: number;
  item: string;
  errors: string[];
  ready: boolean;
};

type KoreHealth = {
  ready: boolean;
  frameCount: number;
  timestampMs: number;
  canvasSize: { width: number; height: number; clientWidth: number; clientHeight: number };
  webglSupported: boolean;
  webgl2: boolean;
  vendor: string | null;
  renderer: string | null;
  maxTextureSize: number | null;
  contextLost: boolean;
  lastError: string | null;
  failedAssets: string[];
  matchPhase: MatchSnapshot['phase'];
  playerCanMove: boolean;
  attackCanStart: boolean;
  activeFrameReached: boolean;
};

type KoreHealthWindow = Window & {
  __KORE_HEALTH__?: KoreHealth;
  __KORE_ENABLE_HEALTH_LOG__?: boolean;
};

type StageCameraMaterialState = {
  material: THREE.Material & { opacity?: number };
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
};

type StageCameraColliderEntry = CameraSafetyCollider & {
  id: string;
  mesh: THREE.Mesh;
  materials: StageCameraMaterialState[];
  boundaryFade: boolean;
  fade: number;
};

type StageCameraCollisionRegistry = {
  colliders: Set<StageCameraColliderEntry>;
  occluders: Set<StageCameraColliderEntry>;
};

const StageCameraCollisionContext = createContext<StageCameraCollisionRegistry | null>(null);

const defaultCameraSettings: GameSettings['camera'] = {
  distance: 1,
  height: 1,
  smoothing: 1,
  zoomBias: 1
};
const MENU_ATTRACT_FIGHTER_RENDER_STYLE: Partial<FighterRenderStyle> = {
  castShadow: false,
  receiveShadow: false
};
const MENU_ATTRACT_FIGHTER_VISUAL_SCALE = 0.82;
const FULL_FIGHT_FIGHTER_RENDER_STYLE: Partial<FighterRenderStyle> = {
  castShadow: false,
  receiveShadow: false
};

const DEFAULT_SKYBOX_PATH = '/stages/shared/default-skybox.png';
const MODEL_STAGE_DEBUG_ID_PREFIXES = ['bleach-', 'dbz-', 'general-', 'naruto-', 'one-piece-', 'one-punch-man-'];
const FIXED_STAGE_PREVIEW_CAMERA_POSITION: [number, number, number] = [24, 24, 64];
const FIXED_STAGE_PREVIEW_TARGET: [number, number, number] = [0, 3.2, 0];
const FIXED_STAGE_PREVIEW_FOV = 38;
const MODEL_STAGE_VISIBILITY_HYPOTHESES = [
  'H19 model scene bounds are empty/collapsed after GLTF parse',
  'H20 manifest transform places the model outside the preview/fight camera',
  'H21 manifest bounds disagree with runtime GLTF bounds',
  'H22 camera frustum does not intersect the transformed model bounds',
  'H23 StagePreviewCamera is aiming at the wrong target for model stages',
  'H24 loaded meshes are hidden, on disabled layers, or have invisible parents',
  'H25 materials are transparent/zero-opacity/depth-disabled after normalization',
  'H26 texture maps failed to attach or image dimensions are unusable',
  'H27 geometries contain no position attributes or no triangles',
  'H28 another stage surface/effect is visually occluding the model'
];
const MODEL_STAGE_WORLD_HYPOTHESES = [
  'H29 model is being scaled or shifted by the preview wrapper',
  'H30 skybox/backdrop renders over the GLB',
  'H31 fog makes the GLB indistinguishable from the sky',
  'H32 orbit controls clamp the camera too close or aim at the wrong target',
  'H33 imported model materials still participate in fog/depth weirdness',
  'H34 the fight-lane marker is hiding the center of the model',
  'H35 the model is present but behind the camera after wrapper transforms',
  'H36 the GLB is loaded into a group that is not attached at world origin',
  'H37 the editor preview camera differs from the game camera',
  'H38 a non-model preview surface is still being rendered in the model path'
];
const MODEL_STAGE_INSERTION_HYPOTHESES = [
  'H39 imported helper quads are covering the actual village geometry',
  'H40 the model visual floor is vertically offset from the playable floor',
  'H41 hidden meshes still contribute to bounds or raycasts',
  'H42 the center fight lane is on an empty source helper plane',
  'H43 the GLB node transform bakes village geometry above the world origin',
  'H44 preview raycasts are hitting a wrapper instead of a real mesh',
  'H45 the real village is visible only after excluding source guide meshes',
  'H46 the marker needs to live on the game floor while the model is grounded to it',
  'H47 the fight camera had model-only distance changes that made maps feel inconsistent',
  'H48 transformed insertion bounds must be checked after all scrub/ground steps'
];
const MODEL_STAGE_DEV_EDITOR_HYPOTHESES = [
  'H50 React StrictMode effect cleanup disposes freshly assigned model materials after the first visible frame',
  'H51 the Stages local-dev editor briefly renders the in-memory roster stage, then replaces it with a refetched manifest',
  'H52 OrbitControls overwrites the fixed preview camera after the model first appears',
  'H53 the model is loaded, but material replacement happens after first paint and turns it invisible',
  'H54 the Suspense fallback flashes and is mistaken for the model',
  'H55 WebP textures load after geometry and cause a material update that clears visible output',
  'H56 per-mesh culling or stale geometry bounding spheres hide large optimized meshes',
  'H57 the editor overlay/canvas scissor or CSS clips the model after resize',
  'H58 stage safe-lane markers render on top of the model due renderOrder/depth settings',
  'H59 dev-only remounts reset the cloned GLB scene after it has already been mutated'
];
const MODEL_STAGE_DEV_EDITOR_HYPOTHESES_2 = [
  'H60 SkeletonUtils.clone strips or corrupts static imported stage mesh transforms',
  'H61 the manifest bounds are stale after the latest Blender export axis conversion',
  'H62 the GLB primitive tree renders but every source mesh has an unexpected zero draw range',
  'H63 the object tree is mounted, but the largest real mesh is outside the shared preview camera',
  'H64 imported mesh parents carry matrix state that only updates after a manual world-matrix refresh',
  'H65 the local-dev editor is rendering the lane and debug React meshes while rejecting GLB mesh primitives',
  'H66 the stage model is present but fully hidden behind an exported helper plane that shares the sky color',
  'H67 the fixed editor camera sees the model bounds but not the triangles because the runtime bounds source is wrong',
  'H68 the model group is visible, but real mesh renderOrder/depth state loses against the stage guide overlay',
  'H69 the native glTF scene clone must be used for non-character stage assets'
];

function logStageModelDebug(event: string, payload: Record<string, unknown>) {
  const stageId = payload.stageId;
  const productionEvent = event.startsWith('GLB') || event.startsWith('H11') || event.startsWith('H49');
  if (!import.meta.env.DEV && !productionEvent) return;
  if (
    typeof stageId === 'string' &&
    !MODEL_STAGE_IDS.has(stageId) &&
    !MODEL_STAGE_DEBUG_ID_PREFIXES.some((prefix) => stageId.startsWith(prefix)) &&
    payload.renderMode !== 'model' &&
    !payload.hasModel &&
    !payload.hasModelDefinition
  ) return;
  console.info(`[KORE stage-model-debug] ${event} ${JSON.stringify(payload)}`);
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToAscii(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.')).join('');
}

async function probeStageModelAsset(stageId: string, modelPath: string, signal: AbortSignal) {
  const startedAt = performance.now();
  const response = await fetch(modelPath, {
    cache: 'no-store',
    headers: { Range: 'bytes=0-31' },
    signal
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const ascii = bytesToAscii(bytes);
  const htmlFallback = ascii.trimStart().startsWith('<!doctype html') || ascii.trimStart().startsWith('<html');
  const glbMagic = ascii.startsWith('glTF');
  logStageModelDebug(htmlFallback || !glbMagic ? 'GLB asset probe failed' : 'GLB asset probe passed', {
    stageId,
    modelPath,
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get('content-type'),
    contentLength: response.headers.get('content-length'),
    contentRange: response.headers.get('content-range'),
    byteLength: bytes.byteLength,
    firstBytesHex: bytesToHex(bytes.slice(0, 12)),
    firstBytesAscii: ascii.slice(0, 32),
    glbMagic,
    htmlFallback,
    elapsedMs: Math.round(performance.now() - startedAt)
  });
}

function roundDebugNumber(value: number, decimals = 4) {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function vectorToDebugArray(vector: THREE.Vector3) {
  return [roundDebugNumber(vector.x), roundDebugNumber(vector.y), roundDebugNumber(vector.z)];
}

function tupleToVector(tuple: [number, number, number] | undefined, fallback: [number, number, number]) {
  return new THREE.Vector3(...(tuple ?? fallback));
}

function boxToDebugPayload(box: THREE.Box3) {
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  return {
    empty: box.isEmpty(),
    min: vectorToDebugArray(box.min),
    max: vectorToDebugArray(box.max),
    center: vectorToDebugArray(center),
    size: vectorToDebugArray(size),
    radius: roundDebugNumber(size.length() * 0.5)
  };
}

function stageModelBoundsToBox(bounds: StageModelDefinition['bounds']) {
  if (!bounds) return undefined;
  const center = tupleToVector(bounds.center, [0, 0, 0]);
  const size = tupleToVector(bounds.size, [0, 0, 0]);
  if (size.x <= 0 || size.y <= 0 || size.z <= 0) return undefined;
  const half = size.multiplyScalar(0.5);
  return new THREE.Box3(center.clone().sub(half), center.clone().add(half));
}

function getGeometryTriangleCount(geometry: THREE.BufferGeometry) {
  const indexCount = geometry.index?.count;
  if (typeof indexCount === 'number') return Math.floor(indexCount / 3);
  const positionCount = geometry.getAttribute('position')?.count;
  return typeof positionCount === 'number' ? Math.floor(positionCount / 3) : 0;
}

function meshMaterials(mesh: THREE.Mesh) {
  return (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(Boolean) as THREE.Material[];
}

function materialHasColorOrTexture(material: THREE.Material) {
  const mapped = material as THREE.Material & {
    color?: THREE.Color;
    map?: THREE.Texture | null;
    emissiveMap?: THREE.Texture | null;
    normalMap?: THREE.Texture | null;
  };
  return Boolean(mapped.map ?? mapped.emissiveMap ?? mapped.normalMap) || Boolean(mapped.color);
}

function colorFromString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return new THREE.Color().setHSL(hue / 360, 0.72, 0.56);
}

function objectDebugPath(object: THREE.Object3D) {
  const names: string[] = [];
  let current: THREE.Object3D | null = object;
  while (current && names.length < 6) {
    names.unshift(current.name || current.type);
    current = current.parent;
  }
  return names.join(' > ');
}

function isDescendantOf(object: THREE.Object3D, root: THREE.Object3D) {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current === root) return true;
    current = current.parent;
  }
  return false;
}

function isEffectivelyVisible(object: THREE.Object3D) {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function computeVisibleModelBounds(root: THREE.Object3D) {
  const bounds = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.getAttribute('position') || !isEffectivelyVisible(mesh)) return;
    const meshBounds = new THREE.Box3().setFromObject(mesh);
    if (!meshBounds.isEmpty()) bounds.union(meshBounds);
  });
  return bounds;
}

function hasSaneStageModelBounds(bounds: THREE.Box3) {
  if (bounds.isEmpty()) return false;
  const size = new THREE.Vector3();
  bounds.getSize(size);
  const maxSize = Math.max(size.x, size.y, size.z);
  return Number.isFinite(maxSize) && maxSize > 0.001 && maxSize < 5000;
}

function getStageModelMeshHideReason(mesh: THREE.Mesh, stageId: string, useGeometryPlaneHeuristic = true) {
  if (stageId !== 'hidden-leaf-village') return null;
  const meshName = mesh.name || '';
  const parentName = mesh.parent?.name || '';
  const materials = meshMaterials(mesh);
  const hasMaterialSignal = materials.some(materialHasColorOrTexture);
  if (parentName === 'KORE_export_Quad_a' || meshName === 'Plane.067') return 'source-helper-ground-quad';
  if (/^KORE_export_Quad/i.test(parentName) && !hasMaterialSignal) return 'source-helper-quad';
  if (!useGeometryPlaneHeuristic) return null;
  mesh.geometry.computeBoundingBox();
  const localBounds = mesh.geometry.boundingBox;
  if (!localBounds) return null;
  const size = new THREE.Vector3();
  localBounds.getSize(size);
  const maxSize = Math.max(size.x, size.y, size.z);
  const minSize = Math.min(size.x, size.y, size.z);
  const flatLargeUnmappedPlane = /^Plane\.\d+$/i.test(meshName) && maxSize > 18 && minSize < 0.05 && !hasMaterialSignal;
  if (flatLargeUnmappedPlane) return 'large-unmapped-plane';
  return null;
}

function prepareStageModelSceneForRender(
  root: THREE.Object3D,
  stageId: string,
  options: { boundsOverride?: THREE.Box3; useGeometryPlaneHeuristic?: boolean } = {}
) {
  const hiddenSamples: Array<Record<string, unknown>> = [];
  let hiddenMeshCount = 0;
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const reason = getStageModelMeshHideReason(mesh, stageId, options.useGeometryPlaneHeuristic ?? true);
    if (!reason) return;
    mesh.visible = false;
    hiddenMeshCount += 1;
    if (hiddenSamples.length < 12) {
      hiddenSamples.push({
        reason,
        name: mesh.name || mesh.type,
        path: objectDebugPath(mesh),
        triangles: mesh.geometry ? getGeometryTriangleCount(mesh.geometry) : 0
      });
    }
  });
  const visibleBounds = options.boundsOverride?.clone() ?? computeVisibleModelBounds(root);
  return {
    hiddenMeshCount,
    hiddenSamples,
    visibleBounds
  };
}

function normalizeStageModelSceneForRender(root: THREE.Object3D, stageId: string, modelDefinition: StageModelDefinition, useGeometryPlaneHeuristic: boolean) {
  let normalizedMeshCount = 0;
  let normalizedMaterialCount = 0;
  root.traverse((object) => {
    object.layers.enable(0);
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) {
      object.visible = true;
      return;
    }
    if (getStageModelMeshHideReason(mesh, stageId, useGeometryPlaneHeuristic)) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    mesh.frustumCulled = false;
    mesh.castShadow = modelDefinition.castShadow !== false;
    mesh.receiveShadow = modelDefinition.receiveShadow !== false;
    const materials = meshMaterials(mesh);
    normalizedMeshCount += 1;
    normalizedMaterialCount += materials.length;
    mesh.material = materials.map((material) => normalizeStageModelMaterial(material, stageId, mesh.name || objectDebugPath(mesh))).filter(Boolean) as THREE.Material | THREE.Material[];
  });
  return { normalizedMeshCount, normalizedMaterialCount };
}

type FlattenedStageModelMesh = {
  id: string;
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  triangleCount: number;
};

function createFlattenedStageModelMeshes(root: THREE.Object3D, stageId: string) {
  const meshes: FlattenedStageModelMesh[] = [];
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible || !mesh.geometry?.getAttribute('position')) return;
    if (getStageModelMeshHideReason(mesh, stageId, false)) return;
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const sourceMaterials = meshMaterials(mesh);
    const material = sourceMaterials.length > 1
      ? sourceMaterials.map((sourceMaterial) => sourceMaterial.clone())
      : sourceMaterials[0]?.clone();
    meshes.push({
      id: `${meshes.length}-${mesh.uuid}`,
      name: mesh.name || mesh.type,
      geometry,
      material: material ?? new THREE.MeshBasicMaterial({ color: colorFromString(mesh.name || mesh.uuid), side: THREE.DoubleSide, depthTest: true, depthWrite: true, fog: false }),
      triangleCount: getGeometryTriangleCount(mesh.geometry)
    });
  });
  return meshes;
}

function textureDebugPayload(texture: THREE.Texture | null | undefined) {
  if (!texture) return null;
  const image = texture.image as { width?: number; height?: number; complete?: boolean } | undefined;
  return {
    uuid: texture.uuid,
    name: texture.name,
    loaded: Boolean(image),
    width: image?.width ?? null,
    height: image?.height ?? null,
    complete: image?.complete ?? null
  };
}

function inspectModelObjectTree(root: THREE.Object3D) {
  const stats = {
    objectCount: 0,
    visibleObjectCount: 0,
    hiddenObjectCount: 0,
    meshCount: 0,
    visibleMeshCount: 0,
    hiddenMeshCount: 0,
    geometryCount: 0,
    geometryWithPositionCount: 0,
    geometryWithoutPositionCount: 0,
    triangleCount: 0,
    materialSlotCount: 0,
    transparentMaterialCount: 0,
    zeroOpacityMaterialCount: 0,
    depthWriteDisabledCount: 0,
    mapCount: 0,
    loadedMapCount: 0,
    missingMapImageCount: 0,
    layerMaskSamples: [] as number[],
    hiddenSamples: [] as string[],
    materialSamples: [] as Array<Record<string, unknown>>,
    textureSamples: [] as Array<Record<string, unknown>>
  };
  root.traverse((object) => {
    stats.objectCount += 1;
    if (object.visible) {
      stats.visibleObjectCount += 1;
    } else {
      stats.hiddenObjectCount += 1;
      if (stats.hiddenSamples.length < 8) stats.hiddenSamples.push(object.name || object.uuid);
    }
    if (stats.layerMaskSamples.length < 8 && !stats.layerMaskSamples.includes(object.layers.mask)) {
      stats.layerMaskSamples.push(object.layers.mask);
    }
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    stats.meshCount += 1;
    if (mesh.visible) stats.visibleMeshCount += 1;
    else stats.hiddenMeshCount += 1;
    if (mesh.geometry) {
      stats.geometryCount += 1;
      if (mesh.geometry.getAttribute('position')) stats.geometryWithPositionCount += 1;
      else stats.geometryWithoutPositionCount += 1;
      stats.triangleCount += getGeometryTriangleCount(mesh.geometry);
    }
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      if (!material) return;
      stats.materialSlotCount += 1;
      const mapped = material as THREE.Material & { opacity?: number; map?: THREE.Texture | null; alphaMap?: THREE.Texture | null };
      if (material.transparent) stats.transparentMaterialCount += 1;
      if ((mapped.opacity ?? 1) <= 0.001) stats.zeroOpacityMaterialCount += 1;
      if (material.depthWrite === false) stats.depthWriteDisabledCount += 1;
      const textures = [mapped.map, mapped.alphaMap].filter(Boolean) as THREE.Texture[];
      textures.forEach((texture) => {
        stats.mapCount += 1;
        const image = texture.image as { width?: number; height?: number } | undefined;
        if (image?.width && image?.height) stats.loadedMapCount += 1;
        else stats.missingMapImageCount += 1;
        if (stats.textureSamples.length < 8) {
          const sample = textureDebugPayload(texture);
          if (sample) stats.textureSamples.push(sample);
        }
      });
      if (stats.materialSamples.length < 8) {
        stats.materialSamples.push({
          name: material.name,
          type: material.type,
          transparent: material.transparent,
          opacity: roundDebugNumber(mapped.opacity ?? 1),
          depthWrite: material.depthWrite,
          depthTest: material.depthTest,
          side: material.side,
          hasMap: Boolean(mapped.map),
          hasAlphaMap: Boolean(mapped.alphaMap)
        });
      }
    });
  });
  return stats;
}

const defaultSparkSettings: GameSettings['display']['impactSparks'] = {
  enabled: true,
  cinematic: true,
  shape: 'burst',
  hitColor: '#ffb33f',
  blockColor: '#9eeeff',
  size: 1,
  intensity: 1
};

const LOCAL_HDRI_ENVIRONMENT_PATH = '/hdri/';
const LOCAL_HDRI_ENVIRONMENT_FILE = 'potsdamer_platz_1k.hdr';

function EnvironmentFallback() {
  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight position={[8, 12, 6]} intensity={1.25} castShadow />
      <hemisphereLight args={['#ffffff', '#1b1b2b', 0.45]} />
    </>
  );
}

type GameEnvironmentErrorBoundaryProps = {
  fallback: ReactNode;
  children: ReactNode;
};

type GameEnvironmentErrorBoundaryState = {
  error: Error | null;
};

class GameEnvironmentErrorBoundary extends Component<GameEnvironmentErrorBoundaryProps, GameEnvironmentErrorBoundaryState> {
  state: GameEnvironmentErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[KORE environment] Local HDRI environment failed; using light fallback.', {
      error: error.message,
      componentStack: info.componentStack?.slice(0, 1000)
    });
  }

  render() {
    if (this.state.error) return this.props.fallback;
    return this.props.children;
  }
}

function GameEnvironment({ background = false }: { background?: boolean }) {
  return (
    <GameEnvironmentErrorBoundary fallback={<EnvironmentFallback />}>
      <Suspense fallback={<EnvironmentFallback />}>
        <Environment path={LOCAL_HDRI_ENVIRONMENT_PATH} files={LOCAL_HDRI_ENVIRONMENT_FILE} background={background} />
      </Suspense>
    </GameEnvironmentErrorBoundary>
  );
}

export type PreviewPose = Exclude<FighterState, 'attack'> | MoveInput;

export function GameScene({ match, cameraSettings = defaultCameraSettings, sparkSettings = defaultSparkSettings, audioSettings, reducedMotion = false, onAssetLoadingChange }: GameSceneProps) {
  const cameraCollisionRegistry = useMemo<StageCameraCollisionRegistry>(() => ({ colliders: new Set<StageCameraColliderEntry>(), occluders: new Set<StageCameraColliderEntry>() }), [match.stage.id]);
  const fighterRenderStyles = useMemo(() => ([
    makeFightFighterRenderStyle(match, 1),
    makeFightFighterRenderStyle(match, 2)
  ] as const), [match.fighters[0].baseCharacter.id, match.fighters[1].baseCharacter.id]);
  useEffect(() => {
    const cancelP1 = prewarmActiveFighterVoxels(match.fighters[0].character, collectImageVoxelFrameSources(match.fighters[0].character), {
      immediateFrames: uniqueFrameSources([getImageVoxelFramePath(match.fighters[0], getFighterRenderProgress(match.fighters[0]), 0)])
    });
    const cancelP2 = prewarmActiveFighterVoxels(match.fighters[1].character, collectImageVoxelFrameSources(match.fighters[1].character), {
      immediateFrames: uniqueFrameSources([getImageVoxelFramePath(match.fighters[1], getFighterRenderProgress(match.fighters[1]), 0)])
    });
    return () => {
      cancelP1();
      cancelP2();
    };
  }, [match.fighters[0].character.id, match.fighters[1].character.id]);
  return (
    <Canvas dpr={[1, 1.25]} camera={{ position: [0, 3.3, 6.8], fov: 46 }} data-testid="fight-canvas">
      <AssetLoadingReporter onAssetLoadingChange={onAssetLoadingChange} />
      {import.meta.env.DEV && <KoreHealthReporter match={match} />}
      <StageCameraCollisionContext.Provider value={cameraCollisionRegistry}>
        <GameEnvironment />
        {!isModelStage(match.stage) && <DefaultSkybox imagePath={match.stage.skyboxPath ?? DEFAULT_SKYBOX_PATH} />}
        <StageVisualStyleRig stage={match.stage} fighters={match.fighters} />
        <CameraRig match={match} settings={cameraSettings} reducedMotion={reducedMotion} impactFeedbackEnabled={sparkSettings.enabled && sparkSettings.cinematic} />
        <Arena stage={match.stage} fighters={match.fighters} impactEvents={match.impactEvents} />
        <StageCameraOcclusionFader />
        <FighterRig fighter={match.fighters[0]} timeScale={match.visualTimeScale} stage={match.stage} renderStyle={fighterRenderStyles[0]} />
        <FighterRig fighter={match.fighters[1]} timeScale={match.visualTimeScale} stage={match.stage} renderStyle={fighterRenderStyles[1]} />
        <TornadoRibbonLayer events={match.impactEvents} fighters={match.fighters} reducedMotion={reducedMotion} />
        <TransformEffectLayer fighter={match.fighters[0]} />
        <TransformEffectLayer fighter={match.fighters[1]} />
        <ShadowCloneLayer fighter={match.fighters[0]} timeScale={match.visualTimeScale} stage={match.stage} renderStyle={fighterRenderStyles[0]} />
        <ShadowCloneLayer fighter={match.fighters[1]} timeScale={match.visualTimeScale} stage={match.stage} renderStyle={fighterRenderStyles[1]} />
        <EffectLayer match={match} audioSettings={audioSettings} reducedMotion={reducedMotion} />
        <ProjectileLayer match={match} stage={match.stage} />
        <ImpactSparkLayer events={match.impactEvents} settings={sparkSettings} reducedMotion={reducedMotion} />
      </StageCameraCollisionContext.Provider>
    </Canvas>
  );
}

function AssetLoadingReporter({ onAssetLoadingChange }: { onAssetLoadingChange?: (state: AssetLoadingState) => void }) {
  const progress = useProgress();
  const readyRef = useRef(false);
  const lastReportRef = useRef('');

  const report = useCallback((ready: boolean) => {
    if (!onAssetLoadingChange) return;
    const state: AssetLoadingState = {
      active: progress.active || !ready,
      progress: ready && !progress.active ? 100 : Math.round(progress.progress),
      item: progress.item,
      errors: [...progress.errors],
      ready
    };
    const reportKey = JSON.stringify(state);
    if (reportKey === lastReportRef.current) return;
    lastReportRef.current = reportKey;
    onAssetLoadingChange(state);
  }, [onAssetLoadingChange, progress.active, progress.errors, progress.item, progress.progress]);

  useEffect(() => {
    report(readyRef.current);
  }, [report]);

  useFrame(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    report(true);
  });

  return null;
}

function KoreHealthReporter({ match }: { match: MatchSnapshot }) {
  const { gl } = useThree();
  const frameCountRef = useRef(0);
  const contextLostRef = useRef(false);
  const failedAssetsRef = useRef<string[]>([]);
  const lastErrorRef = useRef<string | null>(null);
  const playerCanMoveRef = useRef(false);
  const attackCanStartRef = useRef(false);
  const activeFrameReachedRef = useRef(false);
  const initialP1PositionRef = useRef({ x: match.fighters[0].position.x, z: match.fighters[0].position.z });
  const webglInfo = useMemo(() => getKoreWebGLInfo(gl), [gl]);
  const healthRef = useRef<KoreHealth | null>(null);

  useEffect(() => {
    initialP1PositionRef.current = { x: match.fighters[0].position.x, z: match.fighters[0].position.z };
    playerCanMoveRef.current = false;
    attackCanStartRef.current = false;
    activeFrameReachedRef.current = false;
  }, [match.fighters[0].baseCharacter.id, match.fighters[1].baseCharacter.id, match.stage.id]);

  useEffect(() => {
    const canvas = gl.domElement;
    const recordFailedAsset = (url: string) => {
      if (!url || failedAssetsRef.current.includes(url)) return;
      failedAssetsRef.current = [...failedAssetsRef.current, url].slice(-40);
    };
    const onContextLost = (event: Event) => {
      contextLostRef.current = true;
      lastErrorRef.current = 'WebGL context lost';
      event.preventDefault();
    };
    const onContextRestored = () => {
      contextLostRef.current = false;
      lastErrorRef.current = null;
    };
    const onResourceError = (event: ErrorEvent | Event) => {
      const target = event.target as Partial<HTMLImageElement & HTMLScriptElement & HTMLLinkElement & HTMLAudioElement & HTMLSourceElement> | null;
      const source = target?.src || target?.href;
      if (source) recordFailedAsset(source);
      if (event instanceof ErrorEvent && event.message) lastErrorRef.current = event.message;
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);
    window.addEventListener('error', onResourceError, true);
    return () => {
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      window.removeEventListener('error', onResourceError, true);
      delete (window as KoreHealthWindow).__KORE_HEALTH__;
    };
  }, [gl]);

  useFrame(() => {
    frameCountRef.current += 1;
    const p1 = match.fighters[0];
    const initial = initialP1PositionRef.current;
    if (Math.hypot(p1.position.x - initial.x, p1.position.z - initial.z) > 0.08) playerCanMoveRef.current = true;
    if (p1.state === 'attack' || p1.currentMove) attackCanStartRef.current = true;
    if (
      p1.currentMove &&
      p1.moveFrame >= p1.currentMove.startupFrames &&
      p1.moveFrame <= p1.currentMove.startupFrames + p1.currentMove.activeFrames
    ) {
      activeFrameReachedRef.current = true;
    }

    const canvas = gl.domElement;
    const context = gl.getContext();
    if (!healthRef.current) {
      healthRef.current = {
        ready: false,
        frameCount: 0,
        timestampMs: 0,
        canvasSize: {
          width: 0,
          height: 0,
          clientWidth: 0,
          clientHeight: 0
        },
        ...webglInfo,
        contextLost: false,
        lastError: null,
        failedAssets: [],
        matchPhase: match.phase,
        playerCanMove: false,
        attackCanStart: false,
        activeFrameReached: false
      };
      (window as KoreHealthWindow).__KORE_HEALTH__ = healthRef.current;
    }

    const health = healthRef.current;
    health.ready = frameCountRef.current > 0;
    health.frameCount = frameCountRef.current;
    health.timestampMs = performance.now();
    health.canvasSize.width = canvas.width;
    health.canvasSize.height = canvas.height;
    health.canvasSize.clientWidth = canvas.clientWidth;
    health.canvasSize.clientHeight = canvas.clientHeight;
    health.contextLost = contextLostRef.current || Boolean(context.isContextLost?.());
    health.lastError = lastErrorRef.current;
    health.failedAssets = failedAssetsRef.current;
    health.matchPhase = match.phase;
    health.playerCanMove = playerCanMoveRef.current;
    health.attackCanStart = attackCanStartRef.current;
    health.activeFrameReached = activeFrameReachedRef.current;
    if ((window as KoreHealthWindow).__KORE_ENABLE_HEALTH_LOG__ && frameCountRef.current % 60 === 0) {
      console.info(`[KORE_HEALTH] ${JSON.stringify(health)}`);
    }
  });

  return null;
}

function getKoreWebGLInfo(gl: THREE.WebGLRenderer) {
  try {
    const context = gl.getContext();
    const debugInfo = context.getExtension('WEBGL_debug_renderer_info') as {
      UNMASKED_VENDOR_WEBGL: number;
      UNMASKED_RENDERER_WEBGL: number;
    } | null;
    return {
      webglSupported: true,
      webgl2: Boolean((gl.capabilities as { isWebGL2?: boolean }).isWebGL2),
      vendor: debugInfo ? String(context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)) : String(context.getParameter(context.VENDOR)),
      renderer: debugInfo ? String(context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : String(context.getParameter(context.RENDERER)),
      maxTextureSize: Number(context.getParameter(context.MAX_TEXTURE_SIZE))
    };
  } catch (error) {
    return {
      webglSupported: false,
      webgl2: false,
      vendor: null,
      renderer: null,
      maxTextureSize: null
    };
  }
}

export function MoveDemoCanvas({
  character,
  stage,
  script,
  durationFrames,
  dummyCharacter,
  label = `${character.displayName} move preview`,
  testId = 'move-demo-canvas'
}: {
  character: CharacterDefinition;
  stage: StageDefinition;
  script: TrainingPreviewFrame[];
  durationFrames: number;
  dummyCharacter?: CharacterDefinition;
  label?: string;
  testId?: string;
}) {
  const initialMatch = useMemo(
    () => buildMoveDemoMatch(stage, character, dummyCharacter ?? character),
    [character, dummyCharacter, stage]
  );
  const [previewMatch, setPreviewMatch] = useState(initialMatch);
  const cameraCollisionRegistry = useMemo<StageCameraCollisionRegistry>(() => ({ colliders: new Set<StageCameraColliderEntry>(), occluders: new Set<StageCameraColliderEntry>() }), [stage.id]);
  const fighterRenderStyles = useMemo(() => ([
    makeFightFighterRenderStyle(previewMatch, 1),
    makeFightFighterRenderStyle(previewMatch, 2)
  ] as const), [previewMatch.fighters[0].baseCharacter.id, previewMatch.fighters[1].baseCharacter.id]);

  useEffect(() => {
    const cancelP1 = prewarmActiveFighterVoxels(previewMatch.fighters[0].character, collectImageVoxelFrameSources(previewMatch.fighters[0].character), {
      immediateFrames: uniqueFrameSources([getImageVoxelFramePath(previewMatch.fighters[0], getFighterRenderProgress(previewMatch.fighters[0]), 0)])
    });
    const cancelP2 = prewarmActiveFighterVoxels(previewMatch.fighters[1].character, collectImageVoxelFrameSources(previewMatch.fighters[1].character), {
      immediateFrames: uniqueFrameSources([getImageVoxelFramePath(previewMatch.fighters[1], getFighterRenderProgress(previewMatch.fighters[1]), 0)])
    });
    return () => {
      cancelP1();
      cancelP2();
    };
  }, [previewMatch.fighters[0].character.id, previewMatch.fighters[1].character.id]);

  useEffect(() => {
    setPreviewMatch(initialMatch);
  }, [initialMatch]);

  return (
    <Canvas shadows dpr={[1, 1.25]} camera={{ position: [0, 2.35, 5.4], fov: 44 }} data-testid={testId} aria-label={label}>
      <StageCameraCollisionContext.Provider value={cameraCollisionRegistry}>
        <GameEnvironment />
        {!isModelStage(stage) && <DefaultSkybox imagePath={stage.skyboxPath ?? DEFAULT_SKYBOX_PATH} />}
        <StageVisualStyleRig stage={stage} fighters={previewMatch.fighters} preview />
        <MoveDemoCamera match={previewMatch} />
        <Arena stage={stage} fighters={previewMatch.fighters} impactEvents={previewMatch.impactEvents} />
        <StageCameraOcclusionFader />
        <FighterRig fighter={previewMatch.fighters[0]} timeScale={previewMatch.visualTimeScale} stage={stage} renderStyle={fighterRenderStyles[0]} />
        <FighterRig fighter={previewMatch.fighters[1]} timeScale={previewMatch.visualTimeScale} stage={stage} renderStyle={fighterRenderStyles[1]} />
        <TornadoRibbonLayer events={previewMatch.impactEvents} fighters={previewMatch.fighters} reducedMotion />
        <EffectLayer match={previewMatch} reducedMotion />
        <ProjectileLayer match={previewMatch} stage={stage} />
        <ImpactSparkLayer events={previewMatch.impactEvents} settings={defaultSparkSettings} reducedMotion />
        <MoveDemoPlayback
          initialMatch={initialMatch}
          script={script}
          durationFrames={durationFrames}
          onMatchChange={setPreviewMatch}
        />
      </StageCameraCollisionContext.Provider>
    </Canvas>
  );
}

function MoveDemoPlayback({
  initialMatch,
  script,
  durationFrames,
  onMatchChange
}: {
  initialMatch: MatchSnapshot;
  script: TrainingPreviewFrame[];
  durationFrames: number;
  onMatchChange: (match: MatchSnapshot) => void;
}) {
  const matchRef = useRef(initialMatch);
  const frameRef = useRef(0);
  const totalFrames = Math.max(1, durationFrames, previewScriptLength(script) + 24);

  useEffect(() => {
    matchRef.current = initialMatch;
    frameRef.current = 0;
    onMatchChange(initialMatch);
  }, [initialMatch, onMatchChange, script]);

  useFrame(() => {
    if (frameRef.current > totalFrames) {
      matchRef.current = initialMatch;
      frameRef.current = 0;
      onMatchChange(initialMatch);
      return;
    }
    const input = makePreviewInput(script, frameRef.current);
    matchRef.current = stepMatch(matchRef.current, input, emptyInputFrame(), 1 / 60);
    frameRef.current += 1;
    onMatchChange(matchRef.current);
  });

  return null;
}

function MoveDemoCamera({ match }: { match: MatchSnapshot }) {
  const { camera } = useThree();
  const focus = useMemo(() => new THREE.Vector3(0, 1.1, 0), []);
  useFrame((_, delta) => {
    const [p1, p2] = match.fighters;
    const midX = (p1.position.x + p2.position.x) / 2;
    const midZ = (p1.position.z + p2.position.z) / 2;
    focus.lerp(new THREE.Vector3(midX, 1.08, midZ), cameraDamp(delta, 5.8));
    const desired = new THREE.Vector3(focus.x, 2.1, focus.z + 4.9);
    camera.position.lerp(desired, cameraDamp(delta, 7.2));
    if ('fov' in camera) {
      camera.fov = 44;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(focus);
  });
  return null;
}

function makeFightFighterRenderStyle(match: MatchSnapshot, slot: 1 | 2): Partial<FighterRenderStyle> {
  const hueShiftDegrees = getDuplicateFighterHueShift(match, slot);
  return hueShiftDegrees ? { ...FULL_FIGHT_FIGHTER_RENDER_STYLE, hueShiftDegrees } : FULL_FIGHT_FIGHTER_RENDER_STYLE;
}

function makeDuplicateFighterRenderStyle(match: MatchSnapshot, slot: 1 | 2): Partial<FighterRenderStyle> | undefined {
  const hueShiftDegrees = getDuplicateFighterHueShift(match, slot);
  return hueShiftDegrees ? { hueShiftDegrees } : undefined;
}

type AnyMiniGameSnapshot = BreakTargetMiniGameSnapshot | EnemyRushMiniGameSnapshot;

export function MiniGameScene({ snapshot, reducedMotion = false }: { snapshot: AnyMiniGameSnapshot; reducedMotion?: boolean }) {
  const cameraCollisionRegistry = useMemo<StageCameraCollisionRegistry>(() => ({ colliders: new Set<StageCameraColliderEntry>(), occluders: new Set<StageCameraColliderEntry>() }), [snapshot.stage.id]);
  useEffect(() => {
    return prewarmActiveFighterVoxels(snapshot.player.character, collectImageVoxelFrameSources(snapshot.player.character), {
      immediateFrames: uniqueFrameSources([
        getImageVoxelFramePath(snapshot.player, getFighterRenderProgress(snapshot.player), 0),
        ...getBasicAttackPriorityFrameSources(snapshot.player.character)
      ])
    });
  }, [snapshot.player.character.id]);
  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ position: [snapshot.player.position.x, 3.3, snapshot.player.position.z + 6.8], fov: 46 }} data-testid="mini-game-canvas">
      <StageCameraCollisionContext.Provider value={cameraCollisionRegistry}>
        <GameEnvironment />
        {!isModelStage(snapshot.stage) && <DefaultSkybox imagePath={snapshot.stage.skyboxPath ?? DEFAULT_SKYBOX_PATH} />}
        <StageVisualStyleRig stage={snapshot.stage} fighters={[snapshot.player, snapshot.player] as [FighterRuntime, FighterRuntime]} />
        <MiniGameCameraRig snapshot={snapshot} />
        <Arena stage={snapshot.stage} fighters={[snapshot.player, snapshot.player] as [FighterRuntime, FighterRuntime]} impactEvents={[]} />
        <StageCameraOcclusionFader />
        {snapshot.kind === 'break-target' ? (
          <BreakTargetLayer targets={snapshot.targets} explosions={snapshot.explosions} reducedMotion={reducedMotion} />
        ) : (
          <EnemyRushLayer snapshot={snapshot} reducedMotion={reducedMotion} />
        )}
        <FighterRig fighter={snapshot.player} timeScale={1} stage={snapshot.stage} />
        <ContactShadows position={[0, -0.01, 0]} opacity={0.38} scale={18} blur={2.4} far={3} />
        <StagePostProcessing stage={snapshot.stage} reducedMotion={reducedMotion} />
      </StageCameraCollisionContext.Provider>
    </Canvas>
  );
}

function MiniGameCameraRig({ snapshot }: { snapshot: AnyMiniGameSnapshot }) {
  const { camera, size } = useThree();
  const smoothedTarget = useRef(new THREE.Vector3(snapshot.player.position.x, 1.1, snapshot.player.position.z));
  useFrame((_, delta) => {
    const aspect = size.width / Math.max(1, size.height);
    const isNarrow = aspect < 0.75;
    const desiredFov = isNarrow ? 64 : 46;
    if ('fov' in camera && Math.abs(camera.fov - desiredFov) > 0.1) {
      camera.fov = desiredFov;
      camera.updateProjectionMatrix();
    }
    const enemyRush = snapshot.kind === 'enemy-rush';
    const focusables: Array<{ x: number; y: number; z: number }> = snapshot.kind === 'break-target'
      ? snapshot.targets.filter((target) => !target.destroyed).map((target) => target.position)
      : snapshot.enemies.filter((enemy) => !enemy.defeated).map((enemy) => ({ x: enemy.position.x, y: enemy.position.y + enemy.height * 0.5, z: enemy.position.z }));
    const targetCenter = new THREE.Vector3(snapshot.player.position.x, 1.1, snapshot.player.position.z);
    for (const target of focusables) {
      targetCenter.add(new THREE.Vector3(target.x, Math.max(1, target.y), target.z));
    }
    if (focusables.length > 0) targetCenter.multiplyScalar(1 / (focusables.length + 1));
    const player = new THREE.Vector3(snapshot.player.position.x, 1.08, snapshot.player.position.z);
    const focus = player.lerp(targetCenter, enemyRush ? (isNarrow ? 0.28 : 0.32) : (isNarrow ? 0.34 : 0.38));
    if (enemyRush) focus.z = THREE.MathUtils.lerp(snapshot.player.position.z, 0, isNarrow ? 0.12 : 0.22);
    smoothedTarget.current.lerp(focus, 1 - Math.pow(0.001, delta));
    const desired = new THREE.Vector3(
      smoothedTarget.current.x,
      smoothedTarget.current.y + (enemyRush ? (isNarrow ? 3.05 : 2.55) : (isNarrow ? 3.2 : 2.35)),
      smoothedTarget.current.z + (enemyRush ? (isNarrow ? 10.6 : 7.8) : (isNarrow ? 12.2 : 6.8))
    );
    camera.position.lerp(desired, 1 - Math.pow(0.002, delta));
    camera.lookAt(smoothedTarget.current);
  });
  return null;
}

function BreakTargetLayer({
  targets,
  explosions,
  reducedMotion
}: {
  targets: BreakTargetMiniGameSnapshot['targets'];
  explosions: BreakTargetMiniGameSnapshot['explosions'];
  reducedMotion: boolean;
}) {
  return (
    <group>
      {targets.map((target) => (
        <BreakTargetVoxelTarget key={target.id} target={target} />
      ))}
      {explosions.map((explosion) => (
        <BreakTargetExplosion key={explosion.id} explosion={explosion} reducedMotion={reducedMotion} />
      ))}
    </group>
  );
}

const breakTargetAssetByTier: Record<BreakTargetRuntime['tier'], string> = {
  10: '/minigames/break-target/target-10hp.png',
  20: '/minigames/break-target/target-20hp.png',
  30: '/minigames/break-target/target-30hp.png'
};

const enemyRushAssetByKind: Record<EnemyRushRuntime['kind'], string> = {
  'zombie-small': '/minigames/enemy-rush/enemies/zombie-small.png',
  'skeleton-small': '/minigames/enemy-rush/enemies/skeleton-small.png',
  'pig-small': '/minigames/enemy-rush/enemies/pig-small.png',
  'orc-small': '/minigames/enemy-rush/enemies/orc-small.png',
  'zombie-big': '/minigames/enemy-rush/enemies/zombie-big.png',
  'skeleton-big': '/minigames/enemy-rush/enemies/skeleton-big.png',
  samurai: '/minigames/enemy-rush/enemies/samurai.png',
  'pig-big': '/minigames/enemy-rush/enemies/pig-big.png',
  'orc-big': '/minigames/enemy-rush/enemies/orc-big.png',
  'wizzart-a': '/minigames/enemy-rush/enemies/wizzart-a.png',
  'wizzart-b': '/minigames/enemy-rush/enemies/wizzart-b.png',
  'wizzart-c': '/minigames/enemy-rush/enemies/wizzart-c.png',
  'dark-knight': '/minigames/enemy-rush/enemies/darkknight.png'
};

const BREAK_TARGET_EXPLOSION_SHEET = '/minigames/break-target/target-explosion-sheet.png';
const TARGET_VOXEL_SOURCE_CHARACTER = { voxelProfile: 'image-source' } as CharacterDefinition;

function EnemyRushLayer({ snapshot, reducedMotion }: { snapshot: EnemyRushMiniGameSnapshot; reducedMotion: boolean }) {
  return (
    <group>
      {snapshot.enemies.map((enemy) => (
        <EnemyRushVoxelEnemy key={enemy.id} enemy={enemy} playerFacing={snapshot.player.facing} locked={snapshot.lockedEnemyId === enemy.id} />
      ))}
      {snapshot.coins.map((coin) => (
        <EnemyRushCoin key={coin.id} coin={coin} />
      ))}
      {snapshot.projectiles.map((projectile) => (
        <EnemyRushProjectile key={projectile.id} projectile={projectile} />
      ))}
      {snapshot.explosions.map((explosion) => (
        <BreakTargetExplosion key={explosion.id} explosion={explosion} reducedMotion={reducedMotion} />
      ))}
    </group>
  );
}

function EnemyRushVoxelEnemy({ enemy, playerFacing, locked }: { enemy: EnemyRushRuntime; playerFacing: 1 | -1; locked: boolean }) {
  const [voxels, setVoxels] = useState<ImageVoxel[]>([]);
  const groupRef = useRef<THREE.Group>(null);
  const source = enemyRushAssetByKind[enemy.kind];
  useEffect(() => {
    let canceled = false;
    getCachedImageVoxels(source, TARGET_VOXEL_SOURCE_CHARACTER).then((nextVoxels) => {
      if (!canceled) setVoxels(nextVoxels);
    });
    return () => {
      canceled = true;
    };
  }, [source]);
  useFrame((state) => {
    if (!groupRef.current) return;
    const pulse = enemy.hitFlash > 0 ? Math.sin(state.clock.elapsedTime * 80) * 0.045 : 0;
    const bob = Math.sin(state.clock.elapsedTime * 5 + enemy.position.x) * 0.025;
    groupRef.current.scale.setScalar((enemy.defeated ? 0.001 : enemy.radius * 1.08) + pulse);
    groupRef.current.position.y = bob;
  });
  const parts = useMemo(() => buildVoxelParts(voxels, voxels.length > 520 ? 2 : 1, source), [source, voxels]);
  const outlineStyle = useMemo<FighterOutlineStyle>(() => ({
    enabled: true,
    color: enemy.elite ? '#3b0f17' : '#111318',
    opacity: enemy.elite ? 0.48 : 0.34,
    scale: 1.055
  }), [enemy.elite]);
  const renderStyle = useMemo(() => withDefaultRenderStyle({ castShadow: true, receiveShadow: true }), []);
  if (enemy.defeated) return null;
  return (
    <group ref={groupRef} position={[enemy.position.x, enemy.position.y, enemy.position.z]} rotation={[0, playerFacing >= 0 ? 0 : Math.PI, 0]}>
      {locked && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
          <torusGeometry args={[enemy.radius * 1.15, 0.035, 8, 36]} />
          <meshStandardMaterial color="#8ef9ff" emissive="#35dfff" emissiveIntensity={1.4} roughness={0.28} />
        </mesh>
      )}
      <ImageVoxelPartGroup part={parts.head} groupRef={undefined} outlineStyle={outlineStyle} renderStyle={renderStyle} />
      <ImageVoxelPartGroup part={parts.torso} groupRef={undefined} outlineStyle={outlineStyle} renderStyle={renderStyle} />
      <ImageVoxelPartGroup part={parts.leadArm} groupRef={undefined} outlineStyle={outlineStyle} renderStyle={renderStyle} />
      <ImageVoxelPartGroup part={parts.rearArm} groupRef={undefined} outlineStyle={outlineStyle} renderStyle={renderStyle} />
      <ImageVoxelPartGroup part={parts.leadLeg} groupRef={undefined} outlineStyle={outlineStyle} renderStyle={renderStyle} />
      <ImageVoxelPartGroup part={parts.rearLeg} groupRef={undefined} outlineStyle={outlineStyle} renderStyle={renderStyle} />
    </group>
  );
}

function EnemyRushCoin({ coin }: { coin: EnemyRushMiniGameSnapshot['coins'][number] }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y = state.clock.elapsedTime * 4;
    ref.current.position.y = coin.position.y + Math.sin(state.clock.elapsedTime * 6 + coin.value) * 0.06;
  });
  if (coin.collected) return null;
  return (
    <group ref={ref} position={[coin.position.x, coin.position.y, coin.position.z]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.18, 0.18, 0.07, 18]} />
        <meshStandardMaterial color="#fff06c" emissive="#f5b400" emissiveIntensity={0.8} metalness={0.25} roughness={0.35} />
      </mesh>
      <pointLight color="#fff06c" intensity={0.45} distance={2.2} />
    </group>
  );
}

function EnemyRushProjectile({ projectile }: { projectile: EnemyRushMiniGameSnapshot['projectiles'][number] }) {
  return (
    <group position={[projectile.position.x, projectile.position.y, projectile.position.z]}>
      <mesh castShadow>
        <sphereGeometry args={[projectile.radius, 14, 10]} />
        <meshStandardMaterial color="#ff7048" emissive="#ff2d55" emissiveIntensity={1.4} roughness={0.2} />
      </mesh>
      <pointLight color="#ff7048" intensity={0.75} distance={2.8} />
    </group>
  );
}

function BreakTargetVoxelTarget({ target }: { target: BreakTargetRuntime }) {
  const [voxels, setVoxels] = useState<ImageVoxel[]>([]);
  const groupRef = useRef<THREE.Group>(null);
  const source = breakTargetAssetByTier[target.tier];
  useEffect(() => {
    let canceled = false;
    getCachedImageVoxels(source, TARGET_VOXEL_SOURCE_CHARACTER).then((nextVoxels) => {
      if (!canceled) setVoxels(nextVoxels);
    });
    return () => {
      canceled = true;
    };
  }, [source]);
  useFrame((state) => {
    if (!groupRef.current) return;
    const pulse = target.hitFlash > 0 ? Math.sin(state.clock.elapsedTime * 80) * 0.035 : 0;
    groupRef.current.scale.setScalar((target.destroyed ? 0.001 : target.radius * 0.92) + pulse);
    groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.85 + target.position.x) * 0.18;
  });
  const parts = useMemo(() => buildVoxelParts(voxels, voxels.length > 700 ? 2 : 1, source), [source, voxels]);
  const outlineStyle = useMemo<FighterOutlineStyle>(() => ({
    enabled: true,
    color: '#111318',
    opacity: 0.34,
    scale: 1.045
  }), []);
  const renderStyle = useMemo(() => withDefaultRenderStyle({ castShadow: true, receiveShadow: true }), []);
  if (target.destroyed) return null;
  return (
    <group ref={groupRef} position={[target.position.x, target.position.y - target.height * 0.42, target.position.z]} rotation={[0, Math.PI / 2, 0]}>
      <ImageVoxelPartGroup part={parts.head} groupRef={undefined} outlineStyle={outlineStyle} renderStyle={renderStyle} />
      <ImageVoxelPartGroup part={parts.torso} groupRef={undefined} outlineStyle={outlineStyle} renderStyle={renderStyle} />
      <ImageVoxelPartGroup part={parts.leadArm} groupRef={undefined} outlineStyle={outlineStyle} renderStyle={renderStyle} />
      <ImageVoxelPartGroup part={parts.rearArm} groupRef={undefined} outlineStyle={outlineStyle} renderStyle={renderStyle} />
      <ImageVoxelPartGroup part={parts.leadLeg} groupRef={undefined} outlineStyle={outlineStyle} renderStyle={renderStyle} />
      <ImageVoxelPartGroup part={parts.rearLeg} groupRef={undefined} outlineStyle={outlineStyle} renderStyle={renderStyle} />
    </group>
  );
}

function BreakTargetExplosion({ explosion, reducedMotion }: { explosion: BreakTargetMiniGameSnapshot['explosions'][number]; reducedMotion: boolean }) {
  const texture = useLoader(THREE.TextureLoader, BREAK_TARGET_EXPLOSION_SHEET);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  useEffect(() => {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(1 / 6, 1);
    texture.needsUpdate = true;
  }, [texture]);
  useFrame(() => {
    groupRef.current?.lookAt(camera.position);
    if (!materialRef.current) return;
    const progress = THREE.MathUtils.clamp(explosion.age / Math.max(0.001, explosion.duration), 0, 0.999);
    texture.offset.x = Math.floor(progress * 6) / 6;
    materialRef.current.opacity = reducedMotion ? 0.72 : Math.max(0, 1 - progress * 0.35);
  });
  const progress = THREE.MathUtils.clamp(explosion.age / Math.max(0.001, explosion.duration), 0, 1);
  return (
    <group ref={groupRef} position={[explosion.position.x, explosion.position.y, explosion.position.z + 0.05]} scale={[1.35 + progress * 0.75, 1.35 + progress * 0.75, 1]}>
      <mesh renderOrder={52}>
        <planeGeometry args={[1.8, 1.8]} />
        <meshBasicMaterial
          ref={materialRef}
          map={texture}
          transparent
          alphaTest={0.04}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

const AnimeColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1 },
    uContrast: { value: 1 },
    uBrightness: { value: 1 },
    uWarmth: { value: 0 },
    uVignetteStrength: { value: 0 },
    uVignetteRadius: { value: 0.8 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uBrightness;
    uniform float uWarmth;
    uniform float uVignetteStrength;
    uniform float uVignetteRadius;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb;
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, uSaturation);
      color = (color - 0.5) * uContrast + 0.5;
      color *= uBrightness;
      color += vec3(uWarmth * 0.08, abs(uWarmth) * 0.018, -uWarmth * 0.065);
      float dist = distance(vUv, vec2(0.5));
      float vignette = smoothstep(uVignetteRadius, uVignetteRadius - 0.35, dist);
      color *= mix(1.0 - uVignetteStrength, 1.0, vignette);
      gl_FragColor = vec4(color, texel.a);
    }
  `
};

function StageVisualStyleRig({
  stage,
  fighters,
  preview = false
}: {
  stage: StageDefinition;
  fighters?: [FighterRuntime, FighterRuntime] | FighterRuntime[];
  preview?: boolean;
}) {
  const style = resolveStageVisualStyle(stage);
  const previewScale = preview ? 0.82 : 1;
  const modelStage = isModelStage(stage);
  const fogNear = modelStage ? Math.max(style.lighting.fogNear, preview ? 80 : 44) : style.lighting.fogNear;
  const fogFar = modelStage ? Math.max(style.lighting.fogFar, preview ? 620 : 260) : style.lighting.fogFar;

  const [fighterA, fighterB] = fighters ?? [];
  return (
    <>
      <color attach="background" args={[style.lighting.backgroundColor]} />
      {modelStage ? null : <fog attach="fog" args={[style.lighting.fogColor, fogNear, fogFar]} />}
      {style.lighting.ambientMode === 'hemisphere' ? (
        <hemisphereLight color={style.lighting.skyColor} groundColor={style.lighting.groundColor} intensity={style.lighting.hemiIntensity * previewScale} />
      ) : (
        <ambientLight color={style.lighting.skyColor} intensity={style.lighting.ambientIntensity * previewScale} />
      )}
      <directionalLight
        castShadow={!preview}
        position={style.lighting.keyPosition}
        color={style.lighting.keyColor}
        intensity={style.lighting.keyIntensity * previewScale}
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={style.lighting.fillPosition} color={style.lighting.fillColor} intensity={style.lighting.fillIntensity * previewScale} />
      <directionalLight position={style.lighting.rimPosition} color={style.lighting.rimColor} intensity={style.lighting.rimIntensity * previewScale} />
      {fighterA && <pointLight position={[-4, 2.15, -3]} color={fighterA.character.colors.primary} intensity={style.lighting.accentIntensity * previewScale} distance={style.lighting.accentDistance} />}
      {fighterB && <pointLight position={[4, 2.15, 3]} color={fighterB.character.colors.primary} intensity={style.lighting.accentIntensity * previewScale} distance={style.lighting.accentDistance} />}
    </>
  );
}

function StagePostProcessing({
  stage,
  reducedMotion
}: {
  stage: StageDefinition;
  reducedMotion: boolean;
}) {
  const { gl, scene, camera, size } = useThree();
  const style = useMemo(() => resolveStageVisualStyle(stage), [stage]);
  const disabled = reducedMotion || !style.post.enabled || size.width < 420 || size.height < 280;
  const composerSetup = useMemo(() => {
    if (disabled) return null;
    const composer = new EffectComposer(gl);
    const renderPass = new RenderPass(scene, camera);
    const gradePass = new ShaderPass(AnimeColorGradeShader);
    gradePass.uniforms.uSaturation.value = style.post.saturation;
    gradePass.uniforms.uContrast.value = style.post.contrast;
    gradePass.uniforms.uBrightness.value = style.post.brightness;
    gradePass.uniforms.uWarmth.value = style.post.warmth;
    gradePass.uniforms.uVignetteStrength.value = style.post.vignetteStrength;
    gradePass.uniforms.uVignetteRadius.value = style.post.vignetteRadius;
    composer.addPass(renderPass);
    composer.addPass(gradePass);
    composer.addPass(new OutputPass());
    return { composer, gradePass };
  }, [camera, disabled, gl, scene, size.height, size.width, style]);

  useEffect(() => {
    if (!composerSetup) return undefined;
    const previousToneMapping = gl.toneMapping;
    const previousExposure = gl.toneMappingExposure;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1;
    return () => {
      composerSetup.composer.dispose();
      gl.toneMapping = previousToneMapping;
      gl.toneMappingExposure = previousExposure;
    };
  }, [composerSetup, gl]);

  useEffect(() => {
    composerSetup?.composer.setSize(size.width, size.height);
  }, [composerSetup, size.height, size.width]);

  useFrame((_, delta) => {
    if (!composerSetup) return;
    composerSetup.composer.render(delta);
  }, disabled ? 0 : 1);

  return null;
}

const SHADOW_CLONE_SMOKE_PATH = '/effects/shadow-clone-smoke.png';
const SHADOW_CLONE_SMOKE_COLUMNS = 4;
const SHADOW_CLONE_SMOKE_ROWS = 3;
const SHADOW_CLONE_SMOKE_TOTAL_FRAMES = SHADOW_CLONE_SMOKE_COLUMNS * SHADOW_CLONE_SMOKE_ROWS;
const SHADOW_CLONE_SMOKE_MAX_RUNTIME_FRAMES = 24;
const PROJECTILE_VISUAL_FRONT_BIAS = 0.12;
const PROJECTILE_REVEAL_FRAMES = 10;
const PROJECTILE_REVEAL_MIN_SCALE = 0.16;
const PROJECTILE_REVEAL_FORWARD_OFFSET = 0.42;

function TransformEffectLayer({ fighter }: { fighter: FighterRuntime }) {
  const active = fighter.state === 'transform' || fighter.transformSmokeFrames > 0;
  if (!active) return null;
  const startupProgress = fighter.state === 'transform'
    ? 1 - Math.max(0, Math.min(90, fighter.transformStartupFrames)) / 90
    : 1;
  const smokeFrames = fighter.state === 'transform' ? Math.max(fighter.transformSmokeFrames, 12) : fighter.transformSmokeFrames;
  return (
    <group position={[fighter.position.x, fighter.position.y, fighter.position.z]}>
      <pointLight color={fighter.character.colors.accent} intensity={4 + startupProgress * 8} distance={4.8} position={[0, 1.12, 0]} />
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.1 + startupProgress * 0.9, 1.1 + startupProgress * 0.9, 1]}>
        <ringGeometry args={[0.55, 0.7, 64]} />
        <meshBasicMaterial color={fighter.character.colors.accent} transparent opacity={0.26 + startupProgress * 0.28} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 1.05, 0]} scale={[0.75 + startupProgress * 0.35, 1.55, 0.75 + startupProgress * 0.35]}>
        <sphereGeometry args={[1, 32, 16]} />
        <meshBasicMaterial color={fighter.character.colors.primary} transparent opacity={0.12 + startupProgress * 0.16} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {smokeFrames > 0 && <TransformSmoke framesRemaining={smokeFrames} />}
    </group>
  );
}

function TransformSmoke({ framesRemaining }: { framesRemaining: number }) {
  const sourceTexture = useLoader(THREE.TextureLoader, SHADOW_CLONE_SMOKE_PATH);
  const texture = useMemo(() => sourceTexture.clone(), [sourceTexture]);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const elapsed = SHADOW_CLONE_SMOKE_MAX_RUNTIME_FRAMES - Math.max(0, Math.min(SHADOW_CLONE_SMOKE_MAX_RUNTIME_FRAMES, framesRemaining));
  const frameIndex = Math.max(0, Math.min(SHADOW_CLONE_SMOKE_TOTAL_FRAMES - 1, Math.floor((elapsed / SHADOW_CLONE_SMOKE_MAX_RUNTIME_FRAMES) * SHADOW_CLONE_SMOKE_TOTAL_FRAMES)));
  const opacity = Math.max(0.18, Math.min(0.82, framesRemaining / Math.max(1, SHADOW_CLONE_SMOKE_MAX_RUNTIME_FRAMES)));
  useEffect(() => {
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1 / SHADOW_CLONE_SMOKE_COLUMNS, 1 / SHADOW_CLONE_SMOKE_ROWS);
  }, [texture]);
  useEffect(() => {
    const column = frameIndex % SHADOW_CLONE_SMOKE_COLUMNS;
    const row = Math.floor(frameIndex / SHADOW_CLONE_SMOKE_COLUMNS);
    texture.offset.set(column / SHADOW_CLONE_SMOKE_COLUMNS, 1 - (row + 1) / SHADOW_CLONE_SMOKE_ROWS);
    texture.needsUpdate = true;
    if (materialRef.current) materialRef.current.opacity = opacity;
  }, [frameIndex, opacity, texture]);

  return (
    <mesh position={[0, 0.9, 0.02]} scale={[1.45, 1.45, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        ref={materialRef}
        map={texture}
        transparent
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function ShadowCloneLayer({
  fighter,
  timeScale,
  stage,
  renderStyle,
  preferProcedural = false
}: {
  fighter: FighterRuntime;
  timeScale: number;
  stage?: StageDefinition;
  renderStyle?: Partial<FighterRenderStyle>;
  preferProcedural?: boolean;
}) {
  const clone = fighter.shadowClone;
  if (!clone) return null;
  const cloneFighter = clone.phase === 'active' ? makeShadowCloneRenderFighter(fighter) : null;
  const showSmoke = clone.spawnSmokeFrames > 0 || clone.vanishSmokeFrames > 0;
  return (
    <>
      {cloneFighter ? <FighterRig fighter={cloneFighter} timeScale={timeScale} stage={stage} renderStyle={renderStyle} preferProcedural={preferProcedural} /> : null}
      {showSmoke ? <ShadowCloneSmoke clone={clone} /> : null}
    </>
  );
}

function makeShadowCloneRenderFighter(fighter: FighterRuntime): FighterRuntime | null {
  const clone = fighter.shadowClone;
  if (!clone || clone.phase !== 'active') return null;
  return {
    ...fighter,
    hp: 1,
    ki: 0,
    position: { ...clone.position },
    velocityY: clone.velocityY,
    facing: clone.facing,
    facingYaw: clone.facingYaw,
    state: clone.state,
    currentMove: clone.currentMove,
    moveInstanceId: clone.moveInstanceId,
    actionTimer: clone.actionFramesRemaining / 60,
    actionFramesRemaining: clone.actionFramesRemaining,
    moveFrame: clone.moveFrame,
    hitConnected: clone.hitConnected,
    hitConfirmed: false,
    blockFlash: 0,
    hitFlash: 0,
    visualHitstop: { ...clone.visualHitstop },
    shadowClone: null,
    shadowCloneChargeConsumed: true
  };
}

function ShadowCloneSmoke({ clone }: { clone: NonNullable<FighterRuntime['shadowClone']> }) {
  const sourceTexture = useLoader(THREE.TextureLoader, SHADOW_CLONE_SMOKE_PATH);
  const texture = useMemo(() => sourceTexture.clone(), [sourceTexture]);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const activeFrames = clone.vanishSmokeFrames > 0 ? clone.vanishSmokeFrames : clone.spawnSmokeFrames;
  const elapsed = SHADOW_CLONE_SMOKE_MAX_RUNTIME_FRAMES - Math.max(0, Math.min(SHADOW_CLONE_SMOKE_MAX_RUNTIME_FRAMES, activeFrames));
  const frameIndex = Math.max(0, Math.min(SHADOW_CLONE_SMOKE_TOTAL_FRAMES - 1, Math.floor((elapsed / SHADOW_CLONE_SMOKE_MAX_RUNTIME_FRAMES) * SHADOW_CLONE_SMOKE_TOTAL_FRAMES)));
  const opacity = clone.vanishSmokeFrames > 0 ? Math.max(0.18, clone.vanishSmokeFrames / SHADOW_CLONE_SMOKE_MAX_RUNTIME_FRAMES) : Math.min(0.88, 0.28 + elapsed / SHADOW_CLONE_SMOKE_MAX_RUNTIME_FRAMES);
  useEffect(() => {
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1 / SHADOW_CLONE_SMOKE_COLUMNS, 1 / SHADOW_CLONE_SMOKE_ROWS);
  }, [texture]);
  useEffect(() => {
    const column = frameIndex % SHADOW_CLONE_SMOKE_COLUMNS;
    const row = Math.floor(frameIndex / SHADOW_CLONE_SMOKE_COLUMNS);
    texture.offset.set(column / SHADOW_CLONE_SMOKE_COLUMNS, 1 - (row + 1) / SHADOW_CLONE_SMOKE_ROWS);
    texture.needsUpdate = true;
    if (materialRef.current) materialRef.current.opacity = opacity;
  }, [frameIndex, opacity, texture]);

  return (
    <mesh position={[clone.position.x, clone.position.y + 0.82, clone.position.z + 0.02]} scale={[1.25, 1.25, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        ref={materialRef}
        map={texture}
        transparent
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function ImpactSparkLayer({
  events,
  settings,
  reducedMotion
}: {
  events: ImpactSparkEvent[];
  settings: GameSettings['display']['impactSparks'];
  reducedMotion: boolean;
}) {
  if (!settings.enabled) {
    const blockEvents = events.filter((event) => event.kind === 'block').slice(-4);
    if (blockEvents.length === 0) return null;
    return (
      <group>
        {blockEvents.map((event) => (
          <ImpactSpark key={event.id} event={event} settings={settings} reducedMotion={reducedMotion} shieldOnly />
        ))}
      </group>
    );
  }
  return (
    <group>
      {events.slice(-8).map((event) => (
        <ImpactSpark key={event.id} event={event} settings={settings} reducedMotion={reducedMotion} />
      ))}
    </group>
  );
}

function TornadoRibbonLayer({
  events,
  fighters,
  reducedMotion
}: {
  events: ImpactSparkEvent[];
  fighters: FighterRuntime[];
  reducedMotion: boolean;
}) {
  const tornadoEvents = events.filter((event) => event.tornado).slice(-4);
  if (tornadoEvents.length === 0) return null;
  return (
    <group>
      {tornadoEvents.map((event) => {
        const defender = fighters.find((fighter) => fighter.slot === event.defenderSlot);
        return defender ? <TornadoRibbonEffect key={event.id} event={event} defender={defender} reducedMotion={reducedMotion} /> : null;
      })}
    </group>
  );
}

function TornadoRibbonEffect({
  event,
  defender,
  reducedMotion
}: {
  event: ImpactSparkEvent;
  defender: FighterRuntime;
  reducedMotion: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const ribbonAxisRef = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const ageRef = useRef(0);
  const spinRef = useRef(0);
  const characterScale = getCharacterGlobalScale(defender.character);
  const height = THREE.MathUtils.clamp(1.55 * characterScale.height, 0.95, 2.35);
  const radius = THREE.MathUtils.clamp(0.23 * characterScale.width, 0.16, 0.38);
  const ribbonCount = reducedMotion ? 3 : 7;
  const duration = reducedMotion ? 0.38 : 0.72;
  const ribbons = useMemo(
    () => Array.from({ length: ribbonCount }, (_, index) => ({
      geometry: makeTornadoRibbonGeometry(
        radius * (0.72 + index * 0.08),
        height * (0.86 + seededUnit(event.id + 17, index) * 0.22),
        1.08 + index * 0.13,
        event.id * 0.37 + index * 1.41,
        88
      ),
      color: index % 3 === 0 ? '#ffffff' : index % 2 === 0 ? '#d6fbff' : '#64d7ff',
      opacity: index % 3 === 0 ? 0.68 : index % 2 === 0 ? 0.54 : 0.4,
      spin: (index % 2 === 0 ? 1 : -1) * (2.55 + index * 0.24),
      yOffset: -height * 0.05 + seededUnit(event.id + 31, index) * height * 0.12
    })),
    [event.id, height, radius, ribbonCount]
  );
  useEffect(() => {
    return () => {
      ribbons.forEach((ribbon) => ribbon.geometry.dispose());
    };
  }, [ribbons]);
  const particles = useMemo(
    () => Array.from({ length: reducedMotion ? 8 : 34 }, (_, index) => {
      const angle = index * 2.399 + seededUnit(event.id + 47, index) * 0.8;
      const particleRadius = radius * (0.38 + seededUnit(event.id + 59, index) * 1.55);
      const hitDirection = impactDirectionSign(event);
      const outward = 0.45 + seededUnit(event.id + 103, index) * 1.25;
      const lift = 0.8 + seededUnit(event.id + 109, index) * 1.65;
      const forward = hitDirection * (0.26 + seededUnit(event.id + 113, index) * 0.85);
      const swirl = seededUnit(event.id + 127, index) > 0.5 ? 1 : -1;
      return {
        x: Math.cos(angle) * particleRadius,
        z: Math.sin(angle) * particleRadius,
        y: height * (0.04 + seededUnit(event.id + 71, index) * 0.94),
        phase: angle,
        scale: 0.014 + seededUnit(event.id + 83, index) * 0.024,
        opacity: 0.36 + seededUnit(event.id + 97, index) * 0.36,
        vx: Math.cos(angle) * outward + forward,
        vy: lift,
        vz: Math.sin(angle) * outward + swirl * 0.22,
        drag: 0.72 + seededUnit(event.id + 131, index) * 0.18
      };
    }),
    [event, height, radius, reducedMotion]
  );
  const impactRings = useMemo(
    () => Array.from({ length: reducedMotion ? 1 : 3 }, (_, index) => ({
      y: height * (0.18 + index * 0.26),
      baseRadius: radius * (1.25 + index * 0.34),
      tube: 0.026 + index * 0.006,
      opacity: 0.68 - index * 0.1,
      delay: index * 0.09,
      color: index === 1 ? '#ffffff' : '#8be8ff'
    })),
    [height, radius, reducedMotion]
  );

  useFrame((_, delta) => {
    ageRef.current += delta;
    const progress = THREE.MathUtils.clamp(ageRef.current / duration, 0, 1);
    const fade = Math.pow(1 - progress, 1.35);
    const root = groupRef.current;
    if (!root) return;
    root.visible = progress < 1;
    root.rotation.set(-0.85, defender.facingYaw, defender.facing * 0.08);
    const bodyCenter = new THREE.Vector3(0, height * 0.52, 0).applyEuler(root.rotation);
    root.position.set(defender.position.x + bodyCenter.x, defender.position.y + bodyCenter.y, defender.position.z + bodyCenter.z);
    spinRef.current += delta * (reducedMotion ? 1.15 : 2.35);
    if (ribbonAxisRef.current) ribbonAxisRef.current.rotation.y = spinRef.current;
    root.scale.setScalar(0.88 + Math.sin(progress * Math.PI) * 0.12);
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      materials.forEach((material) => {
        if (!('opacity' in material)) return;
        const typed = material as THREE.Material & { opacity: number; userData: { baseOpacity?: number } };
        if (typed.userData.baseOpacity === undefined) typed.userData.baseOpacity = typed.opacity;
      typed.opacity = typed.userData.baseOpacity * Math.max(0.28, fade);
      });
    });
    if (lightRef.current) {
      lightRef.current.position.y = height * 0.5;
      lightRef.current.intensity = reducedMotion ? 0 : 1.65 * fade;
    }
  });

  return (
    <group ref={groupRef} renderOrder={36}>
      {!reducedMotion && <pointLight ref={lightRef} color="#8eeaff" intensity={0} distance={2.2} />}
      <group ref={ribbonAxisRef} position={[0, -height * 0.5, 0]}>
        {ribbons.map((ribbon, index) => (
          <mesh key={`tornado-ribbon-${event.id}-${index}`} geometry={ribbon.geometry} position={[0, ribbon.yOffset, 0]} rotation={[0, ribbon.spin * 0.08, 0]}>
            <meshBasicMaterial color={ribbon.color} transparent opacity={ribbon.opacity} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        ))}
        {impactRings.map((ring, index) => {
          const ringProgress = THREE.MathUtils.clamp((ageRef.current / duration - ring.delay) / 0.58, 0, 1);
          const ringScale = 1 + Math.sin(ringProgress * Math.PI) * 0.36 + ringProgress * 0.28;
          const ringOpacity = ring.opacity * Math.max(0, 1 - ringProgress);
          return (
            <mesh key={`tornado-ring-${event.id}-${index}`} position={[0, ring.y, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[ringScale, ringScale, 1]}>
              <ringGeometry args={[ring.baseRadius, ring.baseRadius + ring.tube, 80]} />
              <meshBasicMaterial color={ring.color} transparent opacity={ringOpacity} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
            </mesh>
          );
        })}
        {!reducedMotion && (
          <mesh position={[0, height * 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[radius * 1.45, radius * 1.62, 48]} />
            <meshBasicMaterial color="#dffcff" transparent opacity={0.26} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        )}
        {particles.map((particle, index) => (
          <TornadoRibbonParticle key={`tornado-particle-${event.id}-${index}`} particle={particle} index={index} ageRef={ageRef} duration={duration} />
        ))}
      </group>
    </group>
  );
}

type TornadoRibbonParticleSpec = {
  x: number;
  y: number;
  z: number;
  phase: number;
  scale: number;
  opacity: number;
  vx: number;
  vy: number;
  vz: number;
  drag: number;
};

function TornadoRibbonParticle({
  particle,
  index,
  ageRef,
  duration
}: {
  particle: TornadoRibbonParticleSpec;
  index: number;
  ageRef: MutableRefObject<number>;
  duration: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const age = Math.max(0, ageRef.current);
    const progress = THREE.MathUtils.clamp(age / duration, 0, 1);
    const travel = Math.sin(progress * Math.PI * 0.72);
    const swirl = Math.sin(age * 12 + particle.phase) * 0.05 * (1 - progress);
    mesh.position.set(
      particle.x + particle.vx * travel * particle.drag + swirl,
      particle.y + particle.vy * travel - progress * progress * 0.24,
      particle.z + particle.vz * travel - swirl * 0.65
    );
    mesh.scale.setScalar(particle.scale * (1 + progress * 0.72));
    const material = mesh.material as THREE.MeshBasicMaterial;
    material.opacity = particle.opacity * Math.max(0, 1 - progress * 0.82);
  });
  return (
    <mesh ref={meshRef} position={[particle.x, particle.y, particle.z]} scale={particle.scale}>
      <sphereGeometry args={[1, 8, 6]} />
      <meshBasicMaterial color={index % 3 === 0 ? '#ffffff' : index % 2 === 0 ? '#eaffff' : '#7edcff'} transparent opacity={particle.opacity} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function makeTornadoRibbonGeometry(radius: number, height: number, turns: number, phase: number, segments: number) {
  const points = Array.from({ length: segments }, (_, index) => {
    const u = index / Math.max(1, segments - 1);
    const angle = u * Math.PI * 2 * turns + phase;
    const taperedRadius = radius * (0.72 + Math.sin(u * Math.PI) * 0.34);
    return new THREE.Vector3(Math.cos(angle) * taperedRadius, u * height, Math.sin(angle) * taperedRadius);
  });
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, 0.012, 6, false);
}

function ImpactSpark({
  event,
  settings,
  reducedMotion,
  shieldOnly = false
}: {
  event: ImpactSparkEvent;
  settings: GameSettings['display']['impactSparks'];
  reducedMotion: boolean;
  shieldOnly?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Group>(null);
  const shardRef = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const ageRef = useRef(0);
  const isBlock = event.kind === 'block';
  const isLauncher = Boolean(event.launched || event.juggled || event.tornado);
  const isClash = event.kind === 'clash';
  const colors = useMemo(() => resolveImpactSparkColors(event, settings), [event, settings]);
  const profile = useMemo(() => resolveImpactSparkProfile(event), [event]);
  const seed = event.id * 17 + event.attackerSlot * 101 + event.defenderSlot * 211;
  const cinematic = settings.cinematic && !shieldOnly;
  const duration = reducedMotion ? profile.reducedDuration : profile.duration;
  const showRings = !shieldOnly && (settings.shape === 'burst' || settings.shape === 'ring' || isBlock || isLauncher || isClash);
  const showShards = cinematic && settings.shape === 'shards';
  const showSlashes = cinematic && settings.shape === 'shards';
  const showParticles = cinematic && (settings.shape !== 'ring' || isBlock || isLauncher || isClash);
  const showAfterimage = cinematic && settings.shape === 'burst' && profile.ghost && !reducedMotion;

  useFrame(({ camera }, delta) => {
    ageRef.current += delta;
    const progress = THREE.MathUtils.clamp(ageRef.current / duration, 0, 1);
    const root = groupRef.current;
    if (!root) return;
    root.visible = progress < 1;
    root.lookAt(camera.position);
    const expansion = 1 + progress * (reducedMotion ? 0.42 : profile.expansion);
    const baseScale = settings.size * profile.scale * 0.4;
    root.scale.setScalar(baseScale * expansion);
    const sparkEase = Math.sin(progress * Math.PI);
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      materials.forEach((rawMaterial) => {
        if (!('opacity' in rawMaterial)) return;
        const material = rawMaterial as THREE.Material & { opacity: number; userData: { baseOpacity?: number; fadeBias?: number } };
        if (material.userData.baseOpacity === undefined) material.userData.baseOpacity = material.opacity;
        const fadeBias = material.userData.fadeBias ?? 1;
        material.opacity = THREE.MathUtils.clamp(material.userData.baseOpacity * Math.pow(1 - progress, fadeBias) * settings.intensity, 0, 1);
      });
    });
    if (ringRef.current) ringRef.current.rotation.z += delta * profile.spin;
    if (shardRef.current) shardRef.current.rotation.z -= delta * profile.spin * 0.24;
    if (lightRef.current) {
      lightRef.current.intensity = profile.lightIntensity * settings.intensity * Math.pow(1 - progress, 1.65) * (reducedMotion ? 0.42 : 1);
      lightRef.current.distance = 2.4 + profile.scale * 3.2 + sparkEase * 1.2;
    }
  });

  return (
    <group ref={groupRef} position={event.position}>
      {cinematic && <pointLight ref={lightRef} color={colors.light} intensity={0} distance={4.4} />}
      {isBlock && <ImpactBlockShield event={event} colors={colors} profile={profile} />}
      {showAfterimage && <ImpactAfterimage event={event} colors={colors} profile={profile} />}
      {showRings && <ImpactEnergyRings refGroup={ringRef} event={event} colors={colors} profile={profile} ringOnly={settings.shape === 'ring'} />}
      {showSlashes && !reducedMotion && <ImpactSlashStreaks event={event} colors={colors} profile={profile} seed={seed + 37} />}
      {showParticles && <ImpactSphereParticles event={event} colors={colors} profile={profile} seed={seed + 53} reducedMotion={reducedMotion} />}
      {showShards && <ImpactShardBurst refGroup={shardRef} event={event} colors={colors} profile={profile} seed={seed + 71} reducedMotion={reducedMotion} />}
      {!shieldOnly && <ImpactCore colors={colors} profile={profile} />}
    </group>
  );
}

type ImpactSparkColors = {
  base: string;
  edge: string;
  core: string;
  light: string;
};

type ImpactSparkProfile = {
  duration: number;
  reducedDuration: number;
  scale: number;
  expansion: number;
  spin: number;
  ringX: number;
  ringY: number;
  coreScale: number;
  discScale: number;
  shardCount: number;
  particleCount: number;
  slashCount: number;
  lightIntensity: number;
  ghost: boolean;
};

function ImpactCore({ colors, profile }: { colors: ImpactSparkColors; profile: ImpactSparkProfile }) {
  return (
    <group renderOrder={34}>
      <mesh scale={[profile.discScale * 1.15, profile.discScale * 0.84, 1]}>
        <circleGeometry args={[0.42, 64]} />
        <meshBasicMaterial color={colors.core} transparent opacity={0.42} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh scale={[profile.coreScale * 1.45, profile.coreScale * 1.05, 1]}>
        <torusGeometry args={[0.64, 0.055, 8, 36]} />
        <meshBasicMaterial color={colors.base} transparent opacity={0.46} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh scale={[profile.coreScale * 2.1, profile.coreScale * 1.45, 1]}>
        <torusGeometry args={[0.66, 0.025, 8, 44]} />
        <meshBasicMaterial color={colors.edge} transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function ImpactEnergyRings({
  refGroup,
  event,
  colors,
  profile,
  ringOnly
}: {
  refGroup: RefObject<THREE.Group>;
  event: ImpactSparkEvent;
  colors: ImpactSparkColors;
  profile: ImpactSparkProfile;
  ringOnly: boolean;
}) {
  const isBlock = event.kind === 'block';
  const isLauncher = Boolean(event.launched || event.juggled || event.tornado);
  const isClash = event.kind === 'clash';
  return (
    <group ref={refGroup} renderOrder={30} rotation={[isLauncher ? -0.12 : isBlock ? 0.08 : 0, 0, isBlock ? 0.18 : 0]}>
      <mesh scale={[profile.ringX, profile.ringY, 1]}>
        <torusGeometry args={[isClash ? 0.72 : isLauncher ? 0.64 : isBlock ? 0.5 : 0.58, isBlock ? 0.028 : ringOnly ? 0.04 : 0.052, 8, 72]} />
        <meshBasicMaterial color={colors.base} transparent opacity={ringOnly ? 0.72 : isLauncher ? 0.46 : 0.58} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {!ringOnly && (
        <mesh scale={[profile.ringX * 1.25, profile.ringY * 1.18, 1]}>
          <torusGeometry args={[isLauncher ? 0.74 : isBlock ? 0.62 : 0.68, 0.018, 8, 72]} />
          <meshBasicMaterial color={colors.edge} transparent opacity={isBlock ? 0.24 : isLauncher ? 0.22 : 0.32} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      {!ringOnly && (
        <mesh scale={[profile.ringX * 1.72, profile.ringY * 1.45, 1]}>
          <torusGeometry args={[isClash ? 0.82 : isBlock ? 0.66 : 0.76, 0.012, 8, 84]} />
          <meshBasicMaterial color={colors.core} transparent opacity={isBlock ? 0.12 : 0.18} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

function ImpactBlockShield({
  event,
  colors,
  profile
}: {
  event: ImpactSparkEvent;
  colors: ImpactSparkColors;
  profile: ImpactSparkProfile;
}) {
  const side = impactDirectionSign(event);
  return (
    <group position={[side * 0.08, 0, 0]} renderOrder={29}>
      <mesh scale={[0.42 * profile.ringX, 1.02 * profile.ringY, 1.02 * profile.ringY]}>
        <sphereGeometry args={[0.78, 56, 22]} />
        <meshBasicMaterial color={colors.base} transparent opacity={0.28} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh scale={[0.5 * profile.ringX, 1.18 * profile.ringY, 1.18 * profile.ringY]}>
        <sphereGeometry args={[0.78, 56, 22]} />
        <meshBasicMaterial color={colors.edge} transparent opacity={0.13} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} wireframe />
      </mesh>
    </group>
  );
}

function ImpactSlashStreaks({
  event,
  colors,
  profile,
  seed
}: {
  event: ImpactSparkEvent;
  colors: ImpactSparkColors;
  profile: ImpactSparkProfile;
  seed: number;
}) {
  const count = profile.slashCount;
  const side = impactDirectionSign(event);
  return (
    <group renderOrder={38}>
      {makeSparkDirections(seed, count).map((direction, index) => {
        const tint = index % 3 === 0 ? colors.core : index % 2 === 0 ? colors.edge : colors.base;
        return (
          <mesh
            key={`slash-${index}`}
            position={[side * (0.02 + seededUnit(seed + 3, index) * 0.09), direction[1] * 0.06, direction[0] * 0.02]}
            rotation={[0, 0, direction[3] + seededUnit(seed + 9, index) * Math.PI]}
            scale={[0.54 + direction[4] * 0.18, 0.28 + seededUnit(seed + 19, index) * 0.18, 1]}
          >
            <torusGeometry args={[0.5, 0.018, 8, 32, Math.PI * (0.5 + seededUnit(seed + 29, index) * 0.45)]} />
            <meshBasicMaterial color={tint} transparent opacity={0.42} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
    </group>
  );
}

function ImpactSphereParticles({
  event,
  colors,
  profile,
  seed,
  reducedMotion
}: {
  event: ImpactSparkEvent;
  colors: ImpactSparkColors;
  profile: ImpactSparkProfile;
  seed: number;
  reducedMotion: boolean;
}) {
  const side = impactDirectionSign(event);
  const count = reducedMotion ? Math.min(18, Math.ceil(profile.particleCount * 0.28)) : profile.particleCount;
  return (
    <group renderOrder={37}>
      {makeSparkDirections(seed, count).map((direction, index) => {
        const forward = event.kind === 'block' ? -side * Math.abs(direction[0]) : side * Math.abs(direction[0]);
        const x = forward * (0.16 + seededUnit(seed + 5, index) * 0.28);
        const y = direction[1] * (0.24 + seededUnit(seed + 13, index) * 0.18);
        const z = (seededUnit(seed + 17, index) - 0.5) * 0.24;
        const size = 0.34 + direction[4] * (event.kind === 'block' ? 0.42 : 0.62);
        const tint = index % 5 === 0 ? colors.core : index % 2 === 0 ? colors.edge : colors.base;
        return (
          <mesh key={`particle-${index}`} position={[x, y, z]} scale={size}>
            <sphereGeometry args={[0.045, 8, 6]} />
            <meshBasicMaterial color={tint} transparent opacity={event.kind === 'block' ? 0.72 : 0.82} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

function ImpactShardBurst({
  refGroup,
  event,
  colors,
  profile,
  seed,
  reducedMotion
}: {
  refGroup: RefObject<THREE.Group>;
  event: ImpactSparkEvent;
  colors: ImpactSparkColors;
  profile: ImpactSparkProfile;
  seed: number;
  reducedMotion: boolean;
}) {
  const side = impactDirectionSign(event);
  const count = reducedMotion ? Math.min(14, Math.ceil(profile.shardCount * 0.34)) : profile.shardCount;
  return (
    <group ref={refGroup} renderOrder={36}>
      {makeSparkDirections(seed, count).map((direction, index) => {
        const blockBias = event.kind === 'block' ? -side * (0.08 + Math.abs(direction[0]) * 0.18) : side * direction[0] * 0.16;
        const x = blockBias + direction[0] * 0.08;
        const y = direction[1] * (event.kind === 'block' ? 0.22 : 0.18);
        const tint = index % 4 === 0 ? colors.core : index % 3 === 0 ? colors.edge : colors.base;
        return (
          <mesh
            key={`shard-${index}`}
            position={[x, y, direction[2]]}
            rotation={[0, 0, direction[3]]}
            scale={[0.24 + direction[4] * 0.22, 0.022 + seededUnit(seed + 43, index) * 0.026, 0.022]}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color={tint} transparent opacity={event.kind === 'block' ? 0.46 : 0.58} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

function ImpactAfterimage({
  event,
  colors,
  profile
}: {
  event: ImpactSparkEvent;
  colors: ImpactSparkColors;
  profile: ImpactSparkProfile;
}) {
  const side = impactDirectionSign(event);
  return (
    <group renderOrder={27}>
      {[0, 1].map((index) => (
        <mesh
          key={`afterimage-${index}`}
          position={[side * (0.24 + index * 0.12), 0.06 - index * 0.03, -0.04 * index]}
          scale={[0.18 + index * 0.05, 0.56 + profile.scale * 0.12, 1]}
          rotation={[0, 0, side * (-0.1 - index * 0.06)]}
        >
          <circleGeometry args={[0.52, 36]} />
          <meshBasicMaterial color={index === 0 ? colors.edge : colors.base} transparent opacity={0.14 - index * 0.04} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function resolveImpactSparkColors(event: ImpactSparkEvent, settings: GameSettings['display']['impactSparks']): ImpactSparkColors {
  if (event.kind === 'block') {
    return {
      base: settings.blockColor,
      edge: '#dff8ff',
      core: '#ffffff',
      light: settings.blockColor
    };
  }
  if (event.kind === 'clash' || event.kiBurst) {
    return {
      base: '#7fdfff',
      edge: settings.hitColor,
      core: '#ffffff',
      light: '#9ff2ff'
    };
  }
  if (event.kind === 'counterHit') {
    return {
      base: '#ffe96a',
      edge: '#ff3159',
      core: '#ffffff',
      light: '#ff3159'
    };
  }
  if (event.kind === 'punish' || event.kind === 'whiffPunish') {
    return {
      base: settings.hitColor,
      edge: '#ff5f45',
      core: '#fff5d6',
      light: '#ff7a45'
    };
  }
  return {
    base: settings.hitColor,
    edge: '#ffd875',
    core: '#ffffff',
    light: settings.hitColor
  };
}

function resolveImpactSparkProfile(event: ImpactSparkEvent): ImpactSparkProfile {
  const isBlock = event.kind === 'block';
  const isLauncher = Boolean(event.launched || event.juggled || event.tornado);
  const isCounterHit = event.kind === 'counterHit';
  const isPunish = event.kind === 'punish' || event.kind === 'whiffPunish';
  const isClash = event.kind === 'clash';
  const isPowerHit = isCounterHit || isPunish || event.kiBurst || isClash;
  return {
    duration: isClash ? 0.64 : isLauncher ? 0.5 : isBlock ? 0.38 : 0.44,
    reducedDuration: isLauncher ? 0.28 : 0.24,
    scale: isClash ? 1.48 : isLauncher ? 1.22 : isCounterHit ? 1.32 : isPunish ? 1.22 : isBlock ? 0.92 : 1.04,
    expansion: isBlock ? 0.84 : isLauncher ? 1.1 : isPowerHit ? 1.46 : 1.16,
    spin: isBlock ? 2.3 : isLauncher ? 5.4 : isPowerHit ? 7.1 : 5.6,
    ringX: isBlock ? 0.82 : isLauncher ? 0.88 : 1.02,
    ringY: isBlock ? 1.38 : isLauncher ? 1.24 : isPowerHit ? 1.12 : 1.02,
    coreScale: isClash ? 0.26 : isCounterHit ? 0.23 : isPunish ? 0.2 : isLauncher ? 0.19 : isBlock ? 0.17 : 0.18,
    discScale: isClash ? 0.68 : isCounterHit ? 0.6 : isPunish ? 0.54 : isLauncher ? 0.52 : isBlock ? 0.42 : 0.48,
    shardCount: isClash ? 64 : isCounterHit ? 56 : isPunish ? 46 : isLauncher ? 42 : isBlock ? 38 : 28,
    particleCount: isClash ? 88 : isCounterHit ? 78 : isPunish ? 66 : isLauncher ? 58 : isBlock ? 62 : 42,
    slashCount: isClash ? 13 : isCounterHit ? 11 : isPunish ? 10 : isLauncher ? 9 : isBlock ? 5 : 7,
    lightIntensity: isClash ? 9.2 : isCounterHit ? 7.8 : isPunish ? 6.4 : isLauncher ? 6 : isBlock ? 4.8 : 5.2,
    ghost: isCounterHit || isPunish || isLauncher || isClash
  };
}

function impactDirectionSign(event: ImpactSparkEvent) {
  return event.attackerSlot <= event.defenderSlot ? 1 : -1;
}

function makeSparkDirections(seed: number, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / Math.max(1, count)) * Math.PI * 2 + seededUnit(seed, index) * 0.6;
    const radius = 0.7 + seededUnit(seed + 11, index) * 0.75;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius, 0, angle, 0.45 + seededUnit(seed + 23, index) * 0.85] as [number, number, number, number, number];
  });
}

function seededUnit(seed: number, index: number) {
  const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

type ActiveEffectBinding = {
  fighter: FighterRuntime;
  effect: CharacterEffectDefinition;
  instance: MoveEffectInstance;
  moveFrame: number;
  totalFrames: number;
  moveInstanceId: number;
};

type ActiveMoveSoundBinding = {
  fighter: FighterRuntime;
  move: MoveDefinition;
  moveFrame: number;
  moveInstanceId: number;
};

function EffectLayer({
  match,
  audioSettings,
  reducedMotion,
  renderTick
}: {
  match: MatchSnapshot;
  audioSettings?: GameSettings['audio'];
  reducedMotion: boolean;
  renderTick?: number;
}) {
  void renderTick;
  const bindings = getActiveEffectBindings(match);
  useEffectAudioCues(bindings, audioSettings);
  useMoveAudioCues(getActiveMoveSoundBindings(match), audioSettings);
  if (bindings.length === 0) return null;
  return (
    <group>
      {bindings.map((binding) => (
        <MoveEffectVisual
          key={`${binding.fighter.slot}-${binding.moveInstanceId}-${binding.instance.id}`}
          binding={binding}
          reducedMotion={reducedMotion}
        />
      ))}
    </group>
  );
}

function ProjectileLayer({ match, stage, renderTick }: { match: MatchSnapshot; stage: StageDefinition; renderTick?: number }) {
  void renderTick;
  const projectiles = match.projectiles ?? [];
  const chargeBindings = getActiveBlastChargeBindings(match);
  if (projectiles.length === 0 && chargeBindings.length === 0) return null;
  return (
    <group>
      {chargeBindings.map((binding) => (
        <BlastChargeVisual
          key={`blast-charge-${binding.fighter.slot}-${binding.fighter.moveInstanceId}-${binding.instance.id}`}
          binding={binding}
        />
      ))}
      {projectiles.map((projectile) => {
        const owner = match.fighters[projectile.ownerSlot - 1];
        const definition = owner.character.projectiles?.find((candidate) => candidate.id === projectile.projectileId);
        if (!definition) return null;
        return projectile.kind === 'blast' || definition.kind === 'blast' ? (
          <BlastProjectileVisual
            key={`${projectile.id}-${projectile.projectileId}`}
            projectile={projectile}
            definition={definition}
          />
        ) : (
          <ProjectileVisual
            key={`${projectile.id}-${projectile.projectileId}`}
            projectile={projectile}
            definition={definition}
            stage={stage}
          />
        );
      })}
    </group>
  );
}

type ActiveBlastChargeBinding = {
  fighter: FighterRuntime;
  instance: MoveProjectileInstance;
  definition: CharacterProjectileDefinition;
  spawnFrame: number;
};

function getActiveBlastChargeBindings(match: MatchSnapshot): ActiveBlastChargeBinding[] {
  return match.fighters.flatMap((fighter) => {
    const move = fighter.currentMove;
    if (!move || fighter.state !== 'attack' || !move.holdable || fighter.moveFrame < 0) return [];
    return getMoveProjectileInstances(fighter, move)
      .filter((instance) => instance.releaseGated && fighter.moveFrame >= getMoveProjectileSpawnFrame(instance, move))
      .flatMap((instance) => {
        const definition = fighter.character.projectiles?.find((candidate) => candidate.id === instance.projectileId);
        const kind = instance.kind ?? definition?.kind ?? 'projectile';
        const alreadyFired = match.projectiles.some((projectile) => (
          projectile.ownerSlot === fighter.slot &&
          projectile.moveInstanceId === fighter.moveInstanceId &&
          projectile.instanceId === instance.id
        ));
        return definition && kind === 'blast' && !alreadyFired
          ? [{ fighter, instance, definition, spawnFrame: getMoveProjectileSpawnFrame(instance, move) }]
          : [];
      });
  });
}

function getMoveProjectileInstances(fighter: FighterRuntime, move: MoveDefinition) {
  return getProjectileMoveKeysForVisual(fighter, move)
    .flatMap((moveKey) => fighter.character.moveProjectiles?.[moveKey] ?? [])
    .filter((instance, index, all) => all.findIndex((candidate) => candidate.id === instance.id) === index);
}

function getProjectileMoveKeysForVisual(fighter: FighterRuntime, move: MoveDefinition) {
  const baseInputKeys: Record<string, string> = {
    jab: 'jableft',
    heavy: 'jabright',
    kick: 'kickleft',
    special: 'kickright',
    '1': 'jableft',
    '2': 'jabright',
    '3': 'kickleft',
    '4': 'kickright'
  };
  const commandKeys = move.command
    ? [move.command, move.command.startsWith('cmd:') ? move.command.slice(4) : `cmd:${move.command}`]
    : [];
  const candidates = [
    move.animationKey,
    ...commandKeys,
    move.comboKey,
    move.id,
    baseInputKeys[move.input],
    move.input
  ].filter((key): key is string => Boolean(key));
  return [...new Set(candidates)].filter((key) => fighter.character.moveProjectiles?.[key]?.length);
}

function getMoveProjectileSpawnFrame(instance: MoveProjectileInstance, move: MoveDefinition) {
  return Math.max(0, Math.round(instance.spawnFrame ?? move.startupFrames));
}

function BlastChargeVisual({ binding }: { binding: ActiveBlastChargeBinding }) {
  const camera = useThree((state) => state.camera);
  const groupRef = useRef<THREE.Group>(null);
  const move = binding.fighter.currentMove;
  const visual = binding.definition.blastVisual;
  const chargeFrames = Math.max(0, binding.fighter.moveFrame - binding.spawnFrame);
  const chargeProgress = THREE.MathUtils.clamp(chargeFrames / Math.max(1, binding.instance.chargeFramesMax ?? 120), 0, 1);
  const radius = (visual?.radius ?? 0.34) * (0.72 + chargeProgress * 0.65);
  const pulse = 1 + Math.sin((binding.fighter.moveFrame + binding.fighter.slot * 17) * 0.22) * (0.08 + chargeProgress * 0.08);
  const color = visual?.glowColor ?? binding.definition.color ?? '#62d8ff';
  const coreColor = visual?.coreColor ?? '#ffffff';
  const position = resolveEffectWorldPosition(binding.fighter, {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    opacity: 1,
    color
  }, 'hands');
  useFrame(() => {
    if (groupRef.current) groupRef.current.lookAt(camera.position);
  });
  if (!move) return null;
  return (
    <group ref={groupRef} position={position} renderOrder={42}>
      <mesh scale={[radius * pulse, radius * pulse, radius * pulse]}>
        <sphereGeometry args={[1, 28, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.28 + chargeProgress * 0.18} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh scale={[radius * 0.42 * pulse, radius * 0.42 * pulse, radius * 0.42 * pulse]}>
        <sphereGeometry args={[1, 24, 12]} />
        <meshBasicMaterial color={coreColor} transparent opacity={0.78} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation={[0, 0, binding.fighter.moveFrame * 0.08]} scale={[radius * 1.45, radius * 1.45, radius * 1.45]}>
        <ringGeometry args={[0.78, 0.9, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.38 + chargeProgress * 0.18} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <pointLight color={color} intensity={1.1 + chargeProgress * 2.4} distance={3.6 + chargeProgress * 2.4} />
    </group>
  );
}

function BlastProjectileVisual({
  projectile,
  definition
}: {
  projectile: ProjectileRuntime;
  definition: CharacterProjectileDefinition;
}) {
  const visual = definition.blastVisual;
  const length = Math.max(0.1, projectile.hitbox.size[2]);
  const growFrames = Math.max(1, visual?.growFrames ?? 8);
  const fadeFrames = Math.max(1, visual?.fadeFrames ?? Math.max(1, projectile.recoveryFrames));
  const grow = THREE.MathUtils.clamp(projectile.ageFrames / growFrames, 0.08, 1);
  const remainingFrames = Math.max(0, projectile.lifetimeFrames - projectile.ageFrames);
  const fade = projectile.phase === 'recovery' ? THREE.MathUtils.clamp(remainingFrames / fadeFrames, 0, 1) : 1;
  const chargeBoost = THREE.MathUtils.clamp(projectile.chargeDamageScale ?? 1, 1, 1.8);
  const radius = (visual?.radius ?? Math.max(0.16, projectile.hitbox.size[0] * 0.45)) * (0.9 + (chargeBoost - 1) * 0.28);
  const currentLength = length * grow;
  const centerX = projectile.position.x + projectile.facing * currentLength / 2;
  const endX = projectile.position.x + projectile.facing * currentLength;
  const pulse = 0.9 + 0.1 * Math.sin((projectile.ageFrames + projectile.trailSeed) * 0.55);
  const coreColor = visual?.coreColor ?? '#ffffff';
  const glowColor = visual?.glowColor ?? definition.color ?? '#62d8ff';
  const outerColor = visual?.outerColor ?? glowColor;
  const impactColor = visual?.impactColor ?? coreColor;
  const opacity = fade * (0.82 + Math.min(0.18, (chargeBoost - 1) * 0.18));
  return (
    <group renderOrder={46}>
      <group position={[centerX, projectile.position.y, projectile.position.z]} rotation={[0, 0, Math.PI / 2]}>
        <mesh scale={[pulse, 1, pulse]}>
          <cylinderGeometry args={[radius * 0.28, radius * 0.28, currentLength, 36, 1, true]} />
          <meshBasicMaterial color={coreColor} transparent opacity={opacity} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh scale={[pulse, 1, pulse]}>
          <cylinderGeometry args={[radius * 0.66, radius * 0.66, currentLength, 36, 1, true]} />
          <meshBasicMaterial color={glowColor} transparent opacity={fade * 0.34} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
        <mesh scale={[pulse, 1, pulse]}>
          <cylinderGeometry args={[radius, radius, currentLength, 36, 1, true]} />
          <meshBasicMaterial color={outerColor} transparent opacity={fade * 0.16} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      </group>
      {[0, 1, 2, 3].map((index) => (
        <mesh
          key={index}
          position={[centerX, projectile.position.y, projectile.position.z]}
          rotation={[index * Math.PI / 4, 0, 0]}
          scale={[projectile.facing, 1, 1]}
        >
          <planeGeometry args={[currentLength, radius * (1.2 + index * 0.14)]} />
          <meshBasicMaterial color={glowColor} transparent opacity={fade * (0.07 + index * 0.01)} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ))}
      <group position={[endX, projectile.position.y, projectile.position.z]} rotation={[0, Math.PI / 2, 0]}>
        <mesh scale={[radius * 1.2, radius * 1.2, radius * 1.2]}>
          <sphereGeometry args={[1, 28, 16]} />
          <meshBasicMaterial color={impactColor} transparent opacity={fade * 0.36} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh scale={[radius * (1.4 + projectile.ageFrames * 0.012), radius * (1.4 + projectile.ageFrames * 0.012), radius * (1.4 + projectile.ageFrames * 0.012)]}>
          <ringGeometry args={[0.82, 1, 72]} />
          <meshBasicMaterial color={glowColor} transparent opacity={fade * 0.42} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      </group>
      <pointLight color={glowColor} intensity={fade * (visual?.shake ?? 0.18) * 7} distance={5.5} position={[projectile.position.x, projectile.position.y, projectile.position.z]} />
    </group>
  );
}

function ProjectileVisual({
  projectile,
  definition,
  stage
}: {
  projectile: ProjectileRuntime;
  definition: CharacterProjectileDefinition;
  stage: StageDefinition;
}) {
  const camera = useThree((state) => state.camera);
  const source = getProjectileFrameSource(projectile, definition);
  const [voxels, setVoxels] = useState<ImageVoxel[]>([]);
  const character = useMemo(() => ({
    id: `projectile-${definition.id}`,
    voxelProfile: definition.voxelProfile ?? 'image-source',
    voxelFidelity: definition.voxelFidelity
  }) as CharacterDefinition, [definition.id, definition.voxelFidelity, definition.voxelProfile]);
  useEffect(() => {
    let canceled = false;
    if (!source) {
      setVoxels([]);
      return;
    }
    getCachedImageVoxels(source, character).then((nextVoxels) => {
      if (!canceled) setVoxels(nextVoxels);
    });
    return () => {
      canceled = true;
    };
  }, [character, source]);
  const parts = useMemo(() => buildVoxelParts(voxels, voxels.length > 900 ? 2 : 1, source), [source, voxels]);
  const outlineStyle = useMemo(() => getFighterOutlineStyle(stage), [stage]);
  const renderStyle = useMemo(() => withDefaultRenderStyle({
    tint: definition.color ?? '#ffffff',
    opacity: projectile.phase === 'recovery' ? 0.72 : 1,
    renderOrder: 35,
    depthWrite: false,
    castShadow: false,
    receiveShadow: false
  }), [definition.color, projectile.phase]);
  if (!source || voxels.length === 0) return null;
  const yaw = getProjectileVisualYaw(projectile);
  const reveal = getProjectileRevealProgress(projectile);
  const position = getProjectileVisualPosition(projectile, camera, reveal);
  const scale = getProjectileVisualScale(definition, reveal);
  return (
    <group
      position={position}
      rotation={[definition.defaultRotation[0], yaw + definition.defaultRotation[1], definition.defaultRotation[2]]}
      scale={scale}
    >
      <ImageVoxelPartGroup part={parts.head} outlineStyle={outlineStyle} renderStyle={renderStyle} />
      <ImageVoxelPartGroup part={parts.torso} outlineStyle={outlineStyle} renderStyle={renderStyle} />
      <ImageVoxelPartGroup part={parts.leadArm} outlineStyle={outlineStyle} renderStyle={renderStyle} />
      <ImageVoxelPartGroup part={parts.rearArm} outlineStyle={outlineStyle} renderStyle={renderStyle} />
      <ImageVoxelPartGroup part={parts.leadLeg} outlineStyle={outlineStyle} renderStyle={renderStyle} />
      <ImageVoxelPartGroup part={parts.rearLeg} outlineStyle={outlineStyle} renderStyle={renderStyle} />
    </group>
  );
}

function getProjectileVisualYaw(projectile: ProjectileRuntime) {
  return projectile.facing >= 0 ? 0 : Math.PI;
}

function getProjectileRevealProgress(projectile: ProjectileRuntime) {
  return THREE.MathUtils.clamp(PROJECTILE_REVEAL_MIN_SCALE + (projectile.ageFrames / PROJECTILE_REVEAL_FRAMES) * (1 - PROJECTILE_REVEAL_MIN_SCALE), PROJECTILE_REVEAL_MIN_SCALE, 1);
}

function getProjectileVisualScale(definition: CharacterProjectileDefinition, reveal: number): Vec3Tuple {
  return [
    definition.defaultScale[0] * reveal,
    definition.defaultScale[1],
    definition.defaultScale[2]
  ];
}

function getProjectileVisualPosition(projectile: ProjectileRuntime, camera: THREE.Camera, reveal: number): Vec3Tuple {
  const cameraDx = camera.position.x - projectile.position.x;
  const cameraDz = camera.position.z - projectile.position.z;
  const distance = Math.hypot(cameraDx, cameraDz);
  const forwardRevealOffset = projectile.facing * (1 - reveal) * PROJECTILE_REVEAL_FORWARD_OFFSET;
  if (distance <= 0.001) return [
    projectile.position.x + forwardRevealOffset,
    projectile.position.y,
    projectile.position.z + PROJECTILE_VISUAL_FRONT_BIAS
  ];
  return [
    projectile.position.x + forwardRevealOffset + (cameraDx / distance) * PROJECTILE_VISUAL_FRONT_BIAS,
    projectile.position.y,
    projectile.position.z + (cameraDz / distance) * PROJECTILE_VISUAL_FRONT_BIAS
  ];
}

function getProjectileFrameSource(projectile: ProjectileRuntime, definition: CharacterProjectileDefinition) {
  const phaseFrames = definition.animationFrames?.[projectile.phase] ?? [];
  const fallbackFrames = definition.animationFrames?.active ?? definition.frames ?? [];
  const frames = phaseFrames.length > 0 ? phaseFrames : fallbackFrames;
  if (frames.length === 0) return definition.sourcePath ?? definition.spriteSheetPath;
  const phaseStart =
    projectile.phase === 'startup' ? 0 :
      projectile.phase === 'active' ? projectile.startupFrames :
        projectile.startupFrames + projectile.activeFrames;
  const phaseAge = Math.max(0, projectile.ageFrames - phaseStart);
  const rawIndex = Math.floor((phaseAge / 60) * Math.max(1, definition.fps));
  const frameIndex = definition.loop ? rawIndex % frames.length : Math.min(frames.length - 1, rawIndex);
  return frames[frameIndex] ?? frames[0];
}

function useEffectAudioCues(bindings: ActiveEffectBinding[], audioSettings?: GameSettings['audio']) {
  const previousFrames = useRef(new Map<string, number>());
  useEffect(() => {
    const liveKeys = new Set<string>();
    bindings.forEach((binding) => {
      const key = `${binding.fighter.slot}:${binding.moveInstanceId}:${binding.instance.id}`;
      liveKeys.add(key);
      const previousFrame = previousFrames.current.get(key) ?? binding.moveFrame - 1;
      const cues = [...(binding.effect.soundCues ?? []), ...(binding.instance.soundCues ?? [])];
      cues.forEach((cue) => {
        if (shouldFireEffectCue(cue, previousFrame, binding.moveFrame, binding.instance)) {
          playEffectSound(cue, audioSettings);
        }
      });
      previousFrames.current.set(key, binding.moveFrame);
    });
    previousFrames.current.forEach((_, key) => {
      if (!liveKeys.has(key)) previousFrames.current.delete(key);
    });
  }, [audioSettings, bindings]);
}

function useMoveAudioCues(bindings: ActiveMoveSoundBinding[], audioSettings?: GameSettings['audio']) {
  const previousFrames = useRef(new Map<string, number>());
  useEffect(() => {
    const liveKeys = new Set<string>();
    bindings.forEach((binding) => {
      const key = `${binding.fighter.slot}:${binding.moveInstanceId}:${binding.move.id}`;
      liveKeys.add(key);
      const previousFrame = previousFrames.current.get(key) ?? -1;
      (binding.move.soundCues ?? []).forEach((cue) => {
        if (previousFrame < cue.frame && binding.moveFrame >= cue.frame) {
          playEffectSound(cue, audioSettings);
        }
      });
      previousFrames.current.set(key, binding.moveFrame);
    });
    previousFrames.current.forEach((_, key) => {
      if (!liveKeys.has(key)) previousFrames.current.delete(key);
    });
  }, [audioSettings, bindings]);
}

function playEffectSound(cue: EffectSoundCue, audioSettings?: GameSettings['audio']) {
  if (typeof window === 'undefined' || !audioSettings || audioSettings.muted || !cue.path) return;
  const audio = new Audio(cue.path);
  audio.volume = Math.max(0, Math.min(1, audioSettings.master * audioSettings.sfx * cue.volume));
  audio.playbackRate = cue.pitch;
  void audio.play().catch(() => undefined);
}

function getActiveMoveSoundBindings(match: MatchSnapshot): ActiveMoveSoundBinding[] {
  return match.fighters
    .filter((fighter) => fighter.state === 'attack' && fighter.currentMove && (fighter.currentMove.soundCues?.length ?? 0) > 0)
    .map((fighter) => ({
      fighter,
      move: fighter.currentMove as MoveDefinition,
      moveFrame: fighter.moveFrame,
      moveInstanceId: fighter.moveInstanceId
    }));
}

function getActiveEffectBindings(match: MatchSnapshot): ActiveEffectBinding[] {
  return match.fighters.flatMap((fighter) => {
    if ((fighter.state !== 'attack' && fighter.state !== 'chargeKi') || !fighter.currentMove) return [];
    const effects = fighter.character.effects ?? [];
    const library = new Map(effects.map((effect) => [effect.id, effect]));
    const instances = getEffectMoveKeys(fighter)
      .flatMap((moveKey) => fighter.character.moveEffects?.[moveKey] ?? [])
      .filter((instance) => effectIsVisibleAt(instance, fighter.moveFrame, totalMoveFramesForEffect(fighter)))
      .filter((instance, index, all) => all.findIndex((candidate) => candidate.id === instance.id) === index)
      .sort((a, b) => a.layer - b.layer);
    return instances.flatMap((instance) => {
      const effect = library.get(instance.effectId);
      return effect
        ? [{
            fighter,
            effect,
            instance,
            moveFrame: fighter.moveFrame,
            totalFrames: totalMoveFramesForEffect(fighter),
            moveInstanceId: fighter.moveInstanceId
          }]
        : [];
    });
  });
}

function totalMoveFramesForEffect(fighter: FighterRuntime) {
  const move = fighter.currentMove;
  return move ? Math.max(1, move.startupFrames + move.activeFrames + move.recoveryFrames) : 1;
}

function getEffectMoveKeys(fighter: FighterRuntime) {
  const move = fighter.currentMove;
  if (!move) return [];
  const baseInputKeys: Record<string, string> = {
    jab: 'jableft',
    heavy: 'jabright',
    kick: 'kickleft',
    special: 'kickright',
    '1': 'jableft',
    '2': 'jabright',
    '3': 'kickleft',
    '4': 'kickright'
  };
  const commandKeys = move.command
    ? [move.command, move.command.startsWith('cmd:') ? move.command.slice(4) : `cmd:${move.command}`]
    : [];
  const candidates = [
    move.animationKey,
    ...commandKeys,
    move.comboKey,
    move.id,
    baseInputKeys[move.input],
    move.input
  ].filter((key): key is string => Boolean(key));
  return [...new Set(candidates)].filter((key) => fighter.character.moveEffects?.[key]?.length);
}

function MoveEffectVisual({
  binding,
  reducedMotion
}: {
  binding: ActiveEffectBinding;
  reducedMotion: boolean;
}) {
  const transform = effectTransformAt(binding.effect, binding.instance, binding.moveFrame);
  const anchor = binding.instance.anchor ?? binding.effect.anchor;
  const position = resolveEffectWorldPosition(binding.fighter, transform, anchor);
  const mirroredRotationY = binding.instance.mirrorWithFacing === false ? 0 : binding.fighter.facing === -1 ? Math.PI : 0;
  const opacity = reducedMotion ? transform.opacity * 0.72 : transform.opacity;
  return (
    <group
      position={position}
      rotation={[transform.rotation[0], transform.rotation[1] + mirroredRotationY, transform.rotation[2]]}
      scale={transform.scale}
    >
      {(binding.effect.frames?.length ?? 0) > 0 && <SpriteEffectPlane binding={binding} transform={transform} opacity={opacity} />}
      {(binding.effect.proceduralLayers ?? []).map((layer) => (
        <ProceduralEffectVisual
          key={layer.id}
          kind={layer.kind}
          color={layer.color}
          count={layer.count ?? 10}
          intensity={layer.intensity}
          size={layer.size ?? 1}
          opacity={opacity}
          seed={binding.moveInstanceId + binding.instance.id.length + layer.id.length}
        />
      ))}
    </group>
  );
}

function SpriteEffectPlane({
  binding,
  transform,
  opacity
}: {
  binding: ActiveEffectBinding;
  transform: EffectTransform;
  opacity: number;
}) {
  const framePath = getEffectSpriteFrame(binding);
  const texture = useLoader(THREE.TextureLoader, framePath);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  useEffect(() => {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
  }, [texture]);
  useFrame(() => {
    if (binding.effect.billboard && groupRef.current) groupRef.current.lookAt(camera.position);
    if (materialRef.current) materialRef.current.opacity = opacity;
  });
  const image = texture.image as { width?: number; height?: number } | undefined;
  const aspect = image?.width && image?.height ? image.width / image.height : 1;
  const contrastHalo = getSpriteEffectContrastHalo(binding.effect.blendMode, transform.color);
  return (
    <group ref={groupRef}>
      {contrastHalo && (
        <mesh scale={[aspect * contrastHalo.scale, contrastHalo.scale, 1]} renderOrder={45}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={texture}
            color={contrastHalo.color}
            transparent
            opacity={opacity * contrastHalo.opacity}
            alphaTest={0.02}
            blending={THREE.NormalBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
      <mesh scale={[aspect, 1, 1]} renderOrder={46}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          ref={materialRef}
          map={texture}
          color={transform.color}
          transparent
          opacity={opacity}
          alphaTest={0.02}
          blending={binding.effect.blendMode === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function getSpriteEffectContrastHalo(blendMode: string, color: string) {
  const rgb = readHexRgb(color);
  if (!rgb) return null;
  const luminance = getRelativeLuminance(rgb);
  const brightEnoughForHalo = luminance >= (blendMode === 'normal' ? 0.72 : 0.62);
  if (!brightEnoughForHalo) return null;
  return {
    color: makeContrastHaloColor(rgb),
    opacity: THREE.MathUtils.clamp(0.36 + (luminance - 0.62) * 0.68 + (blendMode === 'normal' ? 0 : 0.08), 0.38, 0.64),
    scale: 1.18
  };
}

function readHexRgb(color: string) {
  const match = /^#?([0-9a-f]{6})$/i.exec(color);
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255
  };
}

function getRelativeLuminance({ red, green, blue }: { red: number; green: number; blue: number }) {
  const convert = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * convert(red) + 0.7152 * convert(green) + 0.0722 * convert(blue);
}

function makeContrastHaloColor({ red, green, blue }: { red: number; green: number; blue: number }) {
  const source = new THREE.Color(red / 255, green / 255, blue / 255);
  const hsl = { h: 0, s: 0, l: 0 };
  source.getHSL(hsl);
  if (hsl.s < 0.18) {
    hsl.h = 0.61;
    hsl.s = 0.96;
  } else {
    hsl.s = THREE.MathUtils.clamp(hsl.s + 0.22, 0.72, 1);
  }
  hsl.l = THREE.MathUtils.clamp(hsl.l * 0.34, 0.16, 0.3);
  source.setHSL(hsl.h, hsl.s, hsl.l);
  return `#${source.getHexString()}`;
}

function getEffectSpriteFrame(binding: ActiveEffectBinding) {
  const localFrame = Math.max(0, binding.moveFrame - binding.instance.startFrame);
  const frameStep = Math.max(1, Math.round(60 / Math.max(1, binding.effect.fps)));
  const rawIndex = Math.floor(localFrame / frameStep);
  const frames = binding.effect.frames ?? [];
  const maxIndex = Math.max(0, frames.length - 1);
  const index = binding.instance.loop || binding.effect.loop ? rawIndex % (maxIndex + 1) : Math.min(maxIndex, rawIndex);
  return frames[index] ?? frames[0];
}

function ProceduralEffectVisual({
  kind,
  color,
  count,
  intensity,
  size,
  opacity,
  seed
}: {
  kind: string;
  color: string;
  count: number;
  intensity: number;
  size: number;
  opacity: number;
  seed: number;
}) {
  if (kind === 'ring') {
    return (
      <mesh scale={size} renderOrder={45}>
        <torusGeometry args={[0.55, 0.035, 8, 44]} />
        <meshBasicMaterial color={color} transparent opacity={opacity * intensity} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    );
  }
  if (kind === 'lightning' || kind === 'shards') {
    return (
      <group>
        {makeSparkDirections(seed, Math.min(32, count)).map((direction, index) => (
          <mesh
            key={`${kind}-${index}`}
            position={[direction[0] * 0.34 * size, direction[1] * 0.22 * size, direction[2]]}
            rotation={[0, 0, direction[3]]}
            scale={[direction[4] * size, 0.035 * size, 0.035 * size]}
            renderOrder={47}
          >
            <boxGeometry args={[0.42, 0.06, 0.06]} />
            <meshBasicMaterial color={color} transparent opacity={opacity * intensity} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        ))}
      </group>
    );
  }
  if (kind === 'wind' || kind === 'trail') {
    return (
      <group>
        {[0, 1, 2].map((index) => (
          <mesh key={index} rotation={[0, 0, index * 0.55]} scale={[size * (1 + index * 0.18), size * 0.28, size]} renderOrder={44}>
            <torusGeometry args={[0.45, 0.018, 8, 42, Math.PI * 1.35]} />
            <meshBasicMaterial color={color} transparent opacity={opacity * intensity * 0.72} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        ))}
      </group>
    );
  }
  return (
    <mesh scale={size} renderOrder={43}>
      <sphereGeometry args={[0.42, 16, 10]} />
      <meshBasicMaterial color={color} transparent opacity={opacity * intensity * 0.44} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function resolveEffectWorldPosition(fighter: FighterRuntime, transform: EffectTransform, anchor: string): [number, number, number] {
  const facing = fighter.facing;
  const offsetX = getFighterRenderOffsetX(fighter, activeMoveProgress(fighter), 0);
  const anchorOffsets: Record<string, [number, number, number]> = {
    root: [0, 0, 0],
    body: [0, 1.05, 0],
    head: [0, 1.75, 0],
    hands: [0.52 * facing, 1.18, 0],
    feet: [0.18 * facing, 0.28, 0],
    hitbox: [0.78 * facing, 1.08, 0],
    world: [0, 0, 0]
  };
  const offset = anchorOffsets[anchor] ?? anchorOffsets.body;
  if (anchor === 'world') return [...transform.position] as [number, number, number];
  const mirroredX = transform.position[0] * (facing === -1 ? -1 : 1);
  return [
    fighter.position.x + offsetX + offset[0] + mirroredX,
    fighter.position.y + offset[1] + transform.position[1],
    fighter.position.z + offset[2] + transform.position[2]
  ];
}

type StagePreviewCanvasProps = {
  stage: StageDefinition;
  interactive?: boolean;
  previewMode?: StagePreviewMode;
  testFighters?: [CharacterDefinition, CharacterDefinition] | null;
  showTestFighters?: boolean;
  showPlayableBounds?: boolean;
  selectedPropId?: string;
  onSelectProp?: (propId: string) => void;
};

export type StagePreviewMode = 'edit' | 'fly' | 'play';

export function StagePreviewCanvas({
  stage,
  interactive = false,
  previewMode = 'edit',
  testFighters = null,
  showTestFighters = false,
  showPlayableBounds = false,
  selectedPropId,
  onSelectProp
}: StagePreviewCanvasProps) {
  const modelStage = isModelStage(stage);
  const previewMaxDistance = previewMode === 'fly' ? Math.max(240, (stage.model?.bounds?.radius ?? 64) * 4) : Math.max(96, (stage.model?.bounds?.radius ?? 42) * 1.8);
  const previewMinDistance = previewMode === 'fly' ? 1 : 5;
  const fightersVisible = Boolean(testFighters && (previewMode === 'fly' || previewMode === 'play' || showTestFighters));
  const initialPreviewMatch = useMemo(
    () => (testFighters && fightersVisible ? buildStagePreviewMatch(stage, testFighters[0], testFighters[1]) : null),
    [fightersVisible, stage, testFighters]
  );
  const [previewMatch, setPreviewMatch] = useState<MatchSnapshot | null>(initialPreviewMatch);
  useEffect(() => {
    setPreviewMatch(initialPreviewMatch);
  }, [initialPreviewMatch]);
  const previewFighters = previewMatch?.fighters;
  const propSelectionEnabled = interactive && previewMode === 'edit';
  const controlTarget = useMemo(() => previewMode === 'fly'
    ? stage.fightPlane?.center ?? stage.model?.focus ?? stage.camera?.previewTarget ?? FIXED_STAGE_PREVIEW_TARGET
    : FIXED_STAGE_PREVIEW_TARGET, [previewMode, stage.camera?.previewTarget, stage.id, stage.model?.focus]);
  const cameraCollisionRegistry = useMemo<StageCameraCollisionRegistry>(() => ({ colliders: new Set<StageCameraColliderEntry>(), occluders: new Set<StageCameraColliderEntry>() }), [stage.id]);
  useEffect(() => {
    logStageModelDebug('H9 StagePreviewCanvas classified stage', {
      stageId: stage.id,
      renderMode: stage.renderMode,
      modelStage,
      modelPath: stage.model?.path,
      modelUrl: stage.model?.url,
      interactive,
      previewMode,
      fightersVisible
    });
  }, [fightersVisible, interactive, modelStage, previewMode, stage.id, stage.model?.path, stage.model?.url, stage.renderMode]);
  useEffect(() => {
    if (!modelStage) return;
    prefetchStageModelDecoders();
    void preloadStageModel(stage);
  }, [modelStage, stage]);
  return (
    <Canvas
      key={`${stage.id}:${stage.renderMode ?? 'procedural'}:${stage.model?.path ?? stage.model?.url ?? ''}`}
      shadows
      frameloop={interactive || modelStage || fightersVisible ? 'always' : 'demand'}
      dpr={[1, 1.25]}
      camera={previewMode === 'play' ? { position: [0, 3.3, 6.8], fov: 46 } : { position: [0, 7.4, 12.4], fov: 38 }}
      data-testid={`stage-preview-canvas-${stage.id}`}
      aria-label={`${stage.name} stage preview`}
    >
      <StageCameraCollisionContext.Provider value={cameraCollisionRegistry}>
        {!modelStage && <DefaultSkybox imagePath={stage.skyboxPath ?? DEFAULT_SKYBOX_PATH} />}
        <StageVisualStyleRig stage={stage} fighters={previewFighters} preview={previewMode !== 'play'} />
        <StagePreviewKeyboardControls
          active={interactive && (previewMode === 'fly' || previewMode === 'play')}
          previewMode={previewMode}
          match={previewMatch}
          onMatchChange={setPreviewMatch}
        />
        {previewMode === 'play' && previewMatch ? <CameraRig match={previewMatch} settings={defaultCameraSettings} /> : <StagePreviewCamera stage={stage} previewMode={previewMode} />}
        <group position={modelStage ? [0, 0, 0] : [0, -0.05, 0]} scale={modelStage ? 1 : 0.82}>
          <Arena
            stage={stage}
            fighters={previewFighters}
            selectedPropId={propSelectionEnabled ? selectedPropId : undefined}
            onSelectProp={propSelectionEnabled ? onSelectProp : undefined}
            showFightLaneMarkers={propSelectionEnabled}
          />
          {interactive && previewMode === 'edit' && showPlayableBounds && <StagePlayableBoundsMarkers stage={stage} />}
        </group>
        <StageCameraOcclusionFader />
        {previewFighters?.map((fighter) => <FighterRig key={`stage-preview-fighter-${fighter.slot}`} fighter={fighter} stage={stage} />)}
        {previewFighters ? <ContactShadows position={[0, (stage.fightPlane?.y ?? stage.world?.floorY ?? 0) - 0.01, 0]} opacity={0.34} scale={14} blur={2.4} far={3} /> : null}
        {interactive && previewMode !== 'play' && (
          <OrbitControls
            makeDefault
            enableDamping
            enablePan
            enableRotate
            enableZoom
            minDistance={previewMinDistance}
            maxDistance={previewMaxDistance}
            target={controlTarget}
          />
        )}
      </StageCameraCollisionContext.Provider>
    </Canvas>
  );
}

function StagePreviewKeyboardControls({
  active,
  previewMode,
  match,
  onMatchChange
}: {
  active: boolean;
  previewMode: StagePreviewMode;
  match: MatchSnapshot | null;
  onMatchChange: (match: MatchSnapshot | null | ((current: MatchSnapshot | null) => MatchSnapshot | null)) => void;
}) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls as { target?: THREE.Vector3; update?: () => void } | undefined);
  const flyKeysRef = useRef(new Set<string>());
  const inputRefs = useRef<[InputFrame, InputFrame]>([emptyInputFrame(), emptyInputFrame()]);
  const inputQueueRef = useRef<QueuedInputPress[]>([]);
  const inputSequenceRef = useRef(0);

  useEffect(() => {
    if (!active) return undefined;
    const handleKey = (event: KeyboardEvent, pressed: boolean) => {
      if (isStagePreviewTextEntryTarget(event.target)) return;
      if (previewMode === 'fly' && isStagePreviewFlyKey(event.code)) {
        captureStagePreviewKey(event);
        if (pressed) flyKeysRef.current.add(event.code);
        else flyKeysRef.current.delete(event.code);
        return;
      }
      if (previewMode === 'play') {
        const bindings = getKeyboardBindingsForEvent(event, 'local2p', defaultGameSettings.controls);
        if (!bindings.length) return;
        captureStagePreviewKey(event);
        bindings.forEach((binding) => {
          inputRefs.current[binding.player - 1][binding.action] = pressed;
          if (pressed && !event.repeat) enqueueInputPress(inputQueueRef.current, inputSequenceRef, (binding.player - 1) as 0 | 1, binding.action);
        });
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => handleKey(event, true);
    const handleKeyUp = (event: KeyboardEvent) => handleKey(event, false);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      flyKeysRef.current.clear();
      inputRefs.current = [emptyInputFrame(), emptyInputFrame()];
      inputQueueRef.current = [];
    };
  }, [active, previewMode]);

  useFrame((_, delta) => {
    if (!active) return;
    if (previewMode === 'fly') {
      moveStagePreviewFlyCamera(camera, controls, flyKeysRef.current, delta);
      return;
    }
    if (previewMode === 'play' && match) {
      const frameDelta = Math.min(delta, 1 / 30);
      const inputs: [InputFrame, InputFrame] = [
        { ...inputRefs.current[0] },
        { ...inputRefs.current[1] }
      ];
      applyQueuedPressesToInputs(inputs, inputQueueRef.current, true);
      onMatchChange((current) => current ? stepMatch(current, inputs[0], inputs[1], frameDelta) : current);
    }
  });

  return null;
}

function captureStagePreviewKey(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function isStagePreviewFlyKey(code: string) {
  return code === 'KeyW' ||
    code === 'KeyA' ||
    code === 'KeyS' ||
    code === 'KeyD' ||
    code === 'Space' ||
    code === 'ShiftLeft' ||
    code === 'ShiftRight' ||
    code === 'KeyQ' ||
    code === 'KeyE';
}

function isStagePreviewTextEntryTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName;
  if (tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  if (tagName !== 'INPUT') return false;
  const input = target as HTMLInputElement;
  const type = (input.type || 'text').toLowerCase();
  return !['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'].includes(type);
}

function moveStagePreviewFlyCamera(
  camera: THREE.Camera,
  controls: { target?: THREE.Vector3; update?: () => void } | undefined,
  keys: Set<string>,
  delta: number
) {
  if (keys.size === 0) return;
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  const move = new THREE.Vector3();
  if (keys.has('KeyW')) move.add(forward);
  if (keys.has('KeyS')) move.sub(forward);
  if (keys.has('KeyD')) move.add(right);
  if (keys.has('KeyA')) move.sub(right);
  if (keys.has('Space') || keys.has('KeyE')) move.y += 1;
  if (keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyQ')) move.y -= 1;
  if (move.lengthSq() === 0) return;
  move.normalize().multiplyScalar(18 * Math.min(delta, 1 / 30));
  camera.position.add(move);
  controls?.target?.add(move);
  controls?.update?.();
}

export function buildStagePreviewMatch(stage: StageDefinition, p1: CharacterDefinition, p2: CharacterDefinition) {
  const match = createMatch(p1, p2, stage, 'local2p', 3, { roster: [p1, p2], playIntro: false });
  const spawnP1 = stage.spawns?.p1 ?? [-3.2, stage.fightPlane?.y ?? 0, 0];
  const spawnP2 = stage.spawns?.p2 ?? [3.2, stage.fightPlane?.y ?? 0, 0];
  const rotationY = stage.fightPlane?.rotationY ?? 0;
  match.fighters[0].position = { x: spawnP1[0], y: spawnP1[1], z: spawnP1[2] };
  match.fighters[0].facing = 1;
  match.fighters[0].facingYaw = Math.PI / 2 - rotationY;
  match.fighters[0].state = 'idle';
  match.fighters[1].position = { x: spawnP2[0], y: spawnP2[1], z: spawnP2[2] };
  match.fighters[1].facing = -1;
  match.fighters[1].facingYaw = -Math.PI / 2 - rotationY;
  match.fighters[1].state = 'idle';
  return match;
}

function buildMoveDemoMatch(stage: StageDefinition, p1: CharacterDefinition, p2: CharacterDefinition) {
  const match = createMatch(p1, p2, stage, 'local2p', 3, {
    roster: [p1, p2],
    playIntro: false,
    roundTime: 0,
    maxHealth: 999,
    trainingInfiniteHealth: true
  });
  const floorY = stage.fightPlane?.y ?? stage.world?.floorY ?? 0;
  const rotationY = stage.fightPlane?.rotationY ?? 0;
  match.fighters[0].position = { x: -0.48, y: floorY, z: 0 };
  match.fighters[0].facing = 1;
  match.fighters[0].facingYaw = Math.PI / 2 - rotationY;
  match.fighters[0].ki = 100;
  match.fighters[0].state = 'idle';
  match.fighters[1].position = { x: 0.48, y: floorY, z: 0 };
  match.fighters[1].facing = -1;
  match.fighters[1].facingYaw = -Math.PI / 2 - rotationY;
  match.fighters[1].state = 'idle';
  match.projectiles = [];
  match.impactEvents = [];
  match.combatEvents = [];
  return match;
}

function StagePreviewCamera({ stage, previewMode }: { stage: StageDefinition; previewMode: StagePreviewMode }) {
  const { camera, invalidate } = useThree();
  const resetKey = `${stage.id}:${stage.renderMode ?? 'procedural'}:${stage.model?.path ?? stage.model?.url ?? ''}`;
  useEffect(() => {
    const cameraState = camera.userData as { stagePreviewResetKey?: string };
    if (cameraState.stagePreviewResetKey === resetKey) return;
    cameraState.stagePreviewResetKey = resetKey;
    const modelStage = isModelStage(stage);
    const position = previewMode === 'fly' && stage.camera?.previewPosition ? stage.camera.previewPosition : FIXED_STAGE_PREVIEW_CAMERA_POSITION;
    const target = previewMode === 'fly'
      ? stage.fightPlane?.center ?? stage.model?.focus ?? stage.camera?.previewTarget ?? FIXED_STAGE_PREVIEW_TARGET
      : FIXED_STAGE_PREVIEW_TARGET;
    camera.position.set(position[0], position[1], position[2]);
    if ('fov' in camera) camera.fov = FIXED_STAGE_PREVIEW_FOV;
    camera.near = 0.05;
    camera.far = 1200;
    camera.lookAt(target[0], target[1], target[2]);
    camera.updateProjectionMatrix();
    logStageModelDebug('H23/H37 fixed StagePreviewCamera applied', {
      stageId: stage.id,
      modelStage,
      cameraPosition: vectorToDebugArray(camera.position),
      target,
      near: camera.near,
      far: camera.far,
      fov: 'fov' in camera ? roundDebugNumber(camera.fov) : null
    });
    invalidate();
  }, [camera, invalidate, previewMode, resetKey, stage.camera?.previewPosition, stage.camera?.previewTarget, stage.fightPlane?.center, stage.id, stage.model?.focus, stage.renderMode]);
  return null;
}

function DefaultSkybox({ imagePath }: { imagePath: string }) {
  const texture = useLoader(THREE.TextureLoader, imagePath);
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(1, 1);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;
  }, [texture]);

  return (
    <mesh scale={[1, 0.72, 1]} rotation={[0, Math.PI, 0]} renderOrder={-1000}>
      <sphereGeometry args={[190, 64, 32]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} depthWrite={false} depthTest={false} toneMapped={false} fog={false} />
    </mesh>
  );
}

export function MenuAttractScene({
  match,
  sparkSettings = defaultSparkSettings,
  reducedMotion = false,
  performanceMode = 'full',
  renderTick = 0
}: GameSceneProps & { performanceMode?: MenuAttractPerformanceMode; renderTick?: number }) {
  const cameraCollisionRegistry = useMemo<StageCameraCollisionRegistry>(() => ({ colliders: new Set<StageCameraColliderEntry>(), occluders: new Set<StageCameraColliderEntry>() }), [match.stage.id]);
  const snappy = performanceMode === 'snappy';
  const dpr: [number, number] = snappy ? [0.42, 0.6] : [0.55, 0.75];
  const stableScene = useMemo(() => (
    <>
      {!isModelStage(match.stage) && <DefaultSkybox imagePath={match.stage.skyboxPath ?? DEFAULT_SKYBOX_PATH} />}
      <StageVisualStyleRig stage={match.stage} fighters={match.fighters} preview />
      <MenuAttractCamera match={match} />
      <Arena stage={match.stage} fighters={match.fighters} impactEvents={match.impactEvents} />
      <StageCameraOcclusionFader />
      <FighterRig fighter={match.fighters[0]} stage={match.stage} renderStyle={MENU_ATTRACT_FIGHTER_RENDER_STYLE} visualScale={MENU_ATTRACT_FIGHTER_VISUAL_SCALE} />
      <FighterRig fighter={match.fighters[1]} stage={match.stage} renderStyle={MENU_ATTRACT_FIGHTER_RENDER_STYLE} visualScale={MENU_ATTRACT_FIGHTER_VISUAL_SCALE} />
    </>
  ), [match, match.fighters, match.stage]);
  return (
    <Canvas
      frameloop="always"
      dpr={dpr}
      camera={{ position: [0, 2.55, 7.8], fov: 42 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      data-testid="menu-attract-canvas"
    >
      <StageCameraCollisionContext.Provider value={cameraCollisionRegistry}>
        {stableScene}
        {!snappy && <>
          <EffectLayer match={match} reducedMotion={reducedMotion} renderTick={renderTick} />
          <ProjectileLayer match={match} stage={match.stage} renderTick={renderTick} />
          <ImpactSparkLayer events={match.impactEvents} settings={sparkSettings} reducedMotion={reducedMotion} />
        </>}
      </StageCameraCollisionContext.Provider>
    </Canvas>
  );
}

function MenuAttractCamera({ match }: { match: MatchSnapshot }) {
  const { camera, size } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, delta) => {
    const [p1, p2] = match.fighters;
    const midX = (p1.position.x + p2.position.x) / 2;
    const midZ = (p1.position.z + p2.position.z) / 2;
    const dx = p2.position.x - p1.position.x;
    const dz = p2.position.z - p1.position.z;
    const distance = Math.hypot(dx, dz);
    const lineLength = distance || 1;
    let cameraX = -dz / lineLength;
    let cameraZ = dx / lineLength;
    if (cameraZ < 0) {
      cameraX *= -1;
      cameraZ *= -1;
    }
    const perspective = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const verticalFov = THREE.MathUtils.degToRad(perspective.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
    const horizontalFit = (distance * 0.5 + 1.25) / Math.tan(horizontalFov / 2);
    const verticalFit = (2.2 + Math.max(p1.position.y, p2.position.y) * 0.45) / Math.tan(verticalFov / 2);
    const cameraDistance = THREE.MathUtils.clamp(Math.max(horizontalFit, verticalFit, 6.4), 6.4, 13.5);
    const height = THREE.MathUtils.clamp(2.25 + cameraDistance * 0.08 + Math.max(p1.position.y, p2.position.y) * 0.18, 2.35, 3.75);
    const drift = Math.sin(state.clock.elapsedTime * 0.18) * 0.22;
    const desired = new THREE.Vector3(midX + cameraX * cameraDistance + drift, height, midZ + cameraZ * cameraDistance);
    camera.position.lerp(desired, 1 - Math.pow(0.00001, delta));
    target.set(midX, 0.95 + Math.max(p1.position.y, p2.position.y) * 0.14, midZ);
    camera.lookAt(target);
  });
  return null;
}

function MenuMoonStage() {
  const silhouettes = useMemo(
    () => [
      [-5.5, 0.04, -4.6, 1.4, 1.15],
      [-4.1, 0.04, -4.9, 1.8, 0.88],
      [-2.5, 0.04, -4.7, 1.1, 1.32],
      [2.1, 0.04, -4.8, 1.55, 1.05],
      [3.9, 0.04, -4.6, 1.2, 1.28],
      [5.2, 0.04, -4.9, 1.7, 0.92]
    ],
    []
  );
  return (
    <group>
      <mesh position={[0, 3.9, -6.7]}>
        <circleGeometry args={[1.55, 72]} />
        <meshBasicMaterial color="#f1f5ff" transparent opacity={0.92} />
      </mesh>
      <mesh position={[0, 3.9, -6.72]}>
        <ringGeometry args={[1.55, 1.9, 72]} />
        <meshBasicMaterial color="#7db8ff" transparent opacity={0.18} />
      </mesh>
      {silhouettes.map(([x, y, z, width, height], index) => (
        <mesh key={index} position={[x, y + height / 2, z]}>
          <coneGeometry args={[width, height, 3]} />
          <meshBasicMaterial color="#030712" transparent opacity={0.78} />
        </mesh>
      ))}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.035, 1.1]}>
        <planeGeometry args={[18, 10, 28, 20]} />
        <meshLambertMaterial color="#07182c" transparent opacity={0.92} />
      </mesh>
      <mesh position={[0, -0.018, 1.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.25, 3.7, 96]} />
        <meshBasicMaterial color="#2ee6ff" transparent opacity={0.22} />
      </mesh>
      <mesh position={[0, -0.012, 1.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.25, 96]} />
        <meshLambertMaterial color="#0d2140" transparent opacity={0.55} />
      </mesh>
      <gridHelper args={[12, 12, '#2ee6ff', '#14345d']} position={[0, 0.004, 1.1]} />
    </group>
  );
}

export function CharacterPreviewCanvas({
  character,
  pose,
  animationKey,
  previewMove,
  previewEffects,
  previewEffectInstances,
  previewEffectFrame,
  rotationTurn,
  zoom,
  preserveCameraFrame = false,
  showIdleGhost = false
}: {
  character: CharacterDefinition;
  pose: PreviewPose;
  animationKey?: string;
  previewMove?: MoveDefinition | null;
  previewEffects?: CharacterEffectDefinition[];
  previewEffectInstances?: MoveEffectInstance[];
  previewEffectFrame?: number;
  rotationTurn: number;
  zoom: number;
  preserveCameraFrame?: boolean;
  showIdleGhost?: boolean;
}) {
  const frameFit = useMemo(() => getPreviewFrameFit(character, animationKey), [animationKey, character]);
  useEffect(() => {
    const frameSources = getPreviewCharacterFrameSources(character, animationKey);
    return prewarmActiveFighterVoxels(character, frameSources, {
      immediateFrames: frameSources.slice(0, 1)
    });
  }, [animationKey, character.id]);
  const initialFrameFit = useRef<PreviewFrameFit | null>(null);
  if (!preserveCameraFrame) initialFrameFit.current = null;
  else if (!initialFrameFit.current) initialFrameFit.current = frameFit;
  const cameraFrameFit = preserveCameraFrame ? initialFrameFit.current ?? frameFit : frameFit;
  const maxCameraDistance = preserveCameraFrame ? 18 : 6.2 + cameraFrameFit.extraDistance;
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [0, 1.7 + cameraFrameFit.extraTargetY, 4.4 + cameraFrameFit.extraDistance], fov: 38 }}
      data-testid="character-viewer-canvas"
      aria-label="3D character model viewer"
    >
      <color attach="background" args={['#111418']} />
      <GameEnvironment />
      <ambientLight intensity={1.05} />
      <directionalLight castShadow position={[2.8, 4.6, 3.4]} intensity={2.65} color="#f7f7f2" shadow-mapSize={[1024, 1024]} />
      <pointLight position={[0, 2.4, 3.2]} color="#ffffff" intensity={5} distance={6} />
      <pointLight position={[-2, 1.8, 2]} color={character.colors.primary} intensity={6} distance={5} />
      <pointLight position={[2.2, 1.2, -2.2]} color={character.colors.accent} intensity={4} distance={5} />
      <PreviewFloor color={character.colors.primary} />
      {showIdleGhost && (
        <PreviewFighter
          key={`${character.id}-idle-ghost`}
          character={character}
          pose="idle"
          animationKey="idle"
          frameTimeOverride={0}
          rotationTurn={rotationTurn}
          renderStyle={IDLE_GHOST_RENDER_STYLE}
        />
      )}
      <PreviewFighter
        key={character.id}
        character={character}
        pose={pose}
        animationKey={animationKey}
        previewMove={previewMove}
        previewEffects={previewEffects}
        previewEffectInstances={previewEffectInstances}
        previewEffectFrame={previewEffectFrame}
        rotationTurn={rotationTurn}
      />
      <PreviewCamera zoom={zoom} frameFit={cameraFrameFit} />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom
        minDistance={2.25}
        maxDistance={maxCameraDistance}
        minPolarAngle={Math.PI * 0.22}
        maxPolarAngle={Math.PI * 0.52}
        target={[0, 1 + cameraFrameFit.extraTargetY, 0]}
        rotateSpeed={0.75}
        zoomSpeed={0.72}
      />
      <ContactShadows position={[0, -0.01, 0]} opacity={0.5} scale={5} blur={2.2} far={2.6} />
    </Canvas>
  );
}

export const UNLOCK_REVEAL_SEQUENCE_SECONDS = 6.6;

export function UnlockRevealCanvas({
  character,
  stage,
  frozen
}: {
  character: CharacterDefinition;
  stage: StageDefinition;
  frozen: boolean;
}) {
  const seed = useMemo(() => hashString(character.id), [character.id]);
  useEffect(() => {
    const frameSources = getUnlockRevealFrameSources(character);
    return prewarmActiveFighterVoxels(character, frameSources, {
      immediateFrames: frameSources.slice(0, 1)
    });
  }, [character.id]);
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [0, 2.45, 6.2], fov: 40 }}
      data-testid="unlock-reveal-canvas"
      aria-label={`${character.displayName} unlock reveal`}
    >
      <color attach="background" args={[stage.world?.backgroundColor ?? '#f8fbff']} />
      <fog attach="fog" args={[stage.world?.backgroundColor ?? '#f8fbff', 32, 130]} />
      <GameEnvironment />
      <DefaultSkybox imagePath={stage.skyboxPath ?? DEFAULT_SKYBOX_PATH} />
      <ambientLight intensity={0.72} />
      <directionalLight castShadow position={[3.8, 7.2, 4.6]} intensity={2.1} color={stage.light} shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-3.2, 2.5, 2.6]} color={character.colors.primary} intensity={9} distance={8} />
      <pointLight position={[2.6, 1.4, -2.2]} color={character.colors.accent} intensity={7} distance={7} />
      <Arena stage={stage} />
      <UnlockRevealFighter character={character} frozen={frozen} />
      <UnlockRevealCamera characterId={character.id} frozen={frozen} seed={seed} />
      <ContactShadows position={[0, -0.01, 0]} opacity={0.38} scale={7} blur={2.8} far={3.2} />
    </Canvas>
  );
}

function UnlockRevealFighter({ character, frozen }: { character: CharacterDefinition; frozen: boolean }) {
  const fighter = useRef(createPreviewFighter(character));
  const revealMoves = useMemo(() => selectUnlockRevealMoves(character), [character]);
  const startTime = useRef<number | null>(null);

  useEffect(() => {
    fighter.current = createPreviewFighter(character);
    startTime.current = null;
  }, [character]);

  useFrame((state) => {
    if (startTime.current === null) startTime.current = state.clock.elapsedTime;
    const elapsed = frozen ? UNLOCK_REVEAL_SEQUENCE_SECONDS : Math.min(UNLOCK_REVEAL_SEQUENCE_SECONDS, state.clock.elapsedTime - startTime.current);
    const runtime = fighter.current;
    const step = unlockRevealStep(elapsed, revealMoves);
    runtime.character = character;
    runtime.facing = 1;
    runtime.facingYaw = Math.PI / 2;
    runtime.position.x = step.x;
    runtime.position.y = 0;
    runtime.position.z = step.z;
    runtime.velocityY = 0;
    runtime.blockFlash = 0;
    runtime.hitFlash = 0;
    runtime.chargePhase = 'none';
    runtime.chargeFrame = 0;
    runtime.chargeCommitted = false;
    runtime.getupAction = 'none';
    runtime.getupTotalFrames = 0;
    runtime.previewAnimationKey = step.animationKey;
    runtime.currentMove = step.move;
    runtime.state = step.state;
    runtime.moveFrame = step.moveFrame;
    runtime.actionFramesRemaining = step.remainingFrames;
    runtime.actionTimer = step.remainingFrames / 60;
    runtime.hitConnected = step.state === 'attack';
    runtime.hitConfirmed = step.state === 'attack';
  });

  return <FighterRig fighter={fighter.current} timeScale={frozen ? 0 : 1} />;
}

function selectUnlockRevealMoves(character: CharacterDefinition) {
  const moves = character.moves.filter((move) => move.damage > 0);
  const byCommand = moves.filter((move) => move.command?.startsWith('cmd:'));
  const preferred = [
    byCommand.find((move) => Boolean(move.launchHeight) || move.knockdown),
    byCommand.find((move) => move.hitLevel === 'special' || move.kiCost),
    byCommand.find((move) => move.input === 'kick' || move.input === 'heavy'),
    moves.find((move) => move.input === 'jab'),
    moves.find((move) => move.input === 'heavy'),
    moves.find((move) => move.input === 'kick'),
    moves.find((move) => move.input === 'special')
  ].filter((move): move is MoveDefinition => Boolean(move));
  const unique: MoveDefinition[] = [];
  for (const move of [...preferred, ...moves]) {
    if (!unique.some((candidate) => candidate.id === move.id || candidate.animationKey === move.animationKey)) unique.push(move);
    if (unique.length >= 3) break;
  }
  return unique.length > 0 ? unique : character.moves.slice(0, 3);
}

function unlockRevealStep(elapsed: number, moves: MoveDefinition[]) {
  if (elapsed < 0.72) return revealState('idle', -2.35, 0.1);
  if (elapsed < 1.86) {
    const progress = THREE.MathUtils.smoothstep((elapsed - 0.72) / 1.14, 0, 1);
    return revealState('walk', THREE.MathUtils.lerp(-2.35, -0.46, progress), 0.1, 'sprint');
  }
  const attackWindows = [
    { start: 1.86, end: 2.62, move: moves[0] },
    { start: 2.62, end: 3.42, move: moves[1] ?? moves[0] },
    { start: 3.42, end: 4.36, move: moves[2] ?? moves[1] ?? moves[0] }
  ];
  for (const window of attackWindows) {
    if (elapsed >= window.start && elapsed < window.end && window.move) {
      const total = Math.max(1, window.move.startupFrames + window.move.activeFrames + window.move.recoveryFrames);
      const progress = THREE.MathUtils.clamp((elapsed - window.start) / (window.end - window.start), 0, 1);
      const moveFrame = Math.min(total - 1, Math.floor(progress * total));
      return {
        state: 'attack' as const,
        x: -0.32 + Math.sin(progress * Math.PI) * 0.1,
        z: 0.1,
        animationKey: window.move.animationKey,
        move: window.move,
        moveFrame,
        remainingFrames: Math.max(0, total - moveFrame)
      };
    }
  }
  if (elapsed < 4.92) return revealState('idle', -0.26, 0.1);
  return revealState('win', -0.18, 0.1, 'win');
}

function revealState(state: Exclude<FighterState, 'attack'>, x: number, z: number, animationKey: string = state) {
  return {
    state,
    x,
    z,
    animationKey,
    move: null,
    moveFrame: 0,
    remainingFrames: 0
  };
}

function UnlockRevealCamera({ characterId, frozen, seed }: { characterId: string; frozen: boolean; seed: number }) {
  const { camera } = useThree();
  const focus = useRef(new THREE.Vector3(-0.6, 1.05, 0.1));
  const startTime = useRef<number | null>(null);
  const angle = useMemo(() => {
    const side = seed % 2 === 0 ? 1 : -1;
    return side * THREE.MathUtils.degToRad(24 + (seed % 19));
  }, [seed]);
  const heightBias = useMemo(() => ((seed >> 4) % 9) * 0.035, [seed]);

  useFrame((state, delta) => {
    if (startTime.current === null) startTime.current = state.clock.elapsedTime;
    const elapsed = frozen
      ? UNLOCK_REVEAL_SEQUENCE_SECONDS
      : Math.min(UNLOCK_REVEAL_SEQUENCE_SECONDS, state.clock.elapsedTime - startTime.current);
    const progress = THREE.MathUtils.clamp(elapsed / UNLOCK_REVEAL_SEQUENCE_SECONDS, 0, 1);
    const focusX = THREE.MathUtils.lerp(-1.6, -0.15, THREE.MathUtils.smoothstep(progress, 0.08, 0.74));
    const focusY = THREE.MathUtils.lerp(0.95, 1.28 + heightBias, THREE.MathUtils.smoothstep(progress, 0.58, 1));
    focus.current.lerp(new THREE.Vector3(focusX, focusY, 0.08), cameraDamp(delta, 5.2));
    const distance = THREE.MathUtils.lerp(6.5, 3.85 + (seed % 5) * 0.16, THREE.MathUtils.smoothstep(progress, 0.42, 1));
    const orbit = angle + Math.sin((seed % 17) * 0.25) * 0.1;
    const desired = new THREE.Vector3(
      focus.current.x + Math.sin(orbit) * distance,
      THREE.MathUtils.lerp(2.8, 1.85 + heightBias, THREE.MathUtils.smoothstep(progress, 0.48, 1)),
      focus.current.z + Math.cos(orbit) * distance
    );
    camera.position.lerp(desired, cameraDamp(delta, frozen ? 8 : 3.2));
    camera.lookAt(focus.current);
  });

  useEffect(() => {
    debugLogThrottled(5, 'unlock reveal camera angle', { characterId, angle: Number(angle.toFixed(3)) });
  }, [angle, characterId]);

  return null;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

type PreviewFrameFit = {
  scale: number;
  extraDistance: number;
  extraTargetY: number;
};

function getPreviewFrameFit(character: CharacterDefinition, animationKey?: string): PreviewFrameFit {
  const resolved = character.animationFrames && animationKey ? resolveAnimationFrameSequence(character.animationFrames, animationKey) : null;
  const sequence = resolved?.sequence;
  const resolvedAnimationKey = resolved?.key ?? animationKey;
  const globalScale = getCharacterGlobalScale(character);
  const animationScale = getCharacterAnimationScale(character, resolvedAnimationKey);
  const frameScales = (sequence ?? []).map((frame) => getCharacterAnimationScale(character, resolvedAnimationKey, frame));
  const scale = Math.max(
    globalScale.width,
    globalScale.height,
    animationScale.width,
    animationScale.height,
    1,
    ...frameScales.flatMap((frameScale) => [frameScale.width, frameScale.height]),
    ...(sequence ?? []).map((frame) => getSpriteFrameGrowScale(character, frame))
  );
  return {
    scale,
    extraDistance: (scale - 1) * 3.2,
    extraTargetY: (scale - 1) * 0.68
  };
}

function getSpriteFrameGrowScale(character: CharacterDefinition, frameSource: string) {
  const frameIndex = frameSource.match(/frame-(\d+)\.png/)?.[1];
  if (!frameIndex) return 1;
  const edit = character.spriteFrameEdits?.[String(Number(frameIndex))];
  if (!edit) return 1;
  const sourceHeight = edit.sourceMode === 'replacement'
    ? Math.max(1, Math.round(edit.replacementHeight ?? edit.height ?? 1))
    : Math.max(1, Math.round((edit.box?.[3] ?? edit.height ?? 1) - (edit.box?.[1] ?? 0)));
  const outputHeight = Math.max(1, Math.round(edit.height || sourceHeight));
  return Math.min(2.35, Math.max(1, Number(edit.scale) || 1, outputHeight / sourceHeight));
}

function PreviewCamera({ zoom, frameFit }: { zoom: number; frameFit: PreviewFrameFit }) {
  const { camera } = useThree();
  const lastZoom = useRef(zoom);
  const lastScale = useRef(frameFit.scale);
  const active = useRef(true);
  useFrame((_, delta) => {
    if (lastZoom.current !== zoom || lastScale.current !== frameFit.scale) {
      lastZoom.current = zoom;
      lastScale.current = frameFit.scale;
      active.current = true;
    }
    if (!active.current) return;
    const distance = THREE.MathUtils.lerp(5.2, 2.35, zoom) + frameFit.extraDistance;
    const targetY = 1.05 + frameFit.extraTargetY;
    const desired = new THREE.Vector3(0, 1.45 + zoom * 0.28 + frameFit.extraTargetY, distance);
    camera.position.lerp(desired, 1 - Math.pow(0.001, delta));
    camera.lookAt(0, targetY, 0);
    if (camera.position.distanceTo(desired) < 0.01) active.current = false;
  });
  return null;
}

function PreviewFloor({ color }: { color: string }) {
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.55, 72]} />
        <meshLambertMaterial color="#181c22" />
      </mesh>
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.24, 1.3, 72]} />
        <meshBasicMaterial color={color} transparent opacity={0.32} />
      </mesh>
    </group>
  );
}

type FighterRenderStyle = {
  opacity: number;
  tint: string;
  hueShiftDegrees: number;
  depthWrite: boolean;
  renderOrder: number;
  castShadow: boolean;
  receiveShadow: boolean;
};

const DEFAULT_FIGHTER_RENDER_STYLE: FighterRenderStyle = {
  opacity: 1,
  tint: '#ffffff',
  hueShiftDegrees: 0,
  depthWrite: true,
  renderOrder: 0,
  castShadow: true,
  receiveShadow: true
};

const IDLE_GHOST_RENDER_STYLE: FighterRenderStyle = {
  opacity: 0.28,
  tint: '#d8fbff',
  hueShiftDegrees: 0,
  depthWrite: false,
  renderOrder: -6,
  castShadow: false,
  receiveShadow: false
};

function withDefaultRenderStyle(renderStyle?: Partial<FighterRenderStyle>): FighterRenderStyle {
  return { ...DEFAULT_FIGHTER_RENDER_STYLE, ...(renderStyle ?? {}) };
}

function renderStyleColor(source: string, renderStyle: FighterRenderStyle) {
  const color = renderStyle.opacity < 1 ? renderStyle.tint : source;
  return shiftHueColor(color, renderStyle.hueShiftDegrees);
}

function applyRenderStyleToMaterialColor(color: THREE.Color, renderStyle: FighterRenderStyle) {
  if (renderStyle.opacity < 1) {
    color.set(renderStyleColor(renderStyle.tint, renderStyle));
    return;
  }
  if (!renderStyle.hueShiftDegrees) return;
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(THREE.MathUtils.euclideanModulo(hsl.h + renderStyle.hueShiftDegrees / 360, 1), hsl.s, hsl.l);
}

function PreviewFighter({
  character,
  pose,
  animationKey,
  previewMove,
  previewEffects,
  previewEffectInstances,
  previewEffectFrame,
  rotationTurn,
  frameTimeOverride,
  renderStyle
}: {
  character: CharacterDefinition;
  pose: PreviewPose;
  animationKey?: string;
  previewMove?: MoveDefinition | null;
  previewEffects?: CharacterEffectDefinition[];
  previewEffectInstances?: MoveEffectInstance[];
  previewEffectFrame?: number;
  rotationTurn: number;
  frameTimeOverride?: number;
  renderStyle?: Partial<FighterRenderStyle>;
}) {
  const fighter = useRef(createPreviewFighter(character));
  const rotator = useRef<THREE.Group>(null);
  const [, setEffectFrameTick] = useState(0);
  const previewFrameTime = previewEffectFrame === undefined
    ? undefined
    : previewEffectFrame / Math.max(1, character.animationFrameRates?.[animationKey ?? ''] ?? character.animationFps ?? 8);
  const effectiveFrameTime = frameTimeOverride ?? previewFrameTime;

  useEffect(() => {
    fighter.current = createPreviewFighter(character);
  }, [character]);

  useFrame((state, delta) => {
    const runtime = fighter.current;
    const t = state.clock.elapsedTime;
    runtime.character = character;
    runtime.facing = 1;
    runtime.previewAnimationKey = animationKey;
    runtime.position.x = 0;
    runtime.position.z = 0;
    runtime.blockFlash = 0;
    runtime.hitFlash = 0;
    runtime.currentMove = null;
    runtime.actionTimer = 0;
    runtime.actionFramesRemaining = 0;
    runtime.moveFrame = 0;
    runtime.velocityY = 0;
    runtime.getupAction = 'none';
    runtime.getupTotalFrames = 0;

    if (isMovePose(pose)) {
      const move = previewMove ?? character.moves.find((candidate) => candidate.input === pose) ?? character.moves[0] ?? null;
      const total = move ? move.startupFrames + move.activeFrames + move.recoveryFrames : 1;
      const timelineFrame = previewEffectFrame ?? Math.floor(t * 60) % Math.max(1, total);
      runtime.state = 'attack';
      runtime.currentMove = move;
      runtime.moveFrame = timelineFrame;
      runtime.actionFramesRemaining = Math.max(0, total - runtime.moveFrame);
      runtime.actionTimer = runtime.actionFramesRemaining / 60;
      runtime.position.y = 0;
    } else {
      runtime.state = pose;
      runtime.sidestepDirection = animationKey === 'sidestepLeft' ? -1 : animationKey === 'sidestepRight' ? 1 : 0;
      const previewTime = effectiveFrameTime ?? t;
      runtime.position.y = pose === 'jump' ? Math.abs(Math.sin(previewTime * 2.4)) * 0.95 : pose === 'juggle' ? 1.35 + Math.sin(previewTime * 2.2) * 0.18 : 0;
      if (pose === 'getup') {
        runtime.getupAction = animationKey === 'getupRollUp'
          ? 'rollUp'
          : animationKey === 'getupRollDown'
            ? 'rollDown'
            : animationKey === 'getupRollBack'
              ? 'rollBack'
              : 'stand';
        runtime.getupTotalFrames = getCharacterGetupFrames(character, runtime.getupAction);
        const getupFrame = previewEffectFrame ?? Math.floor(t * 60);
        runtime.actionFramesRemaining = Math.max(0, runtime.getupTotalFrames - (getupFrame % runtime.getupTotalFrames));
      }
      if (pose === 'chargeKi') {
        runtime.currentMove = previewMove ?? buildPreviewChargeMove();
        runtime.chargePhase = Math.floor(previewTime * 1.35) % 3 === 2 ? 'hold' : 'active';
        runtime.chargeFrame = previewEffectFrame ?? Math.floor(t * 60);
        runtime.moveFrame = Math.min(32, runtime.chargeFrame % 48);
      } else {
        runtime.chargePhase = 'none';
        runtime.chargeFrame = 0;
        runtime.chargeCommitted = false;
      }
    }

    if (rotator.current) {
      const target = rotationTurn * (Math.PI / 4);
      rotator.current.rotation.y = THREE.MathUtils.lerp(rotator.current.rotation.y, target, 1 - Math.pow(0.001, delta));
    }
    if ((previewEffectInstances?.length ?? 0) > 0 && previewEffectFrame === undefined) {
      setEffectFrameTick((tick) => (tick + 1) % 3600);
    }
  });

  return (
    <group ref={rotator} position={[0, 0, 0]}>
      <FighterRig fighter={fighter.current} frameTimeOverride={effectiveFrameTime} renderStyle={renderStyle} />
      {(previewEffectInstances ?? []).map((instance) => {
        const effect = (previewEffects ?? []).find((candidate) => candidate.id === instance.effectId);
        if (!effect || !effectIsVisibleAt(instance, fighter.current.moveFrame, previewMove ? previewMove.startupFrames + previewMove.activeFrames + previewMove.recoveryFrames : 30)) return null;
        return (
          <MoveEffectVisual
            key={instance.id}
            binding={{
              fighter: fighter.current,
              effect,
              instance,
              moveFrame: fighter.current.moveFrame,
              totalFrames: previewMove ? previewMove.startupFrames + previewMove.activeFrames + previewMove.recoveryFrames : 30,
              moveInstanceId: 1,
            }}
            reducedMotion={false}
          />
        );
      })}
    </group>
  );
}

function buildPreviewChargeMove(): MoveDefinition {
  return {
    id: 'chargeKi',
    label: 'Charge Ki',
    input: 'special',
    command: 'chargeKi',
    animationKey: 'chargeKi',
    comboKey: 'chargeKi',
    startupFrames: 14,
    activeFrames: 18,
    recoveryFrames: 16,
    damage: 0,
    blockDamage: 0,
    hitLevel: 'special',
    onBlockFrames: 0,
    onHitFrames: 0,
    onCounterHitFrames: 0,
    whiffRecoveryFrames: 0,
    range: 0.1,
    pushback: 0,
    blockPushback: 0,
    tracking: 'none',
    knockdown: false,
    hitbox: { offset: [0, 1, 0], size: [0, 0, 0] }
  };
}

function isMovePose(pose: PreviewPose): pose is MoveInput {
  return pose === 'jab' || pose === 'kick' || pose === 'heavy' || pose === 'special';
}

function createPreviewFighter(character: CharacterDefinition): FighterRuntime {
  return {
    slot: 1,
    character,
    baseCharacter: character,
    hp: character.stats.health,
    maxHp: character.stats.health,
    tookDamageThisRound: false,
    ki: 0,
    displayKi: 0,
    transformOvercharge: 0,
    displayTransformOvercharge: 0,
    transformReadyTimer: 0,
    transformStartupFrames: 0,
    transformTargetId: null,
    transformSmokeFrames: 0,
    position: { x: 0, y: 0, z: 0 },
    velocityY: 0,
    facing: 1,
    facingYaw: Math.PI / 2,
    controlSideSign: 1,
    horizontalHoldDirection: null,
    horizontalHoldIntent: null,
    horizontalHoldControlSideSign: 1,
    state: 'idle',
    sidestepTimer: 0,
    sidestepDirection: 0,
    sidestepOrbitSign: 1,
    laneOrbitControlLocked: false,
    sidestepRepeatGraceFrames: 0,
    dashForwardFrames: 0,
    dashForwardCooldownFrames: 0,
    backHopFrames: 0,
    backHopTotalFrames: 0,
    backHopCooldownFrames: 0,
    walkDirection: 0,
    jumpInputHeld: false,
    currentMove: null,
    moveInstanceId: 0,
    actionTimer: 0,
    actionFramesRemaining: 0,
    moveFrame: 0,
    idleFlourishFramesRemaining: 0,
    idleFlourishTotalFrames: 0,
    chargePhase: 'none',
    chargeFrame: 0,
    chargeCommitted: false,
    hitConnected: false,
    hitConfirmed: false,
    whiffRecoveryApplied: false,
    previewAnimationKey: undefined,
    commandHistory: [],
    previousDirectionToken: 'N',
    comboTimer: 0,
    comboStep: 0,
    comboSequence: [],
    comboIdentitySequence: [],
    comboFamilySequence: [],
    comboVisualFamilySequence: [],
    comboUsedKeys: [],
    comboHits: 0,
    comboDamage: 0,
    bufferedMoveInput: null,
    bufferedMoveFrames: 0,
    bufferedMoveIntent: null,
    aiRecentComboKeys: [],
    aiRecentComboFamilies: [],
    aiRecentComboVisualFamilies: [],
    aiActiveComboRouteId: null,
    aiJuggleLockoutFrames: 0,
    aiActionableIdleFrames: 0,
    previousAttackInputs: { jab: false, kick: false, heavy: false, special: false },
    wasCrouching: false,
    roundsWon: 0,
    stunTimer: 0,
    stunFramesRemaining: 0,
    blockstunFramesRemaining: 0,
    blockPunishWindowFrames: 0,
    forcedCrouchFrames: 0,
    getupInvulnerableFrames: 0,
    getupForward: 0,
    getupLane: 0,
    getupStarted: false,
    getupAction: 'none',
    getupTotalFrames: 0,
    juggleDamage: 0,
    juggleSequenceDamage: 0,
    juggleTornadoCount: 0,
    juggleGravityScale: 0.52,
    tornadoReactionFrames: 0,
    throwOpponentSlot: null,
    throwCaptorSlot: null,
    throwAnchorMove: null,
    throwHoldFrames: 0,
    throwMaxHoldFrames: 240,
    throwJabActive: false,
    throwJabCooldownFrames: 0,
    throwJabHitConnected: false,
    throwEscapeProgress: 0,
    throwEscapeGoal: 0,
    throwShakeFrames: 0,
    blockFlash: 0,
    hitFlash: 0,
    visualHitstop: { framesRemaining: 0, animationKey: null, progress: 0 },
    shadowClone: null,
    shadowCloneChargeConsumed: false
  };
}

function cameraDamp(delta: number, speed: number) {
  return THREE.MathUtils.clamp(1 - Math.exp(-Math.max(0, delta) * speed), 0, 1);
}

function isFighterLaneOrbitCameraActive(fighter: FighterRuntime) {
  return fighter.laneOrbitControlLocked || fighter.state === 'sidestep' || fighter.sidestepTimer > 0 || fighter.sidestepRepeatGraceFrames > 0 || fighter.sidestepDirection !== 0;
}

const MIN_FIGHT_CAMERA_DISTANCE = 4.85;
const MIN_CLASH_CAMERA_DISTANCE = 4.85;
const MODEL_CAMERA_COLLISION_PADDING = 0.38;
const MODEL_CAMERA_COLLISION_MIN_DISTANCE = 2.35;
const CAMERA_VISIBILITY_SOLVER_PADDING = 0.56;
const CAMERA_VISIBILITY_FADE_PADDING = 0.42;

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

let lastFightCameraInputDebugAt = 0;

function logFightCameraInputDebug(payload: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  if (!window.location.search.includes('inputDebug=1') && window.localStorage?.getItem('kore:input-debug') !== '1') return;
  const now = performance.now();
  if (now - lastFightCameraInputDebugAt < 350) return;
  lastFightCameraInputDebugAt = now;
  console.info(`[KORE input-debug] camera-side ${JSON.stringify(payload)}`);
}

function enforceCameraHorizontalDistance(camera: THREE.Camera, focus: THREE.Vector3, fallbackSide: THREE.Vector3, minDistance: number) {
  enforceVectorHorizontalDistance(camera.position, focus, fallbackSide, minDistance);
}

function enforceVectorHorizontalDistance(position: THREE.Vector3, focus: THREE.Vector3, fallbackSide: THREE.Vector3, minDistance: number) {
  const dx = position.x - focus.x;
  const dz = position.z - focus.z;
  const distance = Math.hypot(dx, dz);
  if (distance >= minDistance) return;

  const fallbackLength = Math.hypot(fallbackSide.x, fallbackSide.z);
  const directionX = distance > 0.001 ? dx / distance : fallbackLength > 0.001 ? fallbackSide.x / fallbackLength : 0;
  const directionZ = distance > 0.001 ? dz / distance : fallbackLength > 0.001 ? fallbackSide.z / fallbackLength : 1;
  position.x = focus.x + directionX * minDistance;
  position.z = focus.z + directionZ * minDistance;
}

function resolveCameraModelCollision(
  focus: THREE.Vector3,
  desired: THREE.Vector3,
  colliders: Set<StageCameraColliderEntry> | undefined,
  output: THREE.Vector3,
  minResolvedDistance = MODEL_CAMERA_COLLISION_MIN_DISTANCE
) {
  output.copy(desired);
  if (!colliders?.size) return false;

  const path = desired.clone().sub(focus);
  const totalDistance = path.length();
  const minimumDistance = Math.max(MODEL_CAMERA_COLLISION_MIN_DISTANCE, minResolvedDistance);
  if (totalDistance <= minimumDistance) return false;

  const direction = path.multiplyScalar(1 / totalDistance);
  const ray = new THREE.Ray(focus, direction);
  const hitPoint = new THREE.Vector3();
  let closestDistance = Number.POSITIVE_INFINITY;

  colliders.forEach((entry) => {
    const box = entry.box;
    if (box.containsPoint(focus)) return;
    const hit = ray.intersectBox(box, hitPoint);
    if (!hit) return;
    const hitDistance = focus.distanceTo(hit);
    if (hitDistance <= minimumDistance || hitDistance >= totalDistance) return;
    closestDistance = Math.min(closestDistance, hitDistance);
  });

  if (!Number.isFinite(closestDistance)) return false;
  const resolvedDistance = closestDistance - MODEL_CAMERA_COLLISION_PADDING;
  if (resolvedDistance < minimumDistance) return false;
  output.copy(focus).addScaledVector(direction, resolvedDistance);
  return true;
}

function resolveCameraVisibilityCandidate(
  focus: THREE.Vector3,
  preferred: THREE.Vector3,
  relaxedPreferred: THREE.Vector3,
  fallbackSide: THREE.Vector3,
  colliders: Set<StageCameraColliderEntry> | undefined,
  visibilityPoints: THREE.Vector3[],
  output: THREE.Vector3,
  minDistance: number
) {
  output.copy(preferred);
  if (!colliders?.size || visibilityPoints.length === 0) return new Set<StageCameraColliderEntry>();

  const baseOffset = preferred.clone().sub(focus);
  baseOffset.y = 0;
  let baseDistance = baseOffset.length();
  if (baseDistance < 0.001) {
    baseOffset.set(fallbackSide.x, 0, fallbackSide.z);
    baseDistance = baseOffset.length();
  }
  if (baseDistance < 0.001) {
    baseOffset.set(0, 0, 1);
    baseDistance = 1;
  }
  const baseDirection = baseOffset.multiplyScalar(1 / baseDistance);
  const rightDirection = new THREE.Vector3(baseDirection.z, 0, -baseDirection.x);
  const safeDistance = Math.max(minDistance, baseDistance);
  const candidate = new THREE.Vector3();
  const direction = new THREE.Vector3();
  let bestScore = Number.POSITIVE_INFINITY;
  let bestBlockers = new Set<StageCameraColliderEntry>();

  const evaluate = (position: THREE.Vector3, preferencePenalty: number) => {
    const blockers = findCameraSightlineBlockers(position, visibilityPoints, colliders, {
      padding: CAMERA_VISIBILITY_SOLVER_PADDING,
      minDistanceFromPoint: 0.12
    });
    const horizontalDistance = Math.hypot(position.x - focus.x, position.z - focus.z);
    const distancePenalty = Math.max(0, minDistance - horizontalDistance) * 220;
    const movementPenalty = position.distanceTo(preferred) * 0.85;
    const heightPenalty = Math.max(0, position.y - preferred.y) * 0.18;
    const score = blockers.size * 10000 + distancePenalty + movementPenalty + heightPenalty + preferencePenalty;
    if (score < bestScore) {
      bestScore = score;
      bestBlockers = blockers;
      output.copy(position);
    }
  };

  const addPolarCandidate = (angle: number, distanceScale: number, heightOffset: number, preferencePenalty: number) => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    direction.set(
      baseDirection.x * cos + rightDirection.x * sin,
      0,
      baseDirection.z * cos + rightDirection.z * sin
    ).normalize();
    candidate.set(
      focus.x + direction.x * safeDistance * distanceScale,
      preferred.y + heightOffset,
      focus.z + direction.z * safeDistance * distanceScale
    );
    evaluate(candidate, preferencePenalty);
  };

  evaluate(preferred, 0);
  if (bestBlockers.size === 0) return bestBlockers;
  if (preferred.distanceToSquared(relaxedPreferred) > 0.0025) evaluate(relaxedPreferred, 1.4);
  evaluate(candidate.copy(preferred).addScaledVector(rightDirection, 1.25), 1.8);
  evaluate(candidate.copy(preferred).addScaledVector(rightDirection, -1.25), 1.8);
  evaluate(candidate.copy(preferred).setY(preferred.y + 0.85), 1.2);
  evaluate(candidate.copy(preferred).setY(preferred.y + 1.55), 2.2);

  addPolarCandidate(0, 1.16, 0.35, 1.6);
  addPolarCandidate(0, 1.3, 0.62, 2.8);
  [-0.62, -0.42, -0.24, 0.24, 0.42, 0.62].forEach((angle, index) => {
    addPolarCandidate(angle, 1.05 + (index % 2) * 0.08, 0.35 + Math.abs(angle) * 0.42, 2.4 + Math.abs(angle) * 2.8);
  });

  return bestBlockers;
}

function updateCameraStageOccluders(
  registry: StageCameraCollisionRegistry | null,
  stage: StageDefinition,
  cameraPosition: THREE.Vector3,
  visibilityPoints: THREE.Vector3[]
) {
  if (!registry) return;
  registry.occluders.clear();
  if (!registry.colliders.size) return;
  if (visibilityPoints.length === 0) return;
  const blockers = findCameraSightlineBlockers(cameraPosition, visibilityPoints, registry.colliders, { padding: CAMERA_VISIBILITY_FADE_PADDING, minDistanceFromPoint: 0.12 });
  blockers.forEach((entry) => registry.occluders.add(entry));
  if (blockers.size > 0 && isCameraOutsideStageSafetyEnvelope(stage, cameraPosition)) {
    registry.colliders.forEach((entry) => {
      if (!entry.boundaryFade) return;
      registry.occluders.add(entry);
      entry.fade = 1;
      applyStageCameraFade(entry);
    });
  }
}

function fillCameraVisibilityPoints(
  points: THREE.Vector3[],
  p1: FighterRuntime,
  p2: FighterRuntime,
  fallbackFocus: THREE.Vector3
) {
  const p1x = finiteOr(p1.position.x, fallbackFocus.x - 0.65);
  const p1y = finiteOr(p1.position.y, 0);
  const p1z = finiteOr(p1.position.z, fallbackFocus.z);
  const p2x = finiteOr(p2.position.x, fallbackFocus.x + 0.65);
  const p2y = finiteOr(p2.position.y, 0);
  const p2z = finiteOr(p2.position.z, fallbackFocus.z);
  const midX = (p1x + p2x) / 2;
  const midZ = (p1z + p2z) / 2;
  points[0].set(midX, Math.max(0.95, fallbackFocus.y), midZ);
  points[1].set(p1x, 1.04 + p1y * 0.22, p1z);
  points[2].set(p1x, 1.78 + p1y * 0.18, p1z);
  points[3].set(p2x, 1.04 + p2y * 0.22, p2z);
  points[4].set(p2x, 1.78 + p2y * 0.18, p2z);
  return points;
}

function StageCameraOcclusionFader() {
  const registry = useContext(StageCameraCollisionContext);
  useFrame((_, delta) => {
    if (!registry?.colliders.size) return;
    registry.colliders.forEach((entry) => {
      const target = registry.occluders.has(entry) ? 1 : 0;
      const speed = target > entry.fade ? 14 : 5.8;
      entry.fade = THREE.MathUtils.lerp(entry.fade, target, cameraDamp(delta, speed));
      applyStageCameraFade(entry);
    });
  });
  return null;
}

function applyStageCameraFade(entry: StageCameraColliderEntry) {
  const fade = THREE.MathUtils.clamp(entry.fade, 0, 1);
  entry.materials.forEach((state) => {
    const targetOpacity = Math.min(state.opacity, 0.24);
    if (fade <= 0.002) {
      if (state.material.transparent !== state.transparent || state.material.depthWrite !== state.depthWrite) {
        state.material.transparent = state.transparent;
        state.material.depthWrite = state.depthWrite;
        state.material.needsUpdate = true;
      }
      state.material.opacity = state.opacity;
      return;
    }
    if (!state.material.transparent || state.material.depthWrite) {
      state.material.transparent = true;
      state.material.depthWrite = false;
      state.material.needsUpdate = true;
    }
    state.material.opacity = THREE.MathUtils.lerp(state.opacity, targetOpacity, fade);
  });
}

type ImpactCameraPulse = {
  age: number;
  duration: number;
  shake: number;
  zoom: number;
  phase: number;
};

function CameraRig({ match, settings, reducedMotion = false, impactFeedbackEnabled = true }: { match: MatchSnapshot; settings: GameSettings['camera']; reducedMotion?: boolean; impactFeedbackEnabled?: boolean }) {
  const { camera, size } = useThree();
  const cameraCollisionRegistry = useContext(StageCameraCollisionContext);
  const modelStageCamera = isModelStage(match.stage);
  const visualStyle = useMemo(() => resolveStageVisualStyle(match.stage), [match.stage]);
  const target = useMemo(() => new THREE.Vector3(), []);
  const focus = useMemo(() => new THREE.Vector3(), []);
  const lookFocus = useMemo(() => new THREE.Vector3(), []);
  const side = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  const rawFocus = useMemo(() => new THREE.Vector3(), []);
  const rawLookFocus = useMemo(() => new THREE.Vector3(), []);
  const rawSide = useMemo(() => new THREE.Vector3(), []);
  const desired = useMemo(() => new THREE.Vector3(), []);
  const relaxedDesired = useMemo(() => new THREE.Vector3(), []);
  const boundaryAdjustedDesired = useMemo(() => new THREE.Vector3(), []);
  const visibilityAdjustedDesired = useMemo(() => new THREE.Vector3(), []);
  const collisionAdjustedDesired = useMemo(() => new THREE.Vector3(), []);
  const visibilityPoints = useMemo(() => Array.from({ length: 5 }, () => new THREE.Vector3()), []);
  const initializedRef = useRef(false);
  const cameraDistanceRef = useRef(6.4);
  const cameraHeightRef = useRef(2.8);
  const lastImpactCameraEventIdRef = useRef(0);
  const impactCameraPulseRef = useRef<ImpactCameraPulse>({ age: 1, duration: 1, shake: 0, zoom: 0, phase: 0 });
  useEffect(() => {
    return () => {
      if (!cameraCollisionRegistry) return;
      cameraCollisionRegistry.occluders.clear();
    };
  }, [cameraCollisionRegistry]);
  useFrame((_, delta) => {
    camera.near = 0.05;
    camera.far = modelStageCamera ? 1400 : 300;
    camera.updateProjectionMatrix();
    const [p1, p2] = match.fighters;
    const latestImpact = match.impactEvents[match.impactEvents.length - 1];
    if (reducedMotion || !impactFeedbackEnabled) {
      impactCameraPulseRef.current.age = impactCameraPulseRef.current.duration;
    } else if (latestImpact && latestImpact.id !== lastImpactCameraEventIdRef.current) {
      lastImpactCameraEventIdRef.current = latestImpact.id;
      impactCameraPulseRef.current = resolveImpactCameraPulse(latestImpact, visualStyle);
    }
    const impactCameraPulse = impactCameraPulseRef.current;
    impactCameraPulse.age = Math.min(impactCameraPulse.duration, impactCameraPulse.age + delta);
    if (match.roundFinisher) {
      const [impactX, impactY, impactZ] = match.roundFinisher.impactPosition;
      const p1x = finiteOr(p1.position.x, impactX - 0.65);
      const p1y = finiteOr(p1.position.y, 0);
      const p1z = finiteOr(p1.position.z, impactZ);
      const p2x = finiteOr(p2.position.x, impactX + 0.65);
      const p2y = finiteOr(p2.position.y, 0);
      const p2z = finiteOr(p2.position.z, impactZ);
      const dx = p2x - p1x;
      const dz = p2z - p1z;
      const distance = Math.hypot(dx, dz);
      const [cameraX, cameraZ] = stableFightCameraSide(dx, dz);
      rawSide.set(cameraX, 0, cameraZ).normalize();
      if (rawSide.lengthSq() < 0.0001) rawSide.copy(side.lengthSq() > 0.0001 ? side : rawSide.set(0, 0, 1));
      if (shouldFlipCameraSideForControls(rawSide, side, match.stage)) rawSide.multiplyScalar(-1);

      const perspective = camera as THREE.PerspectiveCamera;
      const aspect = size.width / Math.max(1, size.height);
      const verticalFov = THREE.MathUtils.degToRad(perspective.fov);
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
      const horizontalFit = (distance * 0.5 + 1.2) / Math.tan(horizontalFov / 2);
      const verticalSpan = 2.15 + Math.max(p1y, p2y, finiteOr(impactY, 1.1)) * 0.34;
      const verticalFit = verticalSpan / Math.tan(verticalFov / 2);
      const distanceScale = settings.distance * settings.zoomBias * match.roundFinisher.cameraZoomScale;
      const cameraDistance = THREE.MathUtils.clamp(
        Math.max(horizontalFit, verticalFit, 4.35) * distanceScale,
        MIN_FIGHT_CAMERA_DISTANCE,
        16
      );
      const cameraHeight = THREE.MathUtils.clamp(
        (2.08 + cameraDistance * 0.1 + Math.max(p1y, p2y) * 0.16) * settings.height,
        1.9,
        5.2
      );
      rawFocus.set(finiteOr(impactX, (p1x + p2x) / 2), 0, finiteOr(impactZ, (p1z + p2z) / 2));
      rawLookFocus.set(rawFocus.x, Math.max(1.02, finiteOr(impactY, 1.05)), rawFocus.z);
      if (!initializedRef.current) {
        initializedRef.current = true;
        focus.copy(rawFocus);
        lookFocus.copy(rawLookFocus);
        side.copy(rawSide);
        cameraDistanceRef.current = cameraDistance;
        cameraHeightRef.current = cameraHeight;
      }
      const smoothing = Math.max(0.35, settings.smoothing);
      focus.lerp(rawFocus, cameraDamp(delta, 7.2 * smoothing));
      lookFocus.lerp(rawLookFocus, cameraDamp(delta, 8.4 * smoothing));
      side.lerp(rawSide, cameraDamp(delta, 4.8 * smoothing)).normalize();
      cameraDistanceRef.current = THREE.MathUtils.lerp(cameraDistanceRef.current, cameraDistance, cameraDamp(delta, 5.6 * smoothing));
      cameraHeightRef.current = THREE.MathUtils.lerp(cameraHeightRef.current, cameraHeight, cameraDamp(delta, 5.2 * smoothing));
      desired.set(
        focus.x + side.x * cameraDistanceRef.current,
        cameraHeightRef.current,
        focus.z + side.z * cameraDistanceRef.current
      );
      relaxedDesired.copy(desired);
      enforceVectorHorizontalDistance(relaxedDesired, lookFocus, side, MIN_FIGHT_CAMERA_DISTANCE);
      resolveCameraBoundaryNudge(match.stage, lookFocus, desired, boundaryAdjustedDesired);
      enforceVectorHorizontalDistance(boundaryAdjustedDesired, lookFocus, side, MIN_FIGHT_CAMERA_DISTANCE);
      const targetBlockers = resolveCameraVisibilityCandidate(
        lookFocus,
        boundaryAdjustedDesired,
        relaxedDesired,
        side,
        cameraCollisionRegistry?.colliders,
        fillCameraVisibilityPoints(visibilityPoints, p1, p2, lookFocus),
        visibilityAdjustedDesired,
        MIN_FIGHT_CAMERA_DISTANCE
      );
      const collided = targetBlockers.size > 0
        ? resolveCameraModelCollision(lookFocus, visibilityAdjustedDesired, cameraCollisionRegistry?.colliders, collisionAdjustedDesired, MIN_FIGHT_CAMERA_DISTANCE)
        : false;
      if (!collided) collisionAdjustedDesired.copy(visibilityAdjustedDesired);
      camera.position.lerp(collisionAdjustedDesired, cameraDamp(delta, 6.2 * smoothing));
      const currentCollided = resolveCameraModelCollision(lookFocus, camera.position, cameraCollisionRegistry?.colliders, camera.position, MIN_FIGHT_CAMERA_DISTANCE);
      if (!collided && !currentCollided) enforceCameraHorizontalDistance(camera, lookFocus, side, MIN_FIGHT_CAMERA_DISTANCE);
      applySubtleImpactCameraPulse(camera, side, impactCameraPulse);
      camera.lookAt(lookFocus);
      updateCameraStageOccluders(cameraCollisionRegistry, match.stage, camera.position, visibilityPoints);
      return;
    }
    if (match.clashState?.status !== 'none') {
      const [x, y, z] = match.clashState.contactPoint;
      const contactX = finiteOr(x, focus.x);
      const contactY = finiteOr(y, lookFocus.y);
      const contactZ = finiteOr(z, focus.z);
      const p1x = finiteOr(p1.position.x, contactX - 0.5);
      const p1z = finiteOr(p1.position.z, contactZ);
      const p2x = finiteOr(p2.position.x, contactX + 0.5);
      const p2z = finiteOr(p2.position.z, contactZ);
      const dx = p2x - p1x;
      const dz = p2z - p1z;
      const [computedCameraX, computedCameraZ] = stableFightCameraSide(dx, dz);
      rawSide.set(computedCameraX, 0, computedCameraZ).normalize();
      if (rawSide.lengthSq() < 0.0001) rawSide.copy(side.lengthSq() > 0.0001 ? side : rawSide.set(0, 0, 1));
      if (shouldFlipCameraSideForControls(rawSide, side, match.stage)) rawSide.multiplyScalar(-1);
      const cameraX = rawSide.x;
      const cameraZ = rawSide.z;
      const cameraDistance = THREE.MathUtils.clamp(
        4.3 * settings.distance * settings.zoomBias,
        MIN_CLASH_CAMERA_DISTANCE,
        6.6
      );
      desired.set(contactX + cameraX * cameraDistance, Math.max(2.15, contactY + 1.15), contactZ + cameraZ * cameraDistance);
      target.set(contactX, Math.max(1.12, contactY), contactZ);
      relaxedDesired.copy(desired);
      enforceVectorHorizontalDistance(relaxedDesired, target, rawSide, MIN_CLASH_CAMERA_DISTANCE);
      resolveCameraBoundaryNudge(match.stage, target, desired, boundaryAdjustedDesired);
      enforceVectorHorizontalDistance(boundaryAdjustedDesired, target, rawSide, MIN_CLASH_CAMERA_DISTANCE);
      const targetBlockers = resolveCameraVisibilityCandidate(
        target,
        boundaryAdjustedDesired,
        relaxedDesired,
        rawSide,
        cameraCollisionRegistry?.colliders,
        fillCameraVisibilityPoints(visibilityPoints, p1, p2, target),
        visibilityAdjustedDesired,
        MIN_CLASH_CAMERA_DISTANCE
      );
      const collided = targetBlockers.size > 0
        ? resolveCameraModelCollision(target, visibilityAdjustedDesired, cameraCollisionRegistry?.colliders, collisionAdjustedDesired, MIN_CLASH_CAMERA_DISTANCE)
        : false;
      if (!collided) collisionAdjustedDesired.copy(visibilityAdjustedDesired);
      camera.position.lerp(collisionAdjustedDesired, 1 - Math.pow(0.0000001, delta * Math.max(0.8, settings.smoothing * 1.7)));
      const currentCollided = resolveCameraModelCollision(target, camera.position, cameraCollisionRegistry?.colliders, camera.position, MIN_CLASH_CAMERA_DISTANCE);
      if (!collided && !currentCollided) enforceCameraHorizontalDistance(camera, target, rawSide, MIN_CLASH_CAMERA_DISTANCE);
      applySubtleImpactCameraPulse(camera, rawSide, impactCameraPulse);
      camera.lookAt(target);
      updateCameraStageOccluders(cameraCollisionRegistry, match.stage, camera.position, visibilityPoints);
      return;
    }
    const p1x = finiteOr(p1.position.x, focus.x - 0.65);
    const p1y = finiteOr(p1.position.y, 0);
    const p1z = finiteOr(p1.position.z, focus.z);
    const p2x = finiteOr(p2.position.x, focus.x + 0.65);
    const p2y = finiteOr(p2.position.y, 0);
    const p2z = finiteOr(p2.position.z, focus.z);
    const midX = (p1x + p2x) / 2;
    const midZ = (p1z + p2z) / 2;
    const midY = Math.max(0.92, 0.86 + (p1y + p2y) * 0.18);
    const dx = p2x - p1x;
    const dz = p2z - p1z;
    const distance = Math.hypot(dx, dz);
    const [cameraX, cameraZ] = stableFightCameraSide(dx, dz);
    rawSide.set(cameraX, 0, cameraZ).normalize();
    if (rawSide.lengthSq() < 0.0001) rawSide.copy(side.lengthSq() > 0.0001 ? side : rawSide.set(0, 0, 1));
    if (shouldFlipCameraSideForControls(rawSide, side, match.stage)) rawSide.multiplyScalar(-1);
    logFightCameraInputDebug({
      mode: 'normal',
      rawSideX: Number(rawSide.x.toFixed(3)),
      rawSideZ: Number(rawSide.z.toFixed(3)),
      smoothedSideX: Number(side.x.toFixed(3)),
      smoothedSideZ: Number(side.z.toFixed(3)),
      screenRightStageAlignment: Number(cameraScreenRightStageAlignment(rawSide, match.stage).toFixed(3)),
      p1: {
        x: Number(p1x.toFixed(3)),
        z: Number(p1z.toFixed(3)),
        controlSideSign: p1.controlSideSign,
        facing: p1.facing,
        laneOrbitControlLocked: p1.laneOrbitControlLocked,
        sidestepDirection: p1.sidestepDirection
      },
      p2: {
        x: Number(p2x.toFixed(3)),
        z: Number(p2z.toFixed(3)),
        controlSideSign: p2.controlSideSign,
        facing: p2.facing,
        laneOrbitControlLocked: p2.laneOrbitControlLocked,
        sidestepDirection: p2.sidestepDirection
      }
    });

    const perspective = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const verticalFov = THREE.MathUtils.degToRad(perspective.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
    const horizontalFit = (distance * 0.5 + 1.55) / Math.tan(horizontalFov / 2);
    const verticalSpan = 2.65 + Math.max(p1y, p2y) * 0.55;
    const verticalFit = verticalSpan / Math.tan(verticalFov / 2);
    const distanceScale = settings.distance * settings.zoomBias;
    const cameraDistance = THREE.MathUtils.clamp(
      Math.max(horizontalFit, verticalFit, 5.2) * distanceScale,
      MIN_FIGHT_CAMERA_DISTANCE,
      21
    );
    const cameraHeight = THREE.MathUtils.clamp(
      (2.35 + cameraDistance * 0.13 + Math.max(p1y, p2y) * 0.22) * settings.height,
      2.2,
      6.4
    );

    rawFocus.set(midX, 0, midZ);
    rawLookFocus.set(midX, midY, midZ);
    if (!initializedRef.current) {
      initializedRef.current = true;
      focus.copy(rawFocus);
      lookFocus.copy(rawLookFocus);
      side.copy(rawSide);
      cameraDistanceRef.current = cameraDistance;
      cameraHeightRef.current = cameraHeight;
    }

    const smoothing = Math.max(0.35, settings.smoothing);
    const sidestepping = isFighterLaneOrbitCameraActive(p1) || isFighterLaneOrbitCameraActive(p2);
    const sidestepCameraBoost = sidestepping ? 4.5 : 1;
    const sidestepRigBoost = sidestepping ? 2.4 : 1;
    const sideFollowScale = sidestepping ? 0.82 : 1;
    focus.lerp(rawFocus, cameraDamp(delta, 4.25 * smoothing * sidestepCameraBoost));
    lookFocus.lerp(rawLookFocus, cameraDamp(delta, 5.2 * smoothing * sidestepCameraBoost));
    side.lerp(rawSide, cameraDamp(delta, 2.15 * smoothing * sideFollowScale)).normalize();
    cameraDistanceRef.current = THREE.MathUtils.lerp(cameraDistanceRef.current, cameraDistance, cameraDamp(delta, 2.35 * smoothing * sidestepRigBoost));
    cameraHeightRef.current = THREE.MathUtils.lerp(cameraHeightRef.current, cameraHeight, cameraDamp(delta, 2.75 * smoothing * sidestepRigBoost));

    desired.set(
      focus.x + side.x * cameraDistanceRef.current,
      cameraHeightRef.current,
      focus.z + side.z * cameraDistanceRef.current
    );
    relaxedDesired.copy(desired);
    enforceVectorHorizontalDistance(relaxedDesired, lookFocus, side, MIN_FIGHT_CAMERA_DISTANCE);
    resolveCameraBoundaryNudge(match.stage, lookFocus, desired, boundaryAdjustedDesired);
    enforceVectorHorizontalDistance(boundaryAdjustedDesired, lookFocus, side, MIN_FIGHT_CAMERA_DISTANCE);
    const targetBlockers = resolveCameraVisibilityCandidate(
      lookFocus,
      boundaryAdjustedDesired,
      relaxedDesired,
      side,
      cameraCollisionRegistry?.colliders,
      fillCameraVisibilityPoints(visibilityPoints, p1, p2, lookFocus),
      visibilityAdjustedDesired,
      MIN_FIGHT_CAMERA_DISTANCE
    );
    const collided = targetBlockers.size > 0
      ? resolveCameraModelCollision(lookFocus, visibilityAdjustedDesired, cameraCollisionRegistry?.colliders, collisionAdjustedDesired, MIN_FIGHT_CAMERA_DISTANCE)
      : false;
    if (!collided) collisionAdjustedDesired.copy(visibilityAdjustedDesired);
    camera.position.lerp(collisionAdjustedDesired, cameraDamp(delta, 3.1 * smoothing * sidestepCameraBoost));
    const currentCollided = resolveCameraModelCollision(lookFocus, camera.position, cameraCollisionRegistry?.colliders, camera.position, MIN_FIGHT_CAMERA_DISTANCE);
    if (!collided && !currentCollided) enforceCameraHorizontalDistance(camera, lookFocus, side, MIN_FIGHT_CAMERA_DISTANCE);
    applySubtleImpactCameraPulse(camera, side, impactCameraPulse);
    camera.lookAt(lookFocus);
    updateCameraStageOccluders(cameraCollisionRegistry, match.stage, camera.position, visibilityPoints);
  });
  return null;
}

function resolveImpactCameraPulse(event: ImpactSparkEvent, visualStyle: StageVisualStyle): ImpactCameraPulse {
  const isPower = event.kind === 'counterHit' || event.kind === 'punish' || event.kind === 'whiffPunish' || event.kind === 'clash' || event.launched || event.juggled || event.tornado || event.kiBurst;
  const styleShake = THREE.MathUtils.clamp(visualStyle.camera.impactShake, 0, 0.2);
  const styleZoom = THREE.MathUtils.clamp(event.kind === 'clash' ? visualStyle.camera.clashZoom : visualStyle.camera.impactZoom, 0, 0.12);
  const hitScale = event.kind === 'block' ? 0.42 : isPower ? 0.78 : 0.52;
  return {
    age: 0,
    duration: event.kind === 'clash' ? 0.24 : 0.18,
    shake: THREE.MathUtils.clamp(styleShake * hitScale * 0.16, 0, isPower ? 0.025 : 0.016),
    zoom: THREE.MathUtils.clamp(styleZoom * hitScale * 0.22, 0, isPower ? 0.018 : 0.01),
    phase: event.id * 1.618
  };
}

function applySubtleImpactCameraPulse(camera: THREE.Camera, side: THREE.Vector3, pulse: ImpactCameraPulse) {
  if (pulse.shake <= 0 || pulse.age >= pulse.duration) return;
  const progress = THREE.MathUtils.clamp(pulse.age / Math.max(0.001, pulse.duration), 0, 1);
  const fade = Math.pow(1 - progress, 1.7);
  const wave = Math.sin(progress * Math.PI * 2.4 + pulse.phase);
  const verticalWave = Math.cos(progress * Math.PI * 2.1 + pulse.phase * 0.7);
  camera.position.addScaledVector(side, -pulse.zoom * fade);
  camera.position.x += side.z * wave * pulse.shake * fade;
  camera.position.z -= side.x * wave * pulse.shake * fade;
  camera.position.y += verticalWave * pulse.shake * 0.34 * fade;
}

function Arena({
  stage,
  fighters,
  impactEvents,
  selectedPropId,
  onSelectProp,
  showFightLaneMarkers = false
}: {
  stage: MatchSnapshot['stage'];
  fighters?: FighterRuntime[];
  impactEvents?: ImpactSparkEvent[];
  selectedPropId?: string;
  onSelectProp?: (propId: string) => void;
  showFightLaneMarkers?: boolean;
}) {
  const modelStage = isModelStage(stage);
  useEffect(() => {
    logStageModelDebug('H9 Arena branch decision', {
      stageId: stage.id,
      renderMode: stage.renderMode,
      modelStage,
      modelPath: stage.model?.path,
      modelUrl: stage.model?.url
    });
  }, [modelStage, stage.id, stage.model?.path, stage.model?.url, stage.renderMode]);
  const horizonBlocks = useMemo(
    () => [
      [-18, 0.55, -12, 4.8, 1.1, 0.5],
      [-12, 0.72, -13.2, 3.2, 1.44, 0.5],
      [-6.4, 0.46, -12.4, 4.1, 0.92, 0.5],
      [7, 0.58, -12.8, 5.4, 1.16, 0.5],
      [14.8, 0.82, -13.6, 3.8, 1.64, 0.5],
      [21, 0.42, -12.2, 6.2, 0.84, 0.5]
    ] as const,
    []
  );

  if (stage.renderMode === 'spriteCutout') {
    return <SpriteCutoutStage stage={stage} fighters={fighters} impactEvents={impactEvents} selectedPropId={selectedPropId} onSelectProp={onSelectProp} />;
  }

  if (modelStage) {
    return <ModelStage stage={stage} fighters={fighters} impactEvents={impactEvents} selectedPropId={selectedPropId} onSelectProp={onSelectProp} showFightLaneMarkers={showFightLaneMarkers} />;
  }

  const floorTexturePath = stage.floorTexturePath;
  if (floorTexturePath) {
    return <TexturedInfiniteArena stage={stage} floorTexturePath={floorTexturePath} fighters={fighters} impactEvents={impactEvents} showFightLaneMarkers={showFightLaneMarkers} />;
  }

  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.045, 0]}>
        <planeGeometry args={[96, 42, 48, 24]} />
        <meshLambertMaterial color={stage.floor} transparent opacity={0.96} />
      </mesh>
      <mesh receiveShadow position={[0, -0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[38, 19, 36, 18]} />
        <meshLambertMaterial color="#0d2140" transparent opacity={0.74} />
      </mesh>
      <gridHelper args={[48, 48, stage.rail, '#14345d']} position={[0, 0.004, 0]} />
      <gridHelper args={[96, 48, '#174d88', '#071d35']} position={[0, -0.006, 0]} />
      {showFightLaneMarkers && <StageFightLaneMarkers stage={stage} />}
      {horizonBlocks.map(([x, y, z, width, height, depth], index) => (
        <mesh key={`horizon-${index}`} position={[x, y, z]} castShadow receiveShadow>
          <boxGeometry args={[width, height, depth]} />
          <meshLambertMaterial color="#030712" transparent opacity={0.74} />
        </mesh>
      ))}
      <mesh position={[0, 3.65, -14.4]}>
        <circleGeometry args={[1.65, 72]} />
        <meshBasicMaterial color="#f1f5ff" transparent opacity={0.58} />
      </mesh>
      <mesh position={[0, 3.65, -14.42]}>
        <ringGeometry args={[1.65, 2.05, 72]} />
        <meshBasicMaterial color={stage.rail} transparent opacity={0.15} />
      </mesh>
      <StageSafePlatform stage={stage} />
      <UpgradedStageFloorEffects stage={stage} fighters={fighters} impactEvents={impactEvents} />
    </group>
  );
}

function ModelStage({
  stage,
  fighters,
  impactEvents,
  selectedPropId,
  onSelectProp,
  showFightLaneMarkers = false
}: {
  stage: StageDefinition;
  fighters?: FighterRuntime[];
  impactEvents?: ImpactSparkEvent[];
  selectedPropId?: string;
  onSelectProp?: (propId: string) => void;
  showFightLaneMarkers?: boolean;
}) {
  const modelDefinition = resolveStageModelDefinition(stage);
  const modelPath = modelDefinition ? resolveStageModelUrl(stage) : '';
  useEffect(() => {
    logStageModelDebug('H10 ModelStage mounted', {
      stageId: stage.id,
      renderMode: stage.renderMode,
      hasModelDefinition: Boolean(modelDefinition),
      modelPath,
      originalModelPath: stage.model?.path,
      originalModelUrl: stage.model?.url
    });
  }, [modelDefinition, modelPath, stage.id, stage.model?.path, stage.model?.url, stage.renderMode]);
  useEffect(() => {
    logStageModelDebug('H29-H38 model world insertion hypotheses registered', {
      stageId: stage.id,
      hypotheses: MODEL_STAGE_WORLD_HYPOTHESES
    });
    logStageModelDebug('H50-H59 Stages local-dev disappearance hypotheses registered', {
      stageId: stage.id,
      hypotheses: MODEL_STAGE_DEV_EDITOR_HYPOTHESES
    });
    if (!modelPath) return;
    let cancelled = false;
    const controller = new AbortController();
    probeStageModelAsset(stage.id, modelPath, controller.signal)
      .catch((error) => {
        if (cancelled) return;
        logStageModelDebug('GLB asset probe threw', {
          stageId: stage.id,
          modelPath,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [modelPath, stage.id]);
  if (!modelPath || !modelDefinition) {
    return <TexturedInfiniteArena stage={stage} floorTexturePath={stage.floorTexturePath ?? '/stages/shared/handpainted-stone-platform.png'} fighters={fighters} impactEvents={impactEvents} />;
  }
  return (
    <group>
      <StageModelErrorBoundary stageId={stage.id} fallback={<ModelStageLoadFailureMarker stage={stage} />}>
        <Suspense fallback={<ModelStageLoadBackdrop stage={stage} />}>
          <StageModelScene stage={stage} modelDefinition={modelDefinition} />
        </Suspense>
      </StageModelErrorBoundary>
      {showFightLaneMarkers && <ModelStageFightLane stage={stage} />}
      {(modelDefinition?.decorativeProps ?? []).filter((prop) => !prop.hidden).map((prop) => (
        <StagePropPlane key={prop.id} prop={prop} selected={prop.id === selectedPropId} onSelectProp={onSelectProp} />
      ))}
    </group>
  );
}

type StageModelErrorBoundaryProps = {
  stageId: string;
  fallback: ReactNode;
  children: ReactNode;
};

type StageModelErrorBoundaryState = {
  error: Error | null;
};

class StageModelErrorBoundary extends Component<StageModelErrorBoundaryProps, StageModelErrorBoundaryState> {
  state: StageModelErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logStageModelDebug('H49 model render error boundary caught', {
      stageId: this.props.stageId,
      error: error.message,
      componentStack: info.componentStack?.slice(0, 1000)
    });
  }

  render() {
    if (this.state.error) return this.props.fallback;
    return this.props.children;
  }
}

function ModelStageLoadFailureMarker({ stage }: { stage: StageDefinition }) {
  useEffect(() => {
    logStageModelDebug('H49 model load failure marker rendered', {
      stageId: stage.id,
      modelPath: stage.model?.path,
      modelUrl: stage.model?.url
    });
  }, [stage.id, stage.model?.path, stage.model?.url]);
  return (
    <group position={[0, 1.4, 0]}>
      <mesh>
        <boxGeometry args={[2.4, 2.4, 2.4]} />
        <meshBasicMaterial color="#ff335d" wireframe fog={false} />
      </mesh>
      <mesh rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[3.4, 0.08, 3.4]} />
        <meshBasicMaterial color="#ffcc33" fog={false} />
      </mesh>
    </group>
  );
}

function ModelStageFightLane({ stage }: { stage: StageDefinition }) {
  return <StageFightLaneMarkers stage={stage} modelStage />;
}

function StagePlayableBoundsMarkers({ stage }: { stage: StageDefinition }) {
  const bounds = stage.playableBounds ?? {
    shape: 'box' as const,
    width: stage.fightPlane?.width ?? Math.max(10, Math.min(stage.world?.width ?? 24, 30)),
    depth: stage.fightPlane?.depth ?? Math.max(7, Math.min(stage.world?.depth ?? 16, 22))
  };
  const center = stage.fightPlane?.center ?? [0, stage.world?.floorY ?? 0, 0];
  const y = (stage.fightPlane?.y ?? center[1] ?? stage.world?.floorY ?? -0.045) + 0.032;
  const rotationY = stage.fightPlane?.rotationY ?? 0;
  const width = Math.max(4, bounds.width);
  const depth = Math.max(4, bounds.depth);
  const fillColor = '#ff3f73';
  const outlineColor = '#ffffff';
  const edgeOpacity = 0.92;
  const fillOpacity = 0.16;
  if (bounds.shape === 'ellipse') {
    return (
      <group position={[center[0], y, center[2]]} rotation={[0, rotationY, 0]} renderOrder={12}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[width / 2, depth / 2, 1]}>
          <circleGeometry args={[1, 96]} />
          <meshBasicMaterial color={fillColor} transparent opacity={fillOpacity} depthWrite={false} fog={false} />
        </mesh>
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[width / 2, depth / 2, 1]}>
          <ringGeometry args={[0.985, 1.015, 96]} />
          <meshBasicMaterial color={outlineColor} transparent opacity={edgeOpacity} depthWrite={false} fog={false} />
        </mesh>
      </group>
    );
  }
  return (
    <group position={[center[0], y, center[2]]} rotation={[0, rotationY, 0]} renderOrder={12}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial color={fillColor} transparent opacity={fillOpacity} depthWrite={false} fog={false} />
      </mesh>
      <mesh position={[0, 0.012, -depth / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, 0.08]} />
        <meshBasicMaterial color={outlineColor} transparent opacity={edgeOpacity} depthWrite={false} fog={false} />
      </mesh>
      <mesh position={[0, 0.012, depth / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, 0.08]} />
        <meshBasicMaterial color={outlineColor} transparent opacity={edgeOpacity} depthWrite={false} fog={false} />
      </mesh>
      <mesh position={[-width / 2, 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.08, depth]} />
        <meshBasicMaterial color={outlineColor} transparent opacity={edgeOpacity} depthWrite={false} fog={false} />
      </mesh>
      <mesh position={[width / 2, 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.08, depth]} />
        <meshBasicMaterial color={outlineColor} transparent opacity={edgeOpacity} depthWrite={false} fog={false} />
      </mesh>
    </group>
  );
}

function StageFightLaneMarkers({ stage, modelStage = false }: { stage: StageDefinition; modelStage?: boolean }) {
  const radius = stage.safePlatform?.radius ?? Math.max(5, Math.min(stage.fightPlane?.width ?? 12, stage.fightPlane?.depth ?? 8) * 0.5);
  const center = stage.fightPlane?.center ?? [0, 0, 0];
  const y = (stage.fightPlane?.y ?? center[1] ?? stage.world?.floorY ?? -0.045) + (modelStage ? 0.035 : 0.018);
  const rotationY = stage.fightPlane?.rotationY ?? 0;
  const width = stage.fightPlane?.width ?? radius * 2;
  const depth = stage.fightPlane?.depth ?? radius * 1.5;
  const p1 = stage.spawns?.p1 ?? [-3.2, 0, 0];
  const p2 = stage.spawns?.p2 ?? [3.2, 0, 0];
  const opacityScale = modelStage ? 1 : 0.62;
  return (
    <group renderOrder={9}>
      <group position={[center[0], y, center[2]]} rotation={[0, rotationY, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, Math.PI / 8]}>
          <circleGeometry args={[radius, 8]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.08 * opacityScale} depthWrite={false} fog={false} />
        </mesh>
        <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 8]}>
          <ringGeometry args={[radius * 0.985, radius * 1.015, 8]} />
          <meshBasicMaterial color={stage.rail} transparent opacity={0.7 * opacityScale} depthWrite={false} fog={false} />
        </mesh>
        <mesh position={[0, 0.008, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 8]}>
          <ringGeometry args={[Math.max(0.2, Math.min(width, depth) * 0.28), Math.max(0.4, Math.min(width, depth) * 0.31), 8]} />
          <meshBasicMaterial color={stage.rail} transparent opacity={0.42 * opacityScale} depthWrite={false} fog={false} />
        </mesh>
        <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
          <planeGeometry args={[0.12, Math.min(depth, radius * 1.75, 24)]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.62 * opacityScale} depthWrite={false} fog={false} />
        </mesh>
        <mesh position={[-width / 2, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.05, depth]} />
          <meshBasicMaterial color={stage.rail} transparent opacity={0.22 * opacityScale} depthWrite={false} fog={false} />
        </mesh>
        <mesh position={[width / 2, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.05, depth]} />
          <meshBasicMaterial color={stage.rail} transparent opacity={0.22 * opacityScale} depthWrite={false} fog={false} />
        </mesh>
      </group>
      {[p1, p2].map((spawn, index) => (
        <mesh key={`model-stage-spawn-${index}`} position={[spawn[0], y + 0.018, spawn[2]]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.62, 0.82, 40]} />
          <meshBasicMaterial color={index === 0 ? '#35e6ff' : '#ffbf2f'} transparent opacity={0.9} depthWrite={false} fog={false} />
        </mesh>
      ))}
    </group>
  );
}

function ModelStageLoadBackdrop({ stage }: { stage: StageDefinition }) {
  const progress = useProgress();
  useEffect(() => {
    logStageModelDebug('H11-H18 Suspense fallback/progress', {
      stageId: stage.id,
      active: progress.active,
      progress: Math.round(progress.progress),
      loaded: progress.loaded,
      total: progress.total,
      item: progress.item,
      errors: progress.errors.length,
      modelPath: stage.model?.path,
      modelUrl: stage.model?.url
    });
  }, [progress.active, progress.errors.length, progress.item, progress.loaded, progress.progress, progress.total, stage.id, stage.model?.path, stage.model?.url]);
  return (
    <group renderOrder={-5}>
      <mesh position={[0, 1.4, 0]}>
        <boxGeometry args={[1.4, 1.4, 1.4]} />
        <meshBasicMaterial color="#35e6ff" wireframe fog={false} />
      </mesh>
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.15, 1.35, 36]} />
        <meshBasicMaterial color="#35e6ff" transparent opacity={0.75} depthWrite={false} fog={false} />
      </mesh>
    </group>
  );
}

function StageModelScene({ stage, modelDefinition }: { stage: StageDefinition; modelDefinition: StageModelDefinition }) {
  const modelPath = resolveStageModelUrl(stage);
  const modelGroupRef = useRef<THREE.Group>(null);
  const requestStartedAtRef = useRef(performance.now());
  const { gl, scene: rootScene, camera } = useThree();
  const extendStageLoader = useCallback((loader: { setKTX2Loader?: (ktx2Loader: KTX2Loader) => unknown }) => {
    if (!loader.setKTX2Loader) return;
    const ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath(STAGE_BASIS_TRANSCODER_PATH);
    ktx2Loader.detectSupport(gl);
    loader.setKTX2Loader(ktx2Loader);
  }, [gl]);
  const gltfRequestPath = useMemo(() => {
    requestStartedAtRef.current = performance.now();
    logStageModelDebug('H10 StageModelScene useGLTF requested', {
      stageId: stage.id,
      renderMode: stage.renderMode,
      modelPath
    });
    return modelPath;
  }, [modelPath, stage.id, stage.renderMode]);
  const gltf = useGLTF(gltfRequestPath, STAGE_DRACO_DECODER_PATH, true, extendStageLoader);
  useEffect(() => {
    markStageAssetDecoded(stage.id, gltfRequestPath);
    logStageModelDebug('H10 StageModelScene useGLTF resolved', {
      stageId: stage.id,
      renderMode: stage.renderMode,
      modelPath,
      childCount: gltf.scene.children.length,
      resolveMs: Math.round(performance.now() - requestStartedAtRef.current)
    });
  }, [gltf.scene, gltfRequestPath, modelPath, stage.id, stage.renderMode]);
  const basePosition = modelDefinition?.position ?? [0, 0, 0];
  const scale = modelDefinition?.scale ?? [1, 1, 1];
  const rotation = modelDefinition?.rotation ?? [0, 0, 0];
  const manifestBoundsBox = useMemo(() => stageModelBoundsToBox(modelDefinition.bounds), [modelDefinition.bounds]);
  const sceneClone = useMemo(() => {
    const cloned = gltf.scene.clone(true) as THREE.Object3D;
    cloned.visible = true;
    cloned.position.set(0, 0, 0);
    cloned.rotation.set(0, 0, 0);
    cloned.scale.setScalar(1);
    const normalization = normalizeStageModelSceneForRender(cloned, stage.id, modelDefinition, !manifestBoundsBox);
    cloned.updateMatrixWorld(true);
    const shouldBuildFlattenedMeshes = true;
    const flattenedMeshes = shouldBuildFlattenedMeshes ? createFlattenedStageModelMeshes(cloned, stage.id) : [];
    return { scene: cloned, normalization, flattenedMeshes };
  }, [gltf.scene, manifestBoundsBox, modelDefinition, modelPath, stage.id]);
  const scene = sceneClone.scene;
  const sceneNormalization = sceneClone.normalization;
  const flattenedMeshes = sceneClone.flattenedMeshes;
  const useFlattenedModel = flattenedMeshes.length > 0;
  const scenePreparation = useMemo(
    () => prepareStageModelSceneForRender(scene, stage.id, {
      boundsOverride: manifestBoundsBox,
      useGeometryPlaneHeuristic: !manifestBoundsBox
    }),
    [manifestBoundsBox, scene, stage.id]
  );
  const position = useMemo<[number, number, number]>(() => {
    if (modelDefinition.bounds) {
      return [basePosition[0] ?? 0, basePosition[1] ?? 0, basePosition[2] ?? 0];
    }
    const floorY = stage.world?.floorY ?? 0;
    const scaleY = scale[1] ?? 1;
    if (!hasSaneStageModelBounds(scenePreparation.visibleBounds)) {
      return [basePosition[0] ?? 0, basePosition[1] ?? 0, basePosition[2] ?? 0];
    }
    const transformedVisibleMinY = scenePreparation.visibleBounds.min.y * scaleY + (basePosition[1] ?? 0);
    const shouldGroundVisibleModel =
      !scenePreparation.visibleBounds.isEmpty() &&
      stage.id === 'hidden-leaf-village' &&
      Math.abs(transformedVisibleMinY - floorY) > 1.5;
    const groundOffsetY = shouldGroundVisibleModel ? floorY - transformedVisibleMinY : 0;
    return [basePosition[0] ?? 0, (basePosition[1] ?? 0) + groundOffsetY, basePosition[2] ?? 0];
  }, [basePosition, modelDefinition.bounds, scale, scenePreparation.visibleBounds, stage.id, stage.world?.floorY]);
  const sourceInspection = useMemo(() => {
    const sourceBounds = manifestBoundsBox ?? new THREE.Box3().setFromObject(gltf.scene);
    return {
      bounds: boxToDebugPayload(sourceBounds),
      tree: inspectModelObjectTree(gltf.scene)
    };
  }, [gltf.scene, manifestBoundsBox]);

  useEffect(() => {
    logStageModelDebug('H50 material/visibility normalization applied during GLB clone', {
      stageId: stage.id,
      normalizedMeshCount: sceneNormalization.normalizedMeshCount,
      normalizedMaterialCount: sceneNormalization.normalizedMaterialCount,
      flattenedMeshCount: flattenedMeshes.length,
      flattenedTriangleCount: flattenedMeshes.reduce((sum, mesh) => sum + mesh.triangleCount, 0),
      renderPath: useFlattenedModel ? 'flattened-react-meshes' : 'primitive-scene',
      strictModeSafe: true,
      firstRenderSafe: true
    });
  }, [flattenedMeshes, sceneNormalization.normalizedMaterialCount, sceneNormalization.normalizedMeshCount, stage.id, useFlattenedModel]);

  useEffect(() => {
    let cancelled = false;
    const modelGroup = modelGroupRef.current;
    if (!modelGroup) return undefined;
    modelGroup.updateWorldMatrix(true, true);
    const textures = collectStageModelTextures(modelGroup);
    try {
      textures.forEach((texture) => {
        gl.initTexture(texture);
      });
      markStageAssetGpuWarm(stage.id, gltfRequestPath);
      const compileResult = typeof gl.compileAsync === 'function'
        ? gl.compileAsync(modelGroup, camera, rootScene)
        : Promise.resolve(gl.compile(modelGroup, camera, rootScene));
      void compileResult
        .then(() => {
          if (!cancelled) markStageAssetReady(stage.id, gltfRequestPath);
        })
        .catch((error) => {
          if (!cancelled) markStageAssetError(stage.id, error, gltfRequestPath);
        });
    } catch (error) {
      markStageAssetError(stage.id, error, gltfRequestPath);
    }
    return () => {
      cancelled = true;
    };
  }, [camera, gl, gltfRequestPath, rootScene, scene, stage.id]);

  useEffect(() => {
    const cloneBounds = manifestBoundsBox?.clone() ?? new THREE.Box3().setFromObject(scene);
    const transformedProbe = new THREE.Object3D();
    transformedProbe.position.copy(tupleToVector(position, [0, 0, 0]));
    transformedProbe.scale.copy(tupleToVector(scale, [1, 1, 1]));
    transformedProbe.rotation.set(...rotation);
    transformedProbe.updateMatrixWorld(true);
    const transformedBounds = cloneBounds.clone().applyMatrix4(transformedProbe.matrixWorld);
    const visibleTransformedBounds = scenePreparation.visibleBounds.clone().applyMatrix4(transformedProbe.matrixWorld);
    const manifestBounds = modelDefinition.bounds;
    const manifestCenter = tupleToVector(manifestBounds?.center, [0, 0, 0]);
    const manifestSize = tupleToVector(manifestBounds?.size, [0, 0, 0]);
    const transformedSize = new THREE.Vector3();
    const transformedCenter = new THREE.Vector3();
    transformedBounds.getSize(transformedSize);
    transformedBounds.getCenter(transformedCenter);
    const materializedInspection = inspectModelObjectTree(scene);
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      const firstVisibleMesh = (() => {
        let sample: THREE.Mesh | null = null;
        scene.traverse((object) => {
          if (sample) return;
          const mesh = object as THREE.Mesh;
          if (mesh.isMesh && isEffectivelyVisible(mesh)) sample = mesh;
        });
        if (!sample) return null;
        const sampleMesh = sample as THREE.Mesh;
        return {
          name: sampleMesh.name || sampleMesh.type,
          path: objectDebugPath(sampleMesh),
          materialCount: meshMaterials(sampleMesh).length,
          triangles: sampleMesh.geometry ? getGeometryTriangleCount(sampleMesh.geometry) : 0
        };
      })();
      (window as Window & { __KORE_STAGE_MODEL_DEBUG?: unknown }).__KORE_STAGE_MODEL_DEBUG = {
        stageId: stage.id,
        modelPath,
        sourceBounds: sourceInspection.bounds,
        cloneBounds: boxToDebugPayload(cloneBounds),
        visibleCloneBounds: boxToDebugPayload(scenePreparation.visibleBounds),
        transformedBounds: boxToDebugPayload(transformedBounds),
        visibleTransformedBounds: boxToDebugPayload(visibleTransformedBounds),
        materializedInspection,
        scrubbedMeshCount: scenePreparation.hiddenMeshCount,
        scrubbedMeshSamples: scenePreparation.hiddenSamples,
        transform: { basePosition, position, scale, rotation },
        firstVisibleMesh
      };
    }
    logStageModelDebug('H19-H28 visibility hypotheses registered', {
      stageId: stage.id,
      hypotheses: MODEL_STAGE_VISIBILITY_HYPOTHESES
    });
    logStageModelDebug('H39-H48 model insertion hypotheses registered', {
      stageId: stage.id,
      hypotheses: MODEL_STAGE_INSERTION_HYPOTHESES
    });
    logStageModelDebug('H60-H69 Stages local-dev insertion hypotheses registered', {
      stageId: stage.id,
      hypotheses: MODEL_STAGE_DEV_EDITOR_HYPOTHESES_2
    });
    logStageModelDebug('H19-H21 model bounds inspected', {
      stageId: stage.id,
      modelPath,
      sourceBounds: sourceInspection.bounds,
      cloneBounds: boxToDebugPayload(cloneBounds),
      transformedBounds: boxToDebugPayload(transformedBounds),
      visibleCloneBounds: boxToDebugPayload(scenePreparation.visibleBounds),
      visibleTransformedBounds: boxToDebugPayload(visibleTransformedBounds),
      manifestBounds: manifestBounds
        ? {
            center: manifestBounds.center,
            size: manifestBounds.size,
            radius: manifestBounds.radius
          }
        : null,
      manifestRuntimeCenterDelta: manifestBounds?.center ? vectorToDebugArray(transformedCenter.sub(manifestCenter)) : null,
      manifestRuntimeSizeDelta: manifestBounds?.size ? vectorToDebugArray(transformedSize.sub(manifestSize)) : null,
      transform: { basePosition, position, scale, rotation },
      autoGroundOffsetY: roundDebugNumber(position[1] - (basePosition[1] ?? 0))
    });
    logStageModelDebug('H24-H27 model mesh/material inspected', {
      stageId: stage.id,
      sourceTree: sourceInspection.tree,
      renderedTree: materializedInspection,
      scrubbedMeshCount: scenePreparation.hiddenMeshCount,
      scrubbedMeshSamples: scenePreparation.hiddenSamples
    });
  }, [basePosition, manifestBoundsBox, modelDefinition.bounds, modelPath, position, rotation, scale, scene, scenePreparation.hiddenMeshCount, scenePreparation.hiddenSamples, scenePreparation.visibleBounds, sourceInspection, stage.id]);

  return (
    <group ref={modelGroupRef} position={position} scale={scale} rotation={rotation}>
      {useFlattenedModel ? <StageModelFlattenedMeshes meshes={flattenedMeshes} /> : <primitive object={scene} />}
      <StageModelCameraColliders stage={stage} modelGroupRef={modelGroupRef} />
      <StageModelRuntimeProbe stage={stage} modelDefinition={modelDefinition} modelGroupRef={modelGroupRef} />
    </group>
  );
}

function StageModelCameraColliders({
  stage,
  modelGroupRef
}: {
  stage: StageDefinition;
  modelGroupRef: RefObject<THREE.Group>;
}) {
  const registry = useContext(StageCameraCollisionContext);
  const collisionMode = stage.collision?.mode;
  const floorY = stage.fightPlane?.y ?? stage.world?.floorY ?? 0;
  const stageId = stage.id;
  useEffect(() => {
    if (!registry || collisionMode === 'none') return undefined;
    const modelGroup = modelGroupRef.current;
    if (!modelGroup) return undefined;
    const entries: StageCameraColliderEntry[] = [];
    modelGroup.updateWorldMatrix(true, true);
    modelGroup.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry?.getAttribute('position') || !isEffectivelyVisible(mesh)) return;
      if (getStageModelMeshHideReason(mesh, stageId, false)) return;
      const box = new THREE.Box3().setFromObject(mesh);
      if (!isUsableStageCameraColliderBox(box, floorY)) return;
      const entry: StageCameraColliderEntry = {
        id: mesh.uuid,
        mesh,
        box,
        materials: captureStageCameraMaterialStates(mesh),
        boundaryFade: isStageCameraBoundaryFadeBox(box),
        fade: 0
      };
      entries.push(entry);
      registry.colliders.add(entry);
    });
    logStageModelDebug('H70 camera model colliders registered', {
      stageId,
      colliderCount: entries.length,
      collisionMode: collisionMode ?? 'box'
    });
    return () => {
      entries.forEach((entry) => {
        entry.fade = 0;
        applyStageCameraFade(entry);
        registry.occluders.delete(entry);
        registry.colliders.delete(entry);
      });
    };
  }, [collisionMode, floorY, modelGroupRef, registry, stageId]);
  return null;
}

function captureStageCameraMaterialStates(mesh: THREE.Mesh): StageCameraMaterialState[] {
  return meshMaterials(mesh).map((rawMaterial) => {
    const material = rawMaterial as THREE.Material & { opacity?: number };
    return {
      material,
      transparent: material.transparent,
      opacity: material.opacity ?? 1,
      depthWrite: material.depthWrite
    };
  });
}

function isUsableStageCameraColliderBox(box: THREE.Box3, floorY: number) {
  if (box.isEmpty()) return false;
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxSize = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxSize) || maxSize < 0.05 || maxSize > 900) return false;
  return !isStageCameraFloorLikeBox(box, floorY);
}

function isStageCameraBoundaryFadeBox(box: THREE.Box3) {
  const size = new THREE.Vector3();
  box.getSize(size);
  const horizontalMin = Math.min(size.x, size.z);
  return size.y > 0.75 && (horizontalMin < 1.8 || size.y > horizontalMin * 0.65);
}

function isStageCameraFloorLikeBox(box: THREE.Box3, floorY: number) {
  const size = new THREE.Vector3();
  box.getSize(size);
  const broad = size.x > 3.5 && size.z > 3.5;
  if (!broad) return false;
  const shallow = size.y < 0.9 || size.y < Math.min(size.x, size.z) * 0.16;
  const nearFloor = box.min.y <= floorY + 0.55 && box.max.y <= floorY + 1.35;
  return shallow && nearFloor;
}

function StageModelFlattenedMeshes({ meshes }: { meshes: FlattenedStageModelMesh[] }) {
  return (
    <group renderOrder={-20}>
      {meshes.map((mesh) => (
        <mesh key={mesh.id} geometry={mesh.geometry} material={mesh.material} frustumCulled={false} renderOrder={-20} />
      ))}
    </group>
  );
}

function collectStageModelTextures(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshMaterials(mesh).forEach((material) => {
      Object.values(material).forEach((value) => {
        const texture = value as THREE.Texture;
        if (texture?.isTexture) textures.add(texture);
      });
    });
  });
  return textures;
}

function StageModelRuntimeProbe({
  stage,
  modelDefinition,
  modelGroupRef
}: {
  stage: StageDefinition;
  modelDefinition: StageModelDefinition;
  modelGroupRef: RefObject<THREE.Group>;
}) {
  const { camera, scene } = useThree();
  const loggedRef = useRef(false);
  useFrame(() => {
    if (loggedRef.current) return;
    const modelGroup = modelGroupRef.current;
    if (!modelGroup) return;
    loggedRef.current = true;
    modelGroup.updateWorldMatrix(true, true);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    const manifestBounds = stageModelBoundsToBox(modelDefinition.bounds);
    const bounds = manifestBounds?.clone().applyMatrix4(modelGroup.matrixWorld) ?? new THREE.Box3().setFromObject(modelGroup);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);
    const frustum = new THREE.Frustum();
    frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    const toModelCenter = center.clone().sub(camera.position);
    const distanceToCenter = toModelCenter.length();
    const directionDot = distanceToCenter > 0.001 ? cameraDirection.dot(toModelCenter.normalize()) : 1;
    const perspective = camera as THREE.PerspectiveCamera;
    logStageModelDebug('H22-H23 runtime camera/frustum inspected', {
      stageId: stage.id,
      cameraPosition: vectorToDebugArray(camera.position),
      cameraDirection: vectorToDebugArray(cameraDirection),
      cameraNear: roundDebugNumber(camera.near),
      cameraFar: roundDebugNumber(camera.far),
      cameraFov: 'fov' in perspective ? roundDebugNumber(perspective.fov) : null,
      modelBounds: boxToDebugPayload(bounds),
      modelCenterDistance: roundDebugNumber(distanceToCenter),
      cameraDirectionDotToModelCenter: roundDebugNumber(directionDot),
      frustumIntersectsModelBounds: frustum.intersectsBox(bounds),
      modelFocus: modelDefinition.focus ?? null,
      previewTarget: stage.camera?.previewTarget ?? null
    });
    logStageModelDebug('H28 occlusion ray inspected', {
      stageId: stage.id,
      skippedDenseRaycast: true,
      reason: 'Bounds/frustum logs are used instead because raycasting dense imported stages can stall the browser main thread.',
      modelGroupPath: objectDebugPath(modelGroup),
      sceneChildCount: scene.children.length
    });
  });
  return null;
}

function normalizeStageModelMaterial(material: THREE.Material | undefined, stageId?: string, meshKey = '') {
  if (!material) return material;
  const forceOpaqueStageMaterial = true;
  if (forceOpaqueStageMaterial) {
    const source = material as THREE.MeshStandardMaterial & {
      alphaMap?: THREE.Texture | null;
      emissiveMap?: THREE.Texture | null;
      map?: THREE.Texture | null;
      opacity?: number;
    };
    [source.map, source.emissiveMap].forEach((texture) => {
      if (!texture) return;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      texture.needsUpdate = true;
    });
    const stageMaterial = new THREE.MeshBasicMaterial({
      color: source.map ? '#ffffff' : colorFromString(meshKey || material.name || 'hidden-leaf-village'),
      map: source.map ?? null,
      transparent: false,
      opacity: 1,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false
    });
    stageMaterial.name = material.name;
    return stageMaterial;
  }
  const cloned = material.clone();
  const maybeMapped = cloned as THREE.MeshStandardMaterial & {
    alphaMap?: THREE.Texture | null;
    emissiveMap?: THREE.Texture | null;
    map?: THREE.Texture | null;
    opacity?: number;
  };
  [maybeMapped.map, maybeMapped.emissiveMap].forEach((texture) => {
    if (!texture) return;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  });
  cloned.needsUpdate = true;
  return cloned;
}

function ModelStageFightFloor({ stage, floorTexturePath }: { stage: StageDefinition; floorTexturePath: string }) {
  const texture = useLoader(THREE.TextureLoader, floorTexturePath);
  const repeat = stage.floorTextureRepeat ?? [10, 10];
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }, [repeat, texture]);

  return (
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, stage.world?.floorY ?? -0.045, 0]}>
      <planeGeometry args={[stage.world?.width ?? 52, stage.world?.depth ?? 42, 1, 1]} />
      <meshBasicMaterial map={texture} color="#ffffff" transparent opacity={0.86} />
    </mesh>
  );
}

function TexturedInfiniteArena({
  stage,
  floorTexturePath,
  fighters,
  impactEvents,
  showFightLaneMarkers = false
}: {
  stage: StageDefinition;
  floorTexturePath: string;
  fighters?: FighterRuntime[];
  impactEvents?: ImpactSparkEvent[];
  showFightLaneMarkers?: boolean;
}) {
  const texture = useLoader(THREE.TextureLoader, floorTexturePath);
  const repeat = stage.floorTextureRepeat ?? [24, 24];
  const [repeatX, repeatY] = repeat;
  const width = stage.world?.width ?? 220;
  const depth = stage.world?.depth ?? 220;

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }, [repeatX, repeatY, texture]);

  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, stage.world?.floorY ?? -0.045, 0]}>
        <planeGeometry args={[width, depth, 1, 1]} />
        <meshBasicMaterial map={texture} color="#ffffff" />
      </mesh>
      {showFightLaneMarkers && <StageFightLaneMarkers stage={stage} />}
      <StageSafePlatform stage={stage} />
      <UpgradedStageFloorEffects stage={stage} fighters={fighters} impactEvents={impactEvents} />
    </group>
  );
}

function StageSafePlatform({ stage }: { stage: StageDefinition }) {
  const platform = stage.safePlatform;
  if (!platform || platform.enabled === false) return null;
  const radius = platform.radius ?? 38;
  const height = platform.height ?? 0.16;
  const topY = (stage.world?.floorY ?? -0.045) + (platform.yOffset ?? 0.06);
  const sideY = topY - height / 2;
  const color = platform.color ?? stage.floor;
  const edgeColor = platform.edgeColor ?? stage.rail;
  const edgeOpacity = platform.edgeOpacity ?? 0.92;
  const top = platform.texturePath
    ? <TexturedSafePlatformTop platform={platform} radius={radius} y={topY + 0.003} fallbackColor={color} />
    : <ColoredSafePlatformTop radius={radius} y={topY + 0.003} color={color} />;

  return (
    <group renderOrder={8}>
      <mesh receiveShadow position={[0, sideY, 0]} rotation={[0, Math.PI / 8, 0]}>
        <cylinderGeometry args={[radius, radius * 1.012, height, 8, 1, false]} />
        <meshToonMaterial color={edgeColor} transparent opacity={edgeOpacity} />
      </mesh>
      {top}
      <mesh position={[0, topY + 0.01, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 8]}>
        <ringGeometry args={[radius * 0.986, radius * 1.012, 8]} />
        <meshBasicMaterial color={edgeColor} transparent opacity={0.44} depthWrite={false} />
      </mesh>
    </group>
  );
}

function TexturedSafePlatformTop({
  platform,
  radius,
  y,
  fallbackColor
}: {
  platform: NonNullable<StageDefinition['safePlatform']>;
  radius: number;
  y: number;
  fallbackColor: string;
}) {
  const texture = useLoader(THREE.TextureLoader, platform.texturePath ?? '');
  const repeat = platform.textureRepeat ?? [6, 6];
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }, [repeat, texture]);

  return (
    <mesh receiveShadow position={[0, y, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 8]}>
      <circleGeometry args={[radius, 8]} />
      <meshBasicMaterial map={texture} color="#ffffff" />
    </mesh>
  );
}

function ColoredSafePlatformTop({ radius, y, color }: { radius: number; y: number; color: string }) {
  return (
    <mesh receiveShadow position={[0, y, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 8]}>
      <circleGeometry args={[radius, 8]} />
      <meshToonMaterial color={color} />
    </mesh>
  );
}

function SpriteCutoutStage({
  stage,
  fighters,
  impactEvents,
  selectedPropId,
  onSelectProp
}: {
  stage: StageDefinition;
  fighters?: FighterRuntime[];
  impactEvents?: ImpactSparkEvent[];
  selectedPropId?: string;
  onSelectProp?: (propId: string) => void;
}) {
  const hillColor = stage.world?.backgroundColor ?? '#10291c';
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.052, 0]}>
        <planeGeometry args={[96, 42, 32, 18]} />
        <meshLambertMaterial color={stage.floor} />
      </mesh>
      {stage.floorTexturePath && <SpriteCutoutFloorTexture stage={stage} floorTexturePath={stage.floorTexturePath} />}
      <mesh receiveShadow position={[0, -0.028, 0.05]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[5.35, 72]} />
        <meshLambertMaterial color="#d7be6d" />
      </mesh>
      <mesh receiveShadow position={[0, -0.024, 0.05]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[14.8, 5.6]} />
        <meshLambertMaterial color="#d2b35e" transparent opacity={0.78} />
      </mesh>
      <mesh receiveShadow position={[0, -0.018, 3.7]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[34, 9.2]} />
        <meshLambertMaterial color="#2f7a3c" transparent opacity={0.76} />
      </mesh>
      <mesh receiveShadow position={[0, -0.018, -5.6]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[42, 12]} />
        <meshLambertMaterial color="#265f33" transparent opacity={0.72} />
      </mesh>
      <mesh position={[-7, 1.15, -14]} rotation={[0, 0, -0.14]}>
        <coneGeometry args={[4.9, 2.4, 3]} />
        <meshLambertMaterial color={hillColor} />
      </mesh>
      <mesh position={[-1.4, 1.3, -14.8]} rotation={[0, 0, 0.08]}>
        <coneGeometry args={[5.8, 2.7, 3]} />
        <meshLambertMaterial color="#2f8c82" />
      </mesh>
      <mesh position={[5.8, 1.1, -14.2]} rotation={[0, 0, 0.18]}>
        <coneGeometry args={[4.6, 2.2, 3]} />
        <meshLambertMaterial color="#4aa08c" />
      </mesh>
      <mesh position={[0, 1.75, -15.2]}>
        <boxGeometry args={[42, 0.18, 0.2]} />
        <meshBasicMaterial color="#b9edf5" transparent opacity={0.32} />
      </mesh>
      <gridHelper args={[28, 14, '#6bbf58', '#325f30']} position={[0, 0.002, 0]} />
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.8, 5.05, 72]} />
        <meshBasicMaterial color="#f0d27b" transparent opacity={0.26} />
      </mesh>
      <UpgradedStageFloorEffects stage={stage} fighters={fighters} impactEvents={impactEvents} />
      {(stage.backgroundLayers ?? []).map((layer) => (
        <StageLayerPlane key={layer.id} layer={layer} />
      ))}
      {(stage.props ?? []).filter((prop) => !prop.hidden).map((prop) => (
        <StagePropPlane key={prop.id} prop={prop} selected={prop.id === selectedPropId} onSelectProp={onSelectProp} />
      ))}
    </group>
  );
}

function SpriteCutoutFloorTexture({ stage, floorTexturePath }: { stage: StageDefinition; floorTexturePath: string }) {
  const texture = useLoader(THREE.TextureLoader, floorTexturePath);
  const repeat = stage.floorTextureRepeat ?? [12, 8];
  const width = stage.world?.width ?? 96;
  const depth = stage.world?.depth ?? 42;

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
  }, [repeat, texture]);

  return (
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, stage.world?.floorY ?? -0.045, 0.01]}>
      <planeGeometry args={[width, depth, 1, 1]} />
      <meshBasicMaterial map={texture} color="#ffffff" transparent alphaTest={0.04} />
    </mesh>
  );
}

function StageLayerPlane({ layer }: { layer: StageLayerDefinition }) {
  const tileX = (layer.tile?.[0] ?? 0) !== 0;
  const repeatOffsets = tileX ? [-2, -1, 0, 1, 2] : [0];
  const spacing = Math.abs(layer.scale[0]) + Math.max(0, layer.tileSpacing?.[0] ?? 0) / 48;
  return (
    <>
      {repeatOffsets.map((repeat) => (
        <StageTexturePlane
          key={`${layer.id}-${repeat}`}
          imagePath={layer.imagePath}
          position={[layer.position[0] + repeat * spacing, layer.position[1], layer.position[2]]}
          scale={layer.scale}
          rotation={layer.rotation}
          opacity={layer.opacity ?? 1}
          followCamera={layer.followCamera}
          parallax={layer.parallax}
        />
      ))}
    </>
  );
}

function StageTexturePlane({
  imagePath,
  position,
  scale,
  rotation,
  opacity,
  followCamera = false,
  parallax = [1, 1]
}: {
  imagePath: string;
  position: [number, number, number];
  scale: [number, number, number];
  rotation?: [number, number, number];
  opacity: number;
  followCamera?: boolean;
  parallax?: [number, number];
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const texture = useLoader(THREE.TextureLoader, imagePath);
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
  }, [texture]);
  useFrame(({ camera }) => {
    if (!followCamera || !mesh.current) return;
    mesh.current.position.x = position[0] + camera.position.x * (parallax[0] - 1);
    mesh.current.position.y = position[1] + (camera.position.y - 4) * (parallax[1] - 1) * 0.18;
  });
  return (
    <mesh ref={mesh} position={position} rotation={rotation ?? [0, 0, 0]} scale={scale} renderOrder={position[2] < 0 ? -10 : 2}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} transparent opacity={opacity} alphaTest={0.04} side={THREE.DoubleSide} depthWrite={false} depthTest={!followCamera} />
    </mesh>
  );
}

function StagePropPlane({
  prop,
  selected = false,
  onSelectProp
}: {
  prop: StagePropDefinition;
  selected?: boolean;
  onSelectProp?: (propId: string) => void;
}) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    if (prop.billboard && group.current) {
      group.current.quaternion.copy(camera.quaternion);
    }
  });
  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!onSelectProp) return;
    event.stopPropagation();
    onSelectProp(prop.id);
  };
  return (
    <group ref={group} position={prop.position} rotation={prop.rotation ?? [0, 0, 0]} onPointerDown={handlePointerDown}>
      {onSelectProp && <StagePropHitTarget prop={prop} onPointerDown={handlePointerDown} />}
      {prop.renderMode === 'voxel' ? (
        <StageVoxelProp prop={prop} />
      ) : (
        <StageTexturePlane imagePath={prop.imagePath} position={[0, 0, 0]} scale={prop.scale} opacity={prop.opacity ?? 1} />
      )}
      {selected && <StagePropSelectionFrame prop={prop} />}
    </group>
  );
}

function StagePropHitTarget({
  prop,
  onPointerDown
}: {
  prop: StagePropDefinition;
  onPointerDown: (event: ThreeEvent<PointerEvent>) => void;
}) {
  return (
    <mesh scale={[Math.max(0.28, Math.abs(prop.scale[0]) * 1.22), Math.max(0.28, Math.abs(prop.scale[1]) * 1.22), 1]} position={[0, 0, 0.1]} onPointerDown={onPointerDown} renderOrder={20}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.001} depthWrite={false} depthTest={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function StagePropSelectionFrame({ prop }: { prop: StagePropDefinition }) {
  return (
    <mesh scale={[Math.max(0.05, Math.abs(prop.scale[0]) * 1.08), Math.max(0.05, Math.abs(prop.scale[1]) * 1.08), 1]} position={[0, 0, 0.04]} renderOrder={12}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color="#2ee6ff" wireframe transparent opacity={0.9} depthTest={false} />
    </mesh>
  );
}

function StageVoxelProp({ prop }: { prop: StagePropDefinition }) {
  const texture = useLoader(THREE.TextureLoader, prop.imagePath);
  const geometry = useMemo(() => buildStageVoxelGeometry(texture, prop), [texture, prop.imagePath, prop.voxelDepth, prop.voxelScale]);

  useEffect(() => {
    return () => geometry?.dispose();
  }, [geometry]);

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
  }, [texture]);

  if (!geometry) {
    return <StageTexturePlane imagePath={prop.imagePath} position={[0, 0, 0]} scale={prop.scale} opacity={prop.opacity ?? 1} />;
  }

  return (
    <mesh geometry={geometry} scale={prop.scale} castShadow receiveShadow>
      <meshToonMaterial color="#ffffff" vertexColors transparent opacity={prop.opacity ?? 1} />
    </mesh>
  );
}

function buildStageVoxelGeometry(texture: THREE.Texture, prop: StagePropDefinition) {
  const image = texture.image as CanvasImageSource & { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
  const width = Math.round(Number(image?.naturalWidth ?? image?.width ?? 0));
  const height = Math.round(Number(image?.naturalHeight ?? image?.height ?? 0));
  if (!image || width <= 0 || height <= 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const sampleStep = Math.max(2, Math.min(12, Math.round(prop.voxelScale ?? 4)));
  const depth = Math.max(0.04, Math.min(0.6, prop.voxelDepth ?? 0.16));
  const cellWidth = 1 / Math.ceil(width / sampleStep);
  const cellHeight = 1 / Math.ceil(height / sampleStep);
  const geometries: THREE.BoxGeometry[] = [];
  const base = new THREE.BoxGeometry(cellWidth * 0.98, cellHeight * 0.98, depth);

  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const sample = sampleStageVoxelColor(pixels, x, y, sampleStep);
      if (!sample) continue;
      const geometry = base.clone();
      const color = new THREE.Color(sample.color);
      const colors = new Float32Array((geometry.getAttribute('position').count ?? 0) * 3);
      for (let index = 0; index < colors.length; index += 3) {
        colors[index] = color.r;
        colors[index + 1] = color.g;
        colors[index + 2] = color.b;
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const localX = ((x + sampleStep * 0.5) / width) - 0.5;
      const localY = 0.5 - ((y + sampleStep * 0.5) / height);
      const localZ = (sample.brightness - 128) / 1800;
      geometry.translate(localX, localY, localZ);
      geometries.push(geometry);
    }
  }

  base.dispose();
  if (geometries.length === 0) return null;
  const geometry = mergeGeometries(geometries, false);
  geometries.forEach((entry) => entry.dispose());
  return geometry;
}

function sampleStageVoxelColor(imageData: ImageData, originX: number, originY: number, sampleStep: number) {
  const { width, height, data } = imageData;
  let red = 0;
  let green = 0;
  let blue = 0;
  let alpha = 0;
  let count = 0;
  for (let y = originY; y < Math.min(height, originY + sampleStep); y += 1) {
    for (let x = originX; x < Math.min(width, originX + sampleStep); x += 1) {
      const offset = (y * width + x) * 4;
      if (data[offset + 3] <= 24) continue;
      red += data[offset];
      green += data[offset + 1];
      blue += data[offset + 2];
      alpha += data[offset + 3];
      count += 1;
    }
  }
  if (count / (sampleStep * sampleStep) < 0.16) return null;
  const r = red / count;
  const g = green / count;
  const b = blue / count;
  const snap = (value: number) => Math.max(0, Math.min(255, Math.round(value / 12) * 12));
  return {
    color: `#${[snap(r), snap(g), snap(b)].map((value) => value.toString(16).padStart(2, '0')).join('')}`,
    brightness: (r + g + b + alpha / count) / 4
  };
}

function FighterRig({
  fighter,
  timeScale = 1,
  frameTimeOverride,
  stage,
  renderStyle,
  preferProcedural = false,
  visualScale = 1
}: {
  fighter: FighterRuntime;
  timeScale?: number;
  frameTimeOverride?: number;
  stage?: StageDefinition;
  renderStyle?: Partial<FighterRenderStyle>;
  preferProcedural?: boolean;
  visualScale?: number;
}) {
  const group = useRef<THREE.Group>(null);
  const yawInitialized = useRef(false);
  const scaledTime = useRef(0);
  const progress = getFighterRenderProgress(fighter);
  useFrame((_, delta) => {
    if (!group.current) return;
    if (frameTimeOverride === undefined) scaledTime.current += delta * timeScale;
    else scaledTime.current = frameTimeOverride;
    const renderTime = scaledTime.current;
    const liveProgress = getFighterRenderProgress(fighter);
    const blockBreath = fighter.state === 'block' || fighter.state === 'crouchBlock' ? Math.sin(renderTime * 3.2 + fighter.slot * 0.7) : 0;
    const bob = fighter.state === 'idle' ? Math.sin(renderTime * 4 + fighter.slot) * 0.025 : blockBreath * 0.018;
    const hitLean = fighter.state === 'hit' || fighter.state === 'throwHeld' ? -fighter.facing * 0.16 : 0;
    const tornadoReaction = hasTornadoReactionVisual(fighter);
    const juggle = fighter.state === 'juggle' && !tornadoReaction ? 1 : 0;
    const getupProgress = getGetupRenderProgress(fighter);
    const juggleRoll = juggle * Math.sin(renderTime * 3.8 + fighter.slot) * 0.34;
    const attackLean = fighter.state === 'attack' || fighter.state === 'throwHold' ? fighter.facing * Math.sin(liveProgress * Math.PI) * 0.2 : 0;
    const offsetX = preferProcedural ? 0 : getFighterRenderOffsetX(fighter, liveProgress, renderTime);
    const shake = fighter.state === 'throwHeld' && fighter.throwShakeFrames > 0 ? Math.min(0.12, 0.024 + fighter.throwShakeFrames * 0.006) : 0;
    const shakeX = shake ? Math.sin(renderTime * 88 + fighter.slot * 1.7) * shake : 0;
    const shakeZ = shake ? Math.cos(renderTime * 76 + fighter.slot * 2.1) * shake * 0.45 : 0;
    const targetYaw = fighter.facingYaw;
    const currentYaw = yawInitialized.current ? group.current.rotation.y : targetYaw;
    const yawDelta = Math.atan2(Math.sin(targetYaw - currentYaw), Math.cos(targetYaw - currentYaw));
    const yaw = currentYaw + yawDelta * (1 - Math.pow(0.0001, delta));
    yawInitialized.current = true;
    group.current.position.set(fighter.position.x + offsetX + shakeX, fighter.position.y + bob, fighter.position.z + shakeZ);
    group.current.rotation.set(fighter.state === 'knockdown' || tornadoReaction ? -0.85 : fighter.state === 'getup' ? -0.85 * (1 - getupProgress) : juggle ? -1.16 : 0, yaw, hitLean + attackLean + juggleRoll);
  });

  const color = fighter.character.colors.primary;
  const globalScale = getCharacterGlobalScale(fighter.character);
  const resolvedVisualScale = Math.max(0.1, visualScale);
  const outlineStyle = useMemo(() => getFighterOutlineStyle(stage), [stage]);
  const materialStyle = useMemo(() => withDefaultRenderStyle(renderStyle), [renderStyle]);
  const effectiveOutlineStyle = materialStyle.opacity < 1 || renderStyle?.castShadow === false ? undefined : outlineStyle;
  return (
    <group ref={group} scale={[globalScale.width * resolvedVisualScale, globalScale.height * resolvedVisualScale, globalScale.width * resolvedVisualScale]}>
      <Bounds fit={false}>
        {preferProcedural ? (
          <ProceduralFighter fighter={fighter} color={color} timeScale={timeScale} frameTimeOverride={frameTimeOverride} outlineStyle={effectiveOutlineStyle} renderStyle={materialStyle} />
        ) : fighter.character.renderMode === 'spriteVoxel' || fighter.character.modelPath.startsWith('spritevoxel://') ? (
          fighter.character.voxelProfile === 'image-source' || fighter.character.voxelProfile === 'hd-image-source' ? (
            <ImageVoxelFighter fighter={fighter} progress={progress} timeScale={timeScale} frameTimeOverride={frameTimeOverride} outlineStyle={effectiveOutlineStyle} renderStyle={materialStyle} />
          ) : (
            <VoxelSpriteFighter fighter={fighter} progress={progress} timeScale={timeScale} frameTimeOverride={frameTimeOverride} outlineStyle={effectiveOutlineStyle} renderStyle={materialStyle} />
          )
        ) : fighter.character.modelPath.startsWith('builtin://') ? (
          <ProceduralFighter fighter={fighter} color={color} timeScale={timeScale} frameTimeOverride={frameTimeOverride} outlineStyle={effectiveOutlineStyle} renderStyle={materialStyle} />
        ) : (
          <ExternalFighter fighter={fighter} url={fighter.character.modelPath} timeScale={timeScale} renderStyle={materialStyle} />
        )}
      </Bounds>
    </group>
  );
}

type FighterOutlineStyle = {
  enabled: boolean;
  color: string;
  opacity: number;
  scale: number;
};

function getFighterOutlineStyle(stage?: StageDefinition): FighterOutlineStyle {
  const style = stage ? resolveStageVisualStyle(stage) : getStageVisualStylePresetDefaults('training-clean');
  return {
    enabled: style.outline.enabled && style.outline.fighterStrength > 0 && style.outline.fighterThickness > 0,
    color: style.outline.visibleColor,
    opacity: THREE.MathUtils.clamp(0.18 + style.outline.fighterStrength * 0.028, 0.2, 0.34),
    scale: 1 + style.outline.fighterThickness * 0.015
  };
}

type ImageVoxelPart = VoxelPackPart;

export type ImageVoxel = {
  part: ImageVoxelPart;
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  sideColor?: string;
  source?: 'hd' | 'legacy';
};

type ImageVoxelPartRender = {
  anchor: [number, number, number];
  voxels: ImageVoxel[];
  cacheKey?: string;
};

type PreparedImageVoxelPartRender = {
  anchor: [number, number, number];
  count: number;
  matrixArray: Float32Array;
  frontColors: Float32Array;
  sideColors: Float32Array;
};

type MenuPerfProbeWindow = Window & {
  __KORE_MENU_PERF__?: {
    voxelPackHits: number;
    voxelPackMisses: number;
    voxelJsonFallbacks: number;
    voxelLoadMs: number[];
    voxelBuildMs: number[];
  };
  __KORE_HD_VOXEL_PROCEDURAL_FALLBACKS__?: number;
};

const imageVoxelOutlineMeshCache = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material }>();
const imageVoxelRenderMeshCache = new Map<string, THREE.InstancedMesh>();
const imageVoxelPreparedPartCache = new Map<string, PreparedImageVoxelPartRender>();

const imageVoxelCache = new Map<string, Promise<ImageVoxel[]>>();
const imageVoxelPrewarmQueue: Array<{ character: CharacterDefinition; frame: string }> = [];
const imageVoxelPrewarmKeys = new Set<string>();
let imageVoxelPrewarmRunning = false;
const IMAGE_VOXEL_PIXEL_SCALE = 1.2;
const IMAGE_VOXEL_DEPTH_SCALE = 1.32;
const IMAGE_VOXEL_MIN_DEPTH = 0.14;
const IMAGE_VOXEL_MAX_DEPTH = 0.28;

function menuPerfProbe() {
  if (typeof window === 'undefined') return null;
  const perfWindow = window as MenuPerfProbeWindow;
  perfWindow.__KORE_MENU_PERF__ ??= {
    voxelPackHits: 0,
    voxelPackMisses: 0,
    voxelJsonFallbacks: 0,
    voxelLoadMs: [],
    voxelBuildMs: []
  };
  return perfWindow.__KORE_MENU_PERF__;
}

function recordMenuPerfDuration(kind: 'voxelLoadMs' | 'voxelBuildMs', startedAt: number) {
  const probe = menuPerfProbe();
  if (!probe) return;
  probe[kind].push(Number((performance.now() - startedAt).toFixed(2)));
  if (probe[kind].length > 80) probe[kind].shift();
}

function incrementMenuPerfCounter(kind: 'voxelPackHits' | 'voxelPackMisses' | 'voxelJsonFallbacks') {
  const probe = menuPerfProbe();
  if (probe) probe[kind] += 1;
}

function recordHdProceduralFallback(characterId: string) {
  if (typeof window === 'undefined') return;
  const perfWindow = window as MenuPerfProbeWindow;
  perfWindow.__KORE_HD_VOXEL_PROCEDURAL_FALLBACKS__ = (perfWindow.__KORE_HD_VOXEL_PROCEDURAL_FALLBACKS__ ?? 0) + 1;
  console.warn(`[KORE voxel] HD character ${characterId} reached procedural fallback renderer.`);
}

export function clearImageVoxelCacheForFrame(characterId: string, frameIndex?: number) {
  const framePrefix = Number.isFinite(frameIndex)
    ? `/characters/${characterId}/frames/frame-${Math.max(0, Math.round(frameIndex ?? 0)).toString().padStart(3, '0')}.png`
    : `/characters/${characterId}/frames/`;
  Array.from(imageVoxelCache.keys()).forEach((key) => {
    if (key.includes(`:${framePrefix}`)) {
      imageVoxelCache.delete(key);
    }
  });
  Array.from(imageVoxelRenderMeshCache.keys()).forEach((key) => {
    if (key.includes(framePrefix)) {
      imageVoxelRenderMeshCache.delete(key);
    }
  });
  Array.from(imageVoxelPreparedPartCache.keys()).forEach((key) => {
    if (key.includes(framePrefix)) {
      imageVoxelPreparedPartCache.delete(key);
    }
  });
  Array.from(imageVoxelOutlineMeshCache.keys()).forEach((key) => {
    if (key.includes(framePrefix)) {
      imageVoxelOutlineMeshCache.delete(key);
    }
  });
}

function getImageVoxelLodStep(character: CharacterDefinition) {
  if (character.voxelProfile !== 'hd-image-source') return 1;
  return 1;
}

function ImageVoxelFighter({
  fighter,
  progress,
  timeScale = 1,
  frameTimeOverride,
  outlineStyle,
  renderStyle
}: {
  fighter: FighterRuntime;
  progress: number;
  timeScale?: number;
  frameTimeOverride?: number;
  outlineStyle?: FighterOutlineStyle;
  renderStyle: FighterRenderStyle;
}) {
  const root = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const leadArm = useRef<THREE.Group>(null);
  const rearArm = useRef<THREE.Group>(null);
  const leadLeg = useRef<THREE.Group>(null);
  const rearLeg = useRef<THREE.Group>(null);
  const initialFrameSelection = useRef(getImageVoxelFrameSelection(fighter, progress, 0));
  const activeFrameSelection = useRef(initialFrameSelection.current);
  const scaledTime = useRef(0);
  const [frameRequest, setFrameRequest] = useState(initialFrameSelection.current);
  const [loadedFrameSelection, setLoadedFrameSelection] = useState(initialFrameSelection.current);
  const [voxels, setVoxels] = useState<ImageVoxel[]>([]);
  const lodStep = getImageVoxelLodStep(fighter.character);

  useEffect(() => {
    let canceled = false;
    if (!frameRequest.frameSource) return undefined;
    getCachedImageVoxels(frameRequest.frameSource, fighter.character).then((nextVoxels) => {
      if (!canceled) {
        setVoxels(nextVoxels);
        setLoadedFrameSelection(frameRequest);
      }
    });
    return () => {
      canceled = true;
    };
  }, [fighter.character, frameRequest]);

  const parts = useMemo(() => buildVoxelParts(voxels, lodStep, loadedFrameSelection.frameSource), [loadedFrameSelection.frameSource, lodStep, voxels]);

  useFrame((_, delta) => {
    if (frameTimeOverride === undefined) scaledTime.current += delta * timeScale;
    else scaledTime.current = frameTimeOverride;
    const t = scaledTime.current;
    const liveProgress = getFighterRenderProgress(fighter);
    const nextFrameSelection = getImageVoxelFrameSelection(fighter, liveProgress, t);
    const nextFrameSrc = nextFrameSelection.frameSource;
    const animationScale = getCharacterAnimationScale(fighter.character, loadedFrameSelection.animationKey, loadedFrameSelection.frameSource);
    if (nextFrameSrc !== activeFrameSelection.current.frameSource || nextFrameSelection.animationKey !== activeFrameSelection.current.animationKey) {
      activeFrameSelection.current = nextFrameSelection;
      setFrameRequest(nextFrameSelection);
    }
    const moving = fighter.state === 'walk' || fighter.state === 'sidestep';
    const walk = moving ? Math.sin(t * 12) : 0;
    const attack = fighter.state === 'attack' || fighter.state === 'throwHold' ? Math.sin(liveProgress * Math.PI) : 0;
    const block = fighter.state === 'block' || fighter.state === 'crouchBlock' ? 1 : 0;
    const crouch = fighter.state === 'crouch' || fighter.state === 'crouchBlock' ? 1 : 0;
    const blockBreath = block ? Math.sin(t * 3.2 + fighter.slot * 0.7) : 0;
    const blockBreathUp = block ? (blockBreath + 1) * 0.5 : 0;
    const hit = 0;
    const jump = fighter.state === 'jump' ? 1 : 0;
    const smooth = 1 - Math.pow(0.001, delta);

    if (root.current) {
      root.current.position.x = THREE.MathUtils.lerp(root.current.position.x, 0, smooth);
      root.current.position.y = THREE.MathUtils.lerp(root.current.position.y, (crouch ? -0.28 : 0) + blockBreath * 0.014, smooth);
      root.current.scale.x = THREE.MathUtils.lerp(root.current.scale.x, animationScale.width, smooth);
      root.current.scale.y = THREE.MathUtils.lerp(root.current.scale.y, animationScale.height * (crouch ? 0.84 : jump ? 1.04 : 1) * (1 + blockBreathUp * 0.012), smooth);
      root.current.scale.z = THREE.MathUtils.lerp(root.current.scale.z, animationScale.width, smooth);
    }
    if (torso.current) {
      torso.current.rotation.x = THREE.MathUtils.lerp(torso.current.rotation.x, -block * 0.26 - crouch * 0.18 + hit * 0.2 - blockBreathUp * 0.025, smooth);
      torso.current.rotation.z = THREE.MathUtils.lerp(torso.current.rotation.z, attack * 0.11 * fighter.facing + blockBreath * 0.018 * fighter.facing, smooth);
    }
    if (head.current) {
      head.current.position.y = THREE.MathUtils.lerp(
        head.current.position.y,
        parts.head.anchor[1] - crouch * 0.12 + Math.sin(t * 4) * 0.012 + blockBreath * 0.018,
        smooth
      );
      head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, hit * 0.2, smooth);
    }
    if (leadArm.current) {
      leadArm.current.rotation.x = THREE.MathUtils.lerp(leadArm.current.rotation.x, -attack * 0.95 - block * 0.62 + walk * 0.2 - blockBreathUp * 0.035, smooth);
      leadArm.current.rotation.z = THREE.MathUtils.lerp(leadArm.current.rotation.z, block * 0.32 + attack * 0.18 + blockBreath * 0.012, smooth);
      leadArm.current.position.z = THREE.MathUtils.lerp(leadArm.current.position.z, attack * 0.42 + block * (0.12 + blockBreathUp * 0.025), smooth);
    }
    if (rearArm.current) {
      rearArm.current.rotation.x = THREE.MathUtils.lerp(rearArm.current.rotation.x, attack * 0.26 - block * 0.5 - walk * 0.2 - blockBreathUp * 0.03, smooth);
      rearArm.current.rotation.z = THREE.MathUtils.lerp(rearArm.current.rotation.z, -block * 0.24 - blockBreath * 0.01, smooth);
      rearArm.current.position.z = THREE.MathUtils.lerp(rearArm.current.position.z, block * (0.1 + blockBreathUp * 0.02), smooth);
    }
    if (leadLeg.current) {
      leadLeg.current.rotation.x = THREE.MathUtils.lerp(leadLeg.current.rotation.x, walk * 0.34 + jump * 0.22 - crouch * 0.26, smooth);
    }
    if (rearLeg.current) {
      rearLeg.current.rotation.x = THREE.MathUtils.lerp(rearLeg.current.rotation.x, -walk * 0.34 - jump * 0.2 - crouch * 0.2, smooth);
    }
  });

  if (voxels.length === 0 && fighter.character.voxelProfile === 'hd-image-source') {
    return null;
  }

  if (voxels.length === 0) {
    return <VoxelSpriteFighter fighter={fighter} progress={progress} timeScale={timeScale} frameTimeOverride={frameTimeOverride} outlineStyle={outlineStyle} renderStyle={renderStyle} />;
  }

  return (
    <group ref={root} rotation={[0, -Math.PI / 2, 0]}>
      <LiveImageVoxelPartGroup part={parts.head} groupRef={head} outlineStyle={outlineStyle} renderStyle={renderStyle} />
      <LiveImageVoxelPartGroup part={parts.torso} groupRef={torso} outlineStyle={outlineStyle} renderStyle={renderStyle} />
      <LiveImageVoxelPartGroup part={parts.leadArm} groupRef={leadArm} outlineStyle={outlineStyle} renderStyle={renderStyle} />
      <LiveImageVoxelPartGroup part={parts.rearArm} groupRef={rearArm} outlineStyle={outlineStyle} renderStyle={renderStyle} />
      <LiveImageVoxelPartGroup part={parts.leadLeg} groupRef={leadLeg} outlineStyle={outlineStyle} renderStyle={renderStyle} />
      <LiveImageVoxelPartGroup part={parts.rearLeg} groupRef={rearLeg} outlineStyle={outlineStyle} renderStyle={renderStyle} />
    </group>
  );
}

function getCharacterAnimationScale(character: CharacterDefinition, animationKey?: string, frameSource?: string) {
  const frameIndex = frameSource?.match(/frame-(\d+)\.png/)?.[1];
  const frameSize = animationKey && frameIndex ? character.animationFrameScales?.[animationKey]?.[String(Number(frameIndex))] : undefined;
  const size = frameSize ?? (animationKey ? character.animationScales?.[animationKey] : undefined);
  return {
    width: THREE.MathUtils.clamp(Number(size?.width) || 1, 0.1, 10),
    height: THREE.MathUtils.clamp(Number(size?.height) || 1, 0.1, 10),
    offsetX: THREE.MathUtils.clamp(Number(size?.offsetX) || 0, -6, 6)
  };
}

function getFighterRenderOffsetX(fighter: FighterRuntime, progress: number, elapsedTime: number) {
  const frameSelection = getImageVoxelFrameSelection(fighter, progress, elapsedTime);
  return getCharacterAnimationScale(fighter.character, frameSelection.animationKey, frameSelection.frameSource).offsetX;
}

function hasVisualHitstop(fighter: FighterRuntime) {
  return fighter.visualHitstop.framesRemaining > 0 && fighter.visualHitstop.animationKey !== null;
}

function hasTornadoReactionVisual(fighter: FighterRuntime) {
  return fighter.state === 'juggle' && fighter.tornadoReactionFrames > 0;
}

function getFighterRenderProgress(fighter: FighterRuntime) {
  if (isIdleFlourishActive(fighter)) return getIdleFlourishProgress(fighter);
  return hasVisualHitstop(fighter) ? fighter.visualHitstop.progress : activeMoveProgress(fighter);
}

function isIdleFlourishActive(fighter: FighterRuntime) {
  return fighter.idleFlourishFramesRemaining > 0 && fighter.idleFlourishTotalFrames > 0;
}

function getIdleFlourishProgress(fighter: FighterRuntime) {
  const total = Math.max(1, fighter.idleFlourishTotalFrames);
  return THREE.MathUtils.clamp(1 - fighter.idleFlourishFramesRemaining / total, 0, 0.999);
}

function getCachedImageVoxels(src: string, character: CharacterDefinition): Promise<ImageVoxel[]> {
  installVoxelFreezeMonitor();
  const cacheKey = `${character.id}:${character.voxelProfile ?? 'image-source'}:${src}`;
  const cached = imageVoxelCache.get(cacheKey);
  if (cached) return cached;
  const startedAt = performance.now();
  const request = loadImageVoxels(src, character).then((voxels) => {
    recordMenuPerfDuration('voxelLoadMs', startedAt);
    return voxels;
  });
  imageVoxelCache.set(cacheKey, request);
  return request;
}

export function preloadImageVoxelFrame(character: CharacterDefinition, frameSource: string) {
  if (!frameSource) return Promise.resolve([]);
  return getCachedImageVoxels(frameSource, character);
}

export function prewarmActiveFighterVoxels(
  character: CharacterDefinition,
  frameSources: string[],
  options: { immediateFrames?: string[]; chunkSize?: number } = {}
) {
  installVoxelFreezeMonitor();
  if (typeof window === 'undefined' || character.voxelProfile !== 'hd-image-source') return () => undefined;
  const immediateFrames = [...new Set((options.immediateFrames ?? []).filter(Boolean))];
  const uniqueFrames = [
    ...immediateFrames,
    ...frameSources.filter((frame) => frame && !immediateFrames.includes(frame))
  ];
  const chunkSize = Math.max(1, Math.min(2, Math.round(options.chunkSize ?? 1)));
  let cancelled = false;
  let index = immediateFrames.length;
  const schedule = (callback: () => void) => {
    const requestIdle = window.requestIdleCallback as ((handler: IdleRequestCallback, options?: IdleRequestOptions) => number) | undefined;
    if (requestIdle) requestIdle(callback, { timeout: 120 });
    else window.setTimeout(callback, 16);
  };
  const pump = () => {
    if (cancelled) return;
    const batch = uniqueFrames.slice(index, index + chunkSize);
    index += batch.length;
    batch.forEach((frame) => {
      enqueueImageVoxelPrewarm(character, frame);
    });
    if (index < uniqueFrames.length) schedule(pump);
  };
  immediateFrames.forEach((frame) => {
    void preloadImageVoxelFrame(character, frame).catch(() => undefined);
  });
  schedule(pump);
  return () => {
    cancelled = true;
  };
}

export function prewarmImageVoxelFrames(character: CharacterDefinition, frameSources: string[]) {
  return prewarmActiveFighterVoxels(character, frameSources);
}

function enqueueImageVoxelPrewarm(character: CharacterDefinition, frame: string) {
  const key = `${character.id}:${frame}`;
  if (imageVoxelPrewarmKeys.has(key)) return;
  imageVoxelPrewarmKeys.add(key);
  imageVoxelPrewarmQueue.push({ character, frame });
  void pumpImageVoxelPrewarmQueue();
}

async function pumpImageVoxelPrewarmQueue() {
  if (imageVoxelPrewarmRunning) return;
  imageVoxelPrewarmRunning = true;
  try {
    while (imageVoxelPrewarmQueue.length > 0) {
      const item = imageVoxelPrewarmQueue.shift();
      if (!item) continue;
      imageVoxelPrewarmKeys.delete(`${item.character.id}:${item.frame}`);
      await getCachedImageVoxels(item.frame, item.character).catch(() => undefined);
      await new Promise((resolve) => window.setTimeout(resolve, 16));
    }
  } finally {
    imageVoxelPrewarmRunning = false;
  }
}

function collectImageVoxelFrameSources(character: CharacterDefinition) {
  return Object.values(character.animationFrames ?? {}).flatMap((frames) => frames ?? []);
}

function getPreviewCharacterFrameSources(character: CharacterDefinition, animationKey?: string) {
  const frames = character.animationFrames ?? {};
  const priorityKeys = [animationKey, 'idle', 'win', 'walkForward'].filter((key): key is string => Boolean(key));
  return uniqueFrameSources([
    ...priorityKeys.flatMap((key) => frames[key] ?? []),
    ...collectImageVoxelFrameSources(character)
  ]);
}

function getBasicAttackPriorityFrameSources(character: CharacterDefinition) {
  const frames = character.animationFrames ?? {};
  return (['jab', 'kick', 'heavy', 'special'] as MoveInput[]).flatMap((input) => {
    const animationKey = getCharacterAnimationAlias(character, input);
    return frames[animationKey]?.slice(0, 2) ?? frames[input]?.slice(0, 2) ?? [];
  });
}

function getUnlockRevealFrameSources(character: CharacterDefinition) {
  const frames = character.animationFrames ?? {};
  const revealMoves = selectUnlockRevealMoves(character);
  const moveKeys = revealMoves.map((move) => move.animationKey ?? move.input);
  return uniqueFrameSources([
    ...(frames.idle ?? []),
    ...(frames.win ?? []),
    ...moveKeys.flatMap((key) => frames[key] ?? []),
    ...collectImageVoxelFrameSources(character)
  ]);
}

function uniqueFrameSources(frameSources: Array<string | null | undefined>) {
  return [...new Set(frameSources.filter((frame): frame is string => Boolean(frame)))];
}

function getImageVoxelFramePath(fighter: FighterRuntime, progress: number, elapsedTime: number) {
  return getImageVoxelFrameSelection(fighter, progress, elapsedTime).frameSource;
}

function getImageVoxelFrameSelection(fighter: FighterRuntime, progress: number, elapsedTime: number) {
  const frames = fighter.character.animationFrames;
  const requestedKey = getImageVoxelAnimationKey(fighter);
  if (!frames) return { animationKey: requestedKey, frameSource: fighter.character.spriteSheetPath };
  const resolved = resolveAnimationFrameSequence(frames, requestedKey);
  if (!resolved) return { animationKey: requestedKey, frameSource: fighter.character.spriteSheetPath };
  const { key: resolvedKey, sequence } = resolved;
  const fps = fighter.character.animationFrameRates?.[resolvedKey] ?? fighter.character.animationFrameRates?.[requestedKey] ?? fighter.character.animationFps ?? 8;
  const visualHitstopActive = hasVisualHitstop(fighter);
  const idleFlourishActive = isIdleFlourishActive(fighter);
  let frameIndex = Math.floor(elapsedTime * fps) % sequence.length;
  if (visualHitstopActive || fighter.state === 'attack' || fighter.state === 'throwHold') {
    frameIndex = getAttackFrameIndex(fighter, sequence.length, fps, progress);
  } else if (idleFlourishActive) {
    frameIndex = Math.min(sequence.length - 1, Math.floor(getIdleFlourishProgress(fighter) * sequence.length));
  } else if (fighter.state === 'chargeKi') {
    frameIndex = getChargeKiFrameIndex(fighter, sequence.length);
  } else if (fighter.state === 'knockdown' || (requestedKey === 'knockdown' && hasTornadoReactionVisual(fighter))) {
    frameIndex = 0;
  } else if (fighter.state === 'getup') {
    frameIndex = Math.min(sequence.length - 1, Math.floor(getGetupRenderProgress(fighter) * sequence.length));
  }
  debugLogThrottled(9, 'voxel animation key resolved', {
    characterId: fighter.character.id,
    slot: fighter.slot,
    state: fighter.state,
    animationKey: resolvedKey,
    requestedAnimationKey: requestedKey,
    fps,
    sequence: sequence.map((frame) => frame.match(/frame-(\d+)\.png$/)?.[1] ?? frame)
  });
  const frameSource = sequence[frameIndex];
  debugLogThrottled(10, 'voxel frame source selected', {
    characterId: fighter.character.id,
    slot: fighter.slot,
    animationKey: resolvedKey,
    requestedAnimationKey: requestedKey,
    frameIndex,
    frameSource,
    elapsedTime: Number(elapsedTime.toFixed(2)),
    progress: Number(progress.toFixed(2))
  });
  return {
    animationKey: resolvedKey,
    frameSource: versionEditedSpriteFrameSource(frameSource, fighter.character)
  };
}

function getAttackFrameIndex(fighter: FighterRuntime, sequenceLength: number, fps: number, progress: number) {
  const move = fighter.currentMove;
  if (move?.holdable && fighter.state === 'attack' && sequenceLength >= 2) {
    const totalFrames = move.startupFrames + move.activeFrames + move.recoveryFrames;
    const holdStartFrame = Math.max(1, totalFrames - 2);
    if (fighter.moveFrame >= holdStartFrame) {
      const frameDuration = Math.max(1, Math.round(60 / Math.max(1, fps)));
      const heldFrame = Math.floor((fighter.moveFrame - holdStartFrame) / frameDuration) % 2;
      return sequenceLength - 2 + heldFrame;
    }
  }
  return Math.min(sequenceLength - 1, Math.floor(progress * sequenceLength));
}

function resolveAnimationFrameSequence(frames: NonNullable<CharacterDefinition['animationFrames']>, key: string) {
  const fallbackKeys = [
    key,
    key === 'sprint' ? 'walkForward' : undefined,
    key === 'backHopMovement' ? 'walkBack' : undefined,
    key === 'backHopMovement' ? 'jump' : undefined,
    key === 'backHopMovement' ? 'backHop' : undefined,
    key === 'backHopMovement' ? 'backflip' : undefined,
    key === 'backHop' ? 'backflip' : undefined,
    key === 'backflip' ? 'backHop' : undefined,
    key === 'backflip' ? 'jump' : undefined,
    key === 'backflip' ? 'walkBack' : undefined,
    key === 'crouchBlock' ? 'block' : undefined,
    key === 'crouchBlock' ? 'crouch' : undefined,
    key === 'entry' ? 'win' : undefined,
    key === 'juggle' ? 'hitHeavy' : undefined,
    key === 'juggle' ? 'hitLight' : undefined,
    key === 'throwHeld' ? 'hitLight' : undefined,
    key === 'throwHeld' ? 'hitHeavy' : undefined,
    key.startsWith('getup') ? 'knockdown' : undefined,
    'idle'
  ];
  for (const fallbackKey of fallbackKeys) {
    if (!fallbackKey) continue;
    const sequence = frames[fallbackKey];
    if (sequence?.length) return { key: fallbackKey, sequence };
  }
  return null;
}

function getChargeKiFrameIndex(fighter: FighterRuntime, sequenceLength: number) {
  if (sequenceLength <= 1) return 0;
  const move = fighter.currentMove;
  const forwardFrames = Math.max(1, (move?.startupFrames ?? 14) + (move?.activeFrames ?? 18));
  if (fighter.chargePhase === 'hold') {
    return sequenceLength - 2 + (Math.floor(fighter.chargeFrame / 10) % 2);
  }
  if (fighter.chargePhase === 'recovery') {
    const recoveryFrames = Math.max(1, move?.recoveryFrames ?? 16);
    const reverseProgress = Math.min(1, Math.max(0, fighter.chargeFrame / recoveryFrames));
    return Math.max(0, Math.min(sequenceLength - 1, sequenceLength - 1 - Math.floor(reverseProgress * sequenceLength)));
  }
  const forwardProgress = Math.min(1, Math.max(0, fighter.moveFrame / forwardFrames));
  return Math.max(0, Math.min(sequenceLength - 1, Math.floor(forwardProgress * sequenceLength)));
}

export function getImageVoxelAnimationKey(fighter: FighterRuntime) {
  if (hasVisualHitstop(fighter) && fighter.visualHitstop.animationKey) return fighter.visualHitstop.animationKey;
  if (fighter.previewAnimationKey) return fighter.previewAnimationKey;
  if (isIdleFlourishActive(fighter)) return 'win';
  if (fighter.state === 'attack') return getMoveAnimationKey(fighter);
  if (fighter.state === 'walk') {
    if (fighter.dashForwardFrames > 0 && fighter.character.animationFrames?.sprint?.length) return 'sprint';
    if (fighter.walkDirection > 0) return 'walkForward';
    if (fighter.walkDirection < 0) return 'walkBack';
    return fighter.facing === 1 ? 'walkForward' : 'walkBack';
  }
  if (fighter.state === 'sidestep') return fighter.sidestepDirection < 0 ? 'sidestepLeft' : 'sidestepRight';
  if (fighter.state === 'crouchBlock') return fighter.character.animationFrames?.crouchBlock?.length ? 'crouchBlock' : fighter.character.animationFrames?.block?.length ? 'block' : 'crouch';
  if (fighter.state === 'chargeKi') return 'chargeKi';
  if (fighter.state === 'transform') return fighter.character.animationFrames?.transform?.length ? 'transform' : fighter.character.animationFrames?.chargeKi?.length ? 'chargeKi' : 'idle';
  if (fighter.state === 'throwHold') return getMoveAnimationKey(fighter);
  if (fighter.state === 'throwHeld') return 'throwHeld';
  if (fighter.state === 'hit') return 'hitLight';
  if (hasTornadoReactionVisual(fighter) && fighter.character.animationFrames?.knockdown?.length) return 'knockdown';
  if (fighter.state === 'juggle') return fighter.character.animationFrames?.juggle?.length ? 'juggle' : fighter.character.animationFrames?.hitHeavy?.length ? 'hitHeavy' : 'hitLight';
  if (fighter.state === 'getup') return getGetupAnimationKey(fighter);
  if (fighter.state === 'entry') return 'entry';
  return fighter.state;
}

function getMoveAnimationKey(fighter: FighterRuntime) {
  const move = fighter.currentMove;
  if (!move) return 'jab';
  if (move.animationKey && (fighter.character.animationFrames?.[move.animationKey]?.length ?? 0) > 0) return move.animationKey;
  const aliasedKey = getCharacterAnimationAlias(fighter.character, move.input);
  if ((fighter.character.animationFrames?.[aliasedKey]?.length ?? 0) > 0) return aliasedKey;
  if ((fighter.character.animationFrames?.[move.input]?.length ?? 0) > 0) return move.input;
  return move.animationKey ?? move.input ?? 'jab';
}

function getCharacterAnimationAlias(character: CharacterDefinition, key: string) {
  return character.animations?.[key] ?? key;
}

function getGetupAnimationKey(fighter: FighterRuntime) {
  if (fighter.getupAction === 'rollUp') return 'getupRollUp';
  if (fighter.getupAction === 'rollDown') return 'getupRollDown';
  if (fighter.getupAction === 'rollBack') return 'getupRollBack';
  return 'getupStand';
}

function getCharacterGetupFrames(character: CharacterDefinition, action: Exclude<GetupAction, 'none'>) {
  const override = character.getupFrameOverrides?.[action];
  if (Number.isFinite(override) && Number(override) > 0) return THREE.MathUtils.clamp(Math.round(Number(override)), 12, 96);
  const key = action === 'rollUp'
    ? 'getupRollUp'
    : action === 'rollDown'
      ? 'getupRollDown'
      : action === 'rollBack'
        ? 'getupRollBack'
        : 'getupStand';
  const animationKey = (character.animationFrames?.[key]?.length ?? 0) > 0
    ? key
    : (character.animationFrames?.knockdown?.length ?? 0) > 0
      ? 'knockdown'
      : key;
  const frameCount = character.animationFrames?.[animationKey]?.length ?? 0;
  const fps = character.animationFrameRates?.[animationKey] ?? character.animationFrameRates?.[key] ?? character.animationFps ?? 8;
  if (frameCount > 0) return THREE.MathUtils.clamp(Math.round((frameCount / Math.max(1, fps)) * 60), 12, 72);
  return 24;
}

function getGetupRenderProgress(fighter: FighterRuntime) {
  if (fighter.state !== 'getup') return 0;
  const total = Math.max(1, fighter.getupTotalFrames || fighter.actionFramesRemaining || 1);
  return THREE.MathUtils.clamp(1 - fighter.actionFramesRemaining / total, 0, 1);
}

function versionEditedSpriteFrameSource(src: string | undefined, character: CharacterDefinition) {
  if (!src) return src;
  const frameIndex = src.match(/frame-(\d+)\.png/)?.[1];
  if (!frameIndex) return src;
  const edit = character.spriteFrameEdits?.[String(Number(frameIndex))];
  if (!edit) return src;
  const signature = [
    edit.sourceMode ?? 'sheet',
    edit.box?.join(',') ?? '',
    edit.width,
    edit.height,
    edit.rotation ?? 0,
    edit.offset?.join(',') ?? '',
    edit.scale ?? 1,
    edit.hidden ? 'hidden' : 'visible',
    edit.revision ?? '',
    edit.replacementName ?? '',
    edit.replacementWidth ?? '',
    edit.replacementHeight ?? ''
  ].join('|');
  const separator = src.includes('?') ? '&' : '?';
  return `${src}${separator}spriteEdit=${hashSpriteEditSignature(signature)}`;
}

function hashSpriteEditSignature(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function LiveImageVoxelPartGroup({
  part,
  groupRef,
  outlineStyle,
  renderStyle
}: {
  part: ImageVoxelPartRender;
  groupRef?: React.RefObject<THREE.Group>;
  outlineStyle?: FighterOutlineStyle;
  renderStyle: FighterRenderStyle;
}) {
  if (outlineStyle?.enabled) {
    return <ImageVoxelPartGroup part={part} groupRef={groupRef} outlineStyle={outlineStyle} renderStyle={renderStyle} />;
  }
  return <ReusableImageVoxelPartGroup part={part} groupRef={groupRef} renderStyle={renderStyle} />;
}

function ReusableImageVoxelPartGroup({
  part,
  groupRef,
  renderStyle
}: {
  part: ImageVoxelPartRender;
  groupRef?: React.RefObject<THREE.Group>;
  renderStyle: FighterRenderStyle;
}) {
  const prepared = useMemo(() => prepareImageVoxelPartForRender(part, renderStyle), [part, renderStyle]);
  const requiredCapacity = Math.max(1, nextImageVoxelCapacity(prepared.count));
  const [capacity, setCapacity] = useState(requiredCapacity);
  const mesh = useMemo(() => createReusableImageVoxelMesh(capacity, renderStyle), [capacity, renderStyle]);

  useEffect(() => {
    return () => {
      disposeVoxelObject(mesh);
    };
  }, [mesh]);

  useEffect(() => {
    if (requiredCapacity > capacity) setCapacity(requiredCapacity);
  }, [capacity, requiredCapacity]);

  useEffect(() => {
    if (prepared.count > capacity) return;
    applyPreparedImageVoxelPart(mesh, prepared);
  }, [capacity, mesh, prepared]);

  return (
    <group ref={groupRef} position={prepared.anchor}>
      <primitive object={mesh} />
    </group>
  );
}

function ImageVoxelPartGroup({
  part,
  groupRef,
  outlineStyle,
  renderStyle
}: {
  part: ImageVoxelPartRender;
  groupRef?: React.RefObject<THREE.Group>;
  outlineStyle?: FighterOutlineStyle;
  renderStyle: FighterRenderStyle;
}) {
  const mesh = useMemo(() => buildInstancedVoxelMesh(part, renderStyle), [part, renderStyle]);
  const outlineMesh = useMemo(() => buildInstancedVoxelOutlineMesh(part, outlineStyle), [part, outlineStyle]);

  useEffect(() => {
    return () => {
      disposeVoxelObject(outlineMesh);
      disposeVoxelObject(mesh);
    };
  }, [mesh, outlineMesh]);

  return (
    <group ref={groupRef} position={part.anchor}>
      {outlineMesh && <primitive object={outlineMesh} />}
      {mesh && <primitive object={mesh} />}
    </group>
  );
}

function disposeVoxelObject(object: THREE.Object3D | null) {
  if (!object || object.userData.koreCachedVoxelMesh) return;
  object.traverse((child) => {
    if (child.userData.koreCachedVoxelMesh || !(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const material = child.material;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else {
      material.dispose();
    }
  });
}

function makeCachedVoxelMesh(
  cached: { geometry: THREE.BufferGeometry; material: THREE.Material },
  options: Partial<Pick<THREE.Mesh, 'castShadow' | 'receiveShadow' | 'renderOrder' | 'frustumCulled'>>
) {
  const mesh = new THREE.Mesh(cached.geometry, cached.material);
  if (options.castShadow !== undefined) mesh.castShadow = options.castShadow;
  if (options.receiveShadow !== undefined) mesh.receiveShadow = options.receiveShadow;
  if (options.renderOrder !== undefined) mesh.renderOrder = options.renderOrder;
  if (options.frustumCulled !== undefined) mesh.frustumCulled = options.frustumCulled;
  mesh.userData.koreCachedVoxelMesh = true;
  return mesh;
}

function makeImageVoxelOutlineMeshCacheKey(part: ImageVoxelPartRender, outlineStyle?: FighterOutlineStyle) {
  if (!part.cacheKey || !outlineStyle?.enabled) return null;
  return [
    part.cacheKey,
    'outline',
    outlineStyle.color,
    outlineStyle.opacity,
    outlineStyle.scale
  ].join('|');
}

function makeImageVoxelRenderMeshCacheKey(part: ImageVoxelPartRender, renderStyle: FighterRenderStyle) {
  if (!part.cacheKey) return null;
  return [
    part.cacheKey,
    'sidefill-shader-v1',
    renderStyle.opacity,
    renderStyle.tint,
    renderStyle.hueShiftDegrees,
    renderStyle.depthWrite ? 'dw1' : 'dw0'
  ].join('|');
}

function makeImageVoxelPreparedPartCacheKey(part: ImageVoxelPartRender, renderStyle: FighterRenderStyle) {
  const renderKey = makeImageVoxelRenderMeshCacheKey(part, renderStyle);
  return renderKey ? `${renderKey}|prepared-v1` : null;
}

function nextImageVoxelCapacity(count: number) {
  let capacity = 256;
  while (capacity < count) capacity *= 2;
  return capacity;
}

function createReusableImageVoxelMesh(capacity: number, renderStyle: FighterRenderStyle) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const frontColors = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  const sideColors = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  frontColors.setUsage(THREE.DynamicDrawUsage);
  sideColors.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('instanceFrontColor', frontColors);
  geometry.setAttribute('instanceSideColor', sideColors);
  const material = makeImageVoxelSideFillMaterial(renderStyle);
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.castShadow = renderStyle.castShadow;
  mesh.receiveShadow = renderStyle.receiveShadow;
  mesh.renderOrder = renderStyle.renderOrder;
  mesh.frustumCulled = false;
  return mesh;
}

function applyPreparedImageVoxelPart(mesh: THREE.InstancedMesh, prepared: PreparedImageVoxelPartRender) {
  mesh.count = prepared.count;
  mesh.instanceMatrix.array.set(prepared.matrixArray, 0);
  mesh.instanceMatrix.needsUpdate = true;
  const geometry = mesh.geometry;
  const frontColors = geometry.getAttribute('instanceFrontColor') as THREE.InstancedBufferAttribute | undefined;
  const sideColors = geometry.getAttribute('instanceSideColor') as THREE.InstancedBufferAttribute | undefined;
  frontColors?.array.set(prepared.frontColors, 0);
  sideColors?.array.set(prepared.sideColors, 0);
  if (frontColors) frontColors.needsUpdate = true;
  if (sideColors) sideColors.needsUpdate = true;
}

function prepareImageVoxelPartForRender(part: ImageVoxelPartRender, renderStyle: FighterRenderStyle): PreparedImageVoxelPartRender {
  const cacheKey = makeImageVoxelPreparedPartCacheKey(part, renderStyle);
  const cached = cacheKey ? imageVoxelPreparedPartCache.get(cacheKey) : undefined;
  if (cached) return cached;

  const startedAt = performance.now();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const frontColor = new THREE.Color();
  const sideColor = new THREE.Color();
  const renderVoxels = part.voxels.map(normalizeImageVoxelForRender);
  const matrixArray = new Float32Array(renderVoxels.length * 16);
  const frontColors = new Float32Array(renderVoxels.length * 3);
  const sideColors = new Float32Array(renderVoxels.length * 3);

  renderVoxels.forEach((renderVoxel, index) => {
    frontColor.set(renderStyleColor(renderVoxel.color, renderStyle));
    sideColor.set(renderStyleColor(renderVoxel.sideColor ?? renderVoxel.color, renderStyle));
    position.set(
      renderVoxel.position[0] - part.anchor[0],
      renderVoxel.position[1] - part.anchor[1],
      renderVoxel.position[2] - part.anchor[2]
    );
    scale.set(renderVoxel.size[0], renderVoxel.size[1], renderVoxel.size[2]);
    matrix.compose(position, rotation, scale);
    matrix.toArray(matrixArray, index * 16);
    frontColors[index * 3] = frontColor.r;
    frontColors[index * 3 + 1] = frontColor.g;
    frontColors[index * 3 + 2] = frontColor.b;
    sideColors[index * 3] = sideColor.r;
    sideColors[index * 3 + 1] = sideColor.g;
    sideColors[index * 3 + 2] = sideColor.b;
  });

  const prepared = {
    anchor: part.anchor,
    count: renderVoxels.length,
    matrixArray,
    frontColors,
    sideColors
  };
  if (cacheKey) imageVoxelPreparedPartCache.set(cacheKey, prepared);
  recordMenuPerfDuration('voxelBuildMs', startedAt);
  return prepared;
}

function buildInstancedVoxelOutlineMesh(part: ImageVoxelPartRender, outlineStyle?: FighterOutlineStyle) {
  if (!outlineStyle?.enabled || part.voxels.length === 0) return null;
  const cacheKey = makeImageVoxelOutlineMeshCacheKey(part, outlineStyle);
  const cached = cacheKey ? imageVoxelOutlineMeshCache.get(cacheKey) : undefined;
  if (cached) {
    const outline = makeCachedVoxelMesh(cached, { renderOrder: -8, frustumCulled: false });
    outline.scale.setScalar(outlineStyle.scale);
    return outline;
  }
  const outlinedVoxels = part.voxels
    .map(normalizeImageVoxelForRender)
    .filter((voxel) => shouldRenderVoxelOutline(voxel.color));
  if (outlinedVoxels.length === 0) return null;
  const baseGeometry = new THREE.BoxGeometry(1, 1, 1);
  const geometries = outlinedVoxels.map((renderVoxel) => {
    const geometry = baseGeometry.clone();
    const color = outlineColorForVoxel(renderVoxel.color);
    const colors = new Float32Array((geometry.getAttribute('position').count ?? 0) * 3);
    for (let index = 0; index < colors.length; index += 3) {
      colors[index] = color.r;
      colors[index + 1] = color.g;
      colors[index + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(
          renderVoxel.position[0] - part.anchor[0],
          renderVoxel.position[1] - part.anchor[1],
          renderVoxel.position[2] - part.anchor[2]
        ),
        new THREE.Quaternion(),
        new THREE.Vector3(renderVoxel.size[0], renderVoxel.size[1], renderVoxel.size[2])
      )
    );
    return geometry;
  });
  baseGeometry.dispose();
  const geometry = mergeGeometries(geometries, false);
  geometries.forEach((entry) => entry.dispose());
  if (!geometry) return null;
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: outlineStyle.opacity,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false
  });
  const outline = new THREE.Mesh(geometry, material);
  outline.scale.setScalar(outlineStyle.scale);
  outline.renderOrder = -8;
  outline.frustumCulled = false;
  if (cacheKey) {
    imageVoxelOutlineMeshCache.set(cacheKey, { geometry, material });
    outline.userData.koreCachedVoxelMesh = true;
  }
  return outline;
}

function buildInstancedVoxelMesh(part: ImageVoxelPartRender, renderStyle: FighterRenderStyle) {
  if (part.voxels.length === 0) return null;
  const cacheKey = makeImageVoxelRenderMeshCacheKey(part, renderStyle);
  const cached = cacheKey ? imageVoxelRenderMeshCache.get(cacheKey) : undefined;
  if (cached) return cloneCachedImageVoxelMesh(cached, renderStyle);

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = makeImageVoxelSideFillMaterial(renderStyle);
  const mesh = new THREE.InstancedMesh(geometry, material, part.voxels.length);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const frontColors = new Float32Array(part.voxels.length * 3);
  const sideColors = new Float32Array(part.voxels.length * 3);

  part.voxels.forEach((voxel, index) => {
    const renderVoxel = normalizeImageVoxelForRender(voxel);
    const frontColor = new THREE.Color(renderStyleColor(renderVoxel.color, renderStyle));
    const sideColor = new THREE.Color(renderStyleColor(renderVoxel.sideColor ?? renderVoxel.color, renderStyle));
    position.set(
      renderVoxel.position[0] - part.anchor[0],
      renderVoxel.position[1] - part.anchor[1],
      renderVoxel.position[2] - part.anchor[2]
    );
    scale.set(renderVoxel.size[0], renderVoxel.size[1], renderVoxel.size[2]);
    matrix.compose(position, rotation, scale);
    mesh.setMatrixAt(index, matrix);
    frontColors[index * 3] = frontColor.r;
    frontColors[index * 3 + 1] = frontColor.g;
    frontColors[index * 3 + 2] = frontColor.b;
    sideColors[index * 3] = sideColor.r;
    sideColors[index * 3 + 1] = sideColor.g;
    sideColors[index * 3 + 2] = sideColor.b;
  });

  geometry.setAttribute('instanceFrontColor', new THREE.InstancedBufferAttribute(frontColors, 3));
  geometry.setAttribute('instanceSideColor', new THREE.InstancedBufferAttribute(sideColors, 3));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = renderStyle.castShadow;
  mesh.receiveShadow = renderStyle.receiveShadow;
  mesh.renderOrder = renderStyle.renderOrder;
  mesh.frustumCulled = false;
  if (cacheKey) {
    mesh.userData.koreCachedVoxelMesh = true;
    imageVoxelRenderMeshCache.set(cacheKey, mesh);
    return cloneCachedImageVoxelMesh(mesh, renderStyle);
  }
  return mesh;
}

function cloneCachedImageVoxelMesh(cached: THREE.InstancedMesh, renderStyle: FighterRenderStyle) {
  const clone = new THREE.InstancedMesh(cached.geometry, cached.material, cached.count);
  clone.instanceMatrix = cached.instanceMatrix;
  clone.castShadow = renderStyle.castShadow;
  clone.receiveShadow = renderStyle.receiveShadow;
  clone.renderOrder = renderStyle.renderOrder;
  clone.frustumCulled = false;
  clone.userData.koreCachedVoxelMesh = true;
  return clone;
}

function makeImageVoxelSideFillMaterial(renderStyle: FighterRenderStyle) {
  return new THREE.ShaderMaterial({
    uniforms: {
      opacity: { value: renderStyle.opacity }
    },
    vertexShader: `
      attribute vec3 instanceFrontColor;
      attribute vec3 instanceSideColor;
      varying vec3 vFrontColor;
      varying vec3 vSideColor;
      varying vec3 vLocalNormal;

      void main() {
        vFrontColor = instanceFrontColor;
        vSideColor = instanceSideColor;
        vLocalNormal = normal;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float opacity;
      varying vec3 vFrontColor;
      varying vec3 vSideColor;
      varying vec3 vLocalNormal;

      void main() {
        vec3 color = abs(vLocalNormal.z) > 0.5 ? vFrontColor : vSideColor;
        gl_FragColor = vec4(color, opacity);
      }
    `,
    transparent: renderStyle.opacity < 1,
    depthWrite: renderStyle.depthWrite,
    toneMapped: false
  });
}

function normalizeImageVoxelForRender(voxel: ImageVoxel): ImageVoxel {
  const depth = THREE.MathUtils.clamp(voxel.size[2] * IMAGE_VOXEL_DEPTH_SCALE, IMAGE_VOXEL_MIN_DEPTH, IMAGE_VOXEL_MAX_DEPTH);
  return {
    ...voxel,
    position: [
      voxel.position[0],
      voxel.position[1],
      THREE.MathUtils.clamp(voxel.position[2] * 0.28, -0.018, 0.018)
    ],
    size: [voxel.size[0] * IMAGE_VOXEL_PIXEL_SCALE, voxel.size[1] * IMAGE_VOXEL_PIXEL_SCALE, depth],
    color: voxel.source === 'hd' ? voxel.color : enhanceVoxelColor(voxel.color),
    sideColor: voxel.source === 'hd' ? voxel.sideColor : voxel.sideColor ? enhanceVoxelColor(voxel.sideColor) : undefined
  };
}

function enhanceVoxelColor(color: string) {
  const source = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  source.getHSL(hsl);
  source.setHSL(hsl.h, Math.min(1, hsl.s * 1.12), Math.min(0.86, Math.max(0.045, hsl.l * 1.08 + 0.025)));
  return `#${source.getHexString()}`;
}

function shouldRenderVoxelOutline(color: string) {
  const source = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  source.getHSL(hsl);
  const luminance = source.r * 0.2126 + source.g * 0.7152 + source.b * 0.0722;
  if (luminance > 0.84) return false;
  if (luminance > 0.68 && hsl.s < 0.35) return false;
  return hsl.s > 0.22 || luminance < 0.52;
}

function outlineColorForVoxel(color: string) {
  const source = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  source.getHSL(hsl);
  source.setHSL(hsl.h, Math.min(1, hsl.s * 1.08 + 0.04), Math.max(0.035, hsl.l * 0.34));
  return source;
}

function buildVoxelParts(voxels: ImageVoxel[], lodStep = 1, sourceKey?: string) {
  const partNames: ImageVoxelPart[] = ['head', 'torso', 'leadArm', 'rearArm', 'leadLeg', 'rearLeg'];
  return Object.fromEntries(
    partNames.map((part) => {
      const partVoxels = voxels.filter((voxel, index) => voxel.part === part && (lodStep <= 1 || index % lodStep === 0));
      return [part, {
        anchor: getPartAnchor(part, partVoxels),
        voxels: partVoxels,
        cacheKey: sourceKey ? `${sourceKey}|lod:${lodStep}|part:${part}` : undefined
      }];
    })
  ) as Record<ImageVoxelPart, ImageVoxelPartRender>;
}

function getPartAnchor(part: ImageVoxelPart, voxels: ImageVoxel[]): [number, number, number] {
  const fallback: Record<ImageVoxelPart, [number, number, number]> = {
    head: [0, 1.55, 0],
    torso: [0, 1.08, 0],
    leadArm: [0.5, 1.1, 0],
    rearArm: [-0.5, 1.1, 0],
    leadLeg: [0.17, 0.48, 0],
    rearLeg: [-0.17, 0.48, 0]
  };
  if (voxels.length === 0) return fallback[part];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const voxel of voxels) {
    minX = Math.min(minX, voxel.position[0]);
    minY = Math.min(minY, voxel.position[1]);
    maxX = Math.max(maxX, voxel.position[0]);
    maxY = Math.max(maxY, voxel.position[1]);
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2, 0];
}

async function extractImageVoxels(src: string): Promise<ImageVoxel[]> {
  const image = new Image();
  image.src = src;
  await image.decode();

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return [];
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const background = averageCornerColor(imageData);
  const bounds = getForegroundBounds(imageData, background);
  if (!bounds) return [];

  const bboxWidth = bounds.maxX - bounds.minX + 1;
  const bboxHeight = bounds.maxY - bounds.minY + 1;
  const rows = 24;
  const columns = Math.max(18, Math.min(26, Math.round(rows * (bboxWidth / bboxHeight))));
  const aspect = bboxWidth / bboxHeight;
  const maxModelWidth = 2.65;
  const modelHeight = Math.min(2.05, maxModelWidth / aspect);
  const modelWidth = modelHeight * aspect;
  const cellWidth = modelWidth / columns;
  const cellHeight = modelHeight / rows;
  const voxels: ImageVoxel[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const sample = sampleCell(imageData, bounds, background, column, row, columns, rows);
      if (!sample) continue;
      const x = ((column + 0.5) / columns) * modelWidth - modelWidth / 2;
      const y = modelHeight - (row + 0.5) * cellHeight + 0.02;
      const topRatio = row / rows;
      const xRatio = (column + 0.5) / columns - 0.5;
      const depth = 0.1 + sample.foregroundRatio * 0.08;
      voxels.push({
        part: classifyImageVoxel(topRatio, xRatio),
        position: [x, y, sample.brightness > 150 ? 0.02 : -0.01],
        size: [cellWidth * 0.96, cellHeight * 0.96, depth],
        color: sample.color
      });
    }
  }

  return voxels;
}

async function loadPrecomputedImageVoxels(src: string, character: CharacterDefinition) {
  const path = getPrecomputedVoxelPath(src, character.voxelProfile === 'hd-image-source');
  if (!path) return null;
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    const payload = await response.json();
    return normalizePrecomputedImageVoxels(payload);
  } catch {
    return null;
  }
}

async function loadPackedImageVoxels(src: string, character: CharacterDefinition): Promise<ImageVoxel[] | null> {
  const frame = getVoxelPackFrameName(src);
  if (!frame || character.voxelProfile !== 'hd-image-source') return null;
  const voxels = await loadHdVoxelFrameInWorker(character, src);
  if (!voxels) {
    incrementMenuPerfCounter('voxelPackMisses');
    return null;
  }
  incrementMenuPerfCounter('voxelPackHits');
  return voxels;
}

function getVoxelPackFrameName(src: string | undefined) {
  const frameIndex = src?.split('?')[0]?.match(/frame-(\d+)\.png$/)?.[1];
  return frameIndex ? `frame-${frameIndex}` : null;
}

function getPrecomputedVoxelPath(src: string, hd = false) {
  const cleanSrc = src.split('?')[0] ?? src;
  const match = cleanSrc.match(/^(\/characters\/[\w-]+)\/frames\/(frame-\d+)\.png$/)
    ?? cleanSrc.match(/^(\/characters\/[\w-]+\/projectiles\/[\w-]+)\/frames\/(frame-\d+)\.png$/);
  if (!match) return null;
  const queryIndex = src.indexOf('?');
  const cacheBust = queryIndex >= 0 ? src.slice(queryIndex) : '';
  return `${match[1]}/${hd ? 'voxels-hd' : 'voxels'}/${match[2]}.json${cacheBust}`;
}

function normalizePrecomputedImageVoxels(payload: unknown): ImageVoxel[] | null {
  if (Array.isArray(payload)) return payload as ImageVoxel[];
  return normalizeHdVoxelPayload(payload) as ImageVoxel[] | null;
}

async function loadImageVoxels(src: string, character: CharacterDefinition) {
  if (character.voxelProfile === 'hd-image-source') {
    const packedVoxels = await loadPackedImageVoxels(src, character);
    if (packedVoxels) return packedVoxels;
    const hdVoxels = await loadPrecomputedImageVoxels(src, character);
    if (hdVoxels) {
      incrementMenuPerfCounter('voxelJsonFallbacks');
      return hdVoxels;
    }
  }
  return (await loadPrecomputedImageVoxels(src, { ...character, voxelProfile: 'image-source' })) ?? extractImageVoxels(src);
}

function getForegroundBounds(imageData: ImageData, background: [number, number, number]) {
  const { width, height, data } = imageData;
  const bounds = { minX: width, minY: height, maxX: 0, maxY: 0 };
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const offset = (y * width + x) * 4;
      if (!isForegroundPixel(data[offset], data[offset + 1], data[offset + 2], data[offset + 3], background)) continue;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  if (bounds.minX >= bounds.maxX || bounds.minY >= bounds.maxY) return null;
  const padX = Math.round((bounds.maxX - bounds.minX) * 0.02);
  const padY = Math.round((bounds.maxY - bounds.minY) * 0.02);
  return {
    minX: Math.max(0, bounds.minX - padX),
    minY: Math.max(0, bounds.minY - padY),
    maxX: Math.min(width - 1, bounds.maxX + padX),
    maxY: Math.min(height - 1, bounds.maxY + padY)
  };
}

function averageCornerColor(imageData: ImageData): [number, number, number] {
  const { width, height, data } = imageData;
  const points = [
    [2, 2],
    [width - 3, 2],
    [2, height - 3],
    [width - 3, height - 3]
  ];
  const total = points.reduce(
    (sum, [x, y]) => {
      const offset = (y * width + x) * 4;
      return [sum[0] + data[offset], sum[1] + data[offset + 1], sum[2] + data[offset + 2]];
    },
    [0, 0, 0]
  );
  return [total[0] / points.length, total[1] / points.length, total[2] / points.length];
}

function sampleCell(
  imageData: ImageData,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  background: [number, number, number],
  column: number,
  row: number,
  columns: number,
  rows: number
) {
  const { width, data } = imageData;
  const cellMinX = Math.floor(bounds.minX + ((bounds.maxX - bounds.minX) * column) / columns);
  const cellMaxX = Math.floor(bounds.minX + ((bounds.maxX - bounds.minX) * (column + 1)) / columns);
  const cellMinY = Math.floor(bounds.minY + ((bounds.maxY - bounds.minY) * row) / rows);
  const cellMaxY = Math.floor(bounds.minY + ((bounds.maxY - bounds.minY) * (row + 1)) / rows);
  let foreground = 0;
  let samples = 0;
  let red = 0;
  let green = 0;
  let blue = 0;

  for (let y = cellMinY; y <= cellMaxY; y += Math.max(1, Math.floor((cellMaxY - cellMinY) / 4))) {
    for (let x = cellMinX; x <= cellMaxX; x += Math.max(1, Math.floor((cellMaxX - cellMinX) / 4))) {
      const offset = (y * width + x) * 4;
      samples += 1;
      if (!isForegroundPixel(data[offset], data[offset + 1], data[offset + 2], data[offset + 3], background)) continue;
      foreground += 1;
      red += data[offset];
      green += data[offset + 1];
      blue += data[offset + 2];
    }
  }

  const foregroundRatio = samples > 0 ? foreground / samples : 0;
  if (foregroundRatio < 0.22 || foreground === 0) return null;
  const color = quantizeColor(red / foreground, green / foreground, blue / foreground);
  return {
    color,
    brightness: (red + green + blue) / foreground / 3,
    foregroundRatio
  };
}

function isForegroundPixel(red: number, green: number, blue: number, alpha: number, background: [number, number, number]) {
  if (alpha < 24) return false;
  const blueScreen = blue > 165 && blue > red * 1.7 && blue > green * 1.2;
  if (blueScreen) return false;
  const distance = Math.hypot(red - background[0], green - background[1], blue - background[2]);
  return distance > 72;
}

function quantizeColor(red: number, green: number, blue: number) {
  const snap = (value: number) => Math.max(0, Math.min(255, Math.round(value / 17) * 17));
  return `#${[snap(red), snap(green), snap(blue)].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function classifyImageVoxel(topRatio: number, xRatio: number): ImageVoxelPart {
  if (topRatio < 0.29) return 'head';
  if (topRatio > 0.58) return xRatio >= 0 ? 'leadLeg' : 'rearLeg';
  if (Math.abs(xRatio) > 0.26) return xRatio >= 0 ? 'leadArm' : 'rearArm';
  return 'torso';
}

function VoxelSpriteFighter({
  fighter,
  progress,
  timeScale = 1,
  frameTimeOverride,
  outlineStyle,
  renderStyle
}: {
  fighter: FighterRuntime;
  progress: number;
  timeScale?: number;
  frameTimeOverride?: number;
  outlineStyle?: FighterOutlineStyle;
  renderStyle: FighterRenderStyle;
}) {
  const root = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const leadArm = useRef<THREE.Group>(null);
  const rearArm = useRef<THREE.Group>(null);
  const leadLeg = useRef<THREE.Group>(null);
  const rearLeg = useRef<THREE.Group>(null);
  const palette = getVoxelPalette(fighter.character);
  const scaledTime = useRef(0);

  useEffect(() => {
    if (fighter.character.voxelProfile === 'hd-image-source') recordHdProceduralFallback(fighter.character.id);
  }, [fighter.character.id, fighter.character.voxelProfile]);

  useFrame((_, delta) => {
    if (frameTimeOverride === undefined) scaledTime.current += delta * timeScale;
    else scaledTime.current = frameTimeOverride;
    const t = scaledTime.current;
    const liveProgress = getFighterRenderProgress(fighter);
    const moving = fighter.state === 'walk' || fighter.state === 'sidestep';
    const walk = moving ? Math.sin(t * 12) : 0;
    const attack = fighter.state === 'attack' || fighter.state === 'throwHold' ? Math.sin(liveProgress * Math.PI) : 0;
    const block = fighter.state === 'block' || fighter.state === 'crouchBlock' ? 1 : 0;
    const crouch = fighter.state === 'crouch' || fighter.state === 'crouchBlock' ? 1 : 0;
    const blockBreath = block ? Math.sin(t * 3.2 + fighter.slot * 0.7) : 0;
    const blockBreathUp = block ? (blockBreath + 1) * 0.5 : 0;
    const hit = 0;
    const jump = fighter.state === 'jump' ? 1 : 0;

    const smooth = 1 - Math.pow(0.001, delta);
    if (root.current) {
      root.current.position.y = THREE.MathUtils.lerp(root.current.position.y, (crouch ? -0.28 : 0) + blockBreath * 0.014, smooth);
      root.current.scale.y = THREE.MathUtils.lerp(root.current.scale.y, (crouch ? 0.84 : jump ? 1.04 : 1) * (1 + blockBreathUp * 0.012), smooth);
    }
    if (torso.current) {
      torso.current.rotation.x = THREE.MathUtils.lerp(torso.current.rotation.x, -block * 0.28 - crouch * 0.18 + hit * 0.2 - blockBreathUp * 0.025, smooth);
      torso.current.rotation.z = THREE.MathUtils.lerp(torso.current.rotation.z, attack * 0.12 * fighter.facing + blockBreath * 0.018 * fighter.facing, smooth);
    }
    if (head.current) {
      head.current.position.y = THREE.MathUtils.lerp(head.current.position.y, 1.63 - crouch * 0.12 + Math.sin(t * 4) * 0.012 + blockBreath * 0.018, smooth);
      head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, hit * 0.2, smooth);
    }
    if (leadArm.current) {
      leadArm.current.position.z = THREE.MathUtils.lerp(leadArm.current.position.z, 0.08 + attack * 0.52 + block * (0.18 + blockBreathUp * 0.025), smooth);
      leadArm.current.rotation.x = THREE.MathUtils.lerp(leadArm.current.rotation.x, -0.2 - attack * 1.25 - block * 0.78 + walk * 0.22 - blockBreathUp * 0.035, smooth);
      leadArm.current.rotation.z = THREE.MathUtils.lerp(leadArm.current.rotation.z, 0.18 + block * 0.32 + blockBreath * 0.012, smooth);
    }
    if (rearArm.current) {
      rearArm.current.position.z = THREE.MathUtils.lerp(rearArm.current.position.z, -0.06 + block * (0.16 + blockBreathUp * 0.02), smooth);
      rearArm.current.rotation.x = THREE.MathUtils.lerp(rearArm.current.rotation.x, 0.1 + attack * 0.35 - walk * 0.2 - block * 0.62 - blockBreathUp * 0.03, smooth);
      rearArm.current.rotation.z = THREE.MathUtils.lerp(rearArm.current.rotation.z, -0.12 - block * 0.24 - blockBreath * 0.01, smooth);
    }
    if (leadLeg.current) {
      leadLeg.current.rotation.x = THREE.MathUtils.lerp(leadLeg.current.rotation.x, walk * 0.42 + jump * 0.28 - crouch * 0.3, smooth);
    }
    if (rearLeg.current) {
      rearLeg.current.rotation.x = THREE.MathUtils.lerp(rearLeg.current.rotation.x, -walk * 0.42 - jump * 0.24 - crouch * 0.24, smooth);
    }
  });

  return (
    <group ref={root}>
      <group ref={head} position={[0, 1.63, 0]}>
        <VoxelBox outlineStyle={outlineStyle} renderStyle={renderStyle} position={[0, 0, 0]} size={[0.36, 0.28, 0.3]} color={palette.skin} />
        <VoxelBox outlineStyle={outlineStyle} renderStyle={renderStyle} position={[0, 0.18, -0.02]} size={[0.44, 0.16, 0.34]} color={palette.hair} />
        <VoxelBox outlineStyle={outlineStyle} renderStyle={renderStyle} position={[0, 0.07, 0.17]} size={[0.42, 0.06, 0.04]} color={palette.headband} />
        <VoxelBox outlineStyle={outlineStyle} renderStyle={renderStyle} position={[-0.24, 0.12, 0]} size={[0.08, 0.08, 0.22]} color={palette.hair} />
        <VoxelBox outlineStyle={outlineStyle} renderStyle={renderStyle} position={[0.24, 0.12, 0]} size={[0.08, 0.08, 0.22]} color={palette.hair} />
      </group>
      <group ref={torso} position={[0, 1.12, 0]}>
        <VoxelBox outlineStyle={outlineStyle} renderStyle={renderStyle} position={[0, 0.08, 0]} size={[0.5, 0.46, 0.32]} color={palette.jacket} />
        <VoxelBox outlineStyle={outlineStyle} renderStyle={renderStyle} position={[0, 0.12, 0.18]} size={[0.42, 0.12, 0.04]} color={palette.trim} />
        <VoxelBox outlineStyle={outlineStyle} renderStyle={renderStyle} position={[0, -0.2, 0]} size={[0.42, 0.16, 0.3]} color={palette.belt} />
        <VoxelBox outlineStyle={outlineStyle} renderStyle={renderStyle} position={[0, 0.34, 0]} size={[0.56, 0.1, 0.34]} color={palette.shoulder} />
      </group>
      <group ref={leadArm} position={[0.34, 1.24, 0.08]}>
        <VoxelBox outlineStyle={outlineStyle} renderStyle={renderStyle} position={[0, -0.16, 0]} size={[0.16, 0.34, 0.16]} color={palette.sleeve} />
        <VoxelBox outlineStyle={outlineStyle} renderStyle={renderStyle} position={[0, -0.42, 0.02]} size={[0.14, 0.3, 0.14]} color={palette.skin} />
        <VoxelBox outlineStyle={outlineStyle} renderStyle={renderStyle} position={[0, -0.6, 0.05]} size={[0.16, 0.1, 0.16]} color={palette.glove} />
      </group>
      <group ref={rearArm} position={[-0.34, 1.22, -0.06]}>
        <VoxelBox outlineStyle={outlineStyle} renderStyle={renderStyle} position={[0, -0.16, 0]} size={[0.16, 0.34, 0.16]} color={palette.sleeve} />
        <VoxelBox outlineStyle={outlineStyle} renderStyle={renderStyle} position={[0, -0.42, 0]} size={[0.14, 0.3, 0.14]} color={palette.skin} />
        <VoxelBox outlineStyle={outlineStyle} renderStyle={renderStyle} position={[0, -0.6, 0.02]} size={[0.16, 0.1, 0.16]} color={palette.glove} />
      </group>
      <group ref={leadLeg} position={[0.16, 0.78, 0.04]}>
        <VoxelBox outlineStyle={outlineStyle} renderStyle={renderStyle} position={[0, -0.24, 0]} size={[0.18, 0.5, 0.18]} color={palette.pants} />
        <VoxelBox outlineStyle={outlineStyle} renderStyle={renderStyle} position={[0.02, -0.56, 0.08]} size={[0.22, 0.12, 0.28]} color={palette.boot} />
      </group>
      <group ref={rearLeg} position={[-0.16, 0.78, -0.04]}>
        <VoxelBox outlineStyle={outlineStyle} renderStyle={renderStyle} position={[0, -0.24, 0]} size={[0.18, 0.5, 0.18]} color={palette.pants} />
        <VoxelBox outlineStyle={outlineStyle} renderStyle={renderStyle} position={[-0.02, -0.56, 0.06]} size={[0.22, 0.12, 0.28]} color={palette.boot} />
      </group>
    </group>
  );
}

function VoxelBox({
  position,
  size,
  color,
  outlineStyle,
  renderStyle
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  outlineStyle?: FighterOutlineStyle;
  renderStyle: FighterRenderStyle;
}) {
  const outlineColor = useMemo(() => outlineColorForVoxel(color), [color]);
  const showOutline = outlineStyle?.enabled && shouldRenderVoxelOutline(color);
  const materialColor = renderStyleColor(color, renderStyle);
  return (
    <group position={position}>
      {showOutline && (
        <mesh scale={outlineStyle.scale} renderOrder={-8}>
          <boxGeometry args={size} />
          <meshBasicMaterial color={outlineColor} transparent opacity={outlineStyle.opacity} side={THREE.BackSide} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <mesh castShadow={renderStyle.castShadow} receiveShadow={renderStyle.receiveShadow} renderOrder={renderStyle.renderOrder}>
        <boxGeometry args={size} />
        <meshToonMaterial color={materialColor} transparent={renderStyle.opacity < 1} opacity={renderStyle.opacity} depthWrite={renderStyle.depthWrite} />
      </mesh>
    </group>
  );
}

function getVoxelPalette(character: CharacterDefinition) {
  if (character.voxelProfile === 'shinobi-blue') {
    return {
      skin: '#e8c7ad',
      hair: '#11131b',
      headband: '#d9e3ff',
      jacket: '#3157ff',
      shoulder: '#1d2f90',
      sleeve: '#1b1d26',
      trim: '#d9e3ff',
      belt: '#11131b',
      pants: '#1b1d26',
      boot: '#d9e3ff',
      glove: '#10131d',
      energy: '#9b5cff'
    };
  }
  return {
    skin: '#f2c7a0',
    hair: '#ffd447',
    headband: '#f7f7f2',
    jacket: '#ff8a1f',
    shoulder: '#cc5d12',
    sleeve: '#f2c7a0',
    trim: '#202dff',
    belt: '#202dff',
    pants: '#202dff',
    boot: '#f7f7f2',
    glove: '#f7f7f2',
    energy: '#2ee6ff'
  };
}

function ExternalFighter({ fighter, url, timeScale = 1, renderStyle }: { fighter: FighterRuntime; url: string; timeScale?: number; renderStyle: FighterRenderStyle }) {
  const gltf = useGLTF(url);
  const model = useMemo(() => {
    const cloned = clone(gltf.scene);
    cloned.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = renderStyle.castShadow;
      object.receiveShadow = renderStyle.receiveShadow;
      object.renderOrder = renderStyle.renderOrder;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const styledMaterials = materials.map((material) => {
        const styled = material.clone();
        styled.transparent = renderStyle.opacity < 1 || styled.transparent;
        styled.opacity = renderStyle.opacity;
        styled.depthWrite = renderStyle.depthWrite;
        if ('color' in styled && styled.color instanceof THREE.Color) {
          applyRenderStyleToMaterialColor(styled.color, renderStyle);
        }
        return styled;
      });
      object.material = Array.isArray(object.material) ? styledMaterials : styledMaterials[0];
    });
    return cloned;
  }, [gltf.scene, renderStyle]);
  const wrapper = useRef<THREE.Group>(null);
  const { actions, names } = useAnimations(gltf.animations, model);
  const desiredClip = chooseClip(names, fighter);

  useEffect(() => {
    if (!desiredClip) return;
    for (const [name, action] of Object.entries(actions)) {
      if (!action) continue;
      if (name === desiredClip) {
        action.reset().fadeIn(0.12).play();
      } else {
        action.fadeOut(0.12);
      }
    }
  }, [actions, desiredClip]);

  useFrame((_, delta) => {
    if (!wrapper.current) return;
    const liveProgress = getFighterRenderProgress(fighter);
    Object.entries(actions).forEach(([name, action]) => {
      if (!action) return;
      if ((fighter.state === 'attack' || hasVisualHitstop(fighter)) && name === desiredClip) {
        const clipDuration = action.getClip().duration || 1;
        action.timeScale = 0;
        action.time = THREE.MathUtils.clamp(liveProgress, 0, 0.999) * clipDuration;
      } else {
        action.timeScale = timeScale;
      }
    });
    const attack = fighter.state === 'attack' || fighter.state === 'throwHold' ? Math.sin(liveProgress * Math.PI) : 0;
    const hit = 0;
    const block = fighter.state === 'block' || fighter.state === 'crouchBlock' ? 1 : 0;
    const crouch = fighter.state === 'crouch' || fighter.state === 'crouchBlock' ? 1 : 0;
    const tornadoReaction = hasTornadoReactionVisual(fighter);
    const knockdown = fighter.state === 'knockdown' || tornadoReaction ? 1 : 0;
    const getup = fighter.state === 'getup' ? 1 - getGetupRenderProgress(fighter) : 0;
    const juggle = fighter.state === 'juggle' && !tornadoReaction ? 1 : 0;
    wrapper.current.rotation.x = THREE.MathUtils.lerp(wrapper.current.rotation.x, knockdown * -0.85 + getup * -0.85 + juggle * -0.42 + block * -0.18 + crouch * -0.28 + hit * 0.18, 1 - Math.pow(0.001, delta));
    wrapper.current.rotation.z = THREE.MathUtils.lerp(wrapper.current.rotation.z, attack * 0.22 * fighter.facing - hit * 0.12 * fighter.facing + juggle * Math.sin(Date.now() * 0.0038 + fighter.slot) * 0.22, 1 - Math.pow(0.001, delta));
    wrapper.current.position.y = THREE.MathUtils.lerp(wrapper.current.position.y, crouch ? -0.22 : block ? -0.06 : 0, 1 - Math.pow(0.001, delta));
  });

  return (
    <group ref={wrapper}>
      <primitive object={model} />
    </group>
  );
}

function chooseClip(names: string[], fighter: FighterRuntime) {
  if (names.length === 0) return null;
  const normalized = names.map((name) => ({ name, key: name.toLowerCase() }));
  const find = (...needles: string[]) =>
    normalized.find((clip) => needles.some((needle) => clip.key.includes(needle)))?.name;
  if (hasVisualHitstop(fighter)) {
    const key = fighter.visualHitstop.animationKey?.toLowerCase() ?? '';
    const token = key.split(':').pop()?.replace(/[^a-z]/g, '') ?? '';
    return normalized.find((clip) => (token && clip.key.includes(token)) || clip.key.includes(key))?.name ?? find('punch', 'attack', 'wave') ?? names[0];
  }
  if (isIdleFlourishActive(fighter)) return find('dance', 'taunt', 'yes', 'wave', 'win', 'idle', 'standing') ?? names[0];
  if (fighter.state === 'attack' || fighter.state === 'throwHold') return find('punch', 'attack', 'wave') ?? names[0];
  if (fighter.state === 'walk' || fighter.state === 'sidestep') return find('walk', 'run', 'animation') ?? names[0];
  if (fighter.state === 'jump') return find('jump', 'walk', 'run', 'idle') ?? names[0];
  if (fighter.state === 'crouchBlock') return find('crouch', 'block', 'idle', 'standing') ?? names[0];
  if (fighter.state === 'crouch') return find('crouch', 'idle', 'standing') ?? names[0];
  if (fighter.state === 'chargeKi' || fighter.state === 'transform') return find('charge', 'power', 'taunt', 'idle', 'standing') ?? names[0];
  if (fighter.state === 'block') return find('idle', 'standing') ?? names[0];
  if (fighter.state === 'hit' || fighter.state === 'throwHeld' || fighter.state === 'juggle' || fighter.state === 'knockdown' || fighter.state === 'getup') return find('death', 'no', 'idle') ?? names[0];
  if (fighter.state === 'entry') return find('intro', 'entry', 'taunt', 'wave', 'yes', 'idle') ?? names[0];
  if (fighter.state === 'win') return find('dance', 'yes', 'wave') ?? names[0];
  if (fighter.state === 'lose') return find('death', 'no') ?? names[0];
  return find('idle', 'standing') ?? names[0];
}

function ProceduralFighter({
  fighter,
  color,
  timeScale = 1,
  frameTimeOverride,
  outlineStyle: _outlineStyle,
  renderStyle
}: {
  fighter: FighterRuntime;
  color: string;
  timeScale?: number;
  frameTimeOverride?: number;
  outlineStyle?: FighterOutlineStyle;
  renderStyle: FighterRenderStyle;
}) {
  const root = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Mesh>(null);
  const head = useRef<THREE.Mesh>(null);
  const leadArm = useRef<THREE.Group>(null);
  const rearArm = useRef<THREE.Group>(null);
  const leadLeg = useRef<THREE.Group>(null);
  const rearLeg = useRef<THREE.Group>(null);
  const secondary = fighter.character.colors.secondary;
  const accent = fighter.character.colors.accent;
  const bulk = fighter.character.id === 'dax' ? 1.12 : 0.95;
  const scaledTime = useRef(0);
  const materialProps = {
    transparent: renderStyle.opacity < 1,
    opacity: renderStyle.opacity,
    depthWrite: renderStyle.depthWrite
  };
  const styledColor = (source: string) => renderStyleColor(source, renderStyle);
  const meshShadowProps = {
    castShadow: renderStyle.castShadow,
    receiveShadow: renderStyle.receiveShadow,
    renderOrder: renderStyle.renderOrder
  };

  useFrame((_, delta) => {
    if (frameTimeOverride === undefined) scaledTime.current += delta * timeScale;
    else scaledTime.current = frameTimeOverride;
    const t = scaledTime.current;
    const liveProgress = getFighterRenderProgress(fighter);
    const moving = fighter.state === 'walk' || fighter.state === 'sidestep';
    const walk = moving ? Math.sin(t * 11) : 0;
    const side = fighter.state === 'sidestep' ? Math.sin(t * 13) * 0.16 : 0;
    const attack = fighter.state === 'attack' || fighter.state === 'throwHold' ? Math.sin(liveProgress * Math.PI) : 0;
    const block = fighter.state === 'block' || fighter.state === 'crouchBlock' ? 1 : 0;
    const hit = 0;
    const crouch = fighter.state === 'crouch' || fighter.state === 'crouchBlock' ? -0.3 : block ? -0.12 : 0;
    const jump = fighter.state === 'jump' ? 1 : 0;

    if (root.current) {
      root.current.position.y = THREE.MathUtils.lerp(root.current.position.y, crouch, 1 - Math.pow(0.001, delta));
    }
    if (torso.current) {
      torso.current.rotation.x = THREE.MathUtils.lerp(torso.current.rotation.x, block * -0.32 - jump * 0.16 + hit * 0.22, 0.35);
      torso.current.rotation.z = THREE.MathUtils.lerp(torso.current.rotation.z, side + attack * 0.1, 0.32);
    }
    if (head.current) {
      head.current.position.y = 1.72 + Math.sin(t * 4 + fighter.slot) * 0.018;
      head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, hit * 0.24, 0.28);
    }
    if (leadArm.current) {
      leadArm.current.position.z = 0.06 + attack * 0.52 + block * 0.16;
      leadArm.current.position.y = 1.28 - block * 0.08;
      leadArm.current.rotation.x = -0.18 - attack * 1.35 - block * 0.86 + walk * 0.22;
      leadArm.current.rotation.z = 0.18 + block * 0.36;
    }
    if (rearArm.current) {
      rearArm.current.position.z = -0.04 + block * 0.14;
      rearArm.current.position.y = 1.23 - block * 0.04;
      rearArm.current.rotation.x = 0.12 + attack * 0.38 - walk * 0.2 - block * 0.7;
      rearArm.current.rotation.z = -0.12 - block * 0.28;
    }
    if (leadLeg.current) {
      leadLeg.current.rotation.x = walk * 0.34 + side * 0.5 + jump * 0.28;
      leadLeg.current.rotation.z = side * 0.3;
    }
    if (rearLeg.current) {
      rearLeg.current.rotation.x = -walk * 0.34 - side * 0.5 - jump * 0.28;
      rearLeg.current.rotation.z = -side * 0.3;
    }
  });

  return (
    <group ref={root}>
      <mesh ref={head} {...meshShadowProps} position={[0, 1.72, 0]}>
        <sphereGeometry args={[0.24 * bulk, 20, 16]} />
        <meshToonMaterial color={styledColor(color)} emissive={styledColor(color)} emissiveIntensity={0.05} {...materialProps} />
      </mesh>
      <mesh ref={torso} {...meshShadowProps} position={[0, 1.22, 0]}>
        <capsuleGeometry args={[0.28 * bulk, 0.72, 8, 18]} />
        <meshToonMaterial color={styledColor(secondary)} {...materialProps} />
      </mesh>
      <group ref={leadArm} position={[0.23, 1.22, 0.08]}>
        <mesh {...meshShadowProps} position={[0, -0.22, 0]}>
          <capsuleGeometry args={[0.07, 0.62, 6, 12]} />
          <meshToonMaterial color={styledColor(accent)} {...materialProps} />
        </mesh>
      </group>
      <group ref={rearArm} position={[-0.23, 1.22, -0.05]}>
        <mesh {...meshShadowProps} position={[0, -0.2, 0]}>
          <capsuleGeometry args={[0.07, 0.58, 6, 12]} />
          <meshToonMaterial color={styledColor(color)} {...materialProps} />
        </mesh>
      </group>
      <group ref={leadLeg} position={[0.15, 0.78, 0.04]}>
        <mesh {...meshShadowProps} position={[0, -0.3, 0]}>
          <capsuleGeometry args={[0.09, 0.76, 6, 12]} />
          <meshToonMaterial color={styledColor(color)} {...materialProps} />
        </mesh>
      </group>
      <group ref={rearLeg} position={[-0.15, 0.78, -0.04]}>
        <mesh {...meshShadowProps} position={[0, -0.3, 0]}>
          <capsuleGeometry args={[0.09, 0.76, 6, 12]} />
          <meshToonMaterial color={styledColor(accent)} {...materialProps} />
        </mesh>
      </group>
    </group>
  );
}

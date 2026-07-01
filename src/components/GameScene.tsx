import { Bounds, ContactShadows, Environment, OrbitControls, useAnimations, useGLTF, useProgress } from '@react-three/drei';
import { Canvas, useFrame, useLoader, useThree, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {
  CharacterDefinition,
  CharacterEffectDefinition,
  EffectSoundCue,
  EffectTransform,
  FighterRuntime,
  FighterState,
  GameSettings,
  GetupAction,
  ImpactSparkEvent,
  MatchSnapshot,
  MoveEffectInstance,
  MoveDefinition,
  MoveInput,
  StageDefinition,
  StageLayerDefinition,
  StageModelDefinition,
  StagePropDefinition
} from '../types';
import { activeMoveProgress } from '../engine/fightEngine';
import { getCharacterGlobalScale } from '../lib/characterScale';
import { debugLogThrottled } from '../lib/debugLogger';
import { effectIsVisibleAt, effectTransformAt, shouldFireEffectCue } from '../lib/effects';
import { getStageVisualStylePresetDefaults, resolveStageVisualStyle } from '../lib/stageVisualStyle';
import { StageFloorEffects as UpgradedStageFloorEffects } from './StageFloorEffects';

type GameSceneProps = {
  match: MatchSnapshot;
  cameraSettings?: GameSettings['camera'];
  sparkSettings?: GameSettings['display']['impactSparks'];
  audioSettings?: GameSettings['audio'];
  reducedMotion?: boolean;
};

const defaultCameraSettings: GameSettings['camera'] = {
  distance: 1,
  height: 1,
  smoothing: 1,
  zoomBias: 1
};

const DEFAULT_SKYBOX_PATH = '/stages/shared/default-skybox.png';
const MODEL_STAGE_IDS = new Set(['hidden-leaf-village', 'naruto-apartment', 'naruto-apartment-fix', 'naruto-apartment-fix-2']);
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

function logStageModelDebug(event: string, payload: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  const stageId = payload.stageId;
  if (typeof stageId === 'string' && !MODEL_STAGE_IDS.has(stageId)) return;
  console.info(`[KORE stage-model-debug] ${event} ${JSON.stringify(payload)}`);
}

function isModelStage(stage: Pick<StageDefinition, 'id' | 'renderMode' | 'model'>) {
  return stage.renderMode === 'model' || Boolean(stage.model?.path ?? stage.model?.url) || MODEL_STAGE_IDS.has(stage.id);
}

function resolveStageModel(stage: StageDefinition): StageModelDefinition | undefined {
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

function getStageModelMeshHideReason(mesh: THREE.Mesh, stageId: string) {
  if (stageId !== 'hidden-leaf-village') return null;
  const meshName = mesh.name || '';
  const parentName = mesh.parent?.name || '';
  const materials = meshMaterials(mesh);
  const hasMaterialSignal = materials.some(materialHasColorOrTexture);
  if (parentName === 'KORE_export_Quad_a' || meshName === 'Plane.067') return 'source-helper-ground-quad';
  if (/^KORE_export_Quad/i.test(parentName) && !hasMaterialSignal) return 'source-helper-quad';
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

function prepareStageModelSceneForRender(root: THREE.Object3D, stageId: string) {
  const hiddenSamples: Array<Record<string, unknown>> = [];
  let hiddenMeshCount = 0;
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const reason = getStageModelMeshHideReason(mesh, stageId);
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
  const visibleBounds = computeVisibleModelBounds(root);
  return {
    hiddenMeshCount,
    hiddenSamples,
    visibleBounds
  };
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
  shape: 'burst',
  hitColor: '#ffb33f',
  blockColor: '#9eeeff',
  size: 1,
  intensity: 1
};

export type PreviewPose = Exclude<FighterState, 'attack'> | MoveInput;

export function GameScene({ match, cameraSettings = defaultCameraSettings, sparkSettings = defaultSparkSettings, audioSettings, reducedMotion = false }: GameSceneProps) {
  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0, 3.3, 6.8], fov: 46 }} data-testid="fight-canvas">
      <Suspense fallback={null}>
        <Environment preset="city" />
      </Suspense>
      {!isModelStage(match.stage) && <DefaultSkybox imagePath={match.stage.skyboxPath ?? DEFAULT_SKYBOX_PATH} />}
      <StageVisualStyleRig stage={match.stage} fighters={match.fighters} />
      <CameraRig match={match} settings={cameraSettings} />
      <Arena stage={match.stage} fighters={match.fighters} impactEvents={match.impactEvents} />
      <FighterRig fighter={match.fighters[0]} timeScale={match.visualTimeScale} stage={match.stage} />
      <FighterRig fighter={match.fighters[1]} timeScale={match.visualTimeScale} stage={match.stage} />
      <TransformEffectLayer fighter={match.fighters[0]} />
      <TransformEffectLayer fighter={match.fighters[1]} />
      <ShadowCloneLayer fighter={match.fighters[0]} timeScale={match.visualTimeScale} stage={match.stage} />
      <ShadowCloneLayer fighter={match.fighters[1]} timeScale={match.visualTimeScale} stage={match.stage} />
      <EffectLayer match={match} audioSettings={audioSettings} reducedMotion={reducedMotion} />
      <ImpactSparkLayer events={match.impactEvents} settings={sparkSettings} reducedMotion={reducedMotion} />
      <ContactShadows position={[0, -0.01, 0]} opacity={0.45} scale={18} blur={2.4} far={3} />
      <StagePostProcessing stage={match.stage} reducedMotion={reducedMotion} />
    </Canvas>
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
        castShadow
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
  const style = resolveStageVisualStyle(stage);
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

function ShadowCloneLayer({ fighter, timeScale, stage }: { fighter: FighterRuntime; timeScale: number; stage?: StageDefinition }) {
  const clone = fighter.shadowClone;
  if (!clone) return null;
  const cloneFighter = clone.phase === 'active' ? makeShadowCloneRenderFighter(fighter) : null;
  const showSmoke = clone.spawnSmokeFrames > 0 || clone.vanishSmokeFrames > 0;
  return (
    <>
      {cloneFighter ? <FighterRig fighter={cloneFighter} timeScale={timeScale} stage={stage} /> : null}
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
  if (!settings.enabled) return null;
  return (
    <group>
      {events.slice(-8).map((event) => (
        <ImpactSpark key={event.id} event={event} settings={settings} reducedMotion={reducedMotion} />
      ))}
    </group>
  );
}

function ImpactSpark({
  event,
  settings,
  reducedMotion
}: {
  event: ImpactSparkEvent;
  settings: GameSettings['display']['impactSparks'];
  reducedMotion: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const ageRef = useRef(0);
  const baseColor = event.kind === 'block' ? settings.blockColor : settings.hitColor;
  const isBlock = event.kind === 'block';
  const isPunish = event.kind === 'punish' || event.kind === 'whiffPunish';
  const duration = reducedMotion ? 0.32 : 0.48;
  const particleCount = reducedMotion ? (isBlock ? 4 : 7) : isBlock ? 8 : isPunish ? 18 : 14;
  const directions = useMemo(() => makeSparkDirections(event.id, particleCount), [event.id, particleCount]);

  useFrame(({ camera }, delta) => {
    ageRef.current += delta;
    const progress = THREE.MathUtils.clamp(ageRef.current / duration, 0, 1);
    const root = groupRef.current;
    if (!root) return;
    root.visible = progress < 1;
    root.lookAt(camera.position);
    const expansion = reducedMotion ? 1 + progress * 0.45 : 1 + progress * (isBlock ? 0.85 : 1.65);
    const baseScale = settings.size * (isBlock ? 0.58 : isPunish ? 1.28 : 1);
    root.scale.setScalar(baseScale * expansion);
    root.children.forEach((child, index) => {
      const mesh = child as THREE.Mesh;
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (material && 'opacity' in material) {
        material.opacity = Math.max(0, (1 - progress) * settings.intensity * (index === 0 ? 0.9 : 1));
      }
    });
    if (ringRef.current) ringRef.current.rotation.z += delta * (isBlock ? 2.2 : 5.8);
  });

  const showRing = settings.shape === 'burst' || settings.shape === 'ring' || isBlock;
  const showShards = settings.shape === 'burst' || settings.shape === 'shards';

  return (
    <group ref={groupRef} position={event.position}>
      {showRing && (
        <mesh ref={ringRef} renderOrder={30}>
          <torusGeometry args={[0.26, isBlock ? 0.022 : 0.032, 8, 36]} />
          <meshBasicMaterial color={baseColor} transparent opacity={0.82 * settings.intensity} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      {showShards &&
        directions.map((direction, index) => (
          <mesh
            key={`${event.id}-shard-${index}`}
            position={[direction[0] * 0.18, direction[1] * 0.18, direction[2] * 0.02]}
            rotation={[0, 0, direction[3]]}
            scale={[direction[4] * (isBlock ? 0.55 : 1), 0.035, 0.035]}
            renderOrder={31}
          >
            <boxGeometry args={[0.34, 0.08, 0.08]} />
            <meshBasicMaterial color={baseColor} transparent opacity={0.96 * settings.intensity} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        ))}
      <mesh scale={isBlock ? 0.11 : isPunish ? 0.18 : 0.15} renderOrder={32}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.74 * settings.intensity} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
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
  reducedMotion
}: {
  match: MatchSnapshot;
  audioSettings?: GameSettings['audio'];
  reducedMotion: boolean;
}) {
  const [, setEffectFrameTick] = useState(0);
  useFrame(() => {
    setEffectFrameTick((tick) => (tick + 1) % 3600);
  });
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
  selectedPropId?: string;
  onSelectProp?: (propId: string) => void;
};

export function StagePreviewCanvas({ stage, interactive = false, selectedPropId, onSelectProp }: StagePreviewCanvasProps) {
  const modelStage = isModelStage(stage);
  const previewMaxDistance = Math.max(96, (stage.model?.bounds?.radius ?? 42) * 1.8);
  const previewMinDistance = 5;
  useEffect(() => {
    logStageModelDebug('H9 StagePreviewCanvas classified stage', {
      stageId: stage.id,
      renderMode: stage.renderMode,
      modelStage,
      modelPath: stage.model?.path,
      modelUrl: stage.model?.url,
      interactive
    });
  }, [interactive, modelStage, stage.id, stage.model?.path, stage.model?.url, stage.renderMode]);
  return (
    <Canvas
      shadows
      frameloop={interactive || modelStage ? 'always' : 'demand'}
      dpr={[1, 1.25]}
      camera={{ position: [0, 7.4, 12.4], fov: 38 }}
      data-testid={`stage-preview-canvas-${stage.id}`}
      aria-label={`${stage.name} stage preview`}
    >
      {!modelStage && <DefaultSkybox imagePath={stage.skyboxPath ?? DEFAULT_SKYBOX_PATH} />}
      <StageVisualStyleRig stage={stage} preview />
      <StagePreviewCamera stage={stage} />
      <group position={modelStage ? [0, 0, 0] : [0, -0.05, 0]} scale={modelStage ? 1 : 0.82}>
        <Arena stage={stage} selectedPropId={selectedPropId} onSelectProp={onSelectProp} />
      </group>
      {interactive && (
        <OrbitControls
          makeDefault
          enableDamping
          enablePan
          enableRotate
          enableZoom
          minDistance={previewMinDistance}
          maxDistance={previewMaxDistance}
          target={FIXED_STAGE_PREVIEW_TARGET}
        />
      )}
    </Canvas>
  );
}

function StagePreviewCamera({ stage }: { stage: StageDefinition }) {
  const { camera, invalidate } = useThree();
  useEffect(() => {
    const modelStage = isModelStage(stage);
    const position = FIXED_STAGE_PREVIEW_CAMERA_POSITION;
    const target = FIXED_STAGE_PREVIEW_TARGET;
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
  }, [camera, invalidate, stage.id, stage.renderMode]);
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

export function MenuAttractScene({ match }: GameSceneProps) {
  return (
    <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 2.55, 7.8], fov: 42 }} data-testid="menu-attract-canvas">
      {!isModelStage(match.stage) && <DefaultSkybox imagePath={match.stage.skyboxPath ?? DEFAULT_SKYBOX_PATH} />}
      <StageVisualStyleRig stage={match.stage} fighters={match.fighters} preview />
      <MenuAttractCamera match={match} />
      <group position={[0, 0, 1.75]}>
        <Arena stage={match.stage} fighters={match.fighters} impactEvents={match.impactEvents} />
      </group>
      <group position={[0, 0, 1.75]} scale={0.82}>
        <FighterRig fighter={match.fighters[0]} stage={match.stage} />
        <FighterRig fighter={match.fighters[1]} stage={match.stage} />
        <TransformEffectLayer fighter={match.fighters[0]} />
        <TransformEffectLayer fighter={match.fighters[1]} />
        <ShadowCloneLayer fighter={match.fighters[0]} timeScale={match.visualTimeScale} stage={match.stage} />
        <ShadowCloneLayer fighter={match.fighters[1]} timeScale={match.visualTimeScale} stage={match.stage} />
        <EffectLayer match={match} reducedMotion={false} />
      </group>
      <ContactShadows position={[0, -0.01, 1.75]} opacity={0.32} scale={10} blur={3} far={3.5} />
    </Canvas>
  );
}

function MenuAttractCamera({ match }: { match: MatchSnapshot }) {
  const { camera, size } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, delta) => {
    const [p1, p2] = match.fighters;
    const midX = (p1.position.x + p2.position.x) / 2;
    const midZ = (p1.position.z + p2.position.z) / 2 + 1.75;
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
  zoom
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
}) {
  const frameFit = useMemo(() => getPreviewFrameFit(character, animationKey), [animationKey, character]);
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [0, 1.7 + frameFit.extraTargetY, 4.4 + frameFit.extraDistance], fov: 38 }}
      data-testid="character-viewer-canvas"
      aria-label="3D character model viewer"
    >
      <color attach="background" args={['#111418']} />
      <Suspense fallback={null}>
        <Environment preset="city" />
      </Suspense>
      <ambientLight intensity={1.05} />
      <directionalLight castShadow position={[2.8, 4.6, 3.4]} intensity={2.65} color="#f7f7f2" shadow-mapSize={[1024, 1024]} />
      <pointLight position={[0, 2.4, 3.2]} color="#ffffff" intensity={5} distance={6} />
      <pointLight position={[-2, 1.8, 2]} color={character.colors.primary} intensity={6} distance={5} />
      <pointLight position={[2.2, 1.2, -2.2]} color={character.colors.accent} intensity={4} distance={5} />
      <PreviewFloor color={character.colors.primary} />
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
      <PreviewCamera zoom={zoom} frameFit={frameFit} />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom
        minDistance={2.25}
        maxDistance={6.2 + frameFit.extraDistance}
        minPolarAngle={Math.PI * 0.22}
        maxPolarAngle={Math.PI * 0.52}
        target={[0, 1 + frameFit.extraTargetY, 0]}
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
      <Suspense fallback={null}>
        <Environment preset="city" />
      </Suspense>
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

function PreviewFighter({
  character,
  pose,
  animationKey,
  previewMove,
  previewEffects,
  previewEffectInstances,
  previewEffectFrame,
  rotationTurn
}: {
  character: CharacterDefinition;
  pose: PreviewPose;
  animationKey?: string;
  previewMove?: MoveDefinition | null;
  previewEffects?: CharacterEffectDefinition[];
  previewEffectInstances?: MoveEffectInstance[];
  previewEffectFrame?: number;
  rotationTurn: number;
}) {
  const fighter = useRef(createPreviewFighter(character));
  const rotator = useRef<THREE.Group>(null);
  const [, setEffectFrameTick] = useState(0);
  const previewFrameTime = previewEffectFrame === undefined
    ? undefined
    : previewEffectFrame / Math.max(1, character.animationFrameRates?.[animationKey ?? ''] ?? character.animationFps ?? 8);

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
      const previewTime = previewFrameTime ?? t;
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
      <FighterRig fighter={fighter.current} frameTimeOverride={previewFrameTime} />
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
    ki: 0,
    transformOvercharge: 0,
    transformReadyTimer: 0,
    transformStartupFrames: 0,
    transformTargetId: null,
    transformSmokeFrames: 0,
    position: { x: 0, y: 0, z: 0 },
    velocityY: 0,
    facing: 1,
    facingYaw: Math.PI / 2,
    state: 'idle',
    sidestepTimer: 0,
    sidestepDirection: 0,
    sidestepOrbitSign: 1,
    dashForwardFrames: 0,
    dashForwardCooldownFrames: 0,
    walkDirection: 0,
    jumpInputHeld: false,
    currentMove: null,
    moveInstanceId: 0,
    actionTimer: 0,
    actionFramesRemaining: 0,
    moveFrame: 0,
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
    comboUsedKeys: [],
    comboHits: 0,
    comboDamage: 0,
    bufferedMoveInput: null,
    bufferedMoveFrames: 0,
    aiRecentComboKeys: [],
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
    shadowClone: null,
    shadowCloneChargeConsumed: false
  };
}

function cameraDamp(delta: number, speed: number) {
  return THREE.MathUtils.clamp(1 - Math.exp(-Math.max(0, delta) * speed), 0, 1);
}

const MIN_FIGHT_CAMERA_DISTANCE = 4.85;
const MIN_CLASH_CAMERA_DISTANCE = 4.85;

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function stableFightCameraSide(dx: number, dz: number) {
  const lineLength = Math.hypot(dx, dz) || 1;
  return [-dz / lineLength, dx / lineLength] as const;
}

function enforceCameraHorizontalDistance(camera: THREE.Camera, focus: THREE.Vector3, fallbackSide: THREE.Vector3, minDistance: number) {
  const dx = camera.position.x - focus.x;
  const dz = camera.position.z - focus.z;
  const distance = Math.hypot(dx, dz);
  if (distance >= minDistance) return;

  const fallbackLength = Math.hypot(fallbackSide.x, fallbackSide.z);
  const directionX = distance > 0.001 ? dx / distance : fallbackLength > 0.001 ? fallbackSide.x / fallbackLength : 0;
  const directionZ = distance > 0.001 ? dz / distance : fallbackLength > 0.001 ? fallbackSide.z / fallbackLength : 1;
  camera.position.x = focus.x + directionX * minDistance;
  camera.position.z = focus.z + directionZ * minDistance;
}

function CameraRig({ match, settings }: { match: MatchSnapshot; settings: GameSettings['camera'] }) {
  const { camera, size } = useThree();
  const modelStageCamera = isModelStage(match.stage);
  const target = useMemo(() => new THREE.Vector3(), []);
  const focus = useMemo(() => new THREE.Vector3(), []);
  const lookFocus = useMemo(() => new THREE.Vector3(), []);
  const side = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  const rawFocus = useMemo(() => new THREE.Vector3(), []);
  const rawLookFocus = useMemo(() => new THREE.Vector3(), []);
  const rawSide = useMemo(() => new THREE.Vector3(), []);
  const desired = useMemo(() => new THREE.Vector3(), []);
  const initializedRef = useRef(false);
  const cameraDistanceRef = useRef(6.4);
  const cameraHeightRef = useRef(2.8);
  useFrame((_, delta) => {
    camera.near = 0.05;
    camera.far = modelStageCamera ? 1400 : 300;
    camera.updateProjectionMatrix();
    const [p1, p2] = match.fighters;
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
      const cameraX = rawSide.x;
      const cameraZ = rawSide.z;
      const cameraDistance = THREE.MathUtils.clamp(
        4.3 * settings.distance * settings.zoomBias,
        MIN_CLASH_CAMERA_DISTANCE,
        6.6
      );
      desired.set(contactX + cameraX * cameraDistance, Math.max(2.15, contactY + 1.15), contactZ + cameraZ * cameraDistance);
      camera.position.lerp(desired, 1 - Math.pow(0.0000001, delta * Math.max(0.8, settings.smoothing * 1.7)));
      target.set(contactX, Math.max(1.12, contactY), contactZ);
      enforceCameraHorizontalDistance(camera, target, rawSide, MIN_CLASH_CAMERA_DISTANCE);
      camera.lookAt(target);
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
    if (side.dot(rawSide) < 0) rawSide.multiplyScalar(-1);

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
    const sidestepping = p1.state === 'sidestep' || p2.state === 'sidestep' || p1.sidestepTimer > 0 || p2.sidestepTimer > 0;
    const sidestepCameraBoost = sidestepping ? 2.75 : 1;
    const sidestepRigBoost = sidestepping ? 1.55 : 1;
    focus.lerp(rawFocus, cameraDamp(delta, 4.25 * smoothing * sidestepCameraBoost));
    lookFocus.lerp(rawLookFocus, cameraDamp(delta, 5.2 * smoothing * sidestepCameraBoost));
    side.lerp(rawSide, cameraDamp(delta, 2.15 * smoothing * sidestepCameraBoost)).normalize();
    cameraDistanceRef.current = THREE.MathUtils.lerp(cameraDistanceRef.current, cameraDistance, cameraDamp(delta, 2.35 * smoothing * sidestepRigBoost));
    cameraHeightRef.current = THREE.MathUtils.lerp(cameraHeightRef.current, cameraHeight, cameraDamp(delta, 2.75 * smoothing * sidestepRigBoost));

    desired.set(
      focus.x + side.x * cameraDistanceRef.current,
      cameraHeightRef.current,
      focus.z + side.z * cameraDistanceRef.current
    );
    camera.position.lerp(desired, cameraDamp(delta, 3.1 * smoothing * sidestepCameraBoost));
    enforceCameraHorizontalDistance(camera, lookFocus, side, MIN_FIGHT_CAMERA_DISTANCE);
    camera.lookAt(lookFocus);
  });
  return null;
}

function Arena({
  stage,
  fighters,
  impactEvents,
  selectedPropId,
  onSelectProp
}: {
  stage: MatchSnapshot['stage'];
  fighters?: FighterRuntime[];
  impactEvents?: ImpactSparkEvent[];
  selectedPropId?: string;
  onSelectProp?: (propId: string) => void;
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
    return <ModelStage stage={stage} fighters={fighters} impactEvents={impactEvents} selectedPropId={selectedPropId} onSelectProp={onSelectProp} />;
  }

  const floorTexturePath = stage.floorTexturePath;
  if (floorTexturePath) {
    return <TexturedInfiniteArena stage={stage} floorTexturePath={floorTexturePath} fighters={fighters} impactEvents={impactEvents} />;
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
      <mesh position={[0, -0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[4.2, 96]} />
        <meshLambertMaterial color="#102a4c" transparent opacity={0.48} />
      </mesh>
      <mesh position={[0, -0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.2, 4.72, 96]} />
        <meshBasicMaterial color={stage.rail} transparent opacity={0.22} />
      </mesh>
      {[-10, 10].map((x) => (
        <mesh key={`lane-${x}`} position={[x, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.04, 18]} />
          <meshBasicMaterial color={stage.rail} transparent opacity={0.28} />
        </mesh>
      ))}
      <mesh position={[0, 0.012, -9]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[0.04, 36]} />
        <meshBasicMaterial color={stage.rail} transparent opacity={0.24} />
      </mesh>
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
  onSelectProp
}: {
  stage: StageDefinition;
  fighters?: FighterRuntime[];
  impactEvents?: ImpactSparkEvent[];
  selectedPropId?: string;
  onSelectProp?: (propId: string) => void;
}) {
  const modelDefinition = resolveStageModel(stage);
  const modelPath = modelDefinition?.path ?? modelDefinition?.url;
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
    if (!modelPath || !import.meta.env.DEV) return;
    let cancelled = false;
    const startedAt = performance.now();
    fetch(modelPath, { cache: 'no-store' })
      .then(async (response) => {
        const bytes = await response.arrayBuffer();
        if (cancelled) return;
        logStageModelDebug('H11 raw GLB fetch probe completed', {
          stageId: stage.id,
          modelPath,
          ok: response.ok,
          status: response.status,
          contentType: response.headers.get('content-type'),
          contentLength: response.headers.get('content-length'),
          byteLength: bytes.byteLength,
          elapsedMs: Math.round(performance.now() - startedAt)
        });
      })
      .catch((error) => {
        if (cancelled) return;
        logStageModelDebug('H11 raw GLB fetch probe failed', {
          stageId: stage.id,
          modelPath,
          elapsedMs: Math.round(performance.now() - startedAt),
          error: error instanceof Error ? error.message : String(error)
        });
      });
    return () => {
      cancelled = true;
    };
  }, [modelPath, stage.id]);
  if (!modelPath || !modelDefinition) {
    return <TexturedInfiniteArena stage={stage} floorTexturePath={stage.floorTexturePath ?? '/stages/shared/handpainted-stone-platform.png'} fighters={fighters} impactEvents={impactEvents} />;
  }
  return (
    <group>
      <Suspense fallback={<ModelStageLoadBackdrop stage={stage} />}>
        <StageModelScene stage={stage} modelDefinition={modelDefinition} />
      </Suspense>
      <ModelStageFightLane stage={stage} />
      {(modelDefinition?.decorativeProps ?? []).filter((prop) => !prop.hidden).map((prop) => (
        <StagePropPlane key={prop.id} prop={prop} selected={prop.id === selectedPropId} onSelectProp={onSelectProp} />
      ))}
    </group>
  );
}

function ModelStageFightLane({ stage }: { stage: StageDefinition }) {
  const radius = stage.safePlatform?.radius ?? Math.max(5, Math.min(stage.fightPlane?.width ?? 12, stage.fightPlane?.depth ?? 8) * 0.5);
  const y = (stage.world?.floorY ?? -0.045) + 0.035;
  const p1 = stage.spawns?.p1 ?? [-3.2, 0, 0];
  const p2 = stage.spawns?.p2 ?? [3.2, 0, 0];
  return (
    <group renderOrder={9}>
      <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 8]}>
        <circleGeometry args={[radius, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.08} depthWrite={false} fog={false} />
      </mesh>
      <mesh position={[0, y + 0.004, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 8]}>
        <ringGeometry args={[radius * 0.985, radius * 1.015, 8]} />
        <meshBasicMaterial color={stage.rail} transparent opacity={0.7} depthWrite={false} fog={false} />
      </mesh>
      <mesh position={[0, y + 0.008, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 8]}>
        <ringGeometry args={[4.45, 4.82, 8]} />
        <meshBasicMaterial color={stage.rail} transparent opacity={0.42} depthWrite={false} fog={false} />
      </mesh>
      <mesh position={[0, y + 0.012, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[0.12, Math.min(radius * 1.75, 24)]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.62} depthWrite={false} fog={false} />
      </mesh>
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
  const imagePath = stage.thumbnailPath ?? stage.skyboxPath ?? DEFAULT_SKYBOX_PATH;
  const progress = useProgress();
  const texture = useLoader(THREE.TextureLoader, imagePath);
  useEffect(() => {
    logStageModelDebug('H11-H18 Suspense fallback/progress', {
      stageId: stage.id,
      active: progress.active,
      progress: Math.round(progress.progress),
      loaded: progress.loaded,
      total: progress.total,
      item: progress.item,
      errors: progress.errors.length,
      thumbnail: imagePath
    });
  }, [imagePath, progress.active, progress.errors.length, progress.item, progress.loaded, progress.progress, progress.total, stage.id]);
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.needsUpdate = true;
  }, [texture]);
  return (
    <mesh position={[0, 3.2, -13]} scale={[16, 9, 1]} renderOrder={-5}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} color="#ffffff" toneMapped={false} />
    </mesh>
  );
}

function StageModelScene({ stage, modelDefinition }: { stage: StageDefinition; modelDefinition: StageModelDefinition }) {
  const modelPath = modelDefinition?.path ?? modelDefinition?.url ?? '';
  const modelGroupRef = useRef<THREE.Group>(null);
  const requestStartedAtRef = useRef(performance.now());
  const gltfRequestPath = useMemo(() => {
    requestStartedAtRef.current = performance.now();
    logStageModelDebug('H10 StageModelScene useGLTF requested', {
      stageId: stage.id,
      renderMode: stage.renderMode,
      modelPath
    });
    return modelPath;
  }, [modelPath, stage.id, stage.renderMode]);
  const gltf = useGLTF(gltfRequestPath);
  useEffect(() => {
    logStageModelDebug('H10 StageModelScene useGLTF resolved', {
      stageId: stage.id,
      renderMode: stage.renderMode,
      modelPath,
      childCount: gltf.scene.children.length,
      resolveMs: Math.round(performance.now() - requestStartedAtRef.current)
    });
  }, [gltf.scene, modelPath, stage.id, stage.renderMode]);
  const scene = useMemo(() => clone(gltf.scene) as THREE.Object3D, [gltf.scene]);
  const basePosition = modelDefinition?.position ?? [0, 0, 0];
  const scale = modelDefinition?.scale ?? [1, 1, 1];
  const rotation = modelDefinition?.rotation ?? [0, 0, 0];
  const scenePreparation = useMemo(() => prepareStageModelSceneForRender(scene, stage.id), [scene, stage.id]);
  const position = useMemo<[number, number, number]>(() => {
    const floorY = stage.world?.floorY ?? 0;
    const scaleY = scale[1] ?? 1;
    const transformedVisibleMinY = scenePreparation.visibleBounds.min.y * scaleY + (basePosition[1] ?? 0);
    const shouldGroundVisibleModel =
      !scenePreparation.visibleBounds.isEmpty() &&
      stage.id === 'hidden-leaf-village' &&
      Math.abs(transformedVisibleMinY - floorY) > 1.5;
    const groundOffsetY = shouldGroundVisibleModel ? floorY - transformedVisibleMinY : 0;
    return [basePosition[0] ?? 0, (basePosition[1] ?? 0) + groundOffsetY, basePosition[2] ?? 0];
  }, [basePosition, scale, scenePreparation.visibleBounds, stage.id, stage.world?.floorY]);
  const sourceInspection = useMemo(() => {
    const sourceBounds = new THREE.Box3().setFromObject(gltf.scene);
    return {
      bounds: boxToDebugPayload(sourceBounds),
      tree: inspectModelObjectTree(gltf.scene)
    };
  }, [gltf.scene]);

  useEffect(() => {
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!mesh.visible) return;
      mesh.castShadow = modelDefinition?.castShadow !== false;
      mesh.receiveShadow = modelDefinition?.receiveShadow !== false;
      const materials = meshMaterials(mesh);
      mesh.material = materials.map((material) => normalizeStageModelMaterial(material, stage.id)).filter(Boolean) as THREE.Material | THREE.Material[];
    });
    return () => {
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const materials = meshMaterials(mesh);
        materials.forEach((material) => material?.dispose());
      });
    };
  }, [modelDefinition?.castShadow, modelDefinition?.receiveShadow, scene, stage.id]);

  useEffect(() => {
    const cloneBounds = new THREE.Box3().setFromObject(scene);
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
    logStageModelDebug('H19-H28 visibility hypotheses registered', {
      stageId: stage.id,
      hypotheses: MODEL_STAGE_VISIBILITY_HYPOTHESES
    });
    logStageModelDebug('H39-H48 model insertion hypotheses registered', {
      stageId: stage.id,
      hypotheses: MODEL_STAGE_INSERTION_HYPOTHESES
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
  }, [basePosition, modelDefinition.bounds, modelPath, position, rotation, scale, scene, scenePreparation.hiddenMeshCount, scenePreparation.hiddenSamples, scenePreparation.visibleBounds, sourceInspection, stage.id]);

  return (
    <group ref={modelGroupRef} position={position} scale={scale} rotation={rotation}>
      <primitive object={scene} />
      <StageModelRuntimeProbe stage={stage} modelDefinition={modelDefinition} modelGroupRef={modelGroupRef} />
    </group>
  );
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
    const bounds = new THREE.Box3().setFromObject(modelGroup);
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

function normalizeStageModelMaterial(material: THREE.Material | undefined, stageId?: string) {
  if (!material) return material;
  const cloned = material.clone();
  const forceOpaqueStageMaterial = stageId === 'hidden-leaf-village';
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
  if (forceOpaqueStageMaterial) {
    cloned.transparent = false;
    cloned.depthWrite = true;
    cloned.depthTest = true;
    cloned.side = THREE.DoubleSide;
    (cloned as THREE.Material & { fog?: boolean }).fog = false;
    maybeMapped.opacity = 1;
    maybeMapped.alphaMap = null;
  }
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
  impactEvents
}: {
  stage: StageDefinition;
  floorTexturePath: string;
  fighters?: FighterRuntime[];
  impactEvents?: ImpactSparkEvent[];
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
      <mesh position={[0, -0.026, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.4, 4.82, 128]} />
        <meshBasicMaterial color={stage.rail} transparent opacity={0.28} />
      </mesh>
      <mesh position={[0, -0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[4.38, 128]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.08} />
      </mesh>
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
  stage
}: {
  fighter: FighterRuntime;
  timeScale?: number;
  frameTimeOverride?: number;
  stage?: StageDefinition;
}) {
  const group = useRef<THREE.Group>(null);
  const scaledTime = useRef(0);
  const progress = activeMoveProgress(fighter);
  useFrame((_, delta) => {
    if (!group.current) return;
    if (frameTimeOverride === undefined) scaledTime.current += delta * timeScale;
    else scaledTime.current = frameTimeOverride;
    const renderTime = scaledTime.current;
    const liveProgress = activeMoveProgress(fighter);
    const blockBreath = fighter.state === 'block' || fighter.state === 'crouchBlock' ? Math.sin(renderTime * 3.2 + fighter.slot * 0.7) : 0;
    const bob = fighter.state === 'idle' ? Math.sin(renderTime * 4 + fighter.slot) * 0.025 : blockBreath * 0.018;
    const hitLean = fighter.state === 'hit' || fighter.state === 'throwHeld' ? -fighter.facing * 0.16 : 0;
    const juggle = fighter.state === 'juggle' ? 1 : 0;
    const getupProgress = getGetupRenderProgress(fighter);
    const juggleRoll = juggle * Math.sin(renderTime * 3.8 + fighter.slot) * 0.34;
    const attackLean = fighter.state === 'attack' || fighter.state === 'throwHold' ? fighter.facing * Math.sin(liveProgress * Math.PI) * 0.2 : 0;
    const offsetX = getFighterRenderOffsetX(fighter, liveProgress, renderTime);
    const shake = fighter.state === 'throwHeld' && fighter.throwShakeFrames > 0 ? Math.min(0.12, 0.024 + fighter.throwShakeFrames * 0.006) : 0;
    const shakeX = shake ? Math.sin(renderTime * 88 + fighter.slot * 1.7) * shake : 0;
    const shakeZ = shake ? Math.cos(renderTime * 76 + fighter.slot * 2.1) * shake * 0.45 : 0;
    group.current.position.set(fighter.position.x + offsetX + shakeX, fighter.position.y + bob, fighter.position.z + shakeZ);
    group.current.rotation.set(fighter.state === 'knockdown' ? -0.85 : fighter.state === 'getup' ? -0.85 * (1 - getupProgress) : juggle ? -1.16 : 0, fighter.facingYaw, hitLean + attackLean + juggleRoll);
  });

  const color = fighter.character.colors.primary;
  const globalScale = getCharacterGlobalScale(fighter.character);
  const outlineStyle = useMemo(() => getFighterOutlineStyle(stage), [stage]);
  return (
    <group ref={group} scale={[globalScale.width, globalScale.height, globalScale.width]}>
      <Bounds fit={false}>
        {fighter.character.renderMode === 'spriteVoxel' || fighter.character.modelPath.startsWith('spritevoxel://') ? (
          fighter.character.voxelProfile === 'image-source' || fighter.character.voxelProfile === 'hd-image-source' ? (
            <ImageVoxelFighter fighter={fighter} progress={progress} timeScale={timeScale} frameTimeOverride={frameTimeOverride} outlineStyle={outlineStyle} />
          ) : (
            <VoxelSpriteFighter fighter={fighter} progress={progress} timeScale={timeScale} frameTimeOverride={frameTimeOverride} outlineStyle={outlineStyle} />
          )
        ) : fighter.character.modelPath.startsWith('builtin://') ? (
          <ProceduralFighter fighter={fighter} color={color} timeScale={timeScale} frameTimeOverride={frameTimeOverride} outlineStyle={outlineStyle} />
        ) : (
          <ExternalFighter fighter={fighter} url={fighter.character.modelPath} timeScale={timeScale} />
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

type ImageVoxelPart = 'head' | 'torso' | 'leadArm' | 'rearArm' | 'leadLeg' | 'rearLeg';

type ImageVoxel = {
  part: ImageVoxelPart;
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  sideColor?: string;
  source?: 'hd' | 'legacy';
};

type HdImageVoxelPayload = {
  format: 'kore-hd-voxels-v1';
  palette: string[];
  voxels: Array<{
    part: ImageVoxelPart;
    x: number;
    y: number;
    z: number;
    w: number;
    h: number;
    d: number;
    c: number;
    s?: number;
  }>;
};

const imageVoxelCache = new Map<string, Promise<ImageVoxel[]>>();
const IMAGE_VOXEL_PIXEL_SCALE = 1.2;
const IMAGE_VOXEL_DEPTH_SCALE = 1.32;
const IMAGE_VOXEL_MIN_DEPTH = 0.14;
const IMAGE_VOXEL_MAX_DEPTH = 0.28;

export function clearImageVoxelCacheForFrame(characterId: string, frameIndex?: number) {
  const framePrefix = Number.isFinite(frameIndex)
    ? `/characters/${characterId}/frames/frame-${Math.max(0, Math.round(frameIndex ?? 0)).toString().padStart(3, '0')}.png`
    : `/characters/${characterId}/frames/`;
  Array.from(imageVoxelCache.keys()).forEach((key) => {
    if (key.includes(`:${framePrefix}`)) {
      imageVoxelCache.delete(key);
    }
  });
}

function getImageVoxelLodStep(character: CharacterDefinition) {
  if (character.voxelProfile !== 'hd-image-source') return 1;
  if (typeof window === 'undefined') return 1;
  const mobileStep = character.voxelFidelity?.lod?.mobileStep ?? 2;
  return window.innerWidth < 760 ? Math.max(1, Math.round(mobileStep)) : 1;
}

function ImageVoxelFighter({
  fighter,
  progress,
  timeScale = 1,
  frameTimeOverride,
  outlineStyle
}: {
  fighter: FighterRuntime;
  progress: number;
  timeScale?: number;
  frameTimeOverride?: number;
  outlineStyle?: FighterOutlineStyle;
}) {
  const root = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const leadArm = useRef<THREE.Group>(null);
  const rearArm = useRef<THREE.Group>(null);
  const leadLeg = useRef<THREE.Group>(null);
  const rearLeg = useRef<THREE.Group>(null);
  const activeFrameSrc = useRef(getImageVoxelFramePath(fighter, progress, 0));
  const scaledTime = useRef(0);
  const [frameSrc, setFrameSrc] = useState(activeFrameSrc.current);
  const [voxels, setVoxels] = useState<ImageVoxel[]>([]);
  const lodStep = getImageVoxelLodStep(fighter.character);

  useEffect(() => {
    let canceled = false;
    if (!frameSrc) return undefined;
    getCachedImageVoxels(frameSrc, fighter.character).then((nextVoxels) => {
      if (!canceled) setVoxels(nextVoxels);
    });
    return () => {
      canceled = true;
    };
  }, [fighter.character, frameSrc]);

  const parts = useMemo(() => buildVoxelParts(voxels, lodStep), [lodStep, voxels]);

  useFrame((_, delta) => {
    if (frameTimeOverride === undefined) scaledTime.current += delta * timeScale;
    else scaledTime.current = frameTimeOverride;
    const t = scaledTime.current;
    const liveProgress = activeMoveProgress(fighter);
    const nextFrameSrc = getImageVoxelFramePath(fighter, liveProgress, t);
    const animationScale = getCharacterAnimationScale(fighter.character, getImageVoxelAnimationKey(fighter), nextFrameSrc);
    if (nextFrameSrc !== activeFrameSrc.current) {
      activeFrameSrc.current = nextFrameSrc;
      setFrameSrc(nextFrameSrc);
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

  if (voxels.length === 0) {
    return <VoxelSpriteFighter fighter={fighter} progress={progress} timeScale={timeScale} frameTimeOverride={frameTimeOverride} outlineStyle={outlineStyle} />;
  }

  return (
    <group ref={root} rotation={[0, -Math.PI / 2, 0]}>
      <ImageVoxelPartGroup part={parts.head} groupRef={head} outlineStyle={outlineStyle} />
      <ImageVoxelPartGroup part={parts.torso} groupRef={torso} outlineStyle={outlineStyle} />
      <ImageVoxelPartGroup part={parts.leadArm} groupRef={leadArm} outlineStyle={outlineStyle} />
      <ImageVoxelPartGroup part={parts.rearArm} groupRef={rearArm} outlineStyle={outlineStyle} />
      <ImageVoxelPartGroup part={parts.leadLeg} groupRef={leadLeg} outlineStyle={outlineStyle} />
      <ImageVoxelPartGroup part={parts.rearLeg} groupRef={rearLeg} outlineStyle={outlineStyle} />
    </group>
  );
}

function getCharacterAnimationScale(character: CharacterDefinition, animationKey?: string, frameSource?: string) {
  const frameIndex = frameSource?.match(/frame-(\d+)\.png/)?.[1];
  const frameSize = animationKey && frameIndex ? character.animationFrameScales?.[animationKey]?.[String(Number(frameIndex))] : undefined;
  const size = frameSize ?? (animationKey ? character.animationScales?.[animationKey] : undefined);
  return {
    width: THREE.MathUtils.clamp(Number(size?.width) || 1, 0.25, 2.5),
    height: THREE.MathUtils.clamp(Number(size?.height) || 1, 0.25, 2.5),
    offsetX: THREE.MathUtils.clamp(Number(size?.offsetX) || 0, -6, 6)
  };
}

function getFighterRenderOffsetX(fighter: FighterRuntime, progress: number, elapsedTime: number) {
  const animationKey = getImageVoxelAnimationKey(fighter);
  const frameSource = getImageVoxelFramePath(fighter, progress, elapsedTime);
  return getCharacterAnimationScale(fighter.character, animationKey, frameSource).offsetX;
}

function getCachedImageVoxels(src: string, character: CharacterDefinition): Promise<ImageVoxel[]> {
  const cacheKey = `${character.id}:${character.voxelProfile ?? 'image-source'}:${src}`;
  const cached = imageVoxelCache.get(cacheKey);
  if (cached) return cached;
  const request = loadImageVoxels(src, character);
  imageVoxelCache.set(cacheKey, request);
  return request;
}

function getImageVoxelFramePath(fighter: FighterRuntime, progress: number, elapsedTime: number) {
  const frames = fighter.character.animationFrames;
  if (!frames) return fighter.character.spriteSheetPath;
  const key = getImageVoxelAnimationKey(fighter);
  const resolved = resolveAnimationFrameSequence(frames, key);
  if (!resolved) return fighter.character.spriteSheetPath;
  const { key: resolvedKey, sequence } = resolved;
  const fps = fighter.character.animationFrameRates?.[resolvedKey] ?? fighter.character.animationFrameRates?.[key] ?? fighter.character.animationFps ?? 8;
  const frameIndex =
    fighter.state === 'chargeKi'
      ? getChargeKiFrameIndex(fighter, sequence.length)
    : fighter.state === 'attack' || fighter.state === 'throwHold'
      ? Math.min(sequence.length - 1, Math.floor(progress * sequence.length))
    : fighter.state === 'getup'
      ? Math.min(sequence.length - 1, Math.floor(getGetupRenderProgress(fighter) * sequence.length))
    : Math.floor(elapsedTime * fps) % sequence.length;
  debugLogThrottled(9, 'voxel animation key resolved', {
    characterId: fighter.character.id,
    slot: fighter.slot,
    state: fighter.state,
    animationKey: resolvedKey,
    requestedAnimationKey: key,
    fps,
    sequence: sequence.map((frame) => frame.match(/frame-(\d+)\.png$/)?.[1] ?? frame)
  });
  const frameSource = sequence[frameIndex];
  debugLogThrottled(10, 'voxel frame source selected', {
    characterId: fighter.character.id,
    slot: fighter.slot,
    animationKey: resolvedKey,
    requestedAnimationKey: key,
    frameIndex,
    frameSource,
    elapsedTime: Number(elapsedTime.toFixed(2)),
    progress: Number(progress.toFixed(2))
  });
  return versionEditedSpriteFrameSource(frameSource, fighter.character);
}

function resolveAnimationFrameSequence(frames: NonNullable<CharacterDefinition['animationFrames']>, key: string) {
  const fallbackKeys = [
    key,
    key === 'sprint' ? 'walkForward' : undefined,
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

function getImageVoxelAnimationKey(fighter: FighterRuntime) {
  if (fighter.previewAnimationKey) return fighter.previewAnimationKey;
  if (fighter.state === 'attack') return fighter.currentMove?.animationKey ?? fighter.currentMove?.input ?? 'jab';
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
  if (fighter.state === 'throwHold') return fighter.currentMove?.animationKey ?? fighter.currentMove?.input ?? 'jab';
  if (fighter.state === 'throwHeld') return 'throwHeld';
  if (fighter.state === 'hit') return 'hitLight';
  if (fighter.state === 'juggle') return fighter.character.animationFrames?.juggle?.length ? 'juggle' : fighter.character.animationFrames?.hitHeavy?.length ? 'hitHeavy' : 'hitLight';
  if (fighter.state === 'getup') return getGetupAnimationKey(fighter);
  if (fighter.state === 'entry') return 'entry';
  return fighter.state;
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

function ImageVoxelPartGroup({
  part,
  groupRef,
  outlineStyle
}: {
  part: { anchor: [number, number, number]; voxels: ImageVoxel[] };
  groupRef: React.RefObject<THREE.Group>;
  outlineStyle?: FighterOutlineStyle;
}) {
  const mesh = useMemo(() => buildInstancedVoxelMesh(part), [part]);
  const outlineMesh = useMemo(() => buildInstancedVoxelOutlineMesh(part, outlineStyle), [part, outlineStyle]);

  useEffect(() => {
    return () => {
      outlineMesh?.geometry.dispose();
      const outlineMaterial = outlineMesh?.material;
      if (Array.isArray(outlineMaterial)) {
        outlineMaterial.forEach((entry) => entry.dispose());
      } else {
        outlineMaterial?.dispose();
      }
      mesh?.geometry.dispose();
      const material = mesh?.material;
      if (Array.isArray(material)) {
        material.forEach((entry) => entry.dispose());
      } else {
        material?.dispose();
      }
    };
  }, [mesh, outlineMesh]);

  return (
    <group ref={groupRef} position={part.anchor}>
      {outlineMesh && <primitive object={outlineMesh} />}
      {mesh && <primitive object={mesh} />}
    </group>
  );
}

function buildInstancedVoxelOutlineMesh(part: { anchor: [number, number, number]; voxels: ImageVoxel[] }, outlineStyle?: FighterOutlineStyle) {
  if (!outlineStyle?.enabled || part.voxels.length === 0) return null;
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
  return outline;
}

function buildInstancedVoxelMesh(part: { anchor: [number, number, number]; voxels: ImageVoxel[] }) {
  if (part.voxels.length === 0) return null;
  const baseGeometry = new THREE.BoxGeometry(1, 1, 1);
  const geometries = part.voxels.map((voxel) => {
    const geometry = baseGeometry.clone();
    const renderVoxel = normalizeImageVoxelForRender(voxel);
    const color = new THREE.Color(renderVoxel.color);
    const sideColor = new THREE.Color(renderVoxel.sideColor ?? renderVoxel.color);
    const normals = geometry.getAttribute('normal');
    const colors = new Float32Array((geometry.getAttribute('position').count ?? 0) * 3);
    for (let index = 0; index < colors.length; index += 3) {
      const vertexIndex = index / 3;
      const useSideColor = Math.abs(normals.getZ(vertexIndex)) < 0.5;
      const vertexColor = useSideColor ? sideColor : color;
      colors[index] = vertexColor.r;
      colors[index + 1] = vertexColor.g;
      colors[index + 2] = vertexColor.b;
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
    color: '#ffffff',
    vertexColors: true,
    toneMapped: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
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

function buildVoxelParts(voxels: ImageVoxel[], lodStep = 1) {
  const partNames: ImageVoxelPart[] = ['head', 'torso', 'leadArm', 'rearArm', 'leadLeg', 'rearLeg'];
  return Object.fromEntries(
    partNames.map((part) => {
      const partVoxels = voxels.filter((voxel, index) => voxel.part === part && (lodStep <= 1 || index % lodStep === 0));
      return [part, { anchor: getPartAnchor(part, partVoxels), voxels: partVoxels }];
    })
  ) as Record<ImageVoxelPart, { anchor: [number, number, number]; voxels: ImageVoxel[] }>;
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
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const voxel of voxels) {
    min.min(new THREE.Vector3(...voxel.position));
    max.max(new THREE.Vector3(...voxel.position));
  }
  return [(min.x + max.x) / 2, (min.y + max.y) / 2, 0];
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

function getPrecomputedVoxelPath(src: string, hd = false) {
  const cleanSrc = src.split('?')[0] ?? src;
  const match = cleanSrc.match(/^(\/characters\/[\w-]+)\/frames\/(frame-\d+)\.png$/);
  if (!match) return null;
  const queryIndex = src.indexOf('?');
  const cacheBust = queryIndex >= 0 ? src.slice(queryIndex) : '';
  return `${match[1]}/${hd ? 'voxels-hd' : 'voxels'}/${match[2]}.json${cacheBust}`;
}

function normalizePrecomputedImageVoxels(payload: unknown): ImageVoxel[] | null {
  if (Array.isArray(payload)) return payload as ImageVoxel[];
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as HdImageVoxelPayload;
  if (candidate.format !== 'kore-hd-voxels-v1' || !Array.isArray(candidate.palette) || !Array.isArray(candidate.voxels)) return null;
  return candidate.voxels.map((voxel) => ({
    part: voxel.part,
    position: [voxel.x, voxel.y, voxel.z],
    size: [voxel.w, voxel.h, voxel.d],
    color: candidate.palette[voxel.c] ?? '#ffffff',
    sideColor: candidate.palette[voxel.s ?? voxel.c] ?? candidate.palette[voxel.c] ?? '#ffffff',
    source: 'hd'
  }));
}

async function loadImageVoxels(src: string, character: CharacterDefinition) {
  if (character.voxelProfile === 'hd-image-source') {
    const hdVoxels = await loadPrecomputedImageVoxels(src, character);
    if (hdVoxels) return hdVoxels;
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
  outlineStyle
}: {
  fighter: FighterRuntime;
  progress: number;
  timeScale?: number;
  frameTimeOverride?: number;
  outlineStyle?: FighterOutlineStyle;
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

  useFrame((_, delta) => {
    if (frameTimeOverride === undefined) scaledTime.current += delta * timeScale;
    else scaledTime.current = frameTimeOverride;
    const t = scaledTime.current;
    const liveProgress = activeMoveProgress(fighter);
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
        <VoxelBox outlineStyle={outlineStyle} position={[0, 0, 0]} size={[0.36, 0.28, 0.3]} color={palette.skin} />
        <VoxelBox outlineStyle={outlineStyle} position={[0, 0.18, -0.02]} size={[0.44, 0.16, 0.34]} color={palette.hair} />
        <VoxelBox outlineStyle={outlineStyle} position={[0, 0.07, 0.17]} size={[0.42, 0.06, 0.04]} color={palette.headband} />
        <VoxelBox outlineStyle={outlineStyle} position={[-0.24, 0.12, 0]} size={[0.08, 0.08, 0.22]} color={palette.hair} />
        <VoxelBox outlineStyle={outlineStyle} position={[0.24, 0.12, 0]} size={[0.08, 0.08, 0.22]} color={palette.hair} />
      </group>
      <group ref={torso} position={[0, 1.12, 0]}>
        <VoxelBox outlineStyle={outlineStyle} position={[0, 0.08, 0]} size={[0.5, 0.46, 0.32]} color={palette.jacket} />
        <VoxelBox outlineStyle={outlineStyle} position={[0, 0.12, 0.18]} size={[0.42, 0.12, 0.04]} color={palette.trim} />
        <VoxelBox outlineStyle={outlineStyle} position={[0, -0.2, 0]} size={[0.42, 0.16, 0.3]} color={palette.belt} />
        <VoxelBox outlineStyle={outlineStyle} position={[0, 0.34, 0]} size={[0.56, 0.1, 0.34]} color={palette.shoulder} />
      </group>
      <group ref={leadArm} position={[0.34, 1.24, 0.08]}>
        <VoxelBox outlineStyle={outlineStyle} position={[0, -0.16, 0]} size={[0.16, 0.34, 0.16]} color={palette.sleeve} />
        <VoxelBox outlineStyle={outlineStyle} position={[0, -0.42, 0.02]} size={[0.14, 0.3, 0.14]} color={palette.skin} />
        <VoxelBox outlineStyle={outlineStyle} position={[0, -0.6, 0.05]} size={[0.16, 0.1, 0.16]} color={palette.glove} />
      </group>
      <group ref={rearArm} position={[-0.34, 1.22, -0.06]}>
        <VoxelBox outlineStyle={outlineStyle} position={[0, -0.16, 0]} size={[0.16, 0.34, 0.16]} color={palette.sleeve} />
        <VoxelBox outlineStyle={outlineStyle} position={[0, -0.42, 0]} size={[0.14, 0.3, 0.14]} color={palette.skin} />
        <VoxelBox outlineStyle={outlineStyle} position={[0, -0.6, 0.02]} size={[0.16, 0.1, 0.16]} color={palette.glove} />
      </group>
      <group ref={leadLeg} position={[0.16, 0.78, 0.04]}>
        <VoxelBox outlineStyle={outlineStyle} position={[0, -0.24, 0]} size={[0.18, 0.5, 0.18]} color={palette.pants} />
        <VoxelBox outlineStyle={outlineStyle} position={[0.02, -0.56, 0.08]} size={[0.22, 0.12, 0.28]} color={palette.boot} />
      </group>
      <group ref={rearLeg} position={[-0.16, 0.78, -0.04]}>
        <VoxelBox outlineStyle={outlineStyle} position={[0, -0.24, 0]} size={[0.18, 0.5, 0.18]} color={palette.pants} />
        <VoxelBox outlineStyle={outlineStyle} position={[-0.02, -0.56, 0.06]} size={[0.22, 0.12, 0.28]} color={palette.boot} />
      </group>
    </group>
  );
}

function VoxelBox({
  position,
  size,
  color,
  outlineStyle
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  outlineStyle?: FighterOutlineStyle;
}) {
  const outlineColor = useMemo(() => outlineColorForVoxel(color), [color]);
  const showOutline = outlineStyle?.enabled && shouldRenderVoxelOutline(color);
  return (
    <group position={position}>
      {showOutline && (
        <mesh scale={outlineStyle.scale} renderOrder={-8}>
          <boxGeometry args={size} />
          <meshBasicMaterial color={outlineColor} transparent opacity={outlineStyle.opacity} side={THREE.BackSide} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshToonMaterial color={color} />
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

function ExternalFighter({ fighter, url, timeScale = 1 }: { fighter: FighterRuntime; url: string; timeScale?: number }) {
  const gltf = useGLTF(url);
  const model = useMemo(() => clone(gltf.scene), [gltf.scene]);
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
    const liveProgress = activeMoveProgress(fighter);
    Object.entries(actions).forEach(([name, action]) => {
      if (!action) return;
      if (fighter.state === 'attack' && name === desiredClip) {
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
    const knockdown = fighter.state === 'knockdown' ? 1 : 0;
    const getup = fighter.state === 'getup' ? 1 - getGetupRenderProgress(fighter) : 0;
    const juggle = fighter.state === 'juggle' ? 1 : 0;
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
  outlineStyle: _outlineStyle
}: {
  fighter: FighterRuntime;
  color: string;
  timeScale?: number;
  frameTimeOverride?: number;
  outlineStyle?: FighterOutlineStyle;
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

  useFrame((_, delta) => {
    if (frameTimeOverride === undefined) scaledTime.current += delta * timeScale;
    else scaledTime.current = frameTimeOverride;
    const t = scaledTime.current;
    const liveProgress = activeMoveProgress(fighter);
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
      <mesh ref={head} castShadow position={[0, 1.72, 0]}>
        <sphereGeometry args={[0.24 * bulk, 20, 16]} />
        <meshToonMaterial color={color} emissive={color} emissiveIntensity={0.05} />
      </mesh>
      <mesh ref={torso} castShadow position={[0, 1.22, 0]}>
        <capsuleGeometry args={[0.28 * bulk, 0.72, 8, 18]} />
        <meshToonMaterial color={secondary} />
      </mesh>
      <group ref={leadArm} position={[0.23, 1.22, 0.08]}>
        <mesh castShadow position={[0, -0.22, 0]}>
          <capsuleGeometry args={[0.07, 0.62, 6, 12]} />
          <meshToonMaterial color={accent} />
        </mesh>
      </group>
      <group ref={rearArm} position={[-0.23, 1.22, -0.05]}>
        <mesh castShadow position={[0, -0.2, 0]}>
          <capsuleGeometry args={[0.07, 0.58, 6, 12]} />
          <meshToonMaterial color={color} />
        </mesh>
      </group>
      <group ref={leadLeg} position={[0.15, 0.78, 0.04]}>
        <mesh castShadow position={[0, -0.3, 0]}>
          <capsuleGeometry args={[0.09, 0.76, 6, 12]} />
          <meshToonMaterial color={color} />
        </mesh>
      </group>
      <group ref={rearLeg} position={[-0.15, 0.78, -0.04]}>
        <mesh castShadow position={[0, -0.3, 0]}>
          <capsuleGeometry args={[0.09, 0.76, 6, 12]} />
          <meshToonMaterial color={accent} />
        </mesh>
      </group>
    </group>
  );
}

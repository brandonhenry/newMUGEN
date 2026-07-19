import { useFrame } from '@react-three/fiber';
import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import movementSmokeVoxelPackJson from '../assets/movement-smoke.voxels.json';
import { normalizedVoxelPixelSize } from '../lib/voxelEffects';
import { STORY_GROUNDED_ACTOR_CENTER_Y } from './actorGrounding';

type StoryRollSmokeVoxelRecord = [number, number, number];
type StoryRollSmokeVoxelStyle = {
  id: string;
  frameWidth: number;
  frameHeight: number;
  palette: [number, number, number, number][];
  frames: StoryRollSmokeVoxelRecord[][];
};

type StoryRollSmokeVoxelPack = {
  styles: StoryRollSmokeVoxelStyle[];
};

type StoryRollSmokeBurstState = {
  id: number;
  direction: -1 | 1;
  position: [number, number, number];
};

type StoryRollSmokePuffSpec = {
  delaySeconds: number;
  offsetX: number;
  scale: number;
  rotation: number;
  opacity: number;
};

const STORY_ROLL_SMOKE_STYLE = (movementSmokeVoxelPackJson as unknown as StoryRollSmokeVoxelPack).styles
  .find((style) => style.id === 'soft-puff')!;
const STORY_ROLL_SMOKE_DURATION_SECONDS = 0.38;
const STORY_ROLL_SMOKE_EMIT_INTERVAL_SECONDS = 0.19;
const STORY_ROLL_SMOKE_PUFFS = [
  { delaySeconds: 0, offsetX: -0.08, scale: 0.82, rotation: -0.14, opacity: 0.92 },
  { delaySeconds: 0.045, offsetX: 0.1, scale: 0.66, rotation: 0.18, opacity: 0.76 },
  { delaySeconds: 0.09, offsetX: 0.01, scale: 0.52, rotation: -0.04, opacity: 0.6 }
] as const satisfies readonly StoryRollSmokePuffSpec[];

export function StoryRollSmoke({ active, direction, playerPosition, reducedMotion }: {
  active: boolean;
  direction: -1 | 1;
  playerPosition: MutableRefObject<THREE.Vector3>;
  reducedMotion: boolean;
}) {
  const nextIdRef = useRef(1);
  const previousActiveRef = useRef(false);
  const nextEmissionAtRef = useRef(0);
  const [bursts, setBursts] = useState<StoryRollSmokeBurstState[]>([]);

  useFrame((state) => {
    const now = state.clock.elapsedTime;
    const started = active && !previousActiveRef.current;
    const emissionReady = active && !reducedMotion && now >= nextEmissionAtRef.current;
    if (started || emissionReady) {
      const id = nextIdRef.current++;
      setBursts((current) => [...current.slice(-8), {
        id,
        direction,
        position: [
          playerPosition.current.x - direction * 0.16,
          playerPosition.current.y - STORY_GROUNDED_ACTOR_CENTER_Y + 0.04,
          0.76
        ]
      }]);
      nextEmissionAtRef.current = reducedMotion ? Number.POSITIVE_INFINITY : now + STORY_ROLL_SMOKE_EMIT_INTERVAL_SECONDS;
    }
    if (!active) nextEmissionAtRef.current = 0;
    previousActiveRef.current = active;
  });

  const removeBurst = useCallback((id: number) => {
    setBursts((current) => current.filter((burst) => burst.id !== id));
  }, []);

  return <group renderOrder={18}>
    {bursts.map((burst) => <StoryRollSmokeBurst key={burst.id} burst={burst} onComplete={removeBurst} />)}
  </group>;
}

function StoryRollSmokeBurst({ burst, onComplete }: {
  burst: StoryRollSmokeBurstState;
  onComplete: (id: number) => void;
}) {
  const [ageSeconds, setAgeSeconds] = useState(0);
  const completedRef = useRef(false);

  useFrame((_, delta) => {
    setAgeSeconds((current) => Math.min(STORY_ROLL_SMOKE_DURATION_SECONDS + 0.05, current + delta));
  });

  useEffect(() => {
    if (ageSeconds <= STORY_ROLL_SMOKE_DURATION_SECONDS || completedRef.current) return;
    completedRef.current = true;
    onComplete(burst.id);
  }, [ageSeconds, burst.id, onComplete]);

  return <group position={burst.position} renderOrder={18}>
    {STORY_ROLL_SMOKE_PUFFS
      .filter((spec) => ageSeconds >= spec.delaySeconds)
      .map((spec, index) => <StoryRollSmokePuff
        key={`${burst.id}-roll-smoke-${index}`}
        ageSeconds={ageSeconds - spec.delaySeconds}
        direction={burst.direction}
        spec={spec}
      />)}
  </group>;
}

function StoryRollSmokePuff({ ageSeconds, direction, spec }: {
  ageSeconds: number;
  direction: -1 | 1;
  spec: StoryRollSmokePuffSpec;
}) {
  const duration = Math.max(0.01, STORY_ROLL_SMOKE_DURATION_SECONDS - spec.delaySeconds);
  const progress = THREE.MathUtils.clamp(ageSeconds / duration, 0, 1);
  const frameIndex = Math.min(
    STORY_ROLL_SMOKE_STYLE.frames.length - 1,
    Math.floor(progress * STORY_ROLL_SMOKE_STYLE.frames.length)
  );
  const opacity = spec.opacity * Math.max(0.08, (1 - progress) ** 1.12);
  const scale = spec.scale * (0.82 + progress * 0.76);
  const driftX = -direction * (0.06 + progress * 0.22) + spec.offsetX;
  const rise = 0.08 + progress * 0.2;
  const mesh = useMemo(
    () => buildStoryRollSmokeVoxelMesh(STORY_ROLL_SMOKE_STYLE, frameIndex),
    [frameIndex]
  );

  useEffect(() => {
    mesh.traverse((child) => {
      const childMesh = child as THREE.Mesh;
      const materials = Array.isArray(childMesh.material) ? childMesh.material : childMesh.material ? [childMesh.material] : [];
      materials.forEach((material) => {
        const smokeMaterial = material as THREE.MeshBasicMaterial;
        smokeMaterial.opacity = (smokeMaterial.userData.sourceOpacity ?? 1) * opacity;
      });
    });
  }, [mesh, opacity]);

  useEffect(() => () => {
    mesh.traverse((child) => {
      const childMesh = child as THREE.Mesh;
      childMesh.geometry?.dispose();
      const materials = Array.isArray(childMesh.material) ? childMesh.material : childMesh.material ? [childMesh.material] : [];
      materials.forEach((material) => material.dispose());
    });
  }, [mesh]);

  return <group
    position={[driftX, rise, 0]}
    rotation={[0, 0, spec.rotation * direction]}
    scale={[scale, scale, 1]}
    renderOrder={18}
  >
    <primitive object={mesh} />
  </group>;
}

function buildStoryRollSmokeVoxelMesh(style: StoryRollSmokeVoxelStyle, frameIndex: number) {
  const frame = style.frames[frameIndex] ?? [];
  const group = new THREE.Group();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const pixelSize = normalizedVoxelPixelSize(style.frameWidth, style.frameHeight, 2.2);
  const recordsByPalette = new Map<number, StoryRollSmokeVoxelRecord[]>();

  frame.forEach((record) => {
    const records = recordsByPalette.get(record[2]) ?? [];
    records.push(record);
    recordsByPalette.set(record[2], records);
  });

  recordsByPalette.forEach((records, paletteIndex) => {
    const [red, green, blue, alpha] = style.palette[paletteIndex] ?? [235, 225, 205, 255];
    const normalizedAlpha = alpha / 255;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(red / 255, green / 255, blue / 255),
      transparent: true,
      opacity: normalizedAlpha,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: false
    });
    material.userData.sourceOpacity = normalizedAlpha;
    const mesh = new THREE.InstancedMesh(geometry, material, records.length);
    records.forEach(([pixelX, pixelY], index) => {
      position.set(
        (pixelX - (style.frameWidth - 1) * 0.5) * pixelSize,
        ((style.frameHeight - 1) * 0.5 - pixelY) * pixelSize,
        0
      );
      const voxelSize = pixelSize * (0.88 + normalizedAlpha * 0.16);
      scale.set(voxelSize, voxelSize, 0.045 + normalizedAlpha * 0.055);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.renderOrder = 18;
    mesh.frustumCulled = false;
    group.add(mesh);
  });

  group.renderOrder = 18;
  return group;
}

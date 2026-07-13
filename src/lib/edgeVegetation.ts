import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { StageDefinition, StageEdgeVegetationDefinition, Vec3Tuple } from '../types';

export type EdgeVegetationPlacement = {
  variant: string;
  position: Vec3Tuple;
  rotationY: number;
  height: number;
};

export function createEdgeVegetationPlacements(stage: StageDefinition): EdgeVegetationPlacement[] {
  const config = stage.edgeVegetation;
  if (!config || config.count <= 0 || config.variants.length === 0) return [];
  const random = mulberry32(config.seed);
  const variants = makeVariantSequence(config, random);
  const center = stage.fightPlane?.center ?? [0, stage.world?.floorY ?? -0.045, 0];
  const width = stage.playableBounds?.width ?? stage.fightPlane?.width ?? Math.min(stage.world?.width ?? 96, 96);
  const depth = stage.playableBounds?.depth ?? stage.fightPlane?.depth ?? Math.min(stage.world?.depth ?? 42, 42);
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const perimeter = Math.max(1, 2 * (width + depth));
  const worldHalfWidth = (stage.world?.width ?? 220) / 2;
  const worldHalfDepth = (stage.world?.depth ?? 220) / 2;
  const floorY = stage.world?.floorY ?? center[1] ?? -0.045;

  return variants.map((variant, index) => {
    const jitter = (random() - 0.5) * 0.66;
    const distance = (((index + 0.5 + jitter) / variants.length) * perimeter + perimeter) % perimeter;
    const edgePoint = pointOnPlayablePerimeter(distance, width, depth);
    const outwardDistance = config.clearMargin + random() * config.bandDepth;
    const x = THREE.MathUtils.clamp(center[0] + edgePoint.x + edgePoint.normalX * outwardDistance, -worldHalfWidth, worldHalfWidth);
    const z = THREE.MathUtils.clamp(center[2] + edgePoint.z + edgePoint.normalZ * outwardDistance, -worldHalfDepth, worldHalfDepth);
    const heightRange = variant.startsWith('bush') ? config.bushHeightRange : config.treeHeightRange;
    return {
      variant,
      position: [x, floorY, z],
      rotationY: random() * Math.PI * 2,
      height: THREE.MathUtils.lerp(heightRange[0], heightRange[1], random())
    };
  });
}

export function buildMergedEdgeVegetationGeometry(
  sourceGeometries: ReadonlyMap<string, THREE.BufferGeometry>,
  placements: EdgeVegetationPlacement[]
) {
  const transformed: THREE.BufferGeometry[] = [];
  const bounds = new THREE.Box3();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  for (const placement of placements) {
    const source = sourceGeometries.get(placement.variant);
    if (!source) continue;
    bounds.setFromBufferAttribute(source.getAttribute('position') as THREE.BufferAttribute);
    const sourceHeight = Math.max(0.001, bounds.max.y - bounds.min.y);
    const uniformScale = placement.height / sourceHeight;
    scale.setScalar(uniformScale);
    position.set(placement.position[0], placement.position[1] - bounds.min.y * uniformScale, placement.position[2]);
    rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, placement.rotationY);
    matrix.compose(position, rotation, scale);
    const geometry = source.clone();
    geometry.applyMatrix4(matrix);
    transformed.push(geometry);
  }
  if (transformed.length === 0) return null;
  const merged = mergeGeometries(transformed, false);
  transformed.forEach((geometry) => geometry.dispose());
  merged?.computeBoundingBox();
  merged?.computeBoundingSphere();
  return merged;
}

function makeVariantSequence(config: StageEdgeVegetationDefinition, random: () => number) {
  const sequence: string[] = [];
  while (sequence.length < config.count) {
    const cycle = [...config.variants];
    for (let index = cycle.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [cycle[index], cycle[swapIndex]] = [cycle[swapIndex], cycle[index]];
    }
    sequence.push(...cycle.slice(0, config.count - sequence.length));
  }
  return sequence;
}

function pointOnPlayablePerimeter(distance: number, width: number, depth: number) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  if (distance < width) return { x: -halfWidth + distance, z: -halfDepth, normalX: 0, normalZ: -1 };
  distance -= width;
  if (distance < depth) return { x: halfWidth, z: -halfDepth + distance, normalX: 1, normalZ: 0 };
  distance -= depth;
  if (distance < width) return { x: halfWidth - distance, z: halfDepth, normalX: 0, normalZ: 1 };
  distance -= width;
  return { x: -halfWidth, z: halfDepth - distance, normalX: -1, normalZ: 0 };
}

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

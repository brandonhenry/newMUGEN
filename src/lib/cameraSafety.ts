import * as THREE from 'three';
import type { StageDefinition } from '../types';

export type CameraStageBounds = {
  shape: 'box' | 'ellipse';
  centerX: number;
  centerZ: number;
  rotationY: number;
  halfWidth: number;
  halfDepth: number;
};

export type CameraSafetyCollider = {
  box: THREE.Box3;
};

const DEFAULT_STAGE_BOUND_WIDTH = 96;
const DEFAULT_STAGE_BOUND_DEPTH = 42;
const MIN_STAGE_BOUND_WIDTH = 16;
const MIN_STAGE_BOUND_DEPTH = 10;
const DEFAULT_CAMERA_BOUNDS_PADDING = 0.85;
const CAMERA_BOUNDS_EXTRA_SCALE = 0.55;

export function resolveCameraStageBounds(stage: StageDefinition, padding = DEFAULT_CAMERA_BOUNDS_PADDING): CameraStageBounds {
  const authoredBounds = stage.playableBounds;
  const minWidth = authoredBounds ? 4 : MIN_STAGE_BOUND_WIDTH;
  const minDepth = authoredBounds ? 4 : MIN_STAGE_BOUND_DEPTH;
  const width = Math.max(
    minWidth,
    Number.isFinite(authoredBounds?.width)
      ? Number(authoredBounds?.width)
      : Number.isFinite(stage.world?.width)
        ? Number(stage.world?.width)
        : DEFAULT_STAGE_BOUND_WIDTH
  );
  const depth = Math.max(
    minDepth,
    Number.isFinite(authoredBounds?.depth)
      ? Number(authoredBounds?.depth)
      : Number.isFinite(stage.world?.depth)
        ? Number(stage.world?.depth)
        : DEFAULT_STAGE_BOUND_DEPTH
  );
  return {
    shape: authoredBounds?.shape === 'ellipse' ? 'ellipse' : 'box',
    centerX: authoredBounds ? stage.fightPlane?.center?.[0] ?? 0 : 0,
    centerZ: authoredBounds ? stage.fightPlane?.center?.[2] ?? 0 : 0,
    rotationY: authoredBounds ? stage.fightPlane?.rotationY ?? 0 : 0,
    halfWidth: Math.max(0.1, width / 2 + padding),
    halfDepth: Math.max(0.1, depth / 2 + padding)
  };
}

export function worldToCameraBoundsLocal(position: { x: number; z: number }, bounds: CameraStageBounds) {
  const dx = position.x - bounds.centerX;
  const dz = position.z - bounds.centerZ;
  const cos = Math.cos(bounds.rotationY);
  const sin = Math.sin(bounds.rotationY);
  return {
    x: dx * cos - dz * sin,
    z: dx * sin + dz * cos
  };
}

export function cameraBoundsLocalToWorld(position: { x: number; z: number }, bounds: CameraStageBounds) {
  const cos = Math.cos(bounds.rotationY);
  const sin = Math.sin(bounds.rotationY);
  return {
    x: bounds.centerX + position.x * cos + position.z * sin,
    z: bounds.centerZ - position.x * sin + position.z * cos
  };
}

export function resolveCameraBoundaryNudge(
  stage: StageDefinition,
  focus: THREE.Vector3,
  desired: THREE.Vector3,
  output: THREE.Vector3
) {
  output.copy(desired);
  const baseBounds = resolveCameraStageBounds(stage);
  const authoredMin = Math.min(stage.playableBounds?.width ?? 0, stage.playableBounds?.depth ?? 0);
  const extra = Math.max(2.4, authoredMin > 0 ? authoredMin * CAMERA_BOUNDS_EXTRA_SCALE : 0);
  const bounds: CameraStageBounds = {
    ...baseBounds,
    halfWidth: baseBounds.halfWidth + extra,
    halfDepth: baseBounds.halfDepth + extra
  };
  const localDesired = worldToCameraBoundsLocal(desired, bounds);
  const constrained = constrainLocalToBounds(localDesired, bounds);
  if (!constrained) return false;

  const localFocus = worldToCameraBoundsLocal(focus, bounds);
  const focusDistance = Math.hypot(localDesired.x - localFocus.x, localDesired.z - localFocus.z);
  const constrainedDistance = Math.hypot(constrained.x - localFocus.x, constrained.z - localFocus.z);
  const nearEnoughToIgnore = constrainedDistance > 0 && focusDistance - constrainedDistance < 0.08;
  if (nearEnoughToIgnore) return false;

  const world = cameraBoundsLocalToWorld(constrained, bounds);
  output.x = world.x;
  output.z = world.z;
  return true;
}

export function findCameraSightlineBlockers<T extends CameraSafetyCollider>(
  cameraPosition: THREE.Vector3,
  visibilityPoints: THREE.Vector3[],
  colliders: Iterable<T>,
  options: { padding?: number; minDistanceFromPoint?: number } = {}
) {
  const padding = options.padding ?? 0.16;
  const minDistanceFromPoint = options.minDistanceFromPoint ?? 0.18;
  const blockers = new Set<T>();
  const ray = new THREE.Ray();
  const direction = new THREE.Vector3();
  const hitPoint = new THREE.Vector3();

  visibilityPoints.forEach((point) => {
    direction.copy(point).sub(cameraPosition);
    const totalDistance = direction.length();
    if (totalDistance <= minDistanceFromPoint) return;
    direction.multiplyScalar(1 / totalDistance);
    ray.set(cameraPosition, direction);

    for (const collider of colliders) {
      const box = collider.box.clone().expandByScalar(padding);
      if (box.containsPoint(point)) continue;
      if (box.containsPoint(cameraPosition)) {
        blockers.add(collider);
        continue;
      }
      const hit = ray.intersectBox(box, hitPoint);
      if (!hit) continue;
      const hitDistance = cameraPosition.distanceTo(hit);
      if (hitDistance > minDistanceFromPoint && hitDistance < totalDistance - minDistanceFromPoint) {
        blockers.add(collider);
      }
    }
  });

  return blockers;
}

function constrainLocalToBounds(position: { x: number; z: number }, bounds: CameraStageBounds) {
  if (bounds.shape === 'ellipse') return constrainLocalToEllipse(position, bounds);
  const x = THREE.MathUtils.clamp(position.x, -bounds.halfWidth, bounds.halfWidth);
  const z = THREE.MathUtils.clamp(position.z, -bounds.halfDepth, bounds.halfDepth);
  if (x === position.x && z === position.z) return null;
  return { x, z };
}

function constrainLocalToEllipse(position: { x: number; z: number }, bounds: CameraStageBounds) {
  const normalizedDistance = (position.x * position.x) / (bounds.halfWidth * bounds.halfWidth)
    + (position.z * position.z) / (bounds.halfDepth * bounds.halfDepth);
  if (normalizedDistance <= 1) return null;
  const scale = 1 / Math.sqrt(normalizedDistance);
  return {
    x: position.x * scale,
    z: position.z * scale
  };
}

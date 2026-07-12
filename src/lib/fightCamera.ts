import type { StageDefinition } from '../types';

const CAMERA_SIDE_TIE_EPSILON = 0.001;
const CAMERA_ORBIT_AXIS_BLEND_START = 0.2;
const CAMERA_ORBIT_AXIS_BLEND_END = 0.7;

export type HorizontalVector = {
  x: number;
  z: number;
};

export function stableFightCameraSide(dx: number, dz: number): [number, number] {
  const lineLength = Math.hypot(dx, dz) || 1;
  return [-dz / lineLength, dx / lineLength];
}

export function stageControlAxis(stage?: StageDefinition): [number, number] {
  const rotationY = stage?.fightPlane?.rotationY ?? 0;
  return [Math.cos(rotationY), -Math.sin(rotationY)];
}

export function cameraScreenRightStageAlignment(cameraSide: HorizontalVector, stage?: StageDefinition) {
  const [stageRightX, stageRightZ] = stageControlAxis(stage);
  const screenRightX = cameraSide.z;
  const screenRightZ = -cameraSide.x;
  return screenRightX * stageRightX + screenRightZ * stageRightZ;
}

export function shouldFlipCameraSideForControls(
  cameraSide: HorizontalVector,
  previousCameraSide?: HorizontalVector,
  stage?: StageDefinition
) {
  const alignment = cameraScreenRightStageAlignment(cameraSide, stage);
  if (alignment < -CAMERA_SIDE_TIE_EPSILON) return true;
  if (alignment > CAMERA_SIDE_TIE_EPSILON || !previousCameraSide) return false;
  return cameraSide.x * previousCameraSide.x + cameraSide.z * previousCameraSide.z < 0;
}

export function stableControlAlignedFightCameraSide(
  dx: number,
  dz: number,
  previousCameraSide?: HorizontalVector,
  stage?: StageDefinition
): [number, number] {
  let [cameraX, cameraZ] = stableFightCameraSide(dx, dz);
  const rawSide = { x: cameraX, z: cameraZ };
  if (shouldFlipCameraSideForControls(rawSide, previousCameraSide, stage)) {
    cameraX *= -1;
    cameraZ *= -1;
  }

  const alignment = Math.abs(cameraScreenRightStageAlignment({ x: cameraX, z: cameraZ }, stage));
  const blendRange = CAMERA_ORBIT_AXIS_BLEND_END - CAMERA_ORBIT_AXIS_BLEND_START;
  const blendProgress = Math.max(0, Math.min(1, (alignment - CAMERA_ORBIT_AXIS_BLEND_START) / blendRange));
  const perpendicularWeight = blendProgress * blendProgress * (3 - 2 * blendProgress);
  const [stageRightX, stageRightZ] = stageControlAxis(stage);
  const stageCameraX = -stageRightZ;
  const stageCameraZ = stageRightX;
  const blendedX = stageCameraX * (1 - perpendicularWeight) + cameraX * perpendicularWeight;
  const blendedZ = stageCameraZ * (1 - perpendicularWeight) + cameraZ * perpendicularWeight;
  const length = Math.hypot(blendedX, blendedZ) || 1;
  return [blendedX / length, blendedZ / length];
}

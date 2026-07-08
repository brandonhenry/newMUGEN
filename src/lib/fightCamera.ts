import type { StageDefinition } from '../types';

const CAMERA_SIDE_TIE_EPSILON = 0.001;

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

import type { StageDefinition } from '../types';

const CAMERA_SIDE_TIE_EPSILON = 0.001;
const CAMERA_SIDE_CONTINUITY_EPSILON = 0.001;

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
  if (previousCameraSide) {
    const continuity = cameraSide.x * previousCameraSide.x + cameraSide.z * previousCameraSide.z;
    return continuity < -CAMERA_SIDE_CONTINUITY_EPSILON;
  }
  const alignment = cameraScreenRightStageAlignment(cameraSide, stage);
  return alignment < -CAMERA_SIDE_TIE_EPSILON;
}

export function resolveFightCameraSide(
  dx: number,
  dz: number,
  previousCameraSide?: HorizontalVector,
  stage?: StageDefinition,
  presentationMirrored = false
): [number, number] {
  let [cameraX, cameraZ] = stableFightCameraSide(dx, dz);
  if (!previousCameraSide && shouldFlipCameraSideForControls({ x: cameraX, z: cameraZ }, undefined, stage)) {
    cameraX *= -1;
    cameraZ *= -1;
  }
  if (presentationMirrored) {
    cameraX *= -1;
    cameraZ *= -1;
  }
  if (previousCameraSide && shouldFlipCameraSideForControls({ x: cameraX, z: cameraZ }, previousCameraSide, stage)) {
    cameraX *= -1;
    cameraZ *= -1;
  }
  return [cameraX, cameraZ];
}

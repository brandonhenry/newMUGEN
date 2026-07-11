import type { InputFrame, InputFrameWithMetadata, StageDefinition, Vec3Tuple } from '../types';

export type StartSide = 'left' | 'right';

export const START_SIDE_STORAGE_KEY = 'kore.startSide.v1';
export const DEFAULT_START_SIDE: StartSide = 'left';

export function readStartSide(): StartSide {
  try {
    return normalizeStartSide(window.localStorage.getItem(START_SIDE_STORAGE_KEY));
  } catch {
    return DEFAULT_START_SIDE;
  }
}

export function writeStartSide(side: StartSide) {
  try {
    window.localStorage.setItem(START_SIDE_STORAGE_KEY, normalizeStartSide(side));
  } catch {
    // The in-memory preference still applies when storage is unavailable.
  }
}

export function normalizeStartSide(value: unknown): StartSide {
  return value === 'right' ? 'right' : DEFAULT_START_SIDE;
}

export function mirrorHorizontalInput(input: InputFrame): InputFrame {
  const mirrored = { ...input } as InputFrameWithMetadata;
  mirrored.left = input.right;
  mirrored.right = input.left;
  const dashDirection = (input as InputFrameWithMetadata).__horizontalDashDirection;
  if (dashDirection) mirrored.__horizontalDashDirection = dashDirection === 'left' ? 'right' : 'left';
  const pressedActions = (input as InputFrameWithMetadata).__pressedActions;
  if (pressedActions) {
    mirrored.__pressedActions = pressedActions.map((action) => action === 'left' ? 'right' : action === 'right' ? 'left' : action);
  }
  const pressSequences = (input as InputFrameWithMetadata).__pressSequences;
  if (pressSequences) {
    mirrored.__pressSequences = {
      ...pressSequences,
      left: pressSequences.right,
      right: pressSequences.left
    };
  }
  return mirrored;
}

export function shouldMirrorStartSide(stage: StageDefinition, perspectiveSlot: 1 | 2, preferredSide: StartSide) {
  const [p1, p2] = resolveStageStartPositions(stage);
  const rotationY = stage.fightPlane?.rotationY ?? 0;
  const axisX = Math.cos(rotationY);
  const axisZ = -Math.sin(rotationY);
  const delta = (p1[0] - p2[0]) * axisX + (p1[2] - p2[2]) * axisZ;
  const slotOneStartsLeft = Math.abs(delta) <= 0.001 ? true : delta < 0;
  const perspectiveStartsLeft = perspectiveSlot === 1 ? slotOneStartsLeft : !slotOneStartsLeft;
  return perspectiveStartsLeft !== (preferredSide === 'left');
}

function resolveStageStartPositions(stage: StageDefinition): [Vec3Tuple, Vec3Tuple] {
  if (stage.spawns) return [stage.spawns.p1, stage.spawns.p2];
  const center = stage.fightPlane?.center ?? [0, 0, 0];
  const rotationY = stage.fightPlane?.rotationY ?? 0;
  const y = stage.fightPlane?.y ?? stage.world?.floorY ?? 0;
  const distance = 1.3;
  return [
    [center[0] - distance * Math.cos(rotationY), y, center[2] + distance * Math.sin(rotationY)],
    [center[0] + distance * Math.cos(rotationY), y, center[2] - distance * Math.sin(rotationY)]
  ];
}

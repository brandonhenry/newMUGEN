export type MovementSmokeKind = 'backHop' | 'sprint';

export function resolveMovementSmokeAxes(facingYaw: number, kind: MovementSmokeKind) {
  const forwardX = Math.sin(facingYaw);
  const forwardZ = Math.cos(facingYaw);
  const trailSign = kind === 'backHop' ? 1 : -1;
  return {
    trail: [forwardX * trailSign, forwardZ * trailSign] as [number, number],
    side: [-forwardZ, forwardX] as [number, number]
  };
}

export function normalizedVoxelPixelSize(frameWidth: number, frameHeight: number, targetMaxSpan: number) {
  return targetMaxSpan / Math.max(1, frameWidth, frameHeight);
}

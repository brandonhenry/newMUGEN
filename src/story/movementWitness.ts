import { STORY_MOVEMENT_PROFILE } from './movementProfile';

export interface StoryCompressedWitnessInput {
  frames: number;
  durationSeconds: number;
  horizontal: -1 | 0 | 1;
  jump?: boolean;
  down?: boolean;
}

/**
 * Converts an authored navigation witness into a deterministic controller input
 * stream. The runtime controller consumes this exact record in Level Lab; the
 * points remain available separately for overlays and review reports.
 */
export function compressStoryWitnessInputs(points: Array<[number, number]>): StoryCompressedWitnessInput[] {
  return points.slice(1).map((point, index) => {
    const prior = points[index];
    const horizontal: -1 | 0 | 1 = point[0] > prior[0] ? 1 : point[0] < prior[0] ? -1 : 0;
    const seconds = Math.abs(point[0] - prior[0]) / STORY_MOVEMENT_PROFILE.walkSpeed
      + Math.max(0, point[1] - prior[1]) / STORY_MOVEMENT_PROFILE.climbSpeed;
    const durationSeconds = Math.max(1 / 30, seconds * 1.15 + 0.15);
    return {
      frames: Math.max(1, Math.ceil(durationSeconds * 60)),
      durationSeconds,
      horizontal,
      ...(point[1] > prior[1] + 0.5 ? { jump: true } : {}),
      ...(point[1] < prior[1] - 0.5 ? { down: true } : {})
    };
  });
}

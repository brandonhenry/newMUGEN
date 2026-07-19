import type { AdventureAudioEvent } from './adventureAudio';
import type { StoryHubAvatarPose, StorySurfaceMaterial, StoryWorldId } from './types';

export type StoryMovementAudioState = {
  worldId: StoryWorldId;
  x: number;
  y: number;
  pose: StoryHubAvatarPose;
  grounded: boolean;
  distance: number;
  material: StorySurfaceMaterial;
};

type MovementContactEvent = Extract<AdventureAudioEvent, { kind: 'step' | 'jump' | 'land' }>;

export function advanceStoryMovementAudio(
  previous: StoryMovementAudioState,
  input: {
    worldId: StoryWorldId;
    x: number;
    y: number;
    pose: StoryHubAvatarPose;
    grounded: boolean;
    material: StorySurfaceMaterial;
    mounted: boolean;
    underwater: boolean;
  }
): { state: StoryMovementAudioState; events: MovementContactEvent[] } {
  if (previous.worldId !== input.worldId) return {
    state: { worldId: input.worldId, x: input.x, y: input.y, pose: input.pose, grounded: input.grounded, distance: 0, material: input.material },
    events: []
  };
  const events: MovementContactEvent[] = [];
  if (previous.grounded && !input.grounded && !input.underwater) events.push({ kind: 'jump', material: previous.material });
  if (!previous.grounded && input.grounded && !input.underwater) events.push({ kind: 'land', material: input.material, intensity: Math.min(1, 0.65 + Math.abs(input.y - previous.y) * 0.12) });
  const travel = Math.abs(input.x - previous.x);
  const movingOnFoot = input.grounded && !input.mounted && !input.underwater && (input.pose === 'walk' || input.pose === 'sprint');
  let distance = movingOnFoot ? previous.distance + travel : 0;
  const stride = input.pose === 'sprint' ? 1.12 : 0.82;
  if (movingOnFoot && distance >= stride) {
    events.push({ kind: 'step', sprinting: input.pose === 'sprint', material: input.material });
    distance %= stride;
  }
  return {
    state: { worldId: input.worldId, x: input.x, y: input.y, pose: input.pose, grounded: input.grounded, distance, material: input.material },
    events
  };
}

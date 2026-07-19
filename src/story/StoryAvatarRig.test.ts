import { describe, expect, it } from 'vitest';
import type { StorySpriteAnimation } from './types';
import { shouldRestartStoryAvatarAnimation, storyAvatarCrouchTransitionForPoseChange, storyAvatarCrouchTransitionFrameIndex } from './StoryAvatarRig';

const rollAnimation: StorySpriteAnimation = {
  id: 'roll',
  loop: false,
  frames: Array.from({ length: 8 }, (_, index) => ({
    id: `roll-${index}`,
    path: `/roll-${index}.png`,
    durationMs: 60,
    contentBounds: [0, 0, 1, 1],
    bodyAnchorX: 0
  }))
};

describe('StoryAvatarRig animation restarts', () => {
  it('restarts a repeated attack when its sequence changes', () => {
    expect(shouldRestartStoryAvatarAnimation('attack-heavy', 'attack-heavy', 4, 5)).toBe(true);
  });

  it('does not restart an unchanged animation every render', () => {
    expect(shouldRestartStoryAvatarAnimation('attack-heavy', 'attack-heavy', 5, 5)).toBe(false);
  });

  it('still restarts when the pose changes normally', () => {
    expect(shouldRestartStoryAvatarAnimation('idle', 'attack-jab', 5, 5)).toBe(true);
  });

  it('restarts repeated rolls when their action sequence changes', () => {
    expect(shouldRestartStoryAvatarAnimation('roll', 'roll', 2, 3)).toBe(true);
  });

  it('treats crouch as a stable pose until another action starts', () => {
    expect(shouldRestartStoryAvatarAnimation('crouch', 'crouch', 3, 3)).toBe(false);
    expect(shouldRestartStoryAvatarAnimation('roll', 'crouch', 3, 3)).toBe(true);
  });
});

describe('StoryAvatarRig crouch transitions', () => {
  it('uses the planted pose while entering crouch and reverses it while standing', () => {
    expect(storyAvatarCrouchTransitionFrameIndex('enter', rollAnimation, 0)).toBe(6);
    expect(storyAvatarCrouchTransitionFrameIndex('enter', rollAnimation, 60)).toBe(7);
    expect(storyAvatarCrouchTransitionFrameIndex('enter', rollAnimation, 120)).toBeNull();
    expect(storyAvatarCrouchTransitionFrameIndex('exit', rollAnimation, 0)).toBe(7);
    expect(storyAvatarCrouchTransitionFrameIndex('exit', rollAnimation, 60)).toBe(6);
    expect(storyAvatarCrouchTransitionFrameIndex('exit', rollAnimation, 120)).toBeNull();
  });

  it('bridges standing and crouch without replaying rotation frames', () => {
    expect(storyAvatarCrouchTransitionForPoseChange('idle', 'crouch')).toBe('enter');
    expect(storyAvatarCrouchTransitionForPoseChange('crouch', 'idle')).toBe('exit');
    expect(storyAvatarCrouchTransitionForPoseChange('crouch', 'walk')).toBe('exit');
    expect(storyAvatarCrouchTransitionForPoseChange('roll', 'sprint')).toBe('exit');
    expect(storyAvatarCrouchTransitionForPoseChange('roll', 'crouch')).toBeNull();
    expect(storyAvatarCrouchTransitionForPoseChange('crouch', 'jump')).toBeNull();
  });
});

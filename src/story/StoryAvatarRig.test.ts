import { describe, expect, it } from 'vitest';
import { shouldRestartStoryAvatarAnimation } from './StoryAvatarRig';

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

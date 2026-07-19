import { describe, expect, it } from 'vitest';
import { storyLevelLabCameraOverride } from './LevelLabOverlay';

describe('Level Lab camera override', () => {
  it('does not capture the normal gameplay camera when query parameters are absent', () => {
    expect(storyLevelLabCameraOverride('')).toBeNull();
    expect(storyLevelLabCameraOverride('?storyLevelLab=1')).toBeNull();
    expect(storyLevelLabCameraOverride('?storyCameraX=4')).toBeNull();
  });

  it('accepts only a complete finite camera teleport', () => {
    expect(storyLevelLabCameraOverride('?storyCameraX=-12&storyCameraY=18')).toEqual({ x: -12, y: 18 });
    expect(storyLevelLabCameraOverride('?storyCameraX=nope&storyCameraY=18')).toBeNull();
  });
});

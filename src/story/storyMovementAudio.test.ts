import { describe, expect, it } from 'vitest';
import { advanceStoryMovementAudio, type StoryMovementAudioState } from './storyMovementAudio';

function state(overrides: Partial<StoryMovementAudioState> = {}): StoryMovementAudioState {
  return { worldId: 'frostpeak', x: 0, y: 0.82, pose: 'idle', grounded: true, distance: 0, material: 'grass', ...overrides };
}

describe('story movement contact audio', () => {
  it('uses departure material for jumping and arrival material for landing', () => {
    const jump = advanceStoryMovementAudio(state({ material: 'grass' }), { worldId: 'frostpeak', x: 0, y: 1.2, pose: 'jump', grounded: false, material: 'grass', mounted: false, underwater: false });
    expect(jump.events).toEqual([{ kind: 'jump', material: 'grass' }]);
    const land = advanceStoryMovementAudio(jump.state, { worldId: 'frostpeak', x: 2, y: 0.82, pose: 'idle', grounded: true, material: 'ice', mounted: false, underwater: false });
    expect(land.events).toEqual([{ kind: 'land', material: 'ice', intensity: expect.any(Number) }]);
  });

  it('uses the current tile for walking and sprinting strides', () => {
    const walk = advanceStoryMovementAudio(state({ distance: 0.7 }), { worldId: 'frostpeak', x: 0.2, y: 0.82, pose: 'walk', grounded: true, material: 'grass', mounted: false, underwater: false });
    expect(walk.events).toEqual([{ kind: 'step', sprinting: false, material: 'grass' }]);
    const sprint = advanceStoryMovementAudio(state({ pose: 'sprint', distance: 1.05, material: 'ice' }), { worldId: 'frostpeak', x: 0.2, y: 0.82, pose: 'sprint', grounded: true, material: 'ice', mounted: false, underwater: false });
    expect(sprint.events).toEqual([{ kind: 'step', sprinting: true, material: 'ice' }]);
  });

  it('suppresses footfalls while mounted or underwater', () => {
    const base = state({ distance: 1 });
    expect(advanceStoryMovementAudio(base, { worldId: 'frostpeak', x: 1, y: 0.82, pose: 'sprint', grounded: true, material: 'snow', mounted: true, underwater: false }).events).toEqual([]);
    expect(advanceStoryMovementAudio(base, { worldId: 'frostpeak', x: 1, y: 0.82, pose: 'jump', grounded: false, material: 'water', mounted: false, underwater: true }).events).toEqual([]);
  });

  it('does not emit walk or sprint footsteps while rolling', () => {
    const result = advanceStoryMovementAudio(state({ distance: 1 }), { worldId: 'frostpeak', x: 1, y: 0.82, pose: 'roll', grounded: true, material: 'stone', mounted: false, underwater: false });
    expect(result.events).toEqual([]);
    expect(result.state.distance).toBe(0);
  });

  it('does not emit footsteps while crouched', () => {
    const result = advanceStoryMovementAudio(state({ distance: 1 }), { worldId: 'frostpeak', x: 0, y: 0.82, pose: 'crouch', grounded: true, material: 'stone', mounted: false, underwater: false });
    expect(result.events).toEqual([]);
    expect(result.state.distance).toBe(0);
  });
});

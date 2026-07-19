import { describe, expect, it } from 'vitest';
import { canStartStoryRoll, resolveStoryRollRequest, STORY_MOVEMENT_PROFILE, storyRollActiveFacing, storyRollCombatWindowBlocksDamage, storyRollHasCombatInvulnerability, storyRollRecoveryFacing } from './movementProfile';

describe('story roll movement profile', () => {
  it('travels about 4.2 world units over eight 60ms frames with a start-to-start cooldown', () => {
    expect(STORY_MOVEMENT_PROFILE.rollDurationSeconds).toBe(0.48);
    expect(STORY_MOVEMENT_PROFILE.rollSpeed).toBe(8.75);
    expect(STORY_MOVEMENT_PROFILE.rollSpeed * STORY_MOVEMENT_PROFILE.rollDurationSeconds).toBeCloseTo(4.2, 5);
    expect(STORY_MOVEMENT_PROFILE.rollCooldownSeconds).toBe(0.9);
  });

  it('only starts in an unlocked, grounded, traversal-safe state', () => {
    const ready = { rollUnlocked: true, grounded: true, mounted: false, swimming: false, assistedClimb: false, attacking: false, cooldownReady: true };
    expect(canStartStoryRoll(ready)).toBe(true);
    for (const blocked of [
      { rollUnlocked: false }, { grounded: false }, { mounted: true }, { swimming: true },
      { assistedClimb: true }, { attacking: true }, { cooldownReady: false }
    ]) expect(canStartStoryRoll({ ...ready, ...blocked })).toBe(false);
  });

  it('grants combat i-frames only from 120ms through 360ms', () => {
    expect(storyRollHasCombatInvulnerability(0.119)).toBe(false);
    expect(storyRollHasCombatInvulnerability(0.12)).toBe(true);
    expect(storyRollHasCombatInvulnerability(0.359)).toBe(true);
    expect(storyRollHasCombatInvulnerability(0.36)).toBe(false);
    const window = { startMs: 1_120, endMs: 1_360 };
    expect(storyRollCombatWindowBlocksDamage('combat', 1_200, window)).toBe(true);
    expect(storyRollCombatWindowBlocksDamage('environment', 1_200, window)).toBe(false);
    expect(storyRollCombatWindowBlocksDamage('combat', 1_360, window)).toBe(false);
  });

  it('resolves double taps and crouch-direction presses as distinct roll styles', () => {
    expect(resolveStoryRollRequest({
      left: true, right: false, down: false,
      previousLeft: false, previousRight: false, previousDown: false,
      doubleTapDirection: 'left'
    })).toEqual({ direction: -1, fromCrouch: false });
    expect(resolveStoryRollRequest({
      left: false, right: true, down: true,
      previousLeft: false, previousRight: false, previousDown: true
    })).toEqual({ direction: 1, fromCrouch: true });
    expect(resolveStoryRollRequest({
      left: true, right: false, down: true,
      previousLeft: true, previousRight: false, previousDown: false
    })).toEqual({ direction: -1, fromCrouch: true });
    expect(resolveStoryRollRequest({
      left: false, right: true, down: true,
      previousLeft: false, previousRight: true, previousDown: true
    })).toBeNull();
  });

  it('faces the travel direction during rolls and reverses after completed crouch-rolls', () => {
    expect(storyRollActiveFacing(1)).toBe(1);
    expect(storyRollActiveFacing(-1)).toBe(-1);
    expect(storyRollRecoveryFacing(1, false)).toBe(1);
    expect(storyRollRecoveryFacing(1, true)).toBe(-1);
    expect(storyRollRecoveryFacing(-1, true)).toBe(1);
    expect(storyRollRecoveryFacing(1, true, false)).toBe(1);
  });
});

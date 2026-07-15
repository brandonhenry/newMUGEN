import { describe, expect, it } from 'vitest';
import type { CharacterDefinition } from '../types';
import { isCharacterPlayable, isCharacterSelectable, isCharacterUnlocked } from './characterAccess';

describe('character access policy', () => {
  const unlockedIds = new Set(['earned']);

  it('allows every playable fighter in offline training', () => {
    expect(isCharacterSelectable(fighter('starter'), unlockedIds, 'offlineTraining')).toBe(true);
    expect(isCharacterSelectable(fighter('earned', { locked: true }), unlockedIds, 'offlineTraining')).toBe(true);
    expect(isCharacterSelectable(fighter('locked', { locked: true }), unlockedIds, 'offlineTraining')).toBe(true);
    expect(isCharacterSelectable(fighter('locked-alt', { locked: true, variant: true, variantOf: 'locked' }), unlockedIds, 'offlineTraining')).toBe(true);
  });

  it('requires ownership in standard and online contexts', () => {
    expect(isCharacterSelectable(fighter('starter'), unlockedIds)).toBe(true);
    expect(isCharacterSelectable(fighter('earned', { locked: true }), unlockedIds)).toBe(true);
    expect(isCharacterSelectable(fighter('locked', { locked: true }), unlockedIds)).toBe(false);
    expect(isCharacterUnlocked(fighter('locked', { locked: true }), unlockedIds)).toBe(false);
  });

  it('never exposes unplayable roster entries', () => {
    const unplayable = fighter('work-in-progress', { locked: true, unplayable: true });
    expect(isCharacterPlayable(unplayable)).toBe(false);
    expect(isCharacterSelectable(unplayable, unlockedIds, 'offlineTraining')).toBe(false);
  });
});

function fighter(id: string, patch: Partial<CharacterDefinition> = {}): CharacterDefinition {
  return {
    id,
    displayName: id,
    ...patch
  } as CharacterDefinition;
}

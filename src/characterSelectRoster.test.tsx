import { describe, expect, it } from 'vitest';
import { sortRosterByUnlockState } from './App';
import type { CharacterDefinition } from './types';

describe('character select roster ordering', () => {
  it('puts effectively unlocked base roster entries before locked entries', () => {
    const lockedFirst = fighter('locked-first', true);
    const openSecond = fighter('open-second');
    const arcadeUnlockedThird = fighter('arcade-unlocked-third', true);
    const openFourth = fighter('open-fourth');

    const sorted = sortRosterByUnlockState(
      [lockedFirst, openSecond, arcadeUnlockedThird, openFourth],
      new Set([arcadeUnlockedThird.id])
    );

    expect(sorted.map((character) => character.id)).toEqual([
      'open-second',
      'arcade-unlocked-third',
      'open-fourth',
      'locked-first'
    ]);
  });

  it('treats a base card as unlocked when one of its variants is unlocked', () => {
    const lockedBase = fighter('locked-base', true);
    const openMiddle = fighter('open-middle');
    const lockedLast = fighter('locked-last', true);
    const unlockedVariant = fighter('locked-base-alt', true, {
      variant: true,
      variantOf: lockedBase.id
    });

    const sorted = sortRosterByUnlockState(
      [lockedBase, openMiddle, lockedLast],
      new Set([unlockedVariant.id]),
      [lockedBase, openMiddle, lockedLast, unlockedVariant]
    );

    expect(sorted.map((character) => character.id)).toEqual([
      'locked-base',
      'open-middle',
      'locked-last'
    ]);
  });
});

function fighter(id: string, locked = false, patch: Partial<CharacterDefinition> = {}): CharacterDefinition {
  return {
    id,
    displayName: id,
    locked,
    ...patch
  } as CharacterDefinition;
}

import { describe, expect, it } from 'vitest';
import { DUPLICATE_FIGHTER_HUE_SHIFT_DEGREES, getDuplicateFighterHueShift, shiftHueColor } from './fighterHue';

describe('duplicate fighter hue shifts', () => {
  it('shifts only player two when both fighters share a base character', () => {
    const match = makeHueMatch('kiro', 'kiro');

    expect(getDuplicateFighterHueShift(match, 1)).toBe(0);
    expect(getDuplicateFighterHueShift(match, 2)).toBe(DUPLICATE_FIGHTER_HUE_SHIFT_DEGREES);
  });

  it('does not shift either fighter when base characters differ', () => {
    const match = makeHueMatch('kiro', 'naruto');

    expect(getDuplicateFighterHueShift(match, 1)).toBe(0);
    expect(getDuplicateFighterHueShift(match, 2)).toBe(0);
  });

  it('uses base character identity instead of transformed current character identity', () => {
    const match = {
      fighters: [
        { slot: 1 as const, character: { id: 'kiro-super' }, baseCharacter: { id: 'kiro' } },
        { slot: 2 as const, character: { id: 'kiro-dark' }, baseCharacter: { id: 'kiro' } }
      ] as [
        { slot: 1; character: { id: string }; baseCharacter: { id: string } },
        { slot: 2; character: { id: string }; baseCharacter: { id: string } }
      ]
    };

    expect(getDuplicateFighterHueShift(match, 2)).toBe(DUPLICATE_FIGHTER_HUE_SHIFT_DEGREES);
  });

  it('rotates hex colors while leaving unsupported color strings alone', () => {
    expect(shiftHueColor('#ff0000', 120)).toBe('#00ff00');
    expect(shiftHueColor('red', 120)).toBe('red');
  });
});

function makeHueMatch(p1BaseCharacterId: string, p2BaseCharacterId: string) {
  return {
    fighters: [
      { slot: 1 as const, baseCharacter: { id: p1BaseCharacterId } },
      { slot: 2 as const, baseCharacter: { id: p2BaseCharacterId } }
    ] as [
      { slot: 1; baseCharacter: { id: string } },
      { slot: 2; baseCharacter: { id: string } }
    ]
  };
}

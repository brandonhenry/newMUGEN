import { describe, expect, it } from 'vitest';
import { getTabShortcutPrompts, type InputPromptMode } from './inputPrompts';

describe('input prompt helpers', () => {
  it.each([
    ['keyboardShortcut', { previous: 'O', next: 'P' }],
    ['gamepad', { previous: 'L1', next: 'R1' }],
    ['keyboardDirectional', { previous: '←', next: '→' }],
    ['pointer', { previous: '←', next: '→' }],
    ['touch', { previous: '←', next: '→' }]
  ] satisfies Array<[InputPromptMode, { previous: string; next: string }]>)('formats tab prompts for %s input', (mode, prompts) => {
    expect(getTabShortcutPrompts(mode)).toEqual(prompts);
  });
});

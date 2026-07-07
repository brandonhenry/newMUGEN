export type InputPromptMode = 'gamepad' | 'keyboardShortcut' | 'keyboardDirectional' | 'pointer' | 'touch';

export type TabShortcutPrompts = {
  previous: string;
  next: string;
};

export function getTabShortcutPrompts(mode: InputPromptMode): TabShortcutPrompts {
  if (mode === 'gamepad') return { previous: 'L1', next: 'R1' };
  if (mode === 'keyboardShortcut') return { previous: 'O', next: 'P' };
  return { previous: '←', next: '→' };
}

import type { ButtonComboId, MoveInput } from '../types';

export type ButtonComboDefinition = {
  id: ButtonComboId;
  label: string;
  actions: MoveInput[];
};

export const buttonComboDefinitions: ButtonComboDefinition[] = [
  { id: '1+2', label: '1+2', actions: ['jab', 'heavy'] },
  { id: '1+3', label: '1+3', actions: ['jab', 'kick'] },
  { id: '1+4', label: '1+4', actions: ['jab', 'special'] },
  { id: '2+3', label: '2+3', actions: ['heavy', 'kick'] },
  { id: '2+4', label: '2+4', actions: ['heavy', 'special'] },
  { id: '3+4', label: '3+4', actions: ['kick', 'special'] },
  { id: '1+2+3', label: '1+2+3', actions: ['jab', 'heavy', 'kick'] },
  { id: '1+2+4', label: '1+2+4', actions: ['jab', 'heavy', 'special'] },
  { id: '1+3+4', label: '1+3+4', actions: ['jab', 'kick', 'special'] },
  { id: '2+3+4', label: '2+3+4', actions: ['heavy', 'kick', 'special'] },
  { id: '1+2+3+4', label: '1+2+3+4', actions: ['jab', 'heavy', 'kick', 'special'] }
];

export const buttonComboIds = buttonComboDefinitions.map((combo) => combo.id);
export const keybindableButtonComboDefinitions = buttonComboDefinitions.filter((combo) => combo.id !== '1+2+3+4');
export const keybindableButtonComboIds = keybindableButtonComboDefinitions.map((combo) => combo.id);

export function getButtonComboDefinition(comboId: string) {
  return buttonComboDefinitions.find((combo) => combo.id === comboId);
}

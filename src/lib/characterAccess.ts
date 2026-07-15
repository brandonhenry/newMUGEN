import type { CharacterDefinition } from '../types';

export type CharacterAccessContext = 'standard' | 'offlineTraining';

export function isCharacterPlayable(character: CharacterDefinition) {
  return !character.unplayable;
}

export function isCharacterUnlocked(character: CharacterDefinition, unlockedIds: ReadonlySet<string>) {
  return !character.locked || unlockedIds.has(character.id);
}

export function isCharacterSelectable(
  character: CharacterDefinition,
  unlockedIds: ReadonlySet<string>,
  context: CharacterAccessContext = 'standard'
) {
  return isCharacterPlayable(character) && (
    context === 'offlineTraining' || isCharacterUnlocked(character, unlockedIds)
  );
}

import { starterCharacters } from '../data/characters';
import type { CharacterDefinition } from '../types';
import { debugLog } from './debugLogger';

const requiredClips = [
  'idle',
  'walkForward',
  'walkBack',
  'sidestepLeft',
  'sidestepRight',
  'crouch',
  'jump',
  'block',
  'jab',
  'kick',
  'heavy',
  'special',
  'hitLight',
  'hitHeavy',
  'knockdown',
  'win',
  'lose'
];

export type CharacterLoadResult = {
  characters: CharacterDefinition[];
  warnings: Record<string, string[]>;
};

export function validateCharacter(character: CharacterDefinition): string[] {
  const warnings: string[] = [];
  if (!character.id) warnings.push('Missing id.');
  if (!character.displayName) warnings.push('Missing displayName.');
  if (!character.modelPath) warnings.push('Missing modelPath.');
  if (character.renderMode === 'spriteVoxel' && !character.spriteSheetPath) {
    warnings.push('Sprite-voxel character is missing spriteSheetPath.');
  }
  if (character.voxelProfile === 'image-source' && !character.animationFrames && !character.spriteSheetPath) {
    warnings.push('Image-source voxel character needs animationFrames or spriteSheetPath.');
  }
  if (!character.moves.length) warnings.push('No moves defined.');
  for (const clip of requiredClips) {
    if (!character.animations[clip]) {
      warnings.push(`Missing animation clip mapping: ${clip}. Fallback pose will be used.`);
    }
  }
  for (const move of character.moves) {
    const total = move.startup + move.active + move.recovery;
    if (total <= 0) warnings.push(`${move.id} has invalid timing.`);
    if (move.damage <= 0) warnings.push(`${move.id} should deal positive damage.`);
  }
  return warnings;
}

export async function loadCharacterRoster(): Promise<CharacterLoadResult> {
  try {
    const index = (await fetch('/characters/index.json').then((response) => response.json())) as {
      characters: string[];
    };
    debugLog(2, 'character index fetched', { characterIds: index.characters });
    const loaded = await Promise.all(
      index.characters.map((id) =>
        fetch(`/characters/${id}/character.json`).then((response) => response.json() as Promise<CharacterDefinition>)
      )
    );
    const characters = loaded.length > 0 ? loaded : starterCharacters;
    debugLog(2, 'character manifests loaded', {
      characters: characters.map((character) => ({
        id: character.id,
        displayName: character.displayName,
        walkForward: character.animationFrames?.walkForward?.map((frame) => frame.match(/frame-(\d+)\.png$/)?.[1]),
        walkForwardFps: character.animationFrameRates?.walkForward ?? character.animationFps
      }))
    });
    return {
      characters,
      warnings: Object.fromEntries(characters.map((character) => [character.id, validateCharacter(character)]))
    };
  } catch {
    debugLog(2, 'manifest load failed, using bundled starter characters');
    return {
      characters: starterCharacters,
      warnings: Object.fromEntries(starterCharacters.map((character) => [character.id, validateCharacter(character)]))
    };
  }
}

import type { CharacterDefinition, CharacterModelScale } from '../types';

const MIN_CHARACTER_MODEL_SCALE = 0.25;
const MAX_CHARACTER_MODEL_SCALE = 2.5;

function finiteOr(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampScale(value: unknown, fallback: number) {
  return Math.max(MIN_CHARACTER_MODEL_SCALE, Math.min(MAX_CHARACTER_MODEL_SCALE, finiteOr(value, fallback)));
}

export function normalizeCharacterModelScale(modelScale: CharacterModelScale | undefined, legacyScale = 1): Required<CharacterModelScale> {
  const fallback = clampScale(legacyScale, 1);
  return {
    width: Number(clampScale(modelScale?.width, fallback).toFixed(2)),
    height: Number(clampScale(modelScale?.height, fallback).toFixed(2))
  };
}

export function getCharacterGlobalScale(character: Pick<CharacterDefinition, 'scale' | 'modelScale'>): Required<CharacterModelScale> {
  return normalizeCharacterModelScale(character.modelScale, character.scale);
}

export function getCharacterCombatScale(character: Pick<CharacterDefinition, 'scale' | 'modelScale'>): Required<CharacterModelScale> {
  if (!character.modelScale) return { width: 1, height: 1 };
  const globalScale = getCharacterGlobalScale(character);
  const legacyScale = clampScale(character.scale, 1);
  return {
    width: Number(clampScale(globalScale.width / legacyScale, 1).toFixed(2)),
    height: Number(clampScale(globalScale.height / legacyScale, 1).toFixed(2))
  };
}

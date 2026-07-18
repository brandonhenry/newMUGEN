import type { StageAmbiencePresetId } from '../types';
import type { AdventureMusicContext, StoryAttackInput } from './types';

export type AdventureSurfaceMaterial = 'grass' | 'wood' | 'metal' | 'stone' | 'ice' | 'sand' | 'crystal' | 'water';

export type AdventureAudioEvent =
  | { kind: 'step'; sprinting: boolean }
  | { kind: 'jump' }
  | { kind: 'land'; intensity?: number }
  | { kind: 'attack'; attackInput: StoryAttackInput }
  | { kind: 'enemy-hit'; attackInput: StoryAttackInput; critical: boolean; finishing: boolean }
  | { kind: 'player-hit'; damage: number }
  | { kind: 'resource-hit'; broken: boolean }
  | { kind: 'portal' }
  | { kind: 'water'; entered: boolean };

const listeners = new Set<(event: AdventureAudioEvent) => void>();

export function emitAdventureAudioEvent(event: AdventureAudioEvent) {
  listeners.forEach((listener) => listener(event));
}

export function subscribeAdventureAudio(listener: (event: AdventureAudioEvent) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function adventureSurfaceMaterial(context: AdventureMusicContext, underwater = false): AdventureSurfaceMaterial {
  if (underwater) return 'water';
  if (context.depth) {
    if (context.worldId === 'ironroot') return 'metal';
    if (context.worldId === 'frostpeak') return 'ice';
    return 'stone';
  }
  switch (context.worldId) {
    case 'greenhollow': return context.mapId?.includes('field-b') ? 'wood' : 'grass';
    case 'thornwood': return context.mapId?.includes('field-b') ? 'wood' : 'grass';
    case 'ironroot': return 'metal';
    case 'frostpeak': return 'ice';
    case 'sunscar': return 'sand';
    case 'skyglass': return 'crystal';
    case 'bonevault':
    case 'emberdeep':
    case 'world-route':
    default: return 'stone';
  }
}

export function adventureAmbiencePreset(context: AdventureMusicContext, underwater = false): StageAmbiencePresetId {
  if (underwater) return 'river-water';
  if (context.depth) return context.worldId === 'emberdeep' ? 'fire-hell' : 'cave-dark';
  switch (context.worldId) {
    case 'greenhollow': return context.mapId?.includes('field-b') ? 'forest-waterfall' : 'open-meadow';
    case 'thornwood': return 'forest-garden';
    case 'ironroot': return 'industrial-transit';
    case 'bonevault': return 'indoor-quiet';
    case 'emberdeep': return 'fire-hell';
    case 'frostpeak': return 'snow-wind';
    case 'sunscar': return 'dry-wind';
    case 'skyglass': return 'energy-void';
    case 'world-route':
    default: return 'open-meadow';
  }
}

export const ADVENTURE_HIT_SFX: Record<StoryAttackInput, string> = {
  jab: '/sounds/hits/generated/hit-001.wav',
  heavy: '/sounds/hits/generated/hit-002.wav',
  kick: '/sounds/hits/generated/hit-009.wav',
  special: '/sounds/hits/generated/hit-003.wav'
};

export const ADVENTURE_PLAYER_HIT_SFX = '/sounds/hits/generated/hit-013.wav';
export const ADVENTURE_RESOURCE_HIT_SFX = '/sounds/hits/generated/hit-005.wav';
export const ADVENTURE_RESOURCE_BREAK_SFX = '/sounds/hits/generated/hit-012.wav';
export const ADVENTURE_PORTAL_SFX = '/sounds/stage-ambience/door-wood-open.mp3';

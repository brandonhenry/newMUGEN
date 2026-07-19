import type { StageAmbiencePresetId } from '../types';
import type { StoryResourceImpactMaterial } from './adventureCrafting';
import type { AdventureMusicContext, StoryAttackInput } from './types';
import type { StorySurfaceMaterial } from './types';

export type AdventureSurfaceMaterial = StorySurfaceMaterial;

export type AdventureAudioEvent =
  | { kind: 'step'; sprinting: boolean; material: AdventureSurfaceMaterial }
  | { kind: 'jump'; material: AdventureSurfaceMaterial }
  | { kind: 'land'; intensity?: number; material: AdventureSurfaceMaterial }
  | { kind: 'attack'; attackInput: StoryAttackInput }
  | { kind: 'enemy-hit'; attackInput: StoryAttackInput; critical: boolean; finishing: boolean }
  | { kind: 'player-hit'; damage: number }
  | { kind: 'resource-hit'; attackInput: StoryAttackInput; material: StoryResourceImpactMaterial; broken: boolean; major: boolean; legendary: boolean; sequence: number }
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
  switch (context.worldId) {
    case 'greenhollow': return 'grass';
    case 'thornwood': return 'grass';
    case 'ironroot': return 'stone';
    case 'frostpeak': return 'snow';
    case 'sunscar': return 'sand';
    case 'skyglass': return 'crystal';
    case 'bonevault':
    case 'emberdeep': return 'stone';
    case 'world-route': return 'grass';
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
export const ADVENTURE_PORTAL_SFX = '/sounds/stage-ambience/door-wood-open.mp3';

const resourceSfx = (name: string) => `/story/audio/resource-impacts/${name}.ogg`;

export type AdventureResourceSfxProfile = {
  hit: string[];
  broken: string[];
  breakLayer?: string;
  playbackRate: number;
};

export const ADVENTURE_RESOURCE_SFX: Record<StoryResourceImpactMaterial, AdventureResourceSfxProfile> = {
  foliage: { hit: [resourceSfx('foliage-hit')], broken: [resourceSfx('foliage-hit')], playbackRate: 1.08 },
  wood: { hit: [resourceSfx('wood-hit-01'), resourceSfx('wood-hit-02'), resourceSfx('wood-hit-03')], broken: [resourceSfx('wood-break-01'), resourceSfx('wood-break-02')], playbackRate: 1 },
  stone: { hit: [resourceSfx('stone-hit')], broken: [resourceSfx('stone-break-01'), resourceSfx('stone-break-02')], playbackRate: 1 },
  metal: { hit: [resourceSfx('metal-hit-01'), resourceSfx('metal-hit-02')], broken: [resourceSfx('metal-break')], breakLayer: resourceSfx('stone-break-02'), playbackRate: 1.04 },
  bone: { hit: [resourceSfx('bone-hit')], broken: [resourceSfx('bone-hit')], playbackRate: 1.18 },
  crystal: { hit: [resourceSfx('crystal-hit-01'), resourceSfx('crystal-hit-02')], broken: [resourceSfx('crystal-break-01'), resourceSfx('crystal-break-02')], playbackRate: 1.08 },
  ice: { hit: [resourceSfx('crystal-hit-01'), resourceSfx('crystal-hit-02')], broken: [resourceSfx('crystal-break-01'), resourceSfx('crystal-break-02')], playbackRate: 1.28 },
  volcanic: { hit: [resourceSfx('stone-hit')], broken: [resourceSfx('stone-break-01'), resourceSfx('stone-break-02')], playbackRate: 0.78 }
};

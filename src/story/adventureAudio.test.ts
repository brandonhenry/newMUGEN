import { describe, expect, it, vi } from 'vitest';
import {
  adventureAmbiencePreset,
  adventureSurfaceMaterial,
  emitAdventureAudioEvent,
  subscribeAdventureAudio,
  type AdventureAudioEvent
} from './adventureAudio';
import type { AdventureMusicContext } from './types';

function context(worldId: AdventureMusicContext['worldId'], overrides: Partial<AdventureMusicContext> = {}): AdventureMusicContext {
  return {
    worldId,
    mapId: `${worldId}:arrival`,
    phase: 'explore',
    encounterIntensity: 0,
    depth: false,
    ...overrides
  };
}

describe('Adventure audio environment mapping', () => {
  it('gives each biome an intentional walking surface', () => {
    expect(adventureSurfaceMaterial(context('world-route'))).toBe('stone');
    expect(adventureSurfaceMaterial(context('greenhollow'))).toBe('grass');
    expect(adventureSurfaceMaterial(context('greenhollow', { mapId: 'greenhollow:field-b' }))).toBe('wood');
    expect(adventureSurfaceMaterial(context('thornwood'))).toBe('grass');
    expect(adventureSurfaceMaterial(context('ironroot'))).toBe('metal');
    expect(adventureSurfaceMaterial(context('bonevault'))).toBe('stone');
    expect(adventureSurfaceMaterial(context('emberdeep'))).toBe('stone');
    expect(adventureSurfaceMaterial(context('frostpeak'))).toBe('ice');
    expect(adventureSurfaceMaterial(context('sunscar'))).toBe('sand');
    expect(adventureSurfaceMaterial(context('skyglass'))).toBe('crystal');
  });

  it('uses biome ambience and changes to depth or underwater soundscapes', () => {
    expect(adventureAmbiencePreset(context('greenhollow'))).toBe('open-meadow');
    expect(adventureAmbiencePreset(context('thornwood'))).toBe('forest-garden');
    expect(adventureAmbiencePreset(context('ironroot'))).toBe('industrial-transit');
    expect(adventureAmbiencePreset(context('emberdeep'))).toBe('fire-hell');
    expect(adventureAmbiencePreset(context('frostpeak'))).toBe('snow-wind');
    expect(adventureAmbiencePreset(context('sunscar'))).toBe('dry-wind');
    expect(adventureAmbiencePreset(context('skyglass'))).toBe('energy-void');
    expect(adventureAmbiencePreset(context('bonevault', { depth: true }))).toBe('cave-dark');
    expect(adventureAmbiencePreset(context('frostpeak'), true)).toBe('river-water');
    expect(adventureSurfaceMaterial(context('frostpeak'), true)).toBe('water');
  });
});

describe('Adventure audio events', () => {
  it('delivers combat and movement events only while subscribed', () => {
    const listener = vi.fn<(event: AdventureAudioEvent) => void>();
    const unsubscribe = subscribeAdventureAudio(listener);
    emitAdventureAudioEvent({ kind: 'step', sprinting: false });
    emitAdventureAudioEvent({ kind: 'enemy-hit', attackInput: 'kick', critical: true, finishing: false });
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    emitAdventureAudioEvent({ kind: 'player-hit', damage: 12 });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

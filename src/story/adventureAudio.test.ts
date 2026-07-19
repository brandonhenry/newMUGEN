import { describe, expect, it, vi } from 'vitest';
import {
  ADVENTURE_RESOURCE_SFX,
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
  it('ships distinct material profiles for every gatherable impact family', () => {
    expect(Object.keys(ADVENTURE_RESOURCE_SFX).sort()).toEqual(['bone', 'crystal', 'foliage', 'ice', 'metal', 'stone', 'volcanic', 'wood']);
    for (const profile of Object.values(ADVENTURE_RESOURCE_SFX)) {
      expect(profile.hit.length).toBeGreaterThan(0);
      expect(profile.broken.length).toBeGreaterThan(0);
      expect([...profile.hit, ...profile.broken].every((path) => path.startsWith('/story/audio/resource-impacts/') && path.endsWith('.ogg'))).toBe(true);
    }
    expect(ADVENTURE_RESOURCE_SFX.ice.playbackRate).toBeGreaterThan(ADVENTURE_RESOURCE_SFX.crystal.playbackRate);
    expect(ADVENTURE_RESOURCE_SFX.volcanic.playbackRate).toBeLessThan(ADVENTURE_RESOURCE_SFX.stone.playbackRate);
    expect(ADVENTURE_RESOURCE_SFX.metal.breakLayer).toContain('stone-break');
  });

  it('gives each biome an intentional walking surface', () => {
    expect(adventureSurfaceMaterial(context('world-route'))).toBe('grass');
    expect(adventureSurfaceMaterial(context('greenhollow'))).toBe('grass');
    expect(adventureSurfaceMaterial(context('greenhollow', { mapId: 'greenhollow:field-b' }))).toBe('grass');
    expect(adventureSurfaceMaterial(context('thornwood'))).toBe('grass');
    expect(adventureSurfaceMaterial(context('ironroot'))).toBe('stone');
    expect(adventureSurfaceMaterial(context('bonevault'))).toBe('stone');
    expect(adventureSurfaceMaterial(context('emberdeep'))).toBe('stone');
    expect(adventureSurfaceMaterial(context('frostpeak'))).toBe('snow');
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
    emitAdventureAudioEvent({ kind: 'step', sprinting: false, material: 'grass' });
    emitAdventureAudioEvent({ kind: 'attack', attackInput: 'jab' });
    emitAdventureAudioEvent({ kind: 'enemy-hit', attackInput: 'kick', critical: true, finishing: false });
    emitAdventureAudioEvent({ kind: 'resource-hit', attackInput: 'heavy', material: 'wood', broken: true, major: false, legendary: false, sequence: 4 });
    expect(listener).toHaveBeenCalledTimes(4);
    expect(listener).toHaveBeenNthCalledWith(2, { kind: 'attack', attackInput: 'jab' });

    unsubscribe();
    emitAdventureAudioEvent({ kind: 'player-hit', damage: 12 });
    expect(listener).toHaveBeenCalledTimes(4);
  });
});

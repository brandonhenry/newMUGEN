import { describe, expect, it } from 'vitest';
import manifest from './stimmermanAdventureManifest.json';
import { STIMMERMAN_ADVENTURE_CREDIT, STIMMERMAN_ADVENTURE_TRACKS, adventureMusicPool, deterministicAdventurePlaylist } from './adventureMusic';

describe('Stimmerman Adventure soundtrack', () => {
  it('ships the complete authorized, hashed, playable library', () => {
    expect(manifest.trackCount).toBe(117);
    expect(manifest.collectionCount).toBe(10);
    expect(STIMMERMAN_ADVENTURE_TRACKS).toHaveLength(117);
    expect(new Set(STIMMERMAN_ADVENTURE_TRACKS.map((track) => track.path)).size).toBe(117);
    expect(STIMMERMAN_ADVENTURE_TRACKS.every((track) => track.artist === 'Stimmerman' && track.path.startsWith('/story/audio/stimmerman/') && /^[a-f0-9]{64}$/.test(track.sha256) && track.phases.length > 0)).toBe(true);
    expect(STIMMERMAN_ADVENTURE_CREDIT).toContain('Used with permission');
  });

  it('includes named anchors and deterministic no-repeat daily ordering', () => {
    const context = { worldId: 'ironroot', mapId: 'ironroot-field-a', phase: 'explore', encounterIntensity: 0, depth: false } as const;
    const pool = adventureMusicPool(context);
    expect(pool.some((track) => track.title.includes('Under Ground Control'))).toBe(true);
    expect(pool.some((track) => track.title.includes('Chromium Crossing'))).toBe(true);
    const first = deterministicAdventurePlaylist(context, 'profile-1', '2026-07-18');
    const second = deterministicAdventurePlaylist(context, 'profile-1', '2026-07-18');
    expect(first.map((track) => track.id)).toEqual(second.map((track) => track.id));
    expect(new Set(first.map((track) => track.id)).size).toBe(first.length);
  });
});

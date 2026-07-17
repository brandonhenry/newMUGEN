import { describe, expect, it } from 'vitest';
import { FALLBACK_STORY_HUB, KORE_CENTRAL_HUB, sanitizeStoryHubDefinition } from './hubData';
import { STORY_MODE_WORLDS } from './modeWorlds';

describe('story hub data', () => {
  it('loads unique, in-bounds K.O.R.E. Central destinations', () => {
    expect(KORE_CENTRAL_HUB.portals).toHaveLength(11);
    expect(new Set(KORE_CENTRAL_HUB.portals.map((portal) => portal.id)).size).toBe(KORE_CENTRAL_HUB.portals.length);
    expect(new Set(KORE_CENTRAL_HUB.portals.map((portal) => portal.destination))).toEqual(new Set([
      'story', 'friends', 'online', 'arcade', 'versus', 'training', 'tournament', 'characters', 'avatarStudio', 'options', 'exit'
    ]));
    KORE_CENTRAL_HUB.portals.forEach((portal) => {
      expect(portal.position[0]).toBeGreaterThanOrEqual(KORE_CENTRAL_HUB.bounds.minX);
      expect(portal.position[0]).toBeLessThanOrEqual(KORE_CENTRAL_HUB.bounds.maxX);
    });
  });

  it('drops malformed and duplicate portals while retaining a safe spawn', () => {
    const sanitized = sanitizeStoryHubDefinition({
      id: 'test',
      name: 'Test',
      subtitle: '',
      spawn: [999, 2],
      bounds: { minX: -5, maxX: 5, floorY: 0 },
      platforms: [],
      portals: [
        { id: 'valid', label: 'Valid', subtitle: 'Good', destination: 'arcade', position: [0, 1], size: [2, 2], accent: '#fff' },
        { id: 'valid', label: 'Duplicate', subtitle: 'Bad', destination: 'online', position: [1, 1], size: [2, 2] },
        { id: 'outside', label: 'Outside', subtitle: 'Bad', destination: 'friends', position: [12, 1], size: [2, 2] }
      ]
    });
    expect(sanitized.spawn).toEqual(FALLBACK_STORY_HUB.spawn);
    expect(sanitized.platforms).toEqual(FALLBACK_STORY_HUB.platforms);
    expect(sanitized.portals.map((portal) => portal.id)).toEqual(['valid']);
  });

  it('provides a traversable data-driven world for every playable mode', () => {
    expect(Object.keys(STORY_MODE_WORLDS).sort()).toEqual(['arcade', 'central', 'online', 'tournament', 'training', 'versus']);
    for (const [worldId, world] of Object.entries(STORY_MODE_WORLDS)) {
      expect(world.platforms.length, `${worldId} platforms`).toBeGreaterThan(0);
      expect(new Set(world.portals.map(({ id }) => id)).size, `${worldId} unique portals`).toBe(world.portals.length);
      expect(world.spawn[0]).toBeGreaterThanOrEqual(world.bounds.minX);
      expect(world.spawn[0]).toBeLessThanOrEqual(world.bounds.maxX);
      if (worldId !== 'central') {
        expect(world.portals.some(({ destination, kind }) => destination === 'central' && kind === 'mode-door')).toBe(true);
        expect(world.portals.some(({ destination }) => destination === worldId || (worldId === 'versus' && destination === 'online'))).toBe(true);
      }
    }
    expect(STORY_MODE_WORLDS.arcade.portals.filter(({ kind }) => kind === 'arcade-machine')).toHaveLength(6);
    expect(STORY_MODE_WORLDS.versus.portals.filter(({ kind }) => kind === 'versus-machine')).toHaveLength(5);
    expect(STORY_MODE_WORLDS.versus.portals.filter(({ quickMatch }) => quickMatch)).toHaveLength(4);
  });
});

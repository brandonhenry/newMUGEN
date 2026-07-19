import { describe, expect, it } from 'vitest';
import { FALLBACK_STORY_HUB, KORE_CENTRAL_HUB, sanitizeStoryHubDefinition } from './hubData';
import { STORY_MODE_WORLDS } from './modeWorlds';

describe('story hub data', () => {
  it('loads unique, in-bounds K.O.R.E. Central destinations', () => {
    expect(KORE_CENTRAL_HUB.portals).toHaveLength(11);
    expect(KORE_CENTRAL_HUB.platforms).toHaveLength(1);
    expect(KORE_CENTRAL_HUB.platforms[0]).toMatchObject({ id: 'ground' });
    expect(KORE_CENTRAL_HUB.platforms[0].oneWay).toBeFalsy();
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
        expect(world.bounds.maxX - world.bounds.minX, `${worldId} width`).toBeGreaterThanOrEqual(96);
        expect(world.environment?.layers.length, `${worldId} environment layers`).toBeGreaterThanOrEqual(3);
        expect(world.environment?.layers.every((layer) => layer.asset?.startsWith('world:')), `${worldId} real art layers`).toBe(true);
        expect(world.environment?.layers.every((layer) => !layer.motif), `${worldId} placeholder motifs`).toBe(true);
        expect(world.environment?.surface?.asset.startsWith('world:'), `${worldId} authored traversal surface`).toBe(true);
        expect(world.props?.filter((prop) => prop.asset.startsWith('world:')).length, `${worldId} pack props`).toBeGreaterThanOrEqual(7);
        const propPoints = [world.bounds.minX, ...(world.props?.filter((prop) => prop.asset.startsWith('world:')).map(({ position }) => position[0]) ?? []).sort((a, b) => a - b), world.bounds.maxX];
        expect(Math.max(...propPoints.slice(1).map((point, index) => point - propPoints[index])), `${worldId} prop coverage`).toBeLessThanOrEqual(18);
        expect(world.landmarks?.length, `${worldId} landmarks`).toBeGreaterThanOrEqual(5);
        expect(world.portals.some(({ destination, kind }) => destination === 'central' && kind === 'mode-door')).toBe(true);
        expect(world.portals.filter(({ destination, kind }) => destination === 'central' && kind === 'mode-door')).toHaveLength(2);
        expect(world.portals.some(({ destination }) => destination === worldId || (worldId === 'versus' && destination === 'online'))).toBe(true);
      }
    }
    expect(STORY_MODE_WORLDS.arcade.portals.filter(({ kind }) => kind === 'arcade-machine')).toHaveLength(6);
    expect(STORY_MODE_WORLDS.versus.portals.filter(({ kind }) => kind === 'versus-machine')).toHaveLength(5);
    expect(STORY_MODE_WORLDS.versus.portals.filter(({ quickMatch }) => quickMatch)).toHaveLength(4);
    expect(new Set(['arcade', 'versus', 'online', 'training', 'tournament'].map((id) => STORY_MODE_WORLDS[id as keyof typeof STORY_MODE_WORLDS].theme))).toHaveLength(5);
    expect(new Set(['arcade', 'versus', 'online', 'training', 'tournament'].map((id) => STORY_MODE_WORLDS[id as keyof typeof STORY_MODE_WORLDS].environment?.layers.map((layer) => layer.asset).join('|')))).toHaveLength(5);
  });
});

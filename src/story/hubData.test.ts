import { describe, expect, it } from 'vitest';
import { FALLBACK_STORY_HUB, KORE_CENTRAL_HUB, sanitizeStoryHubDefinition } from './hubData';

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
});


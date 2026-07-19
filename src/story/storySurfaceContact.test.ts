import { describe, expect, it } from 'vitest';
import { STORY_ADVENTURE_WORLDS } from './adventureWorlds';
import { resolveStorySurfaceContact } from './storySurfaceContact';
import type { StoryHubDefinition, StoryTerrainTileDefinition } from './types';

function tile(id: string, x: number, material: StoryTerrainTileDefinition['surfaceMaterial']): StoryTerrainTileDefinition {
  return {
    id, position: [x, -1], size: [2, 2], column: x / 2, row: 0, neighborMask: 15,
    role: 'top', surfaceVariant: 0, rotation: 0, mirrored: false, surfaceMaterial: material
  };
}

function mixedHub(): StoryHubDefinition {
  return {
    id: 'mixed-material-test', name: 'Mixed', subtitle: 'Mixed materials', spawn: [0, 0.82], bounds: { minX: -1, maxX: 3, floorY: 0 },
    platforms: [
      { id: 'ground', position: [1, -1], size: [4, 2] },
      { id: 'wood-ledge', position: [1, 3], size: [3, 0.5], oneWay: true, surfaceMaterial: 'wood' }
    ],
    terrainTiles: [tile('grass-tile', 0, 'grass'), tile('ice-tile', 2, 'ice')],
    portals: []
  };
}

describe('exact story surface contact', () => {
  it('switches material at the boundary between adjacent PNG terrain cells', () => {
    const hub = mixedHub();
    expect(resolveStorySurfaceContact({ hub, x: 0.75, feetY: 0, groundedPlatformId: 'ground', fallbackMaterial: 'stone' })).toMatchObject({ material: 'grass', tileId: 'grass-tile', source: 'tile' });
    expect(resolveStorySurfaceContact({ hub, x: 1, feetY: 0, groundedPlatformId: 'ground', fallbackMaterial: 'stone' })).toMatchObject({ material: 'ice', tileId: 'ice-tile', source: 'tile' });
  });

  it('uses explicit one-way platform material and water overrides', () => {
    const hub = mixedHub();
    expect(resolveStorySurfaceContact({ hub, x: 1, feetY: 3.25, groundedPlatformId: 'wood-ledge', fallbackMaterial: 'stone' })).toMatchObject({ material: 'wood', source: 'platform' });
    expect(resolveStorySurfaceContact({ hub, x: 1, feetY: 3.25, groundedPlatformId: 'wood-ledge', fallbackMaterial: 'stone', underwater: true })).toMatchObject({ material: 'water', source: 'water' });
  });

  it('grounds Central Route movement in its grassy rendered surface', () => {
    const route = STORY_ADVENTURE_WORLDS['world-route'];
    expect(resolveStorySurfaceContact({ hub: route, x: route.spawn[0], feetY: route.bounds.floorY, groundedPlatformId: 'ground', fallbackMaterial: 'stone' })).toMatchObject({ material: 'grass', source: 'environment' });
  });
});

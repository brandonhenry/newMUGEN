import { describe, expect, it } from 'vitest';
import { compileStoryTerrainGrid, storyTerrainPerimeterIntact } from './terrainGrid';
import { resolveStoryTerrainMotion } from './storyTerrainCollision';
import type { StoryPlatformDefinition } from './types';

describe('enclosed story terrain', () => {
  it('carves air while retaining an unbroken four-sided perimeter', () => {
    const terrain = compileStoryTerrainGrid({ id: 'test-envelope', bounds: [0, 24, 0, 36], carveRects: [[2, 2, 20, 32]], cellSize: 2, perimeterCells: 1 });
    expect(storyTerrainPerimeterIntact(terrain)).toBe(true);
    expect(terrain.terrainTiles.some((tile) => tile.role === 'top')).toBe(true);
    expect(terrain.terrainTiles.some((tile) => tile.role === 'left-wall')).toBe(true);
    expect(terrain.terrainTiles.some((tile) => tile.role === 'right-wall')).toBe(true);
    expect(terrain.terrainTiles.some((tile) => tile.role === 'underside')).toBe(true);
    expect(terrain.platforms.length).toBeLessThan(terrain.terrainTiles.length);
    expect(terrain.terrainTiles.length + terrain.cavityTiles.length).toBe(terrain.columns * terrain.rows);
  });

  it('marks only authored air cells as controlled sky windows', () => {
    const terrain = compileStoryTerrainGrid({
      id: 'hybrid-shell', bounds: [0, 24, 0, 24], carveRects: [[2, 2, 20, 20]],
      skyWindowRects: [[8, 14, 8, 6]], cellSize: 2, perimeterCells: 1
    });
    expect(terrain.cavityTiles.some((tile) => tile.material === 'sky-window-edge')).toBe(true);
    expect(terrain.cavityTiles.some((tile) => tile.material === 'background-rock')).toBe(true);
  });

  it('reserves biome caps for surfaces with real avatar clearance', () => {
    const shallow = compileStoryTerrainGrid({ id: 'shallow-seam', bounds: [0, 12, 0, 12], carveRects: [[2, 2, 8, 2]], cellSize: 2, perimeterCells: 1 });
    const tall = compileStoryTerrainGrid({ id: 'walkable-cavity', bounds: [0, 12, 0, 12], carveRects: [[2, 2, 8, 6]], cellSize: 2, perimeterCells: 1 });
    expect(shallow.terrainTiles.some((tile) => tile.role === 'neutral-top')).toBe(true);
    expect(shallow.terrainTiles.some((tile) => tile.role === 'top')).toBe(false);
    expect(tall.terrainTiles.some((tile) => tile.role === 'top')).toBe(true);
  });

  it('is byte deterministic and changes its topology signature with authored cavities', () => {
    const input = { id: 'deterministic-envelope', bounds: [0, 24, 0, 24] as [number, number, number, number], carveRects: [[2, 2, 20, 8] as [number, number, number, number]], seed: 'same' };
    expect(compileStoryTerrainGrid(input)).toEqual(compileStoryTerrainGrid(input));
    expect(compileStoryTerrainGrid(input).topologySignature).not.toBe(compileStoryTerrainGrid({ ...input, carveRects: [[2, 2, 20, 16]] }).topologySignature);
  });

  it('uses the shared resolver for floors, walls, and ceilings', () => {
    const platforms: StoryPlatformDefinition[] = [
      { id: 'floor', position: [0, 0], size: [20, 2], collision: 'solid' as const },
      { id: 'wall', position: [3, 4], size: [2, 8], collision: 'solid' as const },
      { id: 'ceiling', position: [0, 8], size: [20, 2], collision: 'solid' as const }
    ];
    const wall = resolveStoryTerrainMotion({ previous: { x: 1, y: 3 }, proposed: { x: 3, y: 3 }, velocityY: 0, platforms, horizontalDirection: 1, dropThrough: false });
    expect(wall.x).toBeLessThan(2);
    const ceiling = resolveStoryTerrainMotion({ previous: { x: 0, y: 6 }, proposed: { x: 0, y: 8 }, velocityY: 5, platforms, horizontalDirection: 0, dropThrough: false });
    expect(ceiling.velocityY).toBe(0);
    expect(ceiling.y).toBeLessThan(7);
    const floor = resolveStoryTerrainMotion({ previous: { x: 0, y: 3 }, proposed: { x: 0, y: 1 }, velocityY: -5, platforms, horizontalDirection: 0, dropThrough: false });
    expect(floor.landing?.id).toBe('floor');
  });
});

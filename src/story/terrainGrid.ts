import type { StoryPlatformDefinition, StoryTerrainTileDefinition, StoryTerrainTileRole } from './types';

export type StoryTerrainRect = [number, number, number, number];

export type CompiledStoryTerrain = {
  platforms: StoryPlatformDefinition[];
  terrainTiles: StoryTerrainTileDefinition[];
  columns: number;
  rows: number;
  solid: boolean[];
  topologySignature: string;
};

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}

function roleFor(mask: number, diagonals: number): { role: StoryTerrainTileRole; rotation: 0 | 90 | 180 | 270; mirrored: boolean } {
  const north = Boolean(mask & 1);
  const east = Boolean(mask & 2);
  const south = Boolean(mask & 4);
  const west = Boolean(mask & 8);
  if (!north && !west) return { role: 'outer-top-left', rotation: 0, mirrored: false };
  if (!north && !east) return { role: 'outer-top-right', rotation: 0, mirrored: true };
  if (!south && !west) return { role: 'outer-bottom-left', rotation: 180, mirrored: true };
  if (!south && !east) return { role: 'outer-bottom-right', rotation: 180, mirrored: false };
  if (!north) return { role: 'top', rotation: 0, mirrored: false };
  if (!south) return { role: 'underside', rotation: 180, mirrored: false };
  if (!west) return { role: 'left-wall', rotation: 90, mirrored: false };
  if (!east) return { role: 'right-wall', rotation: 270, mirrored: false };
  if (!(diagonals & 1)) return { role: 'inner-top-right', rotation: 0, mirrored: false };
  if (!(diagonals & 2)) return { role: 'inner-top-left', rotation: 0, mirrored: true };
  if (!(diagonals & 4)) return { role: 'inner-bottom-right', rotation: 180, mirrored: true };
  if (!(diagonals & 8)) return { role: 'inner-bottom-left', rotation: 180, mirrored: false };
  return { role: 'fill', rotation: 0, mirrored: false };
}

export function compileStoryTerrainGrid(input: {
  id: string;
  bounds: [number, number, number, number];
  cellSize?: number;
  perimeterCells?: number;
  carveRects: StoryTerrainRect[];
  solidRects?: StoryTerrainRect[];
  seed?: string;
}): CompiledStoryTerrain {
  const [minX, maxX, minY, maxY] = input.bounds;
  const cellSize = input.cellSize ?? 2;
  const perimeter = input.perimeterCells ?? 1;
  const columns = Math.round((maxX - minX) / cellSize);
  const rows = Math.round((maxY - minY) / cellSize);
  if (columns <= perimeter * 2 || rows <= perimeter * 2) throw new Error(`Terrain envelope too small: ${input.id}`);
  if (Math.abs(columns * cellSize - (maxX - minX)) > 1e-7 || Math.abs(rows * cellSize - (maxY - minY)) > 1e-7) throw new Error(`Terrain bounds must align to ${cellSize}: ${input.id}`);
  const solid = Array.from({ length: columns * rows }, () => true);
  const index = (column: number, row: number) => row * columns + column;
  const overlaps = (column: number, row: number, rect: StoryTerrainRect) => {
    const x = minX + column * cellSize;
    const y = minY + row * cellSize;
    return x < rect[0] + rect[2] && x + cellSize > rect[0] && y < rect[1] + rect[3] && y + cellSize > rect[1];
  };
  for (let row = perimeter; row < rows - perimeter; row += 1) for (let column = perimeter; column < columns - perimeter; column += 1) {
    if (input.carveRects.some((rect) => overlaps(column, row, rect))) solid[index(column, row)] = false;
  }
  for (let row = perimeter; row < rows - perimeter; row += 1) for (let column = perimeter; column < columns - perimeter; column += 1) {
    if ((input.solidRects ?? []).some((rect) => overlaps(column, row, rect))) solid[index(column, row)] = true;
  }
  const at = (column: number, row: number) => column < 0 || row < 0 || column >= columns || row >= rows || solid[index(column, row)];
  const terrainTiles: StoryTerrainTileDefinition[] = [];
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    if (!solid[index(column, row)]) continue;
    const neighborMask = (at(column, row + 1) ? 1 : 0) | (at(column + 1, row) ? 2 : 0) | (at(column, row - 1) ? 4 : 0) | (at(column - 1, row) ? 8 : 0);
    const diagonals = (at(column + 1, row + 1) ? 1 : 0) | (at(column - 1, row + 1) ? 2 : 0) | (at(column + 1, row - 1) ? 4 : 0) | (at(column - 1, row - 1) ? 8 : 0);
    const visual = roleFor(neighborMask, diagonals);
    terrainTiles.push({
      id: `${input.id}-tile-${column}-${row}`,
      position: [minX + (column + 0.5) * cellSize, minY + (row + 0.5) * cellSize],
      size: [cellSize, cellSize], column, row, neighborMask, ...visual,
      surfaceVariant: hash(`${input.seed ?? input.id}:${column}:${row}:${visual.role}`) % 3
    });
  }

  // Merge identical horizontal solid runs vertically. Collision stays compact
  // while the visual layer retains the complete terrain-cell vocabulary.
  const open = new Map<string, { startRow: number; endRow: number; startColumn: number; width: number }>();
  const merged: Array<{ startRow: number; endRow: number; startColumn: number; width: number }> = [];
  for (let row = 0; row < rows; row += 1) {
    const runs: Array<{ startColumn: number; width: number }> = [];
    for (let column = 0; column < columns;) {
      if (!solid[index(column, row)]) { column += 1; continue; }
      const startColumn = column;
      while (column < columns && solid[index(column, row)]) column += 1;
      runs.push({ startColumn, width: column - startColumn });
    }
    const keys = new Set(runs.map((run) => `${run.startColumn}:${run.width}`));
    for (const [key, rect] of open) if (!keys.has(key)) { merged.push(rect); open.delete(key); }
    for (const run of runs) {
      const key = `${run.startColumn}:${run.width}`;
      const prior = open.get(key);
      if (prior) prior.endRow = row;
      else open.set(key, { startRow: row, endRow: row, ...run });
    }
  }
  merged.push(...open.values());
  const platforms = merged.map((rect, ordinal): StoryPlatformDefinition => {
    const width = rect.width * cellSize;
    const height = (rect.endRow - rect.startRow + 1) * cellSize;
    const bottom = minY + rect.startRow * cellSize;
    const left = minX + rect.startColumn * cellSize;
    const touchesBottom = rect.startRow === 0;
    const touchesTop = rect.endRow === rows - 1;
    const touchesSide = rect.startColumn === 0 || rect.startColumn + rect.width === columns;
    return {
      id: touchesBottom && rect.startColumn === 0 && rect.width === columns ? `${input.id}-ground` : `${input.id}-solid-${ordinal + 1}`,
      position: [left + width / 2, bottom + height / 2], size: [width, height], collision: 'solid',
      terrainRole: touchesBottom ? 'ground' : touchesTop ? 'ceiling' : touchesSide ? 'wall' : 'wall',
      surfaceVariant: hash(`${input.seed ?? input.id}:solid:${ordinal}`) % 3, visual: false
    };
  });
  const topologySignature = `${columns}x${rows}:${hash(solid.map((value) => value ? '1' : '0').join('')).toString(16).padStart(8, '0')}`;
  return { platforms, terrainTiles, columns, rows, solid, topologySignature };
}

export function storyTerrainPerimeterIntact(terrain: Pick<CompiledStoryTerrain, 'columns' | 'rows' | 'solid'>) {
  const at = (column: number, row: number) => terrain.solid[row * terrain.columns + column];
  for (let column = 0; column < terrain.columns; column += 1) if (!at(column, 0) || !at(column, terrain.rows - 1)) return false;
  for (let row = 0; row < terrain.rows; row += 1) if (!at(0, row) || !at(terrain.columns - 1, row)) return false;
  return true;
}

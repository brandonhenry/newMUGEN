import { STORY_GROUNDED_ACTOR_CENTER_Y } from './actorGrounding';
import { storyHazardHasVisibleDamageSprite, storyHazardIsClearOfEntry } from './adventureHazards';
import { storyAuthoredRoomTemplate } from './levelChunks';
import { compileStoryTerrainGrid } from './terrainGrid';
import { STORY_CHALLENGER_IDS, STORY_CHALLENGER_IDS_BY_BIOME, STORY_REGULAR_ENEMY_IDS_BY_BIOME, getStoryEnemyDefinition } from './enemyCatalog';
import type {
  StoryAdventureWorldId,
  StoryEnemyAffix,
  StoryEnemyId,
  StoryFloorEvent,
  StoryFloorEventKind,
  StoryGeneratedFloor,
  StoryGeneratedRoom,
  StoryRoomConnector,
  StoryRoomTemplateDefinition,
  StoryRoomTemplateKind,
  StoryRunBoonId,
  StoryRunRewardLedger
} from './types';

type BiomeId = Exclude<StoryAdventureWorldId, 'world-route'>;

export const STORY_ENDLESS_GENERATION_VERSION = 5 as const;
export const STORY_ENDLESS_LEGACY_GENERATION_VERSION = 3 as const;
export const STORY_ENDLESS_GRID_COLUMNS = 7 as const;
export const STORY_ENDLESS_GRID_ROWS = 3 as const;
export const STORY_ENDLESS_ROOM_WIDTH = 24;
export const STORY_ENDLESS_ROOM_HEIGHT = 12;
const STORY_ENDLESS_LEGACY_ROOM_WIDTH = 28;
export const STORY_ENDLESS_FLOORS_PER_CHAPTER = 4;
export const STORY_ENDLESS_PRESSURE_STEP_SECONDS = 30;
export const STORY_ENDLESS_MAX_HUNTERS = 2;

const BIOME_HAZARD = {
  greenhollow: 'drowning', thornwood: 'spikes', ironroot: 'collapsing-floor', bonevault: 'saw', emberdeep: 'lava',
  frostpeak: 'icicle', sunscar: 'sinking-sand', skyglass: 'wind'
} as const;

const BIOME_TRAVERSAL = {
  greenhollow: 'current', thornwood: 'rope', ironroot: 'lift', bonevault: 'falling-platform', emberdeep: 'updraft',
  frostpeak: 'slippery-surface', sunscar: 'breakable-wall', skyglass: 'moving-platform'
} as const;

const BIOME_ACCENT: Record<BiomeId, string> = {
  greenhollow: '#7ee787', thornwood: '#52e1a1', ironroot: '#d9a066', bonevault: '#b8a8ff',
  emberdeep: '#ff6b45', frostpeak: '#8ee8ff', sunscar: '#ffd166', skyglass: '#ff83d1'
};

const BOONS: StoryRunBoonId[] = ['fury', 'vitality', 'fleetstep', 'bulwark', 'focus', 'prospector'];
const AFFIXES: StoryEnemyAffix[] = ['armored', 'brutal', 'frenzied', 'regenerating'];
const EVENTS: StoryFloorEventKind[] = ['cursed-relic', 'stranded-explorer', 'depth-trader'];

export function storyEndlessHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function randomFromSeed(seed: string) {
  let state = storyEndlessHash(seed) || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function shuffled<T>(values: readonly T[], seed: string): T[] {
  const random = randomFromSeed(seed);
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function createAdventureRunSeed(worldId: BiomeId, runSerial: number, ownerId = 'solo') {
  return `kore-endless-v${STORY_ENDLESS_GENERATION_VERSION}:${worldId}:${ownerId}:${Math.max(1, Math.floor(runSerial))}`;
}

export function storyEndlessChapter(floorNumber: number) {
  return Math.max(1, Math.ceil(Math.max(1, Math.floor(floorNumber)) / STORY_ENDLESS_FLOORS_PER_CHAPTER));
}

export function storyEndlessChapterFloor(floorNumber: number): 1 | 2 | 3 | 4 {
  return (((Math.max(1, Math.floor(floorNumber)) - 1) % STORY_ENDLESS_FLOORS_PER_CHAPTER) + 1) as 1 | 2 | 3 | 4;
}

export function storyEndlessEnemyScaling(floorNumber: number) {
  const offset = Math.max(0, Math.floor(floorNumber) - 1);
  return {
    health: 1 + 0.10 * offset + 0.01 * Math.pow(offset, 1.25),
    damage: 1 + 0.035 * offset + 0.003 * Math.pow(offset, 1.20),
    speed: Math.min(1.25, 1 + offset * 0.004),
    attackCooldown: Math.max(0.65, 1 - offset * 0.004)
  };
}

export function storyEndlessRewardScale(floorNumber: number) {
  return Math.min(3, 1 + 0.05 * (storyEndlessChapter(floorNumber) - 1));
}

export function storyEndlessPressure(elapsedSeconds: number, parTimeSeconds: number) {
  const rank = elapsedSeconds < parTimeSeconds ? 0 : 1 + Math.floor((elapsedSeconds - parTimeSeconds) / STORY_ENDLESS_PRESSURE_STEP_SECONDS);
  return {
    elapsedSeconds: Math.max(0, elapsedSeconds),
    parTimeSeconds,
    rank,
    hunterCount: Math.min(STORY_ENDLESS_MAX_HUNTERS, rank),
    hazardScale: Math.min(2, 1 + rank * 0.1),
    telegraphScale: Math.max(0.5, 1 - rank * 0.05)
  };
}

export function emptyStoryRunLedger(): StoryRunRewardLedger {
  return { xp: 0, defeats: 0, routeCoins: 0, materials: {}, consumables: {}, challengerIds: [], cacheIds: [] };
}

export function storyBoonChoices(seed: string, floorNumber: number, boons: Partial<Record<StoryRunBoonId, number>>, reroll = 0) {
  const capped = (id: StoryRunBoonId) => id === 'fleetstep' ? (boons[id] ?? 0) >= 9 : id === 'bulwark' ? (boons[id] ?? 0) >= 8 : id === 'focus' ? (boons[id] ?? 0) >= 10 : false;
  const available = BOONS.filter((id) => !capped(id));
  return shuffled(available, `${seed}:boons:${floorNumber}:${reroll}`).slice(0, 3);
}

export function storyEncounterCombinationAllowed(input: {
  eventKind?: StoryFloorEventKind | null;
  hazardKind?: string | null;
  traversalKind?: string | null;
  roomWidth: number;
  rangedEnemies: number;
  flyingEnemies: number;
  enemyCount: number;
  hasAirPockets?: boolean;
}) {
  if (input.eventKind === 'stranded-explorer' && input.hazardKind === 'lava') return false;
  if (input.hazardKind === 'drowning' && !input.hasAirPockets) return false;
  if (input.rangedEnemies >= 3 && input.roomWidth < 24) return false;
  if (input.flyingEnemies >= 3 && input.roomWidth < 22) return false;
  // Wind plus moving platforms is explicitly approved when the room remains wide.
  if (input.hazardKind === 'wind' && input.traversalKind === 'moving-platform') return input.roomWidth >= 24;
  return input.enemyCount <= 5;
}

function template(id: string, kind: StoryRoomTemplateKind, connectors: StoryRoomConnector[], variant: number): StoryRoomTemplateDefinition {
  const high = variant % 3;
  return {
    id: `${id}-${variant + 1}`,
    kind,
    connectors,
    platformSockets: [
      [-8 + high, 3.1 + high * 0.35, 7 + (variant % 2) * 2],
      [1, 5.1 + (variant % 2) * 1.1, 8],
      [9 - high, 3.7 + ((variant + 1) % 3) * 0.45, 6 + (variant % 2) * 2]
    ],
    structureSockets: [[-10.5, 1.25, 3, 2.5], [9.5, 1.5, 3, 3]],
    carveSockets: [[-10, 2, 20, 8]],
    enemySockets: [[-8, STORY_GROUNDED_ACTOR_CENTER_Y], [-2.5, STORY_GROUNDED_ACTOR_CENTER_Y], [3, STORY_GROUNDED_ACTOR_CENTER_Y], [8, STORY_GROUNDED_ACTOR_CENTER_Y]],
    hazardSockets: [[-1.5, 0], [7.5, 0]],
    rewardSockets: [[9, 1.05], [-9, 5.8]],
    propSockets: [[-10, 1.05], [-7, 1.05], [7, 1.05], [10, 1.05]],
    protectedCorridor: [-13, 13, 0, 2.2],
    mutationBounds: { platformHeight: 0.35, platformWidth: [0.88, 1.12], hazardOffset: 1.2, propOffset: 1 }
  };
}

function connectorKey(connectors: StoryRoomConnector[]) {
  return [...connectors].sort().join('-');
}

function templateKindFor(connectors: StoryRoomConnector[], entrance: boolean, exit: boolean, optional: boolean, boss: boolean): StoryRoomTemplateKind {
  if (boss) return 'boss';
  if (entrance) return 'entrance';
  if (exit) return 'exit';
  if (optional && connectors.length === 1) return 'branch';
  if (connectors.includes('up') && connectors.includes('down')) return 'vertical';
  if (connectors.length >= 3) return 'junction';
  if (connectors.includes('up')) return 'rise';
  if (connectors.includes('down')) return 'drop';
  return optional ? 'secret' : 'straight';
}

function roomTemplate(connectors: StoryRoomConnector[], kind: StoryRoomTemplateKind, worldId: BiomeId, floorNumber: number, ordinal: number) {
  const bagOffset = storyEndlessHash(`${worldId}:${connectorKey(connectors)}:${floorNumber}`) % 4;
  return storyAuthoredRoomTemplate(kind, connectors, ordinal + bagOffset);
}

type Cell = { column: number; row: number; critical: boolean; optional: boolean };

function cellId(worldId: BiomeId, floorNumber: number, cell: Pick<Cell, 'column' | 'row'>) {
  return `${worldId}-floor-${floorNumber}-room-${cell.column}-${cell.row}`;
}

function entranceTierFor(seed: string, floorNumber: number): 0 | 1 | 2 {
  const group = Math.floor((floorNumber - 1) / 3);
  const bag = shuffled([0, 1, 2] as const, `${seed}:entrance-tier-bag:${group}`);
  return bag[(floorNumber - 1) % 3];
}

function makePath(random: () => number, boss: boolean, columns: number, generationVersion: 3 | 4 | 5, seed: string, floorNumber: number): Cell[] {
  if (generationVersion < 5) {
    if (boss) return Array.from({ length: columns }, (_, column) => ({ column, row: 0, critical: true, optional: false }));
    return Array.from({ length: columns }, (_, column) => ({ column, row: 0, critical: true, optional: false }));
  }
  let row: 0 | 1 | 2 = entranceTierFor(seed, floorNumber);
  const result: Cell[] = [{ column: 0, row, critical: true, optional: false }];
  let priorDirection = random() < 0.5 ? -1 : 1;
  for (let column = 1; column < columns; column += 1) {
    let direction = column <= 2 ? priorDirection : random() < 0.62 ? priorDirection : -priorDirection;
    if (row + direction < 0 || row + direction > 2) direction *= -1;
    // Relief columns may hold altitude, but every normal route changes tier at
    // least twice in its opening three beats.
    if (!boss && column > 2 && random() < 0.28) direction = 0;
    row = Math.max(0, Math.min(2, row + direction)) as 0 | 1 | 2;
    if (direction !== 0) priorDirection = direction;
    result.push({ column, row, critical: true, optional: false });
  }
  return result;
}

function addOptionalCells(path: Cell[], count: number, random: () => number) {
  const cells = [...path];
  const occupied = new Set(cells.map((cell) => `${cell.column}:${cell.row}`));
  const candidates = path.flatMap((cell) => [-1, 1].map((delta) => ({ column: cell.column, row: cell.row + delta, critical: false, optional: true })))
    .filter((cell) => cell.row >= 0 && cell.row < STORY_ENDLESS_GRID_ROWS && !occupied.has(`${cell.column}:${cell.row}`));
  for (const candidate of shuffled(candidates, String(random())).slice(0, count)) {
    const key = `${candidate.column}:${candidate.row}`;
    if (!occupied.has(key)) { occupied.add(key); cells.push(candidate); }
  }
  return cells;
}

function connectorsFor(cell: Cell, cells: Cell[], generationVersion: 3 | 4 | 5): StoryRoomConnector[] {
  const result: StoryRoomConnector[] = [];
  const has = (column: number, row: number) => cells.some((candidate) => candidate.column === column && candidate.row === row);
  const horizontal = (column: number) => generationVersion === 5
    ? cell.critical && cells.some((candidate) => candidate.column === column && candidate.critical)
    : has(column, cell.row);
  if (horizontal(cell.column - 1)) result.push('west');
  if (horizontal(cell.column + 1)) result.push('east');
  if (has(cell.column, cell.row + 1)) result.push('up');
  if (has(cell.column, cell.row - 1)) result.push('down');
  return result;
}

function chooseEvent(seed: string, floorNumber: number, chapterFloor: 1 | 2 | 3 | 4, optionalRooms: StoryGeneratedRoom[]): StoryFloorEvent | null {
  if (chapterFloor === 4 || optionalRooms.length === 0) return null;
  const chance = chapterFloor === 1 ? 0.45 : chapterFloor === 2 ? 0.60 : 0.85;
  const random = randomFromSeed(`${seed}:event:${floorNumber}`);
  if (random() > chance) return null;
  const eventBag = shuffled(EVENTS, `${seed}:event-kind-bag`);
  const kind = eventBag[(floorNumber - 1) % eventBag.length];
  const room = optionalRooms[Math.floor(random() * optionalRooms.length)];
  const scale = storyEndlessRewardScale(floorNumber);
  return {
    id: `${room.id}-event-${kind}`,
    kind,
    roomId: room.id,
    position: [(room.bounds[0] + room.bounds[1]) / 2, room.bounds[2] + 1.05],
    rewardCoins: Math.round(50 * scale),
    ...(kind === 'depth-trader' ? { traderCosts: { heal: Math.ceil(25 * scale), consumable: Math.ceil(40 * scale), reroll: Math.ceil(60 * scale) } } : {})
  };
}

function affixesFor(seed: string, floorNumber: number, boss: boolean, elite: boolean) {
  const chapter = storyEndlessChapter(floorNumber);
  const count = boss ? chapter >= 12 ? 3 : chapter >= 6 ? 2 : 1 : elite ? Math.min(2, chapter >= 6 ? 2 : 1) : 0;
  return shuffled(AFFIXES, `${seed}:affixes:${floorNumber}:${boss ? 'boss' : 'elite'}`).slice(0, count);
}

function bossFor(worldId: BiomeId, seed: string, chapter: number): StoryEnemyId {
  const local = STORY_CHALLENGER_IDS_BY_BIOME[worldId];
  const pool = local.length >= 3 ? local : Array.from(new Set([...local, ...STORY_CHALLENGER_IDS]));
  const order = shuffled(pool, `${seed}:${worldId}:boss-order`);
  return order[(chapter - 1) % order.length];
}

function generateCandidate(worldId: BiomeId, seed: string, floorNumber: number, attempt: number, generationVersion: 3 | 4 | 5 = STORY_ENDLESS_GENERATION_VERSION): StoryGeneratedFloor {
  const safeFloor = Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number.isFinite(floorNumber) ? floorNumber : 1)));
  const chapter = storyEndlessChapter(safeFloor);
  const chapterFloor = storyEndlessChapterFloor(safeFloor);
  const boss = chapterFloor === 4;
  const random = randomFromSeed(`${worldId}:${seed}:${safeFloor}:attempt:${attempt}:v${generationVersion}`);
  const intentRoll = generationVersion >= 4 && !boss ? random() : 1;
  const intent: StoryGeneratedFloor['intent'] = boss
    ? 'boss'
    : generationVersion === 3
      ? 'combat'
      : intentRoll < (chapterFloor === 1 ? 0.32 : 0.22)
        ? 'harvest'
        : intentRoll < (chapterFloor === 1 ? 0.60 : 0.44)
          ? 'exploration'
          : 'combat';
  const columnCount = generationVersion === 3 ? 4 : boss ? 5 : 5 + Math.floor(random() * 3);
  const roomWidth = generationVersion === 5 ? STORY_ENDLESS_ROOM_WIDTH : STORY_ENDLESS_LEGACY_ROOM_WIDTH;
  const roomHeight = generationVersion === 5 ? STORY_ENDLESS_ROOM_HEIGHT : 4.8;
  const path = makePath(random, boss, columnCount, generationVersion, seed, safeFloor);
  const optionalCount = boss ? 0 : generationVersion === 3 ? Math.min(4, 2 + (chapterFloor === 3 ? 1 + Math.floor(random() * 2) : Math.floor(random() * 2))) : 2 + Math.floor(random() * 2);
  const cells = addOptionalCells(path, optionalCount, random);
  const entranceCell = path[0];
  const exitCell = path[path.length - 1];
  const minX = -roomWidth * columnCount / 2;
  const maxX = -minX;
  const templateOrdinals = new Map<string, number>();
  const rooms: StoryGeneratedRoom[] = cells.map((cell) => {
    const connectors = connectorsFor(cell, cells, generationVersion);
    const entrance = cell.column === entranceCell.column && cell.row === entranceCell.row;
    const exit = cell.column === exitCell.column && cell.row === exitCell.row;
    const kind = templateKindFor(connectors, entrance, exit, cell.optional, boss && cell.column === Math.floor(columnCount / 2));
    const key = `${kind}:${connectorKey(connectors)}`;
    const ordinal = templateOrdinals.get(key) ?? 0;
    templateOrdinals.set(key, ordinal + 1);
    const selected = roomTemplate(connectors, kind, worldId, safeFloor, ordinal);
    const roomMinX = minX + cell.column * roomWidth;
    return {
      id: cellId(worldId, safeFloor, cell), column: cell.column, row: cell.row,
      bounds: [roomMinX, roomMinX + roomWidth, cell.row * roomHeight, cell.row * roomHeight + (generationVersion === 5 ? roomHeight : 7.5)],
      templateId: selected.id, templateKind: kind, connectors, critical: cell.critical, optional: cell.optional,
      hidden: cell.optional && random() < 0.34,
      mutation: {
        platformHeightJitter: (random() - 0.5) * 0.7,
        platformWidthScale: 0.88 + random() * 0.24,
        hazardOffset: (random() - 0.5) * 2.4,
        propOffset: (random() - 0.5) * 2
      },
      protectedCorridor: selected.protectedCorridor,
      platformSockets: selected.platformSockets,
      structureSockets: selected.structureSockets,
      carveSockets: selected.carveSockets,
      enemyLanes: selected.enemySockets,
      hazardSockets: selected.hazardSockets,
      rewardAlcoves: selected.rewardSockets,
      propSockets: selected.propSockets
    };
  });
  const criticalRooms = rooms.filter((room) => room.critical);
  const optionalRooms = rooms.filter((room) => room.optional);
  const combatRooms = intent === 'boss'
    ? criticalRooms.filter((room) => room.column === Math.floor(columnCount / 2))
    : intent === 'combat'
      ? criticalRooms.filter((room) => room.column > 0 && room.column < columnCount - 1)
      : [];
  if (intent === 'combat') {
    combatRooms.slice(0, chapterFloor === 1 ? 1 : 2).forEach((room, ordinal) => {
      const selected = roomTemplate(room.connectors, 'arena', worldId, safeFloor, ordinal);
      room.templateKind = 'arena';
      room.templateId = selected.id;
      room.protectedCorridor = selected.protectedCorridor;
      room.platformSockets = selected.platformSockets;
      room.structureSockets = selected.structureSockets;
      room.carveSockets = selected.carveSockets;
      room.enemyLanes = selected.enemySockets;
      room.hazardSockets = selected.hazardSockets;
      room.rewardAlcoves = selected.rewardSockets;
      room.propSockets = selected.propSockets;
    });
  }
  const event = chooseEvent(seed, safeFloor, chapterFloor, optionalRooms.filter((room) => room.column > 0));
  if (event && generationVersion === 5) event.position[1] += 2;
  if (event) {
    const eventRoom = optionalRooms.find((room) => room.id === event.roomId);
    if (eventRoom) {
      const selected = roomTemplate(eventRoom.connectors, 'event', worldId, safeFloor, 0);
      eventRoom.templateKind = 'event';
      eventRoom.templateId = selected.id;
      eventRoom.protectedCorridor = selected.protectedCorridor;
      eventRoom.platformSockets = selected.platformSockets;
      eventRoom.structureSockets = selected.structureSockets;
      eventRoom.carveSockets = selected.carveSockets;
      eventRoom.enemyLanes = selected.enemySockets;
      eventRoom.hazardSockets = selected.hazardSockets;
      eventRoom.rewardAlcoves = selected.rewardSockets;
      eventRoom.propSockets = selected.propSockets;
    }
  }
  const roomOneWays = rooms.flatMap((room, roomIndex) => {
    const localSeed = `${room.templateId}:${safeFloor}:${roomIndex}`;
    const centerX = (room.bounds[0] + room.bounds[1]) / 2;
    return room.platformSockets.map(([x, y, width], index) => ({
      id: `${room.id}-platform-${index + 1}`,
      position: [centerX + x, room.bounds[2] + y + room.mutation.platformHeightJitter + (storyEndlessHash(`${localSeed}:${index}`) % 3) * 0.12] as [number, number],
      size: [width * room.mutation.platformWidthScale, 0.42] as [number, number], oneWay: true,
      collision: 'one-way' as const, terrainRole: 'ledge' as const, surfaceVariant: storyEndlessHash(`${localSeed}:ledge:${index}`) % 3
    }));
  });
  const seamLandings = generationVersion === 5 ? path.slice(0, -1).flatMap((cell, index) => {
    const next = path[index + 1];
    if (cell.row === next.row) return [];
    const boundaryX = minX + (cell.column + 1) * roomWidth;
    const lowerY = Math.min(cell.row, next.row) * roomHeight;
    return [4.5, 7.5].map((offset, landingIndex) => ({
      id: `${worldId}-floor-${safeFloor}-seam-${index + 1}-${landingIndex + 1}`,
      position: [boundaryX + (landingIndex ? 0.25 : -0.25), lowerY + offset] as [number, number],
      size: [3.5, 0.42] as [number, number], oneWay: true, collision: 'one-way' as const, terrainRole: 'ledge' as const,
      surfaceVariant: storyEndlessHash(`${seed}:seam:${index}:${landingIndex}`) % 3
    }));
  }) : [];
  const enclosedTerrain = generationVersion === 5 ? compileStoryTerrainGrid({
    id: `${worldId}-floor-${safeFloor}`, bounds: [minX, maxX, 0, STORY_ENDLESS_ROOM_HEIGHT * STORY_ENDLESS_GRID_ROWS], cellSize: 2, perimeterCells: 1, seed: `${seed}:${safeFloor}`,
    carveRects: [
      ...rooms.flatMap((room) => {
        const centerX = (room.bounds[0] + room.bounds[1]) / 2;
        return room.carveSockets.map(([x, y, width, height]) => [centerX + x, room.bounds[2] + y, width, height] as [number, number, number, number]);
      }),
      ...path.slice(0, -1).flatMap((cell, index) => {
        const next = path[index + 1];
        if (cell.row === next.row) return [];
        const boundaryX = minX + (cell.column + 1) * roomWidth;
        const lowerY = Math.min(cell.row, next.row) * roomHeight + 4;
        return [[boundaryX - 2, lowerY, 4, Math.abs(next.row - cell.row) * roomHeight + 4] as [number, number, number, number]];
      })
    ],
    solidRects: rooms.flatMap((room) => {
      const centerX = (room.bounds[0] + room.bounds[1]) / 2;
      return room.structureSockets.map(([x, y, width, height]) => [centerX + x - width / 2, room.bounds[2] + y - height / 2, width, height] as [number, number, number, number]);
    })
  }) : null;
  const platforms = enclosedTerrain
    ? [...enclosedTerrain.platforms, ...roomOneWays, ...seamLandings]
    : [
      {
        id: `${worldId}-floor-${safeFloor}-ground`, position: [0, -0.5] as [number, number], size: [maxX - minX + 2, 1] as [number, number],
        collision: 'solid' as const, terrainRole: 'ground' as const, surfaceVariant: storyEndlessHash(`${seed}:${safeFloor}:ground`) % 3
      },
      ...rooms.flatMap((room, roomIndex) => {
        const localSeed = `${room.templateId}:${safeFloor}:${roomIndex}`;
        const centerX = (room.bounds[0] + room.bounds[1]) / 2;
        return [
          ...room.structureSockets.map(([x, y, width, height], index) => ({
            id: `${room.id}-structure-${index + 1}`, position: [centerX + x, room.bounds[2] + y] as [number, number], size: [width, height] as [number, number],
            collision: 'solid' as const, terrainRole: 'wall' as const, surfaceVariant: storyEndlessHash(`${localSeed}:structure:${index}`) % 3
          })),
          ...roomOneWays.filter((platform) => platform.id.startsWith(room.id))
        ];
      })
    ];
  const traversalRooms = rooms.filter((room) => room.critical && room.column > 0).slice(0, chapterFloor === 1 ? 1 : 2);
  const eventRoom = event ? rooms.find((room) => room.id === event.roomId) : undefined;
  const hazardRoomPool = rooms
    // Reserve the full vertical column around an event. Tall biome hazards such
    // as wind can otherwise cross the seam into an apparently safe event beat.
    .filter((room) => !eventRoom || room.column !== eventRoom.column)
    .filter((room) => room.column > 0 && room.column < columnCount - 1);
  const hazardCount = boss || intent === 'harvest' || chapterFloor === 1
    ? 0
    : intent === 'exploration'
      ? 1
      : chapterFloor === 2 ? 2 : 3;
  const hazards = shuffled(hazardRoomPool, `${seed}:hazards:${safeFloor}`).slice(0, hazardCount).map((room, index) => {
    const sockets = traversalRooms.some((candidate) => candidate.id === room.id) ? room.hazardSockets.filter(([x]) => Math.abs(x) >= 5) : room.hazardSockets;
    const socket = sockets[index % Math.max(1, sockets.length)] ?? [index % 2 ? 7 : -7, 0];
    const x = (room.bounds[0] + room.bounds[1]) / 2 + socket[0] + room.mutation.hazardOffset;
    const kind = BIOME_HAZARD[worldId];
    return {
      id: `${room.id}-hazard-${index + 1}`, kind,
      bounds: [x - 2.1, x + 2.1, room.bounds[2] + (generationVersion === 5 ? 2 : 0), room.bounds[2] + (generationVersion === 5 ? 2 : 0) + (kind === 'wind' ? 8 : 1.2)] as [number, number, number, number],
      damage: ['wind', 'sinking-sand', 'drowning'].includes(kind) ? 0 : 12 + Math.min(18, chapter * 2),
      knockback: 4.5 + Math.min(4, chapter * 0.25), telegraphMs: 700, accent: BIOME_ACCENT[worldId]
    };
  });
  const traversal = traversalRooms.map((room, index) => ({
    id: `${room.id}-traversal`, kind: BIOME_TRAVERSAL[worldId],
    position: [(room.bounds[0] + room.bounds[1]) / 2, room.bounds[2] + 3.5 + index * 1.4] as [number, number], size: [5, 6] as [number, number],
    route: 'critical' as const, speed: ['moving-platform', 'lift'].includes(BIOME_TRAVERSAL[worldId]) ? 1.5 : undefined
  }));
  const scaling = storyEndlessEnemyScaling(safeFloor);
  const encounters = combatRooms.slice(0, chapterFloor === 1 ? 1 : 2).map((room, index) => ({
    id: `${room.id}-encounter`, range: [room.bounds[0] + 5, room.bounds[1] - 5] as [number, number], maxActive: boss ? 1 : Math.min(3, chapterFloor + 1), elite: boss || chapterFloor === 3 && index === 1
  }));
  const regulars = STORY_REGULAR_ENEMY_IDS_BY_BIOME[worldId];
  const bossEnemyId = boss ? bossFor(worldId, seed, chapter) : undefined;
  const enemySpawns = encounters.flatMap((encounter, encounterIndex) => {
    if (boss && bossEnemyId) {
      const definition = getStoryEnemyDefinition(bossEnemyId);
      const room = combatRooms[encounterIndex];
      return [{
        id: `${worldId}-floor-${safeFloor}-boss`, enemyId: bossEnemyId,
        position: [(encounter.range[0] + encounter.range[1]) / 2, (room?.bounds[2] ?? 0) + (generationVersion === 5 ? 2 : 0) + (definition.archetype === 'flying' ? 3.5 : STORY_GROUNDED_ACTOR_CENTER_Y)] as [number, number],
        patrolRadius: 5, accent: '#ffe071', encounterZoneId: encounter.id, encounterIndex: 4, leash: encounter.range,
        affixes: affixesFor(seed, safeFloor, true, true), healthScale: scaling.health, damageScale: scaling.damage,
        speedScale: scaling.speed, attackCooldownScale: scaling.attackCooldown, boss: true
      }];
    }
    const count = Math.min(encounter.maxActive, chapterFloor === 1 ? 2 : 3);
    const room = combatRooms[encounterIndex];
    return Array.from({ length: count }, (_, index) => {
      const enemyId = regulars[storyEndlessHash(`${seed}:${safeFloor}:${encounterIndex}:${index}`) % regulars.length];
      const definition = getStoryEnemyDefinition(enemyId);
      const elite = Boolean(encounter.elite && index === count - 1);
      const lane = room?.enemyLanes[index % Math.max(1, room.enemyLanes.length)] ?? [encounter.range[0] + (encounter.range[1] - encounter.range[0]) * ((index + 1) / (count + 1)), STORY_GROUNDED_ACTOR_CENTER_Y];
      const roomCenter = room ? (room.bounds[0] + room.bounds[1]) / 2 : 0;
      return {
        id: `${worldId}-floor-${safeFloor}-enemy-${encounterIndex + 1}-${index + 1}`, enemyId,
        position: [room ? roomCenter + lane[0] : lane[0], definition.archetype === 'flying' ? (room?.bounds[2] ?? 0) + (generationVersion === 5 ? 5.4 : 3.4) : (room?.bounds[2] ?? 0) + (generationVersion === 5 ? 2 : 0) + lane[1]] as [number, number],
        patrolRadius: 2.5, accent: BIOME_ACCENT[worldId], encounterZoneId: encounter.id, encounterIndex: Math.min(4, chapterFloor + encounterIndex), leash: encounter.range,
        affixes: affixesFor(`${seed}:${encounterIndex}:${index}`, safeFloor, false, elite), healthScale: scaling.health * (elite ? 1.35 : 1),
        damageScale: scaling.damage * (elite ? 1.18 : 1), speedScale: scaling.speed, attackCooldownScale: scaling.attackCooldown
      };
    });
  });
  const parTimeSeconds = 120 + criticalRooms.length * 20 + optionalRooms.length * 10;
  const floor: StoryGeneratedFloor = {
    version: generationVersion, worldId, seed, floorNumber: safeFloor, chapter, chapterFloor, boss, intent,
    usedFallback: false, validationFailures: [], grid: { columns: columnCount, rows: STORY_ENDLESS_GRID_ROWS },
    bounds: generationVersion === 5
      ? { minX, maxX, minY: 0, maxY: STORY_ENDLESS_ROOM_HEIGHT * STORY_ENDLESS_GRID_ROWS, floorY: 2 }
      : { minX, maxX, floorY: 0 },
    spawn: [minX + 4.5, (generationVersion === 5 ? entranceCell.row * STORY_ENDLESS_ROOM_HEIGHT + 2 : 0) + STORY_GROUNDED_ACTOR_CENTER_Y],
    exit: [maxX - 4.5, (generationVersion === 5 ? exitCell.row * STORY_ENDLESS_ROOM_HEIGHT + 2 : 0) + STORY_GROUNDED_ACTOR_CENTER_Y],
    ...(generationVersion === 5 ? { entranceTier: entranceCell.row as 0 | 1 | 2, exitTier: exitCell.row as 0 | 1 | 2 } : {}),
    entranceRoomId: cellId(worldId, safeFloor, entranceCell), exitRoomId: cellId(worldId, safeFloor, exitCell),
    criticalRoomIds: criticalRooms.map((room) => room.id), rooms, platforms,
    ...(enclosedTerrain ? { terrainTiles: enclosedTerrain.terrainTiles } : {}),
    hazards, traversal, encounters, enemySpawns, event, parTimeSeconds,
    levelMeta: {
      blueprintId: `${worldId}-endless-floor`, blueprintVersion: generationVersion === 5 ? 2 : 1, generationVersion, seed: `${seed}:${safeFloor}`,
      chunkIds: rooms.map((room) => room.templateId),
      witnessRoute: [...criticalRooms].sort((left, right) => left.column - right.column || left.row - right.row).map((room) => [(room.bounds[0] + room.bounds[1]) / 2, room.bounds[2] + (generationVersion === 5 ? 2 : 0) + STORY_GROUNDED_ACTOR_CENTER_Y]),
      assetResolution: [],
      ...(enclosedTerrain ? { topologySignature: enclosedTerrain.topologySignature, entranceTier: entranceCell.row as 0 | 1 | 2, exitTier: exitCell.row as 0 | 1 | 2 } : {})
    },
    ...(bossEnemyId ? { bossEnemyId } : {})
  };
  floor.validationFailures = adventureFloorValidationErrors(floor);
  return floor;
}

export function adventureFloorValidationErrors(floor: StoryGeneratedFloor): string[] {
  const failures: string[] = [];
  const roomIds = new Set(floor.rooms.map((room) => room.id));
  const critical = floor.criticalRoomIds.map((id) => floor.rooms.find((room) => room.id === id)).filter(Boolean) as StoryGeneratedRoom[];
  if (![3, 4, 5].includes(floor.version)) failures.push('generation-version');
  if (critical.length < (floor.version === 5 ? 5 : 4) || critical.length > 7) failures.push('critical-room-count');
  if (!roomIds.has(floor.entranceRoomId) || !roomIds.has(floor.exitRoomId)) failures.push('entrance-exit');
  const optionalMinimum = floor.boss ? 0 : 2;
  const optionalMaximum = floor.version === 5 ? 3 : 4;
  if (floor.rooms.filter((room) => room.optional).length < optionalMinimum || floor.rooms.filter((room) => room.optional).length > optionalMaximum) failures.push('optional-room-count');
  if (floor.rooms.some((room) => room.column < 0 || room.column >= floor.grid.columns || room.row < 0 || room.row >= floor.grid.rows)) failures.push('grid-bounds');
  if (roomIds.size !== floor.rooms.length) failures.push('duplicate-room-id');
  if (new Set(floor.rooms.map((room) => `${room.column}:${room.row}`)).size !== floor.rooms.length) failures.push('duplicate-grid-cell');
  const neighborFor = (room: StoryGeneratedRoom, connector: StoryRoomConnector) => {
    if (floor.version === 5 && (connector === 'west' || connector === 'east')) {
      const column = room.column + (connector === 'west' ? -1 : 1);
      return floor.rooms.find((candidate) => candidate.column === column && candidate.critical);
    }
    const target = connector === 'west' ? [room.column - 1, room.row] : connector === 'east' ? [room.column + 1, room.row] : connector === 'up' ? [room.column, room.row + 1] : [room.column, room.row - 1];
    return floor.rooms.find((candidate) => candidate.column === target[0] && candidate.row === target[1]);
  };
  if (floor.rooms.some((room) => room.connectors.some((connector) => !neighborFor(room, connector)))) failures.push('dangling-connector');
  const reciprocal = (connector: StoryRoomConnector): StoryRoomConnector => connector === 'west' ? 'east' : connector === 'east' ? 'west' : connector === 'up' ? 'down' : 'up';
  if (floor.rooms.some((room) => room.connectors.some((connector) => !neighborFor(room, connector)?.connectors.includes(reciprocal(connector))))) failures.push('nonreciprocal-connector');
  const reachable = new Set<string>();
  const queue = [floor.entranceRoomId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    const room = floor.rooms.find((candidate) => candidate.id === id);
    if (!room) continue;
    for (const connector of room.connectors) {
      const neighbor = neighborFor(room, connector);
      if (neighbor && !reachable.has(neighbor.id)) queue.push(neighbor.id);
    }
  }
  if (!reachable.has(floor.exitRoomId) || floor.rooms.some((room) => !reachable.has(room.id))) failures.push('navigation-disconnected');
  if (critical.some((room) => !reachable.has(room.id))) failures.push('critical-route-disconnected');
  if (floor.version === 5) {
    const ordered = [...critical].sort((left, right) => left.column - right.column);
    const tierChanges = ordered.slice(1).filter((room, index) => room.row !== ordered[index].row).length;
    if (tierChanges < 2) failures.push('critical-route-too-flat');
    if (floor.entranceTier !== ordered[0]?.row || floor.exitTier !== ordered[ordered.length - 1]?.row) failures.push('tier-provenance');
    if (!floor.terrainTiles?.length || floor.bounds.minY !== 0 || floor.bounds.maxY !== STORY_ENDLESS_ROOM_HEIGHT * STORY_ENDLESS_GRID_ROWS) failures.push('terrain-envelope');
    const columns = Math.round((floor.bounds.maxX - floor.bounds.minX) / 2);
    const rows = Math.round(((floor.bounds.maxY ?? 0) - (floor.bounds.minY ?? 0)) / 2);
    const tileKeys = new Set((floor.terrainTiles ?? []).map((tile) => `${tile.column}:${tile.row}`));
    if (Array.from({ length: columns }, (_, column) => column).some((column) => !tileKeys.has(`${column}:0`) || !tileKeys.has(`${column}:${rows - 1}`))) failures.push('terrain-perimeter-horizontal');
    if (Array.from({ length: rows }, (_, row) => row).some((row) => !tileKeys.has(`0:${row}`) || !tileKeys.has(`${columns - 1}:${row}`))) failures.push('terrain-perimeter-vertical');
    if (!floor.levelMeta?.topologySignature) failures.push('topology-signature');
  }
  if (floor.rooms.some((room) => Math.abs(room.mutation.platformHeightJitter) > 0.36 || room.mutation.platformWidthScale < 0.88 || room.mutation.platformWidthScale > 1.12 || Math.abs(room.mutation.hazardOffset) > 1.21 || Math.abs(room.mutation.propOffset) > 1.01)) failures.push('mutation-bounds');
  const safePoints: Array<[number, number]> = [floor.spawn, floor.exit, ...(floor.event ? [floor.event.position] : [])];
  if (floor.hazards.some((hazard) => !storyHazardHasVisibleDamageSprite(hazard))) failures.push('hazard-visible-sprite');
  if (floor.hazards.some((hazard) => safePoints.some(([x, y]) => y >= hazard.bounds[2] - 1.5 && y <= hazard.bounds[3] + 1.5 && !storyHazardIsClearOfEntry(hazard, x, 0.45)))) failures.push('hazard-safe-zone');
  if (floor.hazards.some((hazard) => floor.traversal.some((piece) => piece.position[0] >= hazard.bounds[0] - 2 && piece.position[0] <= hazard.bounds[1] + 2))) failures.push('hazard-required-landing');
  if (floor.encounters.some((encounter) => encounter.maxActive > 5 || encounter.range[1] <= encounter.range[0])) failures.push('encounter-budget');
  if (floor.encounters.some((encounter) => {
    const enemies = floor.enemySpawns.filter((enemy) => enemy.encounterZoneId === encounter.id);
    const room = floor.rooms.find((candidate) => encounter.range[0] >= candidate.bounds[0] && encounter.range[1] <= candidate.bounds[1]);
    const hazard = floor.hazards.find((candidate) => candidate.bounds[0] < encounter.range[1] && candidate.bounds[1] > encounter.range[0]);
    const traversal = floor.traversal.find((candidate) => candidate.position[0] >= encounter.range[0] && candidate.position[0] <= encounter.range[1]);
    return !storyEncounterCombinationAllowed({
      eventKind: floor.event && room?.id === floor.event.roomId ? floor.event.kind : null,
      hazardKind: hazard?.kind,
      traversalKind: traversal?.kind,
      roomWidth: room ? room.bounds[1] - room.bounds[0] : encounter.range[1] - encounter.range[0],
      rangedEnemies: enemies.filter((enemy) => getStoryEnemyDefinition(enemy.enemyId).archetype === 'ranged').length,
      flyingEnemies: enemies.filter((enemy) => getStoryEnemyDefinition(enemy.enemyId).archetype === 'flying').length,
      enemyCount: enemies.length,
      hasAirPockets: hazard?.kind === 'drowning'
    });
  })) failures.push('encounter-compatibility');
  if (floor.enemySpawns.some((enemy) => enemy.position[0] < floor.bounds.minX + 10 || enemy.position[0] > floor.bounds.maxX - 8)) failures.push('enemy-safe-distance');
  if ((floor.intent === 'harvest' || floor.intent === 'exploration') && (floor.encounters.length > 0 || floor.enemySpawns.length > 0)) failures.push('noncombat-intent-enemies');
  if (floor.intent === 'harvest' && floor.hazards.length > 0) failures.push('harvest-intent-hazards');
  if ((floor.intent === 'boss') !== floor.boss) failures.push('floor-intent-cadence');
  if (floor.boss !== (floor.chapterFloor === 4) || (floor.boss && (!floor.bossEnemyId || floor.event))) failures.push('boss-cadence');
  if (floor.event && !floor.rooms.some((room) => room.id === floor.event?.roomId && room.optional)) failures.push('event-placement');
  if (!Number.isFinite(floor.parTimeSeconds) || floor.parTimeSeconds < 180) failures.push('pressure-time');
  return Array.from(new Set(failures));
}

export function generateAdventureFallbackFloor(worldId: BiomeId, seed: string, floorNumber: number, failures: string[] = ['forced-fallback'], generationVersion: 3 | 4 | 5 = STORY_ENDLESS_GENERATION_VERSION): StoryGeneratedFloor {
  if (generationVersion === 5) {
    const enclosed = generateCandidate(worldId, `${worldId}:authored-safe-fallback`, floorNumber, 0, 5);
    return { ...enclosed, seed, usedFallback: true, validationFailures: failures };
  }
  const floor = generateCandidate(worldId, `${seed}:fallback`, floorNumber, 99, generationVersion);
  const safeColumnCount = generationVersion === 4 ? 5 : 4;
  const minX = -STORY_ENDLESS_LEGACY_ROOM_WIDTH * safeColumnCount / 2;
  const maxX = -minX;
  const safeRooms = Array.from({ length: safeColumnCount }, (_, column): StoryGeneratedRoom => ({
    id: `${worldId}-floor-${floor.floorNumber}-safe-${column}`, column, row: 0,
    bounds: [minX + column * STORY_ENDLESS_LEGACY_ROOM_WIDTH, minX + (column + 1) * STORY_ENDLESS_LEGACY_ROOM_WIDTH, 0, 8],
    templateId: column === 0 ? 'safe-entrance' : column === safeColumnCount - 1 ? 'safe-exit' : floor.boss && column === Math.floor(safeColumnCount / 2) ? 'safe-boss' : 'safe-straight',
    templateKind: column === 0 ? 'entrance' : column === safeColumnCount - 1 ? 'exit' : floor.boss && column === Math.floor(safeColumnCount / 2) ? 'boss' : 'straight',
    connectors: [...(column > 0 ? ['west' as const] : []), ...(column < safeColumnCount - 1 ? ['east' as const] : [])],
    critical: true, optional: false, hidden: false,
    mutation: { platformHeightJitter: 0, platformWidthScale: 1, hazardOffset: 0, propOffset: 0 },
    protectedCorridor: [-13, 13, 0, 2.2], platformSockets: [], structureSockets: [], carveSockets: [], enemyLanes: [[-5, STORY_GROUNDED_ACTOR_CENTER_Y], [5, STORY_GROUNDED_ACTOR_CENTER_Y]], hazardSockets: [], rewardAlcoves: [[9, 1.05]], propSockets: [[-10, 1.05], [-7, 1.05], [7, 1.05], [10, 1.05]]
  }));
  if (!floor.boss) {
    for (const column of [1, 2]) {
      safeRooms.push({
        id: `${worldId}-floor-${floor.floorNumber}-safe-branch-${column}`, column, row: 1,
        bounds: [minX + column * STORY_ENDLESS_LEGACY_ROOM_WIDTH, minX + (column + 1) * STORY_ENDLESS_LEGACY_ROOM_WIDTH, 4.8, 12.8],
        templateId: 'safe-branch-cap', templateKind: 'branch', connectors: ['down'], critical: false, optional: true, hidden: false,
        mutation: { platformHeightJitter: 0, platformWidthScale: 1, hazardOffset: 0, propOffset: 0 },
        protectedCorridor: [-13, 13, 0, 2.2], platformSockets: [], structureSockets: [], carveSockets: [], enemyLanes: [[-5, STORY_GROUNDED_ACTOR_CENTER_Y]], hazardSockets: [], rewardAlcoves: [[9, 1.05]], propSockets: [[-10, 1.05], [-7, 1.05], [7, 1.05], [10, 1.05]]
      });
      const parent = safeRooms.find((room) => room.column === column && room.row === 0)!;
      parent.connectors = Array.from(new Set([...parent.connectors, 'up']));
    }
  }
  const bossRoom = floor.boss ? safeRooms.find((room) => room.templateKind === 'boss') : undefined;
  const bossEncounter = bossRoom ? [{ id: `${bossRoom.id}-encounter`, range: [bossRoom.bounds[0] + 5, bossRoom.bounds[1] - 5] as [number, number], maxActive: 1, elite: true }] : [];
  const existingBoss = floor.enemySpawns.find((enemy) => enemy.boss);
  const bossSpawns = bossRoom && existingBoss ? [{ ...existingBoss, id: `${bossRoom.id}-boss`, position: [(bossRoom.bounds[0] + bossRoom.bounds[1]) / 2, existingBoss.position[1]] as [number, number], encounterZoneId: bossEncounter[0].id, leash: bossEncounter[0].range }] : [];
  return {
    ...floor, seed, intent: floor.boss ? 'boss' : 'exploration', usedFallback: true, validationFailures: failures, rooms: safeRooms,
    grid: { columns: safeColumnCount, rows: STORY_ENDLESS_GRID_ROWS }, bounds: { minX, maxX, floorY: 0 },
    spawn: [minX + 4.5, STORY_GROUNDED_ACTOR_CENTER_Y], exit: [maxX - 4.5, STORY_GROUNDED_ACTOR_CENTER_Y],
    entranceRoomId: safeRooms[0].id, exitRoomId: safeRooms[safeColumnCount - 1].id,
    criticalRoomIds: safeRooms.filter((room) => room.critical).map((room) => room.id), hazards: [], event: null,
    platforms: [{ id: `${worldId}-floor-${floor.floorNumber}-safe-ground`, position: [0, -0.5], size: [maxX - minX + 2, 1], collision: 'solid', terrainRole: 'ground', surfaceVariant: 0 }, ...safeRooms.flatMap((room) => room.row !== 0 || room.column === 0 || room.column === safeColumnCount - 1 ? [] : [{ id: `${room.id}-platform`, position: [(room.bounds[0] + room.bounds[1]) / 2, 3.5] as [number, number], size: [9, 0.42] as [number, number], oneWay: true, collision: 'one-way' as const, terrainRole: 'ledge' as const, surfaceVariant: room.column % 3 }])],
    traversal: [], encounters: bossEncounter, enemySpawns: bossSpawns, parTimeSeconds: 200,
    levelMeta: { ...floor.levelMeta!, chunkIds: safeRooms.map((room) => room.templateId), witnessRoute: safeRooms.filter((room) => room.critical).map((room) => [(room.bounds[0] + room.bounds[1]) / 2, STORY_GROUNDED_ACTOR_CENTER_Y]) }
  };
}

export function generateAdventureFloor(worldId: BiomeId, seed: string, floorNumber: number, generationVersion: 3 | 4 | 5 = STORY_ENDLESS_GENERATION_VERSION): StoryGeneratedFloor {
  const failures: string[] = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const floor = generateCandidate(worldId, seed, floorNumber, attempt, generationVersion);
    if (floor.validationFailures.length === 0) return floor;
    failures.push(...floor.validationFailures.map((failure) => `${attempt}:${failure}`));
  }
  return generateAdventureFallbackFloor(worldId, seed, floorNumber, Array.from(new Set(failures)), generationVersion);
}

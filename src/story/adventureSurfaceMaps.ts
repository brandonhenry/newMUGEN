import { STORY_GROUNDED_ACTOR_CENTER_Y } from './actorGrounding';
import { getStoryEnemyDefinition, STORY_REGULAR_ENEMY_IDS_BY_BIOME } from './enemyCatalog';
import { storyNpcsForMap } from './adventureNpcs';
import { STORY_WORLD_MOUNT } from './adventureExploration';
import { storyHazardDealsContactDamage } from './adventureHazards';
import { compileStoryLevelBlueprint } from './levelCompiler';
import { getStorySurfaceLevelBlueprint } from './levelBlueprints';
import type { StoryLevelBlueprintV2 } from './levelTypes';
import { createSurfaceResourceNodes } from './adventureResources';
import type {
  StoryAdventureMapDefinition,
  StoryAdventureMapRole,
  StoryAdventureWorldId,
  StoryEnemyId,
  StoryHazardDefinition,
  StoryHubDefinition,
  StoryInteractableDefinition,
  StoryPortalDefinition,
  StoryTraversalPieceDefinition,
  StoryWorldLandmarkDefinition,
  StoryWorldThemeId
} from './types';

type BiomeId = Exclude<StoryAdventureWorldId, 'world-route'>;

type MapSpec = { name: string; subtitle: string; hero: string };
type BiomeSpec = {
  theme: StoryWorldThemeId;
  accent: string;
  regulars: readonly StoryEnemyId[];
  hazard: StoryHazardDefinition['kind'];
  traversal: StoryTraversalPieceDefinition['kind'];
  maps: Record<StoryAdventureMapRole, MapSpec>;
};

const BIOMES: Record<BiomeId, BiomeSpec> = {
  greenhollow: { theme: 'village', accent: '#7ee787', regulars: STORY_REGULAR_ENEMY_IDS_BY_BIOME.greenhollow, hazard: 'drowning', traversal: 'current', maps: {
    arrival: { name: 'Windmill Commons', subtitle: 'A generous first step beneath turning sails', hero: 'Great Windmill' },
    'field-a': { name: 'Rooftop Market', subtitle: 'Awnings and chimneys form a second street', hero: 'Copper Market Roofs' },
    'field-b': { name: 'Floodplain Waterworks', subtitle: 'Valves redirect the village current', hero: 'Old Water Wheel' },
    mastery: { name: 'Old Forest Gate', subtitle: 'The village road narrows beneath ancient timber', hero: 'Greenhollow Gate' }
  } },
  thornwood: { theme: 'forest', accent: '#52e1a1', regulars: STORY_REGULAR_ENEMY_IDS_BY_BIOME.thornwood, hazard: 'spikes', traversal: 'rope', maps: {
    arrival: { name: 'Bramble Camp', subtitle: 'Lanterns hold back the first wall of thorns', hero: 'Rootkeeper Camp' },
    'field-a': { name: 'Giantroot Crossing', subtitle: 'An elder root bridges the forest floor', hero: 'Sleeping Giantroot' },
    'field-b': { name: 'Whisper Canopy', subtitle: 'Branch paths trade height for safety', hero: 'Whisper Crown' },
    mastery: { name: 'Heartwood Hollow', subtitle: 'The oldest tree protects a quiet chamber', hero: 'Heartwood Arch' }
  } },
  ironroot: { theme: 'mine', accent: '#d9a066', regulars: STORY_REGULAR_ENEMY_IDS_BY_BIOME.ironroot, hazard: 'collapsing-floor', traversal: 'lift', maps: {
    arrival: { name: 'Miner Refuge', subtitle: 'Timber braces and lamp glow mark safe ground', hero: 'Refuge Hoist' },
    'field-a': { name: 'Cart Junction', subtitle: 'Three rail lines cross above the old shaft', hero: 'Triple Rail Switch' },
    'field-b': { name: 'Flooded Shaft', subtitle: 'The lower rail disappears beneath mineral water', hero: 'Drowned Lift' },
    mastery: { name: 'Sunstone Vault', subtitle: 'Amber ore turns the deepest chamber gold', hero: 'Sunstone Heart' }
  } },
  bonevault: { theme: 'crypt', accent: '#b8a8ff', regulars: STORY_REGULAR_ENEMY_IDS_BY_BIOME.bonevault, hazard: 'saw', traversal: 'falling-platform', maps: {
    arrival: { name: 'Keeper Vestibule', subtitle: 'Offerings and violet lamps soften the sealed threshold', hero: 'Keeper Doors' },
    'field-a': { name: 'Crew Ossuary', subtitle: 'Empty alcoves watch a narrow procession', hero: 'Ossuary Gallery' },
    'field-b': { name: 'Bell Nave', subtitle: 'Every moving floor answers a distant bell', hero: 'Bonevault Bell' },
    mastery: { name: 'Violet Tombs', subtitle: 'Cold flame outlines the last unmarked chamber', hero: 'Violet Sepulcher' }
  } },
  emberdeep: { theme: 'underworld', accent: '#ff6b45', regulars: STORY_REGULAR_ENEMY_IDS_BY_BIOME.emberdeep, hazard: 'lava', traversal: 'updraft', maps: {
    arrival: { name: 'Ashen Camp', subtitle: 'Basalt tents occupy the caldera rim', hero: 'Ash Beacon' },
    'field-a': { name: 'Lavafall Bridge', subtitle: 'Obsidian islands wait between fire pulses', hero: 'Twin Lavafalls' },
    'field-b': { name: 'Relic Forge', subtitle: 'Vent pressure wakes the ancient machinery', hero: 'Relic Anvil' },
    mastery: { name: 'Red Caldera', subtitle: 'The deep world breathes through a broken crown', hero: 'Caldera Crown' }
  } },
  frostpeak: { theme: 'snow', accent: '#8ee8ff', regulars: STORY_REGULAR_ENEMY_IDS_BY_BIOME.frostpeak, hazard: 'icicle', traversal: 'slippery-surface', maps: {
    arrival: { name: 'Last Shelter', subtitle: 'A stove and blue flags promise one final rest', hero: 'Last Hearth' },
    'field-a': { name: 'Blue Ice Cave', subtitle: 'Frozen walls preserve a sheltered ascent', hero: 'Blue Ice Window' },
    'field-b': { name: 'Windspine', subtitle: 'Open ridges turn every gust into a route', hero: 'Windspine Flags' },
    mastery: { name: 'Frozen Watch', subtitle: 'A silent tower stands above the weather', hero: 'Frozen Watchtower' }
  } },
  sunscar: { theme: 'desert', accent: '#ffd166', regulars: STORY_REGULAR_ENEMY_IDS_BY_BIOME.sunscar, hazard: 'sinking-sand', traversal: 'breakable-wall', maps: {
    arrival: { name: 'Caravan Camp', subtitle: 'Canvas shade and stone markers hold the road', hero: 'Sunscar Caravan' },
    'field-a': { name: 'Wandering Dunes', subtitle: 'The safe line moves with each bank of sand', hero: 'Walking Dune' },
    'field-b': { name: 'Glasswater Oasis', subtitle: 'Clear water reveals architecture below', hero: 'Glasswater Palms' },
    mastery: { name: 'Sunken Temple', subtitle: 'Only the highest arch still meets daylight', hero: 'Buried Sun Arch' }
  } },
  skyglass: { theme: 'ruins', accent: '#ff83d1', regulars: STORY_REGULAR_ENEMY_IDS_BY_BIOME.skyglass, hazard: 'wind', traversal: 'moving-platform', maps: {
    arrival: { name: 'Cloud Landing', subtitle: 'Low stones hover beneath a calm updraft', hero: 'Cloud Mooring' },
    'field-a': { name: 'Crystal Bridge', subtitle: 'Chimes stabilize a fractured span', hero: 'Prismatic Bridge' },
    'field-b': { name: 'Broken Tower', subtitle: 'Orbiting floors circle an empty core', hero: 'Orbit Tower' },
    mastery: { name: 'Glass Sanctum', subtitle: 'A quiet chamber floats above the storm', hero: 'Glass Crown' }
  } }
};

const ROLE_ORDER: StoryAdventureMapRole[] = ['arrival', 'field-a', 'field-b', 'mastery'];
function landmark(id: string, label: string, subtitle: string, x: number, y: number, color: string, kind: StoryWorldLandmarkDefinition['kind'] = 'district'): StoryWorldLandmarkDefinition {
  return { id, label, subtitle, position: [x, y, -1.2], size: [15, 8], color, kind };
}

function mapId(biome: BiomeId, role: StoryAdventureMapRole) {
  return `${biome}-${role}`;
}

function transitionPortal(biome: BiomeId, targetRole: StoryAdventureMapRole, side: 'west' | 'east', label: string, position: [number, number]) {
  return {
    id: `surface-map:${mapId(biome, targetRole)}`,
    label,
    subtitle: side === 'east' ? 'Continue deeper' : 'Return toward the arrival road',
    destination: biome,
    position,
    size: [2.6, 3.2] as [number, number],
    accent: BIOMES[biome].accent,
    kind: 'adventure-gate' as const,
    surfaceMapTarget: mapId(biome, targetRole),
    surfaceEntry: side === 'west' ? 'east' as const : 'west' as const
  };
}

function surfaceRouteRooms(blueprint: StoryLevelBlueprintV2) {
  return blueprint.geometry
    .filter((piece) => piece.kind === 'carve' && piece.id.includes('-room-') && !piece.id.includes('optional'))
    .sort((left, right) => left.rect[0] - right.rect[0]);
}

function surfaceFloorAtX(blueprint: StoryLevelBlueprintV2, x: number) {
  const rooms = surfaceRouteRooms(blueprint);
  const room = rooms.reduce((closest, candidate) => Math.abs(candidate.rect[0] + candidate.rect[2] / 2 - x) < Math.abs(closest.rect[0] + closest.rect[2] / 2 - x) ? candidate : closest, rooms[0]);
  return room?.rect[1] ?? 2;
}

function surfaceConnectorPosition(blueprint: StoryLevelBlueprintV2, edge: 'west' | 'east'): [number, number] {
  const point = blueprint.connectors.find((connector) => connector.edge === edge)?.point;
  return point ? [point[0], point[1] - 1 + STORY_GROUNDED_ACTOR_CENTER_Y] : [edge === 'west' ? -56 : 56, 2 + STORY_GROUNDED_ACTOR_CENTER_Y];
}

function interactables(biome: BiomeId, role: StoryAdventureMapRole): StoryInteractableDefinition[] {
  const order = ROLE_ORDER.indexOf(role);
  const entries: StoryInteractableDefinition[] = [];
  if (role !== 'arrival') {
    const reward = role === 'field-a' ? 40 : role === 'field-b' ? 60 : 100;
    entries.push({ id: `${biome}-cache-${order}`, kind: 'chest', label: `${BIOMES[biome].maps[role].name} Cache`, subtitle: 'One-time exploration cache', position: [role === 'field-a' ? 36 : role === 'field-b' ? -10 : 43, role === 'mastery' ? 11.4 : 1.05], rewardCoins: reward, oneTime: true });
    entries.push({ id: `${biome}-relic-${order}`, kind: 'relic', label: `${BIOMES[biome].maps[role].name} Relic`, subtitle: 'Biome relic', position: [role === 'field-a' ? 13 : role === 'field-b' ? 25 : 1, role === 'field-a' ? 8.75 : role === 'field-b' ? 9.2 : 11.75], relicId: `${biome}-relic-${order}`, oneTime: true });
  }
  if (role === 'arrival') entries.push({ id: `${biome}-waystone-arrival`, kind: 'waystone', label: 'Arrival Waystone', subtitle: 'Discover stable travel', position: [-34, 1.05] });
  if (role === 'mastery') entries.push({ id: `${biome}-shortcut`, kind: 'restoration', label: 'Restore Arrival Shortcut', subtitle: 'Spend 100 Route Coins', position: [49, 1.05], cost: 100, oneTime: true });
  return entries;
}

function hazardsFor(biome: BiomeId, role: StoryAdventureMapRole): StoryHazardDefinition[] {
  if (role === 'arrival') return [];
  const spec = BIOMES[biome];
  // Keep both directional entry spawns and every doorway surrounded by a wide,
  // readable safe corridor. These lanes also stay outside enemy patrol ranges.
  const positions = role === 'field-a' ? [-7, 7] : role === 'field-b' ? [-8, 0, 8] : [-38, -7, 7, 38];
  return positions.map((x, index) => ({
    id: `${biome}-${role}-hazard-${index + 1}`,
    kind: spec.hazard,
    bounds: [x - 2.2, x + 2.2, 0, spec.hazard === 'wind' ? 8 : 1.15],
    damage: storyHazardDealsContactDamage(spec.hazard) ? role === 'mastery' ? 18 : 12 : 0,
    knockback: role === 'mastery' ? 6.5 : 4.5,
    telegraphMs: spec.hazard === 'icicle' || spec.hazard === 'collapsing-floor' ? 700 : 350,
    accent: spec.accent
  }));
}

function traversalFor(biome: BiomeId, role: StoryAdventureMapRole): StoryTraversalPieceDefinition[] {
  if (role === 'arrival') return [];
  const count = role === 'mastery' ? 3 : 2;
  return Array.from({ length: count }, (_, index) => ({
    id: `${biome}-${role}-traversal-${index + 1}`,
    kind: BIOMES[biome].traversal,
    position: [-24 + index * 25, 3 + index * 2],
    size: [role === 'mastery' ? 5 : 4, 6],
    route: index === count - 1 && role === 'mastery' ? 'optional' : 'critical',
    speed: BIOMES[biome].traversal === 'moving-platform' || BIOMES[biome].traversal === 'lift' ? 1.5 : undefined
  }));
}

function enemiesFor(biome: BiomeId, role: StoryAdventureMapRole) {
  if (role === 'arrival') return [];
  const spec = BIOMES[biome];
  const positions = role === 'mastery' ? [-18, 18] : [-34, -21, 17, 31];
  return positions.map((x, index) => {
    const enemyId = spec.regulars[index % spec.regulars.length];
    const flying = getStoryEnemyDefinition(enemyId).archetype === 'flying';
    const zone = index < positions.length / 2 ? 0 : 1;
    return {
      id: `${biome}-${role}-enemy-${index + 1}`,
      enemyId,
      position: [x, flying ? 3.4 : STORY_GROUNDED_ACTOR_CENTER_Y] as [number, number],
      patrolRadius: 2.5,
      accent: spec.accent,
      encounterZoneId: `${biome}-${role}-encounter-${zone + 1}`,
      encounterIndex: role === 'mastery' ? 4 : ROLE_ORDER.indexOf(role) * 2 + zone
    };
  });
}

function createMap(biome: BiomeId, role: StoryAdventureMapRole): StoryAdventureMapDefinition {
  const spec = BIOMES[biome];
  const details = spec.maps[role];
  const order = ROLE_ORDER.indexOf(role);
  const id = mapId(biome, role);
  const blueprint = getStorySurfaceLevelBlueprint(biome, role);
  const compiled = compileStoryLevelBlueprint(blueprint, id, 1);
  const westEntry = surfaceConnectorPosition(blueprint, 'west');
  const eastEntry = surfaceConnectorPosition(blueprint, 'east');
  const groundedY = (x: number) => surfaceFloorAtX(blueprint, x) + STORY_GROUNDED_ACTOR_CENTER_Y;
  const terrainFloorAtX = (x: number) => {
    const intendedFloor = surfaceFloorAtX(blueprint, x);
    const supportTops = compiled.platforms
      .filter((platform) => platform.collision === 'solid' && x >= platform.position[0] - platform.size[0] / 2 && x <= platform.position[0] + platform.size[0] / 2)
      .map((platform) => platform.position[1] + platform.size[1] / 2)
      .filter((top) => top <= intendedFloor + 0.1);
    return supportTops.length > 0 ? Math.max(...supportTops) : intendedFloor;
  };
  const routeRooms = surfaceRouteRooms(blueprint);
  const slots = (kind: StoryLevelBlueprintV2['slots'][number]['kind']) => blueprint.slots.filter((slot) => slot.kind === kind);
  const anchorX = (x: number) => {
    const room = routeRooms.reduce((closest, candidate) => Math.abs(candidate.rect[0] + candidate.rect[2] / 2 - x) < Math.abs(closest.rect[0] + closest.rect[2] / 2 - x) ? candidate : closest, routeRooms[0]);
    return room ? room.rect[0] + room.rect[2] / 2 : x;
  };
  const portals: StoryPortalDefinition[] = [];
  if (role === 'arrival') portals.push({ id: `${biome}-return-route`, label: 'Central Route', subtitle: 'Return to the crossroads', destination: 'world-route' as const, position: westEntry, size: [2.6, 3.2] as [number, number], accent: '#ffe071', kind: 'adventure-gate' as const });
  if (order > 0) portals.push(transitionPortal(biome, ROLE_ORDER[order - 1], 'west', BIOMES[biome].maps[ROLE_ORDER[order - 1]].name, westEntry));
  if (order < ROLE_ORDER.length - 1) portals.push(transitionPortal(biome, ROLE_ORDER[order + 1], 'east', BIOMES[biome].maps[ROLE_ORDER[order + 1]].name, eastEntry));
  if (role === 'mastery') {
    portals.push({ id: `mount-sanctuary:${STORY_WORLD_MOUNT[biome]}`, label: `${STORY_WORLD_MOUNT[biome].replace(/-/g, ' ')} Sanctuary`, subtitle: 'Complete the route and earn its traversal bond', destination: biome, position: [-24, groundedY(-24)], size: [2.4, 2.8], accent: spec.accent, kind: 'shrine' });
    portals.push({ id: `endless-entry:${biome}`, label: 'Endless Descent', subtitle: 'Clear both mastery encounters to begin an endless run', destination: biome, position: [24, groundedY(24)], size: [2.8, 3.4], accent: '#b8a8ff', kind: 'adventure-gate' });
  }
  const mapInteractables = interactables(biome, role).map((entry) => ({ ...entry, position: [entry.position[0], groundedY(entry.position[0])] as [number, number] }));
  const npcSlots = slots('npc');
  const npcs = storyNpcsForMap(id).map((entry, index) => {
    const position = npcSlots[index]?.position ?? [anchorX(entry.position[0]), groundedY(anchorX(entry.position[0]))];
    return { ...entry, position, safeAnchor: position, ...(entry.patrolRange ? { patrolRange: [position[0] - 3, position[0] + 3] as [number, number] } : {}) };
  });
  for (const entry of mapInteractables) portals.push({ id: `${entry.kind}:${entry.id}`, label: entry.label, subtitle: entry.subtitle, destination: biome, position: entry.position, size: [1.8, 2.2], accent: entry.kind === 'relic' ? '#ffe071' : spec.accent, kind: entry.kind === 'waystone' ? 'checkpoint' : entry.kind === 'restoration' ? 'restoration' : entry.kind as 'chest' | 'relic' });
  for (const entry of npcs) portals.push({ id: `npc:${entry.id}`, label: entry.displayName, subtitle: entry.bark, destination: biome, position: entry.position, size: [1.4, 2], accent: spec.accent, kind: 'npc' });
  const encounters = role === 'arrival' ? [] : [
    { id: `${biome}-${role}-encounter-1`, range: [-42, -13] as [number, number], maxActive: 2 },
    { id: `${biome}-${role}-encounter-2`, range: [13, 42] as [number, number], maxActive: 2, elite: role === 'mastery' }
  ];
  const hazards = hazardsFor(biome, role).map((hazard) => {
    const centerX = (hazard.bounds[0] + hazard.bounds[1]) / 2;
    const baseY = surfaceFloorAtX(blueprint, centerX);
    const height = hazard.bounds[3] - hazard.bounds[2];
    return { ...hazard, bounds: [hazard.bounds[0], hazard.bounds[1], baseY, baseY + height] as [number, number, number, number] };
  });
  const traversalSlots = slots('traversal');
  const traversal = traversalFor(biome, role).map((piece, index) => ({ ...piece, position: traversalSlots[index + 1]?.position ?? [piece.position[0], surfaceFloorAtX(blueprint, piece.position[0]) + 3] as [number, number] }));
  const enemySpawns = enemiesFor(biome, role).map((enemy) => ({
    ...enemy,
    position: [enemy.position[0], surfaceFloorAtX(blueprint, enemy.position[0]) + (getStoryEnemyDefinition(enemy.enemyId).archetype === 'flying' ? 3.4 : STORY_GROUNDED_ACTOR_CENTER_Y)] as [number, number]
  }));
  const resourceSlots = slots('resource');
  const resourceNodes = createSurfaceResourceNodes({
    biomeId: biome, mapId: id, role, bounds: { minX: -56, maxX: 56 }, portals, npcs, hazards,
    placementForIndex: (index, fallbackX) => {
      const slot = resourceSlots[index % Math.max(1, resourceSlots.length)];
      const x = (slot?.position[0] ?? fallbackX) + ((index % 3) - 1) * 1.1;
      return { x };
    },
    baseYForX: terrainFloorAtX
  });
  const heroRoom = surfaceRouteRooms(blueprint)[Math.floor(surfaceRouteRooms(blueprint).length / 2)];
  return {
    id, biomeId: biome, role, order, name: details.name, subtitle: details.subtitle,
    bounds: { minX: -60, maxX: 60, minY: 0, maxY: 36, floorY: 2 }, spawn: westEntry, checkpoint: westEntry,
    platforms: compiled.platforms, terrainTiles: compiled.terrainTiles, portals,
    landmarks: [landmark(`${id}-hero`, details.hero, details.subtitle, heroRoom ? heroRoom.rect[0] + heroRoom.rect[2] / 2 : 0, heroRoom ? heroRoom.rect[1] + 5 : 9, spec.accent, role === 'mastery' ? 'vista' : 'district'), landmark(`${id}-secret`, 'Optional Route', 'A quieter line rewards careful movement', role === 'field-a' ? 34 : -32, surfaceFloorAtX(blueprint, role === 'field-a' ? 34 : -32) + 6, '#ffe071', 'secret')],
    props: compiled.props, enemySpawns, encounters,
    hazards, traversal, interactables: mapInteractables, npcs, resourceNodes,
    musicPhase: role === 'arrival' ? 'safe' : role === 'mastery' ? 'elite' : role === 'field-b' ? 'mystery' : 'explore', heroLandmarkId: `${id}-hero`,
    levelMeta: compiled.meta
  };
}

export const STORY_ADVENTURE_SURFACE_MAPS: Record<BiomeId, StoryAdventureMapDefinition[]> = Object.fromEntries(
  (Object.keys(BIOMES) as BiomeId[]).map((biome) => [biome, ROLE_ORDER.map((role) => createMap(biome, role))])
) as Record<BiomeId, StoryAdventureMapDefinition[]>;

export function firstStoryAdventureSurfaceMap(biome: BiomeId) {
  return STORY_ADVENTURE_SURFACE_MAPS[biome][0];
}

export function getStoryAdventureSurfaceMap(biome: BiomeId, id?: string | null) {
  return STORY_ADVENTURE_SURFACE_MAPS[biome].find((map) => map.id === id) ?? firstStoryAdventureSurfaceMap(biome);
}

export function createAdventureSurfaceHub(base: StoryHubDefinition, map: StoryAdventureMapDefinition): StoryHubDefinition {
  const exploration = base.exploration;
  return {
    ...base,
    id: `${base.id}:${map.id}`,
    name: map.name,
    subtitle: map.subtitle,
    spawn: map.spawn,
    checkpoint: map.checkpoint,
    bounds: map.bounds,
    platforms: map.platforms,
    terrainTiles: map.terrainTiles,
    portals: map.portals,
    landmarks: map.landmarks,
    props: map.props,
    enemySpawns: map.enemySpawns,
    biomeId: map.biomeId,
    surfaceMapId: map.id,
    hazards: map.hazards,
    traversal: map.traversal,
    interactables: map.interactables,
    npcs: map.npcs,
    musicPhase: map.musicPhase,
    resourceNodes: map.resourceNodes,
    levelMeta: map.levelMeta,
    exploration: exploration ? {
      ...exploration,
      safeApproach: map.role === 'arrival' ? [-58, 58] : [-58, -46],
      districts: [{ id: map.id, label: map.name, range: [-58, 58], safe: map.role === 'arrival' }],
      encounters: map.encounters,
      entrances: map.role === 'mastery' ? exploration.entrances.slice(0, 1) : [],
      waystones: map.role === 'arrival' ? [{ id: `${map.biomeId}-waystone-arrival`, label: 'Arrival Waystone', position: [-34, STORY_GROUNDED_ACTOR_CENTER_Y] }] : [],
      waterVolumes: map.hazards.filter((hazard) => hazard.kind === 'drowning').map((hazard) => ({
        id: `${hazard.id}-water`, bounds: [hazard.bounds[0], hazard.bounds[1], hazard.bounds[2], hazard.bounds[2] + 5.4] as [number, number, number, number], current: [0.2, 0] as [number, number],
        airPockets: [[hazard.bounds[0] + 1, hazard.bounds[2] + 5.2], [hazard.bounds[1] - 1, hazard.bounds[2] + 5.2]] as Array<[number, number]>
      })),
      camera: { minY: map.bounds.minY ?? 0, maxY: map.bounds.maxY ?? 36 }
    } : undefined
  };
}

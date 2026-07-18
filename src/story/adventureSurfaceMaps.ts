import { STORY_GROUNDED_ACTOR_CENTER_Y } from './actorGrounding';
import { getStoryEnemyDefinition } from './enemyCatalog';
import { storyNpcsForMap } from './adventureNpcs';
import { STORY_WORLD_MOUNT } from './adventureExploration';
import { createStoryWorldProps } from './worldEnvironments';
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
  regulars: [StoryEnemyId, StoryEnemyId, StoryEnemyId];
  hazard: StoryHazardDefinition['kind'];
  traversal: StoryTraversalPieceDefinition['kind'];
  maps: Record<StoryAdventureMapRole, MapSpec>;
};

const BIOMES: Record<BiomeId, BiomeSpec> = {
  greenhollow: { theme: 'village', accent: '#7ee787', regulars: ['volt-slime', 'nightshade-bulb', 'venom-slime'], hazard: 'drowning', traversal: 'current', maps: {
    arrival: { name: 'Windmill Commons', subtitle: 'A generous first step beneath turning sails', hero: 'Great Windmill' },
    'field-a': { name: 'Rooftop Market', subtitle: 'Awnings and chimneys form a second street', hero: 'Copper Market Roofs' },
    'field-b': { name: 'Floodplain Waterworks', subtitle: 'Valves redirect the village current', hero: 'Old Water Wheel' },
    mastery: { name: 'Old Forest Gate', subtitle: 'The village road narrows beneath ancient timber', hero: 'Greenhollow Gate' }
  } },
  thornwood: { theme: 'forest', accent: '#52e1a1', regulars: ['nightshade-bulb', 'venom-slime', 'veil-shade'], hazard: 'spikes', traversal: 'rope', maps: {
    arrival: { name: 'Bramble Camp', subtitle: 'Lanterns hold back the first wall of thorns', hero: 'Rootkeeper Camp' },
    'field-a': { name: 'Giantroot Crossing', subtitle: 'An elder root bridges the forest floor', hero: 'Sleeping Giantroot' },
    'field-b': { name: 'Whisper Canopy', subtitle: 'Branch paths trade height for safety', hero: 'Whisper Crown' },
    mastery: { name: 'Heartwood Hollow', subtitle: 'The oldest tree protects a quiet chamber', hero: 'Heartwood Arch' }
  } },
  ironroot: { theme: 'mine', accent: '#d9a066', regulars: ['graveblade', 'tide-slime', 'volt-slime'], hazard: 'collapsing-floor', traversal: 'lift', maps: {
    arrival: { name: 'Miner Refuge', subtitle: 'Timber braces and lamp glow mark safe ground', hero: 'Refuge Hoist' },
    'field-a': { name: 'Cart Junction', subtitle: 'Three rail lines cross above the old shaft', hero: 'Triple Rail Switch' },
    'field-b': { name: 'Flooded Shaft', subtitle: 'The lower rail disappears beneath mineral water', hero: 'Drowned Lift' },
    mastery: { name: 'Sunstone Vault', subtitle: 'Amber ore turns the deepest chamber gold', hero: 'Sunstone Heart' }
  } },
  bonevault: { theme: 'crypt', accent: '#b8a8ff', regulars: ['graveblade', 'veil-shade', 'magma-slime'], hazard: 'saw', traversal: 'falling-platform', maps: {
    arrival: { name: 'Keeper Vestibule', subtitle: 'Offerings and violet lamps soften the sealed threshold', hero: 'Keeper Doors' },
    'field-a': { name: 'Crew Ossuary', subtitle: 'Empty alcoves watch a narrow procession', hero: 'Ossuary Gallery' },
    'field-b': { name: 'Bell Nave', subtitle: 'Every moving floor answers a distant bell', hero: 'Bonevault Bell' },
    mastery: { name: 'Violet Tombs', subtitle: 'Cold flame outlines the last unmarked chamber', hero: 'Violet Sepulcher' }
  } },
  emberdeep: { theme: 'underworld', accent: '#ff6b45', regulars: ['cinder-wisp', 'magma-slime', 'nightshade-bulb'], hazard: 'lava', traversal: 'updraft', maps: {
    arrival: { name: 'Ashen Camp', subtitle: 'Basalt tents occupy the caldera rim', hero: 'Ash Beacon' },
    'field-a': { name: 'Lavafall Bridge', subtitle: 'Obsidian islands wait between fire pulses', hero: 'Twin Lavafalls' },
    'field-b': { name: 'Relic Forge', subtitle: 'Vent pressure wakes the ancient machinery', hero: 'Relic Anvil' },
    mastery: { name: 'Red Caldera', subtitle: 'The deep world breathes through a broken crown', hero: 'Caldera Crown' }
  } },
  frostpeak: { theme: 'snow', accent: '#8ee8ff', regulars: ['tide-slime', 'veil-shade', 'graveblade'], hazard: 'icicle', traversal: 'slippery-surface', maps: {
    arrival: { name: 'Last Shelter', subtitle: 'A stove and blue flags promise one final rest', hero: 'Last Hearth' },
    'field-a': { name: 'Blue Ice Cave', subtitle: 'Frozen walls preserve a sheltered ascent', hero: 'Blue Ice Window' },
    'field-b': { name: 'Windspine', subtitle: 'Open ridges turn every gust into a route', hero: 'Windspine Flags' },
    mastery: { name: 'Frozen Watch', subtitle: 'A silent tower stands above the weather', hero: 'Frozen Watchtower' }
  } },
  sunscar: { theme: 'desert', accent: '#ffd166', regulars: ['volt-slime', 'cinder-wisp', 'magma-slime'], hazard: 'sinking-sand', traversal: 'breakable-wall', maps: {
    arrival: { name: 'Caravan Camp', subtitle: 'Canvas shade and stone markers hold the road', hero: 'Sunscar Caravan' },
    'field-a': { name: 'Wandering Dunes', subtitle: 'The safe line moves with each bank of sand', hero: 'Walking Dune' },
    'field-b': { name: 'Glasswater Oasis', subtitle: 'Clear water reveals architecture below', hero: 'Glasswater Palms' },
    mastery: { name: 'Sunken Temple', subtitle: 'Only the highest arch still meets daylight', hero: 'Buried Sun Arch' }
  } },
  skyglass: { theme: 'ruins', accent: '#ff83d1', regulars: ['tide-slime', 'venom-slime', 'cinder-wisp'], hazard: 'wind', traversal: 'moving-platform', maps: {
    arrival: { name: 'Cloud Landing', subtitle: 'Low stones hover beneath a calm updraft', hero: 'Cloud Mooring' },
    'field-a': { name: 'Crystal Bridge', subtitle: 'Chimes stabilize a fractured span', hero: 'Prismatic Bridge' },
    'field-b': { name: 'Broken Tower', subtitle: 'Orbiting floors circle an empty core', hero: 'Orbit Tower' },
    mastery: { name: 'Glass Sanctum', subtitle: 'A quiet chamber floats above the storm', hero: 'Glass Crown' }
  } }
};

const ROLE_ORDER: StoryAdventureMapRole[] = ['arrival', 'field-a', 'field-b', 'mastery'];
const PLATFORM_PATTERNS: Record<StoryAdventureMapRole, Array<[number, number, number]>> = {
  arrival: [[-38, 3.2, 10], [-17, 5.1, 12], [8, 3.8, 13], [31, 6.2, 9]],
  'field-a': [[-43, 3.8, 9], [-27, 7.1, 8], [-8, 4.6, 12], [13, 8.2, 8], [34, 5.2, 10]],
  'field-b': [[-44, 4.2, 8], [-29, 7.4, 10], [-12, 10.2, 7], [7, 5.6, 12], [25, 8.7, 7], [41, 4.5, 9]],
  mastery: [[-45, 5.2, 8], [-31, 9.1, 7], [-16, 6.4, 10], [1, 11.2, 8], [17, 7.3, 7], [32, 10.1, 8], [45, 5.3, 7]]
};

function landmark(id: string, label: string, subtitle: string, x: number, y: number, color: string, kind: StoryWorldLandmarkDefinition['kind'] = 'district'): StoryWorldLandmarkDefinition {
  return { id, label, subtitle, position: [x, y, -1.2], size: [15, 8], color, kind };
}

function mapId(biome: BiomeId, role: StoryAdventureMapRole) {
  return `${biome}-${role}`;
}

function transitionPortal(biome: BiomeId, targetRole: StoryAdventureMapRole, side: 'west' | 'east', label: string) {
  return {
    id: `surface-map:${mapId(biome, targetRole)}`,
    label,
    subtitle: side === 'east' ? 'Continue deeper' : 'Return toward the arrival road',
    destination: biome,
    position: [side === 'west' ? -53 : 53, 1.7] as [number, number],
    size: [2.6, 3.2] as [number, number],
    accent: BIOMES[biome].accent,
    kind: 'adventure-gate' as const,
    surfaceMapTarget: mapId(biome, targetRole),
    surfaceEntry: side === 'west' ? 'east' as const : 'west' as const
  };
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
  const positions = role === 'field-a' ? [-18, 21] : role === 'field-b' ? [-36, 2, 34] : [-38, -8, 23, 40];
  return positions.map((x, index) => ({
    id: `${biome}-${role}-hazard-${index + 1}`,
    kind: spec.hazard,
    bounds: [x - 2.2, x + 2.2, 0, spec.hazard === 'wind' ? 8 : 1.15],
    damage: role === 'mastery' ? 18 : 12,
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
  const pattern = PLATFORM_PATTERNS[role].map(([x, y, width], index) => ({ id: `${id}-platform-${index + 1}`, position: [x, y + ((Object.keys(BIOMES).indexOf(biome) % 3) - 1) * 0.2] as [number, number], size: [width, 0.42] as [number, number], oneWay: true }));
  const portals: StoryPortalDefinition[] = [];
  if (role === 'arrival') portals.push({ id: `${biome}-return-route`, label: 'Central Route', subtitle: 'Return to the crossroads', destination: 'world-route' as const, position: [-53, 1.7] as [number, number], size: [2.6, 3.2] as [number, number], accent: '#ffe071', kind: 'adventure-gate' as const });
  if (order > 0) portals.push(transitionPortal(biome, ROLE_ORDER[order - 1], 'west', BIOMES[biome].maps[ROLE_ORDER[order - 1]].name));
  if (order < ROLE_ORDER.length - 1) portals.push(transitionPortal(biome, ROLE_ORDER[order + 1], 'east', BIOMES[biome].maps[ROLE_ORDER[order + 1]].name));
  if (role === 'field-b') portals.push({ id: `depth-entry:${biome}-depth`, label: 'Shifting Depths', subtitle: 'Enter the authored underground route', destination: biome, position: [4, 1.45] as [number, number], size: [2.3, 2.8] as [number, number], accent: '#b8a8ff', kind: 'adventure-gate' as const });
  if (role === 'mastery') portals.push({ id: `mount-sanctuary:${STORY_WORLD_MOUNT[biome]}`, label: `${STORY_WORLD_MOUNT[biome].replace(/-/g, ' ')} Sanctuary`, subtitle: 'Complete the route and earn its traversal bond', destination: biome, position: [-24, 1.45], size: [2.4, 2.8], accent: spec.accent, kind: 'shrine' });
  const mapInteractables = interactables(biome, role);
  const npcs = storyNpcsForMap(id);
  for (const entry of mapInteractables) portals.push({ id: `${entry.kind}:${entry.id}`, label: entry.label, subtitle: entry.subtitle, destination: biome, position: entry.position, size: [1.8, 2.2], accent: entry.kind === 'relic' ? '#ffe071' : spec.accent, kind: entry.kind === 'waystone' ? 'checkpoint' : entry.kind === 'restoration' ? 'restoration' : entry.kind as 'chest' | 'relic' });
  for (const entry of npcs) portals.push({ id: `npc:${entry.id}`, label: entry.displayName, subtitle: entry.bark, destination: biome, position: entry.position, size: [1.4, 2], accent: spec.accent, kind: 'npc' });
  const encounters = role === 'arrival' ? [] : [
    { id: `${biome}-${role}-encounter-1`, range: [-42, -13] as [number, number], maxActive: 2 },
    { id: `${biome}-${role}-encounter-2`, range: [13, 42] as [number, number], maxActive: 2, elite: role === 'mastery' }
  ];
  return {
    id, biomeId: biome, role, order, name: details.name, subtitle: details.subtitle,
    bounds: { minX: -56, maxX: 56, floorY: 0 }, spawn: [-49, STORY_GROUNDED_ACTOR_CENTER_Y], checkpoint: [-49, STORY_GROUNDED_ACTOR_CENTER_Y],
    platforms: [{ id: `${id}-ground`, position: [0, -0.5], size: [114, 1] }, ...pattern], portals,
    landmarks: [landmark(`${id}-hero`, details.hero, details.subtitle, 0, role === 'mastery' ? 9 : 6.5, spec.accent, role === 'mastery' ? 'vista' : 'district'), landmark(`${id}-secret`, 'Optional Route', 'A quieter line rewards careful movement', role === 'field-a' ? 34 : -32, 8, '#ffe071', 'secret')],
    props: createStoryWorldProps(spec.theme, -56, 56), enemySpawns: enemiesFor(biome, role), encounters,
    hazards: hazardsFor(biome, role), traversal: traversalFor(biome, role), interactables: mapInteractables, npcs,
    musicPhase: role === 'arrival' ? 'safe' : role === 'mastery' ? 'elite' : role === 'field-b' ? 'mystery' : 'explore', heroLandmarkId: `${id}-hero`
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
    exploration: exploration ? {
      ...exploration,
      safeApproach: map.role === 'arrival' ? [-56, 56] : [-56, -44],
      districts: [{ id: map.id, label: map.name, range: [-56, 56], safe: map.role === 'arrival' }],
      encounters: map.encounters,
      entrances: map.role === 'field-b' ? exploration.entrances.slice(0, 1) : [],
      waystones: map.role === 'arrival' ? [{ id: `${map.biomeId}-waystone-arrival`, label: 'Arrival Waystone', position: [-34, STORY_GROUNDED_ACTOR_CENTER_Y] }] : [],
      waterVolumes: map.hazards.some((hazard) => hazard.kind === 'drowning') ? [{ id: `${map.id}-water`, bounds: [-22, 22, -4, 1.4], current: [0.2, 0], airPockets: [[-16, 1.2], [16, 1.2]] }] : []
    } : undefined
  };
}

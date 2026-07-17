import { STORY_MODE_WORLDS } from './modeWorlds';
import { STORY_GROUNDED_ACTOR_CENTER_Y } from './actorGrounding';
import { createStoryWorldEnvironment, createStoryWorldProps } from './worldEnvironments';
import type {
  StoryAdventureWorldId,
  StoryEnemyArchetype,
  StoryEnemySpawnDefinition,
  StoryHubDefinition,
  StoryPortalDefinition,
  StoryWorldId,
  StoryWorldLandmarkDefinition,
  StoryWorldPropDefinition,
  StoryWorldThemeId
} from './types';

export const STORY_ADVENTURE_REGION_IDS = [
  'greenhollow', 'thornwood', 'ironroot', 'bonevault', 'emberdeep', 'frostpeak', 'sunscar', 'skyglass'
] as const satisfies readonly StoryAdventureWorldId[];

export const STORY_ADVENTURE_WORLD_IDS = ['world-route', ...STORY_ADVENTURE_REGION_IDS] as const satisfies readonly StoryAdventureWorldId[];

const REGION_LABELS: Record<typeof STORY_ADVENTURE_REGION_IDS[number], string> = {
  greenhollow: 'Greenhollow Village', thornwood: 'Thornwood Wilds', ironroot: 'Ironroot Mines', bonevault: 'Bonevault Crypt',
  emberdeep: 'Emberdeep', frostpeak: 'Frostpeak Pass', sunscar: 'Sunscar Dunes', skyglass: 'Skyglass Ruins'
};

const REGION_ACCENTS: Record<typeof STORY_ADVENTURE_REGION_IDS[number], string> = {
  greenhollow: '#7ee787', thornwood: '#52e1a1', ironroot: '#d9a066', bonevault: '#b8a8ff',
  emberdeep: '#ff6b45', frostpeak: '#8ee8ff', sunscar: '#ffd166', skyglass: '#ff83d1'
};

const routeGate = (id: typeof STORY_ADVENTURE_REGION_IDS[number], x: number): StoryPortalDefinition => ({
  id: `route-${id}`, label: REGION_LABELS[id], subtitle: 'Enter adventure region', destination: id,
  position: [x, 1.7], size: [2.8, 3.4], accent: REGION_ACCENTS[id], kind: 'adventure-gate'
});

function landmark(id: string, label: string, subtitle: string, x: number, y: number, width: number, height: number, color: string, kind: StoryWorldLandmarkDefinition['kind'] = 'district'): StoryWorldLandmarkDefinition {
  return { id, label, subtitle, position: [x, y, -1.15], size: [width, height], color, kind };
}

const WORLD_ROUTE: StoryHubDefinition = {
  id: 'kore-world-route', name: 'K.O.R.E. Central Route', subtitle: 'Eight worlds. Every road starts here.',
  spawn: [0, STORY_GROUNDED_ACTOR_CENTER_Y], checkpoint: [0, STORY_GROUNDED_ACTOR_CENTER_Y], bounds: { minX: -64, maxX: 64, floorY: 0 }, theme: 'route',
  environment: createStoryWorldEnvironment('route'), adventure: true,
  platforms: [
    { id: 'ground', position: [0, -0.5], size: [130, 1] },
    { id: 'route-overlook-far-left', position: [-48, 4.7], size: [11, 0.45], oneWay: true },
    { id: 'route-overlook-left', position: [-23, 4.1], size: [13, 0.45], oneWay: true },
    { id: 'route-shrine-overlook', position: [0, 5.4], size: [12, 0.45], oneWay: true },
    { id: 'route-overlook-right', position: [23, 4.1], size: [13, 0.45], oneWay: true },
    { id: 'route-overlook-far-right', position: [48, 4.7], size: [11, 0.45], oneWay: true }
  ],
  portals: [
    { id: 'route-central-return', label: 'K.O.R.E. Central', subtitle: 'Return to the main hub', destination: 'central', position: [-61.5, 1.7], size: [2.8, 3.4], accent: '#2ee6ff', kind: 'adventure-gate' },
    routeGate('greenhollow', -32), routeGate('thornwood', -23), routeGate('ironroot', -14), routeGate('bonevault', -5),
    routeGate('emberdeep', 5), routeGate('frostpeak', 14), routeGate('sunscar', 23), routeGate('skyglass', 32),
    { id: 'route-respec-shrine', label: 'Recalibration Shrine', subtitle: 'Heal and reset stat points', destination: 'world-route', position: [0, 1.25], size: [2.2, 2.5], accent: '#ffe071', kind: 'shrine' },
    { id: 'route-central-return-east', label: 'K.O.R.E. Central', subtitle: 'Express return to the main hub', destination: 'central', position: [61.5, 1.7], size: [2.8, 3.4], accent: '#2ee6ff', kind: 'adventure-gate' }
  ],
  landmarks: [
    landmark('route-west-outlook', 'West Outlook', 'The city glows beyond the route', -52, 6.2, 14, 8, '#2ee6ff', 'vista'),
    landmark('route-green-district', 'Verdant Gates', 'Greenhollow and Thornwood roads', -28, 5.1, 16, 6, '#7ee787'),
    landmark('route-deep-district', 'Deep Gates', 'Ironroot and Bonevault roads', -10, 5.5, 14, 7, '#b8a8ff'),
    landmark('route-shrine-plaza', 'Shrine Plaza', 'Every route crosses this light', 0, 7.4, 15, 8, '#ffe071', 'lore'),
    landmark('route-elemental-district', 'Elemental Gates', 'Emberdeep and Frostpeak roads', 10, 5.5, 14, 7, '#ff6b45'),
    landmark('route-horizon-district', 'Horizon Gates', 'Sunscar and Skyglass roads', 28, 5.1, 16, 6, '#ff83d1'),
    landmark('route-east-outlook', 'East Outlook', 'A quiet view over every road', 52, 6.2, 14, 8, '#8ee8ff', 'secret')
  ],
  props: createStoryWorldProps('route', -64, 64),
  enemySpawns: []
};

type RegionInput = {
  id: typeof STORY_ADVENTURE_REGION_IDS[number]; subtitle: string; theme: StoryWorldThemeId; width: number;
  sprites: [StoryEnemySpawnDefinition['sprite'], StoryEnemySpawnDefinition['sprite'], StoryEnemySpawnDefinition['sprite']];
  props: StoryWorldPropDefinition[]; landmarks: StoryWorldLandmarkDefinition[];
};

const ARCHETYPES: StoryEnemyArchetype[] = ['ground', 'flying', 'ranged'];

function region(input: RegionInput): StoryHubDefinition {
  const halfWidth = input.width / 2;
  const returnX = halfWidth - 2.5;
  const enemySpan = input.width - 26;
  const enemySpawns = Array.from({ length: 10 }, (_, index): StoryEnemySpawnDefinition => {
    const archetype = ARCHETYPES[index % ARCHETYPES.length];
    return {
      id: `${input.id}-enemy-${index + 1}`,
      name: `${REGION_LABELS[input.id].split(' ')[0]} ${archetype === 'ground' ? 'Stalker' : archetype === 'flying' ? 'Wisp' : 'Caster'}`,
      archetype,
      position: [-halfWidth + 13 + enemySpan * index / 9, archetype === 'flying' ? 3.2 + (index % 2) * 0.7 : STORY_GROUNDED_ACTOR_CENTER_Y],
      patrolRadius: 2.2 + (index % 3) * 0.45,
      sprite: input.sprites[index % input.sprites.length],
      accent: REGION_ACCENTS[input.id]
    };
  });
  const platformX = [-0.66, -0.38, -0.1, 0.2, 0.48, 0.72].map((ratio) => ratio * halfWidth);
  return {
    id: `kore-${input.id}`, name: REGION_LABELS[input.id], subtitle: input.subtitle,
    spawn: [-halfWidth + 5.5, STORY_GROUNDED_ACTOR_CENTER_Y], checkpoint: [-halfWidth + 5.5, STORY_GROUNDED_ACTOR_CENTER_Y], bounds: { minX: -halfWidth, maxX: halfWidth, floorY: 0 },
    theme: input.theme, environment: createStoryWorldEnvironment(input.theme), adventure: true,
    platforms: [
      { id: 'ground', position: [0, -0.5], size: [input.width + 2, 1] },
      ...platformX.map((x, index) => ({ id: `${input.id}-platform-${index + 1}`, position: [x, 2.9 + (index % 3) * 1.15] as [number, number], size: [8 + index % 3 * 2, 0.42] as [number, number], oneWay: true }))
    ],
    portals: [
      { id: `${input.id}-return-west`, label: 'Central Route', subtitle: 'Return to the crossroads', destination: 'world-route', position: [-returnX, 1.7], size: [2.8, 3.4], accent: '#ffe071', kind: 'adventure-gate' },
      { id: `${input.id}-return-east`, label: 'Central Route', subtitle: 'Return to the crossroads', destination: 'world-route', position: [returnX, 1.7], size: [2.8, 3.4], accent: '#ffe071', kind: 'adventure-gate' }
    ],
    props: [
      ...createStoryWorldProps(input.theme, -halfWidth, halfWidth),
      ...input.props.filter((prop) => prop.id === 'platino-secret' || prop.id.startsWith('sky-trap-'))
    ],
    landmarks: input.landmarks, enemySpawns
  };
}

const treeProp = (id: string, x: number, themeRow = 0, scale = 1): StoryWorldPropDefinition => ({
  id, asset: 'dawn-tree', frame: [themeRow * 48, 48, 48, 48], atlasSize: [192, 576], position: [x, 2.2 * scale, -2.3], size: [4.8 * scale, 4.8 * scale]
});

const wallProp = (id: string, x: number, y = 2.2, scale = 1): StoryWorldPropDefinition => ({
  id, asset: 'dawn-wall', frame: [0, 0, 48, 48], atlasSize: [320, 816], position: [x, y, -2.4], size: [5.2 * scale, 5.2 * scale], opacity: 0.9
});

const buildingProp = (id: string, x: number, mirrored = false, opacity = 0.9): StoryWorldPropDefinition => ({
  id, asset: 'crawler-buildings', frame: [0, 128, 200, 176], atlasSize: [400, 400], position: [x, 4.2, -2.6], size: [12, 10], mirrored, opacity
});

export const STORY_ADVENTURE_WORLDS: Record<StoryAdventureWorldId, StoryHubDefinition> = {
  'world-route': WORLD_ROUTE,
  greenhollow: region({
    id: 'greenhollow', subtitle: 'A lively settlement at the edge of the old forest', theme: 'village', width: 148, sprites: ['orc', 'slime', 'orc-shaman'],
    props: [treeProp('green-tree-a', -61), buildingProp('green-farm', -45), treeProp('green-tree-b', -29, 1), buildingProp('green-inn', -10, true), treeProp('green-tree-c', 7), buildingProp('green-square', 25), treeProp('green-tree-d', 43, 1, 1.2), buildingProp('green-gate', 60, true)],
    landmarks: [landmark('green-farms', 'Windmill Farms', 'Greenhollow begins in open fields', -57, 5, 15, 7, '#b8e986'), landmark('green-inn', 'Wayfarer Inn', 'Every route has a warm table', -29, 4.5, 13, 6, '#ffd166', 'lore'), landmark('green-square', 'Village Square', 'The settlement gathers here', 0, 5.5, 17, 7, '#7ee787'), landmark('green-roofs', 'Rooftop Walk', 'A faster path over the market', 31, 6.4, 14, 6, '#52e1a1', 'vista'), landmark('green-gate', 'Old Forest Gate', 'Thornwood begins beyond the wall', 61, 5.5, 13, 7, '#d8ffb5', 'secret')]
  }),
  thornwood: region({
    id: 'thornwood', subtitle: 'Ancient roots hide restless creatures', theme: 'forest', width: 168, sprites: ['slime', 'demon', 'reptile'],
    props: [-70, -54, -36, -17, 4, 24, 45, 66].map((x, index) => treeProp(`thorn-tree-${index + 1}`, x, 2 + index % 2, 1 + index % 3 * 0.18)),
    landmarks: [landmark('thorn-edge', 'Bramble Edge', 'The daylight narrows here', -69, 5.5, 14, 8, '#52e1a1'), landmark('thorn-roots', 'Giantroot Crossing', 'Roots older than the route form a bridge', -38, 7, 17, 9, '#7ee787'), landmark('thorn-grove', 'Whisper Grove', 'Listen between the leaves', -5, 5.8, 15, 7, '#9effc9', 'lore'), landmark('thorn-ruin', 'Overgrown Ruin', 'Stone sleeps beneath the canopy', 31, 6.2, 16, 8, '#b8a8ff'), landmark('thorn-heart', 'Heartwood Hollow', 'A hidden clearing beyond the vines', 69, 6.6, 15, 8, '#ffe071', 'secret')]
  }),
  ironroot: region({
    id: 'ironroot', subtitle: 'Ore-lit tunnels beneath the world route', theme: 'mine', width: 156, sprites: ['orc', 'elemental', 'orc-shaman'],
    props: [-66, -48, -28, -8, 13, 34, 55, 69].map((x, index) => index % 3 === 1 ? ({ id: `mine-ore-${index}`, asset: 'dawn-ore', frame: [0, 0, 48, 32], atlasSize: [144, 112], position: [x, 1.5, -1.5], size: [4.5, 3] }) : wallProp(`mine-wall-${index}`, x, 2.2, 1.15)),
    landmarks: [landmark('mine-mouth', 'Ironroot Mouth', 'Timber and rail descend together', -65, 5.6, 15, 8, '#d9a066'), landmark('mine-rails', 'Cart Junction', 'Three abandoned lines cross here', -34, 4.6, 16, 6, '#ffd08d'), landmark('mine-lift', 'Deep Lift', 'The lowest shaft is still running', -2, 7, 13, 9, '#ff9d35', 'lore'), landmark('mine-ore', 'Sunstone Chamber', 'Ore turns the darkness gold', 31, 6.2, 16, 8, '#ffe071'), landmark('mine-vault', 'Foreman Vault', 'A sealed room behind the supports', 65, 5.7, 14, 7, '#b8a8ff', 'secret')]
  }),
  bonevault: region({
    id: 'bonevault', subtitle: 'A sealed crypt filled with roaming skeleton crews', theme: 'crypt', width: 148, sprites: ['skeleton', 'demon', 'skeleton-mage'],
    props: [{ id: 'crypt-nave', asset: 'crawler-dungeon', frame: [0, 0, 200, 200], atlasSize: [400, 400], position: [0, 5, -3], size: [28, 18], opacity: 0.86 }, ...[-61, -43, -24, 24, 43, 61].map((x, index) => wallProp(`crypt-wall-${index}`, x, 2.4, 1.2))],
    landmarks: [landmark('crypt-entry', 'Sealed Vestibule', 'The vault opens only inward', -61, 5.8, 14, 8, '#b8a8ff'), landmark('crypt-ossuary', 'Crew Ossuary', 'Empty alcoves line the passage', -31, 5.2, 15, 7, '#ddd5ff', 'lore'), landmark('crypt-nave-mark', 'Bonevault Nave', 'Footsteps echo through the central crypt', 0, 7.4, 20, 10, '#b8a8ff'), landmark('crypt-altar', 'Violet Altar', 'A cold flame guards the east wing', 32, 5.8, 15, 8, '#9b72ff'), landmark('crypt-tomb', 'Unmarked Tomb', 'Someone removed the name', 62, 5.4, 13, 7, '#ffe071', 'secret')]
  }),
  emberdeep: region({
    id: 'emberdeep', subtitle: 'A volcanic underworld of fire and hidden relics', theme: 'underworld', width: 176, sprites: ['demon', 'elemental', 'reptile'],
    props: [treeProp('ember-tree-a', -73, 3, 1.25), wallProp('ember-wall-a', -50, 2.4, 1.3), treeProp('ember-tree-b', -28, 3), wallProp('ember-wall-b', -5, 2.4, 1.2), treeProp('ember-tree-c', 20, 3, 1.2), wallProp('ember-wall-c', 45, 2.4, 1.3), treeProp('ember-tree-d', 68, 3), { id: 'platino-secret', asset: 'dawn-reptile', frame: [96, 160, 16, 16], atlasSize: [128, 248], position: [79.5, 5.85, -1.4], size: [1.2, 1.2], opacity: 0.72 }],
    landmarks: [landmark('ember-rim', 'Ashen Rim', 'Heat bends the road ahead', -73, 5.5, 15, 8, '#ff6b45'), landmark('ember-falls', 'Lavafall Bridge', 'Obsidian holds against the flow', -39, 7, 18, 9, '#ff9d35'), landmark('ember-forge', 'Relic Forge', 'Ancient metal still remembers flame', -3, 6.2, 16, 8, '#ffe071', 'lore'), landmark('ember-caldera', 'Red Caldera', 'The deep world breathes here', 38, 7.6, 19, 10, '#ff5d69', 'vista'), landmark('ember-platino', 'Platino Hollow', 'A tiny guardian hides in the glow', 76, 6, 14, 8, '#b8a8ff', 'secret')]
  }),
  frostpeak: region({
    id: 'frostpeak', subtitle: 'A frozen climb through bright mountain winds', theme: 'snow', width: 164, sprites: ['elemental', 'demon', 'skeleton-mage'],
    props: [-68, -50, -31, -10, 13, 35, 55, 70].map((x, index) => treeProp(`frost-tree-${index}`, x, 0, 0.95 + index % 3 * 0.18)),
    landmarks: [landmark('frost-field', 'White Approach', 'The road disappears under fresh snow', -68, 5.4, 16, 8, '#8ee8ff'), landmark('frost-cave', 'Blue Ice Cave', 'Shelter glows beneath the pass', -36, 6.1, 16, 8, '#2ee6ff', 'lore'), landmark('frost-spine', 'Windspine', 'The climb opens above the clouds', -2, 7.8, 17, 10, '#ffffff', 'vista'), landmark('frost-ruin', 'Frozen Watch', 'A silent tower guards the east path', 35, 6.6, 15, 9, '#b8a8ff'), landmark('frost-shelter', 'Last Shelter', 'A warm light survives the storm', 68, 5.8, 14, 8, '#ffe071', 'secret')]
  }),
  sunscar: region({
    id: 'sunscar', subtitle: 'Shifting dunes surrounding a buried road', theme: 'desert', width: 180, sprites: ['reptile', 'orc', 'orc-shaman'],
    props: [treeProp('sun-palm-a', -75, 1, 1.25), wallProp('sun-ruin-a', -53, 2.2, 1.3), treeProp('sun-palm-b', -29, 1), wallProp('sun-ruin-b', -4, 2.2, 1.4), treeProp('sun-palm-c', 23, 1, 1.2), wallProp('sun-ruin-c', 48, 2.2, 1.3), treeProp('sun-palm-d', 72, 1)],
    landmarks: [landmark('sun-dunes', 'Wandering Dunes', 'The horizon moves every night', -75, 5.5, 16, 8, '#ffd166'), landmark('sun-caravan', 'Lost Caravan', 'Canvas and wheels remain in the sand', -42, 5.1, 16, 7, '#ff9d35', 'lore'), landmark('sun-oasis', 'Glasswater Oasis', 'A bright pause in the buried road', -5, 6.3, 18, 8, '#52e1a1'), landmark('sun-temple', 'Sunken Temple', 'Only the upper arch meets daylight', 37, 7.1, 18, 10, '#ffe071'), landmark('sun-road', 'Buried Road', 'Stone markers continue beneath the dune', 76, 5.7, 15, 8, '#ffffff', 'secret')]
  }),
  skyglass: region({
    id: 'skyglass', subtitle: 'Floating platforms and unstable ancient traps', theme: 'ruins', width: 152, sprites: ['slime', 'demon', 'elemental'],
    props: [{ id: 'sky-terrain-a', asset: 'pixel-terrain', frame: [0, 0, 96, 80], atlasSize: [352, 176], position: [-57, 4.5, -2.4], size: [9, 7.5], opacity: 0.9 }, { id: 'sky-terrain-b', asset: 'pixel-terrain', frame: [192, 0, 96, 80], atlasSize: [352, 176], position: [-19, 5, -2.4], size: [10, 8], opacity: 0.9 }, { id: 'sky-terrain-c', asset: 'pixel-terrain', frame: [0, 0, 96, 80], atlasSize: [352, 176], position: [21, 4.5, -2.4], size: [9, 7.5], mirrored: true, opacity: 0.9 }, { id: 'sky-terrain-d', asset: 'pixel-terrain', frame: [192, 0, 96, 80], atlasSize: [352, 176], position: [58, 5, -2.4], size: [10, 8], mirrored: true, opacity: 0.9 }, { id: 'sky-trap-a', asset: 'pixel-trap', frame: [0, 0, 38, 38], atlasSize: [304, 38], position: [-2, 0.45, -0.4], size: [1.5, 1.5] }, { id: 'sky-trap-b', asset: 'pixel-trap', frame: [0, 0, 38, 38], atlasSize: [304, 38], position: [45, 0.45, -0.4], size: [1.5, 1.5] }],
    landmarks: [landmark('sky-landing', 'Cloud Landing', 'The first stones float just above the route', -63, 5.8, 15, 8, '#c8f7ff'), landmark('sky-bridge', 'Crystal Bridge', 'Light holds the fractured span together', -34, 6.8, 17, 9, '#8ee8ff'), landmark('sky-tower', 'Broken Tower', 'Its upper floors orbit the ruin', 0, 8, 17, 11, '#ff83d1', 'vista'), landmark('sky-gauntlet', 'Trap Gallery', 'Ancient defenses still count every step', 34, 5.7, 16, 8, '#ffe071', 'lore'), landmark('sky-sanctum', 'Glass Sanctum', 'A quiet room above the storm', 63, 7.1, 15, 9, '#ffffff', 'secret')]
  })
};

export const STORY_WORLDS: Record<StoryWorldId, StoryHubDefinition> = { ...STORY_MODE_WORLDS, ...STORY_ADVENTURE_WORLDS };

export function isStoryAdventureWorldId(value: unknown): value is StoryAdventureWorldId {
  return STORY_ADVENTURE_WORLD_IDS.includes(value as StoryAdventureWorldId);
}

export function isStoryWorldId(value: unknown): value is StoryWorldId {
  return Object.prototype.hasOwnProperty.call(STORY_WORLDS, String(value));
}

export function isStoryAdventureRegionId(value: unknown): value is typeof STORY_ADVENTURE_REGION_IDS[number] {
  return STORY_ADVENTURE_REGION_IDS.includes(value as typeof STORY_ADVENTURE_REGION_IDS[number]);
}

export function storyWorldBounds(worldId: StoryWorldId) {
  return STORY_WORLDS[worldId]?.bounds ?? STORY_MODE_WORLDS.central.bounds;
}

export const STORY_ADVENTURE_REGION_LABELS = REGION_LABELS;

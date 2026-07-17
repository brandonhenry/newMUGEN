import { STORY_MODE_WORLDS } from './modeWorlds';
import type {
  StoryAdventureWorldId,
  StoryEnemyArchetype,
  StoryEnemySpawnDefinition,
  StoryHubDefinition,
  StoryPortalDefinition,
  StoryWorldId,
  StoryWorldPropDefinition,
  StoryWorldThemeId
} from './types';

export const STORY_ADVENTURE_REGION_IDS = [
  'greenhollow',
  'thornwood',
  'ironroot',
  'bonevault',
  'emberdeep',
  'frostpeak',
  'sunscar',
  'skyglass'
] as const satisfies readonly StoryAdventureWorldId[];

export const STORY_ADVENTURE_WORLD_IDS = ['world-route', ...STORY_ADVENTURE_REGION_IDS] as const satisfies readonly StoryAdventureWorldId[];

const REGION_LABELS: Record<typeof STORY_ADVENTURE_REGION_IDS[number], string> = {
  greenhollow: 'Greenhollow Village',
  thornwood: 'Thornwood Wilds',
  ironroot: 'Ironroot Mines',
  bonevault: 'Bonevault Crypt',
  emberdeep: 'Emberdeep',
  frostpeak: 'Frostpeak Pass',
  sunscar: 'Sunscar Dunes',
  skyglass: 'Skyglass Ruins'
};

const REGION_ACCENTS: Record<typeof STORY_ADVENTURE_REGION_IDS[number], string> = {
  greenhollow: '#7ee787',
  thornwood: '#52e1a1',
  ironroot: '#d9a066',
  bonevault: '#b8a8ff',
  emberdeep: '#ff6b45',
  frostpeak: '#8ee8ff',
  sunscar: '#ffd166',
  skyglass: '#ff83d1'
};

const routeGate = (id: typeof STORY_ADVENTURE_REGION_IDS[number], x: number): StoryPortalDefinition => ({
  id: `route-${id}`,
  label: REGION_LABELS[id],
  subtitle: 'Enter adventure region',
  destination: id,
  position: [x, 1.7],
  size: [2.8, 3.4],
  accent: REGION_ACCENTS[id],
  kind: 'adventure-gate'
});

const WORLD_ROUTE: StoryHubDefinition = {
  id: 'kore-world-route',
  name: 'K.O.R.E. Central Route',
  subtitle: 'Eight worlds. Every road starts here.',
  spawn: [0, 0.82],
  checkpoint: [0, 0.82],
  bounds: { minX: -42, maxX: 42, floorY: 0 },
  theme: 'route',
  adventure: true,
  platforms: [
    { id: 'ground', position: [0, -0.5], size: [86, 1] },
    { id: 'route-overlook-left', position: [-20, 4.1], size: [12, 0.45], oneWay: true },
    { id: 'route-overlook-right', position: [20, 4.1], size: [12, 0.45], oneWay: true }
  ],
  portals: [
    { id: 'route-central-return', label: 'K.O.R.E. Central', subtitle: 'Return to the main hub', destination: 'central', position: [-39.5, 1.7], size: [2.8, 3.4], accent: '#2ee6ff', kind: 'adventure-gate' },
    routeGate('greenhollow', -32), routeGate('thornwood', -23), routeGate('ironroot', -14), routeGate('bonevault', -5),
    routeGate('emberdeep', 5), routeGate('frostpeak', 14), routeGate('sunscar', 23), routeGate('skyglass', 32),
    { id: 'route-respec-shrine', label: 'Recalibration Shrine', subtitle: 'Heal and reset stat points', destination: 'world-route', position: [0, 1.25], size: [2.2, 2.5], accent: '#ffe071', kind: 'shrine' }
  ],
  props: [
    { id: 'route-village-left', asset: 'crawler-buildings', frame: [0, 128, 200, 176], atlasSize: [400, 400], position: [-18, 4.6, -2.6], size: [12, 10], opacity: 0.88 },
    { id: 'route-village-right', asset: 'crawler-buildings', frame: [0, 128, 200, 176], atlasSize: [400, 400], position: [19, 4.6, -2.6], size: [12, 10], mirrored: true, opacity: 0.88 }
  ],
  enemySpawns: []
};

type RegionInput = {
  id: typeof STORY_ADVENTURE_REGION_IDS[number];
  subtitle: string;
  theme: StoryWorldThemeId;
  width: number;
  sprites: [StoryEnemySpawnDefinition['sprite'], StoryEnemySpawnDefinition['sprite'], StoryEnemySpawnDefinition['sprite']];
  props: StoryWorldPropDefinition[];
};

const ARCHETYPES: StoryEnemyArchetype[] = ['ground', 'flying', 'ranged'];
const ENEMY_X = [-29, -23, -17, -10, -3, 5, 11, 18, 24, 30];

function region(input: RegionInput): StoryHubDefinition {
  const halfWidth = input.width / 2;
  const returnX = halfWidth - 2.5;
  const enemySpawns = ENEMY_X.map((x, index): StoryEnemySpawnDefinition => {
    const archetype = ARCHETYPES[index % ARCHETYPES.length];
    const sprite = input.sprites[index % input.sprites.length];
    return {
      id: `${input.id}-enemy-${index + 1}`,
      name: `${REGION_LABELS[input.id].split(' ')[0]} ${archetype === 'ground' ? 'Stalker' : archetype === 'flying' ? 'Wisp' : 'Caster'}`,
      archetype,
      position: [x, archetype === 'flying' ? 3.2 + (index % 2) * 0.7 : 0.82],
      patrolRadius: 2.2 + (index % 3) * 0.45,
      sprite,
      accent: REGION_ACCENTS[input.id]
    };
  });
  return {
    id: `kore-${input.id}`,
    name: REGION_LABELS[input.id],
    subtitle: input.subtitle,
    spawn: [-halfWidth + 5.5, 0.82],
    checkpoint: [-halfWidth + 5.5, 0.82],
    bounds: { minX: -halfWidth, maxX: halfWidth, floorY: 0 },
    theme: input.theme,
    adventure: true,
    platforms: [
      { id: 'ground', position: [0, -0.5], size: [input.width + 2, 1] },
      { id: `${input.id}-platform-a`, position: [-19, 3.15], size: [9, 0.42], oneWay: true },
      { id: `${input.id}-platform-b`, position: [-2, 4.4], size: [11, 0.42], oneWay: true },
      { id: `${input.id}-platform-c`, position: [16, 2.85], size: [10, 0.42], oneWay: true },
      { id: `${input.id}-platform-d`, position: [29, 5.1], size: [7, 0.42], oneWay: true }
    ],
    portals: [
      { id: `${input.id}-return-west`, label: 'Central Route', subtitle: 'Return to the crossroads', destination: 'world-route', position: [-returnX, 1.7], size: [2.8, 3.4], accent: '#ffe071', kind: 'adventure-gate' },
      { id: `${input.id}-return-east`, label: 'Central Route', subtitle: 'Return to the crossroads', destination: 'world-route', position: [returnX, 1.7], size: [2.8, 3.4], accent: '#ffe071', kind: 'adventure-gate' }
    ],
    props: input.props,
    enemySpawns
  };
}

const treeProp = (id: string, x: number, themeRow = 0): StoryWorldPropDefinition => ({
  id,
  asset: 'dawn-tree',
  frame: [themeRow * 48, 48, 48, 48],
  atlasSize: [192, 576],
  position: [x, 2.2, -2.3],
  size: [4.8, 4.8]
});

const wallProp = (id: string, x: number, y: number): StoryWorldPropDefinition => ({
  id,
  asset: 'dawn-wall',
  frame: [0, 0, 48, 48],
  atlasSize: [320, 816],
  position: [x, y, -2.4],
  size: [5.2, 5.2],
  opacity: 0.9
});

export const STORY_ADVENTURE_WORLDS: Record<StoryAdventureWorldId, StoryHubDefinition> = {
  'world-route': WORLD_ROUTE,
  greenhollow: region({ id: 'greenhollow', subtitle: 'A lively settlement at the edge of the old forest', theme: 'village', width: 80, sprites: ['orc', 'slime', 'orc-shaman'], props: [treeProp('green-tree-a', -22), treeProp('green-tree-b', 7, 1), { id: 'green-buildings', asset: 'crawler-buildings', frame: [0, 128, 200, 176], atlasSize: [400, 400], position: [22, 4.2, -2.6], size: [12, 10] }] }),
  thornwood: region({ id: 'thornwood', subtitle: 'Ancient roots hide restless creatures', theme: 'forest', width: 88, sprites: ['slime', 'demon', 'reptile'], props: [treeProp('thorn-tree-a', -27, 2), treeProp('thorn-tree-b', -8, 2), treeProp('thorn-tree-c', 13, 3), treeProp('thorn-tree-d', 30, 2)] }),
  ironroot: region({ id: 'ironroot', subtitle: 'Ore-lit tunnels beneath the world route', theme: 'mine', width: 84, sprites: ['orc', 'elemental', 'orc-shaman'], props: [wallProp('mine-wall-a', -24, 2.2), wallProp('mine-wall-b', 0, 2.2), wallProp('mine-wall-c', 25, 2.2), { id: 'mine-ore', asset: 'dawn-ore', frame: [0, 0, 48, 32], atlasSize: [144, 112], position: [10, 1.5, -1.5], size: [4.5, 3] }] }),
  bonevault: region({ id: 'bonevault', subtitle: 'A sealed crypt filled with roaming skeleton crews', theme: 'crypt', width: 80, sprites: ['skeleton', 'demon', 'skeleton-mage'], props: [{ id: 'crypt-wall', asset: 'crawler-dungeon', frame: [0, 0, 200, 200], atlasSize: [400, 400], position: [0, 5, -3], size: [24, 16], opacity: 0.86 }, wallProp('crypt-altar', 26, 2.2)] }),
  emberdeep: region({ id: 'emberdeep', subtitle: 'A volcanic underworld of fire and hidden relics', theme: 'underworld', width: 92, sprites: ['demon', 'elemental', 'reptile'], props: [treeProp('ember-tree-a', -26, 3), treeProp('ember-tree-b', 22, 3), wallProp('ember-wall', 0, 2.2), { id: 'platino-secret', asset: 'dawn-reptile', frame: [96, 160, 16, 16], atlasSize: [128, 248], position: [39.5, 5.85, -1.4], size: [1.2, 1.2], opacity: 0.72 }] }),
  frostpeak: region({ id: 'frostpeak', subtitle: 'A frozen climb through bright mountain winds', theme: 'snow', width: 88, sprites: ['elemental', 'demon', 'skeleton-mage'], props: [treeProp('frost-tree-a', -26, 0), treeProp('frost-tree-b', -4, 0), treeProp('frost-tree-c', 23, 0)] }),
  sunscar: region({ id: 'sunscar', subtitle: 'Shifting dunes surrounding a buried road', theme: 'desert', width: 96, sprites: ['reptile', 'orc', 'orc-shaman'], props: [treeProp('sun-tree-a', -25, 1), treeProp('sun-tree-b', 11, 1), wallProp('sun-ruin-a', -4, 2.2), wallProp('sun-ruin-b', 29, 2.2)] }),
  skyglass: region({ id: 'skyglass', subtitle: 'Floating platforms and unstable ancient traps', theme: 'ruins', width: 82, sprites: ['slime', 'demon', 'elemental'], props: [{ id: 'sky-terrain-a', asset: 'pixel-terrain', frame: [0, 0, 96, 80], atlasSize: [352, 176], position: [-20, 4.5, -2.4], size: [9, 7.5], opacity: 0.9 }, { id: 'sky-terrain-b', asset: 'pixel-terrain', frame: [192, 0, 96, 80], atlasSize: [352, 176], position: [22, 4.5, -2.4], size: [9, 7.5], opacity: 0.9 }, { id: 'sky-trap', asset: 'pixel-trap', frame: [0, 0, 38, 38], atlasSize: [304, 38], position: [7, 0.45, -0.4], size: [1.5, 1.5] }] })
};

export const STORY_WORLDS: Record<StoryWorldId, StoryHubDefinition> = {
  ...STORY_MODE_WORLDS,
  ...STORY_ADVENTURE_WORLDS
};

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

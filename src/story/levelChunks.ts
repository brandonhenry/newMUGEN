import { STORY_GROUNDED_ACTOR_CENTER_Y } from './actorGrounding';
import type { StoryRoomConnector, StoryRoomTemplateDefinition, StoryRoomTemplateKind } from './types';
import type { StoryLevelBlueprintV1 } from './levelTypes';

const CHUNK_ROLES: StoryRoomTemplateKind[] = [
  'entrance', 'exit', 'straight', 'rise', 'drop', 'junction', 'vertical', 'branch', 'secret', 'event', 'arena', 'boss'
];

const VARIANTS = [
  { ledges: [[-8, 3.25, 7], [0, 5.0, 8], [8.5, 3.75, 6]] as Array<[number, number, number]>, structures: [[-11, 0, 3, 2.5], [8, 0, 3, 3.25]] as Array<[number, number, number, number]>, rhythm: 'low-high-low', decision: 'central height for speed or protected floor' },
  { ledges: [[-8, 4.0, 8], [-1.5, 6.25, 6], [7.5, 4.75, 9]] as Array<[number, number, number]>, structures: [[-11, 0, 4, 3], [6.5, 0, 4.5, 2]] as Array<[number, number, number, number]>, rhythm: 'rising bridge', decision: 'early commitment or late recovery' },
  { ledges: [[-9, 5.25, 6], [0, 3.5, 10], [9, 6.0, 6]] as Array<[number, number, number]>, structures: [[-11.5, 0, 3, 4], [8.5, 0, 3, 4]] as Array<[number, number, number, number]>, rhythm: 'high-low-high', decision: 'drop through center or hold altitude' },
  { ledges: [[-7.5, 3.5, 9], [1, 7.0, 7], [8, 4.25, 7]] as Array<[number, number, number]>, structures: [[-11, 0, 4, 2], [7, 0, 4, 3.5]] as Array<[number, number, number, number]>, rhythm: 'late apex', decision: 'safe lower line or exposed apex reward' }
];

function defaultConnectors(kind: StoryRoomTemplateKind): StoryRoomConnector[] {
  if (kind === 'entrance') return ['east'];
  if (kind === 'exit') return ['west'];
  if (kind === 'branch' || kind === 'secret') return ['down'];
  if (kind === 'rise') return ['west', 'east', 'up'];
  if (kind === 'drop') return ['west', 'east', 'down'];
  if (kind === 'vertical') return ['up', 'down'];
  if (kind === 'junction') return ['west', 'east', 'up'];
  return ['west', 'east'];
}

function makeChunkBlueprint(kind: StoryRoomTemplateKind, variant: number): StoryLevelBlueprintV1 {
  const id = `authored-${kind}-${variant + 1}`;
  const source = VARIANTS[variant];
  const connectors = defaultConnectors(kind);
  const boss = kind === 'boss';
  const safe = kind === 'entrance' || kind === 'exit';
  return {
    version: 1,
    id,
    kind: 'chunk',
    chunkRole: kind,
    grid: 0.25,
    bounds: [-12, 12, 0, boss ? 14 : 11],
    brief: {
      emotion: boss ? 'confrontational' : safe ? 'readable' : kind === 'secret' ? 'tempting' : 'tense',
      primaryMechanic: `${kind} chunk with ${source.rhythm} traversal`,
      difficulty: boss ? 5 : safe ? 1 : ['arena', 'vertical', 'junction'].includes(kind) ? 3 : 2,
      pacing: safe ? ['low', 'release'] : boss ? ['medium', 'high', 'high', 'release'] : ['low', 'medium', 'high', 'release'],
      heroLandmark: `${kind} silhouette ${variant + 1}`,
      playerDecision: source.decision,
      riskReward: ['branch', 'secret', 'event'].includes(kind) ? 'optional commitment earns a protected reward alcove' : 'maintaining the authored route preserves safety'
    },
    beats: [
      { id: `${id}-read`, kind: 'observation', bounds: [-12, -5, 0, 10], intensity: 0, required: true },
      { id: `${id}-challenge`, kind: boss ? 'boss' : kind === 'arena' ? 'combat' : kind === 'event' ? 'choice' : 'traversal', bounds: [-5, 7, 0, boss ? 14 : 10], intensity: boss ? 5 : safe ? 1 : 3, required: !['branch', 'secret', 'event'].includes(kind) },
      { id: `${id}-payoff`, kind: ['branch', 'secret', 'event'].includes(kind) ? 'reward' : 'exit', bounds: [7, 12, 0, 10], intensity: 0, required: true }
    ],
    routes: [
      { id: `${id}-critical`, beatIds: [`${id}-read`, `${id}-challenge`, `${id}-payoff`], critical: !['branch', 'secret', 'event'].includes(kind), requiredCapabilities: kind === 'vertical' ? ['climb'] : ['walk'] }
    ],
    geometry: [
      { id: `${id}-floor`, kind: 'solid', rect: [-12, -1, 24, 1], surfaceIntent: 'ground' },
      ...source.structures.map((rect, index) => ({ id: `${id}-structure-${index + 1}`, kind: 'solid' as const, rect, surfaceIntent: 'wall' as const })),
      ...source.ledges.map(([x, y, width], index) => ({ id: `${id}-ledge-${index + 1}`, kind: 'one-way' as const, rect: [x - width / 2, y, width, 0.5] as [number, number, number, number], surfaceIntent: 'ledge' as const }))
    ],
    connectors: connectors.map((edge) => ({
      id: `${id}-${edge}`,
      edge,
      point: edge === 'west' ? [-12, 1] : edge === 'east' ? [12, 1] : edge === 'up' ? [0, 10] : [0, 0],
      clearance: edge === 'up' || edge === 'down' ? [5, 3] : [4, 4],
      capabilities: edge === 'up' ? ['climb'] : edge === 'down' ? ['drop'] : ['walk'],
      route: ['branch', 'secret'].includes(kind) ? 'optional' : 'critical'
    })),
    slots: [
      { id: `${id}-enemy-left`, kind: 'enemy-lane', position: [-7, STORY_GROUNDED_ACTOR_CENTER_Y], semanticTags: [kind, 'left-lane'], route: kind === 'arena' || boss ? 'critical' : 'ambient' },
      { id: `${id}-enemy-right`, kind: 'enemy-lane', position: [6, STORY_GROUNDED_ACTOR_CENTER_Y], semanticTags: [kind, 'right-lane'], route: kind === 'arena' || boss ? 'critical' : 'ambient' },
      { id: `${id}-hazard`, kind: 'hazard', position: [variant % 2 ? -5.5 : 5.5, 0], bounds: [4, 1.2], semanticTags: [kind, 'telegraphed'], route: 'ambient' },
      { id: `${id}-reward`, kind: 'reward', position: [9, 1.05], semanticTags: [kind, 'protected-alcove'], route: ['branch', 'secret', 'event'].includes(kind) ? 'optional' : 'ambient' },
      { id: `${id}-prop-a`, kind: 'prop', position: [-10, 1.05], semanticTags: ['framing', kind, 'cluster-left'], route: 'ambient' },
      { id: `${id}-prop-b`, kind: 'prop', position: [-7.5, 1.05], semanticTags: ['clutter', kind, 'cluster-left'], route: 'ambient' },
      { id: `${id}-prop-c`, kind: 'prop', position: [7.5, 1.05], semanticTags: ['foliage', kind, 'cluster-right'], route: 'ambient' },
      { id: `${id}-prop-d`, kind: 'prop', position: [10, 1.05], semanticTags: ['framing', kind, 'cluster-right'], route: 'ambient' }
    ],
    visual: { paletteId: 'route', structuralMaterial: 'biome', heroRole: boss ? 'hero' : 'structural', densityBudget: boss ? 26 : 18, permittedAssetTags: [kind] },
    constraints: {
      entryClearance: 4,
      cameraHeight: boss ? 14 : 11,
      maximumEncounterEnemies: boss ? 1 : kind === 'arena' ? 3 : 2,
      mutation: { platformHeight: 0.35, platformWidth: [0.88, 1.12], hazardOffset: 1.2, propOffset: 1 },
      accessibilityProfiles: kind === 'vertical' ? ['base', 'climb'] : ['base']
    }
  };
}

export const STORY_ENDLESS_CHUNK_BLUEPRINTS: StoryLevelBlueprintV1[] = CHUNK_ROLES.flatMap((kind) =>
  VARIANTS.map((_, variant) => makeChunkBlueprint(kind, variant))
);

function connectorKey(connectors: StoryRoomConnector[]) {
  return [...connectors].sort().join('-');
}

export function storyAuthoredRoomTemplate(kind: StoryRoomTemplateKind, connectors: StoryRoomConnector[], ordinal: number): StoryRoomTemplateDefinition {
  const candidates = STORY_ENDLESS_CHUNK_BLUEPRINTS.filter((blueprint) => blueprint.chunkRole === kind);
  const blueprint = candidates[Math.abs(ordinal) % candidates.length] ?? STORY_ENDLESS_CHUNK_BLUEPRINTS[0];
  const ledges = blueprint.geometry.filter((geometry) => geometry.kind === 'one-way');
  const structures = blueprint.geometry.filter((geometry) => geometry.kind === 'solid' && geometry.surfaceIntent !== 'ground');
  const slots = blueprint.slots;
  return {
    id: `${blueprint.id}-${connectorKey(connectors) || 'cap'}`,
    kind,
    connectors,
    platformSockets: ledges.map((geometry) => [geometry.rect[0] + geometry.rect[2] / 2, geometry.rect[1], geometry.rect[2]]),
    structureSockets: structures.map((geometry) => [geometry.rect[0] + geometry.rect[2] / 2, geometry.rect[1] + geometry.rect[3] / 2, geometry.rect[2], geometry.rect[3]]),
    enemySockets: slots.filter((slot) => slot.kind === 'enemy-lane').map((slot) => slot.position),
    hazardSockets: slots.filter((slot) => slot.kind === 'hazard').map((slot) => slot.position),
    rewardSockets: slots.filter((slot) => slot.kind === 'reward').map((slot) => slot.position),
    propSockets: slots.filter((slot) => slot.kind === 'prop').map((slot) => slot.position),
    protectedCorridor: [-11, 11, 0, 2.2],
    mutationBounds: blueprint.constraints.mutation
  };
}

export function storyChunkCoverageErrors() {
  const errors: string[] = [];
  for (const role of CHUNK_ROLES) {
    const candidates = STORY_ENDLESS_CHUNK_BLUEPRINTS.filter((blueprint) => blueprint.chunkRole === role);
    if (candidates.length < 3) errors.push(`chunk-role:${role}:variants`);
  }
  if (STORY_ENDLESS_CHUNK_BLUEPRINTS.length < 48) errors.push('chunk-count');
  if (new Set(STORY_ENDLESS_CHUNK_BLUEPRINTS.map((blueprint) => blueprint.id)).size !== STORY_ENDLESS_CHUNK_BLUEPRINTS.length) errors.push('chunk-id');
  return errors;
}

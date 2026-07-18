import type { StoryAdventureMapRole, StoryAdventureWorldId, StoryWorldThemeId } from './types';
import type { StoryLevelBlueprintV1, StoryLevelDesignBrief } from './levelTypes';

type BiomeId = Exclude<StoryAdventureWorldId, 'world-route'>;

type SurfaceSignature = {
  heights: number[];
  widths: number[];
  mechanic: string;
  emotion: string;
  decision: string;
  riskReward: string;
};

const THEMES: Record<BiomeId, StoryWorldThemeId> = {
  greenhollow: 'village', thornwood: 'forest', ironroot: 'mine', bonevault: 'crypt',
  emberdeep: 'underworld', frostpeak: 'snow', sunscar: 'desert', skyglass: 'ruins'
};

const HEROES: Record<string, string> = {
  'greenhollow-arrival': 'Great Windmill', 'greenhollow-field-a': 'Copper Market Roofs', 'greenhollow-field-b': 'Old Water Wheel', 'greenhollow-mastery': 'Greenhollow Gate',
  'thornwood-arrival': 'Rootkeeper Camp', 'thornwood-field-a': 'Sleeping Giantroot', 'thornwood-field-b': 'Whisper Crown', 'thornwood-mastery': 'Heartwood Arch',
  'ironroot-arrival': 'Refuge Hoist', 'ironroot-field-a': 'Triple Rail Switch', 'ironroot-field-b': 'Drowned Lift', 'ironroot-mastery': 'Sunstone Heart',
  'bonevault-arrival': 'Keeper Doors', 'bonevault-field-a': 'Ossuary Gallery', 'bonevault-field-b': 'Bonevault Bell', 'bonevault-mastery': 'Violet Sepulcher',
  'emberdeep-arrival': 'Ash Beacon', 'emberdeep-field-a': 'Twin Lavafalls', 'emberdeep-field-b': 'Relic Anvil', 'emberdeep-mastery': 'Caldera Crown',
  'frostpeak-arrival': 'Last Hearth', 'frostpeak-field-a': 'Blue Ice Window', 'frostpeak-field-b': 'Windspine Flags', 'frostpeak-mastery': 'Frozen Watchtower',
  'sunscar-arrival': 'Sunscar Caravan', 'sunscar-field-a': 'Walking Dune', 'sunscar-field-b': 'Glasswater Palms', 'sunscar-mastery': 'Buried Sun Arch',
  'skyglass-arrival': 'Cloud Mooring', 'skyglass-field-a': 'Prismatic Bridge', 'skyglass-field-b': 'Orbit Tower', 'skyglass-mastery': 'Glass Crown'
};

/**
 * Thirty-two deliberate route silhouettes. Compact numeric notation keeps the
 * authored source reviewable while ensuring maps do not share a formulaic path.
 */
const SURFACE_SIGNATURES: Record<string, SurfaceSignature> = {
  'greenhollow-arrival': { heights: [3.0, 4.2, 3.4, 5.0], widths: [12, 10, 14, 9], mechanic: 'read safe rooftop landings', emotion: 'welcoming', decision: 'street or roof', riskReward: 'rooftops reveal a resource cluster' },
  'greenhollow-field-a': { heights: [4.1, 6.3, 4.8, 7.2, 5.1], widths: [9, 8, 12, 8, 10], mechanic: 'chain market awnings', emotion: 'lively', decision: 'fast high route or guarded stalls', riskReward: 'high route reaches the relic first' },
  'greenhollow-field-b': { heights: [3.6, 6.0, 8.2, 5.2, 3.8, 6.5], widths: [10, 8, 7, 12, 9, 8], mechanic: 'cross a controlled water channel', emotion: 'restless', decision: 'redirect current or commit to jumps', riskReward: 'water route hides the cache' },
  'greenhollow-mastery': { heights: [4.6, 7.8, 5.4, 9.2, 6.5, 10.2, 5.0], widths: [8, 7, 10, 7, 8, 7, 9], mechanic: 'combine roofs and current', emotion: 'resolute', decision: 'safe switchback or exposed crown', riskReward: 'crown route frames the gate relic' },

  'thornwood-arrival': { heights: [3.5, 5.4, 4.0, 6.1], widths: [11, 9, 13, 8], mechanic: 'recognize branch silhouettes', emotion: 'watchful', decision: 'forest floor or first branch', riskReward: 'branch route reveals a safe overlook' },
  'thornwood-field-a': { heights: [5.0, 7.2, 9.0, 6.0, 4.4], widths: [9, 8, 10, 9, 11], mechanic: 'ascend a giant root', emotion: 'ancient', decision: 'cross the crown or shelter below', riskReward: 'crown exposes reward and danger' },
  'thornwood-field-b': { heights: [4.2, 7.0, 10.0, 7.8, 11.0, 6.0], widths: [8, 9, 7, 10, 7, 9], mechanic: 'trade height for safety', emotion: 'mysterious', decision: 'canopy shortcut or thorn corridor', riskReward: 'canopy route contains the relic' },
  'thornwood-mastery': { heights: [5.2, 8.6, 6.2, 10.4, 12.0, 8.0, 5.4], widths: [8, 7, 9, 7, 8, 8, 10], mechanic: 'read rope and root routes', emotion: 'reverent', decision: 'central arch or hidden root loop', riskReward: 'hidden loop reaches Heartwood cache' },

  'ironroot-arrival': { heights: [3.2, 5.8, 4.4, 7.0], widths: [12, 8, 11, 8], mechanic: 'learn hoist landing rhythm', emotion: 'sheltered', decision: 'rail bed or timber ledges', riskReward: 'timber ledges reveal ore' },
  'ironroot-field-a': { heights: [4.0, 7.0, 5.0, 8.5, 5.8], widths: [9, 8, 11, 7, 10], mechanic: 'switch between three rail heights', emotion: 'industrial', decision: 'upper rail speed or lower rail cover', riskReward: 'upper switch holds the relic' },
  'ironroot-field-b': { heights: [5.0, 8.2, 10.4, 6.5, 4.2, 7.6], widths: [8, 7, 8, 10, 9, 8], mechanic: 'descend beside flooded machinery', emotion: 'claustrophobic', decision: 'dive shortcut or dry detour', riskReward: 'flooded alcove holds the cache' },
  'ironroot-mastery': { heights: [4.8, 8.0, 11.0, 7.0, 10.0, 12.2, 6.0], widths: [8, 7, 7, 9, 8, 7, 10], mechanic: 'combine lift timing and breakable routes', emotion: 'triumphant', decision: 'operate lift or break side wall', riskReward: 'side vault contains Sunstone reward' },

  'bonevault-arrival': { heights: [4.0, 5.6, 3.8, 6.8], widths: [11, 9, 12, 8], mechanic: 'read bell-safe floor markings', emotion: 'solemn', decision: 'nave floor or alcove ledges', riskReward: 'alcoves reveal lore' },
  'bonevault-field-a': { heights: [4.8, 7.4, 5.2, 8.0, 4.5], widths: [9, 8, 10, 8, 11], mechanic: 'cross narrow ossuary shelves', emotion: 'uneasy', decision: 'central procession or side crypts', riskReward: 'side crypt holds the relic' },
  'bonevault-field-b': { heights: [3.8, 6.8, 9.5, 7.0, 10.5, 5.0], widths: [10, 8, 7, 9, 7, 10], mechanic: 'move on the bell cadence', emotion: 'foreboding', decision: 'wait for stable floors or rush', riskReward: 'fast cadence reaches bonus cache' },
  'bonevault-mastery': { heights: [5.0, 8.0, 6.0, 10.0, 7.5, 11.5, 5.8], widths: [8, 8, 9, 7, 8, 7, 9], mechanic: 'combine falling floors and saw spacing', emotion: 'haunted', decision: 'violet nave or unmarked tomb loop', riskReward: 'tomb loop contains mastery relic' },

  'emberdeep-arrival': { heights: [3.6, 6.0, 4.6, 7.2], widths: [11, 8, 12, 8], mechanic: 'read vent telegraphs', emotion: 'oppressive', decision: 'basalt floor or warm updraft', riskReward: 'updraft reveals a safe cache' },
  'emberdeep-field-a': { heights: [5.0, 8.0, 6.2, 9.4, 5.2], widths: [8, 8, 10, 7, 10], mechanic: 'cross lavafall islands', emotion: 'volatile', decision: 'wait for pulse or ride vent', riskReward: 'vent route reaches rare ore' },
  'emberdeep-field-b': { heights: [4.2, 7.5, 10.2, 6.8, 9.0, 5.5], widths: [9, 7, 8, 9, 8, 10], mechanic: 'operate forge pressure', emotion: 'mechanical', decision: 'cool machinery or accept heat', riskReward: 'hot route doubles reward exposure' },
  'emberdeep-mastery': { heights: [5.4, 9.0, 6.5, 11.0, 8.0, 12.5, 6.0], widths: [8, 7, 9, 7, 8, 7, 9], mechanic: 'chain updrafts over lava', emotion: 'cataclysmic', decision: 'outer rim or caldera crown', riskReward: 'crown route contains mastery relic' },

  'frostpeak-arrival': { heights: [3.8, 5.2, 4.0, 6.6], widths: [12, 10, 11, 8], mechanic: 'learn low-friction stopping', emotion: 'quiet', decision: 'shelter line or icy shelf', riskReward: 'icy shelf reveals crystals' },
  'frostpeak-field-a': { heights: [4.6, 7.0, 9.2, 6.0, 4.2], widths: [9, 8, 8, 10, 11], mechanic: 'climb sheltered ice shelves', emotion: 'enclosed', decision: 'short slippery line or stable climb', riskReward: 'slippery line reaches relic' },
  'frostpeak-field-b': { heights: [5.0, 8.4, 6.2, 10.2, 7.0, 11.2], widths: [8, 7, 9, 7, 8, 7], mechanic: 'commit across wind-exposed ridges', emotion: 'exposed', decision: 'leeward switchback or wind spine', riskReward: 'wind spine holds cache' },
  'frostpeak-mastery': { heights: [4.8, 7.8, 10.8, 8.0, 12.0, 9.0, 6.0], widths: [9, 8, 7, 8, 7, 8, 10], mechanic: 'combine ice momentum and climbing', emotion: 'majestic', decision: 'tower interior or outer flags', riskReward: 'outer flags lead to mastery relic' },

  'sunscar-arrival': { heights: [3.2, 4.8, 3.6, 6.0], widths: [13, 10, 12, 9], mechanic: 'read stable stone in sand', emotion: 'open', decision: 'caravan shade or dune crest', riskReward: 'crest reveals oasis direction' },
  'sunscar-field-a': { heights: [4.0, 6.5, 4.8, 8.0, 5.5], widths: [10, 8, 11, 8, 10], mechanic: 'cross shifting dune banks', emotion: 'disorienting', decision: 'moving crest or buried markers', riskReward: 'crest reaches relic quickly' },
  'sunscar-field-b': { heights: [3.8, 7.0, 9.4, 5.6, 8.2, 4.5], widths: [9, 8, 7, 11, 8, 10], mechanic: 'move above and below oasis water', emotion: 'serene', decision: 'palms above or architecture below', riskReward: 'submerged route hides cache' },
  'sunscar-mastery': { heights: [5.0, 8.0, 6.0, 10.0, 7.2, 11.8, 5.8], widths: [8, 8, 9, 7, 8, 7, 10], mechanic: 'break walls to reveal the true route', emotion: 'monumental', decision: 'sun arch or buried chamber', riskReward: 'buried chamber contains relic' },

  'skyglass-arrival': { heights: [4.0, 6.2, 4.8, 7.4], widths: [11, 9, 10, 8], mechanic: 'read stable hovering stones', emotion: 'weightless', decision: 'low stones or calm updraft', riskReward: 'updraft reveals crystal cluster' },
  'skyglass-field-a': { heights: [5.0, 8.0, 6.0, 9.5, 5.2], widths: [8, 8, 10, 7, 10], mechanic: 'cross a fractured crystal span', emotion: 'delicate', decision: 'chime-stabilized route or leap gaps', riskReward: 'leap route reaches relic' },
  'skyglass-field-b': { heights: [4.5, 7.5, 10.5, 8.0, 11.5, 6.0], widths: [9, 7, 7, 8, 7, 10], mechanic: 'orbit around a hollow tower', emotion: 'vertiginous', decision: 'inner moving floors or outer glide', riskReward: 'outer orbit holds cache' },
  'skyglass-mastery': { heights: [5.5, 9.0, 6.5, 11.0, 8.0, 12.5, 6.2], widths: [8, 7, 9, 7, 8, 7, 9], mechanic: 'chain moving floors and updrafts', emotion: 'transcendent', decision: 'sanctum spine or glass crown loop', riskReward: 'crown loop contains mastery relic' }
};

const ROLES: StoryAdventureMapRole[] = ['arrival', 'field-a', 'field-b', 'mastery'];
const BIOMES = Object.keys(THEMES) as BiomeId[];

function snap(value: number) {
  return Math.round(value * 4) / 4;
}

function makeSurfaceBlueprint(biomeId: BiomeId, mapRole: StoryAdventureMapRole): StoryLevelBlueprintV1 {
  const id = `${biomeId}-${mapRole}`;
  const signature = SURFACE_SIGNATURES[id];
  const platformCount = signature.heights.length;
  const step = 88 / Math.max(1, platformCount - 1);
  const platformXs = signature.heights.map((_, index) => snap(-44 + index * step));
  const difficulty = (ROLES.indexOf(mapRole) + 1) as 1 | 2 | 3 | 4;
  const brief: StoryLevelDesignBrief = {
    emotion: signature.emotion,
    primaryMechanic: signature.mechanic,
    difficulty,
    pacing: mapRole === 'arrival' ? ['low', 'medium', 'release'] : mapRole === 'mastery' ? ['medium', 'high', 'release', 'high'] : ['low', 'medium', 'high', 'release'],
    heroLandmark: HEROES[id],
    playerDecision: signature.decision,
    riskReward: signature.riskReward
  };
  const beatKinds = mapRole === 'arrival'
    ? ['entrance', 'observation', 'traversal', 'respite', 'exit'] as const
    : mapRole === 'mastery'
      ? ['entrance', 'combat', 'choice', 'traversal', 'boss', 'reward', 'exit'] as const
      : ['entrance', 'combat', 'choice', 'traversal', 'reward', 'exit'] as const;
  const beatWidth = 104 / beatKinds.length;
  const beats = beatKinds.map((kind, index) => ({
    id: `${id}-beat-${kind}-${index + 1}`,
    kind,
    bounds: [-52 + index * beatWidth, -52 + (index + 1) * beatWidth, 0, 14] as [number, number, number, number],
    intensity: (kind === 'boss' ? 5 : kind === 'combat' ? 3 : kind === 'traversal' ? difficulty : kind === 'respite' || kind === 'entrance' ? 0 : 1) as 0 | 1 | 2 | 3 | 4 | 5,
    required: kind !== 'reward'
  }));
  const propTags = biomeId === 'greenhollow' ? ['settlement'] : biomeId === 'thornwood' ? ['tree'] : biomeId === 'ironroot' ? ['stone'] : biomeId === 'bonevault' ? ['tomb'] : biomeId === 'emberdeep' ? ['basalt'] : biomeId === 'frostpeak' ? ['snow'] : biomeId === 'sunscar' ? ['caravan'] : ['glass'];
  const propSlots = platformXs.flatMap((x, platformIndex) => {
    if (Math.abs(x) < 8) return [];
    const clusterSide = x < 0 ? 'cluster-left' : 'cluster-right';
    const offsets = platformIndex % 2 === 0 ? [-2.5, 1.75] : [0];
    return offsets.map((offset, clusterIndex) => ({
      id: `${id}-prop-${platformIndex + 1}-${clusterIndex + 1}`,
      kind: 'prop' as const,
      position: [snap(x + offset), 0] as [number, number],
      semanticTags: [...propTags, clusterIndex === 0 && platformIndex % 3 === 0 ? 'framing' : clusterIndex === 1 ? 'foliage' : 'clutter', clusterSide, platformIndex === 0 ? 'entrance' : 'path'],
      route: 'ambient' as const
    }));
  });
  return {
    version: 1,
    id,
    kind: 'surface',
    biomeId,
    mapRole,
    grid: 0.25,
    bounds: [-56, 56, 0, 14],
    brief,
    beats,
    routes: [
      { id: `${id}-critical`, beatIds: beats.filter((beat) => beat.kind !== 'reward').map((beat) => beat.id), critical: true, requiredCapabilities: ['walk'] },
      ...(beats.some((beat) => ['choice', 'reward'].includes(beat.kind)) ? [{ id: `${id}-optional`, beatIds: beats.filter((beat) => ['choice', 'reward'].includes(beat.kind)).map((beat) => beat.id), critical: false, requiredCapabilities: mapRole === 'mastery' ? ['climb' as const] : ['walk' as const] }] : [])
    ],
    geometry: [
      { id: `${id}-ground`, kind: 'solid', rect: [-57, -1, 114, 1], surfaceIntent: 'ground' },
      ...signature.heights.map((height, index) => ({ id: `${id}-ledge-${index + 1}`, kind: 'one-way' as const, rect: [snap(platformXs[index] - signature.widths[index] / 2), snap(height), snap(signature.widths[index]), 0.5] as [number, number, number, number], surfaceIntent: 'ledge' as const }))
    ],
    connectors: [
      { id: `${id}-west`, edge: 'west', point: [-53, 1], clearance: [5, 4], capabilities: ['walk'], route: 'critical' },
      { id: `${id}-east`, edge: 'east', point: [53, 1], clearance: [5, 4], capabilities: ['walk'], route: 'critical' }
    ],
    slots: [
      { id: `${id}-hero-slot`, kind: 'landmark', position: [0, mapRole === 'mastery' ? 9 : 6.5], beatId: beats[Math.floor(beats.length / 2)].id, semanticTags: [...propTags, 'landmark'], route: 'ambient' },
      ...propSlots
    ],
    visual: { paletteId: THEMES[biomeId], structuralMaterial: THEMES[biomeId], heroRole: 'hero', densityBudget: mapRole === 'arrival' ? 18 : mapRole === 'mastery' ? 28 : 24, permittedAssetTags: propTags },
    constraints: {
      entryClearance: 7,
      cameraHeight: 14,
      maximumEncounterEnemies: mapRole === 'arrival' ? 0 : mapRole === 'mastery' ? 3 : 2,
      mutation: { platformHeight: 0, platformWidth: [1, 1], hazardOffset: 0, propOffset: 0.75 },
      accessibilityProfiles: ['base']
    }
  };
}

export const STORY_SURFACE_LEVEL_BLUEPRINTS: Record<string, StoryLevelBlueprintV1> = Object.fromEntries(
  BIOMES.flatMap((biomeId) => ROLES.map((role) => {
    const blueprint = makeSurfaceBlueprint(biomeId, role);
    return [blueprint.id, blueprint];
  }))
);

export function getStorySurfaceLevelBlueprint(biomeId: BiomeId, role: StoryAdventureMapRole) {
  return STORY_SURFACE_LEVEL_BLUEPRINTS[`${biomeId}-${role}`];
}

export function storySurfaceRouteSignature(blueprint: StoryLevelBlueprintV1) {
  return blueprint.geometry.filter((geometry) => geometry.kind === 'one-way').map((geometry) => `${geometry.rect[0]}:${geometry.rect[1]}:${geometry.rect[2]}`).join('|');
}

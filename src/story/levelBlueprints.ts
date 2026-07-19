import type { StoryAdventureMapRole, StoryAdventureWorldId, StoryWorldThemeId } from './types';
import type { StoryLevelBlueprintV2, StoryLevelDesignBrief, StoryLevelGeometryV2, StoryLevelSlot } from './levelTypes';

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

const TERRAIN_FAMILIES: Record<BiomeId, string> = {
  greenhollow: 'gothic-town', thornwood: 'thornwood', ironroot: 'warped-caves', bonevault: 'gothic-cemetery',
  emberdeep: 'emberdeep', frostpeak: 'sunnyland-winter', sunscar: 'yeehaw', skyglass: 'skyglass'
};

const ENCLOSURE_STYLES: Record<BiomeId, string> = {
  greenhollow: 'rooftops-town-walls', thornwood: 'canopy-roots-overhangs', ironroot: 'reinforced-mine-shafts', bonevault: 'crypt-arches-ossuary',
  emberdeep: 'basalt-forge-caverns', frostpeak: 'ice-cliffs-shelters', sunscar: 'sandstone-frontier-architecture', skyglass: 'glass-arches-sanctums'
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

function makeSurfaceBlueprint(biomeId: BiomeId, mapRole: StoryAdventureMapRole): StoryLevelBlueprintV2 {
  const id = `${biomeId}-${mapRole}`;
  const signature = SURFACE_SIGNATURES[id];
  const platformCount = signature.heights.length;
  const step = 96 / Math.max(1, platformCount - 1);
  const platformXs = signature.heights.map((_, index) => snap(-48 + index * step));
  const difficulty = (ROLES.indexOf(mapRole) + 1) as 1 | 2 | 3 | 4;
  const biomeIndex = BIOMES.indexOf(biomeId);
  const roleIndex = ROLES.indexOf(mapRole);
  const tiers: Array<0 | 1 | 2> = [((biomeIndex + roleIndex) % 3) as 0 | 1 | 2];
  for (let index = 1; index < signature.heights.length; index += 1) {
    const delta = signature.heights[index] > signature.heights[index - 1] + 0.35 ? 1 : signature.heights[index] < signature.heights[index - 1] - 0.35 ? -1 : (index + biomeIndex) % 2 ? 1 : -1;
    let next = tiers[index - 1] + delta;
    if (next < 0 || next > 2) next = tiers[index - 1] - delta;
    tiers.push(Math.max(0, Math.min(2, next)) as 0 | 1 | 2);
  }
  const floorY = (tier: number) => 2 + tier * 10;
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
  const beats = beatKinds.map((kind, index) => ({
    id: `${id}-beat-${kind}-${index + 1}`,
    kind,
    bounds: (() => {
      const routeIndex = Math.min(platformCount - 1, Math.round(index / Math.max(1, beatKinds.length - 1) * (platformCount - 1)));
      return [platformXs[routeIndex] - 7, platformXs[routeIndex] + 7, floorY(tiers[routeIndex]), floorY(tiers[routeIndex]) + 8] as [number, number, number, number];
    })(),
    intensity: (kind === 'boss' ? 5 : kind === 'combat' ? 3 : kind === 'traversal' ? difficulty : kind === 'respite' || kind === 'entrance' ? 0 : 1) as 0 | 1 | 2 | 3 | 4 | 5,
    required: kind !== 'reward'
  }));
  const propTags = biomeId === 'greenhollow' ? ['settlement'] : biomeId === 'thornwood' ? ['tree'] : biomeId === 'ironroot' ? ['stone'] : biomeId === 'bonevault' ? ['tomb'] : biomeId === 'emberdeep' ? ['basalt'] : biomeId === 'frostpeak' ? ['snow'] : biomeId === 'sunscar' ? ['caravan'] : ['glass'];
  const propSlots: StoryLevelSlot[] = platformXs.flatMap((x, platformIndex) => {
    const clusterSide = x < 0 ? 'cluster-left' : 'cluster-right';
    const offsets = platformIndex % 2 === 0 ? [-2.5, 1.75] : [0];
    return offsets.map((offset, clusterIndex) => ({
      id: `${id}-prop-${platformIndex + 1}-${clusterIndex + 1}`,
      kind: 'prop' as const,
      position: [snap(x + offset), floorY(tiers[platformIndex]) + 0.82] as [number, number],
      semanticTags: [...propTags, clusterIndex === 0 && platformIndex % 3 === 0 ? 'framing' : clusterIndex === 1 ? 'foliage' : 'clutter', clusterSide, platformIndex === 0 ? 'entrance' : 'path'],
      route: 'ambient' as const
    }));
  });
  const semanticGameplaySlots: StoryLevelSlot[] = platformXs.flatMap((x, platformIndex) => {
    const y = floorY(tiers[platformIndex]) + 0.82;
    return [
      { id: `${id}-enemy-slot-${platformIndex + 1}`, kind: 'enemy-lane' as const, position: [x - 3, y] as [number, number], semanticTags: [propTags[0], 'readable-lane', `beat-${platformIndex + 1}`], route: 'critical' as const },
      { id: `${id}-traversal-slot-${platformIndex + 1}`, kind: 'traversal' as const, position: [x, y + 2] as [number, number], semanticTags: [propTags[0], 'vertical-link', `beat-${platformIndex + 1}`], route: 'critical' as const },
      { id: `${id}-resource-slot-${platformIndex + 1}`, kind: 'resource' as const, position: [x + (platformIndex % 2 ? 4 : -4), y] as [number, number], semanticTags: [propTags[0], 'harvest-cluster', `beat-${platformIndex + 1}`], route: 'ambient' as const },
      ...(platformIndex > 0 && platformIndex < platformCount - 1 ? [{ id: `${id}-hazard-slot-${platformIndex + 1}`, kind: 'hazard' as const, position: [x + 3, y] as [number, number], semanticTags: [propTags[0], 'telegraphed', `beat-${platformIndex + 1}`], route: 'critical' as const }] : [])
    ];
  });
  const optionalIndex = 1 + (biomeIndex * 3 + roleIndex) % Math.max(1, platformCount - 2);
  const optionalTier = ((tiers[optionalIndex] + (tiers[optionalIndex] === 2 ? -1 : 1)) as 0 | 1 | 2);
  const optionalY = floorY(optionalTier);
  const npcIndices = [0, Math.floor((platformCount - 1) / 2), platformCount - 1];
  const npcSlots: StoryLevelSlot[] = npcIndices.map((platformIndex, index) => {
    const x = platformXs[platformIndex] + (platformIndex === optionalIndex ? -5 : 0);
    return { id: `${id}-npc-slot-${index + 1}`, kind: 'npc', position: [x, floorY(tiers[platformIndex]) + 0.82], semanticTags: [propTags[0], 'safe-conversation', `npc-${index + 1}`], route: 'ambient' };
  });
  const geometry: StoryLevelGeometryV2[] = [];
  for (let index = 0; index < platformCount; index += 1) {
    const baseY = floorY(tiers[index]);
    const roomWidth = snap(Math.max(16, Math.min(22, signature.widths[index] + 8)));
    geometry.push({ id: `${id}-room-${index + 1}`, kind: 'carve', rect: [snap(platformXs[index] - roomWidth / 2), baseY, roomWidth, 8], surfaceIntent: 'air' });
    geometry.push({ id: `${id}-ledge-${index + 1}`, kind: 'one-way', rect: [snap(platformXs[index] - Math.min(8, signature.widths[index]) / 2), baseY + 4.25 + (index % 2) * 0.5, Math.min(8, signature.widths[index]), 0.5], surfaceIntent: 'ledge' });
    if (index === 0) continue;
    const priorX = platformXs[index - 1];
    const priorY = floorY(tiers[index - 1]);
    const midpoint = snap((priorX + platformXs[index]) / 2);
    if (priorY === baseY) {
      geometry.push({ id: `${id}-corridor-${index}`, kind: 'carve', rect: [priorX, baseY, platformXs[index] - priorX, 6], surfaceIntent: 'air' });
    } else {
      // Eight-unit shafts leave enough room for the avatar to clear a ledge and
      // steer toward the next step. The former four-unit carve became a pair of
      // opposing collision walls after grid snapping and could trap players.
      geometry.push({ id: `${id}-corridor-${index}-a`, kind: 'carve', rect: [priorX, priorY, midpoint - priorX + 4, 6], surfaceIntent: 'air' });
      geometry.push({ id: `${id}-shaft-${index}`, kind: 'carve', rect: [midpoint - 4, Math.min(priorY, baseY), 8, Math.abs(baseY - priorY) + 8], surfaceIntent: 'air' });
      geometry.push({ id: `${id}-corridor-${index}-b`, kind: 'carve', rect: [midpoint - 4, baseY, platformXs[index] - midpoint + 4, 6], surfaceIntent: 'air' });
      const lowerY = Math.min(priorY, baseY);
      const upperStepX = baseY > priorY ? midpoint - 1 : midpoint - 4;
      geometry.push({ id: `${id}-shaft-step-${index}-1`, kind: 'one-way', rect: [midpoint - 4, lowerY + 3, 8, 0.5], surfaceIntent: 'ledge' });
      geometry.push({ id: `${id}-shaft-step-${index}-2`, kind: 'one-way', rect: [upperStepX, lowerY + 6, 5, 0.5], surfaceIntent: 'ledge' });
    }
  }
  const optionalWidth = 14 + (biomeIndex * ROLES.length + roleIndex) * 0.25;
  geometry.push({ id: `${id}-optional-room`, kind: 'carve', rect: [snap(platformXs[optionalIndex] - optionalWidth / 2), optionalY, optionalWidth, 7], surfaceIntent: 'air' });
  geometry.push({ id: `${id}-optional-shaft`, kind: 'carve', rect: [platformXs[optionalIndex] - 2, Math.min(optionalY, floorY(tiers[optionalIndex])), 4, Math.abs(optionalY - floorY(tiers[optionalIndex])) + 7], surfaceIntent: 'air' });
  return {
    version: 2,
    id,
    kind: 'surface',
    biomeId,
    mapRole,
    grid: 0.25,
    bounds: [-60, 60, 0, 36],
    terrain: { cellSize: 2, perimeterCells: 1 },
    brief,
    beats,
    routes: [
      { id: `${id}-critical`, beatIds: beats.filter((beat) => beat.kind !== 'reward').map((beat) => beat.id), critical: true, requiredCapabilities: ['walk'] },
      ...(beats.some((beat) => ['choice', 'reward'].includes(beat.kind)) ? [{ id: `${id}-optional`, beatIds: beats.filter((beat) => ['choice', 'reward'].includes(beat.kind)).map((beat) => beat.id), critical: false, requiredCapabilities: mapRole === 'mastery' ? ['climb' as const] : ['walk' as const] }] : [])
    ],
    geometry,
    connectors: [
      { id: `${id}-west`, edge: 'west', point: [-56, floorY(tiers[0]) + 1], clearance: [5, 4], capabilities: ['walk'], route: 'critical' },
      { id: `${id}-east`, edge: 'east', point: [56, floorY(tiers[tiers.length - 1]) + 1], clearance: [5, 4], capabilities: ['walk'], route: 'critical' }
    ],
    slots: [
      { id: `${id}-hero-slot`, kind: 'landmark', position: [platformXs[Math.floor(platformCount / 2)], floorY(tiers[Math.floor(platformCount / 2)]) + 4], beatId: beats[Math.floor(beats.length / 2)].id, semanticTags: [...propTags, 'landmark'], route: 'ambient' },
      { id: `${id}-west-portal-slot`, kind: 'portal', position: [-56, floorY(tiers[0]) + 0.82], semanticTags: [propTags[0], 'entrance', 'protected'], route: 'critical' },
      { id: `${id}-east-portal-slot`, kind: 'portal', position: [56, floorY(tiers[tiers.length - 1]) + 0.82], semanticTags: [propTags[0], 'exit', 'protected'], route: 'critical' },
      ...npcSlots,
      { id: `${id}-reward-slot`, kind: 'reward', position: [platformXs[optionalIndex], optionalY + 0.82], semanticTags: [propTags[0], 'optional-payoff', 'protected'], route: 'optional' },
      ...semanticGameplaySlots,
      ...propSlots
    ],
    visual: {
      paletteId: THEMES[biomeId], structuralMaterial: THEMES[biomeId], heroRole: 'hero',
      densityBudget: mapRole === 'arrival' ? 24 : mapRole === 'mastery' ? 28 : 24,
      permittedAssetTags: propTags, enclosureStyle: ENCLOSURE_STYLES[biomeId], defaultCavityMaterial: 'background-rock',
      skyWindowRegions: platformXs.flatMap((x, index) => tiers[index] === 2 && (index + roleIndex) % 2 === 0 ? [[x - 6, floorY(tiers[index]) + 4, 12, 4] as [number, number, number, number]] : []),
      landmarkFramingRegions: [[platformXs[Math.floor(platformCount / 2)] - 8, floorY(tiers[Math.floor(platformCount / 2)]), 16, 8]],
      dressingClusterAnchors: platformXs.filter((_, index) => index % 2 === 0).map((x, index) => [x, floorY(tiers[index * 2])] as [number, number]),
      permittedTerrainFamilies: [TERRAIN_FAMILIES[biomeId]], permittedPropFamilies: [TERRAIN_FAMILIES[biomeId]]
    },
    constraints: {
      entryClearance: 7,
      cameraHeight: 16,
      maximumEncounterEnemies: mapRole === 'arrival' ? 0 : mapRole === 'mastery' ? 3 : 2,
      mutation: { platformHeight: 0, platformWidth: [1, 1], hazardOffset: 0, propOffset: 0.75 },
      accessibilityProfiles: ['base']
    }
  };
}

export const STORY_SURFACE_LEVEL_BLUEPRINTS: Record<string, StoryLevelBlueprintV2> = Object.fromEntries(
  BIOMES.flatMap((biomeId) => ROLES.map((role) => {
    const blueprint = makeSurfaceBlueprint(biomeId, role);
    return [blueprint.id, blueprint];
  }))
);

export function getStorySurfaceLevelBlueprint(biomeId: BiomeId, role: StoryAdventureMapRole) {
  return STORY_SURFACE_LEVEL_BLUEPRINTS[`${biomeId}-${role}`];
}

export function storySurfaceRouteSignature(blueprint: StoryLevelBlueprintV2) {
  return blueprint.geometry.filter((geometry) => geometry.kind === 'carve').map((geometry) => `${geometry.rect[0]}:${geometry.rect[1]}:${geometry.rect[2]}:${geometry.rect[3]}`).join('|');
}

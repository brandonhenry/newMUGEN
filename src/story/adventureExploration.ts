import type {
  StoryAdventureExplorationDefinition,
  StoryAdventureRunGraph,
  StoryAdventureWorldId,
  StoryDepthTemplateDefinition,
  StoryDepthZoneKind,
  StoryGeneratedDepthLink,
  StoryGeneratedDepthZone,
  StoryMountDefinition,
  StoryMountId,
  StoryTraversalKind
} from './types';

export const STORY_DEPTH_GENERATION_VERSION = 2 as const;
export const STORY_DEPTH_ZONE_MIN = 6;
export const STORY_DEPTH_ZONE_MAX = 10;
export const STORY_PARTY_MAX_MEMBERS = 4;
export const STORY_PARTY_RECONNECT_TTL_MS = 30 * 60 * 1000;
export const STORY_MAX_ACTIVE_ENEMIES = 5;
export const STORY_MAX_BREATH = 100;
export const STORY_BREATH_DRAIN_PER_SECOND = 10;
export const STORY_BREATH_REFILL_PER_SECOND = 32;

export const STORY_MOUNTS: Record<StoryMountId, StoryMountDefinition> = {
  'verdant-stag': { id: 'verdant-stag', worldId: 'greenhollow', label: 'Verdant Stag', ability: 'Clearing Leap', traversal: ['walk'], speedMultiplier: 1.55, jumpMultiplier: 1.35, footAnchor: [0.5, 0], riderOffset: [0, 1.02], accent: '#7ee787' },
  'bramble-lynx': { id: 'bramble-lynx', worldId: 'thornwood', label: 'Bramble Lynx', ability: 'Root Climb', traversal: ['walk', 'climb'], speedMultiplier: 1.42, jumpMultiplier: 1.25, footAnchor: [0.5, 0], riderOffset: [0, 0.92], accent: '#52e1a1' },
  'ironhorn-beetle': { id: 'ironhorn-beetle', worldId: 'ironroot', label: 'Ironhorn Beetle', ability: 'Stonebreaker', traversal: ['walk', 'break-wall'], speedMultiplier: 1.28, jumpMultiplier: 0.9, footAnchor: [0.5, 0], riderOffset: [0, 0.88], accent: '#d9a066' },
  'pale-warg': { id: 'pale-warg', worldId: 'bonevault', label: 'Pale Warg', ability: 'Veil Sense', traversal: ['walk'], speedMultiplier: 1.48, jumpMultiplier: 1.12, footAnchor: [0.5, 0], riderOffset: [0, 0.94], accent: '#b8a8ff' },
  'cinder-drake': { id: 'cinder-drake', worldId: 'emberdeep', label: 'Cinder Drake', ability: 'Ember Glide', traversal: ['walk', 'glide'], speedMultiplier: 1.4, jumpMultiplier: 1.18, footAnchor: [0.5, 0], riderOffset: [0, 1.05], accent: '#ff6b45' },
  'frost-ram': { id: 'frost-ram', worldId: 'frostpeak', label: 'Frost Ram', ability: 'Summit Vault', traversal: ['walk', 'climb'], speedMultiplier: 1.36, jumpMultiplier: 1.48, footAnchor: [0.5, 0], riderOffset: [0, 0.98], accent: '#8ee8ff' },
  'dune-strider': { id: 'dune-strider', worldId: 'sunscar', label: 'Dune Strider', ability: 'Buried Path', traversal: ['walk'], speedMultiplier: 1.62, jumpMultiplier: 1.12, footAnchor: [0.5, 0], riderOffset: [0, 1], accent: '#ffd166' },
  glasswing: { id: 'glasswing', worldId: 'skyglass', label: 'Glasswing', ability: 'Updraft Sail', traversal: ['walk', 'glide', 'updraft'], speedMultiplier: 1.44, jumpMultiplier: 1.2, footAnchor: [0.5, 0], riderOffset: [0, 1.08], accent: '#ff83d1' }
};

export const STORY_WORLD_MOUNT: Record<Exclude<StoryAdventureWorldId, 'world-route'>, StoryMountId> = Object.values(STORY_MOUNTS).reduce((result, mount) => {
  result[mount.worldId] = mount.id;
  return result;
}, {} as Record<Exclude<StoryAdventureWorldId, 'world-route'>, StoryMountId>);

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFromSeed(seed: string) {
  let state = hashString(seed) || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function weightedTemplate(templates: StoryDepthTemplateDefinition[], random: () => number): StoryDepthTemplateDefinition {
  const total = templates.reduce((sum, template) => sum + template.weight, 0);
  let cursor = random() * total;
  for (const template of templates) {
    cursor -= template.weight;
    if (cursor <= 0) return template;
  }
  return templates[templates.length - 1];
}

function traversalFor(template: StoryDepthTemplateDefinition, random: () => number): StoryTraversalKind {
  return template.traversal[Math.floor(random() * template.traversal.length)] ?? 'walk';
}

export function createAdventureVisitSeed(worldId: Exclude<StoryAdventureWorldId, 'world-route'>, visitId: string, partyInstanceId = 'solo') {
  return `kore-depth-v${STORY_DEPTH_GENERATION_VERSION}:${worldId}:${partyInstanceId}:${visitId}`;
}

export function generateAdventureRunGraph(
  worldId: Exclude<StoryAdventureWorldId, 'world-route'>,
  seed: string,
  exploration: StoryAdventureExplorationDefinition
): StoryAdventureRunGraph {
  const random = randomFromSeed(`${worldId}:${seed}:${STORY_DEPTH_GENERATION_VERSION}`);
  const zoneCount = STORY_DEPTH_ZONE_MIN + Math.floor(random() * (STORY_DEPTH_ZONE_MAX - STORY_DEPTH_ZONE_MIN + 1));
  const minimumCriticalZones = Math.max(4, zoneCount - 4);
  const maximumCriticalZones = Math.min(6, zoneCount - 2);
  const criticalZoneCount = minimumCriticalZones + Math.floor(random() * (maximumCriticalZones - minimumCriticalZones + 1));
  const criticalLastIndex = criticalZoneCount - 1;
  const sanctuaryIndex = Math.max(1, criticalLastIndex - 1);
  const templates = exploration.depthTemplates.length > 0 ? exploration.depthTemplates : [{ id: 'fallback-cave', kind: 'cave' as const, weight: 1, traversal: ['walk' as const] }];
  const zones: StoryGeneratedDepthZone[] = [];
  const links: StoryGeneratedDepthLink[] = [];

  for (let index = 0; index < zoneCount; index += 1) {
    const isSanctuary = index === sanctuaryIndex;
    const isFinale = index === criticalLastIndex;
    const template = isSanctuary
      ? ({ id: 'sanctuary', kind: 'sanctuary', weight: 1, traversal: [exploration.mountSanctuary.challenge] } satisfies StoryDepthTemplateDefinition)
      : weightedTemplate(templates, random);
    const traversal = traversalFor(template, random);
    const depth = index <= criticalLastIndex ? index : 1 + Math.floor(random() * Math.max(1, criticalLastIndex - 1));
    const width = 28 + Math.floor(random() * 17);
    const minY = template.kind === 'tower' ? -4 : template.underwater ? -12 : -8;
    const maxY = template.kind === 'tower' ? 26 : template.kind === 'cave' || template.kind === 'mine' ? 14 : 18;
    const previousDifficulty = zones[index - 1]?.difficulty ?? 1;
    const requestedDifficulty = isSanctuary ? 1 : isFinale ? 5 : template.difficulty ?? Math.min(4, 1 + Math.floor(index / 2)) as 1 | 2 | 3 | 4;
    const difficulty = (previousDifficulty >= 4 && requestedDifficulty >= 4 ? 3 : requestedDifficulty) as 1 | 2 | 3 | 4 | 5;
    zones.push({
      id: `${worldId}-depth-${index + 1}`,
      index,
      kind: template.kind,
      depth,
      critical: index <= criticalLastIndex,
      hidden: index > criticalLastIndex && index === zoneCount - 1,
      finale: isFinale,
      difficulty,
      underwater: Boolean(template.underwater),
      traversal,
      camera: { minX: -width / 2, maxX: width / 2, minY, maxY },
      airPockets: template.underwater ? [[-width * 0.28, 5], [width * 0.25, 7]] : [],
      roomTemplateId: template.id,
      geometrySeed: Math.floor(random() * 0x7fffffff),
      enemyLanes: template.enemyLanes ?? [[-width * 0.3, -2], [width * 0.08, width * 0.34]],
      safeSlots: template.safeSlots ?? [[-width * 0.4, 1]],
      rewardSlots: template.rewardSlots ?? [[width * 0.38, template.kind === 'tower' ? 9 : 1]],
      rewardAfterChallenge: !isSanctuary
    });
  }

  for (let index = 1; index <= criticalLastIndex; index += 1) {
    const from = zones[index - 1];
    const to = zones[index];
    links.push({ id: `${from.id}--${to.id}`, from: from.id, to: to.id, traversal: to.traversal });
  }
  for (let index = criticalLastIndex + 1; index < zones.length; index += 1) {
    const parentIndex = 1 + Math.floor(random() * Math.max(1, criticalLastIndex - 1));
    const from = zones[parentIndex];
    const to = zones[index];
    links.push({ id: `${from.id}--${to.id}`, from: from.id, to: to.id, traversal: to.traversal });
  }

  const verticalTraversal = new Set<StoryTraversalKind>(['climb', 'ladder', 'lift', 'updraft']);
  if (!links.some((link) => verticalTraversal.has(link.traversal))) {
    const verticalZone = zones[criticalLastIndex + 1];
    const verticalLink = links.find((link) => link.to === verticalZone.id);
    verticalZone.traversal = 'climb';
    if (verticalLink) verticalLink.traversal = 'climb';
  }

  const graph: StoryAdventureRunGraph = {
    version: STORY_DEPTH_GENERATION_VERSION,
    worldId,
    seed,
    entryZoneId: zones[0].id,
    sanctuaryZoneId: zones[sanctuaryIndex].id,
    finaleZoneId: zones[criticalLastIndex].id,
    usedFallback: false,
    validationFailures: [],
    zones,
    links
  };
  const validationFailures = adventureRunValidationErrors(graph);
  return validationFailures.length === 0 ? graph : generateAdventureFallbackGraph(worldId, seed, exploration, validationFailures);
}

export function adventureRunIsReachable(graph: StoryAdventureRunGraph): boolean {
  const seen = new Set([graph.entryZoneId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const link of graph.links) {
      if (seen.has(link.from) && !seen.has(link.to)) { seen.add(link.to); changed = true; }
      if (seen.has(link.to) && !seen.has(link.from)) { seen.add(link.from); changed = true; }
    }
  }
  return graph.zones.every((zone) => seen.has(zone.id));
}

export function adventureRunValidationErrors(graph: StoryAdventureRunGraph): string[] {
  const failures: string[] = [];
  if (graph.zones.length < STORY_DEPTH_ZONE_MIN || graph.zones.length > STORY_DEPTH_ZONE_MAX) failures.push('room-count');
  if (!adventureRunIsReachable(graph)) failures.push('unreachable-room');
  if (graph.zones.filter((zone) => zone.hidden).length !== 1) failures.push('hidden-branch');
  if (graph.zones.filter((zone) => zone.id === graph.sanctuaryZoneId && zone.kind === 'sanctuary').length !== 1) failures.push('sanctuary');
  if (graph.zones.filter((zone) => zone.id === graph.finaleZoneId && zone.finale).length !== 1) failures.push('finale');
  if (graph.zones.some((zone) => zone.underwater && zone.airPockets.length === 0)) failures.push('air-pockets');
  if (graph.zones.some((zone) => zone.kind !== 'sanctuary' && !zone.rewardAfterChallenge)) failures.push('reward-order');
  const critical = graph.zones.filter((zone) => zone.critical).sort((left, right) => left.index - right.index);
  if (critical.some((zone, index) => index > 0 && zone.difficulty >= 4 && critical[index - 1].difficulty >= 4)) failures.push('consecutive-high-intensity');
  return failures;
}

export function generateAdventureFallbackGraph(
  worldId: Exclude<StoryAdventureWorldId, 'world-route'>,
  seed: string,
  exploration: StoryAdventureExplorationDefinition,
  validationFailures: string[] = ['forced-fallback']
): StoryAdventureRunGraph {
  const challenge = exploration.mountSanctuary.challenge;
  const zones: StoryGeneratedDepthZone[] = Array.from({ length: 6 }, (_, index) => {
    const sanctuary = index === 2;
    const finale = index === 3;
    const hidden = index === 5;
    return {
      id: `${worldId}-safe-${index + 1}`,
      index,
      kind: sanctuary ? 'sanctuary' : index === 4 ? 'grotto' : 'cave',
      depth: index <= 3 ? index : index - 3,
      critical: index <= 3,
      hidden,
      finale,
      difficulty: (sanctuary ? 1 : finale ? 5 : index === 1 ? 2 : 1) as 1 | 2 | 3 | 4 | 5,
      underwater: false,
      traversal: index === 2 ? challenge : index === 1 ? 'climb' : 'walk',
      camera: { minX: -18, maxX: 18, minY: -6, maxY: 14 },
      airPockets: [],
      roomTemplateId: sanctuary ? 'safe-sanctuary' : finale ? 'safe-finale' : 'safe-cave',
      geometrySeed: hashString(`${seed}:fallback:${index}`),
      enemyLanes: [[-8, -2], [3, 9]],
      safeSlots: [[-14, 1]],
      rewardSlots: [[14, 1]],
      rewardAfterChallenge: !sanctuary
    };
  });
  const pairs = [[0, 1], [1, 2], [2, 3], [1, 4], [2, 5]] as const;
  const links = pairs.map(([from, to]) => ({ id: `${zones[from].id}--${zones[to].id}`, from: zones[from].id, to: zones[to].id, traversal: zones[to].traversal }));
  return { version: STORY_DEPTH_GENERATION_VERSION, worldId, seed, entryZoneId: zones[0].id, sanctuaryZoneId: zones[2].id, finaleZoneId: zones[3].id, usedFallback: true, validationFailures, zones, links };
}

export function storyDepthZoneLabel(kind: StoryDepthZoneKind) {
  return ({ cave: 'Cave', underwater: 'Sunken Passage', tower: 'High Route', ruin: 'Ruined Hall', mine: 'Deep Shaft', crypt: 'Sealed Crypt', grotto: 'Hidden Grotto', sanctuary: 'Mount Sanctuary' } as const)[kind];
}

export type StoryPartyMember = { sessionId: string; joinedAt: number; lastSeenAt: number };
export type StoryPartyInstance = {
  version: 1;
  id: string;
  worldId: Exclude<StoryAdventureWorldId, 'world-route'>;
  seed: string;
  generationVersion: typeof STORY_DEPTH_GENERATION_VERSION;
  leaderSessionId: string;
  members: StoryPartyMember[];
  roomId?: string;
  updatedAt: number;
};

export function electStoryPartyLeader(members: StoryPartyMember[]) {
  return [...members].sort((left, right) => left.joinedAt - right.joinedAt || left.sessionId.localeCompare(right.sessionId))[0]?.sessionId ?? '';
}

export function sanitizeStoryPartyInstance(value: unknown, now = Date.now()): StoryPartyInstance | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<StoryPartyInstance>;
  if (record.version !== 1 || record.generationVersion !== STORY_DEPTH_GENERATION_VERSION || typeof record.id !== 'string' || typeof record.seed !== 'string' || typeof record.worldId !== 'string') return null;
  const allowedWorlds = Object.values(STORY_MOUNTS).map((mount) => mount.worldId);
  if (!allowedWorlds.includes(record.worldId as StoryPartyInstance['worldId'])) return null;
  const members = Array.isArray(record.members) ? record.members.flatMap((member) => {
    if (!member || typeof member.sessionId !== 'string' || !Number.isFinite(member.joinedAt) || !Number.isFinite(member.lastSeenAt)) return [];
    if (now - member.lastSeenAt > STORY_PARTY_RECONNECT_TTL_MS) return [];
    return [{ sessionId: member.sessionId, joinedAt: member.joinedAt, lastSeenAt: member.lastSeenAt }];
  }).sort((left, right) => left.joinedAt - right.joinedAt).slice(0, STORY_PARTY_MAX_MEMBERS) : [];
  if (members.length === 0) return null;
  return {
    version: 1,
    id: record.id,
    worldId: record.worldId as StoryPartyInstance['worldId'],
    seed: record.seed,
    generationVersion: STORY_DEPTH_GENERATION_VERSION,
    leaderSessionId: typeof record.leaderSessionId === 'string' && members.some((member) => member.sessionId === record.leaderSessionId)
      ? record.leaderSessionId
      : electStoryPartyLeader(members),
    members,
    ...(typeof record.roomId === 'string' && record.roomId ? { roomId: record.roomId.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 160) } : {}),
    updatedAt: Number.isFinite(record.updatedAt) ? Number(record.updatedAt) : now
  };
}

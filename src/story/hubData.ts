import rawHub from './koreCentralHub.json';
import { isStoryWorldAssetId } from './adventureAssets';
import type { HubDestination, StoryAdventureExplorationDefinition, StoryDepthZoneKind, StoryHubDefinition, StoryMountId, StoryPlatformDefinition, StoryPortalDefinition, StoryPortalDestination, StorySurfaceMaterial, StoryTraversalKind, StoryWorldBackdropMotif, StoryWorldEnvironmentDefinition, StoryWorldLandmarkDefinition, StoryWorldPropDefinition, StoryWorldThemeId } from './types';

const HUB_DESTINATIONS: readonly HubDestination[] = [
  'central', 'story', 'friends', 'online', 'arcade', 'versus', 'training', 'tournament', 'characters', 'avatarStudio', 'options', 'exit'
];

const PORTAL_KINDS = ['storefront', 'mode-door', 'adventure-gate', 'shrine', 'arcade-machine', 'versus-machine', 'terminal'] as const;
const WORLD_THEMES: StoryWorldThemeId[] = ['city', 'arcade', 'versus', 'online', 'training', 'tournament', 'route', 'village', 'forest', 'mine', 'crypt', 'underworld', 'snow', 'desert', 'ruins'];
const WORLD_MOTIFS: StoryWorldBackdropMotif[] = ['city', 'arena', 'servers', 'laboratory', 'stadium', 'village', 'forest', 'cavern', 'crypt', 'volcanic', 'mountains', 'dunes', 'ruins'];
const WORLD_DESTINATIONS: StoryPortalDestination[] = [
  ...HUB_DESTINATIONS,
  'world-route', 'greenhollow', 'thornwood', 'ironroot', 'bonevault', 'emberdeep', 'frostpeak', 'sunscar', 'skyglass'
];
const MOUNT_IDS: StoryMountId[] = ['verdant-stag', 'bramble-lynx', 'ironhorn-beetle', 'pale-warg', 'cinder-drake', 'frost-ram', 'dune-strider', 'glasswing'];
const TRAVERSAL_KINDS: StoryTraversalKind[] = ['walk', 'climb', 'ladder', 'lift', 'break-wall', 'swim', 'glide', 'updraft', 'drop'];
const DEPTH_KINDS: StoryDepthZoneKind[] = ['cave', 'underwater', 'tower', 'ruin', 'mine', 'crypt', 'grotto', 'sanctuary'];
const SURFACE_MATERIALS: StorySurfaceMaterial[] = ['grass', 'dirt', 'wood', 'metal', 'stone', 'snow', 'ice', 'sand', 'crystal', 'water'];

export const FALLBACK_STORY_HUB: StoryHubDefinition = {
  id: 'kore-central',
  name: 'K.O.R.E. Central',
  subtitle: 'Where every route begins',
  spawn: [-4.5, 0.9],
  bounds: { minX: -12, maxX: 12, floorY: 0 },
  platforms: [{ id: 'ground', position: [0, -0.5], size: [26, 1] }],
  portals: []
};

function finiteTuple(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every((item) => Number.isFinite(item));
}

function sanitizePlatforms(value: unknown): StoryPlatformDefinition[] {
  if (!Array.isArray(value)) return FALLBACK_STORY_HUB.platforms;
  const ids = new Set<string>();
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Partial<StoryPlatformDefinition>;
    if (typeof record.id !== 'string' || ids.has(record.id) || !finiteTuple(record.position) || !finiteTuple(record.size)) return [];
    if (record.size[0] <= 0 || record.size[1] <= 0) return [];
    ids.add(record.id);
    return [{
      id: record.id,
      position: record.position,
      size: record.size,
      ...(record.oneWay ? { oneWay: true } : {}),
      ...(['solid', 'one-way'].includes(record.collision ?? '') ? { collision: record.collision } : {}),
      ...(['ground', 'ledge', 'wall', 'ceiling'].includes(record.terrainRole ?? '') ? { terrainRole: record.terrainRole } : {}),
      ...(Number.isInteger(record.surfaceVariant) && Number(record.surfaceVariant) >= 0 ? { surfaceVariant: Number(record.surfaceVariant) } : {}),
      ...(SURFACE_MATERIALS.includes(record.surfaceMaterial as StorySurfaceMaterial) ? { surfaceMaterial: record.surfaceMaterial as StorySurfaceMaterial } : {})
    }];
  });
}

function sanitizePortals(value: unknown, bounds: StoryHubDefinition['bounds']): StoryPortalDefinition[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Partial<StoryPortalDefinition>;
    if (
      typeof record.id !== 'string' || ids.has(record.id) ||
      typeof record.label !== 'string' || typeof record.subtitle !== 'string' ||
      !WORLD_DESTINATIONS.includes(record.destination as StoryPortalDestination) ||
      !finiteTuple(record.position) || !finiteTuple(record.size) ||
      record.position[0] < bounds.minX || record.position[0] > bounds.maxX ||
      record.size[0] <= 0 || record.size[1] <= 0
    ) return [];
    ids.add(record.id);
    return [{
      id: record.id,
      label: record.label.slice(0, 32),
      subtitle: record.subtitle.slice(0, 64),
      destination: record.destination as StoryPortalDestination,
      position: record.position,
      size: record.size,
      accent: typeof record.accent === 'string' ? record.accent : '#2ee6ff',
      ...(record.locked ? { locked: true } : {}),
      ...(PORTAL_KINDS.includes(record.kind as typeof PORTAL_KINDS[number]) ? { kind: record.kind } : {}),
      ...(Number.isInteger(record.stationNumber) && Number(record.stationNumber) > 0 ? { stationNumber: Number(record.stationNumber) } : {}),
      ...(record.quickMatch ? { quickMatch: true } : {})
    }];
  });
}

function sanitizeEnvironment(value: unknown): StoryWorldEnvironmentDefinition | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Partial<StoryWorldEnvironmentDefinition>;
  const layers = Array.isArray(record.layers) ? record.layers.flatMap((layer, index) => {
    if (!layer || typeof layer !== 'object') return [];
    const asset = isStoryWorldAssetId(layer.asset) ? layer.asset : undefined;
    const motif = WORLD_MOTIFS.includes(layer.motif as StoryWorldBackdropMotif) ? layer.motif : undefined;
    if (!asset && !motif) return [];
    return [{
      id: typeof layer.id === 'string' && layer.id ? layer.id : `layer-${index + 1}`,
      depth: Number.isFinite(layer.depth) ? Number(layer.depth) : -8,
      y: Number.isFinite(layer.y) ? Number(layer.y) : 4,
      height: Math.max(1, Number.isFinite(layer.height) ? Number(layer.height) : 8),
      opacity: Math.min(1, Math.max(0.05, Number.isFinite(layer.opacity) ? Number(layer.opacity) : 0.5)),
      parallax: Math.min(0.9, Math.max(0, Number.isFinite(layer.parallax) ? Number(layer.parallax) : 0.2)),
      color: typeof layer.color === 'string' ? layer.color : '#ffffff',
      ...(asset ? { asset } : {}),
      ...(motif ? { motif } : {}),
      ...(Number.isFinite(layer.repeatEvery) ? { repeatEvery: Math.max(1, Number(layer.repeatEvery)) } : {})
    }];
  }) : [];
  if (layers.length === 0) return undefined;
  const surface = record.surface;
  const validSurface = Boolean(
    surface && isStoryWorldAssetId(surface.asset) &&
    Array.isArray(surface.frame) && surface.frame.length === 4 && surface.frame.every(Number.isFinite) &&
    Array.isArray(surface.atlasSize) && surface.atlasSize.length === 2 && surface.atlasSize.every((entry) => Number.isFinite(entry) && entry > 0)
  );
  const sanitizedSurface = validSurface && surface ? {
    asset: surface.asset,
    frame: surface.frame,
    atlasSize: surface.atlasSize,
    surfaceMaterial: SURFACE_MATERIALS.includes(surface.surfaceMaterial as StorySurfaceMaterial) ? surface.surfaceMaterial as StorySurfaceMaterial : 'stone',
    ...(Number.isFinite(surface.walkSurfaceInsetPixels) ? {
      walkSurfaceInsetPixels: Math.min(surface.frame[3], Math.max(0, Number(surface.walkSurfaceInsetPixels)))
    } : {}),
    ...(Array.isArray(surface.variants) ? {
      variants: surface.variants.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const variant = entry as { id?: unknown; frame?: unknown; surfaceMaterial?: unknown; walkSurfaceInsetPixels?: unknown };
        if (typeof variant.id !== 'string' || !Array.isArray(variant.frame) || variant.frame.length !== 4 || !variant.frame.every(Number.isFinite)) return [];
        return [{
          id: variant.id,
          frame: variant.frame as [number, number, number, number],
          ...(SURFACE_MATERIALS.includes(variant.surfaceMaterial as StorySurfaceMaterial) ? { surfaceMaterial: variant.surfaceMaterial as StorySurfaceMaterial } : {}),
          ...(Number.isFinite(variant.walkSurfaceInsetPixels) ? { walkSurfaceInsetPixels: Math.max(0, Number(variant.walkSurfaceInsetPixels)) } : {})
        }];
      })
    } : {})
  } as StoryWorldEnvironmentDefinition['surface'] : undefined;
  return {
    background: typeof record.background === 'string' ? record.background : '#071120',
    haze: typeof record.haze === 'string' ? record.haze : '#20374a',
    light: typeof record.light === 'string' ? record.light : '#ffffff',
    ground: typeof record.ground === 'string' ? record.ground : '#26384a',
    accent: typeof record.accent === 'string' ? record.accent : '#2ee6ff',
    particle: ['none', 'embers', 'snow', 'sand', 'motes', 'data'].includes(record.particle ?? '') ? record.particle! : 'motes',
    layers,
    ...(sanitizedSurface ? { surface: sanitizedSurface } : {})
  };
}

function sanitizeLandmarks(value: unknown, bounds: StoryHubDefinition['bounds']): StoryWorldLandmarkDefinition[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = new Set<string>();
  const landmarks = value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const landmark = entry as Partial<StoryWorldLandmarkDefinition>;
    if (typeof landmark.id !== 'string' || ids.has(landmark.id) || !finiteTuple(landmark.size) || !Array.isArray(landmark.position) || landmark.position.length !== 3 || !landmark.position.every(Number.isFinite)) return [];
    if (landmark.position[0] < bounds.minX || landmark.position[0] > bounds.maxX || landmark.size[0] <= 0 || landmark.size[1] <= 0) return [];
    ids.add(landmark.id);
    return [{
      id: landmark.id,
      label: typeof landmark.label === 'string' ? landmark.label.slice(0, 36) : 'Landmark',
      subtitle: typeof landmark.subtitle === 'string' ? landmark.subtitle.slice(0, 72) : '',
      position: landmark.position as [number, number, number],
      size: landmark.size,
      color: typeof landmark.color === 'string' ? landmark.color : '#2ee6ff',
      kind: ['district', 'vista', 'lore', 'secret'].includes(landmark.kind ?? '') ? landmark.kind! : 'district'
    }];
  });
  return landmarks.length > 0 ? landmarks : undefined;
}

function sanitizeProps(value: unknown): StoryWorldPropDefinition[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const props = value.filter((entry): entry is StoryWorldPropDefinition => Boolean(
    entry && typeof entry === 'object' && typeof entry.id === 'string' &&
    isStoryWorldAssetId(entry.asset) &&
    Array.isArray(entry.frame) && entry.frame.length === 4 && entry.frame.every(Number.isFinite) &&
    Array.isArray(entry.atlasSize) && entry.atlasSize.length === 2 && entry.atlasSize.every(Number.isFinite) &&
    Array.isArray(entry.position) && entry.position.length === 3 && entry.position.every(Number.isFinite) &&
    finiteTuple(entry.size)
  ));
  return props.length > 0 ? props : undefined;
}

function sanitizeExploration(value: unknown, bounds: StoryHubDefinition['bounds']): StoryAdventureExplorationDefinition | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Partial<StoryAdventureExplorationDefinition>;
  const validRange = (range: unknown): range is [number, number] => finiteTuple(range) && range[0] >= bounds.minX && range[1] <= bounds.maxX && range[0] < range[1];
  if (!validRange(record.safeApproach) || !record.mountSanctuary || !MOUNT_IDS.includes(record.mountSanctuary.mountId)) return undefined;
  const districts = Array.isArray(record.districts) ? record.districts.filter((item) => item && typeof item.id === 'string' && typeof item.label === 'string' && validRange(item.range)) : [];
  const encounters = Array.isArray(record.encounters) ? record.encounters.filter((item) => item && typeof item.id === 'string' && validRange(item.range)).map((item) => ({ ...item, maxActive: Math.max(0, Math.min(5, Math.round(Number(item.maxActive) || 0))) })) : [];
  const entrances = Array.isArray(record.entrances) ? record.entrances.filter((item) => item && typeof item.id === 'string' && typeof item.label === 'string' && finiteTuple(item.position) && item.position[0] >= bounds.minX && item.position[0] <= bounds.maxX).map((item) => ({ ...item, kinds: Array.isArray(item.kinds) ? item.kinds.filter((kind): kind is StoryDepthZoneKind => DEPTH_KINDS.includes(kind)) : [] })) : [];
  const waterVolumes = Array.isArray(record.waterVolumes) ? record.waterVolumes.filter((item) => item && typeof item.id === 'string' && Array.isArray(item.bounds) && item.bounds.length === 4 && item.bounds.every(Number.isFinite) && finiteTuple(item.current)).map((item) => ({ ...item, airPockets: Array.isArray(item.airPockets) ? item.airPockets.filter(finiteTuple) : [] })) : [];
  const waystones = Array.isArray(record.waystones) ? record.waystones.filter((item) => item && typeof item.id === 'string' && typeof item.label === 'string' && finiteTuple(item.position) && item.position[0] >= bounds.minX && item.position[0] <= bounds.maxX) : [];
  const depthTemplates = Array.isArray(record.depthTemplates) ? record.depthTemplates.filter((item) => item && typeof item.id === 'string' && DEPTH_KINDS.includes(item.kind) && Number.isFinite(item.weight) && item.weight > 0).map((item) => ({ ...item, traversal: Array.isArray(item.traversal) ? item.traversal.filter((kind): kind is StoryTraversalKind => TRAVERSAL_KINDS.includes(kind)) : ['walk' as StoryTraversalKind] })) : [];
  if (districts.length === 0 || encounters.length === 0 || entrances.length === 0 || waystones.length === 0 || depthTemplates.length === 0) return undefined;
  const challenge = TRAVERSAL_KINDS.includes(record.mountSanctuary.challenge) ? record.mountSanctuary.challenge : 'walk';
  const sanctuaryPosition = finiteTuple(record.mountSanctuary.position) ? record.mountSanctuary.position : waystones[waystones.length - 1].position;
  return {
    safeApproach: record.safeApproach,
    districts,
    encounters,
    entrances,
    waterVolumes,
    waystones,
    mountSanctuary: { id: String(record.mountSanctuary.id || 'mount-sanctuary'), mountId: record.mountSanctuary.mountId, position: sanctuaryPosition, challenge },
    depthTemplates,
    camera: record.camera && Number.isFinite(record.camera.minY) && Number.isFinite(record.camera.maxY) && record.camera.minY < record.camera.maxY ? record.camera : { minY: -8, maxY: 20 }
  };
}

export function sanitizeStoryHubDefinition(value: unknown): StoryHubDefinition {
  if (!value || typeof value !== 'object') return FALLBACK_STORY_HUB;
  const record = value as Partial<StoryHubDefinition>;
  const rawBounds = record.bounds;
  const bounds = rawBounds && Number.isFinite(rawBounds.minX) && Number.isFinite(rawBounds.maxX) && Number.isFinite(rawBounds.floorY) && rawBounds.minX < rawBounds.maxX
    ? { minX: rawBounds.minX, maxX: rawBounds.maxX, floorY: rawBounds.floorY }
    : FALLBACK_STORY_HUB.bounds;
  const spawn = finiteTuple(record.spawn) && record.spawn[0] >= bounds.minX && record.spawn[0] <= bounds.maxX
    ? record.spawn
    : FALLBACK_STORY_HUB.spawn;
  const platforms = sanitizePlatforms(record.platforms);
  return {
    id: typeof record.id === 'string' && record.id ? record.id : FALLBACK_STORY_HUB.id,
    name: typeof record.name === 'string' && record.name ? record.name : FALLBACK_STORY_HUB.name,
    subtitle: typeof record.subtitle === 'string' ? record.subtitle : FALLBACK_STORY_HUB.subtitle,
    spawn,
    bounds,
    platforms: platforms.length > 0 ? platforms : FALLBACK_STORY_HUB.platforms,
    portals: sanitizePortals(record.portals, bounds),
    ...(WORLD_THEMES.includes(record.theme as StoryWorldThemeId) ? { theme: record.theme } : {}),
    ...(sanitizeEnvironment(record.environment) ? { environment: sanitizeEnvironment(record.environment) } : {}),
    ...(sanitizeLandmarks(record.landmarks, bounds) ? { landmarks: sanitizeLandmarks(record.landmarks, bounds) } : {}),
    ...(sanitizeProps(record.props) ? { props: sanitizeProps(record.props) } : {}),
    ...(finiteTuple(record.checkpoint) ? { checkpoint: record.checkpoint } : {}),
    ...(Array.isArray(record.enemySpawns) ? { enemySpawns: record.enemySpawns } : {}),
    ...(sanitizeExploration(record.exploration, bounds) ? { exploration: sanitizeExploration(record.exploration, bounds) } : {}),
    ...(record.adventure ? { adventure: true } : {})
  };
}

export const KORE_CENTRAL_HUB = sanitizeStoryHubDefinition(rawHub);

import rawHub from './koreCentralHub.json';
import type { HubDestination, StoryHubDefinition, StoryPlatformDefinition, StoryPortalDefinition } from './types';

const HUB_DESTINATIONS: readonly HubDestination[] = [
  'central', 'story', 'friends', 'online', 'arcade', 'versus', 'training', 'tournament', 'characters', 'avatarStudio', 'options', 'exit'
];

const PORTAL_KINDS = ['storefront', 'mode-door', 'arcade-machine', 'versus-machine', 'terminal'] as const;

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
    return [{ id: record.id, position: record.position, size: record.size, ...(record.oneWay ? { oneWay: true } : {}) }];
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
      !HUB_DESTINATIONS.includes(record.destination as HubDestination) ||
      !finiteTuple(record.position) || !finiteTuple(record.size) ||
      record.position[0] < bounds.minX || record.position[0] > bounds.maxX ||
      record.size[0] <= 0 || record.size[1] <= 0
    ) return [];
    ids.add(record.id);
    return [{
      id: record.id,
      label: record.label.slice(0, 32),
      subtitle: record.subtitle.slice(0, 64),
      destination: record.destination as HubDestination,
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
    portals: sanitizePortals(record.portals, bounds)
  };
}

export const KORE_CENTRAL_HUB = sanitizeStoryHubDefinition(rawHub);

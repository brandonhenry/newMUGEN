import { sanitizeStoryHubDefinition, KORE_CENTRAL_HUB } from './hubData';
import type { HubDestination, StoryHubDefinition, StoryModeWorldId, StoryPortalDefinition, StoryPortalKind } from './types';

type StationInput = {
  id: string;
  label: string;
  subtitle: string;
  destination: HubDestination;
  x: number;
  accent: string;
  kind: StoryPortalKind;
  stationNumber?: number;
  quickMatch?: boolean;
};

const ground = { id: 'ground', position: [0, -0.5] as [number, number], size: [42, 1] as [number, number] };

function station(input: StationInput): StoryPortalDefinition {
  return {
    id: input.id,
    label: input.label,
    subtitle: input.subtitle,
    destination: input.destination,
    position: [input.x, input.kind === 'mode-door' ? 1.7 : 1.25],
    size: input.kind === 'mode-door' ? [2.5, 3.4] : [2.6, 2.7],
    accent: input.accent,
    kind: input.kind,
    ...(input.stationNumber ? { stationNumber: input.stationNumber } : {}),
    ...(input.quickMatch ? { quickMatch: true } : {})
  };
}

function world(id: Exclude<StoryModeWorldId, 'central'>, name: string, subtitle: string, stations: StationInput[]): StoryHubDefinition {
  return sanitizeStoryHubDefinition({
    id: `kore-${id}-world`,
    name,
    subtitle,
    spawn: [-16.2, 0.82],
    bounds: { minX: -20, maxX: 20, floorY: 0 },
    platforms: [ground],
    portals: [
      station({ id: `${id}-return`, label: 'K.O.R.E. Central', subtitle: 'Return to the city', destination: 'central', x: -18, accent: '#2ee6ff', kind: 'mode-door' }),
      ...stations.map(station)
    ]
  });
}

const arcadeStations: StationInput[] = [-12, -7.2, -2.4, 2.4, 7.2, 12].map((x, index) => ({
  id: `arcade-cabinet-${index + 1}`,
  label: `Solo Cabinet ${String(index + 1).padStart(2, '0')}`,
  subtitle: index % 2 ? 'Random ladder' : 'Classic arcade run',
  destination: 'arcade',
  x,
  accent: index % 2 ? '#ff5d69' : '#ff9d35',
  kind: 'arcade-machine',
  stationNumber: index + 1
}));

const versusStations: StationInput[] = [-11.5, -5.5, 0.5, 6.5, 12.5].map((x, index) => ({
  id: `versus-station-${index + 1}`,
  label: `Versus Station ${String(index + 1).padStart(2, '0')}`,
  subtitle: index === 0 ? 'Local two-player' : 'Online head-to-head',
  destination: index === 0 ? 'versus' : 'online',
  x,
  accent: index === 0 ? '#ffe071' : '#ff5d69',
  kind: 'versus-machine',
  stationNumber: index + 1,
  quickMatch: index !== 0
}));

export const STORY_MODE_WORLDS: Record<StoryModeWorldId, StoryHubDefinition> = {
  central: KORE_CENTRAL_HUB,
  arcade: world('arcade', 'K.O.R.E. Arcade', 'A neon hall of single-player cabinets', arcadeStations),
  versus: world('versus', 'K.O.R.E. Versus Hall', 'Meet at a station or find a match instantly', versusStations),
  online: world('online', 'K.O.R.E. Online Exchange', 'Ranked, casual, and custom battle terminals', [
    { id: 'online-casual', label: 'Casual Queue', subtitle: 'Quick online fight', destination: 'online', x: -9, accent: '#2ee6ff', kind: 'terminal', stationNumber: 1, quickMatch: true },
    { id: 'online-ranked', label: 'Ranked Queue', subtitle: 'Climb the network', destination: 'online', x: -2, accent: '#ffe071', kind: 'terminal', stationNumber: 2, quickMatch: true },
    { id: 'online-custom', label: 'Custom Lobby', subtitle: 'Host or join a room', destination: 'online', x: 5, accent: '#9b72ff', kind: 'terminal', stationNumber: 3, quickMatch: true },
    { id: 'online-spectate', label: 'Spectator Deck', subtitle: 'Watch live matches', destination: 'online', x: 12, accent: '#52e1a1', kind: 'terminal', stationNumber: 4 }
  ]),
  training: world('training', 'K.O.R.E. Training Lab', 'Choose a simulator and sharpen your routes', [-10, -3.5, 3.5, 10].map((x, index) => ({
    id: `training-sim-${index + 1}`, label: `Simulator ${String(index + 1).padStart(2, '0')}`, subtitle: ['Fundamentals', 'Combo routes', 'Defense lab', 'Free training'][index], destination: 'training' as const, x, accent: '#52e1a1', kind: 'terminal' as const, stationNumber: index + 1
  }))),
  tournament: world('tournament', 'K.O.R.E. Tournament Floor', 'Register at a bracket terminal', [-9, -2, 5, 12].map((x, index) => ({
    id: `tournament-desk-${index + 1}`, label: `Bracket Desk ${String(index + 1).padStart(2, '0')}`, subtitle: index ? 'Open bracket' : 'Local tournament', destination: 'tournament' as const, x, accent: '#ffe071', kind: 'terminal' as const, stationNumber: index + 1
  })))
};

export const MODE_WORLD_DESTINATIONS: readonly StoryModeWorldId[] = ['arcade', 'versus', 'online', 'training', 'tournament'];

export function isStoryModeWorldId(value: HubDestination): value is StoryModeWorldId {
  return value === 'central' || MODE_WORLD_DESTINATIONS.includes(value as StoryModeWorldId);
}

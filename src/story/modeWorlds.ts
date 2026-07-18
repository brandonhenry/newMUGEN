import { sanitizeStoryHubDefinition, KORE_CENTRAL_HUB } from './hubData';
import { STORY_MODE_DOOR_DISPLAY_SIZE } from './biomeDoors';
import { createStoryWorldEnvironment, createStoryWorldProps } from './worldEnvironments';
import { STORY_GROUNDED_ACTOR_CENTER_Y } from './actorGrounding';
import type { HubDestination, StoryHubDefinition, StoryModeWorldId, StoryPortalDefinition, StoryPortalKind, StoryWorldLandmarkDefinition, StoryWorldThemeId } from './types';

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

type ModeWorldInput = {
  id: Exclude<StoryModeWorldId, 'central'>;
  name: string;
  subtitle: string;
  theme: Extract<StoryWorldThemeId, 'arcade' | 'versus' | 'online' | 'training' | 'tournament'>;
  width: number;
  stations: StationInput[];
  landmarks: StoryWorldLandmarkDefinition[];
};

function station(input: StationInput): StoryPortalDefinition {
  return {
    id: input.id,
    label: input.label,
    subtitle: input.subtitle,
    destination: input.destination,
    position: [input.x, input.kind === 'mode-door' ? 1.7 : 1.25],
    size: input.kind === 'mode-door' ? [...STORY_MODE_DOOR_DISPLAY_SIZE] : [2.6, 2.7],
    accent: input.accent,
    kind: input.kind,
    ...(input.stationNumber ? { stationNumber: input.stationNumber } : {}),
    ...(input.quickMatch ? { quickMatch: true } : {})
  };
}

function landmark(id: string, label: string, subtitle: string, x: number, y: number, width: number, height: number, color: string, kind: StoryWorldLandmarkDefinition['kind'] = 'district'): StoryWorldLandmarkDefinition {
  return { id, label, subtitle, position: [x, y, -1.1], size: [width, height], color, kind };
}

function world(input: ModeWorldInput): StoryHubDefinition {
  const halfWidth = input.width / 2;
  const westReturn = -halfWidth + 2.5;
  const eastReturn = halfWidth - 2.5;
  return sanitizeStoryHubDefinition({
    id: `kore-${input.id}-world`,
    name: input.name,
    subtitle: input.subtitle,
    spawn: [westReturn + 5, STORY_GROUNDED_ACTOR_CENTER_Y],
    bounds: { minX: -halfWidth, maxX: halfWidth, floorY: 0 },
    theme: input.theme,
    environment: createStoryWorldEnvironment(input.theme),
    props: createStoryWorldProps(input.theme, -halfWidth, halfWidth),
    landmarks: input.landmarks,
    platforms: [
      { id: 'ground', position: [0, -0.5], size: [input.width + 2, 1] },
      { id: `${input.id}-overlook-west`, position: [-halfWidth * 0.62, 4.1], size: [12, 0.45], oneWay: true },
      { id: `${input.id}-overlook-center`, position: [0, 5.05], size: [15, 0.45], oneWay: true },
      { id: `${input.id}-overlook-east`, position: [halfWidth * 0.62, 3.7], size: [12, 0.45], oneWay: true },
      { id: `${input.id}-secret-perch`, position: [halfWidth * 0.82, 6.5], size: [7, 0.42], oneWay: true }
    ],
    portals: [
      station({ id: `${input.id}-return`, label: 'K.O.R.E. Central', subtitle: 'Return to the city', destination: 'central', x: westReturn, accent: '#2ee6ff', kind: 'mode-door' }),
      ...input.stations.map(station),
      station({ id: `${input.id}-return-east`, label: 'K.O.R.E. Central', subtitle: 'Express return to the city', destination: 'central', x: eastReturn, accent: '#2ee6ff', kind: 'mode-door' })
    ]
  });
}

const arcadeStations: StationInput[] = [-45, -27, -9, 9, 27, 45].map((x, index) => ({
  id: `arcade-cabinet-${index + 1}`,
  label: `Solo Cabinet ${String(index + 1).padStart(2, '0')}`,
  subtitle: index % 2 ? 'Random ladder' : 'Classic arcade run',
  destination: 'arcade',
  x,
  accent: index % 2 ? '#ff5d69' : '#ff9d35',
  kind: 'arcade-machine',
  stationNumber: index + 1
}));

const versusStations: StationInput[] = [-43, -22, 0, 22, 43].map((x, index) => ({
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
  arcade: world({
    id: 'arcade', name: 'K.O.R.E. Arcade', subtitle: 'A neon entertainment district built for solo legends', theme: 'arcade', width: 148, stations: arcadeStations,
    landmarks: [
      landmark('arcade-marquee', 'Grand Marquee', 'The district never powers down', -46, 5.2, 10, 7, '#ff9d35'),
      landmark('arcade-prize', 'Prize Counter', 'Relics from impossible clears', -18, 3.4, 11, 4.5, '#ff5d69'),
      landmark('arcade-hall', 'Cabinet Hall', 'Six ladders, one crown', 4, 5.6, 18, 7, '#ffe071'),
      landmark('arcade-maintenance', 'Maintenance Deck', 'A quiet route above the noise', 31, 4.6, 12, 6, '#9b72ff', 'lore'),
      landmark('arcade-roof', 'High Score Roof', 'The city record glows here', 48, 7.8, 8, 5, '#2ee6ff', 'secret')
    ]
  }),
  versus: world({
    id: 'versus', name: 'K.O.R.E. Versus Hall', subtitle: 'A red-and-blue competition campus for instant rivalries', theme: 'versus', width: 140, stations: versusStations,
    landmarks: [
      landmark('versus-local', 'Local Wing', 'Two fighters, one screen', -43, 4.8, 12, 6, '#ffe071'),
      landmark('versus-red', 'Crimson Side', 'Challenge stations and warmup bays', -19, 4.1, 13, 5, '#ff5d69'),
      landmark('versus-broadcast', 'Broadcast Booth', 'Every rivalry deserves a replay', 2, 6.2, 14, 7, '#ffffff'),
      landmark('versus-blue', 'Cyan Side', 'Open network stations', 25, 4.1, 13, 5, '#2ee6ff'),
      landmark('versus-deck', 'Spectator Deck', 'Watch the next challenger arrive', 46, 6.8, 9, 5, '#9b72ff', 'vista')
    ]
  }),
  online: world({
    id: 'online', name: 'K.O.R.E. Online Exchange', subtitle: 'A live network concourse linking fighters everywhere', theme: 'online', width: 152,
    stations: [
      { id: 'online-casual', label: 'Casual Queue', subtitle: 'Quick online fight', destination: 'online', x: -44, accent: '#2ee6ff', kind: 'terminal', stationNumber: 1, quickMatch: true },
      { id: 'online-ranked', label: 'Ranked Queue', subtitle: 'Climb the network', destination: 'online', x: -14, accent: '#ffe071', kind: 'terminal', stationNumber: 2, quickMatch: true },
      { id: 'online-custom', label: 'Custom Lobby', subtitle: 'Host or join a room', destination: 'online', x: 16, accent: '#9b72ff', kind: 'terminal', stationNumber: 3, quickMatch: true },
      { id: 'online-spectate', label: 'Spectator Deck', subtitle: 'Watch live matches', destination: 'online', x: 44, accent: '#52e1a1', kind: 'terminal', stationNumber: 4 }
    ],
    landmarks: [
      landmark('online-relay', 'Relay Towers', 'Signal enters the Exchange here', -47, 6.4, 12, 8, '#2ee6ff'),
      landmark('online-server', 'Server Vault', 'Ranked history lives behind the glass', -22, 4.8, 14, 6, '#ffe071', 'lore'),
      landmark('online-concourse', 'Queue Concourse', 'Every route is live', 1, 5.2, 18, 6, '#2ee6ff'),
      landmark('online-lobbies', 'Lobby District', 'Private rooms and custom rules', 27, 4.5, 14, 5, '#9b72ff'),
      landmark('online-uplink', 'Spectator Uplink', 'Live fights cross the skyline', 50, 7.2, 9, 6, '#52e1a1', 'vista')
    ]
  }),
  training: world({
    id: 'training', name: 'K.O.R.E. Training Lab', subtitle: 'A holographic research campus for sharpening every route', theme: 'training', width: 132,
    stations: [-38, -12, 14, 38].map((x, index) => ({ id: `training-sim-${index + 1}`, label: `Simulator ${String(index + 1).padStart(2, '0')}`, subtitle: ['Fundamentals', 'Combo routes', 'Defense lab', 'Free training'][index], destination: 'training' as const, x, accent: '#52e1a1', kind: 'terminal' as const, stationNumber: index + 1 })),
    landmarks: [
      landmark('training-fundamentals', 'Fundamentals Bay', 'Movement calibration begins here', -40, 4.5, 12, 5, '#52e1a1'),
      landmark('training-combo', 'Combo Wing', 'Routes are mapped in light', -16, 5.1, 14, 6, '#b9ffdd'),
      landmark('training-observation', 'Observation Bridge', 'Review every input from above', 3, 7, 13, 5, '#2ee6ff', 'vista'),
      landmark('training-defense', 'Defense Chamber', 'Hold the line under pressure', 24, 4.8, 13, 6, '#ffe071'),
      landmark('training-sandbox', 'Free Lab', 'No timer. No limits.', 44, 5.8, 10, 7, '#9b72ff', 'secret')
    ]
  }),
  tournament: world({
    id: 'tournament', name: 'K.O.R.E. Tournament Floor', subtitle: 'A ceremonial arena concourse where brackets become history', theme: 'tournament', width: 160,
    stations: [-44, -15, 15, 44].map((x, index) => ({ id: `tournament-desk-${index + 1}`, label: `Bracket Desk ${String(index + 1).padStart(2, '0')}`, subtitle: index ? 'Open bracket' : 'Local tournament', destination: 'tournament' as const, x, accent: '#ffe071', kind: 'terminal' as const, stationNumber: index + 1 })),
    landmarks: [
      landmark('tournament-registration', 'Registration Hall', 'Every champion starts with a name', -48, 4.8, 14, 6, '#ffe071'),
      landmark('tournament-brackets', 'Bracket Gallery', 'Past runs line the concourse', -22, 5.2, 14, 6, '#fff1a6', 'lore'),
      landmark('tournament-arena', 'Grand Arena', 'The next match waits beyond', 0, 7.1, 20, 9, '#ff9d35'),
      landmark('tournament-trophy', 'Trophy Walk', 'Winners leave their light behind', 27, 5.4, 14, 6, '#ffe071'),
      landmark('tournament-overlook', 'Champion Overlook', 'See the whole bracket floor', 51, 7.5, 9, 6, '#ffffff', 'vista')
    ]
  })
};

export const MODE_WORLD_DESTINATIONS: readonly StoryModeWorldId[] = ['arcade', 'versus', 'online', 'training', 'tournament'];

export function isStoryModeWorldId(value: unknown): value is StoryModeWorldId {
  return value === 'central' || MODE_WORLD_DESTINATIONS.includes(value as StoryModeWorldId);
}

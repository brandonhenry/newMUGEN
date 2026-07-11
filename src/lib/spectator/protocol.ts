import type { CompactMatchSnapshot } from '../online/codec';

export const SPECTATOR_PROTOCOL_VERSION = 1 as const;
export const SPECTATOR_DELAY_FRAMES = 300;

export type SpectatorPublisherRole = 'primary' | 'standby';
export type SpectatorStreamState = 'waiting' | 'live' | 'ended' | 'unavailable';

export type SpectatorStreamSummary = {
  tournamentId: string;
  matchId: string;
  state: SpectatorStreamState;
  viewerCount: number;
  latestConfirmedFrame: number;
  updatedAt: number;
};

export type SpectatorSnapshot = {
  type: 'snapshot';
  protocol: typeof SPECTATOR_PROTOCOL_VERSION;
  frame: number;
  checksum: number;
  snapshot: CompactMatchSnapshot;
  wins: [number, number];
};

export type SpectatorInputBatch = {
  type: 'inputBatch';
  protocol: typeof SPECTATOR_PROTOCOL_VERSION;
  startFrame: number;
  p1Masks: number[];
  p2Masks: number[];
  latestConfirmedFrame: number;
};

export type SpectatorCheckpoint = {
  type: 'checkpoint';
  protocol: typeof SPECTATOR_PROTOCOL_VERSION;
  frame: number;
  checksum: number;
};

export type SpectatorBootstrap = {
  type: 'bootstrap';
  protocol: typeof SPECTATOR_PROTOCOL_VERSION;
  snapshot: SpectatorSnapshot;
  inputs: SpectatorInputBatch[];
  latestConfirmedFrame: number;
  viewerCount: number;
};

export type SpectatorPublisherHello = {
  type: 'publisherHello';
  protocol: typeof SPECTATOR_PROTOCOL_VERSION;
  gameVersion: string;
  token: string;
  tournamentId: string;
  matchId: string;
  role: SpectatorPublisherRole;
};

export type SpectatorStreamStateMessage = {
  type: 'streamState';
  protocol: typeof SPECTATOR_PROTOCOL_VERSION;
  state: SpectatorStreamState;
  latestConfirmedFrame: number;
  activePublisherRole?: SpectatorPublisherRole;
};

export type SpectatorViewerCountMessage = {
  type: 'viewerCount';
  protocol: typeof SPECTATOR_PROTOCOL_VERSION;
  viewerCount: number;
};

export type SpectatorResyncRequest = {
  type: 'resyncRequest';
  protocol: typeof SPECTATOR_PROTOCOL_VERSION;
};

export type SpectatorStreamEnd = {
  type: 'streamEnd';
  protocol: typeof SPECTATOR_PROTOCOL_VERSION;
  reason: 'completed' | 'forfeit' | 'publisher_left' | 'error';
};

export type SpectatorRelayMessage =
  | SpectatorPublisherHello
  | SpectatorSnapshot
  | SpectatorInputBatch
  | SpectatorCheckpoint
  | SpectatorBootstrap
  | SpectatorStreamStateMessage
  | SpectatorViewerCountMessage
  | SpectatorResyncRequest
  | SpectatorStreamEnd;

export function isSpectatorRelayMessage(value: unknown): value is SpectatorRelayMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<SpectatorRelayMessage> & { protocol?: unknown; type?: unknown };
  if (message.protocol !== SPECTATOR_PROTOCOL_VERSION || typeof message.type !== 'string') return false;
  if (message.type === 'publisherHello') return typeof message.token === 'string' && typeof message.tournamentId === 'string' && typeof message.matchId === 'string' && (message.role === 'primary' || message.role === 'standby');
  if (message.type === 'snapshot') return isFrame(message.frame) && typeof message.checksum === 'number' && Boolean(message.snapshot);
  if (message.type === 'inputBatch') return isFrame(message.startFrame) && Array.isArray(message.p1Masks) && Array.isArray(message.p2Masks) && message.p1Masks.length === message.p2Masks.length && message.p1Masks.length <= 120 && isFrame(message.latestConfirmedFrame);
  if (message.type === 'checkpoint') return isFrame(message.frame) && typeof message.checksum === 'number';
  if (message.type === 'bootstrap') return Boolean(message.snapshot) && Array.isArray(message.inputs) && isFrame(message.latestConfirmedFrame) && typeof message.viewerCount === 'number';
  if (message.type === 'streamState') return ['waiting', 'live', 'ended', 'unavailable'].includes(String(message.state)) && isFrame(message.latestConfirmedFrame);
  if (message.type === 'viewerCount') return typeof message.viewerCount === 'number' && message.viewerCount >= 0;
  if (message.type === 'resyncRequest') return true;
  if (message.type === 'streamEnd') return ['completed', 'forfeit', 'publisher_left', 'error'].includes(String(message.reason));
  return false;
}

function isFrame(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= -1;
}

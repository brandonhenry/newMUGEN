import type { CompactMatchSnapshot } from './codec';
import type { OnlinePlayerProfile } from './leaderboard';
import type { RankedSubmitResult } from './ranked';
import type { MoveInput } from '../../types';

export type OnlineRole = 'host' | 'guest';
export type OnlineConnectionState = 'idle' | 'searching' | 'connecting' | 'connected' | 'disconnected' | 'error';

export type OnlineHelloMessage = {
  type: 'hello';
  protocol: number;
  peerId: string;
  characterId: string;
  profile?: OnlinePlayerProfile;
};

export type OnlineInputMessage = {
  type: 'input';
  frame: number;
  sequence: number;
};

export type OnlineInputBatchMessage = {
  type: 'inputBatch';
  startFrame: number;
  masks: number[];
  ackFrame: number;
  currentFrame: number;
  remoteFrame: number;
  checksum?: number;
  sentAt?: number;
  disconnectRequested?: boolean;
};

export type OnlineClashInputMessage = {
  type: 'clashInput';
  clashId: number;
  button: MoveInput;
  elapsedFrame: number;
  sequence: number;
};

export type OnlineSnapshotMessage = {
  type: 'snapshot';
  snapshot: CompactMatchSnapshot;
  wins: [number, number];
  reason?: 'start' | 'rematch' | 'resync' | 'result';
};

export type OnlineRematchReadyMessage = {
  type: 'rematchReady';
};

export type OnlineRematchStartMessage = {
  type: 'rematchStart';
  wins: [number, number];
};

export type OnlineLeaveMessage = {
  type: 'leave';
  reason?: string;
};

export type OnlinePingMessage = {
  type: 'ping';
  t: number;
};

export type OnlinePongMessage = {
  type: 'pong';
  t: number;
};

export type OnlineErrorMessage = {
  type: 'error';
  message: string;
};

export type OnlineRankedResultMessage = {
  type: 'rankedResult';
  result: RankedSubmitResult;
};

export type OnlineAssetWarmupReadyMessage = {
  type: 'assetWarmupReady';
  warmupId: string;
  roomId: string;
  stageId: string;
  p1CharacterId: string;
  p2CharacterId: string;
  mode: 'online' | 'trainingOnline';
  ready: boolean;
  progress: number;
  error?: string;
  sentAt: number;
};

export type OnlineAssetWarmupAbortMessage = {
  type: 'assetWarmupAbort';
  warmupId: string;
  roomId: string;
  reason: string;
};

export type OnlineChatMessage = {
  type: 'chat';
  id: string;
  text: string;
  sentAt: number;
  senderName?: string;
};

export type OnlineMessage =
  | OnlineHelloMessage
  | OnlineInputMessage
  | OnlineInputBatchMessage
  | OnlineClashInputMessage
  | OnlineSnapshotMessage
  | OnlineRematchReadyMessage
  | OnlineRematchStartMessage
  | OnlineLeaveMessage
  | OnlinePingMessage
  | OnlinePongMessage
  | OnlineErrorMessage
  | OnlineRankedResultMessage
  | OnlineAssetWarmupReadyMessage
  | OnlineAssetWarmupAbortMessage
  | OnlineChatMessage;

export function isOnlineMessage(value: unknown): value is OnlineMessage {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  const type = (value as { type?: unknown }).type;
  if (type === 'chat') return isOnlineChatMessage(value);
  if (type === 'assetWarmupReady') return isOnlineAssetWarmupReadyMessage(value);
  if (type === 'assetWarmupAbort') return isOnlineAssetWarmupAbortMessage(value);
  return (
    type === 'hello' ||
    type === 'input' ||
    type === 'inputBatch' ||
    type === 'clashInput' ||
    type === 'snapshot' ||
    type === 'rematchReady' ||
    type === 'rematchStart' ||
    type === 'leave' ||
    type === 'ping' ||
    type === 'pong' ||
    type === 'error' ||
    type === 'rankedResult'
  );
}

function isSafeProtocolString(value: unknown, maxLength = 160): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isOnlineAssetWarmupReadyMessage(value: unknown): value is OnlineAssetWarmupReadyMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<OnlineAssetWarmupReadyMessage>;
  return (
    message.type === 'assetWarmupReady' &&
    isSafeProtocolString(message.warmupId) &&
    isSafeProtocolString(message.roomId) &&
    isSafeProtocolString(message.stageId) &&
    isSafeProtocolString(message.p1CharacterId) &&
    isSafeProtocolString(message.p2CharacterId) &&
    (message.mode === 'online' || message.mode === 'trainingOnline') &&
    typeof message.ready === 'boolean' &&
    typeof message.progress === 'number' &&
    Number.isFinite(message.progress) &&
    message.progress >= 0 &&
    message.progress <= 100 &&
    typeof message.sentAt === 'number' &&
    Number.isFinite(message.sentAt) &&
    (message.error === undefined || (typeof message.error === 'string' && message.error.length <= 240))
  );
}

function isOnlineAssetWarmupAbortMessage(value: unknown): value is OnlineAssetWarmupAbortMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<OnlineAssetWarmupAbortMessage>;
  return (
    message.type === 'assetWarmupAbort' &&
    isSafeProtocolString(message.warmupId) &&
    isSafeProtocolString(message.roomId) &&
    isSafeProtocolString(message.reason, 240)
  );
}

function isOnlineChatMessage(value: unknown): value is OnlineChatMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<OnlineChatMessage>;
  return (
    message.type === 'chat' &&
    typeof message.id === 'string' &&
    message.id.length > 0 &&
    message.id.length <= 96 &&
    typeof message.text === 'string' &&
    message.text.trim().length > 0 &&
    message.text.length <= 160 &&
    typeof message.sentAt === 'number' &&
    Number.isFinite(message.sentAt) &&
    (message.senderName === undefined || (typeof message.senderName === 'string' && message.senderName.length <= 24))
  );
}

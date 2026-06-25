import type { CompactMatchSnapshot } from './codec';

export type OnlineRole = 'host' | 'guest';
export type OnlineConnectionState = 'idle' | 'searching' | 'connecting' | 'connected' | 'disconnected' | 'error';

export type OnlineHelloMessage = {
  type: 'hello';
  protocol: number;
  peerId: string;
  characterId: string;
};

export type OnlineInputMessage = {
  type: 'input';
  frame: number;
  sequence: number;
};

export type OnlineSnapshotMessage = {
  type: 'snapshot';
  snapshot: CompactMatchSnapshot;
  wins: [number, number];
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

export type OnlineMessage =
  | OnlineHelloMessage
  | OnlineInputMessage
  | OnlineSnapshotMessage
  | OnlineRematchReadyMessage
  | OnlineRematchStartMessage
  | OnlineLeaveMessage
  | OnlinePingMessage
  | OnlinePongMessage
  | OnlineErrorMessage;

export function isOnlineMessage(value: unknown): value is OnlineMessage {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === 'hello' ||
    type === 'input' ||
    type === 'snapshot' ||
    type === 'rematchReady' ||
    type === 'rematchStart' ||
    type === 'leave' ||
    type === 'ping' ||
    type === 'pong' ||
    type === 'error'
  );
}

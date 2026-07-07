import { describe, expect, it } from 'vitest';
import { isOnlineMessage } from './messages';

describe('online messages', () => {
  it('accepts valid asset warmup messages', () => {
    expect(isOnlineMessage({
      type: 'assetWarmupReady',
      warmupId: 'room-1:start:0-0:stage:p1:p2:online',
      roomId: 'room-1',
      stageId: 'the-chamber',
      p1CharacterId: 'goku',
      p2CharacterId: 'vegeta',
      mode: 'online',
      ready: true,
      progress: 100,
      sentAt: 1234
    })).toBe(true);
    expect(isOnlineMessage({
      type: 'assetWarmupAbort',
      warmupId: 'room-1:start:0-0:stage:p1:p2:online',
      roomId: 'room-1',
      reason: 'Opponent asset load timed out'
    })).toBe(true);
  });

  it('rejects malformed asset warmup messages', () => {
    expect(isOnlineMessage({
      type: 'assetWarmupReady',
      warmupId: 'room-1',
      roomId: 'room-1',
      stageId: 'the-chamber',
      p1CharacterId: 'goku',
      p2CharacterId: 'vegeta',
      mode: 'online',
      ready: true,
      progress: 101,
      sentAt: 1234
    })).toBe(false);
    expect(isOnlineMessage({
      type: 'assetWarmupReady',
      warmupId: 'room-1',
      roomId: 'room-1',
      stageId: 'the-chamber',
      p1CharacterId: 'goku',
      mode: 'ranked',
      ready: true,
      progress: 50,
      sentAt: 1234
    })).toBe(false);
    expect(isOnlineMessage({
      type: 'assetWarmupAbort',
      warmupId: '',
      roomId: 'room-1',
      reason: 'nope'
    })).toBe(false);
  });

  it('accepts valid training chat messages', () => {
    expect(isOnlineMessage({
      type: 'chat',
      id: 'chat-1',
      text: 'gg, can we practice sidesteps?',
      sentAt: 1234,
      senderName: 'PLAYER'
    })).toBe(true);
  });

  it('rejects malformed training chat messages', () => {
    expect(isOnlineMessage({ type: 'chat', id: 'chat-1', text: '', sentAt: 1234 })).toBe(false);
    expect(isOnlineMessage({ type: 'chat', id: 'chat-1', text: 'x'.repeat(161), sentAt: 1234 })).toBe(false);
    expect(isOnlineMessage({ type: 'chat', id: 'chat-1', text: 'hello', sentAt: Number.NaN })).toBe(false);
    expect(isOnlineMessage({ type: 'chat', id: '', text: 'hello', sentAt: 1234 })).toBe(false);
  });
});

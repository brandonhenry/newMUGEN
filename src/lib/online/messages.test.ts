import { describe, expect, it } from 'vitest';
import { isOnlineMessage } from './messages';

describe('online messages', () => {
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

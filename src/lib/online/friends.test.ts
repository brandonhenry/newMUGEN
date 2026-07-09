import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchFriendChat,
  fetchFriendInbox,
  fetchFriendPresence,
  heartbeatFriendPresence,
  isFriendPresenceOnline,
  respondToFriendInvite,
  sanitizeFriendChatText,
  sendFriendChat,
  sendFriendInvite
} from './friends';

function installLocalFriendEnvironment() {
  const storage = new Map<string, string>();
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('No local functions'))));
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1' },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    }
  });
  vi.stubGlobal('crypto', { randomUUID: () => `id-${storage.size}-${Math.random().toString(36).slice(2, 6)}` });
}

describe('online friends', () => {
  beforeEach(() => {
    installLocalFriendEnvironment();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('marks recent presence as online and stale presence as offline', async () => {
    const profile = { playerId: 'player-one', displayName: 'P1' };
    await heartbeatFriendPresence(profile, 'peer-one', 'astra');

    const result = await fetchFriendPresence(profile, ['player-one']);

    expect(result.friends[0]).toMatchObject({ playerId: 'player-one', online: true, characterId: 'astra' });
    expect(isFriendPresenceOnline(Date.now() - 46_000)).toBe(false);
  });

  it('sends, lists, and declines friend invites locally', async () => {
    const profile = { playerId: 'host-player', displayName: 'HOST' };
    const invite = await sendFriendInvite(profile, 'guest-player', 'Host Room', 'kore-1234', 'room-1');

    const inbox = await fetchFriendInbox({ playerId: 'guest-player', displayName: 'GUEST' });
    const declined = await respondToFriendInvite({ playerId: 'guest-player', displayName: 'GUEST' }, invite.inviteId, 'declined');

    expect(inbox.invites).toHaveLength(1);
    expect(inbox.invites[0]).toMatchObject({ roomName: 'HOST ROOM', password: 'KORE-1234', status: 'pending' });
    expect(declined.status).toBe('declined');
    await expect(fetchFriendInbox({ playerId: 'guest-player', displayName: 'GUEST' })).resolves.toEqual({ invites: [] });
  });

  it('sanitizes and stores pairwise chat', async () => {
    const p1 = { playerId: 'p1', displayName: 'PLAYER 1' };
    await sendFriendChat(p1, 'p2', '  hello\u0000   there  ');

    const chat = await fetchFriendChat({ playerId: 'p2', displayName: 'PLAYER 2' }, 'p1', 0);

    expect(sanitizeFriendChatText('a'.repeat(200))).toHaveLength(160);
    expect(chat.messages[0]).toMatchObject({ fromPlayerId: 'p1', toPlayerId: 'p2', text: 'hello there' });
  });
});

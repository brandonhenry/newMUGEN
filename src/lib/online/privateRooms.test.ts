import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrivateRoom, generatePrivateRoomPassword, joinPrivateRoom, leavePrivateRoom, listPrivateRooms, normalizePrivateRoomPassword } from './privateRooms';

function installLocalRoomEnvironment() {
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
}

describe('private rooms', () => {
  beforeEach(() => {
    installLocalRoomEnvironment();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes readable KORE passwords', () => {
    expect(generatePrivateRoomPassword()).toMatch(/^KORE-\d{4}$/);
    expect(normalizePrivateRoomPassword(' kore 1234!! ')).toBe('KORE1234');
  });

  it('creates local private rooms without exposing passwords in the list', async () => {
    const created = await createPrivateRoom({
      peerId: 'host-peer',
      characterId: 'kiro',
      stageId: 'training-area',
      roomName: 'Kiro Room',
      password: 'KORE-4837'
    });

    const rooms = await listPrivateRooms();

    expect(created.role).toBe('host');
    expect(created.password).toBe('KORE-4837');
    expect(rooms).toHaveLength(1);
    expect(rooms[0].roomName).toBe('KIRO ROOM');
    expect('password' in rooms[0]).toBe(false);
  });

  it('requires the correct password before claiming a room', async () => {
    const created = await createPrivateRoom({
      peerId: 'host-peer',
      characterId: 'kiro',
      stageId: 'training-area',
      roomName: 'Host',
      password: 'KORE-1111'
    });

    await expect(joinPrivateRoom({
      peerId: 'guest-peer',
      characterId: 'riven',
      roomId: created.roomId,
      password: 'KORE-2222'
    })).rejects.toThrow('Wrong password');

    const joined = await joinPrivateRoom({
      peerId: 'guest-peer',
      characterId: 'riven',
      roomId: created.roomId,
      password: 'KORE-1111'
    });

    expect(joined.role).toBe('guest');
    expect(joined.hostPeerId).toBe('host-peer');
    expect(joined.guestPeerId).toBe('guest-peer');
    expect(joined.password).toBeUndefined();
    expect(await listPrivateRooms()).toHaveLength(0);
  });

  it('removes local private rooms on leave', async () => {
    const created = await createPrivateRoom({
      peerId: 'host-peer',
      characterId: 'kiro',
      stageId: 'training-area',
      roomName: 'Host',
      password: 'KORE-9999'
    });

    await leavePrivateRoom({ roomId: created.roomId, ownerToken: created.ownerToken, peerId: 'host-peer' });

    expect(await listPrivateRooms()).toHaveLength(0);
  });
});

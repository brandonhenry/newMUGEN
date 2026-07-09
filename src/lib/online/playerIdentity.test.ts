import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FRIENDS_STORAGE_KEY } from '../socialHistory';
import { addFriendByPlayerId, lookupOnlinePlayer, registerOnlinePlayer, sanitizePublicPlayerId } from './playerIdentity';

function installLocalIdentityEnvironment() {
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
  vi.stubGlobal('crypto', { randomUUID: () => '12345678-1234-1234-1234-123456789abc' });
  return storage;
}

describe('player identity', () => {
  beforeEach(() => {
    installLocalIdentityEnvironment();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers and looks up public player IDs without exposing device IDs', async () => {
    const registered = await registerOnlinePlayer({ playerId: 'LOCAL-ID', displayName: 'Hero' }, 'posthog-secret', 'astra');
    const sameDevice = await registerOnlinePlayer({ playerId: 'OTHER-ID', displayName: 'Hero 2' }, 'posthog-secret', 'dax');
    const lookup = await lookupOnlinePlayer(registered.playerId);

    expect(sanitizePublicPlayerId(' KORE_ABC!! ')).toBe('koreabc');
    expect(registered.playerId).toBe('local-id');
    expect(sameDevice.playerId).toBe(registered.playerId);
    expect(lookup).toMatchObject({ playerId: 'local-id', displayName: 'HERO 2', lastCharacterId: 'dax' });
  });

  it('adds friends by player ID and rejects own or unknown IDs', async () => {
    const profile = { playerId: 'me', displayName: 'ME' };
    await registerOnlinePlayer(profile, 'me-device');
    await registerOnlinePlayer({ playerId: 'friend-one', displayName: 'Rival' }, 'friend-device', 'dax');

    await expect(addFriendByPlayerId(profile, 'me')).resolves.toMatchObject({ status: 'error' });
    await expect(addFriendByPlayerId(profile, 'missing-player')).resolves.toMatchObject({ status: 'notFound' });
    const added = await addFriendByPlayerId(profile, 'friend-one');
    const already = await addFriendByPlayerId(profile, 'friend-one');

    expect(added).toMatchObject({ status: 'added', message: 'Added RIVAL' });
    expect(already).toMatchObject({ status: 'already' });
    expect(JSON.parse(window.localStorage.getItem(FRIENDS_STORAGE_KEY) ?? '[]')[0]).toMatchObject({
      playerId: 'friend-one',
      displayName: 'RIVAL',
      lastCharacterId: 'dax'
    });
  });
});

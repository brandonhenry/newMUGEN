import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addFriend, FRIENDS_STORAGE_KEY, MATCH_HISTORY_STORAGE_KEY, recordMatchHistory, readFriends, readMatchHistory } from './socialHistory';

const profile = { playerId: 'local-player', displayName: 'Kiro' };

function installStorage() {
  const storage = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    }
  });
  return storage;
}

describe('social history storage', () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = installStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('records match history for the active local profile only', () => {
    recordMatchHistory(profile, {
      createdAt: 100,
      mode: 'ranked',
      roomId: 'room-1',
      stageId: 'training-area',
      localCharacterId: 'naruto',
      opponent: {
        playerId: 'opponent-1',
        displayName: 'Monkr',
        characterId: 'sasuke'
      },
      result: 'win',
      score: [2, 1]
    });
    recordMatchHistory({ playerId: 'other-profile', displayName: 'Other' }, {
      createdAt: 120,
      mode: 'online',
      stageId: 'training-area',
      localCharacterId: 'goku',
      opponent: {
        playerId: 'opponent-2',
        displayName: 'Else',
        characterId: 'vegeta'
      },
      result: 'loss',
      score: [0, 2]
    });

    expect(readMatchHistory(profile)).toEqual([
      expect.objectContaining({
        profileId: 'local-player',
        mode: 'ranked',
        opponent: expect.objectContaining({ displayName: 'MONKR' }),
        result: 'win',
        score: [2, 1]
      })
    ]);
    expect(JSON.parse(storage.get(MATCH_HISTORY_STORAGE_KEY) ?? '[]')).toHaveLength(2);
  });

  it('upserts friends and ignores bot opponents', () => {
    addFriend(profile, {
      playerId: 'friend-1',
      displayName: 'Desi',
      characterId: 'luffy'
    }, 200);
    addFriend(profile, {
      playerId: 'friend-1',
      displayName: 'Desi New',
      characterId: 'zoro'
    }, 300);
    addFriend(profile, {
      playerId: 'bot-rival',
      displayName: 'CPU Rival',
      characterId: 'dax',
      isBot: true
    }, 400);

    expect(readFriends(profile)).toEqual([
      expect.objectContaining({
        playerId: 'friend-1',
        displayName: 'DESI NEW',
        lastCharacterId: 'zoro',
        lastPlayedAt: 300
      })
    ]);
    expect(JSON.parse(storage.get(FRIENDS_STORAGE_KEY) ?? '[]')).toHaveLength(1);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyOnlinePerformanceStats } from '../src/lib/online/performanceScoring';

type MemoryStore = {
  data: Map<string, unknown>;
  get: (key: string, options?: { type?: string }) => Promise<unknown>;
  setJSON: (key: string, value: unknown) => Promise<void>;
  delete: (key: string) => Promise<void>;
  list: (options?: { prefix?: string }) => Promise<{ blobs: Array<{ key: string }> }>;
};

const stores = new Map<string, MemoryStore>();

vi.mock('../netlify/functions/_blob-store.mjs', () => ({
  getBlobStore: (name: string) => {
    let store = stores.get(name);
    if (!store) {
      store = makeMemoryStore();
      stores.set(name, store);
    }
    return store;
  }
}));

beforeEach(() => {
  stores.clear();
  vi.restoreAllMocks();
});

describe('online Netlify function handlers', () => {
  it('keeps ranked/casual matchmaking separate and removes rooms on leave', async () => {
    const { handler: matchmake } = await import('../netlify/functions/online-matchmake.mjs');
    const { handler: leave } = await import('../netlify/functions/online-leave.mjs');

    const ranked = await post(matchmake, {
      peerId: 'ranked-host',
      characterId: 'kiro',
      stageId: 'the-chamber',
      queue: 'ranked',
      kp: 1200
    });
    const casual = await post(matchmake, {
      peerId: 'casual-guest',
      characterId: 'riven',
      stageId: 'the-chamber',
      queue: 'casual'
    });
    const rankedGuest = await post(matchmake, {
      peerId: 'ranked-guest',
      characterId: 'riven',
      stageId: 'the-chamber',
      queue: 'ranked',
      kp: 1240
    });

    expect(ranked).toMatchObject({ status: 'waiting', role: 'host', queue: 'ranked' });
    expect(casual).toMatchObject({ status: 'waiting', role: 'host', queue: 'casual' });
    expect(rankedGuest).toMatchObject({ status: 'matched', role: 'guest', roomId: ranked.roomId, hostPeerId: 'ranked-host' });

    const leaveResult = await post(leave, { roomId: ranked.roomId, ownerToken: ranked.ownerToken });
    expect(leaveResult).toEqual({ ok: true });

    const roomStore = stores.get('kore-online-rooms');
    const listed = await roomStore?.list({ prefix: 'rooms/' });
    expect(listed?.blobs.map((blob) => blob.key)).not.toContain(`rooms/${ranked.roomId}`);
  });

  it('creates, lists, joins, and leaves private rooms without exposing passwords in list output', async () => {
    const { handler: createRoom } = await import('../netlify/functions/private-room-create.mjs');
    const { handler: listRooms } = await import('../netlify/functions/private-room-list.mjs');
    const { handler: joinRoom } = await import('../netlify/functions/private-room-join.mjs');
    const { handler: leaveRoom } = await import('../netlify/functions/private-room-leave.mjs');

    const created = await post(createRoom, {
      peerId: 'host-peer',
      characterId: 'kiro',
      stageId: 'the-chamber',
      roomName: 'Lab Room!',
      password: 'abc-123'
    });
    expect(created).toMatchObject({ role: 'host', status: 'waiting', roomName: 'LAB ROOM', password: 'ABC-123' });

    const listed = await get(listRooms);
    expect(listed.rooms).toHaveLength(1);
    expect(listed.rooms[0]).toMatchObject({ roomId: created.roomId, roomName: 'LAB ROOM', status: 'waiting' });
    expect(listed.rooms[0]).not.toHaveProperty('password');

    const wrongPassword = await postRaw(joinRoom, {
      peerId: 'guest-peer',
      characterId: 'riven',
      roomId: created.roomId,
      password: 'wrong'
    });
    expect(wrongPassword.statusCode).toBe(403);

    const joined = await post(joinRoom, {
      peerId: 'guest-peer',
      characterId: 'riven',
      roomId: created.roomId,
      password: 'ABC-123'
    });
    expect(joined).toMatchObject({ role: 'guest', status: 'matched', hostPeerId: 'host-peer', guestPeerId: 'guest-peer' });

    await post(leaveRoom, { peerId: 'guest-peer' });
    const afterLeave = await get(listRooms);
    expect(afterLeave.rooms).toEqual([]);
  });

  it('creates ranked profiles and makes ranked report submission idempotent without persisting bot profiles', async () => {
    const { handler: rankedProfile } = await import('../netlify/functions/online-ranked-profile.mjs');
    const { handler: rankedSubmit } = await import('../netlify/functions/online-ranked-submit.mjs');

    const p1Profile = await post(rankedProfile, { profile: { playerId: 'player-one', displayName: 'Kiro' } });
    const p2Profile = await post(rankedProfile, { profile: { playerId: 'player-two', displayName: 'Riven' } });
    expect(p1Profile).toMatchObject({ playerId: 'player-one', displayName: 'KIRO', kp: 1200 });
    expect(p2Profile).toMatchObject({ playerId: 'player-two', displayName: 'RIVEN', kp: 1200 });

    const report = makeRankedReport(p1Profile, p2Profile);
    const first = await post(rankedSubmit, report);
    const duplicate = await post(rankedSubmit, report);

    expect(first.reportId).toBe(duplicate.reportId);
    expect(first.players.map((player: any) => player.playerId).sort()).toEqual(['player-one', 'player-two']);

    const botReport = makeRankedReport(p1Profile, { playerId: 'bot-ranked', displayName: 'CPU Rival' }, true);
    const botResult = await post(rankedSubmit, botReport);
    expect(botResult.players.some((player: any) => player.playerId === 'bot-ranked')).toBe(true);

    const store = stores.get('kore-online-ranked');
    expect(await store?.get('profiles/bot-ranked')).toBeNull();
    expect(await store?.get('profiles/player-one')).toBeTruthy();
  });
});

function makeRankedReport(p1Profile: any, p2Profile: any, p2IsBot = false) {
  return {
    roomId: p2IsBot ? 'ranked-bot-room' : 'ranked-human-room',
    stageId: 'the-chamber',
    winnerPlayerId: p1Profile.playerId,
    submittedAt: Date.now(),
    players: [
      {
        profile: { playerId: p1Profile.playerId, displayName: p1Profile.displayName },
        characterId: 'kiro',
        stats: { ...emptyOnlinePerformanceStats(), damageDealt: 300, cleanHits: 8, attacksAttempted: 14, roundsWon: 2 },
        roundsWon: 2
      },
      {
        profile: { playerId: p2Profile.playerId, displayName: p2Profile.displayName },
        characterId: 'riven',
        stats: { ...emptyOnlinePerformanceStats(), damageDealt: 120, cleanHits: 4, attacksAttempted: 12, roundsWon: 0 },
        roundsWon: 0,
        isBot: p2IsBot,
        botKp: p2IsBot ? 1180 : undefined,
        botKr: p2IsBot
          ? { aggression: 50, defense: 50, combo: 50, punishment: 50, resource: 50, consistency: 50 }
          : undefined
      }
    ]
  };
}

async function post(handler: (event: any) => Promise<any>, body: unknown) {
  const response = await postRaw(handler, body);
  expect(response.statusCode, response.body).toBeGreaterThanOrEqual(200);
  expect(response.statusCode, response.body).toBeLessThan(300);
  return JSON.parse(response.body);
}

async function postRaw(handler: (event: any) => Promise<any>, body: unknown) {
  return handler({ httpMethod: 'POST', body: JSON.stringify(body) });
}

async function get(handler: (event: any) => Promise<any>) {
  const response = await handler({ httpMethod: 'GET' });
  expect(response.statusCode, response.body).toBe(200);
  return JSON.parse(response.body);
}

function makeMemoryStore(): MemoryStore {
  const data = new Map<string, unknown>();
  return {
    data,
    async get(key: string) {
      return data.get(key) ?? null;
    },
    async setJSON(key: string, value: unknown) {
      data.set(key, JSON.parse(JSON.stringify(value)));
    },
    async delete(key: string) {
      data.delete(key);
    },
    async list({ prefix }: { prefix?: string } = {}) {
      return {
        blobs: [...data.keys()]
          .filter((key) => !prefix || key.startsWith(prefix))
          .map((key) => ({ key }))
      };
    }
  };
}

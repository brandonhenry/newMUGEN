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
  it('shares adventure seeds, room state, and deterministic party leadership without touching hub presence', async () => {
    const { handler: party } = await import('../netlify/functions/story-adventure-party.mjs');
    const first = await post(party, { action: 'create', sessionId: 'session-one', worldId: 'thornwood', capacity: 2 });
    const invitation = await post(party, { action: 'invite', partyId: first.party.id, sessionId: 'session-one', worldId: 'thornwood', targetSessionId: 'session-two', inviterDisplayName: 'ONE' });
    const second = await post(party, { action: 'invite-join', inviteId: invitation.invites[0].id, partyId: first.party.id, sessionId: 'session-two', worldId: 'thornwood', capacity: 2 });
    expect(second.party).toMatchObject({
      version: 3,
      id: first.party.id,
      seed: first.party.seed,
      generationVersion: 3,
      leaderSessionId: 'session-one'
    });
    expect(second.party.members.map((member: { sessionId: string }) => member.sessionId)).toEqual(['session-one', 'session-two']);

    const inRoom = await post(party, { action: 'room', partyId: first.party.id, sessionId: 'session-one', worldId: 'thornwood', roomId: 'endless:3' });
    expect(inRoom.party.roomId).toBe('endless:3');
    await post(party, { action: 'leave', partyId: first.party.id, sessionId: 'session-one', worldId: 'thornwood' });
    const transferred = await post(party, { action: 'room', partyId: first.party.id, sessionId: 'session-two', worldId: 'thornwood', roomId: 'endless:4' });
    expect(transferred.party.leaderSessionId).toBe('session-two');
    expect(stores.has('kore-story-hub-presence')).toBe(false);
  });

  it('publishes shared story hub occupants and removes them on leave', async () => {
    const { handler: heartbeat } = await import('../netlify/functions/story-hub-presence.mjs');
    const { handler: leave } = await import('../netlify/functions/story-hub-leave.mjs');
    const avatar = {
      name: 'NOVA', avatarSet: 'crimson-ranger', lineage: 'human', bodyPreset: 'standard', bodyTone: 'tan', hairStyle: 'spiked', hairColor: '#2d68d8', outfit: 'kore-cyan', accessory: 'headphones'
    };
    const challenge = {
      id: 'spar-session-one-session-two',
      challengerSessionId: 'session-one', challengerPlayerId: 'player-one', challengerDisplayName: 'Nova',
      targetSessionId: 'session-two', targetPlayerId: 'player-two', targetDisplayName: 'Rival',
      status: 'pending', createdAt: Date.now(), updatedAt: Date.now(), expiresAt: Date.now() + 30_000
    };
    const first = await post(heartbeat, { sessionId: 'session-one', playerId: 'player-one', displayName: 'Nova', avatar, x: -4, y: 0.82, pose: 'idle', facing: 1, challenge });
    const second = await post(heartbeat, { sessionId: 'session-two', playerId: 'player-two', displayName: 'Rival', avatar: { ...avatar, hairStyle: 'bob' }, x: 8, y: 0.82, pose: 'attack-special', facing: -1 });
    expect(first.players).toHaveLength(1);
    expect(second.players).toHaveLength(2);
    expect(second.players).toEqual(expect.arrayContaining([
      expect.objectContaining({ sessionId: 'session-one', displayName: 'NOVA', avatar: expect.objectContaining({ avatarSet: 'crimson-ranger' }), challenge: expect.objectContaining({ id: challenge.id, status: 'pending', targetSessionId: 'session-two' }) }),
      expect.objectContaining({ sessionId: 'session-two', displayName: 'RIVAL', pose: 'attack-special', facing: -1 })
    ]));

    expect(await post(leave, { sessionId: 'session-two' })).toEqual({ ok: true });
    const afterLeave = await post(heartbeat, { sessionId: 'session-one', playerId: 'player-one', displayName: 'Nova', avatar, x: -3, y: 0.82, pose: 'attack', facing: 1 });
    expect(afterLeave.players.map((player: { sessionId: string }) => player.sessionId)).toEqual(['session-one']);
    expect(afterLeave.players[0].pose).toBe('attack-jab');
  });

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

    const p1Profile = await post(rankedProfile, { profile: { playerId: 'player-one', displayName: 'Kiro' }, characterId: 'kiro' });
    const p2Profile = await post(rankedProfile, { profile: { playerId: 'player-two', displayName: 'Riven' }, characterId: 'riven' });
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
    expect(await store?.get('profiles/player-one/kiro')).toBeTruthy();
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

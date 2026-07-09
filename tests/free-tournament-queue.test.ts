import { describe, expect, it } from 'vitest';

import {
  enterFreeTournament,
  freeTournamentActivitySummary,
  getFreeTournamentRoomStatus,
  getOrCreateFreeTournament,
  joinFreeTournamentRoom,
  writeTournament
// @ts-expect-error Netlify functions are plain ESM modules exercised directly here.
} from '../netlify/functions/_tournament-store.mjs';
import {
  resolveFreeTournamentForEntry
// @ts-expect-error Netlify functions are plain ESM modules exercised directly here.
} from '../netlify/functions/tournament-enter.mjs';

describe('free online tournament queue', () => {
  it('starts a full free bracket and rolls new entrants into the next forming tournament', async () => {
    const store = makeMemoryStore();
    let bracket = await getOrCreateFreeTournament(store, 1000);

    for (let index = 1; index <= 8; index += 1) {
      const result = enterFreeTournament(bracket, {
        playerId: `player-${index}`,
        displayName: `P${index}`,
        characterId: `fighter-${index}`
      }, 1000 + index);
      bracket = await writeTournament(store, result.bracket);
    }

    expect(bracket.status).toBe('roundActive');
    expect(bracket.entries).toHaveLength(8);

    const next = await getOrCreateFreeTournament(store, 2000);
    expect(next.id).not.toBe(bracket.id);
    expect(next.status).toBe('open');
    expect(next.entries).toHaveLength(0);

    const activity = await freeTournamentActivitySummary(store, next);
    expect(activity).toEqual({
      liveTournamentCount: 1,
      formingTournamentCount: 1
    });
  });

  it('restores a saved free entry after its bracket fills instead of rolling the player forward', async () => {
    const store = makeMemoryStore();
    const fullBracket = await createFullFreeBracket(store);
    const next = await getOrCreateFreeTournament(store, 2000);

    expect(fullBracket.status).toBe('roundActive');
    expect(next.id).not.toBe(fullBracket.id);
    expect(next.status).toBe('open');

    const restored = await resolveFreeTournamentForEntry(store, 'player-1', fullBracket.id);
    const result = enterFreeTournament(restored, {
      playerId: 'player-1',
      displayName: 'P1 Reloaded',
      characterId: 'fighter-reloaded'
    }, 2100);

    expect(result.bracket.id).toBe(fullBracket.id);
    expect(result.entry).toMatchObject({
      playerId: 'player-1',
      characterId: 'fighter-1'
    });
    expect(result.bracket.status).toBe('roundActive');
  });

  it('restores an active free entry even when the client lost its saved tournament id', async () => {
    const store = makeMemoryStore();
    const fullBracket = await createFullFreeBracket(store);
    const next = await getOrCreateFreeTournament(store, 2000);

    expect(fullBracket.status).toBe('roundActive');
    expect(next.status).toBe('open');

    const restored = await resolveFreeTournamentForEntry(store, 'player-2', '');
    const result = enterFreeTournament(restored, {
      playerId: 'player-2',
      displayName: 'P2 Reloaded',
      characterId: 'fighter-reloaded'
    }, 2200);

    expect(result.bracket.id).toBe(fullBracket.id);
    expect(result.entry).toMatchObject({
      playerId: 'player-2',
      characterId: 'fighter-2'
    });
    expect(next.entries).toHaveLength(0);
  });

  it('attaches timed rooms to free ready matches and assigns host and guest by arrival', async () => {
    const store = makeMemoryStore();
    const bracket = await createFullFreeBracket(store);
    const readyMatches = bracket.matches.filter((match: any) => match.status === 'ready');

    expect(readyMatches.length).toBeGreaterThan(0);
    expect(readyMatches.every((match: any) => match.roomId && match.stageId && match.slotEndsAt > match.slotStartsAt)).toBe(true);

    const match = readyMatches[0] as any;
    const entryA = bracket.entries.find((entry: any) => entry.id === match.entryAId);
    const entryB = bracket.entries.find((entry: any) => entry.id === match.entryBId);
    expect(entryA).toBeTruthy();
    expect(entryB).toBeTruthy();

    const host = await joinFreeTournamentRoom(store, {
      tournamentId: bracket.id,
      matchId: match.id,
      playerId: entryA.playerId,
      peerId: 'peer-host'
    }, match.slotStartsAt + 100);
    const guest = await joinFreeTournamentRoom(store, {
      tournamentId: bracket.id,
      matchId: match.id,
      playerId: entryB.playerId,
      peerId: 'peer-guest'
    }, match.slotStartsAt + 200);

    expect(host.matchRoom).toMatchObject({ localRole: 'host', status: 'waiting', hostPeerId: 'peer-host' });
    expect(guest.matchRoom).toMatchObject({ localRole: 'guest', status: 'ready', hostPeerId: 'peer-host', guestPeerId: 'peer-guest' });
  });

  it('closes expired free match rooms and rejects players not assigned to the match', async () => {
    const store = makeMemoryStore();
    const bracket = await createFullFreeBracket(store);
    const match = bracket.matches.find((candidate: any) => candidate.status === 'ready') as any;
    const entryA = bracket.entries.find((entry: any) => entry.id === match.entryAId);
    const outsider = bracket.entries.find((entry: any) => entry.id !== match.entryAId && entry.id !== match.entryBId);

    await expect(joinFreeTournamentRoom(store, {
      tournamentId: bracket.id,
      matchId: match.id,
      playerId: outsider.playerId,
      peerId: 'peer-outsider'
    }, match.slotStartsAt + 100)).rejects.toMatchObject({ code: 'match_not_assigned' });

    const closed = await getFreeTournamentRoomStatus(store, {
      tournamentId: bracket.id,
      matchId: match.id,
      playerId: entryA.playerId
    }, match.slotEndsAt + 1);

    expect(closed.matchRoom).toMatchObject({ status: 'closed' });
  });
});

async function createFullFreeBracket(store: ReturnType<typeof makeMemoryStore>) {
  let bracket = await getOrCreateFreeTournament(store, 1000);
  for (let index = 1; index <= 8; index += 1) {
    const result = enterFreeTournament(bracket, {
      playerId: `player-${index}`,
      displayName: `P${index}`,
      characterId: `fighter-${index}`
    }, 1000 + index);
    bracket = await writeTournament(store, result.bracket);
  }
  return bracket;
}

function makeMemoryStore() {
  const values = new Map<string, unknown>();
  return {
    async get(key: string) {
      return values.get(key) ?? null;
    },
    async setJSON(key: string, value: unknown) {
      values.set(key, JSON.parse(JSON.stringify(value)));
    },
    async list({ prefix }: { prefix?: string } = {}) {
      return {
        blobs: [...values.keys()]
          .filter((key) => !prefix || key.startsWith(prefix))
          .map((key) => ({ key }))
      };
    }
  };
}

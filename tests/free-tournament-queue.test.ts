import { describe, expect, it } from 'vitest';

import {
  enterFreeTournament,
  freeTournamentActivitySummary,
  getOrCreateFreeTournament,
  writeTournament
// @ts-expect-error Netlify functions are plain ESM modules exercised directly here.
} from '../netlify/functions/_tournament-store.mjs';

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
});

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

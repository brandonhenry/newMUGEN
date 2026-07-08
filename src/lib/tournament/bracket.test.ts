import { describe, expect, it } from 'vitest';
import {
  advanceTournamentBracket,
  createCustomLocalTournamentBracket,
  createInfiniteTournamentBracket,
  createLocalTournamentBracket,
  getAssignedTournamentMatch,
  getNextPlayableLocalTournamentMatch,
  getNextReadyTournamentMatch,
  getTournamentOpponentEntry,
  simulateCpuTournamentMatches
} from './bracket';

const roster = Array.from({ length: 10 }, (_, index) => ({
  id: `fighter-${index + 1}`,
  displayName: `Fighter ${index + 1}`
}));

describe('tournament bracket', () => {
  it('creates an 8-player local bracket with the player in a ready match', () => {
    const bracket = createLocalTournamentBracket(roster[0], roster, 1000);
    const match = getAssignedTournamentMatch(bracket, 'local-player-1');
    const opponent = getTournamentOpponentEntry(bracket, match, 'local-player-1');

    expect(bracket.kind).toBe('freeLocal');
    expect(bracket.entries).toHaveLength(8);
    expect(bracket.matches).toHaveLength(7);
    expect(bracket.entries.filter((entry) => entry.isLocalPlayer).map((entry) => entry.id)).toEqual(['local-player-1']);
    expect(match?.round).toBe(1);
    expect(opponent?.isCpu).toBe(true);
  });

  it('simulates CPU-only matches while preserving the player match', () => {
    const bracket = simulateCpuTournamentMatches(createLocalTournamentBracket(roster[0], roster, 1000));
    const playerMatch = getAssignedTournamentMatch(bracket, 'local-player-1');
    const completedCpuMatches = bracket.matches.filter((match) => match.status === 'completed');

    expect(playerMatch?.status).toBe('ready');
    expect(completedCpuMatches.length).toBeGreaterThan(0);
  });

  it('creates a two-player local bracket and preserves both local player matches', () => {
    const bracket = simulateCpuTournamentMatches(createLocalTournamentBracket([
      { entryId: 'local-player-1', displayName: 'P1', character: roster[0] },
      { entryId: 'local-player-2', displayName: 'P2', character: roster[1] }
    ], roster, 1500));
    const p1Match = getAssignedTournamentMatch(bracket, 'local-player-1');
    const p2Match = getAssignedTournamentMatch(bracket, 'local-player-2');

    expect(bracket.entries).toHaveLength(8);
    expect(bracket.entries.filter((entry) => entry.isLocalPlayer).map((entry) => entry.id)).toEqual(['local-player-1', 'local-player-2']);
    expect(p1Match?.status).toBe('ready');
    expect(p2Match?.status).toBe('ready');
    expect(bracket.matches.filter((match) => match.status === 'completed').length).toBeGreaterThan(0);
  });

  it('advances two local players until they meet or one wins the crown', () => {
    let bracket = simulateCpuTournamentMatches(createLocalTournamentBracket([
      { entryId: 'local-player-1', displayName: 'P1', character: roster[0] },
      { entryId: 'local-player-2', displayName: 'P2', character: roster[1] }
    ], roster, 1600));
    let safety = 0;

    while (bracket.status !== 'completed' && safety < 7) {
      const match = getNextPlayableLocalTournamentMatch(bracket);
      expect(match).toBeTruthy();
      const winner = match!.entryAId === 'local-player-2' || match!.entryBId === 'local-player-2'
        ? 'local-player-2'
        : 'local-player-1';
      bracket = simulateCpuTournamentMatches(advanceTournamentBracket(bracket, match!.id, winner, 1600 + safety + 1));
      safety += 1;
    }

    expect(bracket.status).toBe('completed');
    expect(bracket.reward?.state).toBe('earned');
    expect(bracket.matches.find((match) => match.round === 3)?.winnerEntryId).toMatch(/^local-player-[12]$/);
  });

  it('creates a custom local bracket where every entrant is human-controlled', () => {
    const bracket = createCustomLocalTournamentBracket(roster, 1700);
    const readyMatches = bracket.matches.filter((match) => match.status === 'ready');

    expect(bracket.id).toBe('custom-1700');
    expect(bracket.entries).toHaveLength(8);
    expect(bracket.entries.every((entry) => entry.isLocalPlayer && !entry.isCpu)).toBe(true);
    expect(readyMatches).toHaveLength(4);
    expect(getNextPlayableLocalTournamentMatch(bracket)?.id).toBe('r1m1');
    expect(simulateCpuTournamentMatches(bracket).matches.filter((match) => match.status === 'completed')).toHaveLength(0);
  });

  it('advances the player through rounds and awards the local crown', () => {
    let bracket = simulateCpuTournamentMatches(createLocalTournamentBracket(roster[0], roster, 1000));
    while (bracket.status !== 'completed') {
      const match = getAssignedTournamentMatch(bracket, 'local-player-1');
      expect(match).toBeTruthy();
      bracket = simulateCpuTournamentMatches(advanceTournamentBracket(bracket, match!.id, 'local-player-1', 1000 + match!.round));
    }

    expect(bracket.status).toBe('completed');
    expect(bracket.reward?.state).toBe('earned');
    expect(bracket.matches.find((match) => match.round === 3)?.winnerEntryId).toBe('local-player-1');
  });

  it('creates an 8-player infinite bracket with bot-only ready matches', () => {
    const bracket = createInfiniteTournamentBracket(roster, 2000);
    const nextMatch = getNextReadyTournamentMatch(bracket);

    expect(bracket.id).toBe('infinite-2000');
    expect(bracket.entries).toHaveLength(8);
    expect(bracket.entries.every((entry) => entry.isCpu && entry.isBot && entry.botKp && entry.botKr)).toBe(true);
    expect(nextMatch?.id).toBe('r1m1');
  });

  it('advances an infinite bracket through every played bot match', () => {
    let bracket = createInfiniteTournamentBracket(roster, 3000);
    let completedMatches = 0;

    while (bracket.status !== 'completed') {
      const match = getNextReadyTournamentMatch(bracket);
      expect(match?.entryAId).toBeTruthy();
      expect(match?.entryBId).toBeTruthy();
      bracket = advanceTournamentBracket(bracket, match!.id, match!.entryAId!, 3000 + completedMatches + 1);
      completedMatches += 1;
    }

    expect(completedMatches).toBe(7);
    expect(bracket.matches.every((match) => match.status === 'completed')).toBe(true);
    expect(bracket.matches.find((match) => match.round === 3)?.winnerEntryId).toBeTruthy();
  });
});

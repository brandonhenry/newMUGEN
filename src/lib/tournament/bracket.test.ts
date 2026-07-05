import { describe, expect, it } from 'vitest';
import {
  advanceTournamentBracket,
  createInfiniteTournamentBracket,
  createLocalTournamentBracket,
  getAssignedTournamentMatch,
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
    const match = getAssignedTournamentMatch(bracket, 'local-player');
    const opponent = getTournamentOpponentEntry(bracket, match, 'local-player');

    expect(bracket.kind).toBe('freeLocal');
    expect(bracket.entries).toHaveLength(8);
    expect(bracket.matches).toHaveLength(7);
    expect(match?.round).toBe(1);
    expect(opponent?.isCpu).toBe(true);
  });

  it('simulates CPU-only matches while preserving the player match', () => {
    const bracket = simulateCpuTournamentMatches(createLocalTournamentBracket(roster[0], roster, 1000));
    const playerMatch = getAssignedTournamentMatch(bracket, 'local-player');
    const completedCpuMatches = bracket.matches.filter((match) => match.status === 'completed');

    expect(playerMatch?.status).toBe('ready');
    expect(completedCpuMatches.length).toBeGreaterThan(0);
  });

  it('advances the player through rounds and awards the local crown', () => {
    let bracket = simulateCpuTournamentMatches(createLocalTournamentBracket(roster[0], roster, 1000));
    while (bracket.status !== 'completed') {
      const match = getAssignedTournamentMatch(bracket, 'local-player');
      expect(match).toBeTruthy();
      bracket = simulateCpuTournamentMatches(advanceTournamentBracket(bracket, match!.id, 'local-player', 1000 + match!.round));
    }

    expect(bracket.status).toBe('completed');
    expect(bracket.reward?.state).toBe('earned');
    expect(bracket.matches.find((match) => match.round === 3)?.winnerEntryId).toBe('local-player');
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

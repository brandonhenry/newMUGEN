import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_REGISTRATION_OPENS_AT,
  OFFICIAL_STARTS_AT,
  advanceOfficialSet,
  enterOfficialTournament,
  finalizeOfficialCheckIn,
  generateOfficialBracket,
  getOfficialTournamentStatus,
  joinOfficialTournamentRoom,
  lockOfficialGameFighter,
  makeDoubleEliminationMatches,
  makeLaunchOfficialTournament,
  officialSummary,
  reportOfficialGame,
  writeOfficialTournament
} from '../netlify/functions/_official-tournament-store.mjs';

class MemoryStore {
  data = new Map<string, unknown>();

  async get(key: string) {
    return this.data.get(key) ?? null;
  }

  async setJSON(key: string, value: unknown) {
    this.data.set(key, structuredClone(value));
  }

  async list() {
    return { blobs: [...this.data.keys()].map((key) => ({ key })) };
  }
}

function entrants(count: number, checkedIn = true) {
  return Array.from({ length: count }, (_, index) => ({
    id: `entry-${index + 1}`,
    playerId: `player-${index + 1}`,
    registeredDeviceId: `device-${index + 1}`,
    displayName: `P${index + 1}`,
    email: `p${index + 1}@example.com`,
    characterId: `fighter-${index + 1}`,
    seed: index + 1,
    registrationState: 'confirmed',
    checkedInAt: checkedIn ? OFFICIAL_STARTS_AT - 1_000 : undefined,
    eligibilityAcceptedAt: 1,
    rulesAcceptedAt: 1,
    rulesVersion: '2026-07-16',
    paymentState: 'notRequired',
    joinedAt: index + 1
  }));
}

describe('K.O.R.E. official tournament', () => {
  it('advertises the exact launch schedule and guaranteed field', () => {
    const event = makeLaunchOfficialTournament(1);
    const summary = officialSummary(event, OFFICIAL_REGISTRATION_OPENS_AT - 4 * 86_400_000);
    expect(summary).toMatchObject({
      kind: 'officialOnline',
      entryFeeUsd: 0,
      capacity: 32,
      minEntries: 32,
      prizeLabel: '$60 / $25 / $15 Lightning',
      startsLabel: 'Registration opens in 4 days'
    });
  });

  it('keeps 32 confirmed entrants and puts later registrations on an ordered waitlist', async () => {
    const store = new MemoryStore();
    const event = { ...makeLaunchOfficialTournament(1), status: 'registrationOpen', entries: entrants(32, false) };
    await writeOfficialTournament(store as never, event);
    await store.setJSON('active.json', { id: event.id });
    const result = await enterOfficialTournament(store as never, {
      playerId: 'player-33', posthogDeviceId: 'device-33', displayName: 'P33', characterId: 'fighter-33', email: 'p33@example.com', eligibilityAccepted: true, rulesAccepted: true
    }, OFFICIAL_REGISTRATION_OPENS_AT + 1);
    expect(result.entry).toMatchObject({ registrationState: 'waitlisted', waitlistPosition: 1, seed: 0 });
  });

  it('postpones below 32 checked-in players and starts a 63-match double-elimination graph at 32', () => {
    const short = { ...makeLaunchOfficialTournament(1), status: 'checkIn', entries: entrants(31) };
    expect(finalizeOfficialCheckIn(short, OFFICIAL_STARTS_AT).status).toBe('postponed');

    const full = { ...makeLaunchOfficialTournament(1), status: 'checkIn', entries: entrants(32) };
    const started = finalizeOfficialCheckIn(full, OFFICIAL_STARTS_AT);
    expect(started.status).toBe('roundActive');
    expect(started.matches).toHaveLength(63);
    expect(started.matches.filter((match: any) => match.status === 'ready')).toHaveLength(16);
    expect(started.matches.find((match: any) => match.id === 'gf-reset')).toMatchObject({ resetRequired: false, targetWins: 3 });
  });

  it('promotes checked-in waitlisted players over missed primary entrants', () => {
    const entries = entrants(32);
    entries[31].checkedInAt = undefined;
    entries.push({ ...entrants(1)[0], id: 'wait-1', playerId: 'wait-player', registeredDeviceId: 'wait-device', seed: 0, registrationState: 'waitlisted', waitlistPosition: 1, joinedAt: 100 });
    const started = finalizeOfficialCheckIn({ ...makeLaunchOfficialTournament(1), status: 'checkIn', entries }, OFFICIAL_STARTS_AT);
    expect(started.status).toBe('roundActive');
    expect(started.entries.find((entry: any) => entry.id === 'wait-1')).toMatchObject({ registrationState: 'confirmed', checkedInAt: OFFICIAL_STARTS_AT - 1_000 });
    expect(started.entries.find((entry: any) => entry.id === 'entry-32')).toMatchObject({ registrationState: 'missedCheckIn' });
  });

  it('routes winners and losers through a standard four-player graph', async () => {
    const store = new MemoryStore();
    let event = generateOfficialBracket({ ...makeLaunchOfficialTournament(1), capacity: 4, minEntries: 4, entries: entrants(4) }, 1_000);
    await writeOfficialTournament(store as never, event);
    const match = event.matches.find((candidate: any) => candidate.id === 'w1m1')!;
    const entryA = event.entries.find((entry: any) => entry.id === match.entryAId)!;
    const entryB = event.entries.find((entry: any) => entry.id === match.entryBId)!;

    for (let game = 0; game < 2; game += 1) {
      await lockOfficialGameFighter(store as never, { tournamentId: event.id, matchId: match.id, playerId: entryA.playerId, posthogDeviceId: entryA.registeredDeviceId, characterId: `a-${game}` }, 2_000 + game * 10);
      await lockOfficialGameFighter(store as never, { tournamentId: event.id, matchId: match.id, playerId: entryB.playerId, posthogDeviceId: entryB.registeredDeviceId, characterId: `b-${game}` }, 2_001 + game * 10);
      await reportOfficialGame(store as never, { tournamentId: event.id, matchId: match.id, reporterPlayerId: entryA.playerId, posthogDeviceId: entryA.registeredDeviceId, roomId: match.roomId, winnerEntryId: entryA.id, gameNumber: game + 1 }, 2_002 + game * 10);
      await reportOfficialGame(store as never, { tournamentId: event.id, matchId: match.id, reporterPlayerId: entryB.playerId, posthogDeviceId: entryB.registeredDeviceId, roomId: match.roomId, winnerEntryId: entryA.id, gameNumber: game + 1 }, 2_003 + game * 10);
      if (game === 0) {
        await expect(reportOfficialGame(store as never, { tournamentId: event.id, matchId: match.id, reporterPlayerId: entryA.playerId, posthogDeviceId: entryA.registeredDeviceId, roomId: match.roomId, winnerEntryId: entryA.id, gameNumber: 1 }, 2_004)).resolves.toMatchObject({ bracket: { id: event.id } });
      }
    }

    event = await store.get('events/kore-open-beta-cup-1.json') as any;
    expect(event.matches.find((candidate: any) => candidate.id === 'w1m1')).toMatchObject({ status: 'completed', winnerEntryId: entryA.id, setScore: { [entryA.id]: 2 } });
    expect(event.matches.find((candidate: any) => candidate.id === 'w2m1').entryAId).toBe(entryA.id);
    expect(event.matches.find((candidate: any) => candidate.id === 'l1m1').entryAId).toBe(entryB.id);
  });

  it('builds the expected winners, losers, finals, and reset match counts', () => {
    const matches = makeDoubleEliminationMatches(32);
    expect(matches.filter((match: any) => match.bracketSide === 'winners')).toHaveLength(31);
    expect(matches.filter((match: any) => match.bracketSide === 'losers')).toHaveLength(30);
    expect(matches.filter((match: any) => match.bracketSide.startsWith('grandFinal'))).toHaveLength(2);
  });

  it('awards a set forfeit when exactly one player arrives within ten minutes', async () => {
    const store = new MemoryStore();
    let event = generateOfficialBracket({ ...makeLaunchOfficialTournament(1), capacity: 4, minEntries: 4, entries: entrants(4) }, 1_000);
    await writeOfficialTournament(store as never, event);
    const match = event.matches.find((candidate: any) => candidate.id === 'w1m1')!;
    const entry = event.entries.find((candidate: any) => candidate.id === match.entryAId)!;
    await joinOfficialTournamentRoom(store as never, { tournamentId: event.id, matchId: match.id, playerId: entry.playerId, posthogDeviceId: entry.registeredDeviceId, peerId: 'peer-a' }, 2_000);
    const status = await getOfficialTournamentStatus(store as never, event.id, entry.playerId, entry.registeredDeviceId, Number(match.arrivalDeadlineAt) + 1);
    event = status.bracket;
    expect(event.matches.find((candidate: any) => candidate.id === match.id)).toMatchObject({ status: 'completed', winnerEntryId: entry.id, roomStatus: 'forfeit', reportState: 'forfeit' });
  });

  it('completes the full graph and activates a Grand Final reset when the losers champion wins first', () => {
    let event = generateOfficialBracket({ ...makeLaunchOfficialTournament(1), capacity: 8, minEntries: 8, entries: entrants(8) }, 1_000);
    let guard = 0;
    let resetActivated = false;
    while (event.status !== 'completed' && guard < 100) {
      const ready = event.matches.find((match: any) => match.status === 'ready');
      expect(ready, `ready match at step ${guard}`).toBeTruthy();
      const winnerEntryId = ready.id === 'gf1' ? ready.entryBId : ready.entryAId;
      const resolved = { ...ready, status: 'completed', winnerEntryId, reportedAt: 2_000 + guard };
      event = { ...event, matches: event.matches.map((match: any) => match.id === ready.id ? resolved : match) } as any;
      event = advanceOfficialSet(event, resolved, 2_000 + guard);
      resetActivated ||= Boolean(event.matches.find((match: any) => match.id === 'gf-reset')?.resetRequired);
      guard += 1;
    }
    expect(event.status).toBe('completed');
    expect(resetActivated).toBe(true);
    expect(event.placements?.[1]).toBeTruthy();
    expect(event.placements?.[2]).toBeTruthy();
    expect(event.placements?.[3]).toBeTruthy();
    expect(new Set(Object.values(event.placements ?? {})).size).toBe(3);
  });
});

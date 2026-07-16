import type {
  TournamentEnterRequest,
  TournamentEnterResult,
  TournamentEmailSubscribeRequest,
  TournamentEmailSubscribeResult,
  TournamentBracket,
  TournamentClaimPrizeRequest,
  TournamentClaimPrizeResult,
  TournamentCheckInRequest,
  TournamentEntry,
  TournamentPaidRecoveryConfirmRequest,
  TournamentPaidRecoveryRequest,
  TournamentPaidRecoveryRequestResult,
  TournamentGameLockInRequest,
  TournamentRoomJoinRequest,
  TournamentRoomStatusRequest,
  TournamentReportRequest,
  TournamentPublicView,
  TournamentStatusResult,
  TournamentSummary
} from './types';

export async function fetchPublicTournament(slug: string): Promise<TournamentPublicView> {
  const query = new URLSearchParams({ slug });
  return getJson<{ tournament: TournamentPublicView }>(`/.netlify/functions/tournament-public?${query.toString()}`)
    .then((result) => result.tournament)
    .catch((error) => {
      if (isLocalFallbackAllowed()) return localPublicTournament(slug);
      throw error;
    });
}

export async function fetchTournamentList(): Promise<{ tournaments: TournamentSummary[] }> {
  return getJson<{ tournaments: TournamentSummary[] }>('/.netlify/functions/tournament-list').catch((error) => {
    if (isLocalFallbackAllowed()) return localTournamentList();
    throw error;
  });
}

export async function enterTournament(request: TournamentEnterRequest): Promise<TournamentEnterResult> {
  return postJson<TournamentEnterResult>('/.netlify/functions/tournament-enter', request).catch((error) => {
    if (isLocalFallbackAllowed()) return localEnterTournament(request);
    throw error;
  });
}

export async function fetchTournamentStatus(tournamentId: string, playerId?: string, posthogDeviceId?: string): Promise<TournamentStatusResult> {
  const query = new URLSearchParams({ tournamentId });
  if (playerId) query.set('playerId', playerId);
  if (posthogDeviceId) query.set('posthogDeviceId', posthogDeviceId);
  return getJson<TournamentStatusResult>(`/.netlify/functions/tournament-status?${query.toString()}`).catch((error) => {
    if (isLocalFallbackAllowed()) return localTournamentStatus(tournamentId, playerId);
    throw error;
  });
}

export async function reportTournamentMatch(request: TournamentReportRequest): Promise<TournamentStatusResult> {
  return postJson<TournamentStatusResult>('/.netlify/functions/tournament-report', request).catch((error) => {
    if (isLocalFallbackAllowed()) return localReportTournament(request);
    throw error;
  });
}

export async function claimTournamentPrize(request: TournamentClaimPrizeRequest): Promise<TournamentClaimPrizeResult> {
  return postJson<TournamentClaimPrizeResult>('/.netlify/functions/tournament-claim-prize', request);
}

export async function subscribeTournamentEmail(request: TournamentEmailSubscribeRequest): Promise<TournamentEmailSubscribeResult> {
  return postJson<TournamentEmailSubscribeResult>('/.netlify/functions/tournament-email-subscribe', request).catch((error) => {
    if (isLocalFallbackAllowed()) return { ok: true, email: request.email, emailSent: false };
    throw error;
  });
}

export async function checkInTournament(request: TournamentCheckInRequest): Promise<TournamentStatusResult> {
  return postJson<TournamentStatusResult>('/.netlify/functions/tournament-check-in', request).catch((error) => {
    if (isLocalFallbackAllowed()) return localOfficialCheckIn(request);
    throw error;
  });
}

export async function lockInTournamentGameFighter(request: TournamentGameLockInRequest): Promise<TournamentStatusResult> {
  return postJson<TournamentStatusResult>('/.netlify/functions/tournament-game-lock-in', request).catch((error) => {
    if (isLocalFallbackAllowed()) return localOfficialLockFighter(request);
    throw error;
  });
}

export async function requestPaidTournamentRecovery(request: TournamentPaidRecoveryRequest): Promise<TournamentPaidRecoveryRequestResult> {
  return postJson<TournamentPaidRecoveryRequestResult>('/.netlify/functions/tournament-paid-recovery-request', request);
}

export async function confirmPaidTournamentRecovery(request: TournamentPaidRecoveryConfirmRequest): Promise<TournamentStatusResult> {
  return postJson<TournamentStatusResult>('/.netlify/functions/tournament-paid-recovery-confirm', request);
}

export async function joinTournamentMatchRoom(request: TournamentRoomJoinRequest): Promise<TournamentStatusResult> {
  return postJson<TournamentStatusResult>('/.netlify/functions/tournament-room-join', request);
}

export async function fetchTournamentMatchRoomStatus(request: TournamentRoomStatusRequest): Promise<TournamentStatusResult> {
  const query = new URLSearchParams({
    tournamentId: request.tournamentId,
    matchId: request.matchId,
    playerId: request.playerId
  });
  if (request.posthogDeviceId) query.set('posthogDeviceId', request.posthogDeviceId);
  return getJson<TournamentStatusResult>(`/.netlify/functions/tournament-room-status?${query.toString()}`);
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(await extractErrorMessage(response));
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Service returned an unexpected response');
  return (await response.json()) as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await extractErrorMessage(response));
  return (await response.json()) as T;
}

async function extractErrorMessage(response: Response) {
  try {
    const payload = await response.json();
    return typeof payload?.message === 'string' ? payload.message : typeof payload?.error === 'string' ? payload.error : `Request failed: ${response.status}`;
  } catch {
    return `Request failed: ${response.status}`;
  }
}

function isLocalFallbackAllowed() {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
}

function localPublicTournament(slug: string): TournamentPublicView {
  const bracket = slug === 'kore-open-beta-cup-1' ? readLocalOfficialTournament() : readLocalTournament();
  if (slug !== bracket.id && slug !== bracket.slug) throw new Error('Tournament not found');
  return {
    id: bracket.id,
    slug: bracket.slug || bracket.id,
    name: bracket.name || 'K.O.R.E Online Tournament',
    kind: bracket.kind,
    status: bracket.status,
    entries: bracket.entries.map(({ id, displayName, characterId, seed, isCpu, isBot }) => ({ id, displayName, characterId, seed, isCpu, isBot })),
    matches: bracket.matches.map(({ id, round, index, entryAId, entryBId, winnerEntryId, status, stageId, roomStatus, reportedAt }) => ({ id, round, index, entryAId, entryBId, winnerEntryId, status, stageId, roomStatus, reportedAt })),
    currentRound: bracket.currentRound,
    capacity: bracket.capacity,
    minEntries: bracket.minEntries,
    createdAt: bracket.createdAt,
    updatedAt: bracket.updatedAt,
    rewardLabel: bracket.reward?.label
  };
}

function localTournamentList() {
  const bracket = readLocalTournament();
  const official = readLocalOfficialTournament();
  return {
    tournaments: [
      {
        id: 'free-online-daily',
        kind: 'freeOnline' as const,
        status: bracket.status,
        entryFeeUsd: 0,
        entryFeeLabel: 'Free',
        prizeLabel: 'Profile trophy',
        entries: bracket.entries.length,
        minEntries: 8,
        capacity: 8,
        paidEnabled: false,
        confirmedEntries: bracket.entries.length,
        entriesNeeded: Math.max(0, 8 - bracket.entries.length),
        formingEntries: bracket.status === 'open' ? bracket.entries.length : 0,
        liveTournamentCount: bracket.status === 'open' ? 0 : 1,
        formingTournamentCount: bracket.status === 'open' ? 1 : 0,
        startsLabel: 'Starts when full'
      },
      {
        id: official.id,
        kind: 'officialOnline' as const,
        status: official.status,
        entryFeeUsd: 0,
        entryFeeLabel: 'Free',
        prizeLabel: '$60 / $25 / $15 Lightning',
        entries: official.entries.filter((entry) => entry.registrationState === 'confirmed').length,
        confirmedEntries: official.entries.filter((entry) => entry.registrationState === 'confirmed').length,
        entriesNeeded: Math.max(0, 32 - official.entries.filter((entry) => entry.registrationState === 'confirmed').length),
        checkedInEntries: official.entries.filter((entry) => entry.checkedInAt).length,
        waitlistEntries: official.entries.filter((entry) => entry.registrationState === 'waitlisted').length,
        minEntries: 32,
        capacity: 32,
        paidEnabled: false,
        registrationOpensAt: official.registrationOpensAt,
        checkInOpensAt: official.checkInOpensAt,
        checkInClosesAt: official.checkInClosesAt,
        startsAt: official.startsAt,
        rulesVersion: official.rulesVersion,
        startsLabel: localOfficialStartsLabel(official)
      },
      {
        id: 'paid-lightning-beta',
        kind: 'paidOnline' as const,
        status: 'cancelled' as const,
        entryFeeUsd: 2,
        entryFeeLabel: '$2 Via Cash App',
        prizeLabel: '$15 / $10 / $5 Lightning',
        entries: 0,
        confirmedEntries: 0,
        entriesNeeded: 25,
        minEntries: 25,
        capacity: 25,
        paidEnabled: false,
        formingEntries: 0,
        liveTournamentCount: 0,
        formingTournamentCount: 0,
        estimatedStartLabel: 'Starts once 25 entries enter',
        startsWhenFullLabel: 'Tournament starts once 25 entries enter',
        startsLabel: 'Paid beta unavailable'
      }
    ]
  };
}

const LOCAL_TOURNAMENT_KEY = 'kore.tournament.localOnline';

function localEnterTournament(request: TournamentEnterRequest): TournamentEnterResult {
  if (request.kind === 'paidOnline') throw new Error('Paid Lightning tournaments are not enabled yet.');
  if (request.kind === 'officialOnline') return localEnterOfficialTournament(request);
  const bracket = readLocalTournament();
  const existing = bracket.entries.find((entry) => entry.playerId === request.playerId);
  if (existing) return { bracket, entry: existing };
  if (bracket.entries.length >= bracket.capacity) throw new Error('Tournament is full');
  const now = Date.now();
  const entry: TournamentEntry = {
    id: `entry-${request.playerId}`,
    playerId: request.playerId,
    displayName: request.displayName.toUpperCase().slice(0, 12) || 'PLAYER',
    characterId: request.characterId,
    seed: bracket.entries.length + 1,
    paymentState: 'notRequired',
    joinedAt: now
  };
  const next: TournamentBracket = {
    ...bracket,
    entries: [...bracket.entries, entry],
    updatedAt: now
  };
  writeLocalTournament(next);
  return { bracket: next, entry };
}

function localTournamentStatus(tournamentId: string, playerId?: string): TournamentStatusResult {
  if (tournamentId === 'kore-open-beta-cup-1') {
    const bracket = readLocalOfficialTournament();
    const entry = bracket.entries.find((candidate) => candidate.playerId === playerId || candidate.id === playerId);
    return { bracket, entry, registrationOpensAt: bracket.registrationOpensAt, checkInOpensAt: bracket.checkInOpensAt, checkInClosesAt: bracket.checkInClosesAt, startsAt: bracket.startsAt, statusText: entry?.registrationState === 'waitlisted' ? `Waitlist position ${entry.waitlistPosition ?? 1}` : entry ? 'Registered for K.O.R.E. Open Beta Cup #1' : localOfficialStartsLabel(bracket) };
  }
  const bracket = readLocalTournament();
  if (tournamentId !== bracket.id) throw new Error('Tournament not found');
  const entry = bracket.entries.find((candidate) => candidate.playerId === playerId || candidate.id === playerId);
  const assignedMatch = entry
    ? bracket.matches.find((match) => match.status === 'ready' && (match.entryAId === entry.id || match.entryBId === entry.id))
    : undefined;
  return {
    bracket,
    entry,
    assignedMatch,
    statusText: assignedMatch ? 'Match ready' : `${bracket.entries.length} / ${bracket.minEntries} entered`
  };
}

function localReportTournament(request: TournamentReportRequest): TournamentStatusResult {
  const bracket = readLocalTournament();
  if (request.tournamentId !== bracket.id) throw new Error('Tournament not found');
  const matches = bracket.matches.map((match) =>
    match.id === request.matchId
      ? { ...match, winnerEntryId: request.winnerEntryId, status: 'completed' as const, reportedAt: Date.now() }
      : match
  );
  const next = { ...bracket, matches, updatedAt: Date.now() };
  writeLocalTournament(next);
  return localTournamentStatus(request.tournamentId, request.reporterPlayerId);
}

function readLocalTournament(): TournamentBracket {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_TOURNAMENT_KEY) ?? 'null') as TournamentBracket | null;
    if (parsed?.id) return parsed;
  } catch {
    // no-op
  }
  const now = Date.now();
  return {
    id: 'free-online-daily',
    kind: 'freeOnline',
    status: 'open',
    entries: [],
    matches: [],
    currentRound: 1,
    capacity: 8,
    minEntries: 8,
    paidEnabled: false,
    createdAt: now,
    updatedAt: now,
    reward: { kind: 'profilePoints', label: 'Tournament profile trophy', state: 'locked' }
  };
}

function writeLocalTournament(bracket: TournamentBracket) {
  window.localStorage.setItem(LOCAL_TOURNAMENT_KEY, JSON.stringify(bracket));
}

const LOCAL_OFFICIAL_TOURNAMENT_KEY = 'kore.tournament.localOfficial.v1';

function readLocalOfficialTournament(): TournamentBracket {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_OFFICIAL_TOURNAMENT_KEY) ?? 'null') as TournamentBracket | null;
    if (parsed?.id === 'kore-open-beta-cup-1') return parsed;
  } catch {
    // no-op
  }
  const now = Date.now();
  const registrationOpensAt = Date.parse('2026-07-20T05:00:00.000Z');
  const checkInOpensAt = Date.parse('2026-08-01T23:30:00.000Z');
  const startsAt = Date.parse('2026-08-02T00:00:00.000Z');
  return {
    id: 'kore-open-beta-cup-1',
    slug: 'kore-open-beta-cup-1',
    name: 'K.O.R.E. Open Beta Cup #1',
    kind: 'officialOnline',
    status: now < registrationOpensAt ? 'announced' : now < checkInOpensAt ? 'registrationOpen' : now < startsAt ? 'checkIn' : 'postponed',
    entries: [],
    matches: [],
    currentRound: 0,
    capacity: 32,
    minEntries: 32,
    paidEnabled: false,
    registrationOpensAt,
    checkInOpensAt,
    checkInClosesAt: startsAt,
    startsAt,
    timezone: 'America/Chicago',
    rulesVersion: '2026-07-16',
    prizesUsd: { 1: 60, 2: 25, 3: 15 },
    format: { elimination: 'double', gamesToWin: 2, finalsGamesToWin: 3, roundsToWin: 3, roundTimerSeconds: 60, fighterSelection: 'freeHiddenLock', grandFinalReset: true, noShowMinutes: 10 },
    createdAt: now,
    updatedAt: now,
    reward: { kind: 'lightningPrize', label: '$60 / $25 / $15 Lightning prizes', state: 'locked' }
  };
}

function localEnterOfficialTournament(request: TournamentEnterRequest): TournamentEnterResult {
  const bracket = readLocalOfficialTournament();
  if (Date.now() < Number(bracket.registrationOpensAt)) throw new Error('Registration opens July 20, 2026');
  if (!request.posthogDeviceId || !request.email || !request.eligibilityAccepted || !request.rulesAccepted) throw new Error('Profile, email, Global 18+ eligibility, and rules acceptance are required');
  const existing = bracket.entries.find((entry) => entry.playerId === request.playerId);
  if (existing) return { bracket, entry: existing };
  const confirmed = bracket.entries.filter((entry) => entry.registrationState === 'confirmed').length;
  const waitlisted = bracket.entries.filter((entry) => entry.registrationState === 'waitlisted').length;
  const entry: TournamentEntry = {
    id: `official-${request.playerId}-${Date.now()}`,
    playerId: request.playerId,
    registeredDeviceId: request.posthogDeviceId,
    displayName: request.displayName.toUpperCase().slice(0, 12) || 'PLAYER',
    email: request.email,
    characterId: request.characterId,
    seed: confirmed < 32 ? confirmed + 1 : 0,
    registrationState: confirmed < 32 ? 'confirmed' : 'waitlisted',
    waitlistPosition: confirmed < 32 ? undefined : waitlisted + 1,
    eligibilityAcceptedAt: Date.now(),
    rulesAcceptedAt: Date.now(),
    rulesVersion: '2026-07-16',
    paymentState: 'notRequired',
    joinedAt: Date.now()
  };
  const next = { ...bracket, entries: [...bracket.entries, entry], updatedAt: Date.now() };
  window.localStorage.setItem(LOCAL_OFFICIAL_TOURNAMENT_KEY, JSON.stringify(next));
  return { bracket: next, entry };
}

function localOfficialStartsLabel(bracket: TournamentBracket) {
  const now = Date.now();
  if (now < Number(bracket.registrationOpensAt)) {
    const days = Math.ceil((Number(bracket.registrationOpensAt) - now) / 86_400_000);
    return `Registration opens in ${days} day${days === 1 ? '' : 's'}`;
  }
  if (now < Number(bracket.checkInOpensAt)) return 'Registration open';
  if (now < Number(bracket.checkInClosesAt)) return 'Check-in open';
  return 'Postponed — new date coming';
}

function localOfficialCheckIn(request: TournamentCheckInRequest): TournamentStatusResult {
  const bracket = readLocalOfficialTournament();
  if (bracket.status !== 'checkIn') throw new Error('Check-in is not open');
  const entry = bracket.entries.find((candidate) => candidate.playerId === request.playerId);
  if (!entry || entry.registeredDeviceId !== request.posthogDeviceId) throw new Error('Official tournament entry unavailable');
  const checkedInAt = Date.now();
  const entries = bracket.entries.map((candidate) => candidate.id === entry.id ? { ...candidate, checkedInAt } : candidate);
  const next = { ...bracket, entries, updatedAt: checkedInAt };
  window.localStorage.setItem(LOCAL_OFFICIAL_TOURNAMENT_KEY, JSON.stringify(next));
  return { bracket: next, entry: { ...entry, checkedInAt }, statusText: 'Checked in for K.O.R.E. Open Beta Cup #1' };
}

function localOfficialLockFighter(request: TournamentGameLockInRequest): TournamentStatusResult {
  const bracket = readLocalOfficialTournament();
  const entry = bracket.entries.find((candidate) => candidate.playerId === request.playerId);
  const assignedMatch = bracket.matches.find((match) => match.id === request.matchId);
  if (!entry || !assignedMatch) throw new Error('Official tournament set unavailable');
  const fighterLocks = { ...(assignedMatch.fighterLocks || {}), [entry.id]: request.characterId };
  const matches = bracket.matches.map((match) => match.id === assignedMatch.id ? { ...match, fighterLocks } : match);
  const next = { ...bracket, matches, updatedAt: Date.now() };
  window.localStorage.setItem(LOCAL_OFFICIAL_TOURNAMENT_KEY, JSON.stringify(next));
  return { bracket: next, entry, assignedMatch: { ...assignedMatch, fighterLocks }, statusText: 'Fighter locked' };
}

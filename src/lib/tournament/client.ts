import type {
  TournamentEnterRequest,
  TournamentEnterResult,
  TournamentBracket,
  TournamentClaimPrizeRequest,
  TournamentClaimPrizeResult,
  TournamentEntry,
  TournamentReportRequest,
  TournamentStatusResult,
  TournamentSummary
} from './types';

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

export async function fetchTournamentStatus(tournamentId: string, playerId?: string): Promise<TournamentStatusResult> {
  const query = new URLSearchParams({ tournamentId });
  if (playerId) query.set('playerId', playerId);
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

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(await extractErrorMessage(response));
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

function localTournamentList() {
  const bracket = readLocalTournament();
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
        startsLabel: 'Starts when full'
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

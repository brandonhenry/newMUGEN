export type OnlinePlayerProfile = {
  playerId: string;
  displayName: string;
};

export type LeaderboardEntry = {
  playerId: string;
  displayName: string;
  points: number;
  updatedAt: number;
};

export type LeaderboardResult = {
  entries: LeaderboardEntry[];
};

export type LeaderboardSubmitRequest = {
  winner: OnlinePlayerProfile;
  loser: OnlinePlayerProfile;
};

const ONLINE_PROFILE_KEY = 'kore.online.profile';
const LOCAL_LEADERBOARD_KEY = 'kore.online.localLeaderboard';
const POINTS_PER_WIN = 100;

export function readOnlineProfile(): OnlinePlayerProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ONLINE_PROFILE_KEY) ?? 'null') as Partial<OnlinePlayerProfile> | null;
    const playerId = sanitizePlayerId(parsed?.playerId);
    const displayName = sanitizeDisplayName(parsed?.displayName);
    return playerId && displayName ? { playerId, displayName } : null;
  } catch {
    return null;
  }
}

export function writeOnlineProfile(profile: Partial<OnlinePlayerProfile>): OnlinePlayerProfile {
  const playerId = sanitizePlayerId(profile.playerId) || crypto.randomUUID();
  const displayName = sanitizeDisplayName(profile.displayName) || 'PLAYER';
  const next = { playerId, displayName };
  window.localStorage.setItem(ONLINE_PROFILE_KEY, JSON.stringify(next));
  return next;
}

export function sanitizeDisplayName(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
}

export function sanitizePlayerId(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 96);
}

export async function fetchLeaderboard(): Promise<LeaderboardResult> {
  return getJson<LeaderboardResult>('/.netlify/functions/online-leaderboard').catch((error) => {
    if (isLocalFallbackAllowed()) return localLeaderboard();
    throw error;
  });
}

export async function submitLeaderboardResult(request: LeaderboardSubmitRequest): Promise<LeaderboardResult> {
  return postJson<LeaderboardResult>('/.netlify/functions/online-leaderboard-submit', request).catch((error) => {
    if (isLocalFallbackAllowed()) return localSubmitLeaderboardResult(request);
    throw error;
  });
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Leaderboard request failed: ${response.status}`);
  return (await response.json()) as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Leaderboard request failed: ${response.status}`);
  return (await response.json()) as T;
}

function isLocalFallbackAllowed() {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
}

function localLeaderboard(): LeaderboardResult {
  return { entries: sortEntries(readLocalLeaderboard()) };
}

function localSubmitLeaderboardResult(request: LeaderboardSubmitRequest): LeaderboardResult {
  const winner = normalizeProfile(request.winner);
  const loser = normalizeProfile(request.loser);
  if (!winner || !loser || winner.playerId === loser.playerId) return localLeaderboard();
  const byId = new Map(readLocalLeaderboard().map((entry) => [entry.playerId, entry]));
  const now = Date.now();
  const winnerEntry = byId.get(winner.playerId) ?? { ...winner, points: 0, updatedAt: now };
  winnerEntry.displayName = winner.displayName;
  winnerEntry.points += POINTS_PER_WIN;
  winnerEntry.updatedAt = now;
  byId.set(winner.playerId, winnerEntry);
  const entries = sortEntries([...byId.values()]).slice(0, 100);
  window.localStorage.setItem(LOCAL_LEADERBOARD_KEY, JSON.stringify(entries));
  return { entries };
}

function readLocalLeaderboard(): LeaderboardEntry[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_LEADERBOARD_KEY) ?? '[]') as LeaderboardEntry[];
    return Array.isArray(parsed) ? parsed.map(normalizeEntry).filter(Boolean) as LeaderboardEntry[] : [];
  } catch {
    return [];
  }
}

function normalizeProfile(profile: OnlinePlayerProfile | undefined): OnlinePlayerProfile | null {
  const playerId = sanitizePlayerId(profile?.playerId);
  const displayName = sanitizeDisplayName(profile?.displayName);
  return playerId && displayName ? { playerId, displayName } : null;
}

function normalizeEntry(entry: Partial<LeaderboardEntry>): LeaderboardEntry | null {
  const profile = normalizeProfile(entry as OnlinePlayerProfile);
  if (!profile) return null;
  const points = normalizePoints(entry);
  if (points <= 0) return null;
  return {
    ...profile,
    points,
    updatedAt: Math.max(0, Math.round(Number(entry.updatedAt) || 0))
  };
}

function normalizePoints(entry: Partial<LeaderboardEntry> & { wins?: unknown; losses?: unknown }) {
  const directPoints = Math.max(0, Math.round(Number(entry.points) || 0));
  if (directPoints > 0) return directPoints;
  return Math.max(0, Math.round(Number(entry.wins) || 0)) * POINTS_PER_WIN;
}

function sortEntries(entries: LeaderboardEntry[]) {
  return [...entries].sort((a, b) => {
    return b.points - a.points || b.updatedAt - a.updatedAt || a.displayName.localeCompare(b.displayName);
  });
}

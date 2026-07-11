import { sanitizeDisplayName, sanitizePlayerId, type OnlinePlayerProfile } from './online/leaderboard';

export const MATCH_HISTORY_STORAGE_KEY = 'kore.social.matchHistory.v1';
export const FRIENDS_STORAGE_KEY = 'kore.social.friends.v1';
export const RECORDINGS_STORAGE_KEY = 'kore.social.recordings.v1';

export type SocialMatchMode = 'online' | 'ranked' | 'trainingOnline' | 'private' | 'custom';

export type MatchHistoryOpponent = {
  playerId?: string;
  displayName: string;
  characterId: string;
  isBot?: boolean;
};

export type MatchHistoryEntry = {
  id: string;
  profileId: string;
  createdAt: number;
  mode: SocialMatchMode;
  roomId?: string;
  stageId: string;
  localCharacterId: string;
  opponent: MatchHistoryOpponent;
  result: 'win' | 'loss' | 'draw';
  score: [number, number];
  recordingIds: string[];
};

export type FriendEntry = {
  profileId: string;
  playerId: string;
  displayName: string;
  addedAt: number;
  lastPlayedAt?: number;
  lastCharacterId?: string;
};

export type RecordingEntry = {
  id: string;
  profileId: string;
  matchId: string;
  opponentPlayerId?: string;
  createdAt: number;
  label: string;
  status: 'metadataOnly' | 'ready';
};

const MATCH_HISTORY_LIMIT = 100;

export function readMatchHistory(profile: OnlinePlayerProfile | null | undefined): MatchHistoryEntry[] {
  if (!profile) return [];
  const profileId = sanitizePlayerId(profile.playerId);
  return readArray<MatchHistoryEntry>(MATCH_HISTORY_STORAGE_KEY)
    .map(normalizeMatchHistoryEntry)
    .filter((entry): entry is MatchHistoryEntry => entry !== null && entry.profileId === profileId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MATCH_HISTORY_LIMIT);
}

export function recordMatchHistory(profile: OnlinePlayerProfile | null | undefined, entry: Omit<MatchHistoryEntry, 'id' | 'profileId' | 'recordingIds'> & { id?: string; recordingIds?: string[] }) {
  const profileId = sanitizePlayerId(profile?.playerId);
  if (!profileId) return [];
  const normalized = normalizeMatchHistoryEntry({
    ...entry,
    id: entry.id ?? makeMatchHistoryId(profileId, entry),
    profileId,
    recordingIds: entry.recordingIds ?? []
  });
  if (!normalized) return readMatchHistory(profile);
  const all = readArray<MatchHistoryEntry>(MATCH_HISTORY_STORAGE_KEY)
    .map(normalizeMatchHistoryEntry)
    .filter((item): item is MatchHistoryEntry => item !== null);
  const next = [
    normalized,
    ...all.filter((item) => item.id !== normalized.id)
  ]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MATCH_HISTORY_LIMIT);
  writeArray(MATCH_HISTORY_STORAGE_KEY, next);
  return next.filter((item) => item.profileId === profileId);
}

export function readFriends(profile: OnlinePlayerProfile | null | undefined): FriendEntry[] {
  const profileId = sanitizePlayerId(profile?.playerId);
  if (!profileId) return [];
  return readArray<FriendEntry>(FRIENDS_STORAGE_KEY)
    .map(normalizeFriendEntry)
    .filter((entry): entry is FriendEntry => entry !== null && entry.profileId === profileId)
    .sort((a, b) => (b.lastPlayedAt ?? b.addedAt) - (a.lastPlayedAt ?? a.addedAt));
}

export function addFriend(profile: OnlinePlayerProfile | null | undefined, opponent: MatchHistoryOpponent, playedAt = Date.now()) {
  const profileId = sanitizePlayerId(profile?.playerId);
  const playerId = sanitizePlayerId(opponent.playerId);
  const displayName = sanitizeDisplayName(opponent.displayName);
  if (!profileId || !playerId || !displayName || opponent.isBot) return readFriends(profile);
  const all = readArray<FriendEntry>(FRIENDS_STORAGE_KEY)
    .map(normalizeFriendEntry)
    .filter((entry): entry is FriendEntry => entry !== null);
  const existing = all.find((entry) => entry.profileId === profileId && entry.playerId === playerId);
  const nextFriend: FriendEntry = {
    profileId,
    playerId,
    displayName,
    addedAt: existing?.addedAt ?? Date.now(),
    lastPlayedAt: Math.max(existing?.lastPlayedAt ?? 0, playedAt),
    lastCharacterId: opponent.characterId || existing?.lastCharacterId
  };
  writeArray(FRIENDS_STORAGE_KEY, [
    nextFriend,
    ...all.filter((entry) => !(entry.profileId === profileId && entry.playerId === playerId))
  ]);
  return readFriends(profile);
}

export function addFriendEntry(
  profile: OnlinePlayerProfile | null | undefined,
  entry: { playerId: string; displayName: string; lastCharacterId?: string },
  playedAt = Date.now()
) {
  const profileId = sanitizePlayerId(profile?.playerId);
  const playerId = sanitizePlayerId(entry.playerId);
  const displayName = sanitizeDisplayName(entry.displayName);
  if (!profileId || !playerId || !displayName || profileId === playerId) return readFriends(profile);
  const all = readArray<FriendEntry>(FRIENDS_STORAGE_KEY)
    .map(normalizeFriendEntry)
    .filter((item): item is FriendEntry => item !== null);
  const existing = all.find((item) => item.profileId === profileId && item.playerId === playerId);
  const nextFriend: FriendEntry = {
    profileId,
    playerId,
    displayName,
    addedAt: existing?.addedAt ?? Date.now(),
    lastPlayedAt: Math.max(existing?.lastPlayedAt ?? 0, playedAt),
    lastCharacterId: entry.lastCharacterId || existing?.lastCharacterId
  };
  writeArray(FRIENDS_STORAGE_KEY, [
    nextFriend,
    ...all.filter((item) => !(item.profileId === profileId && item.playerId === playerId))
  ]);
  return readFriends(profile);
}

export function isFriend(profile: OnlinePlayerProfile | null | undefined, playerId: string | undefined) {
  const normalized = sanitizePlayerId(playerId);
  return Boolean(normalized && readFriends(profile).some((friend) => friend.playerId === normalized));
}

export function readRecordings(profile: OnlinePlayerProfile | null | undefined, matchId?: string): RecordingEntry[] {
  const profileId = sanitizePlayerId(profile?.playerId);
  if (!profileId) return [];
  return readArray<RecordingEntry>(RECORDINGS_STORAGE_KEY)
    .map(normalizeRecordingEntry)
    .filter((entry): entry is RecordingEntry => entry !== null && entry.profileId === profileId && (!matchId || entry.matchId === matchId))
    .sort((a, b) => b.createdAt - a.createdAt);
}

function makeMatchHistoryId(profileId: string, entry: Omit<MatchHistoryEntry, 'id' | 'profileId' | 'recordingIds'>) {
  const opponentKey = sanitizePlayerId(entry.opponent.playerId) || sanitizeDisplayName(entry.opponent.displayName) || 'opponent';
  return `${profileId}:${entry.mode}:${entry.roomId ?? 'local'}:${entry.createdAt}:${opponentKey}`;
}

function normalizeMatchHistoryEntry(value: Partial<MatchHistoryEntry> | null | undefined): MatchHistoryEntry | null {
  if (!value) return null;
  const profileId = sanitizePlayerId(value.profileId);
  const id = typeof value.id === 'string' && value.id.length > 0 ? value.id.slice(0, 180) : '';
  const mode = value.mode;
  const opponent = normalizeOpponent(value.opponent);
  if (!profileId || !id || !opponent || (mode !== 'online' && mode !== 'ranked' && mode !== 'trainingOnline' && mode !== 'private' && mode !== 'custom')) return null;
  return {
    id,
    profileId,
    createdAt: Math.max(0, Math.round(Number(value.createdAt) || Date.now())),
    mode,
    roomId: typeof value.roomId === 'string' ? value.roomId.slice(0, 120) : undefined,
    stageId: typeof value.stageId === 'string' ? value.stageId.slice(0, 96) : '',
    localCharacterId: typeof value.localCharacterId === 'string' ? value.localCharacterId.slice(0, 96) : '',
    opponent,
    result: value.result === 'loss' || value.result === 'draw' ? value.result : 'win',
    score: normalizeScore(value.score),
    recordingIds: Array.isArray(value.recordingIds) ? value.recordingIds.filter((item): item is string => typeof item === 'string').slice(0, 12) : []
  };
}

function normalizeOpponent(value: MatchHistoryOpponent | undefined): MatchHistoryOpponent | null {
  const displayName = sanitizeDisplayName(value?.displayName);
  const characterId = typeof value?.characterId === 'string' ? value.characterId.slice(0, 96) : '';
  if (!displayName || !characterId) return null;
  const playerId = sanitizePlayerId(value?.playerId);
  return {
    displayName,
    characterId,
    playerId: playerId || undefined,
    isBot: Boolean(value?.isBot)
  };
}

function normalizeFriendEntry(value: Partial<FriendEntry> | null | undefined): FriendEntry | null {
  if (!value) return null;
  const profileId = sanitizePlayerId(value.profileId);
  const playerId = sanitizePlayerId(value.playerId);
  const displayName = sanitizeDisplayName(value.displayName);
  if (!profileId || !playerId || !displayName) return null;
  return {
    profileId,
    playerId,
    displayName,
    addedAt: Math.max(0, Math.round(Number(value.addedAt) || Date.now())),
    lastPlayedAt: value.lastPlayedAt ? Math.max(0, Math.round(Number(value.lastPlayedAt))) : undefined,
    lastCharacterId: typeof value.lastCharacterId === 'string' ? value.lastCharacterId.slice(0, 96) : undefined
  };
}

function normalizeRecordingEntry(value: Partial<RecordingEntry> | null | undefined): RecordingEntry | null {
  if (!value) return null;
  const id = typeof value.id === 'string' ? value.id.slice(0, 120) : '';
  const profileId = sanitizePlayerId(value.profileId);
  const matchId = typeof value.matchId === 'string' ? value.matchId.slice(0, 180) : '';
  const label = typeof value.label === 'string' ? value.label.slice(0, 64) : '';
  if (!id || !profileId || !matchId || !label) return null;
  return {
    id,
    profileId,
    matchId,
    opponentPlayerId: sanitizePlayerId(value.opponentPlayerId) || undefined,
    createdAt: Math.max(0, Math.round(Number(value.createdAt) || Date.now())),
    label,
    status: value.status === 'ready' ? 'ready' : 'metadataOnly'
  };
}

function normalizeScore(value: unknown): [number, number] {
  if (!Array.isArray(value)) return [0, 0];
  return [
    Math.max(0, Math.round(Number(value[0]) || 0)),
    Math.max(0, Math.round(Number(value[1]) || 0))
  ];
}

function readArray<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function writeArray<T>(key: string, value: T[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

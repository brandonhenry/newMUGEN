import { addFriendEntry, isFriend, readFriends } from '../socialHistory';
import { sanitizeDisplayName, sanitizePlayerId, type OnlinePlayerProfile } from './leaderboard';

export type OnlinePlayerIdentity = {
  playerId: string;
  displayName: string;
  lastSeenAt: number;
  lastCharacterId?: string;
};

export type OnlinePlayerRegisterResult = OnlinePlayerIdentity & {
  created: boolean;
  customSessionToken?: string;
  customSessionExpiresAt?: number;
};

const LOCAL_PLAYER_DIRECTORY_KEY = 'kore.online.playerDirectory.v1';
const LOCAL_DEVICE_MAP_KEY = 'kore.online.playerDeviceMap.v1';

export async function registerOnlinePlayer(
  profile: OnlinePlayerProfile,
  posthogDeviceId: string,
  characterId?: string
): Promise<OnlinePlayerRegisterResult> {
  const body = normalizeRegisterRequest(profile, posthogDeviceId, characterId);
  return postJson<OnlinePlayerRegisterResult>('/.netlify/functions/online-player-register', body).then(storeCustomSessionToken).catch((error) => {
    if (isLocalFallbackAllowed()) return localRegisterOnlinePlayer(body);
    throw error;
  });
}

function storeCustomSessionToken(result: OnlinePlayerRegisterResult) {
  if (typeof sessionStorage !== 'undefined' && result.customSessionToken) {
    sessionStorage.setItem('kore.custom.identityToken.v1', result.customSessionToken);
    sessionStorage.setItem('kore.custom.identityExpiresAt.v1', String(result.customSessionExpiresAt ?? 0));
  }
  return result;
}

export async function lookupOnlinePlayer(playerId: string): Promise<OnlinePlayerIdentity | null> {
  const body = { playerId: sanitizePublicPlayerId(playerId) };
  if (!body.playerId) return null;
  return postJson<OnlinePlayerIdentity | null>('/.netlify/functions/online-player-lookup', body).catch((error) => {
    if (isLocalFallbackAllowed()) return localLookupOnlinePlayer(body.playerId);
    throw error;
  });
}

export async function addFriendByPlayerId(profile: OnlinePlayerProfile | null | undefined, playerId: string) {
  const profileId = sanitizePlayerId(profile?.playerId);
  const targetId = sanitizePublicPlayerId(playerId);
  if (!profile || !profileId) return { status: 'error' as const, message: 'Choose your player name first', friends: readFriends(profile) };
  if (!targetId) return { status: 'error' as const, message: 'Enter a player ID', friends: readFriends(profile) };
  if (targetId === profileId) return { status: 'error' as const, message: 'That is your player ID', friends: readFriends(profile) };
  if (isFriend(profile, targetId)) return { status: 'already' as const, message: 'Friend already added', friends: readFriends(profile) };
  if (/^bot-/i.test(targetId) || /^rival-/i.test(targetId)) return { status: 'error' as const, message: 'CPU rivals cannot be added', friends: readFriends(profile) };
  const identity = await lookupOnlinePlayer(targetId);
  if (!identity) return { status: 'notFound' as const, message: 'Player ID not found', friends: readFriends(profile) };
  const friends = addFriendEntry(profile, {
    playerId: identity.playerId,
    displayName: identity.displayName,
    lastCharacterId: identity.lastCharacterId
  });
  return { status: 'added' as const, message: `Added ${identity.displayName}`, friends, friend: identity };
}

export function sanitizePublicPlayerId(value: unknown) {
  return sanitizePlayerId(value).toLowerCase();
}

function normalizeRegisterRequest(profile: OnlinePlayerProfile, posthogDeviceId: string, characterId?: string) {
  return {
    playerId: sanitizePublicPlayerId(profile.playerId),
    displayName: sanitizeDisplayName(profile.displayName),
    posthogDeviceId: cleanPrivateDeviceId(posthogDeviceId),
    characterId: cleanCharacterId(characterId)
  };
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

function localRegisterOnlinePlayer(body: ReturnType<typeof normalizeRegisterRequest>): OnlinePlayerRegisterResult {
  if (!body.displayName) throw new Error('Missing display name');
  const deviceMap = readLocalRecord<string>(LOCAL_DEVICE_MAP_KEY);
  const directory = readLocalRecord<OnlinePlayerIdentity>(LOCAL_PLAYER_DIRECTORY_KEY);
  const mappedId = body.posthogDeviceId ? sanitizePublicPlayerId(deviceMap[body.posthogDeviceId]) : '';
  const playerId = mappedId || body.playerId || makePublicPlayerId();
  const existing = directory[playerId];
  const identity: OnlinePlayerIdentity = {
    playerId,
    displayName: body.displayName,
    lastSeenAt: Date.now(),
    lastCharacterId: body.characterId || existing?.lastCharacterId
  };
  directory[playerId] = identity;
  if (body.posthogDeviceId) deviceMap[body.posthogDeviceId] = playerId;
  writeLocalRecord(LOCAL_PLAYER_DIRECTORY_KEY, directory);
  writeLocalRecord(LOCAL_DEVICE_MAP_KEY, deviceMap);
  return { ...identity, created: !existing };
}

function localLookupOnlinePlayer(playerId: string): OnlinePlayerIdentity | null {
  return readLocalRecord<OnlinePlayerIdentity>(LOCAL_PLAYER_DIRECTORY_KEY)[sanitizePublicPlayerId(playerId)] ?? null;
}

function makePublicPlayerId() {
  const random = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `kore-${random}`;
}

function cleanPrivateDeviceId(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/[^a-zA-Z0-9:_.$-]/g, '').slice(0, 160) : '';
}

function cleanCharacterId(value: unknown) {
  return typeof value === 'string' ? value.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 96) : '';
}

function readLocalRecord<T>(key: string): Record<string, T> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, T> : {};
  } catch {
    return {};
  }
}

function writeLocalRecord<T>(key: string, value: Record<string, T>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

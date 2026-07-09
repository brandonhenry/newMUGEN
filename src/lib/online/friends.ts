import { sanitizeDisplayName, sanitizePlayerId, type OnlinePlayerProfile } from './leaderboard';

export const FRIEND_PRESENCE_ONLINE_MS = 45_000;
export const FRIEND_PRESENCE_HEARTBEAT_MS = 15_000;
export const FRIEND_PRESENCE_POLL_MS = 10_000;
export const FRIEND_NOTIFICATION_TTL_MS = 60_000;
export const FRIEND_CHAT_MAX_LENGTH = 160;

export type FriendPresence = {
  playerId: string;
  displayName: string;
  peerId?: string;
  characterId?: string;
  lastSeenAt: number;
  online: boolean;
};

export type FriendInvite = {
  inviteId: string;
  fromPlayerId: string;
  fromDisplayName: string;
  toPlayerId: string;
  roomId: string;
  roomName: string;
  password: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: number;
  respondedAt?: number;
};

export type FriendChatMessage = {
  id: string;
  fromPlayerId: string;
  fromDisplayName: string;
  toPlayerId: string;
  text: string;
  sentAt: number;
};

export type FriendPresenceResult = {
  friends: FriendPresence[];
};

export type FriendInboxResult = {
  invites: FriendInvite[];
};

export type FriendChatResult = {
  messages: FriendChatMessage[];
};

const LOCAL_PRESENCE_KEY = 'kore.online.friendPresence.v1';
const LOCAL_INVITES_KEY = 'kore.online.friendInvites.v1';
const LOCAL_CHAT_KEY = 'kore.online.friendChat.v1';

export async function heartbeatFriendPresence(profile: OnlinePlayerProfile, peerId: string, characterId: string): Promise<FriendPresence> {
  const body = normalizePresenceRequest(profile, peerId, characterId);
  return postJson<FriendPresence>('/.netlify/functions/friend-presence-heartbeat', body).catch((error) => {
    if (isLocalFallbackAllowed()) return localHeartbeatFriendPresence(body);
    throw error;
  });
}

export async function fetchFriendPresence(profile: OnlinePlayerProfile, friendIds: string[]): Promise<FriendPresenceResult> {
  const body = {
    playerId: sanitizePlayerId(profile.playerId),
    friendIds: friendIds.map(sanitizePlayerId).filter(Boolean)
  };
  return postJson<FriendPresenceResult>('/.netlify/functions/friend-presence-list', body).catch((error) => {
    if (isLocalFallbackAllowed()) return localFetchFriendPresence(body.friendIds);
    throw error;
  });
}

export async function sendFriendInvite(
  profile: OnlinePlayerProfile,
  friendId: string,
  roomName: string,
  password: string,
  roomId: string
): Promise<FriendInvite> {
  const body = normalizeInviteRequest(profile, friendId, roomName, password, roomId);
  return postJson<FriendInvite>('/.netlify/functions/friend-invite-send', body).catch((error) => {
    if (isLocalFallbackAllowed()) return localSendFriendInvite(body);
    throw error;
  });
}

export async function fetchFriendInbox(profile: OnlinePlayerProfile): Promise<FriendInboxResult> {
  const playerId = sanitizePlayerId(profile.playerId);
  return postJson<FriendInboxResult>('/.netlify/functions/friend-inbox', { playerId }).catch((error) => {
    if (isLocalFallbackAllowed()) return localFetchFriendInbox(playerId);
    throw error;
  });
}

export async function respondToFriendInvite(profile: OnlinePlayerProfile, inviteId: string, response: 'accepted' | 'declined'): Promise<FriendInvite> {
  const body = {
    playerId: sanitizePlayerId(profile.playerId),
    inviteId: cleanToken(inviteId, 120),
    response
  };
  return postJson<FriendInvite>('/.netlify/functions/friend-invite-respond', body).catch((error) => {
    if (isLocalFallbackAllowed()) return localRespondToFriendInvite(body);
    throw error;
  });
}

export async function sendFriendChat(profile: OnlinePlayerProfile, friendId: string, text: string): Promise<FriendChatMessage> {
  const body = {
    fromPlayerId: sanitizePlayerId(profile.playerId),
    fromDisplayName: sanitizeDisplayName(profile.displayName),
    toPlayerId: sanitizePlayerId(friendId),
    text: sanitizeFriendChatText(text)
  };
  return postJson<FriendChatMessage>('/.netlify/functions/friend-chat-send', body).catch((error) => {
    if (isLocalFallbackAllowed()) return localSendFriendChat(body);
    throw error;
  });
}

export async function fetchFriendChat(profile: OnlinePlayerProfile, friendId: string, since = 0): Promise<FriendChatResult> {
  const body = {
    playerId: sanitizePlayerId(profile.playerId),
    friendId: sanitizePlayerId(friendId),
    since: sanitizeTimestamp(since)
  };
  return postJson<FriendChatResult>('/.netlify/functions/friend-chat-list', body).catch((error) => {
    if (isLocalFallbackAllowed()) return localFetchFriendChat(body);
    throw error;
  });
}

export function isFriendPresenceOnline(lastSeenAt: number, now = Date.now()) {
  return now - sanitizeTimestamp(lastSeenAt) <= FRIEND_PRESENCE_ONLINE_MS;
}

export function sanitizeFriendChatText(value: unknown) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, FRIEND_CHAT_MAX_LENGTH)
    : '';
}

function normalizePresenceRequest(profile: OnlinePlayerProfile, peerId: string, characterId: string) {
  return {
    playerId: sanitizePlayerId(profile.playerId),
    displayName: sanitizeDisplayName(profile.displayName),
    peerId: cleanToken(peerId, 120),
    characterId: cleanToken(characterId, 96)
  };
}

function normalizeInviteRequest(profile: OnlinePlayerProfile, friendId: string, roomName: string, password: string, roomId: string) {
  return {
    fromPlayerId: sanitizePlayerId(profile.playerId),
    fromDisplayName: sanitizeDisplayName(profile.displayName),
    toPlayerId: sanitizePlayerId(friendId),
    roomId: cleanToken(roomId, 120),
    roomName: cleanRoomName(roomName),
    password: cleanPassword(password)
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

function localHeartbeatFriendPresence(body: ReturnType<typeof normalizePresenceRequest>): FriendPresence {
  if (!body.playerId || !body.displayName || !body.peerId) throw new Error('Missing presence fields');
  const now = Date.now();
  const byId = new Map(readLocalArray<FriendPresence>(LOCAL_PRESENCE_KEY).map((presence) => [presence.playerId, presence]));
  const presence = normalizePresence({ ...body, lastSeenAt: now }, now);
  byId.set(presence.playerId, presence);
  writeLocalArray(LOCAL_PRESENCE_KEY, [...byId.values()]);
  return presence;
}

function localFetchFriendPresence(friendIds: string[]): FriendPresenceResult {
  const now = Date.now();
  const wanted = new Set(friendIds);
  return {
    friends: readLocalArray<FriendPresence>(LOCAL_PRESENCE_KEY)
      .map((presence) => normalizePresence(presence, now))
      .filter((presence) => wanted.has(presence.playerId))
  };
}

function localSendFriendInvite(body: ReturnType<typeof normalizeInviteRequest>): FriendInvite {
  if (!body.fromPlayerId || !body.fromDisplayName || !body.toPlayerId || !body.roomId || !body.password) throw new Error('Missing invite fields');
  const invite: FriendInvite = {
    inviteId: crypto.randomUUID(),
    fromPlayerId: body.fromPlayerId,
    fromDisplayName: body.fromDisplayName,
    toPlayerId: body.toPlayerId,
    roomId: body.roomId,
    roomName: body.roomName,
    password: body.password,
    status: 'pending',
    createdAt: Date.now()
  };
  writeLocalArray(LOCAL_INVITES_KEY, [invite, ...readLocalArray<FriendInvite>(LOCAL_INVITES_KEY)].slice(0, 100));
  return invite;
}

function localFetchFriendInbox(playerId: string): FriendInboxResult {
  const now = Date.now();
  const invites = readLocalArray<FriendInvite>(LOCAL_INVITES_KEY)
    .map((invite) => normalizeInvite(invite, now))
    .filter((invite) => invite.toPlayerId === playerId && invite.status === 'pending')
    .sort((a, b) => b.createdAt - a.createdAt);
  return { invites };
}

function localRespondToFriendInvite(body: { playerId: string; inviteId: string; response: 'accepted' | 'declined' }): FriendInvite {
  const now = Date.now();
  let found: FriendInvite | null = null;
  const invites = readLocalArray<FriendInvite>(LOCAL_INVITES_KEY).map((invite) => {
    const normalized = normalizeInvite(invite, now);
    if (normalized.inviteId !== body.inviteId || normalized.toPlayerId !== body.playerId) return normalized;
    found = { ...normalized, status: body.response, respondedAt: now };
    return found;
  });
  if (!found) throw new Error('Invite not found');
  writeLocalArray(LOCAL_INVITES_KEY, invites);
  return found;
}

function localSendFriendChat(body: { fromPlayerId: string; fromDisplayName: string; toPlayerId: string; text: string }): FriendChatMessage {
  if (!body.fromPlayerId || !body.fromDisplayName || !body.toPlayerId || !body.text) throw new Error('Missing chat fields');
  const message: FriendChatMessage = {
    id: crypto.randomUUID(),
    fromPlayerId: body.fromPlayerId,
    fromDisplayName: body.fromDisplayName,
    toPlayerId: body.toPlayerId,
    text: body.text,
    sentAt: Date.now()
  };
  writeLocalArray(LOCAL_CHAT_KEY, [message, ...readLocalArray<FriendChatMessage>(LOCAL_CHAT_KEY)].slice(0, 300));
  return message;
}

function localFetchFriendChat(body: { playerId: string; friendId: string; since: number }): FriendChatResult {
  return {
    messages: readLocalArray<FriendChatMessage>(LOCAL_CHAT_KEY)
      .map(normalizeChatMessage)
      .filter((message): message is FriendChatMessage => Boolean(message))
      .filter((message) => (
        ((message.fromPlayerId === body.playerId && message.toPlayerId === body.friendId) ||
          (message.fromPlayerId === body.friendId && message.toPlayerId === body.playerId)) &&
        message.sentAt > body.since
      ))
      .sort((a, b) => a.sentAt - b.sentAt)
  };
}

function normalizePresence(value: Partial<FriendPresence>, now = Date.now()): FriendPresence {
  const lastSeenAt = sanitizeTimestamp(value.lastSeenAt);
  return {
    playerId: sanitizePlayerId(value.playerId),
    displayName: sanitizeDisplayName(value.displayName) || 'PLAYER',
    peerId: cleanToken(value.peerId, 120) || undefined,
    characterId: cleanToken(value.characterId, 96) || undefined,
    lastSeenAt,
    online: isFriendPresenceOnline(lastSeenAt, now)
  };
}

function normalizeInvite(value: Partial<FriendInvite>, now = Date.now()): FriendInvite {
  const createdAt = sanitizeTimestamp(value.createdAt);
  const expired = now - createdAt > FRIEND_NOTIFICATION_TTL_MS;
  const status = value.status === 'accepted' || value.status === 'declined'
    ? value.status
    : expired ? 'expired' : 'pending';
  return {
    inviteId: cleanToken(value.inviteId, 120),
    fromPlayerId: sanitizePlayerId(value.fromPlayerId),
    fromDisplayName: sanitizeDisplayName(value.fromDisplayName) || 'FRIEND',
    toPlayerId: sanitizePlayerId(value.toPlayerId),
    roomId: cleanToken(value.roomId, 120),
    roomName: cleanRoomName(value.roomName ?? ''),
    password: cleanPassword(value.password),
    status,
    createdAt,
    respondedAt: value.respondedAt ? sanitizeTimestamp(value.respondedAt) : undefined
  };
}

function normalizeChatMessage(value: Partial<FriendChatMessage>): FriendChatMessage | null {
  const id = cleanToken(value.id, 120);
  const fromPlayerId = sanitizePlayerId(value.fromPlayerId);
  const toPlayerId = sanitizePlayerId(value.toPlayerId);
  const text = sanitizeFriendChatText(value.text);
  if (!id || !fromPlayerId || !toPlayerId || !text) return null;
  return {
    id,
    fromPlayerId,
    fromDisplayName: sanitizeDisplayName(value.fromDisplayName) || 'FRIEND',
    toPlayerId,
    text,
    sentAt: sanitizeTimestamp(value.sentAt)
  };
}

function cleanToken(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, maxLength) : '';
}

function cleanRoomName(value: unknown) {
  return typeof value === 'string'
    ? value.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18) || 'PRIVATE ROOM'
    : 'PRIVATE ROOM';
}

function cleanPassword(value: unknown) {
  return typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16) : '';
}

function sanitizeTimestamp(value: unknown) {
  const timestamp = Math.max(0, Math.round(Number(value) || 0));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function readLocalArray<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function writeLocalArray<T>(key: string, value: T[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

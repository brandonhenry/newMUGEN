export const FRIEND_PRESENCE_ONLINE_MS = 45_000;
export const FRIEND_NOTIFICATION_TTL_MS = 60_000;

export function cleanPlayerId(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 96);
}

export function cleanToken(value, maxLength = 120) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, maxLength);
}

export function cleanDisplayName(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12) || fallback;
}

export function cleanRoomName(value) {
  if (typeof value !== 'string') return 'PRIVATE ROOM';
  return value.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18) || 'PRIVATE ROOM';
}

export function cleanPassword(value) {
  if (typeof value !== 'string') return '';
  return value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16);
}

export function cleanChatText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
}

export function cleanTimestamp(value) {
  const timestamp = Math.max(0, Math.round(Number(value) || 0));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function normalizePresence(value, now = Date.now()) {
  const lastSeenAt = cleanTimestamp(value?.lastSeenAt);
  return {
    playerId: cleanPlayerId(value?.playerId),
    displayName: cleanDisplayName(value?.displayName, 'PLAYER'),
    peerId: cleanToken(value?.peerId) || undefined,
    characterId: cleanToken(value?.characterId, 96) || undefined,
    lastSeenAt,
    online: now - lastSeenAt <= FRIEND_PRESENCE_ONLINE_MS
  };
}

export function normalizeInvite(value, now = Date.now()) {
  const createdAt = cleanTimestamp(value?.createdAt);
  const expired = now - createdAt > FRIEND_NOTIFICATION_TTL_MS;
  const status = value?.status === 'accepted' || value?.status === 'declined'
    ? value.status
    : expired ? 'expired' : 'pending';
  return {
    inviteId: cleanToken(value?.inviteId),
    fromPlayerId: cleanPlayerId(value?.fromPlayerId),
    fromDisplayName: cleanDisplayName(value?.fromDisplayName, 'FRIEND'),
    toPlayerId: cleanPlayerId(value?.toPlayerId),
    roomId: cleanToken(value?.roomId),
    roomName: cleanRoomName(value?.roomName),
    password: cleanPassword(value?.password),
    roomKind: value?.roomKind === 'custom' ? 'custom' : 'private',
    status,
    createdAt,
    respondedAt: value?.respondedAt ? cleanTimestamp(value.respondedAt) : undefined
  };
}

export function normalizeChatMessage(value) {
  const id = cleanToken(value?.id);
  const fromPlayerId = cleanPlayerId(value?.fromPlayerId);
  const toPlayerId = cleanPlayerId(value?.toPlayerId);
  const text = cleanChatText(value?.text);
  if (!id || !fromPlayerId || !toPlayerId || !text) return null;
  return {
    id,
    fromPlayerId,
    fromDisplayName: cleanDisplayName(value?.fromDisplayName, 'FRIEND'),
    toPlayerId,
    text,
    sentAt: cleanTimestamp(value?.sentAt)
  };
}

export function presenceKey(playerId) {
  return `presence/${playerId}.json`;
}

export function inviteKey(inviteId) {
  return `invites/${inviteId}.json`;
}

export function chatKey(messageId) {
  return `chat/${messageId}.json`;
}

export async function listJson(store, prefix) {
  const listed = await store.list({ prefix });
  const values = [];
  await Promise.all(
    listed.blobs.map(async (blob) => {
      const value = await store.get(blob.key, { type: 'json' }).catch(() => null);
      if (value) values.push(value);
    })
  );
  return values;
}

export function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  };
}

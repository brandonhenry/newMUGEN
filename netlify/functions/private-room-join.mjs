import { getBlobStore } from './_blob-store.mjs';

const STORE_NAME = 'kore-private-rooms';
const ROOM_PREFIX = 'rooms/';
const ROOM_TTL_MS = 30_000;

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const roomId = cleanId(body.roomId);
    const peerId = cleanId(body.peerId);
    const characterId = cleanId(body.characterId);
    const password = cleanPassword(body.password);
    if (!roomId || !peerId || !characterId || !password) return json(400, { error: 'missing_fields' });

    const store = getBlobStore(STORE_NAME, event);
    const room = await store.get(roomKey(roomId), { type: 'json' }).catch(() => null);
    const now = Date.now();
    if (!room?.roomId || now - room.updatedAt > ROOM_TTL_MS) return json(404, { error: 'room_not_found', message: 'Room not found' });
    if (room.status !== 'waiting' || room.hostPeerId === peerId) return json(409, { error: 'room_unavailable', message: 'Room unavailable' });
    if (cleanPassword(room.password) !== password) return json(403, { error: 'wrong_password', message: 'Wrong password' });

    const joined = {
      ...room,
      status: 'matched',
      guestPeerId: peerId,
      guestCharacterId: characterId,
      updatedAt: now
    };
    await store.setJSON(roomKey(joined.roomId), joined);
    return json(200, roomResult(joined, 'guest'));
  } catch (error) {
    return json(500, { error: 'private_room_join_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

function roomResult(room, role) {
  return {
    role,
    status: room.status,
    roomId: room.roomId,
    ownerToken: role === 'host' ? room.ownerToken : '',
    roomName: room.roomName,
    hostPeerId: room.hostPeerId,
    guestPeerId: room.guestPeerId,
    hostCharacterId: room.hostCharacterId,
    guestCharacterId: room.guestCharacterId,
    stageId: room.stageId,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt
  };
}

function roomKey(roomId) {
  return `${ROOM_PREFIX}${roomId}`;
}

function cleanId(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 96);
}

function cleanPassword(value) {
  if (typeof value !== 'string') return '';
  return value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16);
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  };
}

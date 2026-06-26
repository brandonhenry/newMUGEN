import { getStore } from '@netlify/blobs';

const STORE_NAME = 'kore-private-rooms';
const ROOM_PREFIX = 'rooms/';
const ROOM_TTL_MS = 30_000;

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const peerId = cleanId(body.peerId);
    const characterId = cleanId(body.characterId);
    const stageId = cleanId(body.stageId);
    const roomName = cleanRoomName(body.roomName);
    const password = cleanPassword(body.password);
    const roomId = cleanId(body.roomId);
    const ownerToken = cleanToken(body.ownerToken);
    if (!peerId || !characterId || !stageId || !password) return json(400, { error: 'missing_fields' });

    const store = getStore(STORE_NAME);
    const now = Date.now();
    const rooms = await listRooms(store);
    await pruneExpiredRooms(store, rooms, now);

    if (roomId && ownerToken) {
      const existing = rooms.find((room) => room.roomId === roomId && room.ownerToken === ownerToken);
      if (existing && now - existing.updatedAt <= ROOM_TTL_MS) {
        const updated = { ...existing, peerId, hostPeerId: peerId, hostCharacterId: characterId, stageId, roomName, password, updatedAt: now };
        await store.setJSON(roomKey(updated.roomId), updated);
        return json(200, roomResult(updated, 'host'));
      }
    }

    const created = {
      roomId: crypto.randomUUID(),
      ownerToken: crypto.randomUUID(),
      roomName,
      password,
      hostPeerId: peerId,
      hostCharacterId: characterId,
      stageId,
      status: 'waiting',
      createdAt: now,
      updatedAt: now
    };
    await store.setJSON(roomKey(created.roomId), created);
    return json(200, roomResult(created, 'host'));
  } catch (error) {
    return json(500, { error: 'private_room_create_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

async function listRooms(store) {
  const listed = await store.list({ prefix: ROOM_PREFIX });
  const rooms = [];
  await Promise.all(
    listed.blobs.map(async (blob) => {
      const room = await store.get(blob.key, { type: 'json' }).catch(() => null);
      if (room?.roomId) rooms.push(room);
    })
  );
  return rooms;
}

async function pruneExpiredRooms(store, rooms, now) {
  await Promise.all(
    rooms
      .filter((room) => now - room.updatedAt > ROOM_TTL_MS)
      .map((room) => store.delete(roomKey(room.roomId)).catch(() => undefined))
  );
}

function roomResult(room, role) {
  return {
    role,
    status: room.status,
    roomId: room.roomId,
    ownerToken: room.ownerToken,
    roomName: room.roomName,
    password: role === 'host' ? room.password : undefined,
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

function cleanToken(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 128);
}

function cleanRoomName(value) {
  if (typeof value !== 'string') return 'PRIVATE ROOM';
  return value.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18) || 'PRIVATE ROOM';
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

import { getStore } from '@netlify/blobs';

const STORE_NAME = 'kore-private-rooms';
const ROOM_PREFIX = 'rooms/';
const ROOM_TTL_MS = 30_000;

export async function handler(event) {
  if (event.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });

  try {
    const store = getStore(STORE_NAME);
    const now = Date.now();
    const rooms = await listRooms(store);
    await pruneExpiredRooms(store, rooms, now);
    return json(200, {
      rooms: rooms
        .filter((room) => room.status === 'waiting' && now - room.updatedAt <= ROOM_TTL_MS)
        .map(publicRoom)
        .sort((a, b) => b.updatedAt - a.updatedAt)
    });
  } catch (error) {
    return json(500, { error: 'private_room_list_failed', message: error instanceof Error ? error.message : String(error) });
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
      .map((room) => store.delete(`${ROOM_PREFIX}${room.roomId}`).catch(() => undefined))
  );
}

function publicRoom(room) {
  return {
    roomId: room.roomId,
    roomName: room.roomName,
    hostPeerId: room.hostPeerId,
    guestPeerId: room.guestPeerId,
    hostCharacterId: room.hostCharacterId,
    guestCharacterId: room.guestCharacterId,
    stageId: room.stageId,
    status: room.status,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt
  };
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  };
}

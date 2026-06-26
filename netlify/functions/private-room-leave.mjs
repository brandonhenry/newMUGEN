import { getStore } from '@netlify/blobs';

const STORE_NAME = 'kore-private-rooms';
const ROOM_PREFIX = 'rooms/';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const roomId = cleanId(body.roomId);
    const ownerToken = cleanToken(body.ownerToken);
    const peerId = cleanId(body.peerId);
    const store = getStore(STORE_NAME);

    if (roomId && ownerToken) {
      const room = await store.get(roomKey(roomId), { type: 'json' }).catch(() => null);
      if (room?.ownerToken === ownerToken) {
        await store.delete(roomKey(roomId));
        return json(200, { ok: true });
      }
    }

    if (peerId) {
      const listed = await store.list({ prefix: ROOM_PREFIX });
      await Promise.all(
        listed.blobs.map(async (blob) => {
          const room = await store.get(blob.key, { type: 'json' }).catch(() => null);
          if (room?.hostPeerId === peerId || room?.guestPeerId === peerId) {
            await store.delete(blob.key).catch(() => undefined);
          }
        })
      );
    }

    return json(200, { ok: true });
  } catch (error) {
    return json(500, { error: 'private_room_leave_failed', message: error instanceof Error ? error.message : String(error) });
  }
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

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  };
}

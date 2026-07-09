import { getBlobStore } from './_blob-store.mjs';
import { cleanPlayerId, json, normalizePresence, presenceKey } from './_friends-store.mjs';

const STORE_NAME = 'kore-friends';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const friendIds = Array.isArray(body.friendIds) ? body.friendIds.map(cleanPlayerId).filter(Boolean).slice(0, 100) : [];
    const store = getBlobStore(STORE_NAME, event);
    const now = Date.now();
    const friends = await Promise.all(friendIds.map(async (id) => {
      const presence = await store.get(presenceKey(id), { type: 'json' }).catch(() => null);
      return presence ? normalizePresence(presence, now) : null;
    }));
    return json(200, { friends: friends.filter(Boolean) });
  } catch (error) {
    return json(500, { error: 'friend_presence_list_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

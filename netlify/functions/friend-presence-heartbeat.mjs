import { getBlobStore } from './_blob-store.mjs';
import { cleanDisplayName, cleanPlayerId, cleanToken, json, normalizePresence, presenceKey } from './_friends-store.mjs';

const STORE_NAME = 'kore-friends';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const playerId = cleanPlayerId(body.playerId);
    const displayName = cleanDisplayName(body.displayName);
    const peerId = cleanToken(body.peerId);
    const characterId = cleanToken(body.characterId, 96);
    if (!playerId || !displayName || !peerId) return json(400, { error: 'missing_fields' });
    const presence = normalizePresence({ playerId, displayName, peerId, characterId, lastSeenAt: Date.now() });
    await getBlobStore(STORE_NAME, event).setJSON(presenceKey(playerId), presence);
    return json(200, presence);
  } catch (error) {
    return json(500, { error: 'friend_presence_heartbeat_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

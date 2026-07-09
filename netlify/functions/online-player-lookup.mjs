import { getBlobStore } from './_blob-store.mjs';
import { cleanPlayerId, json, publicPlayerKey } from './_player-identity-store.mjs';

const STORE_NAME = 'kore-player-identity';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const playerId = cleanPlayerId(body.playerId);
    if (!playerId) return json(400, { error: 'missing_player_id' });
    const identity = await getBlobStore(STORE_NAME, event).get(publicPlayerKey(playerId), { type: 'json' }).catch(() => null);
    if (!identity?.playerId) return json(404, { error: 'player_not_found', message: 'Player ID not found' });
    return json(200, {
      playerId: cleanPlayerId(identity.playerId),
      displayName: String(identity.displayName || '').slice(0, 12),
      lastSeenAt: Math.max(0, Math.round(Number(identity.lastSeenAt) || 0)),
      ...(identity.lastCharacterId ? { lastCharacterId: String(identity.lastCharacterId).slice(0, 96) } : {})
    });
  } catch (error) {
    return json(500, { error: 'online_player_lookup_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

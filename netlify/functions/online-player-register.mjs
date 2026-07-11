import { getBlobStore } from './_blob-store.mjs';
import { cleanCharacterId, cleanDisplayName, cleanPlayerId, cleanPostHogDeviceId, deviceMapKey, json, makePublicPlayerId, publicPlayerKey } from './_player-identity-store.mjs';
import { signSpectatorToken } from './_spectator-token.mjs';

const STORE_NAME = 'kore-player-identity';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const posthogDeviceId = cleanPostHogDeviceId(body.posthogDeviceId);
    const requestedPlayerId = cleanPlayerId(body.playerId);
    const displayName = cleanDisplayName(body.displayName);
    const characterId = cleanCharacterId(body.characterId);
    if (!displayName) return json(400, { error: 'missing_display_name' });

    const store = getBlobStore(STORE_NAME, event);
    const mapped = posthogDeviceId
      ? await store.get(deviceMapKey(posthogDeviceId), { type: 'json' }).catch(() => null)
      : null;
    const playerId = cleanPlayerId(mapped?.playerId) || requestedPlayerId || makePublicPlayerId();
    const existing = await store.get(publicPlayerKey(playerId), { type: 'json' }).catch(() => null);
    const identity = {
      playerId,
      displayName,
      lastSeenAt: Date.now(),
      ...(characterId ? { lastCharacterId: characterId } : existing?.lastCharacterId ? { lastCharacterId: existing.lastCharacterId } : {})
    };
    await store.setJSON(publicPlayerKey(playerId), identity);
    if (posthogDeviceId) await store.setJSON(deviceMapKey(posthogDeviceId), { playerId, updatedAt: Date.now() });
    const customSessionExpiresAt = Date.now() + 12 * 60 * 60 * 1000;
    const customSessionToken = process.env.SPECTATOR_TOKEN_SECRET
      ? signSpectatorToken({ aud: 'custom-room', playerId, displayName, exp: customSessionExpiresAt }, process.env.SPECTATOR_TOKEN_SECRET)
      : undefined;
    return json(200, { ...identity, created: !existing, customSessionToken, customSessionExpiresAt });
  } catch (error) {
    return json(500, { error: 'online_player_register_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

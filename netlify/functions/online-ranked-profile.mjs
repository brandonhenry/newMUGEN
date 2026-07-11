import { getBlobStore } from './_blob-store.mjs';
import { cleanCharacterId, cleanProfile, makeDefaultRankedProfile, normalizeRankedProfile } from './_online-ranked.mjs';

const STORE_NAME = 'kore-online-ranked';
const PROFILE_PREFIX = 'profiles/';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const profile = cleanProfile(body?.profile);
    const characterId = cleanCharacterId(body?.characterId);
    if (!profile || !characterId) return json(400, { error: 'invalid_profile' });

    const store = getBlobStore(STORE_NAME, event);
    const key = profileKey(profile.playerId, characterId);
    const existing = await store.get(key, { type: 'json' }).catch(() => null);
    const legacySeed = existing ? null : await readUnusedLegacySeed(store, profile.playerId);
    const source = existing
      ? { ...existing, displayName: profile.displayName, characterId }
      : legacySeed
        ? { ...legacySeed, playerId: profile.playerId, displayName: profile.displayName, characterId }
        : makeDefaultRankedProfile(profile, characterId);
    const ranked = normalizeRankedProfile(source);
    await Promise.all([
      store.setJSON(key, ranked),
      legacySeed ? store.setJSON(legacySeedKey(profile.playerId), { seededCharacterId: characterId, seededAt: Date.now() }) : Promise.resolve()
    ]);
    return json(200, ranked);
  } catch (error) {
    return json(500, { error: 'ranked_profile_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

function profileKey(playerId, characterId) {
  return `${PROFILE_PREFIX}${playerId}/${characterId}`;
}

function legacyProfileKey(playerId) {
  return `${PROFILE_PREFIX}${playerId}`;
}

function legacySeedKey(playerId) {
  return `${PROFILE_PREFIX}${playerId}/_legacy-seeded`;
}

async function readUnusedLegacySeed(store, playerId) {
  const marker = await store.get(legacySeedKey(playerId), { type: 'json' }).catch(() => null);
  if (marker?.seededCharacterId) return null;
  return store.get(legacyProfileKey(playerId), { type: 'json' }).catch(() => null);
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  };
}

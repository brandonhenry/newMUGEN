import { getBlobStore } from './_blob-store.mjs';
import { cleanProfile, makeDefaultRankedProfile, normalizeRankedProfile } from './_online-ranked.mjs';

const STORE_NAME = 'kore-online-ranked';
const PROFILE_PREFIX = 'profiles/';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const profile = cleanProfile(body?.profile);
    if (!profile) return json(400, { error: 'invalid_profile' });

    const store = getBlobStore(STORE_NAME, event);
    const existing = await store.get(profileKey(profile.playerId), { type: 'json' }).catch(() => null);
    const ranked = normalizeRankedProfile(existing ? { ...existing, displayName: profile.displayName } : makeDefaultRankedProfile(profile));
    await store.setJSON(profileKey(profile.playerId), ranked);
    return json(200, ranked);
  } catch (error) {
    return json(500, { error: 'ranked_profile_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

function profileKey(playerId) {
  return `${PROFILE_PREFIX}${playerId}`;
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  };
}

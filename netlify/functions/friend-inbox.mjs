import { getBlobStore } from './_blob-store.mjs';
import { cleanPlayerId, inviteKey, json, listJson, normalizeInvite } from './_friends-store.mjs';

const STORE_NAME = 'kore-friends';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const playerId = cleanPlayerId(body.playerId);
    if (!playerId) return json(400, { error: 'missing_fields' });
    const store = getBlobStore(STORE_NAME, event);
    const now = Date.now();
    const rawInvites = await listJson(store, 'invites/');
    const invites = rawInvites
      .map((invite) => normalizeInvite(invite, now))
      .filter((invite) => invite.toPlayerId === playerId && invite.status === 'pending')
      .sort((a, b) => b.createdAt - a.createdAt);
    await Promise.all(rawInvites.map((invite) => {
      const normalized = normalizeInvite(invite, now);
      if (normalized.status === 'expired') return store.setJSON(inviteKey(normalized.inviteId), normalized).catch(() => undefined);
      return undefined;
    }));
    return json(200, { invites });
  } catch (error) {
    return json(500, { error: 'friend_inbox_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

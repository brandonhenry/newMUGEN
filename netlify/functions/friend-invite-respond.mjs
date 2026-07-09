import { getBlobStore } from './_blob-store.mjs';
import { cleanPlayerId, cleanToken, inviteKey, json, normalizeInvite } from './_friends-store.mjs';

const STORE_NAME = 'kore-friends';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const playerId = cleanPlayerId(body.playerId);
    const inviteId = cleanToken(body.inviteId);
    const response = body.response === 'accepted' ? 'accepted' : body.response === 'declined' ? 'declined' : '';
    if (!playerId || !inviteId || !response) return json(400, { error: 'missing_fields' });
    const store = getBlobStore(STORE_NAME, event);
    const invite = normalizeInvite(await store.get(inviteKey(inviteId), { type: 'json' }).catch(() => null));
    if (!invite.inviteId || invite.toPlayerId !== playerId) return json(404, { error: 'invite_not_found', message: 'Invite not found' });
    const updated = normalizeInvite({ ...invite, status: response, respondedAt: Date.now() });
    await store.setJSON(inviteKey(inviteId), updated);
    return json(200, updated);
  } catch (error) {
    return json(500, { error: 'friend_invite_respond_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

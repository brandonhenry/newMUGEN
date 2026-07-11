import { getBlobStore } from './_blob-store.mjs';
import { cleanDisplayName, cleanPassword, cleanPlayerId, cleanRoomName, cleanToken, inviteKey, json, normalizeInvite } from './_friends-store.mjs';

const STORE_NAME = 'kore-friends';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const invite = normalizeInvite({
      inviteId: crypto.randomUUID(),
      fromPlayerId: cleanPlayerId(body.fromPlayerId),
      fromDisplayName: cleanDisplayName(body.fromDisplayName),
      toPlayerId: cleanPlayerId(body.toPlayerId),
      roomId: cleanToken(body.roomId),
      roomName: cleanRoomName(body.roomName),
      password: cleanPassword(body.password),
      roomKind: body.roomKind === 'custom' ? 'custom' : 'private',
      status: 'pending',
      createdAt: Date.now()
    });
    if (!invite.fromPlayerId || !invite.fromDisplayName || !invite.toPlayerId || !invite.roomId || !invite.password) return json(400, { error: 'missing_fields' });
    await getBlobStore(STORE_NAME, event).setJSON(inviteKey(invite.inviteId), invite);
    return json(200, invite);
  } catch (error) {
    return json(500, { error: 'friend_invite_send_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

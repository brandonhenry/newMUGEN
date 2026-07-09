import { getBlobStore } from './_blob-store.mjs';
import { cleanPlayerId, cleanTimestamp, json, listJson, normalizeChatMessage } from './_friends-store.mjs';

const STORE_NAME = 'kore-friends';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const playerId = cleanPlayerId(body.playerId);
    const friendId = cleanPlayerId(body.friendId);
    const since = cleanTimestamp(body.since);
    if (!playerId || !friendId) return json(400, { error: 'missing_fields' });
    const messages = (await listJson(getBlobStore(STORE_NAME, event), 'chat/'))
      .map(normalizeChatMessage)
      .filter(Boolean)
      .filter((message) => (
        ((message.fromPlayerId === playerId && message.toPlayerId === friendId) ||
          (message.fromPlayerId === friendId && message.toPlayerId === playerId)) &&
        message.sentAt > since
      ))
      .sort((a, b) => a.sentAt - b.sentAt)
      .slice(-100);
    return json(200, { messages });
  } catch (error) {
    return json(500, { error: 'friend_chat_list_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

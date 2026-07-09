import { getBlobStore } from './_blob-store.mjs';
import { chatKey, cleanChatText, cleanDisplayName, cleanPlayerId, json, normalizeChatMessage } from './_friends-store.mjs';

const STORE_NAME = 'kore-friends';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const message = normalizeChatMessage({
      id: crypto.randomUUID(),
      fromPlayerId: cleanPlayerId(body.fromPlayerId),
      fromDisplayName: cleanDisplayName(body.fromDisplayName),
      toPlayerId: cleanPlayerId(body.toPlayerId),
      text: cleanChatText(body.text),
      sentAt: Date.now()
    });
    if (!message) return json(400, { error: 'missing_fields' });
    await getBlobStore(STORE_NAME, event).setJSON(chatKey(message.id), message);
    return json(200, message);
  } catch (error) {
    return json(500, { error: 'friend_chat_send_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

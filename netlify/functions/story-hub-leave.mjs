import { cleanHubId, getStoryHubStore, json, storyHubPresenceKey } from './_story-hub-store.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const sessionId = cleanHubId(JSON.parse(event.body || '{}')?.sessionId);
    if (!sessionId) return json(400, { error: 'invalid_session' });
    await getStoryHubStore(event).delete(storyHubPresenceKey(sessionId)).catch(() => undefined);
    return json(200, { ok: true });
  } catch (error) {
    return json(500, { error: 'story_hub_leave_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

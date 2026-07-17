import { getStoryHubStore, json, listActiveStoryHubPlayers, normalizeStoryHubPresence, storyHubPresenceKey } from './_story-hub-store.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const now = Date.now();
    const presence = normalizeStoryHubPresence(JSON.parse(event.body || '{}'), now);
    if (!presence) return json(400, { error: 'invalid_presence' });
    const store = getStoryHubStore(event);
    await store.setJSON(storyHubPresenceKey(presence.sessionId), presence);
    const players = await listActiveStoryHubPlayers(store, now);
    return json(200, { players, serverTime: now });
  } catch (error) {
    return json(500, { error: 'story_hub_presence_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

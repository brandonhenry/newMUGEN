import { cleanStoryPartyId, getStoryPartyStore, listStoryParties, normalizeStoryParty, partyJson, STORY_PARTY_MAX_MEMBERS, STORY_PARTY_RECONNECT_TTL_MS, storyPartyKey } from './_story-party-store.mjs';

const makeId = () => `party-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export async function handler(event) {
  if (event.httpMethod !== 'POST') return partyJson(405, { error: 'method_not_allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const action = body.action === 'leave' ? 'leave' : body.action === 'room' ? 'room' : 'join';
    const sessionId = cleanStoryPartyId(body.sessionId);
    const worldId = cleanStoryPartyId(body.worldId);
    if (!sessionId || !worldId) return partyJson(400, { error: 'invalid_party_request' });
    const now = Date.now();
    const store = getStoryPartyStore(event);
    const parties = await listStoryParties(store, now);
    let party = parties.find((entry) => entry.id === cleanStoryPartyId(body.partyId));

    if (action === 'join' && !party) {
      party = parties.find((entry) => entry.worldId === worldId && entry.members.length < STORY_PARTY_MAX_MEMBERS && now - entry.updatedAt < 20_000);
    }
    if (action === 'join' && !party) {
      const id = makeId();
      party = normalizeStoryParty({ version: 1, id, worldId, seed: `kore-depth-v1:${worldId}:${id}`, members: [], updatedAt: now }, now);
    }
    if (!party || party.worldId !== worldId) return partyJson(404, { error: 'party_not_found' });

    if (action === 'leave') {
      party.members = party.members.filter((entry) => entry.sessionId !== sessionId);
      party.updatedAt = now;
      party.expiresAt = now + STORY_PARTY_RECONNECT_TTL_MS;
    } else {
      const existing = party.members.find((entry) => entry.sessionId === sessionId);
      if (!existing && party.members.length >= STORY_PARTY_MAX_MEMBERS) return partyJson(409, { error: 'party_full' });
      if (existing) existing.lastSeenAt = now;
      else party.members.push({ sessionId, joinedAt: now, lastSeenAt: now });
      party.members.sort((a, b) => a.joinedAt - b.joinedAt || a.sessionId.localeCompare(b.sessionId));
      party.leaderSessionId = party.members.find((entry) => now - entry.lastSeenAt <= 12_000)?.sessionId || party.members[0]?.sessionId || '';
      if (action === 'room') party.roomId = cleanStoryPartyId(body.roomId, 160);
      party.updatedAt = now;
      party.expiresAt = now + STORY_PARTY_RECONNECT_TTL_MS;
    }
    await store.setJSON(storyPartyKey(party.id), party);
    return partyJson(200, { party, serverTime: now });
  } catch (error) {
    return partyJson(500, { error: 'story_party_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

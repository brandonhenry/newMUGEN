import { getBlobStore } from './_blob-store.mjs';

export const STORY_PARTY_STORE_NAME = 'kore-story-adventure-parties';
export const STORY_PARTY_RECONNECT_TTL_MS = 30 * 60 * 1000;
export const STORY_PARTY_ACTIVE_TTL_MS = 12_000;
export const STORY_PARTY_MAX_MEMBERS = 4;
const WORLD_IDS = new Set(['greenhollow', 'thornwood', 'ironroot', 'bonevault', 'emberdeep', 'frostpeak', 'sunscar', 'skyglass']);

function clean(value, length = 120) {
  return typeof value === 'string' ? value.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, length) : '';
}

function member(value) {
  const sessionId = clean(value?.sessionId);
  const joinedAt = Math.max(0, Math.round(Number(value?.joinedAt) || 0));
  const lastSeenAt = Math.max(joinedAt, Math.round(Number(value?.lastSeenAt) || joinedAt));
  return sessionId && joinedAt ? { sessionId, joinedAt, lastSeenAt } : null;
}

export function normalizeStoryParty(value, now = Date.now()) {
  if (!value || value.version !== 1) return null;
  const id = clean(value.id);
  const worldId = clean(value.worldId);
  if (!id || !WORLD_IDS.has(worldId)) return null;
  const members = Array.isArray(value.members)
    ? value.members.map(member).filter(Boolean).sort((a, b) => a.joinedAt - b.joinedAt || a.sessionId.localeCompare(b.sessionId)).slice(0, STORY_PARTY_MAX_MEMBERS)
    : [];
  const active = members.filter((entry) => now - entry.lastSeenAt <= STORY_PARTY_ACTIVE_TTL_MS);
  const leaderSessionId = active[0]?.sessionId || members[0]?.sessionId || '';
  const updatedAt = Math.max(0, Math.round(Number(value.updatedAt) || now));
  return {
    version: 1,
    id,
    worldId,
    seed: clean(value.seed, 220) || `kore-depth-v1:${worldId}:${id}`,
    generationVersion: 1,
    leaderSessionId,
    members,
    roomId: clean(value.roomId, 160),
    updatedAt,
    expiresAt: Math.max(updatedAt + STORY_PARTY_RECONNECT_TTL_MS, Math.round(Number(value.expiresAt) || 0))
  };
}

export function storyPartyKey(id) {
  return `party/${clean(id)}.json`;
}

export async function listStoryParties(store, now = Date.now()) {
  const listed = await store.list({ prefix: 'party/' });
  const parties = [];
  await Promise.all(listed.blobs.slice(0, 128).map(async (blob) => {
    const value = await store.get(blob.key, { type: 'json' }).catch(() => null);
    const party = normalizeStoryParty(value, now);
    if (!party || (party.members.length === 0 && party.expiresAt <= now)) {
      await store.delete(blob.key).catch(() => undefined);
      return;
    }
    parties.push(party);
  }));
  return parties;
}

export function getStoryPartyStore(event) {
  return getBlobStore(STORY_PARTY_STORE_NAME, event);
}

export function partyJson(statusCode, payload) {
  return { statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(payload) };
}

export function cleanStoryPartyId(value, length = 120) {
  return clean(value, length);
}

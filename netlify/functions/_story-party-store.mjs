import { getBlobStore } from './_blob-store.mjs';

export const STORY_PARTY_STORE_NAME = 'kore-story-adventure-parties';
export const STORY_PARTY_RECONNECT_TTL_MS = 30 * 60 * 1000;
export const STORY_PARTY_ACTIVE_TTL_MS = 12_000;
export const STORY_PARTY_INVITE_TTL_MS = 30_000;
export const STORY_PARTY_MAX_MEMBERS = 5;
export const STORY_DEPTH_GENERATION_VERSION = 3;
const WORLD_IDS = new Set(['greenhollow', 'thornwood', 'ironroot', 'bonevault', 'emberdeep', 'frostpeak', 'sunscar', 'skyglass']);

function clean(value, length = 120) {
  return typeof value === 'string' ? value.replace(/[^a-zA-Z0-9:_ -]/g, '').slice(0, length) : '';
}

function clampCapacity(value) {
  return Math.max(1, Math.min(STORY_PARTY_MAX_MEMBERS, Math.round(Number(value) || 1)));
}

function equippedAvatar(value) {
  const avatarId = clean(value?.avatarId);
  const avatarSet = clean(value?.avatarSet);
  return avatarId && avatarSet ? { avatarId, avatarSet } : null;
}

function member(value) {
  const sessionId = clean(value?.sessionId);
  const joinedAt = Math.max(0, Math.round(Number(value?.joinedAt) || 0));
  const lastSeenAt = Math.max(joinedAt, Math.round(Number(value?.lastSeenAt) || joinedAt));
  const maxHealth = Math.max(1, Math.round(Number(value?.maxHealth) || 100));
  const requestedHealth = Number(value?.health);
  if (!sessionId || !joinedAt) return null;
  return {
    sessionId,
    peerId: clean(value?.peerId),
    displayName: clean(value?.displayName, 32) || 'PLAYER',
    avatarId: clean(value?.avatarId) || 'avatar-1',
    avatarSet: clean(value?.avatarSet) || 'solar-runner',
    equippedAvatars: Array.isArray(value?.equippedAvatars) ? value.equippedAvatars.map(equippedAvatar).filter(Boolean).slice(0, STORY_PARTY_MAX_MEMBERS) : [],
    capacity: clampCapacity(value?.capacity),
    joinedAt,
    lastSeenAt,
    state: value?.state === 'ko' ? 'ko' : 'active',
    health: Math.max(0, Math.min(maxHealth, Number.isFinite(requestedHealth) ? Math.round(requestedHealth) : maxHealth)),
    maxHealth
  };
}

function invite(value, now) {
  const id = clean(value?.id);
  const partyId = clean(value?.partyId);
  const inviterSessionId = clean(value?.inviterSessionId);
  const targetSessionId = clean(value?.targetSessionId);
  const worldId = clean(value?.worldId);
  const createdAt = Math.max(0, Math.round(Number(value?.createdAt) || now));
  const expiresAt = Math.min(createdAt + STORY_PARTY_INVITE_TTL_MS, Math.round(Number(value?.expiresAt) || createdAt + STORY_PARTY_INVITE_TTL_MS));
  return id && partyId && inviterSessionId && targetSessionId && WORLD_IDS.has(worldId) && expiresAt > now
    ? { version: 1, id, partyId, inviterSessionId, inviterDisplayName: clean(value?.inviterDisplayName, 32) || 'PLAYER', targetSessionId, worldId, createdAt, expiresAt }
    : null;
}

export function refreshStoryPartyActors(party) {
  const leader = party.members.find((entry) => entry.sessionId === party.leaderSessionId);
  party.leaderCapacity = clampCapacity(leader?.capacity);
  const aiCount = Math.max(0, party.leaderCapacity - party.members.length);
  const previous = new Map((party.aiActors || []).map((actor) => [actor.avatarId, actor]));
  const reserve = (leader?.equippedAvatars || []).filter((avatar) => avatar.avatarId !== leader.avatarId).slice(0, aiCount);
  party.aiActors = reserve.map((avatar, index) => {
    const old = previous.get(avatar.avatarId);
    const maxHealth = leader?.maxHealth || 100;
    return { id: `ai:${leader.sessionId}:${avatar.avatarId}`, ownerSessionId: leader.sessionId, avatarId: avatar.avatarId, avatarSet: avatar.avatarSet, slot: party.members.length + index, health: Math.max(0, Math.min(maxHealth, old?.health ?? maxHealth)), maxHealth, state: old?.state === 'ko' ? 'ko' : 'active' };
  });
  return party;
}

export function normalizeStoryParty(value, now = Date.now()) {
  if (!value || value.version !== 3) return null;
  const id = clean(value.id);
  const worldId = clean(value.worldId);
  if (!id || !WORLD_IDS.has(worldId)) return null;
  const members = Array.isArray(value.members)
    ? value.members.map(member).filter(Boolean).filter((entry) => now - entry.lastSeenAt <= STORY_PARTY_RECONNECT_TTL_MS).sort((a, b) => a.joinedAt - b.joinedAt || a.sessionId.localeCompare(b.sessionId)).slice(0, STORY_PARTY_MAX_MEMBERS)
    : [];
  const requestedLeader = clean(value.leaderSessionId);
  const active = members.filter((entry) => now - entry.lastSeenAt <= STORY_PARTY_ACTIVE_TTL_MS);
  const leaderSessionId = members.some((entry) => entry.sessionId === requestedLeader) ? requestedLeader : active[0]?.sessionId || members[0]?.sessionId || '';
  const updatedAt = Math.max(0, Math.round(Number(value.updatedAt) || now));
  const party = {
    version: 3,
    id,
    worldId,
    seed: clean(value.seed, 220) || `kore-endless-v${STORY_DEPTH_GENERATION_VERSION}:${worldId}:${id}`,
    generationVersion: STORY_DEPTH_GENERATION_VERSION,
    leaderSessionId,
    leaderCapacity: clampCapacity(members.find((entry) => entry.sessionId === leaderSessionId)?.capacity),
    members,
    aiActors: Array.isArray(value.aiActors) ? value.aiActors : [],
    invites: Array.isArray(value.invites) ? value.invites.map((entry) => invite(entry, now)).filter(Boolean) : [],
    roomId: clean(value.roomId, 160) || 'surface',
    endless: value.endless && typeof value.endless === 'object' ? value.endless : null,
    protocolSequence: Math.max(0, Math.round(Number(value.protocolSequence) || 0)),
    updatedAt,
    expiresAt: Math.max(updatedAt + STORY_PARTY_RECONNECT_TTL_MS, Math.round(Number(value.expiresAt) || 0))
  };
  return refreshStoryPartyActors(party);
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

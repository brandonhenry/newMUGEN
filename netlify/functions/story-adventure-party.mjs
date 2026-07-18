import { cleanStoryPartyId, getStoryPartyStore, listStoryParties, normalizeStoryParty, partyJson, refreshStoryPartyActors, STORY_PARTY_INVITE_TTL_MS, STORY_PARTY_RECONNECT_TTL_MS, storyPartyKey } from './_story-party-store.mjs';

const ACTIONS = new Set(['create', 'invite', 'invite-join', 'invitations', 'heartbeat', 'room', 'transfer', 'leave', 'run-start', 'floor-advance', 'event', 'boon', 'bank', 'run-end']);
const makeId = (prefix = 'party') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function registration(body, sessionId, now, joinedAt = now) {
  const maxHealth = Math.max(1, Math.round(Number(body.maxHealth) || 100));
  const requestedHealth = Number(body.health);
  return {
    sessionId,
    peerId: cleanStoryPartyId(body.peerId),
    displayName: cleanStoryPartyId(body.displayName, 32) || 'PLAYER',
    avatarId: cleanStoryPartyId(body.avatarId) || 'avatar-1',
    avatarSet: cleanStoryPartyId(body.avatarSet) || 'solar-runner',
    equippedAvatars: Array.isArray(body.equippedAvatars) ? body.equippedAvatars.slice(0, 5) : [],
    capacity: Math.max(1, Math.min(5, Math.round(Number(body.capacity) || 1))),
    joinedAt,
    lastSeenAt: now,
    state: body.state === 'ko' ? 'ko' : 'active',
    health: Math.max(0, Math.min(maxHealth, Number.isFinite(requestedHealth) ? Math.round(requestedHealth) : maxHealth)),
    maxHealth
  };
}

async function save(store, party, now) {
  party.updatedAt = now;
  party.expiresAt = now + STORY_PARTY_RECONNECT_TTL_MS;
  party.protocolSequence = Math.max(0, Number(party.protocolSequence) || 0) + 1;
  refreshStoryPartyActors(party);
  await store.setJSON(storyPartyKey(party.id), party);
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return partyJson(405, { error: 'method_not_allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const action = ACTIONS.has(body.action) ? body.action : '';
    const sessionId = cleanStoryPartyId(body.sessionId);
    if (!action || !sessionId) return partyJson(400, { error: 'invalid_party_request' });
    const now = Date.now();
    const store = getStoryPartyStore(event);
    const parties = await listStoryParties(store, now);

    if (action === 'invitations') {
      const invites = parties.flatMap((party) => party.invites || []).filter((invite) => invite.targetSessionId === sessionId && invite.expiresAt > now);
      return partyJson(200, { invites, serverTime: now });
    }

    const worldId = cleanStoryPartyId(body.worldId);
    let party = parties.find((entry) => entry.id === cleanStoryPartyId(body.partyId));

    if (action === 'create') {
      const existing = parties.find((entry) => entry.worldId === worldId && entry.members.some((member) => member.sessionId === sessionId));
      if (existing) return partyJson(200, { party: existing, serverTime: now });
      const id = makeId();
      party = normalizeStoryParty({ version: 3, id, worldId, seed: `kore-endless-v3:${worldId}:${id}`, generationVersion: 3, leaderSessionId: sessionId, members: [registration(body, sessionId, now)], aiActors: [], invites: [], roomId: 'surface', endless: null, protocolSequence: 0, updatedAt: now }, now);
      if (!party) return partyJson(400, { error: 'invalid_world' });
      await save(store, party, now);
      return partyJson(200, { party, serverTime: now });
    }

    if (!party || party.worldId !== worldId) return partyJson(404, { error: 'party_not_found' });
    const caller = party.members.find((entry) => entry.sessionId === sessionId);

    if (action === 'invite') {
      if (!caller || party.leaderSessionId !== sessionId) return partyJson(403, { error: 'leader_required' });
      const targetSessionId = cleanStoryPartyId(body.targetSessionId);
      if (!targetSessionId || party.members.some((entry) => entry.sessionId === targetSessionId)) return partyJson(409, { error: 'invalid_invitee' });
      if (party.members.length >= party.leaderCapacity) return partyJson(409, { error: 'party_full' });
      party.invites = (party.invites || []).filter((invite) => invite.targetSessionId !== targetSessionId);
      const invite = { version: 1, id: makeId('invite'), partyId: party.id, inviterSessionId: sessionId, inviterDisplayName: cleanStoryPartyId(body.inviterDisplayName, 32) || caller.displayName, targetSessionId, worldId, createdAt: now, expiresAt: now + STORY_PARTY_INVITE_TTL_MS };
      party.invites.push(invite);
      await save(store, party, now);
      return partyJson(200, { party, invites: [invite], serverTime: now });
    }

    if (action === 'invite-join') {
      const inviteId = cleanStoryPartyId(body.inviteId);
      const invite = (party.invites || []).find((entry) => entry.id === inviteId && entry.targetSessionId === sessionId && entry.expiresAt > now);
      if (!invite) return partyJson(403, { error: 'invite_required' });
      if (!caller && party.members.length >= party.leaderCapacity) return partyJson(409, { error: 'party_full' });
      if (caller) Object.assign(caller, registration(body, sessionId, now, caller.joinedAt));
      else party.members.push(registration(body, sessionId, now));
      party.invites = party.invites.filter((entry) => entry.id !== invite.id);
      await save(store, party, now);
      return partyJson(200, { party, serverTime: now });
    }

    if (!caller) return partyJson(403, { error: 'party_membership_required' });

    if (action === 'leave') {
      party.members = party.members.filter((entry) => entry.sessionId !== sessionId);
      party.invites = (party.invites || []).filter((invite) => invite.inviterSessionId !== sessionId && invite.targetSessionId !== sessionId);
      if (party.leaderSessionId === sessionId) party.leaderSessionId = party.members.sort((a, b) => a.joinedAt - b.joinedAt || a.sessionId.localeCompare(b.sessionId))[0]?.sessionId || '';
      await save(store, party, now);
      return partyJson(200, { party: party.members.length ? party : null, serverTime: now });
    }

    if (['run-start', 'floor-advance', 'event', 'boon', 'bank', 'run-end'].includes(action)) {
      if (party.leaderSessionId !== sessionId) return partyJson(403, { error: 'leader_required' });
      if (action === 'run-start') {
        const seed = cleanStoryPartyId(body.seed, 220);
        if (!seed) return partyJson(400, { error: 'seed_required' });
        party.seed = seed;
        party.roomId = 'endless:1';
        party.endless = { seed, floorNumber: 1, pressureClockSeconds: 0, eventState: null, boonStacks: {}, rerollTokens: 0, ledger: { xp: 0, defeats: 0, routeCoins: 0, materials: {}, consumables: {}, challengerIds: [], cacheIds: [] }, bankEventIds: [], endReason: null };
      } else if (!party.endless) return partyJson(409, { error: 'run_not_active' });
      else if (action === 'floor-advance') {
        party.endless.floorNumber = Math.max(party.endless.floorNumber, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(body.floorNumber) || party.endless.floorNumber)));
        party.endless.pressureClockSeconds = Math.max(0, Number(body.pressureClockSeconds) || 0);
        party.endless.eventState = null;
        party.roomId = `endless:${party.endless.floorNumber}`;
      } else if (action === 'event') {
        const resolutionId = cleanStoryPartyId(body.resolutionId, 160);
        party.endless.eventResolutionIds = Array.isArray(party.endless.eventResolutionIds) ? party.endless.eventResolutionIds : [];
        if (resolutionId && !party.endless.eventResolutionIds.includes(resolutionId)) {
          party.endless.eventResolutionIds.push(resolutionId);
          party.endless.eventState = body.eventState && typeof body.eventState === 'object' ? body.eventState : null;
        }
      } else if (action === 'boon') {
        party.endless.boonStacks = body.boonStacks && typeof body.boonStacks === 'object' ? body.boonStacks : party.endless.boonStacks;
        party.endless.rerollTokens = Math.max(0, Math.floor(Number(body.rerollTokens) || 0));
      } else if (action === 'bank') {
        const bankEventId = cleanStoryPartyId(body.bankEventId, 160);
        party.endless.bankEventIds = Array.isArray(party.endless.bankEventIds) ? party.endless.bankEventIds : [];
        if (bankEventId && !party.endless.bankEventIds.includes(bankEventId)) party.endless.bankEventIds.push(bankEventId);
      } else if (action === 'run-end') {
        party.endless.endReason = ['wipe', 'abandon', 'all-left'].includes(body.endReason) ? body.endReason : 'abandon';
        party.roomId = `surface:${worldId}-mastery`;
      }
    } else if (action === 'transfer') {
      if (party.leaderSessionId !== sessionId) return partyJson(403, { error: 'leader_required' });
      const targetSessionId = cleanStoryPartyId(body.targetSessionId);
      if (!party.members.some((entry) => entry.sessionId === targetSessionId)) return partyJson(404, { error: 'member_not_found' });
      party.leaderSessionId = targetSessionId;
    } else if (action === 'room') {
      if (party.leaderSessionId !== sessionId) return partyJson(403, { error: 'leader_required' });
      party.roomId = cleanStoryPartyId(body.roomId, 160) || 'surface';
    } else if (action === 'heartbeat') {
      Object.assign(caller, registration(body, sessionId, now, caller.joinedAt));
    }

    await save(store, party, now);
    return partyJson(200, { party, serverTime: now });
  } catch (error) {
    return partyJson(500, { error: 'story_party_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

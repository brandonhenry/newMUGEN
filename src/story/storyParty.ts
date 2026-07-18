import { sanitizeStoryPartyInstance, sanitizeStoryPartyInvite, type StoryPartyInstance, type StoryPartyInvite } from './adventureExploration';
import type { StoryAdventureWorldId, StoryAvatarSet } from './types';

const ENDPOINT = '/.netlify/functions/story-adventure-party';
const ACTIVE_PARTY_KEY = 'kore.story.party.active.v2';

export type StoryPartyRegistration = {
  peerId: string;
  displayName: string;
  avatarId: string;
  avatarSet: StoryAvatarSet;
  equippedAvatars: Array<{ avatarId: string; avatarSet: StoryAvatarSet }>;
  capacity: number;
  health?: number;
  maxHealth?: number;
  state?: 'active' | 'ko';
};

type PartyAction = 'create' | 'invite' | 'invite-join' | 'invitations' | 'heartbeat' | 'room' | 'transfer' | 'leave';

async function requestParty(action: PartyAction, payload: Record<string, unknown>) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
    signal: AbortSignal.timeout(3_500),
    keepalive: action === 'leave'
  });
  if (!response.ok) throw new Error(`Story party request failed (${response.status})`);
  const value = await response.json() as { party?: unknown; invites?: unknown[] };
  return {
    party: sanitizeStoryPartyInstance(value.party),
    invites: Array.isArray(value.invites) ? value.invites.flatMap((invite) => sanitizeStoryPartyInvite(invite) ?? []) : []
  };
}

function rememberParty(party: StoryPartyInstance | null) {
  if (typeof window === 'undefined') return party;
  if (party) window.localStorage.setItem(ACTIVE_PARTY_KEY, party.id);
  else window.localStorage.removeItem(ACTIVE_PARTY_KEY);
  return party;
}

export function readRememberedStoryPartyId() {
  return typeof window === 'undefined' ? '' : window.localStorage.getItem(ACTIVE_PARTY_KEY) ?? '';
}

export async function createStoryParty(sessionId: string, worldId: Exclude<StoryAdventureWorldId, 'world-route'>, registration: StoryPartyRegistration) {
  const result = await requestParty('create', { sessionId, worldId, ...registration });
  return rememberParty(result.party);
}

export async function inviteToStoryParty(party: StoryPartyInstance, sessionId: string, targetSessionId: string, inviterDisplayName: string) {
  return requestParty('invite', { partyId: party.id, sessionId, worldId: party.worldId, targetSessionId, inviterDisplayName });
}

export async function listStoryPartyInvites(sessionId: string) {
  return (await requestParty('invitations', { sessionId, worldId: 'greenhollow' })).invites;
}

export async function acceptStoryPartyInvite(invite: StoryPartyInvite, sessionId: string, registration: StoryPartyRegistration) {
  const result = await requestParty('invite-join', { inviteId: invite.id, partyId: invite.partyId, sessionId, worldId: invite.worldId, ...registration });
  return rememberParty(result.party);
}

export async function heartbeatStoryParty(partyId: string, sessionId: string, worldId: Exclude<StoryAdventureWorldId, 'world-route'>, registration: StoryPartyRegistration) {
  const result = await requestParty('heartbeat', { partyId, sessionId, worldId, ...registration });
  return rememberParty(result.party);
}

export async function updateStoryPartyRoom(party: StoryPartyInstance, sessionId: string, roomId: string) {
  const result = await requestParty('room', { sessionId, worldId: party.worldId, partyId: party.id, roomId });
  return rememberParty(result.party);
}

export async function transferStoryPartyLeadership(party: StoryPartyInstance, sessionId: string, targetSessionId: string) {
  const result = await requestParty('transfer', { sessionId, worldId: party.worldId, partyId: party.id, targetSessionId });
  return rememberParty(result.party);
}

export function leaveStoryParty(party: StoryPartyInstance, sessionId: string) {
  rememberParty(null);
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const payload = new Blob([JSON.stringify({ action: 'leave', sessionId, worldId: party.worldId, partyId: party.id })], { type: 'application/json' });
    navigator.sendBeacon(ENDPOINT, payload);
    return;
  }
  void requestParty('leave', { sessionId, worldId: party.worldId, partyId: party.id }).catch(() => undefined);
}

import { sanitizeStoryPartyInstance, type StoryPartyInstance } from './adventureExploration';
import type { StoryAdventureWorldId } from './types';

const ENDPOINT = '/.netlify/functions/story-adventure-party';

type PartyAction = 'join' | 'room' | 'leave';

async function requestParty(action: PartyAction, sessionId: string, worldId: Exclude<StoryAdventureWorldId, 'world-route'>, partyId?: string, roomId?: string) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, sessionId, worldId, partyId, roomId }),
    signal: AbortSignal.timeout(3_500),
    keepalive: action === 'leave'
  });
  if (!response.ok) throw new Error(`Story party request failed (${response.status})`);
  const value = await response.json() as { party?: unknown };
  return sanitizeStoryPartyInstance(value.party);
}

export async function joinStoryParty(sessionId: string, worldId: Exclude<StoryAdventureWorldId, 'world-route'>, partyId?: string): Promise<StoryPartyInstance | null> {
  return requestParty('join', sessionId, worldId, partyId);
}

export async function updateStoryPartyRoom(party: StoryPartyInstance, sessionId: string, roomId: string): Promise<StoryPartyInstance | null> {
  return requestParty('room', sessionId, party.worldId, party.id, roomId);
}

export function leaveStoryParty(party: StoryPartyInstance, sessionId: string) {
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const payload = new Blob([JSON.stringify({ action: 'leave', sessionId, worldId: party.worldId, partyId: party.id })], { type: 'application/json' });
    navigator.sendBeacon(ENDPOINT, payload);
    return;
  }
  void requestParty('leave', sessionId, party.worldId, party.id).catch(() => undefined);
}

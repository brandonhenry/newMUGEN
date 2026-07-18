import { describe, expect, it } from 'vitest';
// The Netlify registry deliberately stays runtime-JavaScript compatible.
// @ts-expect-error The server module has no declaration file.
import { normalizeStoryParty, refreshStoryPartyActors } from '../../netlify/functions/_story-party-store.mjs';

const member = (sessionId: string, capacity: number, equippedAvatars: Array<{ avatarId: string; avatarSet: string }>, joinedAt = 1) => ({ sessionId, peerId: `${sessionId}-peer`, displayName: sessionId, avatarId: equippedAvatars[0].avatarId, avatarSet: equippedAvatars[0].avatarSet, equippedAvatars, capacity, joinedAt, lastSeenAt: 1_000, state: 'active', health: 100, maxHealth: 100 });
const roster = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => ({ avatarId: `${prefix}-${index + 1}`, avatarSet: 'solar-runner' }));

describe('Adventure party registry v2', () => {
  it('uses generation v2 and fills leader capacity with deterministic AI', () => {
    const party = normalizeStoryParty({ version: 2, id: 'party-a', worldId: 'greenhollow', generationVersion: 2, seed: 'seed', leaderSessionId: 'leader', members: [member('leader', 5, roster('leader', 5))], roomId: 'surface', updatedAt: 1_000 }, 1_000);
    expect(party.generationVersion).toBe(2);
    expect(party.aiActors.map((actor: { avatarId: string }) => actor.avatarId)).toEqual(['leader-2', 'leader-3', 'leader-4', 'leader-5']);
  });

  it('benches highest-index AI as humans join and preserves humans after a lower-capacity transfer', () => {
    const party = normalizeStoryParty({ version: 2, id: 'party-a', worldId: 'greenhollow', generationVersion: 2, seed: 'seed', leaderSessionId: 'leader', members: [member('leader', 5, roster('leader', 5)), member('guest', 2, roster('guest', 2), 2)], roomId: 'surface', updatedAt: 1_000 }, 1_000);
    expect(party.aiActors.map((actor: { avatarId: string }) => actor.avatarId)).toEqual(['leader-2', 'leader-3', 'leader-4']);
    party.leaderSessionId = 'guest';
    refreshStoryPartyActors(party);
    expect(party.members).toHaveLength(2);
    expect(party.leaderCapacity).toBe(2);
    expect(party.aiActors).toHaveLength(0);
  });
});

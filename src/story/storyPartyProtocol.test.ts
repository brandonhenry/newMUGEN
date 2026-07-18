import { describe, expect, it } from 'vitest';
import { decideStoryPartyAi, sanitizeStoryPartyCombatIntent, sanitizeStoryPartySnapshot, unseenStoryPartyRewards, type StoryPartyAuthoritativeSnapshot } from './storyPartyProtocol';

describe('Story party protocol', () => {
  it('validates membership and rejects stale intent sequences', () => {
    const base = { version: 2, type: 'intent', partyId: 'party-a', senderSessionId: 'guest', sequence: 4, clientTime: 1_000, moveX: 4, moveY: -4, jump: true, block: false, attack: 'jab' };
    expect(sanitizeStoryPartyCombatIntent(base, { partyId: 'party-a', members: new Set(['guest']), lastSequence: 3, now: 1_000 })).toMatchObject({ moveX: 1, moveY: -1, attack: 'jab' });
    expect(sanitizeStoryPartyCombatIntent(base, { partyId: 'party-a', members: new Set(['guest']), lastSequence: 4, now: 1_000 })).toBeNull();
    expect(sanitizeStoryPartyCombatIntent(base, { partyId: 'party-a', members: new Set(['other']), lastSequence: 0, now: 1_000 })).toBeNull();
  });

  it('accepts only ordered snapshots from the current authority', () => {
    const snapshot = { version: 2, type: 'snapshot', partyId: 'party-a', leaderSessionId: 'leader', authorityEpoch: 2, sequence: 8, serverTime: 1_000, roomId: 'surface', actors: [], enemies: [], projectiles: [], encounterState: null, rewardsPaused: false, rewardEvents: [] };
    expect(sanitizeStoryPartySnapshot(snapshot, { partyId: 'party-a', leaderSessionId: 'leader', lastEpoch: 2, lastSequence: 7 })?.sequence).toBe(8);
    expect(sanitizeStoryPartySnapshot(snapshot, { partyId: 'party-a', leaderSessionId: 'leader', lastEpoch: 2, lastSequence: 8 })).toBeNull();
    expect(sanitizeStoryPartySnapshot(snapshot, { partyId: 'party-a', leaderSessionId: 'other', lastEpoch: 0, lastSequence: 0 })).toBeNull();
  });

  it('deduplicates recipient rewards and deterministically targets the nearest enemy', () => {
    const seen = new Set<string>();
    const snapshot = { version: 2, type: 'snapshot', partyId: 'party-a', leaderSessionId: 'leader', authorityEpoch: 1, sequence: 1, serverTime: 1, roomId: 'surface', actors: [], enemies: [], projectiles: [], encounterState: null, rewardsPaused: false, rewardEvents: [{ id: 'reward-1', spawnId: 'enemy-1', enemyId: 'ember-fist', tier: 'challenger', xp: 50, recipients: ['leader', 'guest'] }] } satisfies StoryPartyAuthoritativeSnapshot;
    expect(unseenStoryPartyRewards(snapshot, 'guest', seen)).toHaveLength(1);
    expect(unseenStoryPartyRewards(snapshot, 'guest', seen)).toHaveLength(0);
    const decision = decideStoryPartyAi({ id: 'ai-1', x: 0, y: 0, ko: false }, [{ spawnId: 'far', enemyId: 'ember-fist', x: 8, y: 0, facing: -1, health: 10, maxHealth: 10, alive: true }, { spawnId: 'near', enemyId: 'ember-fist', x: 1, y: 0, facing: -1, health: 10, maxHealth: 10, alive: true }], 5_000);
    expect(decision).toMatchObject({ targetSpawnId: 'near', moveX: 0, attack: true });
  });
});

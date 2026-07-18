import { describe, expect, it } from 'vitest';
import { makeStoryEncounterProgress, recordChallengerDefeat, recordRegularDefeat, resetActiveChallenger, selectStoryChallenger, storyChallengerChance, storyEncounterMovementLock, storyEncounterRoll } from './adventureEncounters';
import type { StoryEnemySpawnDefinition, StoryEncounterZoneDefinition } from './types';

const zone: StoryEncounterZoneDefinition = { id: 'zone-5', range: [20, 36], maxActive: 2 };
const spawns: StoryEnemySpawnDefinition[] = [
  { id: 'regular-a', enemyId: 'tide-slime', position: [25, 0.82], patrolRadius: 2, accent: '#4cf', encounterZoneId: zone.id, encounterIndex: 4 },
  { id: 'regular-b', enemyId: 'graveblade', position: [31, 0.82], patrolRadius: 2, accent: '#4cf', encounterZoneId: zone.id, encounterIndex: 4 }
];

describe('story adventure encounter progression', () => {
  it('uses the requested rising challenger odds for encounters one through five', () => {
    expect([0, 1, 2, 3, 4].map(storyChallengerChance)).toEqual([0, 0, 0.35, 0.65, 1]);
  });

  it('keeps deterministic rolls and challenger selection stable for a visit seed', () => {
    expect(storyEncounterRoll('visit-42', zone.id)).toBe(storyEncounterRoll('visit-42', zone.id));
    expect(selectStoryChallenger('visit-42', zone.id, [])).toBe(selectStoryChallenger('visit-42', zone.id, []));
  });

  it('starts one challenger only after every regular in the encounter is defeated', () => {
    const first = recordRegularDefeat({ progress: makeStoryEncounterProgress(), spawnId: spawns[0].id, zone, encounterIndex: 4, spawns, seed: 'visit-42' });
    expect(first.challengeStarted).toBe(false);
    expect(first.progress.activeChallenge).toBeNull();

    const second = recordRegularDefeat({ progress: first.progress, spawnId: spawns[1].id, zone, encounterIndex: 4, spawns, seed: 'visit-42' });
    expect(second.challengeStarted).toBe(true);
    expect(second.progress.activeChallenge?.zoneId).toBe(zone.id);

    const duplicate = recordRegularDefeat({ progress: second.progress, spawnId: spawns[1].id, zone, encounterIndex: 4, spawns, seed: 'visit-42' });
    expect(duplicate.challengeStarted).toBe(false);
    expect(duplicate.progress.selectedChallengers).toHaveLength(1);
  });

  it('avoids challenger repeats until the seeded pool is exhausted', () => {
    const first = selectStoryChallenger('visit-77', 'zone-a', []);
    const second = selectStoryChallenger('visit-77', 'zone-b', [first]);
    expect(second).not.toBe(first);
  });

  it('locks the encounter, resets only the challenger on knockout, and resolves after the duel', () => {
    const started = recordRegularDefeat({
      progress: { ...makeStoryEncounterProgress(), defeatedRegularIds: [spawns[0].id] },
      spawnId: spawns[1].id,
      zone,
      encounterIndex: 4,
      spawns,
      seed: 'visit-42'
    }).progress;
    expect(storyEncounterMovementLock(started, [zone])).toEqual(zone.range);
    const reset = resetActiveChallenger(started);
    expect(reset.activeChallenge?.reset).toBe(1);
    expect(reset.defeatedRegularIds).toEqual(started.defeatedRegularIds);
    const complete = recordChallengerDefeat(reset);
    expect(complete.activeChallenge).toBeNull();
    expect(complete.resolvedZoneIds).toContain(zone.id);
    expect(storyEncounterMovementLock(complete, [zone])).toBeNull();
  });

  it('resets every encounter state on a new visit', () => {
    expect(makeStoryEncounterProgress()).toEqual({ defeatedRegularIds: [], resolvedZoneIds: [], selectedChallengers: [], activeChallenge: null });
  });
});

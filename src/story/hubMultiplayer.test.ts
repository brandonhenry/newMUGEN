import { beforeEach, describe, expect, it } from 'vitest';
import { makeDefaultStoryAvatar } from './avatarCatalog';
import {
  readOrCreateStoryHubGuestIdentity,
  readStoryHubOnlinePreference,
  sanitizeStoryHubChallenge,
  sanitizeStoryHubPresence,
  sanitizeStoryHubPresenceResult,
  writeStoryHubOnlinePreference
} from './hubMultiplayer';

describe('story hub multiplayer', () => {
  beforeEach(() => window.localStorage.clear());

  it('starts online and persists deliberate offline changes', () => {
    expect(readStoryHubOnlinePreference()).toBe(true);
    expect(writeStoryHubOnlinePreference(false)).toBe(false);
    expect(readStoryHubOnlinePreference()).toBe(false);
    expect(writeStoryHubOnlinePreference(true)).toBe(true);
    expect(readStoryHubOnlinePreference()).toBe(true);
  });

  it('assigns a stable guest identity without an online profile', () => {
    const first = readOrCreateStoryHubGuestIdentity();
    const second = readOrCreateStoryHubGuestIdentity();
    expect(first).toEqual(second);
    expect(first.playerId).toMatch(/^story-/);
    expect(first.displayName).toMatch(/^ROOKIE [A-Z0-9]{4}$/);
  });

  it('sanitizes remote recipes and rejects missing sessions', () => {
    expect(sanitizeStoryHubPresence({ displayName: 'NO SESSION' })).toBeNull();
    const presence = sanitizeStoryHubPresence({
      sessionId: 'peer!one',
      playerId: 'player!one',
      displayName: 'Nova!*',
      avatar: { ...makeDefaultStoryAvatar(), hairStyle: 'missing' },
      x: 999,
      y: -50,
      pose: 'attack',
      facing: -1,
      worldId: 'versus',
      updatedAt: 100
    });
    expect(presence).toMatchObject({
      sessionId: 'peerone',
      playerId: 'playerone',
      displayName: 'NOVA',
      x: 19.5,
      y: 0.82,
      pose: 'attack',
      facing: -1,
      worldId: 'versus',
      avatar: { hairStyle: 'short' }
    });
    expect(sanitizeStoryHubPresenceResult({ players: [presence, null], serverTime: 123 }).players).toHaveLength(1);

    expect(sanitizeStoryHubPresence({
      ...presence,
      sessionId: 'runner',
      pose: 'sprint'
    })?.pose).toBe('sprint');
    expect(sanitizeStoryHubPresence({ sessionId: 'bad-world', worldId: 'secret-zone' })?.worldId).toBe('central');
  });

  it('sanitizes challenges and expires pending requests after thirty seconds', () => {
    const now = 10_000;
    const challenge = sanitizeStoryHubChallenge({
      id: 'spar!one',
      challengerSessionId: 'session-one',
      challengerPlayerId: 'player-one',
      challengerDisplayName: 'Nova!*',
      targetSessionId: 'session-two',
      targetPlayerId: 'player-two',
      targetDisplayName: 'Rival',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 90_000
    }, now);

    expect(challenge).toMatchObject({
      id: 'sparone',
      challengerDisplayName: 'NOVA',
      targetDisplayName: 'RIVAL',
      status: 'pending',
      expiresAt: now + 30_000
    });
    expect(sanitizeStoryHubChallenge(challenge, now + 30_001)?.status).toBe('expired');
    expect(sanitizeStoryHubChallenge({ ...challenge, targetSessionId: 'session-one' }, now)).toBeNull();

    const presence = sanitizeStoryHubPresence({
      sessionId: 'session-one',
      playerId: 'player-one',
      displayName: 'Nova',
      avatar: makeDefaultStoryAvatar(),
      x: 0,
      y: 1,
      pose: 'idle',
      facing: 1,
      updatedAt: now,
      challenge
    }, now);
    expect(presence?.challenge).toEqual(challenge);
  });
});

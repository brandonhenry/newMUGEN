import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matchmakeOnline } from './matchmaking';

function installLocalMatchmakingEnvironment() {
  const storage = new Map<string, string>();
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('No local functions'))));
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1' },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    }
  });
  let uuid = 0;
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => {
      uuid += 1;
      return uuid % 2 === 1 ? `room-${Math.ceil(uuid / 2)}` : `owner-${uuid / 2}`;
    })
  });
}

describe('online matchmaking', () => {
  beforeEach(() => {
    installLocalMatchmakingEnvironment();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps ranked and casual queues separate', async () => {
    const ranked = await matchmakeOnline({ peerId: 'ranked-host', characterId: 'astra', stageId: 'dojo', queue: 'ranked', kp: 1200 });
    const casual = await matchmakeOnline({ peerId: 'casual-guest', characterId: 'dax', stageId: 'dojo', queue: 'casual' });

    expect(ranked.status).toBe('waiting');
    expect(casual.role).toBe('host');
    expect(casual.status).toBe('waiting');
  });

  it('keeps training sparring separate from casual and ranked queues', async () => {
    const training = await matchmakeOnline({ peerId: 'training-host', characterId: 'astra', stageId: 'dojo', queue: 'training' });
    const casual = await matchmakeOnline({ peerId: 'casual-guest', characterId: 'dax', stageId: 'dojo', queue: 'casual' });
    const ranked = await matchmakeOnline({ peerId: 'ranked-guest', characterId: 'kiro', stageId: 'dojo', queue: 'ranked', kp: 1200 });

    expect(training.status).toBe('waiting');
    expect(casual.role).toBe('host');
    expect(casual.status).toBe('waiting');
    expect(ranked.role).toBe('host');
    expect(ranked.status).toBe('waiting');
  });

  it('matches training sparring with humans and never fills with a bot', async () => {
    const host = await matchmakeOnline({
      peerId: 'training-host',
      characterId: 'astra',
      stageId: 'dojo',
      queue: 'training',
      allowBotFallback: true,
      availableCharacterIds: ['astra', 'dax']
    });

    vi.setSystemTime(9_001);
    const stillWaiting = await matchmakeOnline({
      peerId: 'training-host',
      characterId: 'astra',
      stageId: 'dojo',
      queue: 'training',
      allowBotFallback: true,
      roomId: host.roomId,
      ownerToken: host.ownerToken,
      availableCharacterIds: ['astra', 'dax']
    });
    const guest = await matchmakeOnline({
      peerId: 'training-guest',
      characterId: 'dax',
      stageId: 'dojo',
      queue: 'training'
    });

    expect(stillWaiting.status).toBe('waiting');
    expect(stillWaiting.botOpponent).toBeUndefined();
    expect(guest.role).toBe('guest');
    expect(guest.opponentKind).toBe('human');
  });

  it('matches a waiting casual room with a human before bot fallback', async () => {
    const host = await matchmakeOnline({ peerId: 'host', characterId: 'astra', stageId: 'dojo', queue: 'casual' });
    vi.setSystemTime(8_500);
    const guest = await matchmakeOnline({ peerId: 'guest', characterId: 'dax', stageId: 'dojo', queue: 'casual' });

    expect(host.status).toBe('waiting');
    expect(guest.role).toBe('guest');
    expect(guest.opponentKind).toBe('human');
    expect(guest.guestPeerId).toBe('guest');
    expect(guest.botOpponent).toBeUndefined();
  });

  it('fills a casual room with a bot after the fallback wait', async () => {
    const host = await matchmakeOnline({
      peerId: 'host',
      characterId: 'astra',
      stageId: 'dojo',
      queue: 'casual',
      availableCharacterIds: ['astra', 'dax']
    });
    vi.setSystemTime(9_001);
    const filled = await matchmakeOnline({
      peerId: 'host',
      characterId: 'astra',
      stageId: 'dojo',
      queue: 'casual',
      roomId: host.roomId,
      ownerToken: host.ownerToken,
      availableCharacterIds: ['astra', 'dax']
    });

    expect(filled.role).toBe('host');
    expect(filled.status).toBe('matched');
    expect(filled.opponentKind).toBe('bot');
    expect(filled.botOpponent?.displayName).toBeTruthy();
    expect(filled.botOpponent?.playerId).not.toMatch(/bot/i);
    expect(filled.guestPeerId).toBe(filled.botOpponent?.playerId);
  });

  it('widens ranked KP matching over time', async () => {
    const host = await matchmakeOnline({ peerId: 'host', characterId: 'astra', stageId: 'dojo', queue: 'ranked', kp: 1200 });
    const tooSoon = await matchmakeOnline({ peerId: 'guest-a', characterId: 'dax', stageId: 'dojo', queue: 'ranked', kp: 1600 });
    vi.setSystemTime(49_000);
    const widened = await matchmakeOnline({
      peerId: 'guest-b',
      characterId: 'kiro',
      stageId: 'dojo',
      queue: 'ranked',
      kp: 1600
    });

    expect(host.status).toBe('waiting');
    expect(tooSoon.role).toBe('host');
    expect(widened.role).toBe('guest');
    expect(widened.hostPeerId).toBe('host');
  });

  it('fills ranked with a close bot only after the ranked fallback wait', async () => {
    const host = await matchmakeOnline({
      peerId: 'ranked-host',
      characterId: 'astra',
      stageId: 'dojo',
      queue: 'ranked',
      kp: 1500,
      kr: { aggression: 70, defense: 60, combo: 55, punishment: 50, resource: 65, consistency: 58 },
      availableCharacterIds: ['astra', 'kiro', 'dax']
    });

    vi.setSystemTime(48_500);
    const tooSoon = await matchmakeOnline({
      peerId: 'ranked-host',
      characterId: 'astra',
      stageId: 'dojo',
      queue: 'ranked',
      kp: 1500,
      roomId: host.roomId,
      ownerToken: host.ownerToken,
      availableCharacterIds: ['astra', 'kiro', 'dax']
    });
    vi.setSystemTime(49_001);
    const filled = await matchmakeOnline({
      peerId: 'ranked-host',
      characterId: 'astra',
      stageId: 'dojo',
      queue: 'ranked',
      kp: 1500,
      roomId: host.roomId,
      ownerToken: host.ownerToken,
      availableCharacterIds: ['astra', 'kiro', 'dax']
    });

    expect(tooSoon.status).toBe('waiting');
    expect(tooSoon.botOpponent).toBeUndefined();
    expect(filled.opponentKind).toBe('bot');
    expect(Math.abs((filled.botOpponent?.kp ?? 0) - 1500)).toBeLessThanOrEqual(120);
  });

  it('immediately fills ranked placement with the requested low KP bot', async () => {
    const result = await matchmakeOnline({
      peerId: 'placement-host',
      characterId: 'astra',
      stageId: 'dojo',
      queue: 'ranked',
      kp: 900,
      placement: {
        requiredMatches: 10,
        matchesPlayed: 0,
        complete: false,
        ratingEstimate: 900,
        nextBotKp: 650
      },
      availableCharacterIds: ['astra', 'dax', 'kiro']
    });

    expect(result.role).toBe('host');
    expect(result.status).toBe('matched');
    expect(result.opponentKind).toBe('bot');
    expect(result.botOpponent?.kp).toBe(650);
    expect(result.botOpponent?.playerId).not.toMatch(/bot/i);
    expect(result.placement?.matchesPlayed).toBe(0);
  });

  it('keeps ranked placement players out of human ranked rooms', async () => {
    const placement = await matchmakeOnline({
      peerId: 'placement-host',
      characterId: 'astra',
      stageId: 'dojo',
      queue: 'ranked',
      kp: 900,
      placement: {
        requiredMatches: 10,
        matchesPlayed: 0,
        complete: false,
        ratingEstimate: 900,
        nextBotKp: 650
      },
      availableCharacterIds: ['astra', 'dax']
    });
    const human = await matchmakeOnline({
      peerId: 'ranked-human',
      characterId: 'dax',
      stageId: 'dojo',
      queue: 'ranked',
      kp: 900
    });

    expect(placement.opponentKind).toBe('bot');
    expect(human.role).toBe('host');
    expect(human.status).toBe('waiting');
  });

  it('uses updated placement nextBotKp for later adaptive bots', async () => {
    const harder = await matchmakeOnline({
      peerId: 'placement-host',
      characterId: 'astra',
      stageId: 'dojo',
      queue: 'ranked',
      kp: 1040,
      placement: {
        requiredMatches: 10,
        matchesPlayed: 1,
        complete: false,
        ratingEstimate: 1040,
        nextBotKp: 1180
      },
      availableCharacterIds: ['astra', 'dax']
    });
    const easier = await matchmakeOnline({
      peerId: 'placement-host',
      characterId: 'astra',
      stageId: 'dojo',
      queue: 'ranked',
      kp: 820,
      placement: {
        requiredMatches: 10,
        matchesPlayed: 2,
        complete: false,
        ratingEstimate: 820,
        nextBotKp: 700
      },
      availableCharacterIds: ['astra', 'dax']
    });

    expect(harder.botOpponent?.kp).toBe(1180);
    expect(easier.botOpponent?.kp).toBe(700);
    expect(harder.botOpponent?.playerId).not.toBe(easier.botOpponent?.playerId);
  });

  it('can reuse a remembered bot near the same casual KP band', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const firstHost = await matchmakeOnline({
      peerId: 'host-a',
      characterId: 'astra',
      stageId: 'dojo',
      queue: 'casual',
      kp: 1220,
      availableCharacterIds: ['astra', 'dax', 'kiro']
    });
    vi.setSystemTime(9_001);
    const firstFilled = await matchmakeOnline({
      peerId: 'host-a',
      characterId: 'astra',
      stageId: 'dojo',
      queue: 'casual',
      kp: 1220,
      roomId: firstHost.roomId,
      ownerToken: firstHost.ownerToken,
      availableCharacterIds: ['astra', 'dax', 'kiro']
    });

    vi.setSystemTime(12_000);
    const secondHost = await matchmakeOnline({
      peerId: 'host-b',
      characterId: 'dax',
      stageId: 'dojo',
      queue: 'casual',
      kp: 1240,
      availableCharacterIds: ['astra', 'dax', 'kiro']
    });
    vi.setSystemTime(21_001);
    const secondFilled = await matchmakeOnline({
      peerId: 'host-b',
      characterId: 'dax',
      stageId: 'dojo',
      queue: 'casual',
      kp: 1240,
      roomId: secondHost.roomId,
      ownerToken: secondHost.ownerToken,
      availableCharacterIds: ['astra', 'dax', 'kiro']
    });

    expect(firstFilled.opponentKind).toBe('bot');
    expect(secondFilled.opponentKind).toBe('bot');
    expect(secondFilled.botOpponent?.playerId).toBe(firstFilled.botOpponent?.playerId);
    expect(secondFilled.guestPeerId).toBe(firstFilled.botOpponent?.playerId);
  });

  it('keeps generating fresh bots when memory reuse does not roll', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const firstHost = await matchmakeOnline({
      peerId: 'host-a',
      characterId: 'astra',
      stageId: 'dojo',
      queue: 'casual',
      kp: 1220,
      availableCharacterIds: ['astra', 'dax', 'kiro']
    });
    vi.setSystemTime(9_001);
    const firstFilled = await matchmakeOnline({
      peerId: 'host-a',
      characterId: 'astra',
      stageId: 'dojo',
      queue: 'casual',
      kp: 1220,
      roomId: firstHost.roomId,
      ownerToken: firstHost.ownerToken,
      availableCharacterIds: ['astra', 'dax', 'kiro']
    });

    vi.setSystemTime(12_000);
    const secondHost = await matchmakeOnline({
      peerId: 'host-b',
      characterId: 'dax',
      stageId: 'dojo',
      queue: 'casual',
      kp: 1240,
      availableCharacterIds: ['astra', 'dax', 'kiro']
    });
    vi.setSystemTime(21_001);
    const secondFilled = await matchmakeOnline({
      peerId: 'host-b',
      characterId: 'dax',
      stageId: 'dojo',
      queue: 'casual',
      kp: 1240,
      roomId: secondHost.roomId,
      ownerToken: secondHost.ownerToken,
      availableCharacterIds: ['astra', 'dax', 'kiro']
    });

    expect(firstFilled.opponentKind).toBe('bot');
    expect(secondFilled.opponentKind).toBe('bot');
    expect(secondFilled.botOpponent?.playerId).not.toBe(firstFilled.botOpponent?.playerId);
  });
});

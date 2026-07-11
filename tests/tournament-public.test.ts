import { afterEach, describe, expect, it } from 'vitest';
import { sanitizePublicTournament, withTournamentPublicMetadata } from '../netlify/functions/_tournament-public.mjs';
import { signSpectatorToken, verifySpectatorToken, withSpectatorCredentials } from '../netlify/functions/_spectator-token.mjs';

afterEach(() => {
  delete process.env.SPECTATOR_RELAY_URL;
  delete process.env.SPECTATOR_TOKEN_SECRET;
});

describe('public tournament data', () => {
  const bracket = withTournamentPublicMetadata({
    id: 'free-online-daily-123', kind: 'freeOnline', status: 'roundActive', currentRound: 1,
    capacity: 8, minEntries: 8, createdAt: 123, updatedAt: 456,
    reward: { label: 'Trophy' },
    entries: [{ id: 'entry-a', playerId: 'private-player', registeredDeviceId: 'device', displayName: 'ALPHA', characterId: 'kiro', seed: 1, paymentState: 'paid', paymentRequest: 'invoice' }],
    matches: [{ id: 'r1m1', round: 1, index: 0, entryAId: 'entry-a', status: 'ready', roomId: 'private-room' }]
  });

  it('derives stable public metadata and redacts private fields', () => {
    const publicView = sanitizePublicTournament(bracket);
    expect(publicView.slug).toBe(bracket.id);
    expect(publicView.name).toContain('K.O.R.E Online Tournament');
    expect(publicView.entries[0]).toEqual({ id: 'entry-a', displayName: 'ALPHA', characterId: 'kiro', seed: 1 });
    expect(publicView.matches[0]).not.toHaveProperty('roomId');
    expect(JSON.stringify(publicView)).not.toContain('private-player');
    expect(JSON.stringify(publicView)).not.toContain('invoice');
  });

  it('issues scoped participant credentials without persisting them', () => {
    process.env.SPECTATOR_RELAY_URL = 'https://relay.example.com/';
    process.env.SPECTATOR_TOKEN_SECRET = 'test-secret';
    const room = { roomId: 'room', localRole: 'host' };
    const decorated = withSpectatorCredentials(room, bracket, bracket.matches[0], bracket.entries[0], 1_000);
    expect(decorated).toMatchObject({ spectatorRelayUrl: 'https://relay.example.com', spectatorRole: 'primary' });
    expect(room).not.toHaveProperty('spectatorPublishToken');
    expect(verifySpectatorToken(decorated.spectatorPublishToken, 'test-secret', 1_001)).toMatchObject({ tournamentId: bracket.id, matchId: 'r1m1', entryId: 'entry-a', role: 'primary' });
  });

  it('rejects tampered and expired publisher tokens', () => {
    const token = signSpectatorToken({ tournamentId: 't', matchId: 'm', roomId: 'r', entryId: 'e', role: 'standby', exp: 100 }, 'secret');
    expect(verifySpectatorToken(token, 'secret', 99)).toBeTruthy();
    expect(verifySpectatorToken(`${token}x`, 'secret', 99)).toBeNull();
    expect(verifySpectatorToken(token, 'secret', 101)).toBeNull();
  });
});

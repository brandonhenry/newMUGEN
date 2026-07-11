import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

export function spectatorRelayUrl() {
  return String(process.env.SPECTATOR_RELAY_URL || '').replace(/\/$/, '');
}

export function withSpectatorCredentials(room, bracket, match, entry, now = Date.now()) {
  const relayUrl = spectatorRelayUrl();
  const secret = process.env.SPECTATOR_TOKEN_SECRET;
  if (!room || !relayUrl || !secret || !entry?.id || !room.localRole) return room;
  const role = room.localRole === 'host' ? 'primary' : 'standby';
  const claims = {
    tournamentId: bracket.id,
    matchId: match.id,
    roomId: room.roomId,
    entryId: entry.id,
    role,
    exp: now + TOKEN_TTL_MS
  };
  return {
    ...room,
    spectatorRelayUrl: relayUrl,
    spectatorPublishToken: signSpectatorToken(claims, secret),
    spectatorRole: role
  };
}

export function signSpectatorToken(claims, secret = process.env.SPECTATOR_TOKEN_SECRET) {
  if (!secret) throw new Error('SPECTATOR_TOKEN_SECRET is required');
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifySpectatorToken(token, secret = process.env.SPECTATOR_TOKEN_SECRET, now = Date.now()) {
  if (!secret || typeof token !== 'string') return null;
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra) return null;
  const expected = createHmac('sha256', secret).update(body).digest();
  let received;
  try {
    received = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!claims?.tournamentId || !claims?.matchId || !claims?.roomId || !claims?.entryId || !['primary', 'standby'].includes(claims.role) || !Number.isFinite(claims.exp) || claims.exp <= now) return null;
    return claims;
  } catch {
    return null;
  }
}

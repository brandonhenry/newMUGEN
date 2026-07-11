import {
  isSpectatorRelayMessage,
  SPECTATOR_PROTOCOL_VERSION,
  type SpectatorRelayMessage,
  type SpectatorStreamSummary
} from './protocol';

export function spectatorRelayBaseUrl() {
  return String(import.meta.env.VITE_SPECTATOR_RELAY_URL || '').replace(/\/$/, '');
}

export async function fetchSpectatorDirectory(tournamentId: string): Promise<SpectatorStreamSummary[]> {
  const base = spectatorRelayBaseUrl();
  if (!base) return [];
  const response = await fetch(`${toHttpBase(base)}/v1/tournaments/${encodeURIComponent(tournamentId)}/directory`);
  if (!response.ok) throw new Error(`Spectator directory unavailable: ${response.status}`);
  const payload = await response.json() as { streams?: SpectatorStreamSummary[] };
  return Array.isArray(payload.streams) ? payload.streams : [];
}

export function spectatorMatchWebSocketUrl(tournamentId: string, matchId: string, publisherToken?: string, relayOverride?: string) {
  const base = String(relayOverride || spectatorRelayBaseUrl()).replace(/\/$/, '');
  if (!base) return '';
  const url = new URL(`${toWebSocketBase(base)}/v1/tournaments/${encodeURIComponent(tournamentId)}/matches/${encodeURIComponent(matchId)}`);
  if (publisherToken) url.searchParams.set('publisherToken', publisherToken);
  return url.toString();
}

export function spectatorDirectoryWebSocketUrl(tournamentId: string) {
  const base = spectatorRelayBaseUrl();
  return base ? `${toWebSocketBase(base)}/v1/tournaments/${encodeURIComponent(tournamentId)}/directory` : '';
}

export function parseSpectatorMessage(data: unknown): SpectatorRelayMessage | null {
  try {
    const value = typeof data === 'string' ? JSON.parse(data) : data;
    return isSpectatorRelayMessage(value) ? value : null;
  } catch {
    return null;
  }
}

export function makeResyncRequest(): SpectatorRelayMessage {
  return { type: 'resyncRequest', protocol: SPECTATOR_PROTOCOL_VERSION };
}

function toWebSocketBase(value: string) {
  if (value.startsWith('https://')) return `wss://${value.slice(8)}`;
  if (value.startsWith('http://')) return `ws://${value.slice(7)}`;
  return value;
}

function toHttpBase(value: string) {
  if (value.startsWith('wss://')) return `https://${value.slice(6)}`;
  if (value.startsWith('ws://')) return `http://${value.slice(5)}`;
  return value;
}

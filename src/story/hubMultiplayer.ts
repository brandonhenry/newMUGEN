import type { OnlinePlayerProfile } from '../lib/online/leaderboard';
import { sanitizeStoryAvatar, sanitizeStoryName } from './avatarCatalog';
import type {
  StoryHubConnectionStatus,
  StoryHubPlayerState,
  StoryHubPresence,
  StoryHubPresenceResult,
  StoryProfileV4
} from './types';

const HUB_PRESENCE_ENDPOINT = '/.netlify/functions/story-hub-presence';
const HUB_LEAVE_ENDPOINT = '/.netlify/functions/story-hub-leave';
const HUB_CHANNEL_NAME = 'kore-story-hub-presence-v1';
export const STORY_HUB_ONLINE_PREFERENCE_KEY = 'kore.story.hub.online.v1';
export const STORY_HUB_GUEST_IDENTITY_KEY = 'kore.story.hub.guest.v1';
const HEARTBEAT_MS = 650;
const LOCAL_PRESENCE_TTL_MS = 4_000;

type HubChannelMessage =
  | { type: 'presence'; presence: StoryHubPresence }
  | { type: 'leave'; sessionId: string };

export type StoryHubMultiplayerSession = {
  sessionId: string;
  update: (state: StoryHubPlayerState) => void;
  close: () => void;
};

export type ConnectStoryHubMultiplayerOptions = {
  profile: StoryProfileV4;
  onlineProfile?: OnlinePlayerProfile | null;
  initialState: StoryHubPlayerState;
  onPlayers: (players: StoryHubPresence[]) => void;
  onStatus: (status: StoryHubConnectionStatus) => void;
};

export type StoryHubGuestIdentity = { playerId: string; displayName: string };

function cleanId(value: unknown, maxLength = 96) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, maxLength);
}

function finiteNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function sanitizeStoryHubPresence(value: unknown, now = Date.now()): StoryHubPresence | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<StoryHubPresence>;
  const sessionId = cleanId(record.sessionId, 120);
  if (!sessionId) return null;
  const pose = record.pose === 'walk' || record.pose === 'sprint' || record.pose === 'jump' || record.pose === 'attack' ? record.pose : 'idle';
  return {
    sessionId,
    playerId: cleanId(record.playerId) || `story-${sessionId}`,
    displayName: sanitizeStoryName(record.displayName) || 'PLAYER',
    avatar: sanitizeStoryAvatar(record.avatar, record.displayName),
    x: Math.max(-30.5, Math.min(30.5, finiteNumber(record.x, -4.5))),
    y: Math.max(0.82, Math.min(12, finiteNumber(record.y, 0.82))),
    pose,
    facing: record.facing === -1 ? -1 : 1,
    updatedAt: Math.max(0, Math.round(finiteNumber(record.updatedAt, now)))
  };
}

export function sanitizeStoryHubPresenceResult(value: unknown, now = Date.now()): StoryHubPresenceResult {
  if (!value || typeof value !== 'object') return { players: [], serverTime: now };
  const record = value as Partial<StoryHubPresenceResult>;
  const players = Array.isArray(record.players)
    ? record.players.flatMap((presence) => {
      const sanitized = sanitizeStoryHubPresence(presence, now);
      return sanitized ? [sanitized] : [];
    })
    : [];
  return { players, serverTime: Math.max(0, Math.round(finiteNumber(record.serverTime, now))) };
}

function makeSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `hub-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function readStoryHubOnlinePreference() {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(STORY_HUB_ONLINE_PREFERENCE_KEY) !== 'offline';
}

export function writeStoryHubOnlinePreference(online: boolean) {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORY_HUB_ONLINE_PREFERENCE_KEY, online ? 'online' : 'offline');
  return online;
}

export function readOrCreateStoryHubGuestIdentity(): StoryHubGuestIdentity {
  if (typeof window === 'undefined') return { playerId: 'story-guest', displayName: 'ROOKIE 0000' };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORY_HUB_GUEST_IDENTITY_KEY) ?? 'null') as Partial<StoryHubGuestIdentity> | null;
    const playerId = cleanId(parsed?.playerId);
    const displayName = sanitizeStoryName(parsed?.displayName);
    if (playerId && displayName) return { playerId, displayName };
  } catch {
    // Replace malformed local identity below.
  }
  const token = makeSessionId().replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase().padStart(6, '0');
  const identity = { playerId: `story-${makeSessionId()}`, displayName: `ROOKIE ${token.slice(-4)}` };
  window.localStorage.setItem(STORY_HUB_GUEST_IDENTITY_KEY, JSON.stringify(identity));
  return identity;
}

function isLocalHub() {
  return typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
}

export function connectStoryHubMultiplayer(options: ConnectStoryHubMultiplayerOptions): StoryHubMultiplayerSession {
  const sessionId = makeSessionId();
  const remotePlayers = new Map<string, StoryHubPresence>();
  const guestIdentity = readOrCreateStoryHubGuestIdentity();
  const playerId = cleanId(options.onlineProfile?.playerId) || guestIdentity.playerId;
  const authoredName = sanitizeStoryName(options.profile.avatar.name);
  const displayName = sanitizeStoryName(options.onlineProfile?.displayName) || (authoredName !== 'PLAYER' ? authoredName : '') || guestIdentity.displayName;
  let currentState = options.initialState;
  let stopped = false;
  let timer = 0;
  let lastStatus: StoryHubConnectionStatus | null = null;
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(HUB_CHANNEL_NAME) : null;

  const setStatus = (status: StoryHubConnectionStatus) => {
    if (status === lastStatus) return;
    lastStatus = status;
    options.onStatus(status);
  };
  const ownPresence = (): StoryHubPresence => ({
    sessionId,
    playerId,
    displayName,
    avatar: options.profile.avatar,
    ...currentState,
    updatedAt: Date.now()
  });
  const emitPlayers = () => {
    const cutoff = Date.now() - LOCAL_PRESENCE_TTL_MS;
    remotePlayers.forEach((presence, id) => {
      if (presence.updatedAt < cutoff) remotePlayers.delete(id);
    });
    options.onPlayers([...remotePlayers.values()].sort((a, b) => a.displayName.localeCompare(b.displayName)));
  };
  const ingest = (presence: StoryHubPresence) => {
    if (presence.sessionId === sessionId) return;
    remotePlayers.set(presence.sessionId, presence);
  };

  if (channel) {
    channel.onmessage = (event: MessageEvent<HubChannelMessage>) => {
      if (event.data?.type === 'leave') {
        remotePlayers.delete(cleanId(event.data.sessionId, 120));
        emitPlayers();
        return;
      }
      if (event.data?.type !== 'presence') return;
      const presence = sanitizeStoryHubPresence(event.data.presence);
      if (!presence) return;
      ingest(presence);
      emitPlayers();
    };
  }

  const heartbeat = async () => {
    if (stopped) return;
    const presence = ownPresence();
    channel?.postMessage({ type: 'presence', presence } satisfies HubChannelMessage);
    try {
      const response = await fetch(HUB_PRESENCE_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(presence),
        signal: AbortSignal.timeout(3_500)
      });
      if (!response.ok) throw new Error(`Hub presence failed (${response.status})`);
      const result = sanitizeStoryHubPresenceResult(await response.json());
      result.players.forEach(ingest);
      setStatus('online');
    } catch {
      setStatus(isLocalHub() ? 'local' : 'reconnecting');
    }
    emitPlayers();
    if (!stopped) timer = window.setTimeout(heartbeat, HEARTBEAT_MS);
  };

  const close = () => {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(timer);
    channel?.postMessage({ type: 'leave', sessionId } satisfies HubChannelMessage);
    channel?.close();
    const payload = JSON.stringify({ sessionId });
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(HUB_LEAVE_ENDPOINT, new Blob([payload], { type: 'application/json' }));
    } else {
      void fetch(HUB_LEAVE_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true }).catch(() => undefined);
    }
    options.onPlayers([]);
  };

  setStatus('connecting');
  void heartbeat();
  window.addEventListener('pagehide', close, { once: true });

  return {
    sessionId,
    update(state) {
      currentState = state;
    },
    close() {
      window.removeEventListener('pagehide', close);
      close();
    }
  };
}

import type { OnlinePlayerProfile } from './leaderboard';
import {
  addCustomRoomMember,
  applyCustomRoomCommand,
  customRoomSummary,
  makeCustomRoomState,
  redactCustomRoomState,
  removeCustomRoomMember,
  type CustomRoomCommand,
  type CustomRoomEvent,
  type CustomRoomRules,
  type CustomRoomSession,
  type CustomRoomState,
  type CustomRoomSummary,
  type CustomRoomVisibility
} from './customRooms';

const LOCAL_ROOMS_KEY = 'kore.custom.rooms.v1';
const LOCAL_SESSIONS_KEY = 'kore.custom.sessions.v1';

export type CreateCustomRoomRequest = {
  profile: OnlinePlayerProfile;
  appVersion: string;
  roomName?: string;
  visibility?: CustomRoomVisibility;
  stationCount?: number;
  rules?: Partial<CustomRoomRules>;
};

export type JoinCustomRoomRequest = {
  profile: OnlinePlayerProfile;
  appVersion: string;
  roomId: string;
  friendPlayerId?: string;
};

export function customRoomBaseUrl() {
  return String(import.meta.env.VITE_SPECTATOR_RELAY_URL || '').replace(/\/$/, '');
}

export async function createCustomRoom(request: CreateCustomRoomRequest): Promise<CustomRoomSession> {
  return requestJson<CustomRoomSession>('/v1/custom/rooms', withIdentity(request)).catch((error) => localOrThrow(error, () => localCreateRoom(request)));
}

export async function autoJoinCustomRoom(profile: OnlinePlayerProfile, appVersion: string): Promise<CustomRoomSession | null> {
  return requestJson<CustomRoomSession | null>('/v1/custom/auto-join', withIdentity({ profile, appVersion })).catch((error) => localOrThrow(error, () => localAutoJoin(profile, appVersion)));
}

export async function findFriendCustomRooms(profile: OnlinePlayerProfile, appVersion: string, friendPlayerIds: string[]): Promise<CustomRoomSummary[]> {
  return requestJson<{ rooms: CustomRoomSummary[] }>('/v1/custom/friends', withIdentity({ profile, appVersion, friendPlayerIds }))
    .then((result) => result.rooms)
    .catch((error) => localOrThrow(error, () => localFriendRooms(appVersion, friendPlayerIds)));
}

export async function joinCustomRoom(request: JoinCustomRoomRequest): Promise<CustomRoomSession> {
  return requestJson<CustomRoomSession>(`/v1/custom/rooms/${encodeURIComponent(request.roomId)}/join`, withIdentity(request))
    .catch((error) => localOrThrow(error, () => localJoinRoom(request)));
}

export async function fetchCustomRoom(roomId: string, memberToken: string): Promise<CustomRoomState> {
  return requestJson<{ room: CustomRoomState }>(`/v1/custom/rooms/${encodeURIComponent(roomId)}?memberToken=${encodeURIComponent(memberToken)}`, undefined, 'GET')
    .then((result) => result.room)
    .catch((error) => localOrThrow(error, () => localFetchRoom(roomId, memberToken)));
}

export async function sendCustomRoomCommand(roomId: string, memberToken: string, command: CustomRoomCommand): Promise<CustomRoomState> {
  return requestJson<{ room: CustomRoomState }>(`/v1/custom/rooms/${encodeURIComponent(roomId)}/commands`, { memberToken, command })
    .then((result) => result.room)
    .catch((error) => localOrThrow(error, () => localCommand(roomId, memberToken, command)));
}

export async function leaveCustomRoom(roomId: string, memberToken: string): Promise<void> {
  await requestJson(`/v1/custom/rooms/${encodeURIComponent(roomId)}/leave`, { memberToken })
    .catch((error) => localOrThrow(error, () => localLeaveRoom(roomId, memberToken)));
}

export function connectCustomRoom(roomId: string, memberToken: string, onEvent: (event: CustomRoomEvent) => void) {
  const base = customRoomBaseUrl();
  if (!base) return null;
  const url = new URL(`${toWebSocketBase(base)}/v1/custom/rooms/${encodeURIComponent(roomId)}/ws`);
  url.searchParams.set('memberToken', memberToken);
  const socket = new WebSocket(url);
  socket.onmessage = (event) => {
    try { onEvent(JSON.parse(String(event.data)) as CustomRoomEvent); } catch { /* ignore malformed updates */ }
  };
  return socket;
}

export function customMatchWebSocketUrl(roomId: string, matchId: string, memberToken: string, publisher = false) {
  const base = customRoomBaseUrl();
  if (!base) return '';
  const url = new URL(`${toWebSocketBase(base)}/v1/custom/rooms/${encodeURIComponent(roomId)}/matches/${encodeURIComponent(matchId)}`);
  url.searchParams.set('memberToken', memberToken);
  if (publisher) url.searchParams.set('publisher', '1');
  return url.toString();
}

export function storeCustomRoomSession(session: Pick<CustomRoomSession, 'memberToken'> & { room: Pick<CustomRoomState, 'roomId'> }) {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(`${LOCAL_SESSIONS_KEY}:${session.room.roomId}`, session.memberToken);
}

export function readCustomRoomSessionToken(roomId: string) {
  return typeof sessionStorage === 'undefined' ? '' : sessionStorage.getItem(`${LOCAL_SESSIONS_KEY}:${roomId}`) ?? '';
}

export function clearCustomRoomSession(roomId: string) {
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(`${LOCAL_SESSIONS_KEY}:${roomId}`);
}

async function requestJson<T = unknown>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const base = customRoomBaseUrl();
  if (!base) throw new Error('Custom room relay is not configured');
  const response = await fetch(`${toHttpBase(base)}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!response.ok) {
    let message = `Custom room request failed: ${response.status}`;
    try { const payload = await response.json(); message = payload.message || payload.error || message; } catch { /* use status */ }
    throw new Error(message);
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}

function localCreateRoom(request: CreateCustomRoomRequest): CustomRoomSession {
  const room = makeCustomRoomState({
    host: request.profile,
    appVersion: request.appVersion,
    roomName: request.roomName,
    visibility: request.visibility,
    stationCount: request.stationCount,
    rules: request.rules
  });
  const memberToken = crypto.randomUUID();
  const ownerToken = crypto.randomUUID();
  writeRooms([...readRooms(), room]);
  writeSession(memberToken, room.roomId, request.profile.playerId, ownerToken);
  return { room: redactCustomRoomState(room), memberToken, ownerToken };
}

function localAutoJoin(profile: OnlinePlayerProfile, appVersion: string): CustomRoomSession | null {
  const room = readRooms()
    .filter((candidate) => candidate.visibility === 'public' && candidate.appVersion === appVersion && candidate.members.length < candidate.capacity)
    .sort((a, b) => b.members.length - a.members.length || a.createdAt - b.createdAt)[0];
  return room ? localJoinRoom({ profile, appVersion, roomId: room.roomId }) : null;
}

function localFriendRooms(appVersion: string, friendPlayerIds: string[]) {
  const wanted = new Set(friendPlayerIds);
  return readRooms()
    .filter((room) => room.appVersion === appVersion && room.members.length < room.capacity && room.members.some((member) => wanted.has(member.playerId)))
    .map((room) => ({ ...customRoomSummary(room), friendPlayerId: room.members.find((member) => wanted.has(member.playerId))?.playerId }));
}

function localJoinRoom(request: JoinCustomRoomRequest): CustomRoomSession {
  const rooms = readRooms();
  const index = rooms.findIndex((room) => room.roomId === request.roomId);
  const room = rooms[index];
  if (!room || room.appVersion !== request.appVersion) throw new Error('Room unavailable or update required');
  if (room.visibility === 'private' && !request.friendPlayerId) throw new Error('Join this private room through a friend');
  if (request.friendPlayerId && !room.members.some((member) => member.playerId === request.friendPlayerId)) throw new Error('Friend is no longer in this room');
  const next = addCustomRoomMember(room, request.profile);
  rooms[index] = next;
  writeRooms(rooms);
  const memberToken = crypto.randomUUID();
  writeSession(memberToken, next.roomId, request.profile.playerId);
  return { room: redactCustomRoomState(next), memberToken };
}

function localFetchRoom(roomId: string, memberToken: string) {
  requireLocalSession(roomId, memberToken);
  const room = readRooms().find((candidate) => candidate.roomId === roomId);
  if (!room) throw new Error('Room closed');
  return redactCustomRoomState(room);
}

function localCommand(roomId: string, memberToken: string, command: CustomRoomCommand) {
  const session = requireLocalSession(roomId, memberToken);
  const rooms = readRooms();
  const index = rooms.findIndex((room) => room.roomId === roomId);
  if (index < 0) throw new Error('Room closed');
  const next = applyCustomRoomCommand(rooms[index]!, session.playerId, command);
  rooms[index] = next;
  writeRooms(rooms);
  return redactCustomRoomState(next);
}

function localLeaveRoom(roomId: string, memberToken: string) {
  const session = requireLocalSession(roomId, memberToken);
  const rooms = readRooms();
  const index = rooms.findIndex((room) => room.roomId === roomId);
  if (index >= 0) {
    const next = removeCustomRoomMember(rooms[index]!, session.playerId);
    if (next) rooms[index] = next; else rooms.splice(index, 1);
    writeRooms(rooms);
  }
  const sessions = readSessions();
  delete sessions[memberToken];
  writeSessions(sessions);
}

type LocalSession = { roomId: string; playerId: string; ownerToken?: string };
function writeSession(token: string, roomId: string, playerId: string, ownerToken?: string) { const sessions = readSessions(); sessions[token] = { roomId, playerId, ownerToken }; writeSessions(sessions); }
function requireLocalSession(roomId: string, token: string) { const session = readSessions()[token]; if (!session || session.roomId !== roomId) throw new Error('Room session expired'); return session; }
function readRooms(): CustomRoomState[] { try { const parsed = JSON.parse(localStorage.getItem(LOCAL_ROOMS_KEY) ?? '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function writeRooms(rooms: CustomRoomState[]) { localStorage.setItem(LOCAL_ROOMS_KEY, JSON.stringify(rooms)); }
function readSessions(): Record<string, LocalSession> { try { const parsed = JSON.parse(localStorage.getItem(LOCAL_SESSIONS_KEY) ?? '{}'); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; } }
function writeSessions(sessions: Record<string, LocalSession>) { localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(sessions)); }
function localOrThrow<T>(error: unknown, fallback: () => T): T { if (typeof window !== 'undefined' && (!customRoomBaseUrl() || ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname))) return fallback(); throw error; }
function withIdentity<T extends object>(body: T): T & { identityToken: string } { return { ...body, identityToken: typeof sessionStorage === 'undefined' ? '' : sessionStorage.getItem('kore.custom.identityToken.v1') ?? '' }; }
function toWebSocketBase(value: string) { if (value.startsWith('https://')) return `wss://${value.slice(8)}`; if (value.startsWith('http://')) return `ws://${value.slice(7)}`; return value; }
function toHttpBase(value: string) { if (value.startsWith('wss://')) return `https://${value.slice(6)}`; if (value.startsWith('ws://')) return `http://${value.slice(5)}`; return value; }

import type { OnlineRole } from './messages';

export type PrivateRoomSummary = {
  roomId: string;
  roomName: string;
  hostPeerId: string;
  hostCharacterId: string;
  guestPeerId?: string;
  guestCharacterId?: string;
  stageId: string;
  status: 'waiting' | 'matched';
  createdAt: number;
  updatedAt: number;
};

export type PrivateRoomIntent =
  | { kind: 'host'; roomName: string; password: string }
  | { kind: 'guest'; roomId: string; password: string };

export type PrivateRoomResult = PrivateRoomSummary & {
  role: OnlineRole;
  ownerToken: string;
  password?: string;
};

export type PrivateRoomCreateRequest = {
  peerId: string;
  characterId: string;
  stageId: string;
  roomName: string;
  password: string;
  roomId?: string;
  ownerToken?: string;
};

export type PrivateRoomJoinRequest = {
  peerId: string;
  characterId: string;
  roomId: string;
  password: string;
};

export type PrivateRoomLeaveRequest = {
  roomId?: string;
  ownerToken?: string;
  peerId?: string;
};

const LOCAL_PRIVATE_ROOMS_KEY = 'kore.online.privateRooms';
const PRIVATE_ROOM_TTL_MS = 30_000;

export async function listPrivateRooms(): Promise<PrivateRoomSummary[]> {
  return getJson<{ rooms: PrivateRoomSummary[] }>('/.netlify/functions/private-room-list')
    .then((result) => result.rooms.map(publicRoomSummary))
    .catch((error) => {
      if (isLocalFallbackAllowed()) return localListPrivateRooms();
      throw error;
    });
}

export async function createPrivateRoom(request: PrivateRoomCreateRequest): Promise<PrivateRoomResult> {
  return postJson<PrivateRoomResult>('/.netlify/functions/private-room-create', request).catch((error) => {
    if (isLocalFallbackAllowed()) return localCreatePrivateRoom(request);
    throw error;
  });
}

export async function joinPrivateRoom(request: PrivateRoomJoinRequest): Promise<PrivateRoomResult> {
  return postJson<PrivateRoomResult>('/.netlify/functions/private-room-join', request).catch((error) => {
    if (isLocalFallbackAllowed()) return localJoinPrivateRoom(request);
    throw error;
  });
}

export async function leavePrivateRoom(request: PrivateRoomLeaveRequest): Promise<void> {
  if (!request.roomId && !request.peerId) return;
  await postJson('/.netlify/functions/private-room-leave', request).catch((error) => {
    if (isLocalFallbackAllowed()) {
      localLeavePrivateRoom(request);
      return;
    }
    throw error;
  });
}

export function generatePrivateRoomPassword() {
  return `KORE-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function normalizePrivateRoomPassword(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16);
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(await extractErrorMessage(response));
  return (await response.json()) as T;
}

async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await extractErrorMessage(response));
  return (await response.json()) as T;
}

async function extractErrorMessage(response: Response) {
  try {
    const payload = await response.json();
    return typeof payload?.message === 'string' ? payload.message : typeof payload?.error === 'string' ? payload.error : `Request failed: ${response.status}`;
  } catch {
    return `Request failed: ${response.status}`;
  }
}

function isLocalFallbackAllowed() {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
}

type LocalPrivateRoom = PrivateRoomSummary & {
  ownerToken: string;
  password: string;
};

function localListPrivateRooms() {
  const now = Date.now();
  const rooms = readLocalPrivateRooms().filter((room) => now - room.updatedAt <= PRIVATE_ROOM_TTL_MS);
  writeLocalPrivateRooms(rooms);
  return rooms.filter((room) => room.status === 'waiting').map(publicRoomSummary);
}

function localCreatePrivateRoom(request: PrivateRoomCreateRequest): PrivateRoomResult {
  const now = Date.now();
  const rooms = readLocalPrivateRooms().filter((room) => now - room.updatedAt <= PRIVATE_ROOM_TTL_MS);
  const existing = request.roomId && request.ownerToken
    ? rooms.find((room) => room.roomId === request.roomId && room.ownerToken === request.ownerToken)
    : undefined;
  if (existing) {
    existing.updatedAt = now;
    existing.hostPeerId = request.peerId;
    existing.hostCharacterId = request.characterId;
    existing.stageId = request.stageId;
    existing.roomName = cleanRoomName(request.roomName);
    existing.password = normalizePrivateRoomPassword(request.password) || existing.password;
    writeLocalPrivateRooms(rooms);
    return privateRoomResult(existing, 'host');
  }

  const room: LocalPrivateRoom = {
    roomId: crypto.randomUUID(),
    ownerToken: crypto.randomUUID(),
    roomName: cleanRoomName(request.roomName),
    password: normalizePrivateRoomPassword(request.password) || generatePrivateRoomPassword(),
    hostPeerId: request.peerId,
    hostCharacterId: request.characterId,
    stageId: request.stageId,
    status: 'waiting',
    createdAt: now,
    updatedAt: now
  };
  writeLocalPrivateRooms([...rooms, room]);
  return privateRoomResult(room, 'host');
}

function localJoinPrivateRoom(request: PrivateRoomJoinRequest): PrivateRoomResult {
  const now = Date.now();
  const rooms = readLocalPrivateRooms().filter((room) => now - room.updatedAt <= PRIVATE_ROOM_TTL_MS);
  const room = rooms.find((candidate) => candidate.roomId === request.roomId);
  if (!room) throw new Error('Room not found');
  if (room.status !== 'waiting' || room.hostPeerId === request.peerId) throw new Error('Room unavailable');
  if (room.password !== normalizePrivateRoomPassword(request.password)) throw new Error('Wrong password');
  room.status = 'matched';
  room.guestPeerId = request.peerId;
  room.guestCharacterId = request.characterId;
  room.updatedAt = now;
  writeLocalPrivateRooms(rooms);
  return privateRoomResult(room, 'guest');
}

function localLeavePrivateRoom(request: PrivateRoomLeaveRequest) {
  const rooms = readLocalPrivateRooms().filter((room) => {
    if (request.roomId && request.ownerToken) return !(room.roomId === request.roomId && room.ownerToken === request.ownerToken);
    if (request.peerId) return room.hostPeerId !== request.peerId && room.guestPeerId !== request.peerId;
    return true;
  });
  writeLocalPrivateRooms(rooms);
}

function readLocalPrivateRooms(): LocalPrivateRoom[] {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_PRIVATE_ROOMS_KEY) ?? '[]') as LocalPrivateRoom[];
  } catch {
    return [];
  }
}

function writeLocalPrivateRooms(rooms: LocalPrivateRoom[]) {
  window.localStorage.setItem(LOCAL_PRIVATE_ROOMS_KEY, JSON.stringify(rooms));
}

function publicRoomSummary(room: PrivateRoomSummary): PrivateRoomSummary {
  return {
    roomId: String(room.roomId),
    roomName: cleanRoomName(room.roomName),
    hostPeerId: String(room.hostPeerId),
    hostCharacterId: String(room.hostCharacterId),
    guestPeerId: room.guestPeerId ? String(room.guestPeerId) : undefined,
    guestCharacterId: room.guestCharacterId ? String(room.guestCharacterId) : undefined,
    stageId: String(room.stageId),
    status: room.status === 'matched' ? 'matched' : 'waiting',
    createdAt: Math.max(0, Math.round(Number(room.createdAt) || 0)),
    updatedAt: Math.max(0, Math.round(Number(room.updatedAt) || 0))
  };
}

function privateRoomResult(room: LocalPrivateRoom, role: OnlineRole): PrivateRoomResult {
  return {
    ...publicRoomSummary(room),
    role,
    ownerToken: role === 'host' ? room.ownerToken : '',
    password: role === 'host' ? room.password : undefined
  };
}

function cleanRoomName(value: string) {
  const cleaned = String(value || '').toUpperCase().replace(/[^A-Z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18);
  return cleaned || 'PRIVATE ROOM';
}

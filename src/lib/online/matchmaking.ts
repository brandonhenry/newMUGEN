import type { OnlineRole } from './messages';

export type OnlineMatchRequest = {
  peerId: string;
  characterId: string;
  stageId: string;
  roomId?: string;
  ownerToken?: string;
};

export type OnlineMatchResult = {
  role: OnlineRole;
  status: 'waiting' | 'matched';
  roomId: string;
  ownerToken: string;
  hostPeerId: string;
  guestPeerId?: string;
  hostCharacterId: string;
  guestCharacterId?: string;
  stageId: string;
};

export type OnlineLeaveRequest = {
  roomId?: string;
  ownerToken?: string;
  peerId?: string;
};

const LOCAL_ROOMS_KEY = 'kore.online.localRooms';
const LOCAL_ROOM_TTL_MS = 12_000;

export async function matchmakeOnline(request: OnlineMatchRequest): Promise<OnlineMatchResult> {
  const response = await postJson<OnlineMatchResult>('/.netlify/functions/online-matchmake', request).catch((error) => {
    if (isLocalFallbackAllowed()) return localMatchmake(request);
    throw error;
  });
  return response;
}

export async function leaveOnlineRoom(request: OnlineLeaveRequest): Promise<void> {
  if (!request.roomId && !request.peerId) return;
  await postJson('/.netlify/functions/online-leave', request).catch(async (error) => {
    if (isLocalFallbackAllowed()) {
      localLeave(request);
      return;
    }
    throw error;
  });
}

async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Online request failed: ${response.status}`);
  return (await response.json()) as T;
}

function isLocalFallbackAllowed() {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
}

type LocalRoom = {
  roomId: string;
  ownerToken: string;
  hostPeerId: string;
  hostCharacterId: string;
  guestPeerId?: string;
  guestCharacterId?: string;
  stageId: string;
  status: 'waiting' | 'matched';
  updatedAt: number;
};

function localMatchmake(request: OnlineMatchRequest): OnlineMatchResult {
  const now = Date.now();
  const rooms = readLocalRooms().filter((room) => now - room.updatedAt <= LOCAL_ROOM_TTL_MS);
  const existing = request.roomId ? rooms.find((room) => room.roomId === request.roomId && room.ownerToken === request.ownerToken) : undefined;
  if (existing) {
    existing.updatedAt = now;
    writeLocalRooms(rooms);
    return roomToResult(existing, existing.guestPeerId ? 'host' : 'host');
  }

  const waitingRoom = rooms.find((room) => room.status === 'waiting' && room.hostPeerId !== request.peerId);
  if (waitingRoom) {
    waitingRoom.status = 'matched';
    waitingRoom.guestPeerId = request.peerId;
    waitingRoom.guestCharacterId = request.characterId;
    waitingRoom.updatedAt = now;
    writeLocalRooms(rooms);
    return roomToResult(waitingRoom, 'guest');
  }

  const room: LocalRoom = {
    roomId: crypto.randomUUID(),
    ownerToken: crypto.randomUUID(),
    hostPeerId: request.peerId,
    hostCharacterId: request.characterId,
    stageId: request.stageId,
    status: 'waiting',
    updatedAt: now
  };
  writeLocalRooms([...rooms, room]);
  return roomToResult(room, 'host');
}

function localLeave(request: OnlineLeaveRequest) {
  const rooms = readLocalRooms().filter((room) => {
    if (request.roomId && request.ownerToken) return !(room.roomId === request.roomId && room.ownerToken === request.ownerToken);
    if (request.peerId) return room.hostPeerId !== request.peerId && room.guestPeerId !== request.peerId;
    return true;
  });
  writeLocalRooms(rooms);
}

function readLocalRooms(): LocalRoom[] {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_ROOMS_KEY) ?? '[]') as LocalRoom[];
  } catch {
    return [];
  }
}

function writeLocalRooms(rooms: LocalRoom[]) {
  window.localStorage.setItem(LOCAL_ROOMS_KEY, JSON.stringify(rooms));
}

function roomToResult(room: LocalRoom, role: OnlineRole): OnlineMatchResult {
  return {
    role,
    status: room.status,
    roomId: room.roomId,
    ownerToken: room.ownerToken,
    hostPeerId: room.hostPeerId,
    guestPeerId: room.guestPeerId,
    hostCharacterId: room.hostCharacterId,
    guestCharacterId: room.guestCharacterId,
    stageId: room.stageId
  };
}

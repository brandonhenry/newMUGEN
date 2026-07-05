import type { OnlineRole } from './messages';
import {
  CASUAL_BOT_FALLBACK_MS,
  RANKED_BOT_FALLBACK_MS,
  createOnlineBotOpponent,
  type OnlineBotOpponent
} from './bots';
import type { RankedKrScores } from './ranked';

export type OnlineMatchQueue = 'casual' | 'ranked' | 'training';

export type OnlineMatchRequest = {
  peerId: string;
  characterId: string;
  stageId: string;
  queue?: OnlineMatchQueue;
  kp?: number;
  kr?: Partial<RankedKrScores>;
  allowBotFallback?: boolean;
  availableCharacterIds?: string[];
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
  queue?: OnlineMatchQueue;
  hostKp?: number;
  guestKp?: number;
  opponentKind?: 'human' | 'bot';
  botOpponent?: OnlineBotOpponent;
};

export type OnlineLeaveRequest = {
  roomId?: string;
  ownerToken?: string;
  peerId?: string;
};

const LOCAL_ROOMS_KEY = 'kore.online.localRooms';
const LOCAL_ROOM_TTL_MS = 12_000;
const LOCAL_RANKED_ROOM_TTL_MS = 64_000;
const RANKED_INITIAL_RANGE = 150;
const RANKED_RANGE_STEP = 50;
const RANKED_RANGE_STEP_MS = 8_000;
const RANKED_MAX_RANGE = 450;

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
  queue: OnlineMatchQueue;
  hostKp?: number;
  guestKp?: number;
  hostKr?: Partial<RankedKrScores>;
  guestKr?: Partial<RankedKrScores>;
  availableCharacterIds?: string[];
  opponentKind?: 'human' | 'bot';
  botOpponent?: OnlineBotOpponent;
  createdAt: number;
  status: 'waiting' | 'matched';
  updatedAt: number;
};

function localMatchmake(request: OnlineMatchRequest): OnlineMatchResult {
  const now = Date.now();
  const queue = normalizeQueue(request.queue);
  const rooms = readLocalRooms().filter((room) => now - room.updatedAt <= localRoomTtlMs(room));
  const existing = request.roomId ? rooms.find((room) => room.roomId === request.roomId && room.ownerToken === request.ownerToken) : undefined;
  if (existing) {
    existing.updatedAt = now;
    maybeFillLocalRoomWithBot(existing, request, now);
    writeLocalRooms(rooms);
    return roomToResult(existing, existing.guestPeerId ? 'host' : 'host');
  }

  const waitingRoom = rooms.find((room) => (
    room.status === 'waiting' &&
    room.hostPeerId !== request.peerId &&
    room.queue === queue &&
    rankedKpMatches(room, request, now)
  ));
  if (waitingRoom) {
    waitingRoom.status = 'matched';
    waitingRoom.guestPeerId = request.peerId;
    waitingRoom.guestCharacterId = request.characterId;
    waitingRoom.guestKp = normalizeKp(request.kp);
    waitingRoom.guestKr = request.kr;
    waitingRoom.opponentKind = 'human';
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
    queue,
    hostKp: normalizeKp(request.kp),
    hostKr: request.kr,
    availableCharacterIds: normalizeCharacterIds(request.availableCharacterIds),
    createdAt: now,
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
    stageId: room.stageId,
    queue: room.queue,
    hostKp: room.hostKp,
    guestKp: room.guestKp,
    opponentKind: room.opponentKind,
    botOpponent: room.botOpponent
  };
}

function rankedKpMatches(room: LocalRoom, request: OnlineMatchRequest, now: number) {
  if (room.queue !== 'ranked') return true;
  const hostKp = normalizeKp(room.hostKp);
  const guestKp = normalizeKp(request.kp);
  const ageMs = Math.max(0, now - (room.createdAt || room.updatedAt));
  const range = Math.min(RANKED_MAX_RANGE, RANKED_INITIAL_RANGE + Math.floor(ageMs / RANKED_RANGE_STEP_MS) * RANKED_RANGE_STEP);
  return Math.abs(hostKp - guestKp) <= range;
}

function normalizeKp(value: unknown) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function localRoomTtlMs(room: LocalRoom) {
  return room.queue === 'ranked' ? LOCAL_RANKED_ROOM_TTL_MS : LOCAL_ROOM_TTL_MS;
}

function maybeFillLocalRoomWithBot(room: LocalRoom, request: OnlineMatchRequest, now: number) {
  if (room.status !== 'waiting' || room.queue === 'training' || request.allowBotFallback === false) return;
  const ageMs = Math.max(0, now - (room.createdAt || room.updatedAt));
  const fallbackMs = room.queue === 'ranked' ? RANKED_BOT_FALLBACK_MS : CASUAL_BOT_FALLBACK_MS;
  if (ageMs < fallbackMs) return;
  const bot = createOnlineBotOpponent({
    seed: `${room.roomId}:${room.hostPeerId}:${room.queue}`,
    queue: room.queue,
    playerKp: room.hostKp,
    playerKr: room.hostKr,
    availableCharacterIds: room.availableCharacterIds,
    fallbackCharacterId: room.hostCharacterId
  });
  room.status = 'matched';
  room.guestPeerId = bot.playerId;
  room.guestCharacterId = bot.characterId;
  room.guestKp = bot.kp;
  room.guestKr = bot.kr;
  room.opponentKind = 'bot';
  room.botOpponent = bot;
}

function normalizeQueue(value: unknown): OnlineMatchQueue {
  return value === 'ranked' || value === 'training' ? value : 'casual';
}

function normalizeCharacterIds(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => typeof item === 'string' ? item.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 96) : '').filter(Boolean).slice(0, 128)
    : [];
}

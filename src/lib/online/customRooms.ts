import type { OnlinePlayerProfile } from './leaderboard';

export const CUSTOM_ROOM_PROTOCOL_VERSION = 1 as const;
export const CUSTOM_ROOM_CAPACITY = 8;
export const CUSTOM_ROOM_MAX_STATIONS = 4;
export const CUSTOM_CHARACTER_SELECT_TIMEOUT_MS = 60_000;
export const CUSTOM_STAGE_SELECT_TIMEOUT_MS = 45_000;
export const CUSTOM_SPECTATOR_DELAY_FRAMES = 60;

export type CustomRoomVisibility = 'private' | 'public';
export type CustomStationPhase = 'idle' | 'characterSelect' | 'stageSelect' | 'loading' | 'live' | 'results';
export type CustomStageChoice = { kind: 'stage'; stageId: string } | { kind: 'random' };

export type CustomRoomRules = {
  roundsToWin: 1 | 2 | 3 | 5;
  roundTimer: 30 | 45 | 60 | 90 | 99;
};

export type CustomMember = {
  playerId: string;
  displayName: string;
  peerId?: string;
  joinedAt: number;
  connected: boolean;
  stationId?: string;
  disconnectedAt?: number;
};

export type CustomMatch = {
  id: string;
  fighterPlayerIds: [string, string];
  characterIds?: [string, string];
  characterLocked: [boolean, boolean];
  stageLocked: [boolean, boolean];
  stageCandidates?: [string, string];
  stageId?: string;
  stagePoolHash?: string;
  rules: CustomRoomRules;
  createdAt: number;
  selectionDeadline: number;
  stageDeadline?: number;
  winnerPlayerId?: string;
  resultReports: Record<string, string>;
};

export type CustomStation = {
  id: string;
  label: string;
  phase: CustomStationPhase;
  memberPlayerIds: string[];
  readyQueue: string[];
  championPlayerId?: string;
  fighters?: [string, string];
  match?: CustomMatch;
};

export type CustomChatMessage = {
  id: string;
  kind: 'chat' | 'system';
  playerId?: string;
  displayName?: string;
  text: string;
  sentAt: number;
};

export type CustomRoomState = {
  protocol: typeof CUSTOM_ROOM_PROTOCOL_VERSION;
  roomId: string;
  roomName: string;
  visibility: CustomRoomVisibility;
  hostPlayerId: string;
  capacity: typeof CUSTOM_ROOM_CAPACITY;
  stationCount: number;
  rules: CustomRoomRules;
  appVersion: string;
  seed: string;
  members: CustomMember[];
  stations: CustomStation[];
  chat: CustomChatMessage[];
  kickedPlayerIds: string[];
  createdAt: number;
  updatedAt: number;
};

export type CustomRoomSummary = Pick<CustomRoomState, 'roomId' | 'roomName' | 'visibility' | 'hostPlayerId' | 'capacity' | 'stationCount' | 'appVersion' | 'updatedAt'> & {
  memberCount: number;
  liveStationCount: number;
  friendPlayerId?: string;
};

export type CustomRoomSession = {
  room: CustomRoomState;
  memberToken: string;
  ownerToken?: string;
};

export type CustomRoomCommand =
  | { type: 'updateRoom'; roomName?: string; visibility?: CustomRoomVisibility; stationCount?: number; rules?: Partial<CustomRoomRules> }
  | { type: 'joinStation'; stationId: string }
  | { type: 'leaveStation' }
  | { type: 'setReady'; ready: boolean }
  | { type: 'startMatch'; stationId: string }
  | { type: 'lockCharacter'; stationId: string; characterId: string }
  | { type: 'lockStage'; stationId: string; choice: CustomStageChoice; stagePool: string[] }
  | { type: 'setMatchLoading'; stationId: string }
  | { type: 'setMatchLive'; stationId: string }
  | { type: 'reportResult'; stationId: string; winnerPlayerId: string }
  | { type: 'stepDown'; stationId: string }
  | { type: 'sendChat'; text: string }
  | { type: 'kickMember'; playerId: string }
  | { type: 'heartbeat'; peerId?: string };

export type CustomRoomEvent =
  | { type: 'snapshot'; room: CustomRoomState }
  | { type: 'error'; message: string }
  | { type: 'kicked'; roomId: string }
  | { type: 'roomClosed'; roomId: string };

export const defaultCustomRoomRules: CustomRoomRules = { roundsToWin: 3, roundTimer: 60 };

export function makeCustomRoomState(input: {
  roomId?: string;
  roomName?: string;
  visibility?: CustomRoomVisibility;
  stationCount?: number;
  rules?: Partial<CustomRoomRules>;
  appVersion: string;
  host: OnlinePlayerProfile;
  now?: number;
}): CustomRoomState {
  const now = input.now ?? Date.now();
  const stationCount = normalizeStationCount(input.stationCount);
  const roomId = cleanId(input.roomId) || crypto.randomUUID();
  return {
    protocol: CUSTOM_ROOM_PROTOCOL_VERSION,
    roomId,
    roomName: cleanRoomName(input.roomName || `${input.host.displayName} ROOM`),
    visibility: input.visibility === 'public' ? 'public' : 'private',
    hostPlayerId: cleanPlayerId(input.host.playerId),
    capacity: CUSTOM_ROOM_CAPACITY,
    stationCount,
    rules: normalizeRules(input.rules),
    appVersion: cleanToken(input.appVersion, 32),
    seed: `${roomId}:${crypto.randomUUID()}`,
    members: [{ playerId: cleanPlayerId(input.host.playerId), displayName: cleanDisplayName(input.host.displayName), joinedAt: now, connected: true }],
    stations: makeStations(stationCount),
    chat: [systemMessage(`${cleanDisplayName(input.host.displayName)} created the room`, now)],
    kickedPlayerIds: [],
    createdAt: now,
    updatedAt: now
  };
}

export function customRoomSummary(room: CustomRoomState): CustomRoomSummary {
  return {
    roomId: room.roomId,
    roomName: room.roomName,
    visibility: room.visibility,
    hostPlayerId: room.hostPlayerId,
    capacity: CUSTOM_ROOM_CAPACITY,
    stationCount: room.stationCount,
    appVersion: room.appVersion,
    updatedAt: room.updatedAt,
    memberCount: room.members.length,
    liveStationCount: room.stations.filter((station) => station.phase === 'live').length
  };
}

export function redactCustomRoomState(room: CustomRoomState): CustomRoomState {
  return {
    ...room,
    stations: room.stations.map((station) => {
      if (!station.match) return station;
      const { hiddenStageChoices: _hidden, ...match } = station.match as CustomMatch & { hiddenStageChoices?: unknown };
      return { ...station, match };
    })
  };
}

export function addCustomRoomMember(room: CustomRoomState, profile: OnlinePlayerProfile, now = Date.now()): CustomRoomState {
  const playerId = cleanPlayerId(profile.playerId);
  if (!playerId || room.kickedPlayerIds.includes(playerId)) throw new Error('Room unavailable');
  const existing = room.members.find((member) => member.playerId === playerId);
  if (!existing && room.members.length >= CUSTOM_ROOM_CAPACITY) throw new Error('Room is full');
  const members = existing
    ? room.members.map((member) => member.playerId === playerId ? { ...member, connected: true, disconnectedAt: undefined } : member)
    : [...room.members, { playerId, displayName: cleanDisplayName(profile.displayName), joinedAt: now, connected: true }];
  return withRoomEvent({ ...room, members }, existing ? `${existing.displayName} reconnected` : `${cleanDisplayName(profile.displayName)} joined`, now);
}

export function applyCustomRoomCommand(room: CustomRoomState, actorPlayerId: string, command: CustomRoomCommand, now = Date.now()): CustomRoomState {
  const actorId = cleanPlayerId(actorPlayerId);
  const actor = room.members.find((member) => member.playerId === actorId);
  if (!actor) throw new Error('You are no longer in this room');
  let next = expireSelections(room, now);
  if (command.type === 'heartbeat') {
    return touch({ ...next, members: next.members.map((member) => member.playerId === actorId ? { ...member, connected: true, disconnectedAt: undefined, peerId: cleanToken(command.peerId, 120) || member.peerId } : member) }, now);
  }
  if (command.type === 'updateRoom') return updateRoom(next, actorId, command, now);
  if (command.type === 'joinStation') return joinStation(next, actorId, command.stationId, now);
  if (command.type === 'leaveStation') return leaveStation(next, actorId, now);
  if (command.type === 'setReady') return setReady(next, actorId, command.ready, now);
  if (command.type === 'startMatch') return startMatch(next, actorId, command.stationId, now);
  if (command.type === 'lockCharacter') return lockCharacter(next, actorId, command.stationId, command.characterId, now);
  if (command.type === 'lockStage') return lockStage(next, actorId, command.stationId, command.choice, command.stagePool, now);
  if (command.type === 'setMatchLoading' || command.type === 'setMatchLive') return setMatchPhase(next, actorId, command.stationId, command.type === 'setMatchLive' ? 'live' : 'loading', now);
  if (command.type === 'reportResult') return reportResult(next, actorId, command.stationId, command.winnerPlayerId, now);
  if (command.type === 'stepDown') return stepDown(next, actorId, command.stationId, now);
  if (command.type === 'sendChat') return sendChat(next, actor, command.text, now);
  if (command.type === 'kickMember') return kickMember(next, actorId, command.playerId, now);
  return next;
}

export function removeCustomRoomMember(room: CustomRoomState, playerId: string, now = Date.now()): CustomRoomState | null {
  const clean = cleanPlayerId(playerId);
  const leaving = room.members.find((member) => member.playerId === clean);
  if (!leaving) return room;
  let next = room;
  if (leaving.stationId) next = leaveStation(next, clean, now, true);
  const members = next.members.filter((member) => member.playerId !== clean);
  if (members.length === 0) return null;
  const hostPlayerId = next.hostPlayerId === clean
    ? [...members].sort((a, b) => a.joinedAt - b.joinedAt)[0]!.playerId
    : next.hostPlayerId;
  return withRoomEvent({ ...next, members, hostPlayerId }, `${leaving.displayName} left${hostPlayerId !== next.hostPlayerId ? ` · ${memberName(members, hostPlayerId)} is host` : ''}`, now);
}

export function resolveCustomStageCandidates(matchId: string, choices: [CustomStageChoice, CustomStageChoice], stagePool: string[], roomSeed = matchId) {
  const pool = normalizeStagePool(stagePool);
  if (pool.length === 0) throw new Error('No compatible stages');
  const candidates = choices.map((choice, slot) => choice.kind === 'stage'
    ? requireStage(choice.stageId, pool)
    : pool[stableHash(`${roomSeed}:${matchId}:candidate:${slot + 1}`) % pool.length]!) as [string, string];
  const stageId = candidates[0] === candidates[1]
    ? candidates[0]
    : candidates[stableHash(`${roomSeed}:${matchId}:final`) % 2]!;
  return { candidates, stageId, stagePoolHash: hashStagePool(pool) };
}

export function hashStagePool(stagePool: string[]) {
  return stableHash(normalizeStagePool(stagePool).join('|')).toString(36);
}

function updateRoom(room: CustomRoomState, actorId: string, command: Extract<CustomRoomCommand, { type: 'updateRoom' }>, now: number) {
  requireHost(room, actorId);
  const stationCount = command.stationCount === undefined ? room.stationCount : normalizeStationCount(command.stationCount);
  if (stationCount < room.stationCount && room.stations.slice(stationCount).some((station) => station.memberPlayerIds.length || station.phase !== 'idle')) throw new Error('Empty higher stations before removing them');
  return touch({
    ...room,
    roomName: command.roomName === undefined ? room.roomName : cleanRoomName(command.roomName),
    visibility: command.visibility ?? room.visibility,
    stationCount,
    rules: command.rules ? normalizeRules({ ...room.rules, ...command.rules }) : room.rules,
    stations: stationCount > room.stationCount ? [...room.stations, ...makeStations(stationCount).slice(room.stationCount)] : room.stations.slice(0, stationCount)
  }, now);
}

function joinStation(room: CustomRoomState, actorId: string, stationId: string, now: number) {
  const current = room.members.find((member) => member.playerId === actorId)?.stationId;
  if (current === stationId) return room;
  if (current) room = leaveStation(room, actorId, now);
  const target = requireStation(room, stationId);
  const stations = room.stations.map((station) => station.id === target.id ? { ...station, memberPlayerIds: [...station.memberPlayerIds, actorId] } : station);
  const members = room.members.map((member) => member.playerId === actorId ? { ...member, stationId: target.id } : member);
  return withRoomEvent({ ...room, stations, members }, `${memberName(members, actorId)} joined ${target.label}`, now);
}

function leaveStation(room: CustomRoomState, actorId: string, now: number, force = false) {
  const member = room.members.find((candidate) => candidate.playerId === actorId);
  if (!member?.stationId) return room;
  const station = requireStation(room, member.stationId);
  if (!force && station.fighters?.includes(actorId) && !['idle', 'results'].includes(station.phase)) throw new Error('Active fighters cannot switch stations');
  const stations = room.stations.map((candidate) => candidate.id === station.id ? normalizeStationSlots({
    ...candidate,
    memberPlayerIds: candidate.memberPlayerIds.filter((id) => id !== actorId),
    readyQueue: candidate.readyQueue.filter((id) => id !== actorId),
    championPlayerId: candidate.championPlayerId === actorId ? undefined : candidate.championPlayerId,
    fighters: candidate.fighters?.includes(actorId) ? undefined : candidate.fighters,
    match: candidate.fighters?.includes(actorId) ? undefined : candidate.match,
    phase: candidate.fighters?.includes(actorId) ? 'idle' : candidate.phase
  }) : candidate);
  const members = room.members.map((candidate) => candidate.playerId === actorId ? { ...candidate, stationId: undefined } : candidate);
  return touch({ ...room, stations, members }, now);
}

function setReady(room: CustomRoomState, actorId: string, ready: boolean, now: number) {
  const member = room.members.find((candidate) => candidate.playerId === actorId);
  if (!member?.stationId) throw new Error('Join a station first');
  const station = requireStation(room, member.stationId);
  if (station.phase !== 'idle') throw new Error('The station is already starting');
  const readyQueue = ready
    ? station.readyQueue.includes(actorId) ? station.readyQueue : [...station.readyQueue, actorId]
    : station.readyQueue.filter((id) => id !== actorId);
  const championPlayerId = !ready && station.championPlayerId === actorId ? undefined : station.championPlayerId;
  const stations = room.stations.map((candidate) => candidate.id === station.id ? normalizeStationSlots({ ...candidate, readyQueue, championPlayerId }) : candidate);
  return touch({ ...room, stations }, now);
}

function startMatch(room: CustomRoomState, actorId: string, stationId: string, now: number) {
  const station = normalizeStationSlots(requireStation(room, stationId));
  if (station.phase !== 'idle' || !station.fighters?.includes(actorId)) throw new Error('Only an assigned fighter can start');
  const match: CustomMatch = {
    id: `${room.roomId}:${station.id}:${now.toString(36)}`,
    fighterPlayerIds: station.fighters,
    characterLocked: [false, false],
    stageLocked: [false, false],
    rules: { ...room.rules },
    createdAt: now,
    selectionDeadline: now + CUSTOM_CHARACTER_SELECT_TIMEOUT_MS,
    resultReports: {}
  };
  return touch({ ...room, stations: room.stations.map((candidate) => candidate.id === station.id ? { ...station, phase: 'characterSelect', match } : candidate) }, now);
}

function lockCharacter(room: CustomRoomState, actorId: string, stationId: string, characterId: string, now: number) {
  const station = requireStation(room, stationId);
  const match = station.match;
  if (station.phase !== 'characterSelect' || !match) throw new Error('Character selection is closed');
  const slot = match.fighterPlayerIds.indexOf(actorId);
  if (slot < 0) throw new Error('Only fighters select characters');
  const ids: [string, string] = match.characterIds ? [...match.characterIds] : ['', ''];
  const locks = [...match.characterLocked] as [boolean, boolean];
  ids[slot] = cleanId(characterId);
  locks[slot] = Boolean(ids[slot]);
  const complete = locks[0] && locks[1];
  const nextMatch = { ...match, characterIds: ids, characterLocked: locks, ...(complete ? { stageDeadline: now + CUSTOM_STAGE_SELECT_TIMEOUT_MS } : {}) };
  return touch({ ...room, stations: room.stations.map((candidate) => candidate.id === stationId ? { ...candidate, phase: complete ? 'stageSelect' : candidate.phase, match: nextMatch } : candidate) }, now);
}

function lockStage(room: CustomRoomState, actorId: string, stationId: string, choice: CustomStageChoice, stagePool: string[], now: number) {
  const station = requireStation(room, stationId);
  const match = station.match;
  if (station.phase !== 'stageSelect' || !match) throw new Error('Stage selection is closed');
  const slot = match.fighterPlayerIds.indexOf(actorId);
  if (slot < 0) throw new Error('Only fighters select stages');
  const pool = normalizeStagePool(stagePool);
  const poolHash = hashStagePool(pool);
  if (match.stagePoolHash && match.stagePoolHash !== poolHash) throw new Error('Stage pools do not match');
  const hiddenChoices = ((match as CustomMatch & { hiddenStageChoices?: [CustomStageChoice?, CustomStageChoice?] }).hiddenStageChoices ?? [undefined, undefined]) as [CustomStageChoice?, CustomStageChoice?];
  hiddenChoices[slot] = choice.kind === 'stage' ? { kind: 'stage', stageId: requireStage(choice.stageId, pool) } : { kind: 'random' };
  const locks = [...match.stageLocked] as [boolean, boolean];
  locks[slot] = true;
  let nextMatch: CustomMatch & { hiddenStageChoices?: [CustomStageChoice?, CustomStageChoice?] } = { ...match, stageLocked: locks, stagePoolHash: poolHash, hiddenStageChoices: hiddenChoices };
  let phase: CustomStationPhase = station.phase;
  if (locks[0] && locks[1] && hiddenChoices[0] && hiddenChoices[1]) {
    const resolved = resolveCustomStageCandidates(match.id, [hiddenChoices[0], hiddenChoices[1]], pool, room.seed);
    const { hiddenStageChoices: _hidden, ...publicMatch } = nextMatch;
    nextMatch = { ...publicMatch, ...resolved };
    phase = 'loading';
  }
  return touch({ ...room, stations: room.stations.map((candidate) => candidate.id === stationId ? { ...candidate, phase, match: nextMatch } : candidate) }, now);
}

function setMatchPhase(room: CustomRoomState, actorId: string, stationId: string, phase: 'loading' | 'live', now: number) {
  const station = requireStation(room, stationId);
  if (!station.fighters?.includes(actorId)) throw new Error('Only fighters can advance the match');
  if (phase === 'live' && (station.phase !== 'loading' || !station.match?.stageId)) throw new Error('Match is not loaded');
  return touch({ ...room, stations: room.stations.map((candidate) => candidate.id === stationId ? { ...candidate, phase } : candidate) }, now);
}

function reportResult(room: CustomRoomState, actorId: string, stationId: string, winnerPlayerId: string, now: number) {
  const station = requireStation(room, stationId);
  const match = station.match;
  const winnerId = cleanPlayerId(winnerPlayerId);
  if (!match || !match.fighterPlayerIds.includes(actorId) || !match.fighterPlayerIds.includes(winnerId)) throw new Error('Invalid match result');
  const reports = { ...match.resultReports, [actorId]: winnerId };
  const reported = match.fighterPlayerIds.map((id) => reports[id]).filter(Boolean);
  if (reported.length < 2) return touch({ ...room, stations: room.stations.map((candidate) => candidate.id === stationId ? { ...candidate, phase: 'results', match: { ...match, resultReports: reports } } : candidate) }, now);
  const agreed = reported[0] === reported[1] ? reported[0] : undefined;
  const loser = agreed ? match.fighterPlayerIds.find((id) => id !== agreed) : undefined;
  const nextStation = normalizeStationSlots({
    ...station,
    phase: 'idle',
    championPlayerId: agreed,
    readyQueue: station.readyQueue.filter((id) => id !== loser),
    fighters: undefined,
    match: undefined
  });
  return withRoomEvent({ ...room, stations: room.stations.map((candidate) => candidate.id === stationId ? nextStation : candidate) }, agreed ? `${memberName(room.members, agreed)} wins on ${station.label}` : `${station.label} result conflicted`, now);
}

function stepDown(room: CustomRoomState, actorId: string, stationId: string, now: number) {
  const station = requireStation(room, stationId);
  if (station.phase !== 'idle' || station.championPlayerId !== actorId) throw new Error('Only the waiting champion can step down');
  const readyQueue = station.readyQueue.filter((id) => id !== actorId);
  return touch({ ...room, stations: room.stations.map((candidate) => candidate.id === stationId ? normalizeStationSlots({ ...candidate, championPlayerId: undefined, readyQueue }) : candidate) }, now);
}

function sendChat(room: CustomRoomState, actor: CustomMember, text: string, now: number) {
  const clean = cleanChat(text);
  if (!clean) throw new Error('Enter a message');
  const last = [...room.chat].reverse().find((message) => message.playerId === actor.playerId);
  if (last && now - last.sentAt < 1_000) throw new Error('Please wait before sending another message');
  const message: CustomChatMessage = { id: crypto.randomUUID(), kind: 'chat', playerId: actor.playerId, displayName: actor.displayName, text: clean, sentAt: now };
  return touch({ ...room, chat: [...room.chat, message].slice(-100) }, now);
}

function kickMember(room: CustomRoomState, actorId: string, playerId: string, now: number) {
  requireHost(room, actorId);
  const target = cleanPlayerId(playerId);
  if (!target || target === actorId) throw new Error('Host cannot kick themselves');
  const member = room.members.find((candidate) => candidate.playerId === target);
  if (!member) return room;
  const removed = removeCustomRoomMember(room, target, now);
  if (!removed) return room;
  return withRoomEvent({ ...removed, kickedPlayerIds: [...new Set([...removed.kickedPlayerIds, target])] }, `${member.displayName} was removed`, now);
}

function expireSelections(room: CustomRoomState, now: number) {
  let changed = false;
  const stations = room.stations.map((station) => {
    if (station.phase === 'characterSelect' && station.match && now >= station.match.selectionDeadline) {
      changed = true;
      return normalizeStationSlots({ ...station, phase: 'idle', fighters: undefined, match: undefined, readyQueue: station.readyQueue.filter((id) => !station.fighters?.includes(id)) });
    }
    return station;
  });
  return changed ? touch({ ...room, stations }, now) : room;
}

function normalizeStationSlots(station: CustomStation): CustomStation {
  if (station.phase !== 'idle') return station;
  const validQueue = station.readyQueue.filter((id) => station.memberPlayerIds.includes(id));
  const champion = station.championPlayerId && validQueue.includes(station.championPlayerId) ? station.championPlayerId : undefined;
  const challenger = validQueue.find((id) => id !== champion);
  const fighters = champion && challenger
    ? [champion, challenger] as [string, string]
    : validQueue.length >= 2 ? [validQueue[0]!, validQueue[1]!] as [string, string] : undefined;
  return { ...station, readyQueue: validQueue, championPlayerId: champion, fighters };
}

function makeStations(count: number): CustomStation[] {
  return Array.from({ length: count }, (_, index) => ({ id: `station-${index + 1}`, label: String.fromCharCode(65 + index), phase: 'idle', memberPlayerIds: [], readyQueue: [] }));
}

function normalizeRules(value?: Partial<CustomRoomRules>): CustomRoomRules {
  const rounds = [1, 2, 3, 5].includes(Number(value?.roundsToWin)) ? Number(value?.roundsToWin) : 3;
  const timer = [30, 45, 60, 90, 99].includes(Number(value?.roundTimer)) ? Number(value?.roundTimer) : 60;
  return { roundsToWin: rounds as CustomRoomRules['roundsToWin'], roundTimer: timer as CustomRoomRules['roundTimer'] };
}

function normalizeStationCount(value?: number) { return Math.max(1, Math.min(CUSTOM_ROOM_MAX_STATIONS, Math.round(Number(value) || 1))); }
function normalizeStagePool(value: string[]) { return [...new Set((Array.isArray(value) ? value : []).map(cleanId).filter(Boolean))].sort(); }
function requireStage(value: string, pool: string[]) { const id = cleanId(value); if (!pool.includes(id)) throw new Error('Stage is unavailable'); return id; }
function requireStation(room: CustomRoomState, stationId: string) { const station = room.stations.find((candidate) => candidate.id === stationId); if (!station) throw new Error('Station not found'); return station; }
function requireHost(room: CustomRoomState, actorId: string) { if (room.hostPlayerId !== actorId) throw new Error('Only the host can do that'); }
function memberName(members: CustomMember[], playerId: string) { return members.find((member) => member.playerId === playerId)?.displayName ?? 'PLAYER'; }
function touch(room: CustomRoomState, now: number): CustomRoomState { return { ...room, updatedAt: now }; }
function withRoomEvent(room: CustomRoomState, text: string, now: number): CustomRoomState { return touch({ ...room, chat: [...room.chat, systemMessage(text, now)].slice(-100) }, now); }
function systemMessage(text: string, sentAt: number): CustomChatMessage { return { id: crypto.randomUUID(), kind: 'system', text: cleanChat(text), sentAt }; }
function stableHash(value: string) { let hash = 2166136261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
function cleanId(value: unknown) { return typeof value === 'string' ? value.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 120) : ''; }
function cleanPlayerId(value: unknown) { return typeof value === 'string' ? value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 96) : ''; }
function cleanToken(value: unknown, max = 120) { return typeof value === 'string' ? value.replace(/[^a-zA-Z0-9:._-]/g, '').slice(0, max) : ''; }
function cleanDisplayName(value: unknown) { return typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12) || 'PLAYER' : 'PLAYER'; }
function cleanRoomName(value: unknown) { return typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18) || 'CUSTOM ROOM' : 'CUSTOM ROOM'; }
function cleanChat(value: unknown) { return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) : ''; }

import { describe, expect, it } from 'vitest';
import {
  addCustomRoomMember,
  applyCustomRoomCommand,
  customRoomSummary,
  makeCustomRoomState,
  removeCustomRoomMember,
  resolveCustomStageCandidates
} from './customRooms';

const host = { playerId: 'host-player', displayName: 'Host' };
const guest = { playerId: 'guest-player', displayName: 'Guest' };
const third = { playerId: 'third-player', displayName: 'Third' };

function readyRoom() {
  let room = makeCustomRoomState({ host, appVersion: 'test', now: 1_000 });
  room = addCustomRoomMember(room, guest, 1_001);
  room = addCustomRoomMember(room, third, 1_002);
  for (const playerId of [host.playerId, guest.playerId, third.playerId]) room = applyCustomRoomCommand(room, playerId, { type: 'joinStation', stationId: 'station-1' }, 2_000);
  room = applyCustomRoomCommand(room, host.playerId, { type: 'setReady', ready: true }, 2_001);
  room = applyCustomRoomCommand(room, guest.playerId, { type: 'setReady', ready: true }, 2_002);
  room = applyCustomRoomCommand(room, third.playerId, { type: 'setReady', ready: true }, 2_003);
  return room;
}

describe('custom rooms', () => {
  it('creates private eight-player rooms with one station by default', () => {
    const room = makeCustomRoomState({ host, appVersion: 'test', now: 100 });
    expect(room.visibility).toBe('private');
    expect(room.capacity).toBe(8);
    expect(room.stations).toHaveLength(1);
    expect(room.stations[0].label).toBe('A');
    expect(customRoomSummary(room)).toMatchObject({ memberCount: 1, liveStationCount: 0 });
  });

  it('assigns fighters by ready order and permits either fighter to start', () => {
    let room = readyRoom();
    expect(room.stations[0].fighters).toEqual([host.playerId, guest.playerId]);
    room = applyCustomRoomCommand(room, guest.playerId, { type: 'startMatch', stationId: 'station-1' }, 3_000);
    expect(room.stations[0].phase).toBe('characterSelect');
  });

  it('keeps the winner and promotes the earliest queued challenger', () => {
    let room = readyRoom();
    room = applyCustomRoomCommand(room, host.playerId, { type: 'startMatch', stationId: 'station-1' }, 3_000);
    room = applyCustomRoomCommand(room, host.playerId, { type: 'reportResult', stationId: 'station-1', winnerPlayerId: host.playerId }, 4_000);
    room = applyCustomRoomCommand(room, guest.playerId, { type: 'reportResult', stationId: 'station-1', winnerPlayerId: host.playerId }, 4_001);
    expect(room.stations[0]).toMatchObject({ phase: 'idle', championPlayerId: host.playerId, fighters: [host.playerId, third.playerId] });
    expect(room.stations[0].readyQueue).not.toContain(guest.playerId);
  });

  it('transfers hosting to the longest-present remaining member', () => {
    const room = readyRoom();
    const next = removeCustomRoomMember(room, host.playerId, 5_000);
    expect(next?.hostPlayerId).toBe(guest.playerId);
  });

  it('resolves explicit and random stage candidates reproducibly', () => {
    const pool = ['forge-yard', 'metro-ring', 'the-chamber'];
    const explicit = resolveCustomStageCandidates('match-1', [{ kind: 'stage', stageId: 'forge-yard' }, { kind: 'stage', stageId: 'metro-ring' }], pool, 'room-seed');
    const same = resolveCustomStageCandidates('match-1', [{ kind: 'stage', stageId: 'forge-yard' }, { kind: 'stage', stageId: 'forge-yard' }], pool, 'room-seed');
    const mixedA = resolveCustomStageCandidates('match-2', [{ kind: 'random' }, { kind: 'stage', stageId: 'metro-ring' }], pool, 'room-seed');
    const mixedB = resolveCustomStageCandidates('match-2', [{ kind: 'random' }, { kind: 'stage', stageId: 'metro-ring' }], [...pool].reverse(), 'room-seed');
    const bothRandom = resolveCustomStageCandidates('match-3', [{ kind: 'random' }, { kind: 'random' }], pool, 'room-seed');
    expect(explicit.candidates).toEqual(['forge-yard', 'metro-ring']);
    expect(same).toMatchObject({ candidates: ['forge-yard', 'forge-yard'], stageId: 'forge-yard' });
    expect(mixedA).toEqual(mixedB);
    expect(pool).toContain(bothRandom.stageId);
  });

  it('enforces capacity, host-only rules, station limits, chat limits, and kicks', () => {
    let room = makeCustomRoomState({ host, appVersion: 'test', now: 1_000 });
    room = applyCustomRoomCommand(room, host.playerId, { type: 'updateRoom', stationCount: 9, visibility: 'public', rules: { roundsToWin: 5, roundTimer: 99 } }, 1_001);
    expect(room).toMatchObject({ stationCount: 4, visibility: 'public', rules: { roundsToWin: 5, roundTimer: 99 } });
    expect(() => applyCustomRoomCommand(room, guest.playerId, { type: 'updateRoom', stationCount: 1 }, 1_002)).toThrow();
    for (let index = 1; index < 8; index += 1) room = addCustomRoomMember(room, { playerId: `player-${index}`, displayName: `Player ${index}` }, 2_000 + index);
    expect(() => addCustomRoomMember(room, guest, 3_000)).toThrow('Room is full');
    room = applyCustomRoomCommand(room, host.playerId, { type: 'sendChat', text: ` ${'x'.repeat(200)} ` }, 4_000);
    expect(room.chat[room.chat.length - 1]?.text).toHaveLength(160);
    expect(() => applyCustomRoomCommand(room, host.playerId, { type: 'sendChat', text: 'too soon' }, 4_500)).toThrow();
    room = applyCustomRoomCommand(room, host.playerId, { type: 'kickMember', playerId: 'player-1' }, 6_000);
    expect(room.kickedPlayerIds).toContain('player-1');
    expect(() => addCustomRoomMember(room, { playerId: 'player-1', displayName: 'Player 1' }, 7_000)).toThrow();
  });

  it('clears the champion when fighter result reports conflict', () => {
    let room = readyRoom();
    room = applyCustomRoomCommand(room, host.playerId, { type: 'startMatch', stationId: 'station-1' }, 3_000);
    room = applyCustomRoomCommand(room, host.playerId, { type: 'reportResult', stationId: 'station-1', winnerPlayerId: host.playerId }, 4_000);
    room = applyCustomRoomCommand(room, guest.playerId, { type: 'reportResult', stationId: 'station-1', winnerPlayerId: guest.playerId }, 4_001);
    expect(room.stations[0]).toMatchObject({ phase: 'idle', championPlayerId: undefined });
    expect(room.stations[0].fighters).toEqual([host.playerId, guest.playerId]);
  });

  it('lets a waiting champion step down so the first queued pair takes over', () => {
    let room = readyRoom();
    room = applyCustomRoomCommand(room, host.playerId, { type: 'startMatch', stationId: 'station-1' }, 3_000);
    room = applyCustomRoomCommand(room, host.playerId, { type: 'reportResult', stationId: 'station-1', winnerPlayerId: host.playerId }, 4_000);
    room = applyCustomRoomCommand(room, guest.playerId, { type: 'reportResult', stationId: 'station-1', winnerPlayerId: host.playerId }, 4_001);
    room = applyCustomRoomCommand(room, host.playerId, { type: 'stepDown', stationId: 'station-1' }, 5_000);
    expect(room.stations[0]).toMatchObject({ championPlayerId: undefined, fighters: undefined });
  });
});

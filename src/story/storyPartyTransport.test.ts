import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryPartyInstance } from './adventureExploration';

const peerMock = vi.hoisted(() => {
  type Handler = (...args: any[]) => void;
  class Emitter {
    handlers = new Map<string, Handler[]>();
    on(event: string, handler: Handler) { this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]); return this; }
    once(event: string, handler: Handler) { const once = (...args: any[]) => { this.off(event, once); handler(...args); }; return this.on(event, once); }
    off(event: string, handler: Handler) { this.handlers.set(event, (this.handlers.get(event) ?? []).filter((candidate) => candidate !== handler)); }
    emit(event: string, ...args: any[]) { (this.handlers.get(event) ?? []).forEach((handler) => handler(...args)); }
  }
  class Connection extends Emitter {
    open = false;
    remote?: Connection;
    constructor(public peer: string) { super(); }
    send(value: unknown) { this.remote?.emit('data', value); }
    close() { this.open = false; this.emit('close'); this.remote?.emit('close'); }
  }
  const peers = new Map<string, MockPeer>();
  let sequence = 0;
  class MockPeer extends Emitter {
    id = `peer-${++sequence}`;
    open = false;
    constructor() { super(); peers.set(this.id, this); queueMicrotask(() => { this.open = true; this.emit('open', this.id); }); }
    connect(peerId: string) {
      const target = peers.get(peerId);
      const local = new Connection(peerId);
      const remote = new Connection(this.id);
      local.remote = remote;
      remote.remote = local;
      target?.emit('connection', remote);
      queueMicrotask(() => { local.open = true; remote.open = true; local.emit('open'); remote.emit('open'); });
      return local;
    }
    destroy() { peers.delete(this.id); this.open = false; }
  }
  return { MockPeer, reset: () => { peers.clear(); sequence = 0; } };
});

vi.mock('peerjs', () => ({ default: peerMock.MockPeer }));

import { createStoryPartyTransport } from './storyPartyTransport';

function party(): StoryPartyInstance {
  const member = (sessionId: string, peerId: string, joinedAt: number) => ({ sessionId, peerId, displayName: sessionId, avatarId: 'avatar-1', avatarSet: 'solar-runner' as const, equippedAvatars: [{ avatarId: 'avatar-1', avatarSet: 'solar-runner' as const }], capacity: 2, joinedAt, lastSeenAt: Date.now(), state: 'active' as const, health: 100, maxHealth: 100 });
  return { version: 2, id: 'party-a', worldId: 'greenhollow', seed: 'seed', generationVersion: 2, leaderSessionId: 'leader', leaderCapacity: 2, members: [member('leader', 'peer-1', 1), member('guest', 'peer-2', 2)], aiActors: [], roomId: 'surface', protocolSequence: 1, updatedAt: Date.now() };
}

describe('PeerJS Story party star transport', () => {
  beforeEach(() => peerMock.reset());

  it('routes guest intents to the leader and ordered reward snapshots back to the guest', async () => {
    const intents: unknown[] = [];
    const snapshots: unknown[] = [];
    const state = party();
    const leader = await createStoryPartyTransport({ party: state, sessionId: 'leader', onIntent: (intent) => intents.push(intent) });
    const guest = await createStoryPartyTransport({ party: state, sessionId: 'guest', onSnapshot: (snapshot) => snapshots.push(snapshot) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    guest.sendIntent({ sequence: 1, clientTime: Date.now(), moveX: 1, moveY: 0, predictedX: 4, predictedY: 1, jump: false, block: false, attack: 'jab' });
    expect(intents).toHaveLength(1);
    leader.broadcastSnapshot({ authorityEpoch: 1, sequence: 1, serverTime: Date.now(), roomId: 'surface', actors: [], enemies: [], projectiles: [], encounterState: null, rewardsPaused: false, rewardEvents: [{ id: 'reward-1', spawnId: 'spawn-1', enemyId: 'silver-duelist', tier: 'challenger', xp: 100, recipients: ['leader', 'guest'] }] });
    expect(snapshots).toHaveLength(1);
    expect((snapshots[0] as { rewardEvents: unknown[] }).rewardEvents).toHaveLength(1);
    guest.close();
    leader.close();
  });
});

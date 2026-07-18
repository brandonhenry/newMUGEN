import type { DataConnection } from 'peerjs';
import type Peer from 'peerjs';
import type { StoryPartyInstance } from './adventureExploration';
import { sanitizeStoryPartyCombatIntent, sanitizeStoryPartySnapshot, STORY_PARTY_PROTOCOL_VERSION, type StoryPartyAuthoritativeSnapshot, type StoryPartyCombatIntent } from './storyPartyProtocol';

export type StoryPartyTransport = {
  peerId: string;
  sendIntent: (intent: Omit<StoryPartyCombatIntent, 'version' | 'type' | 'partyId' | 'senderSessionId'>) => void;
  broadcastSnapshot: (snapshot: Omit<StoryPartyAuthoritativeSnapshot, 'version' | 'type' | 'partyId' | 'leaderSessionId'>) => void;
  updateParty: (party: StoryPartyInstance) => void;
  close: () => void;
};

export type StoryPartyTransportOptions = {
  party: StoryPartyInstance;
  sessionId: string;
  onIntent?: (intent: StoryPartyCombatIntent) => void;
  onSnapshot?: (snapshot: StoryPartyAuthoritativeSnapshot) => void;
  onAuthorityLoss?: () => void;
  onError?: (error: Error) => void;
};

export async function createStoryPartyTransport(options: StoryPartyTransportOptions): Promise<StoryPartyTransport> {
  const { default: PeerConstructor } = await import('peerjs');
  const peer: Peer = new PeerConstructor();
  let party = options.party;
  let closed = false;
  let leaderConnection: DataConnection | null = null;
  const guestConnections = new Map<string, DataConnection>();
  const lastIntentSequence = new Map<string, number>();
  let lastSnapshotEpoch = -1;
  let lastSnapshotSequence = -1;

  const send = (connection: DataConnection, value: unknown) => {
    if (connection.open) connection.send(value);
  };
  const bind = (connection: DataConnection) => {
    guestConnections.set(connection.peer, connection);
    connection.on('data', (value) => {
      if (party.leaderSessionId === options.sessionId) {
        const sender = value && typeof value === 'object' ? String((value as { senderSessionId?: unknown }).senderSessionId ?? '') : '';
        const intent = sanitizeStoryPartyCombatIntent(value, { partyId: party.id, members: new Set(party.members.map((member) => member.sessionId)), lastSequence: lastIntentSequence.get(sender) ?? -1 });
        if (!intent) return;
        lastIntentSequence.set(intent.senderSessionId, intent.sequence);
        options.onIntent?.(intent);
        return;
      }
      const snapshot = sanitizeStoryPartySnapshot(value, { partyId: party.id, leaderSessionId: party.leaderSessionId, lastEpoch: lastSnapshotEpoch, lastSequence: lastSnapshotSequence });
      if (!snapshot) return;
      lastSnapshotEpoch = snapshot.authorityEpoch;
      lastSnapshotSequence = snapshot.sequence;
      options.onSnapshot?.(snapshot);
    });
    connection.on('close', () => {
      guestConnections.delete(connection.peer);
      if (leaderConnection === connection) {
        leaderConnection = null;
        options.onAuthorityLoss?.();
      }
    });
    connection.on('error', (error) => options.onError?.(error instanceof Error ? error : new Error(String(error))));
  };
  peer.on('connection', bind);
  peer.on('error', (error) => options.onError?.(error instanceof Error ? error : new Error(String(error))));
  await new Promise<void>((resolve, reject) => {
    if (peer.open) { resolve(); return; }
    const timeout = window.setTimeout(() => reject(new Error('Party PeerJS connection timed out')), 10_000);
    peer.once('open', () => { window.clearTimeout(timeout); resolve(); });
    peer.once('error', (error) => { window.clearTimeout(timeout); reject(error); });
  });

  const connectToLeader = () => {
    if (closed || party.leaderSessionId === options.sessionId || leaderConnection?.open) return;
    const leaderPeerId = party.members.find((member) => member.sessionId === party.leaderSessionId)?.peerId;
    if (!leaderPeerId || leaderPeerId === peer.id) return;
    leaderConnection = peer.connect(leaderPeerId, { reliable: true, serialization: 'json' });
    bind(leaderConnection);
  };
  connectToLeader();

  return {
    peerId: peer.id,
    sendIntent(intent) {
      if (party.leaderSessionId === options.sessionId) {
        options.onIntent?.({ version: STORY_PARTY_PROTOCOL_VERSION, type: 'intent', partyId: party.id, senderSessionId: options.sessionId, ...intent });
        return;
      }
      if (!leaderConnection?.open) connectToLeader();
      if (leaderConnection) send(leaderConnection, { version: STORY_PARTY_PROTOCOL_VERSION, type: 'intent', partyId: party.id, senderSessionId: options.sessionId, ...intent });
    },
    broadcastSnapshot(snapshot) {
      if (party.leaderSessionId !== options.sessionId) return;
      const message: StoryPartyAuthoritativeSnapshot = { version: STORY_PARTY_PROTOCOL_VERSION, type: 'snapshot', partyId: party.id, leaderSessionId: options.sessionId, ...snapshot };
      guestConnections.forEach((connection) => send(connection, message));
      options.onSnapshot?.(message);
    },
    updateParty(next) {
      const wasLeader = party.leaderSessionId === options.sessionId;
      party = next;
      if (wasLeader && party.leaderSessionId !== options.sessionId) options.onAuthorityLoss?.();
      connectToLeader();
    },
    close() {
      closed = true;
      guestConnections.forEach((connection) => connection.close());
      guestConnections.clear();
      leaderConnection?.close();
      peer.destroy();
    }
  };
}

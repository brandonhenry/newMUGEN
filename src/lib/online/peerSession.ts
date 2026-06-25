import type Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { ONLINE_PROTOCOL_VERSION } from './codec';
import { isOnlineMessage, type OnlineHelloMessage, type OnlineMessage } from './messages';

export type OnlinePeerSession = {
  peer: Peer;
  peerId: string;
  connection: DataConnection | null;
  connect: (peerId: string) => DataConnection;
  send: (message: OnlineMessage) => void;
  close: () => void;
};

export type OnlinePeerSessionOptions = {
  characterId: string;
  onOpen?: (peerId: string) => void;
  onConnection?: (connection: DataConnection) => void;
  onMessage?: (message: OnlineMessage) => void;
  onClose?: () => void;
  onError?: (error: Error) => void;
};

export async function createOnlinePeerSession(options: OnlinePeerSessionOptions): Promise<OnlinePeerSession> {
  const { default: PeerConstructor } = await import('peerjs');
  const peer = new PeerConstructor();
  let activeConnection: DataConnection | null = null;

  const bindConnection = (connection: DataConnection) => {
    activeConnection = connection;
    connection.on('open', () => {
      sendConnectionMessage(connection, {
        type: 'hello',
        protocol: ONLINE_PROTOCOL_VERSION,
        peerId: peer.id,
        characterId: options.characterId
      });
      options.onConnection?.(connection);
    });
    connection.on('data', (data) => {
      if (!isOnlineMessage(data)) return;
      if (data.type === 'ping') {
        sendConnectionMessage(connection, { type: 'pong', t: data.t });
        return;
      }
      options.onMessage?.(data);
    });
    connection.on('close', () => {
      if (activeConnection === connection) activeConnection = null;
      options.onClose?.();
    });
    connection.on('error', (error) => options.onError?.(error instanceof Error ? error : new Error(String(error))));
  };

  peer.on('open', (id) => options.onOpen?.(id));
  peer.on('connection', bindConnection);
  peer.on('error', (error) => options.onError?.(error instanceof Error ? error : new Error(String(error))));
  peer.on('disconnected', () => options.onClose?.());

  await waitForPeerOpen(peer);

  return {
    peer,
    peerId: peer.id,
    get connection() {
      return activeConnection;
    },
    connect(peerId: string) {
      const connection = peer.connect(peerId, { reliable: true, serialization: 'json' });
      bindConnection(connection);
      return connection;
    },
    send(message: OnlineMessage) {
      if (!activeConnection?.open) return;
      sendConnectionMessage(activeConnection, message);
    },
    close() {
      try {
        activeConnection?.close();
      } catch {
        // no-op
      }
      try {
        peer.destroy();
      } catch {
        // no-op
      }
      activeConnection = null;
    }
  };
}

export function sendConnectionMessage(connection: DataConnection, message: OnlineMessage | OnlineHelloMessage) {
  if (!connection.open && message.type !== 'hello') return;
  connection.send(message);
}

function waitForPeerOpen(peer: Peer): Promise<void> {
  if (peer.open) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('PeerJS connection timed out')), 10_000);
    peer.once('open', () => {
      window.clearTimeout(timeout);
      resolve();
    });
    peer.once('error', (error) => {
      window.clearTimeout(timeout);
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

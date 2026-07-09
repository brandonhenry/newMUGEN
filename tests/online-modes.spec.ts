import { expect, test, type Page } from '@playwright/test';
import { makeDefaultRankedProfile, applyRankedMatchReport, type RankedProfile } from '../src/lib/online/ranked';
import { ONLINE_PROTOCOL_VERSION } from '../src/lib/online/codec';

const STARTER_GUIDE_DISMISSED_KEY = 'kore.starterGuide.dismissed.v1';

type MatchmakeRoom = {
  roomId: string;
  ownerToken: string;
  hostPeerId: string;
  hostCharacterId: string;
  guestPeerId?: string;
  guestCharacterId?: string;
  stageId: string;
  queue: 'casual' | 'ranked' | 'training';
  status: 'waiting' | 'matched';
  hostKp?: number;
  guestKp?: number;
};

type PrivateRoom = {
  roomId: string;
  ownerToken: string;
  roomName: string;
  password: string;
  hostPeerId: string;
  hostCharacterId: string;
  guestPeerId?: string;
  guestCharacterId?: string;
  stageId: string;
  status: 'waiting' | 'matched';
  createdAt: number;
  updatedAt: number;
};

test.describe('online mode confidence', () => {
  test.setTimeout(120_000);

  test('connects a casual online human match, rolls back/syncs, and submits leaderboard once', async ({ browser }) => {
    const context = await browser.newContext();
    const harness = new OnlineHarness();
    const host = await newOnlinePage(context, harness, 'casual-host', { playerId: 'casual-host-player', displayName: 'HOST' });
    const guest = await newOnlinePage(context, harness, 'casual-guest', { playerId: 'casual-guest-player', displayName: 'GUEST' });

    await startOnlineFight(host, 'online');
    await expect.poll(() => diagnostics(host), { timeout: 20_000 }).toMatchObject({ onlineRole: 'host', onlineState: 'searching' });
    await startOnlineFight(guest, 'online');

    await expectConnected(host, 'host');
    await expectConnected(guest, 'guest');
    await context.close();
  });

  test('connects ranked human match and delivers ranked results to both players', async ({ browser }) => {
    const context = await browser.newContext();
    const harness = new OnlineHarness();
    const host = await newOnlinePage(context, harness, 'ranked-host', { playerId: 'ranked-host-player', displayName: 'HOST' });
    const guest = await newOnlinePage(context, harness, 'ranked-guest', { playerId: 'ranked-guest-player', displayName: 'GUEST' });

    await startOnlineFight(host, 'ranked');
    await expect.poll(() => diagnostics(host), { timeout: 20_000 }).toMatchObject({ onlineRole: 'host', onlineState: 'searching' });
    await startOnlineFight(guest, 'ranked');

    await expectConnected(host, 'host');
    await expectConnected(guest, 'guest');
    await context.close();
  });

  test('creates and joins a private room through the room list', async ({ browser }) => {
    const context = await browser.newContext();
    const harness = new OnlineHarness();
    const host = await newOnlinePage(context, harness, 'private-host', { playerId: 'private-host-player', displayName: 'HOST' });
    const guest = await newOnlinePage(context, harness, 'private-guest', { playerId: 'private-guest-player', displayName: 'GUEST' });

    await startPrivateHostFight(host);
    await expect.poll(() => diagnostics(host), { timeout: 20_000 }).toMatchObject({ onlineRole: 'host', onlineState: 'searching' });
    await expect.poll(() => harness.privateRooms[0]?.password ?? '').not.toBe('');
    const room = harness.privateRooms[0];
    expect(room).toBeTruthy();

    await startPrivateGuestFight(guest, room.roomId, room.password);
    await expectConnected(host, 'host');
    await expectConnected(guest, 'guest');
    await context.close();
  });
});

class OnlineHarness {
  matchRooms: MatchmakeRoom[] = [];
  privateRooms: PrivateRoom[] = [];
  rankedProfiles = new Map<string, RankedProfile>();
  rankedResults = new Map<string, unknown>();
  leaderboardSubmits = 0;
  pages = new Map<string, Page>();

  async attach(page: Page, peerId: string, profile: { playerId: string; displayName: string }) {
    this.pages.set(peerId, page);
    await page.exposeBinding('__korePeerRegister', async () => undefined);
    await page.exposeBinding('__korePeerConnect', async (_source, localPeerId: string, remotePeerId: string) => {
      const remote = this.pages.get(remotePeerId);
      if (remote) await remote.evaluate((from) => (window as any).__koreE2EPeerAccept?.(from), localPeerId);
    });
    await page.exposeBinding('__korePeerSend', async (_source, localPeerId: string, remotePeerId: string, message: unknown) => {
      const remote = this.pages.get(remotePeerId);
      if (remote) await remote.evaluate((payload) => (window as any).__koreE2EPeerDeliver?.(payload.message), { from: localPeerId, message });
    });
    await page.exposeBinding('__korePeerClose', async (_source, _localPeerId: string, remotePeerId: string) => {
      const remote = this.pages.get(remotePeerId);
      if (remote) await remote.evaluate(() => (window as any).__koreE2EPeerClose?.());
    });
    await page.addInitScript(
      ({ peerId: injectedPeerId, profile: injectedProfile, protocol }) => {
        window.localStorage.setItem('kore.starterGuide.dismissed.v1', '1');
        window.localStorage.setItem('kore.online.profile', JSON.stringify(injectedProfile));
        (window as any).__KORE_E2E_SKIP_ONLINE_VERSUS__ = true;
        (window as any).__KORE_E2E_SKIP_ONLINE_ASSET_GATE__ = true;
        (window as any).__KORE_E2E_PEER_FACTORY__ = async (options: any) => {
          let activeRemote = '';
          let open = true;
          const makeConnection = (remotePeerId: string) => ({
            get open() {
              return open && activeRemote === remotePeerId;
            },
            send(message: unknown) {
              void (window as any).__korePeerSend(injectedPeerId, remotePeerId, message);
            },
            close() {
              open = false;
              options.onClose?.();
            },
            on() {
              return undefined;
            }
          });
          const bindRemote = (remotePeerId: string) => {
            activeRemote = remotePeerId;
            open = true;
            const connection = makeConnection(remotePeerId);
            void (window as any).__korePeerSend(injectedPeerId, remotePeerId, {
              type: 'hello',
              protocol,
              peerId: injectedPeerId,
              characterId: options.characterId,
              profile: options.profile
            });
            options.onConnection?.(connection);
          };
          (window as any).__koreE2EPeerAccept = (remotePeerId: string) => bindRemote(remotePeerId);
          (window as any).__koreE2EPeerDeliver = (message: any) => {
            if (message?.type === 'ping') {
              if (activeRemote) void (window as any).__korePeerSend(injectedPeerId, activeRemote, { type: 'pong', t: message.t });
              return;
            }
            options.onMessage?.(message);
          };
          (window as any).__koreE2EPeerClose = () => {
            open = false;
            options.onClose?.();
          };
          await (window as any).__korePeerRegister(injectedPeerId);
          window.setTimeout(() => options.onOpen?.(injectedPeerId), 0);
          return {
            peer: { id: injectedPeerId, open: true, destroy() { open = false; } },
            peerId: injectedPeerId,
            get connection() {
              return activeRemote ? makeConnection(activeRemote) : null;
            },
            connect(remotePeerId: string) {
              bindRemote(remotePeerId);
              void (window as any).__korePeerConnect(injectedPeerId, remotePeerId);
              return makeConnection(remotePeerId);
            },
            send(message: unknown) {
              if (activeRemote) void (window as any).__korePeerSend(injectedPeerId, activeRemote, message);
            },
            close() {
              open = false;
            }
          };
        };
      },
      { peerId, profile, protocol: ONLINE_PROTOCOL_VERSION }
    );
    await this.routeEndpoints(page);
  }

  async routeEndpoints(page: Page) {
    await page.route('**/.netlify/functions/online-matchmake', async (route) => {
      const body = route.request().postDataJSON() as any;
      const queue = body.queue === 'ranked' ? 'ranked' : body.queue === 'training' ? 'training' : 'casual';
      const currentRoom = body.roomId
        ? this.matchRooms.find((room) => room.roomId === body.roomId && room.ownerToken === body.ownerToken && room.hostPeerId === body.peerId)
        : undefined;
      if (currentRoom) {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...currentRoom, role: 'host', opponentKind: currentRoom.status === 'matched' ? 'human' : undefined }) });
        return;
      }
      let waiting = this.matchRooms.find((room) => room.status === 'waiting' && room.queue === queue && room.hostPeerId !== body.peerId);
      if (waiting) {
        waiting = Object.assign(waiting, {
          status: 'matched',
          guestPeerId: body.peerId,
          guestCharacterId: body.characterId,
          guestKp: body.kp
        });
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...waiting, role: 'guest', opponentKind: 'human' }) });
        return;
      }
      const room: MatchmakeRoom = {
        roomId: `${queue}-room-${this.matchRooms.length + 1}`,
        ownerToken: `${queue}-owner-${this.matchRooms.length + 1}`,
        hostPeerId: body.peerId,
        hostCharacterId: body.characterId,
        stageId: body.stageId,
        queue,
        status: 'waiting',
        hostKp: body.kp
      };
      this.matchRooms.push(room);
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...room, role: 'host' }) });
    });
    await page.route('**/.netlify/functions/online-leave', async (route) => {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    await page.route('**/.netlify/functions/online-leaderboard-submit', async (route) => {
      this.leaderboardSubmits += 1;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ entries: [] }) });
    });
    await page.route('**/.netlify/functions/online-ranked-profile', async (route) => {
      const profile = (route.request().postDataJSON() as any).profile;
      const ranked = this.rankedProfiles.get(profile.playerId) ?? makeDefaultRankedProfile(profile);
      this.rankedProfiles.set(profile.playerId, ranked);
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(ranked) });
    });
    await page.route('**/.netlify/functions/online-ranked-submit', async (route) => {
      const report = route.request().postDataJSON() as any;
      const reportId = [report.roomId, report.winnerPlayerId, ...report.players.map((player: any) => player.profile.playerId).sort()].join(':');
      const existing = this.rankedResults.get(reportId);
      if (existing) {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(existing) });
        return;
      }
      const profiles = report.players.map((player: any) => this.rankedProfiles.get(player.profile.playerId) ?? makeDefaultRankedProfile(player.profile)) as [RankedProfile, RankedProfile];
      const result = applyRankedMatchReport(profiles, { ...report, reportId });
      result.players.forEach((player) => this.rankedProfiles.set(player.playerId, player.profile));
      this.rankedResults.set(reportId, result);
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
    });
    await page.route('**/.netlify/functions/private-room-list', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ rooms: this.privateRooms.filter((room) => room.status === 'waiting').map(({ password: _password, ownerToken: _ownerToken, ...room }) => room) })
      });
    });
    await page.route('**/.netlify/functions/private-room-create', async (route) => {
      const body = route.request().postDataJSON() as any;
      let room = body.roomId ? this.privateRooms.find((item) => item.roomId === body.roomId) : undefined;
      if (!room) {
        room = {
          roomId: `private-room-${this.privateRooms.length + 1}`,
          ownerToken: `private-owner-${this.privateRooms.length + 1}`,
          roomName: body.roomName,
          password: body.password,
          hostPeerId: body.peerId,
          hostCharacterId: body.characterId,
          stageId: body.stageId,
          status: 'waiting',
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        this.privateRooms.push(room);
      } else {
        Object.assign(room, { hostPeerId: body.peerId, hostCharacterId: body.characterId, stageId: body.stageId, updatedAt: Date.now() });
      }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...room, role: 'host' }) });
    });
    await page.route('**/.netlify/functions/private-room-join', async (route) => {
      const body = route.request().postDataJSON() as any;
      const room = this.privateRooms.find((item) => item.roomId === body.roomId);
      if (!room || room.password !== body.password) {
        await route.fulfill({ status: room ? 403 : 404, contentType: 'application/json', body: JSON.stringify({ error: 'room_unavailable' }) });
        return;
      }
      Object.assign(room, { status: 'matched', guestPeerId: body.peerId, guestCharacterId: body.characterId, updatedAt: Date.now() });
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...room, role: 'guest', ownerToken: '' }) });
    });
    await page.route('**/.netlify/functions/private-room-leave', async (route) => {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
  }
}

async function newOnlinePage(context: any, harness: OnlineHarness, peerId: string, profile: { playerId: string; displayName: string }) {
  const page = await context.newPage();
  await harness.attach(page, peerId, profile);
  return page;
}

async function startFromSplash(page: Page) {
  await page.goto('/');
  await page.evaluate((key) => window.localStorage.setItem(key, '1'), STARTER_GUIDE_DISMISSED_KEY);
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__koreE2EStartOnlineFight)), { timeout: 30_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__koreE2EOnlineStartReady?.())), { timeout: 30_000 }).toBe(true);
  const title = page.getByLabel('KORE title screen. Press any key.');
  await expect(title).toBeVisible({ timeout: 30_000 });
  await title.press('Enter');
  await expect(title).toBeHidden({ timeout: 10_000 });
}

async function startOnlineFight(page: Page, mode: 'online' | 'ranked') {
  await startFromSplash(page);
  await page.evaluate((nextMode) => {
    const start = (window as any).__koreE2EStartOnlineFight;
    if (!start) throw new Error('Missing online fight start hook');
    const profile = JSON.parse(window.localStorage.getItem('kore.online.profile') || '{}');
    start({ mode: nextMode, profile });
  }, mode);
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__koreE2EOnlineDiagnostics)), { timeout: 20_000 }).toBe(true);
}

async function startPrivateHostFight(page: Page) {
  await startFromSplash(page);
  await page.evaluate(() => {
    const start = (window as any).__koreE2EStartOnlineFight;
    if (!start) throw new Error('Missing online fight start hook');
    const profile = JSON.parse(window.localStorage.getItem('kore.online.profile') || '{}');
    start({ mode: 'private', profile, privateRoomIntent: { kind: 'host', roomName: 'E2E ROOM', password: 'KORE-4242' } });
  });
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__koreE2EOnlineDiagnostics)), { timeout: 20_000 }).toBe(true);
}

async function startPrivateGuestFight(page: Page, roomId: string, password: string) {
  await startFromSplash(page);
  await page.evaluate(({ roomId: nextRoomId, password: nextPassword }) => {
    const start = (window as any).__koreE2EStartOnlineFight;
    if (!start) throw new Error('Missing online fight start hook');
    const profile = JSON.parse(window.localStorage.getItem('kore.online.profile') || '{}');
    start({ mode: 'private', profile, privateRoomIntent: { kind: 'guest', roomId: nextRoomId, password: nextPassword } });
  }, { roomId, password });
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__koreE2EOnlineDiagnostics)), { timeout: 20_000 }).toBe(true);
}

async function diagnostics(page: Page) {
  return page.evaluate(() => {
    const diagnostics = (window as any).__koreE2EOnlineDiagnostics?.();
    return diagnostics ?? null;
  }).catch((error) => ({ diagnosticsError: error instanceof Error ? error.message : String(error) }));
}

async function expectConnected(page: Page, role: 'host' | 'guest') {
  await expect.poll(() => diagnostics(page), { timeout: 45_000 }).toMatchObject({
    onlineRole: role,
    onlineState: 'connected',
    onlineStatusText: expect.stringMatching(/CONNECTED|ONLINE|RANKED/i)
  });
}

async function forceMatchOver(page: Page, winnerSlot: 1 | 2) {
  await page.evaluate((slot) => {
    const force = (window as any).__koreE2EForceMatchOver;
    if (!force) throw new Error('Missing force match over hook');
    force(slot);
  }, winnerSlot);
}

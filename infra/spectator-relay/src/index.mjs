const PROTOCOL = 1;
const MAX_MESSAGE_BYTES = 512 * 1024;
const RETENTION_FRAMES = 60 * 30;
const PUBLISHER_TIMEOUT_MS = 5_000;
const MAX_VIEWERS_PER_IP = 8;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return corsResponse(request, env, null, 204);
    if (!originAllowed(request, env)) return new Response('Forbidden origin', { status: 403 });
    const directoryMatch = url.pathname.match(/^\/v1\/tournaments\/([^/]+)\/directory$/);
    if (directoryMatch) {
      const tournamentId = cleanId(decodeURIComponent(directoryMatch[1]));
      if (!tournamentId) return new Response('Bad tournament id', { status: 400 });
      const stub = env.TOURNAMENT_DIRECTORY.getByName(tournamentId);
      const forwarded = new Request(request);
      forwarded.headers.set('x-kore-tournament-id', tournamentId);
      return corsResponse(request, env, await stub.fetch(forwarded));
    }
    const matchRoute = url.pathname.match(/^\/v1\/tournaments\/([^/]+)\/matches\/([^/]+)$/);
    if (matchRoute) {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 });
      const tournamentId = cleanId(decodeURIComponent(matchRoute[1]));
      const matchId = cleanId(decodeURIComponent(matchRoute[2]));
      if (!tournamentId || !matchId) return new Response('Bad match id', { status: 400 });
      const forwarded = new Request(request);
      forwarded.headers.set('x-kore-tournament-id', tournamentId);
      forwarded.headers.set('x-kore-match-id', matchId);
      forwarded.headers.set('x-kore-client-ip', request.headers.get('CF-Connecting-IP') || 'unknown');
      if (url.searchParams.get('loadTestToken') && url.searchParams.get('loadTestToken') === env.LOAD_TEST_TOKEN) forwarded.headers.set('x-kore-load-test', 'true');
      return env.MATCH_STREAM.getByName(`${tournamentId}:${matchId}`).fetch(forwarded);
    }
    if (url.pathname === '/v1/custom/rooms' && request.method === 'POST') {
      return corsResponse(request, env, await forwardCustomDirectory(request, env, 'create'));
    }
    if (url.pathname === '/v1/custom/auto-join' && request.method === 'POST') {
      return corsResponse(request, env, await forwardCustomDirectory(request, env, 'auto-join'));
    }
    if (url.pathname === '/v1/custom/friends' && request.method === 'POST') {
      return corsResponse(request, env, await forwardCustomDirectory(request, env, 'friends'));
    }
    const customRoomRoute = url.pathname.match(/^\/v1\/custom\/rooms\/([^/]+)(?:\/(join|commands|leave|ws))?$/);
    if (customRoomRoute) {
      const roomId = cleanId(decodeURIComponent(customRoomRoute[1]));
      if (!roomId) return new Response('Bad room id', { status: 400 });
      const forwarded = new Request(request);
      forwarded.headers.set('x-kore-custom-room-id', roomId);
      forwarded.headers.set('x-kore-custom-action', customRoomRoute[2] || 'read');
      return corsResponse(request, env, await env.CUSTOM_ROOM.getByName(roomId).fetch(forwarded));
    }
    const customMatchRoute = url.pathname.match(/^\/v1\/custom\/rooms\/([^/]+)\/matches\/([^/]+)$/);
    if (customMatchRoute) {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 });
      const roomId = cleanId(decodeURIComponent(customMatchRoute[1]));
      const matchId = cleanId(decodeURIComponent(customMatchRoute[2]));
      if (!roomId || !matchId) return new Response('Bad match id', { status: 400 });
      const forwarded = new Request(request);
      forwarded.headers.set('x-kore-tournament-id', `custom:${roomId}`);
      forwarded.headers.set('x-kore-match-id', matchId);
      forwarded.headers.set('x-kore-client-ip', request.headers.get('CF-Connecting-IP') || 'unknown');
      return env.MATCH_STREAM.getByName(`custom:${roomId}:${matchId}`).fetch(forwarded);
    }
    if (url.pathname === '/health') return Response.json({ ok: true, protocol: PROTOCOL });
    return new Response('Not found', { status: 404 });
  }
};

async function forwardCustomDirectory(request, env, action) {
  const forwarded = new Request(request);
  forwarded.headers.set('x-kore-custom-action', action);
  return env.CUSTOM_DIRECTORY.getByName('global').fetch(forwarded);
}

export class CustomRoomDirectory {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async fetch(request) {
    const action = request.headers.get('x-kore-custom-action');
    if (action === 'room-update') {
      const summary = await request.json();
      if (!summary?.roomId) return new Response('Bad room summary', { status: 400 });
      if (summary.closed) await this.ctx.storage.delete(`room:${summary.roomId}`);
      else await this.ctx.storage.put(`room:${summary.roomId}`, summary);
      return Response.json({ ok: true });
    }
    if (action === 'friend-check') {
      const playerId = cleanPlayerId(request.headers.get('x-kore-player-id'));
      const friendPlayerId = cleanPlayerId(request.headers.get('x-kore-friend-player-id'));
      const friends = await this.ctx.storage.get(`friends:${playerId}`) || [];
      return Response.json({ allowed: friends.includes(friendPlayerId) });
    }
    const body = await request.json().catch(() => ({}));
    const identity = await verifyCustomIdentityToken(body.identityToken, this.env.SPECTATOR_TOKEN_SECRET);
    if (!identity) return Response.json({ error: 'identity_required', message: 'Refresh your online profile before entering Custom' }, { status: 401 });
    if (action === 'create') {
      const profile = cleanCustomProfile(body.profile);
      const appVersion = cleanId(body.appVersion);
      if (!profile || profile.playerId !== identity.playerId || !appVersion) return Response.json({ error: 'missing_fields' }, { status: 400 });
      const roomId = crypto.randomUUID();
      const forwarded = new Request('https://internal/create', { method: 'POST', headers: { 'content-type': 'application/json', 'x-kore-custom-room-id': roomId, 'x-kore-custom-action': 'create' }, body: JSON.stringify({ ...body, profile, appVersion }) });
      return this.env.CUSTOM_ROOM.getByName(roomId).fetch(forwarded);
    }
    const summaries = await this.readRooms();
    if (action === 'auto-join') {
      const profile = cleanCustomProfile(body.profile);
      const appVersion = cleanId(body.appVersion);
      const room = summaries.filter((candidate) => candidate.visibility === 'public' && candidate.appVersion === appVersion && candidate.memberCount < 8)
        .sort((a, b) => b.memberCount - a.memberCount || a.createdAt - b.createdAt)[0];
      if (!room || !profile || profile.playerId !== identity.playerId) return Response.json(null);
      const forwarded = new Request('https://internal/join', { method: 'POST', headers: { 'content-type': 'application/json', 'x-kore-custom-room-id': room.roomId, 'x-kore-custom-action': 'join' }, body: JSON.stringify({ profile, appVersion }) });
      return this.env.CUSTOM_ROOM.getByName(room.roomId).fetch(forwarded);
    }
    if (action === 'friends') {
      const syncedFriends = Array.isArray(body.friendPlayerIds) ? [...new Set(body.friendPlayerIds.map(cleanPlayerId).filter(Boolean))].slice(0, 250) : [];
      await this.ctx.storage.put(`friends:${identity.playerId}`, syncedFriends);
      const wanted = new Set(syncedFriends);
      const rooms = summaries.filter((room) => room.appVersion === cleanId(body.appVersion) && room.memberCount < 8 && room.memberPlayerIds?.some((id) => wanted.has(id))).map((room) => ({ ...publicCustomSummary(room), friendPlayerId: room.memberPlayerIds.find((id) => wanted.has(id)) }));
      return Response.json({ rooms });
    }
    return new Response('Unknown directory action', { status: 404 });
  }

  async readRooms() {
    const rows = await this.ctx.storage.list({ prefix: 'room:' });
    return [...rows.values()].filter((room) => room && Date.now() - room.updatedAt < 120_000);
  }
}

export class CustomRoom {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async fetch(request) {
    const roomId = cleanId(request.headers.get('x-kore-custom-room-id'));
    const action = request.headers.get('x-kore-custom-action');
    if (action === 'create') return this.create(roomId, await request.json().catch(() => ({})));
    if (action === 'join') return this.join(await request.json().catch(() => ({})));
    if (action === 'ws') return this.websocket(request);
    if (action === 'stream-auth') return this.streamAuth(request);
    const body = request.method === 'GET' ? {} : await request.json().catch(() => ({}));
    const memberToken = request.method === 'GET' ? new URL(request.url).searchParams.get('memberToken') : body.memberToken;
    const session = await this.session(memberToken);
    if (!session) return Response.json({ error: 'session_expired', message: 'Room session expired' }, { status: 401 });
    if (action === 'read') return this.roomResponse();
    if (action === 'commands') return this.command(session.playerId, body.command);
    if (action === 'leave') return this.leave(session.playerId, memberToken);
    return new Response('Unknown room action', { status: 404 });
  }

  async create(roomId, body) {
    if (await this.ctx.storage.get('room')) return Response.json({ error: 'room_exists' }, { status: 409 });
    const profile = cleanCustomProfile(body.profile);
    if (!profile) return Response.json({ error: 'missing_profile' }, { status: 400 });
    const now = Date.now();
    const stationCount = customStationCount(body.stationCount);
    const room = {
      protocol: 1, roomId, roomName: cleanCustomRoomName(body.roomName || `${profile.displayName} ROOM`), visibility: body.visibility === 'public' ? 'public' : 'private',
      hostPlayerId: profile.playerId, capacity: 8, stationCount, rules: customRules(body.rules), appVersion: cleanId(body.appVersion), seed: `${roomId}:${crypto.randomUUID()}`,
      members: [{ ...profile, joinedAt: now, connected: true }], stations: makeCustomStations(stationCount), chat: [customSystem(`${profile.displayName} created the room`, now)],
      kickedPlayerIds: [], createdAt: now, updatedAt: now
    };
    const memberToken = crypto.randomUUID();
    const ownerToken = crypto.randomUUID();
    await this.ctx.storage.put({ room, [`session:${memberToken}`]: { playerId: profile.playerId, ownerToken } });
    await this.notifyDirectory(room);
    return Response.json({ room: publicCustomRoom(room), memberToken, ownerToken });
  }

  async join(body) {
    const room = await this.ctx.storage.get('room');
    const profile = cleanCustomProfile(body.profile);
    const identity = await verifyCustomIdentityToken(body.identityToken, this.env.SPECTATOR_TOKEN_SECRET);
    if (!room || !profile || !identity || identity.playerId !== profile.playerId || room.appVersion !== cleanId(body.appVersion)) return Response.json({ error: 'room_unavailable', message: 'Room unavailable, identity expired, or update required' }, { status: 409 });
    if (room.kickedPlayerIds.includes(profile.playerId)) return Response.json({ error: 'room_unavailable' }, { status: 403 });
    if (room.visibility === 'private' && !cleanPlayerId(body.friendPlayerId)) return Response.json({ error: 'friend_required', message: 'Join this room through a friend' }, { status: 403 });
    if (room.visibility === 'private') {
      const friendPlayerId = cleanPlayerId(body.friendPlayerId);
      const friendRequest = new Request('https://internal/friend-check', { headers: { 'x-kore-custom-action': 'friend-check', 'x-kore-player-id': profile.playerId, 'x-kore-friend-player-id': friendPlayerId } });
      const friendCheck = await this.env.CUSTOM_DIRECTORY.getByName('global').fetch(friendRequest).then((response) => response.json()).catch(() => ({ allowed: false }));
      if (!friendCheck.allowed) return Response.json({ error: 'friend_required', message: 'That player is not in your synced friend list' }, { status: 403 });
      if (!room.members.some((member) => member.playerId === friendPlayerId)) return Response.json({ error: 'friend_left', message: 'Friend is no longer in this room' }, { status: 409 });
    }
    const existing = room.members.find((member) => member.playerId === profile.playerId);
    if (!existing && room.members.length >= 8) return Response.json({ error: 'room_full', message: 'Room is full' }, { status: 409 });
    room.members = existing ? room.members.map((member) => member.playerId === profile.playerId ? { ...member, connected: true, disconnectedAt: undefined } : member) : [...room.members, { ...profile, joinedAt: Date.now(), connected: true }];
    if (!existing) room.chat.push(customSystem(`${profile.displayName} joined`, Date.now()));
    room.updatedAt = Date.now();
    const memberToken = crypto.randomUUID();
    await this.ctx.storage.put('room', room);
    await this.ctx.storage.put(`session:${memberToken}`, { playerId: profile.playerId });
    await this.notifyDirectory(room);
    this.broadcast(room);
    return Response.json({ room: publicCustomRoom(room), memberToken });
  }

  async websocket(request) {
    const memberToken = new URL(request.url).searchParams.get('memberToken');
    const session = await this.session(memberToken);
    if (!session) return new Response('Room session expired', { status: 401 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, ['custom-room']);
    server.serializeAttachment({ playerId: session.playerId, memberToken });
    const room = await this.ctx.storage.get('room');
    if (room) server.send(JSON.stringify({ type: 'snapshot', room: publicCustomRoom(room) }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async streamAuth(request) {
    const session = await this.session(request.headers.get('x-kore-member-token'));
    const room = await this.ctx.storage.get('room');
    const matchId = cleanId(request.headers.get('x-kore-match-id'));
    if (!session || !room) return new Response('Forbidden', { status: 403 });
    const station = room.stations.find((candidate) => candidate.match?.id === matchId);
    const member = room.members.find((candidate) => candidate.playerId === session.playerId);
    if (!station || !member || member.stationId !== station.id) return new Response('Forbidden', { status: 403 });
    const slot = station.match.fighterPlayerIds.indexOf(session.playerId);
    if (request.headers.get('x-kore-publisher') === '1' && slot < 0) return new Response('Forbidden', { status: 403 });
    return Response.json({ role: slot === 1 ? 'standby' : 'primary', entryId: session.playerId });
  }

  async webSocketMessage(socket, raw) {
    let message;
    try { message = JSON.parse(String(raw)); } catch { return; }
    const attachment = socket.deserializeAttachment() || {};
    if (message?.type === 'command') {
      const response = await this.command(attachment.playerId, message.command);
      if (!response.ok) safeSend(socket, JSON.stringify({ type: 'error', message: await response.text() }));
    }
  }

  async webSocketClose(socket) {
    const attachment = socket.deserializeAttachment() || {};
    const room = await this.ctx.storage.get('room');
    if (room && attachment.playerId) {
      room.members = room.members.map((member) => member.playerId === attachment.playerId ? { ...member, connected: false, disconnectedAt: Date.now() } : member);
      room.updatedAt = Date.now();
      await this.ctx.storage.put('room', room);
      await this.ctx.storage.setAlarm(Date.now() + 30_000);
      this.broadcast(room);
    }
    safeClose(socket, 1000, 'Disconnected');
  }
  webSocketError(socket) { safeClose(socket, 1011, 'Room error'); }

  async alarm() {
    let room = await this.ctx.storage.get('room');
    if (!room) return;
    const now = Date.now();
    for (const station of room.stations) {
      if (station.phase === 'characterSelect' && station.match && now >= station.match.selectionDeadline) {
        station.readyQueue = station.readyQueue.filter((id) => !station.fighters?.includes(id));
        station.phase = 'idle'; delete station.fighters; delete station.match; customNormalizeSlots(station);
        room.chat.push(customSystem(`${station.label} character selection timed out`, now));
      } else if (station.phase === 'stageSelect' && station.match?.stageDeadline && now >= station.match.stageDeadline && station.match.stagePool?.length) {
        station.match.stageChoices ||= [null, null];
        for (let slot = 0; slot < 2; slot += 1) if (!station.match.stageChoices[slot]) { station.match.stageChoices[slot] = { kind: 'random' }; station.match.stageLocked[slot] = true; }
        const pool = station.match.stagePool;
        const candidates = station.match.stageChoices.map((item, index) => item.kind === 'stage' ? item.stageId : pool[customHash(`${room.seed}:${station.match.id}:candidate:${index + 1}`) % pool.length]);
        station.match.stageCandidates = candidates; station.match.stageId = candidates[0] === candidates[1] ? candidates[0] : candidates[customHash(`${room.seed}:${station.match.id}:final`) % 2]; station.phase = 'loading';
      }
    }
    const expired = room.members.filter((member) => !member.connected && member.disconnectedAt && Date.now() - member.disconnectedAt >= 30_000).map((member) => member.playerId);
    for (const playerId of expired) room = removeCustomMember(room, playerId);
    if (!room?.members.length) {
      await this.ctx.storage.deleteAll();
      await this.notifyDirectory({ roomId: room?.roomId, closed: true });
      return;
    }
    await this.ctx.storage.put('room', room);
    await this.scheduleAlarm(room);
    await this.notifyDirectory(room);
    this.broadcast(room);
  }

  async command(playerId, command) {
    let room = await this.ctx.storage.get('room');
    if (!room || !room.members.some((member) => member.playerId === playerId)) return Response.json({ error: 'room_closed' }, { status: 404 });
    try { room = applyCustomCommand(room, playerId, command, Date.now()); }
    catch (error) { return Response.json({ error: 'command_rejected', message: error instanceof Error ? error.message : String(error) }, { status: 409 }); }
    await this.ctx.storage.put('room', room);
    await this.scheduleAlarm(room);
    await this.notifyDirectory(room);
    this.broadcast(room);
    return Response.json({ room: publicCustomRoom(room) });
  }

  async leave(playerId, memberToken) {
    const room = removeCustomMember(await this.ctx.storage.get('room'), playerId);
    await this.ctx.storage.delete(`session:${memberToken}`);
    if (!room?.members.length) {
      await this.ctx.storage.deleteAll();
      await this.notifyDirectory({ roomId: room?.roomId, closed: true });
    } else {
      await this.ctx.storage.put('room', room);
      await this.notifyDirectory(room);
      this.broadcast(room);
    }
    return Response.json({ ok: true });
  }

  session(token) { return typeof token === 'string' ? this.ctx.storage.get(`session:${token}`) : null; }
  async scheduleAlarm(room) {
    const deadlines = room.stations.flatMap((station) => [station.match?.selectionDeadline, station.match?.stageDeadline]).filter((value) => Number.isFinite(value) && value > Date.now());
    const disconnects = room.members.filter((member) => !member.connected && member.disconnectedAt).map((member) => member.disconnectedAt + 30_000);
    const next = [...deadlines, ...disconnects].sort((a, b) => a - b)[0];
    if (next) await this.ctx.storage.setAlarm(next);
  }
  async roomResponse() { const room = await this.ctx.storage.get('room'); return room ? Response.json({ room: publicCustomRoom(room) }) : Response.json({ error: 'room_closed' }, { status: 404 }); }
  broadcast(room) { const payload = JSON.stringify({ type: 'snapshot', room: publicCustomRoom(room) }); for (const socket of this.ctx.getWebSockets('custom-room')) safeSend(socket, payload); }
  async notifyDirectory(room) {
    const summary = room?.closed ? room : customDirectorySummary(room);
    if (!summary?.roomId) return;
    const request = new Request('https://internal/custom-directory', { method: 'POST', headers: { 'content-type': 'application/json', 'x-kore-custom-action': 'room-update' }, body: JSON.stringify(summary) });
    await this.env.CUSTOM_DIRECTORY.getByName('global').fetch(request);
  }
}

function applyCustomCommand(room, playerId, command, now) {
  if (!command || typeof command.type !== 'string') throw new Error('Invalid command');
  const member = room.members.find((candidate) => candidate.playerId === playerId);
  if (!member) throw new Error('Member not found');
  if (command.type === 'heartbeat') {
    room.members = room.members.map((candidate) => candidate.playerId === playerId ? { ...candidate, connected: true, disconnectedAt: undefined, peerId: cleanId(command.peerId) || candidate.peerId } : candidate);
    room.updatedAt = now; return room;
  }
  if (command.type === 'updateRoom') {
    if (room.hostPlayerId !== playerId) throw new Error('Only the host can do that');
    const nextCount = command.stationCount === undefined ? room.stationCount : customStationCount(command.stationCount);
    if (nextCount < room.stationCount && room.stations.slice(nextCount).some((station) => station.memberPlayerIds.length || station.phase !== 'idle')) throw new Error('Empty higher stations before removing them');
    if (nextCount > room.stationCount) room.stations.push(...makeCustomStations(nextCount).slice(room.stationCount));
    else room.stations = room.stations.slice(0, nextCount);
    room.stationCount = nextCount;
    if (command.roomName !== undefined) room.roomName = cleanCustomRoomName(command.roomName);
    if (command.visibility === 'public' || command.visibility === 'private') room.visibility = command.visibility;
    if (command.rules) room.rules = customRules({ ...room.rules, ...command.rules });
  } else if (command.type === 'joinStation') {
    if (member.stationId) room = customLeaveStation(room, playerId, false);
    const station = customStation(room, command.stationId);
    station.memberPlayerIds.push(playerId);
    member.stationId = station.id;
    room.chat.push(customSystem(`${member.displayName} joined ${station.label}`, now));
  } else if (command.type === 'leaveStation') {
    room = customLeaveStation(room, playerId, false);
  } else if (command.type === 'setReady') {
    const station = customStation(room, member.stationId);
    if (station.phase !== 'idle') throw new Error('The station is already starting');
    station.readyQueue = command.ready ? [...new Set([...station.readyQueue, playerId])] : station.readyQueue.filter((id) => id !== playerId);
    if (!command.ready && station.championPlayerId === playerId) delete station.championPlayerId;
    customNormalizeSlots(station);
  } else if (command.type === 'startMatch') {
    const station = customStation(room, command.stationId);
    customNormalizeSlots(station);
    if (station.phase !== 'idle' || !station.fighters?.includes(playerId)) throw new Error('Only an assigned fighter can start');
    station.phase = 'characterSelect';
    station.match = { id: `${room.roomId}:${station.id}:${now.toString(36)}`, fighterPlayerIds: [...station.fighters], characterLocked: [false, false], stageLocked: [false, false], rules: { ...room.rules }, createdAt: now, selectionDeadline: now + 60_000, resultReports: {} };
  } else if (command.type === 'lockCharacter') {
    const station = customStation(room, command.stationId); const match = station.match;
    if (station.phase !== 'characterSelect' || !match) throw new Error('Character selection is closed');
    const slot = match.fighterPlayerIds.indexOf(playerId); if (slot < 0) throw new Error('Only fighters select characters');
    match.characterIds ||= ['', '']; match.characterIds[slot] = cleanId(command.characterId); match.characterLocked[slot] = Boolean(match.characterIds[slot]);
    if (match.characterLocked.every(Boolean)) { station.phase = 'stageSelect'; match.stageDeadline = now + 45_000; }
  } else if (command.type === 'lockStage') {
    const station = customStation(room, command.stationId); const match = station.match;
    if (station.phase !== 'stageSelect' || !match) throw new Error('Stage selection is closed');
    const slot = match.fighterPlayerIds.indexOf(playerId); if (slot < 0) throw new Error('Only fighters select stages');
    const pool = [...new Set((Array.isArray(command.stagePool) ? command.stagePool : []).map(cleanId).filter(Boolean))].sort();
    if (!pool.length) throw new Error('No compatible stages');
    const poolHash = customHash(pool.join('|')).toString(36);
    if (match.stagePoolHash && match.stagePoolHash !== poolHash) throw new Error('Stage pools do not match');
    const choice = command.choice?.kind === 'stage' ? { kind: 'stage', stageId: cleanId(command.choice.stageId) } : { kind: 'random' };
    if (choice.kind === 'stage' && !pool.includes(choice.stageId)) throw new Error('Stage is unavailable');
    match.stageChoices ||= [null, null]; match.stageChoices[slot] = choice; match.stageLocked[slot] = true; match.stagePoolHash = poolHash; match.stagePool = pool;
    if (match.stageLocked.every(Boolean)) {
      const candidates = match.stageChoices.map((item, index) => item.kind === 'stage' ? item.stageId : pool[customHash(`${room.seed}:${match.id}:candidate:${index + 1}`) % pool.length]);
      match.stageCandidates = candidates; match.stageId = candidates[0] === candidates[1] ? candidates[0] : candidates[customHash(`${room.seed}:${match.id}:final`) % 2];
      station.phase = 'loading';
    }
  } else if (command.type === 'setMatchLoading' || command.type === 'setMatchLive') {
    const station = customStation(room, command.stationId);
    if (!station.fighters?.includes(playerId)) throw new Error('Only fighters can advance the match');
    if (command.type === 'setMatchLive' && (!station.match?.stageId || station.phase !== 'loading')) throw new Error('Match is not loaded');
    station.phase = command.type === 'setMatchLive' ? 'live' : 'loading';
  } else if (command.type === 'reportResult') {
    const station = customStation(room, command.stationId); const match = station.match; const winner = cleanPlayerId(command.winnerPlayerId);
    if (!match || !match.fighterPlayerIds.includes(playerId) || !match.fighterPlayerIds.includes(winner)) throw new Error('Invalid result');
    match.resultReports[playerId] = winner; station.phase = 'results';
    const reports = match.fighterPlayerIds.map((id) => match.resultReports[id]).filter(Boolean);
    if (reports.length === 2) {
      const agreed = reports[0] === reports[1] ? reports[0] : null; const loser = agreed ? match.fighterPlayerIds.find((id) => id !== agreed) : null;
      station.phase = 'idle'; station.championPlayerId = agreed || undefined; station.readyQueue = station.readyQueue.filter((id) => id !== loser); delete station.match; delete station.fighters; customNormalizeSlots(station);
      room.chat.push(customSystem(agreed ? `${customMemberName(room, agreed)} wins on ${station.label}` : `${station.label} result conflicted`, now));
    }
  } else if (command.type === 'stepDown') {
    const station = customStation(room, command.stationId);
    if (station.phase !== 'idle' || station.championPlayerId !== playerId) throw new Error('Only the waiting champion can step down');
    delete station.championPlayerId; station.readyQueue = station.readyQueue.filter((id) => id !== playerId); customNormalizeSlots(station);
  } else if (command.type === 'sendChat') {
    const text = cleanCustomChat(command.text); if (!text) throw new Error('Enter a message');
    const last = [...room.chat].reverse().find((message) => message.playerId === playerId); if (last && now - last.sentAt < 1000) throw new Error('Please wait before sending another message');
    room.chat.push({ id: crypto.randomUUID(), kind: 'chat', playerId, displayName: member.displayName, text, sentAt: now });
  } else if (command.type === 'kickMember') {
    if (room.hostPlayerId !== playerId) throw new Error('Only the host can do that');
    const target = cleanPlayerId(command.playerId); if (!target || target === playerId) throw new Error('Host cannot kick themselves');
    room = removeCustomMember(room, target); room.kickedPlayerIds = [...new Set([...room.kickedPlayerIds, target])];
  } else throw new Error('Unknown command');
  room.chat = room.chat.slice(-100); room.updatedAt = now; return room;
}

function customLeaveStation(room, playerId, force) {
  const member = room.members.find((candidate) => candidate.playerId === playerId); if (!member?.stationId) return room;
  const station = customStation(room, member.stationId);
  if (!force && station.fighters?.includes(playerId) && !['idle', 'results'].includes(station.phase)) throw new Error('Active fighters cannot switch stations');
  station.memberPlayerIds = station.memberPlayerIds.filter((id) => id !== playerId); station.readyQueue = station.readyQueue.filter((id) => id !== playerId);
  if (station.championPlayerId === playerId) delete station.championPlayerId;
  if (station.fighters?.includes(playerId)) { station.phase = 'idle'; delete station.fighters; delete station.match; }
  delete member.stationId; customNormalizeSlots(station); return room;
}

function removeCustomMember(room, playerId) {
  if (!room) return room; const member = room.members.find((candidate) => candidate.playerId === playerId); if (!member) return room;
  room = customLeaveStation(room, playerId, true); room.members = room.members.filter((candidate) => candidate.playerId !== playerId);
  if (room.hostPlayerId === playerId && room.members.length) room.hostPlayerId = [...room.members].sort((a, b) => a.joinedAt - b.joinedAt)[0].playerId;
  room.updatedAt = Date.now(); return room;
}

function customNormalizeSlots(station) {
  station.readyQueue = station.readyQueue.filter((id) => station.memberPlayerIds.includes(id));
  if (station.championPlayerId && !station.readyQueue.includes(station.championPlayerId)) delete station.championPlayerId;
  const challenger = station.readyQueue.find((id) => id !== station.championPlayerId);
  if (station.championPlayerId && challenger) station.fighters = [station.championPlayerId, challenger];
  else if (station.readyQueue.length >= 2) station.fighters = station.readyQueue.slice(0, 2);
  else delete station.fighters;
}

function publicCustomRoom(room) {
  return { ...room, stations: room.stations.map((station) => !station.match ? station : { ...station, match: (({ stageChoices: _choices, stagePool: _pool, ...match }) => match)(station.match) }) };
}
function customDirectorySummary(room) { return { roomId: room.roomId, roomName: room.roomName, visibility: room.visibility, hostPlayerId: room.hostPlayerId, capacity: 8, stationCount: room.stationCount, appVersion: room.appVersion, memberCount: room.members.length, memberPlayerIds: room.members.map((member) => member.playerId), liveStationCount: room.stations.filter((station) => station.phase === 'live').length, createdAt: room.createdAt, updatedAt: room.updatedAt }; }
function publicCustomSummary(room) { const { memberPlayerIds: _members, createdAt: _created, ...summary } = room; return summary; }
function cleanCustomProfile(value) { const playerId = cleanPlayerId(value?.playerId); const displayName = typeof value?.displayName === 'string' ? value.displayName.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12) : ''; return playerId && displayName ? { playerId, displayName } : null; }
function cleanPlayerId(value) { return typeof value === 'string' ? value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 96) : ''; }
function cleanCustomRoomName(value) { return typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18) || 'CUSTOM ROOM' : 'CUSTOM ROOM'; }
function cleanCustomChat(value) { return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) : ''; }
function customRules(value) { const rounds = [1, 2, 3, 5].includes(Number(value?.roundsToWin)) ? Number(value.roundsToWin) : 3; const timer = [30, 45, 60, 90, 99].includes(Number(value?.roundTimer)) ? Number(value.roundTimer) : 60; return { roundsToWin: rounds, roundTimer: timer }; }
function customStationCount(value) { return Math.max(1, Math.min(4, Math.round(Number(value) || 1))); }
function makeCustomStations(count) { return Array.from({ length: count }, (_, index) => ({ id: `station-${index + 1}`, label: String.fromCharCode(65 + index), phase: 'idle', memberPlayerIds: [], readyQueue: [] })); }
function customStation(room, stationId) { const station = room.stations.find((candidate) => candidate.id === cleanId(stationId)); if (!station) throw new Error('Station not found'); return station; }
function customMemberName(room, playerId) { return room.members.find((member) => member.playerId === playerId)?.displayName || 'PLAYER'; }
function customSystem(text, sentAt) { return { id: crypto.randomUUID(), kind: 'system', text: cleanCustomChat(text), sentAt }; }
function customHash(value) { let hash = 2166136261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); } return hash >>> 0; }

export class TournamentDirectory {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(request) {
    const tournamentId = cleanId(request.headers.get('x-kore-tournament-id'));
    if (request.method === 'POST') {
      const summary = await request.json();
      if (!validSummary(summary) || summary.tournamentId !== tournamentId) return new Response('Bad summary', { status: 400 });
      await this.ctx.storage.put(`stream:${summary.matchId}`, summary);
      this.broadcast({ type: 'directoryUpdate', protocol: PROTOCOL, stream: summary });
      return Response.json({ ok: true });
    }
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server, ['directory']);
      server.serializeAttachment({ kind: 'directory', tournamentId });
      server.send(JSON.stringify({ type: 'directorySnapshot', protocol: PROTOCOL, streams: await this.readStreams() }));
      return new Response(null, { status: 101, webSocket: client });
    }
    return Response.json({ streams: await this.readStreams() });
  }

  async readStreams() {
    const rows = await this.ctx.storage.list({ prefix: 'stream:' });
    return [...rows.values()];
  }

  broadcast(message) {
    const payload = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets('directory')) safeSend(socket, payload);
  }

  webSocketMessage() {}
  webSocketClose(socket, code, reason) { safeClose(socket, code, reason); }
  webSocketError(socket) { safeClose(socket, 1011, 'Directory error'); }
}

export class MatchStream {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.snapshots = [];
    this.inputs = [];
    this.latestConfirmedFrame = -1;
    this.lastPublisherAt = 0;
    this.activeRole = null;
    this.tournamentId = '';
    this.matchId = '';
  }

  async fetch(request) {
    this.tournamentId = cleanId(request.headers.get('x-kore-tournament-id'));
    this.matchId = cleanId(request.headers.get('x-kore-match-id'));
    const url = new URL(request.url);
    const publisherToken = url.searchParams.get('publisherToken');
    const customRoomId = this.tournamentId.startsWith('custom:') ? this.tournamentId.slice(7) : '';
    const customMemberToken = url.searchParams.get('memberToken');
    const customPublisher = url.searchParams.get('publisher') === '1';
    let customAuth = null;
    if (customRoomId) {
      const authRequest = new Request('https://internal/stream-auth', {
        method: 'POST',
        headers: {
          'x-kore-custom-room-id': customRoomId,
          'x-kore-custom-action': 'stream-auth',
          'x-kore-member-token': customMemberToken || '',
          'x-kore-match-id': this.matchId,
          'x-kore-publisher': customPublisher ? '1' : '0'
        }
      });
      const response = await this.env.CUSTOM_ROOM.getByName(customRoomId).fetch(authRequest);
      if (!response.ok) return new Response('Custom stream forbidden', { status: 403 });
      customAuth = await response.json();
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    if (publisherToken || (customAuth && customPublisher)) {
      const claims = customAuth || await verifyToken(publisherToken, this.env.SPECTATOR_TOKEN_SECRET);
      if (!claims || (!customAuth && (claims.tournamentId !== this.tournamentId || claims.matchId !== this.matchId))) return new Response('Invalid publisher token', { status: 401 });
      const tag = claims.role === 'primary' ? 'publisher-primary' : 'publisher-standby';
      this.ctx.acceptWebSocket(server, ['publisher', tag]);
      server.serializeAttachment({ kind: 'publisher', role: claims.role, entryId: claims.entryId, authenticated: false });
    } else {
      const ip = request.headers.get('x-kore-client-ip') || 'unknown';
      const sameIp = this.ctx.getWebSockets('viewer').filter((socket) => socket.deserializeAttachment()?.ip === ip).length;
      if (request.headers.get('x-kore-load-test') !== 'true' && sameIp >= MAX_VIEWERS_PER_IP) return new Response('Too many connections', { status: 429 });
      this.ctx.acceptWebSocket(server, ['viewer']);
      server.serializeAttachment({ kind: 'viewer', ip });
      const bootstrap = this.makeBootstrap();
      if (bootstrap) server.send(JSON.stringify(bootstrap));
      server.send(JSON.stringify(this.streamStateMessage()));
      this.broadcastViewerCount();
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket, raw) {
    if (typeof raw !== 'string' || byteLength(raw) > MAX_MESSAGE_BYTES) return safeClose(socket, 1009, 'Message too large');
    let message;
    try { message = JSON.parse(raw); } catch { return safeClose(socket, 1003, 'Invalid JSON'); }
    const attachment = socket.deserializeAttachment() || {};
    if (attachment.kind === 'viewer') {
      if (message?.type === 'resyncRequest' && message.protocol === PROTOCOL) {
        const bootstrap = this.makeBootstrap();
        if (bootstrap) safeSend(socket, JSON.stringify(bootstrap));
      }
      return;
    }
    if (attachment.kind !== 'publisher') return safeClose(socket, 1008, 'Unknown connection');
    if (message?.type === 'publisherHello') {
      if (message.protocol !== PROTOCOL || message.tournamentId !== this.tournamentId || message.matchId !== this.matchId || message.role !== attachment.role) return safeClose(socket, 1008, 'Publisher mismatch');
      socket.serializeAttachment({ ...attachment, authenticated: true });
      if (!this.activeRole || attachment.role === 'primary') this.activeRole = attachment.role;
      if (attachment.role === this.activeRole) this.lastPublisherAt = Date.now();
      safeSend(socket, JSON.stringify(this.streamStateMessage()));
      await this.notifyDirectory();
      return;
    }
    if (!attachment.authenticated || attachment.role !== this.activeRole) return;
    if (!validPublisherMessage(message)) return safeClose(socket, 1008, 'Invalid publisher message');
    this.lastPublisherAt = Date.now();
    await this.ctx.storage.setAlarm(Date.now() + PUBLISHER_TIMEOUT_MS);
    if (message.type === 'snapshot') {
      this.snapshots.push(message);
      this.latestConfirmedFrame = Math.max(this.latestConfirmedFrame, message.frame);
    } else if (message.type === 'inputBatch') {
      this.inputs.push(message);
      this.latestConfirmedFrame = Math.max(this.latestConfirmedFrame, message.latestConfirmedFrame);
      this.broadcastViewers(message);
    } else if (message.type === 'checkpoint') {
      this.broadcastViewers(message);
    } else if (message.type === 'streamEnd') {
      this.broadcastViewers(message);
      this.activeRole = null;
    }
    this.prune();
    await this.notifyDirectory(message.type === 'streamEnd' ? 'ended' : undefined);
  }

  async alarm() {
    if (!this.activeRole || Date.now() - this.lastPublisherAt < PUBLISHER_TIMEOUT_MS) return;
    const standby = this.ctx.getWebSockets('publisher-standby').find((socket) => socket.deserializeAttachment()?.authenticated);
    if (this.activeRole === 'primary' && standby) {
      this.activeRole = 'standby';
      this.lastPublisherAt = Date.now();
      safeSend(standby, JSON.stringify(this.streamStateMessage()));
      await this.ctx.storage.setAlarm(Date.now() + PUBLISHER_TIMEOUT_MS);
      await this.notifyDirectory();
      return;
    }
    this.activeRole = null;
    this.broadcastViewers({ type: 'streamEnd', protocol: PROTOCOL, reason: 'publisher_left' });
    await this.notifyDirectory('unavailable');
  }

  async webSocketClose(socket, code, reason) {
    const attachment = socket.deserializeAttachment() || {};
    safeClose(socket, code, reason);
    if (attachment.kind === 'viewer') this.broadcastViewerCount();
    if (attachment.kind === 'publisher' && attachment.role === this.activeRole) {
      this.lastPublisherAt = 0;
      await this.alarm();
    }
  }

  webSocketError(socket) { safeClose(socket, 1011, 'Stream error'); }

  makeBootstrap() {
    if (!this.snapshots.length) return null;
    const target = Math.max(0, this.latestConfirmedFrame - 300);
    const snapshot = [...this.snapshots].reverse().find((candidate) => candidate.frame <= target) || this.snapshots[0];
    return {
      type: 'bootstrap', protocol: PROTOCOL, snapshot,
      inputs: this.inputs.filter((batch) => batch.startFrame + batch.p1Masks.length > snapshot.frame),
      latestConfirmedFrame: this.latestConfirmedFrame,
      viewerCount: this.viewerCount()
    };
  }

  prune() {
    const minimum = Math.max(0, this.latestConfirmedFrame - RETENTION_FRAMES);
    this.snapshots = this.snapshots.filter((snapshot) => snapshot.frame >= minimum);
    this.inputs = this.inputs.filter((batch) => batch.startFrame + batch.p1Masks.length >= minimum);
  }

  streamStateMessage(state) {
    return { type: 'streamState', protocol: PROTOCOL, state: state || (this.snapshots.length && this.activeRole ? 'live' : 'waiting'), latestConfirmedFrame: this.latestConfirmedFrame, ...(this.activeRole ? { activePublisherRole: this.activeRole } : {}) };
  }

  viewerCount() { return this.ctx.getWebSockets('viewer').length; }
  broadcastViewers(message) { const payload = JSON.stringify(message); for (const socket of this.ctx.getWebSockets('viewer')) safeSend(socket, payload); }
  broadcastViewerCount() { this.broadcastViewers({ type: 'viewerCount', protocol: PROTOCOL, viewerCount: this.viewerCount() }); void this.notifyDirectory(); }

  async notifyDirectory(forcedState) {
    if (!this.tournamentId || !this.matchId) return;
    const summary = {
      tournamentId: this.tournamentId,
      matchId: this.matchId,
      state: forcedState || (this.snapshots.length && this.activeRole ? 'live' : 'waiting'),
      viewerCount: this.viewerCount(),
      latestConfirmedFrame: this.latestConfirmedFrame,
      updatedAt: Date.now()
    };
    const request = new Request('https://internal/directory', { method: 'POST', headers: { 'content-type': 'application/json', 'x-kore-tournament-id': this.tournamentId }, body: JSON.stringify(summary) });
    await this.env.TOURNAMENT_DIRECTORY.getByName(this.tournamentId).fetch(request);
  }
}

function originAllowed(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  return String(env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).includes(origin);
}

function corsResponse(request, env, response, status) {
  const target = response || new Response(null, { status });
  const headers = new Headers(target.headers);
  const origin = request.headers.get('Origin');
  if (origin && originAllowed(request, env)) headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Headers', 'content-type');
  return new Response(target.body, { status: target.status, statusText: target.statusText, headers, webSocket: target.webSocket });
}

function validPublisherMessage(message) {
  if (!message || message.protocol !== PROTOCOL) return false;
  if (message.type === 'snapshot') return frame(message.frame) && Number.isFinite(message.checksum) && Boolean(message.snapshot);
  if (message.type === 'inputBatch') return frame(message.startFrame) && frame(message.latestConfirmedFrame) && Array.isArray(message.p1Masks) && Array.isArray(message.p2Masks) && message.p1Masks.length === message.p2Masks.length && message.p1Masks.length <= 120 && message.p1Masks.every(mask) && message.p2Masks.every(mask);
  if (message.type === 'checkpoint') return frame(message.frame) && Number.isFinite(message.checksum);
  return message.type === 'streamEnd' && ['completed', 'forfeit', 'publisher_left', 'error'].includes(message.reason);
}

function validSummary(value) { return value && cleanId(value.tournamentId) && cleanId(value.matchId) && ['waiting', 'live', 'ended', 'unavailable'].includes(value.state) && Number.isFinite(value.viewerCount) && frame(value.latestConfirmedFrame); }
function mask(value) { return Number.isInteger(value) && value >= 0 && value <= 0x7fffffff; }
function frame(value) { return Number.isInteger(value) && value >= -1; }
function cleanId(value) { return typeof value === 'string' ? value.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 96) : ''; }
function byteLength(value) { return new TextEncoder().encode(value).byteLength; }
function safeSend(socket, payload) { try { if (socket.readyState === WebSocket.OPEN) socket.send(payload); } catch {} }
function safeClose(socket, code, reason) { try { socket.close(code || 1000, String(reason || '').slice(0, 120)); } catch {} }

async function verifyToken(token, secret) {
  if (!secret || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('HMAC', key, base64urlBytes(signature), new TextEncoder().encode(body));
  if (!valid) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(base64urlBytes(body)));
    return Number.isFinite(claims.exp) && claims.exp > Date.now() && ['primary', 'standby'].includes(claims.role) ? claims : null;
  } catch { return null; }
}

async function verifyCustomIdentityToken(token, secret) {
  if (!secret || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('HMAC', key, base64urlBytes(signature), new TextEncoder().encode(body));
  if (!valid) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(base64urlBytes(body)));
    const playerId = cleanPlayerId(claims.playerId);
    return claims.aud === 'custom-room' && playerId && Number.isFinite(claims.exp) && claims.exp > Date.now() ? { ...claims, playerId } : null;
  } catch { return null; }
}

function base64urlBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

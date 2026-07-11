import { ChevronLeft, Eye, Globe2, KeyRound, Lock, LogIn, MessageSquare, Play, Plus, Radio, Send, Settings2, Shield, Shuffle, Swords, Unlock, UserPlus, Users, Wifi } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { CharacterDefinition, StageDefinition } from './types';
import { GameScene } from './components/GameScene';
import { readGameSettings } from './lib/gameSettings';
import { readFriends } from './lib/socialHistory';
import type { OnlinePlayerProfile } from './lib/online/leaderboard';
import { sendFriendInvite } from './lib/online/friends';
import {
  autoJoinCustomRoom,
  clearCustomRoomSession,
  connectCustomRoom,
  createCustomRoom,
  fetchCustomRoom,
  findFriendCustomRooms,
  joinCustomRoom,
  leaveCustomRoom,
  sendCustomRoomCommand,
  storeCustomRoomSession,
  customMatchWebSocketUrl
} from './lib/online/customRoomClient';
import type { CustomMatch, CustomRoomCommand, CustomRoomEvent, CustomRoomSession, CustomRoomState, CustomRoomSummary, CustomStageChoice, CustomStation } from './lib/online/customRooms';
import { CUSTOM_SPECTATOR_DELAY_FRAMES } from './lib/online/customRooms';
import { makeResyncRequest, parseSpectatorMessage } from './lib/spectator/client';
import { createSpectatorPlayback } from './lib/spectator/playback';

export type CustomMatchLaunch = {
  roomId: string;
  memberToken: string;
  stationId: string;
  match: CustomMatch;
  localPlayerId: string;
};

export function CustomRoomsExperience({ profile, roster, stages, appVersion, session, setSession, onBack, onLaunchMatch, onWatchMatch }: {
  profile: OnlinePlayerProfile;
  roster: CharacterDefinition[];
  stages: StageDefinition[];
  appVersion: string;
  session: CustomRoomSession | null;
  setSession: (session: CustomRoomSession | null) => void;
  onBack: () => void;
  onLaunchMatch: (launch: CustomMatchLaunch) => void;
  onWatchMatch: (launch: CustomMatchLaunch) => void;
}) {
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [friendRooms, setFriendRooms] = useState<CustomRoomSummary[]>([]);
  const [friendRoomsOpen, setFriendRoomsOpen] = useState(false);
  const friends = useMemo(() => readFriends(profile), [profile]);

  const commitSession = useCallback((next: CustomRoomSession | null) => {
    if (next) storeCustomRoomSession(next);
    setSession(next);
  }, [setSession]);

  const run = async (label: string, action: () => Promise<CustomRoomSession | null>) => {
    setBusy(label); setMessage('');
    try {
      const next = await action();
      if (next) commitSession(next); else setMessage('No public Custom rooms are open right now.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Custom rooms are unavailable'); }
    finally { setBusy(''); }
  };

  const loadFriendRooms = async () => {
    setBusy('friends'); setMessage('');
    try {
      const rooms = await findFriendCustomRooms(profile, appVersion, friends.map((friend) => friend.playerId));
      setFriendRooms(rooms); setFriendRoomsOpen(true);
      if (!rooms.length) setMessage('No friends are in a joinable Custom room.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Friend rooms are unavailable'); }
    finally { setBusy(''); }
  };

  if (session) return <CustomRoomLobby profile={profile} roster={roster} stages={stages} session={session} setSession={commitSession} onBack={onBack} onLaunchMatch={onLaunchMatch} onWatchMatch={onWatchMatch} />;

  return (
    <div className="custom-entry-screen">
      <header className="custom-entry-hero">
        <span>Online / Custom</span>
        <h1>Build Your Room</h1>
        <p>Create a private session for friends, find a public room, or follow someone from your friend list. Fighters are chosen only when your station is ready.</p>
      </header>
      <section className="custom-entry-actions" aria-label="Custom room entry options">
        <button className="custom-entry-card is-primary" disabled={Boolean(busy)} onClick={() => void run('create', () => createCustomRoom({ profile, appVersion }))}>
          <span><Plus size={28} /></span><strong>Create Room</strong><small>Private by default · 8 players · up to 4 lobbies</small>
        </button>
        <button className="custom-entry-card" disabled={Boolean(busy)} onClick={() => void run('auto', () => autoJoinCustomRoom(profile, appVersion))}>
          <span><Globe2 size={28} /></span><strong>Auto Join Public</strong><small>Enter the most active compatible room with space</small>
        </button>
        <button className="custom-entry-card" disabled={Boolean(busy)} onClick={() => void loadFriendRooms()}>
          <span><Users size={28} /></span><strong>Join Friend</strong><small>Friends can bring you into private rooms</small>
        </button>
      </section>
      {busy && <div className="custom-entry-status"><Wifi size={18} /> Connecting to Custom rooms…</div>}
      {message && <div className="custom-entry-status is-message">{message}</div>}
      {friendRoomsOpen && friendRooms.length > 0 && (
        <section className="custom-friend-rooms" aria-label="Friend rooms">
          <header><div><span>Friend List</span><strong>Joinable Rooms</strong></div><button onClick={() => setFriendRoomsOpen(false)} aria-label="Close friend rooms">×</button></header>
          {friendRooms.map((room) => {
            const friend = friends.find((candidate) => candidate.playerId === room.friendPlayerId) ?? friends.find((candidate) => candidate.playerId === room.hostPlayerId);
            return <button key={room.roomId} onClick={() => void run('join', () => joinCustomRoom({ profile, appVersion, roomId: room.roomId, friendPlayerId: friend?.playerId }))}>
              <div><strong>{room.roomName}</strong><small>{friend?.displayName ?? 'Friend room'} · {room.visibility}</small></div><span>{room.memberCount}/{room.capacity}<LogIn size={17} /></span>
            </button>;
          })}
        </section>
      )}
      <button className="secondary-button custom-entry-back" onClick={onBack}><ChevronLeft size={18} /> Back</button>
    </div>
  );
}

function CustomRoomLobby({ profile, roster, stages, session, setSession, onBack, onLaunchMatch, onWatchMatch }: {
  profile: OnlinePlayerProfile;
  roster: CharacterDefinition[];
  stages: StageDefinition[];
  session: CustomRoomSession;
  setSession: (session: CustomRoomSession | null) => void;
  onBack: () => void;
  onLaunchMatch: (launch: CustomMatchLaunch) => void;
  onWatchMatch: (launch: CustomMatchLaunch) => void;
}) {
  const [room, setRoom] = useState(session.room);
  const [selectedStationId, setSelectedStationId] = useState(session.room.stations[0]?.id ?? 'station-1');
  const [error, setError] = useState('');
  const [chatText, setChatText] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const launchedMatchRef = useRef('');
  const playerId = profile.playerId;
  const friends = useMemo(() => readFriends(profile), [profile]);
  const member = room.members.find((candidate) => candidate.playerId === playerId);
  const selectedStation = room.stations.find((station) => station.id === selectedStationId) ?? room.stations[0];
  const isHost = room.hostPlayerId === playerId;
  const localStation = member?.stationId ? room.stations.find((station) => station.id === member.stationId) : undefined;
  const localMatch = localStation?.match;
  const localIsFighter = Boolean(localMatch?.fighterPlayerIds.includes(playerId));

  useEffect(() => {
    const applyEvent = (event: CustomRoomEvent) => {
      if (event.type === 'snapshot') { setRoom(event.room); setSession({ ...session, room: event.room }); setError(''); }
      if (event.type === 'error') setError(event.message);
      if (event.type === 'kicked' || event.type === 'roomClosed') { clearCustomRoomSession(room.roomId); setSession(null); }
    };
    const socket = connectCustomRoom(room.roomId, session.memberToken, applyEvent);
    const poll = window.setInterval(() => void fetchCustomRoom(room.roomId, session.memberToken).then((next) => applyEvent({ type: 'snapshot', room: next })).catch((reason) => setError(reason instanceof Error ? reason.message : 'Room connection interrupted')), socket ? 10_000 : 1_000);
    return () => { window.clearInterval(poll); socket?.close(); };
  }, [room.roomId, session.memberToken, setSession]);

  useEffect(() => {
    if (!localIsFighter || !localStation || !localMatch?.characterIds || !localMatch.stageId || localStation.phase !== 'loading' || launchedMatchRef.current === localMatch.id) return;
    launchedMatchRef.current = localMatch.id;
    onLaunchMatch({ roomId: room.roomId, memberToken: session.memberToken, stationId: localStation.id, match: localMatch, localPlayerId: playerId });
  }, [localIsFighter, localMatch, localStation, onLaunchMatch, playerId, room.roomId, session.memberToken]);

  const command = async (value: CustomRoomCommand) => {
    setError('');
    try {
      const next = await sendCustomRoomCommand(room.roomId, session.memberToken, value);
      setRoom(next); setSession({ ...session, room: next });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Room action failed'); }
  };

  const leave = async () => {
    await leaveCustomRoom(room.roomId, session.memberToken).catch(() => undefined);
    clearCustomRoomSession(room.roomId); setSession(null); onBack();
  };

  if (localIsFighter && localStation?.phase === 'characterSelect' && localMatch) {
    return <CustomCharacterSelect roster={roster} room={room} stationId={localStation.id} match={localMatch} playerId={playerId} onLock={(characterId) => command({ type: 'lockCharacter', stationId: localStation.id, characterId })} />;
  }
  if (localIsFighter && localStation?.phase === 'stageSelect' && localMatch) {
    return <CustomStageSelect stages={stages} match={localMatch} playerId={playerId} onLock={(choice) => command({ type: 'lockStage', stationId: localStation.id, choice, stagePool: stages.map((stage) => stage.id) })} />;
  }

  const stationMembers = selectedStation ? room.members.filter((candidate) => candidate.stationId === selectedStation.id) : [];
  const ready = Boolean(selectedStation?.readyQueue.includes(playerId));
  const fighter = Boolean(selectedStation?.fighters?.includes(playerId));

  return (
    <div className="custom-room-screen">
      <header className="custom-room-header">
        <div><span>Custom Room</span><h1>{room.roomName}</h1></div>
        <div className="custom-room-header-meta"><span className={room.visibility === 'public' ? 'is-public' : ''}>{room.visibility === 'public' ? <Unlock size={15} /> : <Lock size={15} />}{room.visibility}</span><strong>{room.members.length}/{room.capacity}</strong></div>
      </header>
      <nav className="custom-station-tabs" aria-label="Match stations">
        {room.stations.map((station) => <button key={station.id} className={station.id === selectedStation?.id ? 'active' : ''} onClick={() => setSelectedStationId(station.id)}>
          <span>{customStationName(station)}</span><small>{station.memberPlayerIds.length}/{room.capacity}</small>{station.phase === 'live' && <Radio size={16} />}
        </button>)}
      </nav>
      <div className="custom-room-layout">
        <aside className="custom-room-sidebar">
          <section className="custom-room-settings-card">
            <header><span>Room Rules</span>{isHost && <button onClick={() => setSettingsOpen((open) => !open)} aria-label="Edit room settings"><Settings2 size={17} /></button>}</header>
            <dl><div><dt>Visibility</dt><dd>{room.visibility}</dd></div><div><dt>Rounds to Win</dt><dd>{room.rules.roundsToWin}</dd></div><div><dt>Round Timer</dt><dd>{room.rules.roundTimer}</dd></div><div><dt>Match Lobbies</dt><dd>{room.stationCount}</dd></div></dl>
            {settingsOpen && isHost && <CustomRoomSettings room={room} onUpdate={(patch) => command({ type: 'updateRoom', ...patch })} />}
          </section>
          <section className="custom-room-chat">
            <header><MessageSquare size={16} /><span>Room Chat</span></header>
            <div className="custom-chat-log">{room.chat.map((item) => <p key={item.id} className={item.kind === 'system' ? 'is-system' : ''}>{item.kind === 'chat' && <strong>{item.displayName}</strong>}<span>{item.text}</span></p>)}</div>
            <form onSubmit={(event) => { event.preventDefault(); if (!chatText.trim()) return; void command({ type: 'sendChat', text: chatText }).then(() => setChatText('')); }}><input value={chatText} maxLength={160} onChange={(event) => setChatText(event.target.value)} placeholder="Message the room" aria-label="Room message" /><button aria-label="Send room message"><Send size={17} /></button></form>
          </section>
          {inviteOpen && <div className="custom-invite-list">{friends.length === 0 ? <p>No saved friends yet.</p> : friends.map((friend) => <button key={friend.playerId} onClick={() => void sendFriendInvite(profile, friend.playerId, room.roomName, 'CUSTOM', room.roomId, 'custom').then(() => setError(`Invited ${friend.displayName}`)).catch((reason) => setError(reason instanceof Error ? reason.message : 'Invite failed'))}><span>{friend.displayName}</span><UserPlus size={16} /></button>)}</div>}
          <div className="custom-room-sidebar-actions"><button className="secondary-button" onClick={() => void leave()}><ChevronLeft size={17} /> Leave</button><button className="secondary-button" onClick={() => setInviteOpen((open) => !open)}><UserPlus size={17} /> Invite</button></div>
        </aside>
        <main className="custom-station-panel">
          {selectedStation && <>
            <header className="custom-station-hero"><div><span>{selectedStation.phase === 'live' ? 'Match in progress' : 'Next match'}</span><h2>{customStationName(selectedStation)}</h2></div><strong>{selectedStation.phase.toUpperCase()}</strong></header>
            <div className="custom-matchup">
              <CustomFighterSlot label="Champion" playerId={selectedStation.fighters?.[0]} room={room} roster={roster} match={selectedStation.match} slot={0} />
              <div className="custom-matchup-vs"><Swords size={30} /><span>VS</span></div>
              <CustomFighterSlot label="Challenger" playerId={selectedStation.fighters?.[1]} room={room} roster={roster} match={selectedStation.match} slot={1} />
            </div>
            <section className="custom-member-list"><header><span>Member List</span><small>{stationMembers.length}/{room.capacity}</small></header>{stationMembers.map((item) => {
              const queue = selectedStation.readyQueue.indexOf(item.playerId);
              return <article key={item.playerId} className={selectedStation.fighters?.includes(item.playerId) ? 'is-fighter' : ''}><span>{item.playerId === room.hostPlayerId ? <Shield size={15} /> : <Users size={15} />}</span><div><strong>{item.displayName}{item.playerId === playerId ? ' (YOU)' : ''}</strong><small>{selectedStation.fighters?.includes(item.playerId) ? 'Fighter' : queue >= 0 ? `Ready #${queue + 1}` : 'Spectating'}</small></div>{isHost && item.playerId !== playerId && <button onClick={() => void command({ type: 'kickMember', playerId: item.playerId })}>Kick</button>}</article>;
            })}</section>
            <div className="custom-station-actions">
              {member?.stationId !== selectedStation.id ? <button className="primary-button" onClick={() => void command({ type: 'joinStation', stationId: selectedStation.id })}><LogIn size={18} /> Join {customStationName(selectedStation)}</button> : <>
                {selectedStation.phase === 'idle' && <button className={ready ? 'secondary-button is-ready' : 'primary-button'} onClick={() => void command({ type: 'setReady', ready: !ready })}>{ready ? <><Shield size={18} /> Ready</> : <><Swords size={18} /> Press Ready</>}</button>}
                {fighter && selectedStation.phase === 'idle' && <button className="primary-button" onClick={() => void command({ type: 'startMatch', stationId: selectedStation.id })}><Play size={18} /> Start Match</button>}
                {selectedStation.phase === 'live' && !fighter && selectedStation.match && <button className="primary-button" onClick={() => onWatchMatch({ roomId: room.roomId, memberToken: session.memberToken, stationId: selectedStation.id, match: selectedStation.match!, localPlayerId: playerId })}><Eye size={18} /> Watch Match</button>}
                {!fighter && <button className="secondary-button" onClick={() => void command({ type: 'leaveStation' })}>Leave {customStationName(selectedStation)}</button>}
              </>}
            </div>
          </>}
          {error && <div className="custom-room-error">{error}</div>}
        </main>
      </div>
    </div>
  );
}

function CustomCharacterSelect({ roster, room, stationId, match, playerId, onLock }: { roster: CharacterDefinition[]; room: CustomRoomState; stationId: string; match: CustomMatch; playerId: string; onLock: (id: string) => Promise<void> }) {
  const [selected, setSelected] = useState(roster[0]?.id ?? ''); const [locked, setLocked] = useState(false);
  const opponentLocked = match.characterLocked[match.fighterPlayerIds[0] === playerId ? 1 : 0];
  return <div className="custom-pick-screen"><header><span>{room.roomName} · {customStationName(room.stations.find((station) => station.id === stationId))}</span><h1>Choose Your Fighter</h1><p>Your pick stays hidden until both players lock in.</p></header><div className="custom-pick-grid">{roster.map((character) => <button key={character.id} className={selected === character.id ? 'active' : ''} disabled={locked} onClick={() => setSelected(character.id)} style={{ '--fighter-color': character.colors.primary } as CSSProperties}><img src={character.animationFrames?.idle?.[0] || character.spriteSheetPath} alt="" /><strong>{character.displayName}</strong></button>)}</div><footer><div><Lock size={17} /><span>{opponentLocked ? 'Opponent locked' : 'Opponent choosing'}</span></div><button className="primary-button" disabled={!selected || locked} onClick={() => void onLock(selected).then(() => setLocked(true))}>{locked ? 'Locked In' : 'Lock Fighter'}</button></footer></div>;
}

function customStationName(station?: Pick<CustomStation, 'id' | 'label'>) {
  if (!station) return 'A';
  const legacyLabel = station.label.replace(/^LOBBY\s+/i, '').trim();
  if (/^[A-D]$/i.test(legacyLabel)) return legacyLabel.toUpperCase();
  const index = Number(station.id.replace('station-', '')) - 1;
  return Number.isInteger(index) && index >= 0 && index < 4 ? String.fromCharCode(65 + index) : legacyLabel;
}

function CustomStageSelect({ stages, match, playerId, onLock }: { stages: StageDefinition[]; match: CustomMatch; playerId: string; onLock: (choice: CustomStageChoice) => Promise<void> }) {
  const [choice, setChoice] = useState<CustomStageChoice>({ kind: 'random' }); const [locked, setLocked] = useState(false); const opponentLocked = match.stageLocked[match.fighterPlayerIds[0] === playerId ? 1 : 0];
  useEffect(() => {
    if (locked || !match.stageDeadline) return undefined;
    const timeout = window.setTimeout(() => void onLock({ kind: 'random' }).then(() => setLocked(true)), Math.max(0, match.stageDeadline - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [locked, match.stageDeadline, onLock]);
  return <div className="custom-pick-screen custom-stage-pick-screen"><header><span>Stage Vote</span><h1>Choose Your Arena</h1><p>Each choice becomes a candidate. K.O.R.E randomly selects between both candidates.</p></header><div className="custom-stage-grid"><button className={choice.kind === 'random' ? 'active' : ''} disabled={locked} onClick={() => setChoice({ kind: 'random' })}><Shuffle size={38} /><strong>Random</strong><small>Resolve one candidate from every stage</small></button>{stages.map((stage) => <button key={stage.id} className={choice.kind === 'stage' && choice.stageId === stage.id ? 'active' : ''} disabled={locked} onClick={() => setChoice({ kind: 'stage', stageId: stage.id })}><span style={{ background: stage.rail }} /><strong>{stage.name}</strong><small>{stage.subtitle}</small></button>)}</div><footer><div><Lock size={17} /><span>{opponentLocked ? 'Opponent locked' : 'Opponent choosing'}</span></div><button className="primary-button" disabled={locked} onClick={() => void onLock(choice).then(() => setLocked(true))}>{locked ? 'Vote Locked' : 'Lock Stage'}</button></footer></div>;
}

function CustomFighterSlot({ label, playerId, room, roster, match, slot }: { label: string; playerId?: string; room: CustomRoomState; roster: CharacterDefinition[]; match?: CustomMatch; slot: 0 | 1 }) {
  const member = room.members.find((candidate) => candidate.playerId === playerId); const character = match?.characterIds ? roster.find((candidate) => candidate.id === match.characterIds![slot]) : undefined;
  return <article className={`custom-fighter-slot ${member ? 'is-filled' : ''}`} style={{ '--fighter-color': character?.colors.primary ?? '#45e4ff' } as CSSProperties}><span>{label}</span>{character && <img src={character.animationFrames?.idle?.[0] || character.spriteSheetPath} alt="" />}<strong>{member?.displayName ?? 'Waiting'}</strong><small>{character?.displayName ?? (member ? 'Ready to select' : 'Press Ready to queue')}</small></article>;
}

function CustomRoomSettings({ room, onUpdate }: { room: CustomRoomState; onUpdate: (patch: { roomName?: string; visibility?: 'private' | 'public'; stationCount?: number; rules?: Partial<CustomRoomState['rules']> }) => Promise<void> }) {
  return <div className="custom-settings-editor"><label><span>Room name</span><input defaultValue={room.roomName} maxLength={18} onBlur={(event) => void onUpdate({ roomName: event.target.value })} /></label><button onClick={() => void onUpdate({ visibility: room.visibility === 'public' ? 'private' : 'public' })}>{room.visibility === 'public' ? <KeyRound size={16} /> : <Globe2 size={16} />}{room.visibility === 'public' ? 'Make Private' : 'Open Public'}</button><label><span>Lobbies</span><select value={room.stationCount} onChange={(event) => void onUpdate({ stationCount: Number(event.target.value) })}>{[1, 2, 3, 4].map((value) => <option key={value}>{value}</option>)}</select></label><label><span>Rounds to win</span><select value={room.rules.roundsToWin} onChange={(event) => void onUpdate({ rules: { roundsToWin: Number(event.target.value) as 1 | 2 | 3 | 5 } })}>{[1, 2, 3, 5].map((value) => <option key={value}>{value}</option>)}</select></label><label><span>Round timer</span><select value={room.rules.roundTimer} onChange={(event) => void onUpdate({ rules: { roundTimer: Number(event.target.value) as 30 | 45 | 60 | 90 | 99 } })}>{[30, 45, 60, 90, 99].map((value) => <option key={value}>{value}</option>)}</select></label></div>;
}

export function CustomMatchSpectator({ launch, roster, stages, onBack }: { launch: CustomMatchLaunch; roster: CharacterDefinition[]; stages: StageDefinition[]; onBack: () => void }) {
  const [renderedMatch, setRenderedMatch] = useState<ReturnType<typeof createSpectatorPlayback>['match']>(null);
  const [status, setStatus] = useState('Synchronizing');
  const [viewerCount, setViewerCount] = useState(0);
  const runtimeRef = useRef(createSpectatorPlayback(CUSTOM_SPECTATOR_DELAY_FRAMES));
  const socketRef = useRef<WebSocket | null>(null);
  const settings = useMemo(() => readGameSettings(), []);

  useEffect(() => {
    const url = customMatchWebSocketUrl(launch.roomId, launch.match.id, launch.memberToken);
    if (!url) { setStatus('Custom spectator relay is not configured'); return undefined; }
    const socket = new WebSocket(url); socketRef.current = socket;
    socket.onmessage = (event) => {
      const message = parseSpectatorMessage(event.data); if (!message) return;
      if (message.type === 'bootstrap') {
        try { runtimeRef.current.bootstrap(message, roster, stages); setRenderedMatch(runtimeRef.current.match); setViewerCount(message.viewerCount); setStatus('Live'); }
        catch { setStatus('Unable to synchronize'); }
      } else if (message.type === 'inputBatch') runtimeRef.current.addInputs(message);
      else if (message.type === 'checkpoint') runtimeRef.current.addCheckpoint(message);
      else if (message.type === 'viewerCount') setViewerCount(message.viewerCount);
      else if (message.type === 'streamEnd') { setStatus('Match ended'); window.setTimeout(onBack, 900); }
      else if (message.type === 'streamState' && message.state === 'unavailable') setStatus('Broadcast interrupted');
    };
    socket.onclose = () => setStatus((current) => current === 'Match ended' ? current : 'Reconnecting');
    return () => { socket.close(); socketRef.current = null; };
  }, [launch.match.id, launch.memberToken, launch.roomId, onBack, roster, stages]);

  useEffect(() => {
    let frame = 0; let previous = performance.now(); let accumulator = 0;
    const tick = (now: number) => {
      const runtime = runtimeRef.current; accumulator += Math.min(.1, (now - previous) / 1000); previous = now; let advanced = false; let budget = runtime.frame < runtime.targetFrame() - 120 ? 240 : 1;
      while (runtime.match && runtime.frame <= runtime.targetFrame() && budget > 0 && (accumulator >= 1 / 60 || budget > 1)) {
        const result = runtime.advance();
        if (result === 'gap') { setStatus('Buffering'); break; }
        if (result === 'desync') { setStatus('Resynchronizing'); socketRef.current?.send(JSON.stringify(makeResyncRequest())); break; }
        advanced = true; accumulator = Math.max(0, accumulator - 1 / 60); budget -= 1;
      }
      if (advanced && runtime.match) { setRenderedMatch(runtime.match); setStatus('Live'); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, []);

  if (!renderedMatch) return <div className="custom-spectator-loading"><Wifi size={32} /><h1>{status}</h1><p>Building the near-live room buffer…</p><button className="secondary-button" onClick={onBack}>Back to Lobby</button></div>;
  return <main className="fight-screen spectator-fight-screen"><GameScene match={renderedMatch} cameraSettings={settings.camera} sparkSettings={settings.display.impactSparks} movementSmokeStyle={settings.display.movementSmokeStyle} audioSettings={settings.audio} reducedMotion={settings.display.reducedMotion} /><div className="spectator-live-overlay"><div className="spectator-live-label"><i /> CUSTOM SPECTATOR <span>{status === 'Live' ? 'LIVE · 1s BUFFER' : status.toUpperCase()}</span></div><div className="spectator-viewers"><Users size={16} /><strong>{viewerCount}</strong></div><button aria-label="Back to Custom lobby" onClick={onBack}><ChevronLeft size={19} /></button></div></main>;
}

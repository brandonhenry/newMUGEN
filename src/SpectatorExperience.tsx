import { ChevronLeft, Copy, Eye, Radio, Share2, Trophy, Users, Wifi } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { KORE_APP_VERSION } from './appVersion';
import { GameScene } from './components/GameScene';
import { createMatch, stepMatch } from './engine/fightEngine';
import { loadCharacterRoster } from './lib/characterLoader';
import { readGameSettings } from './lib/gameSettings';
import { checksumMatch } from './lib/online/rollback';
import { decodeInputFrame, hydrateMatchSnapshot, ONLINE_PROTOCOL_VERSION } from './lib/online/codec';
import {
  fetchSpectatorDirectory,
  makeResyncRequest,
  parseSpectatorMessage,
  spectatorDirectoryWebSocketUrl,
  spectatorMatchWebSocketUrl
} from './lib/spectator/client';
import {
  SPECTATOR_DELAY_FRAMES,
  type SpectatorBootstrap,
  type SpectatorCheckpoint,
  type SpectatorInputBatch,
  type SpectatorStreamSummary
} from './lib/spectator/protocol';
import { loadStageRoster } from './lib/stageLoader';
import { fetchPublicTournament } from './lib/tournament/client';
import type { PublicTournamentEntry, PublicTournamentMatch, TournamentPublicView } from './lib/tournament/types';
import type { CharacterDefinition, MatchSnapshot, StageDefinition } from './types';

export type SpectatorRoute =
  | { kind: 'tournament'; slug: string }
  | { kind: 'watch'; slug: string }
  | { kind: 'match'; slug: string; matchId: string };

export function parseSpectatorRoute(pathname: string): SpectatorRoute | null {
  const parts = pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
  if (parts[0] !== 'tournaments' || !parts[1]) return null;
  if (parts.length === 2) return { kind: 'tournament', slug: parts[1] };
  if (parts.length === 3 && parts[2] === 'watch') return { kind: 'watch', slug: parts[1] };
  if (parts.length === 4 && parts[2] === 'matches' && parts[3]) return { kind: 'match', slug: parts[1], matchId: parts[3] };
  return null;
}

export async function shareSpectatorLink(title: string, text: string, url: string) {
  if (typeof navigator.share === 'function') {
    try { await navigator.share({ title, text, url }); return 'shared' as const; } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled' as const;
    }
  }
  await navigator.clipboard.writeText(url);
  return 'copied' as const;
}

export function SpectatorExperience({ route }: { route: SpectatorRoute }) {
  const [tournament, setTournament] = useState<TournamentPublicView | null>(null);
  const [streams, setStreams] = useState<SpectatorStreamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [watchStarted, setWatchStarted] = useState(false);
  const [autoFollow, setAutoFollow] = useState(true);
  const [shareStatus, setShareStatus] = useState('');

  const refreshTournament = useCallback(async () => {
    try {
      const next = await fetchPublicTournament(route.slug);
      setTournament(next);
      setError('');
      const directory = await fetchSpectatorDirectory(next.id).catch(() => []);
      setStreams(directory);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Tournament unavailable');
    } finally {
      setLoading(false);
    }
  }, [route.slug]);

  useEffect(() => { void refreshTournament(); }, [refreshTournament]);
  useEffect(() => {
    if (!tournament) return undefined;
    const timer = window.setInterval(() => void refreshTournament(), 10_000);
    const url = spectatorDirectoryWebSocketUrl(tournament.id);
    if (!url) return () => window.clearInterval(timer);
    const socket = new WebSocket(url);
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as { type?: string; streams?: SpectatorStreamSummary[]; stream?: SpectatorStreamSummary };
        if (message.type === 'directorySnapshot' && Array.isArray(message.streams)) setStreams(message.streams);
        if (message.type === 'directoryUpdate' && message.stream) {
          setStreams((current) => [...current.filter((stream) => stream.matchId !== message.stream!.matchId), message.stream!]);
          if (message.stream.state === 'ended') void refreshTournament();
        }
      } catch { /* ignore malformed directory events */ }
    };
    return () => { window.clearInterval(timer); socket.close(); };
  }, [refreshTournament, tournament?.id]);

  const streamByMatch = useMemo(() => new Map(streams.map((stream) => [stream.matchId, stream])), [streams]);
  const liveMatches = useMemo(() => tournament?.matches
    .filter((match) => match.status === 'ready' && streamByMatch.get(match.id)?.state === 'live')
    .sort((a, b) => b.round - a.round || a.index - b.index) ?? [], [streamByMatch, tournament]);
  const requestedMatch = route.kind === 'match' ? tournament?.matches.find((match) => match.id === route.matchId) : undefined;
  const featuredMatch = route.kind === 'watch' ? liveMatches[0] : requestedMatch;
  const featuredStream = featuredMatch ? streamByMatch.get(featuredMatch.id) : undefined;

  if (loading) return <PublicTournamentState icon={<Wifi size={34} />} title="Loading tournament" detail="Checking the bracket and live broadcasts…" />;
  if (error || !tournament) return <PublicTournamentState icon={<Wifi size={34} />} title="Tournament unavailable" detail={error || 'The tournament could not be found.'} />;

  if ((route.kind === 'match' || route.kind === 'watch') && featuredMatch && watchStarted && featuredStream?.state === 'live') {
    return (
      <SpectatorMatchViewer
        key={featuredMatch.id}
        tournament={tournament}
        match={featuredMatch}
        stream={featuredStream}
        onEnded={() => {
          void refreshTournament();
          if (!autoFollow || route.kind === 'match') setWatchStarted(false);
        }}
      />
    );
  }

  if (route.kind === 'match') {
    return (
      <PublicMatchLanding
        tournament={tournament}
        match={requestedMatch}
        stream={requestedMatch ? streamByMatch.get(requestedMatch.id) : undefined}
        shareStatus={shareStatus}
        onWatch={() => setWatchStarted(true)}
        onShare={() => requestedMatch && void shareMatch(tournament, requestedMatch).then(setShareStatus)}
      />
    );
  }

  if (route.kind === 'watch') {
    return (
      <PublicTournamentState
        icon={<Radio size={36} />}
        title={liveMatches.length ? 'Tournament broadcast ready' : 'Waiting for the next live match'}
        detail={liveMatches.length ? `${entryName(tournament, liveMatches[0].entryAId)} vs ${entryName(tournament, liveMatches[0].entryBId)} is live now.` : 'This page will update when a tournament match goes live.'}
        actions={liveMatches.length ? <>
          <button className="primary-button spectator-action-button" onClick={() => setWatchStarted(true)}><Eye size={18} /> Watch Tournament</button>
          <label className="spectator-auto-follow"><input type="checkbox" checked={autoFollow} onChange={(event) => setAutoFollow(event.target.checked)} /> Auto-follow live matches</label>
          <a className="secondary-button spectator-action-link" href={tournamentUrl(tournament)}><ChevronLeft size={18} /> View Bracket</a>
        </> : <a className="secondary-button spectator-action-link" href={tournamentUrl(tournament)}><ChevronLeft size={18} /> View Bracket</a>}
      />
    );
  }

  return (
    <main className="public-tournament-screen">
      <header className="public-tournament-hero">
        <div><span>Live Tournament</span><h1>{tournament.name}</h1><p>{tournament.status === 'completed' ? 'Final bracket' : `${liveMatches.length} match${liveMatches.length === 1 ? '' : 'es'} live now`}</p></div>
        <Trophy size={46} />
      </header>
      <div className="public-tournament-actions">
        <button className="secondary-button spectator-action-button" onClick={() => void shareTournament(tournament).then(setShareStatus)}><Share2 size={18} /> {shareStatus || 'Share Tournament'}</button>
        <a className={`primary-button spectator-action-link ${liveMatches.length ? '' : 'is-disabled'}`} href={`${tournamentUrl(tournament)}/watch`} aria-disabled={!liveMatches.length}><Radio size={18} /> Watch Tournament</a>
      </div>
      <section className="public-bracket" aria-label="Tournament bracket">
        {[...new Set(tournament.matches.map((match) => match.round))].sort((a, b) => b - a).map((round) => (
          <div className="public-bracket-round" key={round}>
            <h2>{roundLabel(round, tournament.matches)}</h2>
            <div className="public-match-grid">
              {tournament.matches.filter((match) => match.round === round).map((match) => (
                <PublicMatchCard key={match.id} tournament={tournament} match={match} stream={streamByMatch.get(match.id)} />
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}

function PublicMatchCard({ tournament, match, stream }: { tournament: TournamentPublicView; match: PublicTournamentMatch; stream?: SpectatorStreamSummary }) {
  const live = match.status === 'ready' && stream?.state === 'live';
  return (
    <article className={`public-match-card ${live ? 'is-live' : ''} ${match.status === 'completed' ? 'is-complete' : ''}`}>
      <div className="public-match-state">{live ? <><i /> LIVE · {stream.viewerCount.toLocaleString()} WATCHING</> : match.status === 'completed' ? 'FINAL' : match.status === 'forfeit' || match.roomStatus === 'forfeit' ? 'FORFEIT' : match.status === 'ready' ? 'WAITING FOR BROADCAST' : 'WAITING TO START'}</div>
      <PublicEntrant entry={findEntry(tournament, match.entryAId)} winner={match.winnerEntryId === match.entryAId} />
      <PublicEntrant entry={findEntry(tournament, match.entryBId)} winner={match.winnerEntryId === match.entryBId} />
      {live && <a className="primary-button public-watch-button" href={`${tournamentUrl(tournament)}/matches/${encodeURIComponent(match.id)}`}><Eye size={18} /> Watch Game</a>}
    </article>
  );
}

function PublicEntrant({ entry, winner }: { entry?: PublicTournamentEntry; winner: boolean }) {
  return <div className={`public-entrant ${winner ? 'is-winner' : ''}`}><span>{entry ? `#${entry.seed}` : '—'}</span><strong>{entry?.displayName ?? 'TBD'}</strong>{winner && <Trophy size={15} />}</div>;
}

function PublicMatchLanding({ tournament, match, stream, onWatch, onShare, shareStatus }: { tournament: TournamentPublicView; match?: PublicTournamentMatch; stream?: SpectatorStreamSummary; onWatch: () => void; onShare: () => void; shareStatus: string }) {
  if (!match) return <PublicTournamentState icon={<Wifi size={34} />} title="Match not found" detail="This match link does not belong to the tournament." />;
  const live = match.status === 'ready' && stream?.state === 'live';
  const complete = match.status === 'completed';
  const forfeit = match.status === 'forfeit' || match.roomStatus === 'forfeit';
  return <PublicTournamentState
    icon={live ? <Radio size={36} /> : complete ? <Trophy size={36} /> : <Wifi size={36} />}
    title={`${entryName(tournament, match.entryAId)} vs ${entryName(tournament, match.entryBId)}`}
    detail={live ? `Live now · ${stream.viewerCount.toLocaleString()} watching · delayed broadcast.` : complete ? `${entryName(tournament, match.winnerEntryId)} won this match.` : forfeit ? 'This match ended by forfeit. No broadcast is available.' : 'This match has not started broadcasting yet. This page will update automatically.'}
    actions={<>
      {live && <button className="primary-button spectator-action-button" onClick={onWatch}><Eye size={18} /> Watch Now</button>}
      <button className="secondary-button spectator-action-button" onClick={onShare}><Share2 size={18} /> {shareStatus || 'Share Match'}</button>
      <a className="secondary-button spectator-action-link" href={tournamentUrl(tournament)}><ChevronLeft size={18} /> Back to Tournament</a>
    </>}
  />;
}

function SpectatorMatchViewer({ tournament, match, stream, onEnded }: { tournament: TournamentPublicView; match: PublicTournamentMatch; stream: SpectatorStreamSummary; onEnded: () => void }) {
  const [renderedMatch, setRenderedMatch] = useState<MatchSnapshot | null>(null);
  const [status, setStatus] = useState('Synchronizing');
  const [viewerCount, setViewerCount] = useState(stream.viewerCount);
  const [assetData, setAssetData] = useState<{ roster: CharacterDefinition[]; stages: StageDefinition[] } | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const runtimeRef = useRef(makePlaybackRuntime());
  const settings = useMemo(() => readGameSettings(), []);

  useEffect(() => { void Promise.all([loadCharacterRoster(), loadStageRoster()]).then(([characters, stages]) => setAssetData({ roster: characters.characters, stages: stages.stages })); }, []);
  useEffect(() => {
    if (!assetData) return undefined;
    const url = spectatorMatchWebSocketUrl(tournament.id, match.id);
    if (!url) { setStatus('Broadcast relay is not configured'); return undefined; }
    const socket = new WebSocket(url);
    socketRef.current = socket;
    socket.onopen = () => setStatus('Synchronizing');
    socket.onmessage = (event) => {
      const message = parseSpectatorMessage(event.data);
      if (!message) return;
      if (message.type === 'bootstrap') {
        try {
          if (message.snapshot.snapshot.protocol !== ONLINE_PROTOCOL_VERSION) { setStatus('Update Required'); return; }
          runtimeRef.current.bootstrap(message, assetData.roster, assetData.stages);
          setRenderedMatch(runtimeRef.current.match);
          setViewerCount(message.viewerCount);
          setStatus('Live');
        } catch { setStatus('Unable to synchronize'); }
      } else if (message.type === 'inputBatch') runtimeRef.current.addInputs(message);
      else if (message.type === 'checkpoint') runtimeRef.current.addCheckpoint(message);
      else if (message.type === 'viewerCount') setViewerCount(message.viewerCount);
      else if (message.type === 'streamEnd') { setStatus('Match ended'); onEnded(); }
      else if (message.type === 'streamState' && message.state === 'unavailable') setStatus('Broadcast interrupted');
    };
    socket.onclose = () => setStatus((current) => current === 'Match ended' ? current : 'Reconnecting');
    return () => { socket.close(); socketRef.current = null; runtimeRef.current = makePlaybackRuntime(); };
  }, [assetData, match.id, onEnded, tournament.id]);

  useEffect(() => {
    let animationFrame = 0;
    let previous = performance.now();
    let accumulator = 0;
    const tick = (now: number) => {
      const runtime = runtimeRef.current;
      accumulator += Math.min(0.1, (now - previous) / 1000);
      previous = now;
      let advanced = false;
      let budget = runtime.frame < runtime.targetFrame() - 120 ? 240 : 1;
      while (runtime.match && runtime.frame <= runtime.targetFrame() && budget > 0 && (accumulator >= 1 / 60 || budget > 1)) {
        const result = runtime.advance();
        if (result === 'gap') { setStatus('Buffering'); break; }
        if (result === 'desync') {
          setStatus('Resynchronizing');
          socketRef.current?.send(JSON.stringify(makeResyncRequest()));
          break;
        }
        advanced = true;
        accumulator = Math.max(0, accumulator - 1 / 60);
        budget -= 1;
      }
      if (advanced && runtime.match) { setRenderedMatch(runtime.match); setStatus('Live'); }
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  if (!renderedMatch) return <PublicTournamentState icon={<Wifi size={34} />} title={status} detail={assetData ? 'Building the delayed live buffer…' : 'Loading fighters and arena…'} />;
  return (
    <main className="fight-screen spectator-fight-screen">
      <GameScene match={renderedMatch} cameraSettings={settings.camera} sparkSettings={settings.display.impactSparks} movementSmokeStyle={settings.display.movementSmokeStyle} audioSettings={settings.audio} reducedMotion={settings.display.reducedMotion} />
      <SpectatorHud match={renderedMatch} />
      <div className="spectator-live-overlay">
        <div className="spectator-live-label"><i /> SPECTATOR <span>{status === 'Live' ? 'LIVE · DELAYED' : status.toUpperCase()}</span></div>
        <div className="spectator-viewers"><Users size={16} /><strong>{viewerCount.toLocaleString()}</strong></div>
        <a href={tournamentUrl(tournament)} aria-label="Back to tournament"><ChevronLeft size={19} /></a>
        <button aria-label="Share match" onClick={() => void shareMatch(tournament, match)}><Share2 size={18} /></button>
      </div>
    </main>
  );
}

function SpectatorHud({ match }: { match: MatchSnapshot }) {
  const [p1, p2] = match.fighters;
  return <div className="spectator-fight-hud"><SpectatorHealth fighter={p1} /><div className="spectator-round-clock"><span>ROUND {match.round}</span><strong>{Math.max(0, Math.ceil(match.timer))}</strong></div><SpectatorHealth fighter={p2} right /></div>;
}

function SpectatorHealth({ fighter, right = false }: { fighter: MatchSnapshot['fighters'][number]; right?: boolean }) {
  const health = Math.max(0, Math.min(100, fighter.hp / Math.max(1, fighter.maxHp) * 100));
  return <div className={`spectator-health ${right ? 'right' : ''}`}><strong>{fighter.character.displayName}</strong><div><i style={{ width: `${health}%`, background: fighter.character.colors.primary }} /></div><span>{fighter.roundsWon} ROUND{fighter.roundsWon === 1 ? '' : 'S'}</span></div>;
}

function makePlaybackRuntime() {
  const p1Masks = new Map<number, number>();
  const p2Masks = new Map<number, number>();
  const checkpoints = new Map<number, number>();
  return {
    match: null as MatchSnapshot | null,
    frame: 0,
    latestConfirmedFrame: -1,
    bootstrap(message: SpectatorBootstrap, roster: CharacterDefinition[], stages: StageDefinition[]) {
      p1Masks.clear(); p2Masks.clear(); checkpoints.clear();
      const snapshot = message.snapshot.snapshot;
      const p1 = roster.find((character) => character.id === (snapshot.p1BaseCharacterId || snapshot.p1CharacterId));
      const p2 = roster.find((character) => character.id === (snapshot.p2BaseCharacterId || snapshot.p2CharacterId));
      const stage = stages.find((candidate) => candidate.id === snapshot.stageId);
      if (!p1 || !p2 || !stage) throw new Error('Spectator assets unavailable');
      const base = createMatch(p1, p2, stage, 'online', snapshot.cpuDifficulty, { roster, roundTime: snapshot.roundTime, maxHealth: snapshot.maxHealth, playIntro: false });
      this.match = hydrateMatchSnapshot(base, snapshot);
      this.frame = message.snapshot.frame;
      this.latestConfirmedFrame = message.latestConfirmedFrame;
      for (const batch of message.inputs) this.addInputs(batch);
      checkpoints.set(message.snapshot.frame, message.snapshot.checksum);
    },
    addInputs(batch: SpectatorInputBatch) {
      batch.p1Masks.forEach((mask, offset) => p1Masks.set(batch.startFrame + offset, mask));
      batch.p2Masks.forEach((mask, offset) => p2Masks.set(batch.startFrame + offset, mask));
      this.latestConfirmedFrame = Math.max(this.latestConfirmedFrame, batch.latestConfirmedFrame);
    },
    addCheckpoint(checkpoint: SpectatorCheckpoint) { checkpoints.set(checkpoint.frame, checkpoint.checksum); },
    targetFrame() { return Math.max(0, this.latestConfirmedFrame - SPECTATOR_DELAY_FRAMES); },
    advance(): 'advanced' | 'gap' | 'desync' {
      if (!this.match) return 'gap';
      const expected = checkpoints.get(this.frame);
      if (expected !== undefined && checksumMatch(this.match) !== expected) return 'desync';
      const p1 = p1Masks.get(this.frame); const p2 = p2Masks.get(this.frame);
      if (p1 === undefined || p2 === undefined) return 'gap';
      this.match = stepMatch(this.match, decodeInputFrame(p1), decodeInputFrame(p2), 1 / 60);
      this.frame += 1;
      const minimum = this.frame - 600;
      for (const frame of p1Masks.keys()) if (frame < minimum) { p1Masks.delete(frame); p2Masks.delete(frame); checkpoints.delete(frame); }
      return 'advanced';
    }
  };
}

function PublicTournamentState({ icon, title, detail, actions }: { icon: ReactNode; title: string; detail: string; actions?: ReactNode }) {
  return <main className="public-tournament-state"><div className="public-state-icon">{icon}</div><h1>{title}</h1><p>{detail}</p>{actions && <div className="public-state-actions">{actions}</div>}<small>K.O.R.E {KORE_APP_VERSION}</small></main>;
}

function findEntry(tournament: TournamentPublicView, id?: string) { return tournament.entries.find((entry) => entry.id === id); }
function entryName(tournament: TournamentPublicView, id?: string) { return findEntry(tournament, id)?.displayName ?? 'TBD'; }
function tournamentUrl(tournament: TournamentPublicView) { return `/tournaments/${encodeURIComponent(tournament.slug)}`; }
function roundLabel(round: number, matches: PublicTournamentMatch[]) { const total = Math.max(1, ...matches.map((match) => match.round)); return round === total ? 'Final' : round === total - 1 ? 'Semifinals' : `Round ${round}`; }
async function shareTournament(tournament: TournamentPublicView) { const url = `${location.origin}${tournamentUrl(tournament)}`; const result = await shareSpectatorLink(tournament.name, `Watch ${tournament.name} live on K.O.R.E.`, url); return result === 'copied' ? 'Link Copied' : 'Share Tournament'; }
async function shareMatch(tournament: TournamentPublicView, match: PublicTournamentMatch) { const url = `${location.origin}${tournamentUrl(tournament)}/matches/${encodeURIComponent(match.id)}`; const result = await shareSpectatorLink(`${entryName(tournament, match.entryAId)} vs ${entryName(tournament, match.entryBId)}`, `Watch this match live in ${tournament.name}.`, url); return result === 'copied' ? 'Link Copied' : 'Share Match'; }

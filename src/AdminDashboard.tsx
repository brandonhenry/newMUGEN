import { RotateCcw, Terminal } from 'lucide-react';
import { useCallback, useState } from 'react';

type AdminStatus = { kind: 'idle' | 'success' | 'error'; message: string };
type TournamentReviewRow = {
  tournamentId: string;
  kind: string;
  matchId: string;
  reportState?: string;
  roomStatus?: string;
  entryA?: { id: string; displayName: string } | null;
  entryB?: { id: string; displayName: string } | null;
};
type OfficialTournamentAdmin = {
  id: string;
  name: string;
  status: string;
  startsAt?: number;
  registrationOpensAt?: number;
  entries: Array<{
    id: string;
    displayName: string;
    seed: number;
    registrationState?: string;
    waitlistPosition?: number;
    checkedInAt?: number;
    joinedAt: number;
  }>;
};

export function isAdminLocalDevHost() {
  if (typeof window === 'undefined') return false;
  const isViteDev = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
  return isViteDev && ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(window.location.hostname);
}

function toDateTimeLocal(timestamp: number) {
  const date = new Date(timestamp);
  const local = new Date(timestamp - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function AdminDashboard() {
  const localDev = isAdminLocalDevHost();
  const [status, setStatus] = useState<AdminStatus>({ kind: 'idle', message: 'Tournament administration only. Product analytics now lives in PostHog.' });
  const [tournamentReviews, setTournamentReviews] = useState<TournamentReviewRow[]>([]);
  const [tournamentReviewsLoading, setTournamentReviewsLoading] = useState(false);
  const [officialTournament, setOfficialTournament] = useState<OfficialTournamentAdmin | null>(null);
  const [officialAdminToken, setOfficialAdminToken] = useState(() => typeof window === 'undefined' ? '' : window.sessionStorage.getItem('kore:official-admin-token') ?? '');
  const [officialEventName, setOfficialEventName] = useState('');
  const [officialStartAt, setOfficialStartAt] = useState('');
  const [officialRegistrationAt, setOfficialRegistrationAt] = useState('');
  const [officialSeedOrder, setOfficialSeedOrder] = useState('');
  const [officialLoading, setOfficialLoading] = useState(false);

  const refreshTournamentReviews = useCallback(async () => {
    setTournamentReviewsLoading(true);
    setStatus({ kind: 'idle', message: 'Refreshing tournament reviews…' });
    try {
      const response = await fetch('/.netlify/functions/tournament-admin-reviews', { headers: officialAdminToken ? { authorization: `Bearer ${officialAdminToken}` } : undefined });
      const payload = await response.json().catch(() => null) as { reviews?: TournamentReviewRow[]; message?: string } | null;
      if (!response.ok) throw new Error(payload?.message || `Tournament reviews failed (${response.status})`);
      setTournamentReviews(Array.isArray(payload?.reviews) ? payload.reviews : []);
      setStatus({ kind: 'success', message: 'Tournament reviews refreshed.' });
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Tournament reviews failed.' });
    } finally {
      setTournamentReviewsLoading(false);
    }
  }, [officialAdminToken]);

  const resolveTournamentReview = useCallback(async (review: TournamentReviewRow, winnerEntryId: string) => {
    setTournamentReviewsLoading(true);
    setStatus({ kind: 'idle', message: 'Resolving tournament review…' });
    try {
      const response = await fetch('/.netlify/functions/tournament-admin-resolve-match', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(officialAdminToken ? { authorization: `Bearer ${officialAdminToken}` } : {}) },
        body: JSON.stringify({ tournamentId: review.tournamentId, matchId: review.matchId, winnerEntryId, resolver: 'local-admin', reason: 'local_admin_review' })
      });
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message || `Resolve failed (${response.status})`);
      setTournamentReviews((current) => current.filter((candidate) => candidate.tournamentId !== review.tournamentId || candidate.matchId !== review.matchId));
      setStatus({ kind: 'success', message: 'Tournament review resolved.' });
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Tournament review resolve failed.' });
    } finally {
      setTournamentReviewsLoading(false);
    }
  }, [officialAdminToken]);

  const runOfficialAdminAction = useCallback(async (action?: string, extra: Record<string, unknown> = {}) => {
    setOfficialLoading(true);
    setStatus({ kind: 'idle', message: action ? `Running official event action: ${action}…` : 'Loading official event…' });
    try {
      if (officialAdminToken) window.sessionStorage.setItem('kore:official-admin-token', officialAdminToken);
      const response = await fetch('/.netlify/functions/tournament-admin-official', {
        method: action ? 'POST' : 'GET',
        headers: { 'content-type': 'application/json', ...(officialAdminToken ? { authorization: `Bearer ${officialAdminToken}` } : {}) },
        ...(action ? { body: JSON.stringify({ action, ...(action === 'create' ? {} : { id: officialTournament?.id }), ...extra }) } : {})
      });
      const payload = await response.json().catch(() => null) as { tournament?: OfficialTournamentAdmin; message?: string } | null;
      if (!response.ok || !payload?.tournament) throw new Error(payload?.message || `Official event request failed (${response.status})`);
      const tournament = payload.tournament;
      setOfficialTournament(tournament);
      setOfficialEventName(tournament.name || '');
      setOfficialStartAt(tournament.startsAt ? toDateTimeLocal(tournament.startsAt) : '');
      setOfficialRegistrationAt(tournament.registrationOpensAt ? toDateTimeLocal(tournament.registrationOpensAt) : '');
      setOfficialSeedOrder(tournament.entries.filter((entry) => entry.registrationState === 'confirmed').sort((a, b) => a.seed - b.seed).map((entry) => entry.id).join('\n'));
      setStatus({ kind: 'success', message: action ? `Official event ${action} completed.` : 'Official event loaded.' });
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Official event request failed.' });
    } finally {
      setOfficialLoading(false);
    }
  }, [officialAdminToken, officialTournament?.id]);

  if (!localDev) return <main className="admin-shell admin-guard"><section className="admin-guard-panel"><Terminal size={28} /><h1>KORE Admin</h1><p>This dashboard only works on local Vite dev hosts.</p></section></main>;

  return <main className="admin-shell">
    <header className="admin-header"><div><span className="admin-kicker">Local Dev</span><h1>KORE Tournament Admin</h1></div></header>
    <p className={`admin-status ${status.kind}`}>{status.message}</p>
    <section className="admin-endpoint-setup official-admin-panel" aria-label="Official tournament controls">
      <div className="admin-section-heading"><div><h2>K.O.R.E. Official Event</h2><span>{officialTournament ? `${officialTournament.status} · ${officialTournament.entries.length} registrations` : 'Load the reusable official event series'}</span></div><button className="secondary-button" onClick={() => void runOfficialAdminAction()} disabled={officialLoading}><RotateCcw size={18} /> {officialLoading ? 'Working' : 'Load Event'}</button></div>
      <div className="admin-config">
        <label><span>Admin token</span><input type="password" value={officialAdminToken} onChange={(event) => setOfficialAdminToken(event.target.value)} placeholder="TOURNAMENT_ADMIN_TOKEN" autoComplete="off" data-analytics-private="true" /></label>
        <label><span>Event name</span><input value={officialEventName} onChange={(event) => setOfficialEventName(event.target.value)} placeholder="K.O.R.E. Official Tournament" /></label>
        <label><span>New start time</span><input type="datetime-local" value={officialStartAt} onChange={(event) => setOfficialStartAt(event.target.value)} /></label>
        <label><span>Registration opens</span><input type="datetime-local" value={officialRegistrationAt} onChange={(event) => setOfficialRegistrationAt(event.target.value)} /></label>
        <div className="admin-config-actions">
          <button className="secondary-button" disabled={!officialEventName || !officialStartAt || officialLoading} onClick={() => void runOfficialAdminAction('create', { name: officialEventName, startsAt: new Date(officialStartAt).getTime(), registrationOpensAt: officialRegistrationAt ? new Date(officialRegistrationAt).getTime() : undefined })}>Create Next Event</button>
          <button className="secondary-button" disabled={!officialTournament || officialLoading} onClick={() => void runOfficialAdminAction('update', { name: officialEventName })}>Update Event Name</button>
          <button className="secondary-button" disabled={!officialTournament || !officialStartAt || officialLoading} onClick={() => void runOfficialAdminAction('reschedule', { startsAt: new Date(officialStartAt).getTime(), registrationOpensAt: officialRegistrationAt ? new Date(officialRegistrationAt).getTime() : undefined })}>Reschedule</button>
          <button className="secondary-button" disabled={!officialTournament || officialLoading} onClick={() => void runOfficialAdminAction('confirmFunding')}>Confirm $100 Funded</button>
          <button className="secondary-button" disabled={!officialTournament || officialLoading} onClick={() => void runOfficialAdminAction('confirmLegal')}>Confirm Rules Approved</button>
          <button className="secondary-button" disabled={!officialTournament || officialLoading} onClick={() => void runOfficialAdminAction('confirmEmail')}>Confirm Email Delivery</button>
          <button className="secondary-button" disabled={!officialTournament || officialLoading} onClick={() => void runOfficialAdminAction('publish')}>Publish</button>
          <button className="secondary-button" disabled={!officialTournament || officialLoading} onClick={() => void runOfficialAdminAction('postpone')}>Postpone</button>
          <button className="primary-button" disabled={!officialTournament || officialLoading} onClick={() => void runOfficialAdminAction('start')}>Start at 32</button>
        </div>
      </div>
      {officialTournament && <><label className="official-admin-seeds"><span>Seed order (one entry id per line)</span><textarea value={officialSeedOrder} onChange={(event) => setOfficialSeedOrder(event.target.value)} rows={7} /><button className="secondary-button" disabled={officialLoading} onClick={() => void runOfficialAdminAction('seed', { entryIds: officialSeedOrder.split(/\s+/).filter(Boolean) })}>Save Seeding</button></label><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Seed</th><th>Player</th><th>Registration</th><th>Check-in</th></tr></thead><tbody>{[...officialTournament.entries].sort((a, b) => a.joinedAt - b.joinedAt).map((entry) => <tr key={entry.id}><td>{entry.seed || '—'}</td><td data-analytics-private="true">{entry.displayName}</td><td>{entry.registrationState}{entry.waitlistPosition ? ` #${entry.waitlistPosition}` : ''}</td><td>{entry.checkedInAt ? new Date(entry.checkedInAt).toLocaleTimeString() : 'Not checked in'}</td></tr>)}</tbody></table></div></>}
    </section>
    <section className="admin-endpoint-setup" aria-label="Tournament reviews">
      <div className="admin-section-heading"><h2>Tournament Reviews</h2><button className="secondary-button" onClick={() => void refreshTournamentReviews()} disabled={tournamentReviewsLoading}><RotateCcw size={18} />{tournamentReviewsLoading ? 'Refreshing' : 'Refresh Reviews'}</button></div>
      {tournamentReviews.length === 0 ? <div className="admin-empty">No tournament matches need review.</div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Tournament</th><th>Match</th><th>Status</th><th>Resolve</th></tr></thead><tbody>{tournamentReviews.map((review) => <tr key={`${review.tournamentId}:${review.matchId}`}><td>{review.kind} {review.tournamentId}</td><td>{review.matchId}</td><td>{review.reportState || review.roomStatus || 'review'}</td><td>{review.entryA && <button data-analytics-private="true" className="secondary-button compact-button" onClick={() => void resolveTournamentReview(review, review.entryA!.id)} disabled={tournamentReviewsLoading}>{review.entryA.displayName}</button>}{review.entryB && <button data-analytics-private="true" className="secondary-button compact-button" onClick={() => void resolveTournamentReview(review, review.entryB!.id)} disabled={tournamentReviewsLoading}>{review.entryB.displayName}</button>}</td></tr>)}</tbody></table></div>}
    </section>
  </main>;
}

export default AdminDashboard;

import { BarChart3, CheckCircle2, Gauge, KeyRound, RotateCcw, Save, Terminal, Trash2 } from 'lucide-react';
import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  type AdminAnalyticsConfig,
  captureAnalyticsEvent,
  clearAdminAnalyticsConfig,
  initializeAnalytics,
  isAnalyticsInitialized,
  readAdminAnalyticsConfig,
  writeAdminAnalyticsConfig
} from './lib/analytics';
import {
  type AdminDashboardData,
  ADMIN_ENDPOINT_SPECS,
  type AdminEndpointSpec,
  type AdminQueryName,
  buildPostHogEndpointRequest,
  getEndpointStatus,
  hasAnyConfiguredEndpoint,
  makeEndpointErrorResult,
  makeMissingEndpointResult,
  normalizeEndpointResult,
  summarizeDashboardRatios
} from './lib/adminAnalytics';

type AdminStatus = {
  kind: 'idle' | 'success' | 'error';
  message: string;
};

const adminQueryLabels: Record<AdminQueryName, string> = {
  summary: 'Summary',
  trends: 'Growth',
  events: 'Events',
  modes: 'Modes',
  comboRoutes: 'Combo Routes',
  training: 'Training',
  miniGames: 'Mini-Games',
  arcade: 'Arcade',
  online: 'Online',
  quality: 'Quality'
};

const targetBands = [
  { label: 'D1 retention', good: '25-35%', strong: '35-40%+' },
  { label: 'D7 retention', good: '7-12%', strong: '12-15%+' },
  { label: 'D30 retention', good: '3-6%', strong: '6%+' },
  { label: 'DAU/MAU stickiness', good: '20-30%', strong: '30%+' },
  { label: 'Qualified sessions / visits', good: '60-75%', strong: '75%+' },
  { label: 'Beginner trials', good: '60-80%', strong: '80%+' },
  { label: 'Intermediate trials', good: '30-55%', strong: '55%+' },
  { label: 'Advanced trials', good: '15-35%', strong: '35%+' },
  { label: 'Expert trials', good: '5-15%', strong: '15%+' },
  { label: 'Mini-game wins', good: '40-60%', strong: '60%+' },
  { label: 'Arcade normal clears', good: '35-60%', strong: '60%+' },
  { label: 'Arcade hard clears', good: '10-30%', strong: '30%+' }
];

const queryOrder: AdminQueryName[] = ['trends', 'events', 'modes', 'arcade', 'comboRoutes', 'training', 'miniGames', 'online', 'quality'];
const ADMIN_SNAPSHOT_HISTORY_STORAGE_KEY = 'kore:admin-snapshot-history:v1';

type AdminSnapshot = {
  date: string;
  visits: number;
  dau: number;
  wau: number;
  mau: number;
  qualifiedSessions: number;
  activationRate: number;
  stickiness: number;
};

export function isAdminLocalDevHost() {
  if (typeof window === 'undefined') return false;
  const isViteDev = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
  return isViteDev && ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(window.location.hostname);
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value);
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0%';
  return `${formatNumber(value * 100)}%`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  if (seconds < 60) return `${formatNumber(seconds)}s`;
  return `${formatNumber(seconds / 60)}m`;
}

function getColumnLabel(column: unknown) {
  if (typeof column === 'string') return column;
  if (column && typeof column === 'object') {
    const named = column as { name?: unknown; key?: unknown };
    if (typeof named.name === 'string') return named.name;
    if (typeof named.key === 'string') return named.key;
  }
  return 'value';
}

function readSnapshotHistory(): AdminSnapshot[] {
  try {
    const raw = window.localStorage.getItem(ADMIN_SNAPSHOT_HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(cleanSnapshot).filter((snapshot): snapshot is AdminSnapshot => Boolean(snapshot));
  } catch {
    return [];
  }
}

function cleanSnapshot(value: unknown): AdminSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const date = typeof record.date === 'string' ? record.date : '';
  if (!date) return null;
  return {
    date,
    visits: Number(record.visits) || 0,
    dau: Number(record.dau) || 0,
    wau: Number(record.wau) || 0,
    mau: Number(record.mau) || 0,
    qualifiedSessions: Number(record.qualifiedSessions) || 0,
    activationRate: Number(record.activationRate) || 0,
    stickiness: Number(record.stickiness) || 0
  };
}

function writeSnapshotHistory(snapshots: AdminSnapshot[]) {
  window.localStorage.setItem(ADMIN_SNAPSHOT_HISTORY_STORAGE_KEY, JSON.stringify(snapshots.slice(-120)));
}

function upsertSnapshot(history: AdminSnapshot[], snapshot: AdminSnapshot) {
  const next = history.filter((entry) => entry.date !== snapshot.date);
  next.push(snapshot);
  return next.sort((a, b) => a.date.localeCompare(b.date)).slice(-120);
}

function makeSnapshot(data: AdminDashboardData): AdminSnapshot {
  const ratios = summarizeDashboardRatios(data);
  return {
    date: new Date(data.refreshedAt).toISOString().slice(0, 10),
    visits: ratios.visits,
    dau: ratios.dau,
    wau: ratios.wau,
    mau: ratios.mau,
    qualifiedSessions: ratios.qualifiedSessions,
    activationRate: ratios.activationRate,
    stickiness: ratios.stickiness
  };
}

async function queryPostHogEndpoint(config: AdminAnalyticsConfig, name: AdminQueryName) {
  const request = buildPostHogEndpointRequest(config, name);
  if (!request) return makeMissingEndpointResult(name);
  const response = await fetch('/__kore/dev/posthog-endpoint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });
  const payload = await response.json().catch(() => null) as { error?: string; payload?: unknown } | null;
  if (!response.ok) {
    return makeEndpointErrorResult(name, payload?.error || `Endpoint failed (${response.status})`);
  }
  return normalizeEndpointResult(name, payload?.payload ?? payload);
}

export function AdminDashboard() {
  const localDev = isAdminLocalDevHost();
  const [config, setConfig] = useState<AdminAnalyticsConfig>(() => readAdminAnalyticsConfig());
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [status, setStatus] = useState<AdminStatus>({ kind: 'idle', message: 'Set PostHog keys, then refresh for live stats.' });
  const [activeTable, setActiveTable] = useState<AdminQueryName>('trends');
  const [refreshing, setRefreshing] = useState(false);
  const [snapshotHistory, setSnapshotHistory] = useState<AdminSnapshot[]>(() => readSnapshotHistory());

  const readReady = hasAnyConfiguredEndpoint(config);
  const ratios = useMemo(() => data ? summarizeDashboardRatios(data) : null, [data]);

  const updateConfig = (key: keyof AdminAnalyticsConfig) => (event: ChangeEvent<HTMLInputElement>) => {
    setConfig((current) => ({ ...current, [key]: event.target.value }));
  };
  const updateEndpointPath = (name: AdminQueryName) => (event: ChangeEvent<HTMLInputElement>) => {
    setConfig((current) => ({
      ...current,
      endpointPaths: {
        ...current.endpointPaths,
        [name]: event.target.value
      }
    }));
  };

  const saveConfig = useCallback(() => {
    const saved = writeAdminAnalyticsConfig(config);
    setConfig(saved);
    if (!saved.projectToken) {
      setStatus({ kind: 'success', message: 'Saved read settings. Add a project token to enable capture from local visits.' });
      return;
    }
    const wasInitialized = isAnalyticsInitialized();
    initializeAnalytics({ key: saved.projectToken, host: saved.captureHost });
    captureAnalyticsEvent('screen_viewed', { screen: 'admin', source: 'admin_dashboard' });
    setStatus({
      kind: 'success',
      message: wasInitialized
        ? 'Saved. Analytics was already initialized; reload to apply changed capture tokens.'
        : 'Saved. Analytics capture is active for this local session.'
    });
  }, [config]);

  const clearConfig = useCallback(() => {
    setConfig(clearAdminAnalyticsConfig());
    setData(null);
    setSnapshotHistory([]);
    window.localStorage.removeItem(ADMIN_SNAPSHOT_HISTORY_STORAGE_KEY);
    setStatus({ kind: 'success', message: 'Cleared local admin keys.' });
  }, []);

  const refresh = useCallback(async (singleQuery?: AdminQueryName) => {
    if (!hasAnyConfiguredEndpoint(config)) {
      setStatus({ kind: 'error', message: 'Add at least one PostHog Endpoint path to read stats.' });
      return;
    }
    setRefreshing(true);
    setStatus({ kind: 'idle', message: singleQuery ? 'Testing endpoint...' : 'Refreshing endpoint stats...' });
    try {
      const names = singleQuery ? [singleQuery] : ADMIN_ENDPOINT_SPECS.map((spec) => spec.name);
      const results = await Promise.all(names.map((name) => queryPostHogEndpoint(config, name)));
      const refreshedData: AdminDashboardData = {
        refreshedAt: new Date().toISOString(),
        results: {
          ...(data?.results ?? {}),
          ...Object.fromEntries(results.map((result) => [result.name, result]))
        }
      };
      setData(refreshedData);
      if (!singleQuery) {
        const nextHistory = upsertSnapshot(snapshotHistory, makeSnapshot(refreshedData));
        setSnapshotHistory(nextHistory);
        writeSnapshotHistory(nextHistory);
      }
      const failures = results.filter((result) => result.error).length;
      const missing = results.filter((result) => result.missing).length;
      setStatus({
        kind: failures > 0 ? 'error' : 'success',
        message: singleQuery
          ? failures > 0 ? 'Endpoint test failed.' : 'Endpoint test complete.'
          : failures > 0
            ? `Stats refreshed with ${failures} endpoint error${failures === 1 ? '' : 's'}.`
            : missing > 0
              ? `Stats refreshed. ${missing} endpoint path${missing === 1 ? '' : 's'} missing.`
              : 'Stats refreshed.'
      });
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'PostHog refresh failed.' });
    } finally {
      setRefreshing(false);
    }
  }, [config, data?.results, snapshotHistory]);

  useEffect(() => {
    if (!localDev) return;
    captureAnalyticsEvent('screen_viewed', { screen: 'admin', source: 'admin_dashboard' });
  }, [localDev]);

  useEffect(() => {
    if (!localDev || !readReady || data) return;
    void refresh();
  }, [data, localDev, readReady, refresh]);

  if (!localDev) {
    return (
      <main className="admin-shell admin-guard">
        <section className="admin-guard-panel">
          <Terminal size={28} />
          <h1>KORE Admin</h1>
          <p>This dashboard only works on local Vite dev hosts.</p>
        </section>
      </main>
    );
  }

  const refreshedLabel = data?.refreshedAt ? new Date(data.refreshedAt).toLocaleString() : 'Never';
  const activeResult = data?.results[activeTable];

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <span className="admin-kicker">Local Dev</span>
          <h1>KORE Admin</h1>
        </div>
        <div className="admin-header-actions">
          <span>Last refresh: <strong>{refreshedLabel}</strong></span>
          <button className="primary-button" onClick={() => void refresh()} disabled={refreshing || !readReady}>
            <RotateCcw size={18} />
            Refresh
          </button>
        </div>
      </header>

      <section className="admin-config" aria-label="PostHog settings">
        <label>
          <span>Project token</span>
          <input value={config.projectToken} onChange={updateConfig('projectToken')} type="password" placeholder="phc_..." autoComplete="off" />
        </label>
        <label>
          <span>Capture host</span>
          <input value={config.captureHost} onChange={updateConfig('captureHost')} placeholder="https://us.i.posthog.com" />
        </label>
        <label>
          <span>Endpoint token</span>
          <input value={config.endpointToken} onChange={updateConfig('endpointToken')} type="password" placeholder="Optional endpoint token" autoComplete="off" />
        </label>
        <div className="admin-config-actions">
          <button className="primary-button" onClick={saveConfig}>
            <Save size={18} />
            Save
          </button>
          <button className="secondary-button" onClick={() => void refresh()} disabled={refreshing || !readReady}>
            <KeyRound size={18} />
            Test Endpoints
          </button>
          <button className="secondary-button" onClick={clearConfig}>
            <Trash2 size={18} />
            Clear Keys
          </button>
        </div>
      </section>

      <p className={`admin-status ${status.kind}`}>{status.message}</p>

      <section className="admin-endpoint-setup" aria-label="PostHog endpoint setup">
        <div className="admin-section-heading">
          <h2>Endpoint Setup</h2>
          <span>PostHog project 492693</span>
        </div>
        <div className="admin-endpoint-list">
          {ADMIN_ENDPOINT_SPECS.map((spec) => (
            <AdminEndpointRow
              key={spec.name}
              spec={spec}
              value={config.endpointPaths[spec.name] ?? ''}
              status={getEndpointStatus(config, data?.results[spec.name], spec.name)}
              onChange={updateEndpointPath(spec.name)}
              onTest={() => void refresh(spec.name)}
              testing={refreshing}
            />
          ))}
        </div>
      </section>

      <section className="admin-kpi-grid" aria-label="KORE dashboard stats">
        <AdminKpi icon={<BarChart3 size={18} />} label="Visits" value={formatNumber(ratios?.visits ?? 0)} />
        <AdminKpi icon={<Gauge size={18} />} label="DAU" value={formatNumber(ratios?.dau ?? 0)} />
        <AdminKpi icon={<Gauge size={18} />} label="WAU" value={formatNumber(ratios?.wau ?? 0)} />
        <AdminKpi icon={<Gauge size={18} />} label="MAU" value={formatNumber(ratios?.mau ?? 0)} />
        <AdminKpi icon={<CheckCircle2 size={18} />} label="DAU/MAU" value={formatPercent(ratios?.stickiness ?? 0)} target="Good 20-30%" />
        <AdminKpi icon={<BarChart3 size={18} />} label="Sessions" value={formatNumber(ratios?.sessions ?? 0)} />
        <AdminKpi icon={<CheckCircle2 size={18} />} label="Qualified Sessions" value={formatNumber(ratios?.qualifiedSessions ?? 0)} target="Good 60-75% of visits" />
        <AdminKpi icon={<CheckCircle2 size={18} />} label="Activation" value={formatPercent(ratios?.activationRate ?? 0)} />
        <AdminKpi icon={<Gauge size={18} />} label="Avg Match" value={formatDuration(ratios?.avgMatchSeconds ?? 0)} />
      </section>

      <section className="admin-growth-grid" aria-label="Growth charts">
        <AdminLineChart title="Daily Active Players" rows={data?.results.trends?.rows ?? []} xIndex={0} yIndex={2} color="#2ee6ff" />
        <AdminLineChart title="Qualified Sessions" rows={data?.results.trends?.rows ?? []} xIndex={0} yIndex={3} color="#7dffbc" />
        <AdminLineChart title="Visits" rows={data?.results.trends?.rows ?? []} xIndex={0} yIndex={1} color="#ffcf5a" />
        <AdminLineChart
          title="Saved Refresh History"
          rows={snapshotHistory.map((snapshot) => [snapshot.date, snapshot.mau])}
          xIndex={0}
          yIndex={1}
          color="#ff8bff"
          emptyLabel="Refresh stats over multiple days to build local history."
        />
      </section>

      <section className="admin-main-grid">
        <section className="admin-targets" aria-label="Target bands">
          <div className="admin-section-heading">
            <h2>Targets</h2>
            <span>PlayKore notes</span>
          </div>
          <div className="admin-target-list">
            {targetBands.map((target) => (
              <article key={target.label} className="admin-target-row">
                <strong>{target.label}</strong>
                <span>Good {target.good}</span>
                <span>Strong {target.strong}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="admin-tables" aria-label="Metric tables">
          <div className="admin-tabs" role="tablist" aria-label="Metric families">
            {queryOrder.map((name) => (
              <button key={name} className={activeTable === name ? 'active' : ''} onClick={() => setActiveTable(name)}>
                {adminQueryLabels[name]}
              </button>
            ))}
          </div>
          <AdminTable result={activeResult} emptyLabel={readReady ? 'Press Refresh for fresh stats.' : 'Add the endpoint path for this section.'} />
        </section>
      </section>
    </main>
  );
}

function AdminEndpointRow({
  spec,
  value,
  status,
  onChange,
  onTest,
  testing
}: {
  spec: AdminEndpointSpec;
  value: string;
  status: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onTest: () => void;
  testing: boolean;
}) {
  const healthy = status === 'Ready';
  const missing = status === 'Missing endpoint path';
  return (
    <article className="admin-endpoint-row">
      <div>
        <strong>{spec.endpointName}</strong>
        <small>{spec.purpose}</small>
        <span>{spec.expectedColumns.join(', ')}</span>
      </div>
      <input value={value} onChange={onChange} placeholder="/api/projects/492693/endpoints/..." aria-label={`${spec.endpointName} endpoint path`} />
      <button className="secondary-button" onClick={onTest} disabled={testing || !value.trim()}>
        <KeyRound size={16} />
        Test
      </button>
      <em className={healthy ? 'ready' : missing ? 'missing' : 'error'}>{status}</em>
    </article>
  );
}

function AdminKpi({ icon, label, value, target }: { icon: JSX.Element; label: string; value: string; target?: string }) {
  return (
    <article className="admin-kpi">
      <div className="admin-kpi-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      {target && <small>{target}</small>}
    </article>
  );
}

function AdminLineChart({
  title,
  rows,
  xIndex,
  yIndex,
  color,
  emptyLabel = 'Refresh for daily trend data.'
}: {
  title: string;
  rows: unknown[][];
  xIndex: number;
  yIndex: number;
  color: string;
  emptyLabel?: string;
}) {
  const points = rows
    .map((row) => ({
      label: String(row[xIndex] ?? ''),
      value: Number(row[yIndex]) || 0
    }))
    .filter((point) => point.label);
  const width = 420;
  const height = 150;
  const padding = 18;
  const max = Math.max(1, ...points.map((point) => point.value));
  const coordinates = points.map((point, index) => {
    const x = points.length <= 1 ? width / 2 : padding + (index / (points.length - 1)) * (width - padding * 2);
    const y = height - padding - (point.value / max) * (height - padding * 2);
    return { ...point, x, y };
  });
  const path = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  const latest = points[points.length - 1]?.value ?? 0;
  const previous = points[points.length - 2]?.value ?? 0;
  const delta = latest - previous;
  return (
    <article className="admin-chart">
      <header>
        <div>
          <h2>{title}</h2>
          <span>{points[0]?.label ?? 'No data'} - {points[points.length - 1]?.label ?? 'No data'}</span>
        </div>
        <strong>{formatNumber(latest)}</strong>
      </header>
      {points.length === 0 ? (
        <div className="admin-chart-empty">{emptyLabel}</div>
      ) : (
        <>
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} chart`}>
            <path className="admin-chart-gridline" d={`M ${padding} ${height - padding} L ${width - padding} ${height - padding}`} />
            <path className="admin-chart-gridline" d={`M ${padding} ${padding} L ${width - padding} ${padding}`} />
            <path className="admin-chart-line-glow" d={path} style={{ stroke: color }} />
            <path className="admin-chart-line" d={path} style={{ stroke: color }} />
            {coordinates.map((point) => (
              <circle key={`${point.label}-${point.x}`} cx={point.x} cy={point.y} r="3.5" style={{ fill: color }} />
            ))}
          </svg>
          <footer>
            <span>Peak {formatNumber(max)}</span>
            <span className={delta >= 0 ? 'positive' : 'negative'}>{delta >= 0 ? '+' : ''}{formatNumber(delta)} vs prior</span>
          </footer>
        </>
      )}
    </article>
  );
}

function AdminTable({ result, emptyLabel }: { result?: { columns: string[]; rows: unknown[][]; error?: string; missing?: boolean }; emptyLabel: string }) {
  if (result?.error) {
    return <div className="admin-empty admin-empty-error">{result.error}</div>;
  }
  if (result?.missing) {
    return <div className="admin-empty">Missing endpoint path for this section.</div>;
  }
  if (!result || result.rows.length === 0) {
    return <div className="admin-empty">{emptyLabel}</div>;
  }
  const columns = result.columns.length > 0 ? result.columns : result.rows[0].map((_, index) => `Column ${index + 1}`);
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {columns.map((column) => <th key={column}>{column.replace(/_/g, ' ')}</th>)}
          </tr>
        </thead>
        <tbody>
          {result.rows.slice(0, 40).map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column, columnIndex) => (
                <td key={`${column}-${columnIndex}`}>{formatCell(row[columnIndex])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(value: unknown) {
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (value === null || value === undefined || value === '') return '0';
  return String(value);
}

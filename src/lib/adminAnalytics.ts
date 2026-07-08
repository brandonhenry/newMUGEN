import { DEFAULT_POSTHOG_APP_HOST, type AdminAnalyticsConfig } from './analytics';

export type AdminQueryName =
  | 'summary'
  | 'trends'
  | 'events'
  | 'modes'
  | 'comboRoutes'
  | 'training'
  | 'miniGames'
  | 'arcade'
  | 'online'
  | 'quality';

export type AdminQueryResult = {
  name: AdminQueryName;
  columns: string[];
  rows: unknown[][];
  error?: string;
  missing?: boolean;
};

export type AdminDashboardData = {
  refreshedAt: string;
  results: Partial<Record<AdminQueryName, AdminQueryResult>>;
};

export type AdminEndpointSpec = {
  name: AdminQueryName;
  endpointName: string;
  label: string;
  purpose: string;
  expectedColumns: string[];
};

export type AdminEndpointRequest = {
  endpointUrl: string;
  endpointToken?: string;
};

export const ADMIN_ENDPOINT_SPECS: AdminEndpointSpec[] = [
  {
    name: 'summary',
    endpointName: 'kore_admin_summary',
    label: 'Summary',
    purpose: 'Top KPI cards',
    expectedColumns: ['metric', 'value']
  },
  {
    name: 'trends',
    endpointName: 'kore_admin_trends',
    label: 'Growth',
    purpose: 'Daily growth charts',
    expectedColumns: ['day', 'visits', 'active_players', 'qualified_sessions', 'combo_routes', 'training_completions', 'minigame_completions', 'arcade_matches']
  },
  {
    name: 'events',
    endpointName: 'kore_admin_events',
    label: 'Events',
    purpose: 'Event coverage table',
    expectedColumns: ['event', 'total_events', 'unique_players']
  },
  {
    name: 'modes',
    endpointName: 'kore_admin_modes',
    label: 'Modes',
    purpose: 'Mode popularity',
    expectedColumns: ['mode', 'total_events', 'unique_players']
  },
  {
    name: 'arcade',
    endpointName: 'kore_admin_arcade',
    label: 'Arcade',
    purpose: 'Arcade starts, completions, milestones',
    expectedColumns: ['arcade_signal', 'starts', 'match_completions', 'milestones', 'players']
  },
  {
    name: 'comboRoutes',
    endpointName: 'kore_admin_combo_routes',
    label: 'Combo Routes',
    purpose: 'Combo route usage and depth',
    expectedColumns: ['route_key', 'completions', 'players', 'avg_hits', 'avg_damage', 'launcher_routes', 'tornado_routes', 'ki_burst_routes']
  },
  {
    name: 'training',
    endpointName: 'kore_admin_training',
    label: 'Training',
    purpose: 'Trial completion and difficulty tuning',
    expectedColumns: ['difficulty', 'category', 'starts', 'completions', 'completing_players']
  },
  {
    name: 'miniGames',
    endpointName: 'kore_admin_minigames',
    label: 'Mini-Games',
    purpose: 'Mini-game starts, completions, scores',
    expectedColumns: ['game_id', 'starts', 'completions', 'players', 'avg_score', 'best_score']
  },
  {
    name: 'online',
    endpointName: 'kore_admin_online',
    label: 'Online',
    purpose: 'Online, ranked, private, leaderboard, tournament activity',
    expectedColumns: ['event', 'total_events', 'players']
  },
  {
    name: 'quality',
    endpointName: 'kore_admin_quality',
    label: 'Quality',
    purpose: 'Errors and failed statuses',
    expectedColumns: ['event', 'status', 'total_events', 'players']
  }
];

const DAY_SECONDS = 86400;

export function getAdminEndpointSpec(name: AdminQueryName) {
  return ADMIN_ENDPOINT_SPECS.find((spec) => spec.name === name);
}

export function getConfiguredEndpointPath(config: AdminAnalyticsConfig, name: AdminQueryName) {
  return config.endpointPaths[name]?.trim() ?? '';
}

export function hasConfiguredEndpoint(config: AdminAnalyticsConfig, name: AdminQueryName) {
  return getConfiguredEndpointPath(config, name).length > 0;
}

export function hasAnyConfiguredEndpoint(config: AdminAnalyticsConfig) {
  return ADMIN_ENDPOINT_SPECS.some((spec) => hasConfiguredEndpoint(config, spec.name));
}

export function getEndpointStatus(config: AdminAnalyticsConfig, result: AdminQueryResult | undefined, name: AdminQueryName) {
  if (!hasConfiguredEndpoint(config, name)) return 'Missing endpoint path';
  if (result?.error) return result.error;
  if (result && !result.missing) return 'Ready';
  return 'Not loaded';
}

export function resolvePostHogEndpointUrl(pathOrUrl: string, captureHost = '') {
  const trimmed = pathOrUrl.trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed).toString();
  } catch {
    const host = inferPostHogAppHost(captureHost);
    return new URL(trimmed.startsWith('/') ? trimmed : `/${trimmed}`, host).toString();
  }
}

export function inferPostHogAppHost(captureHost = '') {
  const normalized = captureHost.trim();
  if (normalized.includes('eu.i.posthog.com')) return 'https://eu.posthog.com';
  if (normalized.includes('us.i.posthog.com')) return DEFAULT_POSTHOG_APP_HOST;
  return DEFAULT_POSTHOG_APP_HOST;
}

export function buildPostHogEndpointRequest(config: AdminAnalyticsConfig, name: AdminQueryName): AdminEndpointRequest | null {
  const endpointUrl = resolvePostHogEndpointUrl(getConfiguredEndpointPath(config, name), config.captureHost);
  if (!endpointUrl) return null;
  return {
    endpointUrl,
    endpointToken: config.endpointToken || undefined
  };
}

export function normalizeEndpointResult(name: AdminQueryName, payload: unknown): AdminQueryResult {
  const spec = getAdminEndpointSpec(name);
  const fallbackColumns = spec?.expectedColumns ?? [];
  if (Array.isArray(payload)) {
    return normalizeArrayRows(name, fallbackColumns, payload);
  }
  if (!payload || typeof payload !== 'object') {
    return { name, columns: fallbackColumns, rows: [] };
  }
  const record = payload as Record<string, unknown>;
  const rawRows = firstArray(record.results, record.rows, record.data);
  const rawColumns = firstArray(record.columns, record.fields, record.headers);
  const columns = normalizeColumns(rawColumns, fallbackColumns);
  if (!rawRows) return { name, columns, rows: [] };
  if (rawRows.every((row) => Array.isArray(row))) {
    return { name, columns, rows: rawRows as unknown[][] };
  }
  return normalizeArrayRows(name, columns, rawRows);
}

function normalizeArrayRows(name: AdminQueryName, columns: string[], rawRows: unknown[]): AdminQueryResult {
  if (rawRows.length === 0) return { name, columns, rows: [] };
  if (rawRows.every((row) => Array.isArray(row))) return { name, columns, rows: rawRows as unknown[][] };
  const objectRows = rawRows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)));
  const inferredColumns = columns.length > 0 ? columns : Array.from(new Set(objectRows.flatMap((row) => Object.keys(row))));
  return {
    name,
    columns: inferredColumns,
    rows: objectRows.map((row) => inferredColumns.map((column) => row[column]))
  };
}

function normalizeColumns(rawColumns: unknown[] | null, fallbackColumns: string[]) {
  const columns = rawColumns
    ?.map((column) => {
      if (typeof column === 'string') return column;
      if (column && typeof column === 'object') {
        const record = column as Record<string, unknown>;
        if (typeof record.name === 'string') return record.name;
        if (typeof record.key === 'string') return record.key;
      }
      return '';
    })
    .filter(Boolean) ?? [];
  return columns.length > 0 ? columns : fallbackColumns;
}

function firstArray(...values: unknown[]) {
  return values.find((value): value is unknown[] => Array.isArray(value)) ?? null;
}

export function makeMissingEndpointResult(name: AdminQueryName): AdminQueryResult {
  return {
    name,
    columns: getAdminEndpointSpec(name)?.expectedColumns ?? [],
    rows: [],
    missing: true
  };
}

export function makeEndpointErrorResult(name: AdminQueryName, error: string): AdminQueryResult {
  return {
    name,
    columns: getAdminEndpointSpec(name)?.expectedColumns ?? [],
    rows: [],
    error
  };
}

export function summarizeDashboardRatios(data: AdminDashboardData) {
  const summaryRows = data.results.summary?.rows ?? [];
  const values = new Map(summaryRows.map((row) => [String(row[0]), Number(row[1]) || 0]));
  const visits = values.get('visits') ?? 0;
  const activePlayers = values.get('active_players') ?? 0;
  const dau = values.get('dau') ?? 0;
  const mau = values.get('mau') ?? 0;
  const activatedPlayers = values.get('activated_players') ?? 0;
  const qualifiedSessions = values.get('qualified_play_sessions') ?? 0;
  return {
    visits,
    activePlayers,
    dau,
    wau: values.get('wau') ?? 0,
    mau,
    sessions: values.get('sessions') ?? 0,
    qualifiedSessions,
    qualifiedEvents: values.get('qualified_play_events') ?? 0,
    activationRate: activePlayers > 0 ? activatedPlayers / activePlayers : 0,
    qualifiedSessionRate: visits > 0 ? qualifiedSessions / visits : 0,
    stickiness: mau > 0 ? dau / mau : 0,
    avgMatchSeconds: values.get('avg_match_seconds') ?? 0,
    secondsPerDay: DAY_SECONDS
  };
}

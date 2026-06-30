import posthog from 'posthog-js';
import type { Properties } from 'posthog-js';

export const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';

export type AnalyticsEventName =
  | 'game_load_started'
  | 'game_loaded'
  | 'game_start_clicked'
  | 'character_selected'
  | 'stage_selected'
  | 'match_started'
  | 'round_started'
  | 'round_ended'
  | 'match_completed'
  | 'rematch_clicked'
  | 'fullscreen_clicked'
  | 'mobile_controls_used'
  | 'error_occurred';

export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

type AnalyticsEnvironment = {
  key?: string;
  host?: string;
};

let analyticsInitialized = false;

function readAnalyticsEnvironment(): AnalyticsEnvironment {
  return {
    key: import.meta.env.VITE_POSTHOG_KEY,
    host: import.meta.env.VITE_POSTHOG_HOST
  };
}

function cleanProperties(properties: AnalyticsProperties = {}): Properties {
  return Object.fromEntries(
    Object.entries(properties).filter((entry): entry is [string, string | number | boolean | null] => entry[1] !== undefined)
  );
}

export function initializeAnalytics(environment: AnalyticsEnvironment = readAnalyticsEnvironment()) {
  const key = environment.key?.trim();
  if (!key) return null;
  if (!analyticsInitialized) {
    posthog.init(key, {
      api_host: environment.host?.trim() || DEFAULT_POSTHOG_HOST,
      capture_pageview: true,
      autocapture: false
    });
    analyticsInitialized = true;
  }
  return posthog;
}

export function captureAnalyticsEvent(name: AnalyticsEventName, properties?: AnalyticsProperties) {
  if (!analyticsInitialized) initializeAnalytics();
  if (!analyticsInitialized) return;
  posthog.capture(name, cleanProperties(properties));
}

export function normalizeAnalyticsError(error: unknown) {
  if (error instanceof Error) {
    return {
      error_name: error.name || 'Error',
      error_message: error.message || 'Unknown error',
      error_stack: error.stack
    };
  }
  if (typeof error === 'string') {
    return {
      error_name: 'Error',
      error_message: error
    };
  }
  return {
    error_name: 'Error',
    error_message: 'Unknown error'
  };
}

export function captureAnalyticsError(error: unknown, context: AnalyticsProperties = {}) {
  const normalized = normalizeAnalyticsError(error);
  captureAnalyticsEvent('error_occurred', {
    ...context,
    error_name: normalized.error_name,
    error_message: normalized.error_message
  });
  if (!analyticsInitialized) return;
  posthog.captureException(error, cleanProperties({
    ...context,
    error_name: normalized.error_name,
    error_message: normalized.error_message
  }));
}

import posthog from 'posthog-js';
import type { Properties } from 'posthog-js';

export const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';

export type AnalyticsPropertyValue = string | number | boolean | null | undefined;
export type AnalyticsProperties = Record<string, AnalyticsPropertyValue>;

type BaseEventProperties = AnalyticsProperties;
type MatchProperties = BaseEventProperties & {
  match_id: string;
  mode: string;
};

/**
 * Canonical analytics schema. High-value lifecycle events declare their required
 * fields while lower-value UI events remain extensible during the v2 migration.
 */
export type AnalyticsEventMap = {
  game_load_started: BaseEventProperties;
  game_loaded: BaseEventProperties & { load_duration_ms: number; roster_count: number; stage_count: number; warning_count: number };
  screen_viewed: BaseEventProperties & { screen: string };
  menu_item_selected: BaseEventProperties;
  menu_lag_prompt: BaseEventProperties;
  navigation_clicked: BaseEventProperties;
  game_start_clicked: BaseEventProperties;
  match_mode_changed: BaseEventProperties;
  cpu_difficulty_changed: BaseEventProperties;
  character_target_changed: BaseEventProperties;
  roster_page_changed: BaseEventProperties;
  random_character_toggled: BaseEventProperties;
  character_selected: BaseEventProperties;
  character_picked: BaseEventProperties & { character_id: string; slot: number; actor_type: string; random_pick: boolean };
  stage_browsed: BaseEventProperties;
  random_stage_toggled: BaseEventProperties;
  stage_selected: BaseEventProperties;
  asset_warmup_started: BaseEventProperties & { warmup_id: string; destination: string };
  asset_warmup_completed: BaseEventProperties & { warmup_id: string; destination: string; duration_ms: number };
  asset_warmup_failed: BaseEventProperties & { warmup_id: string; destination: string; duration_ms: number; error_code: string };
  match_started: MatchProperties;
  round_started: MatchProperties & { round: number };
  round_ended: MatchProperties & { round: number; duration_seconds: number };
  match_completed: MatchProperties & {
    match_duration_seconds: number;
    completion_reason: string;
    winner_character_id: string;
    loser_character_id: string;
  };
  match_abandoned: MatchProperties & { elapsed_seconds: number; abandonment_reason: string; phase: string };
  performance_summary: BaseEventProperties & {
    activity_type: string;
    duration_seconds: number;
    average_fps: number;
    p95_frame_ms: number;
    long_frame_count: number;
  };
  combo_route_completed: MatchProperties & {
    route_key: string;
    combo_hits: number;
    combo_damage: number;
    included_launcher: boolean;
    included_tornado: boolean;
    included_ki_burst: boolean;
  };
  positive_milestone_reached: BaseEventProperties & { milestone_type: string };
  rematch_clicked: BaseEventProperties;
  fullscreen_clicked: BaseEventProperties;
  pause_toggled: BaseEventProperties;
  pause_menu_action_clicked: BaseEventProperties;
  move_list_opened: BaseEventProperties;
  move_list_tab_changed: BaseEventProperties;
  training_panel_opened: BaseEventProperties;
  training_mode_changed: BaseEventProperties;
  training_trial_selected: BaseEventProperties & { trial_id: string; trial_category: string; trial_difficulty: number };
  training_trial_previewed: BaseEventProperties;
  training_trial_retried: BaseEventProperties;
  training_trial_started: BaseEventProperties & { trial_id: string; trial_category: string; trial_difficulty: number; attempt_number: number };
  training_trial_completed: BaseEventProperties & { trial_id: string; trial_category: string; trial_difficulty: number; attempt_number: number; completion_duration_seconds: number; first_time_completion: boolean };
  minigame_started: BaseEventProperties & { game_id: string };
  minigame_paused: BaseEventProperties & { game_id: string };
  minigame_completed: BaseEventProperties & { game_id: string; score: number; completion_reason: string; elapsed_seconds: number; objectives_completed: number; new_high_score: boolean };
  minigame_result_continued: BaseEventProperties & { game_id: string };
  arcade_run_started: BaseEventProperties & { run_id: string; starting_lives: number };
  arcade_run_ended: BaseEventProperties & { run_id: string; duration_seconds: number; level: number; score: number; wins: number; lives_remaining: number; end_reason: string };
  leaderboard_loaded: BaseEventProperties;
  online_profile_saved: BaseEventProperties;
  online_search_started: BaseEventProperties & { matchmaking_attempt_id: string; queue: string };
  online_status_changed: BaseEventProperties;
  online_connected: BaseEventProperties & { matchmaking_attempt_id: string; connection_result: string; search_duration_seconds: number };
  online_disconnected: BaseEventProperties & { matchmaking_attempt_id: string; disconnect_reason: string; recoverable: boolean };
  online_rematch_requested: BaseEventProperties;
  online_rematch_started: BaseEventProperties;
  leaderboard_result_submitted: BaseEventProperties;
  ranked_report_submitted: BaseEventProperties;
  ranked_result_received: BaseEventProperties;
  ranked_promotion_accepted: BaseEventProperties;
  private_rooms_loaded: BaseEventProperties;
  private_room_create_clicked: BaseEventProperties;
  private_room_created: BaseEventProperties & { status: string };
  private_room_join_clicked: BaseEventProperties;
  private_room_joined: BaseEventProperties & { status: string };
  private_room_join_validation_failed: BaseEventProperties;
  custom_room_created: BaseEventProperties & { status: string };
  custom_room_joined: BaseEventProperties & { status: string };
  friend_invite_sent: BaseEventProperties & { status: string };
  friend_invite_accepted: BaseEventProperties & { status: string };
  story_challenge_completed: BaseEventProperties & { status: string };
  story_profile_saved: BaseEventProperties & { created: boolean; avatar_set: string };
  adventure_visit_started: BaseEventProperties & { visit_id: string; world_id: string; level: number };
  adventure_visit_ended: BaseEventProperties & { visit_id: string; world_id: string; level: number; duration_seconds: number; exit_reason: string };
  adventure_region_entered: BaseEventProperties & { visit_id: string; world_id: string; level: number };
  adventure_encounter_started: BaseEventProperties & { visit_id: string; encounter_id: string; world_id: string; level: number };
  adventure_encounter_completed: BaseEventProperties & { visit_id: string; encounter_id: string; world_id: string; level: number; duration_seconds: number; result: string };
  adventure_reward_collected: BaseEventProperties & { visit_id: string; world_id: string; reward_type: string; level: number };
  adventure_progression_reached: BaseEventProperties & { visit_id: string; world_id: string; milestone_type: string; level: number };
  adventure_resource_harvested: BaseEventProperties & { world_id: string; resource_id: string; rarity: string; quantity: number; recipe_unlocks: number };
  adventure_recipes_learned: BaseEventProperties & { source: string; world_id: string; count: number };
  adventure_item_crafted: BaseEventProperties & { recipe_id: string; crafting_context: string };
  adventure_armor_equipped: BaseEventProperties & { recipe_id: string; equipped: boolean };
  adventure_consumable_used: BaseEventProperties & { recipe_id: string; healing: number };
  tournament_list_loaded: BaseEventProperties;
  tournament_mode_selected: BaseEventProperties;
  tournament_entry_started: BaseEventProperties;
  tournament_entry_succeeded: BaseEventProperties;
  tournament_check_in_completed: BaseEventProperties;
  tournament_entry_failed: BaseEventProperties;
  tournament_payment_opened: BaseEventProperties;
  tournament_lobby_refreshed: BaseEventProperties;
  tournament_match_started: BaseEventProperties;
  tournament_match_reported: BaseEventProperties;
  tournament_prize_claimed: BaseEventProperties;
  tournament_completed: BaseEventProperties;
  tournament_entry_confirmed: BaseEventProperties & { event_id: string; tournament_id: string };
  tournament_payment_confirmed: BaseEventProperties & { event_id: string; tournament_id: string };
  tournament_result_confirmed: BaseEventProperties & { event_id: string; tournament_id: string };
  tournament_prize_paid: BaseEventProperties & { event_id: string; tournament_id: string };
  tournament_operation_failed: BaseEventProperties & { event_id: string; tournament_id: string; operation: string; error_code: string };
  setting_changed: BaseEventProperties;
  settings_reset_clicked: BaseEventProperties;
  memory_card_action: BaseEventProperties;
  viewer_action: BaseEventProperties;
  stage_editor_action: BaseEventProperties;
  external_link_clicked: BaseEventProperties;
  mobile_controls_used: BaseEventProperties;
  error_occurred: BaseEventProperties & { error_code: string; severity: 'error' | 'fatal'; source: string; recoverable: boolean };
};

export type AnalyticsEventName = keyof AnalyticsEventMap;
export type AnalyticsCapture<InjectedKey extends PropertyKey = never> = <Name extends AnalyticsEventName>(
  name: Name,
  properties: Omit<AnalyticsEventMap[Name], Extract<InjectedKey, keyof AnalyticsEventMap[Name]>>
) => void;

export type AnalyticsContext = {
  app_version: string;
  environment: 'production' | 'development' | 'test';
  runtime: 'web' | 'electron';
  screen?: string;
  mode?: string;
};

export type AnalyticsIdentityProperties = {
  has_online_profile: boolean;
  has_story_profile: boolean;
  first_seen_app_version: string;
  last_seen_app_version: string;
  first_seen_runtime: AnalyticsContext['runtime'];
  last_seen_runtime: AnalyticsContext['runtime'];
  account_created_period?: string;
};

type AnalyticsEnvironment = {
  key?: string;
  host?: string;
  enabled?: boolean;
};

let analyticsInitialized = false;
let analyticsContext: Partial<AnalyticsContext> = {};

export const ANALYTICS_SCHEMA_VERSION = 2;
export const ANALYTICS_PRIVATE_SELECTOR = [
  '[data-analytics-private="true"]',
  '.friend-chat-log',
  '.friend-chat-compose',
  '.private-room-password',
  '.story-player-panel',
  '.story-remote-player-tag-shell',
  '.story-hub-remote-names',
  '.story-hub-player-card',
  '[class*="player-name"]',
  '[class*="profile-name"]',
  'input[type="email"]',
  'input[type="password"]',
  'input[autocomplete="email"]'
].join(', ');

const PRIVATE_PROPERTY_KEY = /(^|_)(email|display_name|friend_id|player_id|password|bolt11|invoice|chat|status_text)(_|$)/i;
const EMAIL_VALUE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const SECRET_VALUE = /\b(?:lnbc|lntb|phc_|phx_|Bearer\s+)[A-Za-z0-9._~+\/-]+/gi;

function readAnalyticsEnvironment(): AnalyticsEnvironment {
  return {
    key: import.meta.env.VITE_POSTHOG_KEY,
    host: import.meta.env.VITE_POSTHOG_HOST,
    enabled: import.meta.env.PROD || import.meta.env.VITE_POSTHOG_ENABLE_DEV === 'true'
  };
}

export function getAnalyticsRuntime(): AnalyticsContext['runtime'] {
  if (typeof navigator === 'undefined') return 'web';
  return /Electron/i.test(navigator.userAgent) ? 'electron' : 'web';
}

export function getAnalyticsEnvironment(): AnalyticsContext['environment'] {
  if (import.meta.env.PROD) return 'production';
  return import.meta.env.MODE === 'test' ? 'test' : 'development';
}

function sanitizeAnalyticsString(value: string) {
  return value.replace(EMAIL_VALUE, '[redacted-email]').replace(SECRET_VALUE, '[redacted-secret]').slice(0, 500);
}

export function cleanAnalyticsProperties(properties: AnalyticsProperties = {}): Properties {
  return Object.fromEntries(
    Object.entries(properties)
      .filter((entry): entry is [string, string | number | boolean | null] => entry[1] !== undefined && !PRIVATE_PROPERTY_KEY.test(entry[0]))
      .map(([key, value]) => [key, typeof value === 'string' ? sanitizeAnalyticsString(value) : value])
  );
}

export function initializeAnalytics(environment: AnalyticsEnvironment = readAnalyticsEnvironment()) {
  const key = environment.key?.trim();
  const enabled = environment.enabled ?? (import.meta.env.PROD || import.meta.env.VITE_POSTHOG_ENABLE_DEV === 'true');
  if (!key || !enabled) return null;
  if (!analyticsInitialized) {
    posthog.init(key, {
      api_host: environment.host?.trim() || DEFAULT_POSTHOG_HOST,
      capture_pageview: true,
      autocapture: false,
      capture_performance: true,
      enable_recording_console_log: false,
      mask_all_text: false,
      mask_all_element_attributes: false,
      mask_personal_data_properties: true,
      custom_personal_data_properties: ['email', 'displayName', 'display_name', 'playerId', 'player_id', 'password', 'bolt11'],
      session_recording: {
        sampleRate: 0.1,
        strictMinimumDuration: true,
        maskAllInputs: true,
        maskTextSelector: ANALYTICS_PRIVATE_SELECTOR,
        blockSelector: ANALYTICS_PRIVATE_SELECTOR,
        recordHeaders: false,
        recordBody: false,
        recordCrossOriginIframes: false,
        captureCanvas: {
          canvasFps: 2,
          canvasQuality: '0.2'
        },
        canvasCapture: {
          resolutionScale: 0.6
        }
      }
    });
    analyticsInitialized = true;
    posthog.register(cleanAnalyticsProperties({
      analytics_schema_version: ANALYTICS_SCHEMA_VERSION,
      environment: getAnalyticsEnvironment(),
      runtime: getAnalyticsRuntime(),
      ...analyticsContext
    }));
  }
  return posthog;
}

export function isAnalyticsInitialized() {
  return analyticsInitialized;
}

export function getPostHogDeviceId() {
  if (!analyticsInitialized) initializeAnalytics();
  if (!analyticsInitialized) return '';
  const candidate = posthog.get_distinct_id?.();
  return typeof candidate === 'string' ? candidate.trim() : '';
}

export function setAnalyticsContext(context: Partial<AnalyticsContext>) {
  analyticsContext = { ...analyticsContext, ...context };
  if (!analyticsInitialized) initializeAnalytics();
  if (!analyticsInitialized) return;
  posthog.register(cleanAnalyticsProperties({
    analytics_schema_version: ANALYTICS_SCHEMA_VERSION,
    environment: getAnalyticsEnvironment(),
    runtime: getAnalyticsRuntime(),
    ...analyticsContext
  }));
}

export function identifyAnalyticsPlayer(playerId: string, properties: AnalyticsIdentityProperties) {
  if (!analyticsInitialized) initializeAnalytics();
  if (!analyticsInitialized) return;
  const distinctId = playerId.trim();
  if (!distinctId) return;
  const clean = cleanAnalyticsProperties(properties);
  posthog.identify(distinctId, cleanAnalyticsProperties({
    has_online_profile: properties.has_online_profile,
    has_story_profile: properties.has_story_profile,
    last_seen_app_version: properties.last_seen_app_version,
    last_seen_runtime: properties.last_seen_runtime,
    account_created_period: properties.account_created_period
  }), cleanAnalyticsProperties({
    first_seen_app_version: properties.first_seen_app_version,
    first_seen_runtime: properties.first_seen_runtime
  }));
  posthog.register(clean);
}

export function resetAnalyticsIdentity() {
  if (!analyticsInitialized) return;
  posthog.reset();
}

export function createAnalyticsId(prefix = 'event') {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}

export function captureAnalyticsEvent<Name extends AnalyticsEventName>(name: Name, properties: AnalyticsEventMap[Name]) {
  if (!analyticsInitialized) initializeAnalytics();
  if (!analyticsInitialized) return;
  posthog.capture(name, cleanAnalyticsProperties({
    analytics_schema_version: ANALYTICS_SCHEMA_VERSION,
    environment: getAnalyticsEnvironment(),
    runtime: getAnalyticsRuntime(),
    ...analyticsContext,
    ...properties
  }));
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
  const source = typeof context.source === 'string' && context.source ? context.source : 'unknown';
  const severity = context.severity === 'fatal' ? 'fatal' : 'error';
  const recoverable = context.recoverable === true;
  const errorCode = typeof context.error_code === 'string' && context.error_code
    ? context.error_code
    : `${normalized.error_name}:${source}`.toLowerCase().replace(/[^a-z0-9:_-]+/g, '_').slice(0, 120);
  captureAnalyticsEvent('error_occurred', {
    ...context,
    error_code: errorCode,
    severity,
    source,
    recoverable,
    error_name: normalized.error_name,
    error_message: normalized.error_message
  });
  if (!analyticsInitialized) return;
  posthog.captureException(error, cleanAnalyticsProperties({
    ...context,
    error_code: errorCode,
    severity,
    source,
    recoverable,
    error_name: normalized.error_name,
    error_message: normalized.error_message
  }));
}

import posthog from 'posthog-js';
import type { Properties } from 'posthog-js';

export const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';

export type AnalyticsEventName =
  | 'game_load_started'
  | 'game_loaded'
  | 'screen_viewed'
  | 'menu_item_selected'
  | 'menu_lag_prompt'
  | 'navigation_clicked'
  | 'game_start_clicked'
  | 'match_mode_changed'
  | 'cpu_difficulty_changed'
  | 'character_target_changed'
  | 'roster_page_changed'
  | 'random_character_toggled'
  | 'character_selected'
  | 'character_picked'
  | 'stage_browsed'
  | 'random_stage_toggled'
  | 'stage_selected'
  | 'match_started'
  | 'round_started'
  | 'round_ended'
  | 'match_completed'
  | 'combo_route_completed'
  | 'positive_milestone_reached'
  | 'rematch_clicked'
  | 'fullscreen_clicked'
  | 'pause_toggled'
  | 'pause_menu_action_clicked'
  | 'move_list_opened'
  | 'move_list_tab_changed'
  | 'training_panel_opened'
  | 'training_mode_changed'
  | 'training_trial_selected'
  | 'training_trial_previewed'
  | 'training_trial_retried'
  | 'training_trial_started'
  | 'training_trial_completed'
  | 'minigame_started'
  | 'minigame_paused'
  | 'minigame_completed'
  | 'minigame_result_continued'
  | 'leaderboard_loaded'
  | 'online_profile_saved'
  | 'online_search_started'
  | 'online_status_changed'
  | 'online_connected'
  | 'online_disconnected'
  | 'online_rematch_requested'
  | 'online_rematch_started'
  | 'leaderboard_result_submitted'
  | 'ranked_report_submitted'
  | 'ranked_result_received'
  | 'ranked_promotion_accepted'
  | 'private_rooms_loaded'
  | 'private_room_create_clicked'
  | 'private_room_join_clicked'
  | 'private_room_join_validation_failed'
  | 'tournament_list_loaded'
  | 'tournament_mode_selected'
  | 'tournament_entry_started'
  | 'tournament_entry_succeeded'
  | 'tournament_entry_failed'
  | 'tournament_payment_opened'
  | 'tournament_lobby_refreshed'
  | 'tournament_match_started'
  | 'tournament_match_reported'
  | 'tournament_prize_claimed'
  | 'tournament_completed'
  | 'setting_changed'
  | 'settings_reset_clicked'
  | 'memory_card_action'
  | 'viewer_action'
  | 'stage_editor_action'
  | 'external_link_clicked'
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

export function getPostHogDeviceId() {
  if (!analyticsInitialized) initializeAnalytics();
  if (!analyticsInitialized) return '';
  const candidate = posthog.get_distinct_id?.();
  return typeof candidate === 'string' ? candidate.trim() : '';
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

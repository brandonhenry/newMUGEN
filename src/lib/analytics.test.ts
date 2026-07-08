import { afterEach, describe, expect, it, vi } from 'vitest';

const posthogMock = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  captureException: vi.fn()
}));

vi.mock('posthog-js', () => ({
  default: posthogMock
}));

async function loadAnalytics() {
  vi.resetModules();
  return import('./analytics');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('analytics', () => {
  it('does nothing when PostHog key is missing', async () => {
    const analytics = await loadAnalytics();

    analytics.captureAnalyticsEvent('game_loaded', { app_version: 'test' });

    expect(posthogMock.init).not.toHaveBeenCalled();
    expect(posthogMock.capture).not.toHaveBeenCalled();
  });

  it('initializes PostHog and captures clean event properties', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'ph_test_key');
    vi.stubEnv('VITE_POSTHOG_HOST', 'https://example.posthog.test');
    const analytics = await loadAnalytics();

    analytics.captureAnalyticsEvent('game_loaded', {
      app_version: 'test',
      omitted: undefined,
      loaded: true
    });

    expect(posthogMock.init).toHaveBeenCalledWith('ph_test_key', {
      api_host: 'https://example.posthog.test',
      capture_pageview: true,
      autocapture: false
    });
    expect(posthogMock.capture).toHaveBeenCalledWith('game_loaded', {
      app_version: 'test',
      loaded: true
    });
  });

  it('captures expanded explicit app events without undefined properties', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'ph_test_key');
    const analytics = await loadAnalytics();

    analytics.captureAnalyticsEvent('screen_viewed', {
      app_version: 'test',
      screen: 'fight',
      previous_screen: 'versus',
      time_on_previous_screen_seconds: 2.4,
      omitted: undefined
    });

    expect(posthogMock.capture).toHaveBeenCalledWith('screen_viewed', {
      app_version: 'test',
      screen: 'fight',
      previous_screen: 'versus',
      time_on_previous_screen_seconds: 2.4
    });
  });

  it('captures gameplay popularity events', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'ph_test_key');
    const analytics = await loadAnalytics();

    analytics.captureAnalyticsEvent('character_picked', {
      character_id: 'naruto',
      slot: 1,
      actor_type: 'human',
      random_pick: false
    });
    analytics.captureAnalyticsEvent('combo_route_completed', {
      character_id: 'naruto',
      route_key: 'jab:1>kick:2',
      combo_hits: 2,
      omitted: undefined
    });
    analytics.captureAnalyticsEvent('positive_milestone_reached', {
      milestone_type: 'training_trial_completed',
      trial_id: 'combo:naruto-route',
      first_time_completion: true,
      omitted: undefined
    });

    expect(posthogMock.capture).toHaveBeenCalledWith('character_picked', {
      character_id: 'naruto',
      slot: 1,
      actor_type: 'human',
      random_pick: false
    });
    expect(posthogMock.capture).toHaveBeenCalledWith('combo_route_completed', {
      character_id: 'naruto',
      route_key: 'jab:1>kick:2',
      combo_hits: 2
    });
    expect(posthogMock.capture).toHaveBeenCalledWith('positive_milestone_reached', {
      milestone_type: 'training_trial_completed',
      trial_id: 'combo:naruto-route',
      first_time_completion: true
    });
  });

  it('captures normalized errors', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'ph_test_key');
    const analytics = await loadAnalytics();
    const error = new Error('Roster failed');

    analytics.captureAnalyticsError(error, { screen: 'boot' });

    expect(posthogMock.capture).toHaveBeenCalledWith('error_occurred', {
      screen: 'boot',
      error_name: 'Error',
      error_message: 'Roster failed'
    });
    expect(posthogMock.captureException).toHaveBeenCalledWith(error, {
      screen: 'boot',
      error_name: 'Error',
      error_message: 'Roster failed'
    });
  });
});

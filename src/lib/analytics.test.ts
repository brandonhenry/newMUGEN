import { afterEach, describe, expect, it, vi } from 'vitest';

const posthogMock = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  captureException: vi.fn(),
  register: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  get_distinct_id: vi.fn(() => 'anonymous-device')
}));

vi.mock('posthog-js', () => ({ default: posthogMock }));

async function loadAnalytics() {
  vi.resetModules();
  return import('./analytics');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('analytics v2', () => {
  it('suppresses production-project capture in test and development by default', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'ph_test_key');
    const analytics = await loadAnalytics();
    analytics.captureAnalyticsEvent('screen_viewed', { screen: 'title' });
    expect(posthogMock.init).not.toHaveBeenCalled();
    expect(posthogMock.capture).not.toHaveBeenCalled();
  });

  it('allows an explicit non-production opt-in and configures private replay capture', async () => {
    const analytics = await loadAnalytics();
    analytics.initializeAnalytics({ key: 'ph_test_key', host: 'https://example.posthog.test', enabled: true });
    expect(posthogMock.init).toHaveBeenCalledWith('ph_test_key', expect.objectContaining({
      api_host: 'https://example.posthog.test',
      autocapture: false,
      enable_recording_console_log: false,
      session_recording: expect.objectContaining({
        sampleRate: 0.1,
        strictMinimumDuration: true,
        maskAllInputs: true,
        blockSelector: analytics.ANALYTICS_PRIVATE_SELECTOR,
        recordBody: false,
        captureCanvas: { canvasFps: 2, canvasQuality: '0.2' }
      })
    }));
  });

  it('adds common v2 context and strips undefined and private properties', async () => {
    const analytics = await loadAnalytics();
    analytics.initializeAnalytics({ key: 'ph_test_key', enabled: true });
    analytics.setAnalyticsContext({ app_version: '2.4.0', screen: 'fight', mode: 'online' });
    analytics.captureAnalyticsEvent('screen_viewed', {
      screen: 'fight',
      email: 'player@example.com',
      display_name: 'SECRET NAME',
      detail: 'contact player@example.com',
      omitted: undefined
    });
    expect(posthogMock.capture).toHaveBeenCalledWith('screen_viewed', expect.objectContaining({
      analytics_schema_version: 2,
      app_version: '2.4.0',
      screen: 'fight',
      mode: 'online',
      detail: 'contact [redacted-email]'
    }));
    const properties = posthogMock.capture.mock.calls[posthogMock.capture.mock.calls.length - 1]?.[1];
    expect(properties).not.toHaveProperty('email');
    expect(properties).not.toHaveProperty('display_name');
    expect(properties).not.toHaveProperty('omitted');
  });

  it('identifies only with the saved pseudonymous player id and allowlisted person properties', async () => {
    const analytics = await loadAnalytics();
    analytics.initializeAnalytics({ key: 'ph_test_key', enabled: true });
    analytics.identifyAnalyticsPlayer('player-123', {
      has_online_profile: true,
      has_story_profile: false,
      first_seen_app_version: '2.4.0',
      last_seen_app_version: '2.4.0',
      first_seen_runtime: 'web',
      last_seen_runtime: 'web',
      account_created_period: '2026-07'
    });
    expect(posthogMock.identify).toHaveBeenCalledWith('player-123', expect.objectContaining({
      has_online_profile: true,
      has_story_profile: false,
      last_seen_app_version: '2.4.0'
    }), expect.objectContaining({ first_seen_app_version: '2.4.0', first_seen_runtime: 'web' }));
  });

  it('captures the corrected typed match and combo contracts', async () => {
    const analytics = await loadAnalytics();
    analytics.initializeAnalytics({ key: 'ph_test_key', enabled: true });
    analytics.captureAnalyticsEvent('match_completed', {
      match_id: 'match-1', mode: 'ai', match_duration_seconds: 63.2, completion_reason: 'normal',
      winner_character_id: 'naruto', loser_character_id: 'sasuke', local_result: 'win'
    });
    analytics.captureAnalyticsEvent('combo_route_completed', {
      match_id: 'match-1', mode: 'ai', route_key: 'jab>kick', combo_hits: 2, combo_damage: 45,
      included_launcher: false, included_tornado: false, included_ki_burst: true
    });
    expect(posthogMock.capture).toHaveBeenCalledWith('match_completed', expect.objectContaining({ match_duration_seconds: 63.2 }));
    expect(posthogMock.capture).toHaveBeenCalledWith('combo_route_completed', expect.objectContaining({ combo_hits: 2, combo_damage: 45, included_ki_burst: true }));
  });

  it('emits bounded error fields and a PostHog exception', async () => {
    const analytics = await loadAnalytics();
    analytics.initializeAnalytics({ key: 'ph_test_key', enabled: true });
    const error = new Error('Roster failed for player@example.com');
    analytics.captureAnalyticsError(error, { source: 'app_load', error_code: 'roster_load_failed', severity: 'fatal', recoverable: false });
    expect(posthogMock.capture).toHaveBeenCalledWith('error_occurred', expect.objectContaining({
      error_code: 'roster_load_failed', severity: 'fatal', source: 'app_load', recoverable: false,
      error_message: 'Roster failed for [redacted-email]'
    }));
    expect(posthogMock.captureException).toHaveBeenCalledWith(error, expect.objectContaining({ error_code: 'roster_load_failed' }));
  });
});

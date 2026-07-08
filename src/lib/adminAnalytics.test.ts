import { describe, expect, it } from 'vitest';
import {
  ADMIN_ENDPOINT_SPECS,
  buildPostHogEndpointRequest,
  hasAnyConfiguredEndpoint,
  normalizeEndpointResult,
  resolvePostHogEndpointUrl,
  summarizeDashboardRatios
} from './adminAnalytics';
import { defaultAdminAnalyticsConfig } from './analytics';

describe('adminAnalytics', () => {
  it('defines the PostHog endpoint contracts used by the admin dashboard', () => {
    expect(ADMIN_ENDPOINT_SPECS.map((spec) => spec.endpointName)).toEqual([
      'kore_admin_summary',
      'kore_admin_trends',
      'kore_admin_events',
      'kore_admin_modes',
      'kore_admin_arcade',
      'kore_admin_combo_routes',
      'kore_admin_training',
      'kore_admin_minigames',
      'kore_admin_online',
      'kore_admin_quality'
    ]);
    expect(ADMIN_ENDPOINT_SPECS.find((spec) => spec.name === 'summary')?.expectedColumns).toEqual(['metric', 'value']);
  });

  it('builds endpoint proxy requests from stored endpoint paths', () => {
    const config = {
      ...defaultAdminAnalyticsConfig(),
      endpointToken: 'endpoint_secret',
      endpointPaths: {
        summary: '/api/projects/492693/endpoints/kore_admin_summary'
      }
    };

    expect(buildPostHogEndpointRequest(config, 'summary')).toEqual({
      endpointUrl: 'https://us.posthog.com/api/projects/492693/endpoints/kore_admin_summary',
      endpointToken: 'endpoint_secret'
    });
    expect(buildPostHogEndpointRequest(config, 'trends')).toBeNull();
    expect(hasAnyConfiguredEndpoint(config)).toBe(true);
  });

  it('infers the app host for relative endpoint paths from the capture host', () => {
    expect(resolvePostHogEndpointUrl('/api/projects/492693/endpoints/kore_admin_summary', 'https://eu.i.posthog.com')).toBe(
      'https://eu.posthog.com/api/projects/492693/endpoints/kore_admin_summary'
    );
    expect(resolvePostHogEndpointUrl('https://us.posthog.com/api/projects/492693/endpoints/kore_admin_summary')).toBe(
      'https://us.posthog.com/api/projects/492693/endpoints/kore_admin_summary'
    );
  });

  it('normalizes matrix endpoint payloads into dashboard rows', () => {
    expect(normalizeEndpointResult('summary', {
      columns: ['metric', 'value'],
      results: [['visits', 100]]
    })).toEqual({
      name: 'summary',
      columns: ['metric', 'value'],
      rows: [['visits', 100]]
    });
  });

  it('normalizes object endpoint payloads into dashboard rows', () => {
    expect(normalizeEndpointResult('events', {
      data: [
        { event: 'game_loaded', total_events: 42, unique_players: 18 }
      ]
    })).toEqual({
      name: 'events',
      columns: ['event', 'total_events', 'unique_players'],
      rows: [['game_loaded', 42, 18]]
    });
  });

  it('summarizes ratios from endpoint result rows', () => {
    const ratios = summarizeDashboardRatios({
      refreshedAt: '2026-07-08T00:00:00.000Z',
      results: {
        summary: {
          name: 'summary',
          columns: ['metric', 'value'],
          rows: [
            ['visits', 100],
            ['active_players', 50],
            ['dau', 20],
            ['wau', 35],
            ['mau', 80],
            ['qualified_play_sessions', 70],
            ['activated_players', 30]
          ]
        }
      }
    });

    expect(ratios.qualifiedSessionRate).toBe(0.7);
    expect(ratios.activationRate).toBe(0.6);
    expect(ratios.stickiness).toBe(0.25);
  });
});

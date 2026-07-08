import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminDashboard } from './AdminDashboard';
import { writeAdminAnalyticsConfig } from './lib/analytics';

const posthogMock = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  captureException: vi.fn()
}));

vi.mock('posthog-js', () => ({
  default: posthogMock
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.localStorage.clear();
});

function mockPostHogFetch(ok = true) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as { endpointUrl?: string } : {};
    if (!ok) {
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: 'Bad PostHog key' })
      } as Response;
    }
    const isSummary = body.endpointUrl?.includes('summary');
    const isTrends = body.endpointUrl?.includes('trends');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        payload: isSummary
          ? {
              columns: ['metric', 'value'],
              results: [
                ['visits', 100],
                ['dau', 12],
                ['wau', 24],
                ['mau', 60],
                ['qualified_play_sessions', 70],
                ['activated_players', 20],
                ['active_players', 40]
              ]
            }
          : isTrends
            ? {
                columns: ['day', 'visits', 'active_players', 'qualified_sessions', 'combo_routes', 'training_completions', 'minigame_completions', 'arcade_matches'],
                results: [
                  ['2026-07-07', 80, 24, 46, 8, 4, 3, 2],
                  ['2026-07-08', 100, 40, 70, 12, 6, 5, 4]
                ]
              }
            : {
                columns: ['event', 'total_events', 'unique_players'],
                results: [['game_loaded', 42, 18]]
              }
      })
    } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('AdminDashboard', () => {
  it('renders local admin key fields', () => {
    render(<AdminDashboard />);

    expect(screen.getByRole('heading', { name: 'KORE Admin' })).toBeTruthy();
    expect(screen.getByLabelText('Project token')).toBeTruthy();
    expect(screen.getByLabelText('Endpoint token')).toBeTruthy();
    expect(screen.getByLabelText('kore_admin_summary endpoint path')).toBeTruthy();
    expect(screen.queryByLabelText('Personal API key')).toBeNull();
  });

  it('saves local PostHog settings and initializes capture when a project token is present', () => {
    mockPostHogFetch();
    render(<AdminDashboard />);

    fireEvent.change(screen.getByLabelText('Project token'), { target: { value: 'ph_project' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(posthogMock.init).toHaveBeenCalledWith('ph_project', {
      api_host: 'https://us.i.posthog.com',
      capture_pageview: true,
      autocapture: false
    });
    expect(screen.getByText(/Analytics capture is active/i)).toBeTruthy();
  });

  it('refreshes and renders KPI and event table data', async () => {
    writeAdminAnalyticsConfig({
      endpointPaths: {
        summary: '/summary',
        trends: '/trends',
        events: '/events'
      }
    });
    mockPostHogFetch();

    render(<AdminDashboard />);

    await waitFor(() => expect(screen.getAllByText('70').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: 'Events' }));
    expect(screen.getByText('game_loaded')).toBeTruthy();
  });

  it('shows readable refresh errors', async () => {
    writeAdminAnalyticsConfig({
      endpointPaths: {
        trends: '/trends'
      }
    });
    mockPostHogFetch(false);

    render(<AdminDashboard />);

    await waitFor(() => expect(screen.getAllByText('Bad PostHog key').length).toBeGreaterThan(0));
  });

  it('leaves missing endpoint sections empty without blocking configured data', async () => {
    writeAdminAnalyticsConfig({
      endpointPaths: {
        summary: '/summary'
      }
    });
    mockPostHogFetch();

    render(<AdminDashboard />);

    await waitFor(() => expect(screen.getByText('70')).toBeTruthy());
    expect(screen.getByText('Missing endpoint path for this section.')).toBeTruthy();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureServerAnalytics, captureTournamentOperationFailure } from '../netlify/functions/_posthog-analytics.mjs';

afterEach(() => {
  delete process.env.POSTHOG_PROJECT_KEY;
  delete process.env.POSTHOG_HOST;
  vi.unstubAllGlobals();
});

describe('server analytics', () => {
  it('is disabled without a server-side project key', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await captureServerAnalytics('tournament_entry_confirmed', { eventId: 'entry-1' })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses stable insert ids and excludes secret fields', async () => {
    process.env.POSTHOG_PROJECT_KEY = 'ph_project';
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await captureServerAnalytics('tournament_payment_confirmed', {
      eventId: 'payment:t1:e1',
      distinctId: 'player-1',
      properties: { tournament_id: 't1', entry_id: 'e1', payment_state: 'paid', email: 'private@example.com', bolt11: 'lnbc-secret', display_name: 'PRIVATE' }
    });
    const request = fetchMock.mock.calls[0][1] as { body: string };
    const body = JSON.parse(request.body);
    expect(body.properties).toMatchObject({ distinct_id: 'player-1', $insert_id: 'payment:t1:e1', event_id: 'payment:t1:e1', tournament_id: 't1', entry_id: 'e1', payment_state: 'paid', analytics_schema_version: 2, runtime: 'server' });
    expect(body.properties).not.toHaveProperty('email');
    expect(body.properties).not.toHaveProperty('bolt11');
    expect(body.properties).not.toHaveProperty('display_name');
  });

  it('emits bounded failures without forwarding request payloads', async () => {
    process.env.POSTHOG_PROJECT_KEY = 'ph_project';
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await captureTournamentOperationFailure('prize_payout', { tournamentId: 't1', playerId: 'player-1', bolt11: 'lnbc-secret', email: 'private@example.com' }, Object.assign(new Error('payment failed'), { code: 'payout_failed' }));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.event).toBe('tournament_operation_failed');
    expect(body.properties).toMatchObject({ tournament_id: 't1', operation: 'prize_payout', error_code: 'payout_failed' });
    expect(JSON.stringify(body)).not.toContain('lnbc-secret');
    expect(JSON.stringify(body)).not.toContain('private@example.com');
  });
});

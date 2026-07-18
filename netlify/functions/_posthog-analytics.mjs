const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';

const SAFE_PROPERTY = /^(tournament_id|match_id|entry_id|operation|error_code|kind|payment_state|payout_status|amount_sats|reused|confirmed)$/;

function clean(value, max = 160) {
  return typeof value === 'string' ? value.replace(/[^a-zA-Z0-9:_.@-]/g, '_').slice(0, max) : '';
}

function safeProperties(properties = {}) {
  return Object.fromEntries(Object.entries(properties)
    .filter(([key, value]) => SAFE_PROPERTY.test(key) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'))
    .map(([key, value]) => [key, typeof value === 'string' ? clean(value) : value]));
}

export async function captureServerAnalytics(event, { eventId, distinctId = 'tournament-server', properties = {} } = {}) {
  const projectKey = process.env.POSTHOG_PROJECT_KEY?.trim();
  const cleanEvent = clean(event, 120);
  const cleanEventId = clean(eventId, 200);
  if (!projectKey || !cleanEvent || !cleanEventId) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_500);
  try {
    const response = await fetch(`${(process.env.POSTHOG_HOST || DEFAULT_POSTHOG_HOST).replace(/\/$/, '')}/capture/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: projectKey,
        event: cleanEvent,
        properties: {
          distinct_id: clean(distinctId, 200) || 'tournament-server',
          $insert_id: cleanEventId,
          event_id: cleanEventId,
          analytics_schema_version: 2,
          environment: 'production',
          runtime: 'server',
          ...safeProperties(properties)
        }
      })
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function captureTournamentOperationFailure(operation, body, error) {
  const tournamentId = clean(body?.tournamentId) || 'unknown';
  const targetId = clean(body?.matchId || body?.playerId || body?.checkingId) || 'unknown';
  const errorCode = clean(error?.code || error?.name || 'operation_failed');
  return captureServerAnalytics('tournament_operation_failed', {
    eventId: `tournament-failure:${operation}:${tournamentId}:${targetId}:${errorCode}`,
    distinctId: clean(body?.playerId) || 'tournament-server',
    properties: { tournament_id: tournamentId, match_id: clean(body?.matchId), operation, error_code: errorCode }
  });
}

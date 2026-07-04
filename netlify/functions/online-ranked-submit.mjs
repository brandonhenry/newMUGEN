import { getBlobStore } from './_blob-store.mjs';
import { applyRankedMatchReport, cleanRankedReport, makeDefaultRankedProfile, normalizeRankedProfile } from './_online-ranked.mjs';

const STORE_NAME = 'kore-online-ranked';
const PROFILE_PREFIX = 'profiles/';
const REPORT_PREFIX = 'reports/';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const report = cleanRankedReport(body);
    if (!report) return json(400, { error: 'invalid_ranked_report' });

    const store = getBlobStore(STORE_NAME, event);
    const reportId = [report.roomId, report.winnerPlayerId, ...report.players.map((player) => player.profile.playerId).sort()].join(':');
    const existing = await store.get(reportKey(reportId), { type: 'json' }).catch(() => null);
    if (existing?.reportId) return json(200, existing);

    const profiles = await Promise.all(report.players.map(async (player) => {
      const existingProfile = await store.get(profileKey(player.profile.playerId), { type: 'json' }).catch(() => null);
      return normalizeRankedProfile(existingProfile ? { ...existingProfile, displayName: player.profile.displayName } : makeDefaultRankedProfile(player.profile));
    }));
    const result = applyRankedMatchReport(profiles, report);
    await Promise.all([
      ...result.players.map((player) => store.setJSON(profileKey(player.playerId), player.profile)),
      store.setJSON(reportKey(result.reportId), result)
    ]);
    return json(200, result);
  } catch (error) {
    return json(500, { error: 'ranked_submit_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

function profileKey(playerId) {
  return `${PROFILE_PREFIX}${playerId}`;
}

function reportKey(reportId) {
  return `${REPORT_PREFIX}${reportId}`;
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  };
}

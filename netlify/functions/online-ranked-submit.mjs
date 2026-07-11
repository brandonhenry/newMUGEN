import { getBlobStore } from './_blob-store.mjs';
import { RANKED_PLACEMENT_MATCHES, applyRankedMatchReport, cleanRankedReport, makeDefaultRankedProfile, normalizeRankedProfile, rankedProfileKey } from './_online-ranked.mjs';

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
    const reportId = [report.roomId, report.winnerPlayerId, ...report.players.map((player) => rankedProfileKey(player.profile.playerId, player.characterId)).sort()].join(':');
    const existing = await store.get(reportKey(reportId), { type: 'json' }).catch(() => null);
    if (existing?.reportId) return json(200, existing);

    const profiles = await Promise.all(report.players.map(async (player) => {
      if (player.isBot) {
        return normalizeRankedProfile({
          ...makeDefaultRankedProfile(player.profile, player.characterId),
          kp: player.botKp,
          kr: player.botKr,
          placement: {
            requiredMatches: RANKED_PLACEMENT_MATCHES,
            matchesPlayed: RANKED_PLACEMENT_MATCHES,
            complete: true,
            ratingEstimate: player.botKp,
            nextBotKp: player.botKp
          }
        });
      }
      return readPlayerRankedProfile(store, player.profile, player.characterId);
    }));
    const result = applyRankedMatchReport(profiles, report);
    await Promise.all([
      ...result.players
        .flatMap((player, index) => {
          if (report.players[index].isBot) return [];
          const reportPlayer = report.players[index];
          return [
            store.setJSON(profileKey(player.playerId, reportPlayer.characterId), player.profile),
            maybeMarkLegacySeed(store, player.playerId, reportPlayer.characterId)
          ];
        }),
      store.setJSON(reportKey(result.reportId), result)
    ]);
    return json(200, result);
  } catch (error) {
    return json(500, { error: 'ranked_submit_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

function profileKey(playerId, characterId) {
  return `${PROFILE_PREFIX}${playerId}/${characterId}`;
}

function legacyProfileKey(playerId) {
  return `${PROFILE_PREFIX}${playerId}`;
}

function legacySeedKey(playerId) {
  return `${PROFILE_PREFIX}${playerId}/_legacy-seeded`;
}

async function readPlayerRankedProfile(store, profile, characterId) {
  const existingProfile = await store.get(profileKey(profile.playerId, characterId), { type: 'json' }).catch(() => null);
  if (existingProfile) return normalizeRankedProfile({ ...existingProfile, displayName: profile.displayName, characterId });
  const legacySeed = await readUnusedLegacySeed(store, profile.playerId);
  return normalizeRankedProfile(legacySeed
    ? { ...legacySeed, playerId: profile.playerId, displayName: profile.displayName, characterId }
    : makeDefaultRankedProfile(profile, characterId));
}

async function readUnusedLegacySeed(store, playerId) {
  const marker = await store.get(legacySeedKey(playerId), { type: 'json' }).catch(() => null);
  if (marker?.seededCharacterId) return null;
  return store.get(legacyProfileKey(playerId), { type: 'json' }).catch(() => null);
}

async function maybeMarkLegacySeed(store, playerId, characterId) {
  const legacy = await store.get(legacyProfileKey(playerId), { type: 'json' }).catch(() => null);
  if (!legacy) return undefined;
  const marker = await store.get(legacySeedKey(playerId), { type: 'json' }).catch(() => null);
  if (marker?.seededCharacterId) return undefined;
  return store.setJSON(legacySeedKey(playerId), { seededCharacterId: characterId, seededAt: Date.now() });
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

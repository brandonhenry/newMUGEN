import { getBlobStore } from './_blob-store.mjs';

const STORE_NAME = 'kore-online-leaderboard';
const SCORES_KEY = 'scores';
const LEGACY_POINTS_PER_WIN = 100;

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const awards = cleanAwards(body);
    if (awards.length === 0) return json(400, { error: 'invalid_result' });

    const store = getBlobStore(STORE_NAME, event);
    const entries = await readEntries(store);
    const byId = new Map(entries.map((entry) => [entry.playerId, entry]));
    const now = Date.now();
    for (const award of awards) {
      const entry = byId.get(award.profile.playerId) ?? { ...award.profile, points: 0, updatedAt: now };
      entry.displayName = award.profile.displayName;
      entry.points += award.points;
      entry.updatedAt = now;
      byId.set(award.profile.playerId, entry);
    }

    const sorted = sortEntries([...byId.values()]).slice(0, 100);
    await store.setJSON(SCORES_KEY, { entries: sorted, updatedAt: now });
    return json(200, { entries: sorted });
  } catch (error) {
    return json(500, { error: 'leaderboard_submit_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

async function readEntries(store) {
  const payload = await store.get(SCORES_KEY, { type: 'json' }).catch(() => null);
  return Array.isArray(payload?.entries) ? payload.entries.map(cleanEntry).filter(Boolean) : [];
}

function cleanProfile(value) {
  const playerId = cleanId(value?.playerId);
  const displayName = cleanName(value?.displayName);
  return playerId && displayName ? { playerId, displayName } : null;
}

function cleanEntry(entry) {
  const profile = cleanProfile(entry);
  if (!profile) return null;
  const points = normalizePoints(entry);
  if (points <= 0) return null;
  return {
    ...profile,
    points,
    updatedAt: Math.max(0, Math.round(Number(entry.updatedAt) || 0))
  };
}

function cleanAwards(body) {
  if (Array.isArray(body?.players)) {
    const byId = new Map();
    for (const item of body.players) {
      const profile = cleanProfile(item?.profile);
      const points = cleanAwardPoints(item?.points);
      if (!profile || points <= 0) continue;
      const current = byId.get(profile.playerId);
      byId.set(profile.playerId, {
        profile,
        points: (current?.points || 0) + points
      });
    }
    return [...byId.values()];
  }

  const winner = cleanProfile(body?.winner);
  const loser = cleanProfile(body?.loser);
  if (!winner || !loser || winner.playerId === loser.playerId) return [];
  return [{ profile: winner, points: LEGACY_POINTS_PER_WIN }];
}

function cleanAwardPoints(value) {
  return Math.max(0, Math.min(500, Math.round(Number(value) || 0)));
}

function normalizePoints(entry) {
  const directPoints = Math.max(0, Math.round(Number(entry?.points) || 0));
  if (directPoints > 0) return directPoints;
  return Math.max(0, Math.round(Number(entry?.wins) || 0)) * LEGACY_POINTS_PER_WIN;
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    return b.points - a.points || b.updatedAt - a.updatedAt || a.displayName.localeCompare(b.displayName);
  });
}

function cleanId(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 96);
}

function cleanName(value) {
  if (typeof value !== 'string') return '';
  return value.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  };
}

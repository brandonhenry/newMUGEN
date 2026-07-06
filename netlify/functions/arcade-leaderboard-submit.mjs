import { getBlobStore } from './_blob-store.mjs';

const STORE_NAME = 'kore-arcade-run-leaderboard';
const SCORES_KEY = 'scores';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const profile = cleanProfile(body?.profile);
    const score = cleanScore(body?.score);
    if (!profile || score <= 0) return json(400, { error: 'invalid_arcade_score' });

    const store = getBlobStore(STORE_NAME, event);
    const entries = await readEntries(store);
    const byId = new Map(entries.map((entry) => [entry.playerId, entry]));
    const now = Date.now();
    const current = byId.get(profile.playerId);
    byId.set(profile.playerId, {
      ...profile,
      score: Math.max(score, current?.score ?? 0),
      updatedAt: now
    });

    const sorted = sortEntries([...byId.values()]).slice(0, 100);
    await store.setJSON(SCORES_KEY, { entries: sorted, updatedAt: now });
    return json(200, { entries: sorted });
  } catch (error) {
    return json(500, { error: 'arcade_leaderboard_submit_failed', message: error instanceof Error ? error.message : String(error) });
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
  const score = cleanScore(entry?.score);
  if (!profile || score <= 0) return null;
  return {
    ...profile,
    score,
    updatedAt: Math.max(0, Math.round(Number(entry?.updatedAt) || 0))
  };
}

function cleanScore(value) {
  return Math.max(0, Math.min(9_999_999, Math.round(Number(value) || 0)));
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt || a.displayName.localeCompare(b.displayName));
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

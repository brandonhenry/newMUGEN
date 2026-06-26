import { getStore } from '@netlify/blobs';

const STORE_NAME = 'kore-online-leaderboard';
const SCORES_KEY = 'scores';

export async function handler(event) {
  if (event.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });

  try {
    const store = getStore(STORE_NAME);
    const entries = await readEntries(store);
    return json(200, { entries: sortEntries(entries).slice(0, 100) });
  } catch (error) {
    return json(500, { error: 'leaderboard_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

async function readEntries(store) {
  const payload = await store.get(SCORES_KEY, { type: 'json' }).catch(() => null);
  return Array.isArray(payload?.entries) ? payload.entries.map(normalizeEntry).filter(Boolean) : [];
}

function normalizeEntry(entry) {
  const playerId = cleanId(entry?.playerId);
  const displayName = cleanName(entry?.displayName);
  if (!playerId || !displayName) return null;
  return {
    playerId,
    displayName,
    wins: Math.max(0, Math.round(Number(entry.wins) || 0)),
    losses: Math.max(0, Math.round(Number(entry.losses) || 0)),
    updatedAt: Math.max(0, Math.round(Number(entry.updatedAt) || 0))
  };
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    const scoreA = a.wins * 100 - a.losses * 25;
    const scoreB = b.wins * 100 - b.losses * 25;
    return scoreB - scoreA || b.wins - a.wins || a.losses - b.losses || b.updatedAt - a.updatedAt;
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

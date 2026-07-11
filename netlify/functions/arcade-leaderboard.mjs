import { getBlobStore } from './_blob-store.mjs';

const STORE_NAME = 'kore-arcade-run-leaderboard';
const SCORES_KEY = 'scores';
const LEGACY_CHARACTER_ID = 'legacy';

export async function handler(event) {
  if (event.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });

  try {
    const store = getBlobStore(STORE_NAME, event);
    const entries = await readEntries(store);
    return json(200, { entries: sortEntries(entries).slice(0, 100) });
  } catch (error) {
    return json(500, { error: 'arcade_leaderboard_failed', message: error instanceof Error ? error.message : String(error) });
  }
}

async function readEntries(store) {
  const payload = await store.get(SCORES_KEY, { type: 'json' }).catch(() => null);
  return Array.isArray(payload?.entries) ? payload.entries.map(cleanEntry).filter(Boolean) : [];
}

function cleanEntry(entry) {
  const playerId = cleanId(entry?.playerId);
  const displayName = cleanName(entry?.displayName);
  const score = cleanScore(entry?.score);
  if (!playerId || !displayName || score <= 0) return null;
  return {
    playerId,
    displayName,
    characterId: cleanCharacterId(entry?.characterId) || LEGACY_CHARACTER_ID,
    score,
    updatedAt: Math.max(0, Math.round(Number(entry?.updatedAt) || 0))
  };
}

function cleanScore(value) {
  return Math.max(0, Math.min(9_999_999, Math.round(Number(value) || 0)));
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt || a.displayName.localeCompare(b.displayName) || a.characterId.localeCompare(b.characterId));
}

function cleanId(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 96);
}

function cleanName(value) {
  if (typeof value !== 'string') return '';
  return value.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
}

function cleanCharacterId(value) {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 96);
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  };
}

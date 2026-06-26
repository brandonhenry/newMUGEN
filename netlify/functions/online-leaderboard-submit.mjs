import { getStore } from '@netlify/blobs';

const STORE_NAME = 'kore-online-leaderboard';
const SCORES_KEY = 'scores';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const winner = cleanProfile(body.winner);
    const loser = cleanProfile(body.loser);
    if (!winner || !loser || winner.playerId === loser.playerId) return json(400, { error: 'invalid_result' });

    const store = getStore(STORE_NAME);
    const entries = await readEntries(store);
    const byId = new Map(entries.map((entry) => [entry.playerId, entry]));
    const now = Date.now();
    const winnerEntry = byId.get(winner.playerId) ?? { ...winner, wins: 0, losses: 0, updatedAt: now };
    const loserEntry = byId.get(loser.playerId) ?? { ...loser, wins: 0, losses: 0, updatedAt: now };

    winnerEntry.displayName = winner.displayName;
    winnerEntry.wins += 1;
    winnerEntry.updatedAt = now;
    loserEntry.displayName = loser.displayName;
    loserEntry.losses += 1;
    loserEntry.updatedAt = now;

    byId.set(winner.playerId, winnerEntry);
    byId.set(loser.playerId, loserEntry);

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
  return {
    ...profile,
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

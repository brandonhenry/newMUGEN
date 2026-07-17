import { getBlobStore } from './_blob-store.mjs';

export const STORY_HUB_STORE_NAME = 'kore-story-hub-presence';
export const STORY_HUB_PRESENCE_TTL_MS = 8_000;
const BODY_PRESETS = new Set(['compact', 'standard', 'tall']);
const BODY_TONES = new Set(['blue', 'dark', 'gray', 'green', 'light', 'pale', 'red', 'tan', 'white', 'yellow']);
const LINEAGES = new Set(['human', 'sylvan', 'emberkin', 'synth']);
const HAIR_STYLES = new Set(['short', 'spiked', 'bob', 'locs', 'ponytail', 'curls', 'undercut', 'swept']);
const ACCESSORIES = new Set(['none', 'headband', 'glasses', 'headphones', 'scarf', 'cyber-visor', 'street-cap', 'comms-headset', 'holo-pin']);
const OUTFITS = new Set(['kore-cyan', 'solar-runner', 'royal-circuit', 'signal-striker', 'forest-scout', 'mono-steel', 'neon-street', 'arena-varsity', 'tech-nomad', 'void-operative']);
const LEG_STYLES = new Set(['fitted', 'cargo', 'joggers', 'wide', 'runner', 'armored', 'techwear', 'utility']);
const HAIR_COLORS = new Set(['#15131a', '#4a2c22', '#8b5134', '#d2a15f', '#e7e8f0', '#2d68d8', '#9f49c8', '#cf3f4f']);
const AVATAR_SETS = new Set([
  'solar-runner', 'street-shadow', 'crimson-ranger', 'rose-blade',
  'neon-courier', 'ember-scout', 'synth-drifter', 'forest-warden',
  'solar-brawler', 'void-operative', 'circuit-mage', 'street-medic',
  'arena-rebel', 'tech-nomad'
]);

export function cleanHubId(value, maxLength = 120) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, maxLength);
}

function cleanName(value) {
  if (typeof value !== 'string') return 'PLAYER';
  return value.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12) || 'PLAYER';
}

function numberInRange(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function cleanAvatar(value, displayName) {
  const avatar = value && typeof value === 'object' ? value : {};
  return {
    name: cleanName(avatar.name || displayName),
    avatarSet: AVATAR_SETS.has(avatar.avatarSet) ? avatar.avatarSet : 'street-shadow',
    lineage: LINEAGES.has(avatar.lineage) ? avatar.lineage : 'human',
    bodyPreset: BODY_PRESETS.has(avatar.bodyPreset) ? avatar.bodyPreset : 'standard',
    bodyTone: BODY_TONES.has(avatar.bodyTone) ? avatar.bodyTone : 'tan',
    hairStyle: HAIR_STYLES.has(avatar.hairStyle) ? avatar.hairStyle : 'short',
    hairColor: HAIR_COLORS.has(avatar.hairColor) ? avatar.hairColor : '#15131a',
    outfit: OUTFITS.has(avatar.outfit) ? avatar.outfit : 'kore-cyan',
    legStyle: LEG_STYLES.has(avatar.legStyle) ? avatar.legStyle : 'fitted',
    accessory: ACCESSORIES.has(avatar.accessory) ? avatar.accessory : 'none'
  };
}

export function normalizeStoryHubPresence(value, now = Date.now()) {
  const sessionId = cleanHubId(value?.sessionId);
  if (!sessionId) return null;
  const displayName = cleanName(value?.displayName);
  return {
    sessionId,
    playerId: cleanHubId(value?.playerId, 96) || `story-${sessionId}`,
    displayName,
    avatar: cleanAvatar(value?.avatar, displayName),
    x: numberInRange(value?.x, -30.5, 30.5, -4.5),
    y: numberInRange(value?.y, 0.82, 12, 0.82),
    pose: value?.pose === 'walk' || value?.pose === 'sprint' || value?.pose === 'jump' || value?.pose === 'attack' ? value.pose : 'idle',
    facing: value?.facing === -1 ? -1 : 1,
    updatedAt: now
  };
}

export function storyHubPresenceKey(sessionId) {
  return `presence/${cleanHubId(sessionId)}.json`;
}

export async function listActiveStoryHubPlayers(store, now = Date.now()) {
  const listed = await store.list({ prefix: 'presence/' });
  const active = [];
  await Promise.all(listed.blobs.slice(0, 96).map(async (blob) => {
    const value = await store.get(blob.key, { type: 'json' }).catch(() => null);
    const presence = normalizeStoredPresence(value);
    if (!presence || now - presence.updatedAt > STORY_HUB_PRESENCE_TTL_MS) {
      await store.delete(blob.key).catch(() => undefined);
      return;
    }
    active.push(presence);
  }));
  return active.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 48);
}

function normalizeStoredPresence(value) {
  if (!value || typeof value !== 'object') return null;
  const updatedAt = Math.max(0, Math.round(Number(value.updatedAt) || 0));
  const presence = normalizeStoryHubPresence(value, updatedAt);
  return presence ? { ...presence, updatedAt } : null;
}

export function getStoryHubStore(event) {
  return getBlobStore(STORY_HUB_STORE_NAME, event);
}

export function json(statusCode, payload) {
  return { statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(payload) };
}

import { sanitizeStoryAvatar } from './avatarCatalog';
import {
  LEGACY_STORY_PROFILE_STORAGE_KEY,
  PREVIOUS_STORY_PROFILE_STORAGE_KEY,
  STORY_PROFILE_STORAGE_KEY,
  STORY_PROFILE_VERSION,
  type StoryAvatarDefinition,
  type StoryAvatarSlot,
  type LegacyStoryProfileV4,
  type StoryProfileV3,
  type StoryProfileV4
} from './types';

export const STORY_PROFILE_MAX_AVATARS = 5;

function sanitizeTimestamp(value: unknown, fallback: number) {
  const timestamp = Math.round(Number(value));
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : fallback;
}

export function sanitizeStoryProfile(value: unknown, preferredName?: string, now = Date.now()): StoryProfileV4 | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<StoryProfileV4>;
  if (record.version !== STORY_PROFILE_VERSION || record.avatarStyle !== 'kore-street-v1') return null;
  const createdAt = sanitizeTimestamp(record.createdAt, now);
  const cleanSlotId = (value: unknown, fallback: string) => typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,80}$/.test(value) ? value : fallback;
  const usedIds = new Set<string>();
  const avatars = (Array.isArray(record.avatars) ? record.avatars : []).flatMap((candidate, index): StoryAvatarSlot[] => {
    if (!candidate || typeof candidate !== 'object' || !candidate.avatar) return [];
    let id = cleanSlotId(candidate.id, `avatar-${index + 1}`);
    if (usedIds.has(id)) id = `avatar-${index + 1}`;
    usedIds.add(id);
    const slotCreatedAt = sanitizeTimestamp(candidate.createdAt, createdAt);
    return [{
      id,
      avatar: sanitizeStoryAvatar(candidate.avatar, preferredName),
      createdAt: slotCreatedAt,
      updatedAt: sanitizeTimestamp(candidate.updatedAt, slotCreatedAt)
    }];
  }).slice(0, STORY_PROFILE_MAX_AVATARS);
  if (avatars.length === 0 && record.avatar) avatars.push({ id: 'avatar-1', avatar: sanitizeStoryAvatar(record.avatar, preferredName), createdAt, updatedAt: createdAt });
  if (avatars.length === 0) return null;
  const validIds = new Set(avatars.map((slot) => slot.id));
  const equippedAvatarIds = Array.from(new Set(Array.isArray(record.equippedAvatarIds) ? record.equippedAvatarIds.filter((id): id is string => typeof id === 'string' && validIds.has(id)) : [])).slice(0, STORY_PROFILE_MAX_AVATARS);
  if (equippedAvatarIds.length === 0) equippedAvatarIds.push(avatars[0].id);
  const activeAvatarId = typeof record.activeAvatarId === 'string' && equippedAvatarIds.includes(record.activeAvatarId) ? record.activeAvatarId : equippedAvatarIds[0];
  const activeAvatar = avatars.find((slot) => slot.id === activeAvatarId)?.avatar ?? avatars[0].avatar;
  return {
    version: STORY_PROFILE_VERSION,
    avatarStyle: 'kore-street-v1',
    avatar: activeAvatar,
    avatars,
    activeAvatarId,
    equippedAvatarIds,
    createdAt,
    updatedAt: sanitizeTimestamp(record.updatedAt, createdAt),
    reviewedAt: record.reviewedAt == null ? null : sanitizeTimestamp(record.reviewedAt, createdAt)
  };
}

export function migrateStoryProfileV4(value: unknown, preferredName?: string, now = Date.now()): StoryProfileV4 | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<LegacyStoryProfileV4>;
  if (record.version !== 4 || record.avatarStyle !== 'kore-street-v1' || !record.avatar) return null;
  const createdAt = sanitizeTimestamp(record.createdAt, now);
  const avatar = sanitizeStoryAvatar(record.avatar, preferredName);
  return sanitizeStoryProfile({
    version: STORY_PROFILE_VERSION,
    avatarStyle: 'kore-street-v1',
    avatar,
    avatars: [{ id: 'avatar-1', avatar, createdAt, updatedAt: sanitizeTimestamp(record.updatedAt, createdAt) }],
    activeAvatarId: 'avatar-1',
    equippedAvatarIds: ['avatar-1'],
    createdAt,
    updatedAt: sanitizeTimestamp(record.updatedAt, createdAt),
    reviewedAt: record.reviewedAt == null ? null : sanitizeTimestamp(record.reviewedAt, createdAt)
  }, preferredName, now);
}

export function migrateStoryProfileV3(value: unknown, preferredName?: string, now = Date.now()): StoryProfileV4 | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<StoryProfileV3>;
  if (record.version !== 3 || record.avatarStyle !== 'kore-chibi-action-v3' || !record.avatar) return null;
  const createdAt = sanitizeTimestamp(record.createdAt, now);
  const avatar = sanitizeStoryAvatar(record.avatar, preferredName);
  return sanitizeStoryProfile({
    version: STORY_PROFILE_VERSION,
    avatarStyle: 'kore-street-v1',
    avatar,
    avatars: [{ id: 'avatar-1', avatar, createdAt, updatedAt: sanitizeTimestamp(record.updatedAt, createdAt) }],
    activeAvatarId: 'avatar-1',
    equippedAvatarIds: ['avatar-1'],
    createdAt,
    updatedAt: sanitizeTimestamp(record.updatedAt, createdAt),
    reviewedAt: null
  }, preferredName, now);
}

export function readStoryProfile(preferredName?: string): StoryProfileV4 | null {
  if (typeof window === 'undefined') return null;
  try {
    const current = sanitizeStoryProfile(JSON.parse(window.localStorage.getItem(STORY_PROFILE_STORAGE_KEY) ?? 'null'), preferredName);
    if (current) return current;
  } catch {
    // Try previous profiles below.
  }
  try {
    const migratedV4 = migrateStoryProfileV4(JSON.parse(window.localStorage.getItem(LEGACY_STORY_PROFILE_STORAGE_KEY) ?? 'null'), preferredName);
    if (migratedV4) {
      window.localStorage.setItem(STORY_PROFILE_STORAGE_KEY, JSON.stringify(migratedV4));
      return migratedV4;
    }
  } catch {
    // Try V3 below.
  }
  try {
    return migrateStoryProfileV3(JSON.parse(window.localStorage.getItem(PREVIOUS_STORY_PROFILE_STORAGE_KEY) ?? 'null'), preferredName);
  } catch {
    return null;
  }
}

export function writeStoryProfile(avatar: StoryAvatarDefinition, previous?: StoryProfileV4 | null, now = Date.now()): StoryProfileV4 {
  const current = previous ? sanitizeStoryProfile(previous, undefined, now) : null;
  const cleanAvatar = sanitizeStoryAvatar(avatar);
  const createdAt = current?.createdAt ?? now;
  const activeAvatarId = current?.activeAvatarId ?? 'avatar-1';
  const avatars = current
    ? current.avatars.map((slot) => slot.id === activeAvatarId ? { ...slot, avatar: cleanAvatar, updatedAt: now } : slot)
    : [{ id: activeAvatarId, avatar: cleanAvatar, createdAt, updatedAt: now }];
  const profile = sanitizeStoryProfile({
    version: STORY_PROFILE_VERSION,
    avatarStyle: 'kore-street-v1',
    avatar: cleanAvatar,
    avatars,
    activeAvatarId,
    equippedAvatarIds: current?.equippedAvatarIds ?? [activeAvatarId],
    createdAt,
    updatedAt: now,
    reviewedAt: now
  }, undefined, now)!;
  if (typeof window !== 'undefined') window.localStorage.setItem(STORY_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  return profile;
}

export function getActiveStoryAvatarSlot(profile: StoryProfileV4) {
  return profile.avatars.find((slot) => slot.id === profile.activeAvatarId) ?? profile.avatars[0];
}

export function getEquippedStoryAvatarSlots(profile: StoryProfileV4, capacity = STORY_PROFILE_MAX_AVATARS) {
  return profile.equippedAvatarIds
    .slice(0, Math.max(1, Math.min(STORY_PROFILE_MAX_AVATARS, Math.round(capacity))))
    .flatMap((id) => profile.avatars.find((slot) => slot.id === id) ?? []);
}

export function normalizeStoryAvatarRoster(profile: StoryProfileV4, capacity: number) {
  const current = sanitizeStoryProfile(profile)!;
  const safeCapacity = Math.max(1, Math.min(STORY_PROFILE_MAX_AVATARS, Math.round(capacity)));
  const equippedAvatarIds = current.equippedAvatarIds.filter((id) => current.avatars.some((slot) => slot.id === id)).slice(0, safeCapacity);
  if (equippedAvatarIds.length === 0) equippedAvatarIds.push(current.avatars[0].id);
  const activeAvatarId = equippedAvatarIds.includes(current.activeAvatarId) ? current.activeAvatarId : equippedAvatarIds[0];
  return sanitizeStoryProfile({ ...current, equippedAvatarIds, activeAvatarId, avatar: current.avatars.find((slot) => slot.id === activeAvatarId)?.avatar })!;
}

export function persistStoryProfile(profile: StoryProfileV4) {
  const saved = sanitizeStoryProfile(profile)!;
  if (typeof window !== 'undefined') window.localStorage.setItem(STORY_PROFILE_STORAGE_KEY, JSON.stringify(saved));
  return saved;
}

export function createStoryAvatar(profile: StoryProfileV4, avatar: StoryAvatarDefinition, capacity: number, now = Date.now()) {
  const current = sanitizeStoryProfile(profile)!;
  const safeCapacity = Math.max(1, Math.min(STORY_PROFILE_MAX_AVATARS, Math.round(capacity)));
  if (current.avatars.length >= safeCapacity || current.avatars.length >= STORY_PROFILE_MAX_AVATARS) return current;
  let index = 1;
  while (current.avatars.some((slot) => slot.id === `avatar-${index}`)) index += 1;
  const slot = { id: `avatar-${index}`, avatar: sanitizeStoryAvatar(avatar), createdAt: now, updatedAt: now };
  return persistStoryProfile({ ...current, avatars: [...current.avatars, slot], equippedAvatarIds: [...current.equippedAvatarIds, slot.id], updatedAt: now });
}

export function updateStoryAvatar(profile: StoryProfileV4, avatarId: string, avatar: StoryAvatarDefinition, now = Date.now()) {
  const current = sanitizeStoryProfile(profile)!;
  if (!current.avatars.some((slot) => slot.id === avatarId)) return current;
  return persistStoryProfile({ ...current, avatars: current.avatars.map((slot) => slot.id === avatarId ? { ...slot, avatar: sanitizeStoryAvatar(avatar), updatedAt: now } : slot), updatedAt: now });
}

export function removeStoryAvatar(profile: StoryProfileV4, avatarId: string, now = Date.now()) {
  const current = sanitizeStoryProfile(profile)!;
  if (current.avatars.length <= 1 || !current.avatars.some((slot) => slot.id === avatarId)) return current;
  const avatars = current.avatars.filter((slot) => slot.id !== avatarId);
  const equippedAvatarIds = current.equippedAvatarIds.filter((id) => id !== avatarId);
  if (equippedAvatarIds.length === 0) equippedAvatarIds.push(avatars[0].id);
  const activeAvatarId = current.activeAvatarId === avatarId ? equippedAvatarIds[0] : current.activeAvatarId;
  return persistStoryProfile({ ...current, avatars, equippedAvatarIds, activeAvatarId, updatedAt: now });
}

export function setActiveStoryAvatar(profile: StoryProfileV4, avatarId: string, now = Date.now()) {
  const current = sanitizeStoryProfile(profile)!;
  if (!current.equippedAvatarIds.includes(avatarId)) return current;
  return persistStoryProfile({ ...current, activeAvatarId: avatarId, updatedAt: now });
}

export function setEquippedStoryAvatars(profile: StoryProfileV4, avatarIds: string[], capacity: number, now = Date.now()) {
  const current = sanitizeStoryProfile(profile)!;
  const validIds = new Set(current.avatars.map((slot) => slot.id));
  const safeCapacity = Math.max(1, Math.min(STORY_PROFILE_MAX_AVATARS, Math.round(capacity)));
  const equippedAvatarIds = Array.from(new Set(avatarIds.filter((id) => validIds.has(id)))).slice(0, safeCapacity);
  if (equippedAvatarIds.length === 0) equippedAvatarIds.push(current.avatars[0].id);
  const activeAvatarId = equippedAvatarIds.includes(current.activeAvatarId) ? current.activeAvatarId : equippedAvatarIds[0];
  return persistStoryProfile({ ...current, equippedAvatarIds, activeAvatarId, updatedAt: now });
}

import { sanitizeStoryAvatar } from './avatarCatalog';
import {
  LEGACY_STORY_PROFILE_STORAGE_KEY,
  STORY_PROFILE_STORAGE_KEY,
  STORY_PROFILE_VERSION,
  type StoryAvatarDefinition,
  type StoryProfileV3,
  type StoryProfileV4
} from './types';

function sanitizeTimestamp(value: unknown, fallback: number) {
  const timestamp = Math.round(Number(value));
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : fallback;
}

export function sanitizeStoryProfile(value: unknown, preferredName?: string, now = Date.now()): StoryProfileV4 | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<StoryProfileV4>;
  if (record.version !== STORY_PROFILE_VERSION || record.avatarStyle !== 'kore-street-v1' || !record.avatar) return null;
  const createdAt = sanitizeTimestamp(record.createdAt, now);
  return {
    version: STORY_PROFILE_VERSION,
    avatarStyle: 'kore-street-v1',
    avatar: sanitizeStoryAvatar(record.avatar, preferredName),
    createdAt,
    updatedAt: sanitizeTimestamp(record.updatedAt, createdAt),
    reviewedAt: record.reviewedAt == null ? null : sanitizeTimestamp(record.reviewedAt, createdAt)
  };
}

export function migrateStoryProfileV3(value: unknown, preferredName?: string, now = Date.now()): StoryProfileV4 | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<StoryProfileV3>;
  if (record.version !== 3 || record.avatarStyle !== 'kore-chibi-action-v3' || !record.avatar) return null;
  const createdAt = sanitizeTimestamp(record.createdAt, now);
  return {
    version: STORY_PROFILE_VERSION,
    avatarStyle: 'kore-street-v1',
    avatar: sanitizeStoryAvatar(record.avatar, preferredName),
    createdAt,
    updatedAt: sanitizeTimestamp(record.updatedAt, createdAt),
    reviewedAt: null
  };
}

export function readStoryProfile(preferredName?: string): StoryProfileV4 | null {
  if (typeof window === 'undefined') return null;
  try {
    const current = sanitizeStoryProfile(JSON.parse(window.localStorage.getItem(STORY_PROFILE_STORAGE_KEY) ?? 'null'), preferredName);
    if (current) return current;
  } catch {
    // Try the previous profile below.
  }
  try {
    return migrateStoryProfileV3(JSON.parse(window.localStorage.getItem(LEGACY_STORY_PROFILE_STORAGE_KEY) ?? 'null'), preferredName);
  } catch {
    return null;
  }
}

export function writeStoryProfile(avatar: StoryAvatarDefinition, previous?: StoryProfileV4 | null, now = Date.now()): StoryProfileV4 {
  const profile: StoryProfileV4 = {
    version: STORY_PROFILE_VERSION,
    avatarStyle: 'kore-street-v1',
    avatar: sanitizeStoryAvatar(avatar),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    reviewedAt: now
  };
  if (typeof window !== 'undefined') window.localStorage.setItem(STORY_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  return profile;
}

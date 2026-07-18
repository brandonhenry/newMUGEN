import type { StoryAttackInput, StoryEnemyId, StoryRunBoonId } from './types';

export const STORY_PARTY_PROTOCOL_VERSION = 3 as const;

export type StoryPartyCombatIntent = {
  version: typeof STORY_PARTY_PROTOCOL_VERSION;
  type: 'intent';
  partyId: string;
  senderSessionId: string;
  sequence: number;
  clientTime: number;
  moveX: number;
  moveY: number;
  predictedX: number;
  predictedY: number;
  jump: boolean;
  block: boolean;
  attack?: StoryAttackInput;
};

export type StoryPartyActorSnapshot = { id: string; ownerSessionId: string; avatarId: string; human: boolean; x: number; y: number; facing: -1 | 1; health: number; maxHealth: number; ko: boolean; pose: string };
export type StoryPartyEnemySnapshot = { spawnId: string; enemyId: StoryEnemyId; x: number; y: number; facing: -1 | 1; health: number; maxHealth: number; alive: boolean };
export type StoryPartyProjectileSnapshot = { id: string; ownerId: string; x: number; y: number; velocityX: number; velocityY: number; expiresAt: number };
export type StoryPartyRewardEvent = { id: string; spawnId: string; enemyId: StoryEnemyId; tier: 'regular' | 'challenger'; xp: number; recipients: string[] };

export type StoryPartyAuthoritativeSnapshot = {
  version: typeof STORY_PARTY_PROTOCOL_VERSION;
  type: 'snapshot';
  partyId: string;
  leaderSessionId: string;
  authorityEpoch: number;
  sequence: number;
  serverTime: number;
  roomId: string;
  runSeed: string | null;
  floorNumber: number;
  pressureClockSeconds: number;
  eventState: unknown;
  boonStacks: Partial<Record<StoryRunBoonId, number>>;
  ledgerBankEventId: string | null;
  endReason: string | null;
  actors: StoryPartyActorSnapshot[];
  enemies: StoryPartyEnemySnapshot[];
  projectiles: StoryPartyProjectileSnapshot[];
  encounterState: unknown;
  rewardsPaused: boolean;
  rewardEvents: StoryPartyRewardEvent[];
};

export type StoryPartyProtocolMessage = StoryPartyCombatIntent | StoryPartyAuthoritativeSnapshot;

const ATTACKS: readonly StoryAttackInput[] = ['jab', 'heavy', 'kick', 'special'];
const cleanId = (value: unknown, max = 160) => typeof value === 'string' ? value.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, max) : '';
const finite = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function sanitizeStoryPartyCombatIntent(value: unknown, options: { partyId: string; members: ReadonlySet<string>; lastSequence: number; now?: number }): StoryPartyCombatIntent | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<StoryPartyCombatIntent>;
  const partyId = cleanId(record.partyId);
  const senderSessionId = cleanId(record.senderSessionId);
  const sequence = Math.max(0, Math.round(finite(record.sequence, -1)));
  const now = options.now ?? Date.now();
  if (record.version !== STORY_PARTY_PROTOCOL_VERSION || record.type !== 'intent' || partyId !== options.partyId || !options.members.has(senderSessionId) || sequence <= options.lastSequence || Math.abs(finite(record.clientTime, now) - now) > 10_000) return null;
  const attack = ATTACKS.includes(record.attack as StoryAttackInput) ? record.attack as StoryAttackInput : undefined;
  return { version: STORY_PARTY_PROTOCOL_VERSION, type: 'intent', partyId, senderSessionId, sequence, clientTime: Math.round(finite(record.clientTime, now)), moveX: clamp(finite(record.moveX), -1, 1), moveY: clamp(finite(record.moveY), -1, 1), predictedX: clamp(finite(record.predictedX), -1_000, 1_000), predictedY: clamp(finite(record.predictedY), -100, 1_000), jump: Boolean(record.jump), block: Boolean(record.block), ...(attack ? { attack } : {}) };
}

function sanitizeActor(value: unknown): StoryPartyActorSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<StoryPartyActorSnapshot>;
  const id = cleanId(record.id);
  const ownerSessionId = cleanId(record.ownerSessionId);
  const avatarId = cleanId(record.avatarId);
  if (!id || !ownerSessionId || !avatarId) return null;
  const maxHealth = Math.max(1, Math.round(finite(record.maxHealth, 100)));
  return { id, ownerSessionId, avatarId, human: Boolean(record.human), x: clamp(finite(record.x), -1_000, 1_000), y: clamp(finite(record.y), -100, 1_000), facing: record.facing === -1 ? -1 : 1, health: clamp(Math.round(finite(record.health, maxHealth)), 0, maxHealth), maxHealth, ko: Boolean(record.ko), pose: cleanId(record.pose, 40) || 'idle' };
}

function sanitizeReward(value: unknown): StoryPartyRewardEvent | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<StoryPartyRewardEvent>;
  const id = cleanId(record.id);
  const spawnId = cleanId(record.spawnId);
  const enemyId = cleanId(record.enemyId) as StoryEnemyId;
  if (!id || !spawnId || !enemyId || (record.tier !== 'regular' && record.tier !== 'challenger')) return null;
  return { id, spawnId, enemyId, tier: record.tier, xp: Math.max(0, Math.round(finite(record.xp))), recipients: Array.isArray(record.recipients) ? Array.from(new Set(record.recipients.map((entry) => cleanId(entry)).filter(Boolean))).slice(0, 5) : [] };
}

export function sanitizeStoryPartySnapshot(value: unknown, options: { partyId: string; leaderSessionId: string; lastEpoch: number; lastSequence: number }): StoryPartyAuthoritativeSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<StoryPartyAuthoritativeSnapshot>;
  const partyId = cleanId(record.partyId);
  const leaderSessionId = cleanId(record.leaderSessionId);
  const authorityEpoch = Math.max(0, Math.round(finite(record.authorityEpoch, -1)));
  const sequence = Math.max(0, Math.round(finite(record.sequence, -1)));
  if (record.version !== STORY_PARTY_PROTOCOL_VERSION || record.type !== 'snapshot' || partyId !== options.partyId || leaderSessionId !== options.leaderSessionId || authorityEpoch < options.lastEpoch || (authorityEpoch === options.lastEpoch && sequence <= options.lastSequence)) return null;
  return {
    version: STORY_PARTY_PROTOCOL_VERSION,
    type: 'snapshot',
    partyId,
    leaderSessionId,
    authorityEpoch,
    sequence,
    serverTime: Math.max(0, Math.round(finite(record.serverTime, Date.now()))),
    roomId: cleanId(record.roomId) || 'surface',
    runSeed: cleanId(record.runSeed, 220) || null,
    floorNumber: Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(finite(record.floorNumber)))),
    pressureClockSeconds: Math.max(0, finite(record.pressureClockSeconds)),
    eventState: record.eventState ?? null,
    boonStacks: record.boonStacks && typeof record.boonStacks === 'object' ? record.boonStacks : {},
    ledgerBankEventId: cleanId(record.ledgerBankEventId, 160) || null,
    endReason: cleanId(record.endReason, 40) || null,
    actors: Array.isArray(record.actors) ? record.actors.flatMap((actor) => sanitizeActor(actor) ?? []).slice(0, 5) : [],
    enemies: Array.isArray(record.enemies) ? record.enemies.flatMap((enemy) => {
      if (!enemy || typeof enemy !== 'object') return [];
      const candidate = enemy as StoryPartyEnemySnapshot;
      const spawnId = cleanId(candidate.spawnId);
      const enemyId = cleanId(candidate.enemyId) as StoryEnemyId;
      if (!spawnId || !enemyId) return [];
      const maxHealth = Math.max(1, Math.round(finite(candidate.maxHealth, 1)));
      return [{ spawnId, enemyId, x: clamp(finite(candidate.x), -1_000, 1_000), y: clamp(finite(candidate.y), -100, 1_000), facing: candidate.facing === -1 ? -1 as const : 1 as const, health: clamp(Math.round(finite(candidate.health, maxHealth)), 0, maxHealth), maxHealth, alive: Boolean(candidate.alive) }];
    }).slice(0, 32) : [],
    projectiles: Array.isArray(record.projectiles) ? record.projectiles.flatMap((projectile) => {
      if (!projectile || typeof projectile !== 'object') return [];
      const candidate = projectile as StoryPartyProjectileSnapshot;
      const id = cleanId(candidate.id);
      const ownerId = cleanId(candidate.ownerId);
      return id && ownerId ? [{ id, ownerId, x: finite(candidate.x), y: finite(candidate.y), velocityX: clamp(finite(candidate.velocityX), -100, 100), velocityY: clamp(finite(candidate.velocityY), -100, 100), expiresAt: Math.max(0, Math.round(finite(candidate.expiresAt))) }] : [];
    }).slice(0, 64) : [],
    encounterState: record.encounterState ?? null,
    rewardsPaused: Boolean(record.rewardsPaused),
    rewardEvents: Array.isArray(record.rewardEvents) ? record.rewardEvents.flatMap((reward) => sanitizeReward(reward) ?? []).slice(0, 64) : []
  };
}

export function unseenStoryPartyRewards(snapshot: StoryPartyAuthoritativeSnapshot, recipientSessionId: string, seen: Set<string>) {
  return snapshot.rewardEvents.filter((event) => event.recipients.includes(recipientSessionId) && !seen.has(event.id)).map((event) => { seen.add(event.id); return event; });
}

export type StoryPartyAiDecision = { actorId: string; targetSpawnId: string | null; moveX: -1 | 0 | 1; attack: boolean; nextAttackAt: number };

export function decideStoryPartyAi(actor: Pick<StoryPartyActorSnapshot, 'id' | 'x' | 'y' | 'ko'>, enemies: StoryPartyEnemySnapshot[], now: number, previousAttackAt = 0): StoryPartyAiDecision {
  const target = enemies.filter((enemy) => enemy.alive).sort((left, right) => Math.hypot(left.x - actor.x, left.y - actor.y) - Math.hypot(right.x - actor.x, right.y - actor.y) || left.spawnId.localeCompare(right.spawnId))[0];
  if (!target || actor.ko) return { actorId: actor.id, targetSpawnId: null, moveX: 0, attack: false, nextAttackAt: previousAttackAt };
  const distance = Math.abs(target.x - actor.x);
  const cooldown = 720 + (Array.from(actor.id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5) * 90;
  const attack = distance <= 1.65 && now >= previousAttackAt;
  return { actorId: actor.id, targetSpawnId: target.spawnId, moveX: distance <= 1.3 ? 0 : target.x < actor.x ? -1 : 1, attack, nextAttackAt: attack ? now + cooldown : previousAttackAt };
}

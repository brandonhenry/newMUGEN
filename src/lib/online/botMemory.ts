import type { OnlineBotOpponent } from './bots';
import type { OnlineMatchQueue, OnlineMatchRequest, OnlineMatchResult } from './matchmaking';
import { emptyRankedKrScores, rankedKrKeys, type RankedKrScores } from './ranked';

const BOT_MEMORY_KEY = 'kore.online.botMemory.v1';
const BOT_MEMORY_LIMIT = 80;
const BOT_MEMORY_REUSE_CHANCE = 0.34;
const BOT_MEMORY_RIVAL_REUSE_CHANCE = 0.46;
const RANKED_REUSE_KP_RANGE = 180;
const CASUAL_REUSE_KP_RANGE = 300;

type StoredOnlineBot = OnlineBotOpponent & {
  firstSeenAt: number;
  lastSeenAt: number;
  lastMatchedAt: number;
  encounters: number;
  playerWins: number;
  playerLosses: number;
  queues: OnlineMatchQueue[];
  lastPlayerKp: number;
};

type OnlineBotMemoryStore = {
  bots: StoredOnlineBot[];
  lastBotPlayerId?: string;
  updatedAt: number;
};

export function selectBotOpponentForMatch(
  request: OnlineMatchRequest,
  result: OnlineMatchResult,
  now = Date.now(),
  random = Math.random
): OnlineMatchResult {
  if (result.opponentKind !== 'bot' || !result.botOpponent) return result;
  const queue = normalizeQueue(request.queue ?? result.queue);
  const playerKp = normalizeKp(request.kp ?? result.hostKp ?? 1200);
  const store = readBotMemory();
  const remembered = chooseRememberedBot(store, request, queue, playerKp, now, random);
  const selected = remembered ?? result.botOpponent;
  rememberBot(selected, {
    queue,
    playerKp,
    now,
    matched: true
  }, store);

  return {
    ...result,
    guestPeerId: selected.playerId,
    guestCharacterId: selected.characterId,
    guestKp: selected.kp,
    opponentKind: 'bot',
    botOpponent: selected
  };
}

export function recordOnlineBotMatchOutcome(
  bot: OnlineBotOpponent,
  options: {
    queue?: OnlineMatchQueue;
    playerKp?: number;
    playerDidWin: boolean;
    now?: number;
  }
) {
  const queue = normalizeQueue(options.queue);
  const playerKp = normalizeKp(options.playerKp ?? bot.kp);
  const store = readBotMemory();
  const stored = rememberBot(bot, {
    queue,
    playerKp,
    now: options.now ?? Date.now(),
    matched: false
  }, store);
  if (options.playerDidWin) stored.playerWins += 1;
  else stored.playerLosses += 1;
  writeBotMemory(pruneBotMemory(store));
}

function chooseRememberedBot(
  store: OnlineBotMemoryStore,
  request: OnlineMatchRequest,
  queue: OnlineMatchQueue,
  playerKp: number,
  now: number,
  random: () => number
) {
  const candidates = store.bots.filter((bot) => isEligibleRememberedBot(bot, request, queue, playerKp));
  if (candidates.length === 0) return null;
  const hasRival = candidates.some((bot) => bot.playerLosses > bot.playerWins);
  const reuseChance = hasRival ? BOT_MEMORY_RIVAL_REUSE_CHANCE : BOT_MEMORY_REUSE_CHANCE;
  if (random() >= reuseChance) return null;

  return candidates
    .map((bot) => ({
      bot,
      score: rememberedBotScore(bot, store.lastBotPlayerId, playerKp, now, random)
    }))
    .sort((left, right) => right.score - left.score)[0]?.bot ?? null;
}

function isEligibleRememberedBot(
  bot: StoredOnlineBot,
  request: OnlineMatchRequest,
  queue: OnlineMatchQueue,
  playerKp: number
) {
  const characterIds = normalizeCharacterIds(request.availableCharacterIds);
  if (characterIds.length > 0 && !characterIds.includes(bot.characterId)) return false;
  const range = queue === 'ranked' ? RANKED_REUSE_KP_RANGE : CASUAL_REUSE_KP_RANGE;
  return Math.abs(bot.kp - playerKp) <= range || Math.abs(bot.lastPlayerKp - playerKp) <= range;
}

function rememberedBotScore(
  bot: StoredOnlineBot,
  lastBotPlayerId: string | undefined,
  playerKp: number,
  now: number,
  random: () => number
) {
  const kpCloseness = Math.max(0, 1 - Math.abs(bot.kp - playerKp) / 400) * 40;
  const rivalry = Math.max(0, bot.playerLosses - bot.playerWins) * 10;
  const familiarity = Math.min(18, bot.encounters * 3);
  const staleBonus = Math.min(14, Math.max(0, now - bot.lastMatchedAt) / 120_000);
  const repeatPenalty = bot.playerId === lastBotPlayerId ? 18 : 0;
  return kpCloseness + rivalry + familiarity + staleBonus + random() * 12 - repeatPenalty;
}

function rememberBot(
  bot: OnlineBotOpponent,
  options: {
    queue: OnlineMatchQueue;
    playerKp: number;
    now: number;
    matched: boolean;
  },
  existingStore?: OnlineBotMemoryStore
) {
  const store = existingStore ?? readBotMemory();
  const current = store.bots.find((item) => item.playerId === bot.playerId);
  const stored = current ?? {
    ...bot,
    firstSeenAt: options.now,
    lastSeenAt: options.now,
    lastMatchedAt: 0,
    encounters: 0,
    playerWins: 0,
    playerLosses: 0,
    queues: [],
    lastPlayerKp: options.playerKp
  };
  Object.assign(stored, {
    ...bot,
    lastSeenAt: options.now,
    lastMatchedAt: options.matched ? options.now : stored.lastMatchedAt,
    encounters: options.matched ? stored.encounters + 1 : stored.encounters,
    queues: Array.from(new Set([...stored.queues, options.queue])),
    lastPlayerKp: options.playerKp
  });
  if (!current) store.bots.push(stored);
  if (options.matched) store.lastBotPlayerId = bot.playerId;
  store.updatedAt = options.now;
  writeBotMemory(pruneBotMemory(store));
  return stored;
}

function pruneBotMemory(store: OnlineBotMemoryStore) {
  store.bots = store.bots
    .slice()
    .sort((left, right) => {
      const leftValue = left.lastMatchedAt + left.encounters * 30_000 + (left.playerLosses - left.playerWins) * 15_000;
      const rightValue = right.lastMatchedAt + right.encounters * 30_000 + (right.playerLosses - right.playerWins) * 15_000;
      return rightValue - leftValue;
    })
    .slice(0, BOT_MEMORY_LIMIT);
  return store;
}

function readBotMemory(): OnlineBotMemoryStore {
  const fallback = { bots: [], updatedAt: Date.now() };
  if (!canUseLocalStorage()) return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BOT_MEMORY_KEY) ?? 'null') as Partial<OnlineBotMemoryStore> | null;
    if (!parsed || !Array.isArray(parsed.bots)) return fallback;
    return {
      bots: parsed.bots.map(normalizeStoredBot).filter((bot): bot is StoredOnlineBot => Boolean(bot)),
      lastBotPlayerId: typeof parsed.lastBotPlayerId === 'string' ? parsed.lastBotPlayerId : undefined,
      updatedAt: normalizeKp(parsed.updatedAt ?? fallback.updatedAt)
    };
  } catch {
    return fallback;
  }
}

function writeBotMemory(store: OnlineBotMemoryStore) {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(BOT_MEMORY_KEY, JSON.stringify(store));
  } catch {
    // Storage can be full or disabled; matchmaking should keep working either way.
  }
}

function normalizeStoredBot(value: unknown): StoredOnlineBot | null {
  if (!value || typeof value !== 'object') return null;
  const bot = value as Partial<StoredOnlineBot>;
  if (typeof bot.playerId !== 'string' || typeof bot.displayName !== 'string' || typeof bot.characterId !== 'string') return null;
  return {
    playerId: bot.playerId,
    displayName: bot.displayName,
    characterId: bot.characterId,
    kp: normalizeKp(bot.kp),
    kr: normalizeKrScores(bot.kr),
    cpuDifficulty: bot.cpuDifficulty ?? 3,
    isBot: true,
    firstSeenAt: normalizeKp(bot.firstSeenAt),
    lastSeenAt: normalizeKp(bot.lastSeenAt),
    lastMatchedAt: normalizeKp(bot.lastMatchedAt),
    encounters: normalizeKp(bot.encounters),
    playerWins: normalizeKp(bot.playerWins),
    playerLosses: normalizeKp(bot.playerLosses),
    queues: Array.isArray(bot.queues) ? bot.queues.filter((queue): queue is OnlineMatchQueue => queue === 'casual' || queue === 'ranked' || queue === 'training') : [],
    lastPlayerKp: normalizeKp(bot.lastPlayerKp ?? bot.kp)
  };
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function normalizeQueue(value: unknown): OnlineMatchQueue {
  return value === 'ranked' || value === 'training' ? value : 'casual';
}

function normalizeKp(value: unknown) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function normalizeKrScores(value: unknown): RankedKrScores {
  const source = value && typeof value === 'object' ? value as Partial<RankedKrScores> : {};
  const base = emptyRankedKrScores();
  return rankedKrKeys.reduce((next, key) => {
    next[key] = Math.max(0, Math.min(100, Math.round(Number(source[key] ?? base[key]) || 0)));
    return next;
  }, {} as RankedKrScores);
}

function normalizeCharacterIds(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => typeof item === 'string' ? item.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 96) : '').filter(Boolean).slice(0, 128)
    : [];
}

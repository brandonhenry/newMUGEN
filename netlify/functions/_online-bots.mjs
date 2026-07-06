export const CASUAL_BOT_FALLBACK_MS = 8_000;
export const RANKED_BOT_FALLBACK_MS = 48_000;
export const TOURNAMENT_BOT_FILL_MS = 60_000;

export const rankedKrKeys = ['aggression', 'defense', 'combo', 'punishment', 'resource', 'consistency'];

const BOT_FIRST_NAMES = [
  'ACE', 'MIRA', 'NOAH', 'LENA', 'KAI', 'JUNO', 'REMY', 'ZARA',
  'NIKO', 'MILA', 'ELI', 'TARA', 'RYAN', 'IVY', 'OMAR', 'SAGE',
  'LUCA', 'NOVA', 'ARYA', 'KIAN', 'MAYA', 'ROAN', 'SKYE', 'DANE',
  'LEO', 'NIA', 'RHEA', 'COLE', 'FINN', 'VIKA', 'ENZO', 'LYRA'
];

const BOT_LAST_NAMES = [
  'VEGA', 'KANE', 'RIFT', 'WARD', 'STORM', 'REED', 'COLE', 'VALE',
  'CROSS', 'RAY', 'VOSS', 'QUINN', 'KNOX', 'SLOAN', 'WREN', 'IRON',
  'SHAW', 'BLAKE', 'NASH', 'WOLF', 'STONE', 'CHASE', 'FROST', 'RYU',
  'HALE', 'CROW', 'EDGE', 'FLINT', 'NOVA', 'DAWN', 'BLAZE', 'FOX'
];

export function createOnlineBotOpponent(input = {}) {
  const seed = input.seed || 'kore-bot';
  const playerKp = cleanKp(input.playerKp ?? 1200);
  const playerKr = cleanKrScores(input.playerKr);
  const characterIds = cleanCharacterIds(input.availableCharacterIds);
  const firstName = BOT_FIRST_NAMES[seededInt(seed, 11, BOT_FIRST_NAMES.length)] || BOT_FIRST_NAMES[0];
  const lastName = BOT_LAST_NAMES[seededInt(seed, 13, BOT_LAST_NAMES.length)] || BOT_LAST_NAMES[0];
  const kpOffset = input.queue === 'ranked'
    ? Math.round((seededUnit(seed, 23) * 240) - 120)
    : Math.round((seededUnit(seed, 23) * 180) - 90);
  const kp = Math.max(0, cleanKp(input.targetKp ?? (playerKp + kpOffset)));
  const kr = Object.fromEntries(rankedKrKeys.map((key, index) => [
    key,
    clampScore(playerKr[key] + Math.round((seededUnit(seed, 41 + index * 17) * 20) - 10))
  ]));
  const fallbackCharacterId = cleanId(input.fallbackCharacterId) || characterIds[0] || 'astra';
  const characterId = characterIds.length > 0
    ? characterIds[seededInt(seed, 7, characterIds.length)] || fallbackCharacterId
    : fallbackCharacterId;

  return {
    playerId: `bot-${hashString(`${seed}:player`).toString(36)}`,
    displayName: `${firstName} ${lastName}`.slice(0, 12),
    characterId,
    kp,
    kr,
    cpuDifficulty: botCpuDifficulty(kp, kr),
    isBot: true
  };
}

export function botCpuDifficulty(kp, kr) {
  const averageKr = rankedKrKeys.reduce((sum, key) => sum + cleanCount(kr?.[key]), 0) / rankedKrKeys.length;
  const strength = cleanKp(kp) + (averageKr - 50) * 8;
  if (strength >= 1900) return 5;
  if (strength >= 1650) return 4;
  if (strength >= 1350) return 3;
  return 2;
}

export function cleanKrScores(value) {
  return Object.fromEntries(rankedKrKeys.map((key) => [key, clampScore(value?.[key] ?? 50)]));
}

export function cleanCharacterIds(value) {
  return Array.isArray(value)
    ? value.map(cleanId).filter(Boolean).slice(0, 128)
    : [];
}

function cleanId(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 96);
}

function cleanKp(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function cleanCount(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function seededInt(seed, salt, max) {
  if (max <= 0) return 0;
  return Math.floor(seededUnit(seed, salt) * max) % max;
}

function seededUnit(seed, salt) {
  const value = hashString(`${seed}:${salt}`);
  return (value % 10_000) / 10_000;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

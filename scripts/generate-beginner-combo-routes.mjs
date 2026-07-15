import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const baseAnimation = { jab: 'jableft', heavy: 'jabright', kick: 'kickleft', special: 'kickright' };
const buttonInput = { 1: 'jab', 2: 'heavy', 3: 'kick', 4: 'special' };
const gestureInput = {
  light: 'jab',
  medium: 'heavy',
  heavy: 'kick',
  special: 'special',
  'special+light': 'jab',
  'special+medium': 'heavy',
  'special+heavy': 'kick'
};
const chordCommand = {
  'special+light': '1+4',
  'special+medium': '2+4',
  'special+heavy': '3+4'
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function commandInput(command) {
  const buttons = [...String(command).matchAll(/[1-4]/g)];
  return buttonInput[buttons.at(-1)?.[0] ?? '1'] ?? 'jab';
}

function mergeMove(character, input, key, command) {
  const base = character.moves?.find((move) => move.input === input) ?? character.moves?.[0] ?? {};
  const overrides = character.moveOverrides ?? {};
  return {
    ...base,
    ...(overrides[input] ?? {}),
    ...(overrides[baseAnimation[input]] ?? {}),
    ...(command ? overrides[command] ?? {} : {}),
    ...(overrides[key] ?? {})
  };
}

function candidateRoutes(character) {
  const frames = character.animationFrames ?? {};
  const candidates = [];
  for (const input of Object.keys(baseAnimation)) {
    const animationKey = baseAnimation[input];
    if (!Array.isArray(frames[animationKey]) || frames[animationKey].length === 0) continue;
    candidates.push({ input, animationKey, move: mergeMove(character, input, animationKey) });
  }
  for (const animationKey of Object.keys(frames).filter((key) => key.startsWith('cmd:')).sort()) {
    if (!Array.isArray(frames[animationKey]) || frames[animationKey].length === 0) continue;
    const command = animationKey.slice(4);
    const input = commandInput(command);
    candidates.push({ input, command, animationKey, move: mergeMove(character, input, animationKey, command) });
  }
  return candidates.filter(({ move }) => (move.damage ?? 1) > 0);
}

function isKiCandidate(candidate) {
  return candidate.command?.startsWith('O+') || candidate.move.usesKi || candidate.move.kiBurst;
}

function isGroundedCandidate(candidate) {
  const command = candidate.command ?? '';
  return !candidate.move.jumpBeforeMove &&
    !/^(u|U|u\/f|U\/F|u\/b|U\/B|WR|iWR|f,f|b,b|SS|SSL|SSR|FC|WS)\+/.test(command) &&
    !candidate.move.throwCapture &&
    !candidate.move.healsHp &&
    !candidate.move.timeStopFrames;
}

function genericLabel(label = '') {
  return /frame link|^[1-4](\+[1-4])?$|left hand|right hand|left foot|right foot/i.test(label);
}

function candidateScore(candidate, desiredInput, usedKeys, finisher = false) {
  const move = candidate.move;
  let score = candidate.input === desiredInput ? 20 : 0;
  if (!genericLabel(move.label)) score += 10;
  if (!usedKeys.has(candidate.animationKey)) score += 8;
  if (candidate.command) score += 3;
  if (move.forwardForce) score += Math.min(5, Math.abs(move.forwardForce));
  if (move.tracking === 'homing') score += 2;
  if (move.launchHeight) score += finisher ? -2 : -9;
  if (move.tornado) score += finisher ? -1 : -8;
  if (move.knockdown) score += finisher ? 30 : -12;
  score -= Math.max(0, (move.damage ?? 8) - 18);
  return score;
}

function pickCandidate(pool, desiredInput, usedKeys, finisher = false) {
  return [...pool].sort((a, b) =>
    candidateScore(b, desiredInput, usedKeys, finisher) - candidateScore(a, desiredInput, usedKeys, finisher) ||
    a.animationKey.localeCompare(b.animationKey)
  )[0];
}

function ensureKnockdownFinisher(character, candidates) {
  const grounded = candidates.filter((candidate) => !isKiCandidate(candidate) && isGroundedCandidate(candidate));
  const authored = grounded.filter((candidate) => candidate.move.knockdown);
  const finisher = pickCandidate(authored.length > 0 ? authored : grounded, 'special', new Set(), true) ?? candidates[0];
  if (!finisher) throw new Error(`${character.id}: no executable finisher`);
  if (!finisher.move.knockdown) {
    character.moveOverrides ??= {};
    const key = finisher.command ? finisher.animationKey : finisher.animationKey;
    const existing = character.moveOverrides[key] ?? {};
    character.moveOverrides[key] = {
      ...existing,
      knockdown: true,
      pushback: Math.max(1, Number(existing.pushback ?? finisher.move.pushback ?? 0.7)),
      blockPushback: Math.max(0.48, Number(existing.blockPushback ?? finisher.move.blockPushback ?? 0.32)),
      onBlockFrames: Math.min(-10, Number(existing.onBlockFrames ?? finisher.move.onBlockFrames ?? -10)),
      whiffRecoveryFrames: Math.max(10, Number(existing.whiffRecoveryFrames ?? finisher.move.whiffRecoveryFrames ?? 10))
    };
    finisher.move = mergeMove(character, finisher.input, finisher.animationKey, finisher.command);
  }
  return finisher;
}

function predictedGapAfter(candidate) {
  const pushback = Math.max(0, Number(candidate.move.pushback ?? 0.55));
  const attackerTravel = Math.max(0, Number(candidate.move.forwardForce ?? 0)) * 0.18;
  return Math.max(0.45, 0.72 + pushback - attackerTravel);
}

function predictedReach(candidate) {
  return Math.max(0.35, Number(candidate.move.range ?? 1)) +
    Math.max(0, Number(candidate.move.forwardForce ?? 0)) * 0.16 +
    (candidate.move.tracking === 'homing' ? 0.35 : 0);
}

function movementBridge(previous, next) {
  if (!previous) return undefined;
  const gap = predictedGapAfter(previous);
  const reach = predictedReach(next);
  if (gap <= reach + 0.12) return undefined;
  if (gap <= reach + 1.35) return 'dashForward';
  return null;
}

function makeStep(gesture, candidate, index, finisher, kiCandidate, movementBefore, previous) {
  const move = candidate.move;
  const startup = Math.max(1, Math.round(move.startupFrames ?? 12));
  const previousAdvantage = Math.max(5, Math.round(previous?.move.onComboHitFrames ?? previous?.move.onHitFrames ?? 16));
  const linkSlack = previous ? previousAdvantage + 16 - startup : 16;
  const step = {
    gesture,
    input: candidate.input,
    ...(candidate.command ? { command: candidate.command } : {}),
    animationKey: candidate.animationKey,
    label: move.label ?? candidate.command ?? `${gesture} attack`,
    windowBefore: clamp(linkSlack, 3, 16),
    windowAfter: clamp(linkSlack + 4, 6, 24),
    ...(movementBefore ? {
      movementBefore,
      movementMinFrames: movementBefore === 'neutral' ? 3 : 1,
      movementMaxFrames: movementBefore === 'neutral' ? 12 : 24
    } : {}),
    expect: finisher ? 'knockdown' : move.launchHeight ? 'launch' : index > 0 ? 'hit' : 'hit'
  };
  if (finisher && gesture !== 'light') {
    if (kiCandidate) {
      step.kiCommand = kiCandidate.command;
      step.kiAnimationKey = kiCandidate.animationKey;
      step.kiCost = clamp(Math.round(kiCandidate.move.kiCost ?? 35), 0, 100);
    }
    step.poweredKiFallback = true;
  }
  return step;
}

function buildRoute(character, candidates, finisher, kiCandidate, spec) {
  const safe = candidates.filter((candidate) => !isKiCandidate(candidate) && isGroundedCandidate(candidate));
  const used = new Set();
  let launcherCount = 0;
  let tornadoCount = 0;
  const selected = spec.gestures.map((gesture, index) => {
    const isFinisher = index === spec.gestures.length - 1;
    let candidate;
    const exactChord = chordCommand[gesture];
    if (exactChord) candidate = safe.find((item) => item.command === exactChord);
    if (!isFinisher && candidate && ((finisher.move.launchHeight && candidate.move.launchHeight) || (finisher.move.tornado && candidate.move.tornado))) {
      candidate = undefined;
    }
    if (!candidate && isFinisher) candidate = finisher;
    const propertySafe = safe.filter((item) =>
      (!item.move.launchHeight || (launcherCount === 0 && (isFinisher || !finisher.move.launchHeight))) &&
      (!item.move.tornado || (tornadoCount === 0 && (isFinisher || !finisher.move.tornado)))
    );
    if (!candidate) candidate = pickCandidate(propertySafe.length ? propertySafe : safe, gestureInput[gesture], used, false) ?? finisher;
    used.add(candidate.animationKey);
    if (candidate.move.launchHeight) launcherCount += 1;
    if (candidate.move.tornado) tornadoCount += 1;
    return candidate;
  });
  const steps = selected.map((candidate, index) => {
    const bridge = movementBridge(selected[index - 1], candidate);
    if (bridge === null) throw new Error(`${character.id}:${spec.id}: pushback exceeds validated dash bridge`);
    return makeStep(spec.gestures[index], candidate, index, index === selected.length - 1, kiCandidate, bridge, selected[index - 1]);
  });
  const route = {
    id: `${character.id}:beginner:${spec.id}`,
    title: spec.title,
    family: spec.family,
    gestures: spec.gestures,
    steps
  };
  validateRoute(character, route, selected);
  return route;
}

function validateRoute(character, route, selected) {
  if (route.steps.length < 3 || route.steps.length > 30) throw new Error(`${route.id}: attacks must stay between 3 and 30`);
  if (route.steps.at(-1)?.expect !== 'knockdown' || !selected.at(-1)?.move.knockdown) throw new Error(`${route.id}: missing real knockdown finisher`);
  if (selected.filter((candidate) => candidate.move.launchHeight).length > 1) throw new Error(`${route.id}: more than one launcher`);
  if (selected.filter((candidate) => candidate.move.tornado).length > 1) throw new Error(`${route.id}: more than one tornado`);
  const hasKiFinisher = route.steps.some((step) => step.kiCommand || step.poweredKiFallback);
  const damageScale = [1, 0.82, 0.76, 0.7, 0.64, 0.58, 0.5, 0.44];
  const estimatedDamage = selected.reduce((total, candidate, index) =>
    total + Math.max(1, Math.round(Number(candidate.move.damage ?? 1) * 0.6 * (damageScale[index] ?? 0.36))), 0);
  const damageCap = Number(character.stats?.health ?? 100) * (hasKiFinisher ? 0.45 : 0.35);
  route.estimatedDamage = estimatedDamage;
  route.estimatedHits = route.steps.length;
  route.requiresKi = hasKiFinisher;
  route.damageScale = estimatedDamage > damageCap ? Math.max(0.1, 0.6 * damageCap / estimatedDamage) : 0.6;
  route.tier = route.steps.length >= 21 ? 'marathon' : route.steps.length >= 11 ? 'long' : route.steps.length >= 6 ? 'medium' : 'short';
  for (const step of route.steps) {
    if (!(character.animationFrames?.[step.animationKey]?.length > 0)) throw new Error(`${route.id}: missing ${step.animationKey}`);
    if (!step.label || genericLabel(step.label)) throw new Error(`${route.id}: unnamed move ${step.animationKey}`);
    if (step.windowBefore <= 0 || step.windowAfter <= 0) throw new Error(`${route.id}: invalid input window`);
  }
}

const routeSpecs = [
  { id: 'light-core', title: 'Light Knockdown Chain', family: 'core', gestures: Array(8).fill('light') },
  { id: 'medium-core', title: 'Medium Ki Chain', family: 'core', gestures: Array(8).fill('medium') },
  { id: 'heavy-core', title: 'Heavy Ki Chain', family: 'core', gestures: Array(8).fill('heavy') },
  { id: 'special-core', title: 'Special Ki Finish', family: 'core', gestures: ['special', 'special', 'special'] },
  { id: 'light-medium-heavy', title: 'Rising Power Route', family: 'mixed', gestures: ['light', 'medium', 'heavy'] },
  { id: 'special-light-route', title: 'Special Light Route', family: 'mixed', gestures: ['special+light', 'medium', 'heavy'] },
  { id: 'special-medium-route', title: 'Special Medium Route', family: 'mixed', gestures: ['special+medium', 'heavy', 'special'] },
  { id: 'special-heavy-route', title: 'Special Heavy Route', family: 'mixed', gestures: ['special+heavy', 'light', 'special'] }
];

export function generateBeginnerComboRoutes(character) {
  const next = structuredClone(character);
  const candidates = candidateRoutes(next);
  if (candidates.length === 0) return next;
  const finisher = ensureKnockdownFinisher(next, candidates);
  const refreshed = candidateRoutes(next);
  const refreshedFinisher = refreshed.find((candidate) => candidate.animationKey === finisher.animationKey) ?? finisher;
  const kiCandidates = refreshed
    .filter((candidate) => isKiCandidate(candidate) && isGroundedCandidate(candidate))
    .sort((a, b) => (a.move.kiCost ?? 35) - (b.move.kiCost ?? 35) || candidateScore(b, b.input, new Set(), true) - candidateScore(a, a.input, new Set(), true));
  next.beginnerComboRoutes = routeSpecs.map((spec) => buildRoute(next, refreshed, refreshedFinisher, kiCandidates[0], spec));
  return next;
}

export function generateBeginnerComboRoster(repoRoot, { write = false } = {}) {
  const charactersDir = join(repoRoot, 'public', 'characters');
  const changed = [];
  for (const id of readdirSync(charactersDir).sort()) {
    const manifestPath = join(charactersDir, id, 'character.json');
    if (!existsSync(manifestPath)) continue;
    const text = readFileSync(manifestPath, 'utf8');
    const character = JSON.parse(text);
    if (character.unplayable) continue;
    const next = generateBeginnerComboRoutes(character);
    const nextText = `${JSON.stringify(next, null, 2)}\n`;
    if (nextText === text) continue;
    changed.push(manifestPath);
    if (write) writeFileSync(manifestPath, nextText);
  }
  return changed;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoRoot = process.argv.includes('--repo') ? process.argv[process.argv.indexOf('--repo') + 1] : process.cwd();
  const write = process.argv.includes('--write');
  const changed = generateBeginnerComboRoster(repoRoot, { write });
  console.log(`${write ? 'Updated' : 'Would update'} ${changed.length} playable character manifests`);
}

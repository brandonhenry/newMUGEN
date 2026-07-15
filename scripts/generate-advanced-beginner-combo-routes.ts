import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  BeginnerComboGesture,
  BeginnerComboGraph,
  BeginnerComboMovement,
  BeginnerComboRoute,
  BeginnerComboRouteStep,
  CharacterDefinition,
  MoveInput
} from '../src/types';
import {
  generateComboTrials,
  resolveMoveRoutes,
  type GeneratedComboRoute,
  type ResolvedMoveRoute
} from '../src/lib/comboRoutes';
import { contextualHitAdvantage } from '../src/lib/comboFrameMath';
// The foundational generator remains plain ESM so it can also be run without
// the app toolchain. This script is executed through vite-node.
// @ts-expect-error executable JavaScript generator has no declaration file
import { generateBeginnerComboRoutes as generateFoundationalRoutes } from './generate-beginner-combo-routes.mjs';

const KI_MAX = 100;
const BEGINNER_DAMAGE_SCALE = 0.6;
const allGestures: BeginnerComboGesture[] = [
  'light', 'medium', 'heavy', 'special',
  'forward+light', 'forward+medium', 'forward+heavy', 'forward+special',
  'down+light', 'down+medium', 'down+heavy', 'down+special',
  'down-forward+light', 'down-forward+medium', 'down-forward+heavy', 'down-forward+special',
  'special+light', 'special+medium', 'special+heavy',
  'forward+special+light', 'forward+special+medium', 'forward+special+heavy',
  'down+special+light', 'down+special+medium', 'down+special+heavy',
  'down-forward+special+light', 'down-forward+special+medium', 'down-forward+special+heavy'
];

type WorkingRoute = BeginnerComboRoute & { lockedGestures?: Set<number> };
type TrieNode = {
  id: string;
  depth: number;
  routeIds: Set<string>;
  children: Map<string, TrieNode>;
  proposals: Map<string, BeginnerComboGesture[]>;
  locked: Set<string>;
  lockedProposals: Map<string, Set<BeginnerComboGesture>>;
  edges: Map<BeginnerComboGesture, TrieNode>;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function routeIdentity(step: BeginnerComboRouteStep) {
  return `${step.kiCommand ?? step.command ?? step.input}:${step.kiAnimationKey ?? step.animationKey}`;
}

function moveDirection(command?: string) {
  if (!command) return '';
  if (/^(d\/f|cd|dp)\+/.test(command)) return 'down-forward';
  if (/^(d|FC)\+/.test(command)) return 'down';
  if (/^(f|f,f|WR|iWR)\+/.test(command)) return 'forward';
  return '';
}

function faceClass(input: MoveInput) {
  return input === 'jab' ? 'light' : input === 'heavy' ? 'medium' : input === 'kick' ? 'heavy' : 'special';
}

function preferredGesture(step: BeginnerComboRouteStep): BeginnerComboGesture {
  const command = step.kiCommand ?? step.command;
  const direction = moveDirection(command);
  const buttons = command ? [...command.matchAll(/[1-4]/g)].map((match) => match[0]) : [];
  const hasSpecialChord = buttons.includes('4') && buttons.some((button) => button !== '4') && step.input !== 'special';
  const attack = hasSpecialChord ? `special+${faceClass(step.input)}` : faceClass(step.input);
  return `${direction ? `${direction}+` : ''}${attack}` as BeginnerComboGesture;
}

function movementForCommand(command?: string): BeginnerComboMovement | undefined {
  if (!command) return undefined;
  if (/^(u|U|u\/f|U\/F|u\/b|U\/B)\+/.test(command)) return 'jump';
  if (/^(f,f|WR|iWR)\+/.test(command)) return 'dashForward';
  if (/^b,b\+/.test(command)) return 'dashBack';
  if (/^(FC)\+/.test(command)) return 'crouch';
  if (/^(WS)\+/.test(command)) return 'neutral';
  if (/^(SS|SSL)\+/.test(command)) return 'sidestepUp';
  if (/^SSR\+/.test(command)) return 'sidestepDown';
  return undefined;
}

function expectedResult(move: ResolvedMoveRoute['move'], index: number) {
  if (move.knockdown) return 'knockdown' as const;
  if ((move.launchHeight ?? 0) > 0) return 'launch' as const;
  if (move.tornado || index > 0) return 'juggle' as const;
  return 'hit' as const;
}

function routeWindow(previous: ResolvedMoveRoute | undefined, current: ResolvedMoveRoute) {
  if (!previous) return { before: 16, after: 20 };
  const context = (previous.move.launchHeight ?? 0) > 0 || previous.move.tornado ? 'juggle' : 'combo';
  const advantage = Math.max(5, contextualHitAdvantage(previous.move, { context }));
  const slack = advantage + 16 - Math.max(1, current.move.startupFrames);
  return { before: clamp(slack, 3, 16), after: clamp(slack + 4, 6, 24) };
}

function nonKiFallback(routes: ResolvedMoveRoute[], source: ResolvedMoveRoute) {
  return routes
    .filter((route) => !route.requiresKi && route.move.damage > 0 && route.input === source.input)
    .sort((a, b) =>
      Math.abs(a.move.startupFrames - source.move.startupFrames) - Math.abs(b.move.startupFrames - source.move.startupFrames) ||
      Number(Boolean(b.move.knockdown)) - Number(Boolean(a.move.knockdown)) ||
      a.routeKey.localeCompare(b.routeKey)
    )[0] ?? routes.find((route) => !route.requiresKi && route.move.damage > 0);
}

function resolvedStep(
  allMoves: ResolvedMoveRoute[],
  source: ResolvedMoveRoute,
  previous: ResolvedMoveRoute | undefined,
  index: number
): BeginnerComboRouteStep | null {
  const resourceMove = source.requiresKi;
  const fallback = resourceMove ? nonKiFallback(allMoves, source) : source;
  if (!fallback) return null;
  const window = routeWindow(previous, fallback);
  const movementBefore = movementForCommand(fallback.command);
  const kiMovementBefore = resourceMove ? movementForCommand(source.command) : undefined;
  return {
    routeKey: fallback.routeKey,
    gesture: preferredGesture({
      input: source.input,
      animationKey: source.animationKey,
      label: source.label,
      windowBefore: window.before,
      windowAfter: window.after,
      ...(source.command ? { command: source.command } : {})
    }),
    input: fallback.input,
    ...(fallback.command ? { command: fallback.command } : {}),
    animationKey: fallback.animationKey,
    label: source.label,
    windowBefore: window.before,
    windowAfter: window.after,
    ...(movementBefore ? {
      movementBefore,
      movementMinFrames: movementBefore === 'neutral' ? 3 : 1,
      movementMaxFrames: movementBefore === 'neutral' ? 12 : 24
    } : {}),
    expect: expectedResult(source.move, index),
    ...(resourceMove ? {
      kiCommand: source.command,
      kiAnimationKey: source.animationKey,
      kiCost: clamp(Math.round(source.move.kiCost ?? 35), 1, KI_MAX),
      ...(kiMovementBefore ? {
        kiMovementBefore,
        kiMovementMinFrames: kiMovementBefore === 'neutral' ? 3 : 1,
        kiMovementMaxFrames: kiMovementBefore === 'neutral' ? 12 : 24
      } : {})
    } : {})
  };
}

function advancedRoute(
  character: CharacterDefinition,
  generated: GeneratedComboRoute,
  index: number,
  allMoves: ResolvedMoveRoute[],
  knockdown: ResolvedMoveRoute
): WorkingRoute | null {
  const byKey = new Map(allMoves.map((move) => [move.routeKey, move]));
  const sequence = generated.steps.map((step) => byKey.get(step.routeKey)).filter((move): move is ResolvedMoveRoute => Boolean(move));
  if (sequence.length !== generated.steps.length) return null;
  while (sequence.length < 3) sequence.push(knockdown);
  const bounded = sequence.slice(0, 30);
  const steps: BeginnerComboRouteStep[] = [];
  let totalKi = 0;
  for (let stepIndex = 0; stepIndex < bounded.length; stepIndex += 1) {
    const step = resolvedStep(allMoves, bounded[stepIndex], bounded[stepIndex - 1], stepIndex);
    if (!step) return null;
    totalKi += step.kiCost ?? 0;
    if (totalKi > KI_MAX) return null;
    steps.push(step);
  }
  const requiresKi = totalKi > 0;
  const cap = character.stats.health * (requiresKi ? 0.45 : 0.35);
  const damageScale = generated.estimatedDamage * BEGINNER_DAMAGE_SCALE > cap
    ? clamp(cap / Math.max(1, generated.estimatedDamage), 0.1, BEGINNER_DAMAGE_SCALE)
    : BEGINNER_DAMAGE_SCALE;
  return {
    id: `${character.id}:beginner:advanced:${generated.category}:${String(index + 1).padStart(3, '0')}`,
    title: generated.title,
    family: 'advanced',
    category: generated.category,
    tier: generated.tier,
    estimatedHits: steps.length,
    estimatedDamage: Math.round(generated.estimatedDamage * damageScale),
    damageScale,
    requiresKi,
    gestures: steps.map((step) => step.gesture),
    steps
  };
}

function chainRoutes(character: CharacterDefinition, foundational: WorkingRoute[]) {
  const core = new Map(['light', 'medium', 'heavy'].map((name) => [name, foundational.find((route) => route.id.endsWith(`${name}-core`))!]));
  const result: WorkingRoute[] = [];
  const make = (classes: Array<'light' | 'medium' | 'heavy'>, id: string, title: string) => {
    const steps = classes.flatMap((attackClass, classIndex) => {
      const route = core.get(attackClass);
      if (!route) return [];
      return (classIndex === classes.length - 1 ? route.steps : route.steps.slice(0, 7)).map((step) => ({ ...step }));
    });
    const gestures = classes.flatMap((attackClass, classIndex) => Array(classIndex === classes.length - 1 ? 8 : 7).fill(attackClass)) as BeginnerComboGesture[];
    steps.forEach((step, index) => { step.gesture = gestures[index]; });
    const requiresKi = steps.some((step) => step.kiCommand || step.poweredKiFallback);
    const route: WorkingRoute = {
      id: `${character.id}:beginner:${id}`,
      title,
      family: 'mixed',
      category: 'advanced',
      tier: steps.length >= 21 ? 'marathon' : 'long',
      estimatedHits: steps.length,
      estimatedDamage: Math.round(character.stats.health * (requiresKi ? 0.45 : 0.35)),
      damageScale: Math.min(...classes.map((attackClass) => core.get(attackClass)?.damageScale ?? BEGINNER_DAMAGE_SCALE)),
      requiresKi,
      gestures,
      steps,
      lockedGestures: new Set(gestures.map((_, index) => index))
    };
    result.push(route);
  };
  make(['light', 'medium'], 'light-medium-long-chain', 'Light Into Medium Long Chain');
  make(['light', 'heavy'], 'light-heavy-long-chain', 'Light Into Heavy Long Chain');
  make(['medium', 'light'], 'medium-light-long-chain', 'Medium Into Light Long Chain');
  make(['medium', 'heavy'], 'medium-heavy-long-chain', 'Medium Into Heavy Long Chain');
  make(['heavy', 'light'], 'heavy-light-long-chain', 'Heavy Into Light Long Chain');
  make(['heavy', 'medium'], 'heavy-medium-long-chain', 'Heavy Into Medium Long Chain');
  make(['light', 'medium', 'heavy'], 'light-medium-heavy-marathon', 'Light Medium Heavy Marathon');
  return result;
}

function directionalCoverageRoutes(character: CharacterDefinition, foundational: WorkingRoute[]) {
  const light = foundational.find((route) => route.id.endsWith('light-core'))!;
  const medium = foundational.find((route) => route.id.endsWith('medium-core'))!;
  const heavy = foundational.find((route) => route.id.endsWith('heavy-core'))!;
  const definitions: Array<{ id: string; title: string; gesture: BeginnerComboGesture; sources: WorkingRoute[] }> = [
    { id: 'forward-light-route', title: 'Forward Light Route', gesture: 'forward+light', sources: [light, medium, light] },
    { id: 'down-medium-route', title: 'Down Medium Route', gesture: 'down+medium', sources: [medium, heavy, light] },
    { id: 'down-forward-heavy-route', title: 'Down-Forward Heavy Route', gesture: 'down-forward+heavy', sources: [heavy, light, light] }
  ];
  const routes: WorkingRoute[] = definitions.map(({ id, title, gesture, sources }) => {
    const steps = [
      { ...sources[0].steps[0] },
      { ...sources[1].steps[1] },
      { ...light.steps[light.steps.length - 1] }
    ];
    const gestures = [gesture, preferredGesture(steps[1]), preferredGesture(steps[2])];
    steps.forEach((step, index) => { step.gesture = gestures[index]; });
    return {
      id: `${character.id}:beginner:${id}`,
      title,
      family: 'mixed',
      category: 'advanced',
      tier: 'short',
      estimatedHits: 3,
      estimatedDamage: Math.round(character.stats.health * 0.28),
      damageScale: BEGINNER_DAMAGE_SCALE,
      requiresKi: false,
      gestures,
      steps,
      lockedGestures: new Set([0])
    };
  });
  const chordDirections: Array<[string, BeginnerComboGesture]> = [
    ['special-light-route', 'forward+special+light'],
    ['special-medium-route', 'down+special+medium'],
    ['special-heavy-route', 'down-forward+special+heavy']
  ];
  chordDirections.forEach(([sourceId, gesture]) => {
    const source = foundational.find((route) => route.id.endsWith(sourceId));
    if (!source) return;
    const steps = source.steps.map((step) => ({ ...step }));
    const gestures = [...source.gestures];
    gestures[0] = gesture;
    steps[0].gesture = gesture;
    routes.push({
      ...source,
      id: `${character.id}:beginner:directional-${sourceId}`,
      title: `Directional ${source.title}`,
      gestures,
      steps,
      lockedGestures: new Set([0])
    });
  });
  return routes;
}

function gestureGraph(routes: WorkingRoute[]): BeginnerComboGraph {
  let nodeCounter = 0;
  const makeNode = (depth: number): TrieNode => ({
    id: `n${nodeCounter++}`,
    depth,
    routeIds: new Set(),
    children: new Map(),
    proposals: new Map(),
    locked: new Set(),
    lockedProposals: new Map(),
    edges: new Map()
  });
  const root = makeNode(0);
  const paths = new Map<string, TrieNode[]>();
  for (const route of routes) {
    let node = root;
    node.routeIds.add(route.id);
    const path = [root];
    route.steps.forEach((step, index) => {
      const identity = routeIdentity(step);
      let child = node.children.get(identity);
      if (!child) {
        child = makeNode(index + 1);
        node.children.set(identity, child);
      }
      child.routeIds.add(route.id);
      const proposals = node.proposals.get(identity) ?? [];
      const proposed = route.gestures[index] ?? preferredGesture(step);
      if (route.lockedGestures?.has(index)) {
        proposals.unshift(proposed);
        node.locked.add(identity);
        const locked = node.lockedProposals.get(identity) ?? new Set<BeginnerComboGesture>();
        locked.add(proposed);
        node.lockedProposals.set(identity, locked);
      } else proposals.push(proposed);
      node.proposals.set(identity, proposals);
      node = child;
      path.push(node);
    });
    paths.set(route.id, path);
  }

  const visit = (node: TrieNode) => {
    const used = new Set<BeginnerComboGesture>();
    for (const [identity, child] of [...node.children].sort(([a], [b]) =>
      Number(node.locked.has(b)) - Number(node.locked.has(a)) || a.localeCompare(b)
    )) {
      const proposals = node.proposals.get(identity) ?? [];
      const lockedAliases = [...(node.lockedProposals.get(identity) ?? [])].filter((candidate) => !used.has(candidate));
      lockedAliases.forEach((gesture) => {
        used.add(gesture);
        node.edges.set(gesture, child);
      });
      const gesture = lockedAliases[0] ?? [...proposals, preferredGesture(routes.find((route) => child.routeIds.has(route.id))!.steps[node.depth]), ...allGestures]
        .find((candidate) => !used.has(candidate));
      if (!gesture) throw new Error(`Beginner graph node ${node.id} has more than ${allGestures.length} distinct moves`);
      if (!node.edges.has(gesture)) {
        used.add(gesture);
        node.edges.set(gesture, child);
      }
      visit(child);
    }
  };
  visit(root);

  for (const route of routes) {
    const path = paths.get(route.id)!;
    route.gestures = route.steps.map((step, index) => {
      const parent = path[index];
      const child = path[index + 1];
      const locked = route.lockedGestures?.has(index) ? route.gestures[index] : undefined;
      if (locked && parent.edges.get(locked) === child) return locked;
      return [...parent.edges].find(([, target]) => target === child)![0];
    });
    route.steps.forEach((step, index) => { step.gesture = route.gestures[index]; });
    delete route.lockedGestures;
  }

  const nodes: BeginnerComboGraph['nodes'] = {};
  const serialize = (node: TrieNode) => {
    if (nodes[node.id]) return;
    nodes[node.id] = {
      depth: node.depth,
      routeId: [...node.routeIds].sort()[0],
      edges: Object.fromEntries([...node.edges].map(([gesture, child]) => [gesture, child.id]))
    };
    node.children.forEach(serialize);
  };
  serialize(root);
  return { version: 2, rootId: root.id, nodes };
}

function compactRouteSteps(character: CharacterDefinition, routes: WorkingRoute[]) {
  const catalog: Record<string, BeginnerComboRouteStep> = {};
  const keysByPayload = new Map<string, string>();
  for (const route of routes) {
    route.stepKeys = route.steps.map((step) => {
      const payload = JSON.stringify(step);
      const existing = keysByPayload.get(payload);
      if (existing) return existing;
      const key = `s${String(keysByPayload.size).padStart(4, '0')}`;
      keysByPayload.set(payload, key);
      catalog[key] = step;
      return key;
    });
    delete (route as Partial<BeginnerComboRoute>).steps;
  }
  character.beginnerComboMoves = catalog;
}

function foldStarterOverflow(routes: WorkingRoute[]) {
  const starterLimit = allGestures.length - 13;
  const starters = new Map<string, BeginnerComboRouteStep>();
  for (const route of routes) {
    const step = route.steps[0];
    if (step) starters.set(routeIdentity(step), step);
  }
  if (starters.size <= starterLimit) return;
  const keep = [...starters.entries()].slice(0, starterLimit);
  const keptIds = new Set(keep.map(([identity]) => identity));
  const keptSteps = keep.map(([, step]) => step);
  for (const route of routes) {
    const starter = route.steps[0];
    if (!starter || keptIds.has(routeIdentity(starter))) continue;
    const sameResourcePolicy = (step: BeginnerComboRouteStep) => Boolean(step.kiCost) === Boolean(starter.kiCost) && (step.kiCost ?? 0) <= (starter.kiCost ?? 0);
    const replacement = keptSteps.find((step) => sameResourcePolicy(step) && step.input === starter.input && step.movementBefore === starter.movementBefore)
      ?? keptSteps.find((step) => sameResourcePolicy(step) && step.input === starter.input)
      ?? keptSteps.find(sameResourcePolicy)
      ?? keptSteps.find((step) => !step.kiCost)
      ?? keptSteps[0];
    route.steps[0] = {
      ...replacement,
      gesture: starter.gesture,
      label: `${starter.label} Route Starter`
    };
  }
}

export function generateAdvancedBeginnerComboRoutes(character: CharacterDefinition): CharacterDefinition {
  const next = generateFoundationalRoutes(character) as CharacterDefinition;
  const foundational = (next.beginnerComboRoutes ?? []) as WorkingRoute[];
  foundational.forEach((route) => {
    route.category ??= route.family === 'core' ? 'basic' : 'advanced';
    route.lockedGestures = route.family === 'core'
      ? new Set(route.gestures.map((_, index) => index))
      : new Set(route.gestures.map((gesture, index) => gesture.startsWith('special+') && index === 0 ? index : -1).filter((index) => index >= 0));
  });
  const moves = resolveMoveRoutes(next);
  const knockdown = moves
    .filter((move) => !move.requiresKi && move.move.knockdown)
    .sort((a, b) => a.move.startupFrames - b.move.startupFrames)[0] ?? moves.find((move) => !move.requiresKi)!;
  if (!knockdown) return next;
  const advanced = generateComboTrials(next)
    .map((route, index) => advancedRoute(next, route, index, moves, knockdown))
    .filter((route): route is WorkingRoute => Boolean(route));
  const routes = [...foundational, ...directionalCoverageRoutes(next, foundational), ...chainRoutes(next, foundational), ...advanced];
  foldStarterOverflow(routes);
  next.beginnerComboRoutes = routes;
  next.beginnerComboGraph = gestureGraph(routes);
  compactRouteSteps(next, routes);
  return next;
}

export function generateAdvancedBeginnerComboRoster(repoRoot: string, { write = false } = {}) {
  const charactersDir = join(repoRoot, 'public', 'characters');
  const changed: string[] = [];
  for (const id of readdirSync(charactersDir).sort()) {
    const manifestPath = join(charactersDir, id, 'character.json');
    if (!existsSync(manifestPath)) continue;
    const text = readFileSync(manifestPath, 'utf8');
    const character = JSON.parse(text) as CharacterDefinition;
    if (character.unplayable) continue;
    const next = generateAdvancedBeginnerComboRoutes(character);
    const nextText = `${JSON.stringify(next, null, 2)}\n`;
    if (nextText === text) continue;
    changed.push(manifestPath);
    if (write) writeFileSync(manifestPath, nextText);
  }
  return changed;
}

if (process.argv.includes('--write') || process.argv.includes('--repo')) {
  const repoRoot = process.argv.includes('--repo') ? process.argv[process.argv.indexOf('--repo') + 1] : process.cwd();
  const write = process.argv.includes('--write');
  const changed = generateAdvancedBeginnerComboRoster(repoRoot, { write });
  console.log(`${write ? 'Updated' : 'Would update'} ${changed.length} playable character manifests`);
}

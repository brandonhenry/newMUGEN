import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { GameScene } from '/src/components/GameScene.tsx';
import { stages } from '/src/data/stages.ts';
import { createMatch, stepMatch } from '/src/engine/fightEngine.ts';
import { normalizeCharacter } from '/src/lib/characterLoader.ts';
import { emptyInputFrame, type CharacterDefinition, type MatchSnapshot } from '/src/types.ts';
import '/src/styles.css';

type SmokeInput = 'jab' | 'kick' | 'special' | 'heavy' | 'charge';

type SmokeScenario = {
  id: string;
  label: string;
  p1Path: string;
  p2Path: string;
  fireInputs: SmokeInput[];
  holdInputs?: SmokeInput[];
  p1X: number;
  p2X: number;
  p1Z?: number;
  p2Z?: number;
  p1Ki?: number;
  fireFrame: number;
  holdEndFrame?: number;
  resetFrame: number;
};

const scenarios: SmokeScenario[] = [
  {
    id: 'franky-blaster-flight',
    label: 'Franky mechanical blaster flight',
    p1Path: '/characters/franky/character.json',
    p2Path: '/characters/don-patch-poppa-rocks/character.json',
    fireInputs: ['kick'],
    p1X: -4.2,
    p2X: 4.2,
    fireFrame: 24,
    resetFrame: 168
  },
  {
    id: 'yugi-target-location',
    label: 'Yugi target-location spell',
    p1Path: '/characters/yugi-mutou/character.json',
    p2Path: '/characters/don-patch-poppa-rocks/character.json',
    fireInputs: ['charge', 'heavy'],
    p1X: -2.4,
    p2X: 2.4,
    p1Ki: 100,
    fireFrame: 180,
    resetFrame: 360
  },
  {
    id: 'dr-mashirito-thrown-bolt',
    label: 'Dr. Mashirito thrown bolt arc',
    p1Path: '/characters/dr-mashirito/character.json',
    p2Path: '/characters/don-patch-poppa-rocks/character.json',
    fireInputs: ['kick', 'heavy'],
    p1X: -4.2,
    p2X: 4.2,
    fireFrame: 24,
    resetFrame: 180
  },
  {
    id: 'dr-mashirito-bolt-scatter-hold',
    label: 'Dr. Mashirito holdable bolt scatter',
    p1Path: '/characters/dr-mashirito/character.json',
    p2Path: '/characters/don-patch-poppa-rocks/character.json',
    fireInputs: ['kick', 'special'],
    holdInputs: ['kick', 'special'],
    p1X: -4.2,
    p2X: 4.2,
    p2Z: 0.8,
    fireFrame: 24,
    holdEndFrame: 112,
    resetFrame: 220
  },
  {
    id: 'kurama-finger-gun-bullet',
    label: 'Kurama finger-gun bullet',
    p1Path: '/characters/kurama/character.json',
    p2Path: '/characters/don-patch-poppa-rocks/character.json',
    fireInputs: ['jab'],
    p1X: -4.2,
    p2X: 4.2,
    fireFrame: 24,
    resetFrame: 168
  }
];

function getInitialScenarioIndex() {
  const requested = new URLSearchParams(window.location.search).get('scenario');
  const index = scenarios.findIndex((scenario) => scenario.id === requested);
  return index >= 0 ? index : 0;
}

function shouldFreezeOnProjectile() {
  return new URLSearchParams(window.location.search).get('freeze') === 'projectile';
}

function cloneForSmoke(match: MatchSnapshot, scenario: SmokeScenario): MatchSnapshot {
  return {
    ...match,
    timer: 65,
    fighters: [
      {
        ...match.fighters[0],
        position: { ...match.fighters[0].position, x: scenario.p1X, z: scenario.p1Z ?? 0 },
        facing: 1,
        facingYaw: Math.PI / 2,
        ki: scenario.p1Ki ?? match.fighters[0].ki
      },
      {
        ...match.fighters[1],
        position: { ...match.fighters[1].position, x: scenario.p2X, z: scenario.p2Z ?? 0 },
        facing: -1,
        facingYaw: -Math.PI / 2
      }
    ],
    phase: 'fighting',
    message: '',
    projectiles: []
  };
}

async function loadCharacter(path: string) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to load ${path}`);
  return normalizeCharacter(await response.json() as CharacterDefinition);
}

function makeScenarioMatch(p1: CharacterDefinition, p2: CharacterDefinition, scenario: SmokeScenario) {
  const match = createMatch(p1, p2, stages[0], 'local2p', 3, {
    playIntro: false,
    roundTime: 65,
    roster: [p1, p2]
  });
  return cloneForSmoke(match, scenario);
}

function ProjectileSmokeApp() {
  const [scenarioIndex, setScenarioIndex] = useState(getInitialScenarioIndex);
  const scenario = scenarios[scenarioIndex];
  const [characters, setCharacters] = useState<{ p1: CharacterDefinition; p2: CharacterDefinition } | null>(null);
  const [match, setMatch] = useState<MatchSnapshot | null>(null);
  const frameRef = useRef(0);
  const matchRef = useRef<MatchSnapshot | null>(null);
  const frozenRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadCharacter(scenario.p1Path), loadCharacter(scenario.p2Path)]).then(([p1, p2]) => {
      if (cancelled) return;
      setCharacters({ p1, p2 });
      const next = makeScenarioMatch(p1, p2, scenario);
      frameRef.current = 0;
      matchRef.current = next;
      frozenRef.current = false;
      setMatch(next);
    });
    return () => {
      cancelled = true;
    };
  }, [scenario]);

  useEffect(() => {
    if (!characters) return undefined;
    let raf = 0;
    let last = performance.now();
    if (!matchRef.current) {
      const next = makeScenarioMatch(characters.p1, characters.p2, scenario);
      frameRef.current = 0;
      matchRef.current = next;
      setMatch(next);
    }
    const tick = (now: number) => {
      const elapsed = now - last;
      if (elapsed >= 1000 / 60) {
        if (frozenRef.current) return;
        last = now;
        let current = matchRef.current ?? makeScenarioMatch(characters.p1, characters.p2, scenario);
        if (frameRef.current >= scenario.resetFrame || current.phase !== 'fighting') {
          current = makeScenarioMatch(characters.p1, characters.p2, scenario);
          frameRef.current = 0;
        }
        const p1 = emptyInputFrame();
        const p2 = emptyInputFrame();
        if (scenario.holdInputs && frameRef.current >= scenario.fireFrame - 10 && frameRef.current < (scenario.holdEndFrame ?? scenario.fireFrame + 8)) {
          for (const input of scenario.holdInputs) p1[input] = true;
        }
        if (frameRef.current >= scenario.fireFrame && frameRef.current < scenario.fireFrame + 2) {
          for (const input of scenario.fireInputs) p1[input] = true;
        }
        const next = stepMatch(current, p1, p2, 1 / 60);
        frameRef.current += 1;
        matchRef.current = next;
        setMatch(next);
        if (shouldFreezeOnProjectile() && next.projectiles.length > 0) {
          frozenRef.current = true;
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [characters, scenario]);

  const projectileSummary = useMemo(() => {
    const projectiles = match?.projectiles ?? [];
    return projectiles.map((projectile) => (
      `${projectile.projectileId}:${projectile.phase}@${projectile.position.x.toFixed(2)},${projectile.position.y.toFixed(2)},${projectile.position.z.toFixed(2)}`
    )).join(' | ') || 'none';
  }, [match]);

  if (!match) {
    return <div className="projectile-smoke-shell">Loading projectile smoke...</div>;
  }

  return (
    <div className="projectile-smoke-shell">
      <GameScene match={match} reducedMotion />
      <div className="projectile-smoke-hud">
        <strong>{scenario.label}</strong>
        <span data-testid="smoke-projectiles">{projectileSummary}</span>
        <span data-testid="smoke-phase">{match.phase} frame {frameRef.current}</span>
        <span data-testid="smoke-p1-move">{match.fighters[0].currentMove?.label ?? 'none'}</span>
        <span data-testid="smoke-p2-hp">P2 HP {match.fighters[1].hp}</span>
        <button type="button" onClick={() => setScenarioIndex((index) => (index + 1) % scenarios.length)}>
          Next Scenario
        </button>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<ProjectileSmokeApp />);

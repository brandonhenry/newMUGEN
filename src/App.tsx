import anime from 'animejs';
import {
  Eye,
  Gamepad2,
  Home,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Swords,
  Users
} from 'lucide-react';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { GameScene } from './components/GameScene';
import { TouchControls } from './components/TouchControls';
import { stages } from './data/stages';
import { createMatch, stepMatch } from './engine/fightEngine';
import { useControls } from './hooks/useControls';
import { type CharacterLoadResult, loadCharacterRoster } from './lib/characterLoader';
import type { ActionName, CharacterDefinition, InputFrame, MatchMode, MatchSnapshot, StageDefinition } from './types';

type Screen = 'boot' | 'title' | 'menu' | 'select' | 'stage' | 'fight' | 'settings' | 'viewer';

export default function App() {
  const [screen, setScreen] = useState<Screen>('boot');
  const [rosterResult, setRosterResult] = useState<CharacterLoadResult | null>(null);
  const roster = rosterResult?.characters ?? [];
  const [p1Id, setP1Id] = useState('astra');
  const [p2Id, setP2Id] = useState('dax');
  const [stageId, setStageId] = useState(stages[0].id);
  const [mode, setMode] = useState<MatchMode>('ai');
  const { readInputs, setVirtualAction, clearMenuInputs } = useControls(mode);

  useEffect(() => {
    let mounted = true;
    loadCharacterRoster().then((result) => {
      if (!mounted) return;
      setRosterResult(result);
      setP1Id(result.characters[0]?.id ?? 'astra');
      setP2Id(result.characters[1]?.id ?? result.characters[0]?.id ?? 'dax');
      window.setTimeout(() => setScreen('title'), 650);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    anime.remove('.screen-panel > *');
    anime({
      targets: '.screen-panel > *',
      translateY: [12, 0],
      opacity: [0, 1],
      delay: anime.stagger(70),
      duration: 460,
      easing: 'easeOutCubic'
    });
  }, [screen]);

  const p1 = roster.find((character) => character.id === p1Id) ?? roster[0];
  const p2 = roster.find((character) => character.id === p2Id) ?? roster[1] ?? roster[0];
  const selectedStage = stages.find((stage) => stage.id === stageId) ?? stages[0];

  if (screen === 'boot' || !p1 || !p2) {
    return (
      <main className="app-shell boot-shell">
        <section className="boot-mark" aria-label="Loading newMUGEN">
          <Swords size={34} />
          <h1>newMUGEN</h1>
          <p>Loading fighters</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="ambient-grid" />
      <section className="screen-panel">
        {screen === 'title' && <TitleScreen onStart={() => setScreen('menu')} />}
        {screen === 'menu' && (
          <MenuScreen
            onPlay={() => setScreen('select')}
            onSettings={() => setScreen('settings')}
            onViewer={() => setScreen('viewer')}
          />
        )}
        {screen === 'select' && (
          <CharacterSelect
            roster={roster}
            p1Id={p1Id}
            p2Id={p2Id}
            mode={mode}
            setP1Id={setP1Id}
            setP2Id={setP2Id}
            setMode={setMode}
            onBack={() => setScreen('menu')}
            onNext={() => setScreen('stage')}
          />
        )}
        {screen === 'stage' && (
          <StageSelect
            selected={stageId}
            setSelected={setStageId}
            onBack={() => setScreen('select')}
            onFight={() => setScreen('fight')}
          />
        )}
        {screen === 'settings' && <SettingsScreen mode={mode} setMode={setMode} onBack={() => setScreen('menu')} />}
        {screen === 'viewer' && (
          <CharacterViewer roster={roster} warnings={rosterResult?.warnings ?? {}} onBack={() => setScreen('menu')} />
        )}
        {screen === 'fight' && (
          <FightScreen
            key={`${p1.id}-${p2.id}-${selectedStage.id}-${mode}`}
            p1={p1}
            p2={p2}
            stage={selectedStage}
            mode={mode}
            readInputs={readInputs}
            setVirtualAction={setVirtualAction}
            clearMenuInputs={clearMenuInputs}
            onMenu={() => setScreen('menu')}
            onCharacterSelect={() => setScreen('select')}
          />
        )}
      </section>
    </main>
  );
}

function TitleScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="title-screen">
      <div className="brand-kicker">Browser 3D roster fighter</div>
      <h1>newMUGEN</h1>
      <p>Side-step, block, punish, and build the roster one manifest at a time.</p>
      <button className="primary-button" onClick={onStart} autoFocus>
        <Play size={18} />
        Start
      </button>
    </div>
  );
}

function MenuScreen({
  onPlay,
  onSettings,
  onViewer
}: {
  onPlay: () => void;
  onSettings: () => void;
  onViewer: () => void;
}) {
  return (
    <div className="menu-screen">
      <header className="section-header">
        <span>Arcade build</span>
        <h2>Main Menu</h2>
      </header>
      <div className="menu-grid">
        <button className="menu-tile" onClick={onPlay}>
          <Swords />
          <strong>Fight</strong>
          <span>Character select, stage select, then match.</span>
        </button>
        <button className="menu-tile" onClick={onViewer}>
          <Eye />
          <strong>Character Viewer</strong>
          <span>Inspect roster manifests and loader warnings.</span>
        </button>
        <button className="menu-tile" onClick={onSettings}>
          <Settings />
          <strong>Controls</strong>
          <span>Keyboard, gamepad, mobile, and match mode.</span>
        </button>
      </div>
    </div>
  );
}

function CharacterSelect({
  roster,
  p1Id,
  p2Id,
  mode,
  setP1Id,
  setP2Id,
  setMode,
  onBack,
  onNext
}: {
  roster: CharacterDefinition[];
  p1Id: string;
  p2Id: string;
  mode: MatchMode;
  setP1Id: (id: string) => void;
  setP2Id: (id: string) => void;
  setMode: (mode: MatchMode) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="select-screen">
      <header className="section-header with-actions">
        <div>
          <span>Roster</span>
          <h2>Character Select</h2>
        </div>
        <SegmentedControl value={mode} setValue={setMode} />
      </header>
      <div className="fighter-columns">
        <RosterColumn label="Player 1" selected={p1Id} roster={roster} onSelect={setP1Id} />
        <RosterColumn label={mode === 'ai' ? 'CPU' : 'Player 2'} selected={p2Id} roster={roster} onSelect={setP2Id} />
      </div>
      <FooterActions onBack={onBack} onNext={onNext} nextLabel="Stage" />
    </div>
  );
}

function RosterColumn({
  label,
  selected,
  roster,
  onSelect
}: {
  label: string;
  selected: string;
  roster: CharacterDefinition[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="roster-column">
      <h3>{label}</h3>
      <div className="roster-list">
        {roster.map((character) => (
          <button
            key={character.id}
            className={`fighter-card ${selected === character.id ? 'is-selected' : ''}`}
            style={{ '--fighter-color': character.colors.primary } as CSSProperties}
            onClick={() => onSelect(character.id)}
          >
            <span className="portrait">{character.displayName.slice(0, 2).toUpperCase()}</span>
            <span>
              <strong>{character.displayName}</strong>
              <small>{character.moves.map((move) => move.label).slice(0, 2).join(' / ')}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SegmentedControl({ value, setValue }: { value: MatchMode; setValue: (mode: MatchMode) => void }) {
  return (
    <div className="segmented" role="tablist" aria-label="Match mode">
      <button className={value === 'ai' ? 'active' : ''} onClick={() => setValue('ai')}>
        <Gamepad2 size={16} />
        1P vs AI
      </button>
      <button className={value === 'local2p' ? 'active' : ''} onClick={() => setValue('local2p')}>
        <Users size={16} />
        Local 2P
      </button>
    </div>
  );
}

function StageSelect({
  selected,
  setSelected,
  onBack,
  onFight
}: {
  selected: string;
  setSelected: (id: string) => void;
  onBack: () => void;
  onFight: () => void;
}) {
  return (
    <div className="stage-screen">
      <header className="section-header">
        <span>Arena</span>
        <h2>Stage Select</h2>
      </header>
      <div className="stage-grid">
        {stages.map((stage) => (
          <button
            key={stage.id}
            className={`stage-card ${selected === stage.id ? 'is-selected' : ''}`}
            style={{ '--stage-color': stage.rail, '--stage-floor': stage.floor } as CSSProperties}
            onClick={() => setSelected(stage.id)}
          >
            <span className="stage-preview" />
            <strong>{stage.name}</strong>
            <small>{stage.subtitle}</small>
          </button>
        ))}
      </div>
      <FooterActions onBack={onBack} onNext={onFight} nextLabel="Fight" />
    </div>
  );
}

function SettingsScreen({
  mode,
  setMode,
  onBack
}: {
  mode: MatchMode;
  setMode: (mode: MatchMode) => void;
  onBack: () => void;
}) {
  return (
    <div className="settings-screen">
      <header className="section-header with-actions">
        <div>
          <span>Input</span>
          <h2>Controls</h2>
        </div>
        <SegmentedControl value={mode} setValue={setMode} />
      </header>
      <div className="control-grid">
        <ControlPanel title="Player 1" rows={['WASD move / sidestep', 'Arrows also move P1 in 1P vs AI', 'J jab, K kick, L heavy', 'U special, I block, Esc pause']} />
        <ControlPanel title="Player 2" rows={['Arrows move / sidestep in Local 2P', 'Numpad 1 jab, 2 kick, 3 heavy', 'Numpad 4 special, 5 block', 'Space confirm']} />
        <ControlPanel title="Gamepad" rows={['Left stick or d-pad movement', 'Face buttons attack', 'Shoulders block and special', 'Start pauses the match']} />
        <ControlPanel title="Touch" rows={['On-screen movement pad', 'Action buttons appear in fight', 'Works best in landscape', 'Player 1 controls by default']} />
      </div>
      <button className="secondary-button" onClick={onBack}>
        <Home size={18} />
        Back
      </button>
    </div>
  );
}

function ControlPanel({ title, rows }: { title: string; rows: string[] }) {
  return (
    <article className="control-panel">
      <h3>{title}</h3>
      {rows.map((row) => (
        <p key={row}>{row}</p>
      ))}
    </article>
  );
}

function CharacterViewer({
  roster,
  warnings,
  onBack
}: {
  roster: CharacterDefinition[];
  warnings: Record<string, string[]>;
  onBack: () => void;
}) {
  const [activeId, setActiveId] = useState(roster[0]?.id ?? '');
  const active = roster.find((character) => character.id === activeId) ?? roster[0];
  return (
    <div className="viewer-screen">
      <header className="section-header">
        <span>Loader</span>
        <h2>Character Viewer</h2>
      </header>
      <div className="viewer-layout">
        <div className="roster-list compact">
          {roster.map((character) => (
            <button
              key={character.id}
              className={`fighter-card ${active.id === character.id ? 'is-selected' : ''}`}
              style={{ '--fighter-color': character.colors.primary } as CSSProperties}
              onClick={() => setActiveId(character.id)}
            >
              <span className="portrait">{character.displayName.slice(0, 2).toUpperCase()}</span>
              <span>
                <strong>{character.displayName}</strong>
                <small>{character.modelPath}</small>
              </span>
            </button>
          ))}
        </div>
        <article className="manifest-panel">
          <h3>{active.displayName}</h3>
          <p>Health {active.stats.health} · Speed {active.stats.speed} · Model {active.modelPath}</p>
          <div className="move-list">
            {active.moves.map((move) => (
              <span key={move.id}>{move.label}</span>
            ))}
          </div>
          <div className="warning-box">
            <strong>Loader warnings</strong>
            {(warnings[active.id]?.length ?? 0) === 0 ? (
              <p>No manifest warnings.</p>
            ) : (
              warnings[active.id].map((warning) => <p key={warning}>{warning}</p>)
            )}
          </div>
        </article>
      </div>
      <button className="secondary-button" onClick={onBack}>
        <Home size={18} />
        Back
      </button>
    </div>
  );
}

function FightScreen({
  p1,
  p2,
  stage,
  mode,
  readInputs,
  setVirtualAction,
  clearMenuInputs,
  onMenu,
  onCharacterSelect
}: {
  p1: CharacterDefinition;
  p2: CharacterDefinition;
  stage: StageDefinition;
  mode: MatchMode;
  readInputs: () => [InputFrame, InputFrame];
  setVirtualAction: (player: 1 | 2, action: ActionName, pressed: boolean) => void;
  clearMenuInputs: () => void;
  onMenu: () => void;
  onCharacterSelect: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const [match, setMatch] = useState<MatchSnapshot>(() => createMatch(p1, p2, stage, mode));
  const matchRef = useRef(match);
  const pauseLatch = useRef(false);

  useEffect(() => {
    matchRef.current = match;
  }, [match]);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    let accumulator = 0;
    const fixedStep = 1 / 60;

    const tick = (now: number) => {
      const delta = Math.min(0.05, (now - previous) / 1000);
      previous = now;
      const [p1Input, p2Input] = readInputs();
      if (p1Input.pause || p2Input.pause) {
        if (!pauseLatch.current) {
          setPaused((value) => !value);
          pauseLatch.current = true;
          clearMenuInputs();
        }
      } else {
        pauseLatch.current = false;
      }

      if (!paused) {
        accumulator += delta;
        while (accumulator >= fixedStep) {
          matchRef.current = stepMatch(matchRef.current, p1Input, p2Input, fixedStep);
          accumulator -= fixedStep;
        }
        setMatch(matchRef.current);
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clearMenuInputs, paused, readInputs]);

  useEffect(() => {
    if (match.lastHitId > 0) {
      anime({
        targets: '.impact-flash',
        opacity: [0.32, 0],
        duration: 220,
        easing: 'easeOutQuad'
      });
    }
  }, [match.lastHitId]);

  const reset = () => {
    const fresh = createMatch(p1, p2, stage, mode);
    matchRef.current = fresh;
    setMatch(fresh);
    setPaused(false);
  };

  return (
    <div className="fight-screen">
      <GameScene match={match} />
      <div className="impact-flash" />
      <FightHud match={match} />
      <FightDebug match={match} paused={paused} />
      <TouchControls onAction={setVirtualAction} />
      {match.message && <div className="match-message">{match.message}</div>}
      {paused && (
        <div className="pause-overlay">
          <Pause size={32} />
          <h2>Paused</h2>
          <div className="overlay-actions">
            <button className="primary-button" onClick={() => setPaused(false)}>
              <Play size={18} />
              Resume
            </button>
            <button className="secondary-button" onClick={reset}>
              <RotateCcw size={18} />
              Restart
            </button>
            <button className="secondary-button" onClick={onCharacterSelect}>
              <Users size={18} />
              Select
            </button>
            <button className="secondary-button" onClick={onMenu}>
              <Home size={18} />
              Menu
            </button>
          </div>
        </div>
      )}
      {match.phase === 'matchOver' && (
        <div className="pause-overlay results-overlay">
          <Swords size={34} />
          <h2>{match.message}</h2>
          <div className="overlay-actions">
            <button className="primary-button" onClick={reset}>
              <RotateCcw size={18} />
              Rematch
            </button>
            <button className="secondary-button" onClick={onCharacterSelect}>
              <Users size={18} />
              Character Select
            </button>
            <button className="secondary-button" onClick={onMenu}>
              <Home size={18} />
              Menu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FightDebug({ match, paused }: { match: MatchSnapshot; paused: boolean }) {
  const [p1, p2] = match.fighters;
  return (
    <div className="fight-debug" aria-hidden="true">
      <span data-testid="match-phase">{paused ? 'paused' : match.phase}</span>
      <span data-testid="p1-position">{`${p1.position.x.toFixed(3)},${p1.position.z.toFixed(3)}`}</span>
      <span data-testid="p2-position">{`${p2.position.x.toFixed(3)},${p2.position.z.toFixed(3)}`}</span>
      <span data-testid="p1-state">{p1.state}</span>
      <span data-testid="p2-state">{p2.state}</span>
      <span data-testid="p2-hp">{p2.hp.toFixed(0)}</span>
    </div>
  );
}

function FightHud({ match }: { match: MatchSnapshot }) {
  const [p1, p2] = match.fighters;
  return (
    <div className="fight-hud">
      <HealthBar fighter={p1} align="left" />
      <div className="round-box">
        <strong>{Math.ceil(match.timer)}</strong>
        <span>R{match.round}</span>
      </div>
      <HealthBar fighter={p2} align="right" />
    </div>
  );
}

function HealthBar({ fighter, align }: { fighter: MatchSnapshot['fighters'][number]; align: 'left' | 'right' }) {
  const percent = Math.max(0, Math.min(100, (fighter.hp / fighter.character.stats.health) * 100));
  return (
    <div className={`health ${align}`}>
      <div className="health-label">
        <strong>{fighter.character.displayName}</strong>
        <span>{fighter.roundsWon} rounds</span>
      </div>
      <div className="health-track">
        <span style={{ width: `${percent}%`, background: fighter.character.colors.primary }} />
      </div>
    </div>
  );
}

function FooterActions({
  onBack,
  onNext,
  nextLabel
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
}) {
  return (
    <footer className="footer-actions">
      <button className="secondary-button" onClick={onBack}>
        <Home size={18} />
        Back
      </button>
      <button className="primary-button" onClick={onNext}>
        <Play size={18} />
        {nextLabel}
      </button>
    </footer>
  );
}

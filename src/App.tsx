import anime from 'animejs';
import {
  ChevronDown,
  Eye,
  Gamepad2,
  Home,
  Pause,
  Play,
  Rotate3D,
  RotateCcw,
  Save,
  Settings,
  Swords,
  Target,
  Users,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { type CSSProperties, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type SetStateAction, useEffect, useMemo, useRef, useState } from 'react';
import { CharacterPreviewCanvas, GameScene, MenuAttractScene, StagePreviewCanvas, type PreviewPose } from './components/GameScene';
import { TouchControls } from './components/TouchControls';
import { stages } from './data/stages';
import { createMatch, stepMatch } from './engine/fightEngine';
import { getKeyboardBindingsForEvent, useControls } from './hooks/useControls';
import { type CharacterLoadResult, loadCharacterRoster } from './lib/characterLoader';
import { debugHypotheses, debugLog } from './lib/debugLogger';
import { cloneSettings, defaultGameSettings, readGameSettings, sanitizeGameSettings, writeGameSettings } from './lib/gameSettings';
import {
  emptyInputFrame,
  type ActionName,
  type CharacterDefinition,
  type CpuDifficulty,
  type GameSettings,
  type HitLevel,
  type InputFrame,
  type MatchMode,
  type MatchSnapshot,
  type MoveDefinition,
  type MoveOverride,
  type MoveTracking,
  type StageDefinition
} from './types';

type Screen = 'boot' | 'title' | 'menu' | 'select' | 'stage' | 'fight' | 'settings' | 'viewer';
type CharacterAnimationOverride = {
  frames?: Record<string, string[]>;
  speeds?: Record<string, number>;
  moves?: Record<string, MoveOverride>;
};
type AnimationOverrideMap = Record<string, CharacterAnimationOverride>;
type StoredAnimationOverrides = {
  revision: string;
  overrides: AnimationOverrideMap;
};
type NotationToken = string;
type AnimationSlot = {
  key: string;
  label: string;
  pose: PreviewPose;
  notation: NotationToken[];
  category: 'stance' | 'raw' | 'direction' | 'motion' | 'state' | 'special';
  command?: string;
};

const ANIMATION_STORAGE_KEY = 'kore.animationOverrides';
const ANIMATION_DEFAULTS_REVISION = 'sprite-inferred-2026-06-24-b';
const menuAttractStage: StageDefinition = {
  id: 'kore-menu-moon',
  name: 'KORE Moon Stage',
  subtitle: 'Menu attract arena',
  floor: '#07182c',
  rail: '#2ee6ff',
  light: '#dbe8ff'
};

const baseAnimationSlots: AnimationSlot[] = [
  { key: 'idle', label: 'Neutral', pose: 'idle', notation: ['N'], category: 'stance' },
  { key: 'walkForward', label: 'Forward', pose: 'walk', notation: ['f'], category: 'stance' },
  { key: 'walkBack', label: 'Back', pose: 'walk', notation: ['b'], category: 'stance' },
  { key: 'sidestepLeft', label: 'Side Up', pose: 'sidestep', notation: ['↑↑'], category: 'stance' },
  { key: 'sidestepRight', label: 'Side Down', pose: 'sidestep', notation: ['↓↓'], category: 'stance' },
  { key: 'jump', label: 'Jump', pose: 'jump', notation: ['u'], category: 'stance' },
  { key: 'crouch', label: 'Crouch', pose: 'crouch', notation: ['d'], category: 'stance' },
  { key: 'block', label: 'Block', pose: 'block', notation: ['b'], category: 'stance' },
  { key: 'jab', label: 'Left Punch', pose: 'jab', notation: ['1'], category: 'stance' },
  { key: 'heavy', label: 'Right Punch', pose: 'heavy', notation: ['2'], category: 'stance' },
  { key: 'kick', label: 'Left Kick', pose: 'kick', notation: ['3'], category: 'stance' },
  { key: 'special', label: 'Right Kick', pose: 'special', notation: ['4'], category: 'stance' },
  { key: 'hitLight', label: 'Hit', pose: 'hit', notation: ['HIT'], category: 'stance' },
  { key: 'knockdown', label: 'Knockdown', pose: 'knockdown', notation: ['KD'], category: 'stance' },
  { key: 'win', label: 'Win', pose: 'win', notation: ['WIN'], category: 'stance' },
  { key: 'lose', label: 'Lose', pose: 'lose', notation: ['LOSE'], category: 'stance' }
];

const buttonCombos = [
  '1',
  '2',
  '3',
  '4',
  '1+2',
  '1+3',
  '1+4',
  '2+3',
  '2+4',
  '3+4',
  '1+2+3',
  '1+2+4',
  '1+3+4',
  '2+3+4',
  '1+2+3+4'
];
const directionPrefixes = ['f', 'F', 'b', 'B', 'd', 'D', 'u', 'U', 'd/f', 'D/F', 'd/b', 'D/B', 'u/f', 'U/F', 'u/b', 'U/B'];
const motionPrefixes = ['f,f', 'b,b', 'f,F', 'qcf', 'qcb', 'hcf', 'hcb', 'dp', 'rdp', 'cd'];
const statePrefixes = ['WR', 'WS', 'FC', 'SS', 'SSL', 'SSR', 'BT', 'iWS', 'iWR', 'cc'];
const specialPrefixes = ['H.', 'R.'];
const animationSlots = buildAnimationSlots();
const slotCategoryOptions: Array<{ value: AnimationSlot['category'] | 'all'; label: string }> = [
  { value: 'stance', label: 'Stances' },
  { value: 'raw', label: 'Raw Buttons' },
  { value: 'direction', label: 'Directions' },
  { value: 'motion', label: 'Motions' },
  { value: 'state', label: 'States' },
  { value: 'special', label: 'Heat/Rage' },
  { value: 'all', label: 'All' }
];
const hitLevelOptions: HitLevel[] = ['high', 'mid', 'low', 'throw', 'special'];
const trackingOptions: MoveTracking[] = ['none', 'weakLeft', 'weakRight', 'medium', 'strong', 'homing'];
const cpuDifficultyLabels: Record<CpuDifficulty, string> = {
  1: 'Easy',
  2: 'Casual',
  3: 'Normal',
  4: 'Hard',
  5: 'KORE'
};

function buildAnimationSlots(): AnimationSlot[] {
  const commandSlots: AnimationSlot[] = [];
  const pushCommand = (command: string, category: AnimationSlot['category']) => {
    commandSlots.push({
      key: commandAnimationKey(command),
      label: command,
      pose: commandPose(command),
      notation: parseNotationTokens(command),
      category,
      command
    });
  };

  buttonCombos.forEach((combo) => pushCommand(combo, 'raw'));
  directionPrefixes.forEach((prefix) => buttonCombos.forEach((combo) => pushCommand(`${prefix}+${combo}`, 'direction')));
  motionPrefixes.forEach((prefix) => buttonCombos.forEach((combo) => pushCommand(`${prefix}+${combo}`, 'motion')));
  statePrefixes.forEach((prefix) => buttonCombos.forEach((combo) => pushCommand(`${prefix}+${combo}`, 'state')));
  specialPrefixes.forEach((prefix) => buttonCombos.forEach((combo) => pushCommand(`${prefix}${combo}`, 'special')));

  return [...baseAnimationSlots, ...commandSlots];
}

function commandAnimationKey(command: string) {
  return `cmd:${command}`;
}

function commandPose(command: string): PreviewPose {
  if (command.includes('3')) return 'kick';
  if (command.includes('4')) return 'special';
  if (command.includes('2')) return 'heavy';
  return 'jab';
}

function parseNotationTokens(command: string): string[] {
  return command.split(/([,+~<:_\[\]*])/).filter(Boolean);
}

function readAnimationOverrides(): AnimationOverrideMap {
  try {
    const raw = window.localStorage.getItem(ANIMATION_STORAGE_KEY);
    debugLog(1, 'storage read', { key: ANIMATION_STORAGE_KEY, hasRawValue: Boolean(raw) });
    if (!raw) return {};
    const stored = JSON.parse(raw) as StoredAnimationOverrides | AnimationOverrideMap | Record<string, Record<string, string[]>>;
    if ('revision' in stored) {
      const revisionMatches = stored.revision === ANIMATION_DEFAULTS_REVISION;
      debugLog(1, 'revisioned storage parsed', {
        storedRevision: stored.revision,
        expectedRevision: ANIMATION_DEFAULTS_REVISION,
        revisionMatches,
        characterIds: Object.keys(stored.overrides ?? {})
      });
      return revisionMatches ? sanitizeAnimationOverrides(stored.overrides as AnimationOverrideMap) : {};
    }
    const parsed = stored as AnimationOverrideMap | Record<string, Record<string, string[]>>;
    return sanitizeAnimationOverrides(Object.fromEntries(
      Object.entries(parsed).map(([characterId, override]) => {
        if ('frames' in override || 'speeds' in override) return [characterId, override];
        return [characterId, { frames: override as Record<string, string[]> }];
      })
    ) as AnimationOverrideMap);
  } catch {
    return {};
  }
}

function sanitizeAnimationOverrides(overrides: AnimationOverrideMap): AnimationOverrideMap {
  const next: AnimationOverrideMap = {};
  for (const [characterId, override] of Object.entries(overrides)) {
    next[characterId] = {
      frames: { ...(override.frames ?? {}) },
      speeds: { ...(override.speeds ?? {}) },
      moves: sanitizeMoveOverrideMap(override.moves ?? {})
    };
  }

  const obsoleteNarutoForward = next.kiro?.frames?.walkForward?.map(getFrameIndex).join(',');
  if (obsoleteNarutoForward === '191,192,193,194,195,196,197') {
    debugLog(5, 'removed obsolete Naruto forward override', { obsoleteNarutoForward });
    delete next.kiro?.frames?.walkForward;
    delete next.kiro?.speeds?.walkForward;
  }

  const sanitized = Object.fromEntries(
    Object.entries(next).filter(
      ([, override]) =>
        Object.keys(override.frames ?? {}).length > 0 ||
        Object.keys(override.speeds ?? {}).length > 0 ||
        Object.keys(override.moves ?? {}).length > 0
    )
  );
  debugLog(5, 'sanitized animation overrides', {
    beforeCharacterIds: Object.keys(overrides),
    afterCharacterIds: Object.keys(sanitized)
  });
  return sanitized;
}

function sanitizeMoveOverrideMap(overrides: Record<string, MoveOverride>) {
  return Object.fromEntries(
    Object.entries(overrides)
      .filter(([key, value]) => key.length > 0 && value && typeof value === 'object')
      .map(([key, value]) => [key, sanitizeMoveOverride(value)])
  );
}

function sanitizeMoveOverride(override: MoveOverride): MoveOverride {
  const next: MoveOverride = {};
  const numericKeys: Array<keyof MoveOverride> = [
    'startupFrames',
    'activeFrames',
    'recoveryFrames',
    'damage',
    'blockDamage',
    'onBlockFrames',
    'onHitFrames',
    'onCounterHitFrames',
    'whiffRecoveryFrames',
    'range',
    'pushback',
    'blockPushback',
    'launchHeight',
    'armorStartFrame',
    'armorEndFrame'
  ];
  for (const key of numericKeys) {
    const value = override[key];
    if (Number.isFinite(value)) {
      (next as Record<string, number>)[key] = Number(value);
    }
  }
  if (override.label) next.label = override.label;
  if (override.hitLevel && hitLevelOptions.includes(override.hitLevel)) next.hitLevel = override.hitLevel;
  if (override.tracking && trackingOptions.includes(override.tracking)) next.tracking = override.tracking;
  if (typeof override.knockdown === 'boolean') next.knockdown = override.knockdown;
  if (Array.isArray(override.cancelWindows)) next.cancelWindows = override.cancelWindows;
  return next;
}

function applyAnimationOverrides(characters: CharacterDefinition[], overrides: AnimationOverrideMap) {
  const sanitizedOverrides = sanitizeAnimationOverrides(overrides);
  const effectiveCharacters = characters.map((character) => {
    const characterOverrides = sanitizedOverrides[character.id];
    if (!characterOverrides) return character;
    return {
      ...character,
      animationFrames: {
        ...character.animationFrames,
        ...characterOverrides.frames
      },
      animationFrameRates: {
        ...character.animationFrameRates,
        ...characterOverrides.speeds
      },
      moveOverrides: {
        ...character.moveOverrides,
        ...characterOverrides.moves
      }
    };
  });
  debugLog(3, 'effective roster built', {
    source: characters.map((character) => ({
      id: character.id,
      walkForward: character.animationFrames?.walkForward?.map(getFrameIndex),
      walkForwardFps: character.animationFrameRates?.walkForward ?? character.animationFps
    })),
    effective: effectiveCharacters.map((character) => ({
      id: character.id,
      walkForward: character.animationFrames?.walkForward?.map(getFrameIndex),
      walkForwardFps: character.animationFrameRates?.walkForward ?? character.animationFps
    })),
    overrideCharacterIds: Object.keys(sanitizedOverrides)
  });
  return effectiveCharacters;
}

function getFrameIndex(path: string) {
  const match = path.match(/frame-(\d+)\.png$/);
  return match ? Number(match[1]) : -1;
}

function framePath(character: CharacterDefinition, index: number) {
  return `/characters/${character.id}/frames/frame-${index.toString().padStart(3, '0')}.png`;
}

function characterPortraitPath(character: CharacterDefinition) {
  return character.animationFrames?.idle?.[0] ?? framePath(character, 0);
}

function isLocalDevHost() {
  return ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('boot');
  const [rosterResult, setRosterResult] = useState<CharacterLoadResult | null>(null);
  const [animationOverrides, setAnimationOverrides] = useState<AnimationOverrideMap>(() => readAnimationOverrides());
  const sourceRoster = rosterResult?.characters ?? [];
  const roster = useMemo(() => applyAnimationOverrides(sourceRoster, animationOverrides), [sourceRoster, animationOverrides]);
  const [p1Id, setP1Id] = useState('astra');
  const [p2Id, setP2Id] = useState('dax');
  const [stageId, setStageId] = useState(stages[0].id);
  const [mode, setMode] = useState<MatchMode>('ai');
  const [cpuDifficulty, setCpuDifficulty] = useState<CpuDifficulty>(3);
  const [settings, setSettings] = useState<GameSettings>(() => readGameSettings());
  const { readInputs, setVirtualAction, clearMenuInputs, getLastInput } = useControls(mode, settings.controls);

  useEffect(() => {
    debugHypotheses();
    let mounted = true;
    loadCharacterRoster().then((result) => {
      if (!mounted) return;
      debugLog(3, 'roster result accepted by app', {
        characterIds: result.characters.map((character) => character.id),
        warnings: result.warnings
      });
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
    const sanitizedOverrides = sanitizeAnimationOverrides(animationOverrides);
    debugLog(1, 'storage write', {
      revision: ANIMATION_DEFAULTS_REVISION,
      overrideCharacterIds: Object.keys(sanitizedOverrides)
    });
    window.localStorage.setItem(
      ANIMATION_STORAGE_KEY,
      JSON.stringify({
        revision: ANIMATION_DEFAULTS_REVISION,
        overrides: sanitizedOverrides
      } satisfies StoredAnimationOverrides)
    );
  }, [animationOverrides]);

  useEffect(() => {
    writeGameSettings(settings);
  }, [settings]);

  const setCharacterAnimationFrames = (characterId: string, animationKey: string, frames: string[]) => {
    debugLog(4, 'viewer frame override requested', {
      characterId,
      animationKey,
      frames: frames.map(getFrameIndex)
    });
    setAnimationOverrides((current) => ({
      ...current,
      [characterId]: {
        ...(current[characterId] ?? {}),
        frames: {
          ...(current[characterId]?.frames ?? {}),
          [animationKey]: frames
        }
      }
    }));
  };

  const setCharacterAnimationSpeed = (characterId: string, animationKey: string, speed: number) => {
    debugLog(8, 'viewer speed override requested', { characterId, animationKey, speed });
    setAnimationOverrides((current) => ({
      ...current,
      [characterId]: {
        ...(current[characterId] ?? {}),
        speeds: {
          ...(current[characterId]?.speeds ?? {}),
          [animationKey]: speed
        }
      }
    }));
  };

  const setCharacterMoveOverride = (characterId: string, moveKey: string, override: MoveOverride) => {
    debugLog(9, 'viewer frame data override requested', { characterId, moveKey, override });
    setAnimationOverrides((current) => ({
      ...current,
      [characterId]: {
        ...(current[characterId] ?? {}),
        moves: {
          ...(current[characterId]?.moves ?? {}),
          [moveKey]: sanitizeMoveOverride(override)
        }
      }
    }));
  };

  useEffect(() => {
    if (settings.display.reducedMotion) return;
    anime.remove('.screen-panel > *');
    anime({
      targets: '.screen-panel > *',
      translateY: [12, 0],
      opacity: [0, 1],
      delay: anime.stagger(70),
      duration: 460,
      easing: 'easeOutCubic'
    });
  }, [screen, settings.display.reducedMotion]);

  const p1 = roster.find((character) => character.id === p1Id) ?? roster[0];
  const p2 = roster.find((character) => character.id === p2Id) ?? roster[1] ?? roster[0];
  const selectedStage = stages.find((stage) => stage.id === stageId) ?? stages[0];

  if (screen === 'boot' || !p1 || !p2) {
    return (
      <main className="app-shell boot-shell">
        <section className="boot-mark" aria-label="Loading KORE">
          <Swords size={34} />
          <h1>KORE</h1>
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
            roster={roster}
            onArcade={() => {
              setMode('ai');
              setScreen('select');
            }}
            onVersus={() => {
              setMode('local2p');
              setScreen('select');
            }}
            onTraining={() => {
              setMode('training');
              setScreen('select');
            }}
            onSettings={() => setScreen('settings')}
            onViewer={() => setScreen('viewer')}
            onExit={() => setScreen('title')}
          />
        )}
        {screen === 'select' && (
          <CharacterSelect
            roster={roster}
            p1Id={p1Id}
            p2Id={p2Id}
            mode={mode}
            cpuDifficulty={cpuDifficulty}
            setP1Id={setP1Id}
            setP2Id={setP2Id}
            setMode={setMode}
            setCpuDifficulty={setCpuDifficulty}
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
        {screen === 'settings' && (
          <SettingsScreen
            mode={mode}
            setMode={setMode}
            cpuDifficulty={cpuDifficulty}
            setCpuDifficulty={setCpuDifficulty}
            settings={settings}
            setSettings={setSettings}
            onBack={() => setScreen('menu')}
          />
        )}
        {screen === 'viewer' && (
          <CharacterViewer
            roster={roster}
            sourceRoster={sourceRoster}
            onAnimationFramesChange={setCharacterAnimationFrames}
            onAnimationSpeedChange={setCharacterAnimationSpeed}
            onMoveOverrideChange={setCharacterMoveOverride}
            onBack={() => setScreen('menu')}
          />
        )}
        {screen === 'fight' && (
          <FightScreen
            key={`${p1.id}-${p2.id}-${selectedStage.id}-${mode}-${cpuDifficulty}`}
            p1={p1}
            p2={p2}
            stage={selectedStage}
            mode={mode}
            cpuDifficulty={cpuDifficulty}
            settings={settings}
            readInputs={readInputs}
            setVirtualAction={setVirtualAction}
            clearMenuInputs={clearMenuInputs}
            getLastInput={getLastInput}
            onMenu={() => setScreen('menu')}
            onCharacterSelect={() => setScreen('select')}
          />
        )}
      </section>
    </main>
  );
}

function TitleScreen({ onStart }: { onStart: () => void }) {
  const titleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    onStart();
  };

  return (
    <div ref={titleRef} className="title-screen" tabIndex={0} onClick={onStart} onKeyDown={handleKeyDown} aria-label="KORE title screen. Press any key.">
      <img className="title-logo" src="/brand/kore-logo-generated.png" alt="KORE" />
      <span className="press-any-key">PRESS ANY KEY</span>
    </div>
  );
}

function MenuScreen({
  roster,
  onArcade,
  onVersus,
  onTraining,
  onSettings,
  onViewer,
  onExit
}: {
  roster: CharacterDefinition[];
  onArcade: () => void;
  onVersus: () => void;
  onTraining: () => void;
  onSettings: () => void;
  onViewer: () => void;
  onExit: () => void;
}) {
  const p1 = roster.find((character) => character.id === 'kiro') ?? roster[0];
  const p2 = roster.find((character) => character.id === 'riven') ?? roster.find((character) => character.id !== p1?.id) ?? roster[1] ?? roster[0];
  const [attractMatch, setAttractMatch] = useState<MatchSnapshot | null>(() => (p1 && p2 ? createMatch(p1, p2, menuAttractStage, 'cpu', 4) : null));
  const [activeMenuIndex, setActiveMenuIndex] = useState(0);
  const matchRef = useRef<MatchSnapshot | null>(attractMatch);

  useEffect(() => {
    if (!p1 || !p2) return;
    const fresh = createMatch(p1, p2, menuAttractStage, 'cpu', 4);
    matchRef.current = fresh;
    setAttractMatch(fresh);
  }, [p1, p2]);

  useEffect(() => {
    if (!p1 || !p2) return;
    let frame = 0;
    let last = performance.now();
    let accumulator = 0;
    const fixedStep = 1 / 60;

    const tick = (now: number) => {
      accumulator += Math.min(0.05, (now - last) / 1000);
      last = now;
      while (accumulator >= fixedStep) {
        const current = matchRef.current ?? createMatch(p1, p2, menuAttractStage, 'cpu', 4);
        if (current.phase !== 'fighting' || current.timer < 42 || current.fighters.some((fighter) => fighter.hp <= 0)) {
          matchRef.current = createMatch(p1, p2, menuAttractStage, 'cpu', 4);
        } else {
          matchRef.current = stepMatch(current, emptyInputFrame(), emptyInputFrame(), fixedStep);
        }
        accumulator -= fixedStep;
      }
      setAttractMatch(matchRef.current);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [p1, p2]);

  const menuItems = [
    { label: 'Arcade', action: onArcade },
    { label: 'Versus', action: onVersus },
    { label: 'Training', action: onTraining },
    { label: 'Characters', action: onViewer },
    { label: 'Options', action: onSettings },
    { label: 'Exit', action: onExit }
  ];

  return (
    <div className="menu-screen">
      {attractMatch && (
        <div className="menu-attract-background" aria-hidden="true">
          <MenuAttractScene match={attractMatch} />
        </div>
      )}
      <div className="menu-vignette" />
      <section className="kore-menu-overlay" aria-label="KORE main menu">
        <img className="kore-menu-logo" src="/brand/kore-logo-generated.png" alt="KORE" />
        <nav className="arcade-menu-list" aria-label="Main menu">
          {menuItems.map((item, index) => (
            <button
              key={item.label}
              className={index === activeMenuIndex ? 'is-active' : ''}
              onPointerEnter={() => setActiveMenuIndex(index)}
              onMouseEnter={() => setActiveMenuIndex(index)}
              onMouseMove={() => setActiveMenuIndex(index)}
              onFocus={() => setActiveMenuIndex(index)}
              onClick={item.action}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </section>
    </div>
  );
}

function CharacterSelect({
  roster,
  p1Id,
  p2Id,
  mode,
  cpuDifficulty,
  setP1Id,
  setP2Id,
  setMode,
  setCpuDifficulty,
  onBack,
  onNext
}: {
  roster: CharacterDefinition[];
  p1Id: string;
  p2Id: string;
  mode: MatchMode;
  cpuDifficulty: CpuDifficulty;
  setP1Id: (id: string) => void;
  setP2Id: (id: string) => void;
  setMode: (mode: MatchMode) => void;
  setCpuDifficulty: (difficulty: CpuDifficulty) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [selectTarget, setSelectTarget] = useState<1 | 2>(1);
  const p1Character = roster.find((character) => character.id === p1Id) ?? roster[0];
  const p2Character = roster.find((character) => character.id === p2Id) ?? roster[1] ?? p1Character;
  const targetLabel = selectTarget === 1 ? `${getSlotLabel(mode, 1).toUpperCase()} >>` : `${getSlotLabel(mode, 2).toUpperCase()} >>`;
  const assignCharacter = (id: string) => {
    if (selectTarget === 1) {
      setP1Id(id);
      return;
    }
    setP2Id(id);
  };

  if (!p1Character || !p2Character) {
    return (
      <div className="select-screen">
        <header className="section-header">
          <div>
            <span>Roster</span>
            <h2>Character Select</h2>
          </div>
        </header>
        <p>No fighters are available.</p>
        <FooterActions onBack={onBack} onNext={onBack} nextLabel="Back" />
      </div>
    );
  }

  return (
    <div className="select-screen versus-select-screen">
      <button
        type="button"
        className={`versus-hero versus-hero-left ${selectTarget === 1 ? 'is-picking' : ''}`}
        style={{ '--fighter-color': p1Character.colors.primary } as CSSProperties}
        onClick={() => setSelectTarget(1)}
      >
        <span className="versus-player-kicker">{getSlotLabel(mode, 1)}</span>
        <img src={characterPortraitPath(p1Character)} alt="" />
        <span className="versus-hero-name">{p1Character.displayName}</span>
        <span className="versus-hero-meta">{p1Character.moves.map((move) => move.label).slice(0, 3).join(' / ')}</span>
      </button>

      <section className="versus-roster-panel" aria-label="Character select">
        <div className="versus-select-top">
          <div>
            <span>Character Select</span>
            <h2>{targetLabel}</h2>
          </div>
          <div className="mode-stack">
            <SegmentedControl value={mode} setValue={setMode} />
            {usesCpuDifficulty(mode) && <CpuDifficultyControl value={cpuDifficulty} setValue={setCpuDifficulty} compact />}
          </div>
        </div>

        <div className="versus-target-tabs" aria-label="Choose selection target">
          <button className={selectTarget === 1 ? 'active' : ''} onClick={() => setSelectTarget(1)}>
            {getSlotShortLabel(mode, 1)}
          </button>
          <button className={selectTarget === 2 ? 'active' : ''} onClick={() => setSelectTarget(2)}>
            {getSlotShortLabel(mode, 2)}
          </button>
        </div>

        <div className="versus-roster-grid">
          {roster.map((character) => {
            const isP1 = p1Id === character.id;
            const isP2 = p2Id === character.id;
            return (
              <button
                key={character.id}
                type="button"
                className={`versus-roster-tile ${isP1 ? 'is-p1' : ''} ${isP2 ? 'is-p2' : ''}`}
                style={{ '--fighter-color': character.colors.primary } as CSSProperties}
                onClick={() => assignCharacter(character.id)}
                aria-label={`Select ${character.displayName}`}
              >
                <img src={characterPortraitPath(character)} alt="" />
                <span>{character.displayName}</span>
                <small>{isP1 ? getSlotShortLabel(mode, 1) : ''}{isP1 && isP2 ? ' / ' : ''}{isP2 ? getSlotShortLabel(mode, 2) : ''}</small>
              </button>
            );
          })}
        </div>

        <FooterActions onBack={onBack} onNext={onNext} nextLabel="Stage" />
      </section>

      <button
        type="button"
        className={`versus-hero versus-hero-right ${selectTarget === 2 ? 'is-picking' : ''}`}
        style={{ '--fighter-color': p2Character.colors.primary } as CSSProperties}
        onClick={() => setSelectTarget(2)}
      >
        <span className="versus-player-kicker">{getSlotLabel(mode, 2)}</span>
        <img src={characterPortraitPath(p2Character)} alt="" />
        <span className="versus-hero-name">{p2Character.displayName}</span>
        <span className="versus-hero-meta">{p2Character.moves.map((move) => move.label).slice(0, 3).join(' / ')}</span>
      </button>
      <div className="versus-floor-glow" aria-hidden="true" />
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
      <button className={value === 'training' ? 'active' : ''} onClick={() => setValue('training')}>
        <Target size={16} />
        Training
      </button>
      <button className={value === 'cpu' ? 'active' : ''} onClick={() => setValue('cpu')}>
        <Swords size={16} />
        CPU vs CPU
      </button>
    </div>
  );
}

function CpuDifficultyControl({
  value,
  setValue,
  compact = false
}: {
  value: CpuDifficulty;
  setValue: (difficulty: CpuDifficulty) => void;
  compact?: boolean;
}) {
  const update = (rawValue: string) => {
    const next = Math.min(5, Math.max(1, Number(rawValue))) as CpuDifficulty;
    setValue(next);
  };

  return (
    <label className={`cpu-difficulty ${compact ? 'is-compact' : ''}`}>
      <span>CPU Difficulty</span>
      <div>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={value}
          onChange={(event) => update(event.target.value)}
          aria-label="CPU difficulty"
        />
        <strong>{cpuDifficultyLabels[value]}</strong>
      </div>
    </label>
  );
}

function getSlotLabel(mode: MatchMode, slot: 1 | 2) {
  if (mode === 'cpu') return slot === 1 ? 'CPU 1' : 'CPU 2';
  if (slot === 2 && mode === 'training') return 'Dummy';
  if (slot === 2 && mode === 'ai') return 'CPU';
  return slot === 1 ? 'Player 1' : 'Player 2';
}

function getSlotShortLabel(mode: MatchMode, slot: 1 | 2) {
  if (mode === 'cpu') return slot === 1 ? 'CPU 1' : 'CPU 2';
  if (slot === 2 && mode === 'training') return 'Dummy';
  if (slot === 2 && mode === 'ai') return 'CPU';
  return slot === 1 ? 'P1' : 'P2';
}

function usesCpuDifficulty(mode: MatchMode) {
  return mode === 'ai' || mode === 'cpu';
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
  const selectedStage = stages.find((stage) => stage.id === selected) ?? stages[0];

  return (
    <div className="stage-screen">
      <header className="stage-select-header">
        <h2>Stage Select</h2>
      </header>

      <section
        className="stage-hero"
        style={{ '--stage-color': selectedStage.rail, '--stage-floor': selectedStage.floor } as CSSProperties}
        aria-label={`${selectedStage.name} selected stage preview`}
      >
        <div className="stage-hero-preview">
          <StagePreviewCanvas stage={selectedStage} />
        </div>
        <div className="stage-hero-label">
          <strong>{selectedStage.name}</strong>
          <small>{selectedStage.subtitle}</small>
        </div>
      </section>

      <div className="stage-thumbnail-grid" aria-label="Stage choices">
        {stages.map((stage) => (
          <button
            key={stage.id}
            className={`stage-thumbnail ${selected === stage.id ? 'is-selected' : ''}`}
            style={{ '--stage-color': stage.rail, '--stage-floor': stage.floor } as CSSProperties}
            onClick={() => setSelected(stage.id)}
            aria-label={`Select ${stage.name}`}
          >
            <span className="stage-thumbnail-flag" aria-hidden="true">
              {selected === stage.id ? '1P' : ''}
            </span>
            <span className="stage-preview" data-testid={`stage-preview-${stage.id}`}>
              <StagePreviewCanvas stage={stage} />
            </span>
            <strong>{stage.name}</strong>
          </button>
        ))}
      </div>

      <FooterActions onBack={onBack} onNext={onFight} nextLabel="Fight" />
    </div>
  );
}

type SettingsTab = 'game' | 'controls' | 'camera' | 'display' | 'audio';

const settingsTabs: SettingsTab[] = ['game', 'controls', 'camera', 'display', 'audio'];
const tabLabels: Record<SettingsTab, string> = {
  game: 'Game',
  controls: 'Controls',
  camera: 'Camera',
  display: 'Display',
  audio: 'Audio'
};
const sidebars: Record<SettingsTab, string[]> = {
  game: ['Match Rules', 'Training', 'Assist', 'Defaults'],
  controls: ['Keyboard Mapping', 'Gamepad Mapping', 'Input Test', 'Defaults'],
  camera: ['Fight Camera', 'Tracking', 'Zoom', 'Defaults'],
  display: ['HUD', 'Touch Controls', 'Motion', 'Debug'],
  audio: ['Master Mix', 'Music', 'SFX', 'Mute']
};
const controlActions: ActionName[] = ['up', 'down', 'left', 'right', 'jab', 'heavy', 'kick', 'special', 'block', 'confirm', 'pause'];
const actionLabels: Record<ActionName, string> = {
  up: 'Up / Jump',
  down: 'Down / Crouch',
  left: 'Left',
  right: 'Right',
  sidestepUp: 'Sidestep Up',
  sidestepDown: 'Sidestep Down',
  sidewalkUp: 'Sidewalk Up',
  sidewalkDown: 'Sidewalk Down',
  jab: '1 Left Hand',
  heavy: '2 Right Hand',
  kick: '3 Left Foot',
  special: '4 Right Foot',
  block: 'Block',
  confirm: 'Confirm',
  back: 'Back',
  pause: 'Pause'
};

function SettingsScreen({
  mode,
  setMode,
  cpuDifficulty,
  setCpuDifficulty,
  settings,
  setSettings,
  onBack
}: {
  mode: MatchMode;
  setMode: (mode: MatchMode) => void;
  cpuDifficulty: CpuDifficulty;
  setCpuDifficulty: (difficulty: CpuDifficulty) => void;
  settings: GameSettings;
  setSettings: Dispatch<SetStateAction<GameSettings>>;
  onBack: () => void;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('controls');
  const [activePlayer, setActivePlayer] = useState<1 | 2>(1);
  const [remapRequest, setRemapRequest] = useState<{ player: 1 | 2; action: ActionName } | null>(null);
  const [duplicateRequest, setDuplicateRequest] = useState<{ key: string; owner: string } | null>(null);
  const [inputTest, setInputTest] = useState('Press a key to test bindings');

  const updateSettings = (recipe: (current: GameSettings) => GameSettings) => {
    setSettings((current) => sanitizeGameSettings(recipe(cloneSettings(current))));
  };

  useEffect(() => {
    if (!remapRequest) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      const nextKey = event.code || event.key;
      const duplicate = findDuplicateKeyboardBinding(settings, nextKey, remapRequest);
      if (duplicate && (duplicateRequest?.key !== nextKey || duplicateRequest.owner !== duplicate.owner)) {
        setDuplicateRequest({ key: nextKey, owner: duplicate.owner });
        return;
      }
      updateSettings((current) => setKeyboardBinding(current, remapRequest.player, remapRequest.action, nextKey));
      setInputTest(`P${remapRequest.player} ${actionLabels[remapRequest.action]} = ${formatKeyName(nextKey)}`);
      setRemapRequest(null);
      setDuplicateRequest(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [duplicateRequest, remapRequest, settings]);

  useEffect(() => {
    if (remapRequest) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const bindings = getKeyboardBindingsForEvent(event, mode, settings.controls);
      setInputTest(bindings.length > 0 ? bindings.map((binding) => `P${binding.player} ${actionLabels[binding.action]}`).join(' / ') : `Unbound: ${formatKeyName(event.code || event.key)}`);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [mode, remapRequest, settings.controls]);

  const renderEditor = () => {
    if (activeTab === 'game') {
      return (
        <div className="settings-list">
          <SettingRow label="Match Mode" value={modeLabel(mode)}>
            <SegmentedControl value={mode} setValue={setMode} />
          </SettingRow>
          <SettingRow label="Round Timer" value={`${settings.game.roundTimer}s`}>
            <input type="range" min={30} max={99} step={1} value={settings.game.roundTimer} onChange={(event) => updateSettings((current) => ({ ...current, game: { ...current.game, roundTimer: Number(event.target.value) } }))} />
          </SettingRow>
          {usesCpuDifficulty(mode) && (
            <SettingRow label="CPU Difficulty" value={cpuDifficultyLabels[cpuDifficulty]}>
              <CpuDifficultyControl value={cpuDifficulty} setValue={setCpuDifficulty} compact />
            </SettingRow>
          )}
          <SettingToggle label="Training Infinite Health" checked={settings.game.trainingInfiniteHealth} onChange={(checked) => updateSettings((current) => ({ ...current, game: { ...current.game, trainingInfiniteHealth: checked } }))} />
          <SettingToggle label="Input Assist" checked={settings.game.inputAssist} onChange={(checked) => updateSettings((current) => ({ ...current, game: { ...current.game, inputAssist: checked } }))} />
        </div>
      );
    }

    if (activeTab === 'controls') {
      const keyboard = settings.controls.keyboard[activePlayer - 1];
      const gamepad = settings.controls.gamepad[activePlayer - 1];
      return (
        <div className="settings-list">
          <SettingRow label="Player" value={`P${activePlayer}`}>
            <div className="mini-segmented">
              <button className={activePlayer === 1 ? 'active' : ''} onClick={() => setActivePlayer(1)}>P1</button>
              <button className={activePlayer === 2 ? 'active' : ''} onClick={() => setActivePlayer(2)}>P2</button>
            </div>
          </SettingRow>
          {controlActions.map((action) => (
            <div className="binding-row" key={action}>
              <div>
                <strong>{actionLabels[action]}</strong>
                <small>{keyboard[action].map(formatKeyName).join(' / ') || 'Unbound'}</small>
              </div>
              <button className={remapRequest?.player === activePlayer && remapRequest.action === action ? 'capture' : ''} onClick={() => {
                setActivePlayer(activePlayer);
                setRemapRequest({ player: activePlayer, action });
                setDuplicateRequest(null);
              }}>
                {remapRequest?.player === activePlayer && remapRequest.action === action ? 'Press key' : 'Remap'}
              </button>
              <div className="gamepad-stepper" aria-label={`${actionLabels[action]} gamepad button`}>
                <button onClick={() => updateSettings((current) => adjustGamepadButton(current, activePlayer, action, -1))}>-</button>
                <span>B{gamepad[action]?.[0] ?? '-'}</span>
                <button onClick={() => updateSettings((current) => adjustGamepadButton(current, activePlayer, action, 1))}>+</button>
              </div>
            </div>
          ))}
          {duplicateRequest && <p className="settings-warning">{duplicateRequest.key} is already bound to {duplicateRequest.owner}. Press it again to replace that binding.</p>}
          <div className="settings-actions-row">
            <button className="secondary-button" onClick={() => setSettings((current) => ({ ...current, controls: cloneSettings(defaultGameSettings).controls }))}>
              <RotateCcw size={16} />
              Reset Controls
            </button>
          </div>
        </div>
      );
    }

    if (activeTab === 'camera') {
      return (
        <div className="settings-list">
          <SettingSlider label="Distance" value={settings.camera.distance} min={0.7} max={1.35} step={0.01} onChange={(value) => updateSettings((current) => ({ ...current, camera: { ...current.camera, distance: value } }))} />
          <SettingSlider label="Height" value={settings.camera.height} min={0.75} max={1.35} step={0.01} onChange={(value) => updateSettings((current) => ({ ...current, camera: { ...current.camera, height: value } }))} />
          <SettingSlider label="Smoothing" value={settings.camera.smoothing} min={0.35} max={1.5} step={0.01} onChange={(value) => updateSettings((current) => ({ ...current, camera: { ...current.camera, smoothing: value } }))} />
          <SettingSlider label="Zoom Bias" value={settings.camera.zoomBias} min={0.75} max={1.35} step={0.01} onChange={(value) => updateSettings((current) => ({ ...current, camera: { ...current.camera, zoomBias: value } }))} />
        </div>
      );
    }

    if (activeTab === 'display') {
      return (
        <div className="settings-list">
          <SettingSlider label="HUD Scale" value={settings.display.hudScale} min={0.78} max={1.25} step={0.01} onChange={(value) => updateSettings((current) => ({ ...current, display: { ...current.display, hudScale: value } }))} />
          <SettingRow label="Touch Controls" value={settings.display.touchControls.toUpperCase()}>
            <div className="mini-segmented">
              {(['auto', 'on', 'off'] as const).map((value) => (
                <button key={value} className={settings.display.touchControls === value ? 'active' : ''} onClick={() => updateSettings((current) => ({ ...current, display: { ...current.display, touchControls: value } }))}>{value}</button>
              ))}
            </div>
          </SettingRow>
          <SettingToggle label="Reduced Motion" checked={settings.display.reducedMotion} onChange={(checked) => updateSettings((current) => ({ ...current, display: { ...current.display, reducedMotion: checked } }))} />
          <SettingToggle label="Debug Overlay" checked={settings.display.debugOverlay} onChange={(checked) => updateSettings((current) => ({ ...current, display: { ...current.display, debugOverlay: checked } }))} />
        </div>
      );
    }

    return (
      <div className="settings-list">
        <SettingToggle label="Mute All" checked={settings.audio.muted} onChange={(checked) => updateSettings((current) => ({ ...current, audio: { ...current.audio, muted: checked } }))} />
        <SettingSlider label="Master" value={settings.audio.master} min={0} max={1} step={0.01} onChange={(value) => updateSettings((current) => ({ ...current, audio: { ...current.audio, master: value } }))} />
        <SettingSlider label="Music" value={settings.audio.music} min={0} max={1} step={0.01} onChange={(value) => updateSettings((current) => ({ ...current, audio: { ...current.audio, music: value } }))} />
        <SettingSlider label="SFX" value={settings.audio.sfx} min={0} max={1} step={0.01} onChange={(value) => updateSettings((current) => ({ ...current, audio: { ...current.audio, sfx: value } }))} />
      </div>
    );
  };

  return (
    <div className="settings-screen">
      <header className="options-header">
        <div>
          <span>Options</span>
          <h2>{tabLabels[activeTab]}</h2>
        </div>
        <nav className="options-tabs" aria-label="Options tabs">
          <span>L1</span>
          {settingsTabs.map((tab) => (
            <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
              {tabLabels[tab]}
            </button>
          ))}
          <span>R1</span>
        </nav>
      </header>
      <section className="options-layout">
        <aside className="options-sidebar">
          {sidebars[activeTab].map((item, index) => (
            <button key={item} className={index === 0 ? 'active' : ''}>{item}</button>
          ))}
          <button onClick={() => setSettings(cloneSettings(defaultGameSettings))}>Restore All Defaults</button>
        </aside>
        <section className="options-editor" aria-label={`${tabLabels[activeTab]} settings`}>
          {renderEditor()}
        </section>
        <aside className="options-preview">
          <OptionsPreview tab={activeTab} settings={settings} inputTest={inputTest} activePlayer={activePlayer} />
        </aside>
      </section>
      <footer className="settings-support-footer" aria-label="Community links">
        <button className="secondary-button" onClick={onBack}>
          <Home size={18} />
          Back
        </button>
        <div className="support-actions">
          <a className="support-button discord-button" href="https://discord.gg/yDcrFsmTx7" target="_blank" rel="noreferrer">
            <span className="discord-mark" aria-hidden="true">Discord</span>
            <span>Join the Discord</span>
          </a>
          <a className="support-button patreon-button" href="https://www.patreon.com/cw/playKORE" target="_blank" rel="noreferrer">
            <span className="patreon-mark" aria-hidden="true">p</span>
            <span>Become a patron</span>
          </a>
        </div>
      </footer>
    </div>
  );
}

function SettingRow({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <article className="setting-row">
      <div>
        <strong>{label}</strong>
        <small>{value}</small>
      </div>
      <div>{children}</div>
    </article>
  );
}

function SettingSlider({
  label,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <SettingRow label={label} value={`${Math.round(value * 100)}%`}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </SettingRow>
  );
}

function SettingToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <article className="setting-row">
      <div>
        <strong>{label}</strong>
        <small>{checked ? 'On' : 'Off'}</small>
      </div>
      <button className={`toggle-switch ${checked ? 'is-on' : ''}`} onClick={() => onChange(!checked)} aria-pressed={checked}>
        <span />
      </button>
    </article>
  );
}

function OptionsPreview({
  tab,
  settings,
  inputTest,
  activePlayer
}: {
  tab: SettingsTab;
  settings: GameSettings;
  inputTest: string;
  activePlayer: 1 | 2;
}) {
  const keyboard = settings.controls.keyboard[activePlayer - 1];
  return (
    <div className="options-preview-card">
      <span>{tabLabels[tab]} Preview</span>
      {tab === 'controls' ? (
        <>
          <div className="controller-outline" aria-hidden="true">
            <span>LS</span>
            <span>RS</span>
            <b>1</b>
            <b>2</b>
            <b>3</b>
            <b>4</b>
          </div>
          <p>{inputTest}</p>
          <small>P{activePlayer} primary attack keys: {['jab', 'heavy', 'kick', 'special'].map((action) => keyboard[action as ActionName][0] ? formatKeyName(keyboard[action as ActionName][0]) : '-').join(' / ')}</small>
        </>
      ) : (
        <>
          <strong>{previewTitle(tab, settings)}</strong>
          <p>{previewBody(tab)}</p>
        </>
      )}
    </div>
  );
}

function findDuplicateKeyboardBinding(settings: GameSettings, key: string, target: { player: 1 | 2; action: ActionName }) {
  for (let player = 1; player <= 2; player += 1) {
    const keyboard = settings.controls.keyboard[player - 1];
    for (const action of Object.keys(keyboard) as ActionName[]) {
      if (player === target.player && action === target.action) continue;
      if (keyboard[action].includes(key)) return { owner: `P${player} ${actionLabels[action]}` };
    }
  }
  return null;
}

function setKeyboardBinding(settings: GameSettings, player: 1 | 2, action: ActionName, key: string): GameSettings {
  const next = cloneSettings(settings);
  next.controls.keyboard.forEach((keyboard) => {
    for (const candidate of Object.keys(keyboard) as ActionName[]) {
      keyboard[candidate] = keyboard[candidate].filter((value) => value !== key);
    }
  });
  const bindings = next.controls.keyboard[player - 1][action];
  next.controls.keyboard[player - 1][action] = [key, ...bindings.filter((value) => value !== key)].slice(0, 3);
  return next;
}

function adjustGamepadButton(settings: GameSettings, player: 1 | 2, action: ActionName, delta: number): GameSettings {
  const next = cloneSettings(settings);
  const current = next.controls.gamepad[player - 1][action]?.[0] ?? 0;
  next.controls.gamepad[player - 1][action] = [Math.min(16, Math.max(0, current + delta))];
  return next;
}

function formatKeyName(key: string) {
  return key
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace(/^Numpad/, 'Num ')
    .replace('Arrow', '')
    .replace('Space', 'Spacebar')
    .replace('Escape', 'Esc');
}

function modeLabel(mode: MatchMode) {
  if (mode === 'ai') return '1P vs AI';
  if (mode === 'local2p') return 'Local 2P';
  if (mode === 'training') return 'Training';
  return 'CPU vs CPU';
}

function previewTitle(tab: SettingsTab, settings: GameSettings) {
  if (tab === 'game') return `${settings.game.roundTimer}s rounds`;
  if (tab === 'camera') return `Camera ${Math.round(settings.camera.distance * 100)} / ${Math.round(settings.camera.height * 100)}`;
  if (tab === 'display') return `HUD ${Math.round(settings.display.hudScale * 100)}%`;
  return settings.audio.muted ? 'Muted' : `Master ${Math.round(settings.audio.master * 100)}%`;
}

function previewBody(tab: SettingsTab) {
  if (tab === 'game') return 'These values are applied when a new fight or rematch starts.';
  if (tab === 'camera') return 'Camera tuning affects the live fight camera that keeps both fighters centered.';
  if (tab === 'display') return 'Display settings affect HUD, touch controls, reduced motion, and debug overlays.';
  return 'Audio values are persisted now and ready for future music and SFX playback.';
}

function resolveSlotMove(character: CharacterDefinition, slot: AnimationSlot): MoveDefinition | null {
  if (!isMoveSlotPose(slot.pose) && !slot.command) return null;
  const baseInput = isMoveSlotPose(slot.pose) ? slot.pose : commandPose(slot.command ?? slot.label);
  const baseMove = character.moves.find((move) => move.input === baseInput) ?? character.moves[0] ?? null;
  if (!baseMove) return null;
  const overrideKeys = [slot.key, slot.command, baseMove.id, baseMove.input].filter(Boolean) as string[];
  return overrideKeys.reduce<MoveDefinition>((move, key) => {
    const override = character.moveOverrides?.[key];
    return override ? mergeMoveOverride(move, override) : move;
  }, baseMove);
}

function mergeMoveOverride(move: MoveDefinition, override: MoveOverride): MoveDefinition {
  return {
    ...move,
    ...override,
    hitbox: override.hitbox
      ? {
          offset: override.hitbox.offset ?? move.hitbox.offset,
          size: override.hitbox.size ?? move.hitbox.size
        }
      : move.hitbox
  };
}

function isMoveSlotPose(pose: PreviewPose): pose is MoveDefinition['input'] {
  return pose === 'jab' || pose === 'kick' || pose === 'heavy' || pose === 'special';
}

function formatFrameSummary(move: MoveDefinition | null) {
  if (!move) return 'No move data';
  const hitText = move.knockdown ? 'KD' : move.launchHeight ? 'Launch' : signedFrame(move.onHitFrames);
  return `i${move.startupFrames} | ${capitalize(move.hitLevel)} | ${signedFrame(move.onBlockFrames)} OB | ${hitText} OH`;
}

function signedFrame(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
  sourceRoster,
  onAnimationFramesChange,
  onAnimationSpeedChange,
  onMoveOverrideChange,
  onBack
}: {
  roster: CharacterDefinition[];
  sourceRoster: CharacterDefinition[];
  onAnimationFramesChange: (characterId: string, animationKey: string, frames: string[]) => void;
  onAnimationSpeedChange: (characterId: string, animationKey: string, speed: number) => void;
  onMoveOverrideChange: (characterId: string, moveKey: string, override: MoveOverride) => void;
  onBack: () => void;
}) {
  const [activeId, setActiveId] = useState(roster[0]?.id ?? '');
  const [selectedAnimationKey, setSelectedAnimationKey] = useState(animationSlots[0].key);
  const [slotCategory, setSlotCategory] = useState<AnimationSlot['category'] | 'all'>('stance');
  const [slotSearch, setSlotSearch] = useState('');
  const [rotationTurn, setRotationTurn] = useState(0);
  const [zoom, setZoom] = useState(0.28);
  const [isEditingAnimation, setIsEditingAnimation] = useState(false);
  const [manifestSaveStatus, setManifestSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const active = roster.find((character) => character.id === activeId) ?? roster[0];
  const sourceActive = sourceRoster.find((character) => character.id === active.id) ?? active;
  const selectedSlot = animationSlots.find((slot) => slot.key === selectedAnimationKey) ?? animationSlots[0];
  const frameCount =
    active.spriteFrameCount ??
    Math.max(0, ...Object.values(active.animationFrames ?? {}).flat().map(getFrameIndex)) + 1;
  const frameBank = useMemo(
    () => Array.from({ length: frameCount }, (_, index) => framePath(active, index)),
    [active, frameCount]
  );
  const selectedFrames = active.animationFrames?.[selectedSlot.key] ?? [];
  const defaultFrames = sourceActive.animationFrames?.[selectedSlot.key] ?? selectedFrames;
  const selectedSpeed = active.animationFrameRates?.[selectedSlot.key] ?? active.animationFps ?? 8;
  const defaultSpeed = sourceActive.animationFrameRates?.[selectedSlot.key] ?? sourceActive.animationFps ?? active.animationFps ?? 8;
  const selectedFrameSet = new Set(selectedFrames);
  const selectedMove = resolveSlotMove(active, selectedSlot);
  const selectedMoveOverride = active.moveOverrides?.[selectedSlot.key] ?? {};
  const visibleSlots = animationSlots.filter((slot) => {
    const categoryMatches = slotCategory === 'all' || slot.category === slotCategory;
    const search = slotSearch.trim().toLowerCase();
    const searchMatches = !search || slot.label.toLowerCase().includes(search) || slot.command?.toLowerCase().includes(search);
    return categoryMatches && searchMatches;
  });

  useEffect(() => {
    debugLog(6, 'viewer active character and slot', {
      activeId: active.id,
      displayName: active.displayName,
      selectedAnimationKey,
      selectedSlotLabel: selectedSlot.label
    });
    debugLog(7, 'viewer effective animation selection', {
      characterId: active.id,
      animationKey: selectedSlot.key,
      effectiveFrames: selectedFrames.map(getFrameIndex),
      defaultFrames: defaultFrames.map(getFrameIndex),
      effectiveFps: selectedSpeed,
      defaultFps: defaultSpeed
    });
  }, [active.id, active.displayName, defaultFrames, defaultSpeed, selectedAnimationKey, selectedFrames, selectedSlot.key, selectedSlot.label, selectedSpeed]);

  const updateSelectedFrames = (frames: string[]) => {
    if (frames.length === 0) return;
    onAnimationFramesChange(active.id, selectedSlot.key, frames);
  };

  const updateSelectedSpeed = (speed: number) => {
    if (!Number.isFinite(speed)) return;
    const normalized = Math.max(1, Math.min(24, Number(speed.toFixed(1))));
    onAnimationSpeedChange(active.id, selectedSlot.key, normalized);
  };

  const resetSelectedAnimation = () => {
    updateSelectedFrames(defaultFrames);
    updateSelectedSpeed(defaultSpeed);
  };

  const updateSelectedMoveOverride = (patch: MoveOverride) => {
    if (!selectedMove) return;
    onMoveOverrideChange(active.id, selectedSlot.key, {
      ...selectedMoveOverride,
      ...patch
    });
  };

  const saveActiveManifest = async () => {
    setManifestSaveStatus('saving');
    try {
      const response = await fetch('/__kore/dev/save-character-manifest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: active.id,
          animationFrames: active.animationFrames ?? {},
          animationFrameRates: active.animationFrameRates ?? {},
          moveOverrides: active.moveOverrides ?? {}
        })
      });
      if (!response.ok) throw new Error(await response.text());
      setManifestSaveStatus('saved');
      window.setTimeout(() => setManifestSaveStatus('idle'), 1800);
    } catch (error) {
      console.error('Failed to save character manifest', error);
      setManifestSaveStatus('error');
    }
  };

  const toggleFrame = (path: string) => {
    if (selectedFrameSet.has(path)) {
      if (selectedFrames.length <= 1) return;
      updateSelectedFrames(selectedFrames.filter((frame) => frame !== path));
      return;
    }
    updateSelectedFrames([...selectedFrames, path]);
  };

  return (
    <div className="viewer-screen">
      <header className="section-header">
        <span>Character Select</span>
        <h2>Characters</h2>
      </header>
      <div className="viewer-layout">
        <div className="roster-list compact loader-bar">
          {roster.map((character) => (
            <button
              key={character.id}
              className={`fighter-card viewer-character-card ${active.id === character.id ? 'is-selected' : ''}`}
              style={{ '--fighter-color': character.colors.primary } as CSSProperties}
              onClick={() => setActiveId(character.id)}
              aria-label={character.displayName}
              title={character.displayName}
            >
              <img src={characterPortraitPath(character)} alt="" />
            </button>
          ))}
        </div>
        <article className="model-viewer-panel">
          <div className="model-viewer-stage">
            <CharacterPreviewCanvas character={active} pose={selectedSlot.pose} animationKey={selectedSlot.key} rotationTurn={rotationTurn} zoom={zoom} />
          </div>
          <div className="viewer-actions">
            <div className="viewer-action-row">
              <button className="secondary-button" onClick={() => setRotationTurn((value) => value + 1)}>
                <Rotate3D size={18} />
                Rotate
              </button>
              <button
                className={`secondary-button ${isEditingAnimation ? 'active-tool' : ''}`}
                onClick={() => setIsEditingAnimation((current) => !current)}
                data-testid="toggle-animation-editor"
              >
                <Settings size={18} />
                {isEditingAnimation ? 'Browse Moves' : 'Edit Selected'}
              </button>
              <div className="zoom-controls" aria-label="Model zoom controls">
                <button aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0, value - 0.18))} data-testid="viewer-zoom-out">
                  <ZoomOut size={18} />
                </button>
                <input
                  aria-label="Zoom level"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  data-testid="viewer-zoom-slider"
                />
                <button aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1, value + 0.18))} data-testid="viewer-zoom-in">
                  <ZoomIn size={18} />
                </button>
              </div>
              <span>Drag to rotate. Scroll or pinch to zoom.</span>
            </div>
            <div className="viewer-action-row editor-control-row">
              <div className="editing-title">
                <span>{isEditingAnimation ? 'Editing' : 'Selected'}</span>
                <strong>
                  <NotationGroup tokens={selectedSlot.notation} />
                  {selectedSlot.label}
                </strong>
                <small>{formatFrameSummary(selectedMove)}</small>
              </div>
              {isEditingAnimation && (
                <div className="frame-picker-actions">
                  <label className="speed-control">
                    <span>FPS</span>
                    <input
                      aria-label={`${selectedSlot.label} animation speed`}
                      type="range"
                      min="1"
                      max="24"
                      step="0.5"
                      value={selectedSpeed}
                      onChange={(event) => updateSelectedSpeed(Number(event.target.value))}
                      data-testid="animation-speed-slider"
                    />
                    <input
                      aria-label={`${selectedSlot.label} animation speed value`}
                      type="number"
                      min="1"
                      max="24"
                      step="0.5"
                      value={selectedSpeed}
                      onChange={(event) => updateSelectedSpeed(Number(event.target.value))}
                      data-testid="animation-speed-input"
                    />
                  </label>
                  <button className="secondary-button compact-button" onClick={() => updateSelectedFrames([...selectedFrames].reverse())}>
                    Reverse
                  </button>
                  <button className="secondary-button compact-button" onClick={resetSelectedAnimation}>
                    Reset
                  </button>
                  {isLocalDevHost() && (
                    <>
                      <button
                        className="secondary-button compact-button dev-save-button"
                        onClick={saveActiveManifest}
                        disabled={manifestSaveStatus === 'saving'}
                        data-testid="save-character-manifest"
                      >
                        <Save size={14} />
                        {manifestSaveStatus === 'saving' ? 'Saving' : 'Save JSON'}
                      </button>
                      {manifestSaveStatus !== 'idle' && (
                        <span className={`manifest-save-status is-${manifestSaveStatus}`}>
                          {manifestSaveStatus === 'saved' ? 'Saved to manifest' : manifestSaveStatus === 'error' ? 'Save failed' : 'Writing'}
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          {isEditingAnimation ? (
            <section className="frame-picker inline-frame-editor" aria-label="Animation frame picker">
              {selectedMove && (
                <FrameDataEditor move={selectedMove} onChange={updateSelectedMoveOverride} />
              )}
              {active.spriteSheetPath && (
                <div className="sprite-sheet-stage">
                  <span>{active.spriteSheetPath}</span>
                  <img className="sprite-sheet-preview" src={active.spriteSheetPath} alt={`${active.displayName} sprite sheet`} />
                </div>
              )}
              <div className="selected-frame-strip" aria-label="Selected frames">
                {selectedFrames.map((frame, index) => (
                  <button key={`${frame}-${index}`} onClick={() => toggleFrame(frame)} title={`Remove frame ${getFrameIndex(frame)}`}>
                    <img src={frame} alt={`Selected frame ${getFrameIndex(frame)}`} />
                    <span>{getFrameIndex(frame)}</span>
                  </button>
                ))}
              </div>
              <div className="frame-bank" aria-label="All extracted frames">
                {frameBank.map((frame) => (
                  <button
                    key={frame}
                    className={selectedFrameSet.has(frame) ? 'active' : ''}
                    onClick={() => toggleFrame(frame)}
                    title={`Frame ${getFrameIndex(frame)}`}
                  >
                    <img src={frame} alt={`Frame ${getFrameIndex(frame)}`} loading="lazy" />
                    <span>{getFrameIndex(frame)}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <div className={`animation-grid ${slotCategory === 'stance' ? 'is-stance-grid' : 'is-command-grid'}`} aria-label="Animation previews">
              <div className="command-toolbar">
                <CommandCategorySelect value={slotCategory} onChange={setSlotCategory} />
                <input
                  aria-label="Search move slots"
                  placeholder="Search notation"
                  value={slotSearch}
                  onChange={(event) => setSlotSearch(event.target.value)}
                />
              </div>
              {visibleSlots.map((option) => (
                <button
                  key={option.key}
                  className={selectedSlot.key === option.key ? 'active' : ''}
                  onClick={() => setSelectedAnimationKey(option.key)}
                  title={option.label}
                  data-testid={`viewer-pose-${option.key}`}
                >
                  <NotationGroup tokens={option.notation} />
                  {option.label}
                  <small>{formatFrameSummary(resolveSlotMove(active, option))}</small>
                </button>
              ))}
            </div>
          )}
        </article>
      </div>
      <button className="secondary-button" onClick={onBack}>
        <Home size={18} />
        Back
      </button>
    </div>
  );
}

function FrameDataEditor({ move, onChange }: { move: MoveDefinition; onChange: (patch: MoveOverride) => void }) {
  const updateNumber = (key: keyof MoveOverride, value: string, min = Number.NEGATIVE_INFINITY) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    onChange({ [key]: Math.max(min, numeric) } as MoveOverride);
  };

  return (
    <section className="frame-data-editor" aria-label="Frame data editor">
      <header>
        <span>Frame Data</span>
        <strong>{`i${move.startupFrames} / ${signedFrame(move.onBlockFrames)} / ${move.knockdown ? 'KD' : move.launchHeight ? 'Launch' : signedFrame(move.onHitFrames)}`}</strong>
        <small>{move.startupFrames + move.activeFrames + move.recoveryFrames} total frames</small>
      </header>
      <div className="frame-data-grid">
        <FrameNumberInput label="Startup" value={move.startupFrames} min={1} onChange={(value) => updateNumber('startupFrames', value, 1)} />
        <FrameNumberInput label="Active" value={move.activeFrames} min={1} onChange={(value) => updateNumber('activeFrames', value, 1)} />
        <FrameNumberInput label="Recovery" value={move.recoveryFrames} min={1} onChange={(value) => updateNumber('recoveryFrames', value, 1)} />
        <FrameNumberInput label="On Block" value={move.onBlockFrames} onChange={(value) => updateNumber('onBlockFrames', value)} />
        <FrameNumberInput label="On Hit" value={move.onHitFrames} onChange={(value) => updateNumber('onHitFrames', value)} />
        <FrameNumberInput label="Counter Hit" value={move.onCounterHitFrames} onChange={(value) => updateNumber('onCounterHitFrames', value)} />
        <FrameNumberInput label="Damage" value={move.damage} min={1} onChange={(value) => updateNumber('damage', value, 1)} />
        <FrameNumberInput label="Block Dmg" value={move.blockDamage} min={0} onChange={(value) => updateNumber('blockDamage', value, 0)} />
        <label>
          <span>Hit Level</span>
          <select value={move.hitLevel} onChange={(event) => onChange({ hitLevel: event.target.value as HitLevel })}>
            {hitLevelOptions.map((option) => (
              <option key={option} value={option}>{capitalize(option)}</option>
            ))}
          </select>
        </label>
        <FrameNumberInput label="Range" value={move.range} min={0.1} step={0.05} onChange={(value) => updateNumber('range', value, 0.1)} />
        <FrameNumberInput label="Pushback" value={move.pushback} min={0} step={0.05} onChange={(value) => updateNumber('pushback', value, 0)} />
        <FrameNumberInput label="Block Push" value={move.blockPushback} min={0} step={0.05} onChange={(value) => updateNumber('blockPushback', value, 0)} />
        <label>
          <span>Tracking</span>
          <select value={move.tracking} onChange={(event) => onChange({ tracking: event.target.value as MoveTracking })}>
            {trackingOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <FrameNumberInput label="Launch" value={move.launchHeight ?? 0} min={0} step={0.1} onChange={(value) => updateNumber('launchHeight', value, 0)} />
        <label className="frame-toggle">
          <span>Knockdown</span>
          <input type="checkbox" checked={move.knockdown} onChange={(event) => onChange({ knockdown: event.target.checked })} />
        </label>
      </div>
    </section>
  );
}

function FrameNumberInput({
  label,
  value,
  min,
  step = 1,
  onChange
}: {
  label: string;
  value: number;
  min?: number;
  step?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input type="number" value={Number(value.toFixed(step < 1 ? 2 : 0))} min={min} step={step} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function CommandCategorySelect({
  value,
  onChange
}: {
  value: AnimationSlot['category'] | 'all';
  onChange: (value: AnimationSlot['category'] | 'all') => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = slotCategoryOptions.find((option) => option.value === value) ?? slotCategoryOptions[0];

  return (
    <div className={`custom-select ${open ? 'is-open' : ''}`} onBlur={(event) => {
      const nextTarget = event.relatedTarget;
      if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setOpen(false);
    }}>
      <button
        type="button"
        className="custom-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Move slot category"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected.label}</span>
        <ChevronDown size={18} />
      </button>
      {open && (
        <div className="custom-select-menu" role="listbox" aria-label="Move slot category options" tabIndex={-1}>
          {slotCategoryOptions.map((option) => (
            <button
              type="button"
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? 'is-selected' : ''}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NotationGroup({ tokens }: { tokens: NotationToken[] }) {
  return (
    <span className="notation-group" aria-hidden="true">
      {tokens.map((token, index) => (
        <span key={`${token}-${index}`} className={`notation-token token-${safeClassToken(token)}`}>
          {notationLabel(token)}
        </span>
      ))}
    </span>
  );
}

function notationLabel(token: NotationToken) {
  const labels: Record<string, string> = {
    N: 'N',
    n: 'N',
    f: '→',
    F: '→*',
    b: '←',
    B: '←*',
    u: '↑',
    U: '↑*',
    d: '↓',
    D: '↓*',
    'u/b': '↖',
    'u/f': '↗',
    'd/b': '↙',
    'd/f': '↘',
    'U/B': '↖*',
    'U/F': '↗*',
    'D/B': '↙*',
    'D/F': '↘*',
    'f,f': '→→',
    'b,b': '←←',
    '↑↑': '↑↑',
    '↓↓': '↓↓',
    '1': '1',
    '2': '2',
    '3': '3',
    '4': '4',
    HIT: 'HIT',
    KD: 'KD',
    '+': '+',
    ',': ',',
    '~': '~',
    '<': '<',
    ':': ':',
    '_': '_',
    '*': '*',
    win: 'WIN',
    WIN: 'WIN',
    lose: 'LOSE',
    LOSE: 'LOSE'
  };
  return labels[token] ?? token;
}

function safeClassToken(token: string) {
  return token.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'symbol';
}

function FightScreen({
  p1,
  p2,
  stage,
  mode,
  cpuDifficulty,
  settings,
  readInputs,
  setVirtualAction,
  clearMenuInputs,
  getLastInput,
  onMenu,
  onCharacterSelect
}: {
  p1: CharacterDefinition;
  p2: CharacterDefinition;
  stage: StageDefinition;
  mode: MatchMode;
  cpuDifficulty: CpuDifficulty;
  settings: GameSettings;
  readInputs: () => [InputFrame, InputFrame];
  setVirtualAction: (player: 1 | 2, action: ActionName, pressed: boolean) => void;
  clearMenuInputs: () => void;
  getLastInput: () => string;
  onMenu: () => void;
  onCharacterSelect: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const matchOptions = useMemo(
    () => ({
      roundTime: settings.game.roundTimer,
      trainingInfiniteHealth: settings.game.trainingInfiniteHealth
    }),
    [settings.game.roundTimer, settings.game.trainingInfiniteHealth]
  );
  const [match, setMatch] = useState<MatchSnapshot>(() => createMatch(p1, p2, stage, mode, cpuDifficulty, matchOptions));
  const matchRef = useRef(match);
  const pauseLatch = useRef(false);
  const frameInputRef = useRef('none');
  const screenRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    matchRef.current = match;
  }, [match]);

  useEffect(() => {
    screenRef.current?.focus();
  }, []);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    let accumulator = 0;
    const fixedStep = 1 / 60;

    const tick = (now: number) => {
      const delta = Math.min(0.2, (now - previous) / 1000);
      previous = now;
      const [p1Input, p2Input] = readInputs();
      frameInputRef.current =
        p1Input.right ? 'p1:right' :
        p1Input.left ? 'p1:left' :
        p1Input.up ? 'p1:up' :
        p1Input.down ? 'p1:down' :
        p1Input.sidestepUp ? 'p1:sidestepUp' :
        p1Input.sidestepDown ? 'p1:sidestepDown' :
        p1Input.sidewalkUp ? 'p1:sidewalkUp' :
        p1Input.sidewalkDown ? 'p1:sidewalkDown' :
        p1Input.jab ? 'p1:jab' :
        p1Input.kick ? 'p1:kick' :
        p1Input.heavy ? 'p1:heavy' :
        p1Input.special ? 'p1:special' :
        p2Input.right ? 'p2:right' :
        p2Input.left ? 'p2:left' :
        p2Input.up ? 'p2:up' :
        p2Input.down ? 'p2:down' :
        p2Input.sidestepUp ? 'p2:sidestepUp' :
        p2Input.sidestepDown ? 'p2:sidestepDown' :
        p2Input.sidewalkUp ? 'p2:sidewalkUp' :
        p2Input.sidewalkDown ? 'p2:sidewalkDown' :
        p2Input.jab ? 'p2:jab' :
        'none';
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

  const reset = () => {
    const fresh = createMatch(p1, p2, stage, mode, cpuDifficulty, matchOptions);
    matchRef.current = fresh;
    setMatch(fresh);
    setPaused(false);
  };

  const handleSurfaceKey = (event: ReactKeyboardEvent<HTMLDivElement>, pressed: boolean) => {
    if (event.defaultPrevented) return;
    const binding = getSurfaceKeyBinding(event.nativeEvent, mode, settings.controls);
    if (!binding) return;
    setVirtualAction(binding.player, binding.action, pressed);
    event.preventDefault();
  };

  return (
    <div
      className="fight-screen"
      ref={screenRef}
      tabIndex={-1}
      onPointerDown={() => screenRef.current?.focus()}
      onKeyDown={(event) => handleSurfaceKey(event, true)}
      onKeyUp={(event) => handleSurfaceKey(event, false)}
    >
      <GameScene match={match} cameraSettings={settings.camera} />
      <FightHud match={match} hudScale={settings.display.hudScale} />
      {settings.display.debugOverlay && <FightDebug match={match} paused={paused} lastInput={getLastInput()} frameInput={frameInputRef.current} />}
      {settings.display.touchControls !== 'off' && <TouchControls onAction={setVirtualAction} forceVisible={settings.display.touchControls === 'on'} />}
      {match.message && <div className="match-message">{match.message}</div>}
      {paused && (
        <div className="pause-overlay">
          <Pause size={32} />
          <h2>Paused</h2>
          <ConfiguredMoveList characters={[p1, p2]} />
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

function ConfiguredMoveList({ characters }: { characters: [CharacterDefinition, CharacterDefinition] }) {
  return (
    <div className="pause-movelist">
      {characters.map((character, index) => {
        const configured = animationSlots.filter((slot) => slot.command && (character.animationFrames?.[slot.key]?.length ?? 0) > 0);
        return (
          <section key={character.id}>
            <h3>{index === 0 ? 'P1' : 'P2'} {character.displayName}</h3>
            {configured.length === 0 ? (
              <p>No custom commands configured.</p>
            ) : (
              <div>
                {configured.slice(0, 36).map((slot) => (
                  <span key={slot.key}>
                    <NotationGroup tokens={slot.notation} />
                    {slot.label}
                    <small>{formatFrameSummary(resolveSlotMove(character, slot))}</small>
                  </span>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function getSurfaceKeyBinding(event: KeyboardEvent, mode: MatchMode, controls: GameSettings['controls']): { player: 1 | 2; action: ActionName } | null {
  return getKeyboardBindingsForEvent(event, mode, controls)[0] ?? null;
}

function FightDebug({
  match,
  paused,
  lastInput,
  frameInput
}: {
  match: MatchSnapshot;
  paused: boolean;
  lastInput: string;
  frameInput: string;
}) {
  const [p1, p2] = match.fighters;
  return (
    <div className="fight-debug" aria-hidden="true">
      <span data-testid="match-phase">{paused ? 'paused' : match.phase}</span>
      <span data-testid="match-mode">{match.mode}</span>
      <span data-testid="cpu-difficulty">{match.cpuDifficulty}</span>
      <span data-testid="match-timer">{match.timer.toFixed(2)}</span>
      <span data-testid="p1-position">{`${p1.position.x.toFixed(3)},${p1.position.z.toFixed(3)}`}</span>
      <span data-testid="p2-position">{`${p2.position.x.toFixed(3)},${p2.position.z.toFixed(3)}`}</span>
      <span data-testid="p1-height">{p1.position.y.toFixed(3)}</span>
      <span data-testid="p2-height">{p2.position.y.toFixed(3)}</span>
      <span data-testid="p1-state">{p1.state}</span>
      <span data-testid="p2-state">{p2.state}</span>
      <span data-testid="p2-hp">{p2.hp.toFixed(0)}</span>
      <span data-testid="last-input">{lastInput}</span>
      <span data-testid="frame-input">{frameInput}</span>
    </div>
  );
}

function FightHud({ match, hudScale }: { match: MatchSnapshot; hudScale: number }) {
  const [p1, p2] = match.fighters;
  return (
    <div className="fight-hud" style={{ '--hud-scale': hudScale } as CSSProperties}>
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

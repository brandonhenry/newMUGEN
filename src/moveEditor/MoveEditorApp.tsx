import { AlertCircle, CheckCircle2, Loader2, Save, Search, Swords } from 'lucide-react';
import { type ChangeEvent, type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { CharacterPreviewCanvas } from '../components/GameScene';
import { loadCharacterRoster } from '../lib/characterLoader';
import {
  formatFrameSummary,
  formatMoveSlotLabel,
  getConfiguredAttackRows,
  getFrameIndex,
  hitLevelOptions,
  isLocalDevHost,
  saveCharacterManifestToDev,
  sanitizeMoveOverride,
  signedFrame,
  trackingOptions,
  type MoveEditorRow
} from '../lib/moveEditorShared';
import type { CharacterDefinition, MoveDefinition, MoveOverride } from '../types';

type SaveStatus = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';
type StatusMap = Record<string, SaveStatus>;

const saveDebounceMs = 700;

export function MoveEditorApp() {
  const [characters, setCharacters] = useState<CharacterDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [statuses, setStatuses] = useState<StatusMap>({});
  const localDev = isLocalDevHost();
  const timersRef = useRef<Record<string, number>>({});
  const pendingCharactersRef = useRef<Record<string, CharacterDefinition>>({});
  const charactersRef = useRef<CharacterDefinition[]>([]);

  useEffect(() => {
    charactersRef.current = characters;
  }, [characters]);

  useEffect(() => {
    let mounted = true;
    void loadCharacterRoster()
      .then((result) => {
        if (!mounted) return;
        const playable = result.characters.filter((character) => !character.unplayable);
        setCharacters(playable);
        setStatuses(Object.fromEntries(playable.map((character) => [character.id, 'clean'])));
        setLoading(false);
      })
      .catch((error) => {
        if (!mounted) return;
        setLoadError(error instanceof Error ? error.message : 'Failed to load roster');
        setLoading(false);
      });
    return () => {
      mounted = false;
      Object.values(timersRef.current).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const characterRows = useMemo(
    () => characters.map((character) => ({
      character,
      rows: getConfiguredAttackRows(character)
    })),
    [characters]
  );
  const filteredCharacterRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return characterRows;
    return characterRows
      .map(({ character, rows }) => ({
        character,
        rows: rows.filter((row) => {
          const label = formatMoveSlotLabel(row.slot, row.move).toLowerCase();
          return (
            character.displayName.toLowerCase().includes(needle) ||
            row.animationKey.toLowerCase().includes(needle) ||
            label.includes(needle) ||
            row.slot.notation.join(' ').toLowerCase().includes(needle)
          );
        })
      }))
      .filter(({ character, rows }) => character.displayName.toLowerCase().includes(needle) || rows.length > 0);
  }, [characterRows, query]);

  const totalMoveRows = characterRows.reduce((sum, entry) => sum + entry.rows.length, 0);

  const queueSave = (character: CharacterDefinition) => {
    pendingCharactersRef.current[character.id] = character;
    setStatuses((current) => ({ ...current, [character.id]: localDev ? 'dirty' : 'error' }));
    if (!localDev) return;
    const existing = timersRef.current[character.id];
    if (existing) window.clearTimeout(existing);
    timersRef.current[character.id] = window.setTimeout(() => {
      void saveCharacter(character.id);
    }, saveDebounceMs);
  };

  const saveCharacter = async (characterId: string) => {
    const character =
      pendingCharactersRef.current[characterId] ??
      charactersRef.current.find((candidate) => candidate.id === characterId);
    if (!character || !localDev) return;
    setStatuses((current) => ({ ...current, [characterId]: 'saving' }));
    try {
      await saveCharacterManifestToDev(character);
      delete pendingCharactersRef.current[characterId];
      setStatuses((current) => ({ ...current, [characterId]: 'saved' }));
      window.setTimeout(() => {
        setStatuses((current) => current[characterId] === 'saved' ? { ...current, [characterId]: 'clean' } : current);
      }, 1800);
    } catch (error) {
      console.error('Failed to save move editor character', error);
      setStatuses((current) => ({ ...current, [characterId]: 'error' }));
    }
  };

  const patchMove = (characterId: string, moveKey: string, patch: MoveOverride) => {
    setCharacters((current) => {
      let nextCharacter: CharacterDefinition | null = null;
      const next = current.map((character) => {
        if (character.id !== characterId) return character;
        const currentOverride = character.moveOverrides?.[moveKey] ?? {};
        nextCharacter = {
          ...character,
          moveOverrides: {
            ...(character.moveOverrides ?? {}),
            [moveKey]: sanitizeMoveOverride({ ...currentOverride, ...patch })
          }
        };
        return nextCharacter;
      });
      if (nextCharacter) queueSave(nextCharacter);
      return next;
    });
  };

  if (loading) {
    return (
      <main className="move-editor-page is-loading">
        <Loader2 className="move-editor-spin" size={24} />
        <strong>Loading roster</strong>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="move-editor-page is-loading">
        <AlertCircle size={24} />
        <strong>{loadError}</strong>
      </main>
    );
  }

  return (
    <main className="move-editor-page" data-testid="move-editor-page">
      <header className="move-editor-topbar">
        <div className="move-editor-title">
          <span>Local Dev Tool</span>
          <h1>KORE Move Editor</h1>
          <small>{characters.length} playable characters / {totalMoveRows} configured moves</small>
        </div>
        <label className="move-editor-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search character, command, or move"
            aria-label="Search moves"
          />
        </label>
      </header>

      <nav className="move-editor-tabs" aria-label="Characters">
        {characterRows.map(({ character, rows }) => (
          <a key={character.id} href={`#move-editor-${character.id}`} style={{ '--fighter-color': character.colors.primary } as CSSProperties}>
            <span>{character.displayName}</span>
            <small>{rows.length}</small>
          </a>
        ))}
      </nav>

      {!localDev && (
        <section className="move-editor-warning">
          <AlertCircle size={18} />
          <strong>Autosave is disabled outside localhost.</strong>
        </section>
      )}

      <div className="move-editor-roster">
        {filteredCharacterRows.map(({ character, rows }) => (
          <CharacterMoveSection
            key={character.id}
            character={character}
            rows={rows}
            status={statuses[character.id] ?? 'clean'}
            onSaveNow={() => void saveCharacter(character.id)}
            onPatchMove={(moveKey, patch) => patchMove(character.id, moveKey, patch)}
          />
        ))}
      </div>
    </main>
  );
}

function CharacterMoveSection({
  character,
  rows,
  status,
  onSaveNow,
  onPatchMove
}: {
  character: CharacterDefinition;
  rows: MoveEditorRow[];
  status: SaveStatus;
  onSaveNow: () => void;
  onPatchMove: (moveKey: string, patch: MoveOverride) => void;
}) {
  return (
    <section className="move-character-section" id={`move-editor-${character.id}`} data-testid="move-editor-character">
      <header className="move-character-header" style={{ '--fighter-color': character.colors.primary } as CSSProperties}>
        <div>
          <span>{character.id}</span>
          <h2>{character.displayName}</h2>
          <small>{rows.length} configured attack moves</small>
        </div>
        <div className="move-character-actions">
          <StatusBadge status={status} />
          <button type="button" className="move-icon-button" onClick={onSaveNow} aria-label={`Save ${character.displayName}`}>
            <Save size={16} />
          </button>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="move-empty-state">No configured attack moves found.</p>
      ) : (
        <div className="move-row-list">
          {rows.map((row) => (
            <MoveEditorRowView
              key={`${character.id}:${row.animationKey}`}
              character={character}
              row={row}
              onPatch={(patch) => onPatchMove(row.animationKey, patch)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: SaveStatus }) {
  const icon = status === 'saving'
    ? <Loader2 className="move-editor-spin" size={14} />
    : status === 'error'
      ? <AlertCircle size={14} />
      : status === 'saved'
        ? <CheckCircle2 size={14} />
        : null;
  return (
    <span className={`move-status is-${status}`} data-testid="move-editor-save-status">
      {icon}
      {status}
    </span>
  );
}

function MoveEditorRowView({
  character,
  row,
  onPatch
}: {
  character: CharacterDefinition;
  row: MoveEditorRow;
  onPatch: (patch: MoveOverride) => void;
}) {
  const move = row.move;
  const summary = formatFrameSummary(move);
  const properties = [
    move.hitLevel,
    move.tracking,
    move.tornado ? 'tornado' : null,
    (move.launchHeight ?? 0) > 0 ? 'launcher' : null,
    move.knockdown ? 'knockdown' : null,
    move.throwCapture ? 'throw' : null,
    move.counterHit ? 'counter hit' : null,
    move.endsInCrouch ? 'crouch end' : null
  ].filter(Boolean);

  return (
    <article className="move-editor-row" data-testid="move-editor-row">
      <div className="move-preview-cell">
        <LazyMovePreview character={character} row={row} />
      </div>
      <div className="move-info-cell">
        <div className="move-command-line">
          <div className="move-notation">
            {row.slot.notation.map((token, index) => (
              <span key={`${token}-${index}`}>{token}</span>
            ))}
          </div>
          <small>{row.animationKey}</small>
        </div>
        <label className="move-text-field">
          <span>Name</span>
          <input
            value={move.label}
            onChange={(event) => onPatch({ label: event.target.value })}
            data-testid="move-editor-label-input"
          />
        </label>
        <label className="move-text-field">
          <span>Description</span>
          <textarea
            value={move.description ?? ''}
            onChange={(event) => onPatch({ description: event.target.value })}
            rows={3}
            data-testid="move-editor-description-input"
          />
        </label>
        <div className="move-property-strip">
          {properties.map((property) => <span key={property}>{property}</span>)}
        </div>
        <small className="move-summary-line">{summary}</small>
      </div>
      <MoveControls move={move} onPatch={onPatch} />
    </article>
  );
}

function LazyMovePreview({ character, row }: { character: CharacterDefinition; row: MoveEditorRow }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const previewFrame = useLoopingPreviewFrame(
    Math.max(1, row.move.startupFrames + row.move.activeFrames + row.move.recoveryFrames),
    visible
  );

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { rootMargin: '900px 0px 900px 0px', threshold: 0.01 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="move-preview-frame" data-testid="move-editor-preview">
      {visible ? (
        <CharacterPreviewCanvas
          character={character}
          pose={row.slot.pose}
          animationKey={row.animationKey}
          previewMove={{ ...row.move, animationKey: row.animationKey }}
          previewEffects={character.effects ?? []}
          previewEffectInstances={character.moveEffects?.[row.animationKey] ?? []}
          previewEffectFrame={previewFrame}
          rotationTurn={0}
          zoom={0.26}
          preserveCameraFrame
        />
      ) : (
        <div className="move-preview-placeholder">
          <Swords size={22} />
          <span>{row.frames.length} frames</span>
          <small>{row.frameRate} FPS / {row.durationFrames}f</small>
        </div>
      )}
    </div>
  );
}

function useLoopingPreviewFrame(totalFrames: number, enabled: boolean) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setFrame(0);
      return undefined;
    }
    let animationFrame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const nextFrame = Math.floor(((now - startedAt) / 1000) * 60) % Math.max(1, totalFrames);
      setFrame((current) => current === nextFrame ? current : nextFrame);
      animationFrame = window.requestAnimationFrame(tick);
    };
    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [enabled, totalFrames]);

  return frame;
}

function MoveControls({ move, onPatch }: { move: MoveDefinition; onPatch: (patch: MoveOverride) => void }) {
  const totalFrames = move.startupFrames + move.activeFrames + move.recoveryFrames;
  const launchVelocity = move.launchVelocity ?? defaultLaunchVelocity(move.launchHeight ?? 0);
  const juggleRefloatVelocity = move.juggleRefloatVelocity ?? defaultJuggleRefloatVelocity(move.launchHeight ?? 0);
  const juggleGravityScale = move.juggleGravityScale ?? 0.52;
  const usesKi = Boolean(move.usesKi || move.kiBurst || move.healsHp);
  const healsHp = Boolean(move.healsHp);
  return (
    <div className="move-controls-cell">
      <div className="move-control-summary">
        <strong>i{move.startupFrames} / {signedFrame(move.onBlockFrames)} / {move.damage} dmg</strong>
        <span>{totalFrames} total</span>
      </div>
      <div className="move-control-grid">
        <NumberField label="Startup" value={move.startupFrames} min={1} onChange={(value) => onPatch({ startupFrames: value })} />
        <NumberField label="Active" value={move.activeFrames} min={1} onChange={(value) => onPatch({ activeFrames: value })} />
        <NumberField label="Recovery" value={move.recoveryFrames} min={1} onChange={(value) => onPatch({ recoveryFrames: value })} />
        <NumberField label="Damage" value={move.damage} min={1} onChange={(value) => onPatch({ damage: value })} testId="move-editor-damage-input" />
        <NumberField label="Block Dmg" value={move.blockDamage} min={0} onChange={(value) => onPatch({ blockDamage: value })} />
        <NumberField label="On Block" value={move.onBlockFrames} onChange={(value) => onPatch({ onBlockFrames: value })} />
        <NumberField label="On Hit" value={move.onHitFrames} onChange={(value) => onPatch({ onHitFrames: value })} />
        <NumberField label="Counter Hit" value={move.onCounterHitFrames} onChange={(value) => onPatch({ onCounterHitFrames: value })} />
        <NumberField label="CH Bonus" value={move.counterHitStunBonusFrames ?? 0} min={0} onChange={(value) => onPatch({ counterHitStunBonusFrames: value })} />
        <NumberField label="Whiff Rec" value={move.whiffRecoveryFrames ?? move.recoveryFrames} min={0} onChange={(value) => onPatch({ whiffRecoveryFrames: value })} />
        <SelectField label="Hit Level" value={move.hitLevel} options={hitLevelOptions} onChange={(value) => onPatch({ hitLevel: value })} />
        <SelectField label="Tracking" value={move.tracking} options={trackingOptions} onChange={(value) => onPatch({ tracking: value })} testId="move-editor-tracking-select" />
        <NumberField label="Range" value={move.range} min={0.1} step={0.05} onChange={(value) => onPatch({ range: value })} />
        <NumberField label="Forward" value={move.forwardForce ?? 0} step={0.05} onChange={(value) => onPatch({ forwardForce: value })} />
        <NumberField label="Force Start" value={move.forwardForceStartFrame ?? 1} min={1} onChange={(value) => onPatch({ forwardForceStartFrame: value })} />
        <NumberField label="Force End" value={move.forwardForceEndFrame ?? totalFrames} min={1} onChange={(value) => onPatch({ forwardForceEndFrame: value })} />
        <NumberField label="Push" value={move.pushback} min={0} step={0.05} onChange={(value) => onPatch({ pushback: value })} />
        <NumberField label="Block Push" value={move.blockPushback} min={0} step={0.05} onChange={(value) => onPatch({ blockPushback: value })} />
        <NumberField label="Jump Force" value={move.moveJumpForce ?? 8} min={1} step={0.1} onChange={(value) => onPatch({ moveJumpForce: value })} />
        <NumberField label="Jump Grav" value={move.moveJumpGravity ?? 18} min={1} step={0.1} onChange={(value) => onPatch({ moveJumpGravity: value })} />
        <NumberField label="Launch" value={move.launchHeight ?? 0} min={0} step={0.1} onChange={(value) => onPatch({ launchHeight: value })} />
        <NumberField label="Launch Pop" value={launchVelocity} min={3.2} step={0.05} onChange={(value) => onPatch({ launchVelocity: value })} />
        <NumberField label="Re-float" value={juggleRefloatVelocity} min={2.2} step={0.05} onChange={(value) => onPatch({ juggleRefloatVelocity: value })} />
        <NumberField label="Fall Speed" value={juggleGravityScale} min={0.28} step={0.01} onChange={(value) => onPatch({ juggleGravityScale: value })} />
        <NumberField label="Homing" value={move.homingSpeed ?? 8} min={0} step={0.1} onChange={(value) => onPatch({ homingSpeed: value })} />
        <NumberField label="Ki Cost" value={move.kiCost ?? 35} min={0} max={100} disabled={!usesKi} onChange={(value) => onPatch({ kiCost: value })} />
        <NumberField label="HP Heal" value={move.healAmount ?? 8} min={0} max={100} disabled={!healsHp} onChange={(value) => onPatch({ healAmount: value })} />
        <NumberField label="Armor Start" value={move.armorStartFrame ?? 0} min={0} onChange={(value) => onPatch({ armorStartFrame: value })} />
        <NumberField label="Armor End" value={move.armorEndFrame ?? 0} min={0} onChange={(value) => onPatch({ armorEndFrame: value })} />
      </div>
      <div className="move-toggle-grid">
        <ToggleField label="Launcher" checked={(move.launchHeight ?? 0) > 0} onChange={(checked) => onPatch(checked ? { launchHeight: Math.max(move.launchHeight ?? 0, 2.2), launchVelocity, juggleRefloatVelocity, juggleGravityScale } : { launchHeight: 0 })} />
        <ToggleField label="Tornado" checked={Boolean(move.tornado)} onChange={(checked) => onPatch({ tornado: checked })} testId="move-editor-tornado-toggle" />
        <ToggleField label="Knockdown" checked={Boolean(move.knockdown)} onChange={(checked) => onPatch({ knockdown: checked })} />
        <ToggleField label="Throw" checked={Boolean(move.throwCapture)} onChange={(checked) => onPatch(checked ? { throwCapture: true, hitLevel: 'throw' } : { throwCapture: false })} />
        <ToggleField label="Counter Hit" checked={Boolean(move.counterHit)} onChange={(checked) => onPatch({ counterHit: checked })} />
        <ToggleField label="Jump Start" checked={Boolean(move.jumpBeforeMove)} onChange={(checked) => onPatch({ jumpBeforeMove: checked })} />
        <ToggleField label="Crouch End" checked={Boolean(move.endsInCrouch)} onChange={(checked) => onPatch({ endsInCrouch: checked })} />
        <ToggleField label="Holdable" checked={Boolean(move.holdable)} onChange={(checked) => onPatch({ holdable: checked })} />
        <ToggleField label="Cancelable" checked={Boolean(move.cancelable)} onChange={(checked) => onPatch({ cancelable: checked })} />
        <ToggleField label="Uses Ki" checked={usesKi} onChange={(checked) => onPatch({ usesKi: checked, kiCost: move.kiCost ?? 35 })} />
        <ToggleField label="Healing" checked={healsHp} onChange={(checked) => onPatch(checked ? { healsHp: true, usesKi: true, healAmount: move.healAmount ?? 8, kiCost: move.kiCost ?? 35 } : { healsHp: false })} />
      </div>
      <CancelWindowsField move={move} onPatch={onPatch} />
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  disabled,
  onChange,
  testId
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  testId?: string;
}) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    if (!Number.isFinite(next)) return;
    onChange(next);
  };
  return (
    <label className="move-number-field">
      <span>{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={handleChange}
        data-testid={testId}
      />
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  testId
}: {
  label: string;
  value: T;
  options: T[];
  onChange: (value: T) => void;
  testId?: string;
}) {
  return (
    <label className="move-number-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as T)} data-testid={testId}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
  testId
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  testId?: string;
}) {
  return (
    <label className="move-toggle-field">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} data-testid={testId} />
    </label>
  );
}

function CancelWindowsField({ move, onPatch }: { move: MoveDefinition; onPatch: (patch: MoveOverride) => void }) {
  const [draft, setDraft] = useState(() => JSON.stringify(move.cancelWindows ?? [], null, 2));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(JSON.stringify(move.cancelWindows ?? [], null, 2));
    setInvalid(false);
  }, [move.cancelWindows]);

  const commit = () => {
    try {
      const parsed = JSON.parse(draft);
      if (!Array.isArray(parsed)) throw new Error('cancelWindows must be an array');
      onPatch({ cancelWindows: parsed });
      setInvalid(false);
    } catch {
      setInvalid(true);
    }
  };

  return (
    <label className={`move-cancel-field ${invalid ? 'is-invalid' : ''}`}>
      <span>Cancel Windows JSON</span>
      <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} rows={3} />
    </label>
  );
}

function defaultLaunchVelocity(launchHeight: number) {
  return Math.min(6.65, Math.max(5.95, launchHeight > 0 ? launchHeight * 2.55 : 5.95));
}

function defaultJuggleRefloatVelocity(launchHeight: number) {
  return Math.min(5.25, Math.max(4.35, launchHeight > 0 ? launchHeight * 1.95 : 4.35));
}

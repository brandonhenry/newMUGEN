import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Pause } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { ActionName, ControlScheme } from '../types';

type TouchControlsProps = {
  onAction: (player: 1 | 2, action: ActionName, pressed: boolean) => void;
  onUse?: (action: ActionName) => void;
  forceVisible?: boolean;
  controlScheme?: ControlScheme;
  showPause?: boolean;
};

type PointerOwner = {
  kind: 'movement' | 'attack' | 'pause';
  actions: ActionName[];
};

const movement: ActionName[] = ['up', 'left', 'right', 'down'];
const attackCells: ActionName[] = ['jump', 'jab', 'heavy', 'kick', 'special', 'charge'];
const attackNumbers: Partial<Record<ActionName, string>> = {
  jab: '1',
  heavy: '2',
  kick: '3',
  special: '4'
};
const movementIcons = {
  up: <ChevronUp size={22} />,
  down: <ChevronDown size={22} />,
  left: <ChevronLeft size={22} />,
  right: <ChevronRight size={22} />
};

const DPAD_DEAD_ZONE = 0.18;
const DPAD_DIAGONAL_RATIO = 0.62;

export function resolveDpadActions(x: number, y: number, width: number, height: number): ActionName[] {
  if (width <= 0 || height <= 0) return [];
  const dx = (x - width / 2) / (width / 2);
  const dy = (y - height / 2) / (height / 2);
  const distance = Math.hypot(dx, dy);
  if (distance <= DPAD_DEAD_ZONE) return [];

  const horizontal = dx < 0 ? 'left' : 'right';
  const vertical = dy < 0 ? 'up' : 'down';
  const absoluteX = Math.abs(dx);
  const absoluteY = Math.abs(dy);
  if (Math.min(absoluteX, absoluteY) >= Math.max(absoluteX, absoluteY) * DPAD_DIAGONAL_RATIO) {
    return [horizontal, vertical];
  }
  return absoluteX > absoluteY ? [horizontal] : [vertical];
}

export function resolveAttackCell(x: number, y: number, width: number, height: number): ActionName | null {
  if (width <= 0 || height <= 0) return null;
  const normalizedX = Math.min(0.999999, Math.max(0, x / width));
  const normalizedY = Math.min(0.999999, Math.max(0, y / height));
  const column = Math.floor(normalizedX * 3);
  const row = Math.floor(normalizedY * 2);
  return attackCells[row * 3 + column] ?? null;
}

function pointerPosition(event: ReactPointerEvent<HTMLElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
    width: bounds.width,
    height: bounds.height
  };
}

function isActivationKey(event: ReactKeyboardEvent<HTMLButtonElement>) {
  return event.key === 'Enter' || event.key === ' ';
}

export function TouchControls({
  onAction,
  onUse,
  forceVisible = false,
  controlScheme = 'beginner',
  showPause = true
}: TouchControlsProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef(new Map<number, PointerOwner>());
  const keyboardActionsRef = useRef(new Set<ActionName>());
  const activeCountsRef = useRef(new Map<ActionName, number>());
  const activeSignatureRef = useRef('');
  const [activeActions, setActiveActions] = useState<Set<ActionName>>(() => new Set());

  const syncActions = useCallback(() => {
    const nextCounts = new Map<ActionName, number>();
    for (const owner of pointersRef.current.values()) {
      for (const action of owner.actions) nextCounts.set(action, (nextCounts.get(action) ?? 0) + 1);
    }
    for (const action of keyboardActionsRef.current) nextCounts.set(action, (nextCounts.get(action) ?? 0) + 1);

    for (const action of activeCountsRef.current.keys()) {
      if (!nextCounts.has(action)) onAction(1, action, false);
    }
    for (const action of nextCounts.keys()) {
      if (!activeCountsRef.current.has(action)) onAction(1, action, true);
    }
    activeCountsRef.current = nextCounts;

    const signature = [...nextCounts.keys()].sort().join('|');
    if (signature !== activeSignatureRef.current) {
      activeSignatureRef.current = signature;
      setActiveActions(new Set(nextCounts.keys()));
    }
  }, [onAction]);

  const releaseAll = useCallback(() => {
    pointersRef.current.clear();
    keyboardActionsRef.current.clear();
    syncActions();
  }, [syncActions]);

  const setPointerOwner = useCallback((pointerId: number, owner: PointerOwner) => {
    pointersRef.current.set(pointerId, owner);
    syncActions();
    for (const action of owner.actions) onUse?.(action);
  }, [onUse, syncActions]);

  const releasePointer = useCallback((pointerId: number) => {
    if (!pointersRef.current.delete(pointerId)) return;
    syncActions();
  }, [syncActions]);

  const capturePointer = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return false;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    return true;
  };

  const finishPointer = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    releasePointer(event.pointerId);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };

  const keyboardHandlers = (action: ActionName) => ({
    onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (!isActivationKey(event) || event.repeat) return;
      event.preventDefault();
      keyboardActionsRef.current.add(action);
      syncActions();
      onUse?.(action);
    },
    onKeyUp: (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (!isActivationKey(event)) return;
      event.preventDefault();
      keyboardActionsRef.current.delete(action);
      syncActions();
    }
  });

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') releaseAll();
    };
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      releaseAll();
    };
  }, [releaseAll]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const preventBrowserGesture = (event: Event) => event.preventDefault();
    root.addEventListener('selectstart', preventBrowserGesture);
    root.addEventListener('dragstart', preventBrowserGesture);
    root.addEventListener('contextmenu', preventBrowserGesture);
    return () => {
      root.removeEventListener('selectstart', preventBrowserGesture);
      root.removeEventListener('dragstart', preventBrowserGesture);
      root.removeEventListener('contextmenu', preventBrowserGesture);
    };
  }, []);

  return (
    <div ref={rootRef} className={`touch-controls ${forceVisible ? 'force-visible' : ''}`} aria-label="Touch controls">
      <div
        className="touch-pad"
        aria-label="Movement pad"
        onPointerDown={(event) => {
          if (!capturePointer(event)) return;
          const position = pointerPosition(event);
          setPointerOwner(event.pointerId, { kind: 'movement', actions: resolveDpadActions(position.x, position.y, position.width, position.height) });
        }}
        onPointerMove={(event) => {
          const owner = pointersRef.current.get(event.pointerId);
          if (owner?.kind !== 'movement') return;
          event.preventDefault();
          const position = pointerPosition(event);
          const actions = resolveDpadActions(position.x, position.y, position.width, position.height);
          if (actions.join('|') === owner.actions.join('|')) return;
          pointersRef.current.set(event.pointerId, { ...owner, actions });
          syncActions();
        }}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onLostPointerCapture={(event) => releasePointer(event.pointerId)}
      >
        {movement.map((action) => (
          <button
            key={action}
            type="button"
            className={`touch-button touch-${action} ${activeActions.has(action) ? 'is-active' : ''}`}
            aria-label={action}
            data-testid={`touch-${action}`}
            {...keyboardHandlers(action)}
          >
            {movementIcons[action as keyof typeof movementIcons]}
          </button>
        ))}
      </div>
      <div
        className="touch-actions"
        aria-label="Attack controls"
        onPointerDown={(event) => {
          if (!capturePointer(event)) return;
          const position = pointerPosition(event);
          const action = resolveAttackCell(position.x, position.y, position.width, position.height);
          if (action) setPointerOwner(event.pointerId, { kind: 'attack', actions: [action] });
        }}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onLostPointerCapture={(event) => releasePointer(event.pointerId)}
      >
        {attackCells.map((action) => {
          const number = attackNumbers[action];
          const beginnerLabel = action === 'jab' ? 'Light' : action === 'heavy' ? 'Medium' : action === 'kick' ? 'Heavy' : action === 'special' ? 'Special' : null;
          const label = action === 'jump' ? 'Jump' : action === 'charge' ? 'Charge Ki' : controlScheme === 'beginner' ? beginnerLabel ?? action : number ?? action;
          const face = controlScheme === 'beginner' && beginnerLabel ? beginnerLabel.slice(0, 1).toUpperCase() : number;
          return (
            <button
              key={action}
              type="button"
              className={`touch-button action-button touch-${action} ${number ? `touch-number touch-number-${number}` : ''} ${activeActions.has(action) ? 'is-active' : ''}`}
              aria-label={label}
              data-testid={`touch-${action}`}
              {...keyboardHandlers(action)}
            >
              {face ?? (action === 'jump' ? 'JUMP' : 'KI')}
            </button>
          );
        })}
      </div>
      {showPause && (
        <button
          type="button"
          className={`touch-button touch-pause ${activeActions.has('pause') ? 'is-active' : ''}`}
          aria-label="Pause"
          data-testid="touch-pause"
          onPointerDown={(event) => {
            if (!capturePointer(event)) return;
            setPointerOwner(event.pointerId, { kind: 'pause', actions: ['pause'] });
          }}
          onPointerUp={finishPointer}
          onPointerCancel={finishPointer}
          onLostPointerCapture={(event) => releasePointer(event.pointerId)}
          {...keyboardHandlers('pause')}
        >
          <Pause size={20} fill="currentColor" />
        </button>
      )}
    </div>
  );
}

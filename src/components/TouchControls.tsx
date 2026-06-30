import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { ActionName } from '../types';

type TouchControlsProps = {
  onAction: (player: 1 | 2, action: ActionName, pressed: boolean) => void;
  onUse?: (action: ActionName) => void;
  forceVisible?: boolean;
};

const movement: ActionName[] = ['up', 'left', 'right', 'down'];
const attacks: Array<{ action: ActionName; label: string }> = [
  { action: 'jab', label: '1 LH' },
  { action: 'heavy', label: '2 RH' },
  { action: 'kick', label: '3 LF' },
  { action: 'special', label: '4 RF' },
  { action: 'charge', label: 'KI' }
];
const movementIcons = {
  up: <ChevronUp size={20} />,
  down: <ChevronDown size={20} />,
  left: <ChevronLeft size={20} />,
  right: <ChevronRight size={20} />
};

function activeActionKey(player: 1 | 2, action: ActionName) {
  return `${player}:${action}` as const;
}

export function TouchControls({ onAction, onUse, forceVisible = false }: TouchControlsProps) {
  const activeActionsRef = useRef(new Map<string, { player: 1 | 2; action: ActionName }>());

  const releaseAction = useCallback((player: 1 | 2, action: ActionName) => {
    const key = activeActionKey(player, action);
    if (!activeActionsRef.current.has(key)) return;
    activeActionsRef.current.delete(key);
    onAction(player, action, false);
  }, [onAction]);

  const releaseAll = useCallback(() => {
    for (const { player, action } of activeActionsRef.current.values()) {
      onAction(player, action, false);
    }
    activeActionsRef.current.clear();
  }, [onAction]);

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

  const bind = (player: 1 | 2, action: ActionName) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const key = activeActionKey(player, action);
      if (!activeActionsRef.current.has(key)) {
        activeActionsRef.current.set(key, { player, action });
        onAction(player, action, true);
        onUse?.(action);
      }
    },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      releaseAction(player, action);
    },
    onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      releaseAction(player, action);
    },
    onLostPointerCapture: () => releaseAction(player, action),
    onContextMenu: (event: ReactPointerEvent<HTMLButtonElement>) => event.preventDefault()
  });

  return (
    <div className={`touch-controls ${forceVisible ? 'force-visible' : ''}`} aria-label="Touch controls">
      <div className="touch-pad">
        {movement.map((action) => (
          <button key={action} type="button" className={`touch-button touch-${action}`} {...bind(1, action)} aria-label={action} data-testid={`touch-${action}`}>
            {movementIcons[action as keyof typeof movementIcons]}
          </button>
        ))}
      </div>
      <div className="touch-actions">
        {attacks.map(({ action, label }) => (
          <button key={action} type="button" className={`touch-button action-button touch-${action}`} {...bind(1, action)} data-testid={`touch-${action}`}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

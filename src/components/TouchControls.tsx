import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import type { ActionName } from '../types';

type TouchControlsProps = {
  onAction: (player: 1 | 2, action: ActionName, pressed: boolean) => void;
};

const movement: ActionName[] = ['up', 'left', 'right', 'down'];
const attacks: Array<{ action: ActionName; label: string }> = [
  { action: 'jab', label: '1 LH' },
  { action: 'heavy', label: '2 RH' },
  { action: 'kick', label: '3 LF' },
  { action: 'special', label: '4 RF' }
];
const movementIcons = {
  up: <ChevronUp size={20} />,
  down: <ChevronDown size={20} />,
  left: <ChevronLeft size={20} />,
  right: <ChevronRight size={20} />
};

export function TouchControls({ onAction }: TouchControlsProps) {
  const bind = (player: 1 | 2, action: ActionName) => ({
    onPointerDown: () => onAction(player, action, true),
    onPointerUp: () => onAction(player, action, false),
    onPointerCancel: () => onAction(player, action, false),
    onPointerLeave: () => onAction(player, action, false)
  });

  return (
    <div className="touch-controls" aria-label="Touch controls">
      <div className="touch-pad">
        {movement.map((action) => (
          <button key={action} className={`touch-button touch-${action}`} {...bind(1, action)} aria-label={action}>
            {movementIcons[action as keyof typeof movementIcons]}
          </button>
        ))}
      </div>
      <div className="touch-actions">
        {attacks.map(({ action, label }) => (
          <button key={action} className="touch-button action-button" {...bind(1, action)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

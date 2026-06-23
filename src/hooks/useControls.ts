import { useCallback, useEffect, useRef } from 'react';
import type { ActionName, InputFrame, MatchMode } from '../types';
import { emptyInputFrame } from '../types';

const playerOneKeys: Record<string, ActionName> = {
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
  KeyJ: 'jab',
  KeyK: 'kick',
  KeyL: 'heavy',
  KeyU: 'special',
  KeyI: 'block',
  Enter: 'confirm',
  Escape: 'pause'
};

const playerTwoKeys: Record<string, ActionName> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Numpad1: 'jab',
  Numpad2: 'kick',
  Numpad3: 'heavy',
  Numpad4: 'special',
  Numpad5: 'block',
  ShiftRight: 'block',
  Space: 'confirm'
};

const arrowKeys: Record<string, ActionName> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right'
};

const buttonMap: Partial<Record<number, ActionName>> = {
  0: 'jab',
  1: 'kick',
  2: 'heavy',
  3: 'special',
  4: 'block',
  5: 'block',
  9: 'pause'
};

export function useControls(mode: MatchMode) {
  const inputRefs = useRef<[InputFrame, InputFrame]>([emptyInputFrame(), emptyInputFrame()]);
  const virtualRefs = useRef<[InputFrame, InputFrame]>([emptyInputFrame(), emptyInputFrame()]);
  const lastInputRef = useRef('none');
  const modeRef = useRef(mode);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent, pressed: boolean) => {
      const p1Action = playerOneKeys[event.code];
      const p2Action = playerTwoKeys[event.code];
      const aiArrowAction = modeRef.current === 'ai' ? arrowKeys[event.code] : undefined;
      if (p1Action) {
        inputRefs.current[0][p1Action] = pressed;
        if (pressed) lastInputRef.current = `p1:${p1Action}`;
        event.preventDefault();
      }
      if (aiArrowAction) {
        inputRefs.current[0][aiArrowAction] = pressed;
        if (pressed) lastInputRef.current = `p1:${aiArrowAction}`;
        event.preventDefault();
        return;
      }
      if (p2Action) {
        inputRefs.current[1][p2Action] = pressed;
        if (pressed) lastInputRef.current = `p2:${p2Action}`;
        event.preventDefault();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => onKey(event, true);
    const onKeyUp = (event: KeyboardEvent) => onKey(event, false);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('keyup', onKeyUp, true);
    };
  }, []);

  const readInputs = useCallback((): [InputFrame, InputFrame] => {
    const pads = navigator.getGamepads?.() ?? [];
    const merged: [InputFrame, InputFrame] = [emptyInputFrame(), emptyInputFrame()];
    for (let player = 0; player < 2; player += 1) {
      for (const action of Object.keys(merged[player]) as ActionName[]) {
        merged[player][action] = inputRefs.current[player][action] || virtualRefs.current[player][action];
      }
      const pad = pads[player];
      if (pad) {
        const horizontal = pad.axes[0] ?? 0;
        const vertical = pad.axes[1] ?? 0;
        merged[player].left ||= horizontal < -0.35;
        merged[player].right ||= horizontal > 0.35;
        merged[player].up ||= vertical < -0.35;
        merged[player].down ||= vertical > 0.35;
        for (const [index, action] of Object.entries(buttonMap)) {
          if (pad.buttons[Number(index)]?.pressed && action) merged[player][action] = true;
        }
      }
    }
    return merged;
  }, []);

  const setVirtualAction = useCallback((player: 1 | 2, action: ActionName, pressed: boolean) => {
    virtualRefs.current[player - 1][action] = pressed;
  }, []);

  const clearMenuInputs = useCallback(() => {
    inputRefs.current[0].confirm = false;
    inputRefs.current[0].pause = false;
    inputRefs.current[1].confirm = false;
    inputRefs.current[1].pause = false;
  }, []);

  const getLastInput = useCallback(() => lastInputRef.current, []);

  return { readInputs, setVirtualAction, clearMenuInputs, getLastInput };
}

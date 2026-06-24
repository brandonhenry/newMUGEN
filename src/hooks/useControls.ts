import { useCallback, useEffect, useRef } from 'react';
import type { ActionName, InputFrame, MatchMode } from '../types';
import { emptyInputFrame } from '../types';

const playerOneKeys: Record<string, ActionName> = {
  KeyW: 'up',
  w: 'up',
  W: 'up',
  KeyS: 'down',
  s: 'down',
  S: 'down',
  KeyA: 'left',
  a: 'left',
  A: 'left',
  KeyD: 'right',
  d: 'right',
  D: 'right',
  KeyJ: 'jab',
  j: 'jab',
  J: 'jab',
  KeyK: 'kick',
  k: 'kick',
  K: 'kick',
  KeyL: 'heavy',
  l: 'heavy',
  L: 'heavy',
  KeyU: 'special',
  u: 'special',
  U: 'special',
  KeyI: 'block',
  i: 'block',
  I: 'block',
  Enter: 'confirm',
  Escape: 'pause'
};

const playerTwoKeys: Record<string, ActionName> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Numpad1: 'jab',
  '1': 'jab',
  Numpad2: 'kick',
  '2': 'kick',
  Numpad3: 'heavy',
  '3': 'heavy',
  Numpad4: 'special',
  '4': 'special',
  Numpad5: 'block',
  '5': 'block',
  ShiftRight: 'block',
  Shift: 'block',
  Space: 'confirm'
};

const aiModeArrowKeys: Record<string, ActionName> = {
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

type VerticalTapState = {
  lastUpTap: number;
  lastDownTap: number;
  laneDirection: -1 | 0 | 1;
};

const DOUBLE_TAP_MS = 1000;

export function useControls(mode: MatchMode) {
  const inputRefs = useRef<[InputFrame, InputFrame]>([emptyInputFrame(), emptyInputFrame()]);
  const virtualRefs = useRef<[InputFrame, InputFrame]>([emptyInputFrame(), emptyInputFrame()]);
  const verticalTapRefs = useRef<[VerticalTapState, VerticalTapState]>([
    { lastUpTap: Number.NEGATIVE_INFINITY, lastDownTap: Number.NEGATIVE_INFINITY, laneDirection: 0 },
    { lastUpTap: Number.NEGATIVE_INFINITY, lastDownTap: Number.NEGATIVE_INFINITY, laneDirection: 0 }
  ]);
  const lastInputRef = useRef('none');
  const modeRef = useRef(mode);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent, pressed: boolean) => {
      const keyId = normalizeKeyEvent(event);
      const p1Action = playerOneKeys[keyId];
      const p2Action = playerTwoKeys[keyId];
      const aiArrowAction = modeRef.current === 'ai' ? aiModeArrowKeys[keyId] : undefined;
      if (p1Action) {
        if (!applyVerticalTap(inputRefs.current[0], verticalTapRefs.current[0], p1Action, pressed)) {
          inputRefs.current[0][p1Action] = pressed;
        }
        if (pressed) lastInputRef.current = `p1:${p1Action}`;
        event.preventDefault();
      }
      if (aiArrowAction) {
        if (!applyVerticalTap(inputRefs.current[0], verticalTapRefs.current[0], aiArrowAction, pressed)) {
          inputRefs.current[0][aiArrowAction] = pressed;
        }
        if (pressed) lastInputRef.current = `p1:${aiArrowAction}`;
        event.preventDefault();
        return;
      }
      if (p2Action) {
        if (!applyVerticalTap(inputRefs.current[1], verticalTapRefs.current[1], p2Action, pressed)) {
          inputRefs.current[1][p2Action] = pressed;
        }
        if (pressed) lastInputRef.current = `p2:${p2Action}`;
        event.preventDefault();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => onKey(event, true);
    const onKeyUp = (event: KeyboardEvent) => onKey(event, false);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
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
    if (!applyVerticalTap(virtualRefs.current[player - 1], verticalTapRefs.current[player - 1], action, pressed)) {
      virtualRefs.current[player - 1][action] = pressed;
    }
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

function normalizeKeyEvent(event: KeyboardEvent) {
  if (playerOneKeys[event.code] || playerTwoKeys[event.code] || aiModeArrowKeys[event.code]) return event.code;
  return event.key;
}

function applyVerticalTap(input: InputFrame, state: VerticalTapState, action: ActionName, pressed: boolean) {
  if (action !== 'up' && action !== 'down') return false;
  const now = performance.now();
  const laneAction = action === 'up' ? 'sidewalkUp' : 'sidewalkDown';
  const oppositeLaneAction = action === 'up' ? 'sidewalkDown' : 'sidewalkUp';
  const direction = action === 'up' ? -1 : 1;
  const lastTapKey = action === 'up' ? 'lastUpTap' : 'lastDownTap';

  if (pressed) {
    if (input[action] || input[laneAction]) return true;
    if (now - state[lastTapKey] <= DOUBLE_TAP_MS) {
      input[action] = false;
      input[laneAction] = true;
      input[oppositeLaneAction] = false;
      state.laneDirection = direction;
      state[lastTapKey] = Number.NEGATIVE_INFINITY;
    } else {
      input[action] = true;
      input[laneAction] = false;
      state.laneDirection = 0;
      state[lastTapKey] = now;
    }
  } else {
    input[action] = false;
    if (state.laneDirection === direction) {
      input[laneAction] = false;
      state.laneDirection = 0;
    }
  }
  return true;
}

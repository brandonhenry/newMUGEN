import { useCallback, useEffect, useRef } from 'react';
import type { ActionName, ControlBindingMap, InputFrame, MatchMode, PlayerControlBindings } from '../types';
import { emptyInputFrame } from '../types';
import { defaultGameSettings } from '../lib/gameSettings';

const aiModeArrowKeys: Record<string, ActionName> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right'
};

type VerticalTapState = {
  lastUpTap: number;
  lastDownTap: number;
  laneDirection: -1 | 0 | 1;
};

const DOUBLE_TAP_MS = 1000;

export function useControls(mode: MatchMode, controls: ControlBindingMap = defaultGameSettings.controls) {
  const inputRefs = useRef<[InputFrame, InputFrame]>([emptyInputFrame(), emptyInputFrame()]);
  const virtualRefs = useRef<[InputFrame, InputFrame]>([emptyInputFrame(), emptyInputFrame()]);
  const verticalTapRefs = useRef<[VerticalTapState, VerticalTapState]>([
    { lastUpTap: Number.NEGATIVE_INFINITY, lastDownTap: Number.NEGATIVE_INFINITY, laneDirection: 0 },
    { lastUpTap: Number.NEGATIVE_INFINITY, lastDownTap: Number.NEGATIVE_INFINITY, laneDirection: 0 }
  ]);
  const lastInputRef = useRef('none');
  const modeRef = useRef(mode);
  const controlsRef = useRef(controls);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent, pressed: boolean) => {
      const bindings = getKeyboardBindingsForEvent(event, modeRef.current, controlsRef.current);
      for (const binding of bindings) {
        const playerIndex = binding.player - 1;
        if (!applyVerticalTap(inputRefs.current[playerIndex], verticalTapRefs.current[playerIndex], binding.action, pressed)) {
          inputRefs.current[playerIndex][binding.action] = pressed;
        }
        if (pressed) lastInputRef.current = `p${binding.player}:${binding.action}`;
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
        const gamepadBindings = controlsRef.current.gamepad[player];
        for (const action of Object.keys(gamepadBindings) as ActionName[]) {
          if (gamepadBindings[action]?.some((index) => pad.buttons[index]?.pressed)) merged[player][action] = true;
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

export function getKeyboardBindingsForEvent(
  event: KeyboardEvent,
  mode: MatchMode,
  controls: ControlBindingMap = defaultGameSettings.controls
): Array<{ player: 1 | 2; action: ActionName }> {
  const matches: Array<{ player: 1 | 2; action: ActionName }> = [];
  const keyIds = [event.code, event.key].filter(Boolean);
  const p1Action = findActionForKey(controls.keyboard[0], keyIds);
  const p2Action = findActionForKey(controls.keyboard[1], keyIds);
  const aiAction = mode === 'ai' ? findActionForKey(aiModeArrowKeys, keyIds) : undefined;
  if (p1Action) matches.push({ player: 1, action: p1Action });
  if (aiAction && !matches.some((match) => match.player === 1 && match.action === aiAction)) matches.push({ player: 1, action: aiAction });
  if (p2Action) matches.push({ player: 2, action: p2Action });
  return matches;
}

function findActionForKey(bindings: PlayerControlBindings | Record<string, ActionName>, keyIds: string[]) {
  for (const [actionOrKey, valuesOrAction] of Object.entries(bindings)) {
    if (Array.isArray(valuesOrAction)) {
      if (valuesOrAction.some((value) => keyIds.includes(value))) return actionOrKey as ActionName;
    } else if (keyIds.includes(actionOrKey)) {
      return valuesOrAction;
    }
  }
  return undefined;
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

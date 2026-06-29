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

type VerticalInputSource = 'keyboard' | 'virtual';

export type VerticalTapState = {
  lastUpTap: number;
  lastDownTap: number;
  holdAction: 'up' | 'down' | null;
  holdStartedAt: number;
  holdActivated: boolean;
  laneDirection: -1 | 0 | 1;
  laneMode: 'none' | 'holdCandidate';
  laneStartedAt: number;
  laneStepConsumed: boolean;
  heldAction: 'up' | 'down' | null;
  source: VerticalInputSource | null;
};

const DOUBLE_TAP_MS = 460;
const VERTICAL_HOLD_MS = 185;

export function createVerticalTapState(): VerticalTapState {
  return {
    lastUpTap: Number.NEGATIVE_INFINITY,
    lastDownTap: Number.NEGATIVE_INFINITY,
    holdAction: null,
    holdStartedAt: Number.NEGATIVE_INFINITY,
    holdActivated: false,
    laneDirection: 0,
    laneMode: 'none',
    laneStartedAt: Number.NEGATIVE_INFINITY,
    laneStepConsumed: false,
    heldAction: null,
    source: null
  };
}

export function useControls(mode: MatchMode, controls: ControlBindingMap = defaultGameSettings.controls) {
  const inputRefs = useRef<[InputFrame, InputFrame]>([emptyInputFrame(), emptyInputFrame()]);
  const virtualRefs = useRef<[InputFrame, InputFrame]>([emptyInputFrame(), emptyInputFrame()]);
  const verticalTapRefs = useRef<[VerticalTapState, VerticalTapState]>([createVerticalTapState(), createVerticalTapState()]);
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
      if (isTextEntryTarget(event.target)) return;
      const bindings = getKeyboardBindingsForEvent(event, modeRef.current, controlsRef.current);
      for (const binding of bindings) {
        const playerIndex = binding.player - 1;
        if (!applyVerticalTap(inputRefs.current[playerIndex], verticalTapRefs.current[playerIndex], binding.action, pressed, 'keyboard')) {
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
      const now = performance.now();
      prepareVerticalTapForRead(inputRefs.current[player], verticalTapRefs.current[player], 'keyboard', now);
      prepareVerticalTapForRead(virtualRefs.current[player], verticalTapRefs.current[player], 'virtual', now);
      for (const action of Object.keys(merged[player]) as ActionName[]) {
        merged[player][action] = inputRefs.current[player][action] || virtualRefs.current[player][action];
      }
      consumeVerticalTapAfterRead(inputRefs.current[player], verticalTapRefs.current[player], 'keyboard');
      consumeVerticalTapAfterRead(virtualRefs.current[player], verticalTapRefs.current[player], 'virtual');
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
    if (!applyVerticalTap(virtualRefs.current[player - 1], verticalTapRefs.current[player - 1], action, pressed, 'virtual')) {
      virtualRefs.current[player - 1][action] = pressed;
    }
    if (pressed) lastInputRef.current = `p${player}:${action}`;
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

function isTextEntryTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName;
  if (tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  if (tagName !== 'INPUT') return false;
  const input = target as HTMLInputElement;
  const type = (input.type || 'text').toLowerCase();
  return !['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'].includes(type);
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
  const aiAction = mode === 'ai' || mode === 'versusCpu' ? findActionForKey(aiModeArrowKeys, keyIds) : undefined;
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

export function applyVerticalTap(
  input: InputFrame,
  state: VerticalTapState,
  action: ActionName,
  pressed: boolean,
  source: VerticalInputSource = 'keyboard',
  now = performance.now()
) {
  if (action !== 'up' && action !== 'down') return false;
  const sidestepAction = action === 'up' ? 'sidestepUp' : 'sidestepDown';
  const laneAction = action === 'up' ? 'sidewalkUp' : 'sidewalkDown';
  const oppositeSidestepAction = action === 'up' ? 'sidestepDown' : 'sidestepUp';
  const oppositeLaneAction = action === 'up' ? 'sidewalkDown' : 'sidewalkUp';
  const direction = action === 'up' ? -1 : 1;
  const lastTapKey = action === 'up' ? 'lastUpTap' : 'lastDownTap';

  if (pressed) {
    if (state.heldAction === action && state.source === source) return true;
    if (now - state[lastTapKey] <= DOUBLE_TAP_MS) {
      input[action] = false;
      input[sidestepAction] = true;
      input[laneAction] = false;
      input[oppositeSidestepAction] = false;
      input[oppositeLaneAction] = false;
      state.laneDirection = direction;
      state.laneMode = 'holdCandidate';
      state.laneStartedAt = now;
      state.laneStepConsumed = false;
      state.holdAction = null;
      state.holdStartedAt = Number.NEGATIVE_INFINITY;
      state.holdActivated = false;
      state.heldAction = action;
      state.source = source;
      state[lastTapKey] = Number.NEGATIVE_INFINITY;
    } else {
      resetLaneState(input, state, source);
      input[action] = false;
      input[sidestepAction] = false;
      input[laneAction] = false;
      state.holdAction = action;
      state.holdStartedAt = now;
      state.holdActivated = false;
      state.heldAction = action;
      state.source = source;
      state[lastTapKey] = now;
    }
  } else {
    input[action] = false;
    if (state.heldAction !== action || state.source !== source) return true;
    input[sidestepAction] = false;
    input[laneAction] = false;
    const completedHold = state.holdAction === action && state.holdActivated;
    if (state.holdAction === action) {
      state.holdAction = null;
      state.holdStartedAt = Number.NEGATIVE_INFINITY;
      state.holdActivated = false;
    }
    state[lastTapKey] = completedHold ? Number.NEGATIVE_INFINITY : now;
    state.heldAction = null;
    if (state.laneDirection === direction) resetLaneState(input, state, source);
    if (state.laneDirection === 0) state.source = null;
  }
  return true;
}

export function prepareVerticalTapForRead(input: InputFrame, state: VerticalTapState, source: VerticalInputSource, now = performance.now()) {
  if (state.source === source && state.holdAction && state.heldAction === state.holdAction) {
    if (now - state.holdStartedAt >= VERTICAL_HOLD_MS) {
      state.holdActivated = true;
      input[state.holdAction] = true;
    } else {
      input[state.holdAction] = false;
    }
  }

  if (state.source !== source || state.laneDirection === 0 || state.laneMode === 'none') return;
  const action = state.laneDirection < 0 ? 'up' : 'down';
  const sidestepAction = action === 'up' ? 'sidestepUp' : 'sidestepDown';
  const laneAction = action === 'up' ? 'sidewalkUp' : 'sidewalkDown';
  input[action] = false;

  if (state.laneMode === 'holdCandidate') {
    if (!state.laneStepConsumed) {
      input[sidestepAction] = true;
      input[laneAction] = false;
      return;
    }
    input[sidestepAction] = false;
    input[laneAction] = false;
  }
}

export function consumeVerticalTapAfterRead(input: InputFrame, state: VerticalTapState, source: VerticalInputSource) {
  if (state.source !== source || state.laneDirection === 0 || state.laneMode !== 'holdCandidate' || state.laneStepConsumed) return;
  const action = state.laneDirection < 0 ? 'up' : 'down';
  const sidestepAction = action === 'up' ? 'sidestepUp' : 'sidestepDown';
  if (!input[sidestepAction]) return;
  input[sidestepAction] = false;
  state.laneStepConsumed = true;
}

function resetLaneState(input: InputFrame, state: VerticalTapState, source: VerticalInputSource) {
  if (state.source !== source && state.source !== null) return;
  input.sidestepUp = false;
  input.sidestepDown = false;
  input.sidewalkUp = false;
  input.sidewalkDown = false;
  state.laneDirection = 0;
  state.laneMode = 'none';
  state.laneStartedAt = Number.NEGATIVE_INFINITY;
  state.laneStepConsumed = false;
  state.holdAction = null;
  state.holdStartedAt = Number.NEGATIVE_INFINITY;
  state.holdActivated = false;
  state.source = null;
}

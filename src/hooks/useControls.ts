import { useCallback, useEffect, useRef } from 'react';
import type { ActionName, ControlBindingMap, InputFrame, InputFrameWithMetadata, MatchMode, PlayerControlBindings } from '../types';
import { emptyInputFrame } from '../types';
import { keybindableButtonComboDefinitions } from '../lib/buttonCombos';
import { defaultGameSettings } from '../lib/gameSettings';
import { getPreferredGamepads, getVisibleGamepads, isGamepadActive, readFightGamepadInput } from '../lib/gamepads';

const aiModeArrowKeys: Record<string, ActionName> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right'
};

type VerticalInputSource = 'keyboard' | 'virtual' | 'gamepad';
type InputSource = 'keyboard' | 'virtual' | 'gamepad';
type InputDebugWindow = Window & {
  __koreInputDebugLog?: Array<{ event: string; payload: Record<string, unknown>; timestamp: number }>;
};
type GamepadAssignment = { index: number; source: 'active' | 'fallback' } | null;

export type QueuedInputPress = {
  player: 0 | 1;
  action: ActionName;
  source: InputSource;
  sequence: number;
  timestamp: number;
};

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
};

export type HorizontalTapState = {
  lastLeftTap: number;
  lastRightTap: number;
  heldAction: 'left' | 'right' | null;
  dashAction: 'left' | 'right' | null;
};

const DOUBLE_TAP_MS = 460;
const VERTICAL_HOLD_MS = 185;
const GAMEPAD_VERTICAL_DOUBLE_TAP_MS = 700;
const GAMEPAD_VERTICAL_HOLD_MS = 240;
const GAMEPAD_HORIZONTAL_DOUBLE_TAP_MS = 700;
const menuQueuedActions = new Set<ActionName>(['confirm', 'pause']);
const queuedPulseActions = new Set<ActionName>(['jab', 'heavy', 'kick', 'special', 'confirm', 'pause', 'back', 'lockTarget', 'cycleTargetUp', 'cycleTargetDown']);

function inputDebugEnabled() {
  return Boolean(
    typeof window !== 'undefined' &&
      (window.location.search.includes('inputDebug=1') || window.localStorage?.getItem('kore:input-debug') === '1')
  );
}

function logInputDebug(event: string, payload: Record<string, unknown>) {
  if (!inputDebugEnabled()) return;
  const debugWindow = window as InputDebugWindow;
  const debugLog = debugWindow.__koreInputDebugLog ?? [];
  debugLog.push({ event, payload, timestamp: performance.now() });
  if (debugLog.length > 240) debugLog.splice(0, debugLog.length - 240);
  debugWindow.__koreInputDebugLog = debugLog;
  console.info(`[KORE input-debug] ${event} ${JSON.stringify(payload)}`);
}

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
    heldAction: null
  };
}

export function createHorizontalTapState(): HorizontalTapState {
  return {
    lastLeftTap: Number.NEGATIVE_INFINITY,
    lastRightTap: Number.NEGATIVE_INFINITY,
    heldAction: null,
    dashAction: null
  };
}

export function useControls(mode: MatchMode, controls: ControlBindingMap = defaultGameSettings.controls) {
  const inputRefs = useRef<[InputFrame, InputFrame]>([emptyInputFrame(), emptyInputFrame()]);
  const virtualRefs = useRef<[InputFrame, InputFrame]>([emptyInputFrame(), emptyInputFrame()]);
  const gamepadRefs = useRef<[InputFrame, InputFrame]>([emptyInputFrame(), emptyInputFrame()]);
  const keyboardVerticalTapRefs = useRef<[VerticalTapState, VerticalTapState]>([createVerticalTapState(), createVerticalTapState()]);
  const virtualVerticalTapRefs = useRef<[VerticalTapState, VerticalTapState]>([createVerticalTapState(), createVerticalTapState()]);
  const gamepadVerticalTapRefs = useRef<[VerticalTapState, VerticalTapState]>([createVerticalTapState(), createVerticalTapState()]);
  const keyboardHorizontalTapRefs = useRef<[HorizontalTapState, HorizontalTapState]>([createHorizontalTapState(), createHorizontalTapState()]);
  const virtualHorizontalTapRefs = useRef<[HorizontalTapState, HorizontalTapState]>([createHorizontalTapState(), createHorizontalTapState()]);
  const gamepadHorizontalTapRefs = useRef<[HorizontalTapState, HorizontalTapState]>([createHorizontalTapState(), createHorizontalTapState()]);
  const gamepadInitializedRefs = useRef<[boolean, boolean]>([false, false]);
  const gamepadAssignmentRefs = useRef<[GamepadAssignment, GamepadAssignment]>([null, null]);
  const inputQueueRef = useRef<QueuedInputPress[]>([]);
  const inputSequenceRef = useRef(0);
  const processedKeyboardEventsRef = useRef(new WeakSet<KeyboardEvent>());
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
      if (processedKeyboardEventsRef.current.has(event)) return;
      processedKeyboardEventsRef.current.add(event);
      if (isTextEntryTarget(event.target)) return;
      if (modeRef.current === 'trainingOnline' && event.key === 'Enter') return;
      if (pressed && event.repeat) return;
      const bindings = getKeyboardBindingsForEvent(event, modeRef.current, controlsRef.current);
      for (const binding of bindings) {
        const playerIndex = binding.player - 1;
        if (
          !applyHorizontalTap(inputRefs.current[playerIndex], keyboardHorizontalTapRefs.current[playerIndex], binding.action, pressed, 'keyboard') &&
          !applyVerticalTap(inputRefs.current[playerIndex], keyboardVerticalTapRefs.current[playerIndex], binding.action, pressed, 'keyboard')
        ) {
          inputRefs.current[playerIndex][binding.action] = pressed;
        }
        if (pressed) {
          enqueuePress(inputQueueRef.current, inputSequenceRef, playerIndex as 0 | 1, binding.action, 'keyboard');
          lastInputRef.current = `p${binding.player}:${binding.action}`;
        }
        logInputDebug('key', {
          pressed,
          repeat: event.repeat,
          code: event.code,
          key: event.key,
          player: binding.player,
          action: binding.action,
          held: pickInputDebugState(inputRefs.current[playerIndex]),
          queue: formatInputQueueForDebug(inputQueueRef.current)
        });
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

  const peekInputs = useCallback((): [InputFrame, InputFrame] => {
    refreshGamepadInputs(
      gamepadRefs.current,
      gamepadVerticalTapRefs.current,
      gamepadHorizontalTapRefs.current,
      gamepadInitializedRefs.current,
      gamepadAssignmentRefs.current,
      inputQueueRef.current,
      inputSequenceRef,
      controlsRef.current
    );
    return mergeInputsForRead(
      inputRefs.current,
      virtualRefs.current,
      gamepadRefs.current,
      inputQueueRef.current,
      keyboardVerticalTapRefs.current,
      virtualVerticalTapRefs.current,
      gamepadVerticalTapRefs.current,
      false
    );
  }, []);

  const readInputsForStep = useCallback((): [InputFrame, InputFrame] => {
    refreshGamepadInputs(
      gamepadRefs.current,
      gamepadVerticalTapRefs.current,
      gamepadHorizontalTapRefs.current,
      gamepadInitializedRefs.current,
      gamepadAssignmentRefs.current,
      inputQueueRef.current,
      inputSequenceRef,
      controlsRef.current
    );
    const merged = mergeInputsForRead(
      inputRefs.current,
      virtualRefs.current,
      gamepadRefs.current,
      inputQueueRef.current,
      keyboardVerticalTapRefs.current,
      virtualVerticalTapRefs.current,
      gamepadVerticalTapRefs.current,
      true
    );
    if (inputDebugHasSignal(merged, inputQueueRef.current)) {
      logInputDebug('step-read', {
        p1: pickInputDebugState(merged[0]),
        p2: pickInputDebugState(merged[1]),
        p1Pressed: (merged[0] as InputFrameWithMetadata).__pressedActions ?? [],
        p2Pressed: (merged[1] as InputFrameWithMetadata).__pressedActions ?? [],
        queueRemaining: formatInputQueueForDebug(inputQueueRef.current)
      });
    }
    for (let player = 0; player < 2; player += 1) {
      consumeVerticalTapAfterRead(inputRefs.current[player], keyboardVerticalTapRefs.current[player], 'keyboard');
      consumeVerticalTapAfterRead(virtualRefs.current[player], virtualVerticalTapRefs.current[player], 'virtual');
      consumeVerticalTapAfterRead(gamepadRefs.current[player], gamepadVerticalTapRefs.current[player], 'gamepad');
      consumeHorizontalTapAfterRead(inputRefs.current[player], keyboardHorizontalTapRefs.current[player], 'keyboard');
      consumeHorizontalTapAfterRead(virtualRefs.current[player], virtualHorizontalTapRefs.current[player], 'virtual');
      consumeHorizontalTapAfterRead(gamepadRefs.current[player], gamepadHorizontalTapRefs.current[player], 'gamepad');
    }
    return merged;
  }, []);

  const readInputs = readInputsForStep;

  const setVirtualAction = useCallback((player: 1 | 2, action: ActionName, pressed: boolean) => {
    if (
      !applyHorizontalTap(virtualRefs.current[player - 1], virtualHorizontalTapRefs.current[player - 1], action, pressed, 'virtual') &&
      !applyVerticalTap(virtualRefs.current[player - 1], virtualVerticalTapRefs.current[player - 1], action, pressed, 'virtual')
    ) {
      virtualRefs.current[player - 1][action] = pressed;
    }
    if (pressed) {
      enqueuePress(inputQueueRef.current, inputSequenceRef, (player - 1) as 0 | 1, action, 'virtual');
      lastInputRef.current = `p${player}:${action}`;
    }
  }, []);

  const clearMenuInputs = useCallback(() => {
    inputRefs.current[0].confirm = false;
    inputRefs.current[0].pause = false;
    inputRefs.current[1].confirm = false;
    inputRefs.current[1].pause = false;
    virtualRefs.current[0].confirm = false;
    virtualRefs.current[0].pause = false;
    virtualRefs.current[1].confirm = false;
    virtualRefs.current[1].pause = false;
    gamepadRefs.current[0].confirm = false;
    gamepadRefs.current[0].pause = false;
    gamepadRefs.current[1].confirm = false;
    gamepadRefs.current[1].pause = false;
    inputQueueRef.current = inputQueueRef.current.filter((entry) => entry.action !== 'confirm' && entry.action !== 'pause');
  }, []);

  const getLastInput = useCallback(() => lastInputRef.current, []);

  return { readInputs, readInputsForStep, peekInputs, setVirtualAction, clearMenuInputs, getLastInput };
}

function enqueuePress(
  queue: QueuedInputPress[],
  sequenceRef: { current: number },
  player: 0 | 1,
  action: ActionName,
  source: InputSource,
  now = performance.now()
) {
  if (!queuedPulseActions.has(action)) return;
  sequenceRef.current += 1;
  const entry = { player, action, source, sequence: sequenceRef.current, timestamp: now };
  queue.push(entry);
  logInputDebug('enqueue', {
    player: player + 1,
    action,
    source,
    sequence: entry.sequence,
    queue: formatInputQueueForDebug(queue)
  });
}

function pickInputDebugState(input: InputFrame) {
  return {
    left: input.left,
    right: input.right,
    up: input.up,
    down: input.down,
    jab: input.jab,
    heavy: input.heavy,
    kick: input.kick,
    special: input.special,
    dashForward: input.dashForward,
    dashBack: input.dashBack,
    sidestepUp: input.sidestepUp,
    sidestepDown: input.sidestepDown,
    pause: input.pause
  };
}

function inputDebugHasSignal(inputs: [InputFrame, InputFrame], queue: QueuedInputPress[]) {
  if (queue.length > 0) return true;
  return inputs.some((input) =>
    input.left ||
    input.right ||
    input.up ||
    input.down ||
    input.jab ||
    input.heavy ||
    input.kick ||
    input.special ||
    input.dashForward ||
    input.dashBack ||
    input.sidestepUp ||
    input.sidestepDown ||
    input.pause ||
    ((input as InputFrameWithMetadata).__pressedActions?.length ?? 0) > 0
  );
}

export function enqueueInputPress(
  queue: QueuedInputPress[],
  sequenceRef: { current: number },
  player: 0 | 1,
  action: ActionName,
  now = performance.now()
) {
  enqueuePress(queue, sequenceRef, player, action, 'keyboard', now);
}

function mergeInputsForRead(
  keyboardInputs: [InputFrame, InputFrame],
  virtualInputs: [InputFrame, InputFrame],
  gamepadInputs: [InputFrame, InputFrame],
  queue: QueuedInputPress[],
  keyboardVerticalTapStates: [VerticalTapState, VerticalTapState],
  virtualVerticalTapStates: [VerticalTapState, VerticalTapState],
  gamepadVerticalTapStates: [VerticalTapState, VerticalTapState],
  consumeQueuedPresses: boolean
): [InputFrame, InputFrame] {
  const merged: [InputFrame, InputFrame] = [emptyInputFrame(), emptyInputFrame()];
  const now = performance.now();
  for (let player = 0; player < 2; player += 1) {
    prepareVerticalTapForRead(keyboardInputs[player], keyboardVerticalTapStates[player], 'keyboard', now);
    prepareVerticalTapForRead(virtualInputs[player], virtualVerticalTapStates[player], 'virtual', now);
    prepareVerticalTapForRead(gamepadInputs[player], gamepadVerticalTapStates[player], 'gamepad', now);
    for (const action of Object.keys(merged[player]) as ActionName[]) {
      merged[player][action] = keyboardInputs[player][action] || virtualInputs[player][action] || gamepadInputs[player][action];
    }
    const horizontalDashDirection =
      (keyboardInputs[player] as InputFrameWithMetadata).__horizontalDashDirection ??
      (virtualInputs[player] as InputFrameWithMetadata).__horizontalDashDirection ??
      (gamepadInputs[player] as InputFrameWithMetadata).__horizontalDashDirection;
    if (horizontalDashDirection) (merged[player] as InputFrameWithMetadata).__horizontalDashDirection = horizontalDashDirection;
  }
  applyQueuedPressesToInputs(merged, queue, consumeQueuedPresses, consumeQueuedPresses ? undefined : menuQueuedActions);
  return merged;
}

export function applyQueuedPressesToInputs(
  inputs: [InputFrame, InputFrame],
  queue: QueuedInputPress[],
  consumeQueuedPresses: boolean,
  actionFilter?: ReadonlySet<ActionName>
) {
  const consumed = new Set<number>();
  const consumedEntries: QueuedInputPress[] = [];
  for (let index = 0; index < queue.length; index += 1) {
    const entry = queue[index];
    if (actionFilter && !actionFilter.has(entry.action)) continue;
    const input = inputs[entry.player];
    input[entry.action] = true;
    const inputMeta = input as InputFrameWithMetadata;
    const pressedActions = inputMeta.__pressedActions ?? [];
    if (!pressedActions.includes(entry.action)) pressedActions.push(entry.action);
    inputMeta.__pressedActions = pressedActions;
    inputMeta.__pressSequences = {
      ...(inputMeta.__pressSequences ?? {}),
      [entry.action]: Math.max(inputMeta.__pressSequences?.[entry.action] ?? 0, entry.sequence)
    };
    consumed.add(index);
    consumedEntries.push(entry);
  }
  if (consumeQueuedPresses && consumed.size > 0) {
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      if (consumed.has(index)) queue.splice(index, 1);
    }
    logInputDebug('consume', {
      consumed: consumedEntries.map((entry) => `${entry.player + 1}:${entry.action}:${entry.source}:${entry.sequence}`),
      queue: formatInputQueueForDebug(queue)
    });
  }
}

function refreshGamepadInputs(
  gamepadInputs: [InputFrame, InputFrame],
  verticalTapStates: [VerticalTapState, VerticalTapState],
  horizontalTapStates: [HorizontalTapState, HorizontalTapState],
  initialized: [boolean, boolean],
  assignments: [GamepadAssignment, GamepadAssignment],
  queue: QueuedInputPress[],
  sequenceRef: { current: number },
  controls: ControlBindingMap
) {
  if (isFightGamepadSuppressed(document.activeElement)) {
    for (let player = 0; player < 2; player += 1) {
      gamepadInputs[player] = emptyInputFrame();
      verticalTapStates[player] = createVerticalTapState();
      horizontalTapStates[player] = createHorizontalTapState();
      initialized[player] = false;
    }
    return;
  }
  const now = performance.now();
  const pads = getVisibleGamepads();
  const previousAssignments = assignments.map((assignment) => assignment?.index ?? null) as [number | null, number | null];
  const playerPads = resolveFightGamepads(pads, assignments);
  for (let player = 0; player < 2; player += 1) {
    if ((assignments[player]?.index ?? null) !== previousAssignments[player]) {
      gamepadInputs[player] = emptyInputFrame();
      verticalTapStates[player] = createVerticalTapState();
      horizontalTapStates[player] = createHorizontalTapState();
      initialized[player] = false;
    }
    const previous = gamepadInputs[player];
    const next = readFightGamepadInput(playerPads[player], controls, player as 0 | 1);
    applyVerticalTap(next, verticalTapStates[player], 'up', next.up, 'gamepad', now);
    applyVerticalTap(next, verticalTapStates[player], 'down', next.down, 'gamepad', now);
    applyHorizontalTap(next, horizontalTapStates[player], 'left', next.left, 'gamepad', now);
    applyHorizontalTap(next, horizontalTapStates[player], 'right', next.right, 'gamepad', now);
    if (!initialized[player]) {
      initialized[player] = true;
    } else {
      for (const action of Object.keys(next) as ActionName[]) {
        if (next[action] && !previous[action]) enqueuePress(queue, sequenceRef, player as 0 | 1, action, 'gamepad', now);
      }
    }
    gamepadInputs[player] = next;
  }
}

function resolveFightGamepads(pads: Gamepad[], assignments: [GamepadAssignment, GamepadAssignment]): [Gamepad | null, Gamepad | null] {
  const byIndex = new Map(pads.map((pad) => [pad.index, pad]));
  const preferredPads = getPreferredGamepads(pads, 0.35);
  for (let player = 0; player < 2; player += 1) {
    if (assignments[player] && !byIndex.has(assignments[player]!.index)) assignments[player] = null;
  }

  const p1 = assignments[0] ? byIndex.get(assignments[0].index) ?? null : null;
  if (!p1 || assignments[0]?.source === 'fallback') {
    const activePad = preferredPads.find((pad) => isGamepadActive(pad, 0.35) && pad.index !== assignments[1]?.index);
    const activeAssignedToP2 = preferredPads.find((pad) => isGamepadActive(pad, 0.35) && pad.index === assignments[1]?.index);
    const selected = activePad ?? activeAssignedToP2 ?? (!p1 ? preferredPads[0] : null);
    if (selected) {
      assignments[0] = { index: selected.index, source: isGamepadActive(selected, 0.35) ? 'active' : 'fallback' };
      if (assignments[1]?.index === selected.index) assignments[1] = null;
    } else if (!p1) {
      assignments[0] = null;
    }
  } else if (isGamepadActive(p1, 0.35)) {
    assignments[0] = { index: p1.index, source: 'active' };
  }

  if (!assignments[1] || !byIndex.has(assignments[1].index) || assignments[1].index === assignments[0]?.index) {
    const p2Pad = preferredPads.find((pad) => pad.index !== assignments[0]?.index) ?? null;
    assignments[1] = p2Pad ? { index: p2Pad.index, source: isGamepadActive(p2Pad, 0.35) ? 'active' : 'fallback' } : null;
  } else {
    const p2 = byIndex.get(assignments[1].index);
    if (p2 && isGamepadActive(p2, 0.35)) assignments[1] = { index: p2.index, source: 'active' };
  }

  return [
    assignments[0] ? byIndex.get(assignments[0].index) ?? null : null,
    assignments[1] ? byIndex.get(assignments[1].index) ?? null : null
  ];
}

function isFightGamepadSuppressed(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('[data-kore-suppress-fight-gamepad="true"]'));
}

function formatInputQueueForDebug(queue: QueuedInputPress[]) {
  return queue.map((entry) => `${entry.player + 1}:${entry.action}:${entry.source}:${entry.sequence}`);
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
  const p1ComboActions = findComboActionsForKey(controls.keyboardCombos[0], keyIds);
  const p2ComboActions = findComboActionsForKey(controls.keyboardCombos[1], keyIds);
  const aiAction = mode === 'ai' || mode === 'cpuArcade' || mode === 'versusCpu' ? findActionForKey(aiModeArrowKeys, keyIds) : undefined;
  if (p1Action) pushUniqueBinding(matches, 1, p1Action);
  p1ComboActions.forEach((action) => pushUniqueBinding(matches, 1, action));
  if (aiAction) pushUniqueBinding(matches, 1, aiAction);
  if (p2Action) pushUniqueBinding(matches, 2, p2Action);
  p2ComboActions.forEach((action) => pushUniqueBinding(matches, 2, action));
  return matches;
}

function findComboActionsForKey(bindings: ControlBindingMap['keyboardCombos'][number], keyIds: string[]) {
  const combo = keybindableButtonComboDefinitions.find((definition) => bindings[definition.id]?.some((value) => keyIds.includes(value)));
  return combo?.actions ?? [];
}

function pushUniqueBinding(matches: Array<{ player: 1 | 2; action: ActionName }>, player: 1 | 2, action: ActionName) {
  if (!matches.some((match) => match.player === player && match.action === action)) matches.push({ player, action });
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
  const config = getVerticalTapConfig(source);
  const sidestepAction = action === 'up' ? 'sidestepUp' : 'sidestepDown';
  const laneAction = action === 'up' ? 'sidewalkUp' : 'sidewalkDown';
  const oppositeSidestepAction = action === 'up' ? 'sidestepDown' : 'sidestepUp';
  const oppositeLaneAction = action === 'up' ? 'sidewalkDown' : 'sidewalkUp';
  const direction = action === 'up' ? -1 : 1;
  const lastTapKey = action === 'up' ? 'lastUpTap' : 'lastDownTap';

  if (pressed) {
    if (state.heldAction === action) {
      if (state.laneDirection === direction && state.laneMode === 'holdCandidate' && !state.laneStepConsumed) {
        input[action] = false;
        input[sidestepAction] = true;
        input[laneAction] = false;
        return true;
      }
      input[action] = state.holdActivated;
      input[sidestepAction] = false;
      input[laneAction] = false;
      return true;
    }
    if (now - state[lastTapKey] <= config.doubleTapMs) {
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
      state[lastTapKey] = Number.NEGATIVE_INFINITY;
    } else {
      resetLaneState(input, state);
      input[action] = false;
      input[sidestepAction] = false;
      input[laneAction] = false;
      state.holdAction = action;
      state.holdStartedAt = now;
      state.holdActivated = false;
      state.heldAction = action;
      state[lastTapKey] = now;
    }
  } else {
    input[action] = false;
    if (state.heldAction !== action) return true;
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
    if (state.laneDirection === direction) resetLaneState(input, state);
  }
  return true;
}

export function applyHorizontalTap(
  input: InputFrame,
  state: HorizontalTapState,
  action: ActionName,
  pressed: boolean,
  source: VerticalInputSource = 'keyboard',
  now = performance.now()
) {
  if (action !== 'left' && action !== 'right') return false;
  const doubleTapMs = getHorizontalDoubleTapMs(source);
  const lastTapKey = action === 'left' ? 'lastLeftTap' : 'lastRightTap';
  const oppositeAction = action === 'left' ? 'right' : 'left';
  const oppositeLastTapKey = action === 'left' ? 'lastRightTap' : 'lastLeftTap';

  if (pressed) {
    input[action] = true;
    input[oppositeAction] = false;
    state[oppositeLastTapKey] = Number.NEGATIVE_INFINITY;
    if (state.heldAction === oppositeAction) state.heldAction = null;
    if (state.heldAction === action) {
      if (state.dashAction === action) (input as InputFrameWithMetadata).__horizontalDashDirection = action;
      return true;
    }
    if (now - state[lastTapKey] <= doubleTapMs) {
      (input as InputFrameWithMetadata).__horizontalDashDirection = action;
      state.dashAction = action;
      state[lastTapKey] = Number.NEGATIVE_INFINITY;
    }
    state.heldAction = action;
  } else {
    input[action] = false;
    if (state.heldAction === action) {
      state[lastTapKey] = now;
      state.heldAction = null;
    }
  }
  return true;
}

export function consumeHorizontalTapAfterRead(input: InputFrame, state: HorizontalTapState, _source: VerticalInputSource) {
  input.dashForward = false;
  input.dashBack = false;
  delete (input as InputFrameWithMetadata).__horizontalDashDirection;
  state.dashAction = null;
}

export function prepareVerticalTapForRead(input: InputFrame, state: VerticalTapState, source: VerticalInputSource, now = performance.now()) {
  const config = getVerticalTapConfig(source);
  if (state.holdAction && state.heldAction === state.holdAction) {
    if (now - state.holdStartedAt >= config.holdMs) {
      state.holdActivated = true;
      input[state.holdAction] = true;
    } else {
      input[state.holdAction] = false;
    }
  }

  if (state.laneDirection === 0 || state.laneMode === 'none') return;
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

function getVerticalTapConfig(source: VerticalInputSource) {
  return source === 'gamepad'
    ? { doubleTapMs: GAMEPAD_VERTICAL_DOUBLE_TAP_MS, holdMs: GAMEPAD_VERTICAL_HOLD_MS }
    : { doubleTapMs: DOUBLE_TAP_MS, holdMs: VERTICAL_HOLD_MS };
}

function getHorizontalDoubleTapMs(source: VerticalInputSource) {
  return source === 'gamepad' ? GAMEPAD_HORIZONTAL_DOUBLE_TAP_MS : DOUBLE_TAP_MS;
}

export function consumeVerticalTapAfterRead(input: InputFrame, state: VerticalTapState, _source: VerticalInputSource) {
  if (state.laneDirection === 0 || state.laneMode !== 'holdCandidate' || state.laneStepConsumed) return;
  const action = state.laneDirection < 0 ? 'up' : 'down';
  const sidestepAction = action === 'up' ? 'sidestepUp' : 'sidestepDown';
  if (!input[sidestepAction]) return;
  input[sidestepAction] = false;
  state.laneStepConsumed = true;
}

function resetLaneState(input: InputFrame, state: VerticalTapState) {
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
}

import { keybindableButtonComboDefinitions } from './buttonCombos';
import { emptyInputFrame, type ActionName, type ControlBindingMap, type InputFrame } from '../types';

export type MenuGamepadState = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  confirm: boolean;
  back: boolean;
  select: boolean;
  help: boolean;
  helpNext: boolean;
};

export type PageGamepadState = {
  previous: boolean;
  next: boolean;
};

export type GamepadSelectionSummary = {
  index: number;
  id: string;
  mapping: Gamepad['mapping'];
  connected: boolean;
  active: boolean;
  buttonCount: number;
  axisCount: number;
  score: number;
};

export const MENU_GAMEPAD_SELECT_BUTTON = 8;
export const MENU_HELP_GAMEPAD_BUTTON = 4;
export const MENU_HELP_NEXT_GAMEPAD_BUTTON = 5;
export const CHARACTER_SELECT_PREVIOUS_PAGE_GAMEPAD_BUTTON = 6;
export const CHARACTER_SELECT_NEXT_PAGE_GAMEPAD_BUTTON = 7;

const MENU_GAMEPAD_DEADZONE = 0.45;
const FIGHT_GAMEPAD_DEADZONE = 0.35;
const ACTIVE_GAMEPAD_DEADZONE = 0.55;

export function getVisibleGamepads(): Gamepad[] {
  if (typeof navigator === 'undefined') return [];
  try {
    const pads = navigator.getGamepads?.() ?? [];
    return Array.from(pads)
      .filter((pad): pad is Gamepad => Boolean(pad?.connected))
      .sort((a, b) => a.index - b.index);
  } catch {
    return [];
  }
}

export function getPrimaryGamepad() {
  return getPreferredGamepads()[0] ?? null;
}

export function getPlayerGamepad(playerIndex: 0 | 1) {
  return getPreferredGamepads()[playerIndex] ?? null;
}

export function hasActiveGamepadInput(deadzone = ACTIVE_GAMEPAD_DEADZONE) {
  return getVisibleGamepads().some((pad) => isGamepadActive(pad, deadzone));
}

export function isGamepadActive(pad: Gamepad, deadzone = ACTIVE_GAMEPAD_DEADZONE) {
  return pad.buttons.some((button) => button.pressed) || pad.axes.some((axis) => Math.abs(axis) > deadzone);
}

export function getPreferredGamepads(pads: Gamepad[] = getVisibleGamepads(), deadzone = FIGHT_GAMEPAD_DEADZONE) {
  return [...pads].sort((a, b) => {
    const scoreDelta = getGamepadSelectionScore(b, deadzone) - getGamepadSelectionScore(a, deadzone);
    return scoreDelta || a.index - b.index;
  });
}

export function getGamepadSelectionScore(pad: Gamepad, deadzone = FIGHT_GAMEPAD_DEADZONE) {
  const id = pad.id.toLowerCase();
  let score = 0;
  if (isGamepadActive(pad, deadzone)) score += 1000;
  if (pad.mapping === 'standard') score += 160;
  if (/(xinput|xbox|steam virtual|steam input|wireless controller|dualsense|dualshock|gamepad)/i.test(id)) score += 60;
  if (pad.buttons.length >= 16 && pad.axes.length >= 2) score += 30;
  if (pad.buttons.length < 8 || pad.axes.length < 2) score -= 80;
  if (/(mouse|keyboard|desktop|trackpad|touchpad|lizard)/i.test(id)) score -= 120;
  return score;
}

export function describeGamepadSelection(pad: Gamepad, deadzone = FIGHT_GAMEPAD_DEADZONE): GamepadSelectionSummary {
  return {
    index: pad.index,
    id: pad.id,
    mapping: pad.mapping,
    connected: pad.connected,
    active: isGamepadActive(pad, deadzone),
    buttonCount: pad.buttons.length,
    axisCount: pad.axes.length,
    score: getGamepadSelectionScore(pad, deadzone)
  };
}

export function readMenuGamepadState(pad: Gamepad, selectActsAsBack: boolean): MenuGamepadState {
  const directions = readGamepadDirections(pad, MENU_GAMEPAD_DEADZONE);
  const selectPressed = isGamepadButtonPressed(pad, MENU_GAMEPAD_SELECT_BUTTON);
  return {
    up: directions.up,
    down: directions.down,
    left: directions.left,
    right: directions.right,
    confirm: isGamepadButtonPressed(pad, 0),
    back: isGamepadButtonPressed(pad, 1) || (selectActsAsBack && selectPressed),
    select: selectPressed,
    help: isGamepadButtonPressed(pad, MENU_HELP_GAMEPAD_BUTTON),
    helpNext: isGamepadButtonPressed(pad, MENU_HELP_NEXT_GAMEPAD_BUTTON)
  };
}

export function readPageGamepadState(pad: Gamepad): PageGamepadState {
  return {
    previous: isGamepadButtonPressed(pad, CHARACTER_SELECT_PREVIOUS_PAGE_GAMEPAD_BUTTON),
    next: isGamepadButtonPressed(pad, CHARACTER_SELECT_NEXT_PAGE_GAMEPAD_BUTTON)
  };
}

export function readFightGamepadInput(pad: Gamepad | null, controls: ControlBindingMap, playerIndex: 0 | 1): InputFrame {
  const next = emptyInputFrame();
  if (!pad) return next;

  const directions = readGamepadDirections(pad, FIGHT_GAMEPAD_DEADZONE);
  const rightVertical = pad.axes[3] ?? 0;
  next.left = directions.left;
  next.right = directions.right;
  next.up = directions.up;
  next.down = directions.down;
  next.cycleTargetUp = rightVertical < -FIGHT_GAMEPAD_DEADZONE;
  next.cycleTargetDown = rightVertical > FIGHT_GAMEPAD_DEADZONE;

  const gamepadBindings = controls.gamepad[playerIndex];
  for (const action of Object.keys(gamepadBindings) as ActionName[]) {
    if (gamepadBindings[action]?.some((index) => isGamepadButtonPressed(pad, index))) next[action] = true;
  }

  const comboBindings = controls.gamepadCombos[playerIndex];
  for (const combo of keybindableButtonComboDefinitions) {
    if (!comboBindings[combo.id]?.some((index) => isGamepadButtonPressed(pad, index))) continue;
    combo.actions.forEach((action) => {
      next[action] = true;
    });
  }

  return next;
}

export function isGamepadButtonPressed(pad: Gamepad, buttonIndex: number) {
  return Boolean(pad.buttons[buttonIndex]?.pressed);
}

function readGamepadDirections(pad: Gamepad, deadzone: number) {
  const horizontal = pad.axes[0] ?? 0;
  const vertical = pad.axes[1] ?? 0;
  const dpadLeft = isGamepadButtonPressed(pad, 14);
  const dpadRight = isGamepadButtonPressed(pad, 15);
  const dpadUp = isGamepadButtonPressed(pad, 12);
  const dpadDown = isGamepadButtonPressed(pad, 13);
  const hat = pad.mapping === 'standard' ? null : readHatAxisDirections(pad, deadzone);
  const hatLeft = hat?.left ?? false;
  const hatRight = hat?.right ?? false;
  const hatUp = hat?.up ?? false;
  const hatDown = hat?.down ?? false;
  const left = dpadLeft !== dpadRight ? dpadLeft : hatLeft !== hatRight ? hatLeft : horizontal < -deadzone;
  const right = dpadLeft !== dpadRight ? dpadRight : hatLeft !== hatRight ? hatRight : horizontal > deadzone;
  const up = dpadUp !== dpadDown ? dpadUp : hatUp !== hatDown ? hatUp : vertical < -deadzone;
  const down = dpadUp !== dpadDown ? dpadDown : hatUp !== hatDown ? hatDown : vertical > deadzone;
  return { left, right, up, down };
}

function readHatAxisDirections(pad: Gamepad, deadzone: number) {
  const horizontal = pad.axes[6];
  const vertical = pad.axes[7];
  if (!Number.isFinite(horizontal) && !Number.isFinite(vertical)) return null;
  return {
    left: Number.isFinite(horizontal) && horizontal < -deadzone,
    right: Number.isFinite(horizontal) && horizontal > deadzone,
    up: Number.isFinite(vertical) && vertical < -deadzone,
    down: Number.isFinite(vertical) && vertical > deadzone
  };
}

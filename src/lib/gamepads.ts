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
  return getVisibleGamepads()[0] ?? null;
}

export function getPlayerGamepad(playerIndex: 0 | 1) {
  return getVisibleGamepads()[playerIndex] ?? null;
}

export function hasActiveGamepadInput(deadzone = ACTIVE_GAMEPAD_DEADZONE) {
  return getVisibleGamepads().some((pad) => isGamepadActive(pad, deadzone));
}

export function isGamepadActive(pad: Gamepad, deadzone = ACTIVE_GAMEPAD_DEADZONE) {
  return pad.buttons.some((button) => button.pressed) || pad.axes.some((axis) => Math.abs(axis) > deadzone);
}

export function readMenuGamepadState(pad: Gamepad, selectActsAsBack: boolean): MenuGamepadState {
  const horizontal = pad.axes[0] ?? 0;
  const vertical = pad.axes[1] ?? 0;
  const selectPressed = isGamepadButtonPressed(pad, MENU_GAMEPAD_SELECT_BUTTON);
  return {
    up: isGamepadButtonPressed(pad, 12) || vertical < -MENU_GAMEPAD_DEADZONE,
    down: isGamepadButtonPressed(pad, 13) || vertical > MENU_GAMEPAD_DEADZONE,
    left: isGamepadButtonPressed(pad, 14) || horizontal < -MENU_GAMEPAD_DEADZONE,
    right: isGamepadButtonPressed(pad, 15) || horizontal > MENU_GAMEPAD_DEADZONE,
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

  const horizontal = pad.axes[0] ?? 0;
  const vertical = pad.axes[1] ?? 0;
  const rightVertical = pad.axes[3] ?? 0;
  const dpadLeft = isGamepadButtonPressed(pad, 14);
  const dpadRight = isGamepadButtonPressed(pad, 15);
  if (dpadLeft !== dpadRight) {
    next.left = dpadLeft;
    next.right = dpadRight;
  } else if (!dpadLeft && !dpadRight) {
    next.left = horizontal < -FIGHT_GAMEPAD_DEADZONE;
    next.right = horizontal > FIGHT_GAMEPAD_DEADZONE;
  }
  const dpadUp = isGamepadButtonPressed(pad, 12);
  const dpadDown = isGamepadButtonPressed(pad, 13);
  if (dpadUp !== dpadDown) {
    next.up = dpadUp;
    next.down = dpadDown;
  } else if (!dpadUp && !dpadDown) {
    next.up = vertical < -FIGHT_GAMEPAD_DEADZONE;
    next.down = vertical > FIGHT_GAMEPAD_DEADZONE;
  }
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

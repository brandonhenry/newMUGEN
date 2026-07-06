import { afterEach, describe, expect, it } from 'vitest';
import { defaultGameSettings } from './gameSettings';
import { getPlayerGamepad, getPrimaryGamepad, getVisibleGamepads, readFightGamepadInput, readMenuGamepadState } from './gamepads';

afterEach(() => {
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: undefined
  });
});

describe('gamepad helpers', () => {
  it('uses the first visible connected gamepad from sparse Firefox-style arrays', () => {
    const pad = makeGamepad({ index: 4, buttons: { 0: true } });
    mockGamepads([null, pad]);

    expect(getVisibleGamepads()).toEqual([pad]);
    expect(getPrimaryGamepad()).toBe(pad);
    expect(getPlayerGamepad(0)).toBe(pad);

    const input = readFightGamepadInput(getPlayerGamepad(0), defaultGameSettings.controls, 0);
    expect(input.jab).toBe(true);
  });

  it('sorts visible pads by stable Gamepad index for player assignment', () => {
    const laterPad = makeGamepad({ index: 8, buttons: { 1: true } });
    const earlierPad = makeGamepad({ index: 2, buttons: { 2: true } });
    mockGamepads([null, laterPad, earlierPad]);

    expect(getPlayerGamepad(0)).toBe(earlierPad);
    expect(getPlayerGamepad(1)).toBe(laterPad);
    expect(readFightGamepadInput(getPlayerGamepad(0), defaultGameSettings.controls, 0).heavy).toBe(true);
    expect(readFightGamepadInput(getPlayerGamepad(1), defaultGameSettings.controls, 1).kick).toBe(true);
  });

  it('converts stick axes and D-pad buttons into fight movement', () => {
    const axisPad = makeGamepad({ axes: [-0.8, 0.75] });
    const dpadPad = makeGamepad({ buttons: { 12: true, 15: true } });

    const axisInput = readFightGamepadInput(axisPad, defaultGameSettings.controls, 0);
    expect(axisInput.left).toBe(true);
    expect(axisInput.down).toBe(true);

    const dpadInput = readFightGamepadInput(dpadPad, defaultGameSettings.controls, 0);
    expect(dpadInput.up).toBe(true);
    expect(dpadInput.right).toBe(true);
  });

  it('converts face buttons and Start into fight actions', () => {
    const pad = makeGamepad({ buttons: { 0: true, 1: true, 2: true, 3: true, 9: true } });

    const input = readFightGamepadInput(pad, defaultGameSettings.controls, 0);
    expect(input.jab).toBe(true);
    expect(input.kick).toBe(true);
    expect(input.heavy).toBe(true);
    expect(input.special).toBe(true);
    expect(input.pause).toBe(true);
  });

  it('uses menu D-pad, face buttons, and select-as-back policy', () => {
    const pad = makeGamepad({ buttons: { 8: true, 12: true, 15: true } });

    expect(readMenuGamepadState(pad, true)).toMatchObject({ up: true, right: true, select: true, back: true });
    expect(readMenuGamepadState(pad, false)).toMatchObject({ up: true, right: true, select: true, back: false });
  });
});

function mockGamepads(pads: Array<Gamepad | null>) {
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => pads
  });
}

function makeGamepad({
  index = 0,
  connected = true,
  buttons = {},
  axes = [0, 0]
}: {
  index?: number;
  connected?: boolean;
  buttons?: Record<number, boolean>;
  axes?: number[];
} = {}): Gamepad {
  return {
    id: `Test Gamepad ${index}`,
    index,
    connected,
    mapping: 'standard',
    timestamp: 0,
    buttons: Array.from({ length: 17 }, (_, buttonIndex) => ({
      pressed: Boolean(buttons[buttonIndex]),
      touched: Boolean(buttons[buttonIndex]),
      value: buttons[buttonIndex] ? 1 : 0
    })),
    axes,
    vibrationActuator: null
  } as unknown as Gamepad;
}

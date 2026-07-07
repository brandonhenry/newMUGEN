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

  it('sorts equal-quality visible pads by stable Gamepad index for player assignment', () => {
    const laterPad = makeGamepad({ index: 8, buttons: { 1: true } });
    const earlierPad = makeGamepad({ index: 2, buttons: { 2: true } });
    mockGamepads([null, laterPad, earlierPad]);

    expect(getPlayerGamepad(0)).toBe(earlierPad);
    expect(getPlayerGamepad(1)).toBe(laterPad);
    expect(readFightGamepadInput(getPlayerGamepad(0), defaultGameSettings.controls, 0).heavy).toBe(true);
    expect(readFightGamepadInput(getPlayerGamepad(1), defaultGameSettings.controls, 1).kick).toBe(true);
  });

  it('prefers an active standard virtual pad over a lower-index idle raw Deck-like pad', () => {
    const idleDesktopPad = makeGamepad({ index: 0, id: 'Steam Deck Desktop Controller', mapping: '' });
    const activeVirtualPad = makeGamepad({
      index: 3,
      id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
      buttons: { 0: true }
    });
    mockGamepads([idleDesktopPad, activeVirtualPad]);

    expect(getPrimaryGamepad()).toBe(activeVirtualPad);
    expect(getPlayerGamepad(0)).toBe(activeVirtualPad);
    expect(getPlayerGamepad(1)).toBe(idleDesktopPad);
    expect(readFightGamepadInput(getPrimaryGamepad(), defaultGameSettings.controls, 0).jab).toBe(true);
  });

  it('prefers a standard virtual pad over an idle nonstandard desktop-shaped pad', () => {
    const desktopPad = makeGamepad({ index: 0, id: 'Steam Deck Desktop Mouse', mapping: '' });
    const virtualPad = makeGamepad({ index: 2, id: 'Steam Virtual Gamepad', mapping: 'standard' });
    mockGamepads([desktopPad, virtualPad]);

    expect(getPrimaryGamepad()).toBe(virtualPad);
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

  it('uses nonstandard hat axes as additive D-pad fallback', () => {
    const hatPad = makeGamepad({ mapping: '', axes: [0, 0, 0, 0, 0, 0, -1, 1] });

    expect(readFightGamepadInput(hatPad, defaultGameSettings.controls, 0)).toMatchObject({ left: true, down: true });
    expect(readMenuGamepadState(hatPad, false)).toMatchObject({ left: true, down: true });
  });

  it('does not let standard-pad auxiliary axes override normal direction axes', () => {
    const pad = makeGamepad({ axes: [0, -0.8, 0, 0, 0, 0, 1, 1] });

    expect(readFightGamepadInput(pad, defaultGameSettings.controls, 0)).toMatchObject({ up: true, right: false, down: false });
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

  it('reports shoulders as menu guide paging without changing fight block bindings', () => {
    const pad = makeGamepad({ buttons: { 4: true, 5: true } });

    expect(readMenuGamepadState(pad, false)).toMatchObject({ help: true, helpNext: true });
    expect(readFightGamepadInput(pad, defaultGameSettings.controls, 0).block).toBe(true);
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
  id = `Test Gamepad ${index}`,
  connected = true,
  mapping = 'standard',
  buttons = {},
  axes = [0, 0]
}: {
  index?: number;
  id?: string;
  connected?: boolean;
  mapping?: Gamepad['mapping'];
  buttons?: Record<number, boolean>;
  axes?: number[];
} = {}): Gamepad {
  return {
    id,
    index,
    connected,
    mapping,
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

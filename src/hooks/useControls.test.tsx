import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { starterCharacters } from '../data/characters';
import { stages } from '../data/stages';
import { createMatch, stepMatch } from '../engine/fightEngine';
import { cloneSettings, defaultGameSettings } from '../lib/gameSettings';
import { emptyInputFrame, type InputFrameWithMetadata } from '../types';
import { applyVerticalTap, createVerticalTapState, prepareVerticalTapForRead, useControls } from './useControls';

type ControlsApi = ReturnType<typeof useControls>;

let controlsApi: ControlsApi | null = null;

function Harness() {
  controlsApi = useControls('trainingOnline');
  return (
    <>
      <input aria-label="Stale menu input" />
      <input aria-label="Chat" data-kore-suppress-fight-gamepad="true" />
    </>
  );
}

afterEach(() => {
  cleanup();
  controlsApi = null;
  vi.restoreAllMocks();
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: undefined
  });
});

describe('useControls', () => {
  it('promotes the active gamepad to player one when a lower-index pad is idle', () => {
    const idlePad = makeMutableGamepad({ index: 0 });
    const activePad = makeMutableGamepad({ index: 1 });
    mockGamepads([idlePad, activePad]);
    render(<Harness />);

    expect(controlsApi?.peekInputs()[0]).toMatchObject({ right: false, jab: false });

    setGamepadButton(activePad, 15, true);
    setGamepadButton(activePad, 0, true);
    expect(controlsApi?.peekInputs()[0]).toMatchObject({ right: true, jab: true });
    expect(controlsApi?.peekInputs()[1]).toMatchObject({ right: false, jab: false });
  });

  it('keeps normal fight gamepad input alive when stale text entry focus remains', () => {
    mockGamepads([makeGamepad({ buttons: { 0: true, 15: true } })]);
    render(<Harness />);

    screen.getByLabelText('Stale menu input').focus();
    expect(controlsApi?.peekInputs()[0]).toMatchObject({ right: true, jab: true });
  });

  it('suppresses fight gamepad input only for explicit controller chat fields', () => {
    mockGamepads([makeGamepad({ buttons: { 0: true, 15: true } })]);
    render(<Harness />);

    screen.getByLabelText('Chat').focus();
    expect(controlsApi?.peekInputs()[0]).toMatchObject({ right: false, jab: false });
  });

  it('feeds KORE fight controls from the active gamepad', () => {
    const activePad = makeMutableGamepad({ index: 2 });
    mockGamepads([makeMutableGamepad({ index: 0 }), activePad]);
    render(<Harness />);
    setGamepadButton(activePad, 0, true);

    const [p1Input] = controlsApi!.readInputsForStep();
    const match = stepMatch(createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p'), p1Input, emptyInputFrame(), 1 / 60);

    expect(match.controlScheme).toBe('kore');
    expect(match.fighters[0].currentMove?.input).toBe('jab');
  });

  it('feeds Beginner fight controls from the active gamepad', () => {
    const activePad = makeMutableGamepad({ index: 2 });
    mockGamepads([makeMutableGamepad({ index: 0 }), activePad]);
    const settings = cloneSettings(defaultGameSettings);
    settings.game.controlScheme = 'beginner';
    function BeginnerHarness() {
      controlsApi = useControls('training', settings.controls);
      return <div />;
    }
    render(<BeginnerHarness />);
    setGamepadButton(activePad, 3, true);

    const [p1Input] = controlsApi!.readInputsForStep();
    const match = stepMatch(
      createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p', 3, { controlScheme: 'beginner' }),
      p1Input,
      emptyInputFrame(),
      1 / 60
    );

    expect(match.controlScheme).toBe('beginner');
    expect(match.fighters[0].currentMove?.input).toBe('jab');
  });

  it('does not synthesize forward dash while holding controller back', () => {
    const pad = makeMutableGamepad({ index: 0, buttons: { 14: true } });
    mockGamepads([pad]);
    render(<Harness />);

    for (let frame = 0; frame < 360; frame += 1) {
      const [p1Input] = controlsApi!.readInputsForStep();
      expect(p1Input.left).toBe(true);
      expect(p1Input.right).toBe(false);
      expect(p1Input.dashForward).toBe(false);
      expect(p1Input.dashBack).toBe(false);
      expect((p1Input as InputFrameWithMetadata).__horizontalDashDirection).toBeUndefined();
    }
  });

  it('keeps analog back jitter from becoming semantic forward dash', () => {
    const pad = makeMutableGamepad({ index: 0, axes: [-0.8, 0] });
    mockGamepads([pad]);
    render(<Harness />);

    expect(controlsApi!.readInputsForStep()[0]).toMatchObject({ left: true, dashForward: false });
    setGamepadAxis(pad, 0, -0.32);
    expect(controlsApi!.readInputsForStep()[0]).toMatchObject({ left: false, dashForward: false });
    setGamepadAxis(pad, 0, -0.82);
    const [p1Input] = controlsApi!.readInputsForStep();

    expect(p1Input.left).toBe(true);
    expect(p1Input.dashForward).toBe(false);
  });

  it('lets D-pad back win over noisy forward stick input', () => {
    const pad = makeMutableGamepad({ index: 0, buttons: { 14: true }, axes: [0.9, 0] });
    mockGamepads([pad]);
    render(<Harness />);

    const [p1Input] = controlsApi!.readInputsForStep();

    expect(p1Input.left).toBe(true);
    expect(p1Input.right).toBe(false);
    expect(p1Input.dashForward).toBe(false);
  });

  it('does not synthesize forward dash while holding mobile back', () => {
    render(<Harness />);

    controlsApi!.setVirtualAction(1, 'left', true);
    for (let frame = 0; frame < 180; frame += 1) {
      const [p1Input] = controlsApi!.readInputsForStep();
      expect(p1Input.left).toBe(true);
      expect(p1Input.dashForward).toBe(false);
      expect((p1Input as InputFrameWithMetadata).__horizontalDashDirection).toBeUndefined();
    }
    controlsApi!.setVirtualAction(1, 'left', false);
  });

  it('turns slower gamepad D-pad up double taps into sidestep instead of jump', () => {
    const pad = makeMutableGamepad({ index: 0 });
    mockGamepads([pad]);
    render(<Harness />);
    setNow(0);
    controlsApi!.peekInputs();

    setNow(100);
    setGamepadButton(pad, 12, true);
    expect(controlsApi!.readInputsForStep()[0]).toMatchObject({ up: false, sidestepUp: false });

    setNow(220);
    setGamepadButton(pad, 12, false);
    controlsApi!.readInputsForStep();

    setNow(860);
    setGamepadButton(pad, 12, true);
    expect(controlsApi!.readInputsForStep()[0]).toMatchObject({ up: false, sidestepUp: true, sidewalkUp: false });
  });

  it('turns slower gamepad D-pad down double taps into sidestep instead of crouch', () => {
    const pad = makeMutableGamepad({ index: 0 });
    mockGamepads([pad]);
    render(<Harness />);
    setNow(0);
    controlsApi!.peekInputs();

    setNow(100);
    setGamepadButton(pad, 13, true);
    expect(controlsApi!.readInputsForStep()[0]).toMatchObject({ down: false, sidestepDown: false });

    setNow(220);
    setGamepadButton(pad, 13, false);
    controlsApi!.readInputsForStep();

    setNow(860);
    setGamepadButton(pad, 13, true);
    expect(controlsApi!.readInputsForStep()[0]).toMatchObject({ down: false, sidestepDown: true, sidewalkDown: false });
  });

  it('still turns held gamepad up into jump input after the gamepad hold threshold', () => {
    const pad = makeMutableGamepad({ index: 0 });
    mockGamepads([pad]);
    render(<Harness />);
    setNow(0);
    controlsApi!.peekInputs();

    setNow(100);
    setGamepadButton(pad, 12, true);
    expect(controlsApi!.readInputsForStep()[0].up).toBe(false);

    setNow(341);
    expect(controlsApi!.readInputsForStep()[0]).toMatchObject({ up: true, sidestepUp: false });
  });

  it('keeps the keyboard double-tap window stricter than the gamepad window', () => {
    const input = emptyInputFrame();
    const state = createVerticalTapState();

    applyVerticalTap(input, state, 'up', true, 'keyboard', 100);
    applyVerticalTap(input, state, 'up', false, 'keyboard', 180);
    applyVerticalTap(input, state, 'up', true, 'keyboard', 720);
    prepareVerticalTapForRead(input, state, 'keyboard', 721);

    expect(input.up).toBe(false);
    expect(input.sidestepUp).toBe(false);
  });
});

function mockGamepads(pads: Array<Gamepad | null>) {
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => pads
  });
}

function makeGamepad(options: Parameters<typeof makeMutableGamepad>[0] = {}): Gamepad {
  return makeMutableGamepad(options);
}

function makeMutableGamepad({
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

function setGamepadButton(gamepad: Gamepad, buttonIndex: number, pressed: boolean) {
  const button = gamepad.buttons[buttonIndex] as unknown as { pressed: boolean; touched: boolean; value: number };
  button.pressed = pressed;
  button.touched = pressed;
  button.value = pressed ? 1 : 0;
}

function setGamepadAxis(gamepad: Gamepad, axisIndex: number, value: number) {
  (gamepad.axes as number[])[axisIndex] = value;
}

function setNow(now: number) {
  vi.spyOn(performance, 'now').mockReturnValue(now);
}

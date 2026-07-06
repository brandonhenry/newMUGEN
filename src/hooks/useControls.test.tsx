import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { starterCharacters } from '../data/characters';
import { stages } from '../data/stages';
import { createMatch, stepMatch } from '../engine/fightEngine';
import { cloneSettings, defaultGameSettings } from '../lib/gameSettings';
import { emptyInputFrame } from '../types';
import { useControls } from './useControls';

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

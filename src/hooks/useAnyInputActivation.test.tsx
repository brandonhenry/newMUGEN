import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAnyInputActivation } from './useAnyInputActivation';

function Harness({
  enabled = true,
  ready = true,
  onAccept
}: {
  enabled?: boolean;
  ready?: boolean;
  onAccept: () => void;
}) {
  useAnyInputActivation({ enabled, ready, onAccept });
  return <div />;
}

afterEach(() => {
  cleanup();
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: undefined
  });
});

describe('useAnyInputActivation', () => {
  it('ignores tap input until ready, then accepts it once', () => {
    const onAccept = vi.fn();
    const { rerender } = render(<Harness ready={false} onAccept={onAccept} />);

    window.dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true }));
    expect(onAccept).not.toHaveBeenCalled();

    rerender(<Harness ready onAccept={onAccept} />);
    window.dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true }));
    window.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('accepts a browser gamepad connection event once', () => {
    const onAccept = vi.fn();
    render(<Harness onAccept={onAccept} />);

    window.dispatchEvent(new Event('gamepadconnected', { bubbles: true, cancelable: true }));
    window.dispatchEvent(new Event('gamepadconnected', { bubbles: true, cancelable: true }));

    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('accepts exposed active gamepad input from polling', async () => {
    const onAccept = vi.fn();
    const pad = makeGamepad();
    mockGamepads([pad]);

    render(<Harness onAccept={onAccept} />);

    setGamepadButton(pad, 0, true);

    await waitFor(() => expect(onAccept).toHaveBeenCalledTimes(1));
  });

  it('requires neutral gamepad input before accepting a carried held button', async () => {
    const onAccept = vi.fn();
    const pad = makeGamepad({ buttons: { 0: true } });
    mockGamepads([pad]);

    render(<Harness onAccept={onAccept} />);

    await waitForAnimationFrames(3);
    expect(onAccept).not.toHaveBeenCalled();

    setGamepadButton(pad, 0, false);
    await waitForAnimationFrames(3);
    expect(onAccept).not.toHaveBeenCalled();

    setGamepadButton(pad, 0, true);
    await waitFor(() => expect(onAccept).toHaveBeenCalledTimes(1));
  });
});

function mockGamepads(pads: Array<Gamepad | null>) {
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => pads
  });
}

function makeGamepad({ buttons = {}, axes = [0, 0] }: { buttons?: Record<number, boolean>; axes?: number[] } = {}): Gamepad {
  return {
    id: 'Test Gamepad',
    index: 1,
    connected: true,
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

function waitForAnimationFrames(count: number) {
  return new Promise<void>((resolve) => {
    const step = (remaining: number) => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(() => step(remaining - 1));
    };
    step(count);
  });
}

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
    mockGamepads([makeGamepad({ buttons: { 0: true } })]);

    render(<Harness onAccept={onAccept} />);

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

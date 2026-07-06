import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnlineTrainingChat } from './App';

const defaultProps = {
  messages: [],
  localName: 'You',
  remoteName: 'Partner'
};

afterEach(() => {
  cleanup();
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: undefined
  });
});

describe('OnlineTrainingChat', () => {
  it('focuses from Enter and sends from keyboard Enter', () => {
    const onSend = vi.fn();
    render(<OnlineTrainingChat {...defaultProps} onSend={onSend} />);

    fireEvent.keyDown(window, { key: 'Enter' });
    const input = screen.getByLabelText('Online sparring chat message') as HTMLInputElement;
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: 'ggs' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSend).toHaveBeenCalledWith('ggs');
    expect(input.value).toBe('');
  });

  it('sends from the visible button for touch and mouse input', () => {
    const onSend = vi.fn();
    render(<OnlineTrainingChat {...defaultProps} onSend={onSend} />);

    const input = screen.getByLabelText('Online sparring chat message') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'ready' } });
    fireEvent.click(screen.getByLabelText('Send online sparring chat message'));

    expect(onSend).toHaveBeenCalledWith('ready');
    expect(input.value).toBe('');
  });

  it('opens, edits, and sends with controller Select, D-pad, and A button', async () => {
    const onSend = vi.fn();
    const gamepad = makeMutableGamepad();
    mockGamepads([gamepad]);
    render(<OnlineTrainingChat {...defaultProps} onSend={onSend} />);

    const input = screen.getByLabelText('Online sparring chat message') as HTMLInputElement;
    await act(async () => {
      setGamepadButton(gamepad, 8, true);
      await nextFrame();
    });
    await waitFor(() => expect(document.activeElement).toBe(input));
    await act(async () => {
      setGamepadButton(gamepad, 8, false);
      await nextFrame();
    });

    await act(async () => {
      setGamepadButton(gamepad, 12, true);
      await nextFrame();
    });
    await waitFor(() => expect(input.value).toBe('A'));
    await act(async () => {
      setGamepadButton(gamepad, 12, false);
      await nextFrame();
    });

    await act(async () => {
      setGamepadButton(gamepad, 0, true);
      await nextFrame();
    });
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('A'));
    expect(input.value).toBe('');
  });
});

function mockGamepads(pads: Array<Gamepad | null>) {
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => pads
  });
}

function makeMutableGamepad(): Gamepad {
  return {
    id: 'Test Gamepad',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({
      pressed: false,
      touched: false,
      value: 0
    })),
    axes: [0, 0],
    vibrationActuator: null
  } as unknown as Gamepad;
}

function setGamepadButton(gamepad: Gamepad, buttonIndex: number, pressed: boolean) {
  const button = gamepad.buttons[buttonIndex] as unknown as { pressed: boolean; touched: boolean; value: number };
  button.pressed = pressed;
  button.touched = pressed;
  button.value = pressed ? 1 : 0;
}

function nextFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

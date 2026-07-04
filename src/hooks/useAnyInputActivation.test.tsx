import { cleanup, render } from '@testing-library/react';
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
});

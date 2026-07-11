import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChangeSideDialog } from './App';

describe('ChangeSideDialog', () => {
  it('shows the saved side, changes only its draft, and confirms with Confirm', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<ChangeSideDialog currentSide="left" onCancel={onCancel} onConfirm={onConfirm} />);

    expect(screen.getByRole('radio', { name: 'left' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'right' }));
    expect(screen.getByRole('radio', { name: 'right' }).getAttribute('aria-checked')).toBe('true');
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledWith('right');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels without confirming the draft', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<ChangeSideDialog currentSide="left" onCancel={onCancel} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('radio', { name: 'right' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

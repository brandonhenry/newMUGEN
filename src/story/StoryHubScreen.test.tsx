import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdventureStatPointNotification } from './AdventureStatPointNotification';

afterEach(cleanup);

describe('Adventure stat point notification', () => {
  it('shows newly earned and available points with working upgrade and dismiss actions', () => {
    const onUpgrade = vi.fn();
    const onDismiss = vi.fn();
    render(<AdventureStatPointNotification
      notice={{ id: 1, gained: 2, available: 4, level: 7 }}
      reducedMotion
      onUpgrade={onUpgrade}
      onDismiss={onDismiss}
    />);

    const notice = screen.getByTestId('story-stat-point-notice');
    expect(notice.classList.contains('is-reduced-motion')).toBe(true);
    expect(screen.getByText('Level 7 reached')).toBeTruthy();
    expect(screen.getByText('+2 Stat Points')).toBeTruthy();
    expect(screen.getByText('4', { selector: 'b' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Open Adventure Stats. 4 stat points available.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss stat point notification' }));
    expect(onUpgrade).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

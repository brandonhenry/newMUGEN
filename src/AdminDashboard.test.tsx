import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminDashboard } from './AdminDashboard';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

describe('AdminDashboard', () => {
  it('keeps tournament administration and removes local PostHog analytics controls', () => {
    render(<AdminDashboard />);
    expect(screen.getByRole('heading', { name: 'KORE Tournament Admin' })).toBeTruthy();
    expect(screen.getByLabelText('Admin token')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Tournament Reviews' })).toBeTruthy();
    expect(screen.queryByLabelText('Project token')).toBeNull();
    expect(screen.queryByText('Endpoint Setup')).toBeNull();
    expect(screen.queryByLabelText('KORE dashboard stats')).toBeNull();
  });

  it('loads official tournament controls with the admin token', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ tournament: { id: 'official-1', name: 'K.O.R.E. Open', status: 'registration', entries: [] } })
    } as Response));
    vi.stubGlobal('fetch', fetchMock);
    render(<AdminDashboard />);
    fireEvent.change(screen.getByLabelText('Admin token'), { target: { value: 'admin-secret' } });
    fireEvent.click(screen.getByRole('button', { name: /load event/i }));
    await waitFor(() => expect(screen.getByDisplayValue('K.O.R.E. Open')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith('/.netlify/functions/tournament-admin-official', expect.objectContaining({
      method: 'GET', headers: expect.objectContaining({ authorization: 'Bearer admin-secret' })
    }));
  });

  it('refreshes unresolved tournament reviews', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ reviews: [{ tournamentId: 'paid-1', kind: 'paidOnline', matchId: 'm1', reportState: 'conflict', entryA: { id: 'a', displayName: 'ALPHA' }, entryB: { id: 'b', displayName: 'BETA' } }] })
    } as Response)));
    render(<AdminDashboard />);
    fireEvent.click(screen.getByRole('button', { name: /refresh reviews/i }));
    await waitFor(() => expect(screen.getByText((_, element) => element?.tagName === 'TD' && element.textContent === 'paidOnline paid-1')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'ALPHA' })).toBeTruthy();
  });
});

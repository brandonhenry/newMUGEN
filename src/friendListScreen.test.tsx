import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FriendListScreen } from './App';
import { FRIENDS_STORAGE_KEY, MATCH_HISTORY_STORAGE_KEY } from './lib/socialHistory';
import type { CharacterDefinition, StageDefinition } from './types';

const profile = { playerId: 'me-player', displayName: 'ME' };
const friend = { profileId: 'me-player', playerId: 'friend-player', displayName: 'RIVAL', addedAt: Date.now(), lastPlayedAt: Date.now(), lastCharacterId: 'dax' };
const roster = [
  { id: 'astra', displayName: 'Astra' },
  { id: 'dax', displayName: 'Dax' }
] as CharacterDefinition[];
const stages = [{ id: 'training-area', name: 'Training Area' }] as StageDefinition[];

describe('FriendListScreen', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(FRIENDS_STORAGE_KEY, JSON.stringify([friend]));
    window.localStorage.setItem(MATCH_HISTORY_STORAGE_KEY, JSON.stringify([{
      id: 'match-1',
      profileId: 'me-player',
      createdAt: Date.now(),
      mode: 'private',
      stageId: 'training-area',
      localCharacterId: 'astra',
      opponent: { playerId: 'friend-player', displayName: 'RIVAL', characterId: 'dax' },
      result: 'win',
      score: [2, 0],
      recordingIds: []
    }]));
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/friend-chat-list')) {
        return jsonResponse({ messages: [] });
      }
      if (url.endsWith('/friend-chat-send')) {
        const body = JSON.parse(String(init?.body ?? '{}'));
        return jsonResponse({
          id: 'chat-1',
          fromPlayerId: body.fromPlayerId,
          fromDisplayName: body.fromDisplayName,
          toPlayerId: body.toPlayerId,
          text: body.text,
          sentAt: Date.now()
        });
      }
      return jsonResponse({}, 404);
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows friend presence, stats, invite action, and sends chat', async () => {
    const onInviteFriend = vi.fn();
    render(
      <FriendListScreen
        profile={profile}
        roster={roster}
        stages={stages}
        presence={{ 'friend-player': { playerId: 'friend-player', displayName: 'RIVAL', online: true, peerId: 'peer', characterId: 'dax', lastSeenAt: Date.now() } }}
        inbox={[]}
        onInviteFriend={onInviteFriend}
        onJoinInvite={vi.fn()}
        onDeclineInvite={vi.fn()}
        onBack={vi.fn()}
        onAnalytics={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: 'Friend List' })).toBeTruthy();
    expect(screen.getAllByText('Online')[0]).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Invite/ }));
    expect(onInviteFriend).toHaveBeenCalledWith(expect.objectContaining({ playerId: 'friend-player' }));

    const input = screen.getByLabelText('Online sparring chat message') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'ggs' } });
    fireEvent.click(screen.getByLabelText('Send online sparring chat message'));

    await waitFor(() => expect(screen.getByText('ggs')).toBeTruthy());
  });
});

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  }));
}

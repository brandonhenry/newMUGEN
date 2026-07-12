import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FightHud } from './App';
import { starterCharacters } from './data/characters';
import { stages } from './data/stages';
import { createMatch } from './engine/fightEngine';
import type { CharacterDefinition, MatchMode, MatchSnapshot } from './types';

afterEach(cleanup);

function hudCharacter(index: number, overrides: Partial<CharacterDefinition> = {}) {
  const source = starterCharacters[index];
  return {
    ...source,
    faceCardPath: `/characters/${source.id}/face-card.png`,
    ...overrides
  };
}

function hudMatch(mode: MatchMode = 'local2p', roundsToWin = 3) {
  return createMatch(hudCharacter(0), hudCharacter(1), stages[0], mode, 3, {
    maxHealth: 100,
    roundTime: mode === 'training' ? 0 : 99,
    roundsToWin
  });
}

describe('FightHud', () => {
  it('renders generated shells around existing pixel animation frames and dynamic meters', () => {
    const match = hudMatch('local2p', 5);
    const left = match.fighters[0];
    left.hp = 24;
    left.displayRecoverableHp = 18;
    left.displayKi = 55;
    left.displayTransformOvercharge = 72;
    left.transformReadyTimer = 20;
    left.roundsWon = 2;

    const { container } = render(<FightHud match={match} hudScale={1} />);
    const leftHud = screen.getByTestId('fighter-hud-left');

    expect(leftHud.classList.contains('danger')).toBe(true);
    expect(leftHud.classList.contains('has-recoverable')).toBe(true);
    expect(screen.getByTestId('fighter-portrait-left').getAttribute('src')).toBe(starterCharacters[0].animationFrames?.idle?.[0]);
    expect(screen.getByTestId('fighter-portrait-left').getAttribute('data-portrait-source')).toBe('frame');
    expect(container.querySelectorAll('img.health-shell-art[src="/ui/fight-hud/fighter-shell.png"]')).toHaveLength(2);
    expect(container.querySelector('img.round-box-frame')?.getAttribute('src')).toBe('/ui/fight-hud/timer-frame.png');
    expect((screen.getByTestId('fighter-health-left').querySelector('.current-health-fill') as HTMLElement).style.width).toBe('24%');
    expect((screen.getByTestId('fighter-health-left').querySelector('.recoverable-health-fill') as HTMLElement).style.width).toBe('42%');
    expect((screen.getByTestId('fighter-ki-left').querySelector('.ki-fill') as HTMLElement).style.width).toBe('55%');
    expect(within(leftHud).getByLabelText('Naruto rounds won').querySelectorAll('span')).toHaveLength(5);
    expect(within(leftHud).getByLabelText('Naruto rounds won').querySelectorAll('span.won')).toHaveLength(2);
  });

  it.each([
    { timer: 99, expected: '99' },
    { timer: 7, expected: '7' },
    { timer: 0, expected: '0' }
  ])('renders stable pixel-image timer digits for $expected', ({ timer, expected }) => {
    const match = hudMatch();
    match.timer = timer;
    const { container } = render(<FightHud match={match} hudScale={1} />);
    expect(screen.getByTestId('fight-hud-timer').textContent).toContain(expected);
    expect(screen.getByTestId('fight-hud-timer').getAttribute('aria-label')).toBe(`Time ${expected}`);
    expect(Array.from(container.querySelectorAll<HTMLImageElement>('.round-box-digit')).map((image) => image.getAttribute('src'))).toEqual(
      expected.split('').map((digit) => `/ui/fight-hud/timer-digits/${digit}.png`)
    );
  });

  it('renders infinity in training and mirrors fighter data without mirroring portrait content', () => {
    const match = hudMatch('training');
    const p1 = match.fighters[0];
    const p2 = match.fighters[1];
    p1.character = hudCharacter(0, { displayName: 'Left Source', faceCardPath: '/faces/left.png', animationFrames: {} });
    p2.character = hudCharacter(1, { displayName: 'Right Source', faceCardPath: '/faces/right.png', animationFrames: {} });

    render(<FightHud match={match as MatchSnapshot} hudScale={1} presentationMirrored />);

    expect(screen.getByTestId('fight-hud-timer').textContent).toContain('∞');
    expect(screen.getByTestId('fight-hud-timer-infinity').getAttribute('src')).toBe('/ui/fight-hud/timer-infinity.png');
    expect(screen.getByTestId('fighter-hud-left').textContent).toContain('Right Source');
    expect(screen.getByTestId('fighter-portrait-left').getAttribute('src')).toBe('/faces/right.png');
    expect(screen.getByTestId('fighter-hud-right').textContent).toContain('Left Source');
    expect(screen.getByTestId('fighter-portrait-right').getAttribute('src')).toBe('/faces/left.png');
  });

  it('uses online player names in the nameplates and mirrors them with their fighter slots', () => {
    const match = hudMatch('ai');

    const { rerender } = render(
      <FightHud match={match} hudScale={1} onlineWins={[2, 1]} playerNames={['LOCAL HERO', 'REMOTE RIVAL']} />
    );

    expect(screen.getByTestId('fighter-name-left').textContent).toBe('LOCAL HERO');
    expect(screen.getByTestId('fighter-name-right').textContent).toBe('REMOTE RIVAL');

    rerender(
      <FightHud match={match} hudScale={1} onlineWins={[2, 1]} playerNames={['LOCAL HERO', 'REMOTE RIVAL']} presentationMirrored />
    );

    expect(screen.getByTestId('fighter-name-left').textContent).toBe('REMOTE RIVAL');
    expect(screen.getByTestId('fighter-name-right').textContent).toBe('LOCAL HERO');
  });
});

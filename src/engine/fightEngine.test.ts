import { describe, expect, it } from 'vitest';
import { starterCharacters } from '../data/characters';
import { stages } from '../data/stages';
import { normalizeCharacter, normalizeMove, validateCharacter } from '../lib/characterLoader';
import { cloneSettings, defaultGameSettings, sanitizeGameSettings } from '../lib/gameSettings';
import {
  applyVerticalTap,
  consumeVerticalTapAfterRead,
  createVerticalTapState,
  getKeyboardBindingsForEvent,
  prepareVerticalTapForRead
} from '../hooks/useControls';
import { emptyInputFrame, type CharacterDefinition, type MoveDefinition, type MoveInput } from '../types';
import { activeMoveProgress, createMatch, getAuthoredNeutralStringDamageCeiling, getAuthoredNeutralStringRouteCount, stepMatch } from './fightEngine';

function unwrappedAngleDelta(next: number, previous: number) {
  let delta = next - previous;
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function makeKiClashCharacter(character: CharacterDefinition, kiBurst = true): CharacterDefinition {
  return {
    ...character,
    moves: character.moves.map((move) =>
      move.input === 'jab'
        ? {
            ...move,
            kiBurst,
            kiCost: 0,
            startupFrames: 1,
            activeFrames: 24,
            recoveryFrames: 10,
            damage: 12,
            range: 2.4,
            hitbox: {
              offset: [0, 1.1, 0.72],
              size: [1.35, 1.35, 1.65]
            }
          }
        : move
    )
  };
}

function startKiClashMatch() {
  let match = createPreparedClashMatch();
  return stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
}

function createPreparedClashMatch(p1KiBurst = true, p2KiBurst = true) {
  const match = createMatch(makeKiClashCharacter(starterCharacters[0], p1KiBurst), makeKiClashCharacter(starterCharacters[1], p2KiBurst), stages[0], 'local2p');
  match.phase = 'fighting';
  match.countdown = 0;
  match.fighters[0].position.x = -0.7;
  match.fighters[1].position.x = 0.7;
  match.fighters.forEach((fighter) => {
    const move = fighter.character.moves.find((candidate) => candidate.input === 'jab');
    if (!move) throw new Error('missing jab');
    fighter.state = 'attack';
    fighter.currentMove = move;
    fighter.moveFrame = 1;
    fighter.actionFramesRemaining = 28;
    fighter.actionTimer = 28 / 60;
    fighter.hitConnected = false;
    fighter.hitConfirmed = false;
  });
  return match;
}

function clashWrongButton(button: MoveInput | undefined): MoveInput {
  const order: MoveInput[] = ['jab', 'heavy', 'kick', 'special'];
  const index = order.indexOf(button ?? 'jab');
  return order[(index + 1) % order.length] ?? 'heavy';
}

describe('character manifests', () => {
  it('ships starter characters without loader warnings', () => {
    expect(starterCharacters.map((character) => [character.id, validateCharacter(character)])).toEqual([
      ['kiro', []],
      ['riven', []]
    ]);
  });

  it('ships starter launchers disabled by default so Characters controls the toggle', () => {
    for (const character of starterCharacters) {
      const baseLaunchers = character.moves.filter((move) => (move.launchHeight ?? 0) > 0);
      const overrideLaunchers = Object.values(character.moveOverrides ?? {}).filter((move) => (move.launchHeight ?? 0) > 0);
      const launchers = [...baseLaunchers, ...overrideLaunchers];

      expect(launchers.length, `${character.displayName} default launcher count`).toBe(0);
    }
  });

  it('ships starter tornado moves disabled by default so Characters controls the toggle', () => {
    for (const character of starterCharacters) {
      const baseTornadoes = character.moves.filter((move) => move.tornado);
      const overrideTornadoes = Object.values(character.moveOverrides ?? {}).filter((move) => move.tornado);

      expect([...baseTornadoes, ...overrideTornadoes].length, `${character.displayName} default tornado count`).toBe(0);
    }
  });

  it('ships starter block damage disabled by default so Characters controls chip damage', () => {
    for (const character of starterCharacters) {
      const baseChipMoves = character.moves.filter((move) => move.blockDamage > 0);
      const overrideChipMoves = Object.values(character.moveOverrides ?? {}).filter((move) => (move.blockDamage ?? 0) > 0);

      expect([...baseChipMoves, ...overrideChipMoves].length, `${character.displayName} default chip count`).toBe(0);
    }
  });

  it('keeps starter and shared string damage inside the v1 balance budget', () => {
    for (const character of starterCharacters) {
      const authoredMoves = [
        ...character.moves.map((move) => ({ key: move.id, damage: move.damage })),
        ...Object.entries(character.moveOverrides ?? {})
          .filter(([, move]) => move.damage != null)
          .map(([key, move]) => ({ key, damage: move.damage ?? 0 }))
      ];

      for (const move of authoredMoves) {
        expect(move.damage, `${character.displayName} ${move.key}`).toBeLessThanOrEqual(16);
      }
    }

    expect(getAuthoredNeutralStringDamageCeiling()).toBeLessThanOrEqual(15);
  });

  it('converts legacy second timing to frame timing', () => {
    const legacy = normalizeMove({
      ...starterCharacters[0].moves[0],
      startupFrames: undefined as unknown as number,
      activeFrames: undefined as unknown as number,
      recoveryFrames: undefined as unknown as number,
      startup: 0.1,
      active: 0.12,
      recovery: 0.23,
      push: 0.72,
      hitstun: 0.32
    });

    expect(legacy.startupFrames).toBe(6);
    expect(legacy.activeFrames).toBe(7);
    expect(legacy.recoveryFrames).toBe(14);
    expect(legacy.hitLevel).toBe('high');
  });

  it('normalizes authored tornado move data as an explicit boolean', () => {
    const move = normalizeMove({
      ...starterCharacters[0].moves[0],
      tornado: true,
      forwardForce: 0.75,
      forwardForceStartFrame: 2,
      forwardForceEndFrame: 8
    });

    expect(move.tornado).toBe(true);
    expect(move.forwardForce).toBe(0.75);
    expect(move.forwardForceStartFrame).toBe(2);
    expect(move.forwardForceEndFrame).toBe(8);
  });

  it('migrates legacy base button animation data to left/right limb keys', () => {
    const normalized = normalizeCharacter({
      ...starterCharacters[0],
      animationFrames: {
        ...(starterCharacters[0].animationFrames ?? {}),
        'cmd:3': ['/legacy-command.png'],
        kick: ['/legacy-kick.png']
      },
      animationFrameRates: {
        ...(starterCharacters[0].animationFrameRates ?? {}),
        'cmd:3': 3,
        kick: 7
      },
      moveOverrides: {
        ...(starterCharacters[0].moveOverrides ?? {}),
        'cmd:3': { damage: 3 },
        kick: { damage: 4 },
        kickleft: { damage: 8 }
      }
    });

    expect(normalized.animationFrames?.kickleft).toEqual(['/legacy-kick.png']);
    expect(normalized.animationFrames?.kick).toBeUndefined();
    expect(normalized.animationFrames?.['cmd:3']).toBeUndefined();
    expect(normalized.animationFrameRates?.kickleft).toBe(7);
    expect(normalized.moveOverrides?.kickleft?.damage).toBe(8);
    expect(normalized.moveOverrides?.kick).toBeUndefined();
    expect(normalized.moveOverrides?.['cmd:3']).toBeUndefined();
  });

  it('drives attack animation progress from startup active and recovery frames', () => {
    const frameDataCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) =>
        move.input === 'jab'
          ? {
              ...move,
              startupFrames: 4,
              activeFrames: 6,
              recoveryFrames: 8,
              range: 0.1
            }
          : move
      )
    };
    let match = createMatch(frameDataCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -5;
    match.fighters[1].position.x = 5;

    const jab = emptyInputFrame();
    jab.jab = true;
    match = stepMatch(match, jab, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].currentMove?.startupFrames).toBe(4);
    expect(match.fighters[0].currentMove?.activeFrames).toBe(6);
    expect(match.fighters[0].currentMove?.recoveryFrames).toBe(8);
    expect(match.fighters[0].actionFramesRemaining).toBe(18);
    expect(activeMoveProgress(match.fighters[0])).toBe(0);

    for (let frame = 0; frame < 6; frame += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].moveFrame).toBe(6);
    expect(activeMoveProgress(match.fighters[0])).toBeCloseTo(6 / 18, 4);
    expect(match.fighters[0].state).toBe('attack');
  });

  it('applies authored move forward force while an attack is whiffing', () => {
    const lungeCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) =>
        move.input === 'jab'
          ? {
              ...move,
              startupFrames: 2,
              activeFrames: 2,
              recoveryFrames: 2,
              range: 0.1,
              forwardForce: 0.6,
              forwardForceStartFrame: 1,
              forwardForceEndFrame: 6
            }
          : move
      )
    };
    let match = createMatch(lungeCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -3;
    match.fighters[1].position.x = 3;

    const jab = emptyInputFrame();
    jab.jab = true;
    match = stepMatch(match, jab, emptyInputFrame(), 1 / 60);
    const startX = match.fighters[0].position.x;
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].position.x).toBeGreaterThan(startX);
    expect(match.fighters[0].hitConnected).toBe(false);
  });

  it('starts a clash when two active kiBurst hitboxes overlap', () => {
    let match = createPreparedClashMatch();
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.clashState.status).toBe('intro');
    expect(match.clashState.sequence).toHaveLength(3);
    expect(match.fighters[0].hp).toBe(match.fighters[0].character.stats.health);
    expect(match.fighters[1].hp).toBe(match.fighters[1].character.stats.health);
  });

  it('does not start a clash for non-ki active hitboxes', () => {
    let match = createPreparedClashMatch(false, true);
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.clashState.status).toBe('none');
  });

  it('freezes timer and attack frames during clash input', () => {
    let match = startKiClashMatch();
    for (let frame = 0; frame < 45; frame += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(match.clashState.status).toBe('input');
    const timer = match.timer;
    const p1MoveFrame = match.fighters[0].moveFrame;
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.timer).toBe(timer);
    expect(match.fighters[0].moveFrame).toBe(p1MoveFrame);
  });

  it('resolves a clash win when one player completes the sequence and the other fails', () => {
    let match = startKiClashMatch();
    for (let frame = 0; frame < 45; frame += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    const sequence = match.clashState.sequence;
    const wrong = clashWrongButton(sequence[0]);
    const p2Wrong = emptyInputFrame();
    p2Wrong[wrong] = true;
    match = stepMatch(match, emptyInputFrame(), p2Wrong, 1 / 60);
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    for (const button of sequence) {
      const input = emptyInputFrame();
      input[button] = true;
      match = stepMatch(match, input, emptyInputFrame(), 1 / 60);
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.clashState.status).toBe('result');
    expect(match.clashState.winnerSlot).toBe(1);
    expect(match.fighters[1].hp).toBeLessThan(match.fighters[1].character.stats.health);
    expect(match.combatEvents[match.combatEvents.length - 1]?.kind).toMatch(/clash/);
  });

  it('resolves a clash draw when both players complete on the same frame', () => {
    let match = startKiClashMatch();
    for (let frame = 0; frame < 45; frame += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    for (const button of match.clashState.sequence) {
      const input = emptyInputFrame();
      input[button] = true;
      match = stepMatch(match, input, input, 1 / 60);
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.clashState.status).toBe('result');
    expect(match.clashState.winnerSlot).toBeNull();
    expect(match.message).toBe('CLASH DRAW');
  });

  it('sanitizes partial settings and fills defaults', () => {
    const settings = sanitizeGameSettings({
      game: { roundTimer: 75 },
      controls: { keyboard: [{ jab: ['KeyP'] }] },
      display: { touchControls: 'on', impactSparks: { shape: 'ring', hitColor: '#12ABef', size: 9, intensity: -2 } },
      audio: { bgmTrackIndex: 300 }
    });

    expect(settings.game.roundTimer).toBe(75);
    expect(settings.controls.keyboard[0].jab).toEqual(['KeyP']);
    expect(settings.controls.keyboard[0].up).toEqual(defaultGameSettings.controls.keyboard[0].up);
    expect(settings.controls.keyboard[1].right).toEqual(defaultGameSettings.controls.keyboard[1].right);
    expect(settings.display.touchControls).toBe('on');
    expect(settings.display.impactSparks.shape).toBe('ring');
    expect(settings.display.impactSparks.hitColor).toBe('#12ABef');
    expect(settings.display.impactSparks.blockColor).toBe(defaultGameSettings.display.impactSparks.blockColor);
    expect(settings.display.impactSparks.size).toBe(1.8);
    expect(settings.display.impactSparks.intensity).toBe(0.35);
    expect(settings.camera.distance).toBe(defaultGameSettings.camera.distance);
    expect(settings.audio.bgmTrackIndex).toBe(99);
  });

  it('resolves remapped keyboard bindings', () => {
    const settings = cloneSettings(defaultGameSettings);
    settings.controls.keyboard[0].jab = ['KeyP'];
    const event = new KeyboardEvent('keydown', { code: 'KeyP', key: 'p' });

    expect(getKeyboardBindingsForEvent(event, 'local2p', settings.controls)).toEqual([{ player: 1, action: 'jab' }]);
  });

  it('turns single up and down holds into jump and crouch without firing on tap', () => {
    const input = emptyInputFrame();
    const state = createVerticalTapState();

    applyVerticalTap(input, state, 'up', true, 'keyboard', 100);
    prepareVerticalTapForRead(input, state, 'keyboard', 180);
    expect(input.up).toBe(false);
    expect(input.sidestepUp).toBe(false);
    expect(input.sidewalkUp).toBe(false);
    prepareVerticalTapForRead(input, state, 'keyboard', 295);
    expect(input.up).toBe(true);
    applyVerticalTap(input, state, 'up', false, 'keyboard', 315);
    expect(input.up).toBe(false);

    applyVerticalTap(input, state, 'down', true, 'keyboard', 520);
    prepareVerticalTapForRead(input, state, 'keyboard', 600);
    expect(input.down).toBe(false);
    prepareVerticalTapForRead(input, state, 'keyboard', 710);
    expect(input.down).toBe(true);
    expect(input.sidestepDown).toBe(false);
    expect(input.sidewalkDown).toBe(false);
  });

  it('uses release timing and a forgiving window for vertical double taps', () => {
    const input = emptyInputFrame();
    const state = createVerticalTapState();

    applyVerticalTap(input, state, 'up', true, 'keyboard', 100);
    applyVerticalTap(input, state, 'up', false, 'keyboard', 165);
    applyVerticalTap(input, state, 'up', true, 'keyboard', 570);
    prepareVerticalTapForRead(input, state, 'keyboard', 571);

    expect(input.up).toBe(false);
    expect(input.sidestepUp).toBe(true);
    expect(input.sidewalkUp).toBe(false);
  });

  it('does not turn a completed jump hold into the first tap of a lane step', () => {
    const input = emptyInputFrame();
    const state = createVerticalTapState();

    applyVerticalTap(input, state, 'up', true, 'keyboard', 100);
    prepareVerticalTapForRead(input, state, 'keyboard', 300);
    expect(input.up).toBe(true);
    applyVerticalTap(input, state, 'up', false, 'keyboard', 315);

    applyVerticalTap(input, state, 'up', true, 'keyboard', 330);
    prepareVerticalTapForRead(input, state, 'keyboard', 331);
    expect(input.up).toBe(false);
    expect(input.sidestepUp).toBe(false);
    expect(input.sidewalkUp).toBe(false);
  });

  it('turns double tap up or down into one lane step', () => {
    const input = emptyInputFrame();
    const state = createVerticalTapState();

    applyVerticalTap(input, state, 'up', true, 'keyboard', 100);
    applyVerticalTap(input, state, 'up', false, 'keyboard', 130);
    applyVerticalTap(input, state, 'up', true, 'keyboard', 210);
    prepareVerticalTapForRead(input, state, 'keyboard', 211);
    expect(input.up).toBe(false);
    expect(input.sidestepUp).toBe(true);
    expect(input.sidewalkUp).toBe(false);

    consumeVerticalTapAfterRead(input, state, 'keyboard');
    prepareVerticalTapForRead(input, state, 'keyboard', 240);
    expect(input.sidestepUp).toBe(false);
    expect(input.sidewalkUp).toBe(false);
    applyVerticalTap(input, state, 'up', false, 'keyboard', 250);

    applyVerticalTap(input, state, 'down', true, 'keyboard', 500);
    applyVerticalTap(input, state, 'down', false, 'keyboard', 530);
    applyVerticalTap(input, state, 'down', true, 'keyboard', 610);
    prepareVerticalTapForRead(input, state, 'keyboard', 611);
    expect(input.down).toBe(false);
    expect(input.sidestepDown).toBe(true);
    expect(input.sidewalkDown).toBe(false);
  });

  it('does not promote the held second vertical tap into continuous lane walking', () => {
    const input = emptyInputFrame();
    const state = createVerticalTapState();

    applyVerticalTap(input, state, 'down', true, 'keyboard', 100);
    applyVerticalTap(input, state, 'down', false, 'keyboard', 125);
    applyVerticalTap(input, state, 'down', true, 'keyboard', 200);
    prepareVerticalTapForRead(input, state, 'keyboard', 201);
    consumeVerticalTapAfterRead(input, state, 'keyboard');

    prepareVerticalTapForRead(input, state, 'keyboard', 360);
    expect(input.sidestepDown).toBe(false);
    expect(input.sidewalkDown).toBe(false);

    applyVerticalTap(input, state, 'down', false, 'keyboard', 390);
    expect(input.sidewalkDown).toBe(false);

    applyVerticalTap(input, state, 'down', true, 'keyboard', 930);
    prepareVerticalTapForRead(input, state, 'keyboard', 1010);
    expect(input.down).toBe(false);
    prepareVerticalTapForRead(input, state, 'keyboard', 1120);
    expect(input.down).toBe(true);
    expect(input.sidestepDown).toBe(false);
    expect(input.sidewalkDown).toBe(false);
  });
});

describe('fight engine', () => {
  it('starts fight-created matches in an entry intro when enabled', () => {
    const match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p', 3, { playIntro: true });

    expect(match.phase).toBe('intro');
    expect(match.message).toBe('');
    expect(match.fighters[0].state).toBe('entry');
    expect(match.fighters[1].state).toBe('entry');
  });

  it('keeps default/menu-style matches immediate when intro is not enabled', () => {
    const match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu');

    expect(match.phase).toBe('fighting');
    expect(match.introEnabled).toBe(false);
  });

  it('shows round and fight callouts after the entry intro', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p', 3, { playIntro: true });

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1.25);
    expect(match.phase).toBe('intro');
    expect(match.message).toBe('ROUND 1');
    expect(match.fighters[0].state).toBe('idle');

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1);
    expect(match.phase).toBe('intro');
    expect(match.message).toBe('FIGHT');

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 0.7);
    expect(match.phase).toBe('fighting');
    expect(match.message).toBe('');
  });

  it('ignores movement and attacks during round intro', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p', 3, { playIntro: true });
    const startX = match.fighters[0].position.x;
    const attack = emptyInputFrame();
    attack.right = true;
    attack.jab = true;

    match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);

    expect(match.phase).toBe('intro');
    expect(match.fighters[0].position.x).toBe(startX);
    expect(match.fighters[0].currentMove).toBeNull();
  });

  it('starts round two with intro while preserving round wins', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p', 3, { playIntro: true });
    match.phase = 'roundOver';
    match.countdown = 0.01;
    match.message = 'K.O.';
    match.fighters[0].roundsWon = 1;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.phase).toBe('intro');
    expect(match.round).toBe(2);
    expect(match.fighters[0].roundsWon).toBe(1);
    expect(match.fighters[1].roundsWon).toBe(0);
    expect(match.fighters[0].state).toBe('entry');
  });

  it('requires three round wins to win a match', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p', 3, { playIntro: true });
    match.phase = 'roundOver';
    match.countdown = 0.01;
    match.message = 'K.O.';
    match.fighters[0].roundsWon = 2;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.phase).toBe('intro');
    expect(match.round).toBe(2);
    expect(match.fighters[0].roundsWon).toBe(2);

    match.phase = 'roundOver';
    match.countdown = 0.01;
    match.message = 'K.O.';
    match.fighters[0].roundsWon = 3;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.phase).toBe('matchOver');
    expect(match.winnerSlot).toBe(1);
  });

  it('moves fighters toward each other with right input', () => {
    const match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    const p1 = emptyInputFrame();
    p1.right = true;
    const next = stepMatch(match, p1, emptyInputFrame(), 1 / 60);
    expect(next.fighters[0].position.x).toBeGreaterThan(match.fighters[0].position.x);
  });

  it('drives both fighters from AI in CPU vs CPU mode', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu');
    match.phase = 'fighting';
    match.countdown = 0;
    const p1StartX = match.fighters[0].position.x;
    const p2StartX = match.fighters[1].position.x;

    for (let i = 0; i < 6; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].position.x).toBeGreaterThan(p1StartX);
    expect(match.fighters[1].position.x).toBeLessThan(p2StartX);
  });

  it('keeps the opponent dummy passive in training mode', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'training', 5);
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.72;
    match.fighters[1].position.x = 0.72;
    const p2Attack = emptyInputFrame();
    p2Attack.left = true;
    p2Attack.jab = true;
    p2Attack.heavy = true;

    for (let i = 0; i < 120; i += 1) {
      match = stepMatch(match, emptyInputFrame(), p2Attack, 1 / 60);
      expect(match.fighters[1].state).not.toBe('attack');
      expect(match.fighters[1].currentMove).toBeNull();
    }

    expect(match.fighters[0].hp).toBe(starterCharacters[0].stats.health);
  });

  it('does not clear player attacks every frame in training mode', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'training', 5);
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.72;
    match.fighters[1].position.x = 0.72;

    const p1Attack = emptyInputFrame();
    p1Attack.jab = true;
    match = stepMatch(match, p1Attack, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('attack');
    expect(match.fighters[0].currentMove).not.toBeNull();

    p1Attack.jab = false;
    for (let i = 0; i < 3; i += 1) {
      match = stepMatch(match, p1Attack, emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].state).toBe('attack');
    expect(match.fighters[0].moveFrame).toBeGreaterThan(0);
  });

  it('keeps training mode infinite by refilling zero health without ending the round', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'training', 5);
    match.phase = 'fighting';
    match.countdown = 0;
    match.timer = 0.01;
    match.fighters[0].hp = 0;
    match.fighters[1].hp = -4;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.phase).toBe('fighting');
    expect(match.round).toBe(1);
    expect(match.winnerSlot).toBeNull();
    expect(match.fighters[0].roundsWon).toBe(0);
    expect(match.fighters[1].roundsWon).toBe(0);
    expect(match.fighters[0].hp).toBe(starterCharacters[0].stats.health);
    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health);
    expect(match.timer).toBe(60);
  });

  it('allows training health reset to be disabled', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'training', 5, { trainingInfiniteHealth: false });
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[1].hp = 0;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.phase).toBe('roundOver');
    expect(match.message).toBe('K.O.');
    expect(match.visualTimeScale).toBeLessThan(1);
    expect(match.fighters[1].hp).toBe(0);
  });

  it('uses custom round timer settings for new matches', () => {
    const match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p', 3, { roundTime: 45 });

    expect(match.roundTime).toBe(45);
    expect(match.timer).toBe(45);
  });

  it('keeps CPU fighters attacking during an extended exchange', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu');
    match.phase = 'fighting';
    match.countdown = 0;
    let attackFrames = 0;
    let movingFrames = 0;

    for (let i = 0; i < 420; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      if (match.fighters.some((fighter) => fighter.state === 'attack')) attackFrames += 1;
      if (match.fighters.some((fighter) => fighter.state === 'walk' || fighter.state === 'sidestep')) movingFrames += 1;
      if (match.phase !== 'fighting') break;
    }

    expect(attackFrames).toBeGreaterThan(80);
    expect(movingFrames).toBeGreaterThan(20);
  });

  it('lets CPU vs CPU fighters connect attacks without needing point-blank spacing', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 4);
    match.phase = 'fighting';
    match.countdown = 0;
    const startHp = [match.fighters[0].hp, match.fighters[1].hp];

    for (let i = 0; i < 900; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      if (match.phase !== 'fighting') break;
    }

    expect(match.lastHitId).toBeGreaterThan(0);
    const totalDamage = startHp[0] - match.fighters[0].hp + (startHp[1] - match.fighters[1].hp);
    expect(totalDamage).toBeGreaterThan(0);
  });

  it('keeps CPU fighters from attacking until their selected move is in range', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 5);
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -7;
    match.fighters[1].position.x = 7;
    const startDistance = Math.hypot(
      match.fighters[1].position.x - match.fighters[0].position.x,
      match.fighters[1].position.z - match.fighters[0].position.z
    );
    let outOfRangeAttackFrames = 0;
    let walkFrames = 0;

    for (let i = 0; i < 75; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      const currentDistance = Math.hypot(
        match.fighters[1].position.x - match.fighters[0].position.x,
        match.fighters[1].position.z - match.fighters[0].position.z
      );
      if (currentDistance > 2.8 && match.fighters.some((fighter) => fighter.state === 'attack')) outOfRangeAttackFrames += 1;
      if (match.fighters.some((fighter) => fighter.state === 'walk')) walkFrames += 1;
    }

    const endDistance = Math.hypot(
      match.fighters[1].position.x - match.fighters[0].position.x,
      match.fighters[1].position.z - match.fighters[0].position.z
    );
    expect(outOfRangeAttackFrames).toBe(0);
    expect(endDistance).toBeLessThan(startDistance);
    expect(walkFrames).toBeGreaterThan(0);
  });

  it('backs CPU fighters up when they are crowded instead of always swinging', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 3);
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.25;
    match.fighters[1].position.x = 0.25;
    const startDistance = Math.hypot(
      match.fighters[1].position.x - match.fighters[0].position.x,
      match.fighters[1].position.z - match.fighters[0].position.z
    );
    let attackFrames = 0;

    for (let i = 0; i < 12; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      if (match.fighters.some((fighter) => fighter.state === 'attack')) attackFrames += 1;
    }

    const endDistance = Math.hypot(
      match.fighters[1].position.x - match.fighters[0].position.x,
      match.fighters[1].position.z - match.fighters[0].position.z
    );
    expect(attackFrames).toBe(0);
    expect(endDistance).toBeGreaterThan(startDistance);
  });

  it('keeps a leading CPU active instead of over-braking into a comeback', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 5);
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].hp = 160;
    match.fighters[1].hp = 90;
    match.fighters[0].position.x = -0.78;
    match.fighters[1].position.x = 0.78;

    let leaderAttackStarts = 0;
    let leaderBackWalkFrames = 0;
    let wasAttacking = false;

    for (let i = 0; i < 540; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      const leader = match.fighters[0];
      const opponentSide = leader.position.x <= match.fighters[1].position.x ? 1 : -1;
      const walkingAway = leader.state === 'walk' && ((opponentSide > 0 && leader.position.x < -0.78) || (opponentSide < 0 && leader.position.x > -0.78));
      const isAttacking = leader.state === 'attack' && Boolean(leader.currentMove);
      if (isAttacking && !wasAttacking) leaderAttackStarts += 1;
      if (walkingAway) leaderBackWalkFrames += 1;
      wasAttacking = isAttacking;
      if (match.phase !== 'fighting') break;
    }

    expect(leaderAttackStarts).toBeGreaterThanOrEqual(2);
    expect(leaderBackWalkFrames).toBeLessThan(180);
  });

  it('makes a leading CPU close rounds with pokes instead of max-damage launcher routes', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 5);
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].hp = 160;
    match.fighters[1].hp = 90;
    match.fighters[0].position.x = -0.82;
    match.fighters[1].position.x = 0.82;

    let leaderAttackStarts = 0;
    let maxLeaderComboStep = 0;
    let usedLauncher = false;
    let maxLeaderMoveDamage = 0;
    let wasAttacking = false;

    for (let i = 0; i < 540; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      const leader = match.fighters[0];
      const isAttacking = leader.state === 'attack' && Boolean(leader.currentMove);
      if (isAttacking && !wasAttacking && leader.currentMove) {
        leaderAttackStarts += 1;
        maxLeaderComboStep = Math.max(maxLeaderComboStep, leader.currentMove.comboStep ?? 1);
        maxLeaderMoveDamage = Math.max(maxLeaderMoveDamage, leader.currentMove.damage);
        usedLauncher = usedLauncher || Boolean(leader.currentMove.launchHeight);
      }
      wasAttacking = isAttacking;
      if (match.phase !== 'fighting') break;
    }

    expect(leaderAttackStarts).toBeGreaterThanOrEqual(2);
    expect(maxLeaderComboStep).toBeLessThanOrEqual(3);
    expect(maxLeaderMoveDamage).toBeLessThanOrEqual(16);
    expect(usedLauncher).toBe(false);
  });

  it('lets high difficulty CPU route into authored tornado when a juggle is near dropping', () => {
    const tornadoCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) =>
        move.input === 'jab'
          ? {
              ...move,
              startupFrames: 3,
              activeFrames: 3,
              recoveryFrames: 12,
              damage: 6,
              range: 2.4,
              tornado: true
            }
          : move
      )
    };
    let match = createMatch(tornadoCharacter, starterCharacters[1], stages[0], 'cpu', 5, { aiSeed: 337 });
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.55;
    match.fighters[1].position.x = 0.55;
    match.fighters[1].state = 'juggle';
    match.fighters[1].position.y = 1.1;
    match.fighters[1].velocityY = 0.1;
    match.fighters[1].stunFramesRemaining = 90;
    match.fighters[1].actionFramesRemaining = 90;
    match.fighters[1].juggleSequenceDamage = 40;
    match.fighters[1].juggleTornadoCount = 0;
    let usedTornado = false;

    for (let i = 0; i < 90; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      usedTornado = usedTornado || Boolean(match.fighters[0].currentMove?.tornado);
      if (usedTornado) break;
    }

    expect(usedTornado).toBe(true);
  });

  it('varies CPU route choices when matches use different AI seeds', () => {
    const sampleRoute = (aiSeed: number) => {
      let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 5, { aiSeed });
      match.phase = 'fighting';
      match.countdown = 0;
      match.fighters[0].hp = 999;
      match.fighters[1].hp = 999;
      const keys: string[] = [];
      const wasAttacking: [boolean, boolean] = [false, false];

      for (let i = 0; i < 420; i += 1) {
        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
        match.fighters.forEach((fighter, index) => {
          const isAttacking = fighter.state === 'attack' && Boolean(fighter.currentMove);
          if (isAttacking && !wasAttacking[index] && fighter.currentMove) {
            keys.push(`${fighter.slot}:${fighter.currentMove.command ?? `${fighter.currentMove.route ?? 'neutral'}:${fighter.currentMove.input}`}`);
          }
          wasAttacking[index] = isAttacking;
        });
        if (keys.length >= 8 || match.phase !== 'fighting') break;
      }

      return keys.join('|');
    };

    expect(sampleRoute(111)).not.toBe(sampleRoute(222));
  });

  it('rerolls round AI seed between rounds while keeping the match AI seed', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 5, { aiSeed: 4444 });
    const initialMatchSeed = match.aiSeed;
    const initialRoundSeed = match.roundAiSeed;

    match.fighters[1].hp = 0;
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.phase).toBe('roundOver');

    for (let i = 0; i < 150; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.phase).toBe('fighting');
    expect(match.round).toBe(2);
    expect(match.aiSeed).toBe(initialMatchSeed);
    expect(match.roundAiSeed).not.toBe(initialRoundSeed);
  });

  it('scales CPU attack frequency and route complexity by difficulty', () => {
    const simulate = (difficulty: 1 | 5) => {
      let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', difficulty);
      match.phase = 'fighting';
      match.countdown = 0;
      match.fighters[0].hp = 999;
      match.fighters[1].hp = 999;
      const seenMoveKeys = new Set<string>();
      let attackStarts = 0;
      let complexFrames = 0;

      for (let i = 0; i < 540; i += 1) {
        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
        for (const fighter of match.fighters) {
          if (fighter.state !== 'attack' || !fighter.currentMove) continue;
          if (fighter.moveFrame === 0) attackStarts += 1;
          if (fighter.currentMove.route && fighter.currentMove.route !== 'neutral') complexFrames += 1;
          seenMoveKeys.add(fighter.currentMove.command ?? `${fighter.currentMove.route ?? 'neutral'}:${fighter.currentMove.input}`);
        }
        if (match.phase !== 'fighting') break;
      }

      return { attackStarts, complexFrames, uniqueMoves: seenMoveKeys.size };
    };

    const easy = simulate(1);
    const kore = simulate(5);

    expect(kore.attackStarts).toBeGreaterThan(easy.attackStarts);
    expect(kore.complexFrames).toBeGreaterThan(easy.complexFrames);
    expect(kore.uniqueMoves).toBeGreaterThan(easy.uniqueMoves);
  });

  it('rotates CPU move routes instead of leaning on one repeated route', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 4);
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].hp = 999;
    match.fighters[1].hp = 999;
    const moveCounts = new Map<string, number>();
    let attackStarts = 0;
    const wasAttacking: [boolean, boolean] = [false, false];

    for (let i = 0; i < 720; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      match.fighters.forEach((fighter, index) => {
        const isAttacking = fighter.state === 'attack' && Boolean(fighter.currentMove);
        if (!isAttacking || wasAttacking[index] || !fighter.currentMove) {
          wasAttacking[index] = isAttacking;
          return;
        }
        attackStarts += 1;
        const key = fighter.currentMove.command ?? `${fighter.currentMove.route ?? 'neutral'}:${fighter.currentMove.input}`;
        moveCounts.set(key, (moveCounts.get(key) ?? 0) + 1);
        wasAttacking[index] = isAttacking;
      });
      if (match.phase !== 'fighting') break;
    }

    const topCount = Math.max(...moveCounts.values());
    expect(moveCounts.size).toBeGreaterThanOrEqual(4);
    expect(topCount / Math.max(1, attackStarts)).toBeLessThan(0.7);
  });

  it('makes high difficulty CPU take hitstun pressure openings more often than easy CPU', () => {
    const stepOpening = (difficulty: 1 | 5) => {
      let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', difficulty);
      match.phase = 'fighting';
      match.countdown = 0;
      match.fighters[0].hp = 999;
      match.fighters[1].hp = 999;
      match.fighters[0].position.x = -0.78;
      match.fighters[1].position.x = 0.78;
      match.fighters[1].state = 'hit';
      match.fighters[1].stunFramesRemaining = 180;
      match.fighters[1].actionFramesRemaining = 180;
      match.fighters[1].stunTimer = 3;
      match.fighters[1].actionTimer = 3;

      let attackStarts = 0;
      const usedInputs = new Set<string>();
      let wasAttacking = false;
      for (let i = 0; i < 180; i += 1) {
        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
        const move = match.fighters[0].currentMove;
        const isAttacking = match.fighters[0].state === 'attack' && Boolean(move);
        if (move && isAttacking && !wasAttacking) {
          attackStarts += 1;
          usedInputs.add(move.input);
        }
        wasAttacking = isAttacking;
      }
      return { attackStarts, usedInputs: usedInputs.size };
    };

    const hard = stepOpening(5);
    const easy = stepOpening(1);
    expect(hard.attackStarts).toBeGreaterThan(easy.attackStarts);
    expect(hard.usedInputs).toBeGreaterThanOrEqual(1);
  });

  it('lets CPU spend ki on charge-plus-attack routes during battle', () => {
    const kiCharacter = {
      ...starterCharacters[0],
      animationFrames: {
        ...(starterCharacters[0].animationFrames ?? {}),
        'cmd:O+1': ['/characters/kiro/frames/frame-000.png']
      }
    };
    let match = createMatch(kiCharacter, starterCharacters[1], stages[0], 'cpu', 5, { aiSeed: 222 });
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].hp = 999;
    match.fighters[1].hp = 999;
    match.fighters[0].ki = 100;
    match.fighters[0].position.x = -0.55;
    match.fighters[1].position.x = 0.55;
    match.fighters[1].state = 'hit';
    match.fighters[1].stunFramesRemaining = 180;
    match.fighters[1].actionFramesRemaining = 180;
    match.fighters[1].stunTimer = 3;
    match.fighters[1].actionTimer = 3;

    let sawKiBurst = false;
    for (let i = 0; i < 180; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      if (match.fighters[0].currentMove?.kiBurst) {
        sawKiBurst = true;
        break;
      }
    }

    expect(sawKiBurst).toBe(true);
    expect(match.fighters[0].ki).toBeLessThan(100);
  });

  it('lets high difficulty CPU route into configured full-crouch stance attacks', () => {
    const crouchCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      animationFrames: {
        ...(starterCharacters[0].animationFrames ?? {}),
        'cmd:FC+1': starterCharacters[0].animationFrames?.jableft ?? starterCharacters[0].animationFrames?.jab ?? []
      },
      moveOverrides: {
        ...(starterCharacters[0].moveOverrides ?? {}),
        'cmd:FC+1': {
          label: 'CPU Crouch Check',
          startupFrames: 10,
          activeFrames: 3,
          recoveryFrames: 16,
          damage: 8,
          blockDamage: 0,
          hitLevel: 'low',
          onBlockFrames: -9,
          onHitFrames: 5,
          onCounterHitFrames: 8,
          range: 1.45,
          pushback: 0.25,
          blockPushback: 0.15,
          tracking: 'medium',
          knockdown: false,
          hitbox: { offset: [0.58, 0.56, 0], size: [1, 0.46, 0.56] }
        }
      }
    };
    let match = createMatch(crouchCharacter, starterCharacters[1], stages[0], 'cpu', 5, { aiSeed: 440 });
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].hp = 999;
    match.fighters[1].hp = 999;
    match.fighters[0].position.x = -0.5;
    match.fighters[1].position.x = 0.5;
    match.fighters[1].state = 'hit';
    match.fighters[1].stunFramesRemaining = 240;
    match.fighters[1].actionFramesRemaining = 240;
    match.fighters[1].stunTimer = 4;
    match.fighters[1].actionTimer = 4;

    let sawFullCrouch = false;
    for (let i = 0; i < 240; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      const move = match.fighters[0].currentMove;
      if (match.fighters[0].state === 'attack' && move?.command === 'FC+1') {
        sawFullCrouch = true;
        expect(move.animationKey).toBe('cmd:FC+1');
        expect(move.label).toBe('CPU Crouch Check');
        break;
      }
    }

    expect(sawFullCrouch).toBe(true);
  });

  it('higher CPU difficulty extends hit-confirmed routes longer than easy CPU', () => {
    const simulatePressure = (difficulty: 1 | 5) => {
      let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', difficulty);
      match.phase = 'fighting';
      match.countdown = 0;
      match.fighters[0].hp = 999;
      match.fighters[1].hp = 999;
      match.fighters[0].position.x = -0.45;
      match.fighters[1].position.x = 0.45;
      match.fighters[0].comboTimer = 0.5;
      match.fighters[0].comboStep = 1;
      match.fighters[0].comboSequence = ['jab'];
      match.fighters[0].comboHits = 1;
      match.fighters[1].state = 'hit';
      match.fighters[1].stunFramesRemaining = 180;
      match.fighters[1].actionFramesRemaining = 180;
      match.fighters[1].stunTimer = 3;
      match.fighters[1].actionTimer = 3;
      let peakStep = match.fighters[0].comboStep;

      for (let i = 0; i < 180; i += 1) {
        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
        peakStep = Math.max(peakStep, match.fighters[0].comboStep);
      }

      return peakStep;
    };

    expect(simulatePressure(5)).toBeGreaterThan(simulatePressure(1));
  });

  it('prevents CPU jump decisions even at high difficulty', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 5);
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].hp = 999;
    match.fighters[1].hp = 999;
    let jumpFrames = 0;

    for (let i = 0; i < 720; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      if (match.fighters.some((fighter) => fighter.state === 'jump')) {
        jumpFrames += 1;
      }
      if (match.phase !== 'fighting') break;
    }

    expect(jumpFrames).toBe(0);
  });

  it('makes CPU fighters block incoming close attacks', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.72;
    match.fighters[1].position.x = 0.72;
    match.fighters[0].state = 'attack';
    match.fighters[0].currentMove = starterCharacters[0].moves[0];
    match.fighters[0].actionTimer = 0.35;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[1].state).toBe('block');
  });

  it('keeps movement directions tied to player side even after fighters cross physical sides', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = 1.3;
    match.fighters[1].position.x = -1.3;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].facing).toBe(1);
    expect(match.fighters[1].facing).toBe(-1);

    const toward = emptyInputFrame();
    toward.right = true;
    const towardResult = stepMatch(match, toward, emptyInputFrame(), 1 / 60);
    expect(towardResult.fighters[0].position.x).toBeLessThan(match.fighters[0].position.x);

    const away = emptyInputFrame();
    away.left = true;
    const awayResult = stepMatch(match, away, emptyInputFrame(), 1 / 60);
    expect(awayResult.fighters[0].position.x).toBeGreaterThan(match.fighters[0].position.x);
    expect(awayResult.fighters[0].state).toBe('block');

    const laneUp = emptyInputFrame();
    laneUp.sidewalkUp = true;
    const laneAngleBefore = Math.atan2(
      match.fighters[0].position.z - match.fighters[1].position.z,
      match.fighters[0].position.x - match.fighters[1].position.x
    );
    const laneUpResult = stepMatch(match, laneUp, emptyInputFrame(), 10 / 60);
    const laneUpAngle = Math.atan2(
      laneUpResult.fighters[0].position.z - laneUpResult.fighters[1].position.z,
      laneUpResult.fighters[0].position.x - laneUpResult.fighters[1].position.x
    );
    expect(unwrappedAngleDelta(laneUpAngle, laneAngleBefore)).toBeGreaterThan(0);

    const laneDown = emptyInputFrame();
    laneDown.sidewalkDown = true;
    const laneDownResult = stepMatch(match, laneDown, emptyInputFrame(), 10 / 60);
    const laneDownAngle = Math.atan2(
      laneDownResult.fighters[0].position.z - laneDownResult.fighters[1].position.z,
      laneDownResult.fighters[0].position.x - laneDownResult.fighters[1].position.x
    );
    expect(unwrappedAngleDelta(laneDownAngle, laneAngleBefore)).toBeLessThan(0);
  });

  it('uses up for jump, down for crouch, and lane inputs for 3D movement', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;

    const jump = emptyInputFrame();
    jump.up = true;
    match = stepMatch(match, jump, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].state).toBe('jump');
    expect(match.fighters[0].velocityY).toBeGreaterThan(0);
    expect(match.fighters[0].position.z).toBe(0);

    for (let i = 0; i < 80; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    const crouch = emptyInputFrame();
    crouch.down = true;
    match = stepMatch(match, crouch, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].state).toBe('crouch');
    expect(match.fighters[0].position.z).toBe(0);

    const laneWalk = emptyInputFrame();
    laneWalk.sidewalkDown = true;
    const radiusBefore = Math.hypot(
      match.fighters[0].position.x - match.fighters[1].position.x,
      match.fighters[0].position.z - match.fighters[1].position.z
    );
    const xBeforeWalk = match.fighters[0].position.x;
    const beforeWalk = match.fighters[0].position.z;
    match = stepMatch(match, laneWalk, emptyInputFrame(), 10 / 60);
    const radiusAfter = Math.hypot(
      match.fighters[0].position.x - match.fighters[1].position.x,
      match.fighters[0].position.z - match.fighters[1].position.z
    );
    expect(match.fighters[0].position.z).toBeGreaterThan(beforeWalk + 0.35);
    expect(match.fighters[0].position.x).not.toBeCloseTo(xBeforeWalk, 3);
    expect(radiusAfter).toBeCloseTo(radiusBefore, 1);
  });

  it('keeps continuous lane walking orbiting around the opponent without reversing at side crossover', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    const laneWalk = emptyInputFrame();
    laneWalk.sidewalkDown = true;
    let previousAngle = Math.atan2(
      match.fighters[0].position.z - match.fighters[1].position.z,
      match.fighters[0].position.x - match.fighters[1].position.x
    );
    let unwrappedAngle = previousAngle;
    let crossedOpponentX = false;

    for (let i = 0; i < 210; i += 1) {
      match = stepMatch(match, laneWalk, emptyInputFrame(), 1 / 60);
      const angle = Math.atan2(
        match.fighters[0].position.z - match.fighters[1].position.z,
        match.fighters[0].position.x - match.fighters[1].position.x
      );
      let delta = angle - previousAngle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      expect(delta).toBeLessThan(0.01);
      unwrappedAngle += delta;
      previousAngle = angle;
      if (match.fighters[0].position.x > match.fighters[1].position.x) crossedOpponentX = true;
    }

    expect(crossedOpponentX).toBe(true);
    expect(unwrappedAngle).toBeLessThan(-Math.PI);
  });

  it('does not invert up/down orbit direction at the old arena edge', () => {
    let downMatch = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    downMatch.phase = 'fighting';
    downMatch.countdown = 0;
    downMatch.fighters[0].position.x = 18;
    downMatch.fighters[0].position.z = -2;
    downMatch.fighters[1].position.x = 16;
    downMatch.fighters[1].position.z = 0;
    const down = emptyInputFrame();
    down.sidewalkDown = true;
    const downAngleBefore = Math.atan2(
      downMatch.fighters[0].position.z - downMatch.fighters[1].position.z,
      downMatch.fighters[0].position.x - downMatch.fighters[1].position.x
    );
    downMatch = stepMatch(downMatch, down, emptyInputFrame(), 12 / 60);
    const downAngleAfter = Math.atan2(
      downMatch.fighters[0].position.z - downMatch.fighters[1].position.z,
      downMatch.fighters[0].position.x - downMatch.fighters[1].position.x
    );
    expect(unwrappedAngleDelta(downAngleAfter, downAngleBefore)).toBeLessThan(0);

    let upMatch = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    upMatch.phase = 'fighting';
    upMatch.countdown = 0;
    upMatch.fighters[0].position.x = 18;
    upMatch.fighters[0].position.z = 2;
    upMatch.fighters[1].position.x = 16;
    upMatch.fighters[1].position.z = 0;
    const up = emptyInputFrame();
    up.sidewalkUp = true;
    const upAngleBefore = Math.atan2(
      upMatch.fighters[0].position.z - upMatch.fighters[1].position.z,
      upMatch.fighters[0].position.x - upMatch.fighters[1].position.x
    );
    upMatch = stepMatch(upMatch, up, emptyInputFrame(), 12 / 60);
    const upAngleAfter = Math.atan2(
      upMatch.fighters[0].position.z - upMatch.fighters[1].position.z,
      upMatch.fighters[0].position.x - upMatch.fighters[1].position.x
    );
    expect(unwrappedAngleDelta(upAngleAfter, upAngleBefore)).toBeGreaterThan(0);
  });

  it('keeps repeated down-down taps rotating the same way around the opponent', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    let previousAngle = Math.atan2(
      match.fighters[0].position.z - match.fighters[1].position.z,
      match.fighters[0].position.x - match.fighters[1].position.x
    );
    let totalAngle = previousAngle;
    let crossedRightSide = false;
    let crossedBottom = false;

    for (let tap = 0; tap < 46; tap += 1) {
      const input = emptyInputFrame();
      input.sidestepDown = true;
      match = stepMatch(match, input, emptyInputFrame(), 1 / 60);
      for (let frame = 0; frame < 12; frame += 1) {
        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
        const angle = Math.atan2(
          match.fighters[0].position.z - match.fighters[1].position.z,
          match.fighters[0].position.x - match.fighters[1].position.x
        );
        const delta = unwrappedAngleDelta(angle, previousAngle);
        expect(delta).toBeLessThan(0.01);
        totalAngle += delta;
        previousAngle = angle;
        if (match.fighters[0].position.x > match.fighters[1].position.x) crossedRightSide = true;
        if (match.fighters[0].position.z > match.fighters[1].position.z) crossedBottom = true;
      }
    }

    expect(crossedRightSide).toBe(true);
    expect(crossedBottom).toBe(true);
    expect(totalAngle).toBeLessThan(-Math.PI * 2);
  });

  it('hits a standing defender only when the active hitbox overlaps their hurtbox', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    const attack = emptyInputFrame();
    attack.jab = true;

    for (let i = 0; i < 12; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.jab = false;
    }

    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health - starterCharacters[0].moves[0].damage);
  });

  it('gives attacks a small universal reach buffer so close-but-not-perfect hits connect', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.62;
    match.fighters[1].position.x = 0.62;
    const attack = emptyInputFrame();
    attack.jab = true;

    for (let i = 0; i < 12; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.jab = false;
    }

    expect(match.fighters[0].hitConnected).toBe(true);
    expect(match.fighters[1].hp).toBeLessThan(starterCharacters[1].stats.health);
  });

  it('lets an active move effect hitbox connect beyond the base move range', () => {
    const effectAttacker: CharacterDefinition = {
      ...starterCharacters[0],
      effects: [{
        id: 'wide-aura',
        name: 'Wide Aura',
        frames: [],
        fps: 12,
        loop: false,
        billboard: true,
        blendMode: 'additive',
        anchor: 'body',
        defaultTransform: {
          position: [2.25, 0.05, 0],
          scale: [1.7, 1.7, 1.7],
          rotation: [0, 0, 0],
          opacity: 1,
          color: '#ffffff'
        }
      }],
      moveEffects: {
        jableft: [{
          id: 'wide-aura-hit',
          effectId: 'wide-aura',
          startFrame: 0,
          endFrame: 30,
          layer: 0,
          mirrorWithFacing: true,
          keyframes: []
        }]
      },
      moves: starterCharacters[0].moves.map((move) =>
        move.input === 'jab'
          ? {
              ...move,
              range: 0.25,
              startupFrames: 1,
              activeFrames: 18,
              recoveryFrames: 12,
              hitbox: { offset: [0, 1.1, 0.25], size: [0.12, 0.12, 0.12] }
            }
          : move
      )
    };
    let match = createMatch(effectAttacker, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -1.08;
    match.fighters[1].position.x = 1.18;
    const attack = emptyInputFrame();
    attack.jab = true;

    for (let i = 0; i < 8; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.jab = false;
    }

    expect(match.fighters[0].hitConnected).toBe(true);
    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health - effectAttacker.moves[0].damage);
    expect(match.impactEvents[match.impactEvents.length - 1]?.position[0]).toBeGreaterThan(0.45);
  });

  it('lets crouching defenders duck under high jabs', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[1].state = 'crouch';
    match.fighters[1].wasCrouching = true;
    const attack = emptyInputFrame();
    attack.jab = true;
    const crouch = emptyInputFrame();
    crouch.down = true;

    for (let i = 0; i < 18; i += 1) {
      match = stepMatch(match, attack, crouch, 1 / 60);
      attack.jab = false;
    }

    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health);
    expect(match.fighters[0].hitConnected).toBe(false);
  });

  it('lets jumping defenders pass above low attacks', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[1].position.y = 1.08;
    match.fighters[1].velocityY = 0.1;
    match.fighters[1].state = 'jump';
    const lowKick = emptyInputFrame();
    lowKick.down = true;
    lowKick.kick = true;

    for (let i = 0; i < 22; i += 1) {
      match = stepMatch(match, lowKick, emptyInputFrame(), 1 / 60);
      lowKick.kick = false;
      match.fighters[1].position.y = 1.08;
      match.fighters[1].velocityY = 0.1;
      match.fighters[1].state = 'jump';
    }

    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health);
  });

  it('lets sidestepped defenders avoid narrow forward attacks while still inside range', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[1].position.z = 0.82;
    const attack = emptyInputFrame();
    attack.jab = true;

    for (let i = 0; i < 12; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.jab = false;
    }

    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health);
  });

  it('uses move-specific evasive hurtboxes to make an otherwise valid jab whiff', () => {
    const evasiveDefender: CharacterDefinition = {
      ...starterCharacters[1],
      moves: starterCharacters[1].moves.map((move) =>
        move.id === 'jab'
          ? {
              ...move,
              hurtboxes: [{ offset: [0, 0.42, 0], size: [0.82, 0.72, 0.56] }]
            }
          : move
      )
    };
    let match = createMatch(starterCharacters[0], evasiveDefender, stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[1].state = 'attack';
    match.fighters[1].currentMove = evasiveDefender.moves[0];
    match.fighters[1].actionFramesRemaining = 30;
    match.fighters[1].actionTimer = 30 / 60;
    const attack = emptyInputFrame();
    attack.jab = true;

    for (let i = 0; i < 12; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.jab = false;
      match.fighters[1].state = 'attack';
      match.fighters[1].currentMove = evasiveDefender.moves[0];
      match.fighters[1].actionFramesRemaining = 30;
      match.fighters[1].actionTimer = 30 / 60;
    }

    expect(match.fighters[1].hp).toBe(evasiveDefender.stats.health);
  });

  it('applies block chip instead of full damage', () => {
    const chipCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moveOverrides: {
        ...(starterCharacters[0].moveOverrides ?? {}),
        jableft: {
          blockDamage: 3
        }
      }
    };
    let match = createMatch(chipCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    const attack = emptyInputFrame();
    attack.jab = true;
    const block = emptyInputFrame();
    block.block = true;
    for (let i = 0; i < 18; i += 1) {
      match = stepMatch(match, attack, block, 1 / 60);
      attack.jab = false;
    }
    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health - 3);
  });

  it('lets mid and low hit properties beat standing block', () => {
    const attackWithLevel = (hitLevel: MoveDefinition['hitLevel']) => {
      const attacker: CharacterDefinition = {
        ...starterCharacters[0],
        moveOverrides: {
          ...(starterCharacters[0].moveOverrides ?? {}),
          jableft: {
            damage: 10,
            blockDamage: 1,
            hitLevel
          }
        }
      };
      let match = createMatch(attacker, starterCharacters[1], stages[0], 'local2p');
      match.phase = 'fighting';
      match.countdown = 0;
      match.fighters[0].position.x = -0.45;
      match.fighters[1].position.x = 0.45;
      const attack = emptyInputFrame();
      attack.jab = true;
      const block = emptyInputFrame();
      block.block = true;
      for (let i = 0; i < 18; i += 1) {
        match = stepMatch(match, attack, block, 1 / 60);
        attack.jab = false;
      }
      return match;
    };

    expect(attackWithLevel('high').fighters[1].hp).toBe(starterCharacters[1].stats.health - 1);
    expect(attackWithLevel('mid').fighters[1].hp).toBe(starterCharacters[1].stats.health - 10);
    expect(attackWithLevel('low').fighters[1].hp).toBe(starterCharacters[1].stats.health - 10);
  });

  it('adds crouch block and lets high and mid hit properties beat it', () => {
    const attackCrouchBlockWithLevel = (hitLevel: MoveDefinition['hitLevel']) => {
      const attacker: CharacterDefinition = {
        ...starterCharacters[0],
        moveOverrides: {
          ...(starterCharacters[0].moveOverrides ?? {}),
          jableft: {
            damage: 10,
            blockDamage: 1,
            hitLevel
          }
        }
      };
      let match = createMatch(attacker, starterCharacters[1], stages[0], 'local2p');
      match.phase = 'fighting';
      match.countdown = 0;
      match.fighters[0].position.x = -0.45;
      match.fighters[1].position.x = 0.45;
      const attack = emptyInputFrame();
      attack.jab = true;
      const crouchBlock = emptyInputFrame();
      crouchBlock.block = true;
      crouchBlock.down = true;
      for (let i = 0; i < 18; i += 1) {
        match = stepMatch(match, attack, crouchBlock, 1 / 60);
        attack.jab = false;
      }
      return match;
    };

    expect(attackCrouchBlockWithLevel('low').fighters[1].hp).toBe(starterCharacters[1].stats.health - 1);
    expect(attackCrouchBlockWithLevel('high').fighters[1].hp).toBe(starterCharacters[1].stats.health - 10);
    expect(attackCrouchBlockWithLevel('mid').fighters[1].hp).toBe(starterCharacters[1].stats.health - 10);
  });

  it('only resolves a hit during active frames', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    const attack = emptyInputFrame();
    attack.jab = true;
    for (let i = 0; i < starterCharacters[0].moves[0].startupFrames; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.jab = false;
    }
    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health);

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health - starterCharacters[0].moves[0].damage);
  });

  it('does not let knocked down fighters get hit', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[1].state = 'knockdown';
    match.fighters[1].actionFramesRemaining = 80;
    match.fighters[1].actionTimer = 80 / 60;
    match.fighters[1].stunFramesRemaining = 80;
    match.fighters[1].stunTimer = 80 / 60;
    const hpBefore = match.fighters[1].hp;

    const attack = emptyInputFrame();
    attack.jab = true;
    for (let i = 0; i < 18; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.jab = false;
    }

    expect(match.fighters[1].state).toBe('knockdown');
    expect(match.fighters[1].hp).toBe(hpBefore);
  });

  it('keeps knocked down fighters grounded until they choose a getup option', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[1].state = 'knockdown';
    match.fighters[1].actionFramesRemaining = 2;
    match.fighters[1].actionTimer = 2 / 60;
    match.fighters[1].stunFramesRemaining = 2;
    match.fighters[1].stunTimer = 2 / 60;

    for (let i = 0; i < 4; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[1].state).toBe('knockdown');
    expect(match.fighters[1].getupStarted).toBe(false);

    const zBefore = match.fighters[1].position.z;
    const hpBefore = match.fighters[1].hp;
    const roll = emptyInputFrame();
    roll.sidewalkUp = true;

    match = stepMatch(match, emptyInputFrame(), roll, 1 / 60);
    expect(match.fighters[1].getupStarted).toBe(true);
    expect(match.fighters[1].state).toBe('getup');
    expect(match.fighters[1].getupAction).toBe('rollUp');
    expect(match.fighters[1].getupInvulnerableFrames).toBeGreaterThan(0);

    const forcedHit = {
      ...starterCharacters[0].moves[0],
      startupFrames: 0,
      activeFrames: 8,
      range: 2.5
    };
    match.fighters[0].state = 'attack';
    match.fighters[0].currentMove = forcedHit;
    match.fighters[0].actionFramesRemaining = 12;
    match.fighters[0].actionTimer = 12 / 60;
    match.fighters[0].moveFrame = 0;
    match.fighters[0].hitConnected = false;

    for (let i = 0; i < 4; i += 1) {
      match = stepMatch(match, emptyInputFrame(), roll, 1 / 60);
    }

    expect(match.fighters[1].hp).toBe(hpBefore);
    expect(match.fighters[1].position.z).toBeLessThan(zBefore);
  });

  it('creates punish windows from block advantage', () => {
    const attacker: CharacterDefinition = {
      ...starterCharacters[0],
      moveOverrides: {
        jab: {
          startupFrames: 1,
          activeFrames: 1,
          recoveryFrames: 20,
          onBlockFrames: -10
        }
      }
    };
    let match = createMatch(attacker, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    const attack = emptyInputFrame();
    attack.jab = true;
    const block = emptyInputFrame();
    block.block = true;
    for (let i = 0; i < 5; i += 1) {
      match = stepMatch(match, attack, block, 1 / 60);
      attack.jab = false;
    }

    expect(match.fighters[0].actionFramesRemaining - match.fighters[1].blockstunFramesRemaining).toBe(10);
  });

  it('gives the blocker at least a small plus-frame punish window on block', () => {
    const safeAttacker: CharacterDefinition = {
      ...starterCharacters[0],
      moveOverrides: {
        jab: {
          startupFrames: 1,
          activeFrames: 1,
          recoveryFrames: 20,
          onBlockFrames: 4
        }
      }
    };
    let match = createMatch(safeAttacker, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    const attack = emptyInputFrame();
    attack.jab = true;
    const block = emptyInputFrame();
    block.block = true;
    for (let i = 0; i < 5; i += 1) {
      match = stepMatch(match, attack, block, 1 / 60);
      attack.jab = false;
    }

    expect(match.fighters[0].actionFramesRemaining - match.fighters[1].blockstunFramesRemaining).toBeGreaterThanOrEqual(3);
    expect(match.fighters[1].blockPunishWindowFrames).toBeGreaterThanOrEqual(15);
  });

  it('lets CPU punish during its post-block advantage window', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 5);
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[0].state = 'attack';
    match.fighters[0].currentMove = starterCharacters[0].moves[0];
    match.fighters[0].actionFramesRemaining = 18;
    match.fighters[0].actionTimer = 18 / 60;
    match.fighters[0].moveFrame = starterCharacters[0].moves[0].startupFrames + starterCharacters[0].moves[0].activeFrames + 1;
    match.fighters[0].hitConnected = true;
    match.fighters[1].blockPunishWindowFrames = 12;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[1].state).toBe('attack');
    expect(match.fighters[1].currentMove?.input).toBe('jab');
  });

  it('keeps max difficulty CPUs imperfect across repeated punish windows', () => {
    let punishStarts = 0;
    const attempts = 48;

    for (let i = 0; i < attempts; i += 1) {
      let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 5);
      match.phase = 'fighting';
      match.countdown = 0;
      match.timer = match.roundTime - i * 0.23;
      match.fighters[0].position.x = -0.45;
      match.fighters[1].position.x = 0.45;
      match.fighters[0].state = 'attack';
      match.fighters[0].currentMove = starterCharacters[0].moves[0];
      match.fighters[0].actionFramesRemaining = 18;
      match.fighters[0].actionTimer = 18 / 60;
      match.fighters[0].moveFrame = starterCharacters[0].moves[0].startupFrames + starterCharacters[0].moves[0].activeFrames + 1;
      match.fighters[0].hitConnected = true;
      match.fighters[1].blockPunishWindowFrames = 12;

      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      if (match.fighters[1].state === 'attack') punishStarts += 1;
    }

    expect(punishStarts).toBeGreaterThan(Math.floor(attempts * 0.55));
    expect(punishStarts).toBeLessThan(attempts);
  });

  it('makes low difficulty CPUs miss more post-block punish windows', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 1);
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[0].state = 'attack';
    match.fighters[0].currentMove = starterCharacters[0].moves[0];
    match.fighters[0].actionFramesRemaining = 18;
    match.fighters[0].actionTimer = 18 / 60;
    match.fighters[0].moveFrame = starterCharacters[0].moves[0].startupFrames + starterCharacters[0].moves[0].activeFrames + 1;
    match.fighters[0].hitConnected = true;
    match.fighters[1].blockPunishWindowFrames = 12;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[1].state).not.toBe('attack');
    expect(match.fighters[1].currentMove).toBeNull();
  });

  it('blocks while holding stable player-side back even after physical side crossover', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;

    const p1Back = emptyInputFrame();
    p1Back.left = true;
    match = stepMatch(match, p1Back, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].state).toBe('block');

    match.fighters[0].position.x = 1.3;
    match.fighters[1].position.x = -1.3;
    const p1BackAfterSwap = emptyInputFrame();
    p1BackAfterSwap.left = true;
    match = stepMatch(match, p1BackAfterSwap, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].state).toBe('block');

    const crouchBlock = emptyInputFrame();
    crouchBlock.left = true;
    crouchBlock.down = true;
    match = stepMatch(match, crouchBlock, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].state).toBe('crouchBlock');
  });

  it('does not fall back to standing attacks when crouch moves are not configured', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;

    const crouch = emptyInputFrame();
    crouch.down = true;
    match = stepMatch(match, crouch, emptyInputFrame(), 1 / 60);

    const crouchJab = emptyInputFrame();
    crouchJab.down = true;
    crouchJab.jab = true;
    match = stepMatch(match, crouchJab, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('crouch');
    expect(match.fighters[0].currentMove).toBeNull();
  });

  it('starts configured FC attacks while crouching and applies their overrides', () => {
    const crouchCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      animationFrames: {
        ...starterCharacters[0].animationFrames,
        'cmd:FC+1': starterCharacters[0].animationFrames?.jab ?? []
      },
      moveOverrides: {
        ...starterCharacters[0].moveOverrides,
        'cmd:FC+1': {
          label: 'Crouch Strike',
          startupFrames: 14,
          activeFrames: 2,
          recoveryFrames: 18,
          damage: 9,
          hitLevel: 'low',
          onBlockFrames: -11,
          onHitFrames: 3,
          onCounterHitFrames: 7
        }
      }
    };
    let match = createMatch(crouchCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;

    const crouchJab = emptyInputFrame();
    crouchJab.down = true;
    crouchJab.jab = true;
    match = stepMatch(match, crouchJab, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('attack');
    expect(match.fighters[0].currentMove?.command).toBe('FC+1');
    expect(match.fighters[0].currentMove?.animationKey).toBe('cmd:FC+1');
    expect(match.fighters[0].currentMove?.label).toBe('Crouch Strike');
    expect(match.fighters[0].currentMove?.startupFrames).toBe(14);
    expect(match.fighters[0].currentMove?.hitLevel).toBe('low');
  });

  it('starts configured FC attacks from crouch block', () => {
    const crouchCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      animationFrames: {
        ...starterCharacters[0].animationFrames,
        'cmd:FC+1': starterCharacters[0].animationFrames?.jab ?? []
      }
    };
    let match = createMatch(crouchCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;

    const crouchBlockJab = emptyInputFrame();
    crouchBlockJab.down = true;
    crouchBlockJab.block = true;
    crouchBlockJab.jab = true;
    match = stepMatch(match, crouchBlockJab, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('attack');
    expect(match.fighters[0].currentMove?.animationKey).toBe('cmd:FC+1');
  });

  it('lets moves end directly in held crouch stance', () => {
    const crouchEndCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) =>
        move.input === 'jab'
          ? { ...move, startupFrames: 1, activeFrames: 1, recoveryFrames: 1, whiffRecoveryFrames: 0, endsInCrouch: true }
          : move
      )
    };
    let match = createMatch(crouchEndCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;

    const jab = emptyInputFrame();
    jab.jab = true;
    match = stepMatch(match, jab, emptyInputFrame(), 1 / 60);

    const heldCrouch = emptyInputFrame();
    heldCrouch.down = true;
    for (let i = 0; i < 30 && match.fighters[0].currentMove; i += 1) {
      match = stepMatch(match, heldCrouch, emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].currentMove).toBeNull();
    expect(match.fighters[0].state).toBe('crouch');
    expect(match.fighters[0].forcedCrouchFrames).toBe(0);
  });

  it('shows a forced crouch exit before idle when a crouch-ending move is not held down', () => {
    const crouchEndCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) =>
        move.input === 'jab'
          ? { ...move, startupFrames: 1, activeFrames: 1, recoveryFrames: 1, whiffRecoveryFrames: 0, endsInCrouch: true }
          : move
      )
    };
    let match = createMatch(crouchEndCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;

    const jab = emptyInputFrame();
    jab.jab = true;
    match = stepMatch(match, jab, emptyInputFrame(), 1 / 60);

    for (let i = 0; i < 30 && match.fighters[0].currentMove; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].currentMove).toBeNull();
    expect(match.fighters[0].state).toBe('crouch');
    expect(match.fighters[0].forcedCrouchFrames).toBeGreaterThan(0);

    for (let i = 0; i < 10; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(match.fighters[0].state).toBe('idle');
  });

  it('keeps standing attacks and while-standing commands working', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;

    const standingJab = emptyInputFrame();
    standingJab.jab = true;
    match = stepMatch(match, standingJab, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].state).toBe('attack');
    expect(match.fighters[0].currentMove?.input).toBe('jab');
    expect(match.fighters[0].currentMove?.command).toBeUndefined();

    match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    const crouch = emptyInputFrame();
    crouch.down = true;
    match = stepMatch(match, crouch, emptyInputFrame(), 1 / 60);

    const whileStandingKick = emptyInputFrame();
    whileStandingKick.special = true;
    match = stepMatch(match, whileStandingKick, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].state).toBe('attack');
    expect(match.fighters[0].currentMove?.animationKey).toBe('cmd:WS+4');
  });

  it('raw base button 1 uses jableft data while keeping neutral combo identity', () => {
    const canonicalCharacter = normalizeCharacter({
      ...starterCharacters[0],
      animationFrames: {
        ...(starterCharacters[0].animationFrames ?? {}),
        jableft: starterCharacters[0].animationFrames?.jab ?? []
      },
      moveOverrides: {
        ...(starterCharacters[0].moveOverrides ?? {}),
        'cmd:1': { damage: 3 },
        jab: { damage: 4 },
        jableft: { damage: 8 }
      }
    });
    let match = createMatch(canonicalCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.6;
    match.fighters[1].position.x = 0.6;

    const one = emptyInputFrame();
    one.jab = true;
    match = stepMatch(match, one, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].currentMove?.animationKey).toBe('jableft');
    expect(match.fighters[0].currentMove?.comboKey).toBe('neutral:jab');
    expect(match.fighters[0].currentMove?.damage).toBe(8);
  });

  it('buffers player attack inputs and chains them after a confirmed hit', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    const one = emptyInputFrame();
    one.jab = true;
    match = stepMatch(match, one, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].currentMove?.comboStep).toBe(1);
    expect(match.fighters[0].currentMove?.comboKey).toBe('neutral:jab');

    for (let i = 0; i < 20; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(match.fighters[0].hitConfirmed).toBe(true);

    const three = emptyInputFrame();
    three.kick = true;
    match = stepMatch(match, three, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].currentMove?.comboStep).toBe(2);
    expect(match.fighters[0].currentMove?.input).toBe('kick');
    expect(match.fighters[0].bufferedMoveInput).toBeNull();
  });

  it('expires buffered attack inputs if no chain window opens', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -5;
    match.fighters[1].position.x = 5;

    const one = emptyInputFrame();
    one.jab = true;
    match = stepMatch(match, one, emptyInputFrame(), 1 / 60);
    const earlyKick = emptyInputFrame();
    earlyKick.kick = true;
    match = stepMatch(match, earlyKick, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].bufferedMoveInput).toBe('kick');

    for (let i = 0; i < 20; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].bufferedMoveInput).toBeNull();
    expect(match.fighters[0].currentMove?.input).toBe('jab');
  });

  it('allows a four-hit player string when frame data keeps the route valid', () => {
    const frameDataComboCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) => ({
        ...move,
        startupFrames: 3,
        activeFrames: 3,
        recoveryFrames: 8,
        onHitFrames: 28,
        onCounterHitFrames: 32,
        range: 3,
        pushback: 0.08,
        launchHeight: undefined,
        knockdown: false
      }))
    };
    let match = createMatch(frameDataComboCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    const route: Array<keyof ReturnType<typeof emptyInputFrame>> = ['jab', 'jab', 'kick', 'heavy'];

    route.forEach((button, index) => {
      const input = emptyInputFrame();
      input[button] = true;
      match = stepMatch(match, input, emptyInputFrame(), 1 / 60);
      for (let i = 0; i < 54 && (match.fighters[0].comboStep < index + 1 || !match.fighters[0].hitConfirmed); i += 1) {
        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      }
    });

    expect(match.fighters[0].comboStep).toBeGreaterThanOrEqual(4);
    expect(match.fighters[0].comboSequence.slice(0, 4)).toEqual(['jab', 'jab', 'kick', 'heavy']);
  });

  it('ships thirty authored neutral string routes by default', () => {
    expect(getAuthoredNeutralStringRouteCount()).toBe(30);
  });

  it('resolves newly authored neutral string routes with tuned frame data', () => {
    const frameDataComboCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) => ({
        ...move,
        startupFrames: 3,
        activeFrames: 3,
        recoveryFrames: 8,
        onHitFrames: 28,
        onCounterHitFrames: 32,
        range: 3,
        pushback: 0.08,
        launchHeight: undefined,
        knockdown: false
      }))
    };
    let match = createMatch(frameDataComboCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    const kick = emptyInputFrame();
    kick.kick = true;
    match = stepMatch(match, kick, emptyInputFrame(), 1 / 60);
    for (let i = 0; i < 20 && !match.fighters[0].hitConfirmed; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    const special = emptyInputFrame();
    special.special = true;
    match = stepMatch(match, special, emptyInputFrame(), 1 / 60);
    for (let i = 0; i < 20 && match.fighters[0].comboStep < 2; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].currentMove?.comboKey).toBe('neutral:kick-special');
    expect(match.fighters[0].currentMove?.label).toBe('Toad Sage Mode');
    expect(match.fighters[0].currentMove?.startupFrames).toBe(16);
    expect(match.fighters[0].currentMove?.onBlockFrames).toBe(-7);
  });

  it('allows repeating the same exact landed attack when frame data allows direct cancel timing', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    const one = emptyInputFrame();
    one.jab = true;
    match = stepMatch(match, one, emptyInputFrame(), 1 / 60);
    for (let i = 0; i < 11; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(match.fighters[0].hitConfirmed).toBe(true);
    expect(match.fighters[0].comboUsedKeys).toContain('neutral:jab');

    const sameOne = emptyInputFrame();
    sameOne.jab = true;
    match = stepMatch(match, sameOne, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].currentMove?.comboStep).toBe(2);
    expect(match.fighters[0].currentMove?.comboKey).toBe('neutral:jab-jab');
    expect(match.fighters[0].currentMove?.damage).toBe(8);
    expect(match.fighters[0].currentMove?.onBlockFrames).toBe(-7);
    expect(match.fighters[0].currentMove?.onHitFrames).toBe(4);
    expect(match.fighters[0].currentMove?.hitLevel).toBe('mid');
  });

  it('does not direct-cancel a non-authored same attack while recovery remains', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    const kick = emptyInputFrame();
    kick.kick = true;
    match = stepMatch(match, kick, emptyInputFrame(), 1 / 60);
    for (let i = 0; i < 18 && !match.fighters[0].hitConfirmed; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(match.fighters[0].hitConfirmed).toBe(true);
    expect(match.fighters[0].actionFramesRemaining).toBeGreaterThan(0);

    const sameKick = emptyInputFrame();
    sameKick.kick = true;
    match = stepMatch(match, sameKick, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].currentMove?.comboStep).toBe(1);
    expect(match.fighters[0].currentMove?.comboKey).toBe('neutral:kick');
    expect(match.fighters[0].bufferedMoveInput).toBeNull();
  });

  it('allows the same attack again after recovery when hit advantage keeps the defender stuck', () => {
    const plusJabCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) =>
        move.input === 'jab'
          ? {
              ...move,
              startupFrames: 3,
              activeFrames: 2,
              recoveryFrames: 4,
              onHitFrames: 18,
              comboKey: 'neutral:jab'
            }
          : move
      )
    };
    let match = createMatch(plusJabCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    const one = emptyInputFrame();
    one.jab = true;
    match = stepMatch(match, one, emptyInputFrame(), 1 / 60);
    for (let i = 0; i < 24 && match.fighters[0].actionFramesRemaining > 0; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(match.fighters[0].state).toBe('idle');
    expect(match.fighters[1].stunFramesRemaining).toBeGreaterThan(0);
    expect(match.fighters[0].comboTimer).toBeGreaterThan(0);

    const secondOne = emptyInputFrame();
    secondOne.jab = true;
    match = stepMatch(match, secondOne, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('attack');
    expect(match.fighters[0].currentMove?.input).toBe('jab');
    expect(match.fighters[0].currentMove?.comboStep).toBe(2);
  });

  it('lets repeated same-button links happen only after recovery and makes them less plus', () => {
    const plusKickCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) =>
        move.input === 'kick'
          ? {
              ...move,
              startupFrames: 3,
              activeFrames: 2,
              recoveryFrames: 4,
              onHitFrames: 25,
              onCounterHitFrames: 28,
              comboKey: 'neutral:kick'
            }
          : move
      )
    };
    let match = createMatch(plusKickCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    const kick = emptyInputFrame();
    kick.kick = true;
    match = stepMatch(match, kick, emptyInputFrame(), 1 / 60);
    for (let i = 0; i < 20 && match.fighters[0].actionFramesRemaining > 0; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(match.fighters[0].state).toBe('idle');
    expect(match.fighters[1].stunFramesRemaining).toBeGreaterThan(0);

    const secondKick = emptyInputFrame();
    secondKick.kick = true;
    match = stepMatch(match, secondKick, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].currentMove?.comboStep).toBe(2);
    expect(match.fighters[0].currentMove?.input).toBe('kick');
    expect(match.fighters[0].currentMove?.recoveryFrames).toBeGreaterThan(plusKickCharacter.moves[1].recoveryFrames);
    expect(match.fighters[0].currentMove?.onHitFrames).toBeLessThan(plusKickCharacter.moves[1].onHitFrames);
  });

  it('charges ki while holding the charge input in neutral', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    const charge = emptyInputFrame();
    charge.charge = true;

    for (let i = 0; i < 60; i += 1) {
      match = stepMatch(match, charge, emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].ki).toBeGreaterThan(15);
    expect(match.fighters[0].ki).toBeLessThan(28);
    expect(match.fighters[0].state).toBe('chargeKi');
    expect(match.fighters[0].chargePhase).toBe('hold');
  });

  it('spawns Naruto shadow clone after charging past half ki', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].ki = 50;
    const charge = emptyInputFrame();
    charge.charge = true;

    for (let i = 0; i < 18; i += 1) {
      match = stepMatch(match, charge, emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].shadowClone?.phase).toBe('active');
    expect(match.fighters[0].shadowClone?.state).toBe('idle');
    expect(match.fighters[1].shadowClone).toBeNull();
  });

  it('mirrors Naruto next attack once with the spawned shadow clone', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].ki = 60;
    const charge = emptyInputFrame();
    charge.charge = true;
    for (let i = 0; i < 18; i += 1) {
      match = stepMatch(match, charge, emptyInputFrame(), 1 / 60);
    }

    const burst = emptyInputFrame();
    burst.charge = true;
    burst.jab = true;
    match = stepMatch(match, burst, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].shadowClone?.state).toBe('attack');
    expect(match.fighters[0].shadowClone?.currentMove?.input).toBe('jab');
    expect(match.fighters[0].shadowClone?.attackConsumed).toBe(true);

    for (let i = 0; i < 70; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].shadowClone).toBeNull();
  });

  it('cancels charge without recovery before the commit window', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    const charge = emptyInputFrame();
    charge.charge = true;

    match = stepMatch(match, charge, emptyInputFrame(), 1 / 60);
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('idle');
    expect(match.fighters[0].actionFramesRemaining).toBe(0);
  });

  it('forces recovery when a committed ki charge is released', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    const charge = emptyInputFrame();
    charge.charge = true;

    for (let i = 0; i < 36; i += 1) {
      match = stepMatch(match, charge, emptyInputFrame(), 1 / 60);
    }
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('chargeKi');
    expect(match.fighters[0].chargePhase).toBe('recovery');
    expect(match.fighters[0].actionFramesRemaining).toBeGreaterThan(0);
  });

  it('builds ki when attacks connect during combos', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    const one = emptyInputFrame();
    one.jab = true;

    match = stepMatch(match, one, emptyInputFrame(), 1 / 60);
    one.jab = false;
    for (let i = 0; i < 14; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].ki).toBeGreaterThan(0);
  });

  it('builds a smaller amount of ki for the defender when blocking', () => {
    let hitMatch = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    hitMatch.phase = 'fighting';
    hitMatch.countdown = 0;
    hitMatch.fighters[0].position.x = -0.45;
    hitMatch.fighters[1].position.x = 0.45;
    const hitAttack = emptyInputFrame();
    hitAttack.jab = true;
    hitMatch = stepMatch(hitMatch, hitAttack, emptyInputFrame(), 1 / 60);
    for (let i = 0; i < 14; i += 1) {
      hitMatch = stepMatch(hitMatch, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    let blockMatch = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    blockMatch.phase = 'fighting';
    blockMatch.countdown = 0;
    blockMatch.fighters[0].position.x = -0.45;
    blockMatch.fighters[1].position.x = 0.45;
    const blockAttack = emptyInputFrame();
    blockAttack.jab = true;
    const block = emptyInputFrame();
    block.block = true;
    blockMatch = stepMatch(blockMatch, blockAttack, block, 1 / 60);
    for (let i = 0; i < 14; i += 1) {
      blockMatch = stepMatch(blockMatch, emptyInputFrame(), block, 1 / 60);
    }

    expect(blockMatch.fighters[1].ki).toBeGreaterThan(0);
    expect(blockMatch.fighters[1].ki).toBeLessThan(hitMatch.fighters[0].ki);
  });

  it('spends ki on charge plus attack for a powered move', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].ki = 30;
    const chargedAttack = emptyInputFrame();
    chargedAttack.charge = true;
    chargedAttack.jab = true;

    match = stepMatch(match, chargedAttack, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].ki).toBe(0);
    expect(match.fighters[0].currentMove?.kiBurst).toBe(true);
    expect(match.fighters[0].currentMove?.damage).toBeGreaterThan(starterCharacters[0].moves[0].damage);
  });

  it('can spend ki on a powered move after charge startup has begun', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].ki = 35;
    const charge = emptyInputFrame();
    charge.charge = true;
    for (let i = 0; i < 18; i += 1) {
      match = stepMatch(match, charge, emptyInputFrame(), 1 / 60);
    }
    const burst = emptyInputFrame();
    burst.charge = true;
    burst.jab = true;

    match = stepMatch(match, burst, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('attack');
    expect(match.fighters[0].currentMove?.kiBurst).toBe(true);
    expect(match.fighters[0].chargePhase).toBe('none');
  });

  it('allows the same button again when it resolves to a different command move', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    const one = emptyInputFrame();
    one.jab = true;
    match = stepMatch(match, one, emptyInputFrame(), 1 / 60);
    for (let i = 0; i < 11; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    const forwardOne = emptyInputFrame();
    forwardOne.right = true;
    forwardOne.jab = true;
    match = stepMatch(match, forwardOne, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].currentMove?.comboStep).toBe(2);
    expect(match.fighters[0].currentMove?.command).toBe('f+1');
  });

  it('uses configured full-movelist directional routes after a confirmed hit', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    const one = emptyInputFrame();
    one.jab = true;
    match = stepMatch(match, one, emptyInputFrame(), 1 / 60);
    for (let i = 0; i < 11; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    const downForwardTwo = emptyInputFrame();
    downForwardTwo.down = true;
    downForwardTwo.right = true;
    downForwardTwo.heavy = true;
    match = stepMatch(match, downForwardTwo, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].currentMove?.route).toBe('down-forward');
    expect(match.fighters[0].currentMove?.command).toBe('d/f+2');
    expect(match.fighters[0].currentMove?.comboKey).toContain('heavy');
  });

  it('does not start an unauthored full-movelist command slot', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.9;
    match.fighters[1].position.x = 0.9;

    const missingForwardKick = emptyInputFrame();
    missingForwardKick.right = true;
    missingForwardKick.kick = true;
    match = stepMatch(match, missingForwardKick, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).not.toBe('attack');
    expect(match.fighters[0].currentMove).toBeNull();
  });

  it('uses configured Tekken-style command moves when their frame slot exists', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.9;
    match.fighters[1].position.x = 0.9;

    const forwardOne = emptyInputFrame();
    forwardOne.right = true;
    forwardOne.jab = true;
    match = stepMatch(match, forwardOne, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].currentMove?.command).toBe('f+1');
    expect(match.fighters[0].currentMove?.animationKey).toBe('cmd:f+1');
    expect(match.fighters[0].currentMove?.comboKey).toBe('f+1:jab');
  });

  it('applies frame data overrides for configured command moves', () => {
    const tunedCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moveOverrides: {
        'cmd:f+1': {
          startupFrames: 3,
          activeFrames: 2,
          recoveryFrames: 9,
          damage: 99,
          onBlockFrames: 4,
          onHitFrames: 12,
          onCounterHitFrames: 14
        }
      }
    };
    let match = createMatch(tunedCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.9;
    match.fighters[1].position.x = 0.9;

    const forwardOne = emptyInputFrame();
    forwardOne.right = true;
    forwardOne.jab = true;
    match = stepMatch(match, forwardOne, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].currentMove?.startupFrames).toBe(3);
    expect(match.fighters[0].currentMove?.damage).toBe(99);
    expect(match.fighters[0].currentMove?.onBlockFrames).toBe(4);
  });

  it('keeps whiffed moves locked through recovery plus a light whiff penalty', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -5;
    match.fighters[1].position.x = 5;
    const attack = emptyInputFrame();
    attack.heavy = true;
    match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
    attack.heavy = false;
    const whiffExtraFrames = 4;
    const total = starterCharacters[0].moves[2].startupFrames + starterCharacters[0].moves[2].activeFrames + starterCharacters[0].moves[2].recoveryFrames + whiffExtraFrames;

    for (let i = 0; i < total - 1; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(match.fighters[0].state).toBe('attack');

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].state).toBe('idle');
  });

  it('does not allow movement or a second attack during whiff penalty recovery', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -5;
    match.fighters[1].position.x = 5;
    const whiff = emptyInputFrame();
    whiff.jab = true;
    match = stepMatch(match, whiff, emptyInputFrame(), 1 / 60);
    for (let i = 0; i < 12; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    const xBeforeMash = match.fighters[0].position.x;

    const mash = emptyInputFrame();
    mash.kick = true;
    mash.right = true;
    match = stepMatch(match, mash, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].currentMove?.input).toBe('jab');
    expect(match.fighters[0].comboStep).toBe(1);
    expect(match.fighters[0].position.x).toBe(xBeforeMash);
    expect(match.fighters[0].whiffRecoveryApplied).toBe(true);
  });

  it('keeps whiff penalty lighter than blocked disadvantage', () => {
    const heavy = starterCharacters[0].moves[2];
    const whiffExtraFrames = heavy.whiffRecoveryFrames ?? 4;
    expect(whiffExtraFrames).toBeLessThan(Math.abs(heavy.onBlockFrames));
  });

  it('does not allow combo continuation after a blocked move by default', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    const attack = emptyInputFrame();
    attack.jab = true;
    const block = emptyInputFrame();
    block.block = true;
    for (let i = 0; i < 12; i += 1) {
      match = stepMatch(match, attack, block, 1 / 60);
      attack.jab = false;
    }
    expect(match.fighters[0].hitConnected).toBe(true);
    expect(match.fighters[0].hitConfirmed).toBe(false);

    const mash = emptyInputFrame();
    mash.kick = true;
    match = stepMatch(match, mash, block, 1 / 60);
    expect(match.fighters[0].currentMove?.input).toBe('jab');
    expect(match.fighters[0].comboStep).toBe(1);
  });

  it('finishes a round when health reaches zero', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.fighters[1].hp = 1;
    match.fighters[0].position.x = -0.5;
    match.fighters[1].position.x = 0.5;
    const attack = emptyInputFrame();
    attack.heavy = true;
    for (let i = 0; i < 40; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.heavy = false;
    }
    expect(match.phase).toBe('roundOver');
    expect(match.message).toBe('K.O.');
    expect(match.visualTimeScale).toBeLessThan(1);
    expect(match.fighters[0].roundsWon).toBe(1);

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 0.9);
    expect(match.phase).toBe('roundOver');
    expect(match.visualTimeScale).toBe(1);
  });

  it('emits a combo popup event on multi-hit combos', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[0].state = 'attack';
    match.fighters[0].currentMove = {
      ...starterCharacters[0].moves[0],
      startupFrames: 0,
      activeFrames: 3,
      recoveryFrames: 12,
      range: 2.5
    };
    match.fighters[0].actionFramesRemaining = 12;
    match.fighters[0].actionTimer = 12 / 60;
    match.fighters[0].comboHits = 1;
    match.fighters[0].comboDamage = 7;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.combatEvents).toHaveLength(1);
    expect(match.combatEvents[0]).toMatchObject({ slot: 1, kind: 'combo', hits: 2 });
    expect(match.combatEvents[0].damage).toBeGreaterThan(7);
    expect(match.impactEvents).toHaveLength(1);
    expect(match.impactEvents[0]).toMatchObject({ kind: 'hit', attackerSlot: 1, defenderSlot: 2, moveLabel: match.fighters[0].currentMove?.label });
    expect(match.impactEvents[0].position[1]).toBeGreaterThan(0);

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.combatEvents[0]).toMatchObject({ slot: 1, kind: 'combo', hits: 2 });
  });

  it('emits a punish popup event when a block punish lands', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[0].blockPunishWindowFrames = 10;
    match.fighters[0].state = 'attack';
    match.fighters[0].currentMove = {
      ...starterCharacters[0].moves[0],
      startupFrames: 0,
      activeFrames: 3,
      recoveryFrames: 12,
      range: 2.5
    };
    match.fighters[0].actionFramesRemaining = 12;
    match.fighters[0].actionTimer = 12 / 60;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.combatEvents).toHaveLength(1);
    expect(match.combatEvents[0]).toMatchObject({ slot: 1, kind: 'punish', hits: 1 });
    expect(match.impactEvents[0]).toMatchObject({ kind: 'punish', attackerSlot: 1, defenderSlot: 2 });
  });

  it('emits a whiff punish popup event when hitting whiff recovery', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[0].state = 'attack';
    match.fighters[0].currentMove = {
      ...starterCharacters[0].moves[0],
      startupFrames: 0,
      activeFrames: 3,
      recoveryFrames: 12,
      range: 2.5
    };
    match.fighters[0].actionFramesRemaining = 12;
    match.fighters[0].actionTimer = 12 / 60;
    match.fighters[1].state = 'attack';
    match.fighters[1].currentMove = {
      ...starterCharacters[1].moves[0],
      startupFrames: 1,
      activeFrames: 1,
      recoveryFrames: 20,
      range: 1
    };
    match.fighters[1].moveFrame = 4;
    match.fighters[1].actionFramesRemaining = 12;
    match.fighters[1].actionTimer = 12 / 60;
    match.fighters[1].whiffRecoveryApplied = true;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.combatEvents).toHaveLength(1);
    expect(match.combatEvents[0]).toMatchObject({ slot: 1, kind: 'whiffPunish', hits: 1 });
    expect(match.impactEvents[0]).toMatchObject({ kind: 'whiffPunish', attackerSlot: 1, defenderSlot: 2 });
  });

  it('emits a block spark for blocked overlap and no spark for whiffs', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    const attack = emptyInputFrame();
    attack.jab = true;
    const blockInput = emptyInputFrame();
    blockInput.block = true;
    for (let i = 0; i < 12; i += 1) {
      match = stepMatch(match, attack, blockInput, 1 / 60);
      attack.jab = false;
    }

    expect(match.impactEvents).toHaveLength(1);
    expect(match.impactEvents[0]).toMatchObject({ kind: 'block', attackerSlot: 1, defenderSlot: 2 });
    expect(match.combatEvents).toHaveLength(0);

    let whiff = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    whiff.phase = 'fighting';
    whiff.countdown = 0;
    whiff.fighters[0].position.x = -4;
    whiff.fighters[1].position.x = 4;
    whiff.fighters[0].state = 'attack';
    whiff.fighters[0].currentMove = {
      ...starterCharacters[0].moves[0],
      startupFrames: 0,
      activeFrames: 3,
      recoveryFrames: 12,
      range: 2.5
    };
    whiff.fighters[0].actionFramesRemaining = 12;
    whiff.fighters[0].actionTimer = 12 / 60;

    whiff = stepMatch(whiff, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(whiff.impactEvents).toHaveLength(0);
  });

  it('keeps the fight phase active without hit-stop and accepts movement after hitstun', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    const attack = emptyInputFrame();
    attack.jab = true;
    for (let i = 0; i < 12; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.jab = false;
    }
    expect(match.cameraShake).toBe(0);
    expect(match.impactEvents).toHaveLength(1);
    expect(match.fighters[1].hitFlash).toBe(0);
    expect(match.fighters[1].state).toBe('hit');
    expect(match.fighters[1].stunFramesRemaining).toBeGreaterThan(0);
    expect(match.fighters[1].actionFramesRemaining).toBeGreaterThan(0);
    const zBefore = match.fighters[1].position.z;
    const xBefore = match.fighters[1].position.x;
    for (let i = 0; i < 32; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    const moveAfterHit = emptyInputFrame();
    moveAfterHit.sidewalkUp = true;
    match = stepMatch(match, emptyInputFrame(), moveAfterHit, 1 / 60);
    expect(match.phase).toBe('fighting');
    expect(Math.abs(match.fighters[1].position.z - zBefore) + Math.abs(match.fighters[1].position.x - xBefore)).toBeGreaterThan(0.01);
  });

  it('launches into juggle float for an authored non-knockdown launcher command', () => {
    const launcherCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      animationFrames: {
        ...starterCharacters[0].animationFrames,
        'cmd:u+1': starterCharacters[0].animationFrames?.jab ?? []
      },
      moveOverrides: {
        'cmd:u+1': {
          launchHeight: 2.2,
          knockdown: false,
          startupFrames: 4,
          activeFrames: 3,
          recoveryFrames: 18,
          hitbox: {
            offset: [0, 1.22, 0.94],
            size: [0.72, 0.92, 1.3]
          }
        }
      }
    };
    let match = createMatch(launcherCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    const launcher = emptyInputFrame();
    launcher.up = true;
    launcher.jab = true;

    for (let i = 0; i < 18; i += 1) {
      match = stepMatch(match, launcher, emptyInputFrame(), 1 / 60);
      launcher.jab = false;
    }

    expect(match.fighters[1].state).toBe('juggle');
    expect(match.fighters[1].position.y).toBeGreaterThan(0.6);
    expect(match.fighters[1].velocityY).toBeGreaterThan(3.9);
    expect(match.fighters[1].juggleDamage).toBeGreaterThan(0);

    let apex = match.fighters[1].position.y;
    for (let i = 0; i < 28; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      apex = Math.max(apex, match.fighters[1].position.y);
    }
    expect(apex).toBeGreaterThan(2.1);
    expect(match.fighters[1].state).toBe('juggle');
  });

  it('applies per-launcher pop and fall-speed tuning', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[0].state = 'attack';
    match.fighters[0].currentMove = {
      ...starterCharacters[0].moves[0],
      startupFrames: 0,
      activeFrames: 3,
      recoveryFrames: 12,
      knockdown: false,
      launchHeight: 2.2,
      launchVelocity: 4.05,
      juggleRefloatVelocity: 3.25,
      juggleGravityScale: 1.08,
      range: 2.5,
      hitbox: {
        offset: [0, 1.1, 0.75],
        size: [0.9, 0.8, 1.2]
      }
    };
    match.fighters[0].actionFramesRemaining = 12;
    match.fighters[0].actionTimer = 12 / 60;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[1].state).toBe('juggle');
    expect(match.fighters[1].velocityY).toBeCloseTo(4.05, 2);
    expect(match.fighters[1].juggleGravityScale).toBeCloseTo(1.08, 2);
  });

  it('lets different juggle fall speeds create different airborne arcs', () => {
    let fastFall = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    let slowFall = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    fastFall.phase = 'fighting';
    slowFall.phase = 'fighting';
    fastFall.countdown = 0;
    slowFall.countdown = 0;

    for (const match of [fastFall, slowFall]) {
      match.fighters[1].state = 'juggle';
      match.fighters[1].position.y = 1.1;
      match.fighters[1].velocityY = 4.6;
      match.fighters[1].stunFramesRemaining = 80;
      match.fighters[1].actionFramesRemaining = 80;
    }
    fastFall.fighters[1].juggleGravityScale = 1.08;
    slowFall.fighters[1].juggleGravityScale = 0.34;

    for (let i = 0; i < 24; i += 1) {
      fastFall = stepMatch(fastFall, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      slowFall = stepMatch(slowFall, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(slowFall.fighters[1].position.y).toBeGreaterThan(fastFall.fighters[1].position.y + 0.55);
  });

  it('keeps a launched defender unable to act while airborne even after hit frames expire', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[1].state = 'juggle';
    match.fighters[1].position.y = 0.72;
    match.fighters[1].velocityY = 0.05;
    match.fighters[1].stunFramesRemaining = 0;
    match.fighters[1].actionFramesRemaining = 0;

    const attemptedAirAction = emptyInputFrame();
    attemptedAirAction.jab = true;
    attemptedAirAction.right = true;
    const startX = match.fighters[1].position.x;

    match = stepMatch(match, emptyInputFrame(), attemptedAirAction, 1 / 60);

    expect(match.fighters[1].state).toBe('juggle');
    expect(match.fighters[1].currentMove).toBeNull();
    expect(match.fighters[1].position.x).toBe(startX);
  });

  it('keeps a landed launched defender locked until remaining recovery frames expire', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[1].state = 'juggle';
    match.fighters[1].position.y = 0;
    match.fighters[1].velocityY = 0;
    match.fighters[1].stunFramesRemaining = 12;
    match.fighters[1].actionFramesRemaining = 12;

    const attemptedGroundAction = emptyInputFrame();
    attemptedGroundAction.jab = true;
    attemptedGroundAction.left = true;
    const startX = match.fighters[1].position.x;

    match = stepMatch(match, emptyInputFrame(), attemptedGroundAction, 1 / 60);

    expect(match.fighters[1].state).toBe('juggle');
    expect(match.fighters[1].currentMove).toBeNull();
    expect(match.fighters[1].position.x).toBe(startX);

    for (let i = 0; i < 14; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[1].state).toBe('idle');
  });

  it('adds landing recovery when a juggled defender falls to the floor with expired hit frames', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[1].state = 'juggle';
    match.fighters[1].position.y = 0.04;
    match.fighters[1].velocityY = -2.2;
    match.fighters[1].stunFramesRemaining = 0;
    match.fighters[1].actionFramesRemaining = 0;
    match.fighters[1].stunTimer = 0;
    match.fighters[1].actionTimer = 0;

    for (let i = 0; i < 3 && match.fighters[1].position.y > 0; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[1].position.y).toBe(0);
    expect(match.fighters[1].state).toBe('juggle');
    expect(match.fighters[1].actionFramesRemaining).toBeGreaterThan(0);

    const attemptedGroundAction = emptyInputFrame();
    attemptedGroundAction.jab = true;
    match = stepMatch(match, emptyInputFrame(), attemptedGroundAction, 1 / 60);

    expect(match.fighters[1].currentMove).toBeNull();
    expect(match.fighters[1].state).toBe('juggle');
  });

  it('re-floats airborne defenders on juggle follow-up hits', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[1].position.y = 0.5;
    match.fighters[1].velocityY = -0.4;
    match.fighters[1].state = 'juggle';
    match.fighters[1].juggleDamage = 8;
    match.fighters[0].state = 'attack';
    match.fighters[0].currentMove = {
      ...starterCharacters[0].moves[0],
      startupFrames: 0,
      activeFrames: 3,
      recoveryFrames: 12,
      knockdown: false,
      launchHeight: 2.2,
      range: 2.5
    };
    match.fighters[0].actionFramesRemaining = 12;
    match.fighters[0].actionTimer = 12 / 60;
    match.fighters[0].moveFrame = 0;
    match.fighters[0].hitConnected = false;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[1].state).toBe('juggle');
    expect(match.fighters[1].position.y).toBeGreaterThan(1);
    expect(match.fighters[1].velocityY).toBeGreaterThan(3.7);
    expect(match.fighters[1].juggleDamage).toBeGreaterThan(8);
  });

  it('does not relaunch grounded defenders with tornado unless the move is also a launcher', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[0].state = 'attack';
    match.fighters[0].currentMove = {
      ...starterCharacters[0].moves[0],
      startupFrames: 0,
      activeFrames: 3,
      recoveryFrames: 12,
      damage: 6,
      tornado: true,
      knockdown: false,
      launchHeight: undefined,
      range: 2.5,
      hitbox: {
        offset: [0, 1.1, 0.75],
        size: [1, 1.2, 1.5]
      }
    };
    match.fighters[0].actionFramesRemaining = 12;
    match.fighters[0].actionTimer = 12 / 60;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[1].state).toBe('hit');
    expect(match.fighters[1].position.y).toBe(0);
    expect(match.fighters[1].juggleTornadoCount).toBe(0);
  });

  it('extends a juggle with tornado twice, then stops resetting the juggle limit', () => {
    const runTornadoHit = (tornadoCount: number) => {
      let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
      match.phase = 'fighting';
      match.countdown = 0;
      match.fighters[0].position.x = -0.45;
      match.fighters[1].position.x = 0.45;
      match.fighters[1].position.y = 0.74;
      match.fighters[1].velocityY = -0.35;
      match.fighters[1].state = 'juggle';
      match.fighters[1].juggleDamage = 28;
      match.fighters[1].juggleSequenceDamage = 40;
      match.fighters[1].juggleTornadoCount = tornadoCount;
      match.fighters[0].state = 'attack';
      match.fighters[0].currentMove = {
        ...starterCharacters[0].moves[0],
        startupFrames: 0,
        activeFrames: 3,
        recoveryFrames: 12,
        damage: 6,
        tornado: true,
        knockdown: false,
        launchHeight: undefined,
        range: 2.5,
        hitbox: {
          offset: [0, 1.15, 0.75],
          size: [1.1, 1.6, 1.5]
        }
      };
      match.fighters[0].actionFramesRemaining = 12;
      match.fighters[0].actionTimer = 12 / 60;
      match.fighters[0].moveFrame = 0;
      match.fighters[0].hitConnected = false;
      return stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    };

    const first = runTornadoHit(0);
    expect(first.fighters[1].state).toBe('juggle');
    expect(first.fighters[1].juggleTornadoCount).toBe(1);
    expect(first.fighters[1].juggleSequenceDamage).toBe(6);
    expect(first.fighters[1].position.y).toBeGreaterThanOrEqual(1.26);
    expect(first.fighters[1].velocityY).toBeGreaterThan(4.2);

    const second = runTornadoHit(1);
    expect(second.fighters[1].state).toBe('juggle');
    expect(second.fighters[1].juggleTornadoCount).toBe(2);
    expect(second.fighters[1].juggleSequenceDamage).toBe(6);

    const third = runTornadoHit(2);
    expect(third.fighters[1].state).toBe('knockdown');
    expect(third.fighters[1].juggleTornadoCount).toBe(0);
  });

  it('forces knockdown after enough juggle damage', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[1].position.y = 0.5;
    match.fighters[1].velocityY = 0.2;
    match.fighters[1].state = 'juggle';
    match.fighters[1].juggleDamage = 42;
    match.fighters[1].juggleSequenceDamage = 42;
    match.fighters[0].state = 'attack';
    match.fighters[0].currentMove = {
      ...starterCharacters[0].moves[0],
      startupFrames: 0,
      activeFrames: 3,
      knockdown: false,
      launchHeight: undefined,
      range: 2.5
    };
    match.fighters[0].actionFramesRemaining = 12;
    match.fighters[0].actionTimer = 12 / 60;
    match.fighters[0].moveFrame = 0;
    match.fighters[0].hitConnected = false;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[1].state).toBe('knockdown');
    expect(match.fighters[1].juggleDamage).toBe(0);
  });
});

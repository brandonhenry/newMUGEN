export type StoryMovementProfile = {
  gravity: number;
  jumpVelocity: number;
  bufferedGroundJumpVelocity: number;
  maximumJumps: number;
  walkSpeed: number;
  sprintSpeed: number;
  swimSpeed: number;
  climbSpeed: number;
  updraftSpeed: number;
  avatarHalfWidth: number;
  avatarHalfHeight: number;
  oneWayEdgeCatch: number;
  solidEdgeCatch: number;
  dropThroughSeconds: number;
  jumpBufferSeconds: number;
  rollSpeed: number;
  rollDurationSeconds: number;
  rollCooldownSeconds: number;
  rollInvulnerabilityStartSeconds: number;
  rollInvulnerabilityEndSeconds: number;
  rollAgilityRequirement: number;
};

/**
 * The single source of truth for Adventure traversal. Generation and validation
 * intentionally consume the same values as the live controller.
 */
export const STORY_MOVEMENT_PROFILE: Readonly<StoryMovementProfile> = Object.freeze({
  gravity: 22,
  jumpVelocity: 11.4,
  bufferedGroundJumpVelocity: 7.8,
  maximumJumps: 2,
  walkSpeed: 5.2,
  sprintSpeed: 8.4,
  swimSpeed: 4.1,
  climbSpeed: 4.6,
  updraftSpeed: 5.2,
  avatarHalfWidth: 0.36,
  avatarHalfHeight: 0.8,
  oneWayEdgeCatch: 0.72,
  solidEdgeCatch: 0.46,
  dropThroughSeconds: 0.28,
  jumpBufferSeconds: 0.12,
  rollSpeed: 7.5,
  rollDurationSeconds: 0.56,
  rollCooldownSeconds: 0.9,
  rollInvulnerabilityStartSeconds: 0.14,
  rollInvulnerabilityEndSeconds: 0.42,
  rollAgilityRequirement: 10
});

export type StoryRollStartContext = {
  rollUnlocked: boolean;
  grounded: boolean;
  mounted: boolean;
  swimming: boolean;
  assistedClimb: boolean;
  attacking: boolean;
  cooldownReady: boolean;
};

export type StoryPlayerDamageKind = 'combat' | 'environment';

export type StoryRollRequest = { direction: -1 | 1; fromCrouch: boolean };

export function resolveStoryRollRequest(input: {
  left: boolean;
  right: boolean;
  down: boolean;
  previousLeft: boolean;
  previousRight: boolean;
  previousDown: boolean;
  doubleTapDirection?: 'left' | 'right';
}): StoryRollRequest | null {
  const downEdge = input.down && !input.previousDown;
  if (input.down) {
    if (input.right && (!input.previousRight || downEdge)) return { direction: 1, fromCrouch: true };
    if (input.left && (!input.previousLeft || downEdge)) return { direction: -1, fromCrouch: true };
  }
  if (input.doubleTapDirection === 'right') return { direction: 1, fromCrouch: false };
  if (input.doubleTapDirection === 'left') return { direction: -1, fromCrouch: false };
  return null;
}

export function storyRollRecoveryFacing(startFacing: -1 | 1, fromCrouch: boolean, completed = true): -1 | 1 {
  return fromCrouch && completed ? (startFacing === 1 ? -1 : 1) : startFacing;
}

export function canStartStoryRoll(context: StoryRollStartContext) {
  return context.rollUnlocked && context.grounded && !context.mounted && !context.swimming
    && !context.assistedClimb && !context.attacking && context.cooldownReady;
}

export function storyRollHasCombatInvulnerability(elapsedSeconds: number, profile: StoryMovementProfile = STORY_MOVEMENT_PROFILE) {
  return elapsedSeconds >= profile.rollInvulnerabilityStartSeconds && elapsedSeconds < profile.rollInvulnerabilityEndSeconds;
}

export function storyRollCombatWindowBlocksDamage(
  kind: StoryPlayerDamageKind,
  nowMs: number,
  window: { startMs: number; endMs: number }
) {
  return kind === 'combat' && nowMs >= window.startMs && nowMs < window.endMs;
}

export function storyMaximumJumpRise(profile: StoryMovementProfile = STORY_MOVEMENT_PROFILE) {
  return profile.jumpVelocity * profile.jumpVelocity / (2 * profile.gravity);
}

export function storyConservativeDoubleJumpRise(profile: StoryMovementProfile = STORY_MOVEMENT_PROFILE) {
  // The second jump can be taken near the first apex. Reserve 12% for input,
  // landing, and frame-step error so validation never promises a pixel-perfect jump.
  return storyMaximumJumpRise(profile) * profile.maximumJumps * 0.88;
}

export function storyConservativeJumpRun(profile: StoryMovementProfile = STORY_MOVEMENT_PROFILE) {
  const airtime = profile.jumpVelocity / profile.gravity * 2;
  return profile.walkSpeed * airtime * 0.82;
}

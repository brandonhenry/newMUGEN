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
  jumpBufferSeconds: 0.12
});

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

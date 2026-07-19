import { useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { storyAvatarMeshCenterYForVisualScale, storyAvatarPlaneHeight } from './actorGrounding';
import { getStorySpriteAnimation, STORY_SPRITE_MANIFEST } from './streetAvatarCatalog';
import type { StoryAvatarDefinition, StoryHubAvatarPose, StorySpriteAnimation } from './types';

export type StoryAvatarPose = StoryHubAvatarPose;

function animationForPose(pose: StoryAvatarPose) {
  if (pose === 'attack-jab') return 'attack';
  if (pose === 'attack-heavy' || pose === 'attack-kick' || pose === 'attack-special') return pose;
  if (pose === 'crouch') return 'roll';
  return pose === 'walk' || pose === 'jump' || pose === 'sprint' || pose === 'roll' ? pose : 'idle';
}

function frameIndexAt(animation: StorySpriteAnimation, elapsedMs: number, reducedMotion: boolean) {
  if (reducedMotion && animation.id === 'idle') return 0;
  const duration = animation.frames.reduce((total, frame) => total + frame.durationMs, 0);
  const time = animation.loop ? elapsedMs % duration : Math.min(elapsedMs, duration - 1);
  let cursor = 0;
  for (let index = 0; index < animation.frames.length; index += 1) {
    cursor += animation.frames[index].durationMs;
    if (time < cursor) return index;
  }
  return animation.frames.length - 1;
}

export function shouldRestartStoryAvatarAnimation(
  lastPose: StoryAvatarPose,
  pose: StoryAvatarPose,
  lastRestartToken: number,
  restartToken: number
) {
  return lastPose !== pose || lastRestartToken !== restartToken;
}

export type StoryAvatarCrouchTransition = 'enter' | 'exit';

export function storyAvatarCrouchTransitionForPoseChange(
  previousPose: StoryAvatarPose,
  pose: StoryAvatarPose
): StoryAvatarCrouchTransition | null {
  if (pose === 'crouch' && previousPose !== 'crouch' && previousPose !== 'roll') return 'enter';
  if ((previousPose === 'crouch' || previousPose === 'roll') && (pose === 'idle' || pose === 'walk' || pose === 'sprint')) return 'exit';
  return null;
}

export function storyAvatarCrouchTransitionFrameIndex(
  transition: StoryAvatarCrouchTransition,
  animation: StorySpriteAnimation,
  elapsedMs: number
): number | null {
  const crouchedFrameIndex = animation.frames.length - 1;
  const plantedFrameIndex = Math.max(0, crouchedFrameIndex - 1);
  const sequence = transition === 'enter'
    ? [plantedFrameIndex, crouchedFrameIndex]
    : [crouchedFrameIndex, plantedFrameIndex];
  let cursor = 0;
  for (const frameIndex of sequence) {
    cursor += animation.frames[frameIndex]?.durationMs ?? 0;
    if (elapsedMs < cursor) return frameIndex;
  }
  return null;
}

export function StoryAvatarRig({ avatar, pose = 'idle', facing = 1, reducedMotion = false, restartToken = 0 }: {
  avatar: StoryAvatarDefinition;
  pose?: StoryAvatarPose;
  facing?: -1 | 1;
  reducedMotion?: boolean;
  restartToken?: number;
}) {
  const animation = getStorySpriteAnimation(avatar.avatarSet, animationForPose(pose));
  const crouchAnimation = getStorySpriteAnimation(avatar.avatarSet, 'roll');
  const paths = useMemo(() => animation.frames.map((frame) => frame.path), [animation]);
  const textures = useTexture(paths) as unknown as THREE.Texture[];
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const poseStartedAtRef = useRef<number | null>(null);
  const lastPoseRef = useRef(pose);
  const lastRestartTokenRef = useRef(restartToken);
  const crouchTexturesRef = useRef<THREE.Texture[]>([]);
  const crouchTransitionRef = useRef<{ kind: StoryAvatarCrouchTransition; startedAt: number } | null>(null);
  const planeHeight = storyAvatarPlaneHeight();
  const planeWidth = planeHeight * STORY_SPRITE_MANIFEST.frameSize.width / STORY_SPRITE_MANIFEST.frameSize.height;

  useEffect(() => {
    textures.forEach((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
    });
    if (animation.id === 'roll') crouchTexturesRef.current = textures;
  }, [animation.id, textures]);

  useFrame((state) => {
    const restarting = poseStartedAtRef.current === null || shouldRestartStoryAvatarAnimation(
      lastPoseRef.current,
      pose,
      lastRestartTokenRef.current,
      restartToken
    );
    if (restarting) {
      const previousPose = lastPoseRef.current;
      const crouchTransition = storyAvatarCrouchTransitionForPoseChange(previousPose, pose);
      lastPoseRef.current = pose;
      lastRestartTokenRef.current = restartToken;
      poseStartedAtRef.current = state.clock.elapsedTime;
      crouchTransitionRef.current = crouchTransition
        ? { kind: crouchTransition, startedAt: state.clock.elapsedTime }
        : null;
    }
    let elapsedMs = (state.clock.elapsedTime - (poseStartedAtRef.current ?? state.clock.elapsedTime)) * 1000;
    let frameIndex = pose === 'crouch' ? animation.frames.length - 1 : frameIndexAt(animation, elapsedMs, reducedMotion);
    let texture = textures[frameIndex] ?? textures[0];
    let visualScale = animation.frames[frameIndex]?.visualScale ?? 1;
    const crouchTransition = crouchTransitionRef.current;
    if (crouchTransition) {
      const transitionElapsedMs = (state.clock.elapsedTime - crouchTransition.startedAt) * 1000;
      const transitionFrameIndex = storyAvatarCrouchTransitionFrameIndex(crouchTransition.kind, crouchAnimation, transitionElapsedMs);
      const crouchTextures = animation.id === 'roll' ? textures : crouchTexturesRef.current;
      if (transitionFrameIndex !== null && crouchTextures[transitionFrameIndex]) {
        frameIndex = transitionFrameIndex;
        texture = crouchTextures[transitionFrameIndex];
        visualScale = crouchAnimation.frames[transitionFrameIndex]?.visualScale ?? 1;
      } else {
        crouchTransitionRef.current = null;
        poseStartedAtRef.current = state.clock.elapsedTime;
        elapsedMs = 0;
        frameIndex = pose === 'crouch' ? animation.frames.length - 1 : frameIndexAt(animation, elapsedMs, reducedMotion);
        texture = textures[frameIndex] ?? textures[0];
        visualScale = animation.frames[frameIndex]?.visualScale ?? 1;
      }
    }
    const material = materialRef.current;
    if (texture && material && material.map !== texture) {
      material.map = texture;
      material.needsUpdate = true;
    }
    const mesh = meshRef.current;
    if (mesh) {
      mesh.scale.set(visualScale, visualScale, 1);
      mesh.position.y = storyAvatarMeshCenterYForVisualScale(visualScale);
    }
  });

  return <group scale={[facing, 1, 1]}>
    <mesh
      ref={meshRef}
      position={[0, storyAvatarMeshCenterYForVisualScale(animation.frames[0]?.visualScale ?? 1), 0.85]}
      scale={[animation.frames[0]?.visualScale ?? 1, animation.frames[0]?.visualScale ?? 1, 1]}
      renderOrder={20}
    >
      <planeGeometry args={[planeWidth, planeHeight]} />
      <meshBasicMaterial ref={materialRef} map={textures[0]} transparent alphaTest={0.5} depthTest={false} depthWrite={false} toneMapped={false} />
    </mesh>
  </group>;
}

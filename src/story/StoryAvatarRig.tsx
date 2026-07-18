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
  return pose === 'walk' || pose === 'jump' || pose === 'sprint' ? pose : 'idle';
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

export function StoryAvatarRig({ avatar, pose = 'idle', facing = 1, reducedMotion = false, restartToken = 0 }: {
  avatar: StoryAvatarDefinition;
  pose?: StoryAvatarPose;
  facing?: -1 | 1;
  reducedMotion?: boolean;
  restartToken?: number;
}) {
  const animation = getStorySpriteAnimation(avatar.avatarSet, animationForPose(pose));
  const paths = useMemo(() => animation.frames.map((frame) => frame.path), [animation]);
  const textures = useTexture(paths) as unknown as THREE.Texture[];
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const poseStartedAtRef = useRef<number | null>(null);
  const lastPoseRef = useRef(pose);
  const lastRestartTokenRef = useRef(restartToken);
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
  }, [textures]);

  useFrame((state) => {
    if (poseStartedAtRef.current === null || shouldRestartStoryAvatarAnimation(
      lastPoseRef.current,
      pose,
      lastRestartTokenRef.current,
      restartToken
    )) {
      lastPoseRef.current = pose;
      lastRestartTokenRef.current = restartToken;
      poseStartedAtRef.current = state.clock.elapsedTime;
    }
    const elapsedMs = (state.clock.elapsedTime - (poseStartedAtRef.current ?? state.clock.elapsedTime)) * 1000;
    const frameIndex = frameIndexAt(animation, elapsedMs, reducedMotion);
    const texture = textures[frameIndex] ?? textures[0];
    const visualScale = animation.frames[frameIndex]?.visualScale ?? 1;
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

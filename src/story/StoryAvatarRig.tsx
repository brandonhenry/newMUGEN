import { useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getStorySpriteAnimation, STORY_SPRITE_MANIFEST } from './streetAvatarCatalog';
import type { StoryAvatarDefinition, StoryHubAvatarPose, StorySpriteAnimation } from './types';

export type StoryAvatarPose = StoryHubAvatarPose | 'sprint' | 'attack';

function animationForPose(pose: StoryAvatarPose) {
  return pose === 'walk' || pose === 'jump' || pose === 'sprint' || pose === 'attack' ? pose : 'idle';
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

export function StoryAvatarRig({ avatar, pose = 'idle', facing = 1, reducedMotion = false }: {
  avatar: StoryAvatarDefinition;
  pose?: StoryAvatarPose;
  facing?: -1 | 1;
  reducedMotion?: boolean;
}) {
  const animation = getStorySpriteAnimation(avatar.avatarSet, animationForPose(pose));
  const paths = useMemo(() => animation.frames.map((frame) => frame.path), [animation]);
  const textures = useTexture(paths) as unknown as THREE.Texture[];
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const poseStartedAtRef = useRef(0);
  const lastPoseRef = useRef(pose);
  const planeHeight = 3.2 * STORY_SPRITE_MANIFEST.frameSize.height / 176;
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
    if (lastPoseRef.current !== pose) {
      lastPoseRef.current = pose;
      poseStartedAtRef.current = state.clock.elapsedTime;
    }
    const elapsedMs = (state.clock.elapsedTime - poseStartedAtRef.current) * 1000;
    const frameIndex = frameIndexAt(animation, elapsedMs, reducedMotion);
    const texture = textures[frameIndex] ?? textures[0];
    const material = materialRef.current;
    if (texture && material && material.map !== texture) {
      material.map = texture;
      material.needsUpdate = true;
    }
  });

  return <group scale={[facing, 1, 1]}>
    <mesh position={[0, 0.63, 0.2]} renderOrder={20}>
      <planeGeometry args={[planeWidth, planeHeight]} />
      <meshBasicMaterial ref={materialRef} map={textures[0]} transparent alphaTest={0.5} depthWrite={false} toneMapped={false} />
    </mesh>
  </group>;
}

import { Bounds, ContactShadows, Environment, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { FighterRuntime, MatchSnapshot } from '../types';
import { activeMoveProgress } from '../engine/fightEngine';

type GameSceneProps = {
  match: MatchSnapshot;
};

export function GameScene({ match }: GameSceneProps) {
  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0, 3.3, 6.8], fov: 46 }} data-testid="fight-canvas">
      <color attach="background" args={['#101114']} />
      <fog attach="fog" args={['#101114', 8, 18]} />
      <Suspense fallback={null}>
        <Environment preset="city" />
      </Suspense>
      <ambientLight intensity={0.55} />
      <directionalLight castShadow position={[3, 6, 4]} intensity={1.8} color={match.stage.light} shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-4, 2, -3]} color={match.fighters[0].character.colors.primary} intensity={8} distance={7} />
      <pointLight position={[4, 2, 3]} color={match.fighters[1].character.colors.primary} intensity={8} distance={7} />
      <CameraRig match={match} />
      <Arena floor={match.stage.floor} rail={match.stage.rail} />
      <FighterRig fighter={match.fighters[0]} />
      <FighterRig fighter={match.fighters[1]} />
      <ContactShadows position={[0, -0.01, 0]} opacity={0.45} scale={12} blur={2.4} far={3} />
    </Canvas>
  );
}

function CameraRig({ match }: { match: MatchSnapshot }) {
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, delta) => {
    const [p1, p2] = match.fighters;
    const midX = (p1.position.x + p2.position.x) / 2;
    const midZ = (p1.position.z + p2.position.z) / 2;
    const distance = Math.abs(p1.position.x - p2.position.x);
    const shake = match.cameraShake * Math.sin(performance.now() * 0.055) * 0.18;
    const desired = new THREE.Vector3(midX + shake, 2.7 + distance * 0.16, 5.7 + distance * 0.34);
    camera.position.lerp(desired, 1 - Math.pow(0.001, delta));
    target.set(midX, 1.05, midZ);
    camera.lookAt(target);
  });
  return null;
}

function Arena({ floor, rail }: { floor: string; rail: string }) {
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[11, 5.4, 24, 12]} />
        <meshStandardMaterial color={floor} roughness={0.74} metalness={0.16} />
      </mesh>
      <gridHelper args={[10, 10, rail, '#3a4048']} position={[0, 0.012, 0]} />
      {[-2.35, 2.35].map((z) => (
        <mesh key={z} position={[0, 0.22, z]} castShadow>
          <boxGeometry args={[10.4, 0.13, 0.13]} />
          <meshStandardMaterial color={rail} emissive={rail} emissiveIntensity={0.45} />
        </mesh>
      ))}
      {[-5.1, 5.1].map((x) => (
        <mesh key={x} position={[x, 0.22, 0]} castShadow>
          <boxGeometry args={[0.13, 0.13, 5]} />
          <meshStandardMaterial color={rail} emissive={rail} emissiveIntensity={0.28} />
        </mesh>
      ))}
      <mesh position={[0, 0.02, -2.7]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.8, 4.2, 72]} />
        <meshBasicMaterial color={rail} transparent opacity={0.18} />
      </mesh>
    </group>
  );
}

function FighterRig({ fighter }: { fighter: FighterRuntime }) {
  const group = useRef<THREE.Group>(null);
  const progress = activeMoveProgress(fighter);
  useFrame((state) => {
    if (!group.current) return;
    const bob = fighter.state === 'idle' ? Math.sin(state.clock.elapsedTime * 4 + fighter.slot) * 0.025 : 0;
    const hitLean = fighter.state === 'hit' ? -fighter.facing * 0.16 : 0;
    const attackLean = fighter.state === 'attack' ? fighter.facing * Math.sin(progress * Math.PI) * 0.2 : 0;
    group.current.position.set(fighter.position.x, fighter.position.y + bob, fighter.position.z);
    group.current.rotation.set(fighter.state === 'knockdown' ? -0.85 : 0, fighter.facing === 1 ? Math.PI / 2 : -Math.PI / 2, hitLean + attackLean);
  });

  const color = fighter.hitFlash > 0 ? '#ffffff' : fighter.blockFlash > 0 ? fighter.character.colors.accent : fighter.character.colors.primary;
  return (
    <group ref={group} scale={fighter.character.scale}>
      <Bounds fit={false}>
        {fighter.character.modelPath.startsWith('builtin://') ? (
          <ProceduralFighter fighter={fighter} color={color} progress={progress} />
        ) : (
          <ExternalFighter url={fighter.character.modelPath} />
        )}
      </Bounds>
    </group>
  );
}

function ExternalFighter({ url }: { url: string }) {
  const gltf = useGLTF(url);
  return <primitive object={gltf.scene.clone()} />;
}

function ProceduralFighter({
  fighter,
  color,
  progress
}: {
  fighter: FighterRuntime;
  color: string;
  progress: number;
}) {
  const root = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Mesh>(null);
  const head = useRef<THREE.Mesh>(null);
  const leadArm = useRef<THREE.Group>(null);
  const rearArm = useRef<THREE.Group>(null);
  const leadLeg = useRef<THREE.Group>(null);
  const rearLeg = useRef<THREE.Group>(null);
  const secondary = fighter.character.colors.secondary;
  const accent = fighter.character.colors.accent;
  const bulk = fighter.character.id === 'dax' ? 1.12 : 0.95;

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const moving = fighter.state === 'walk' || fighter.state === 'sidestep';
    const walk = moving ? Math.sin(t * 11) : 0;
    const side = fighter.state === 'sidestep' ? Math.sin(t * 13) * 0.16 : 0;
    const attack = fighter.state === 'attack' ? Math.sin(progress * Math.PI) : 0;
    const block = fighter.state === 'block' ? 1 : 0;
    const hit = fighter.state === 'hit' ? fighter.hitFlash : 0;
    const crouch = block ? -0.12 : 0;

    if (root.current) {
      root.current.position.y = THREE.MathUtils.lerp(root.current.position.y, crouch, 1 - Math.pow(0.001, delta));
    }
    if (torso.current) {
      torso.current.rotation.x = THREE.MathUtils.lerp(torso.current.rotation.x, block * -0.32 + hit * 0.22, 0.35);
      torso.current.rotation.z = THREE.MathUtils.lerp(torso.current.rotation.z, side + attack * 0.1, 0.32);
    }
    if (head.current) {
      head.current.position.y = 1.72 + Math.sin(t * 4 + fighter.slot) * 0.018;
      head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, hit * 0.24, 0.28);
    }
    if (leadArm.current) {
      leadArm.current.position.z = 0.06 + attack * 0.52 + block * 0.16;
      leadArm.current.position.y = 1.28 - block * 0.08;
      leadArm.current.rotation.x = -0.18 - attack * 1.35 - block * 0.86 + walk * 0.22;
      leadArm.current.rotation.z = 0.18 + block * 0.36;
    }
    if (rearArm.current) {
      rearArm.current.position.z = -0.04 + block * 0.14;
      rearArm.current.position.y = 1.23 - block * 0.04;
      rearArm.current.rotation.x = 0.12 + attack * 0.38 - walk * 0.2 - block * 0.7;
      rearArm.current.rotation.z = -0.12 - block * 0.28;
    }
    if (leadLeg.current) {
      leadLeg.current.rotation.x = walk * 0.34 + side * 0.5;
      leadLeg.current.rotation.z = side * 0.3;
    }
    if (rearLeg.current) {
      rearLeg.current.rotation.x = -walk * 0.34 - side * 0.5;
      rearLeg.current.rotation.z = -side * 0.3;
    }
  });

  return (
    <group ref={root}>
      <mesh ref={head} castShadow position={[0, 1.72, 0]}>
        <sphereGeometry args={[0.24 * bulk, 20, 16]} />
        <meshStandardMaterial color={color} roughness={0.48} metalness={0.2} emissive={color} emissiveIntensity={0.08} />
      </mesh>
      <mesh ref={torso} castShadow position={[0, 1.22, 0]}>
        <capsuleGeometry args={[0.28 * bulk, 0.72, 8, 18]} />
        <meshStandardMaterial color={secondary} roughness={0.62} metalness={0.28} />
      </mesh>
      <group ref={leadArm} position={[0.23, 1.22, 0.08]}>
        <mesh castShadow position={[0, -0.22, 0]}>
          <capsuleGeometry args={[0.07, 0.62, 6, 12]} />
          <meshStandardMaterial color={accent} roughness={0.5} />
        </mesh>
      </group>
      <group ref={rearArm} position={[-0.23, 1.22, -0.05]}>
        <mesh castShadow position={[0, -0.2, 0]}>
          <capsuleGeometry args={[0.07, 0.58, 6, 12]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      </group>
      <group ref={leadLeg} position={[0.15, 0.78, 0.04]}>
        <mesh castShadow position={[0, -0.3, 0]}>
          <capsuleGeometry args={[0.09, 0.76, 6, 12]} />
          <meshStandardMaterial color={color} roughness={0.54} />
        </mesh>
      </group>
      <group ref={rearLeg} position={[-0.15, 0.78, -0.04]}>
        <mesh castShadow position={[0, -0.3, 0]}>
          <capsuleGeometry args={[0.09, 0.76, 6, 12]} />
          <meshStandardMaterial color={accent} roughness={0.54} />
        </mesh>
      </group>
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.32, 0.38, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

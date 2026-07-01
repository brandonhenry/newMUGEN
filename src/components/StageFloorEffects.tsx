import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { FighterRuntime, ImpactSparkEvent, StageDefinition, StageFloorGrassEffect, StageFloorSimpleEffect } from '../types';

type StageFloorEffectsProps = {
  stage: StageDefinition;
  fighters?: FighterRuntime[];
  impactEvents?: ImpactSparkEvent[];
};

type ParticleVariant = 'petals' | 'snow' | 'rain' | 'wind' | 'cherry';

const QUALITY_MULTIPLIER = {
  low: 0.38,
  medium: 0.72,
  high: 1
} as const;

export function StageFloorEffects({ stage, fighters, impactEvents }: StageFloorEffectsProps) {
  const effects = stage.floorEffects;
  const preview = !fighters?.length && !impactEvents?.length;
  if (!effects) return null;
  return (
    <group>
      {effects.energy?.enabled && <StageEnergyFloor stage={stage} effect={effects.energy} />}
      {effects.rainPuddles?.enabled && <StageWaterSurface stage={stage} effect={effects.rainPuddles} variant="puddles" fighters={fighters} />}
      {effects.ripples?.enabled && <StageWaterSurface stage={stage} effect={effects.ripples} variant="ripples" fighters={fighters} />}
      {effects.grass?.enabled && <StageGrassField stage={stage} grass={effects.grass} preview={preview} />}
      {effects.dust?.enabled && <StageDustSystem stage={stage} effect={effects.dust} fighters={fighters} preview={preview} />}
      {effects.footsteps?.enabled && <StageFootstepDecals stage={stage} effect={effects.footsteps} fighters={fighters} preview={preview} />}
      {effects.impact?.enabled && <StageImpactDecals stage={stage} effect={effects.impact} impactEvents={impactEvents} preview={preview} />}
      {effects.petals?.enabled && <StageQuadParticles stage={stage} effect={effects.petals} variant="petals" preview={preview} />}
      {effects.snow?.enabled && <StagePointWeather stage={stage} effect={effects.snow} variant="snow" preview={preview} />}
      {effects.rain?.enabled && <StagePointWeather stage={stage} effect={effects.rain} variant="rain" preview={preview} />}
      {effects.fog?.enabled && <StageFogSheets stage={stage} effect={effects.fog} />}
      {effects.heat?.enabled && <StageHeatHaze stage={stage} effect={effects.heat} />}
      {effects.glowTrails?.enabled && <StageGlowTrails stage={stage} effect={effects.glowTrails} fighters={fighters} preview={preview} />}
      {effects.windStreaks?.enabled && <StageQuadParticles stage={stage} effect={effects.windStreaks} variant="wind" preview={preview} />}
      {effects.cherryBurst?.enabled && <StageQuadParticles stage={stage} effect={effects.cherryBurst} variant="cherry" preview={preview} />}
      {effects.tileShimmer?.enabled && <StageTileShimmer stage={stage} effect={effects.tileShimmer} />}
      {effects.debris?.enabled && <StageDebrisField stage={stage} effect={effects.debris} preview={preview} />}
    </group>
  );
}

function StageGrassField({ stage, grass, preview }: { stage: StageDefinition; grass: StageFloorGrassEffect; preview: boolean }) {
  const coverage = grass.coverageScale ?? 1.08;
  const width = THREE.MathUtils.clamp(grass.patchWidth ?? floorEffectWidth(stage, coverage), 4, floorEffectWidth(stage, Math.max(coverage, 1.18)));
  const depth = THREE.MathUtils.clamp(grass.patchDepth ?? floorEffectDepth(stage, coverage), 4, floorEffectDepth(stage, Math.max(coverage, 1.18)));
  const quality = preview ? 'low' : grass.quality ?? 'medium';
  const density = THREE.MathUtils.clamp(grass.density ?? 0.45, 0.05, 1);
  const targetCount = grass.bladeCount && grass.bladeCount > 0
    ? grass.bladeCount
    : (width * depth * density) / (quality === 'high' ? 4.8 : quality === 'medium' ? 6.6 : 10.8);
  const totalBlades = Math.round(THREE.MathUtils.clamp(targetCount * QUALITY_MULTIPLIER[quality], preview ? 900 : 1800, quality === 'high' ? 22000 : 13000));
  const chunkColumns = preview ? 2 : Math.max(2, Math.min(5, Math.ceil(width / 62)));
  const chunkRows = preview ? 2 : Math.max(2, Math.min(5, Math.ceil(depth / 62)));
  const chunks = useMemo(() => {
    const result: Array<{ id: string; x: number; z: number; width: number; depth: number; count: number; seed: number }> = [];
    const countPerChunk = Math.max(1, Math.floor(totalBlades / (chunkColumns * chunkRows)));
    for (let row = 0; row < chunkRows; row += 1) {
      for (let column = 0; column < chunkColumns; column += 1) {
        const chunkWidth = width / chunkColumns;
        const chunkDepth = depth / chunkRows;
        result.push({
          id: `${row}-${column}`,
          x: -width / 2 + chunkWidth * (column + 0.5),
          z: -depth / 2 + chunkDepth * (row + 0.5),
          width: chunkWidth,
          depth: chunkDepth,
          count: countPerChunk + (result.length < totalBlades % (chunkColumns * chunkRows) ? 1 : 0),
          seed: hashString(`${stage.id}:${stage.floorAssetId ?? stage.floorTexturePath ?? 'floor'}:grass:${row}:${column}`)
        });
      }
    }
    return result;
  }, [chunkColumns, chunkRows, depth, stage.floorAssetId, stage.floorTexturePath, stage.id, totalBlades, width]);

  return (
    <group position={[0, floorEffectY(stage, 0.012), 0]}>
      {chunks.map((chunk) => (
        <GrassChunk key={chunk.id} stage={stage} grass={grass} chunk={chunk} />
      ))}
    </group>
  );
}

function GrassChunk({
  stage,
  grass,
  chunk
}: {
  stage: StageDefinition;
  grass: StageFloorGrassEffect;
  chunk: { x: number; z: number; width: number; depth: number; count: number; seed: number };
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const height = THREE.MathUtils.clamp(grass.height ?? 0.28, 0.04, 1.8);
  const bladeWidth = THREE.MathUtils.clamp(grass.bladeWidth ?? 0.075, 0.01, 0.4);
  const geometry = useMemo(() => createGrassBladeGeometry(Math.round(grass.segments ?? 5), bladeWidth), [bladeWidth, grass.segments]);
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWindStrength: { value: grass.windStrength ?? 0.14 },
      uWindSpeed: { value: grass.windSpeed ?? 1.1 },
      uWindDirection: { value: new THREE.Vector2(...normalizedWind(grass.windDirection)) },
      uNoiseScale: { value: grass.windNoiseScale ?? 0.58 },
      uBottomColor: { value: new THREE.Color(grass.colorBottom ?? '#174d25') },
      uTopColor: { value: new THREE.Color(grass.colorTop ?? '#7bd34d') }
    },
    vertexShader: `
      uniform float uTime;
      uniform float uWindStrength;
      uniform float uWindSpeed;
      uniform vec2 uWindDirection;
      uniform float uNoiseScale;
      varying vec2 vUv;
      varying vec3 vInstanceColor;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      void main() {
        vUv = uv;
        vInstanceColor = instanceColor;
        vec3 transformed = position;
        vec4 instanceOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float gust = noise(instanceOrigin.xz * uNoiseScale + uWindDirection * uTime * uWindSpeed);
        float sway = sin(uTime * uWindSpeed + instanceOrigin.x * 0.36 + instanceOrigin.z * 0.44) * 0.35 + gust * 0.65;
        transformed.xz += normalize(vec2(uWindDirection.x, uWindDirection.y)).xy * sway * uWindStrength * uv.y;
        transformed.x += sin(uv.y * 3.14159) * 0.03 * uv.y;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uBottomColor;
      uniform vec3 uTopColor;
      varying vec2 vUv;
      varying vec3 vInstanceColor;

      void main() {
        float edge = smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.92, 1.0, vUv.x));
        if (edge < 0.04) discard;
        vec3 gradient = mix(uBottomColor, uTopColor, smoothstep(0.0, 1.0, vUv.y));
        vec3 color = mix(gradient, vInstanceColor, 0.42);
        gl_FragColor = vec4(color, edge * 0.94);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    alphaTest: 0.04
  }), []);

  useEffect(() => {
    material.uniforms.uWindStrength.value = grass.windStrength ?? 0.14;
    material.uniforms.uWindSpeed.value = grass.windSpeed ?? 1.1;
    (material.uniforms.uWindDirection.value as THREE.Vector2).fromArray(normalizedWind(grass.windDirection));
    material.uniforms.uNoiseScale.value = grass.windNoiseScale ?? 0.58;
    (material.uniforms.uBottomColor.value as THREE.Color).set(grass.colorBottom ?? '#174d25');
    (material.uniforms.uTopColor.value as THREE.Color).set(grass.colorTop ?? '#7bd34d');
  }, [grass.colorBottom, grass.colorTop, grass.windDirection, grass.windNoiseScale, grass.windSpeed, grass.windStrength, material]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const random = seededRandom(chunk.seed);
    const dummy = new THREE.Object3D();
    const baseColor = new THREE.Color(grass.colorBottom ?? '#174d25');
    const topColor = new THREE.Color(grass.colorTop ?? '#7bd34d');
    const color = new THREE.Color();
    const variation = grass.colorVariation ?? 0.18;
    for (let index = 0; index < chunk.count; index += 1) {
      const x = (random() - 0.5) * chunk.width;
      const z = (random() - 0.5) * chunk.depth;
      const bladeHeight = (0.55 + random() * 0.85) * height;
      const widthScale = 0.72 + random() * 0.72;
      dummy.position.set(x, 0, z);
      dummy.rotation.set((random() - 0.5) * 0.16, random() * Math.PI, (random() - 0.5) * 0.22);
      dummy.scale.set(widthScale, bladeHeight, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      color.copy(baseColor).lerp(topColor, 0.35 + random() * 0.45);
      color.offsetHSL((random() - 0.5) * variation * 0.12, (random() - 0.5) * variation * 0.24, (random() - 0.5) * variation * 0.18);
      mesh.setColorAt(index, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [chunk.count, chunk.depth, chunk.seed, chunk.width, grass.colorBottom, grass.colorTop, grass.colorVariation, height]);

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
  });

  return <instancedMesh ref={meshRef} args={[geometry, material, chunk.count]} position={[chunk.x, 0, chunk.z]} renderOrder={3} frustumCulled={false} />;
}

function StageDustSystem({ stage, effect, fighters, preview }: { stage: StageDefinition; effect: StageFloorSimpleEffect; fighters?: FighterRuntime[]; preview: boolean }) {
  const count = particleCount(stage, effect, 90, preview);
  const positions = useMemo(() => randomPositions(stage, 'dust-points', count, 0.08, 0.34, effect.coverageScale), [count, effect.coverageScale, stage.id, stage.world?.depth, stage.world?.width]);
  const material = useMemo(() => new THREE.PointsMaterial({
    color: effect.color ?? '#c8b48a',
    size: 0.18 * (effect.size ?? 1),
    transparent: true,
    opacity: (effect.opacity ?? 0.38) * 0.42,
    depthWrite: false,
    sizeAttenuation: true
  }), []);
  useEffect(() => {
    material.color.set(effect.color ?? '#c8b48a');
    material.size = 0.18 * (effect.size ?? 1);
    material.opacity = (effect.opacity ?? 0.38) * 0.42;
  }, [effect.color, effect.opacity, effect.size, material]);
  return (
    <group>
      <points renderOrder={5}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <primitive object={material} attach="material" />
      </points>
      <StageFootPuffs stage={stage} effect={effect} fighters={fighters} />
    </group>
  );
}

function StageFootPuffs({ stage, effect, fighters }: { stage: StageDefinition; effect: StageFloorSimpleEffect; fighters?: FighterRuntime[] }) {
  const { camera } = useThree();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const anchors = (fighters ?? []).map((fighter) => [fighter.position.x - fighter.facing * 0.42, fighter.position.z] as [number, number]);
  const geometry = useMemo(() => new THREE.PlaneGeometry(0.68, 0.34), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: effect.color ?? '#c8b48a', transparent: true, opacity: effect.opacity ?? 0.38, depthWrite: false, side: THREE.DoubleSide }), []);
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    anchors.forEach(([x, z], index) => {
      dummy.position.set(x, 0, z);
      dummy.rotation.set(-Math.PI / 2, 0, index * 0.8);
      dummy.scale.setScalar(effect.size ?? 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [anchors, effect.size]);
  useFrame(() => {
    if (!meshRef.current) return;
    material.color.set(effect.color ?? '#c8b48a');
    material.opacity = effect.opacity ?? 0.38;
    meshRef.current.quaternion.copy(camera.quaternion);
  });
  if (!anchors.length) return null;
  return <instancedMesh ref={meshRef} args={[geometry, material, anchors.length]} position={[0, floorEffectY(stage, 0.22), 0]} renderOrder={8} frustumCulled={false} />;
}

function StageFootstepDecals({ stage, effect, fighters, preview }: { stage: StageDefinition; effect: StageFloorSimpleEffect; fighters?: FighterRuntime[]; preview: boolean }) {
  const floorY = floorEffectY(stage, 0.023);
  const maxDecals = decalCount(effect, preview, 44);
  const ambient = useMemo(() => {
    const random = seededRandom(hashString(`${stage.id}:footsteps`));
    return floorEffectPositions(stage, 'footsteps', maxDecals, floorEffectWidth(stage, effect.coverageScale), floorEffectDepth(stage, effect.coverageScale)).map(([x, z], index) => {
      const side = index % 2 === 0 ? -0.12 : 0.12;
      return [x + side, z, (random() - 0.5) * 1.8, 0.45 + random() * 0.5] as [number, number, number, number];
    });
  }, [effect.coverageScale, maxDecals, stage.id, stage.world?.depth, stage.world?.width]);
  const live = (fighters ?? []).map((fighter) => [fighter.position.x, fighter.position.z - 0.22, fighter.facing * 0.08, 1] as [number, number, number, number]);
  return (
    <group>
      {[...ambient, ...live].slice(-Math.max(maxDecals, live.length)).map(([x, z, rot, alpha], index) => (
        <mesh key={`footstep-${index}`} position={[x, floorY, z]} rotation={[-Math.PI / 2, 0, rot]} renderOrder={6}>
          <planeGeometry args={[0.18 * (effect.size ?? 1), 0.48 * (effect.size ?? 1)]} />
          <meshBasicMaterial color={effect.color ?? '#f4f0de'} transparent opacity={(effect.opacity ?? 0.28) * alpha} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function StageImpactDecals({ stage, effect, impactEvents, preview }: { stage: StageDefinition; effect: StageFloorSimpleEffect; impactEvents?: ImpactSparkEvent[]; preview: boolean }) {
  const maxDecals = decalCount(effect, preview, 18);
  const recent = (impactEvents ?? []).slice(-maxDecals).map((event, index) => ({
    x: event.position[0],
    z: event.position[2],
    scale: Math.max(0.9, Math.min(2.7, 0.9 + event.damage / 18)),
    alpha: Math.max(0.2, 1 - index / Math.max(1, maxDecals)),
    seed: hashString(`${stage.id}:impact:${event.id ?? index}`)
  }));
  const fallback = recent.length ? [] : floorEffectPositions(stage, 'impact-fallback', Math.min(8, maxDecals), floorEffectWidth(stage, effect.coverageScale), floorEffectDepth(stage, effect.coverageScale)).map(([x, z], index) => ({
    x,
    z,
    scale: 0.75 + (index % 4) * 0.25,
    alpha: 0.24,
    seed: hashString(`${stage.id}:impact-fallback:${index}`)
  }));
  return (
    <group position={[0, floorEffectY(stage, 0.031), 0]}>
      {[...fallback, ...recent].map((decal, index) => (
        <ImpactDecal key={`impact-${index}`} effect={effect} decal={decal} />
      ))}
    </group>
  );
}

function ImpactDecal({ effect, decal }: { effect: StageFloorSimpleEffect; decal: { x: number; z: number; scale: number; alpha: number; seed: number } }) {
  const random = useMemo(() => seededRandom(decal.seed), [decal.seed]);
  const cracks = useMemo(() => Array.from({ length: 5 }, (_, index) => ({
    angle: random() * Math.PI * 2,
    length: (0.55 + random() * 0.85) * decal.scale * (effect.size ?? 1),
    width: 0.025 + random() * 0.035,
    offset: index * 0.002
  })), [decal.scale, effect.size, random]);
  return (
    <group position={[decal.x, 0, decal.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh renderOrder={7}>
        <ringGeometry args={[0.38 * decal.scale * (effect.size ?? 1), 0.49 * decal.scale * (effect.size ?? 1), 64]} />
        <meshBasicMaterial color={effect.color ?? '#ffffff'} transparent opacity={(effect.opacity ?? 0.46) * decal.alpha} depthWrite={false} />
      </mesh>
      <mesh renderOrder={7}>
        <circleGeometry args={[0.18 * decal.scale * (effect.size ?? 1), 32]} />
        <meshBasicMaterial color={effect.color ?? '#ffffff'} transparent opacity={0.09 * (effect.intensity ?? 0.8) * decal.alpha} depthWrite={false} />
      </mesh>
      {cracks.map((crack, index) => (
        <mesh key={`crack-${index}`} position={[0, 0, crack.offset]} rotation={[0, 0, crack.angle]} renderOrder={8}>
          <planeGeometry args={[crack.length, crack.width]} />
          <meshBasicMaterial color={effect.color ?? '#ffffff'} transparent opacity={(effect.opacity ?? 0.46) * 0.72 * decal.alpha} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function StageQuadParticles({ stage, effect, variant, preview }: { stage: StageDefinition; effect: StageFloorSimpleEffect; variant: Exclude<ParticleVariant, 'rain' | 'snow'>; preview: boolean }) {
  const { camera } = useThree();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = particleCount(stage, effect, variant === 'wind' ? 120 : 180, preview);
  const width = floorEffectWidth(stage, effect.coverageScale);
  const depth = floorEffectDepth(stage, effect.coverageScale);
  const colorA = effect.colorA ?? effect.color ?? (variant === 'wind' ? '#dff8ff' : '#ff9ac5');
  const colorB = effect.colorB ?? colorA;
  const geometry = useMemo(() => new THREE.PlaneGeometry(variant === 'wind' ? 0.08 : 0.14, variant === 'wind' ? 1.8 : 0.26), [variant]);
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color(colorA).lerp(new THREE.Color(colorB), 0.35),
    transparent: true,
    opacity: effect.opacity ?? 0.72,
    depthWrite: false,
    side: THREE.DoubleSide
  }), []);
  const anchors = useMemo(() => {
    const random = seededRandom(hashString(`${stage.id}:${variant}:quad-particles`));
    return Array.from({ length: count }, () => ({
      x: (random() - 0.5) * width,
      y: 0.6 + random() * 5.8,
      z: (random() - 0.5) * depth,
      scale: (0.65 + random() * 0.9) * (effect.size ?? 1),
      spin: random() * Math.PI * 2
    }));
  }, [count, depth, effect.size, stage.id, variant, width]);
  useEffect(() => {
    material.color.set(colorA).lerp(new THREE.Color(colorB), 0.35);
    material.opacity = effect.opacity ?? 0.72;
  }, [colorA, colorB, effect.opacity, material]);
  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const time = clock.elapsedTime;
    const fall = effect.fallSpeed ?? (variant === 'wind' ? 0.06 : 0.65);
    const drift = effect.windStrength ?? (variant === 'wind' ? 1.2 : 0.42);
    anchors.forEach((anchor, index) => {
      const y = wrapRange(anchor.y - time * fall * (variant === 'wind' ? 0.28 : 1), 0.3, 6.6);
      const x = wrapRange(anchor.x + Math.sin(time * 0.35 + index) * drift + time * drift * 0.06, -width / 2, width / 2);
      const z = wrapRange(anchor.z + Math.cos(time * 0.22 + index * 0.7) * drift * 0.22, -depth / 2, depth / 2);
      dummy.position.set(x, y, z);
      dummy.quaternion.copy(camera.quaternion);
      dummy.rotateZ(anchor.spin + time * (effect.speed ?? 1) * (variant === 'wind' ? 0.08 : 0.35));
      dummy.scale.setScalar(anchor.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={meshRef} args={[geometry, material, count]} position={[0, 0, 0]} renderOrder={10} frustumCulled={false} />;
}

function StagePointWeather({ stage, effect, variant, preview }: { stage: StageDefinition; effect: StageFloorSimpleEffect; variant: 'snow' | 'rain'; preview: boolean }) {
  const pointsRef = useRef<THREE.Points>(null);
  const count = particleCount(stage, effect, variant === 'rain' ? 420 : 260, preview);
  const positions = useMemo(() => randomPositions(stage, `${variant}-points`, count, 0.8, 7.2, effect.coverageScale), [count, effect.coverageScale, stage.id, stage.world?.depth, stage.world?.width, variant]);
  const material = useMemo(() => new THREE.PointsMaterial({
    color: effect.color ?? (variant === 'rain' ? '#b6edff' : '#f8fcff'),
    size: (variant === 'rain' ? 0.075 : 0.12) * (effect.size ?? 1),
    transparent: true,
    opacity: effect.opacity ?? (variant === 'rain' ? 0.5 : 0.82),
    depthWrite: false,
    sizeAttenuation: true
  }), []);
  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    pointsRef.current.position.y = -((clock.elapsedTime * (effect.fallSpeed ?? (variant === 'rain' ? 2.2 : 0.45))) % 7);
    pointsRef.current.position.x = Math.sin(clock.elapsedTime * 0.22) * (effect.windStrength ?? 0.22);
  });
  useEffect(() => {
    material.color.set(effect.color ?? (variant === 'rain' ? '#b6edff' : '#f8fcff'));
    material.size = (variant === 'rain' ? 0.075 : 0.12) * (effect.size ?? 1);
    material.opacity = effect.opacity ?? (variant === 'rain' ? 0.5 : 0.82);
  }, [effect.color, effect.opacity, effect.size, material, variant]);
  return (
    <points ref={pointsRef} renderOrder={12}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <primitive object={material} attach="material" />
    </points>
  );
}

function StageWaterSurface({ stage, effect, variant, fighters }: { stage: StageDefinition; effect: StageFloorSimpleEffect; variant: 'puddles' | 'ripples'; fighters?: FighterRuntime[] }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(effect.color ?? (variant === 'puddles' ? '#9ad7ff' : '#80eaff')) },
      uOpacity: { value: effect.opacity ?? (variant === 'puddles' ? 0.24 : 0.38) },
      uStrength: { value: effect.strength ?? 0.35 },
      uRadius: { value: effect.radius ?? 1.5 },
      uCenterA: { value: new THREE.Vector2(0, 0) },
      uCenterB: { value: new THREE.Vector2(2.8, -1.2) }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uStrength;
      uniform float uRadius;
      uniform vec2 uCenterA;
      uniform vec2 uCenterB;
      varying vec2 vUv;
      varying vec3 vWorld;

      float ring(vec2 point, vec2 center, float offset) {
        float d = distance(point, center);
        float wave = sin(d * 8.0 - uTime * 3.2 + offset) * 0.5 + 0.5;
        float fade = 1.0 - smoothstep(uRadius * 0.8, uRadius * 7.0, d);
        return wave * fade;
      }

      void main() {
        vec2 p = vWorld.xz;
        float lane = smoothstep(0.08, 0.5, abs(sin(vUv.x * 18.0) * sin(vUv.y * 15.0)));
        float ripple = ring(p, uCenterA, 0.0) + ring(p, uCenterB, 1.7);
        float shimmer = 0.5 + 0.5 * sin((vUv.x + vUv.y) * 24.0 + uTime * 1.8);
        float alpha = uOpacity * (0.2 + shimmer * 0.24 + ripple * uStrength + lane * 0.08);
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  }), []);
  useEffect(() => {
    (material.uniforms.uColor.value as THREE.Color).set(effect.color ?? (variant === 'puddles' ? '#9ad7ff' : '#80eaff'));
    material.uniforms.uOpacity.value = effect.opacity ?? (variant === 'puddles' ? 0.24 : 0.38);
    material.uniforms.uStrength.value = effect.strength ?? 0.35;
    material.uniforms.uRadius.value = effect.radius ?? 1.5;
  }, [effect.color, effect.opacity, effect.radius, effect.strength, material, variant]);
  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime * (effect.speed ?? 1);
    const [first, second] = fighters ?? [];
    if (first) (material.uniforms.uCenterA.value as THREE.Vector2).set(first.position.x, first.position.z);
    if (second) (material.uniforms.uCenterB.value as THREE.Vector2).set(second.position.x, second.position.z);
  });
  return (
    <mesh position={[0, floorEffectY(stage, 0.017), 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}>
      <planeGeometry args={[floorEffectWidth(stage, effect.coverageScale), floorEffectDepth(stage, effect.coverageScale), 1, 1]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function StageEnergyFloor({ stage, effect }: { stage: StageDefinition; effect: StageFloorSimpleEffect }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(effect.colorA ?? effect.color ?? '#ffb347') },
      uColorB: { value: new THREE.Color(effect.colorB ?? '#a920ff') },
      uOpacity: { value: effect.opacity ?? 0.44 },
      uIntensity: { value: effect.intensity ?? 0.82 }
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform float uOpacity;
      uniform float uIntensity;
      varying vec2 vUv;
      float grid(vec2 uv, float scale) {
        vec2 line = abs(fract(uv * scale - 0.5) - 0.5) / fwidth(uv * scale);
        return 1.0 - min(min(line.x, line.y), 1.0);
      }
      void main() {
        float wave = 0.5 + 0.5 * sin(uTime + vUv.x * 18.0 + vUv.y * 12.0);
        float pulse = 0.5 + 0.5 * sin(uTime * 1.7 + distance(vUv, vec2(0.5)) * 18.0);
        float lines = grid(vUv + vec2(sin(uTime * 0.12), cos(uTime * 0.1)) * 0.03, 10.0);
        vec3 color = mix(uColorA, uColorB, wave);
        gl_FragColor = vec4(color, uOpacity * (0.18 + pulse * 0.34 + lines * 0.55) * uIntensity);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  }), []);
  useEffect(() => {
    (material.uniforms.uColorA.value as THREE.Color).set(effect.colorA ?? effect.color ?? '#ffb347');
    (material.uniforms.uColorB.value as THREE.Color).set(effect.colorB ?? '#a920ff');
    material.uniforms.uOpacity.value = effect.opacity ?? 0.44;
    material.uniforms.uIntensity.value = effect.intensity ?? 0.82;
  }, [effect.color, effect.colorA, effect.colorB, effect.intensity, effect.opacity, material]);
  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime * (effect.pulseSpeed ?? effect.speed ?? 1.2);
  });
  return (
    <mesh position={[0, floorEffectY(stage, 0.016), 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}>
      <planeGeometry args={[floorEffectWidth(stage, effect.coverageScale), floorEffectDepth(stage, effect.coverageScale), 1, 1]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function StageFogSheets({ stage, effect }: { stage: StageDefinition; effect: StageFloorSimpleEffect }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(effect.color ?? '#c7f2d7') },
      uOpacity: { value: effect.opacity ?? 0.32 }
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float soft = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.78, 1.0, vUv.y));
        float drift = 0.5 + 0.5 * sin(vUv.x * 12.0 + uTime);
        gl_FragColor = vec4(uColor, uOpacity * soft * (0.45 + drift * 0.35));
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  }), []);
  const floorY = floorEffectY(stage, 0.12);
  const width = floorEffectWidth(stage, effect.coverageScale);
  const depth = floorEffectDepth(stage, effect.coverageScale);
  const sheetCount = Math.max(6, Math.min(18, Math.round(depth / 14)));
  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime * (effect.speed ?? 0.45);
  });
  useEffect(() => {
    (material.uniforms.uColor.value as THREE.Color).set(effect.color ?? '#c7f2d7');
    material.uniforms.uOpacity.value = effect.opacity ?? 0.32;
  }, [effect.color, effect.opacity, material]);
  return (
    <group>
      {Array.from({ length: sheetCount }, (_, index) => {
        const z = -depth / 2 + (depth * (index + 0.5)) / sheetCount;
        return (
          <mesh key={`fog-${index}`} position={[Math.sin(index) * 1.2, floorY + index * 0.018, z]} rotation={[-Math.PI / 2, 0, index * 0.08]} renderOrder={9}>
            <planeGeometry args={[width, Math.max(8, depth / sheetCount * 1.35)]} />
            <primitive object={material} attach="material" />
          </mesh>
        );
      })}
    </group>
  );
}

function StageHeatHaze({ stage, effect }: { stage: StageDefinition; effect: StageFloorSimpleEffect }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(effect.color ?? '#ffbf6e') },
      uOpacity: { value: effect.opacity ?? 0.2 }
    },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 transformed = position;
        transformed.x += sin(position.y * 7.0 + uTime * 1.6) * 0.045;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float soft = smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.88, 1.0, vUv.y));
        gl_FragColor = vec4(uColor, uOpacity * soft);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  }), []);
  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime * (effect.speed ?? 1.1);
  });
  const width = floorEffectWidth(stage, effect.coverageScale);
  const depth = floorEffectDepth(stage, effect.coverageScale);
  const columns = 7;
  const rows = 5;
  return (
    <group position={[0, 0.65, 0]}>
      {Array.from({ length: columns * rows }, (_, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = -width / 2 + (width * (column + 0.5)) / columns;
        const z = -depth / 2 + (depth * (row + 0.5)) / rows;
        return (
          <mesh key={`heat-${index}`} position={[x, 0, z]} rotation={[0, 0.16 * (column - 3), 0]} renderOrder={11}>
            <planeGeometry args={[Math.max(4.6, width / columns * 0.92), 1.35]} />
            <primitive object={material} attach="material" />
          </mesh>
        );
      })}
    </group>
  );
}

function StageGlowTrails({ stage, effect, fighters, preview }: { stage: StageDefinition; effect: StageFloorSimpleEffect; fighters?: FighterRuntime[]; preview: boolean }) {
  const count = particleCount(stage, effect, 42, preview);
  const ambient = useMemo(() => {
    const random = seededRandom(hashString(`${stage.id}:glow-trails`));
    return floorEffectPositions(stage, 'glow-trails', count, floorEffectWidth(stage, effect.coverageScale), floorEffectDepth(stage, effect.coverageScale)).map(([x, z]) => [x, z, random() > 0.5 ? 1 : -1] as [number, number, number]);
  }, [count, effect.coverageScale, stage.id, stage.world?.depth, stage.world?.width]);
  const anchors = [
    ...ambient,
    ...((fighters ?? []).map((fighter) => [fighter.position.x - fighter.facing * 0.42, fighter.position.z, fighter.facing] as [number, number, number]))
  ];
  return (
    <group position={[0, floorEffectY(stage, 0.024), 0]}>
      {anchors.map(([x, z, facing], index) => (
        <mesh key={`glow-trail-${index}`} position={[x, 0, z]} rotation={[-Math.PI / 2, 0, facing > 0 ? 0.16 : -0.16]} renderOrder={8}>
          <planeGeometry args={[1.7 * (effect.size ?? 1), 0.34 * (effect.size ?? 1)]} />
          <meshBasicMaterial color={effect.color ?? '#5cf4ff'} transparent opacity={effect.opacity ?? 0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  );
}

function StageTileShimmer({ stage, effect }: { stage: StageDefinition; effect: StageFloorSimpleEffect }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(effect.color ?? '#fff2a8') },
      uOpacity: { value: effect.opacity ?? 0.26 }
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float vertical = 1.0 - smoothstep(0.0, 0.035, abs(fract(vUv.x * 18.0) - 0.5));
        float horizontal = 1.0 - smoothstep(0.0, 0.035, abs(fract(vUv.y * 18.0) - 0.5));
        float pulse = 0.55 + 0.45 * sin(uTime + (vUv.x + vUv.y) * 10.0);
        gl_FragColor = vec4(uColor, uOpacity * max(vertical, horizontal) * pulse);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }), []);
  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime * (effect.pulseSpeed ?? 1.4);
  });
  return (
    <mesh position={[0, floorEffectY(stage, 0.023), 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={6}>
      <planeGeometry args={[floorEffectWidth(stage, effect.coverageScale), floorEffectDepth(stage, effect.coverageScale), 1, 1]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function StageDebrisField({ stage, effect, preview }: { stage: StageDefinition; effect: StageFloorSimpleEffect; preview: boolean }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = Math.round(THREE.MathUtils.clamp(particleCount(stage, effect, 180, preview), 24, preview ? 90 : 420));
  const geometry = useMemo(() => new THREE.BoxGeometry(0.16, 0.08, 0.12), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: effect.color ?? '#6e6256', roughness: 0.94, metalness: 0.02, transparent: true, opacity: effect.opacity ?? 0.72 }), []);
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const random = seededRandom(hashString(`${stage.id}:debris`));
    const dummy = new THREE.Object3D();
    const width = floorEffectWidth(stage, effect.coverageScale);
    const depth = floorEffectDepth(stage, effect.coverageScale);
    for (let index = 0; index < count; index += 1) {
      dummy.position.set((random() - 0.5) * width, random() * 0.05, (random() - 0.5) * depth);
      dummy.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
      dummy.scale.setScalar((0.7 + random() * 1.6) * (effect.size ?? 0.9));
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [count, effect.coverageScale, effect.size, stage.id, stage.world?.depth, stage.world?.width]);
  return <instancedMesh ref={meshRef} args={[geometry, material, count]} position={[0, floorEffectY(stage, 0.03), 0]} renderOrder={4} />;
}

function createGrassBladeGeometry(segmentsValue: number, bladeWidth: number) {
  const segments = Math.max(2, Math.min(10, Math.round(segmentsValue)));
  const positions: number[] = [];
  const uvs: number[] = [];
  const pushVertex = (x: number, y: number, u: number, v: number) => {
    positions.push(x, y, 0);
    uvs.push(u, v);
  };
  for (let index = 0; index < segments; index += 1) {
    const y0 = index / segments;
    const y1 = (index + 1) / segments;
    const half0 = bladeWidth * 0.5 * Math.pow(1 - y0 * 0.86, 1.2);
    const half1 = bladeWidth * 0.5 * Math.pow(1 - y1 * 0.86, 1.2);
    pushVertex(-half0, y0, 0, y0);
    pushVertex(half0, y0, 1, y0);
    pushVertex(-half1, y1, 0, y1);
    pushVertex(-half1, y1, 0, y1);
    pushVertex(half0, y0, 1, y0);
    pushVertex(half1, y1, 1, y1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.translate(0, 0, 0);
  return geometry;
}

function particleCount(stage: StageDefinition, effect: StageFloorSimpleEffect, base: number, preview: boolean) {
  const explicit = effect.maxParticles && effect.maxParticles > 0 ? effect.maxParticles : effect.amount;
  if (explicit && explicit > 0) return Math.round(explicit * (preview ? 0.42 : 1));
  const areaScale = Math.sqrt((floorEffectWidth(stage, effect.coverageScale) * floorEffectDepth(stage, effect.coverageScale)) / (72 * 42));
  const quality = preview ? 'low' : effect.quality ?? 'medium';
  return Math.round(THREE.MathUtils.clamp(base * (0.45 + (effect.density ?? 0.45)) * areaScale * QUALITY_MULTIPLIER[quality], 24, preview ? 420 : 1600));
}

function decalCount(effect: StageFloorSimpleEffect, preview: boolean, fallback: number) {
  return Math.round(THREE.MathUtils.clamp(effect.maxDecals && effect.maxDecals > 0 ? effect.maxDecals : fallback * (0.45 + (effect.density ?? 0.45)), 2, preview ? 48 : 128));
}

function randomPositions(stage: StageDefinition, salt: string, count: number, yMin: number, yMax: number, coverageScale?: number) {
  const width = floorEffectWidth(stage, coverageScale);
  const depth = floorEffectDepth(stage, coverageScale);
  const random = seededRandom(hashString(`${stage.id}:${salt}`));
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (random() - 0.5) * width;
    positions[index * 3 + 1] = yMin + random() * (yMax - yMin);
    positions[index * 3 + 2] = (random() - 0.5) * depth;
  }
  return positions;
}

function floorEffectY(stage: StageDefinition, offset = 0) {
  return (stage.world?.floorY ?? -0.045) + offset;
}

function floorEffectPositions(stage: StageDefinition, salt: string, count: number, width: number, depth: number): Array<[number, number]> {
  const random = seededRandom(hashString(`${stage.id}:${salt}`));
  return Array.from({ length: count }, () => [(random() - 0.5) * width, (random() - 0.5) * depth]);
}

function floorEffectWidth(stage: StageDefinition, multiplier = 1.08) {
  return Math.max(24, (stage.world?.width ?? 220) * multiplier);
}

function floorEffectDepth(stage: StageDefinition, multiplier = 1.08) {
  return Math.max(18, (stage.world?.depth ?? 220) * multiplier);
}

function normalizedWind(value: StageFloorGrassEffect['windDirection']) {
  const x = value?.[0] ?? 1;
  const y = value?.[1] ?? 0.35;
  const length = Math.hypot(x, y) || 1;
  return [x / length, y / length] as [number, number];
}

function wrapRange(value: number, min: number, max: number) {
  const span = max - min;
  return ((((value - min) % span) + span) % span) + min;
}

function seededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return (state >>> 0) / 4294967296;
  };
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

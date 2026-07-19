import { useEffect, useMemo, useState } from 'react';
import { STORY_SURFACE_LEVEL_BLUEPRINTS } from './levelBlueprints';
import type { StoryGeneratedFloor, StoryHubDefinition } from './types';

export function storyLevelLabEnabled() {
  if (typeof window === 'undefined' || !['localhost', '127.0.0.1'].includes(window.location.hostname)) return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('storyLevelLab') === '1' && params.get('storyLabCapture') !== '1';
}

export function storyLevelLabCameraOverride(search: string) {
  const params = new URLSearchParams(search);
  const rawX = params.get('storyCameraX');
  const rawY = params.get('storyCameraY');
  if (rawX === null || rawY === null) return null;
  const x = Number(rawX);
  const y = Number(rawY);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function navigateToPoint(point: [number, number], cameraOnly = false) {
  const url = new URL(window.location.href);
  if (cameraOnly) {
    url.searchParams.set('storyCameraX', String(point[0]));
    url.searchParams.set('storyCameraY', String(point[1] + 2));
  } else {
    url.searchParams.set('storyX', String(point[0]));
    url.searchParams.set('storyY', String(point[1]));
    url.searchParams.delete('storyCameraX');
    url.searchParams.delete('storyCameraY');
  }
  window.location.assign(url);
}

export function LevelLabOverlay({ hub, floor }: { hub: StoryHubDefinition; floor: StoryGeneratedFloor | null }) {
  const [showCollision, setShowCollision] = useState(true);
  const [showTerrain, setShowTerrain] = useState(true);
  const [showCavities, setShowCavities] = useState(true);
  const [showRooms, setShowRooms] = useState(true);
  const [showRoute, setShowRoute] = useState(true);
  const [showSlots, setShowSlots] = useState(true);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [showClusters, setShowClusters] = useState(false);
  const [witnessResult, setWitnessResult] = useState<{ reached: boolean; x: number; y: number } | null>(null);
  const blueprint = hub.levelMeta ? STORY_SURFACE_LEVEL_BLUEPRINTS[hub.levelMeta.blueprintId] : undefined;
  const bounds = hub.bounds;
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const minY = bounds.minY ?? Math.min(bounds.floorY - 1, ...hub.platforms.map((platform) => platform.position[1] - platform.size[1] / 2));
  const maxY = bounds.maxY ?? Math.max(14, ...hub.platforms.map((platform) => platform.position[1] + platform.size[1] / 2));
  const height = Math.max(1, maxY - minY);
  const x = (value: number) => (value - bounds.minX) / width * 1000;
  const y = (value: number) => 260 - (value - minY) / height * 230;
  const witness = hub.levelMeta?.witnessRoute ?? floor?.levelMeta?.witnessRoute ?? [];
  const witnessInputs = hub.levelMeta?.witnessInputs ?? floor?.levelMeta?.witnessInputs ?? [];
  const witnessDurationSeconds = witnessInputs.reduce((total, input) => total + (input.durationSeconds ?? input.frames / 60), 0);
  const expectedCells = Math.round(width / 2) * Math.round(height / 2);
  const artFailures = useMemo(() => {
    if (!hub.terrainKitId) return floor && floor.version < 6 ? [] : ['missing-terrain-kit'];
    const failures: string[] = [];
    if ((hub.terrainTiles ?? []).some((tile) => !tile.kitId || !tile.frameId)) failures.push('undrawn-solid-cell');
    if ((hub.cavityTiles ?? []).some((tile) => !tile.kitId || !tile.frameId)) failures.push('undrawn-cavity-cell');
    if ((hub.cavityTiles?.length ?? 0) === 0) failures.push('missing-cavity-background');
    if ((hub.terrainTiles?.length ?? 0) + (hub.cavityTiles?.length ?? 0) !== expectedCells) failures.push('occupancy-render-mismatch');
    return failures;
  }, [expectedCells, floor, hub.cavityTiles, hub.terrainKitId, hub.terrainTiles]);
  const failures = [...(floor?.validationFailures ?? []), ...artFailures, ...(witnessResult && !witnessResult.reached ? ['runtime-witness-failed'] : [])];
  const metrics = useMemo(() => ({
    solids: hub.terrainTiles?.length ?? 0, cavities: hub.cavityTiles?.length ?? 0, props: hub.props?.length ?? 0,
    resources: hub.resourceNodes?.length ?? 0, hazards: hub.hazards?.length ?? 0, enemies: hub.enemySpawns?.length ?? 0,
    chunks: hub.levelMeta?.chunkIds.length ?? 0, art: hub.terrainKitId ? 'resolved' : 'legacy'
  }), [hub]);

  useEffect(() => {
    const existing = (window as unknown as { __KORE_LEVEL_LAB_WITNESS__?: { reached: boolean; x: number; y: number } }).__KORE_LEVEL_LAB_WITNESS__;
    if (existing) setWitnessResult(existing);
    const listener = (event: Event) => setWitnessResult((event as CustomEvent<{ reached: boolean; x: number; y: number }>).detail);
    window.addEventListener('kore-level-lab-witness', listener);
    return () => window.removeEventListener('kore-level-lab-witness', listener);
  }, []);

  const startWitness = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('storyWitness', '1');
    url.searchParams.delete('storyX');
    url.searchParams.delete('storyY');
    window.location.assign(url);
  };
  const capture = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('storyLabCapture', '1');
    window.location.assign(url);
  };
  const teleportPoints: Array<{ label: string; point: [number, number] }> = [
    { label: 'Entrance', point: hub.spawn },
    ...witness.slice(1, -1).map((point, index) => ({ label: `Beat ${index + 1}`, point })),
    ...(witness.length > 0 ? [{ label: 'Exit', point: witness[witness.length - 1] }] : [])
  ];

  return <aside className="story-level-lab" data-testid="story-level-lab" data-witness-steps={witnessInputs.length} data-witness-seconds={witnessDurationSeconds.toFixed(2)} aria-label="KORE Level Lab">
    <header>
      <span><strong>LEVEL LAB</strong><small>{hub.levelMeta?.blueprintId ?? hub.id} · {floor ? `${floor.intent} · v${floor.version} · ` : ''}seed {hub.levelMeta?.seed ?? 'authored'} · kit {hub.terrainKitId ?? 'legacy'}</small></span>
      <span className={failures.length ? 'is-fail' : 'is-pass'}>{failures.length ? `${failures.length} failures` : 'PASS'}</span>
    </header>
    <div className="story-level-lab-controls">
      <button type="button" aria-pressed={showCollision} onClick={() => setShowCollision((value) => !value)}>Collision</button>
      <button type="button" aria-pressed={showTerrain} onClick={() => setShowTerrain((value) => !value)}>Terrain frames</button>
      <button type="button" aria-pressed={showCavities} onClick={() => setShowCavities((value) => !value)}>Cavities / sky</button>
      <button type="button" aria-pressed={showRooms} onClick={() => setShowRooms((value) => !value)}>Rooms</button>
      <button type="button" aria-pressed={showRoute} onClick={() => setShowRoute((value) => !value)}>Witness</button>
      <button type="button" aria-pressed={showSlots} onClick={() => setShowSlots((value) => !value)}>Slots</button>
      <button type="button" aria-pressed={showSafeZones} onClick={() => setShowSafeZones((value) => !value)}>Safe zones</button>
      <button type="button" aria-pressed={showClusters} onClick={() => setShowClusters((value) => !value)}>Clusters</button>
      <small>{Object.entries(metrics).map(([key, value]) => `${key} ${value}`).join(' · ')}</small>
    </div>
    <div className="story-level-lab-controls story-level-lab-teleports">
      {teleportPoints.map(({ label, point }) => <span key={`${label}:${point.join(':')}`}><button type="button" onClick={() => navigateToPoint(point)}>{label}</button><button type="button" title={`Move camera to ${label}`} onClick={() => navigateToPoint(point, true)}>Cam</button></span>)}
      <button type="button" onClick={startWitness}>Play actual witness</button>
      <button type="button" onClick={capture}>Clean capture</button>
      {witnessResult && <small className={witnessResult.reached ? 'is-pass' : 'is-fail'}>controller {witnessResult.reached ? 'reached exit' : `stopped ${witnessResult.x.toFixed(1)}, ${witnessResult.y.toFixed(1)}`}</small>}
    </div>
    <svg viewBox="0 0 1000 280" role="img" aria-label="Full level plan">
      <rect width="1000" height="280" fill="#07111e" />
      {showCavities && (hub.cavityTiles ?? []).map((tile) => <rect key={tile.id} x={x(tile.position[0] - tile.size[0] / 2)} y={y(tile.position[1] + tile.size[1] / 2)} width={tile.size[0] / width * 1000} height={tile.size[1] / height * 230} fill={tile.material === 'sky-window-edge' ? '#8ee8ff' : '#0d2032'} fillOpacity="0.82"><title>{tile.material} · {tile.frameId}</title></rect>)}
      {showTerrain && (hub.terrainTiles ?? []).map((tile) => <rect key={tile.id} x={x(tile.position[0] - tile.size[0] / 2)} y={y(tile.position[1] + tile.size[1] / 2)} width={tile.size[0] / width * 1000} height={tile.size[1] / height * 230} fill={tile.role === 'fill' ? '#26384b' : tile.role === 'top' ? '#52e1a1' : tile.role === 'underside' ? '#b8a8ff' : tile.role.includes('wall') ? '#ff83d1' : '#71859b'} fillOpacity={tile.role === 'fill' ? 0.58 : 0.9}><title>{tile.role} · {tile.frameId ?? 'legacy'} · mask {tile.neighborMask}</title></rect>)}
      {showRooms && floor?.rooms.map((room) => <rect key={room.id} x={x(room.bounds[0])} y={y(room.bounds[3])} width={(room.bounds[1] - room.bounds[0]) / width * 1000} height={(room.bounds[3] - room.bounds[2]) / height * 230} fill="none" stroke={room.critical ? '#ffe071' : room.hidden ? '#ff83d1' : '#2ee6ff'} strokeWidth="2" strokeDasharray={room.optional ? '7 5' : undefined}><title>{room.id} · {room.connectors.join(', ')}</title></rect>)}
      {blueprint?.beats.map((beat) => <rect key={beat.id} x={x(beat.bounds[0])} y={y(beat.bounds[3])} width={(beat.bounds[1] - beat.bounds[0]) / width * 1000} height={(beat.bounds[3] - beat.bounds[2]) / height * 230} fill="#2ee6ff" fillOpacity="0.06" stroke="#2ee6ff" strokeOpacity="0.24"><title>{beat.kind} · intensity {beat.intensity}</title></rect>)}
      {showCollision && hub.platforms.map((platform) => <rect key={platform.id} x={x(platform.position[0] - platform.size[0] / 2)} y={y(platform.position[1] + platform.size[1] / 2)} width={platform.size[0] / width * 1000} height={Math.max(3, platform.size[1] / height * 230)} fill={platform.oneWay ? '#8ee8ff' : '#71859b'} fillOpacity="0.55"><title>{platform.id}</title></rect>)}
      {showSafeZones && [hub.spawn, ...hub.portals.map((portal) => portal.position)].map(([px, py], index) => <rect key={`safe-${index}`} x={x(px - 3)} y={y(py + 3)} width={6 / width * 1000} height={6 / height * 230} fill="#52e1a1" fillOpacity="0.22" stroke="#52e1a1" />)}
      {showRooms && blueprint?.connectors.map((connector) => <circle key={connector.id} cx={x(connector.point[0])} cy={y(connector.point[1])} r="7" fill="#ffe071"><title>{connector.edge} connector</title></circle>)}
      {showRoute && witness.length > 1 && <polyline points={witness.map(([px, py]) => `${x(px)},${y(py)}`).join(' ')} fill="none" stroke="#ffe071" strokeWidth="4" strokeDasharray="9 6" />}
      {showRoute && witness.map(([px, py], index) => <circle key={`${px}:${py}:${index}`} cx={x(px)} cy={y(py)} r="6" fill="#ffe071"><title>witness {index + 1}</title></circle>)}
      {showSlots && blueprint?.slots.map((slot) => <circle key={slot.id} cx={x(slot.position[0])} cy={y(slot.position[1])} r="5" fill="#ff83d1"><title>{slot.kind}: {slot.semanticTags.join(', ')}</title></circle>)}
      {showClusters && blueprint?.visual.dressingClusterAnchors.map(([px, py], index) => <circle key={`cluster-${index}`} cx={x(px)} cy={y(py)} r="14" fill="none" stroke="#52e1a1" strokeWidth="4"><title>dressing cluster {index + 1}</title></circle>)}
    </svg>
    {failures.length > 0 && <p>{failures.join(' · ')}</p>}
  </aside>;
}

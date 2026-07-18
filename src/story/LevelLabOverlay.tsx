import { useMemo, useState } from 'react';
import { STORY_SURFACE_LEVEL_BLUEPRINTS } from './levelBlueprints';
import type { StoryGeneratedFloor, StoryHubDefinition } from './types';

export function storyLevelLabEnabled() {
  if (typeof window === 'undefined' || !['localhost', '127.0.0.1'].includes(window.location.hostname)) return false;
  return new URLSearchParams(window.location.search).get('storyLevelLab') === '1';
}

export function LevelLabOverlay({ hub, floor }: { hub: StoryHubDefinition; floor: StoryGeneratedFloor | null }) {
  const [showCollision, setShowCollision] = useState(true);
  const [showRoute, setShowRoute] = useState(true);
  const [showSlots, setShowSlots] = useState(true);
  const blueprint = hub.levelMeta ? STORY_SURFACE_LEVEL_BLUEPRINTS[hub.levelMeta.blueprintId] : undefined;
  const bounds = hub.bounds;
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const minY = Math.min(bounds.floorY - 1, ...hub.platforms.map((platform) => platform.position[1] - platform.size[1] / 2));
  const maxY = Math.max(14, ...hub.platforms.map((platform) => platform.position[1] + platform.size[1] / 2));
  const height = Math.max(1, maxY - minY);
  const x = (value: number) => (value - bounds.minX) / width * 1000;
  const y = (value: number) => 260 - (value - minY) / height * 230;
  const witness = hub.levelMeta?.witnessRoute ?? floor?.levelMeta?.witnessRoute ?? [];
  const failures = floor?.validationFailures ?? [];
  const metrics = useMemo(() => ({
    platforms: hub.platforms.length,
    props: hub.props?.length ?? 0,
    hazards: hub.hazards?.length ?? 0,
    enemies: hub.enemySpawns?.length ?? 0,
    chunks: hub.levelMeta?.chunkIds.length ?? 0
  }), [hub]);
  return <aside className="story-level-lab" data-testid="story-level-lab" aria-label="KORE Level Lab">
    <header>
      <span><strong>LEVEL LAB</strong><small>{hub.levelMeta?.blueprintId ?? hub.id} · seed {hub.levelMeta?.seed ?? 'authored'}</small></span>
      <span className={failures.length ? 'is-fail' : 'is-pass'}>{failures.length ? `${failures.length} failures` : 'PASS'}</span>
    </header>
    <div className="story-level-lab-controls">
      <button type="button" aria-pressed={showCollision} onClick={() => setShowCollision((value) => !value)}>Collision</button>
      <button type="button" aria-pressed={showRoute} onClick={() => setShowRoute((value) => !value)}>Witness route</button>
      <button type="button" aria-pressed={showSlots} onClick={() => setShowSlots((value) => !value)}>Semantic slots</button>
      <small>{Object.entries(metrics).map(([key, value]) => `${key} ${value}`).join(' · ')}</small>
    </div>
    <svg viewBox="0 0 1000 280" role="img" aria-label="Full level plan">
      <rect width="1000" height="280" fill="#07111e" />
      {blueprint?.beats.map((beat) => <rect key={beat.id} x={x(beat.bounds[0])} y={y(beat.bounds[3])} width={(beat.bounds[1] - beat.bounds[0]) / width * 1000} height={(beat.bounds[3] - beat.bounds[2]) / height * 230} fill="#2ee6ff" fillOpacity="0.06" stroke="#2ee6ff" strokeOpacity="0.24"><title>{beat.kind} · intensity {beat.intensity}</title></rect>)}
      {showCollision && hub.platforms.map((platform) => <rect key={platform.id} x={x(platform.position[0] - platform.size[0] / 2)} y={y(platform.position[1] + platform.size[1] / 2)} width={platform.size[0] / width * 1000} height={Math.max(3, platform.size[1] / height * 230)} fill={platform.oneWay ? '#8ee8ff' : '#71859b'}><title>{platform.id} · {platform.terrainRole ?? (platform.oneWay ? 'ledge' : 'solid')}</title></rect>)}
      {showRoute && witness.length > 1 && <polyline points={witness.map(([px, py]) => `${x(px)},${y(py)}`).join(' ')} fill="none" stroke="#ffe071" strokeWidth="4" strokeDasharray="9 6" />}
      {showRoute && witness.map(([px, py], index) => <circle key={`${px}:${py}:${index}`} cx={x(px)} cy={y(py)} r="6" fill="#ffe071"><title>witness {index + 1}</title></circle>)}
      {showSlots && blueprint?.slots.map((slot) => <circle key={slot.id} cx={x(slot.position[0])} cy={y(slot.position[1])} r="5" fill="#ff83d1"><title>{slot.kind}: {slot.semanticTags.join(', ')}</title></circle>)}
      {showSlots && (hub.props ?? []).map((prop) => <circle key={prop.id} cx={x(prop.position[0])} cy={y(prop.position[1])} r="4" fill="#52e1a1"><title>{prop.id}</title></circle>)}
    </svg>
    {failures.length > 0 && <p>{failures.join(' · ')}</p>}
  </aside>;
}

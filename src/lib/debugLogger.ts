type DebugPayload = Record<string, unknown>;

const DEBUG_HYPOTHESES = [
  'H1 stale editor storage is masking the new manifest defaults',
  'H2 the dev server is serving an old character manifest',
  'H3 the loaded source roster differs from the effective roster',
  'H4 animation overrides are being applied to the wrong character',
  'H5 override sanitizing removes or keeps the wrong frame set',
  'H6 the viewer selected character differs from the visible roster card',
  'H7 the viewer selected animation slot is not the slot being edited',
  'H8 per-slot FPS differs from the manifest or edited value',
  'H9 the voxel renderer resolves a different animation key than the UI slot',
  'H10 runtime frame index/source selection differs from expected sequence order'
];

const lastLogAt = new Map<string, number>();

export function isDebugEnabled() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('debug') || Boolean((window as Window & { __NEWMUGEN_DEBUG__?: boolean }).__NEWMUGEN_DEBUG__);
}

export function debugLog(hypothesis: number, label: string, payload: DebugPayload = {}) {
  if (!isDebugEnabled()) return;
  const hypothesisLabel = DEBUG_HYPOTHESES[hypothesis - 1] ?? `H${hypothesis}`;
  console.info(`[newMUGEN debug] ${hypothesisLabel} | ${label}`, payload);
}

export function debugLogThrottled(hypothesis: number, label: string, payload: DebugPayload = {}, intervalMs = 900) {
  if (!isDebugEnabled()) return;
  const key = `${hypothesis}:${label}:${payload.characterId ?? ''}:${payload.animationKey ?? ''}:${payload.slot ?? ''}`;
  const now = performance.now();
  if (now - (lastLogAt.get(key) ?? 0) < intervalMs) return;
  lastLogAt.set(key, now);
  debugLog(hypothesis, label, payload);
}

export function debugHypotheses() {
  if (!isDebugEnabled()) return;
  console.table(DEBUG_HYPOTHESES.map((hypothesis, index) => ({ id: `H${index + 1}`, hypothesis })));
}

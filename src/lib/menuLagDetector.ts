export const MENU_LAG_DETECTOR_VERSION = 'menu-lag-v1';

const MENU_LAG_PROMPT_DISMISSED_KEY = `kore.menuLagPrompt.dismissed.${MENU_LAG_DETECTOR_VERSION}`;
const DEFAULT_SAMPLE_MS = 3200;

export type MenuLagDeviceContext = {
  userAgent: string;
  platform: string;
  hardwareConcurrency: number | null;
  deviceMemory: number | null;
  steamDeckLike: boolean;
  linuxFirefox: boolean;
  canvasSize: { width: number; height: number; clientWidth: number; clientHeight: number } | null;
  webglVendor: string | null;
  webglRenderer: string | null;
};

export type MenuLagFrameStats = {
  sampleMs: number;
  frameCount: number;
  averageMs: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  averageFps: number;
  longTaskCount: number;
  longTaskTotalMs: number;
  longestLongTaskMs: number;
};

export type MenuLagReport = {
  laggy: boolean;
  reasons: string[];
  stats: MenuLagFrameStats;
  device: MenuLagDeviceContext;
  detectorVersion: string;
};

type ForcedMenuLagResult = boolean | Partial<MenuLagReport>;

type MenuLagWindow = Window & {
  __KORE_FORCE_MENU_LAG_RESULT__?: ForcedMenuLagResult;
};

type NavigatorWithMemory = Navigator & {
  deviceMemory?: number;
  userAgentData?: { platform?: string };
};

export function getMenuLagPromptDismissed() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(MENU_LAG_PROMPT_DISMISSED_KEY) === '1';
}

export function setMenuLagPromptDismissed() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MENU_LAG_PROMPT_DISMISSED_KEY, '1');
}

export function clearMenuLagPromptDismissed() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(MENU_LAG_PROMPT_DISMISSED_KEY);
}

export async function sampleMenuLandingLag(canvas?: HTMLCanvasElement | null, sampleMs = DEFAULT_SAMPLE_MS): Promise<MenuLagReport> {
  if (typeof window === 'undefined') {
    return makeMenuLagReport(makeEmptyFrameStats(sampleMs), makeEmptyDeviceContext(), []);
  }

  const forced = (window as MenuLagWindow).__KORE_FORCE_MENU_LAG_RESULT__;
  if (forced !== undefined) return normalizeForcedMenuLagResult(forced, canvas, sampleMs);

  const longTasks: number[] = [];
  let observer: PerformanceObserver | null = null;
  if ('PerformanceObserver' in window) {
    try {
      observer = new PerformanceObserver((list) => {
        longTasks.push(...list.getEntries().map((entry) => entry.duration));
      });
      observer.observe({ type: 'longtask' });
    } catch {
      observer = null;
    }
  }

  const gaps = await sampleAnimationFrameGaps(sampleMs);
  observer?.disconnect();
  const stats = makeFrameStats(gaps, longTasks, sampleMs);
  return makeMenuLagReport(stats, collectMenuLagDeviceContext(canvas), classifyMenuLagStats(stats));
}

export function classifyMenuLagStats(stats: MenuLagFrameStats) {
  const reasons: string[] = [];
  if (stats.frameCount > 0 && stats.p95Ms > 34) reasons.push('p95-frame-gap');
  if (stats.frameCount > 0 && stats.p99Ms > 67) reasons.push('p99-frame-gap');
  if (stats.frameCount > 0 && stats.averageFps < 45) reasons.push('low-average-fps');
  if (stats.longTaskCount >= 2) reasons.push('multiple-long-tasks');
  return reasons;
}

export function collectMenuLagDeviceContext(canvas?: HTMLCanvasElement | null): MenuLagDeviceContext {
  if (typeof navigator === 'undefined') return makeEmptyDeviceContext();
  const hintedNavigator = navigator as NavigatorWithMemory;
  const userAgent = navigator.userAgent ?? '';
  const platform = hintedNavigator.userAgentData?.platform ?? navigator.platform ?? '';
  const webglInfo = getCanvasWebGlInfo(canvas);
  return {
    userAgent,
    platform,
    hardwareConcurrency: typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null,
    deviceMemory: typeof hintedNavigator.deviceMemory === 'number' ? hintedNavigator.deviceMemory : null,
    steamDeckLike: /steam deck|steamos|jupiter|galileo/i.test(`${userAgent} ${platform}`),
    linuxFirefox: /linux/i.test(`${userAgent} ${platform}`) && /firefox/i.test(userAgent),
    canvasSize: canvas
      ? {
          width: canvas.width,
          height: canvas.height,
          clientWidth: canvas.clientWidth,
          clientHeight: canvas.clientHeight
        }
      : null,
    webglVendor: webglInfo.vendor,
    webglRenderer: webglInfo.renderer
  };
}

function normalizeForcedMenuLagResult(forced: ForcedMenuLagResult, canvas: HTMLCanvasElement | null | undefined, sampleMs: number): MenuLagReport {
  const fallbackStats = makeEmptyFrameStats(sampleMs);
  const fallbackDevice = collectMenuLagDeviceContext(canvas);
  if (typeof forced === 'boolean') {
    return makeMenuLagReport(fallbackStats, fallbackDevice, forced ? ['forced'] : []);
  }
  const stats = forced.stats ?? fallbackStats;
  const reasons = forced.reasons ?? (forced.laggy ? ['forced'] : classifyMenuLagStats(stats));
  return {
    laggy: forced.laggy ?? reasons.length > 0,
    reasons,
    stats,
    device: forced.device ?? fallbackDevice,
    detectorVersion: forced.detectorVersion ?? MENU_LAG_DETECTOR_VERSION
  };
}

function makeMenuLagReport(stats: MenuLagFrameStats, device: MenuLagDeviceContext, reasons: string[]): MenuLagReport {
  return {
    laggy: reasons.length > 0,
    reasons,
    stats,
    device,
    detectorVersion: MENU_LAG_DETECTOR_VERSION
  };
}

function sampleAnimationFrameGaps(sampleMs: number) {
  return new Promise<number[]>((resolve) => {
    const gaps: number[] = [];
    let last = performance.now();
    const stopAt = last + sampleMs;
    const tick = (now: number) => {
      const gap = now - last;
      last = now;
      if (gap > 0) gaps.push(gap);
      if (now >= stopAt) resolve(gaps);
      else window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  });
}

function makeFrameStats(gaps: number[], longTasks: number[], sampleMs: number): MenuLagFrameStats {
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const sum = sortedGaps.reduce((total, gap) => total + gap, 0);
  const longTaskTotalMs = longTasks.reduce((total, duration) => total + duration, 0);
  const averageMs = sum / Math.max(1, sortedGaps.length);
  return {
    sampleMs,
    frameCount: sortedGaps.length,
    averageMs: roundStat(averageMs),
    p95Ms: roundStat(percentile(sortedGaps, 0.95)),
    p99Ms: roundStat(percentile(sortedGaps, 0.99)),
    maxMs: roundStat(sortedGaps[sortedGaps.length - 1] ?? 0),
    averageFps: roundStat(1000 / Math.max(1, averageMs)),
    longTaskCount: longTasks.length,
    longTaskTotalMs: roundStat(longTaskTotalMs),
    longestLongTaskMs: roundStat(Math.max(0, ...longTasks))
  };
}

function makeEmptyFrameStats(sampleMs: number): MenuLagFrameStats {
  return {
    sampleMs,
    frameCount: 0,
    averageMs: 0,
    p95Ms: 0,
    p99Ms: 0,
    maxMs: 0,
    averageFps: 0,
    longTaskCount: 0,
    longTaskTotalMs: 0,
    longestLongTaskMs: 0
  };
}

function percentile(sortedValues: number[], ratio: number) {
  if (sortedValues.length === 0) return 0;
  return sortedValues[Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * ratio))] ?? 0;
}

function roundStat(value: number) {
  return Number(value.toFixed(2));
}

function makeEmptyDeviceContext(): MenuLagDeviceContext {
  return {
    userAgent: '',
    platform: '',
    hardwareConcurrency: null,
    deviceMemory: null,
    steamDeckLike: false,
    linuxFirefox: false,
    canvasSize: null,
    webglVendor: null,
    webglRenderer: null
  };
}

function getCanvasWebGlInfo(canvas?: HTMLCanvasElement | null) {
  try {
    const context = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    if (!context) return { vendor: null, renderer: null };
    const debugInfo = context.getExtension('WEBGL_debug_renderer_info') as {
      UNMASKED_VENDOR_WEBGL: number;
      UNMASKED_RENDERER_WEBGL: number;
    } | null;
    return {
      vendor: debugInfo ? String(context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)) : String(context.getParameter(context.VENDOR)),
      renderer: debugInfo ? String(context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : String(context.getParameter(context.RENDERER))
    };
  } catch {
    return { vendor: null, renderer: null };
  }
}

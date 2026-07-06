export type SupportWarning = {
  level: 'caution' | 'unsupported';
  reason: string;
};

type NavigatorWithHints = Navigator & {
  deviceMemory?: number;
};

type GameplaySupportWindow = Window & {
  __KORE_TEST_SUPPORT_WARNING__?: SupportWarning | null;
};

export function detectGameplaySupport(): SupportWarning | null {
  if (typeof document === 'undefined' || typeof navigator === 'undefined') return null;
  if (import.meta.env.DEV) {
    const testWarning = (window as GameplaySupportWindow).__KORE_TEST_SUPPORT_WARNING__;
    if (testWarning !== undefined) return testWarning;
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  if (!context) {
    return { level: 'unsupported', reason: 'webgl-unavailable' };
  }

  const maxTextureSize = Number(context.getParameter(context.MAX_TEXTURE_SIZE));
  if (Number.isFinite(maxTextureSize) && maxTextureSize > 0 && maxTextureSize < 4096) {
    return { level: 'caution', reason: 'low-texture-size' };
  }

  const hintedNavigator = navigator as NavigatorWithHints;
  if (typeof hintedNavigator.deviceMemory === 'number' && hintedNavigator.deviceMemory <= 2) {
    return { level: 'caution', reason: 'low-device-memory' };
  }
  if (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 2) {
    return { level: 'caution', reason: 'low-cpu-cores' };
  }

  const userAgent = navigator.userAgent;
  const iosVersion = userAgent.match(/OS (\d+)_/);
  if (/iPhone|iPad|iPod/.test(userAgent) && iosVersion && Number(iosVersion[1]) < 15) {
    return { level: 'caution', reason: 'old-ios-browser' };
  }

  const androidVersion = userAgent.match(/Android (\d+)/);
  if (androidVersion && Number(androidVersion[1]) < 9) {
    return { level: 'caution', reason: 'old-android-browser' };
  }

  return null;
}

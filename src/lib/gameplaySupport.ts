export type SupportWarning = {
  level: 'caution' | 'unsupported';
  reason: string;
};

export type SupportCheck = {
  id: string;
  label: string;
  detail: string;
  passed: boolean;
  level: 'caution' | 'unsupported';
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

  const failedCheck = getGameplaySupportChecks().find((check) => !check.passed);
  return failedCheck ? { level: failedCheck.level, reason: failedCheck.id } : null;
}

export function getGameplaySupportChecks(): SupportCheck[] {
  if (typeof document === 'undefined' || typeof navigator === 'undefined') return [];

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  const isWebGL2 = Boolean(canvas.getContext('webgl2'));
  const maxTextureSize = context ? Number(context.getParameter(context.MAX_TEXTURE_SIZE)) : 0;
  const hintedNavigator = navigator as NavigatorWithHints;
  const memory = hintedNavigator.deviceMemory;
  const cores = navigator.hardwareConcurrency;
  const userAgent = navigator.userAgent;
  const iosVersion = userAgent.match(/OS (\d+)_/);
  const androidVersion = userAgent.match(/Android (\d+)/);
  const oldIos = Boolean(/iPhone|iPad|iPod/.test(userAgent) && iosVersion && Number(iosVersion[1]) < 15);
  const oldAndroid = Boolean(androidVersion && Number(androidVersion[1]) < 9);

  return [
    {
      id: 'webgl-unavailable',
      label: 'WebGL rendering',
      detail: context ? `${isWebGL2 ? 'WebGL2' : 'WebGL'} context available` : 'WebGL context unavailable',
      passed: Boolean(context),
      level: 'unsupported'
    },
    {
      id: 'low-texture-size',
      label: 'Texture capacity',
      detail: context ? `Max texture size ${maxTextureSize || 'unknown'}px` : 'Cannot check without WebGL',
      passed: Boolean(context) && (!Number.isFinite(maxTextureSize) || maxTextureSize >= 4096),
      level: 'caution'
    },
    {
      id: 'low-device-memory',
      label: 'Memory hint',
      detail: typeof memory === 'number' ? `${memory} GB reported` : 'Not reported by browser',
      passed: typeof memory === 'number' ? memory > 2 : true,
      level: 'caution'
    },
    {
      id: 'low-cpu-cores',
      label: 'CPU cores',
      detail: typeof cores === 'number' ? `${cores} logical cores reported` : 'Not reported by browser',
      passed: typeof cores === 'number' ? cores > 2 : true,
      level: 'caution'
    },
    {
      id: oldIos ? 'old-ios-browser' : oldAndroid ? 'old-android-browser' : 'modern-browser',
      label: 'Browser version',
      detail: oldIos
        ? `iOS ${iosVersion?.[1]} may struggle with browser WebGL`
        : oldAndroid
          ? `Android ${androidVersion?.[1]} may struggle with browser WebGL`
          : 'No known browser version risk detected',
      passed: !oldIos && !oldAndroid,
      level: 'caution'
    }
  ];
}

export const DUPLICATE_FIGHTER_HUE_SHIFT_DEGREES = 28;

type FighterHueMatch = {
  fighters: [
    { slot: 1 | 2; baseCharacter: { id: string } },
    { slot: 1 | 2; baseCharacter: { id: string } }
  ];
};

export function getDuplicateFighterHueShift(match: FighterHueMatch, slot: 1 | 2) {
  const [p1, p2] = match.fighters;
  if (slot !== 2) return 0;
  if (!p1.baseCharacter.id || p1.baseCharacter.id !== p2.baseCharacter.id) return 0;
  return DUPLICATE_FIGHTER_HUE_SHIFT_DEGREES;
}

export function shiftHueColor(color: string, degrees: number) {
  if (!degrees) return color;
  const rgb = parseHexColor(color);
  if (!rgb) return color;
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const shiftedHue = positiveModulo(hsl.h + degrees / 360, 1);
  const shifted = hslToRgb(shiftedHue, hsl.s, hsl.l);
  return rgbToHex(shifted.r, shifted.g, shifted.b);
}

function parseHexColor(color: string) {
  const match = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  const raw = match[1];
  const hex = raw.length === 3
    ? raw.split('').map((entry) => `${entry}${entry}`).join('')
    : raw;
  return {
    r: parseInt(hex.slice(0, 2), 16) / 255,
    g: parseInt(hex.slice(2, 4), 16) / 255,
    b: parseInt(hex.slice(4, 6), 16) / 255
  };
}

function rgbToHsl(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const delta = max - min;
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const h = max === r
    ? (g - b) / delta + (g < b ? 6 : 0)
    : max === g
      ? (b - r) / delta + 2
      : (r - g) / delta + 4;
  return { h: h / 6, s, l };
}

function hslToRgb(h: number, s: number, l: number) {
  if (s === 0) return { r: l, g: l, b: l };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hueToRgb(p, q, h + 1 / 3),
    g: hueToRgb(p, q, h),
    b: hueToRgb(p, q, h - 1 / 3)
  };
}

function hueToRgb(p: number, q: number, t: number) {
  let normalized = t;
  if (normalized < 0) normalized += 1;
  if (normalized > 1) normalized -= 1;
  if (normalized < 1 / 6) return p + (q - p) * 6 * normalized;
  if (normalized < 1 / 2) return q;
  if (normalized < 2 / 3) return p + (q - p) * (2 / 3 - normalized) * 6;
  return p;
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => Math.round(clamp01(value) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function positiveModulo(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus;
}

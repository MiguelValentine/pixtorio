/**
 * Color values used by the color editor.
 *
 * RGB channels are integer bytes (0-255). Alpha is deliberately represented
 * as a percentage (0-100) so it can be shared by RGBA and HSLA controls.
 */
export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export interface RGBAColor extends RGBColor {
  a: number;
}

export interface HSLAColor {
  /** Hue in degrees, normalized to [0, 360). */
  h: number;
  /** Saturation, lightness, and alpha in percent. */
  s: number;
  l: number;
  a: number;
}

export type AlphaDisplayRange = "percent" | "byte";

export type RGBAInput = Partial<Record<keyof RGBAColor, unknown>> | readonly unknown[] | null | undefined;
export type HSLAInput = Partial<Record<keyof HSLAColor, unknown>> | null | undefined;

export const DEFAULT_RGBA: RGBAColor = {r: 0, g: 0, b: 0, a: 100};
export const DEFAULT_HSLA: HSLAColor = {h: 0, s: 0, l: 0, a: 100};

/** Clamps and rounds a value to the byte range used by RGB channels. */
export function clampByte(value: unknown, fallback = 0) {
  return Math.round(clamp(numberOr(value, fallback), 0, 255));
}

/** Clamps a value to an alpha/percentage range without discarding decimals. */
export function clampPercent(value: unknown, fallback = 0) {
  return clamp(numberOr(value, fallback), 0, 100);
}

/** Converts the internal percentage alpha to the configured UI range. */
export function alphaToDisplay(value: unknown, range: AlphaDisplayRange): number {
  const percent = clampPercent(value);
  return range === "byte" ? Math.round(percent * 255 / 100) : percent;
}

/** Converts a UI alpha/opacity value back to the internal percentage form. */
export function alphaFromDisplay(value: unknown, range: AlphaDisplayRange, fallback = 0): number {
  const numeric = numberOr(value, fallback);
  return range === "byte" ? clampPercent(Math.round(clamp(numeric, 0, 255)) * 100 / 255) : clampPercent(numeric, fallback);
}

export function alphaDisplayMaximum(range: AlphaDisplayRange): 100 | 255 {
  return range === "byte" ? 255 : 100;
}

/** Normalizes a hue to the canonical [0, 360) range. */
export function normalizeHue(value: unknown, fallback = 0) {
  const hue = numberOr(value, fallback);
  const normalized = hue % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

/**
 * Normalizes user-entered RGBA values. Missing or invalid values retain the
 * matching fallback channel, which makes partially edited fields predictable.
 */
export function normalizeRGBA(value: RGBAInput, fallback: RGBAColor = DEFAULT_RGBA): RGBAColor {
  const source: Partial<Record<keyof RGBAColor, unknown>> = Array.isArray(value)
    ? {r: value[0], g: value[1], b: value[2], a: value[3]}
    : value && typeof value === "object"
      ? value as Partial<Record<keyof RGBAColor, unknown>>
      : {};
  return {
    r: clampByte(source.r, fallback.r),
    g: clampByte(source.g, fallback.g),
    b: clampByte(source.b, fallback.b),
    a: clampPercent(source.a, fallback.a),
  };
}

/** Normalizes user-entered HSLA values and wraps hue into one revolution. */
export function normalizeHSLA(value: HSLAInput, fallback: HSLAColor = DEFAULT_HSLA): HSLAColor {
  const source = value ?? {};
  return {
    h: normalizeHue(source.h, fallback.h),
    s: clampPercent(source.s, fallback.s),
    l: clampPercent(source.l, fallback.l),
    a: clampPercent(source.a, fallback.a),
  };
}

/** Converts an editor RGBA color to an HSLA color. */
export function rgbToHsla(color: RGBAInput | RGBColor): HSLAColor {
  const rgba = normalizeRGBA(color);
  const r = rgba.r / 255;
  const g = rgba.g / 255;
  const b = rgba.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;

  let hue = 0;
  let saturation = 0;
  if (delta > 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
    else if (max === g) hue = ((b - r) / delta + 2) / 6;
    else hue = ((r - g) / delta + 4) / 6;
  }

  return {
    h: normalizeHue(hue * 360),
    s: saturation * 100,
    l: lightness * 100,
    a: rgba.a,
  };
}

/** Converts an editor HSLA color to byte RGB channels plus percentage alpha. */
export function hslaToRgba(color: HSLAInput): RGBAColor {
  const hsla = normalizeHSLA(color);
  const h = hsla.h / 360;
  const s = hsla.s / 100;
  const l = hsla.l / 100;

  if (s === 0) {
    const channel = Math.round(l * 255);
    return {r: channel, g: channel, b: channel, a: hsla.a};
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, h) * 255),
    b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
    a: hsla.a,
  };
}

/** Converts a pixel-buffer RGBA byte tuple to editor channels. */
export function rgbaBytesToColor(value: readonly number[]): RGBAColor {
  return normalizeRGBA([value[0], value[1], value[2], byteToPercent(value[3] ?? 255)]);
}

/** Converts editor channels to the RGBA8 tuple used by the pixel buffers. */
export function colorToRgbaBytes(color: RGBAInput): [number, number, number, number] {
  const rgba = normalizeRGBA(color);
  return [rgba.r, rgba.g, rgba.b, Math.round((rgba.a / 100) * 255)];
}

/** Parses #RGB, #RGBA, #RRGGBB, or #RRGGBBAA into editor channels. */
export function parseHexColor(value: unknown): RGBAColor | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().replace(/^#/, "");
  if (![3, 4, 6, 8].includes(raw.length) || !/^[\da-f]+$/i.test(raw)) return null;
  const expanded = raw.length <= 4 ? [...raw].map((digit) => `${digit}${digit}`).join("") : raw;
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
    a: expanded.length === 8 ? byteToPercent(Number.parseInt(expanded.slice(6, 8), 16)) : 100,
  };
}

/** Serializes editor channels as #RRGGBB, optionally including #RRGGBBAA. */
export function rgbaToHex(color: RGBAInput, includeAlpha = false) {
  const rgba = normalizeRGBA(color);
  const channels = [rgba.r, rgba.g, rgba.b].map((channel) => channel.toString(16).padStart(2, "0"));
  if (includeAlpha) channels.push(Math.round((rgba.a / 100) * 255).toString(16).padStart(2, "0"));
  return `#${channels.join("")}`;
}

function hueToRgb(p: number, q: number, hue: number) {
  let value = hue;
  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return p + (q - p) * 6 * value;
  if (value < 1 / 2) return q;
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
  return p;
}

function byteToPercent(value: number) {
  return (clampByte(value) / 255) * 100;
}

function numberOr(value: unknown, fallback: number) {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.isFinite(fallback) ? fallback : 0;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

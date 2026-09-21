import {hexToRGBA, rgbaToHex} from "./pixels";

export type ColorSelectorMode = "spectrum" | "wheel" | "tint-shade-tone";

export interface HSVColor {
  h: number;
  s: number;
  v: number;
}

export interface TintShadeToneCell {column: number; row: number}

export interface WheelSelectorGeometry {
  centerX: number;
  centerY: number;
  radius: number;
  valueStripTop: number;
  valueStripHeight: number;
}

const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

export function wheelSelectorGeometry(width: number, height: number): WheelSelectorGeometry {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const valueStripHeight = Math.min(safeHeight, Math.min(10, Math.max(6, Math.floor(safeHeight * 0.1))));
  const valueStripTop = safeHeight - valueStripHeight;
  const wheelHeight = Math.max(1, valueStripTop - 2);
  return {
    centerX: safeWidth / 2,
    centerY: wheelHeight / 2,
    radius: Math.max(1, Math.min(safeWidth, wheelHeight) / 2 - 1),
    valueStripTop,
    valueStripHeight,
  };
}

export function hexToHsv(hex: string): HSVColor {
  const [red, green, blue] = hexToRGBA(hex).map((value) => value / 255);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta > 0) {
    if (maximum === red) hue = ((green - blue) / delta) % 6;
    else if (maximum === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue = ((hue * 60) + 360) % 360;
  }
  return {h: hue, s: maximum === 0 ? 0 : delta / maximum, v: maximum};
}

export function hsvToHex({h, s, v}: HSVColor): string {
  const hue = ((Number.isFinite(h) ? h : 0) % 360 + 360) % 360;
  const saturation = clampUnit(s);
  const value = clampUnit(v);
  const chroma = value * saturation;
  const section = hue / 60;
  const intermediate = chroma * (1 - Math.abs((section % 2) - 1));
  const [r, g, b] = section < 1 ? [chroma, intermediate, 0]
    : section < 2 ? [intermediate, chroma, 0]
      : section < 3 ? [0, chroma, intermediate]
        : section < 4 ? [0, intermediate, chroma]
          : section < 5 ? [intermediate, 0, chroma]
            : [chroma, 0, intermediate];
  const offset = value - chroma;
  return rgbaToHex([
    Math.round((r + offset) * 255),
    Math.round((g + offset) * 255),
    Math.round((b + offset) * 255),
    255,
  ]);
}

export function mixHex(first: string, second: string, amount: number): string {
  const left = hexToRGBA(first);
  const right = hexToRGBA(second);
  const weight = clampUnit(amount);
  return rgbaToHex([
    Math.round(left[0] + (right[0] - left[0]) * weight),
    Math.round(left[1] + (right[1] - left[1]) * weight),
    Math.round(left[2] + (right[2] - left[2]) * weight),
    255,
  ]);
}

export function tintShadeToneColor(baseHex: string, cell: TintShadeToneCell): string {
  const column = Math.max(0, Math.min(6, Math.round(cell.column)));
  const row = Math.max(0, Math.min(2, Math.round(cell.row)));
  const amount = (column + 1) / 8;
  return mixHex(baseHex, row === 0 ? "#ffffff" : row === 1 ? "#808080" : "#000000", amount);
}

export function selectorColorAt(
  mode: ColorSelectorMode,
  x: number,
  y: number,
  width: number,
  height: number,
  baseHex: string,
): string | null {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const base = hexToHsv(baseHex);
  if (mode === "spectrum") {
    return hsvToHex({h: base.h, s: clampUnit(x / Math.max(1, safeWidth - 1)), v: clampUnit(1 - y / Math.max(1, safeHeight - 1))});
  }
  if (mode === "tint-shade-tone") {
    const columns = 7;
    const column = Math.max(0, Math.min(columns - 1, Math.floor(x / safeWidth * columns)));
    const row = Math.max(0, Math.min(2, Math.floor(y / safeHeight * 3)));
    return tintShadeToneColor(baseHex, {column, row});
  }

  const geometry = wheelSelectorGeometry(safeWidth, safeHeight);
  if (y >= geometry.valueStripTop) {
    return hsvToHex({...base, v: clampUnit(x / Math.max(1, safeWidth - 1))});
  }
  const dx = x - geometry.centerX;
  const dy = y - geometry.centerY;
  const distance = Math.hypot(dx, dy);
  if (distance > geometry.radius) return null;
  return hsvToHex({h: (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, s: clampUnit(distance / geometry.radius), v: base.v});
}

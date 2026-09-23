import {MAX_BRUSH_SIZE, MIN_BRUSH_SIZE} from "./constants";
import type {
  BrushDynamicsCurve,
  BrushDynamicsOptions,
  BrushDynamicsRange,
  PointerDynamicsSample,
  PressureBrushOptions,
  PressureBrushSettings,
  ResolvedBrushDynamics,
  RGBA,
  Point,
} from "./types";

/** Clamp pointer/stylus pressure to the normalized range used by the brush helpers. */
export function normalizePressure(pressure: number | undefined, fallback = 1): number {
  const value = Number.isFinite(pressure) ? pressure as number : fallback;
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

export function pressureToBrushSize(
  pressure: number | undefined,
  minSize = MIN_BRUSH_SIZE,
  maxSize = MAX_BRUSH_SIZE,
): number {
  const range = normalizedRange(minSize, maxSize, MIN_BRUSH_SIZE, MAX_BRUSH_SIZE);
  return Math.round(range.min + normalizePressure(pressure) * (range.max - range.min));
}

export function pressureToOpacity(
  pressure: number | undefined,
  minOpacity = 0,
  maxOpacity = 1,
): number {
  const range = normalizedRange(minOpacity, maxOpacity, 0, 1);
  return range.min + normalizePressure(pressure) * (range.max - range.min);
}

export function pressureToBrushSettings(
  pressure: number | undefined,
  options: PressureBrushOptions = {},
): PressureBrushSettings {
  const normalized = normalizePressure(pressure);
  return {
    pressure: normalized,
    size: pressureToBrushSize(normalized, options.minSize, options.maxSize),
    opacity: pressureToOpacity(normalized, options.minOpacity, options.maxOpacity),
  };
}

export function normalizeBrushVelocity(velocity: number | undefined, maximum = 1): number {
  const limit = Number.isFinite(maximum) && maximum > 0 ? maximum : 1;
  const value = Number.isFinite(velocity) ? velocity as number : 0;
  return Math.max(0, Math.min(1, value / limit));
}

export function resolveBrushDynamics(
  sample: PointerDynamicsSample,
  options: BrushDynamicsOptions,
  maximumVelocity = 1,
  fallback: Partial<ResolvedBrushDynamics> = {},
): ResolvedBrushDynamics {
  const resolve = (range: BrushDynamicsRange, disabledValue: number) => {
    if (!range.enabled) return disabledValue;
    let input = range.source === "pressure"
      ? normalizePressure(sample.pressure)
      : normalizeBrushVelocity(sample.velocity, maximumVelocity);
    if (range.invert) input = 1 - input;
    const threshold = Math.max(0, Math.min(0.99, range.threshold));
    input = input <= threshold ? 0 : (input - threshold) / (1 - threshold);
    input = applyBrushDynamicsCurve(input, range.curve);
    const minimum = Math.min(range.min, range.max);
    const maximum = Math.max(range.min, range.max);
    return minimum + input * (maximum - minimum);
  };
  return {
    size: Math.max(MIN_BRUSH_SIZE, Math.min(MAX_BRUSH_SIZE, Math.round(resolve(options.size, fallback.size ?? options.size.max)))),
    opacity: Math.max(0, Math.min(1, resolve(options.opacity, fallback.opacity ?? options.opacity.max))),
    angle: ((resolve(options.angle, fallback.angle ?? options.angle.max) % 360) + 360) % 360,
    gradient: Math.max(0, Math.min(1, resolve(options.gradient, fallback.gradient ?? 0))),
  };
}

export function applyBrushDynamicsCurve(input: number, curve: BrushDynamicsCurve): number {
  const value = Math.max(0, Math.min(1, Number.isFinite(input) ? input : 0));
  if (curve === "ease-in") return value * value;
  if (curve === "ease-out") return 1 - (1 - value) * (1 - value);
  if (curve === "smoothstep") return value * value * (3 - 2 * value);
  return value;
}

export function interpolateRGBA(from: RGBA, to: RGBA, amount: number): [number, number, number, number] {
  const t = Math.max(0, Math.min(1, Number.isFinite(amount) ? amount : 0));
  return [0, 1, 2, 3].map((channel) => Math.round(from[channel] + (to[channel] - from[channel]) * t)) as [number, number, number, number];
}

export interface TimedPoint extends Point {time: number}

export function pointerVelocity(previous: TimedPoint | null, current: TimedPoint): number {
  if (!previous) return 0;
  const elapsed = Math.max(1, current.time - previous.time);
  return Math.hypot(current.x - previous.x, current.y - previous.y) / elapsed;
}

/** A trailing moving average that preserves the first and final pointer samples. */
export function stabilizeStroke(points: readonly Point[], strength: number): Point[] {
  if (points.length < 3) return points.map((point) => ({...point}));
  const radius = Math.max(0, Math.min(32, Math.round(strength)));
  if (radius === 0) return points.map((point) => ({...point}));
  const output: Point[] = [{...points[0]}];
  for (let index = 1; index < points.length - 1; index += 1) {
    const start = Math.max(0, index - radius);
    const end = Math.min(points.length - 1, index + radius);
    let x = 0;
    let y = 0;
    for (let sample = start; sample <= end; sample += 1) {
      x += points[sample].x;
      y += points[sample].y;
    }
    const count = end - start + 1;
    output.push({x: Math.round(x / count), y: Math.round(y / count)});
  }
  output.push({...points[points.length - 1]});
  return output;
}

export function stabilizePointerPoint(previous: Point | null, current: Point, strength: number): Point {
  const amount = Math.max(0, Math.min(32, Number.isFinite(strength) ? strength : 0));
  if (!previous || amount === 0) return {...current};
  const factor = 1 / (amount + 1);
  return {
    x: Math.round(previous.x + (current.x - previous.x) * factor),
    y: Math.round(previous.y + (current.y - previous.y) * factor),
  };
}

function normalizedRange(
  first: number | undefined,
  second: number | undefined,
  fallbackMin: number,
  fallbackMax: number,
) {
  const normalizedFirst = Number.isFinite(first) ? first as number : fallbackMin;
  const normalizedSecond = Number.isFinite(second) ? second as number : fallbackMax;
  return {
    min: Math.min(normalizedFirst, normalizedSecond),
    max: Math.max(normalizedFirst, normalizedSecond),
  };
}

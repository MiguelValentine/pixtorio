import type {Selection} from "./selection";

/**
 * Which byte channels an adjustment may write.
 *
 * The long channel names are the canonical API. The short aliases are useful
 * when callers already have an RGBA-shaped channel map.
 */
export interface ChannelMask {
  red?: boolean;
  green?: boolean;
  blue?: boolean;
  alpha?: boolean;
  r?: boolean;
  g?: boolean;
  b?: boolean;
  a?: boolean;
}

export interface AdjustmentScope {
  /** The document dimensions, in pixels. */
  width: number;
  height: number;
  /** Omit to apply to the whole buffer. */
  selection?: Selection | null;
  /** A convenience alias for channelMask.alpha. Defaults to false. */
  includeAlpha?: boolean;
  /** Unspecified RGB channels are enabled; alpha is disabled by default. */
  channelMask?: ChannelMask;
}

export interface BrightnessContrastAdjustment extends AdjustmentScope {
  /** Brightness offset as a percentage in the range -100..100. */
  brightness?: number;
  /** Contrast amount as a percentage in the range -100..100. */
  contrast?: number;
}

export interface HslAdjustment extends AdjustmentScope {
  /** Hue rotation in degrees. */
  hue?: number;
  /** Saturation change in percentage points in the range -100..100. */
  saturation?: number;
  /** Lightness change in percentage points in the range -100..100. */
  lightness?: number;
}

export interface SelectionAdjustmentOptions {
  selection?: Selection | null;
  includeAlpha?: boolean;
  channelMask?: ChannelMask;
}

/** A convolution kernel can be supplied flat (row-major) or as a matrix. */
export type ConvolutionKernel = readonly number[] | ReadonlyArray<ReadonlyArray<number>>;

export interface ConvolutionAdjustment extends AdjustmentScope {
  /** An odd square kernel, supplied flat or as rows. */
  kernel: ConvolutionKernel;
  /** Optional explicit kernel size for a flat kernel. */
  size?: number;
  /** Defaults to the sum of the kernel, or 1 when that sum is zero. */
  divisor?: number;
  /** Added after division, before clamping to an RGBA byte. */
  bias?: number;
}

export interface MedianAdjustment extends AdjustmentScope {
  /** Only 3x3 and 5x5 are supported by the editor UI. */
  size?: 3 | 5;
  /** If positive, a channel is replaced only when it differs by at least this amount. */
  threshold?: number;
}

export interface CurvePoint {
  input: number;
  output: number;
}

export type CurveControlPoint = CurvePoint | readonly [number, number] | {x: number; y: number};
export type CurveDefinition = readonly number[] | Uint8Array | ReadonlyArray<CurveControlPoint>;

export interface ChannelCurves {
  red?: CurveDefinition;
  green?: CurveDefinition;
  blue?: CurveDefinition;
  alpha?: CurveDefinition;
  r?: CurveDefinition;
  g?: CurveDefinition;
  b?: CurveDefinition;
  a?: CurveDefinition;
}

export interface ColorCurvesAdjustment extends AdjustmentScope {
  /** Curves may be control points or already-expanded 256-entry LUTs. */
  curves?: ChannelCurves;
  /** Alias useful when the caller has already built LUTs. */
  luts?: ChannelCurves;
}

export type HsvHslColorSpace = "hsv" | "hsl";
export type HsvHslMode = "relative" | "absolute";

export interface HsvHslAdjustment extends AdjustmentScope {
  /** Defaults to HSL for compatibility with the existing adjustment dialog. */
  space?: HsvHslColorSpace;
  colorSpace?: HsvHslColorSpace;
  /** Relative adds offsets; absolute replaces supplied components. */
  mode?: HsvHslMode;
  hue?: number;
  saturation?: number;
  /** HSV value in percentage points. Ignored for HSL. */
  value?: number;
  /** HSL lightness in percentage points. Ignored for HSV. */
  lightness?: number;
}

/**
 * Applies brightness and contrast directly to an RGBA8 buffer.
 *
 * The same buffer is returned to make command code convenient: callers can
 * snapshot it before invoking this function and commit that before/after pair
 * as one history command. RGB channels are adjusted by default; Alpha is
 * preserved unless includeAlpha or channelMask.alpha is explicitly enabled.
 */
export function adjustBrightnessContrastInPlace(
  pixels: Uint8ClampedArray,
  options: BrightnessContrastAdjustment,
): Uint8ClampedArray {
  const {width, height} = validateScope(pixels, options);
  const brightness = clamp(numberOr(options.brightness, 0), -100, 100) * 2.55;
  const contrast = clamp(numberOr(options.contrast, 0), -100, 100);
  const contrastFactor = contrastFactorForPercent(contrast);
  const channels = resolveChannels(options);

  visitPixels(pixels, width, height, options.selection, (offset, coverage) => {
    const original = [pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]];
    const adjusted = original.slice() as number[];
    for (const channel of [0, 1, 2, 3] as const) {
      if (!channels[channel]) continue;
      adjusted[channel] = contrastFactor * (original[channel] + brightness - 128) + 128;
    }
    blendPixel(pixels, offset, original, adjusted, channels, coverage);
  });
  return pixels;
}

/**
 * Applies hue, saturation, and lightness changes directly to an RGBA8 buffer.
 * Hue is rotated in degrees; saturation and lightness are percentage-point
 * offsets. Alpha is preserved because HSL has no alpha adjustment of its own,
 * unless a caller selects it through a channel mask (in which case it remains
 * unchanged by this particular operation).
 */
export function adjustHslInPlace(
  pixels: Uint8ClampedArray,
  options: HslAdjustment,
): Uint8ClampedArray {
  const {width, height} = validateScope(pixels, options);
  const hue = numberOr(options.hue, 0) / 360;
  const saturation = clamp(numberOr(options.saturation, 0), -100, 100) / 100;
  const lightness = clamp(numberOr(options.lightness, 0), -100, 100) / 100;
  const channels = resolveChannels(options);

  visitPixels(pixels, width, height, options.selection, (offset, coverage) => {
    const original = [pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]];
    const hsl = rgbToHsl(original[0], original[1], original[2]);
    const adjustedHsl = {
      h: wrapUnit(hsl.h + hue),
      s: clamp(hsl.s + saturation, 0, 1),
      l: clamp(hsl.l + lightness, 0, 1),
    };
    const adjustedRgb = hslToRgb(adjustedHsl.h, adjustedHsl.s, adjustedHsl.l);
    const adjusted = [adjustedRgb[0], adjustedRgb[1], adjustedRgb[2], original[3]];
    blendPixel(pixels, offset, original, adjusted, channels, coverage);
  });
  return pixels;
}

/** Inverts RGB channels in place, preserving Alpha unless explicitly enabled. */
export function invertPixelsInPlace(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  options: SelectionAdjustmentOptions = {},
): Uint8ClampedArray {
  const scope = {width, height, ...options};
  validateScope(pixels, scope);
  const channels = resolveChannels(scope);

  visitPixels(pixels, width, height, options.selection, (offset, coverage) => {
    const original = [pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]];
    const adjusted = original.map((value, channel) => channels[channel as 0 | 1 | 2 | 3] ? 255 - value : value);
    blendPixel(pixels, offset, original, adjusted, channels, coverage);
  });
  return pixels;
}

/**
 * Clears channels disabled by a mask in the selected pixels.
 *
 * A true (or omitted) channel is retained. An explicitly false channel is
 * written as zero. Selection coverage controls the blend between the original
 * channel and zero, making this safe for soft selections too.
 */
export function maskChannelsInPlace(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  mask: ChannelMask,
  selection: Selection | null = null,
): Uint8ClampedArray {
  validateScope(pixels, {width, height});
  const channels = resolveMaskForClearing(mask);
  visitPixels(pixels, width, height, selection, (offset, coverage) => {
    const original = [pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]];
    const adjusted = original.map((value, channel) => channels[channel as 0 | 1 | 2 | 3] ? value : 0);
    blendPixel(pixels, offset, original, adjusted, [true, true, true, true], coverage);
  });
  return pixels;
}

/** Explicit alias for callers that prefer the operation-oriented name. */
export const applyChannelMaskInPlace = maskChannelsInPlace;

/** More descriptive alias for the HSL operation. */
export const adjustHueSaturationLightnessInPlace = adjustHslInPlace;

/** Short alias useful in command registries. */
export const invertInPlace = invertPixelsInPlace;

/**
 * Applies a general odd-sized square convolution using a stable source copy.
 *
 * Kernel sampling clamps to the nearest edge pixel. Only the destination
 * channels selected by channelMask are changed; selection masks are applied
 * as 0..255 coverage after the filtered pixel has been calculated.
 */
export function applyConvolutionInPlace(
  pixels: Uint8ClampedArray,
  options: ConvolutionAdjustment,
): Uint8ClampedArray {
  const {width, height} = validateScope(pixels, options);
  const kernel = normalizeConvolutionKernel(options.kernel, options.size);
  const divisor = numberOr(options.divisor, kernel.sum === 0 ? 1 : kernel.sum);
  if (divisor === 0) throw new RangeError("Convolution divisor must not be zero");
  const bias = numberOr(options.bias, 0);
  const channels = resolveChannels(options);
  const source = new Uint8ClampedArray(pixels);
  const radius = Math.floor(kernel.size / 2);

  visitPixels(pixels, width, height, options.selection, (offset, coverage) => {
    const pixelIndex = offset / 4;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const original = [source[offset], source[offset + 1], source[offset + 2], source[offset + 3]];
    const adjusted = original.slice() as number[];
    for (let channel = 0; channel < 4; channel += 1) {
      if (!channels[channel as 0 | 1 | 2 | 3]) continue;
      let total = 0;
      for (let kernelY = 0; kernelY < kernel.size; kernelY += 1) {
        const sampleY = clampInteger(y + kernelY - radius, 0, height - 1);
        for (let kernelX = 0; kernelX < kernel.size; kernelX += 1) {
          const sampleX = clampInteger(x + kernelX - radius, 0, width - 1);
          const sampleOffset = (sampleY * width + sampleX) * 4 + channel;
          total += source[sampleOffset] * kernel.values[kernelY * kernel.size + kernelX];
        }
      }
      adjusted[channel] = total / divisor + bias;
    }
    blendPixel(pixels, offset, original, adjusted, channels, coverage);
  });
  return pixels;
}

/** Pure counterpart to applyConvolutionInPlace. */
export function applyConvolution(
  pixels: Uint8ClampedArray,
  options: ConvolutionAdjustment,
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(pixels);
  return applyConvolutionInPlace(result, options);
}

/** Operation-oriented aliases used by command registries. */
export const convolvePixelsInPlace = applyConvolutionInPlace;
export const convolvePixels = applyConvolution;

/** Applies a 3x3 or 5x5 per-channel median filter. */
export function applyMedianInPlace(
  pixels: Uint8ClampedArray,
  options: MedianAdjustment,
): Uint8ClampedArray {
  const {width, height} = validateScope(pixels, options);
  const size = options.size ?? 3;
  if (size !== 3 && size !== 5) throw new RangeError("Median filter size must be 3 or 5");
  const threshold = Math.max(0, numberOr(options.threshold, 0));
  const channels = resolveChannels(options);
  const source = new Uint8ClampedArray(pixels);
  const radius = Math.floor(size / 2);

  visitPixels(pixels, width, height, options.selection, (offset, coverage) => {
    const pixelIndex = offset / 4;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const original = [source[offset], source[offset + 1], source[offset + 2], source[offset + 3]];
    const adjusted = original.slice() as number[];
    for (let channel = 0; channel < 4; channel += 1) {
      if (!channels[channel as 0 | 1 | 2 | 3]) continue;
      const samples: number[] = [];
      for (let sampleY = -radius; sampleY <= radius; sampleY += 1) {
        const clampedY = clampInteger(y + sampleY, 0, height - 1);
        for (let sampleX = -radius; sampleX <= radius; sampleX += 1) {
          const clampedX = clampInteger(x + sampleX, 0, width - 1);
          samples.push(source[(clampedY * width + clampedX) * 4 + channel]);
        }
      }
      samples.sort((left, right) => left - right);
      const median = samples[Math.floor(samples.length / 2)];
      adjusted[channel] = threshold > 0 && Math.abs(median - original[channel]) < threshold
        ? original[channel]
        : median;
    }
    blendPixel(pixels, offset, original, adjusted, channels, coverage);
  });
  return pixels;
}

/** Pure counterpart to applyMedianInPlace. */
export function applyMedian(pixels: Uint8ClampedArray, options: MedianAdjustment): Uint8ClampedArray {
  return applyMedianInPlace(new Uint8ClampedArray(pixels), options);
}

/** Despeckle is exposed separately because it is a distinct editor command. */
export const applyDespeckleInPlace = applyMedianInPlace;
export const applyDespeckle = applyMedian;
export const medianFilterInPlace = applyMedianInPlace;
export const medianFilter = applyMedian;
export const despeckleInPlace = applyMedianInPlace;
export const despeckle = applyMedian;

/**
 * Expands sorted curve control points into a 256-entry byte lookup table.
 * Values outside the first/last point use the nearest endpoint value.
 */
export function createCurveLut(points: ReadonlyArray<CurveControlPoint>): Uint8Array {
  const normalized = points.map(curvePoint).filter((point) => Number.isFinite(point.input) && Number.isFinite(point.output));
  if (normalized.length === 0) return identityCurveLut();
  normalized.sort((left, right) => left.input - right.input);
  const result = new Uint8Array(256);
  for (let input = 0; input < 256; input += 1) {
    if (input <= normalized[0].input) {
      result[input] = clampByte(normalized[0].output);
      continue;
    }
    const last = normalized[normalized.length - 1];
    if (input >= last.input) {
      result[input] = clampByte(last.output);
      continue;
    }
    let rightIndex = 1;
    while (rightIndex < normalized.length && input > normalized[rightIndex].input) rightIndex += 1;
    const left = normalized[rightIndex - 1];
    const right = normalized[rightIndex];
    const span = right.input - left.input;
    const ratio = span === 0 ? 0 : (input - left.input) / span;
    result[input] = clampByte(left.output + (right.output - left.output) * ratio);
  }
  return result;
}

/** Returns a new identity curve LUT. */
export function identityCurveLut(): Uint8Array {
  const result = new Uint8Array(256);
  for (let index = 0; index < result.length; index += 1) result[index] = index;
  return result;
}

export const buildCurveLut = createCurveLut;

/** Applies independent channel curve LUTs, with soft selection coverage. */
export function applyColorCurvesInPlace(
  pixels: Uint8ClampedArray,
  options: ColorCurvesAdjustment,
): Uint8ClampedArray {
  const {width, height} = validateScope(pixels, options);
  const channels = resolveChannels(options);
  const definitions = options.curves ?? options.luts ?? {};
  const luts = [
    resolveCurveLut(definitions.red ?? definitions.r),
    resolveCurveLut(definitions.green ?? definitions.g),
    resolveCurveLut(definitions.blue ?? definitions.b),
    resolveCurveLut(definitions.alpha ?? definitions.a),
  ];
  visitPixels(pixels, width, height, options.selection, (offset, coverage) => {
    const original = [pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]];
    const adjusted = original.slice() as number[];
    for (let channel = 0; channel < 4; channel += 1) {
      const lut = luts[channel];
      if (channels[channel as 0 | 1 | 2 | 3] && lut) adjusted[channel] = lut[original[channel]];
    }
    blendPixel(pixels, offset, original, adjusted, channels, coverage);
  });
  return pixels;
}

/** Pure counterpart to applyColorCurvesInPlace. */
export function applyColorCurves(pixels: Uint8ClampedArray, options: ColorCurvesAdjustment): Uint8ClampedArray {
  return applyColorCurvesInPlace(new Uint8ClampedArray(pixels), options);
}

export const adjustColorCurvesInPlace = applyColorCurvesInPlace;
export const adjustColorCurves = applyColorCurves;
export const applyCurvesInPlace = applyColorCurvesInPlace;
export const applyCurves = applyColorCurves;

/**
 * Applies HSV or HSL component changes. In relative mode hue is added in
 * degrees and saturation/value/lightness are added in percentage points. In
 * absolute mode supplied components replace the source components.
 */
export function adjustHsvHslInPlace(
  pixels: Uint8ClampedArray,
  options: HsvHslAdjustment,
): Uint8ClampedArray {
  const {width, height} = validateScope(pixels, options);
  const space = options.space ?? options.colorSpace ?? "hsl";
  const mode = options.mode ?? "relative";
  const channels = resolveChannels(options);
  const hue = numberOr(options.hue, 0);
  const saturation = options.saturation;
  const scalar = space === "hsv" ? options.value : options.lightness;

  visitPixels(pixels, width, height, options.selection, (offset, coverage) => {
    const original = [pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]];
    const hsv = rgbToHsv(original[0], original[1], original[2]);
    const hsl = rgbToHsl(original[0], original[1], original[2]);
    const sourceHue = space === "hsv" ? hsv.h : hsl.h;
    const sourceSaturation = space === "hsv" ? hsv.s : hsl.s;
    const sourceScalar = space === "hsv" ? hsv.v : hsl.l;
    const adjustedHue = mode === "absolute" && options.hue !== undefined
      ? hue / 360
      : sourceHue + hue / 360;
    const adjustedSaturation = mode === "absolute"
      ? saturation === undefined ? sourceSaturation : clamp(saturation / 100, 0, 1)
      : sourceSaturation + numberOr(saturation, 0) / 100;
    const adjustedScalar = mode === "absolute"
      ? scalar === undefined ? sourceScalar : clamp(scalar / 100, 0, 1)
      : sourceScalar + numberOr(scalar, 0) / 100;
    const adjustedRgb = space === "hsv"
      ? hsvToRgb(wrapUnit(adjustedHue), clamp(adjustedSaturation, 0, 1), clamp(adjustedScalar, 0, 1))
      : hslToRgb(wrapUnit(adjustedHue), clamp(adjustedSaturation, 0, 1), clamp(adjustedScalar, 0, 1));
    const adjusted = [adjustedRgb[0], adjustedRgb[1], adjustedRgb[2], original[3]];
    blendPixel(pixels, offset, original, adjusted, channels, coverage);
  });
  return pixels;
}

/** Pure counterpart to adjustHsvHslInPlace. */
export function adjustHsvHsl(pixels: Uint8ClampedArray, options: HsvHslAdjustment): Uint8ClampedArray {
  return adjustHsvHslInPlace(new Uint8ClampedArray(pixels), options);
}

export const adjustHsvInPlace = (pixels: Uint8ClampedArray, options: Omit<HsvHslAdjustment, "space" | "colorSpace">) =>
  adjustHsvHslInPlace(pixels, {...options, space: "hsv"});
export const adjustHsv = (pixels: Uint8ClampedArray, options: Omit<HsvHslAdjustment, "space" | "colorSpace">) =>
  adjustHsvHsl(pixels, {...options, space: "hsv"});
export const adjustHslModeInPlace = (pixels: Uint8ClampedArray, options: Omit<HsvHslAdjustment, "space" | "colorSpace">) =>
  adjustHsvHslInPlace(pixels, {...options, space: "hsl"});
export const adjustHslMode = (pixels: Uint8ClampedArray, options: Omit<HsvHslAdjustment, "space" | "colorSpace">) =>
  adjustHsvHsl(pixels, {...options, space: "hsl"});

/** Public color conversion helpers for adjustment UIs and command previews. */
export function rgbToHsv(red: number, green: number, blue: number) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return {h: 0, s: 0, v: max};
  let hue: number;
  if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
  else if (max === g) hue = ((b - r) / delta + 2) / 6;
  else hue = ((r - g) / delta + 4) / 6;
  return {h: hue, s: max === 0 ? 0 : delta / max, v: max};
}

export function hsvToRgb(hue: number, saturation: number, value: number): [number, number, number] {
  const h = wrapUnit(hue) * 6;
  const sector = Math.floor(h);
  const fraction = h - sector;
  const p = value * (1 - saturation);
  const q = value * (1 - saturation * fraction);
  const t = value * (1 - saturation * (1 - fraction));
  const rgb = sector % 6 === 0 ? [value, t, p]
    : sector === 1 ? [q, value, p]
      : sector === 2 ? [p, value, t]
        : sector === 3 ? [p, q, value]
          : sector === 4 ? [t, p, value]
            : [value, p, q];
  return [clampByte(rgb[0] * 255), clampByte(rgb[1] * 255), clampByte(rgb[2] * 255)];
}

function normalizeConvolutionKernel(kernel: ConvolutionKernel, requestedSize?: number) {
  const first = kernel[0];
  const flat = typeof first === "number";
  let size: number;
  let values: number[];
  if (flat) {
    values = (kernel as readonly number[]).map(Number);
    size = requestedSize ?? Math.sqrt(values.length);
  } else {
    const rows = kernel as ReadonlyArray<ReadonlyArray<number>>;
    size = requestedSize ?? rows.length;
    if (rows.length !== size) throw new RangeError("Convolution kernel must be square");
    values = rows.flatMap((row) => row.map(Number));
  }
  if (!Number.isSafeInteger(size) || size < 1 || size % 2 === 0 || values.length !== size * size) {
    throw new RangeError("Convolution kernel size must be an odd square");
  }
  if (values.some((value) => !Number.isFinite(value))) throw new RangeError("Convolution kernel values must be finite");
  return {size, values, sum: values.reduce((total, value) => total + value, 0)};
}

function curvePoint(point: CurveControlPoint): CurvePoint {
  if (Array.isArray(point)) return {input: Number(point[0]), output: Number(point[1])};
  if ("x" in point) return {input: Number(point.x), output: Number(point.y)};
  if ("input" in point) return {input: Number(point.input), output: Number(point.output)};
  return {input: 0, output: 0};
}

function resolveCurveLut(definition: CurveDefinition | undefined): Uint8Array | null {
  if (!definition) return null;
  if (definition instanceof Uint8Array) {
    if (definition.length !== 256) throw new RangeError("Curve LUT must contain 256 entries");
    return new Uint8Array(definition);
  }
  if (definition.length === 256 && definition.every((value) => typeof value === "number")) {
    return new Uint8Array(Array.from(definition as readonly number[], clampByte));
  }
  return createCurveLut(definition as ReadonlyArray<CurveControlPoint>);
}

function clampInteger(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}

type ByteChannels = readonly [boolean, boolean, boolean, boolean];

function validateScope(pixels: Uint8ClampedArray, scope: {width: number; height: number}) {
  if (!Number.isSafeInteger(scope.width) || scope.width <= 0 || !Number.isSafeInteger(scope.height) || scope.height <= 0) {
    throw new RangeError("Adjustment dimensions must be positive integers");
  }
  const expectedLength = scope.width * scope.height * 4;
  if (pixels.length !== expectedLength) {
    throw new RangeError(`Adjustment buffer has ${pixels.length} bytes; expected ${expectedLength}`);
  }
  return {width: scope.width, height: scope.height};
}

function resolveChannels(options: {includeAlpha?: boolean; channelMask?: ChannelMask}): ByteChannels {
  const mask = options.channelMask ?? {};
  return [
    maskValue(mask.red, mask.r, true),
    maskValue(mask.green, mask.g, true),
    maskValue(mask.blue, mask.b, true),
    options.includeAlpha ?? maskValue(mask.alpha, mask.a, false),
  ];
}

function resolveMaskForClearing(mask: ChannelMask): ByteChannels {
  return [
    maskValue(mask.red, mask.r, true),
    maskValue(mask.green, mask.g, true),
    maskValue(mask.blue, mask.b, true),
    maskValue(mask.alpha, mask.a, true),
  ];
}

function maskValue(primary: boolean | undefined, alias: boolean | undefined, fallback: boolean) {
  return primary ?? alias ?? fallback;
}

function visitPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  selection: Selection | null | undefined,
  callback: (offset: number, coverage: number) => void,
) {
  if (!selection) {
    for (let offset = 0; offset < pixels.length; offset += 4) callback(offset, 255);
    return;
  }

  const left = Math.max(0, Math.ceil(selection.x));
  const top = Math.max(0, Math.ceil(selection.y));
  const right = Math.min(width, Math.ceil(selection.x + selection.width));
  const bottom = Math.min(height, Math.ceil(selection.y + selection.height));
  const hasMask = selection.mask !== undefined && selection.mask.length === selection.width * selection.height;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const coverage = hasMask
        ? selectionCoverage(selection.mask!, Math.floor(y - selection.y) * selection.width + Math.floor(x - selection.x))
        : 255;
      if (coverage > 0) callback((y * width + x) * 4, coverage);
    }
  }
}

function selectionCoverage(mask: ArrayLike<number>, index: number) {
  const value = mask[index] ?? 0;
  if (value <= 0) return 0;
  // Existing binary Selection masks use 1 for fully selected. Masks carrying
  // any larger value use the full 0..255 coverage range.
  if (value <= 1) return 255;
  return clamp(value, 0, 255);
}

function blendPixel(
  pixels: Uint8ClampedArray,
  offset: number,
  original: readonly number[],
  adjusted: readonly number[],
  channels: ByteChannels,
  coverage: number,
) {
  for (let channel = 0; channel < 4; channel += 1) {
    if (!channels[channel as 0 | 1 | 2 | 3]) continue;
    const value = original[channel] + (clampByte(adjusted[channel]) - original[channel]) * (coverage / 255);
    pixels[offset + channel] = clampByte(value);
  }
}

function contrastFactorForPercent(value: number) {
  const contrast = value * 2.55;
  return (259 * (contrast + 255)) / (255 * (259 - contrast));
}

function rgbToHsl(red: number, green: number, blue: number) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  if (delta === 0) return {h: 0, s: 0, l: lightness};

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
  else if (max === g) hue = ((b - r) / delta + 2) / 6;
  else hue = ((r - g) / delta + 4) / 6;
  return {h: hue, s: saturation, l: lightness};
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  if (saturation === 0) {
    const gray = clampByte(lightness * 255);
    return [gray, gray, gray];
  }
  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  return [
    clampByte(hueToRgb(p, q, hue + 1 / 3) * 255),
    clampByte(hueToRgb(p, q, hue) * 255),
    clampByte(hueToRgb(p, q, hue - 1 / 3) * 255),
  ];
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

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

function numberOr(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function wrapUnit(value: number) {
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

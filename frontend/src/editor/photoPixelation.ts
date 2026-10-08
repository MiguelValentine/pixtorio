import {quantize} from "gifenc";
import {indexPixels, renderIndexedPixels, type DitherMode} from "./colorModes";

export interface PhotoPixelationOptions {
  maxColors: number;
  mergeThreshold: number;
  dither: DitherMode;
}

export interface PhotoPixelationResult {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  palette: string[];
  colorCount: number;
}

interface RGBAColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface PaletteEntry extends RGBAColor {
  order: number;
  weight: number;
}

const MAX_DIMENSION = 1024;
const MAX_PIXELS = MAX_DIMENSION * MAX_DIMENSION;
const MAX_RGB_DISTANCE = Math.sqrt(3 * 255 * 255);
const ORDERED_MATRIX = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export function pixelatePhoto(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  options: PhotoPixelationOptions,
): PhotoPixelationResult {
  validateInput(pixels, width, height, options);

  const normalized = new Uint8ClampedArray(pixels.length);
  const quantizationSamples: number[] = [];
  let hasTransparent = false;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const alpha = pixels[offset + 3];
    if (alpha === 0) {
      hasTransparent = true;
      normalized[offset] = 0;
      normalized[offset + 1] = 0;
      normalized[offset + 2] = 0;
      normalized[offset + 3] = 0;
      continue;
    }
    normalized[offset] = pixels[offset];
    normalized[offset + 1] = pixels[offset + 1];
    normalized[offset + 2] = pixels[offset + 2];
    normalized[offset + 3] = alpha;
    quantizationSamples.push(pixels[offset], pixels[offset + 1], pixels[offset + 2], alpha);
  }

  const realColorLimit = options.maxColors - (hasTransparent ? 1 : 0);
  const quantized = quantizationSamples.length === 0
    ? []
    : quantize(
      new Uint8ClampedArray(quantizationSamples),
      realColorLimit,
      {format: "rgba4444", oneBitAlpha: false, clearAlpha: false} as Parameters<typeof quantize>[2],
    );
  const initialPalette = buildInitialPalette(quantized, normalized);
  const mergedPalette = mergePalette(initialPalette, options.mergeThreshold);
  const realPalette = mergedPalette.length > 0
    ? mergedPalette.map(({r, g, b, a}) => ({r, g, b, a}))
    : [];

  const output = new Uint8ClampedArray(normalized);
  if (realPalette.length > 0) {
    if (!hasTransparent && realPalette.length === 256) {
      mapWithoutTransparentSlot(output, realPalette, width, height, options.dither);
    } else {
      const palette = [transparentColor(), ...realPalette].map(formatColor);
      const indexes = indexPixels(output, palette, {
        width,
        height,
        dither: options.dither,
        transparentIndex: 0,
      });
      renderIndexedPixels(indexes, output, palette, 0);
    }
  } else {
    output.fill(0);
  }

  const resultPalette = collectUsedPalette(output);
  return {
    width,
    height,
    pixels: output,
    palette: resultPalette,
    colorCount: resultPalette.length,
  };
}

function validateInput(pixels: Uint8ClampedArray, width: number, height: number, options: PhotoPixelationOptions) {
  if (!(pixels instanceof Uint8ClampedArray)) throw new Error("Photo pixels must be a Uint8ClampedArray");
  if (!Number.isInteger(width) || width < 1 || width > MAX_DIMENSION) throw new Error("Photo width must be an integer from 1 to 1024");
  if (!Number.isInteger(height) || height < 1 || height > MAX_DIMENSION) throw new Error("Photo height must be an integer from 1 to 1024");
  if (width * height > MAX_PIXELS) throw new Error("Photo pixel count exceeds 1024 × 1024");
  if (pixels.length !== width * height * 4) throw new Error("Photo pixel buffer dimensions do not match");
  if (!options || !Number.isInteger(options.maxColors) || options.maxColors < 2 || options.maxColors > 256) {
    throw new Error("Photo maxColors must be an integer from 2 to 256");
  }
  if (!Number.isFinite(options.mergeThreshold) || options.mergeThreshold < 0 || options.mergeThreshold > 100) {
    throw new Error("Photo mergeThreshold must be from 0 to 100");
  }
  if (options.dither !== "none" && options.dither !== "ordered" && options.dither !== "floyd-steinberg") {
    throw new Error("Unsupported photo dithering mode");
  }
}

function buildInitialPalette(quantized: number[][], pixels: Uint8ClampedArray): PaletteEntry[] {
  const entries: PaletteEntry[] = [];
  for (let index = 0; index < quantized.length; index += 1) {
    const color = normalizeColor(quantized[index]);
    if (color.a === 0 || entries.some((entry) => sameColor(entry, color))) continue;
    entries.push({...color, order: index, weight: 0});
  }
  if (entries.length === 0) return [];

  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset + 3] === 0) continue;
    const source = colorAt(pixels, offset);
    const nearest = nearestPaletteIndex(source, entries);
    entries[nearest].weight += 1;
  }
  return entries;
}

function mergePalette(entries: PaletteEntry[], threshold: number) {
  const merged = entries.map((entry) => ({...entry}));
  const maximumDistance = (threshold / 100) * MAX_RGB_DISTANCE;
  if (threshold === 0) return merged;

  while (true) {
    let bestLeft = -1;
    let bestRight = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let left = 0; left < merged.length; left += 1) {
      for (let right = left + 1; right < merged.length; right += 1) {
        const distance = rgbDistance(merged[left], merged[right]);
        if (distance > maximumDistance) continue;
        if (distance < bestDistance || (distance === bestDistance && (left < bestLeft || (left === bestLeft && right < bestRight)))) {
          bestLeft = left;
          bestRight = right;
          bestDistance = distance;
        }
      }
    }
    if (bestLeft < 0) break;
    merged[bestLeft] = weightedMerge(merged[bestLeft], merged[bestRight]);
    merged.splice(bestRight, 1);
  }
  return merged;
}

function weightedMerge(left: PaletteEntry, right: PaletteEntry): PaletteEntry {
  const leftWeight = left.weight || 1;
  const rightWeight = right.weight || 1;
  const weight = leftWeight + rightWeight;
  return {
    r: Math.round((left.r * leftWeight + right.r * rightWeight) / weight),
    g: Math.round((left.g * leftWeight + right.g * rightWeight) / weight),
    b: Math.round((left.b * leftWeight + right.b * rightWeight) / weight),
    a: Math.round((left.a * leftWeight + right.a * rightWeight) / weight),
    order: Math.min(left.order, right.order),
    weight,
  };
}

function mapWithoutTransparentSlot(pixels: Uint8ClampedArray, palette: readonly RGBAColor[], width: number, height: number, dither: DitherMode) {
  if (dither === "floyd-steinberg") {
    mapFloydSteinberg(pixels, palette, width, height);
    return;
  }
  for (let pixel = 0; pixel < pixels.length / 4; pixel += 1) {
    const offset = pixel * 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const source = colorAt(pixels, offset);
    if (dither === "ordered") {
      const adjustment = orderedDitherOffset(x, y);
      source.r = clampByte(source.r + adjustment);
      source.g = clampByte(source.g + adjustment);
      source.b = clampByte(source.b + adjustment);
    }
    const color = palette[nearestPaletteIndex(source, palette)];
    writeColor(pixels, offset, color);
  }
}

function mapFloydSteinberg(pixels: Uint8ClampedArray, palette: readonly RGBAColor[], width: number, height: number) {
  const errors = new Float64Array(pixels.length);
  const addError = (x: number, y: number, channel: number, value: number, weight: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    errors[(y * width + x) * 4 + channel] += value * weight;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      const source = colorAt(pixels, offset);
      source.r = clampByte(source.r + errors[offset]);
      source.g = clampByte(source.g + errors[offset + 1]);
      source.b = clampByte(source.b + errors[offset + 2]);
      source.a = clampByte(source.a + errors[offset + 3]);
      const color = palette[nearestPaletteIndex(source, palette)];
      for (let channel = 0; channel < 4; channel += 1) {
        const sourceChannel = channel === 0 ? source.r : channel === 1 ? source.g : channel === 2 ? source.b : source.a;
        const targetChannel = channel === 0 ? color.r : channel === 1 ? color.g : channel === 2 ? color.b : color.a;
        const error = sourceChannel - targetChannel;
        addError(x + 1, y, channel, error, 7 / 16);
        addError(x - 1, y + 1, channel, error, 3 / 16);
        addError(x, y + 1, channel, error, 5 / 16);
        addError(x + 1, y + 1, channel, error, 1 / 16);
      }
      writeColor(pixels, offset, color);
    }
  }
}

function nearestPaletteIndex(source: RGBAColor, palette: readonly RGBAColor[]) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < palette.length; index += 1) {
    const candidate = palette[index];
    const red = candidate.r - source.r;
    const green = candidate.g - source.g;
    const blue = candidate.b - source.b;
    const alpha = candidate.a - source.a;
    const distance = red * red * 0.3 + green * green * 0.59 + blue * blue * 0.11 + alpha * alpha;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function rgbDistance(left: RGBAColor, right: RGBAColor) {
  return Math.sqrt((left.r - right.r) ** 2 + (left.g - right.g) ** 2 + (left.b - right.b) ** 2);
}

function collectUsedPalette(pixels: Uint8ClampedArray) {
  const used = new Map<string, boolean>();
  const opaque: string[] = [];
  let hasTransparent = false;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const color = formatColor(colorAt(pixels, offset));
    if (pixels[offset + 3] === 0) {
      hasTransparent = true;
      continue;
    }
    if (!used.has(color)) {
      used.set(color, true);
      opaque.push(color);
    }
  }
  return hasTransparent ? ["#00000000", ...opaque] : opaque;
}

function normalizeColor(color: readonly number[]): RGBAColor {
  return {
    r: clampByte(color[0]),
    g: clampByte(color[1]),
    b: clampByte(color[2]),
    a: clampByte(color[3] ?? 255),
  };
}

function colorAt(pixels: Uint8ClampedArray, offset: number): RGBAColor {
  return {r: pixels[offset], g: pixels[offset + 1], b: pixels[offset + 2], a: pixels[offset + 3]};
}

function transparentColor(): RGBAColor {
  return {r: 0, g: 0, b: 0, a: 0};
}

function writeColor(pixels: Uint8ClampedArray, offset: number, color: RGBAColor) {
  pixels[offset] = color.r;
  pixels[offset + 1] = color.g;
  pixels[offset + 2] = color.b;
  pixels[offset + 3] = color.a;
}

function formatColor(color: RGBAColor) {
  return `#${[color.r, color.g, color.b, color.a].map((channel) => clampByte(channel).toString(16).padStart(2, "0")).join("")}`;
}

function sameColor(left: RGBAColor, right: RGBAColor) {
  return left.r === right.r && left.g === right.g && left.b === right.b && left.a === right.a;
}

function orderedDitherOffset(x: number, y: number) {
  return (((ORDERED_MATRIX[y & 3][x & 3] + 0.5) / 16) - 0.5) * 64;
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)));
}

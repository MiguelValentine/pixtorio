import {selectionCoverageAt, type Selection} from "./selection";
import type {RGBA} from "./tools";

export type OutlineDirection = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
export type OutlineShape = "square" | "diamond" | "circle";

type OutlineOffset = {dx: number; dy: number};

const outlineDirections: readonly OutlineDirection[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];

export interface OutlineOptions {
  width: number;
  height: number;
  color: RGBA;
  thickness?: number;
  position?: "outside" | "inside";
  diagonal?: boolean;
  shape?: OutlineShape;
  directions?: OutlineDirection[];
  tileX?: boolean;
  tileY?: boolean;
  channelMask?: {red?: boolean; green?: boolean; blue?: boolean; alpha?: boolean};
  selection?: Selection | null;
}

export function outlinePixelsInPlace(pixels: Uint8ClampedArray, options: OutlineOptions) {
  const {width, height} = options;
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0
    || !Number.isSafeInteger(width * height)) throw new RangeError("Outline dimensions must be positive integers");
  if (pixels.length !== width * height * 4) throw new Error("Outline dimensions do not match the pixel buffer");
  const radius = Math.max(1, Math.min(32, Math.round(options.thickness ?? 1)));
  const directions = new Set(options.directions ?? outlineDirections);
  if (directions.size === 0) return 0;
  const offsets = outlineOffsets(radius, options.shape, options.diagonal ?? true, directions);
  if (offsets.length === 0) return 0;
  const channelMask = options.channelMask;
  const channels = [
    channelMask?.red !== false,
    channelMask?.green !== false,
    channelMask?.blue !== false,
    channelMask?.alpha !== false,
  ];
  if (!channels.some(Boolean)) return 0;
  const source = pixels.slice();
  const inside = options.position === "inside";
  const opaqueBounds = findOpaqueBounds(source, width);
  if (!opaqueBounds) return 0;
  const tileX = options.tileX === true;
  const tileY = options.tileY === true;
  let changed = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (!inside && (!nearOpaqueRange(x, opaqueBounds.left, opaqueBounds.right, radius, width, tileX)
      || !nearOpaqueRange(y, opaqueBounds.top, opaqueBounds.bottom, radius, height, tileY))) continue;
    const offset = (y * width + x) * 4;
    const opaque = source[offset + 3] !== 0;
    if (opaque !== inside) continue;
    if (!hasBoundarySample(source, width, height, x, y, offsets, inside, tileX, tileY)) continue;
    const coverage = options.selection ? selectionCoverageAt(options.selection, x, y) : 255;
    if (coverage === 0) continue;
    const mix = coverage / 255;
    const sourceAlpha = source[offset + 3];
    const targetAlpha = channels[3] ? options.color[3] : sourceAlpha;
    const blendedAlpha = sourceAlpha * (1 - mix) + targetAlpha * mix;
    let pixelChanged = false;
    for (let channel = 0; channel < 4; channel += 1) {
      if (!channels[channel]) continue;
      // Interpolate visible colors in premultiplied space. Transparent source
      // RGB must not darken an outline at a feathered selection edge.
      const next = Math.round(channel < 3 && blendedAlpha > 0
        ? (source[offset + channel] * sourceAlpha * (1 - mix) + options.color[channel] * targetAlpha * mix) / blendedAlpha
        : source[offset + channel] + (options.color[channel] - source[offset + channel]) * mix);
      pixels[offset + channel] = next;
      if (pixels[offset + channel] !== source[offset + channel]) pixelChanged = true;
    }
    if (pixelChanged) changed += 1;
  }
  return changed;
}

export interface ShadeOptions {
  width: number;
  height: number;
  shadow: RGBA;
  highlight: RGBA;
  selection?: Selection | null;
  preserveAlpha?: boolean;
}

export function shadePixelsInPlace(pixels: Uint8ClampedArray, options: ShadeOptions) {
  if (pixels.length !== options.width * options.height * 4) throw new Error("Shade dimensions do not match the pixel buffer");
  let changed = 0;
  for (let y = 0; y < options.height; y += 1) for (let x = 0; x < options.width; x += 1) {
    const offset = (y * options.width + x) * 4;
    if (pixels[offset + 3] === 0) continue;
    const coverage = options.selection ? selectionCoverageAt(options.selection, x, y) : 255;
    if (coverage === 0) continue;
    const luminance = (pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722) / 255;
    const target = [0, 1, 2, 3].map((channel) => Math.round(options.shadow[channel] + (options.highlight[channel] - options.shadow[channel]) * luminance));
    for (let channel = 0; channel < 3; channel += 1) pixels[offset + channel] = Math.round(pixels[offset + channel] + (target[channel] - pixels[offset + channel]) * coverage / 255);
    if (!options.preserveAlpha) pixels[offset + 3] = Math.round(pixels[offset + 3] + (target[3] - pixels[offset + 3]) * coverage / 255);
    changed += 1;
  }
  return changed;
}

function outlineOffsets(
  radius: number,
  shape: OutlineShape | undefined,
  diagonal: boolean,
  directions: ReadonlySet<OutlineDirection>,
) {
  const offsets: OutlineOffset[] = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      if (shape === undefined) {
        if (!diagonal && dx !== 0 && dy !== 0) continue;
      } else if (!matchesOutlineShape(dx, dy, radius, shape)) {
        continue;
      }
      if (!directions.has(outlineDirectionForOffset(dx, dy))) continue;
      offsets.push({dx, dy});
    }
  }
  return offsets;
}

function matchesOutlineShape(dx: number, dy: number, radius: number, shape: OutlineShape) {
  if (shape === "diamond") return Math.abs(dx) + Math.abs(dy) <= radius;
  if (shape === "circle") return dx * dx + dy * dy <= radius * radius;
  return Math.max(Math.abs(dx), Math.abs(dy)) <= radius;
}

function outlineDirectionForOffset(dx: number, dy: number): OutlineDirection {
  if (dx === 0) return dy < 0 ? "n" : "s";
  if (dy === 0) return dx > 0 ? "e" : "w";
  if (dx > 0) return dy < 0 ? "ne" : "se";
  return dy < 0 ? "nw" : "sw";
}

function hasBoundarySample(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  offsets: readonly OutlineOffset[],
  inside: boolean,
  tileX: boolean,
  tileY: boolean,
) {
  for (const {dx, dy} of offsets) {
    const sampleX = sampleCoordinate(x + (inside ? dx : -dx), width, tileX);
    const sampleY = sampleCoordinate(y + (inside ? dy : -dy), height, tileY);
    if (sampleX === null || sampleY === null) {
      if (!inside) continue;
      return true;
    }
    const neighborOpaque = source[(sampleY * width + sampleX) * 4 + 3] !== 0;
    if (inside ? !neighborOpaque : neighborOpaque) return true;
  }
  return false;
}

function sampleCoordinate(value: number, size: number, wrap: boolean) {
  if (value >= 0 && value < size) return value;
  if (!wrap) return null;
  return ((value % size) + size) % size;
}

function findOpaqueBounds(source: Uint8ClampedArray, width: number) {
  let left = width, right = -1, top = source.length / 4 / width, bottom = -1;
  for (let offset = 3; offset < source.length; offset += 4) {
    if (source[offset] === 0) continue;
    const pixel = (offset - 3) / 4, x = pixel % width, y = Math.floor(pixel / width);
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return right < 0 ? null : {left, right, top, bottom};
}

function nearOpaqueRange(value: number, minimum: number, maximum: number, radius: number, size: number, wrap: boolean) {
  const start = minimum - radius, end = maximum + radius;
  return (value >= start && value <= end) || (wrap && (
    (value - size >= start && value - size <= end) || (value + size >= start && value + size <= end)
  ));
}

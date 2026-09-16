import type {PixelDocument} from "./document";

export interface SpriteSheetImportOptions {
  frameWidth: number;
  frameHeight: number;
  offsetX?: number;
  offsetY?: number;
  paddingX?: number;
  paddingY?: number;
}

export interface PackedAtlasFrame {
  id: string;
  frame: {x: number; y: number; width: number; height: number};
  sourceSize: {width: number; height: number};
  spriteSourceSize: {x: number; y: number; width: number; height: number};
  durationMs: number;
}

export interface PackedAtlas {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  frames: PackedAtlasFrame[];
}

export function sliceSpriteSheet(
  pixels: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  options: SpriteSheetImportOptions,
) {
  assertPixelBuffer(pixels, imageWidth, imageHeight);
  const frameWidth = positiveInteger(options.frameWidth, "Frame width");
  const frameHeight = positiveInteger(options.frameHeight, "Frame height");
  const offsetX = nonNegativeInteger(options.offsetX ?? 0, "Offset X");
  const offsetY = nonNegativeInteger(options.offsetY ?? 0, "Offset Y");
  const paddingX = nonNegativeInteger(options.paddingX ?? 0, "Padding X");
  const paddingY = nonNegativeInteger(options.paddingY ?? 0, "Padding Y");
  const frames: Uint8ClampedArray[] = [];
  for (let y = offsetY; y + frameHeight <= imageHeight; y += frameHeight + paddingY) {
    for (let x = offsetX; x + frameWidth <= imageWidth; x += frameWidth + paddingX) {
      const frame = new Uint8ClampedArray(frameWidth * frameHeight * 4);
      for (let row = 0; row < frameHeight; row += 1) {
        const source = ((y + row) * imageWidth + x) * 4;
        frame.set(pixels.subarray(source, source + frameWidth * 4), row * frameWidth * 4);
      }
      frames.push(frame);
    }
  }
  if (frames.length === 0) throw new Error("Sprite sheet does not contain a complete frame");
  return {width: frameWidth, height: frameHeight, frames};
}

export function packAtlas(
  frames: readonly Uint8ClampedArray[],
  width: number,
  height: number,
  ids: readonly string[],
  durationsMs: readonly number[],
  padding = 1,
  maximumWidth = 2048,
): PackedAtlas {
  if (frames.length === 0 || frames.length !== ids.length || frames.length !== durationsMs.length) {
    throw new Error("Atlas frames and metadata must be non-empty and equal");
  }
  const gap = nonNegativeInteger(padding, "Atlas padding");
  const maxWidth = positiveInteger(maximumWidth, "Atlas maximum width");
  const trimmed = frames.map((pixels, index) => {
    assertPixelBuffer(pixels, width, height);
    const bounds = opaqueBounds(pixels, width, height) ?? {x: 0, y: 0, width: 1, height: 1};
    return {pixels, bounds, id: ids[index], durationMs: durationsMs[index]};
  });
  const estimatedWidth = Math.min(maxWidth, Math.max(
    ...trimmed.map((entry) => entry.bounds.width),
    Math.ceil(Math.sqrt(trimmed.reduce((sum, entry) => sum + (entry.bounds.width + gap) * (entry.bounds.height + gap), 0))),
  ));
  const placements: Array<{x: number; y: number}> = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let atlasWidth = 1;
  for (const entry of trimmed) {
    if (x > 0 && x + entry.bounds.width > estimatedWidth) {
      x = 0;
      y += rowHeight + gap;
      rowHeight = 0;
    }
    placements.push({x, y});
    atlasWidth = Math.max(atlasWidth, x + entry.bounds.width);
    rowHeight = Math.max(rowHeight, entry.bounds.height);
    x += entry.bounds.width + gap;
  }
  const atlasHeight = Math.max(1, y + rowHeight);
  const output = new Uint8ClampedArray(atlasWidth * atlasHeight * 4);
  const metadata = trimmed.map((entry, index): PackedAtlasFrame => {
    const placement = placements[index];
    for (let row = 0; row < entry.bounds.height; row += 1) {
      const source = ((entry.bounds.y + row) * width + entry.bounds.x) * 4;
      const target = ((placement.y + row) * atlasWidth + placement.x) * 4;
      output.set(entry.pixels.subarray(source, source + entry.bounds.width * 4), target);
    }
    return {
      id: entry.id,
      frame: {...placement, width: entry.bounds.width, height: entry.bounds.height},
      sourceSize: {width, height},
      spriteSourceSize: entry.bounds,
      durationMs: Math.max(1, Math.round(entry.durationMs)),
    };
  });
  return {width: atlasWidth, height: atlasHeight, pixels: output, frames: metadata};
}

export function exportSliceMetadata(document: PixelDocument, frameIds = document.frames.map((frame) => frame.id)) {
  const included = new Set(frameIds);
  return {
    format: "pixtorio-slices-v1",
    canvas: {width: document.width, height: document.height},
    frames: document.frames
      .filter((frame) => included.has(frame.id))
      .map((frame, index) => ({id: frame.id, index, durationMs: frame.durationMs})),
    tags: document.tags.filter((tag) => included.has(tag.fromFrameId) || included.has(tag.toFrameId)),
    slices: document.slices.map((slice) => ({
      id: slice.id,
      name: slice.name,
      color: slice.color,
      keys: slice.keys.filter((key) => included.has(key.frameId)).map((key) => ({...key})),
    })).filter((slice) => slice.keys.length > 0),
  };
}

function opaqueBounds(pixels: Uint8ClampedArray, width: number, height: number) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < left ? null : {x: left, y: top, width: right - left + 1, height: bottom - top + 1};
}

function assertPixelBuffer(pixels: Uint8ClampedArray, width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || pixels.length !== width * height * 4) {
    throw new Error("Invalid RGBA pixel buffer");
  }
}

function positiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
  return value;
}

function nonNegativeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  return value;
}

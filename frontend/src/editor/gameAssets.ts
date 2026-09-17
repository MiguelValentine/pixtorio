import type {PixelDocument} from "./document";
import {normalizePixelAspectRatio} from "./pixelAspectRatio";

export type SpriteSheetImportLayout = "horizontal" | "vertical" | "matrix";
export type SpriteSheetLayout = "horizontal" | "vertical" | "grid";

export const MAX_PNG_IMPORT_DIMENSION = 2048;
export const MAX_EXPORT_DIMENSION = 16384;

export interface SpriteSheetImportOptions {
  frameWidth: number;
  frameHeight: number;
  layout?: SpriteSheetImportLayout;
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

export interface SpriteSheetFrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpriteSheetLayoutOptions {
  layout: SpriteSheetLayout;
  columns?: number;
  scale?: number;
  borderPadding?: number;
  framePadding?: number;
}

export interface SpriteSheetRaster {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  frames: SpriteSheetFrameRect[];
}

export interface AssetMetadataOptions {
  applyPixelRatio?: boolean;
}

export function validPNGImportDimensions(width: number, height: number) {
  return Number.isInteger(width) && Number.isInteger(height)
    && width > 0 && height > 0
    && width <= MAX_PNG_IMPORT_DIMENSION && height <= MAX_PNG_IMPORT_DIMENSION;
}

export function validAtlasOutputDimensions(width: number, height: number) {
  return Number.isSafeInteger(width) && Number.isSafeInteger(height)
    && width > 0 && height > 0
    && width <= MAX_EXPORT_DIMENSION && height <= MAX_EXPORT_DIMENSION;
}

export function calculateSpriteSheetLayout(
  width: number,
  height: number,
  frameCount: number,
  options: SpriteSheetLayoutOptions,
): {width: number; height: number; frames: SpriteSheetFrameRect[]} {
  const sourceWidth = positiveInteger(width, "Sprite sheet width");
  const sourceHeight = positiveInteger(height, "Sprite sheet height");
  const count = positiveInteger(frameCount, "Sprite sheet frame count");
  if (options.layout !== "horizontal" && options.layout !== "vertical" && options.layout !== "grid") {
    throw new Error(`unsupported sprite sheet layout ${String(options.layout)}`);
  }
  const scale = options.scale === undefined || options.scale === 0 ? 1 : positiveInteger(options.scale, "Sprite sheet scale");
  if (scale > 8) throw new Error("Sprite sheet scale exceeds 8");
  const borderPadding = nonNegativeInteger(options.borderPadding ?? 0, "Sprite sheet border padding");
  const framePadding = nonNegativeInteger(options.framePadding ?? 0, "Sprite sheet frame padding");
  const columns = options.layout === "vertical"
    ? 1
    : options.layout === "horizontal"
      ? count
      : options.columns === undefined || options.columns === 0
        ? count
        : positiveInteger(options.columns, "Sprite sheet columns");
  const rows = Math.ceil(count / columns);
  const frameWidth = sourceWidth * scale;
  const frameHeight = sourceHeight * scale;
  const outputWidth = borderPadding * 2 + columns * frameWidth + Math.max(0, columns - 1) * framePadding;
  const outputHeight = borderPadding * 2 + rows * frameHeight + Math.max(0, rows - 1) * framePadding;
  if (!validAtlasOutputDimensions(outputWidth, outputHeight)) {
    throw new Error(`sprite sheet dimensions exceed ${MAX_EXPORT_DIMENSION} pixels`);
  }
  const frames = Array.from({length: count}, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      x: borderPadding + column * (frameWidth + framePadding),
      y: borderPadding + row * (frameHeight + framePadding),
      width: frameWidth,
      height: frameHeight,
    };
  });
  return {width: outputWidth, height: outputHeight, frames};
}

export function buildSpriteSheet(
  frames: readonly Uint8ClampedArray[],
  width: number,
  height: number,
  options: SpriteSheetLayoutOptions,
): SpriteSheetRaster {
  if (frames.length === 0) throw new Error("sprite sheet needs at least one frame");
  const layout = calculateSpriteSheetLayout(width, height, frames.length, options);
  const scale = options.scale === undefined || options.scale === 0 ? 1 : positiveInteger(options.scale, "Sprite sheet scale");
  const output = new Uint8ClampedArray(layout.width * layout.height * 4);
  for (const frame of frames) assertPixelBuffer(frame, width, height);
  for (let index = 0; index < frames.length; index += 1) {
    const source = frames[index];
    const targetRect = layout.frames[index];
    for (let sourceY = 0; sourceY < height; sourceY += 1) {
      for (let sourceX = 0; sourceX < width; sourceX += 1) {
        const sourceOffset = (sourceY * width + sourceX) * 4;
        const targetX = targetRect.x + sourceX * scale;
        const targetY = targetRect.y + sourceY * scale;
        for (let y = 0; y < scale; y += 1) {
          const rowOffset = ((targetY + y) * layout.width + targetX) * 4;
          for (let x = 0; x < scale; x += 1) {
            const targetOffset = rowOffset + x * 4;
            output.set(source.subarray(sourceOffset, sourceOffset + 4), targetOffset);
          }
        }
      }
    }
  }
  return {width: layout.width, height: layout.height, pixels: output, frames: layout.frames};
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
  const layout = options.layout ?? "matrix";
  if (layout !== "horizontal" && layout !== "vertical" && layout !== "matrix") {
    throw new Error("Sprite sheet layout must be horizontal, vertical or matrix");
  }
  const offsetX = nonNegativeInteger(options.offsetX ?? 0, "Offset X");
  const offsetY = nonNegativeInteger(options.offsetY ?? 0, "Offset Y");
  const paddingX = nonNegativeInteger(options.paddingX ?? 0, "Padding X");
  const paddingY = nonNegativeInteger(options.paddingY ?? 0, "Padding Y");
  const frames: Uint8ClampedArray[] = [];
  const xPositions = sheetPositions(offsetX, imageWidth, frameWidth, paddingX, layout === "vertical");
  const yPositions = sheetPositions(offsetY, imageHeight, frameHeight, paddingY, layout === "horizontal");
  for (const y of yPositions) {
    for (const x of xPositions) {
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

function sheetPositions(start: number, limit: number, frameSize: number, padding: number, single: boolean) {
  const positions: number[] = [];
  for (let position = start; position + frameSize <= limit; position += frameSize + padding) {
    positions.push(position);
    if (single) break;
  }
  return positions;
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
  if (!validAtlasOutputDimensions(atlasWidth, atlasHeight)) {
    throw new Error(`atlas dimensions exceed ${MAX_EXPORT_DIMENSION} pixels`);
  }
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

export function exportSliceMetadata(
  document: PixelDocument,
  frameIds = document.frames.map((frame) => frame.id),
  options: AssetMetadataOptions = {},
) {
  const included = new Set(frameIds);
  const applyPixelRatio = options.applyPixelRatio ?? false;
  const ratio = applyPixelRatio ? normalizePixelAspectRatio(document.pixelAspectRatio) : {width: 1, height: 1};
  return {
    format: "pixtorio-slices-v1",
    canvas: {width: document.width * ratio.width, height: document.height * ratio.height},
    sourceCanvas: {width: document.width, height: document.height},
    pixelAspectRatio: {...document.pixelAspectRatio},
    appliedPixelRatio: applyPixelRatio,
    frames: document.frames
      .filter((frame) => included.has(frame.id))
      .map((frame, index) => ({id: frame.id, index, durationMs: frame.durationMs})),
    tags: document.tags.filter((tag) => included.has(tag.fromFrameId) || included.has(tag.toFrameId)),
    layers: document.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      kind: layer.kind,
      parentId: layer.parentId,
      role: layer.role,
      visible: layer.visible,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      continuous: layer.continuous,
      alphaLock: layer.alphaLock,
      tilesetId: layer.tilesetId,
    })),
    slices: document.slices.map((slice) => ({
      id: slice.id,
      name: slice.name,
      color: slice.color,
      keys: slice.keys.filter((key) => included.has(key.frameId)).map((key) => ({
        ...key,
        x: key.x * ratio.width,
        y: key.y * ratio.height,
        width: key.width * ratio.width,
        height: key.height * ratio.height,
        center: key.center ? {
          x: key.center.x * ratio.width,
          y: key.center.y * ratio.height,
          width: key.center.width * ratio.width,
          height: key.center.height * ratio.height,
        } : undefined,
        pivot: key.pivot ? {
          x: key.pivot.x * ratio.width,
          y: key.pivot.y * ratio.height,
        } : undefined,
      })),
    })).filter((slice) => slice.keys.length > 0),
  };
}

export function exportAtlasMetadata(
  document: PixelDocument,
  frameIds: readonly string[],
  atlas: Pick<PackedAtlas, "width" | "height" | "frames">,
  image: string,
  options: AssetMetadataOptions = {},
) {
  return {
    ...exportSliceMetadata(document, [...frameIds], options),
    format: "pixtorio-atlas-v1",
    image,
    width: atlas.width,
    height: atlas.height,
    frames: atlas.frames,
  };
}

export function exportSpriteSheetMetadata(
  document: PixelDocument,
  frameIds: readonly string[],
  sheet: Pick<SpriteSheetRaster, "width" | "height" | "frames">,
  image: string,
  options: AssetMetadataOptions = {},
) {
  const base = exportSliceMetadata(document, [...frameIds], options);
  const ratio = options.applyPixelRatio ? normalizePixelAspectRatio(document.pixelAspectRatio) : {width: 1, height: 1};
  const sourceSize = {width: document.width * ratio.width, height: document.height * ratio.height};
  return {
    ...base,
    format: "pixtorio-atlas-v1",
    image,
    width: sheet.width,
    height: sheet.height,
    sheetWidth: sheet.width,
    sheetHeight: sheet.height,
    frameWidth: sheet.frames[0]?.width ?? 0,
    frameHeight: sheet.frames[0]?.height ?? 0,
    frames: sheet.frames.map((frame, index) => ({
      id: frameIds[index],
      frame: {...frame},
      sourceSize: {...sourceSize},
      spriteSourceSize: {x: 0, y: 0, ...sourceSize},
      durationMs: Math.max(1, Math.round(document.frames.find((candidate) => candidate.id === frameIds[index])?.durationMs ?? 100)),
    })),
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

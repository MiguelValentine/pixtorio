import {
  cropDocument,
  rebuildTilemapData,
  type Cel,
  type Guide,
  type PixelDocument,
  type SliceKey,
} from "./document";

export type DocumentRotation = "cw" | "ccw" | "180";
export type DocumentFlipAxis = "horizontal" | "vertical";

export interface ContentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Rect extends ContentBounds {}

interface RasterOperation {
  readonly width: number;
  readonly height: number;
  readonly outputWidth: number;
  readonly outputHeight: number;
  mapRect(rect: Rect): Rect;
  mapPoint(x: number, y: number): {x: number; y: number};
  mapBoundaryPoint(x: number, y: number): {x: number; y: number};
  mapPixels(source: Uint8ClampedArray, sourceWidth: number, sourceHeight: number): Uint8ClampedArray;
  mapIndexes(source: Uint8Array, sourceWidth: number, sourceHeight: number): Uint8Array;
}

/** Rotates all document content and document-space metadata using nearest neighbors. */
export function rotateDocument(document: PixelDocument, rotation: DocumentRotation): boolean {
  if (rotation !== "cw" && rotation !== "ccw" && rotation !== "180") return false;
  const operation = createRasterOperation(document.width, document.height, rotation);
  transformDocumentRaster(document, operation);
  transformMetadata(document, operation, true);
  document.width = operation.outputWidth;
  document.height = operation.outputHeight;
  if (rotation !== "180") {
    [document.pixelAspectRatio.width, document.pixelAspectRatio.height] = [
      document.pixelAspectRatio.height,
      document.pixelAspectRatio.width,
    ];
  }
  rebuildTilemapData(document);
  return true;
}

/** Mirrors all document content and document-space metadata around one axis. */
export function flipDocument(document: PixelDocument, axis: DocumentFlipAxis): boolean {
  if (axis !== "horizontal" && axis !== "vertical") return false;
  const operation = createRasterOperation(document.width, document.height, axis);
  transformDocumentRaster(document, operation);
  transformMetadata(document, operation, false);
  rebuildTilemapData(document);
  return true;
}

/** Finds the smallest canvas-space rectangle containing non-transparent content. */
export function findContentBounds(document: PixelDocument): ContentBounds | null {
  let left = document.width;
  let top = document.height;
  let right = 0;
  let bottom = 0;
  let found = false;
  const transparentIndex = document.palette.transparentIndex;
  for (const cel of Object.values(document.cels)) {
    for (let sourceY = 0; sourceY < cel.height; sourceY += 1) {
      const canvasY = cel.y + sourceY;
      if (canvasY < 0 || canvasY >= document.height) continue;
      for (let sourceX = 0; sourceX < cel.width; sourceX += 1) {
        const canvasX = cel.x + sourceX;
        if (canvasX < 0 || canvasX >= document.width) continue;
        const sourcePixel = sourceY * cel.width + sourceX;
        const opaque = cel.indexes
          ? cel.indexes[sourcePixel] !== transparentIndex
          : cel.pixels[sourcePixel * 4 + 3] !== 0;
        if (!opaque) continue;
        found = true;
        left = Math.min(left, canvasX);
        top = Math.min(top, canvasY);
        right = Math.max(right, canvasX + 1);
        bottom = Math.max(bottom, canvasY + 1);
      }
    }
  }
  return found ? {x: left, y: top, width: right - left, height: bottom - top} : null;
}

/** Crops away transparent margins around every frame and layer. */
export function trimDocument(document: PixelDocument): boolean {
  const bounds = findContentBounds(document);
  if (!bounds || (bounds.x === 0 && bounds.y === 0 && bounds.width === document.width && bounds.height === document.height)) {
    return false;
  }
  return cropDocument(document, bounds.x, bounds.y, bounds.width, bounds.height);
}

/**
 * Resizes the actual sprite content to a new canvas size. Every destination
 * pixel samples one source pixel, preserving hard pixel edges and indexed
 * palette indexes. This is distinct from resizeDocument, which only changes
 * the canvas and never scales the content.
 */
export function resizeSpriteContent(document: PixelDocument, width: number, height: number): boolean {
  if (!validDimension(width) || !validDimension(height)) return false;
  if (width === document.width && height === document.height) return false;
  const operation = createScaleOperation(document.width, document.height, width, height, document.palette.transparentIndex);
  transformDocumentRaster(document, operation);
  transformMetadata(document, operation, false);
  document.width = width;
  document.height = height;
  rebuildTilemapData(document);
  return true;
}

/** Alias used by callers that expose the operation as Sprite > Sprite Size. */
export const resizeSprite = resizeSpriteContent;

/** Alias for callers that use the canvas terminology for the same operation. */
export const flipCanvas = flipDocument;

function transformDocumentRaster(document: PixelDocument, operation: RasterOperation) {
  const groups = new Map<string, Cel[]>();
  for (const cel of Object.values(document.cels)) {
    const group = groups.get(cel.linkId) ?? [];
    group.push(cel);
    groups.set(cel.linkId, group);
  }

  for (const [linkId, linkedCels] of groups) {
    // A valid linked group shares geometry. If malformed or imported data has
    // mixed geometry, split only the incompatible subsets instead of creating
    // a link whose pixels no longer match its Cel dimensions.
    const partitions = new Map<string, Cel[]>();
    for (const cel of linkedCels) {
      const key = `${cel.x}:${cel.y}:${cel.width}:${cel.height}`;
      const partition = partitions.get(key) ?? [];
      partition.push(cel);
      partitions.set(key, partition);
    }
    let partitionIndex = 0;
    for (const partition of partitions.values()) {
      const source = partition[0];
      const nextRect = operation.mapRect({x: source.x, y: source.y, width: source.width, height: source.height});
      const nextPixels = operation.mapPixels(source.pixels, source.width, source.height);
      const nextIndexes = source.indexes
        ? operation.mapIndexes(source.indexes, source.width, source.height)
        : undefined;
      const nextLinkId = partitionIndex === 0 ? linkId : createTransformLinkID(linkId);
      for (const cel of partition) {
        cel.linkId = nextLinkId;
        cel.x = nextRect.x;
        cel.y = nextRect.y;
        cel.width = nextRect.width;
        cel.height = nextRect.height;
        cel.pixels = nextPixels;
        cel.indexes = nextIndexes;
        // Tilemap cells are rebuilt from the transformed RGBA/index cache once
        // all document-space operations have completed.
        cel.tilemap = undefined;
      }
      partitionIndex += 1;
    }
  }
}

function transformMetadata(document: PixelDocument, operation: RasterOperation, rotateAspect: boolean) {
  const oldWidth = operation.width;
  const oldHeight = operation.height;
  const newWidth = operation.outputWidth;
  const newHeight = operation.outputHeight;

  document.guides = document.guides.map((guide) => transformGuide(guide, operation));
  document.slices = document.slices.map((slice) => ({
    ...slice,
    keys: slice.keys.map((key) => transformSliceKey(key, operation)),
  }));

  const settings = document.settings;
  const oldGridWidth = settings.gridWidth;
  const oldGridHeight = settings.gridHeight;
  const oldOffsetX = settings.gridOffsetX;
  const oldOffsetY = settings.gridOffsetY;
  const oldSymmetryX = settings.symmetryAxisX;
  const oldSymmetryY = settings.symmetryAxisY;
  if (rotateAspect) {
    settings.gridWidth = oldGridHeight;
    settings.gridHeight = oldGridWidth;
  }
  const transformedOffset = operation.mapBoundaryPoint(oldOffsetX, oldOffsetY);
  settings.gridOffsetX = normalizeGridOffset(transformedOffset.x, settings.gridWidth);
  settings.gridOffsetY = normalizeGridOffset(transformedOffset.y, settings.gridHeight);
  const transformedSymmetry = operation.mapBoundaryPoint(oldSymmetryX, oldSymmetryY);
  settings.symmetryAxisX = clamp(transformedSymmetry.x, 0, newWidth);
  settings.symmetryAxisY = clamp(transformedSymmetry.y, 0, newHeight);

  // Keep the dimensions in scope to make the coordinate convention explicit;
  // this also prevents future metadata additions from accidentally using the
  // already-mutated document dimensions during a quarter-turn.
  void oldWidth;
  void oldHeight;
}

function transformSliceKey(key: SliceKey, operation: RasterOperation): SliceKey {
  return {
    ...key,
    ...operation.mapRect({x: key.x, y: key.y, width: key.width, height: key.height}),
    center: key.center
      ? operation.mapRect(key.center)
      : undefined,
    pivot: key.pivot
      ? operation.mapPoint(key.pivot.x, key.pivot.y)
      : undefined,
  };
}

function transformGuide(guide: Guide, operation: RasterOperation): Guide {
  const position = guide.axis === "vertical"
    ? operation.mapBoundaryPoint(guide.position, 0)
    : operation.mapBoundaryPoint(0, guide.position);
  // A transformed axis is determined by which coordinate changes. Mapping a
  // second point avoids special-casing each operation and handles quarter
  // turns consistently at the canvas boundary.
  const second = guide.axis === "vertical"
    ? operation.mapBoundaryPoint(guide.position, operation.height)
    : operation.mapBoundaryPoint(operation.width, guide.position);
  const axis = position.x === second.x ? "vertical" : "horizontal";
  return {
    ...guide,
    axis,
    position: clamp(axis === "vertical" ? position.x : position.y, 0, axis === "vertical" ? operation.outputWidth : operation.outputHeight),
  };
}

function createRasterOperation(width: number, height: number, operation: DocumentRotation | DocumentFlipAxis): RasterOperation {
  const outputWidth = operation === "cw" || operation === "ccw" ? height : width;
  const outputHeight = operation === "cw" || operation === "ccw" ? width : height;
  const mapRect = (rect: Rect): Rect => {
    switch (operation) {
      case "cw": return {x: height - (rect.y + rect.height), y: rect.x, width: rect.height, height: rect.width};
      case "ccw": return {x: rect.y, y: width - (rect.x + rect.width), width: rect.height, height: rect.width};
      case "180": return {x: width - (rect.x + rect.width), y: height - (rect.y + rect.height), width: rect.width, height: rect.height};
      case "horizontal": return {x: width - (rect.x + rect.width), y: rect.y, width: rect.width, height: rect.height};
      case "vertical": return {x: rect.x, y: height - (rect.y + rect.height), width: rect.width, height: rect.height};
    }
  };
  const mapPoint = (x: number, y: number) => {
    switch (operation) {
      case "cw": return {x: height - 1 - y, y: x};
      case "ccw": return {x: y, y: width - 1 - x};
      case "180": return {x: width - 1 - x, y: height - 1 - y};
      case "horizontal": return {x: width - 1 - x, y};
      case "vertical": return {x, y: height - 1 - y};
    }
  };
  const mapBoundaryPoint = (x: number, y: number) => {
    switch (operation) {
      case "cw": return {x: height - y, y: x};
      case "ccw": return {x: y, y: width - x};
      case "180": return {x: width - x, y: height - y};
      case "horizontal": return {x: width - x, y};
      case "vertical": return {x, y: height - y};
    }
  };
  const mapPixels = (source: Uint8ClampedArray, sourceWidth: number, sourceHeight: number) => {
    const targetWidth = operation === "cw" || operation === "ccw" ? sourceHeight : sourceWidth;
    const targetHeight = operation === "cw" || operation === "ccw" ? sourceWidth : sourceHeight;
    const output = new Uint8ClampedArray(targetWidth * targetHeight * 4);
    for (let y = 0; y < targetHeight; y += 1) {
      for (let x = 0; x < targetWidth; x += 1) {
        const sourcePoint = mapLocalPoint(operation, sourceWidth, sourceHeight, x, y);
        const sourceOffset = (sourcePoint.y * sourceWidth + sourcePoint.x) * 4;
        const targetOffset = (y * targetWidth + x) * 4;
        output.set(source.subarray(sourceOffset, sourceOffset + 4), targetOffset);
      }
    }
    return output;
  };
  const mapIndexes = (source: Uint8Array, sourceWidth: number, sourceHeight: number) => {
    const targetWidth = operation === "cw" || operation === "ccw" ? sourceHeight : sourceWidth;
    const targetHeight = operation === "cw" || operation === "ccw" ? sourceWidth : sourceHeight;
    const output = new Uint8Array(targetWidth * targetHeight);
    for (let y = 0; y < targetHeight; y += 1) {
      for (let x = 0; x < targetWidth; x += 1) {
        const sourcePoint = mapLocalPoint(operation, sourceWidth, sourceHeight, x, y);
        output[y * targetWidth + x] = source[sourcePoint.y * sourceWidth + sourcePoint.x];
      }
    }
    return output;
  };
  return {width, height, outputWidth, outputHeight, mapRect, mapPoint, mapBoundaryPoint, mapPixels, mapIndexes};
}

function createScaleOperation(width: number, height: number, outputWidth: number, outputHeight: number, transparentIndex: number): RasterOperation {
  const mapRect = (rect: Rect): Rect => {
    const left = Math.floor(rect.x * outputWidth / width);
    const top = Math.floor(rect.y * outputHeight / height);
    const right = Math.ceil((rect.x + rect.width) * outputWidth / width);
    const bottom = Math.ceil((rect.y + rect.height) * outputHeight / height);
    return {x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top)};
  };
  const mapPoint = (x: number, y: number) => ({
    x: clamp(Math.floor(x * outputWidth / width), 0, Math.max(0, outputWidth - 1)),
    y: clamp(Math.floor(y * outputHeight / height), 0, Math.max(0, outputHeight - 1)),
  });
  const mapBoundaryPoint = (x: number, y: number) => ({
    x: clamp(Math.round(x * outputWidth / width), 0, outputWidth),
    y: clamp(Math.round(y * outputHeight / height), 0, outputHeight),
  });
  const mapPixels = (source: Uint8ClampedArray, sourceWidth: number, sourceHeight: number) => {
    const sourceRect = currentSourceRect;
    const targetRect = mapRect(sourceRect);
    const output = new Uint8ClampedArray(targetRect.width * targetRect.height * 4);
    for (let targetY = 0; targetY < targetRect.height; targetY += 1) {
      const canvasY = targetRect.y + targetY;
      const sourceCanvasY = clamp(Math.floor(canvasY * height / outputHeight), 0, height - 1);
      const sourceY = sourceCanvasY - sourceRect.y;
      if (sourceY < 0 || sourceY >= sourceHeight) continue;
      for (let targetX = 0; targetX < targetRect.width; targetX += 1) {
        const canvasX = targetRect.x + targetX;
        const sourceCanvasX = clamp(Math.floor(canvasX * width / outputWidth), 0, width - 1);
        const sourceX = sourceCanvasX - sourceRect.x;
        if (sourceX < 0 || sourceX >= sourceWidth) continue;
        const sourceOffset = (sourceY * sourceWidth + sourceX) * 4;
        output.set(source.subarray(sourceOffset, sourceOffset + 4), (targetY * targetRect.width + targetX) * 4);
      }
    }
    return output;
  };
  const mapIndexes = (source: Uint8Array, sourceWidth: number, sourceHeight: number) => {
    const sourceRect = currentSourceRect;
    const targetRect = mapRect(sourceRect);
    const output = new Uint8Array(targetRect.width * targetRect.height).fill(transparentIndex);
    for (let targetY = 0; targetY < targetRect.height; targetY += 1) {
      const canvasY = targetRect.y + targetY;
      const sourceCanvasY = clamp(Math.floor(canvasY * height / outputHeight), 0, height - 1);
      const sourceY = sourceCanvasY - sourceRect.y;
      if (sourceY < 0 || sourceY >= sourceHeight) continue;
      for (let targetX = 0; targetX < targetRect.width; targetX += 1) {
        const canvasX = targetRect.x + targetX;
        const sourceCanvasX = clamp(Math.floor(canvasX * width / outputWidth), 0, width - 1);
        const sourceX = sourceCanvasX - sourceRect.x;
        if (sourceX < 0 || sourceX >= sourceWidth) continue;
        output[targetY * targetRect.width + targetX] = source[sourceY * sourceWidth + sourceX];
      }
    }
    return output;
  };

  // mapPixels/mapIndexes are called immediately after mapRect for a Cel. The
  // source rectangle is passed through this short-lived slot to keep the
  // RasterOperation interface shared with rotation/flip operations.
  let currentSourceRect: Rect = {x: 0, y: 0, width, height};
  const operation: RasterOperation = {
    width,
    height,
    outputWidth,
    outputHeight,
    mapRect(rect) {
      currentSourceRect = rect;
      return mapRect(rect);
    },
    mapPoint,
    mapBoundaryPoint,
    mapPixels,
    mapIndexes,
  };
  return operation;
}

function mapLocalPoint(
  operation: DocumentRotation | DocumentFlipAxis,
  sourceWidth: number,
  sourceHeight: number,
  targetX: number,
  targetY: number,
) {
  switch (operation) {
    case "cw": return {x: targetY, y: sourceHeight - 1 - targetX};
    case "ccw": return {x: sourceWidth - 1 - targetY, y: targetX};
    case "180": return {x: sourceWidth - 1 - targetX, y: sourceHeight - 1 - targetY};
    case "horizontal": return {x: sourceWidth - 1 - targetX, y: targetY};
    case "vertical": return {x: targetX, y: sourceHeight - 1 - targetY};
  }
}

function validDimension(value: number) {
  return Number.isInteger(value) && value > 0 && value <= 2048;
}

function normalizeGridOffset(value: number, gridSize: number) {
  if (!Number.isFinite(value) || gridSize <= 0) return 0;
  return ((Math.round(value) % gridSize) + gridSize) % gridSize;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function createTransformLinkID(source: string) {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${source}-document-transform-${suffix}`;
}

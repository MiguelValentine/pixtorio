import type {ColorTolerance, Selection, SelectionColor, SelectionConnectivity, SelectionPoint, SelectionPointLike, SelectionRasterOptions} from "./selectionTypes";

import {assertCanvasSize, assertPixelBuffer, clamp, neighborOffsets, selectionFromMask} from "./selectionMask";



export function selectionFromPoints(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  canvasWidth: number,
  canvasHeight: number,
): Selection | null {
  if (canvasWidth <= 0 || canvasHeight <= 0) return null;
  const left = clamp(Math.min(startX, endX), 0, canvasWidth - 1);
  const right = clamp(Math.max(startX, endX), 0, canvasWidth - 1);
  const top = clamp(Math.min(startY, endY), 0, canvasHeight - 1);
  const bottom = clamp(Math.max(startY, endY), 0, canvasHeight - 1);
  return {x: left, y: top, width: right - left + 1, height: bottom - top + 1};
}

/**
 * Rasterizes an ellipse inside the inclusive rectangle described by a drag.
 * Pixel centers use integer coordinates, matching selectionFromPoints and the
 * rest of the editor's canvas coordinate system.
 */
export function selectionFromEllipseBounds(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  canvasWidth: number,
  canvasHeight: number,
  options?: SelectionRasterOptions | boolean,
): Selection | null {
  assertCanvasSize(canvasWidth, canvasHeight);
  const bounds = integerDragBounds(startX, startY, endX, endY, canvasWidth, canvasHeight);
  if (!bounds) return null;

  const antialias = rasterAntialiasOptions(options);
  const mask = new Uint8Array(bounds.width * bounds.height);
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  const radiusX = Math.max(0.5, (bounds.right - bounds.left) / 2);
  const radiusY = Math.max(0.5, (bounds.bottom - bounds.top) / 2);
  for (let y = bounds.top; y <= bounds.bottom; y += 1) {
    for (let x = bounds.left; x <= bounds.right; x += 1) {
      const index = (y - bounds.top) * bounds.width + (x - bounds.left);
      if (!antialias) {
        const dx = (x - centerX) / radiusX;
        const dy = (y - centerY) / radiusY;
        if (dx * dx + dy * dy <= 1 + Number.EPSILON) mask[index] = 255;
        continue;
      }
      mask[index] = rasterCoverage(antialias.samples, (sampleX, sampleY) => {
        const dx = (sampleX - centerX) / radiusX;
        const dy = (sampleY - centerY) / radiusY;
        return dx * dx + dy * dy <= 1 + Number.EPSILON;
      }, x, y);
    }
  }
  return selectionFromMask(bounds.left, bounds.top, bounds.width, bounds.height, mask);
}

/** Supersampled ellipse selection helper for soft/antialiased selection edges. */
export function selectionFromEllipseBoundsAntialiased(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  canvasWidth: number,
  canvasHeight: number,
  samples = 4,
): Selection | null {
  return selectionFromEllipseBounds(startX, startY, endX, endY, canvasWidth, canvasHeight, {
    antialias: true,
    samples,
  });
}

export const ellipseSelection = selectionFromEllipseBounds;
export const selectionFromEllipse = selectionFromEllipseBounds;

/**
 * Rasterizes a closed polygon using an even-odd fill rule. The polygon is
 * implicitly closed, so lasso point lists do not need to repeat their first
 * point. Pixels on an edge are included.
 */
export function selectionFromPolygon(
  points: readonly SelectionPointLike[],
  canvasWidth: number,
  canvasHeight: number,
  options?: SelectionRasterOptions | boolean,
): Selection | null {
  assertCanvasSize(canvasWidth, canvasHeight);
  if (points.length < 3) return null;
  const normalized = points.map(toSelectionPoint);
  if (normalized.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;

  let minimumX = normalized[0].x;
  let maximumX = normalized[0].x;
  let minimumY = normalized[0].y;
  let maximumY = normalized[0].y;
  for (const point of normalized) {
    minimumX = Math.min(minimumX, point.x);
    maximumX = Math.max(maximumX, point.x);
    minimumY = Math.min(minimumY, point.y);
    maximumY = Math.max(maximumY, point.y);
  }
  minimumX = Math.max(0, Math.floor(minimumX));
  maximumX = Math.min(canvasWidth - 1, Math.ceil(maximumX));
  minimumY = Math.max(0, Math.floor(minimumY));
  maximumY = Math.min(canvasHeight - 1, Math.ceil(maximumY));
  if (maximumX < minimumX || maximumY < minimumY) return null;

  const width = maximumX - minimumX + 1;
  const height = maximumY - minimumY + 1;
  const antialias = rasterAntialiasOptions(options);
  const mask = new Uint8Array(width * height);
  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      const index = (y - minimumY) * width + (x - minimumX);
      if (!antialias) {
        if (pointInPolygonInclusive(x, y, normalized)) mask[index] = 255;
        continue;
      }
      mask[index] = rasterCoverage(antialias.samples, (sampleX, sampleY) => (
        pointInPolygonInclusive(sampleX, sampleY, normalized)
      ), x, y);
    }
  }
  return selectionFromMask(minimumX, minimumY, width, height, mask);
}

/** Supersampled polygon/lasso selection helper with 0..255 pixel coverage. */
export function selectionFromPolygonAntialiased(
  points: readonly SelectionPointLike[],
  canvasWidth: number,
  canvasHeight: number,
  samples = 4,
): Selection | null {
  return selectionFromPolygon(points, canvasWidth, canvasHeight, {antialias: true, samples});
}

export const polygonSelection = selectionFromPolygon;
export const lassoSelection = selectionFromPolygon;
export const selectionFromLasso = selectionFromPolygon;

/**
 * Selects the contiguous region containing (startX, startY) whose RGBA value
 * is within tolerance of the seed pixel. Four-way connectivity is the default
 * and can be changed to eight-way for diagonal regions.
 */
export function magicWandSelection(
  pixels: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  startX: number,
  startY: number,
  tolerance: ColorTolerance = 0,
  connectivity: SelectionConnectivity = 4,
): Selection | null {
  assertCanvasSize(canvasWidth, canvasHeight);
  assertPixelBuffer(pixels, canvasWidth, canvasHeight);
  const seedX = Math.floor(startX);
  const seedY = Math.floor(startY);
  if (seedX < 0 || seedY < 0 || seedX >= canvasWidth || seedY >= canvasHeight) return null;

  const seedIndex = (seedY * canvasWidth + seedX) * 4;
  const seed: SelectionColor = [pixels[seedIndex], pixels[seedIndex + 1], pixels[seedIndex + 2], pixels[seedIndex + 3]];
  const limits = normalizeColorTolerance(tolerance);
  const selected = new Uint8Array(canvasWidth * canvasHeight);
  const queued = new Uint8Array(canvasWidth * canvasHeight);
  const queue = new Int32Array(canvasWidth * canvasHeight);
  let head = 0;
  let tail = 0;
  const seedCell = seedY * canvasWidth + seedX;
  queue[tail++] = seedCell;
  queued[seedCell] = 1;
  while (head < tail) {
    const cell = queue[head++];
    const x = cell % canvasWidth;
    const y = Math.floor(cell / canvasWidth);
    const pixelIndex = cell * 4;
    if (!colorWithinTolerance(pixels, pixelIndex, seed, limits)) continue;
    selected[cell] = 255;
    for (const [offsetX, offsetY] of neighborOffsets(connectivity)) {
      const nextX = x + offsetX;
      const nextY = y + offsetY;
      if (nextX < 0 || nextY < 0 || nextX >= canvasWidth || nextY >= canvasHeight) continue;
      const nextCell = nextY * canvasWidth + nextX;
      if (queued[nextCell]) continue;
      queued[nextCell] = 1;
      queue[tail++] = nextCell;
    }
  }
  return selectionFromMask(0, 0, canvasWidth, canvasHeight, selected);
}

export const contiguousColorSelection = magicWandSelection;
export const magicWand = magicWandSelection;

/** Selects every pixel within RGBA tolerance of a color, without connectivity. */
export function selectByColor(
  pixels: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  color: SelectionColor,
  tolerance: ColorTolerance = 0,
): Selection | null {
  assertCanvasSize(canvasWidth, canvasHeight);
  assertPixelBuffer(pixels, canvasWidth, canvasHeight);
  const limits = normalizeColorTolerance(tolerance);
  const selected = new Uint8Array(canvasWidth * canvasHeight);
  for (let cell = 0; cell < selected.length; cell += 1) {
    if (colorWithinTolerance(pixels, cell * 4, color, limits)) selected[cell] = 255;
  }
  return selectionFromMask(0, 0, canvasWidth, canvasHeight, selected);
}

export const colorSelection = selectByColor;
export const selectAllByColor = selectByColor;

/** Selects all pixels whose alpha channel is at least minAlpha (default: > 0). */
export function selectOpaquePixels(
  pixels: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  minAlpha = 1,
): Selection | null {
  assertCanvasSize(canvasWidth, canvasHeight);
  assertPixelBuffer(pixels, canvasWidth, canvasHeight);
  if (!Number.isFinite(minAlpha)) throw new RangeError("Alpha threshold must be finite");
  const threshold = clamp(Math.floor(minAlpha), 0, 255);
  const selected = new Uint8Array(canvasWidth * canvasHeight);
  for (let cell = 0; cell < selected.length; cell += 1) {
    if (pixels[cell * 4 + 3] >= threshold) selected[cell] = 255;
  }
  return selectionFromMask(0, 0, canvasWidth, canvasHeight, selected);
}

export const opaqueSelection = selectOpaquePixels;
export const selectOpaque = selectOpaquePixels;



interface IntegerDragBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

function integerDragBounds(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  canvasWidth: number,
  canvasHeight: number,
): IntegerDragBounds | null {
  if (![startX, startY, endX, endY].every(Number.isFinite)) return null;
  const left = clamp(Math.floor(Math.min(startX, endX)), 0, canvasWidth - 1);
  const right = clamp(Math.floor(Math.max(startX, endX)), 0, canvasWidth - 1);
  const top = clamp(Math.floor(Math.min(startY, endY)), 0, canvasHeight - 1);
  const bottom = clamp(Math.floor(Math.max(startY, endY)), 0, canvasHeight - 1);
  return {left, top, right, bottom, width: right - left + 1, height: bottom - top + 1};
}

function rasterAntialiasOptions(options?: SelectionRasterOptions | boolean) {
  if (options === true) return {samples: 4};
  if (!options || !options.antialias) return null;
  const samples = options.samples ?? 4;
  if (!Number.isInteger(samples) || samples < 1 || samples > 32) {
    throw new RangeError("Antialias sample count must be an integer from 1 to 32");
  }
  return {samples};
}

function rasterCoverage(
  samples: number,
  inside: (x: number, y: number) => boolean,
  pixelX: number,
  pixelY: number,
) {
  let selected = 0;
  for (let sampleY = 0; sampleY < samples; sampleY += 1) {
    for (let sampleX = 0; sampleX < samples; sampleX += 1) {
      const x = pixelX + (sampleX + 0.5) / samples - 0.5;
      const y = pixelY + (sampleY + 0.5) / samples - 0.5;
      if (inside(x, y)) selected += 1;
    }
  }
  return Math.round(selected * 255 / (samples * samples));
}

function toSelectionPoint(point: SelectionPointLike): SelectionPoint {
  if (Array.isArray(point)) return {x: point[0], y: point[1]};
  const objectPoint = point as SelectionPoint;
  return {x: objectPoint.x, y: objectPoint.y};
}

function pointInPolygonInclusive(x: number, y: number, points: readonly SelectionPoint[]) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const current = points[index];
    const prior = points[previous];
    if (pointOnSegment(x, y, prior, current)) return true;
    const crossesScanline = (current.y > y) !== (prior.y > y);
    if (crossesScanline) {
      const intersectionX = (prior.x - current.x) * (y - current.y) / (prior.y - current.y) + current.x;
      if (x < intersectionX) inside = !inside;
    }
  }
  return inside;
}

function pointOnSegment(x: number, y: number, start: SelectionPoint, end: SelectionPoint) {
  const cross = (x - start.x) * (end.y - start.y) - (y - start.y) * (end.x - start.x);
  if (Math.abs(cross) > 1e-9) return false;
  return x >= Math.min(start.x, end.x) - 1e-9
    && x <= Math.max(start.x, end.x) + 1e-9
    && y >= Math.min(start.y, end.y) - 1e-9
    && y <= Math.max(start.y, end.y) + 1e-9;
}

function normalizeColorTolerance(tolerance: ColorTolerance): [number, number, number, number] {
  if (typeof tolerance === "number") {
    if (!Number.isFinite(tolerance) || tolerance < 0) throw new RangeError("Color tolerance must be a non-negative number");
    return [tolerance, tolerance, tolerance, tolerance];
  }
  if (tolerance.length !== 4 || tolerance.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new RangeError("Color tolerance must contain four non-negative numbers");
  }
  return [tolerance[0], tolerance[1], tolerance[2], tolerance[3]];
}

function colorWithinTolerance(
  pixels: Uint8ClampedArray,
  pixelIndex: number,
  color: SelectionColor,
  tolerance: readonly [number, number, number, number],
) {
  return Math.abs(pixels[pixelIndex] - color[0]) <= tolerance[0]
    && Math.abs(pixels[pixelIndex + 1] - color[1]) <= tolerance[1]
    && Math.abs(pixels[pixelIndex + 2] - color[2]) <= tolerance[2]
    && Math.abs(pixels[pixelIndex + 3] - color[3]) <= tolerance[3];
}

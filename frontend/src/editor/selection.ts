export type SelectionMask = Uint8Array | Uint8ClampedArray;

export type SelectionOperation = "replace" | "add" | "subtract" | "intersect";

export type TransformAxis = "horizontal" | "vertical";

export type RotationDirection = "clockwise" | "counterclockwise";

export interface Selection {
  x: number;
  y: number;
  width: number;
  height: number;
  /** A row-major 0..255 coverage mask relative to the selection bounds. */
  mask?: SelectionMask;
}

export interface PixelClipboard {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  /** Optional row-major 0..255 coverage mask relative to the clipboard bounds. */
  mask?: SelectionMask;
}

export interface PixelBuffer {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export interface PixelDirtyBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A point expressed in canvas pixel coordinates. */
export interface SelectionPoint {
  x: number;
  y: number;
}

/** Polygon callers may use objects or the compact [x, y] form. */
export type SelectionPointLike = SelectionPoint | readonly [number, number];

/** An RGBA color in the same byte order as a pixel buffer. */
export type SelectionColor = readonly [number, number, number, number];

/** A scalar applies to every channel; a tuple allows channel-specific limits. */
export type ColorTolerance = number | readonly [number, number, number, number];

export type SelectionConnectivity = 4 | 8;

export type BorderSelectionMode = "inside" | "outside";

export interface SelectionRasterOptions {
  /** Supersample pixel coverage instead of using a binary pixel-center test. */
  antialias?: boolean;
  /** Number of samples per axis for antialiasing. Defaults to 4. */
  samples?: number;
}

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

/** Returns the complement of a selection within the canvas bounds. */
export function invertSelection(
  selection: Selection | null,
  canvasWidth: number,
  canvasHeight: number,
): Selection | null {
  assertCanvasSize(canvasWidth, canvasHeight);
  const selected = new Uint8Array(canvasWidth * canvasHeight).fill(255);
  if (selection) {
    for (let y = 0; y < canvasHeight; y += 1) {
      for (let x = 0; x < canvasWidth; x += 1) {
        selected[y * canvasWidth + x] = 255 - selectionCoverageAt(selection, x, y);
      }
    }
  }
  return selectionFromMask(0, 0, canvasWidth, canvasHeight, selected);
}

/** Expands a selection by a Chebyshev (eight-way) radius, clipped to canvas. */
export function growSelection(
  selection: Selection | null,
  amount: number,
  canvasWidth: number,
  canvasHeight: number,
  connectivity: SelectionConnectivity = 8,
): Selection | null {
  return morphSelection(selection, amount, canvasWidth, canvasHeight, "grow", connectivity);
}

/** Contracts a selection by a Chebyshev (eight-way) radius, clipped to canvas. */
export function shrinkSelection(
  selection: Selection | null,
  amount: number,
  canvasWidth: number,
  canvasHeight: number,
  connectivity: SelectionConnectivity = 8,
): Selection | null {
  return morphSelection(selection, amount, canvasWidth, canvasHeight, "shrink", connectivity);
}

export const expandSelection = growSelection;

/**
 * Creates an inward border by default. The optional outside mode is useful for
 * callers that want a ring immediately outside the current selection.
 */
export function borderSelection(
  selection: Selection | null,
  thickness: number,
  canvasWidth: number,
  canvasHeight: number,
  mode: BorderSelectionMode = "inside",
  connectivity: SelectionConnectivity = 8,
): Selection | null {
  assertCanvasSize(canvasWidth, canvasHeight);
  const radius = normalizedRadius(thickness);
  if (!selection) return null;
  if (mode === "inside") {
    return subtractSelectionsForCanvas(selection, shrinkSelection(selection, radius, canvasWidth, canvasHeight, connectivity), canvasWidth, canvasHeight);
  }
  return subtractSelectionsForCanvas(growSelection(selection, radius, canvasWidth, canvasHeight, connectivity), selection, canvasWidth, canvasHeight);
}

/**
 * Softens a selection edge by the requested pixel radius. The returned mask
 * uses the same 0..255 coverage convention as every other selection helper.
 */
export function featherSelection(
  selection: Selection | null,
  radius: number,
  canvasWidth: number,
  canvasHeight: number,
): Selection | null {
  assertCanvasSize(canvasWidth, canvasHeight);
  if (!Number.isFinite(radius) || radius < 0) throw new RangeError("Feather radius must be a non-negative number");
  if (!selection) return null;
  if (radius === 0) return clipSelection(cloneSelection(selection), canvasWidth, canvasHeight);

  const source = selectionMaskOnCanvas(selection, canvasWidth, canvasHeight);
  const sourceBounds = findMaskBounds(source, canvasWidth, canvasHeight);
  if (!sourceBounds) return null;
  const distance = Math.ceil(radius);
  const left = Math.max(0, sourceBounds.left - distance);
  const top = Math.max(0, sourceBounds.top - distance);
  const right = Math.min(canvasWidth, sourceBounds.right + distance + 1);
  const bottom = Math.min(canvasHeight, sourceBounds.bottom + distance + 1);
  const width = right - left;
  const height = bottom - top;
  const output = new Uint8Array(width * height);

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const sourceCoverage = source[y * canvasWidth + x];
      if (sourceCoverage > 0) {
        const nearestEmpty = nearestCoverageDistance(source, canvasWidth, canvasHeight, x, y, 0, distance + 1);
        const factor = nearestEmpty === Number.POSITIVE_INFINITY
          ? 1
          : clamp((nearestEmpty - 0.5) / radius, 0, 1);
        output[(y - top) * width + x - left] = Math.round(sourceCoverage * factor);
        continue;
      }
      const nearestSelected = nearestCoverageDistance(source, canvasWidth, canvasHeight, x, y, 1, distance + 1);
      if (nearestSelected === Number.POSITIVE_INFINITY || nearestSelected > radius + 0.5) continue;
      const neighborCoverage = nearestCoverageValue(source, canvasWidth, canvasHeight, x, y, distance + 1);
      const factor = clamp(1 - Math.max(0, nearestSelected - 0.5) / radius, 0, 1);
      output[(y - top) * width + x - left] = Math.round(neighborCoverage * factor);
    }
  }
  return selectionFromMask(left, top, width, height, output);
}

/** Creates a selection from a local 0..255 coverage mask and trims empty edges. */
export function selectionFromMask(
  x: number,
  y: number,
  width: number,
  height: number,
  mask: SelectionMask,
): Selection | null {
  assertSelectionDimensions(width, height);
  const source = normalizeMask(mask, width * height);
  const bounds = findMaskBounds(source, width, height);
  if (!bounds) return null;

  const croppedWidth = bounds.right - bounds.left + 1;
  const croppedHeight = bounds.bottom - bounds.top + 1;
  if (bounds.left === 0 && bounds.top === 0
    && croppedWidth === width && croppedHeight === height
    && isFullMask(source)) {
    return {x, y, width, height};
  }

  const cropped = cropMask(source, width, bounds.left, bounds.top, croppedWidth, croppedHeight);
  if (isFullMask(cropped)) return {x: x + bounds.left, y: y + bounds.top, width: croppedWidth, height: croppedHeight};
  return {
    x: x + bounds.left,
    y: y + bounds.top,
    width: croppedWidth,
    height: croppedHeight,
    mask: cropped,
  };
}

/** Returns a fresh 0..255 coverage mask. A rectangle without a mask is 255. */
export function maskForSelection(selection: Selection): Uint8Array {
  assertSelectionDimensions(selection.width, selection.height);
  const area = selection.width * selection.height;
  if (!hasUsableMask(selection)) return new Uint8Array(area).fill(255);
  return normalizeMask(selection.mask!, area);
}

export const selectionMask = maskForSelection;

export function cloneSelection(selection: Selection): Selection {
  const clone: Selection = {x: selection.x, y: selection.y, width: selection.width, height: selection.height};
  if (hasUsableMask(selection)) {
    const mask = normalizeMask(selection.mask!, selection.width * selection.height);
    if (!isFullMask(mask)) clone.mask = mask;
  }
  return clone;
}

/** Returns the 0..255 coverage at a canvas coordinate. */
export function selectionCoverageAt(selection: Selection, x: number, y: number): number {
  if (x < selection.x || y < selection.y
    || x >= selection.x + selection.width || y >= selection.y + selection.height) return 0;
  if (!hasUsableMask(selection)) return 255;
  const localX = Math.floor(x - selection.x);
  const localY = Math.floor(y - selection.y);
  return maskCoverageAt(selection.mask!, localY * selection.width + localX);
}

export const coverageAt = selectionCoverageAt;

export function containsPoint(selection: Selection, x: number, y: number) {
  return selectionCoverageAt(selection, x, y) > 0;
}

/** Combines two selections. The first argument is the current selection. */
export function combineSelections(
  current: Selection | null,
  next: Selection | null,
  operation: SelectionOperation,
): Selection | null {
  if (operation === "replace") return next ? cloneSelection(next) : null;
  if (operation === "add") {
    if (!current) return next ? cloneSelection(next) : null;
    if (!next) return cloneSelection(current);
  } else if (operation === "subtract") {
    if (!current || !next) return current ? cloneSelection(current) : null;
  } else if (operation === "intersect") {
    if (!current || !next) return null;
  } else {
    return null;
  }

  const left = operation === "intersect"
    ? Math.max(current!.x, next!.x)
    : operation === "add" ? Math.min(current!.x, next!.x) : current!.x;
  const top = operation === "intersect"
    ? Math.max(current!.y, next!.y)
    : operation === "add" ? Math.min(current!.y, next!.y) : current!.y;
  const right = operation === "intersect"
    ? Math.min(current!.x + current!.width, next!.x + next!.width)
    : operation === "add" ? Math.max(current!.x + current!.width, next!.x + next!.width) : current!.x + current!.width;
  const bottom = operation === "intersect"
    ? Math.min(current!.y + current!.height, next!.y + next!.height)
    : operation === "add" ? Math.max(current!.y + current!.height, next!.y + next!.height) : current!.y + current!.height;

  if (right <= left || bottom <= top) return null;
  const width = right - left;
  const height = bottom - top;
  const mask = new Uint8Array(width * height);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const pointX = left + column;
      const pointY = top + row;
      const currentCoverage = selectionCoverageAt(current!, pointX, pointY);
      const nextCoverage = selectionCoverageAt(next!, pointX, pointY);
      mask[row * width + column] = encodeCoverageForMask(operation === "add"
        ? Math.max(currentCoverage, nextCoverage)
        : operation === "subtract"
          ? coverageSubtract(currentCoverage, nextCoverage)
          : Math.min(currentCoverage, nextCoverage));
    }
  }
  return selectionFromMask(left, top, width, height, mask);
}

export const combineSelection = combineSelections;
export const applySelectionOperation = combineSelections;

export function replaceSelection(current: Selection | null, next: Selection | null) {
  return combineSelections(current, next, "replace");
}

export function addSelection(current: Selection | null, next: Selection | null) {
  return combineSelections(current, next, "add");
}

export function subtractSelection(current: Selection | null, next: Selection | null) {
  return combineSelections(current, next, "subtract");
}

export function intersectSelection(current: Selection | null, next: Selection | null) {
  return combineSelections(current, next, "intersect");
}

export function copySelection(pixels: Uint8ClampedArray, canvasWidth: number, selection: Selection): PixelClipboard {
  assertCanvasWidth(canvasWidth);
  assertSelectionDimensions(selection.width, selection.height);
  const output = new Uint8ClampedArray(selection.width * selection.height * 4);
  const canvasHeight = canvasHeightFor(pixels, canvasWidth);
  for (let row = 0; row < selection.height; row += 1) {
    const sourceY = selection.y + row;
    if (sourceY < 0 || sourceY >= canvasHeight) continue;
    for (let column = 0; column < selection.width; column += 1) {
      if (selectionCoverageAt(selection, selection.x + column, sourceY) <= 0) continue;
      const sourceX = selection.x + column;
      if (sourceX < 0 || sourceX >= canvasWidth) continue;
      const sourceIndex = (sourceY * canvasWidth + sourceX) * 4;
      const targetIndex = (row * selection.width + column) * 4;
      output.set(pixels.subarray(sourceIndex, sourceIndex + 4), targetIndex);
    }
  }
  const clipboard: PixelClipboard = {width: selection.width, height: selection.height, pixels: output};
  if (hasUsableMask(selection)) clipboard.mask = normalizeMask(selection.mask!, selection.width * selection.height);
  return clipboard;
}

export function clearSelection(
  pixels: Uint8ClampedArray,
  canvasWidth: number,
  selection: Selection,
  replacement: readonly [number, number, number, number] = [0, 0, 0, 0],
) {
  assertCanvasWidth(canvasWidth);
  const canvasHeight = canvasHeightFor(pixels, canvasWidth);
  for (let row = 0; row < selection.height; row += 1) {
    const pointY = selection.y + row;
    if (pointY < 0 || pointY >= canvasHeight) continue;
    for (let column = 0; column < selection.width; column += 1) {
      const pointX = selection.x + column;
      if (pointX < 0 || pointX >= canvasWidth) continue;
      const index = (pointY * canvasWidth + pointX) * 4;
      const coverage = selectionCoverageAt(selection, pointX, pointY);
      if (coverage <= 0) continue;
      if (coverage >= 255) {
        pixels.set(replacement, index);
        continue;
      }
      const amount = coverage / 255;
      for (let channel = 0; channel < 4; channel += 1) {
        pixels[index + channel] = Math.round(pixels[index + channel] + (replacement[channel] - pixels[index + channel]) * amount);
      }
    }
  }
}

/** Source-over fills every covered selection pixel with an RGBA color. */
export function fillSelection(
  pixels: Uint8ClampedArray,
  canvasWidth: number,
  selection: Selection,
  color: readonly [number, number, number, number],
) {
  assertCanvasWidth(canvasWidth);
  const canvasHeight = canvasHeightFor(pixels, canvasWidth);
  for (let row = 0; row < selection.height; row += 1) {
    const pointY = selection.y + row;
    if (pointY < 0 || pointY >= canvasHeight) continue;
    for (let column = 0; column < selection.width; column += 1) {
      const pointX = selection.x + column;
      if (pointX < 0 || pointX >= canvasWidth) continue;
      const coverage = selectionCoverageAt(selection, pointX, pointY) / 255;
      const sourceAlpha = color[3] / 255 * coverage;
      if (sourceAlpha <= 0) continue;
      const offset = (pointY * canvasWidth + pointX) * 4;
      const destinationAlpha = pixels[offset + 3] / 255;
      const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[offset + channel] = outputAlpha <= 0
          ? 0
          : Math.round((color[channel] * sourceAlpha + pixels[offset + channel] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
      }
      pixels[offset + 3] = Math.round(outputAlpha * 255);
    }
  }
}

/** Fills an inward border derived from the current selection. */
export function strokeSelection(
  pixels: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  selection: Selection,
  color: readonly [number, number, number, number],
  thickness = 1,
) {
  const border = borderSelection(selection, thickness, canvasWidth, canvasHeight);
  if (border) fillSelection(pixels, canvasWidth, border, color);
}

/** Circularly shifts an entire pixel buffer, wrapping at every canvas edge. */
export function shiftPixelsWrapped(
  pixels: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  deltaX: number,
  deltaY: number,
  selection?: Selection | null,
) {
  assertCanvasSize(canvasWidth, canvasHeight);
  assertPixelBuffer(pixels, canvasWidth, canvasHeight);
  const bounds = selection
    ? clipSelection(selection, canvasWidth, canvasHeight)
    : {x: 0, y: 0, width: canvasWidth, height: canvasHeight};
  if (!bounds) return;
  const shiftX = ((Math.round(deltaX) % bounds.width) + bounds.width) % bounds.width;
  const shiftY = ((Math.round(deltaY) % bounds.height) + bounds.height) % bounds.height;
  if (shiftX === 0 && shiftY === 0) return;
  const source = pixels.slice();
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const coverage = selection ? selectionCoverageAt(selection, x, y) : 255;
      if (coverage <= 0) continue;
      const sourceX = bounds.x + ((x - bounds.x - shiftX + bounds.width) % bounds.width);
      const sourceY = bounds.y + ((y - bounds.y - shiftY + bounds.height) % bounds.height);
      const sourceOffset = (sourceY * canvasWidth + sourceX) * 4;
      const targetOffset = (y * canvasWidth + x) * 4;
      if (coverage >= 255) {
        pixels.set(source.subarray(sourceOffset, sourceOffset + 4), targetOffset);
        continue;
      }
      const amount = coverage / 255;
      for (let channel = 0; channel < 4; channel += 1) {
        pixels[targetOffset + channel] = Math.round(
          source[targetOffset + channel] + (source[sourceOffset + channel] - source[targetOffset + channel]) * amount,
        );
      }
    }
  }
}

/**
 * Restores edits outside an active selection from the pre-gesture snapshot.
 *
 * Pixel tools can render a complete preview into the authoritative buffer, so
 * clipping after each preview keeps every non-selected pixel unchanged while
 * leaving selected pixels untouched. The optional dirty bounds limit the
 * scan to the area reported by the tool and are intersected with the canvas.
 */
export function clipPixelEditsToSelection(
  pixels: Uint8ClampedArray,
  before: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  selection: Selection | null,
  dirtyBounds?: PixelDirtyBounds,
): void {
  assertCanvasSize(canvasWidth, canvasHeight);
  assertPixelBuffer(pixels, canvasWidth, canvasHeight);
  assertPixelBuffer(before, canvasWidth, canvasHeight);
  if (!selection) return;

  const bounds = clippedDirtyBounds(dirtyBounds, canvasWidth, canvasHeight);
  if (!bounds) return;

  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const pixelIndex = (y * canvasWidth + x) * 4;
      const coverage = selectionCoverageAt(selection, x, y);
      if (coverage >= 255) continue;
      if (pixels[pixelIndex] === before[pixelIndex]
        && pixels[pixelIndex + 1] === before[pixelIndex + 1]
        && pixels[pixelIndex + 2] === before[pixelIndex + 2]
        && pixels[pixelIndex + 3] === before[pixelIndex + 3]) continue;
      if (coverage <= 0) {
        pixels.set(before.subarray(pixelIndex, pixelIndex + 4), pixelIndex);
        continue;
      }
      const amount = coverage / 255;
      for (let channel = 0; channel < 4; channel += 1) {
        pixels[pixelIndex + channel] = Math.round(
          before[pixelIndex + channel] + (pixels[pixelIndex + channel] - before[pixelIndex + channel]) * amount,
        );
      }
    }
  }
}

export function pasteClipboard(
  pixels: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  clipboard: PixelClipboard,
  destinationX: number,
  destinationY: number,
) {
  assertCanvasSize(canvasWidth, canvasHeight);
  assertSelectionDimensions(clipboard.width, clipboard.height);
  assertPixelBuffer(clipboard.pixels, clipboard.width, clipboard.height);
  for (let sourceY = 0; sourceY < clipboard.height; sourceY += 1) {
    const targetY = destinationY + sourceY;
    if (targetY < 0 || targetY >= canvasHeight) continue;
    for (let sourceX = 0; sourceX < clipboard.width; sourceX += 1) {
      const coverage = hasUsableClipboardMask(clipboard)
        ? maskCoverageAt(clipboard.mask!, sourceY * clipboard.width + sourceX)
        : 255;
      if (coverage <= 0) continue;
      const targetX = destinationX + sourceX;
      if (targetX < 0 || targetX >= canvasWidth) continue;
      const sourceIndex = (sourceY * clipboard.width + sourceX) * 4;
      const targetIndex = (targetY * canvasWidth + targetX) * 4;
      if (coverage >= 255) {
        pixels.set(clipboard.pixels.subarray(sourceIndex, sourceIndex + 4), targetIndex);
        continue;
      }
      const amount = coverage / 255;
      for (let channel = 0; channel < 4; channel += 1) {
        pixels[targetIndex + channel] = Math.round(
          pixels[targetIndex + channel] + (clipboard.pixels[sourceIndex + channel] - pixels[targetIndex + channel]) * amount,
        );
      }
    }
  }
}

export function moveSelection(
  pixels: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  selection: Selection,
  destinationX: number,
  destinationY: number,
  clearColor?: readonly [number, number, number, number],
) {
  const clipboard = copySelection(pixels, canvasWidth, selection);
  clearSelection(pixels, canvasWidth, selection, clearColor);
  pasteClipboard(pixels, canvasWidth, canvasHeight, clipboard, destinationX, destinationY);
  return clipSelection(translateSelection(selection, destinationX - selection.x, destinationY - selection.y), canvasWidth, canvasHeight);
}

export function translateSelection(selection: Selection, deltaX: number, deltaY: number): Selection {
  const translated: Selection = {
    x: selection.x + deltaX,
    y: selection.y + deltaY,
    width: selection.width,
    height: selection.height,
  };
  if (hasUsableMask(selection)) translated.mask = normalizeMask(selection.mask!, selection.width * selection.height);
  return translated;
}

export function clipSelection(selection: Selection, canvasWidth: number, canvasHeight: number): Selection | null {
  assertCanvasSize(canvasWidth, canvasHeight);
  const left = Math.max(0, selection.x);
  const top = Math.max(0, selection.y);
  const right = Math.min(canvasWidth, selection.x + selection.width);
  const bottom = Math.min(canvasHeight, selection.y + selection.height);
  if (right <= left || bottom <= top) return null;
  if (!hasUsableMask(selection)) {
    return {x: left, y: top, width: right - left, height: bottom - top};
  }

  const width = right - left;
  const height = bottom - top;
  const mask = new Uint8Array(width * height);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      mask[row * width + column] = encodeCoverageForMask(selectionCoverageAt(selection, left + column, top + row));
    }
  }
  return selectionFromMask(left, top, width, height, mask);
}

export function clippedSelection(
  x: number,
  y: number,
  width: number,
  height: number,
  canvasWidth: number,
  canvasHeight: number,
  mask?: SelectionMask,
): Selection | null {
  const selection: Selection = {x, y, width, height};
  if (mask) selection.mask = mask;
  return clipSelection(selection, canvasWidth, canvasHeight);
}

export function resizePixelsNearestNeighbor(
  pixels: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Uint8ClampedArray {
  assertSelectionDimensions(sourceWidth, sourceHeight);
  assertSelectionDimensions(targetWidth, targetHeight);
  assertPixelBuffer(pixels, sourceWidth, sourceHeight);
  const output = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  for (let targetY = 0; targetY < targetHeight; targetY += 1) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor(targetY * sourceHeight / targetHeight));
    for (let targetX = 0; targetX < targetWidth; targetX += 1) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor(targetX * sourceWidth / targetWidth));
      const sourceIndex = (sourceY * sourceWidth + sourceX) * 4;
      const targetIndex = (targetY * targetWidth + targetX) * 4;
      output.set(pixels.subarray(sourceIndex, sourceIndex + 4), targetIndex);
    }
  }
  return output;
}

export const resizePixelBuffer = resizePixelsNearestNeighbor;

export function resizeSelection(selection: Selection, width: number, height: number): Selection | null {
  assertSelectionDimensions(width, height);
  const resizedMask = resizeCoverageMask(maskForSelection(selection), selection.width, selection.height, width, height);
  return selectionFromMask(selection.x, selection.y, width, height, resizedMask);
}

export function resizeClipboard(clipboard: PixelClipboard, width: number, height: number): PixelClipboard {
  const resized: PixelClipboard = {
    width,
    height,
    pixels: resizePixelsNearestNeighbor(clipboard.pixels, clipboard.width, clipboard.height, width, height),
  };
  if (hasUsableClipboardMask(clipboard)) {
    resized.mask = resizeCoverageMask(normalizeMask(clipboard.mask!, clipboard.width * clipboard.height), clipboard.width, clipboard.height, width, height);
  }
  return resized;
}

export function flipPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  axis: TransformAxis,
): Uint8ClampedArray {
  assertSelectionDimensions(width, height);
  assertPixelBuffer(pixels, width, height);
  const output = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const targetX = axis === "horizontal" ? width - 1 - x : x;
      const targetY = axis === "vertical" ? height - 1 - y : y;
      const sourceIndex = (y * width + x) * 4;
      output.set(pixels.subarray(sourceIndex, sourceIndex + 4), (targetY * width + targetX) * 4);
    }
  }
  return output;
}

export const flipPixelBuffer = flipPixels;

export function flipSelection(selection: Selection, axis: TransformAxis): Selection {
  if (!hasUsableMask(selection)) return cloneSelection(selection);
  const source = normalizeMask(selection.mask!, selection.width * selection.height);
  const transformed = new Uint8Array(source.length);
  for (let y = 0; y < selection.height; y += 1) {
    for (let x = 0; x < selection.width; x += 1) {
      const targetX = axis === "horizontal" ? selection.width - 1 - x : x;
      const targetY = axis === "vertical" ? selection.height - 1 - y : y;
      transformed[targetY * selection.width + targetX] = source[y * selection.width + x];
    }
  }
  return selectionFromMask(selection.x, selection.y, selection.width, selection.height, transformed)!;
}

export const flipSelectionMask = flipSelection;

export function flipClipboard(clipboard: PixelClipboard, axis: TransformAxis): PixelClipboard {
  const flipped: PixelClipboard = {
    width: clipboard.width,
    height: clipboard.height,
    pixels: flipPixels(clipboard.pixels, clipboard.width, clipboard.height, axis),
  };
  if (hasUsableClipboardMask(clipboard)) {
    flipped.mask = flipMask(normalizeMask(clipboard.mask!, clipboard.width * clipboard.height), clipboard.width, clipboard.height, axis);
  }
  return flipped;
}

export function rotatePixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  direction: RotationDirection,
): PixelBuffer {
  assertSelectionDimensions(width, height);
  assertPixelBuffer(pixels, width, height);
  const outputWidth = height;
  const outputHeight = width;
  const output = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const targetX = direction === "clockwise" ? height - 1 - y : y;
      const targetY = direction === "clockwise" ? x : width - 1 - x;
      const sourceIndex = (y * width + x) * 4;
      output.set(pixels.subarray(sourceIndex, sourceIndex + 4), (targetY * outputWidth + targetX) * 4);
    }
  }
  return {width: outputWidth, height: outputHeight, pixels: output};
}

export function rotateSelection(selection: Selection, direction: RotationDirection): Selection {
  if (!hasUsableMask(selection)) {
    return {
      x: selection.x,
      y: selection.y,
      width: selection.height,
      height: selection.width,
    };
  }
  const source = normalizeMask(selection.mask!, selection.width * selection.height);
  const outputWidth = selection.height;
  const outputHeight = selection.width;
  const transformed = new Uint8Array(outputWidth * outputHeight);
  for (let y = 0; y < selection.height; y += 1) {
    for (let x = 0; x < selection.width; x += 1) {
      const targetX = direction === "clockwise" ? selection.height - 1 - y : y;
      const targetY = direction === "clockwise" ? x : selection.width - 1 - x;
      transformed[targetY * outputWidth + targetX] = source[y * selection.width + x];
    }
  }
  return selectionFromMask(selection.x, selection.y, outputWidth, outputHeight, transformed)!;
}

export function rotateClipboard(clipboard: PixelClipboard, direction: RotationDirection): PixelClipboard {
  const rotatedPixels = rotatePixels(clipboard.pixels, clipboard.width, clipboard.height, direction);
  const rotated: PixelClipboard = rotatedPixels;
  if (hasUsableClipboardMask(clipboard)) {
    const source = normalizeMask(clipboard.mask!, clipboard.width * clipboard.height);
    const output = new Uint8Array(rotated.width * rotated.height);
    for (let y = 0; y < clipboard.height; y += 1) {
      for (let x = 0; x < clipboard.width; x += 1) {
        const targetX = direction === "clockwise" ? clipboard.height - 1 - y : y;
        const targetY = direction === "clockwise" ? x : clipboard.width - 1 - x;
        output[targetY * rotated.width + targetX] = source[y * clipboard.width + x];
      }
    }
    rotated.mask = output;
  }
  return rotated;
}

/** Rotates clipboard pixels by an arbitrary angle using nearest-neighbor sampling. */
export function rotateClipboardArbitrary(
  clipboard: PixelClipboard,
  angleDegrees: number,
  pivot?: SelectionPoint,
): PixelClipboard {
  assertSelectionDimensions(clipboard.width, clipboard.height);
  assertPixelBuffer(clipboard.pixels, clipboard.width, clipboard.height);
  if (!Number.isFinite(angleDegrees)) throw new RangeError("Rotation angle must be finite");
  const radians = angleDegrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const hasExplicitPivot = pivot !== undefined;
  if (pivot && (!Number.isFinite(pivot.x) || !Number.isFinite(pivot.y))) {
    throw new RangeError("Rotation pivot must be finite");
  }
  const sourcePivot = pivot ?? {x: (clipboard.width - 1) / 2, y: (clipboard.height - 1) / 2};
  const defaultWidth = Math.max(1, Math.ceil(Math.abs(clipboard.width * cosine) + Math.abs(clipboard.height * sine)));
  const defaultHeight = Math.max(1, Math.ceil(Math.abs(clipboard.width * sine) + Math.abs(clipboard.height * cosine)));
  let width = defaultWidth;
  let height = defaultHeight;
  let outputOriginX = 0;
  let outputOriginY = 0;
  if (hasExplicitPivot) {
    const corners = [
      {x: 0, y: 0},
      {x: clipboard.width - 1, y: 0},
      {x: clipboard.width - 1, y: clipboard.height - 1},
      {x: 0, y: clipboard.height - 1},
    ].map((corner) => rotatePointAround(corner, sourcePivot, cosine, sine));
    const minimumX = Math.floor(Math.min(...corners.map((corner) => corner.x)) + 1e-9);
    const maximumX = Math.ceil(Math.max(...corners.map((corner) => corner.x)) - 1e-9);
    const minimumY = Math.floor(Math.min(...corners.map((corner) => corner.y)) + 1e-9);
    const maximumY = Math.ceil(Math.max(...corners.map((corner) => corner.y)) - 1e-9);
    outputOriginX = minimumX;
    outputOriginY = minimumY;
    width = Math.max(1, maximumX - minimumX + 1);
    height = Math.max(1, maximumY - minimumY + 1);
  }
  const output = new Uint8ClampedArray(width * height * 4);
  const outputMask = new Uint8Array(width * height);
  const sourceMask = clipboard.mask ? normalizeMask(clipboard.mask, clipboard.width * clipboard.height) : null;
  const sourceCenterX = (clipboard.width - 1) / 2;
  const sourceCenterY = (clipboard.height - 1) / 2;
  const targetCenterX = (width - 1) / 2;
  const targetCenterY = (height - 1) / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const worldX = hasExplicitPivot ? x + outputOriginX : x - targetCenterX + sourceCenterX;
      const worldY = hasExplicitPivot ? y + outputOriginY : y - targetCenterY + sourceCenterY;
      const translatedX = worldX - sourcePivot.x;
      const translatedY = worldY - sourcePivot.y;
      const sourceX = Math.round(translatedX * cosine + translatedY * sine + sourcePivot.x);
      const sourceY = Math.round(-translatedX * sine + translatedY * cosine + sourcePivot.y);
      if (sourceX < 0 || sourceY < 0 || sourceX >= clipboard.width || sourceY >= clipboard.height) continue;
      const sourceCell = sourceY * clipboard.width + sourceX;
      if (sourceMask && !sourceMask[sourceCell]) continue;
      const targetCell = y * width + x;
      output.set(clipboard.pixels.subarray(sourceCell * 4, sourceCell * 4 + 4), targetCell * 4);
      outputMask[targetCell] = sourceMask ? normalizeCoverageValue(sourceMask[sourceCell]) : 255;
    }
  }
  return {width, height, pixels: output, mask: outputMask};
}

/** Explicit-pivot alias for callers that want to document transform intent. */
export const rotateClipboardAroundPivot = rotateClipboardArbitrary;

export function resizeCoverageMask(
  mask: SelectionMask,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Uint8Array {
  assertSelectionDimensions(sourceWidth, sourceHeight);
  assertSelectionDimensions(targetWidth, targetHeight);
  const source = normalizeMask(mask, sourceWidth * sourceHeight);
  const output = new Uint8Array(targetWidth * targetHeight);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor(y * sourceHeight / targetHeight));
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor(x * sourceWidth / targetWidth));
      output[y * targetWidth + x] = source[sourceY * sourceWidth + sourceX];
    }
  }
  return output;
}

/** @deprecated The old name remains as a coverage-preserving alias. */
export const resizeBinaryMask = resizeCoverageMask;

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

function rotatePointAround(point: SelectionPoint, pivot: SelectionPoint, cosine: number, sine: number) {
  const x = point.x - pivot.x;
  const y = point.y - pivot.y;
  return {
    x: x * cosine - y * sine + pivot.x,
    y: x * sine + y * cosine + pivot.y,
  };
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

const FOUR_WAY_OFFSETS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const EIGHT_WAY_OFFSETS: readonly (readonly [number, number])[] = [
  ...FOUR_WAY_OFFSETS,
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

function neighborOffsets(connectivity: SelectionConnectivity) {
  return connectivity === 4 ? FOUR_WAY_OFFSETS : EIGHT_WAY_OFFSETS;
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

function selectionMaskOnCanvas(selection: Selection | null, canvasWidth: number, canvasHeight: number) {
  const mask = new Uint8Array(canvasWidth * canvasHeight);
  if (!selection) return mask;
  const left = Math.max(0, Math.ceil(selection.x));
  const top = Math.max(0, Math.ceil(selection.y));
  const right = Math.min(canvasWidth, selection.x + selection.width);
  const bottom = Math.min(canvasHeight, selection.y + selection.height);
  for (let y = top; y < Math.ceil(bottom); y += 1) {
    for (let x = left; x < Math.ceil(right); x += 1) {
      mask[y * canvasWidth + x] = selectionCoverageAt(selection, x, y);
    }
  }
  return mask;
}

function morphSelection(
  selection: Selection | null,
  amount: number,
  canvasWidth: number,
  canvasHeight: number,
  mode: "grow" | "shrink",
  connectivity: SelectionConnectivity,
): Selection | null {
  assertCanvasSize(canvasWidth, canvasHeight);
  const radius = normalizedRadius(amount);
  if (!selection) return null;
  const source = selectionMaskOnCanvas(selection, canvasWidth, canvasHeight);
  if (radius === 0) return selectionFromMask(0, 0, canvasWidth, canvasHeight, source);

  if (mode === "grow") {
    return selectionFromMask(0, 0, canvasWidth, canvasHeight, growMask(source, canvasWidth, canvasHeight, radius, connectivity));
  }

  return selectionFromMask(0, 0, canvasWidth, canvasHeight, shrinkMask(source, canvasWidth, canvasHeight, radius, connectivity));
}

function growMask(
  source: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  radius: number,
  connectivity: SelectionConnectivity,
) {
  const output = source.slice();
  const distances = new Int32Array(source.length).fill(-1);
  const queue = new Int32Array(source.length);
  let head = 0;
  let tail = 0;
  for (let cell = 0; cell < source.length; cell += 1) {
    if (!source[cell]) continue;
    distances[cell] = 0;
    queue[tail++] = cell;
  }
  const offsets = neighborOffsets(connectivity);
  while (head < tail) {
    const cell = queue[head++];
    const distance = distances[cell];
    if (distance >= radius) continue;
    const x = cell % canvasWidth;
    const y = Math.floor(cell / canvasWidth);
    for (const [offsetX, offsetY] of offsets) {
      const nextX = x + offsetX;
      const nextY = y + offsetY;
      if (nextX < 0 || nextY < 0 || nextX >= canvasWidth || nextY >= canvasHeight) continue;
      const nextCell = nextY * canvasWidth + nextX;
      if (distances[nextCell] >= 0) continue;
      distances[nextCell] = distance + 1;
      output[nextCell] = 255;
      queue[tail++] = nextCell;
    }
  }
  return output;
}

function shrinkMask(
  source: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  radius: number,
  connectivity: SelectionConnectivity,
) {
  let current = source.slice();
  const offsets = neighborOffsets(connectivity);
  for (let step = 0; step < radius; step += 1) {
    const next = new Uint8Array(source.length);
    for (let y = 0; y < canvasHeight; y += 1) {
      for (let x = 0; x < canvasWidth; x += 1) {
        const cell = y * canvasWidth + x;
        if (!current[cell]) continue;
        let remainsSelected = true;
        for (const [offsetX, offsetY] of offsets) {
          const neighborX = x + offsetX;
          const neighborY = y + offsetY;
          if (neighborX < 0 || neighborY < 0 || neighborX >= canvasWidth || neighborY >= canvasHeight
            || !current[neighborY * canvasWidth + neighborX]) {
            remainsSelected = false;
            break;
          }
        }
        if (remainsSelected) next[cell] = current[cell];
      }
    }
    current = next;
  }
  return current;
}

function subtractSelectionsForCanvas(
  first: Selection | null,
  second: Selection | null,
  canvasWidth: number,
  canvasHeight: number,
) {
  if (!first) return null;
  const result = subtractSelection(first, second);
  return result ? clipSelection(result, canvasWidth, canvasHeight) : null;
}

function normalizedRadius(value: number) {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new RangeError("Selection radius must be a non-negative integer");
  }
  return value;
}

function nearestCoverageDistance(
  source: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  state: 0 | 1,
  maxDistance: number,
) {
  let best = Number.POSITIVE_INFINITY;
  const minX = Math.max(0, Math.floor(x - maxDistance));
  const maxX = Math.min(width - 1, Math.ceil(x + maxDistance));
  const minY = Math.max(0, Math.floor(y - maxDistance));
  const maxY = Math.min(height - 1, Math.ceil(y + maxDistance));
  for (let candidateY = minY; candidateY <= maxY; candidateY += 1) {
    for (let candidateX = minX; candidateX <= maxX; candidateX += 1) {
      const coverage = source[candidateY * width + candidateX];
      if ((state === 1) !== (coverage > 0)) continue;
      const distance = Math.hypot(candidateX - x, candidateY - y);
      if (distance < best) best = distance;
    }
  }
  return best;
}

function nearestCoverageValue(
  source: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  maxDistance: number,
) {
  let best = Number.POSITIVE_INFINITY;
  let value = 255;
  const minX = Math.max(0, Math.floor(x - maxDistance));
  const maxX = Math.min(width - 1, Math.ceil(x + maxDistance));
  const minY = Math.max(0, Math.floor(y - maxDistance));
  const maxY = Math.min(height - 1, Math.ceil(y + maxDistance));
  for (let candidateY = minY; candidateY <= maxY; candidateY += 1) {
    for (let candidateX = minX; candidateX <= maxX; candidateX += 1) {
      const coverage = source[candidateY * width + candidateX];
      if (!coverage) continue;
      const distance = Math.hypot(candidateX - x, candidateY - y);
      if (distance < best) {
        best = distance;
        value = coverage;
      }
    }
  }
  return value;
}

function hasUsableMask(selection: Selection) {
  return selection.mask !== undefined && selection.mask.length === selection.width * selection.height;
}

function hasUsableClipboardMask(clipboard: PixelClipboard) {
  return clipboard.mask !== undefined && clipboard.mask.length === clipboard.width * clipboard.height;
}

function normalizeMask(mask: SelectionMask, expectedLength: number) {
  const output = new Uint8Array(expectedLength);
  if (mask.length !== expectedLength) {
    output.fill(255);
    return output;
  }
  for (let index = 0; index < expectedLength; index += 1) output[index] = normalizeCoverageValue(mask[index]);
  return output;
}

function normalizeCoverageValue(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return 0;
  return clamp(Math.round(value), 0, 255);
}

function maskValue(value: number | undefined) {
  return normalizeCoverageValue(value) > 0;
}

function maskCoverageAt(mask: SelectionMask, index: number) {
  const normalized = normalizeCoverageValue(mask[index]);
  // A binary mask is still emitted by brush and clipboard helpers. Interpret
  // its `1` as full coverage while preserving true 0..255 soft masks. A
  // mixed mask can also contain encoded full-coverage cells from a union.
  return normalized === 1 && (isBinaryMask(mask) || hasCoverageAboveOne(mask)) ? 255 : normalized;
}

function isBinaryMask(mask: SelectionMask) {
  for (const value of mask) {
    if (value !== 0 && value !== 1) return false;
  }
  return true;
}

function hasCoverageAboveOne(mask: SelectionMask) {
  for (const value of mask) if (value > 1) return true;
  return false;
}

function encodeCoverageForMask(value: number) {
  return value >= 255 ? 1 : value;
}

function coverageSubtract(first: number, second: number) {
  if (first <= 0 || second >= 255) return 0;
  if (second <= 0) return first;
  return Math.round(first * (255 - second) / 255);
}

function findMaskBounds(mask: Uint8Array, width: number, height: number) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < left || bottom < top ? null : {left, top, right, bottom};
}

function cropMask(
  source: Uint8Array,
  sourceWidth: number,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const output = new Uint8Array(width * height);
  for (let row = 0; row < height; row += 1) {
    const sourceStart = (y + row) * sourceWidth + x;
    output.set(source.subarray(sourceStart, sourceStart + width), row * width);
  }
  return output;
}

function isFullMask(mask: Uint8Array) {
  for (const value of mask) if (value !== 255 && value !== 1) return false;
  return mask.length > 0 && (mask.every((value) => value === 255) || mask.every((value) => value === 1));
}

function flipMask(mask: Uint8Array, width: number, height: number, axis: TransformAxis) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const targetX = axis === "horizontal" ? width - 1 - x : x;
      const targetY = axis === "vertical" ? height - 1 - y : y;
      output[targetY * width + targetX] = mask[y * width + x];
    }
  }
  return output;
}

function assertSelectionDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError("Selection dimensions must be positive integers");
  }
  if (!Number.isSafeInteger(width * height)) throw new RangeError("Selection is too large");
}

function assertCanvasWidth(width: number) {
  if (!Number.isInteger(width) || width <= 0) throw new RangeError("Canvas width must be a positive integer");
}

function assertCanvasSize(width: number, height: number) {
  assertSelectionDimensions(width, height);
}

function assertPixelBuffer(pixels: Uint8ClampedArray, width: number, height: number) {
  const expectedLength = width * height * 4;
  if (pixels.length < expectedLength) throw new RangeError("Pixel buffer is smaller than its dimensions");
}

function canvasHeightFor(pixels: Uint8ClampedArray, canvasWidth: number) {
  return Math.floor(pixels.length / (canvasWidth * 4));
}

function clippedDirtyBounds(
  dirtyBounds: PixelDirtyBounds | undefined,
  canvasWidth: number,
  canvasHeight: number,
): PixelDirtyBounds | null {
  if (!dirtyBounds) return {x: 0, y: 0, width: canvasWidth, height: canvasHeight};
  if (![dirtyBounds.x, dirtyBounds.y, dirtyBounds.width, dirtyBounds.height].every(Number.isFinite)
    || dirtyBounds.width <= 0 || dirtyBounds.height <= 0) return null;

  const rightEdge = dirtyBounds.x + dirtyBounds.width;
  const bottomEdge = dirtyBounds.y + dirtyBounds.height;
  if (!Number.isFinite(rightEdge) || !Number.isFinite(bottomEdge)) return null;

  const left = Math.max(0, Math.floor(dirtyBounds.x));
  const top = Math.max(0, Math.floor(dirtyBounds.y));
  const right = Math.min(canvasWidth, Math.ceil(rightEdge));
  const bottom = Math.min(canvasHeight, Math.ceil(bottomEdge));
  if (right <= left || bottom <= top) return null;
  return {x: left, y: top, width: right - left, height: bottom - top};
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

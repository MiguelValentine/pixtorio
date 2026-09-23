import type {BorderSelectionMode, Selection, SelectionConnectivity, SelectionMask, SelectionOperation} from "./selectionTypes";



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

const FOUR_WAY_OFFSETS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const EIGHT_WAY_OFFSETS: readonly (readonly [number, number])[] = [
  ...FOUR_WAY_OFFSETS,
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

export function neighborOffsets(connectivity: SelectionConnectivity) {
  return connectivity === 4 ? FOUR_WAY_OFFSETS : EIGHT_WAY_OFFSETS;
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

export function hasUsableMask(selection: Selection) {
  return selection.mask !== undefined && selection.mask.length === selection.width * selection.height;
}

export function normalizeMask(mask: SelectionMask, expectedLength: number) {
  const output = new Uint8Array(expectedLength);
  if (mask.length !== expectedLength) {
    output.fill(255);
    return output;
  }
  for (let index = 0; index < expectedLength; index += 1) output[index] = normalizeCoverageValue(mask[index]);
  return output;
}

export function normalizeCoverageValue(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return 0;
  return clamp(Math.round(value), 0, 255);
}

export function maskCoverageAt(mask: SelectionMask, index: number) {
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

export function encodeCoverageForMask(value: number) {
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

export function assertSelectionDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError("Selection dimensions must be positive integers");
  }
  if (!Number.isSafeInteger(width * height)) throw new RangeError("Selection is too large");
}

export function assertCanvasWidth(width: number) {
  if (!Number.isInteger(width) || width <= 0) throw new RangeError("Canvas width must be a positive integer");
}

export function assertCanvasSize(width: number, height: number) {
  assertSelectionDimensions(width, height);
}

export function assertPixelBuffer(pixels: Uint8ClampedArray, width: number, height: number) {
  const expectedLength = width * height * 4;
  if (pixels.length < expectedLength) throw new RangeError("Pixel buffer is smaller than its dimensions");
}

export function canvasHeightFor(pixels: Uint8ClampedArray, canvasWidth: number) {
  return Math.floor(pixels.length / (canvasWidth * 4));
}

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

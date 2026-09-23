import {MAX_BRUSH_SIZE, MIN_BRUSH_SIZE} from "./constants";
import type {
  BitmapBrush,
  BrushShape,
  Point,
  ResolvedBrushSettings,
} from "./types";

export function normalizeBrushSize(size: number | undefined): number {
  if (!Number.isFinite(size)) return MIN_BRUSH_SIZE;
  return Math.max(MIN_BRUSH_SIZE, Math.min(MAX_BRUSH_SIZE, Math.round(size as number)));
}

export function normalizeBrushSpacing(spacing: number | undefined): number {
  if (!Number.isFinite(spacing) || (spacing as number) <= 0) return 1;
  return Math.max(0.25, spacing as number);
}

/**
 * Create a binary bitmap brush from a flat mask. Non-zero values are treated as painted pixels.
 * A row-major array of rows is also accepted for convenient brush-preset definitions.
 */
export function createBitmapBrush(
  width: number,
  height: number,
  mask: ArrayLike<number | boolean>,
  anchorX?: number,
  anchorY?: number,
): BitmapBrush;
export function createBitmapBrush(
  rows: ReadonlyArray<ArrayLike<number | boolean>>,
  anchor?: Point,
): BitmapBrush;
export function createBitmapBrush(
  widthOrRows: number | ReadonlyArray<ArrayLike<number | boolean>>,
  heightOrAnchor?: number | Point,
  maskArgument?: ArrayLike<number | boolean>,
  anchorXArgument?: number,
  anchorYArgument?: number,
): BitmapBrush {
  let width: number;
  let height: number;
  let sourceMask: ArrayLike<number | boolean>;
  let anchorX: number | undefined;
  let anchorY: number | undefined;

  if (typeof widthOrRows === "number") {
    width = widthOrRows;
    height = typeof heightOrAnchor === "number" ? heightOrAnchor : 0;
    sourceMask = maskArgument ?? [];
    anchorX = anchorXArgument;
    anchorY = anchorYArgument;
  } else {
    const rows = widthOrRows;
    height = rows.length;
    width = rows[0]?.length ?? 0;
    const flattened = new Uint8Array(Math.max(0, width * height));
    for (let y = 0; y < height; y += 1) {
      if (rows[y].length !== width) throw new RangeError("Bitmap brush rows must have equal widths");
      for (let x = 0; x < width; x += 1) flattened[y * width + x] = rows[y][x] ? 1 : 0;
    }
    sourceMask = flattened;
    const anchor = heightOrAnchor && typeof heightOrAnchor !== "number" ? heightOrAnchor : undefined;
    anchorX = anchor?.x;
    anchorY = anchor?.y;
  }

  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError("Bitmap brush dimensions must be positive integers");
  }
  if (sourceMask.length !== width * height) throw new RangeError("Bitmap brush mask length does not match dimensions");

  const normalizedMask = new Uint8Array(width * height);
  for (let index = 0; index < normalizedMask.length; index += 1) normalizedMask[index] = sourceMask[index] ? 1 : 0;
  return {
    width,
    height,
    mask: normalizedMask,
    anchorX: clampInteger(anchorX ?? Math.floor(width / 2), 0, width - 1),
    anchorY: clampInteger(anchorY ?? Math.floor(height / 2), 0, height - 1),
  };
}

/** Resize a bitmap brush with nearest-neighbor sampling while preserving its aspect ratio. */
export function resizeBitmapBrush(brush: BitmapBrush, targetSize: number): BitmapBrush {
  const size = normalizeBrushSize(targetSize);
  const sourceSize = Math.max(brush.width, brush.height);
  if (sourceSize === size) return brush;

  const scale = size / sourceSize;
  const width = Math.max(1, Math.round(brush.width * scale));
  const height = Math.max(1, Math.round(brush.height * scale));
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(brush.height - 1, Math.floor(y * brush.height / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(brush.width - 1, Math.floor(x * brush.width / width));
      mask[y * width + x] = brush.mask[sourceY * brush.width + sourceX];
    }
  }
  return createBitmapBrush(
    width,
    height,
    mask,
    Math.min(width - 1, Math.floor((brush.anchorX + 0.5) * width / brush.width)),
    Math.min(height - 1, Math.floor((brush.anchorY + 0.5) * height / brush.height)),
  );
}

/** Create a procedural brush as a bitmap so arbitrary-angle rotation uses the same stamp path. */
export function createShapeBitmapBrush(shape: BrushShape, size: number): BitmapBrush {
  const normalizedSize = normalizeBrushSize(size);
  const mask = new Uint8Array(normalizedSize * normalizedSize);
  for (let y = 0; y < normalizedSize; y += 1) {
    for (let x = 0; x < normalizedSize; x += 1) {
      if (isBrushPixel(x, y, normalizedSize, shape)) mask[y * normalizedSize + x] = 1;
    }
  }
  return createBitmapBrush(normalizedSize, normalizedSize, mask);
}

/** Rotate a bitmap brush around its anchor with nearest-neighbor sampling. */
export function rotateBitmapBrush(brush: BitmapBrush, angleDegrees: number): BitmapBrush {
  const normalized = ((Number.isFinite(angleDegrees) ? angleDegrees : 0) % 360 + 360) % 360;
  if (normalized === 0) return brush;
  const radians = normalized * Math.PI / 180;
  // Exact quarter-turn values keep an asymmetric brush from gaining an empty
  // row or column through floor/ceil of values such as 6.123e-17.
  const quarterTurn = normalized === 90 || normalized === 180 || normalized === 270;
  const cosine = quarterTurn ? (normalized === 180 ? -1 : 0) : Math.cos(radians);
  const sine = quarterTurn ? (normalized === 270 ? -1 : normalized === 90 ? 1 : 0) : Math.sin(radians);
  const corners = [
    {x: -brush.anchorX, y: -brush.anchorY},
    {x: brush.width - 1 - brush.anchorX, y: -brush.anchorY},
    {x: brush.width - 1 - brush.anchorX, y: brush.height - 1 - brush.anchorY},
    {x: -brush.anchorX, y: brush.height - 1 - brush.anchorY},
  ].map(({x, y}) => ({x: x * cosine - y * sine, y: x * sine + y * cosine}));
  const minX = Math.floor(Math.min(...corners.map(({x}) => x)));
  const maxX = Math.ceil(Math.max(...corners.map(({x}) => x)));
  const minY = Math.floor(Math.min(...corners.map(({y}) => y)));
  const maxY = Math.ceil(Math.max(...corners.map(({y}) => y)));
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const mask = new Uint8Array(width * height);
  for (let targetY = 0; targetY < height; targetY += 1) {
    for (let targetX = 0; targetX < width; targetX += 1) {
      const rotatedX = targetX + minX;
      const rotatedY = targetY + minY;
      const sourceX = Math.round(rotatedX * cosine + rotatedY * sine) + brush.anchorX;
      const sourceY = Math.round(-rotatedX * sine + rotatedY * cosine) + brush.anchorY;
      if (sourceX >= 0 && sourceY >= 0 && sourceX < brush.width && sourceY < brush.height
        && brush.mask[sourceY * brush.width + sourceX]) {
        mask[targetY * width + targetX] = 1;
      }
    }
  }
  return createBitmapBrush(width, height, mask, -minX, -minY);
}

export function isBrushPixel(x: number, y: number, size: number, shape: BrushShape) {
  if (x < 0 || y < 0 || x >= size || y >= size) return false;
  if (shape === "square") return true;
  const center = (size - 1) / 2;
  const distanceX = Math.abs(x - center);
  const distanceY = Math.abs(y - center);
  if (shape === "cross") {
    const halfThickness = Math.max(0.5, size / 6);
    return distanceX <= halfThickness || distanceY <= halfThickness;
  }
  if (shape === "diamond") return distanceX + distanceY <= size / 2;
  // The quarter-pixel inset yields the familiar pixel-art masks: size 3 is a cross, size 4 has clipped corners.
  const radius = size / 2 - 0.25;
  return distanceX * distanceX + distanceY * distanceY <= radius * radius;
}

/** Remove duplicate points and intermediate points travelling in the same integer direction. */
export function simplifyPixelPerfectStroke(points: readonly Point[]): Point[] {
  const unique = dedupePoints(points);
  if (unique.length < 3) return unique;
  const simplified: Point[] = [unique[0]];
  for (let index = 1; index < unique.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1];
    const current = unique[index];
    const next = unique[index + 1];
    const previousDirection = direction(previous, current);
    const nextDirection = direction(current, next);
    if (previousDirection.x === nextDirection.x && previousDirection.y === nextDirection.y) continue;
    simplified.push(current);
  }
  simplified.push(unique[unique.length - 1]);
  return simplified;
}

/** Common alias for consumers that call the path operation itself a pixel-perfect stroke. */
export function pixelPerfectStroke(points: readonly Point[]): Point[] {
  return simplifyPixelPerfectStroke(points);
}

export function dedupePoints(points: readonly Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const previous = result[result.length - 1];
    if (!previous || previous.x !== point.x || previous.y !== point.y) result.push({x: point.x, y: point.y});
  }
  return result;
}

export function forEachLinePoint(from: Point, to: Point, callback: (x: number, y: number) => void) {
  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - from.x);
  const sx = from.x < to.x ? 1 : -1;
  const dy = -Math.abs(to.y - from.y);
  const sy = from.y < to.y ? 1 : -1;
  let error = dx + dy;

  while (true) {
    callback(x, y);
    if (x === to.x && y === to.y) return;
    const twiceError = error * 2;
    if (twiceError >= dy) {
      error += dy;
      x += sx;
    }
    if (twiceError <= dx) {
      error += dx;
      y += sy;
    }
  }
}

/** Shared spacing loop for bitmap and procedural brush stamps. */
export function drawSpacedStroke(
  points: readonly Point[],
  spacing: number,
  stamp: (point: Point) => number,
): number {
  let changed = stamp(points[0]);
  let lastStamp = {x: Math.round(points[0].x), y: Math.round(points[0].y)};
  let startX = points[0].x;
  let startY = points[0].y;
  let distanceUntilStamp = spacing;

  for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
    const endX = points[pointIndex].x;
    const endY = points[pointIndex].y;
    let deltaX = endX - startX;
    let deltaY = endY - startY;
    let segmentLength = Math.hypot(deltaX, deltaY);
    if (segmentLength <= Number.EPSILON) continue;

    while (segmentLength + Number.EPSILON >= distanceUntilStamp) {
      const ratio = distanceUntilStamp / segmentLength;
      startX += deltaX * ratio;
      startY += deltaY * ratio;
      const stampPoint = {x: Math.round(startX), y: Math.round(startY)};
      changed += stamp(stampPoint);
      lastStamp = stampPoint;
      deltaX = endX - startX;
      deltaY = endY - startY;
      segmentLength = Math.hypot(deltaX, deltaY);
      distanceUntilStamp = spacing;
      if (segmentLength <= Number.EPSILON) break;
    }

    distanceUntilStamp -= segmentLength;
    startX = endX;
    startY = endY;
  }

  const endpoint = {x: Math.round(points[points.length - 1].x), y: Math.round(points[points.length - 1].y)};
  if (endpoint.x !== lastStamp.x || endpoint.y !== lastStamp.y) changed += stamp(endpoint);
  return changed;
}

export function brushFootprintOrigin(point: Point, settings: ResolvedBrushSettings): Point {
  const centerX = Math.round(point.x);
  const centerY = Math.round(point.y);
  if (settings.bitmapBrush) {
    return {x: centerX - settings.bitmapBrush.anchorX, y: centerY - settings.bitmapBrush.anchorY};
  }
  const offset = Math.floor(settings.size / 2);
  return {x: centerX - offset, y: centerY - offset};
}

export function brushFootprintReach(brush: number | ResolvedBrushSettings) {
  const settings = typeof brush === "number" ? null : brush;
  const bitmap = settings?.bitmapBrush ?? null;
  const size = settings?.size ?? (typeof brush === "number" ? normalizeBrushSize(brush) : MIN_BRUSH_SIZE);
  const extent = bitmap ? Math.max(bitmap.width, bitmap.height) : Math.max(MIN_BRUSH_SIZE, size);
  const offset = Math.floor(extent / 2);
  let left = offset;
  let top = offset;
  let right = extent - offset - 1;
  let bottom = extent - offset - 1;
  if (bitmap) {
    left = Math.max(left, bitmap.anchorX);
    top = Math.max(top, bitmap.anchorY);
    right = Math.max(right, bitmap.width - bitmap.anchorX - 1);
    bottom = Math.max(bottom, bitmap.height - bitmap.anchorY - 1);
  }
  return {left, top, right, bottom};
}

export function modulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function clampInteger(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function direction(from: Point, to: Point) {
  return {
    x: Math.sign(to.x - from.x),
    y: Math.sign(to.y - from.y),
  };
}

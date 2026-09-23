import {orderedSliceOverlays} from "./sliceHitTesting";
import type {Selection} from "./selection";
import type {Point} from "./tools";
import type {TransformHandle, TransformQuad} from "./transform";

export type CanvasContextTarget =
  | {kind: "slice"; id: string}
  | {kind: "guide"; id: string; axis: "horizontal" | "vertical"};

type CanvasContextSlice = {id: string; x: number; y: number; width: number; height: number};
type CanvasContextGuide = {id: string; axis: "horizontal" | "vertical"; position: number};

export const zoomLevels = [1, 2, 4, 6, 8, 12, 16, 24, 32];
export const transformHandleSize = 8;
export const transformCursors: Record<TransformHandle, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

export function canvasLocalPoint(
  pointer: {clientX: number; clientY: number},
  rect: {left: number; top: number; width: number; height: number},
  surface: {width: number; height: number},
): Point {
  return {
    x: (pointer.clientX - rect.left) * (rect.width > 0 ? surface.width / rect.width : 1),
    y: (pointer.clientY - rect.top) * (rect.height > 0 ? surface.height / rect.height : 1),
  };
}

export function findCanvasContextTarget(
  documentPoint: Point,
  screenPoint: Point,
  sliceOverlays: ReadonlyArray<CanvasContextSlice>,
  guides: ReadonlyArray<CanvasContextGuide>,
  activeSliceId: string,
  viewport: Point,
  zoom: number,
): CanvasContextTarget | null {
  const slice = orderedSliceOverlays(sliceOverlays, activeSliceId).find((candidate) => (
    documentPoint.x >= candidate.x
    && documentPoint.x < candidate.x + candidate.width
    && documentPoint.y >= candidate.y
    && documentPoint.y < candidate.y + candidate.height
  ));
  if (slice) return {kind: "slice", id: slice.id};

  const guide = guides.find((candidate) => {
    const screenPosition = candidate.axis === "vertical"
      ? viewport.x + candidate.position * zoom
      : viewport.y + candidate.position * zoom;
    return Math.abs((candidate.axis === "vertical" ? screenPoint.x : screenPoint.y) - screenPosition) <= 5;
  });
  return guide ? {kind: "guide", id: guide.id, axis: guide.axis} : null;
}

export function segmentTouchesDocument(start: Point, end: Point, width: number, height: number, margin = 0) {
  let entry = 0;
  let exit = 1;
  const axes: Array<[number, number, number]> = [
    [start.x, end.x - start.x, width - 1],
    [start.y, end.y - start.y, height - 1],
  ];
  for (const [origin, delta, maximum] of axes) {
    if (delta === 0) {
      if (origin < -margin || origin > maximum + margin) return false;
      continue;
    }
    const first = (-margin - origin) / delta;
    const second = (maximum + margin - origin) / delta;
    entry = Math.max(entry, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (entry > exit) return false;
  }
  return true;
}

export function accumulateWheelZoom(
  deltaY: number,
  accumulator: number,
  platform = typeof navigator === "undefined" ? "" : navigator.platform,
): {step: -1 | 0 | 1; remainder: number} {
  if (deltaY === 0) return {step: 0, remainder: accumulator};
  const direction: -1 | 1 = deltaY < 0 ? 1 : -1;
  const matchingAccumulator = accumulator === 0 || Math.sign(accumulator) === direction ? accumulator : 0;
  const next = matchingAccumulator + direction * (/^Mac/i.test(platform) ? 0.25 : 1);
  if (Math.abs(next) < 1) return {step: 0, remainder: next};
  return {step: direction, remainder: next - direction};
}

export function clipDirtyBounds(
  bounds: {x: number; y: number; width: number; height: number},
  width: number,
  height: number,
) {
  const left = Math.max(0, Math.floor(bounds.x));
  const top = Math.max(0, Math.floor(bounds.y));
  const right = Math.min(width, Math.ceil(bounds.x + bounds.width));
  const bottom = Math.min(height, Math.ceil(bounds.y + bounds.height));
  if (right <= left || bottom <= top) return null;
  return {x: left, y: top, width: right - left, height: bottom - top};
}

export function simplifyPolygonDrag(points: readonly Point[]) {
  if (points.length <= 3) return points;
  const result: Point[] = [points[0]];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = result[result.length - 1];
    const current = points[index];
    if (Math.hypot(current.x - previous.x, current.y - previous.y) >= 4) result.push(current);
  }
  result.push(points[points.length - 1]);
  return result;
}

export function transformHandles(quad: TransformQuad, viewport: Point, zoom: number) {
  const screen = (point: Point) => ({x: viewport.x + point.x * zoom, y: viewport.y + point.y * zoom});
  const nw = screen(quad.nw);
  const ne = screen(quad.ne);
  const se = screen(quad.se);
  const sw = screen(quad.sw);
  return [
    {handle: "nw" as const, ...nw},
    {handle: "n" as const, x: (nw.x + ne.x) / 2, y: (nw.y + ne.y) / 2},
    {handle: "ne" as const, ...ne},
    {handle: "e" as const, x: (ne.x + se.x) / 2, y: (ne.y + se.y) / 2},
    {handle: "se" as const, ...se},
    {handle: "s" as const, x: (sw.x + se.x) / 2, y: (sw.y + se.y) / 2},
    {handle: "sw" as const, ...sw},
    {handle: "w" as const, x: (nw.x + sw.x) / 2, y: (nw.y + sw.y) / 2},
  ];
}

export function hitTransformHandle(point: Point, quad: TransformQuad, viewport: Point, zoom: number) {
  const radius = transformHandleSize / 2 + 3;
  return transformHandles(quad, viewport, zoom).find(({x, y}) => (
    Math.abs(point.x - x) <= radius && Math.abs(point.y - y) <= radius
  ))?.handle ?? null;
}

export function transformCenter(quad: TransformQuad) {
  return {
    x: (quad.nw.x + quad.ne.x + quad.se.x + quad.sw.x) / 4,
    y: (quad.nw.y + quad.ne.y + quad.se.y + quad.sw.y) / 4,
  };
}

export function rotationHandle(quad: TransformQuad, viewport: Point, zoom: number) {
  const top = {x: (quad.nw.x + quad.ne.x) / 2, y: (quad.nw.y + quad.ne.y) / 2};
  const center = transformCenter(quad);
  const deltaX = top.x - center.x;
  const deltaY = top.y - center.y;
  const length = Math.hypot(deltaX, deltaY) || 1;
  const offset = 24 / zoom;
  const point = {x: top.x + deltaX / length * offset, y: top.y + deltaY / length * offset};
  return {
    document: point,
    screen: {x: viewport.x + point.x * zoom, y: viewport.y + point.y * zoom},
    topScreen: {x: viewport.x + top.x * zoom, y: viewport.y + top.y * zoom},
  };
}

export function hitPoint(point: Point, target: Point, radius = 8) {
  return Math.hypot(point.x - target.x, point.y - target.y) <= radius;
}

export function samePoint(first: Point | null | undefined, second: Point | null | undefined) {
  return Boolean(first && second && first.x === second.x && first.y === second.y);
}

export function resizedTransformBounds(
  origin: Selection,
  handle: TransformHandle,
  point: Point,
  canvasWidth: number,
  canvasHeight: number,
): Selection {
  let left = origin.x;
  let top = origin.y;
  let right = origin.x + origin.width;
  let bottom = origin.y + origin.height;
  if (handle.includes("w")) left = Math.max(0, Math.min(right - 1, point.x));
  if (handle.includes("e")) right = Math.min(canvasWidth, Math.max(left + 1, point.x));
  if (handle.includes("n")) top = Math.max(0, Math.min(bottom - 1, point.y));
  if (handle.includes("s")) bottom = Math.min(canvasHeight, Math.max(top + 1, point.y));
  return {x: left, y: top, width: right - left, height: bottom - top};
}

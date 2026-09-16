import {
  clearSelection,
  copySelection,
  pasteClipboard,
  rotateClipboardArbitrary,
  resizeClipboard,
  selectionFromMask,
  type PixelClipboard,
  type Selection,
} from "./selection";

export type TransformMode = "scale" | "perspective" | "distort";
export type TransformHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export interface TransformQuad {
  nw: {x: number; y: number};
  ne: {x: number; y: number};
  se: {x: number; y: number};
  sw: {x: number; y: number};
}

export interface TransformPivot {
  x: number;
  y: number;
}

/** Result of a pure nearest-neighbor clipboard transform. */
export interface ClipboardTransformResult extends PixelClipboard {
  /** The source-space location represented by the result's top-left pixel. */
  offsetX: number;
  offsetY: number;
}

/** Rotates a clipboard around an explicit local pivot using nearest neighbors. */
export function rotateClipboardWithPivot(
  clipboard: PixelClipboard,
  angleDegrees: number,
  pivot: TransformPivot,
): ClipboardTransformResult {
  const rotated = rotateClipboardArbitrary(clipboard, angleDegrees, pivot);
  const radians = angleDegrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = [
    {x: 0, y: 0},
    {x: clipboard.width - 1, y: 0},
    {x: clipboard.width - 1, y: clipboard.height - 1},
    {x: 0, y: clipboard.height - 1},
  ].map(({x, y}) => ({
    x: (x - pivot.x) * cosine - (y - pivot.y) * sine + pivot.x,
    y: (x - pivot.x) * sine + (y - pivot.y) * cosine + pivot.y,
  }));
  return {
    ...rotated,
    offsetX: Math.floor(Math.min(...corners.map(({x}) => x)) + 1e-9),
    offsetY: Math.floor(Math.min(...corners.map(({y}) => y)) + 1e-9),
  };
}

export const rotateClipboardAroundPivot = rotateClipboardWithPivot;

export function selectionQuad(selection: Selection): TransformQuad {
  return {
    nw: {x: selection.x, y: selection.y},
    ne: {x: selection.x + selection.width, y: selection.y},
    se: {x: selection.x + selection.width, y: selection.y + selection.height},
    sw: {x: selection.x, y: selection.y + selection.height},
  };
}

export function renderClipboardTransformFromSource(
  pixels: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  before: Uint8ClampedArray,
  sourceOrigin: Selection,
  source: PixelClipboard,
  target: Selection,
  clearColor?: readonly [number, number, number, number],
): Selection {
  pixels.set(before);
  clearSelection(pixels, canvasWidth, sourceOrigin, clearColor);
  const transformed = resizeClipboard(source, target.width, target.height);
  pasteClipboard(pixels, canvasWidth, canvasHeight, transformed, target.x, target.y);
  return {
    x: target.x,
    y: target.y,
    width: target.width,
    height: target.height,
    ...(transformed.mask ? {mask: transformed.mask} : {}),
  };
}

export function deformedTransformQuad(
  origin: Selection,
  handle: TransformHandle,
  point: {x: number; y: number},
  mode: Exclude<TransformMode, "scale">,
  canvasWidth: number,
  canvasHeight: number,
): TransformQuad {
  return deformedQuad(selectionQuad(origin), handle, point, mode, canvasWidth, canvasHeight);
}

export function deformedQuad(
  base: TransformQuad,
  handle: TransformHandle,
  point: {x: number; y: number},
  mode: Exclude<TransformMode, "scale">,
  canvasWidth: number,
  canvasHeight: number,
): TransformQuad {
  const quad: TransformQuad = {
    nw: {...base.nw},
    ne: {...base.ne},
    se: {...base.se},
    sw: {...base.sw},
  };
  const x = Math.max(0, Math.min(canvasWidth, point.x));
  const y = Math.max(0, Math.min(canvasHeight, point.y));
  const isCorner = handle.length === 2;

  if (!isCorner) {
    if (handle === "n") quad.nw.y = quad.ne.y = y;
    if (handle === "e") quad.ne.x = quad.se.x = x;
    if (handle === "s") quad.sw.y = quad.se.y = y;
    if (handle === "w") quad.nw.x = quad.sw.x = x;
    return quad;
  }
  const cornerHandle = handle as keyof TransformQuad;

  if (mode === "distort") {
    quad[cornerHandle].x = x;
    quad[cornerHandle].y = y;
    return quad;
  }

  const corner = quad[cornerHandle];
  const deltaX = x - corner.x;
  const deltaY = y - corner.y;
  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    const pair = handle === "nw" ? "ne" : handle === "ne" ? "nw" : handle === "sw" ? "se" : "sw";
    const midpoint = (quad[cornerHandle].x + quad[pair].x) / 2;
    const constrainedX = handle.includes("w") ? Math.min(x, midpoint - 0.5) : Math.max(x, midpoint + 0.5);
    const appliedDelta = constrainedX - corner.x;
    quad[cornerHandle].x = constrainedX;
    quad[pair].x = Math.max(0, Math.min(canvasWidth, quad[pair].x - appliedDelta));
  } else {
    const pair = handle === "nw" ? "sw" : handle === "sw" ? "nw" : handle === "ne" ? "se" : "ne";
    const midpoint = (quad[cornerHandle].y + quad[pair].y) / 2;
    const constrainedY = handle.includes("n") ? Math.min(y, midpoint - 0.5) : Math.max(y, midpoint + 0.5);
    const appliedDelta = constrainedY - corner.y;
    quad[cornerHandle].y = constrainedY;
    quad[pair].y = Math.max(0, Math.min(canvasHeight, quad[pair].y - appliedDelta));
  }
  return quad;
}

export function warpSelectionToQuad(
  pixels: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  origin: Selection,
  quad: TransformQuad,
  clearColor?: readonly [number, number, number, number],
): Selection | null {
  const source = copySelection(pixels, canvasWidth, origin);
  clearSelection(pixels, canvasWidth, origin, clearColor);
  const left = Math.max(0, Math.floor(Math.min(quad.nw.x, quad.ne.x, quad.se.x, quad.sw.x)));
  const top = Math.max(0, Math.floor(Math.min(quad.nw.y, quad.ne.y, quad.se.y, quad.sw.y)));
  const right = Math.min(canvasWidth, Math.ceil(Math.max(quad.nw.x, quad.ne.x, quad.se.x, quad.sw.x)));
  const bottom = Math.min(canvasHeight, Math.ceil(Math.max(quad.nw.y, quad.ne.y, quad.se.y, quad.sw.y)));
  if (right <= left || bottom <= top) return null;

  const width = right - left;
  const height = bottom - top;
  const mask = new Uint8Array(width * height);
  for (let targetY = top; targetY < bottom; targetY += 1) {
    for (let targetX = left; targetX < right; targetX += 1) {
      const uv = invertBilinear(quad, targetX + 0.5, targetY + 0.5);
      if (!uv || uv.u < 0 || uv.v < 0 || uv.u >= 1 || uv.v >= 1) continue;
      const sourceX = Math.min(source.width - 1, Math.floor(uv.u * source.width));
      const sourceY = Math.min(source.height - 1, Math.floor(uv.v * source.height));
      const sourceMaskIndex = sourceY * source.width + sourceX;
      const sourceCoverage = source.mask?.[sourceMaskIndex] ?? 255;
      if (!sourceCoverage) continue;
      const sourceIndex = sourceMaskIndex * 4;
      const targetIndex = (targetY * canvasWidth + targetX) * 4;
      const coverage = source.mask && isBinaryMask(source.mask) && sourceCoverage === 1 ? 255 : sourceCoverage;
      if (coverage >= 255) {
        pixels.set(source.pixels.subarray(sourceIndex, sourceIndex + 4), targetIndex);
      } else {
        const amount = coverage / 255;
        for (let channel = 0; channel < 4; channel += 1) {
          pixels[targetIndex + channel] = Math.round(
            pixels[targetIndex + channel] + (source.pixels[sourceIndex + channel] - pixels[targetIndex + channel]) * amount,
          );
        }
      }
      mask[(targetY - top) * width + targetX - left] = sourceCoverage;
    }
  }
  return selectionFromMask(left, top, width, height, mask);
}

function isBinaryMask(mask: ArrayLike<number>) {
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] !== 0 && mask[index] !== 1) return false;
  }
  return true;
}

function invertBilinear(quad: TransformQuad, x: number, y: number) {
  let u = 0.5;
  let v = 0.5;
  const ax = quad.ne.x - quad.nw.x;
  const ay = quad.ne.y - quad.nw.y;
  const bx = quad.sw.x - quad.nw.x;
  const by = quad.sw.y - quad.nw.y;
  const cx = quad.nw.x - quad.ne.x - quad.sw.x + quad.se.x;
  const cy = quad.nw.y - quad.ne.y - quad.sw.y + quad.se.y;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const errorX = quad.nw.x + ax * u + bx * v + cx * u * v - x;
    const errorY = quad.nw.y + ay * u + by * v + cy * u * v - y;
    const duX = ax + cx * v;
    const duY = ay + cy * v;
    const dvX = bx + cx * u;
    const dvY = by + cy * u;
    const determinant = duX * dvY - duY * dvX;
    if (Math.abs(determinant) < 1e-8) return null;
    u -= (errorX * dvY - errorY * dvX) / determinant;
    v -= (duX * errorY - duY * errorX) / determinant;
  }
  return Number.isFinite(u) && Number.isFinite(v) ? {u, v} : null;
}

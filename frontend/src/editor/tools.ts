import {
  brushFootprintOrigin,
  brushFootprintReach,
  dedupePoints,
  forEachLinePoint,
  normalizeBrushSize,
  normalizeBrushSpacing,
} from "./tools/brush/geometry";
import {MIN_BRUSH_SIZE} from "./tools/brush/constants";
import {
  drawBrush,
  drawBrushLine,
  drawBitmapBrushStroke,
  drawBrushStroke,
  paintPatternPixel,
  resolveDrawingBrushSettings,
  setWrappedPixel,
  snapshotPatternBrush,
} from "./tools/brush/raster";

export {
  MAX_BRUSH_SIZE,
  MIN_BRUSH_SIZE,
} from "./tools/brush/constants";
export type {
  BitmapBrush,
  BrushDynamicsCurve,
  BrushDynamicsOptions,
  BrushDynamicsRange,
  BrushDynamicsSource,
  BrushSettings,
  BrushShape,
  BrushStrokeOptions,
  GradientDither,
  GradientType,
  InkMode,
  PatternAlignment,
  PatternBrush,
  Point,
  PointerDynamicsSample,
  PressureBrushOptions,
  PressureBrushSettings,
  ResolvedBrushDynamics,
  RGBA,
  ShapeFillMode,
} from "./tools/brush/types";
export type {TimedPoint} from "./tools/brush/dynamics";
export {
  applyBrushDynamicsCurve,
  interpolateRGBA,
  normalizeBrushVelocity,
  normalizePressure,
  pointerVelocity,
  pressureToBrushSettings,
  pressureToBrushSize,
  pressureToOpacity,
  resolveBrushDynamics,
  stabilizePointerPoint,
  stabilizeStroke,
} from "./tools/brush/dynamics";
export {
  createBitmapBrush,
  createShapeBitmapBrush,
  isBrushPixel,
  normalizeBrushSize,
  normalizeBrushSpacing,
  pixelPerfectStroke,
  resizeBitmapBrush,
  rotateBitmapBrush,
  simplifyPixelPerfectStroke,
} from "./tools/brush/geometry";
export {
  drawBitmapBrushStroke,
  drawBrushStroke,
  drawPatternBrushStroke,
  resolveBrushSettings,
  stampBitmapBrush,
  stampBrush,
  stampBrushStroke,
  stampPatternBrush,
} from "./tools/brush/raster";

export type ToolID = "pencil" | "eraser" | "eyedropper" | "zoom" | "hand" | "move" | "line" | "rectangle" | "ellipse" | "curve" | "polyline" | "polygon" | "fill" | "gradient" | "spray" | "blur" | "jumble" | "contour" | "replace-color" | "selection" | "transform" | "crop" | "slice" | "text";
import type {
  BrushSettings,
  BrushShape,
  GradientDither,
  GradientType,
  InkMode,
  PatternBrush,
  Point,
  RGBA,
  ResolvedBrushSettings,
  ShapeFillMode,
} from "./tools/brush/types";

export interface ToolGesture {
  tool: ToolID;
  start: Point;
  last: Point;
  before: Uint8ClampedArray;
  constrainLine?: boolean;
  path?: Point[];
  /** Snapshot of the pattern source captured at gesture start. */
  patternBrush?: PatternBrush | null;
  /** First brush footprint's upper-left document coordinate for destination alignment. */
  patternDestination?: Point;
}

export interface ToolContext extends BrushSettings {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  color: RGBA;
  secondaryColor?: RGBA;
  eraserColor?: RGBA;
}

interface DirtyBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ToolResult {
  changed: boolean;
  pickedColor?: RGBA;
  dirtyBounds?: DirtyBounds;
}

export const toolNames: Record<ToolID, string> = {
  pencil: "Pencil",
  eraser: "Eraser",
  eyedropper: "Eyedropper",
  zoom: "Zoom",
  hand: "Hand",
  move: "Move",
  line: "Line",
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  curve: "Curve",
  polyline: "Polyline",
  polygon: "Polygon",
  fill: "Fill",
  gradient: "Gradient",
  spray: "Spray",
  blur: "Blur",
  jumble: "Jumble",
  contour: "Contour",
  "replace-color": "Replace Color",
  selection: "Selection",
  transform: "Transform",
  crop: "Crop",
  slice: "Slice",
  text: "Text",
};

export const toolShortcuts: Record<string, ToolID> = {
  p: "pencil",
  e: "eraser",
  i: "eyedropper",
  z: "zoom",
  h: "hand",
  v: "move",
  l: "line",
  r: "rectangle",
  o: "ellipse",
  q: "curve",
  n: "polyline",
  y: "polygon",
  g: "fill",
  d: "gradient",
  s: "spray",
  b: "blur",
  j: "jumble",
  u: "contour",
  k: "replace-color",
  m: "selection",
  t: "transform",
  c: "crop",
  a: "slice",
  x: "text",
};

export function constrainPointToSquare(start: Point, point: Point): Point {
  const deltaX = point.x - start.x;
  const deltaY = point.y - start.y;
  const side = Math.max(Math.abs(deltaX), Math.abs(deltaY));
  if (side === 0) return {...start};
  return {
    x: start.x + (Math.sign(deltaX) || 1) * side,
    y: start.y + (Math.sign(deltaY) || 1) * side,
  };
}

export function beginTool(context: ToolContext, tool: ToolID, point: Point, constrainLine = false): ToolGesture & ToolResult {
  const gesture: ToolGesture = {
    tool,
    start: point,
    last: point,
    before: context.pixels.slice(),
    constrainLine,
    path: [point],
    ...(context.patternBrush ? {patternBrush: snapshotPatternBrush(context.patternBrush)} : {}),
  };
  const result = applyAtPoint(context, gesture, point, true);
  // applyAtPoint can initialize persistent gesture state (e.g. a pattern's
  // destination origin), so snapshot the gesture only after the first stamp.
  return {...gesture, ...result};
}

export function moveTool(context: ToolContext, gesture: ToolGesture, point: Point): ToolResult {
  const result = applyAtPoint(context, gesture, point, false);
  gesture.last = point;
  return result;
}

export function finishTool(context: ToolContext, gesture: ToolGesture, point: Point): ToolResult {
  if (gesture.last.x === point.x && gesture.last.y === point.y) return {changed: false};
  return moveTool(context, gesture, point);
}

export function floodFill(context: ToolContext, point: Point, replacement: RGBA) {
  if (!isInside(context, point)) return false;
  const startIndex = pixelIndex(context.width, point.x, point.y);
  const target: RGBA = [
    context.pixels[startIndex],
    context.pixels[startIndex + 1],
    context.pixels[startIndex + 2],
    context.pixels[startIndex + 3],
  ];
  if (colorsEqual(target, replacement)) return false;

  // Fill whole horizontal spans at a time. Replacing a pixel immediately also acts as the
  // visited marker, so this avoids allocating a per-pixel visited map and queue.
  const stack: number[] = [point.y * context.width + point.x];
  while (stack.length > 0) {
    const position = stack.pop() as number;
    const y = Math.floor(position / context.width);
    const seedX = position - y * context.width;
    const seedIndex = pixelIndex(context.width, seedX, y);
    if (!pixelMatches(context.pixels, seedIndex, target)) continue;

    let left = seedX;
    let index = seedIndex;
    while (left > 0 && pixelMatches(context.pixels, index - 4, target)) {
      left -= 1;
      index -= 4;
    }

    let right = seedX;
    index = seedIndex;
    while (right + 1 < context.width && pixelMatches(context.pixels, index + 4, target)) {
      right += 1;
      index += 4;
    }

    index = pixelIndex(context.width, left, y);
    for (let x = left; x <= right; x += 1) {
      context.pixels[index] = replacement[0];
      context.pixels[index + 1] = replacement[1];
      context.pixels[index + 2] = replacement[2];
      context.pixels[index + 3] = replacement[3];
      index += 4;
    }

    scanAdjacentRow(y - 1, left, right);
    scanAdjacentRow(y + 1, left, right);
  }
  return true;

  function scanAdjacentRow(y: number, left: number, right: number) {
    if (y < 0 || y >= context.height) return;

    let x = left;
    let index = pixelIndex(context.width, x, y);
    while (x <= right) {
      while (x <= right && !pixelMatches(context.pixels, index, target)) {
        x += 1;
        index += 4;
      }
      if (x > right) return;

      stack.push(y * context.width + x);
      while (x <= right && pixelMatches(context.pixels, index, target)) {
        x += 1;
        index += 4;
      }
    }
  }
}

export function drawRectangle(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  start: Point,
  end: Point,
  color: RGBA,
  brushSize = MIN_BRUSH_SIZE,
  brushShape: BrushShape = "square",
  fillMode: ShapeFillMode = "outline",
  brushSettings?: BrushSettings,
) {
  const settings = resolveDrawingBrushSettings(brushSize, brushShape, brushSettings);
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  if (settings.patternBrush && settings.patternAlignment === "destination" && !settings.patternDestination) {
    settings.patternDestination = brushFootprintOrigin({x: left, y: top}, settings);
  }
  if (fillMode === "filled" || fillMode === "both") {
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        if (settings.patternBrush) {
          paintPatternPixel(pixels, width, height, x, y, color, settings.patternBrush, settings, {x: left, y: top});
        } else {
          setWrappedPixel(pixels, width, height, x, y, color, settings.wrapX, settings.wrapY);
        }
      }
    }
    if (fillMode === "filled") return;
  }
  for (let x = left; x <= right; x += 1) {
    drawBrush(pixels, width, height, x, top, color, settings);
    drawBrush(pixels, width, height, x, bottom, color, settings);
  }
  for (let y = top + 1; y < bottom; y += 1) {
    drawBrush(pixels, width, height, left, y, color, settings);
    drawBrush(pixels, width, height, right, y, color, settings);
  }
}

/** Draw an integer-rasterized ellipse around the supplied inclusive bounding box. */
export function drawEllipseOutline(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  start: Point,
  end: Point,
  color: RGBA,
  brushSize = MIN_BRUSH_SIZE,
  brushShape: BrushShape = "square",
  fillMode: ShapeFillMode = "outline",
  brushSettings?: BrushSettings,
) {
  const settings = resolveDrawingBrushSettings(brushSize, brushShape, brushSettings);
  const left = Math.min(Math.round(start.x), Math.round(end.x));
  const right = Math.max(Math.round(start.x), Math.round(end.x));
  const top = Math.min(Math.round(start.y), Math.round(end.y));
  const bottom = Math.max(Math.round(start.y), Math.round(end.y));
  if (settings.patternBrush && settings.patternAlignment === "destination" && !settings.patternDestination) {
    settings.patternDestination = brushFootprintOrigin({x: left, y: top}, settings);
  }
  if (left === right || top === bottom) {
    drawBrushLine(pixels, width, height, {x: left, y: top}, {x: right, y: bottom}, color, settings);
    return;
  }

  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const radiusX = (right - left) / 2;
  const radiusY = (bottom - top) / 2;
  if (fillMode === "filled" || fillMode === "both") {
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const dx = radiusX === 0 ? 0 : (x - centerX) / radiusX;
        const dy = radiusY === 0 ? 0 : (y - centerY) / radiusY;
        if (dx * dx + dy * dy <= 1 + Number.EPSILON) {
          if (settings.patternBrush) {
            paintPatternPixel(pixels, width, height, x, y, color, settings.patternBrush, settings, {x: left, y: top});
          } else {
            setWrappedPixel(pixels, width, height, x, y, color, settings.wrapX, settings.wrapY);
          }
        }
      }
    }
    if (fillMode === "filled") return;
  }
  const steps = Math.max(8, Math.ceil(2 * Math.PI * Math.max(radiusX, radiusY) * 2));
  let previous = {
    x: Math.round(centerX + radiusX),
    y: Math.round(centerY),
  };
  for (let step = 1; step <= steps; step += 1) {
    const angle = (step / steps) * Math.PI * 2;
    const current = {
      x: Math.round(centerX + radiusX * Math.cos(angle)),
      y: Math.round(centerY + radiusY * Math.sin(angle)),
    };
    drawBrushLine(pixels, width, height, previous, current, color, settings);
    previous = current;
  }
}

/** Compatibility-friendly short name for ellipse outline rasterization. */
export function drawEllipse(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  start: Point,
  end: Point,
  color: RGBA,
  brushSize = MIN_BRUSH_SIZE,
  brushShape: BrushShape = "square",
  fillMode: ShapeFillMode = "outline",
  brushSettings?: BrushSettings,
) {
  drawEllipseOutline(pixels, width, height, start, end, color, brushSize, brushShape, fillMode, brushSettings);
}

export function drawPolylineOutline(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  points: readonly Point[],
  color: RGBA,
  brushSize = MIN_BRUSH_SIZE,
  brushShape: BrushShape = "square",
  closed = false,
  brushSettings?: BrushSettings,
) {
  const settings = resolveDrawingBrushSettings(brushSize, brushShape, brushSettings);
  const path = dedupePoints(points).map((point) => ({x: Math.round(point.x), y: Math.round(point.y)}));
  if (path.length === 0) return;
  if (settings.patternBrush && settings.patternAlignment === "destination" && !settings.patternDestination) {
    settings.patternDestination = brushFootprintOrigin(path[0], settings);
  }
  if (path.length === 1) {
    drawBrush(pixels, width, height, path[0].x, path[0].y, color, settings);
    return;
  }
  for (let index = 1; index < path.length; index += 1) {
    drawBrushLine(pixels, width, height, path[index - 1], path[index], color, settings);
  }
  if (closed) drawBrushLine(pixels, width, height, path[path.length - 1], path[0], color, settings);
}

export function drawPolygonOutline(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  points: readonly Point[],
  color: RGBA,
  brushSize = MIN_BRUSH_SIZE,
  brushShape: BrushShape = "square",
  fillMode: ShapeFillMode = "outline",
  brushSettings?: BrushSettings,
) {
  const settings = resolveDrawingBrushSettings(brushSize, brushShape, brushSettings);
  const normalizedPath = dedupePoints(points).map((point) => ({x: Math.round(point.x), y: Math.round(point.y)}));
  if (settings.patternBrush && settings.patternAlignment === "destination" && normalizedPath.length > 0 && !settings.patternDestination) {
    settings.patternDestination = brushFootprintOrigin(normalizedPath[0], settings);
  }
  if (fillMode === "filled" || fillMode === "both") {
    const path = normalizedPath;
    if (path.length >= 3) {
      const left = Math.max(0, Math.min(...path.map((point) => point.x)));
      const right = Math.min(width - 1, Math.max(...path.map((point) => point.x)));
      const top = Math.max(0, Math.min(...path.map((point) => point.y)));
      const bottom = Math.min(height - 1, Math.max(...path.map((point) => point.y)));
      for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) {
        if (!pointInPolygon(x, y, path)) continue;
        if (settings.patternBrush) {
          paintPatternPixel(pixels, width, height, x, y, color, settings.patternBrush, settings, {x: left, y: top});
        } else {
          setWrappedPixel(pixels, width, height, x, y, color);
        }
      }
    }
    if (fillMode === "filled") return;
  }
  drawPolylineOutline(pixels, width, height, points, color, brushSize, brushShape, true, settings);
}

/** Evaluate a quadratic Bezier at a normalized parameter. */
export function quadraticBezierPoint(start: Point, control: Point, end: Point, t: number): Point {
  const normalizedT = Math.max(0, Math.min(1, t));
  const inverse = 1 - normalizedT;
  return {
    x: inverse * inverse * start.x + 2 * inverse * normalizedT * control.x + normalizedT * normalizedT * end.x,
    y: inverse * inverse * start.y + 2 * inverse * normalizedT * control.y + normalizedT * normalizedT * end.y,
  };
}

/** Return deduplicated integer points sampled densely enough for a pixel-art curve. */
export function rasterizeQuadraticBezier(
  start: Point,
  control: Point,
  end: Point,
  segments?: number,
): Point[] {
  const estimatedLength = Math.hypot(control.x - start.x, control.y - start.y)
    + Math.hypot(end.x - control.x, end.y - control.y);
  const sampleCount = Math.max(1, Math.min(16384, Math.ceil(segments ?? Math.max(estimatedLength * 2, 1))));
  const result: Point[] = [];
  for (let index = 0; index <= sampleCount; index += 1) {
    const point = quadraticBezierPoint(start, control, end, index / sampleCount);
    const rounded = {x: Math.round(point.x), y: Math.round(point.y)};
    const previous = result[result.length - 1];
    if (!previous || previous.x !== rounded.x || previous.y !== rounded.y) result.push(rounded);
  }
  return result;
}

export function drawQuadraticBezier(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  start: Point,
  control: Point,
  end: Point,
  color: RGBA,
  brushSize = MIN_BRUSH_SIZE,
  brushShape: BrushShape = "square",
  segments?: number,
  brushSettings?: BrushSettings,
) {
  drawPolylineOutline(pixels, width, height, rasterizeQuadraticBezier(start, control, end, segments), color, brushSize, brushShape, false, brushSettings);
}

/** Draw a sampled multi-point curve using a Catmull-Rom spline. */
export function drawPolylineCurve(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  points: readonly Point[],
  color: RGBA,
  brushSize = MIN_BRUSH_SIZE,
  brushShape: BrushShape = "square",
  brushSettings?: BrushSettings,
) {
  const path = dedupePoints(points);
  if (path.length < 2) {
    if (path.length === 1) drawBrush(pixels, width, height, path[0].x, path[0].y, color, resolveDrawingBrushSettings(brushSize, brushShape, brushSettings));
    return;
  }
  const sampled: Point[] = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const p0 = path[Math.max(0, index - 1)];
    const p1 = path[index];
    const p2 = path[index + 1];
    const p3 = path[Math.min(path.length - 1, index + 2)];
    const segments = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) * 2));
    for (let step = 0; step < segments; step += 1) {
      const t = step / segments;
      const t2 = t * t;
      const t3 = t2 * t;
      sampled.push({
        x: Math.round(0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3)),
        y: Math.round(0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)),
      });
    }
  }
  sampled.push(path[path.length - 1]);
  drawPolylineOutline(pixels, width, height, sampled, color, brushSize, brushShape, false, brushSettings);
}

export function drawQuadraticBezierCurve(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  start: Point,
  control: Point,
  end: Point,
  color: RGBA,
  brushSize = MIN_BRUSH_SIZE,
  brushShape: BrushShape = "square",
  segments?: number,
  brushSettings?: BrushSettings,
) {
  drawQuadraticBezier(pixels, width, height, start, control, end, color, brushSize, brushShape, segments, brushSettings);
}

/**
 * Return boundary pixels for the target-colored connected component containing `start`.
 * Results are deterministic row-major boundary pixels; they are suitable for contour display,
 * selection masks, or a subsequent color replacement operation.
 */
export function traceFloodBoundary(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  start: Point,
  connectivity: 4 | 8 = 4,
): Point[] {
  const startX = Math.round(start.x);
  const startY = Math.round(start.y);
  if (!validPixelBuffer(pixels, width, height) || startX < 0 || startY < 0 || startX >= width || startY >= height) return [];

  const targetIndex = pixelIndex(width, startX, startY);
  const target: RGBA = [pixels[targetIndex], pixels[targetIndex + 1], pixels[targetIndex + 2], pixels[targetIndex + 3]];
  const visited = new Uint8Array(width * height);
  const queue: number[] = [startY * width + startX];
  visited[startY * width + startX] = 1;
  const regionDirections = connectivity === 8 ? NEIGHBOR_DIRECTIONS_8 : NEIGHBOR_DIRECTIONS_4;
  const boundary: Point[] = [];

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const position = queue[queueIndex];
    const y = Math.floor(position / width);
    const x = position - y * width;
    let isBoundary = false;
    for (const [offsetX, offsetY] of regionDirections) {
      const neighborX = x + offsetX;
      const neighborY = y + offsetY;
      if (neighborX < 0 || neighborY < 0 || neighborX >= width || neighborY >= height) {
        isBoundary = true;
        continue;
      }
      const neighborIndex = pixelIndex(width, neighborX, neighborY);
      if (!pixelMatches(pixels, neighborIndex, target)) {
        isBoundary = true;
      } else {
        const queuePosition = neighborY * width + neighborX;
        if (!visited[queuePosition]) {
          visited[queuePosition] = 1;
          queue.push(queuePosition);
        }
      }
    }
    if (isBoundary) boundary.push({x, y});
  }
  return boundary;
}

export function traceContour(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  start: Point,
  connectivity: 4 | 8 = 4,
) {
  return traceFloodBoundary(pixels, width, height, start, connectivity);
}

/** Replace exact RGBA matches and return the number of changed pixels. */
export function replaceColor(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  target: RGBA,
  replacement: RGBA,
  bounds?: {x: number; y: number; width: number; height: number},
): number {
  if (!validPixelBuffer(pixels, width, height) || colorsEqual(target, replacement)) return 0;
  const left = Math.max(0, Math.floor(bounds?.x ?? 0));
  const top = Math.max(0, Math.floor(bounds?.y ?? 0));
  const right = Math.min(width, Math.ceil((bounds?.x ?? 0) + (bounds?.width ?? width)));
  const bottom = Math.min(height, Math.ceil((bounds?.y ?? 0) + (bounds?.height ?? height)));
  let changed = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const index = pixelIndex(width, x, y);
      if (!pixelMatches(pixels, index, target)) continue;
      pixels[index] = replacement[0];
      pixels[index + 1] = replacement[1];
      pixels[index + 2] = replacement[2];
      pixels[index + 3] = replacement[3];
      changed += 1;
    }
  }
  return changed;
}

function applyBrushStroke(
  context: ToolContext,
  gesture: ToolGesture,
  point: Point,
  starting: boolean,
  color: RGBA,
  usePattern = true,
): ToolResult {
  const brush = resolveGestureBrushSettings(context, gesture, usePattern);
  const bitmapBrush = brush.bitmapBrush ?? null;
  brush.bitmapBrush = bitmapBrush;
  setGesturePatternDestination(gesture, brush, point);
  brush.patternDestination = gesture.patternDestination;
  const spacing = normalizeBrushSpacing(context.brushSpacing);
  gesture.path ??= [gesture.start];
  if (!starting) gesture.path.push(point);

  const previewPath = gesture.constrainLine && !starting ? [gesture.start, point] : gesture.path;
  const redrawStroke = gesture.constrainLine || context.pixelPerfect || spacing > 1;
  if (redrawStroke) {
    context.pixels.set(gesture.before);
    if (bitmapBrush) {
      drawBitmapBrushStroke(context.pixels, context.width, context.height, previewPath, color, bitmapBrush, {
        spacing,
        pixelPerfect: context.pixelPerfect,
        wrapX: context.wrapX,
        wrapY: context.wrapY,
        patternBrush: brush.patternBrush,
        patternAlignment: brush.patternAlignment,
        patternOrigin: brush.patternOrigin,
        patternDestination: brush.patternDestination,
      });
    } else {
      drawBrushStroke(
        context.pixels,
        context.width,
        context.height,
        previewPath,
        color,
        brush.size,
        brush.shape,
        {
          spacing,
          pixelPerfect: context.pixelPerfect,
          wrapX: context.wrapX,
          wrapY: context.wrapY,
          patternBrush: brush.patternBrush,
          patternAlignment: brush.patternAlignment,
          patternOrigin: brush.patternOrigin,
          patternDestination: brush.patternDestination,
        },
      );
    }
    return {changed: true, dirtyBounds: {x: 0, y: 0, width: context.width, height: context.height}};
  }

  if (bitmapBrush) {
    drawBitmapBrushStroke(
      context.pixels,
      context.width,
      context.height,
      starting ? [point] : [gesture.last, point],
      color,
      bitmapBrush,
      {
        wrapX: context.wrapX,
        wrapY: context.wrapY,
        patternBrush: brush.patternBrush,
        patternAlignment: brush.patternAlignment,
        patternOrigin: brush.patternOrigin,
        patternDestination: brush.patternDestination,
      },
    );
    return {
      changed: true,
      dirtyBounds: brushLineBounds(context, gesture.last, point, brush),
    };
  }
  if (starting) drawBrush(context.pixels, context.width, context.height, point.x, point.y, color, brush);
  else drawBrushLine(context.pixels, context.width, context.height, gesture.last, point, color, brush);
  return {changed: true, dirtyBounds: brushLineBounds(context, gesture.last, point, brush)};
}

function applyAtPoint(context: ToolContext, gesture: ToolGesture, point: Point, starting: boolean): ToolResult {
  const brush = resolveGestureBrushSettings(context, gesture, supportsPattern(gesture.tool));
  switch (gesture.tool) {
    case "pencil":
      return applyBrushStroke(context, gesture, point, starting, context.color);
    case "eraser":
      return applyBrushStroke(context, gesture, point, starting, context.eraserColor ?? [0, 0, 0, 0], false);
    case "eyedropper":
      return {changed: false, pickedColor: readPixel(context, point)};
    case "zoom":
    case "hand":
    case "move":
    case "slice":
      return {changed: false};
    case "line":
      context.pixels.set(gesture.before);
      setGesturePatternDestination(gesture, brush, gesture.start);
      brush.patternDestination = gesture.patternDestination;
      drawBrushLine(context.pixels, context.width, context.height, gesture.start, point, context.color, brush);
      // A preview restores the original buffer. Full invalidation clears every line that may
      // have reached the display before rapid pointer events were coalesced into one render.
      return {changed: true, dirtyBounds: {x: 0, y: 0, width: context.width, height: context.height}};
    case "rectangle":
      context.pixels.set(gesture.before);
      setGesturePatternDestination(gesture, brush, {
        x: Math.min(gesture.start.x, point.x),
        y: Math.min(gesture.start.y, point.y),
      });
      brush.patternDestination = gesture.patternDestination;
      drawRectangle(context.pixels, context.width, context.height, gesture.start, point, context.color, brush.size, brush.shape, context.shapeFillMode, brush);
      return {changed: true, dirtyBounds: brushLineBounds(context, gesture.start, point, brush, gesture.last)};
    case "ellipse":
      context.pixels.set(gesture.before);
      setGesturePatternDestination(gesture, brush, {
        x: Math.min(Math.round(gesture.start.x), Math.round(point.x)),
        y: Math.min(Math.round(gesture.start.y), Math.round(point.y)),
      });
      brush.patternDestination = gesture.patternDestination;
      drawEllipseOutline(context.pixels, context.width, context.height, gesture.start, point, context.color, brush.size, brush.shape, context.shapeFillMode, brush);
      return {changed: true, dirtyBounds: {x: 0, y: 0, width: context.width, height: context.height}};
    case "spray": {
      const from = starting ? point : gesture.last;
      const seed = gesture.path?.length ?? 0;
      forEachGestureSample(from, point, starting, (sample) => {
        sprayPaint(context.pixels, context.width, context.height, sample, context.color, brush.size, seed, context.wrapX, context.wrapY);
      });
      gesture.path?.push(point);
      return {changed: true, dirtyBounds: brushLineBounds(context, from, point, brush.size)};
    }
    case "blur": {
      const from = starting ? point : gesture.last;
      let changed = false;
      let dirtyBounds: DirtyBounds | undefined;
      forEachGestureSample(from, point, starting, (sample) => {
        const result = blurPixelsInPlace(context.pixels, context.width, context.height, sample, context.blurRadius ?? brush.size);
        changed = result.changed || changed;
        dirtyBounds = mergeDirtyBounds(dirtyBounds, result.bounds);
      });
      gesture.path?.push(point);
      return {changed, dirtyBounds: dirtyBounds ?? emptyDirtyBounds()};
    }
    case "jumble": {
      const from = starting ? point : gesture.last;
      const seed = gesture.path?.length ?? 0;
      let changed = false;
      let dirtyBounds: DirtyBounds | undefined;
      forEachGestureSample(from, point, starting, (sample) => {
        const result = jumblePixelsInPlace(context.pixels, context.width, context.height, sample, context.jumbleAmount ?? brush.size, seed);
        changed = result.changed || changed;
        dirtyBounds = mergeDirtyBounds(dirtyBounds, result.bounds);
      });
      gesture.path?.push(point);
      return {changed, dirtyBounds: dirtyBounds ?? emptyDirtyBounds()};
    }
    case "contour": {
      if (!starting) return {changed: false};
      const boundary = traceFloodBoundary(context.pixels, context.width, context.height, point, 8);
      if (boundary.length > 0) setGesturePatternDestination(gesture, brush, boundary[0]);
      brush.patternDestination = gesture.patternDestination;
      for (const boundaryPoint of boundary) drawBrush(context.pixels, context.width, context.height, boundaryPoint.x, boundaryPoint.y, context.color, brush);
      return {changed: boundary.length > 0, dirtyBounds: {x: 0, y: 0, width: context.width, height: context.height}};
    }
    case "replace-color": {
      if (!starting) return {changed: false};
      const target = readPixel(context, point);
      const changed = target ? replaceColor(context.pixels, context.width, context.height, target, context.color) : 0;
      return {changed: changed > 0, dirtyBounds: {x: 0, y: 0, width: context.width, height: context.height}};
    }
    case "gradient":
      context.pixels.set(gesture.before);
      drawGradient(context.pixels, context.width, context.height, gesture.start, point, context.color, context.secondaryColor ?? [0, 0, 0, 0], context.gradientType, context.gradientDither);
      return {changed: true, dirtyBounds: {x: 0, y: 0, width: context.width, height: context.height}};
    case "curve":
      context.pixels.set(gesture.before);
      if (!starting) gesture.path?.push(point);
      setGesturePatternDestination(gesture, brush, gesture.start);
      brush.patternDestination = gesture.patternDestination;
      drawPolylineCurve(context.pixels, context.width, context.height, gesture.path ?? [gesture.start, point], context.color, brush.size, brush.shape, brush);
      return {changed: true, dirtyBounds: {x: 0, y: 0, width: context.width, height: context.height}};
    case "polyline":
      context.pixels.set(gesture.before);
      if (!starting) gesture.path?.push(point);
      setGesturePatternDestination(gesture, brush, gesture.start);
      brush.patternDestination = gesture.patternDestination;
      drawPolylineOutline(context.pixels, context.width, context.height, gesture.path ?? [gesture.start, point], context.color, brush.size, brush.shape, false, brush);
      return {changed: true, dirtyBounds: {x: 0, y: 0, width: context.width, height: context.height}};
    case "polygon": {
      context.pixels.set(gesture.before);
      const points = regularPolygonPoints(gesture.start, point, context.polygonSides);
      if (points.length > 0) setGesturePatternDestination(gesture, brush, points[0]);
      brush.patternDestination = gesture.patternDestination;
      drawPolygonOutline(context.pixels, context.width, context.height, points, context.color, brush.size, brush.shape, context.shapeFillMode, brush);
      return {changed: true, dirtyBounds: {x: 0, y: 0, width: context.width, height: context.height}};
    }
    case "fill":
      return {
        changed: starting && floodFill(context, point, context.color),
        dirtyBounds: {x: 0, y: 0, width: context.width, height: context.height},
      };
    case "selection":
    case "transform":
    case "crop":
    case "text":
      return {changed: false};
  }
  return {changed: false};
}

/** Tools whose raster operation consumes a repeating pattern brush. */
export const patternBrushTools: ReadonlySet<ToolID> = new Set([
  "pencil",
  "line",
  "rectangle",
  "ellipse",
  "curve",
  "polyline",
  "polygon",
  "contour",
]);

export function supportsPattern(tool: ToolID) {
  return patternBrushTools.has(tool);
}

export function regularPolygonPoints(center: Point, edge: Point, sides = 5) {
  const count = Math.max(3, Math.min(32, Math.round(Number.isFinite(sides) ? sides : 5)));
  const radius = Math.hypot(edge.x - center.x, edge.y - center.y);
  const startAngle = Math.atan2(edge.y - center.y, edge.x - center.x);
  return Array.from({length: count}, (_, index) => ({
    x: Math.round(center.x + Math.cos(startAngle + index * Math.PI * 2 / count) * radius),
    y: Math.round(center.y + Math.sin(startAngle + index * Math.PI * 2 / count) * radius),
  }));
}

export function drawLinearGradient(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  start: Point,
  end: Point,
  first: RGBA,
  second: RGBA,
  dither: GradientDither = "none",
) {
  drawGradient(pixels, width, height, start, end, first, second, "linear", dither);
}

/** Rasterize the gradient modes used by Aseprite-style gradient tools. */
export function drawGradient(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  start: Point,
  end: Point,
  first: RGBA,
  second: RGBA,
  type: GradientType = "linear",
  dither: GradientDither = "none",
) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const length = Math.sqrt(lengthSquared);
  const angle = Math.atan2(deltaY, deltaX);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - start.x;
      const dy = y - start.y;
      let ratio: number;
      if (type === "radial") {
        ratio = length === 0 ? 0 : Math.hypot(dx, dy) / length;
      } else if (type === "angular") {
        ratio = ((Math.atan2(dy, dx) - angle) / (Math.PI * 2) + 1) % 1;
      } else if (type === "reflected") {
        const projected = lengthSquared === 0 ? 0 : (dx * deltaX + dy * deltaY) / lengthSquared;
        ratio = Math.abs(projected);
      } else if (type === "diamond") {
        ratio = length === 0 ? 0 : (Math.abs(dx * Math.cos(angle) + dy * Math.sin(angle)) + Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle))) / length;
      } else {
        ratio = lengthSquared === 0 ? 0 : (dx * deltaX + dy * deltaY) / lengthSquared;
      }
      ratio = Math.max(0, Math.min(1, ratio));
      if (dither === "ordered") {
        const bayer4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
        ratio = Math.max(0, Math.min(1, ratio + (bayer4[(y & 3) * 4 + (x & 3)] / 16 - 0.5) / 32));
      }
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        pixels[offset + channel] = Math.round(first[channel] + (second[channel] - first[channel]) * ratio);
      }
    }
  }
}

export function drawRadialGradient(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  start: Point,
  end: Point,
  first: RGBA,
  second: RGBA,
  dither: GradientDither = "none",
) {
  drawGradient(pixels, width, height, start, end, first, second, "radial", dither);
}

/** Blur a circular brush area in place. The source is snapshotted per call. */
export function blurPixelsInPlace(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  center: Point,
  radius = 2,
) {
  const r = Math.max(1, Math.min(64, Math.round(radius)));
  const before = pixels.slice();
  const left = Math.max(0, Math.floor(center.x - r));
  const right = Math.min(width - 1, Math.ceil(center.x + r));
  const top = Math.max(0, Math.floor(center.y - r));
  const bottom = Math.min(height - 1, Math.ceil(center.y + r));
  const bounds = {
    x: left,
    y: top,
    width: Math.max(0, right - left + 1),
    height: Math.max(0, bottom - top + 1),
  };
  if (bounds.width === 0 || bounds.height === 0) return {changed: false, bounds};
  let changed = false;
  for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) {
    if (Math.hypot(x - center.x, y - center.y) > r) continue;
    let count = 0;
    const sum = [0, 0, 0, 0];
    for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
      const sx = x + ox;
      const sy = y + oy;
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      const source = (sy * width + sx) * 4;
      for (let channel = 0; channel < 4; channel += 1) sum[channel] += before[source + channel];
      count += 1;
    }
    const target = (y * width + x) * 4;
    for (let channel = 0; channel < 4; channel += 1) {
      const value = Math.round(sum[channel] / count);
      changed = changed || value !== pixels[target + channel];
      pixels[target + channel] = value;
    }
  }
  return {changed, bounds};
}

/** Deterministically displace pixels inside a circular brush area. */
export function jumblePixelsInPlace(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  center: Point,
  radius = 4,
  seed = 0,
) {
  const r = Math.max(1, Math.min(64, Math.round(radius)));
  const before = pixels.slice();
  const left = Math.max(0, Math.floor(center.x - r));
  const right = Math.min(width - 1, Math.ceil(center.x + r));
  const top = Math.max(0, Math.floor(center.y - r));
  const bottom = Math.min(height - 1, Math.ceil(center.y + r));
  const bounds = {
    x: left,
    y: top,
    width: Math.max(0, right - left + 1),
    height: Math.max(0, bottom - top + 1),
  };
  if (bounds.width === 0 || bounds.height === 0) return {changed: false, bounds};
  const points: Point[] = [];
  for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) if (Math.hypot(x - center.x, y - center.y) <= r) points.push({x, y});
  const shuffled = points.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const random = hashUnit(seed + index * 92821 + center.x * 68917 + center.y * 31337);
    const swap = Math.floor(random * (index + 1));
    const temporary = shuffled[index];
    shuffled[index] = shuffled[swap];
    shuffled[swap] = temporary;
  }
  for (let index = 0; index < points.length; index += 1) {
    const source = shuffled[index];
    const target = points[index];
    const sourceOffset = (source.y * width + source.x) * 4;
    const targetOffset = (target.y * width + target.x) * 4;
    for (let channel = 0; channel < 4; channel += 1) pixels[targetOffset + channel] = before[sourceOffset + channel];
  }
  let changed = false;
  for (const point of points) {
    const offset = (point.y * width + point.x) * 4;
    for (let channel = 0; channel < 4; channel += 1) changed = changed || pixels[offset + channel] !== before[offset + channel];
  }
  return {changed, bounds};
}

/** Apply an Aseprite-style ink rule to pixels already produced by a tool preview. */
export function applyInkMode(
  pixels: Uint8ClampedArray,
  before: Uint8ClampedArray,
  width: number,
  height: number,
  mode: InkMode,
  bounds?: {x: number; y: number; width: number; height: number},
) {
  if (pixels.length !== before.length || pixels.length !== width * height * 4 || mode === "simple" || mode === "copy-alpha") return;
  const left = Math.max(0, Math.floor(bounds?.x ?? 0));
  const top = Math.max(0, Math.floor(bounds?.y ?? 0));
  const right = Math.min(width, Math.ceil((bounds?.x ?? 0) + (bounds?.width ?? width)));
  const bottom = Math.min(height, Math.ceil((bounds?.y ?? 0) + (bounds?.height ?? height)));
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    const offset = (y * width + x) * 4;
    if (pixels[offset] === before[offset] && pixels[offset + 1] === before[offset + 1]
      && pixels[offset + 2] === before[offset + 2] && pixels[offset + 3] === before[offset + 3]) continue;
    if (mode === "lock-alpha") {
      const alpha = before[offset + 3];
      if (alpha === 0 || pixels[offset + 3] === 0) {
        pixels.set(before.subarray(offset, offset + 4), offset);
      } else {
        pixels[offset + 3] = alpha;
      }
      continue;
    }
    const sourceAlpha = pixels[offset + 3] / 255;
    const destinationAlpha = before[offset + 3] / 255;
    const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
    if (outputAlpha <= 0) {
      pixels.fill(0, offset, offset + 4);
      continue;
    }
    for (let channel = 0; channel < 3; channel += 1) {
      pixels[offset + channel] = Math.round((pixels[offset + channel] * sourceAlpha
        + before[offset + channel] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
    }
    pixels[offset + 3] = Math.round(outputAlpha * 255);
  }
}

export function sprayPaint(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  point: Point,
  color: RGBA,
  radius: number,
  seed = 0,
  wrapX = false,
  wrapY = false,
) {
  const normalizedRadius = Math.max(1, normalizeBrushSize(radius));
  const count = Math.max(2, Math.round(normalizedRadius * 1.5));
  for (let index = 0; index < count; index += 1) {
    const first = hashUnit(point.x * 73856093 + point.y * 19349663 + seed * 83492791 + index * 2654435761);
    const second = hashUnit(point.y * 83492791 + point.x * 19349663 + seed * 2654435761 + index * 97531);
    const distance = Math.sqrt(first) * normalizedRadius / 2;
    const angle = second * Math.PI * 2;
    setWrappedPixel(pixels, width, height, Math.round(point.x + Math.cos(angle) * distance), Math.round(point.y + Math.sin(angle) * distance), color, wrapX, wrapY);
  }
}

function hashUnit(value: number) {
  const sine = Math.sin(value) * 43758.5453123;
  return sine - Math.floor(sine);
}

function brushLineBounds(
  context: ToolContext,
  from: Point,
  to: Point,
  brush: number | ResolvedBrushSettings,
  previous?: Point,
) {
  const points = (previous ? [from, to, previous] : [from, to]).map((point) => ({
    x: Math.round(point.x),
    y: Math.round(point.y),
  }));
  const reach = brushFootprintReach(brush);
  // Keep a square envelope for bitmap brushes as well as their real asymmetric
  // footprint. This is intentionally conservative so a rotated preview cannot
  // leave stale pixels outside the incremental redraw region.
  const left = Math.max(0, Math.min(...points.map((point) => point.x - reach.left)));
  const top = Math.max(0, Math.min(...points.map((point) => point.y - reach.top)));
  const right = Math.min(context.width, Math.max(...points.map((point) => point.x + reach.right + 1)));
  const bottom = Math.min(context.height, Math.max(...points.map((point) => point.y + reach.bottom + 1)));
  return {x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top)};
}

function resolveGestureBrushSettings(
  context: ToolContext,
  gesture: ToolGesture,
  usePattern: boolean,
): ResolvedBrushSettings {
  const patternBrush = usePattern
    ? (gesture.patternBrush === undefined ? context.patternBrush : gesture.patternBrush)
    : null;
  const settings = resolveDrawingBrushSettings(context.brushSize ?? MIN_BRUSH_SIZE, context.brushShape ?? "square", {
    ...context,
    patternBrush,
  });
  if (settings.patternBrush && settings.patternAlignment === "destination" && gesture.patternDestination) {
    settings.patternDestination = {...gesture.patternDestination};
  }
  return settings;
}

function setGesturePatternDestination(
  gesture: ToolGesture,
  settings: ResolvedBrushSettings,
  firstStampPoint: Point,
) {
  if (!settings.patternBrush || settings.patternAlignment !== "destination") return;
  if (!gesture.patternDestination) gesture.patternDestination = brushFootprintOrigin(firstStampPoint, settings);
}

function forEachGestureSample(
  from: Point,
  to: Point,
  starting: boolean,
  callback: (point: Point) => void,
) {
  if (starting) {
    callback(to);
    return;
  }
  let skipStart = true;
  forEachLinePoint(from, to, (x, y) => {
    if (skipStart) {
      skipStart = false;
      return;
    }
    callback({x, y});
  });
}

function emptyDirtyBounds(): DirtyBounds {
  return {x: 0, y: 0, width: 0, height: 0};
}

function mergeDirtyBounds(current: DirtyBounds | undefined, next: DirtyBounds): DirtyBounds | undefined {
  if (next.width <= 0 || next.height <= 0) return current;
  if (!current || current.width <= 0 || current.height <= 0) return {...next};
  const left = Math.min(current.x, next.x);
  const top = Math.min(current.y, next.y);
  const right = Math.max(current.x + current.width, next.x + next.width);
  const bottom = Math.max(current.y + current.height, next.y + next.height);
  return {x: left, y: top, width: right - left, height: bottom - top};
}

function readPixel(context: ToolContext, point: Point): RGBA | undefined {
  if (!isInside(context, point)) return undefined;
  const index = pixelIndex(context.width, point.x, point.y);
  return [
    context.pixels[index],
    context.pixels[index + 1],
    context.pixels[index + 2],
    context.pixels[index + 3],
  ];
}

function isInside(context: ToolContext, point: Point) {
  return point.x >= 0 && point.y >= 0 && point.x < context.width && point.y < context.height;
}

function pixelIndex(width: number, x: number, y: number) {
  return (y * width + x) * 4;
}

function colorsEqual(left: RGBA, right: RGBA) {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2] && left[3] === right[3];
}

function pixelMatches(pixels: Uint8ClampedArray, index: number, color: RGBA) {
  return pixels[index] === color[0]
    && pixels[index + 1] === color[1]
    && pixels[index + 2] === color[2]
    && pixels[index + 3] === color[3];
}

const NEIGHBOR_DIRECTIONS_4: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

const NEIGHBOR_DIRECTIONS_8: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

function validPixelBuffer(pixels: Uint8ClampedArray, width: number, height: number) {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && pixels.length >= width * height * 4;
}

function pointInPolygon(x: number, y: number, points: readonly Point[]) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const current = points[index];
    const prior = points[previous];
    const intersects = ((current.y > y) !== (prior.y > y))
      && (x < (prior.x - current.x) * (y - current.y) / ((prior.y - current.y) || Number.EPSILON) + current.x);
    if (intersects) inside = !inside;
  }
  return inside;
}

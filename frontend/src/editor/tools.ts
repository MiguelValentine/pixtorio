import {drawLine, setPixel} from "./pixels";

export type ToolID = "pencil" | "eraser" | "eyedropper" | "zoom" | "hand" | "move" | "line" | "rectangle" | "ellipse" | "curve" | "polyline" | "polygon" | "fill" | "gradient" | "spray" | "blur" | "jumble" | "contour" | "replace-color" | "selection" | "transform" | "crop" | "slice" | "text";
export type RGBA = readonly [number, number, number, number];
export type BrushShape = "square" | "circle" | "cross" | "diamond";
export type InkMode = "simple" | "alpha-composite" | "copy-alpha" | "lock-alpha";
export type GradientDither = "none" | "ordered";
export type ShapeFillMode = "outline" | "filled" | "both";
export type GradientType = "linear" | "radial" | "angular" | "reflected" | "diamond";
export type PatternAlignment = "source" | "canvas" | "destination";

/** A binary bitmap brush. `anchorX`/`anchorY` identify the cursor pixel in the mask. */
export interface BitmapBrush {
  readonly width: number;
  readonly height: number;
  readonly mask: Uint8Array;
  readonly anchorX: number;
  readonly anchorY: number;
}

/** An RGBA texture used by a pattern brush. `sourceX`/`sourceY` are document-space origins. */
export interface PatternBrush {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  sourceX: number;
  sourceY: number;
}

export interface BrushStrokeOptions {
  /** Distance in document pixels between bitmap-brush stamps. Defaults to one pixel. */
  spacing?: number;
  /** Collapse consecutive pixels travelling in the same integer direction before stamping. */
  pixelPerfect?: boolean;
  /** Wrap brush pixels crossing the document boundary back onto the opposite edge. */
  wrapX?: boolean;
  wrapY?: boolean;
  /** Paint the brush footprint with a repeating RGBA texture. */
  patternBrush?: PatternBrush | null;
  patternAlignment?: PatternAlignment;
  patternOrigin?: Point;
  /** Stable destination-space pattern origin used while redrawing one gesture. */
  patternDestination?: Point;
}

export interface PressureBrushOptions {
  minSize?: number;
  maxSize?: number;
  minOpacity?: number;
  maxOpacity?: number;
}

export interface PressureBrushSettings {
  pressure: number;
  size: number;
  opacity: number;
}

export type BrushDynamicsSource = "pressure" | "velocity";
export type BrushDynamicsCurve = "linear" | "ease-in" | "ease-out" | "smoothstep";

export interface BrushDynamicsRange {
  enabled: boolean;
  source: BrushDynamicsSource;
  min: number;
  max: number;
  threshold: number;
  invert: boolean;
  curve: BrushDynamicsCurve;
}

export interface BrushDynamicsOptions {
  size: BrushDynamicsRange;
  opacity: BrushDynamicsRange;
  angle: BrushDynamicsRange;
  gradient: BrushDynamicsRange;
}

export interface PointerDynamicsSample {
  pressure?: number;
  /** Document pixels per millisecond. */
  velocity?: number;
}

export interface ResolvedBrushDynamics {
  size: number;
  opacity: number;
  angle: number;
  gradient: number;
}

export const MIN_BRUSH_SIZE = 1;
export const MAX_BRUSH_SIZE = 64;

/** Optional brush controls accepted by drawing tools. Omitted values use the pixel-pencil defaults. */
export interface BrushSettings {
  brushSize?: number;
  brushShape?: BrushShape;
  bitmapBrush?: BitmapBrush | null;
  /** The caller already resized/rotated this bitmap to its final footprint. */
  bitmapBrushPrepared?: boolean;
  patternBrush?: PatternBrush | null;
  patternAlignment?: PatternAlignment;
  patternOrigin?: Point;
  brushSpacing?: number;
  pixelPerfect?: boolean;
  polygonSides?: number;
  gradientDither?: GradientDither;
  shapeFillMode?: ShapeFillMode;
  gradientType?: GradientType;
  blurRadius?: number;
  jumbleAmount?: number;
  wrapX?: boolean;
  wrapY?: boolean;
}

export interface Point {
  x: number;
  y: number;
}

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

export interface ToolResult {
  changed: boolean;
  pickedColor?: RGBA;
  dirtyBounds?: {x: number; y: number; width: number; height: number};
}

interface ResolvedBrushSettings {
  size: number;
  shape: BrushShape;
  wrapX?: boolean;
  wrapY?: boolean;
  bitmapBrush?: BitmapBrush | null;
  /** The bitmap footprint has already been sized/rotated by the caller. */
  bitmapBrushPrepared?: boolean;
  patternBrush?: PatternBrush | null;
  patternAlignment?: PatternAlignment;
  patternOrigin?: Point;
  patternDestination?: Point;
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

/** Stamp one bitmap brush and return the number of pixels that actually changed. */
export function stampBitmapBrush(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  point: Point,
  color: RGBA,
  brush: BitmapBrush,
  wrapX = false,
  wrapY = false,
): number {
  let changed = 0;
  const centerX = Math.round(point.x);
  const centerY = Math.round(point.y);
  for (let brushY = 0; brushY < brush.height; brushY += 1) {
    const rawY = centerY - brush.anchorY + brushY;
    if (!wrapY && (rawY < 0 || rawY >= height)) continue;
    const y = wrapY ? modulo(rawY, height) : rawY;
    for (let brushX = 0; brushX < brush.width; brushX += 1) {
      if (!brush.mask[brushY * brush.width + brushX]) continue;
      const rawX = centerX - brush.anchorX + brushX;
      if (!wrapX && (rawX < 0 || rawX >= width)) continue;
      const x = wrapX ? modulo(rawX, width) : rawX;
      const index = pixelIndex(width, x, y);
      if (pixels[index] === color[0]
        && pixels[index + 1] === color[1]
        && pixels[index + 2] === color[2]
        && pixels[index + 3] === color[3]) continue;
      pixels[index] = color[0];
      pixels[index + 1] = color[1];
      pixels[index + 2] = color[2];
      pixels[index + 3] = color[3];
      changed += 1;
    }
  }
  return changed;
}

/** Stamp a bitmap or procedural footprint with a repeating RGBA pattern. */
export function stampPatternBrush(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  point: Point,
  color: RGBA,
  patternBrush: PatternBrush,
  settings: BrushSettings = {},
): number {
  const resolved = resolveDrawingBrushSettings(settings.brushSize ?? MIN_BRUSH_SIZE, settings.brushShape ?? "square", {
    ...settings,
    patternBrush,
  });
  if (resolved.patternBrush && resolved.patternAlignment === "destination" && !resolved.patternDestination) {
    resolved.patternDestination = brushFootprintOrigin(point, resolved);
  }
  if (resolved.bitmapBrush) {
    return stampBitmapBrushWithSettings(pixels, width, height, point, color, resolved.bitmapBrush, resolved);
  }
  return drawBrush(pixels, width, height, point.x, point.y, color, resolved);
}

function stampBitmapBrushWithSettings(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  point: Point,
  color: RGBA,
  brush: BitmapBrush,
  settings: ResolvedBrushSettings,
): number {
  if (!settings.patternBrush) {
    return stampBitmapBrush(pixels, width, height, point, color, brush, settings.wrapX, settings.wrapY);
  }

  const centerX = Math.round(point.x);
  const centerY = Math.round(point.y);
  const origin = {x: centerX - brush.anchorX, y: centerY - brush.anchorY};
  let changed = 0;
  for (let brushY = 0; brushY < brush.height; brushY += 1) {
    const rawY = origin.y + brushY;
    for (let brushX = 0; brushX < brush.width; brushX += 1) {
      if (!brush.mask[brushY * brush.width + brushX]) continue;
      changed += paintPatternPixel(
        pixels,
        width,
        height,
        origin.x + brushX,
        rawY,
        color,
        settings.patternBrush,
        settings,
        origin,
      );
    }
  }
  return changed;
}

function isValidPatternBrush(pattern: PatternBrush | null | undefined): pattern is PatternBrush {
  return Boolean(pattern)
    && Number.isInteger(pattern!.width)
    && Number.isInteger(pattern!.height)
    && pattern!.width > 0
    && pattern!.height > 0
    && pattern!.pixels instanceof Uint8ClampedArray
    && pattern!.pixels.length >= pattern!.width * pattern!.height * 4;
}

/** Clone texture data at the tool boundary so a source buffer can never alias the destination. */
function snapshotPatternBrush(pattern: PatternBrush | null | undefined): PatternBrush | null {
  if (!isValidPatternBrush(pattern)) return null;
  const sourcePixels = pattern.pixels;
  // Always snapshot: this also handles a shared ArrayBuffer/view and keeps later gesture writes
  // independent if a caller reuses or mutates its selection buffer.
  return {
    width: pattern.width,
    height: pattern.height,
    pixels: sourcePixels.slice(0, pattern.width * pattern.height * 4),
    sourceX: Number.isFinite(pattern.sourceX) ? Math.round(pattern.sourceX) : 0,
    sourceY: Number.isFinite(pattern.sourceY) ? Math.round(pattern.sourceY) : 0,
  };
}

function normalizePatternAlignment(alignment: PatternAlignment | undefined): PatternAlignment {
  return alignment === "canvas" || alignment === "destination" ? alignment : "source";
}

function normalizePatternOrigin(origin: Point | undefined): Point {
  return {
    x: Number.isFinite(origin?.x) ? Math.round(origin!.x) : 0,
    y: Number.isFinite(origin?.y) ? Math.round(origin!.y) : 0,
  };
}

function brushFootprintOrigin(point: Point, settings: ResolvedBrushSettings): Point {
  const centerX = Math.round(point.x);
  const centerY = Math.round(point.y);
  if (settings.bitmapBrush) {
    return {x: centerX - settings.bitmapBrush.anchorX, y: centerY - settings.bitmapBrush.anchorY};
  }
  const offset = Math.floor(settings.size / 2);
  return {x: centerX - offset, y: centerY - offset};
}

function paintPatternPixel(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  rawX: number,
  rawY: number,
  color: RGBA,
  pattern: PatternBrush,
  settings: ResolvedBrushSettings,
  stampOrigin: Point,
): number {
  if (!settings.wrapX && (rawX < 0 || rawX >= width)) return 0;
  if (!settings.wrapY && (rawY < 0 || rawY >= height)) return 0;

  const targetX = settings.wrapX ? modulo(rawX, width) : rawX;
  const targetY = settings.wrapY ? modulo(rawY, height) : rawY;
  const origin = settings.patternOrigin ?? {x: 0, y: 0};
  const alignment = settings.patternAlignment ?? "source";
  const destination = settings.patternDestination ?? stampOrigin;
  // Keep sampling in raw document space so a wrapped footprint does not jump texture phase.
  const patternX = alignment === "canvas"
    ? rawX - pattern.sourceX + origin.x
    : alignment === "destination"
      ? rawX - destination.x + origin.x
      : rawX - stampOrigin.x + origin.x;
  const patternY = alignment === "canvas"
    ? rawY - pattern.sourceY + origin.y
    : alignment === "destination"
      ? rawY - destination.y + origin.y
      : rawY - stampOrigin.y + origin.y;
  const sourceX = modulo(Math.floor(patternX), pattern.width);
  const sourceY = modulo(Math.floor(patternY), pattern.height);
  const sourceIndex = (sourceY * pattern.width + sourceX) * 4;
  const alpha = Math.round(pattern.pixels[sourceIndex + 3] * Math.max(0, Math.min(255, color[3])) / 255);
  // A transparent texture pixel is a no-op, rather than an erase operation.
  if (alpha <= 0) return 0;

  const targetIndex = pixelIndex(width, targetX, targetY);
  if (pixels[targetIndex] === pattern.pixels[sourceIndex]
    && pixels[targetIndex + 1] === pattern.pixels[sourceIndex + 1]
    && pixels[targetIndex + 2] === pattern.pixels[sourceIndex + 2]
    && pixels[targetIndex + 3] === alpha) return 0;
  pixels[targetIndex] = pattern.pixels[sourceIndex];
  pixels[targetIndex + 1] = pattern.pixels[sourceIndex + 1];
  pixels[targetIndex + 2] = pattern.pixels[sourceIndex + 2];
  pixels[targetIndex + 3] = alpha;
  return 1;
}

/** Short alias for callers that do not need to distinguish bitmap and procedural brushes. */
export function stampBrush(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  point: Point,
  color: RGBA,
  brush: BitmapBrush,
  options: BrushStrokeOptions = {},
) {
  if (options.patternBrush) return drawBitmapBrushStroke(pixels, width, height, [point], color, brush, options);
  return stampBitmapBrush(pixels, width, height, point, color, brush, options.wrapX, options.wrapY);
}

/**
 * Stamp a bitmap brush along a polyline at a fixed document-space spacing. The endpoint is always
 * stamped, which keeps short final segments from appearing to stop before the pointer.
 */
export function drawBitmapBrushStroke(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  points: readonly Point[],
  color: RGBA,
  brush: BitmapBrush,
  options: BrushStrokeOptions = {},
): number {
  const path = options.pixelPerfect ? simplifyPixelPerfectStroke(points) : dedupePoints(points);
  if (path.length === 0) return 0;

  const patternBrush = snapshotPatternBrush(options.patternBrush);
  const patternSettings: ResolvedBrushSettings = {
    size: Math.max(brush.width, brush.height),
    shape: "square",
    ...(options.wrapX === true ? {wrapX: true} : {}),
    ...(options.wrapY === true ? {wrapY: true} : {}),
    ...(patternBrush ? {
      patternBrush,
      patternAlignment: normalizePatternAlignment(options.patternAlignment),
      patternOrigin: normalizePatternOrigin(options.patternOrigin),
      ...(options.patternDestination ? {patternDestination: {...options.patternDestination}} : {}),
    } : {}),
  };
  if (patternBrush && patternSettings.patternAlignment === "destination" && !patternSettings.patternDestination) {
    patternSettings.patternDestination = brushFootprintOrigin(path[0], {...patternSettings, bitmapBrush: brush});
  }
  const stamp = (point: Point) => stampBitmapBrushWithSettings(
    pixels,
    width,
    height,
    point,
    color,
    brush,
    patternSettings,
  );
  const spacing = normalizeBrushSpacing(options.spacing);
  let changed = stamp(path[0]);
  let lastStamp = {x: Math.round(path[0].x), y: Math.round(path[0].y)};
  let startX = path[0].x;
  let startY = path[0].y;
  let distanceUntilStamp = spacing;

  for (let pointIndex = 1; pointIndex < path.length; pointIndex += 1) {
    const endX = path[pointIndex].x;
    const endY = path[pointIndex].y;
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

  const endpoint = {x: Math.round(path[path.length - 1].x), y: Math.round(path[path.length - 1].y)};
  if (endpoint.x !== lastStamp.x || endpoint.y !== lastStamp.y) {
    changed += stamp(endpoint);
  }
  return changed;
}

/** Draw a procedural brush along a path with the same spacing rules as bitmap brushes. */
export function drawBrushStroke(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  points: readonly Point[],
  color: RGBA,
  brushSize = MIN_BRUSH_SIZE,
  brushShape: BrushShape = "square",
  options: BrushStrokeOptions = {},
) {
  const path = options.pixelPerfect ? simplifyPixelPerfectStroke(points) : dedupePoints(points);
  if (path.length === 0) return 0;
  const settings = resolveDrawingBrushSettings(brushSize, brushShape, {
    brushSize,
    brushShape,
    wrapX: options.wrapX,
    wrapY: options.wrapY,
    patternBrush: options.patternBrush,
    patternAlignment: options.patternAlignment,
    patternOrigin: options.patternOrigin,
  });
  if (settings.patternBrush && settings.patternAlignment === "destination") {
    settings.patternDestination = options.patternDestination
      ? {...options.patternDestination}
      : brushFootprintOrigin(path[0], settings);
  }
  const spacing = normalizeBrushSpacing(options.spacing);
  if (spacing <= 1) {
    let changed = drawBrush(pixels, width, height, path[0].x, path[0].y, color, settings) || 0;
    for (let index = 1; index < path.length; index += 1) {
      changed += drawBrushLine(pixels, width, height, path[index - 1], path[index], color, settings) || 0;
    }
    return changed;
  }

  let changed = drawBrush(pixels, width, height, path[0].x, path[0].y, color, settings) || 0;
  let lastStamp = {x: Math.round(path[0].x), y: Math.round(path[0].y)};
  let startX = path[0].x;
  let startY = path[0].y;
  let distanceUntilStamp = spacing;
  for (let pointIndex = 1; pointIndex < path.length; pointIndex += 1) {
    const endX = path[pointIndex].x;
    const endY = path[pointIndex].y;
    let deltaX = endX - startX;
    let deltaY = endY - startY;
    let segmentLength = Math.hypot(deltaX, deltaY);
    if (segmentLength <= Number.EPSILON) continue;
    while (segmentLength + Number.EPSILON >= distanceUntilStamp) {
      const ratio = distanceUntilStamp / segmentLength;
      startX += deltaX * ratio;
      startY += deltaY * ratio;
      const stampPoint = {x: Math.round(startX), y: Math.round(startY)};
      changed += drawBrush(pixels, width, height, stampPoint.x, stampPoint.y, color, settings) || 0;
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
  const endpoint = {x: Math.round(path[path.length - 1].x), y: Math.round(path[path.length - 1].y)};
  if (endpoint.x !== lastStamp.x || endpoint.y !== lastStamp.y) {
    changed += drawBrush(pixels, width, height, endpoint.x, endpoint.y, color, settings) || 0;
  }
  return changed;
}

/** Draw a pattern brush along a path using the supplied bitmap/procedural footprint settings. */
export function drawPatternBrushStroke(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  points: readonly Point[],
  color: RGBA,
  patternBrush: PatternBrush,
  settings: BrushSettings = {},
): number {
  const resolved = resolveDrawingBrushSettings(settings.brushSize ?? MIN_BRUSH_SIZE, settings.brushShape ?? "square", {
    ...settings,
    patternBrush,
  });
  if (resolved.bitmapBrush) {
    return drawBitmapBrushStroke(pixels, width, height, points, color, resolved.bitmapBrush, {
      spacing: settings.brushSpacing,
      pixelPerfect: settings.pixelPerfect,
      wrapX: settings.wrapX,
      wrapY: settings.wrapY,
      patternBrush: resolved.patternBrush,
      patternAlignment: resolved.patternAlignment,
      patternOrigin: resolved.patternOrigin,
    });
  }
  return drawBrushStroke(pixels, width, height, points, color, resolved.size, resolved.shape, {
    spacing: settings.brushSpacing,
    pixelPerfect: settings.pixelPerfect,
    wrapX: settings.wrapX,
    wrapY: settings.wrapY,
    patternBrush: resolved.patternBrush,
    patternAlignment: resolved.patternAlignment,
    patternOrigin: resolved.patternOrigin,
  });
}

/** Alias emphasizing that this operation is a spaced sequence of brush stamps. */
export function stampBrushStroke(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  points: readonly Point[],
  color: RGBA,
  brush: BitmapBrush,
  options: BrushStrokeOptions = {},
) {
  return drawBitmapBrushStroke(pixels, width, height, points, color, brush, options);
}

export function normalizeBrushSpacing(spacing: number | undefined): number {
  if (!Number.isFinite(spacing) || (spacing as number) <= 0) return 1;
  return Math.max(0.25, spacing as number);
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

/** Clamp pointer/stylus pressure to the normalized range used by the brush helpers. */
export function normalizePressure(pressure: number | undefined, fallback = 1): number {
  const value = Number.isFinite(pressure) ? pressure as number : fallback;
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

export function pressureToBrushSize(
  pressure: number | undefined,
  minSize = MIN_BRUSH_SIZE,
  maxSize = MAX_BRUSH_SIZE,
): number {
  const range = normalizedRange(minSize, maxSize, MIN_BRUSH_SIZE, MAX_BRUSH_SIZE);
  return Math.round(range.min + normalizePressure(pressure) * (range.max - range.min));
}

export function pressureToOpacity(
  pressure: number | undefined,
  minOpacity = 0,
  maxOpacity = 1,
): number {
  const range = normalizedRange(minOpacity, maxOpacity, 0, 1);
  return range.min + normalizePressure(pressure) * (range.max - range.min);
}

export function pressureToBrushSettings(
  pressure: number | undefined,
  options: PressureBrushOptions = {},
): PressureBrushSettings {
  const normalized = normalizePressure(pressure);
  return {
    pressure: normalized,
    size: pressureToBrushSize(normalized, options.minSize, options.maxSize),
    opacity: pressureToOpacity(normalized, options.minOpacity, options.maxOpacity),
  };
}

export function normalizeBrushVelocity(velocity: number | undefined, maximum = 1): number {
  const limit = Number.isFinite(maximum) && maximum > 0 ? maximum : 1;
  const value = Number.isFinite(velocity) ? velocity as number : 0;
  return Math.max(0, Math.min(1, value / limit));
}

export function resolveBrushDynamics(
  sample: PointerDynamicsSample,
  options: BrushDynamicsOptions,
  maximumVelocity = 1,
  fallback: Partial<ResolvedBrushDynamics> = {},
): ResolvedBrushDynamics {
  const resolve = (range: BrushDynamicsRange, disabledValue: number) => {
    if (!range.enabled) return disabledValue;
    let input = range.source === "pressure"
      ? normalizePressure(sample.pressure)
      : normalizeBrushVelocity(sample.velocity, maximumVelocity);
    if (range.invert) input = 1 - input;
    const threshold = Math.max(0, Math.min(0.99, range.threshold));
    input = input <= threshold ? 0 : (input - threshold) / (1 - threshold);
    input = applyBrushDynamicsCurve(input, range.curve);
    const minimum = Math.min(range.min, range.max);
    const maximum = Math.max(range.min, range.max);
    return minimum + input * (maximum - minimum);
  };
  return {
    size: Math.max(MIN_BRUSH_SIZE, Math.min(MAX_BRUSH_SIZE, Math.round(resolve(options.size, fallback.size ?? options.size.max)))),
    opacity: Math.max(0, Math.min(1, resolve(options.opacity, fallback.opacity ?? options.opacity.max))),
    angle: ((resolve(options.angle, fallback.angle ?? options.angle.max) % 360) + 360) % 360,
    gradient: Math.max(0, Math.min(1, resolve(options.gradient, fallback.gradient ?? 0))),
  };
}

export function applyBrushDynamicsCurve(input: number, curve: BrushDynamicsCurve): number {
  const value = Math.max(0, Math.min(1, Number.isFinite(input) ? input : 0));
  if (curve === "ease-in") return value * value;
  if (curve === "ease-out") return 1 - (1 - value) * (1 - value);
  if (curve === "smoothstep") return value * value * (3 - 2 * value);
  return value;
}

export function interpolateRGBA(from: RGBA, to: RGBA, amount: number): [number, number, number, number] {
  const t = Math.max(0, Math.min(1, Number.isFinite(amount) ? amount : 0));
  return [0, 1, 2, 3].map((channel) => Math.round(from[channel] + (to[channel] - from[channel]) * t)) as [number, number, number, number];
}

export interface TimedPoint extends Point {time: number}

export function pointerVelocity(previous: TimedPoint | null, current: TimedPoint): number {
  if (!previous) return 0;
  const elapsed = Math.max(1, current.time - previous.time);
  return Math.hypot(current.x - previous.x, current.y - previous.y) / elapsed;
}

/** A trailing moving average that preserves the first and final pointer samples. */
export function stabilizeStroke(points: readonly Point[], strength: number): Point[] {
  if (points.length < 3) return points.map((point) => ({...point}));
  const radius = Math.max(0, Math.min(32, Math.round(strength)));
  if (radius === 0) return points.map((point) => ({...point}));
  const output: Point[] = [{...points[0]}];
  for (let index = 1; index < points.length - 1; index += 1) {
    const start = Math.max(0, index - radius);
    const end = Math.min(points.length - 1, index + radius);
    let x = 0;
    let y = 0;
    for (let sample = start; sample <= end; sample += 1) {
      x += points[sample].x;
      y += points[sample].y;
    }
    const count = end - start + 1;
    output.push({x: Math.round(x / count), y: Math.round(y / count)});
  }
  output.push({...points[points.length - 1]});
  return output;
}

export function stabilizePointerPoint(previous: Point | null, current: Point, strength: number): Point {
  const amount = Math.max(0, Math.min(32, Number.isFinite(strength) ? strength : 0));
  if (!previous || amount === 0) return {...current};
  const factor = 1 / (amount + 1);
  return {
    x: Math.round(previous.x + (current.x - previous.x) * factor),
    y: Math.round(previous.y + (current.y - previous.y) * factor),
  };
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
    case "spray":
  sprayPaint(context.pixels, context.width, context.height, point, context.color, brush.size, gesture.path?.length ?? 0, context.wrapX, context.wrapY);
      gesture.path?.push(point);
      return {changed: true, dirtyBounds: brushLineBounds(context, point, point, brush.size)};
    case "blur": {
      const result = blurPixelsInPlace(context.pixels, context.width, context.height, point, context.blurRadius ?? brush.size);
      gesture.path?.push(point);
      return {changed: result.changed, dirtyBounds: result.bounds};
    }
    case "jumble": {
      const seed = gesture.path?.length ?? 0;
      gesture.path?.push(point);
      const result = jumblePixelsInPlace(context.pixels, context.width, context.height, point, context.jumbleAmount ?? brush.size, seed);
      return {changed: result.changed, dirtyBounds: result.bounds};
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
  return {changed, bounds: {x: left, y: top, width: right - left + 1, height: bottom - top + 1}};
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
  return {changed, bounds: {x: left, y: top, width: right - left + 1, height: bottom - top + 1}};
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

function brushFootprintReach(brush: number | ResolvedBrushSettings) {
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

/**
 * Resolve user-provided settings at the tool boundary. This keeps drawing deterministic even when
 * a slider or a restored document supplies an out-of-range value, while preserving the old API.
 */
export function resolveBrushSettings(settings: BrushSettings): ResolvedBrushSettings {
  const shape = settings.brushShape;
  const resolved: ResolvedBrushSettings = {
    size: normalizeBrushSize(settings.brushSize),
    shape: shape === "circle" || shape === "cross" || shape === "diamond" ? shape : "square",
    ...(settings.bitmapBrushPrepared === true ? {bitmapBrushPrepared: true} : {}),
    ...(settings.wrapX === true ? {wrapX: true} : {}),
    ...(settings.wrapY === true ? {wrapY: true} : {}),
  };
  if (isValidPatternBrush(settings.patternBrush)) {
    resolved.patternBrush = settings.patternBrush;
    resolved.patternAlignment = normalizePatternAlignment(settings.patternAlignment);
    resolved.patternOrigin = normalizePatternOrigin(settings.patternOrigin);
  }
  return resolved;
}

function resolveDrawingBrushSettings(
  brushSize: number,
  brushShape: BrushShape,
  settings?: BrushSettings | ResolvedBrushSettings,
): ResolvedBrushSettings {
  const source = settings as (BrushSettings & Partial<ResolvedBrushSettings>) | undefined;
  const resolved = resolveBrushSettings({
    ...(source ?? {}),
    brushSize: source?.brushSize ?? brushSize,
    brushShape: source?.brushShape ?? brushShape,
  });
  resolved.bitmapBrushPrepared = source?.bitmapBrushPrepared === true;
  if (source?.bitmapBrush) resolved.bitmapBrush = source.bitmapBrush;
  if (resolved.bitmapBrush && !resolved.bitmapBrushPrepared) resolved.bitmapBrush = resizeBitmapBrush(resolved.bitmapBrush, resolved.size);
  if (resolved.patternBrush) resolved.patternBrush = snapshotPatternBrush(resolved.patternBrush);
  if (source?.patternDestination) resolved.patternDestination = {...source.patternDestination};
  return resolved;
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

export function normalizeBrushSize(size: number | undefined): number {
  if (!Number.isFinite(size)) return MIN_BRUSH_SIZE;
  return Math.max(MIN_BRUSH_SIZE, Math.min(MAX_BRUSH_SIZE, Math.round(size as number)));
}

function drawBrushLine(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  from: Point,
  to: Point,
  color: RGBA,
  settings: ResolvedBrushSettings,
): number {
  if (settings.size === MIN_BRUSH_SIZE && !settings.wrapX && !settings.wrapY
    && !settings.bitmapBrush && !settings.patternBrush) {
    // Keep the original Bresenham path for the default pencil so existing pixel placement remains exact.
    drawLine(pixels, width, height, from.x, from.y, to.x, to.y, color);
    return 0;
  }

  let changed = 0;
  forEachLinePoint(from, to, (x, y) => {
    changed += drawBrush(pixels, width, height, x, y, color, settings) || 0;
  });
  return changed;
}

function drawBrush(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  color: RGBA,
  settings: ResolvedBrushSettings,
) {
  if (settings.bitmapBrush) {
    return stampBitmapBrushWithSettings(pixels, width, height, {x: centerX, y: centerY}, color, settings.bitmapBrush, settings);
  }
  if (settings.size === MIN_BRUSH_SIZE) {
    if (settings.patternBrush) {
      const origin = {x: Math.round(centerX), y: Math.round(centerY)};
      return paintPatternPixel(pixels, width, height, origin.x, origin.y, color, settings.patternBrush, settings, origin);
    }
    setWrappedPixel(pixels, width, height, centerX, centerY, color, settings.wrapX, settings.wrapY);
    return 0;
  }

  // Even-sized brushes are centered with a one-pixel upper/left bias, e.g. size 2 covers [x - 1, x].
  const offset = Math.floor(settings.size / 2);
  const origin = {x: Math.round(centerX) - offset, y: Math.round(centerY) - offset};
  let changed = 0;
  for (let brushY = 0; brushY < settings.size; brushY += 1) {
    for (let brushX = 0; brushX < settings.size; brushX += 1) {
      if (!isBrushPixel(brushX, brushY, settings.size, settings.shape)) continue;
      const rawX = origin.x + brushX;
      const rawY = origin.y + brushY;
      if (settings.patternBrush) {
        changed += paintPatternPixel(pixels, width, height, rawX, rawY, color, settings.patternBrush, settings, origin);
      } else {
        setWrappedPixel(pixels, width, height, rawX, rawY, color, settings.wrapX, settings.wrapY);
      }
    }
  }
  return changed;
}

function modulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function setWrappedPixel(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  color: RGBA,
  wrapX = false,
  wrapY = false,
) {
  if (!wrapX && (x < 0 || x >= width)) return;
  if (!wrapY && (y < 0 || y >= height)) return;
  setPixel(pixels, width, height, wrapX ? modulo(x, width) : x, wrapY ? modulo(y, height) : y, color);
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

function forEachLinePoint(from: Point, to: Point, callback: (x: number, y: number) => void) {
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

function clampInteger(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function dedupePoints(points: readonly Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const previous = result[result.length - 1];
    if (!previous || previous.x !== point.x || previous.y !== point.y) result.push({x: point.x, y: point.y});
  }
  return result;
}

function direction(from: Point, to: Point) {
  return {
    x: Math.sign(to.x - from.x),
    y: Math.sign(to.y - from.y),
  };
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

function normalizedRange(
  first: number | undefined,
  second: number | undefined,
  fallbackMin: number,
  fallbackMax: number,
) {
  const normalizedFirst = Number.isFinite(first) ? first as number : fallbackMin;
  const normalizedSecond = Number.isFinite(second) ? second as number : fallbackMax;
  return {
    min: Math.min(normalizedFirst, normalizedSecond),
    max: Math.max(normalizedFirst, normalizedSecond),
  };
}

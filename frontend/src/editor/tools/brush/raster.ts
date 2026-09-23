import {drawLine, setPixel} from "../../pixels";
import {MIN_BRUSH_SIZE} from "./constants";
import {
  brushFootprintOrigin,
  dedupePoints,
  drawSpacedStroke,
  forEachLinePoint,
  isBrushPixel,
  modulo,
  normalizeBrushSize,
  normalizeBrushSpacing,
  resizeBitmapBrush,
  simplifyPixelPerfectStroke,
} from "./geometry";
import type {
  BitmapBrush,
  BrushSettings,
  BrushShape,
  BrushStrokeOptions,
  PatternAlignment,
  PatternBrush,
  Point,
  RGBA,
  ResolvedBrushSettings,
} from "./types";

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
  return drawSpacedStroke(path, normalizeBrushSpacing(options.spacing), stamp);
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

  return drawSpacedStroke(
    path,
    spacing,
    (point) => drawBrush(pixels, width, height, point.x, point.y, color, settings) || 0,
  );
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

export function resolveDrawingBrushSettings(
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

export function snapshotPatternBrush(pattern: PatternBrush | null | undefined): PatternBrush | null {
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

export function drawBrushLine(
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

export function drawBrush(
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

export function setWrappedPixel(
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

export function paintPatternPixel(
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

export function stampBitmapBrushWithSettings(
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

function normalizePatternAlignment(alignment: PatternAlignment | undefined): PatternAlignment {
  return alignment === "canvas" || alignment === "destination" ? alignment : "source";
}

function normalizePatternOrigin(origin: Point | undefined): Point {
  return {
    x: Number.isFinite(origin?.x) ? Math.round(origin!.x) : 0,
    y: Number.isFinite(origin?.y) ? Math.round(origin!.y) : 0,
  };
}

function pixelIndex(width: number, x: number, y: number) {
  return (y * width + x) * 4;
}

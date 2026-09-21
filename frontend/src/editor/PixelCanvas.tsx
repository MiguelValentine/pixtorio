import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import {flushSync} from "react-dom";
import {
  beginTool,
  applyInkMode,
  constrainPointToSquare,
  createShapeBitmapBrush,
  drawPolylineOutline,
  drawQuadraticBezier,
  finishTool,
  isBrushPixel,
  moveTool,
  normalizeBrushSize,
  pressureToBrushSettings,
  interpolateRGBA,
  pointerVelocity,
  resolveBrushDynamics,
  stabilizePointerPoint,
  resizeBitmapBrush,
  rotateBitmapBrush,
  type BitmapBrush,
  type PatternBrush,
  type PatternAlignment,
  type Point,
  type BrushShape,
  type GradientDither,
  type GradientType,
  type ShapeFillMode,
  type InkMode,
  type RGBA,
  type ToolContext,
  type ToolGesture,
  type ToolID,
  type ToolResult,
  type BrushDynamicsOptions,
} from "./tools";
import {
  clipPixelEditsToSelection,
  clearSelection,
  clippedSelection,
  cloneSelection,
  combineSelections,
  containsPoint,
  copySelection,
  moveSelection,
  pasteClipboard,
  ellipseSelection,
  lassoSelection,
  magicWandSelection,
  polygonSelection,
  selectionFromPoints,
  type PixelClipboard,
  type Selection,
  type SelectionOperation,
} from "./selection";
import {
  deformedQuad,
  renderClipboardTransformFromSource,
  rotateClipboardWithPivot,
  selectionQuad,
  warpSelectionToQuad,
  type TransformHandle,
  type TransformMode,
  type TransformQuad,
} from "./transform";
import {nextSliceSelection, orderedSliceOverlays, selectedSliceBounds} from "./sliceHitTesting";
import type {TileLineSegment} from "./tileGrid";
import {wrapTiledPoint} from "./tiledPointer";
export {wrapTiledPoint} from "./tiledPointer";

export interface TileCellOverlay {
  points: ReadonlyArray<Point>;
  kind: "primary" | "affected";
}

export interface TileImagePreview {
  x: number;
  y: number;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

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

interface PixelCanvasProps {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  displayPixels: Uint8ClampedArray;
  displayDirtyBounds: {x: number; y: number; width: number; height: number} | null;
  revision: number;
  documentKey?: string;
  lightTheme: boolean;
  checkerSize?: number;
  checkerLight?: string;
  checkerDark?: string;
  zoom: number;
  color: RGBA;
  secondaryColor: RGBA;
  backgroundLayer: boolean;
  brushSize: number;
  brushShape: BrushShape;
  bitmapBrush: BitmapBrush | null;
  patternBrush?: PatternBrush | null;
  patternAlignment?: PatternAlignment;
  patternOrigin?: Point;
  brushSpacing: number;
  pixelPerfect: boolean;
  pressureEnabled: boolean;
  brushDynamicsEnabled?: boolean;
  brushDynamics?: BrushDynamicsOptions;
  brushStabilizer?: number;
  polygonSides: number;
  brushAngle: number;
  inkMode: InkMode;
  gradientDither: GradientDither;
  gradientType: GradientType;
  shapeFillMode: ShapeFillMode;
  blurRadius: number;
  jumbleAmount: number;
  alphaLock: boolean;
  symmetryX: boolean;
  symmetryY: boolean;
  symmetryAxisX: number;
  symmetryAxisY: number;
  tiledX: boolean;
  tiledY: boolean;
  gridWidth: number;
  gridHeight: number;
  gridOffsetX: number;
  gridOffsetY: number;
  snapToGrid: boolean;
  showPixelGrid: boolean;
  pixelGridColor?: string;
  pixelGridOpacity?: number;
  gridLineColor?: string;
  gridLineOpacity?: number;
  tileGridLines?: ReadonlyArray<TileLineSegment>;
  tileCellOverlays?: ReadonlyArray<TileCellOverlay>;
  tileImagePreviews?: ReadonlyArray<TileImagePreview>;
  guideColor?: string;
  showSelectionEdges?: boolean;
  wheelZoom?: boolean;
  zoomFromCenter?: boolean;
  autoFitOnOpen?: boolean;
  previewShiftLine?: boolean;
  cursorPreview?: "brush" | "crosshair" | "both";
  cursorScale?: number;
  cursorColor?: string;
  guides: ReadonlyArray<{id: string; axis: "horizontal" | "vertical"; position: number}>;
  sliceOverlays: ReadonlyArray<{id: string; x: number; y: number; width: number; height: number; color: string}>;
  activeSliceId: string;
  selectedSliceIds?: ReadonlyArray<string>;
  selectionAntialias: boolean;
  tool: ToolID;
  editable: boolean;
  cropEnabled: boolean;
  onZoomChange: (zoom: number) => void;
  onPixelsChanged: (bounds?: ToolResult["dirtyBounds"]) => void;
  onEditCommit: (before: Uint8ClampedArray) => void;
  onEnsureEditablePixels: () => Uint8ClampedArray | null;
  onColorPicked: (color: RGBA) => void;
  onSecondaryColorPicked: (color: RGBA) => void;
  onBlockedEdit: () => void;
  onCursorChange: (point: Point | null) => void;
  selection: Selection | null;
  selectionOperation: SelectionOperation;
  selectionMode: SelectionMode;
  selectionTolerance: number;
  transformMode: TransformMode;
  transformPivot: Point | null;
  onTransformPivotChange: (point: Point) => void;
  /** Builds the initial transform selection from the active Cel's content. */
  onTransformSelectionFromContent?: () => Selection | null;
  onGuideChange: (id: string, position: number) => void;
  onGridOffsetChange: (x: number, y: number) => void;
  onSliceBoundsChange: (id: string, bounds: {x: number; y: number; width: number; height: number}) => void;
  onSliceBatchBoundsChange?: (changes: Array<{id: string; bounds: {x: number; y: number; width: number; height: number}}>) => void;
  onSliceCreate?: (bounds: {x: number; y: number; width: number; height: number}) => void;
  onSelectionChange: (selection: Selection | null) => void;
  onCrop: (bounds: Selection) => void;
  textPreview?: {width: number; height: number; pixels: Uint8ClampedArray} | null;
  onTextPlace?: (point: Point) => void;
  onActiveSliceChange?: (id: string) => void;
  onSliceSelectionChange?: (ids: string[]) => void;
  onSliceDoubleClick?: (id: string) => void;
  onOverlayContextMenu?: (target: CanvasContextTarget, position: {clientX: number; clientY: number}) => void;
  onTilemapPointer?: (phase: "start" | "move" | "end", point: Point, secondary: boolean) => boolean;
  onTilemapHover?: (point: Point | null) => void;
  onCelMovePointer?: (phase: "start" | "move" | "end", start: Point, point: Point, options: {lockAxis: boolean; autoSelect: boolean}) => boolean;
  interactionGuardRef?: {current: (() => boolean) | null};
}

export type SelectionMode = "rectangle" | "ellipse" | "lasso" | "polygon" | "magic-wand";

type SelectionGesture = {
  mode: "select" | "move";
  start: Point;
  origin: Selection;
  baseSelection?: Selection | null;
  operation?: SelectionOperation;
  before?: Uint8ClampedArray;
  startedOutside?: boolean;
  moved?: boolean;
  shape?: SelectionMode;
  points?: Point[];
};

type CropGesture = {
  start: Point;
  startedOutside: boolean;
  moved: boolean;
};

type CelMoveGesture = {
  start: Point;
  current: Point;
  autoSelect: boolean;
};

type TransformGesture = {
  mode: "resize" | "move" | "rotate" | "pivot";
  handle?: TransformHandle;
  start: Point;
  origin: Selection;
  sourceOrigin: Selection;
  source: PixelClipboard;
  before: Uint8ClampedArray;
  commitBefore: Uint8ClampedArray;
  moved: boolean;
  transformMode: TransformMode;
  originQuad: TransformQuad;
  pivot: Point;
  startPivot: Point;
  startAngle?: number;
};

type TransformSession = {
  pixels: Uint8ClampedArray;
  origin: Selection;
  currentSelection: Selection;
  source: PixelClipboard;
  before: Uint8ClampedArray;
};

type PendingOutsideGesture = {
  tool: "pencil" | "eraser" | "line" | "rectangle" | "ellipse" | "curve" | "polyline" | "polygon" | "gradient" | "spray" | "blur" | "jumble";
  start: Point;
  constrainLine: boolean;
};

type StagedPolylineGesture = {
  before: Uint8ClampedArray;
  points: Point[];
  pointerDown: Point | null;
  pointerMoved: boolean;
  finishOnUp: boolean;
};

type StagedCurveGesture = {
  before: Uint8ClampedArray;
  start: Point;
  end: Point | null;
  control: Point | null;
  previewPoint: Point | null;
  phase: "end" | "control";
  pointerDown: Point | null;
  pointerMoved: boolean;
  finishOnUp: boolean;
};

export type CanvasContextTarget =
  | {kind: "slice"; id: string}
  | {kind: "guide"; id: string; axis: "horizontal" | "vertical"};

type CanvasContextSlice = {id: string; x: number; y: number; width: number; height: number};
type CanvasContextGuide = {id: string; axis: "horizontal" | "vertical"; position: number};

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

type CanvasAidGesture =
  | {kind: "guide"; id: string; axis: "horizontal" | "vertical"; position: number}
  | {kind: "grid"; x: number; y: number}
  | {
    kind: "slice";
    id: string;
    start: Point;
    origin: Selection;
    current: Selection;
    handle: TransformHandle | null;
    items: Array<{id: string; origin: Selection; current: Selection}>;
  };

const zoomLevels = [1, 2, 4, 6, 8, 12, 16, 24, 32];
const transformHandleSize = 8;
const brushCursorTools = new Set<ToolID>(["pencil", "eraser", "line", "rectangle", "ellipse", "curve", "polyline", "polygon", "spray", "blur", "jumble", "contour", "replace-color"]);
const freehandTools = new Set<ToolID>(["pencil", "eraser"]);

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

const transformCursors: Record<TransformHandle, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

type SourceCanvas = HTMLCanvasElement | OffscreenCanvas;

function createSourceCanvas(): SourceCanvas {
  return typeof OffscreenCanvas === "undefined"
    ? document.createElement("canvas")
    : new OffscreenCanvas(1, 1);
}

function clipDirtyBounds(bounds: {x: number; y: number; width: number; height: number}, width: number, height: number) {
  const left = Math.max(0, Math.floor(bounds.x));
  const top = Math.max(0, Math.floor(bounds.y));
  const right = Math.min(width, Math.ceil(bounds.x + bounds.width));
  const bottom = Math.min(height, Math.ceil(bounds.y + bounds.height));
  if (right <= left || bottom <= top) return null;
  return {x: left, y: top, width: right - left, height: bottom - top};
}

function simplifyPolygonDrag(points: readonly Point[]) {
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

function createCheckerPattern(context: CanvasRenderingContext2D, dark: string, light: string, checkerSize: number) {
  const source = document.createElement("canvas");
  source.width = checkerSize * 2;
  source.height = checkerSize * 2;
  const sourceContext = source.getContext("2d");
  if (!sourceContext) return null;
  sourceContext.fillStyle = dark;
  sourceContext.fillRect(0, 0, source.width, source.height);
  sourceContext.fillStyle = light;
  sourceContext.fillRect(0, 0, checkerSize, checkerSize);
  sourceContext.fillRect(checkerSize, checkerSize, checkerSize, checkerSize);
  return context.createPattern(source, "repeat");
}

function createSelectionOutline(
  selection: Selection,
  viewport: {x: number; y: number},
  zoom: number,
) {
  const path = new Path2D();
  if (!selection.mask) {
    path.rect(
      Math.round(viewport.x + selection.x * zoom) + 0.5,
      Math.round(viewport.y + selection.y * zoom) + 0.5,
      selection.width * zoom,
      selection.height * zoom,
    );
    return path;
  }

  const edge = (fromX: number, fromY: number, toX: number, toY: number) => {
    path.moveTo(Math.round(viewport.x + fromX * zoom) + 0.5, Math.round(viewport.y + fromY * zoom) + 0.5);
    path.lineTo(Math.round(viewport.x + toX * zoom) + 0.5, Math.round(viewport.y + toY * zoom) + 0.5);
  };
  for (let localY = 0; localY < selection.height; localY += 1) {
    for (let localX = 0; localX < selection.width; localX += 1) {
      const x = selection.x + localX;
      const y = selection.y + localY;
      if (!containsPoint(selection, x, y)) continue;
      if (!containsPoint(selection, x, y - 1)) edge(x, y, x + 1, y);
      if (!containsPoint(selection, x + 1, y)) edge(x + 1, y, x + 1, y + 1);
      if (!containsPoint(selection, x, y + 1)) edge(x + 1, y + 1, x, y + 1);
      if (!containsPoint(selection, x - 1, y)) edge(x, y + 1, x, y);
    }
  }
  return path;
}

function createBrushOutline(
  cursor: Point,
  brushSize: number,
  brushShape: BrushShape,
  viewport: Point,
  zoom: number,
  canvasWidth: number,
  canvasHeight: number,
  bitmapBrush?: BitmapBrush | null,
) {
  const brushWidth = bitmapBrush?.width ?? normalizeBrushSize(brushSize);
  const brushHeight = bitmapBrush?.height ?? normalizeBrushSize(brushSize);
  const originX = cursor.x - (bitmapBrush?.anchorX ?? Math.floor(brushWidth / 2));
  const originY = cursor.y - (bitmapBrush?.anchorY ?? Math.floor(brushHeight / 2));
  const path = new Path2D();
  const contains = (localX: number, localY: number) => {
    const x = originX + localX;
    const y = originY + localY;
    return x >= 0 && y >= 0 && x < canvasWidth && y < canvasHeight
      && (bitmapBrush
        ? Boolean(bitmapBrush.mask[localY * bitmapBrush.width + localX])
        : isBrushPixel(localX, localY, brushWidth, brushShape));
  };
  const edge = (fromX: number, fromY: number, toX: number, toY: number) => {
    path.moveTo(Math.round(viewport.x + fromX * zoom) + 0.5, Math.round(viewport.y + fromY * zoom) + 0.5);
    path.lineTo(Math.round(viewport.x + toX * zoom) + 0.5, Math.round(viewport.y + toY * zoom) + 0.5);
  };

  for (let localY = 0; localY < brushHeight; localY += 1) {
    for (let localX = 0; localX < brushWidth; localX += 1) {
      if (!contains(localX, localY)) continue;
      const x = originX + localX;
      const y = originY + localY;
      if (!contains(localX, localY - 1)) edge(x, y, x + 1, y);
      if (!contains(localX + 1, localY)) edge(x + 1, y, x + 1, y + 1);
      if (!contains(localX, localY + 1)) edge(x + 1, y + 1, x, y + 1);
      if (!contains(localX - 1, localY)) edge(x, y + 1, x, y);
    }
  }
  return path;
}

function transformHandles(quad: TransformQuad, viewport: Point, zoom: number) {
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

function hitTransformHandle(point: Point, quad: TransformQuad, viewport: Point, zoom: number) {
  const radius = transformHandleSize / 2 + 3;
  return transformHandles(quad, viewport, zoom).find(({x, y}) => (
    Math.abs(point.x - x) <= radius && Math.abs(point.y - y) <= radius
  ))?.handle ?? null;
}

function transformCenter(quad: TransformQuad) {
  return {
    x: (quad.nw.x + quad.ne.x + quad.se.x + quad.sw.x) / 4,
    y: (quad.nw.y + quad.ne.y + quad.se.y + quad.sw.y) / 4,
  };
}

function rotationHandle(quad: TransformQuad, viewport: Point, zoom: number) {
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

function hitPoint(point: Point, target: Point, radius = 8) {
  return Math.hypot(point.x - target.x, point.y - target.y) <= radius;
}

function samePoint(first: Point | null | undefined, second: Point | null | undefined) {
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

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);
}

function colorWithOpacity(color: string, opacityPercent: number) {
  const alpha = Math.round(Math.max(0, Math.min(100, opacityPercent)) * 2.55);
  return `${color}${alpha.toString(16).padStart(2, "0")}`;
}

export function PixelCanvas({
  width,
  height,
  pixels,
  displayPixels,
  displayDirtyBounds,
  revision,
  documentKey = "",
  lightTheme,
  checkerSize: preferredCheckerSize = 8,
  checkerLight: preferredCheckerLight,
  checkerDark: preferredCheckerDark,
  zoom,
  color,
  secondaryColor,
  backgroundLayer,
  brushSize,
  brushShape,
  bitmapBrush,
  patternBrush = null,
  patternAlignment = "source",
  patternOrigin,
  brushSpacing,
  pixelPerfect,
  pressureEnabled,
  brushDynamicsEnabled = false,
  brushDynamics,
  brushStabilizer = 0,
  polygonSides,
  brushAngle,
  inkMode,
  gradientDither,
  gradientType,
  shapeFillMode,
  blurRadius,
  jumbleAmount,
  alphaLock,
  symmetryX,
  symmetryY,
  symmetryAxisX,
  symmetryAxisY,
  tiledX,
  tiledY,
  gridWidth,
  gridHeight,
  gridOffsetX,
  gridOffsetY,
  snapToGrid,
  showPixelGrid,
  pixelGridColor = "#000000",
  pixelGridOpacity = 28,
  gridLineColor = "#5fb7eb",
  gridLineOpacity = 48,
  tileGridLines = [],
  tileCellOverlays = [],
  tileImagePreviews = [],
  guideColor = "#4cc9f0",
  showSelectionEdges = true,
  wheelZoom = true,
  zoomFromCenter = false,
  autoFitOnOpen = false,
  previewShiftLine = true,
  cursorPreview = "brush",
  cursorScale = 100,
  cursorColor = "#ffffff",
  guides,
  sliceOverlays,
  activeSliceId,
  selectedSliceIds = [],
  selectionAntialias,
  tool,
  editable,
  cropEnabled,
  onZoomChange,
  onPixelsChanged,
  onEditCommit,
  onEnsureEditablePixels,
  onColorPicked,
  onSecondaryColorPicked,
  onBlockedEdit,
  onCursorChange,
  selection,
  selectionOperation,
  selectionMode,
  selectionTolerance,
  transformMode,
  transformPivot,
  onTransformPivotChange,
  onTransformSelectionFromContent,
  onGuideChange,
  onGridOffsetChange,
  onSliceBoundsChange,
  onSliceBatchBoundsChange,
  onSliceCreate,
  onSelectionChange,
  onCrop,
  textPreview,
  onTilemapPointer,
  onTilemapHover,
  onCelMovePointer,
  onTextPlace,
  onActiveSliceChange,
  onSliceSelectionChange,
  onSliceDoubleClick,
  onOverlayContextMenu,
  interactionGuardRef,
}: PixelCanvasProps) {
  const canvasStackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null);
  const textPreviewCanvasRef = useRef<{preview: NonNullable<PixelCanvasProps["textPreview"]>; canvas: HTMLCanvasElement} | null>(null);
  const sourceCanvasRef = useRef<SourceCanvas | null>(null);
  const sourceImageRef = useRef<{
    pixels: Uint8ClampedArray;
    imageData: ImageData;
    width: number;
    height: number;
    dirtyBounds: PixelCanvasProps["displayDirtyBounds"];
  } | null>(null);
  const canvasAidGestureRef = useRef<CanvasAidGesture | null>(null);
  const [guidePreview, setGuidePreview] = useState<{id: string; position: number} | null>(null);
  const [gridPreview, setGridPreview] = useState<Point | null>(null);
  const [slicePreview, setSlicePreview] = useState<{
    id: string;
    bounds: Selection;
    batch?: Array<{id: string; bounds: Selection}>;
    group?: Selection;
  } | null>(null);
  const selectionOutlineRef = useRef<{
    selection: Selection;
    viewportX: number;
    viewportY: number;
    zoom: number;
    path: Path2D;
  } | null>(null);
  const checkerPatternRef = useRef<{dark: string; light: string; checkerSize: number; pattern: CanvasPattern} | null>(null);
  const [viewport, setViewport] = useState({x: 96, y: 72});
  const [surfaceSize, setSurfaceSize] = useState({width: 0, height: 0});
  const [isPanning, setIsPanning] = useState(false);
  const [transformCursor, setTransformCursor] = useState<string | null>(null);
  const [transformPreviewQuad, setTransformPreviewQuad] = useState<TransformQuad | null>(null);
  const brushCursorRef = useRef<Point | null>(null);
  const [brushCursorVisible, setBrushCursorVisible] = useState(false);
  const [cropPreview, setCropPreview] = useState<Selection | null>(null);
  const gestureRef = useRef<ToolGesture | null>(null);
  const activeEditPixelsRef = useRef<Uint8ClampedArray | null>(null);
  const pendingOutsideGestureRef = useRef<PendingOutsideGesture | null>(null);
  const selectionGestureRef = useRef<SelectionGesture | null>(null);
  const cropGestureRef = useRef<CropGesture | null>(null);
  const sliceGestureRef = useRef<CropGesture | null>(null);
  const stagedPolylineGestureRef = useRef<StagedPolylineGesture | null>(null);
  const stagedCurveGestureRef = useRef<StagedCurveGesture | null>(null);
  const stagedActionRef = useRef<{cancel: () => void; commit: () => void}>({cancel: () => undefined, commit: () => undefined});
  const transformGestureRef = useRef<TransformGesture | null>(null);
  const transformSessionRef = useRef<TransformSession | null>(null);
  const panningRef = useRef(false);
  const tilemapGestureRef = useRef<{secondary: boolean} | null>(null);
  const celMoveGestureRef = useRef<CelMoveGesture | null>(null);
  const secondaryGestureRef = useRef(false);
  const spacePressedRef = useRef(false);
  const panStartRef = useRef({pointerX: 0, pointerY: 0, viewportX: 0, viewportY: 0});
  const dynamicsSampleRef = useRef<{x: number; y: number; time: number} | null>(null);
  const stabilizedPointRef = useRef<Point | null>(null);
  const fittedDocumentKeyRef = useRef("");
  const wheelZoomAccumulatorRef = useRef(0);

  useEffect(() => {
    if (!autoFitOnOpen || !documentKey || fittedDocumentKeyRef.current === documentKey || surfaceSize.width <= 0 || surfaceSize.height <= 0) return;
    const availableWidth = Math.max(1, surfaceSize.width - 48);
    const availableHeight = Math.max(1, surfaceSize.height - 48);
    const maximum = Math.min(availableWidth / width, availableHeight / height);
    const nextZoom = [...zoomLevels].reverse().find((candidate) => candidate <= maximum) ?? zoomLevels[0];
    fittedDocumentKeyRef.current = documentKey;
    setViewport({
      x: Math.round((surfaceSize.width - width * nextZoom) / 2),
      y: Math.round((surfaceSize.height - height * nextZoom) / 2),
    });
    onZoomChange(nextZoom);
  }, [autoFitOnOpen, documentKey, height, onZoomChange, surfaceSize.height, surfaceSize.width, width]);

  useEffect(() => {
    if (!interactionGuardRef) return;
    interactionGuardRef.current = () => Boolean(gestureRef.current || pendingOutsideGestureRef.current || tilemapGestureRef.current || celMoveGestureRef.current
      || selectionGestureRef.current || cropGestureRef.current || stagedPolylineGestureRef.current || stagedCurveGestureRef.current
      || transformGestureRef.current || canvasAidGestureRef.current || panningRef.current);
    return () => { interactionGuardRef.current = null; };
  }, [interactionGuardRef]);

  useEffect(() => {
    const stagedPolyline = stagedPolylineGestureRef.current;
    const stagedCurve = stagedCurveGestureRef.current;
    const stagedBefore = stagedPolyline?.before ?? stagedCurve?.before;
    const stagedPixels = activeEditPixelsRef.current;
    if (stagedBefore && stagedPixels) {
      stagedPixels.set(stagedBefore);
      onPixelsChanged({x: 0, y: 0, width, height});
    }
    stagedPolylineGestureRef.current = null;
    stagedCurveGestureRef.current = null;
    const celMoveGesture = celMoveGestureRef.current;
    if (celMoveGesture) onCelMovePointer?.("end", celMoveGesture.start, celMoveGesture.current, {lockAxis: false, autoSelect: celMoveGesture.autoSelect});
    gestureRef.current = null;
    pendingOutsideGestureRef.current = null;
    tilemapGestureRef.current = null;
    sliceGestureRef.current = null;
    setSlicePreview(null);
    celMoveGestureRef.current = null;
    activeEditPixelsRef.current = null;
    secondaryGestureRef.current = false;
    dynamicsSampleRef.current = null;
    stabilizedPointRef.current = null;
    setTransformCursor(null);
    brushCursorRef.current = null;
    setBrushCursorVisible(false);
    const cursorCanvas = cursorCanvasRef.current;
    if (cursorCanvas) cursorCanvas.width = cursorCanvas.width;
    if (tool !== "transform") {
      transformGestureRef.current = null;
      transformSessionRef.current = null;
      setTransformPreviewQuad(null);
    }
  }, [tool]);

  useEffect(() => setTransformPreviewQuad(null), [transformMode]);

  useEffect(() => {
    const session = transformSessionRef.current;
    if (tool !== "transform" || !session) return;
    if (session.pixels === pixels && session.currentSelection === selection) return;
    transformGestureRef.current = null;
    canvasAidGestureRef.current = null;
    setGuidePreview(null);
    setGridPreview(null);
    setSlicePreview(null);
    transformSessionRef.current = null;
    setTransformPreviewQuad(null);
  }, [pixels, selection, tool]);

  const rotatedBrush = useMemo(() => {
    const source = bitmapBrush
      ? resizeBitmapBrush(bitmapBrush, brushSize)
      : createShapeBitmapBrush(brushShape, brushSize);
    if (((brushAngle % 360) + 360) % 360 === 0) return source;
    return rotateBitmapBrush(source, brushAngle);
  }, [bitmapBrush, brushAngle, brushShape, brushSize]);
  const backgroundClearColor = useMemo<RGBA | undefined>(() => backgroundLayer
    ? [secondaryColor[0], secondaryColor[1], secondaryColor[2], 255]
    : undefined, [backgroundLayer, secondaryColor]);

  const toolContext = useCallback((event?: React.PointerEvent<HTMLCanvasElement>): ToolContext => {
    const sourceColor = secondaryGestureRef.current ? secondaryColor : color;
    const pressure = pressureEnabled && event?.pointerType === "pen" ? event.pressure : 1;
    const pressureSettings = pressureToBrushSettings(pressure, {minSize: 1, maxSize: brushSize, minOpacity: 0.08, maxOpacity: 1});
    let dynamicSize = pressureEnabled ? pressureSettings.size : brushSize;
    let dynamicOpacity = pressureEnabled ? pressureSettings.opacity : 1;
    let dynamicAngle = brushAngle;
    let dynamicColor: RGBA = sourceColor;
    let dynamicBrush = rotatedBrush;
    if (brushDynamicsEnabled && brushDynamics && event) {
      const point = canvasLocalPoint(event, event.currentTarget.getBoundingClientRect(), surfaceSize);
      const currentSample = {x: point.x / zoom, y: point.y / zoom, time: event.timeStamp};
      const velocity = pointerVelocity(dynamicsSampleRef.current, currentSample);
      dynamicsSampleRef.current = currentSample;
      const dynamics = resolveBrushDynamics(
        {pressure: event.pointerType === "pen" ? event.pressure : 1, velocity},
        brushDynamics,
        1,
        {size: dynamicSize, opacity: dynamicOpacity, angle: dynamicAngle, gradient: 0},
      );
      dynamicSize = dynamics.size;
      dynamicOpacity = dynamics.opacity;
      dynamicAngle = dynamics.angle;
      if (brushDynamics.gradient.enabled) dynamicColor = interpolateRGBA(sourceColor, secondaryColor, dynamics.gradient);
      if (brushDynamics.angle.enabled || dynamicSize !== brushSize) {
        const source = bitmapBrush ? resizeBitmapBrush(bitmapBrush, dynamicSize) : createShapeBitmapBrush(brushShape, dynamicSize);
        dynamicBrush = rotateBitmapBrush(source, dynamicAngle);
      }
    }
    return {
      pixels: activeEditPixelsRef.current ?? pixels,
      width,
      height,
      color: [dynamicColor[0], dynamicColor[1], dynamicColor[2], Math.round(dynamicColor[3] * dynamicOpacity)],
      secondaryColor,
      eraserColor: backgroundLayer ? backgroundClearColor : [0, 0, 0, 0],
      brushSize: dynamicSize,
      brushShape,
      bitmapBrush: dynamicBrush,
      bitmapBrushPrepared: true,
      patternBrush,
      patternAlignment,
      patternOrigin,
      brushSpacing,
      pixelPerfect,
      polygonSides,
      gradientDither,
      gradientType,
      shapeFillMode,
      blurRadius,
      jumbleAmount,
      wrapX: tiledX,
      wrapY: tiledY,
    };
  }, [backgroundClearColor, backgroundLayer, bitmapBrush, patternBrush, patternAlignment, patternOrigin, brushAngle, brushDynamics, brushDynamicsEnabled, brushShape, brushSize, brushSpacing, color, gradientDither, height, pixelPerfect, pixels, polygonSides, pressureEnabled, rotatedBrush, secondaryColor, surfaceSize, tiledX, tiledY, width, zoom]);

  useEffect(() => {
    const stack = canvasStackRef.current;
    if (!stack) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      const height = entry.contentRect.height;
      // Commit display size and bitmap redraw together so an old bitmap is never stretched.
      flushSync(() => {
        setSurfaceSize((current) => current.width === width && current.height === height
          ? current
          : {width, height});
      });
    });
    observer.observe(stack);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isEditableTarget(event.target)) {
        if (event.key === "Escape" && (stagedPolylineGestureRef.current || stagedCurveGestureRef.current)) {
          event.preventDefault();
          stagedActionRef.current.cancel();
          return;
        }
        if ((event.key === "Enter" || event.code === "NumpadEnter")
          && (stagedPolylineGestureRef.current || stagedCurveGestureRef.current)) {
          event.preventDefault();
          stagedActionRef.current.commit();
          return;
        }
      }
      if (event.code === "Space" && !isEditableTarget(event.target)) {
        spacePressedRef.current = true;
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") spacePressedRef.current = false;
    };
    const onWindowBlur = () => {
      spacePressedRef.current = false;
      panningRef.current = false;
      pendingOutsideGestureRef.current = null;
      if (stagedPolylineGestureRef.current || stagedCurveGestureRef.current) stagedActionRef.current.cancel();
      setIsPanning(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || surfaceSize.width === 0 || surfaceSize.height === 0) return;
    const ratio = window.devicePixelRatio || 1;
    const targetWidth = Math.max(1, Math.round(surfaceSize.width * ratio));
    const targetHeight = Math.max(1, Math.round(surfaceSize.height * ratio));
    if (canvas.width !== targetWidth) canvas.width = targetWidth;
    if (canvas.height !== targetHeight) canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.imageSmoothingEnabled = false;
    context.fillStyle = lightTheme ? "#e7e9ec" : "#18191c";
    context.fillRect(0, 0, surfaceSize.width, surfaceSize.height);

    const documentWidth = width * zoom;
    const documentHeight = height * zoom;
    const tileColumns = tiledX ? [-1, 0, 1] : [0];
    const tileRows = tiledY ? [-1, 0, 1] : [0];
    context.save();
    context.beginPath();
    context.rect(viewport.x, viewport.y, documentWidth, documentHeight);
    context.clip();
    const checkerDark = preferredCheckerDark ?? (lightTheme ? "#c8cacf" : "#8b8e94");
    const checkerLight = preferredCheckerLight ?? (lightTheme ? "#f1f2f3" : "#b4b7bc");
    // At high zoom levels, align each checker cell to a whole document pixel.
    const checkerSize = zoom * Math.max(1, Math.round(preferredCheckerSize / zoom));
    const cachedPattern = checkerPatternRef.current;
    const checkerPattern = cachedPattern?.dark === checkerDark && cachedPattern.light === checkerLight && cachedPattern.checkerSize === checkerSize
      ? cachedPattern.pattern
      : createCheckerPattern(context, checkerDark, checkerLight, checkerSize);
    if (checkerPattern && (cachedPattern?.dark !== checkerDark || cachedPattern.light !== checkerLight || cachedPattern.checkerSize !== checkerSize)) {
      checkerPatternRef.current = {dark: checkerDark, light: checkerLight, checkerSize, pattern: checkerPattern};
    }
    if (checkerPattern) {
      // Anchor transparency cells to the canvas instead of the fixed viewport.
      checkerPattern.setTransform(new DOMMatrix([1, 0, 0, 1, viewport.x, viewport.y]));
      context.fillStyle = checkerPattern;
      context.fillRect(viewport.x, viewport.y, documentWidth, documentHeight);
    }

    const source = sourceCanvasRef.current ?? (sourceCanvasRef.current = createSourceCanvas());
    if (source.width !== width) source.width = width;
    if (source.height !== height) source.height = height;
    const sourceContext = source.getContext("2d");
    if (!sourceContext) return;
    const cached = sourceImageRef.current;
    const needsFullUpload = !cached
      || cached.width !== width
      || cached.height !== height
      || cached.pixels !== displayPixels;
    const imageData = needsFullUpload
      ? sourceContext.createImageData(width, height)
      : cached.imageData;
    if (needsFullUpload) {
      imageData.data.set(displayPixels);
      sourceContext.putImageData(imageData, 0, 0);
    } else if (displayDirtyBounds && cached.dirtyBounds !== displayDirtyBounds) {
      const dirty = clipDirtyBounds(displayDirtyBounds, width, height);
      if (dirty) {
        for (let row = 0; row < dirty.height; row += 1) {
          const sourceStart = ((dirty.y + row) * width + dirty.x) * 4;
          const targetStart = sourceStart;
          imageData.data.set(displayPixels.subarray(sourceStart, sourceStart + dirty.width * 4), targetStart);
        }
        sourceContext.putImageData(imageData, 0, 0, dirty.x, dirty.y, dirty.width, dirty.height);
      }
    }
    sourceImageRef.current = {pixels: displayPixels, imageData, width, height, dirtyBounds: displayDirtyBounds};
    context.drawImage(source, viewport.x, viewport.y, documentWidth, documentHeight);
    if (tileImagePreviews.length > 0) {
      context.save();
      context.imageSmoothingEnabled = false;
      context.globalAlpha = 0.58;
      for (const preview of tileImagePreviews) {
        const previewCanvas = createSourceCanvas();
        previewCanvas.width = preview.width;
        previewCanvas.height = preview.height;
        const previewContext = previewCanvas.getContext("2d");
        if (!previewContext) continue;
        const image = previewContext.createImageData(preview.width, preview.height);
        image.data.set(preview.pixels);
        previewContext.putImageData(image, 0, 0);
        context.drawImage(
          previewCanvas,
          viewport.x + preview.x * zoom,
          viewport.y + preview.y * zoom,
          preview.width * zoom,
          preview.height * zoom,
        );
      }
      context.restore();
    }

    if (showPixelGrid && zoom >= 8) {
      context.strokeStyle = colorWithOpacity(pixelGridColor, pixelGridOpacity);
      context.lineWidth = 1;
      context.beginPath();
      for (let x = 0; x <= width; x += 1) {
        const screenX = Math.round(viewport.x + x * zoom) + 0.5;
        context.moveTo(screenX, viewport.y);
        context.lineTo(screenX, viewport.y + documentHeight);
      }
      for (let y = 0; y <= height; y += 1) {
        const screenY = Math.round(viewport.y + y * zoom) + 0.5;
        context.moveTo(viewport.x, screenY);
        context.lineTo(viewport.x + documentWidth, screenY);
      }
      context.stroke();
    }
    if (snapToGrid && gridWidth > 0 && gridHeight > 0) {
      const effectiveGridOffsetX = gridPreview?.x ?? gridOffsetX;
      const effectiveGridOffsetY = gridPreview?.y ?? gridOffsetY;
      context.strokeStyle = colorWithOpacity(gridLineColor, gridLineOpacity);
      context.lineWidth = 1;
      context.beginPath();
      for (let x = effectiveGridOffsetX; x <= width; x += gridWidth) {
        if (x < 0) continue;
        const screenX = Math.round(viewport.x + x * zoom) + 0.5;
        context.moveTo(screenX, viewport.y);
        context.lineTo(screenX, viewport.y + documentHeight);
      }
      for (let y = effectiveGridOffsetY; y <= height; y += gridHeight) {
        if (y < 0) continue;
        const screenY = Math.round(viewport.y + y * zoom) + 0.5;
        context.moveTo(viewport.x, screenY);
        context.lineTo(viewport.x + documentWidth, screenY);
      }
      context.stroke();
      if (tool === "transform" && !selection) {
        const originX = Math.round(viewport.x + effectiveGridOffsetX * zoom);
        const originY = Math.round(viewport.y + effectiveGridOffsetY * zoom);
        context.fillStyle = lightTheme ? "#276f9f" : "#74c7f5";
        context.fillRect(originX - 4, originY - 4, 8, 8);
      }
    }
    if (tileCellOverlays.length > 0) {
      for (const overlay of tileCellOverlays) {
        if (overlay.points.length < 3) continue;
        context.save();
        context.beginPath();
        overlay.points.forEach((point, index) => {
          const x = viewport.x + point.x * zoom;
          const y = viewport.y + point.y * zoom;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.closePath();
        context.fillStyle = overlay.kind === "primary"
          ? (lightTheme ? "rgba(37, 126, 175, 0.18)" : "rgba(116, 199, 245, 0.2)")
          : (lightTheme ? "rgba(210, 117, 33, 0.12)" : "rgba(255, 180, 92, 0.14)");
        context.strokeStyle = overlay.kind === "primary"
          ? (lightTheme ? "#276f9f" : "#74c7f5")
          : (lightTheme ? "#b86a22" : "#ffb45c");
        context.lineWidth = overlay.kind === "primary" ? 2 : 1;
        if (overlay.kind === "affected") context.setLineDash([4, 3]);
        context.fill();
        context.stroke();
        context.restore();
      }
    }
    if (cropPreview) {
      context.save();
      context.setLineDash([5, 3]);
      context.strokeStyle = "#ff6b6b";
      context.lineWidth = 1;
      context.strokeRect(
        Math.round(viewport.x + cropPreview.x * zoom) + 0.5,
        Math.round(viewport.y + cropPreview.y * zoom) + 0.5,
        cropPreview.width * zoom,
        cropPreview.height * zoom,
      );
      context.restore();
    }
    context.restore();

    if (tiledX || tiledY) {
      context.save();
      context.imageSmoothingEnabled = false;
      context.globalAlpha = 0.72;
      for (const row of tileRows) for (const column of tileColumns) {
        if (row === 0 && column === 0) continue;
        context.drawImage(source, viewport.x + column * documentWidth, viewport.y + row * documentHeight, documentWidth, documentHeight);
      }
      context.restore();
    }
    if (tileGridLines.length > 0) {
      context.save();
      context.strokeStyle = colorWithOpacity(gridLineColor, gridLineOpacity);
      context.lineWidth = 1;
      context.beginPath();
      for (const row of tileRows) for (const column of tileColumns) {
        for (const line of tileGridLines) {
          context.moveTo(
            Math.round(viewport.x + (line.start.x + column * width) * zoom) + 0.5,
            Math.round(viewport.y + (line.start.y + row * height) * zoom) + 0.5,
          );
          context.lineTo(
            Math.round(viewport.x + (line.end.x + column * width) * zoom) + 0.5,
            Math.round(viewport.y + (line.end.y + row * height) * zoom) + 0.5,
          );
        }
      }
      context.stroke();
      context.restore();
    }

    context.save();
    context.lineWidth = 1;
    context.strokeStyle = guideColor;
    for (const guide of guides) {
      const guidePosition = guidePreview?.id === guide.id ? guidePreview.position : guide.position;
      context.beginPath();
      if (guide.axis === "vertical") {
        const x = Math.round(viewport.x + guidePosition * zoom) + 0.5;
        context.moveTo(x, 0);
        context.lineTo(x, surfaceSize.height);
      } else {
        const y = Math.round(viewport.y + guidePosition * zoom) + 0.5;
        context.moveTo(0, y);
        context.lineTo(surfaceSize.width, y);
      }
      context.stroke();
    }
    context.setLineDash([4, 3]);
    context.strokeStyle = lightTheme ? "rgba(182, 61, 61, 0.72)" : "rgba(255, 133, 133, 0.78)";
    if (symmetryX) {
      const x = Math.round(viewport.x + symmetryAxisX * zoom) + 0.5;
      context.beginPath(); context.moveTo(x, viewport.y); context.lineTo(x, viewport.y + documentHeight); context.stroke();
    }
    if (symmetryY) {
      const y = Math.round(viewport.y + symmetryAxisY * zoom) + 0.5;
      context.beginPath(); context.moveTo(viewport.x, y); context.lineTo(viewport.x + documentWidth, y); context.stroke();
    }
    context.restore();

    const previewByID = new Map(slicePreview?.batch?.map((entry) => [entry.id, entry.bounds]) ?? []);
    const previewGroup = slicePreview?.group;
    const selectedGroup = selectedSliceIds.length > 1 && selectedSliceIds.includes(activeSliceId)
      ? selectedSliceBounds(sliceOverlays, selectedSliceIds)
      : null;
    for (const slice of sliceOverlays) {
      const bounds = previewByID.get(slice.id) ?? (slicePreview?.id === slice.id ? slicePreview.bounds : slice);
      const active = slice.id === activeSliceId;
      const selected = selectedSliceIds.includes(slice.id);
      context.save();
      context.setLineDash(selected ? [] : [4, 3]);
      context.strokeStyle = slice.color;
      context.lineWidth = active ? 2 : selected ? 1.5 : 1;
      context.strokeRect(
        Math.round(viewport.x + bounds.x * zoom) + 0.5,
        Math.round(viewport.y + bounds.y * zoom) + 0.5,
        bounds.width * zoom,
        bounds.height * zoom,
      );
      if (active && (tool === "slice" || (tool === "transform" && !selection))) {
        const handleBounds = selectedGroup ? (previewGroup ?? selectedGroup) : bounds;
        for (const {x, y} of transformHandles(selectionQuad(handleBounds), viewport, zoom)) {
          context.fillStyle = slice.color;
          context.fillRect(Math.round(x - transformHandleSize / 2), Math.round(y - transformHandleSize / 2), transformHandleSize, transformHandleSize);
          context.strokeStyle = lightTheme ? "#ffffff" : "#25262a";
          context.strokeRect(Math.round(x - transformHandleSize / 2), Math.round(y - transformHandleSize / 2), transformHandleSize, transformHandleSize);
        }
      }
      context.restore();
    }
    if (slicePreview && slicePreview.id === "new") {
      const bounds = slicePreview.bounds;
      context.save();
      context.setLineDash([5, 3]);
      context.strokeStyle = lightTheme ? "#b43f48" : "#ff8585";
      context.lineWidth = 2;
      context.strokeRect(
        Math.round(viewport.x + bounds.x * zoom) + 0.5,
        Math.round(viewport.y + bounds.y * zoom) + 0.5,
        bounds.width * zoom,
        bounds.height * zoom,
      );
      context.restore();
    }

    context.strokeStyle = lightTheme ? "#6f7278" : "#090909";
    context.lineWidth = 1;
    context.strokeRect(viewport.x - 0.5, viewport.y - 0.5, documentWidth + 1, documentHeight + 1);
    if (selection) {
      const cachedOutline = selectionOutlineRef.current;
      const outline = cachedOutline
        && cachedOutline.selection === selection
        && cachedOutline.viewportX === viewport.x
        && cachedOutline.viewportY === viewport.y
        && cachedOutline.zoom === zoom
        ? cachedOutline.path
        : createSelectionOutline(selection, viewport, zoom);
      if (outline !== cachedOutline?.path) {
        selectionOutlineRef.current = {selection, viewportX: viewport.x, viewportY: viewport.y, zoom, path: outline};
      }
      if (showSelectionEdges) {
        context.save();
        context.setLineDash([4, 3]);
        context.lineDashOffset = -Math.floor(revision / 2) % 7;
        context.strokeStyle = "#ffffff";
        context.lineWidth = 1;
        context.stroke(outline);
        context.setLineDash([4, 3]);
        context.lineDashOffset = 3 - Math.floor(revision / 2) % 7;
        context.strokeStyle = "#17181b";
        context.stroke(outline);
        context.restore();
      }
      if (tool === "transform") {
        context.save();
        context.lineWidth = 1;
        const quad = transformPreviewQuad ?? selectionQuad(selection);
        context.beginPath();
        context.moveTo(viewport.x + quad.nw.x * zoom, viewport.y + quad.nw.y * zoom);
        context.lineTo(viewport.x + quad.ne.x * zoom, viewport.y + quad.ne.y * zoom);
        context.lineTo(viewport.x + quad.se.x * zoom, viewport.y + quad.se.y * zoom);
        context.lineTo(viewport.x + quad.sw.x * zoom, viewport.y + quad.sw.y * zoom);
        context.closePath();
        context.strokeStyle = lightTheme ? "#b63d3d" : "#ff8585";
        context.stroke();
        const rotate = rotationHandle(quad, viewport, zoom);
        context.beginPath();
        context.moveTo(rotate.topScreen.x, rotate.topScreen.y);
        context.lineTo(rotate.screen.x, rotate.screen.y);
        context.stroke();
        context.beginPath();
        context.arc(rotate.screen.x, rotate.screen.y, 5, 0, Math.PI * 2);
        context.fillStyle = lightTheme ? "#ffffff" : "#25262a";
        context.fill();
        context.stroke();
        for (const {x, y} of transformHandles(quad, viewport, zoom)) {
          const left = Math.round(x - transformHandleSize / 2) + 0.5;
          const top = Math.round(y - transformHandleSize / 2) + 0.5;
          context.fillStyle = lightTheme ? "#df5c5c" : "#ff8585";
          context.fillRect(left, top, transformHandleSize, transformHandleSize);
          context.strokeStyle = lightTheme ? "#ffffff" : "#25262a";
          context.strokeRect(left, top, transformHandleSize, transformHandleSize);
        }
        const pivot = transformPivot ?? transformCenter(quad);
        const pivotX = viewport.x + pivot.x * zoom;
        const pivotY = viewport.y + pivot.y * zoom;
        context.beginPath();
        context.arc(pivotX, pivotY, 5, 0, Math.PI * 2);
        context.moveTo(pivotX - 8, pivotY);
        context.lineTo(pivotX + 8, pivotY);
        context.moveTo(pivotX, pivotY - 8);
        context.lineTo(pivotX, pivotY + 8);
        context.strokeStyle = lightTheme ? "#276f9f" : "#74c7f5";
        context.stroke();
        context.restore();
      }
    }
  }, [activeSliceId, brushShape, brushSize, cropPreview, displayDirtyBounds, displayPixels, editable, gridLineColor, gridLineOpacity, gridPreview, guideColor, guidePreview, guides, gridHeight, gridOffsetX, gridOffsetY, gridWidth, height, lightTheme, pixelGridColor, pixelGridOpacity, preferredCheckerDark, preferredCheckerLight, preferredCheckerSize, revision, selectedSliceIds, selection, showPixelGrid, showSelectionEdges, sliceOverlays, slicePreview, snapToGrid, surfaceSize, symmetryAxisX, symmetryAxisY, symmetryX, symmetryY, tileCellOverlays, tileGridLines, tileImagePreviews, tiledX, tiledY, tool, transformPivot, transformPreviewQuad, viewport, width, zoom]);

  const previewBrush = useMemo(
    () => rotatedBrush ? resizeBitmapBrush(rotatedBrush, brushSize) : null,
    [brushSize, rotatedBrush],
  );

  const drawBrushCursor = useCallback((cursor: Point | null) => {
    const canvas = cursorCanvasRef.current;
    if (!canvas || surfaceSize.width === 0 || surfaceSize.height === 0) return;
    const ratio = window.devicePixelRatio || 1;
    const targetWidth = Math.max(1, Math.round(surfaceSize.width * ratio));
    const targetHeight = Math.max(1, Math.round(surfaceSize.height * ratio));
    if (canvas.width !== targetWidth) canvas.width = targetWidth;
    if (canvas.height !== targetHeight) canvas.height = targetHeight;
    const context = canvas.getContext("2d", {alpha: true, desynchronized: true});
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, surfaceSize.width, surfaceSize.height);
    if (cursor && editable) {
      if (brushCursorTools.has(tool)) {
        context.save();
        if (cursorPreview === "brush" || cursorPreview === "both") {
          const outline = createBrushOutline(cursor, brushSize, brushShape, viewport, zoom, width, height, previewBrush);
          context.lineJoin = "miter";
          context.strokeStyle = "rgba(0, 0, 0, 0.9)";
          context.lineWidth = 3;
          context.stroke(outline);
          context.strokeStyle = cursorColor;
          context.lineWidth = 1;
          context.stroke(outline);
        }
        if (cursorPreview === "crosshair" || cursorPreview === "both") {
          const x = viewport.x + (cursor.x + 0.5) * zoom;
          const y = viewport.y + (cursor.y + 0.5) * zoom;
          const radius = Math.max(3, Math.round(6 * cursorScale / 100));
          context.beginPath();
          context.moveTo(x - radius, y); context.lineTo(x + radius, y);
          context.moveTo(x, y - radius); context.lineTo(x, y + radius);
          context.strokeStyle = "rgba(0, 0, 0, 0.9)";
          context.lineWidth = 3;
          context.stroke();
          context.strokeStyle = cursorColor;
          context.lineWidth = 1;
          context.stroke();
        }
        context.restore();
      } else if (tool === "text" && textPreview) {
        let cached = textPreviewCanvasRef.current;
        if (!cached || cached.preview !== textPreview) {
          const source = document.createElement("canvas");
          source.width = textPreview.width;
          source.height = textPreview.height;
          source.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(textPreview.pixels), textPreview.width, textPreview.height), 0, 0);
          cached = {preview: textPreview, canvas: source};
          textPreviewCanvasRef.current = cached;
        }
        const x = viewport.x + cursor.x * zoom;
        const y = viewport.y + cursor.y * zoom;
        context.save();
        context.imageSmoothingEnabled = false;
        context.globalAlpha = 0.78;
        context.drawImage(cached.canvas, x, y, textPreview.width * zoom, textPreview.height * zoom);
        context.globalAlpha = 1;
        context.setLineDash([4, 3]);
        context.strokeStyle = lightTheme ? "rgba(39, 111, 159, 0.9)" : "rgba(116, 199, 245, 0.9)";
        context.lineWidth = 1;
        context.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, textPreview.width * zoom, textPreview.height * zoom);
        context.restore();
      }
    }
  }, [brushShape, brushSize, cursorColor, cursorPreview, cursorScale, editable, height, lightTheme, previewBrush, surfaceSize, textPreview, tool, viewport, width, zoom]);

  useLayoutEffect(() => {
    drawBrushCursor(brushCursorRef.current);
  }, [drawBrushCursor]);

  const updateBrushCursor = useCallback((next: Point | null) => {
    const current = brushCursorRef.current;
    if (current?.x === next?.x && current?.y === next?.y) return;
    brushCursorRef.current = next;
    drawBrushCursor(next);
    const visible = Boolean(next && editable && (brushCursorTools.has(tool) || (tool === "text" && textPreview)));
    setBrushCursorVisible((currentVisible) => currentVisible === visible ? currentVisible : visible);
  }, [drawBrushCursor, editable, textPreview, tool]);

  const eventPoint = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return canvasLocalPoint(event, rect, surfaceSize);
  }, [surfaceSize]);

  const documentPoint = useCallback((point: Point) => ({
    x: Math.floor((point.x - viewport.x) / zoom),
    y: Math.floor((point.y - viewport.y) / zoom),
  }), [viewport, zoom]);

  const isInside = useCallback((point: Point) => (
    point.x >= 0 && point.y >= 0 && point.x < width && point.y < height
  ), [height, width]);

  const tiledDocumentPoint = useCallback((point: Point): Point | null => {
    return wrapTiledPoint(point, width, height, tiledX, tiledY);
  }, [height, tiledX, tiledY, width]);

  const clampToDocument = useCallback((point: Point) => ({
    x: Math.max(0, Math.min(width - 1, point.x)),
    y: Math.max(0, Math.min(height - 1, point.y)),
  }), [height, width]);

  const snapPointToGrid = useCallback((point: Point) => {
    if (!snapToGrid || gridWidth <= 0 || gridHeight <= 0) return point;
    return {
      x: Math.round((point.x - gridOffsetX) / gridWidth) * gridWidth + gridOffsetX,
      y: Math.round((point.y - gridOffsetY) / gridHeight) * gridHeight + gridOffsetY,
    };
  }, [gridHeight, gridOffsetX, gridOffsetY, gridWidth, snapToGrid]);

  const zoomAtPoint = (point: Point, direction: 1 | -1) => {
    const currentIndex = Math.max(0, zoomLevels.indexOf(zoom));
    const nextIndex = Math.max(0, Math.min(zoomLevels.length - 1, currentIndex + direction));
    const nextZoom = zoomLevels[nextIndex];
    if (nextZoom === zoom) return;
    const documentX = (point.x - viewport.x) / zoom;
    const documentY = (point.y - viewport.y) / zoom;
    setViewport({
      x: Math.round(point.x - documentX * nextZoom),
      y: Math.round(point.y - documentY * nextZoom),
    });
    onZoomChange(nextZoom);
  };

  const applySymmetry = (target: Uint8ClampedArray, before: Uint8ClampedArray, bounds?: ToolResult["dirtyBounds"]) => {
    if (!symmetryX && !symmetryY) return;
    const left = Math.max(0, Math.floor(bounds?.x ?? 0));
    const top = Math.max(0, Math.floor(bounds?.y ?? 0));
    const right = Math.min(width, Math.ceil((bounds?.x ?? 0) + (bounds?.width ?? width)));
    const bottom = Math.min(height, Math.ceil((bounds?.y ?? 0) + (bounds?.height ?? height)));
    const edits: Array<{x: number; y: number; color: [number, number, number, number]}> = [];
    for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
      const offset = (y * width + x) * 4;
      if (target[offset] === before[offset] && target[offset + 1] === before[offset + 1]
        && target[offset + 2] === before[offset + 2] && target[offset + 3] === before[offset + 3]) continue;
      edits.push({x, y, color: [target[offset], target[offset + 1], target[offset + 2], target[offset + 3]]});
    }
    for (const edit of edits) {
      const xs = symmetryX ? [edit.x, Math.round(2 * symmetryAxisX - edit.x - 1)] : [edit.x];
      const ys = symmetryY ? [edit.y, Math.round(2 * symmetryAxisY - edit.y - 1)] : [edit.y];
      for (const x of xs) for (const y of ys) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        target.set(edit.color, (y * width + x) * 4);
      }
    }
  };

  const applyResult = (result: ToolResult, before: Uint8ClampedArray) => {
    if (result.pickedColor) {
      if (secondaryGestureRef.current) onSecondaryColorPicked(result.pickedColor);
      else onColorPicked(result.pickedColor);
    }
    if (result.changed) {
      const target = activeEditPixelsRef.current ?? pixels;
      const effectiveBounds = tiledX || tiledY ? {x: 0, y: 0, width, height} : result.dirtyBounds;
      applyInkMode(target, before, width, height, alphaLock ? "lock-alpha" : inkMode, effectiveBounds);
      applySymmetry(target, before, effectiveBounds);
      clipPixelEditsToSelection(target, before, width, height, selection, effectiveBounds);
      onPixelsChanged(effectiveBounds);
    }
  };

  const renderPolylinePreview = (gesture: StagedPolylineGesture, previewPoint: Point | null = null) => {
    const target = activeEditPixelsRef.current;
    if (!target) return;
    const points = gesture.points.slice();
    if (previewPoint && !samePoint(points[points.length - 1], previewPoint)) points.push(previewPoint);
    if (points.length < 2) return;
    target.set(gesture.before);
    const context = toolContext();
    drawPolylineOutline(target, width, height, points, context.color, context.brushSize, context.brushShape, false, context);
    applyResult({changed: true, dirtyBounds: {x: 0, y: 0, width, height}}, gesture.before);
  };

  const renderCurvePreview = (gesture: StagedCurveGesture, previewPoint: Point | null = null) => {
    const target = activeEditPixelsRef.current;
    if (!target || !gesture.end) return;
    target.set(gesture.before);
    const context = toolContext();
    const control = gesture.control ?? (gesture.phase === "control" ? previewPoint : null);
    if (control) {
      drawQuadraticBezier(target, width, height, gesture.start, control, gesture.end, context.color, context.brushSize, context.brushShape, undefined, context);
    } else {
      drawPolylineOutline(target, width, height, [gesture.start, gesture.end], context.color, context.brushSize, context.brushShape, false, context);
    }
    applyResult({changed: true, dirtyBounds: {x: 0, y: 0, width, height}}, gesture.before);
  };

  const restoreStagedGesture = () => {
    const staged = stagedPolylineGestureRef.current ?? stagedCurveGestureRef.current;
    const target = activeEditPixelsRef.current;
    if (staged && target) {
      target.set(staged.before);
      onPixelsChanged({x: 0, y: 0, width, height});
    }
    stagedPolylineGestureRef.current = null;
    stagedCurveGestureRef.current = null;
    activeEditPixelsRef.current = null;
  };

  const commitStagedGesture = () => {
    const polyline = stagedPolylineGestureRef.current;
    if (polyline) {
      if (polyline.points.length >= 2) {
        renderPolylinePreview(polyline);
        onEditCommit(polyline.before);
      } else {
        restoreStagedGesture();
        return;
      }
      stagedPolylineGestureRef.current = null;
      activeEditPixelsRef.current = null;
      return;
    }
    const curve = stagedCurveGestureRef.current;
    if (!curve) return;
    if (!curve.end) {
      restoreStagedGesture();
      return;
    }
    if (!curve.control) {
      curve.control = {
        x: Math.round((curve.start.x + curve.end.x) / 2),
        y: Math.round((curve.start.y + curve.end.y) / 2),
      };
    }
    renderCurvePreview(curve);
    onEditCommit(curve.before);
    stagedCurveGestureRef.current = null;
    activeEditPixelsRef.current = null;
  };

  stagedActionRef.current = {cancel: restoreStagedGesture, commit: commitStagedGesture};

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = eventPoint(event);
    if (event.button === 2) {
      const contextTarget = findCanvasContextTarget(
        documentPoint(point),
        point,
        sliceOverlays,
        guides,
        activeSliceId,
        viewport,
        zoom,
      );
      if (contextTarget) {
        event.preventDefault();
        onOverlayContextMenu?.(contextTarget, {clientX: event.clientX, clientY: event.clientY});
        return;
      }
    }
    const pixel = snapPointToGrid(documentPoint(point));
    updateBrushCursor(isInside(pixel) && (brushCursorTools.has(tool) || tool === "text") ? pixel : null);
    if (tool === "selection" && event.button === 2) {
      event.preventDefault();
      onSelectionChange(null);
      return;
    }
    if (tool === "text") {
      if (event.button !== 0 || !isInside(pixel)) return;
      if (!editable) {
        onBlockedEdit();
        return;
      }
      onTextPlace?.(pixel);
      return;
    }
    if (tool === "zoom") {
      if (event.button !== 0 && event.button !== 2) return;
      event.preventDefault();
      zoomAtPoint(point, event.button === 2 ? -1 : 1);
      return;
    }
    if (event.button === 1 || (event.button === 0 && (spacePressedRef.current || tool === "hand"))) {
      panningRef.current = true;
      setIsPanning(true);
      panStartRef.current = {
        pointerX: point.x,
        pointerY: point.y,
        viewportX: viewport.x,
        viewportY: viewport.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0 && event.button !== 2) return;
    if (tool === "move") {
      if (event.button !== 0 || !isInside(pixel)) return;
      const options = {lockAxis: event.shiftKey, autoSelect: event.ctrlKey || event.metaKey};
      if (!onCelMovePointer?.("start", pixel, pixel, options)) {
        onBlockedEdit();
        return;
      }
      celMoveGestureRef.current = {start: pixel, current: pixel, autoSelect: options.autoSelect};
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const tilemapPixel = tiledDocumentPoint(pixel);
    if (onTilemapPointer && tilemapPixel && onTilemapPointer("start", pixel, event.button === 2)) {
      tilemapGestureRef.current = {secondary: event.button === 2};
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === "polyline" || tool === "curve") {
      if (event.button === 2) {
        if (stagedPolylineGestureRef.current || stagedCurveGestureRef.current) {
          event.preventDefault();
          commitStagedGesture();
        }
        return;
      }
      if (event.button !== 0) return;
      if (!editable) {
        onBlockedEdit();
        return;
      }
      const nextPoint = clampToDocument(pixel);
      if (tool === "polyline") {
        let gesture = stagedPolylineGestureRef.current;
        if (!gesture) {
          const editPixels = onEnsureEditablePixels();
          if (!editPixels) {
            onBlockedEdit();
            return;
          }
          activeEditPixelsRef.current = editPixels;
          gesture = {
            before: editPixels.slice(),
            points: [nextPoint],
            pointerDown: nextPoint,
            pointerMoved: false,
            finishOnUp: false,
          };
          stagedPolylineGestureRef.current = gesture;
        } else {
          gesture.pointerDown = nextPoint;
          gesture.pointerMoved = false;
          gesture.finishOnUp = event.detail >= 2;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      let gesture = stagedCurveGestureRef.current;
      if (!gesture) {
        const editPixels = onEnsureEditablePixels();
        if (!editPixels) {
          onBlockedEdit();
          return;
        }
        activeEditPixelsRef.current = editPixels;
        gesture = {
          before: editPixels.slice(),
          start: nextPoint,
          end: null,
          control: null,
          previewPoint: null,
          phase: "end",
          pointerDown: nextPoint,
          pointerMoved: false,
          finishOnUp: false,
        };
        stagedCurveGestureRef.current = gesture;
      } else if (gesture.phase === "end") {
        gesture.pointerDown = nextPoint;
        gesture.pointerMoved = false;
        gesture.finishOnUp = false;
        gesture.previewPoint = nextPoint;
      } else {
        gesture.pointerDown = nextPoint;
        gesture.pointerMoved = false;
        gesture.finishOnUp = event.detail >= 2;
        gesture.previewPoint = nextPoint;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === "slice" && event.button === 0) {
      const selectedGroupIDs = selectedSliceIds.length > 1 && selectedSliceIds.includes(activeSliceId)
        ? selectedSliceIds
        : [];
      const selectedGroupOrigin = selectedSliceBounds(sliceOverlays, selectedGroupIDs);
      const selectedGroupHandle = selectedGroupOrigin
        ? hitTransformHandle(point, selectionQuad(selectedGroupOrigin), viewport, zoom)
        : null;
      if (selectedGroupOrigin && selectedGroupHandle) {
        const items = sliceOverlays
          .filter((slice) => selectedGroupIDs.includes(slice.id))
          .map((slice) => ({id: slice.id, origin: {x: slice.x, y: slice.y, width: slice.width, height: slice.height}, current: {x: slice.x, y: slice.y, width: slice.width, height: slice.height}}));
        if (items.length > 1) {
          canvasAidGestureRef.current = {
            kind: "slice",
            id: activeSliceId,
            start: pixel,
            origin: selectedGroupOrigin,
            current: selectedGroupOrigin,
            handle: selectedGroupHandle,
            items,
          };
          setSlicePreview({
            id: activeSliceId,
            bounds: items.find((item) => item.id === activeSliceId)?.origin ?? selectedGroupOrigin,
            batch: items.map((item) => ({id: item.id, bounds: item.origin})),
            group: selectedGroupOrigin,
          });
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }
      }
      const orderedSlices = orderedSliceOverlays(sliceOverlays, activeSliceId);
      for (const slice of orderedSlices) {
        const origin = {x: slice.x, y: slice.y, width: slice.width, height: slice.height};
        const handle = hitTransformHandle(point, selectionQuad(origin), viewport, zoom);
        if (!handle && !containsPoint(origin, pixel.x, pixel.y)) continue;
        if (event.detail >= 2) {
          onActiveSliceChange?.(slice.id);
          onSliceDoubleClick?.(slice.id);
          return;
        }
        const additive = event.shiftKey || event.metaKey || event.ctrlKey;
        onSliceSelectionChange?.(nextSliceSelection(selectedSliceIds, slice.id, additive));
        onActiveSliceChange?.(slice.id);
        const batchIDs = !additive && selectedSliceIds.length > 1 && selectedSliceIds.includes(slice.id)
          ? selectedSliceIds
          : [slice.id];
        const items = sliceOverlays
          .filter((candidate) => batchIDs.includes(candidate.id))
          .map((candidate) => ({id: candidate.id, origin: {x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height}, current: {x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height}}));
        const groupOrigin = selectedSliceBounds(sliceOverlays, batchIDs) ?? origin;
        const groupHandle = items.length > 1 ? null : handle;
        canvasAidGestureRef.current = {kind: "slice", id: slice.id, start: pixel, origin: groupOrigin, current: groupOrigin, handle: groupHandle, items};
        setSlicePreview({
          id: slice.id,
          bounds: origin,
          batch: items.length > 1 ? items.map((item) => ({id: item.id, bounds: item.origin})) : undefined,
          group: items.length > 1 ? groupOrigin : undefined,
        });
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
    }
    if (tool === "transform" && event.button === 0 && !selection) {
      if (snapToGrid && hitPoint(point, {x: viewport.x + gridOffsetX * zoom, y: viewport.y + gridOffsetY * zoom})) {
        canvasAidGestureRef.current = {kind: "grid", x: gridOffsetX, y: gridOffsetY};
        setGridPreview({x: gridOffsetX, y: gridOffsetY});
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      const guide = guides.find((candidate) => {
        const screenPosition = candidate.axis === "vertical"
          ? viewport.x + candidate.position * zoom
          : viewport.y + candidate.position * zoom;
        return Math.abs((candidate.axis === "vertical" ? point.x : point.y) - screenPosition) <= 5;
      });
      if (guide) {
        canvasAidGestureRef.current = {kind: "guide", id: guide.id, axis: guide.axis, position: guide.position};
        setGuidePreview({id: guide.id, position: guide.position});
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      const selectedGroupIDs = selectedSliceIds.length > 1 && selectedSliceIds.includes(activeSliceId)
        ? selectedSliceIds
        : [];
      const selectedGroupOrigin = selectedSliceBounds(sliceOverlays, selectedGroupIDs);
      const selectedGroupHandle = selectedGroupOrigin
        ? hitTransformHandle(point, selectionQuad(selectedGroupOrigin), viewport, zoom)
        : null;
      if (selectedGroupOrigin && selectedGroupHandle) {
        const items = sliceOverlays
          .filter((candidate) => selectedGroupIDs.includes(candidate.id))
          .map((candidate) => ({id: candidate.id, origin: {x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height}, current: {x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height}}));
        if (items.length > 1) {
          canvasAidGestureRef.current = {
            kind: "slice",
            id: activeSliceId,
            start: pixel,
            origin: selectedGroupOrigin,
            current: selectedGroupOrigin,
            handle: selectedGroupHandle,
            items,
          };
          setSlicePreview({
            id: activeSliceId,
            bounds: items.find((item) => item.id === activeSliceId)?.origin ?? selectedGroupOrigin,
            batch: items.map((item) => ({id: item.id, bounds: item.origin})),
            group: selectedGroupOrigin,
          });
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }
      }
      const slice = orderedSliceOverlays(sliceOverlays, activeSliceId).find((candidate) => {
        const origin = {x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height};
        const handle = hitTransformHandle(point, selectionQuad(origin), viewport, zoom);
        return handle || containsPoint(origin, pixel.x, pixel.y);
      });
      if (slice) {
        const origin = {x: slice.x, y: slice.y, width: slice.width, height: slice.height};
        const handle = hitTransformHandle(point, selectionQuad(origin), viewport, zoom);
        const additive = event.shiftKey || event.metaKey || event.ctrlKey;
        onSliceSelectionChange?.(nextSliceSelection(selectedSliceIds, slice.id, additive));
        onActiveSliceChange?.(slice.id);
        const batchIDs = !additive && selectedSliceIds.length > 1 && selectedSliceIds.includes(slice.id)
          ? selectedSliceIds
          : [slice.id];
        const items = sliceOverlays
          .filter((candidate) => batchIDs.includes(candidate.id))
          .map((candidate) => ({id: candidate.id, origin: {x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height}, current: {x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height}}));
        const groupOrigin = selectedSliceBounds(sliceOverlays, batchIDs) ?? origin;
        const groupHandle = items.length > 1 ? null : handle;
        canvasAidGestureRef.current = {kind: "slice", id: slice.id, start: pixel, origin: groupOrigin, current: groupOrigin, handle: groupHandle, items};
        setSlicePreview({
          id: slice.id,
          bounds: origin,
          batch: items.length > 1 ? items.map((item) => ({id: item.id, bounds: item.origin})) : undefined,
          group: items.length > 1 ? groupOrigin : undefined,
        });
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      const contentSelection = onTransformSelectionFromContent?.();
      if (contentSelection) {
        onSelectionChange(contentSelection);
        onTransformPivotChange({
          x: contentSelection.x + contentSelection.width / 2,
          y: contentSelection.y + contentSelection.height / 2,
        });
        setTransformPreviewQuad(selectionQuad(contentSelection));
      }
      return;
    }
    if (tool === "transform") {
      if (event.button !== 0 || !selection) return;
      const originQuad = transformPreviewQuad ?? selectionQuad(selection);
      const pivot = transformPivot ?? transformCenter(originQuad);
      const pivotScreen = {x: viewport.x + pivot.x * zoom, y: viewport.y + pivot.y * zoom};
      if (hitPoint(point, pivotScreen)) {
        transformGestureRef.current = {
          mode: "pivot",
          start: pixel,
          origin: cloneSelection(selection),
          sourceOrigin: cloneSelection(selection),
          source: copySelection(pixels, width, selection),
          before: pixels.slice(),
          commitBefore: pixels.slice(),
          moved: false,
          transformMode,
          originQuad,
          pivot,
          startPivot: pivot,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      const rotate = rotationHandle(originQuad, viewport, zoom);
      const rotating = hitPoint(point, rotate.screen);
      if (!editable) {
        onBlockedEdit();
        return;
      }
      const editPixels = onEnsureEditablePixels();
      if (!editPixels) {
        onBlockedEdit();
        return;
      }
      activeEditPixelsRef.current = editPixels;
      const handle = hitTransformHandle(point, originQuad, viewport, zoom);
      const canMove = isInside(pixel) && containsPoint(selection, pixel.x, pixel.y);
      if (!rotating && !handle && !canMove) return;
      let session = transformSessionRef.current;
      if (!session || session.pixels !== editPixels || session.currentSelection !== selection) {
        session = {
          pixels: editPixels,
          origin: cloneSelection(selection),
          currentSelection: selection,
          source: copySelection(editPixels, width, selection),
          before: editPixels.slice(),
        };
        transformSessionRef.current = session;
      }
      transformGestureRef.current = {
        mode: rotating ? "rotate" : handle ? "resize" : "move",
        handle: handle ?? undefined,
        start: pixel,
        origin: cloneSelection(selection),
        sourceOrigin: session.origin,
        source: session.source,
        before: session.before,
        commitBefore: editPixels.slice(),
        moved: false,
        transformMode,
        originQuad,
        pivot,
        startPivot: pivot,
        ...(rotating ? {startAngle: Math.atan2(pixel.y - pivot.y, pixel.x - pivot.x)} : {}),
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const canStartOutside = tool === "selection" || tool === "crop" || tool === "slice" || tool === "pencil" || tool === "eraser" || tool === "line" || tool === "rectangle" || tool === "ellipse" || tool === "polygon" || tool === "gradient" || tool === "spray" || tool === "blur" || tool === "jumble";
    if (!isInside(pixel) && !canStartOutside) return;
    if (tool === "crop") {
      if (event.button !== 0) return;
      if (!cropEnabled) {
        onBlockedEdit();
        return;
      }
      const start = clampToDocument(pixel);
      const startedOutside = !isInside(pixel);
      cropGestureRef.current = {start, startedOutside, moved: false};
      if (!startedOutside) setCropPreview({x: start.x, y: start.y, width: 1, height: 1});
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === "slice") {
      if (event.button !== 0) return;
      const start = clampToDocument(pixel);
      const startedOutside = !isInside(pixel);
      sliceGestureRef.current = {start, startedOutside, moved: false};
      if (!startedOutside) setSlicePreview({id: "new", bounds: {x: start.x, y: start.y, width: 1, height: 1}});
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === "selection") {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      const operation: SelectionOperation = event.altKey ? "subtract" : event.shiftKey ? "add" : selectionOperation;
      if (selectionMode === "magic-wand") {
        if (isInside(pixel)) {
          const next = magicWandSelection(pixels, width, height, pixel.x, pixel.y, selectionTolerance, 8);
          onSelectionChange(combineSelections(selection, next, operation));
        }
        return;
      }
      if (operation === "replace" && selection && containsPoint(selection, pixel.x, pixel.y) && editable) {
        const editPixels = onEnsureEditablePixels();
        if (!editPixels) {
          onBlockedEdit();
          return;
        }
        activeEditPixelsRef.current = editPixels;
        selectionGestureRef.current = {mode: "move", start: pixel, origin: selection, before: editPixels.slice()};
      } else {
        const start = clampToDocument(pixel);
        const startedOutside = !isInside(pixel);
        const baseSelection = selection ? cloneSelection(selection) : null;
        selectionGestureRef.current = {
          mode: "select",
          start,
          origin: {x: start.x, y: start.y, width: 1, height: 1},
          baseSelection,
          operation,
          startedOutside,
          shape: selectionMode,
          points: [start],
        };
        if (!startedOutside) onSelectionChange(combineSelections(baseSelection, {x: start.x, y: start.y, width: 1, height: 1}, operation));
      }
      return;
    }
    if (!editable) {
      onBlockedEdit();
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    secondaryGestureRef.current = event.button === 2;
    if (!isInside(pixel) && (tool === "pencil" || tool === "eraser" || tool === "line" || tool === "rectangle" || tool === "ellipse" || tool === "polygon" || tool === "gradient" || tool === "spray" || tool === "blur" || tool === "jumble")) {
      pendingOutsideGestureRef.current = {tool, start: pixel, constrainLine: event.shiftKey};
      return;
    }
    const editPixels = onEnsureEditablePixels();
    if (!editPixels) {
      onBlockedEdit();
      return;
    }
    activeEditPixelsRef.current = editPixels;
    stabilizedPointRef.current = pixel;
    const gesture = beginTool(toolContext(event), tool, pixel, event.shiftKey && (tool === "pencil" || tool === "eraser"));
    gestureRef.current = gesture;
    applyResult(gesture, gesture.before);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = eventPoint(event);
    const rawPixel = snapPointToGrid(documentPoint(point));
    const inside = isInside(rawPixel);
    const tilemapPixel = tiledDocumentPoint(rawPixel);
    onCursorChange(inside ? rawPixel : null);
    onTilemapHover?.(tilemapPixel);
    updateBrushCursor(inside && (brushCursorTools.has(tool) || tool === "text") ? rawPixel : null);

    const transformGesture = transformGestureRef.current;
    if (tool === "transform" && selection && !transformGesture) {
      const quad = transformPreviewQuad ?? selectionQuad(selection);
      const pivot = transformPivot ?? transformCenter(quad);
      const pivotScreen = {x: viewport.x + pivot.x * zoom, y: viewport.y + pivot.y * zoom};
      const handle = hitTransformHandle(point, quad, viewport, zoom);
      setTransformCursor(hitPoint(point, pivotScreen) ? "crosshair" : hitPoint(point, rotationHandle(quad, viewport, zoom).screen) ? "grab" : handle ? transformCursors[handle] : inside && containsPoint(selection, rawPixel.x, rawPixel.y) ? "move" : null);
    }

    if (panningRef.current) {
      const start = panStartRef.current;
      setViewport({
        x: Math.round(start.viewportX + point.x - start.pointerX),
        y: Math.round(start.viewportY + point.y - start.pointerY),
      });
      return;
    }
    const celMoveGesture = celMoveGestureRef.current;
    if (celMoveGesture) {
      celMoveGesture.current = rawPixel;
      onCelMovePointer?.("move", celMoveGesture.start, rawPixel, {lockAxis: event.shiftKey, autoSelect: celMoveGesture.autoSelect});
      return;
    }
    if (tilemapGestureRef.current) {
      onTilemapPointer?.("move", rawPixel, tilemapGestureRef.current.secondary);
      return;
    }

    const stagedPolyline = stagedPolylineGestureRef.current;
    if (stagedPolyline) {
      const point = clampToDocument(rawPixel);
      if (stagedPolyline.pointerDown) {
        stagedPolyline.pointerMoved = stagedPolyline.pointerMoved || !samePoint(stagedPolyline.pointerDown, point);
      }
      renderPolylinePreview(stagedPolyline, point);
      return;
    }
    const stagedCurve = stagedCurveGestureRef.current;
    if (stagedCurve) {
      const point = clampToDocument(rawPixel);
      if (stagedCurve.pointerDown) {
        stagedCurve.pointerMoved = stagedCurve.pointerMoved || !samePoint(stagedCurve.pointerDown, point);
      }
      stagedCurve.previewPoint = point;
      if (stagedCurve.phase === "end") {
        const previewEnd = stagedCurve.end ?? point;
        if (!stagedCurve.end) {
          const preview = {...stagedCurve, end: previewEnd};
          renderCurvePreview(preview);
        } else {
          renderCurvePreview(stagedCurve, point);
        }
      } else {
        renderCurvePreview(stagedCurve, point);
      }
      return;
    }

    const canvasAidGesture = canvasAidGestureRef.current;
    if (canvasAidGesture) {
      if (canvasAidGesture.kind === "grid") {
        canvasAidGesture.x = Math.max(0, Math.min(width, rawPixel.x));
        canvasAidGesture.y = Math.max(0, Math.min(height, rawPixel.y));
        setGridPreview({x: canvasAidGesture.x, y: canvasAidGesture.y});
      } else if (canvasAidGesture.kind === "guide") {
        const position = canvasAidGesture.axis === "vertical"
          ? Math.max(0, Math.min(width, rawPixel.x))
          : Math.max(0, Math.min(height, rawPixel.y));
        canvasAidGesture.position = position;
        setGuidePreview({id: canvasAidGesture.id, position});
      } else {
        let bounds: Selection;
        if (canvasAidGesture.handle) {
          bounds = resizedTransformBounds(canvasAidGesture.origin, canvasAidGesture.handle, rawPixel, width, height);
        } else {
          const deltaX = rawPixel.x - canvasAidGesture.start.x;
          const deltaY = rawPixel.y - canvasAidGesture.start.y;
          bounds = {
            ...canvasAidGesture.origin,
            x: Math.max(0, Math.min(width - canvasAidGesture.origin.width, canvasAidGesture.origin.x + deltaX)),
            y: Math.max(0, Math.min(height - canvasAidGesture.origin.height, canvasAidGesture.origin.y + deltaY)),
          };
        }
        canvasAidGesture.current = bounds;
        const scaleX = bounds.width / canvasAidGesture.origin.width;
        const scaleY = bounds.height / canvasAidGesture.origin.height;
        const nextItems = canvasAidGesture.items.map((item) => {
          const next = canvasAidGesture.handle
            ? {
              x: bounds.x + Math.round((item.origin.x - canvasAidGesture.origin.x) * scaleX),
              y: bounds.y + Math.round((item.origin.y - canvasAidGesture.origin.y) * scaleY),
              width: Math.max(1, Math.round(item.origin.width * scaleX)),
              height: Math.max(1, Math.round(item.origin.height * scaleY)),
            }
            : {
              x: item.origin.x + (bounds.x - canvasAidGesture.origin.x),
              y: item.origin.y + (bounds.y - canvasAidGesture.origin.y),
              width: item.origin.width,
              height: item.origin.height,
            };
          item.current = next;
          return {id: item.id, bounds: next};
        });
        const activeBounds = nextItems.find((item) => item.id === canvasAidGesture.id)?.bounds ?? bounds;
        setSlicePreview({id: canvasAidGesture.id, bounds: activeBounds, batch: nextItems, group: bounds});
      }
      return;
    }

    if (transformGesture) {
      if (transformGesture.mode === "pivot") {
        const nextPivot = {
          x: Math.max(0, Math.min(width, rawPixel.x)),
          y: Math.max(0, Math.min(height, rawPixel.y)),
        };
        if (nextPivot.x !== transformGesture.pivot.x || nextPivot.y !== transformGesture.pivot.y) {
          transformGesture.pivot = nextPivot;
          onTransformPivotChange(nextPivot);
        }
        return;
      }
      const targetPixels = activeEditPixelsRef.current ?? pixels;
      let next: Selection;
      if (transformGesture.mode === "rotate") {
        const currentAngle = Math.atan2(rawPixel.y - transformGesture.pivot.y, rawPixel.x - transformGesture.pivot.x);
        let angleDegrees = (currentAngle - (transformGesture.startAngle ?? currentAngle)) * 180 / Math.PI;
        if (event.shiftKey) angleDegrees = Math.round(angleDegrees / 15) * 15;
        targetPixels.set(transformGesture.before);
        clearSelection(targetPixels, width, transformGesture.sourceOrigin, backgroundClearColor);
        const rotated = rotateClipboardWithPivot(transformGesture.source, angleDegrees, {
          x: transformGesture.pivot.x - transformGesture.sourceOrigin.x,
          y: transformGesture.pivot.y - transformGesture.sourceOrigin.y,
        });
        const x = transformGesture.sourceOrigin.x + rotated.offsetX;
        const y = transformGesture.sourceOrigin.y + rotated.offsetY;
        pasteClipboard(targetPixels, width, height, rotated, x, y);
        const rotatedSelection = clippedSelection(x, y, rotated.width, rotated.height, width, height, rotated.mask);
        if (!rotatedSelection) {
          targetPixels.set(transformGesture.before);
          return;
        }
        transformGesture.moved = Math.abs(angleDegrees) > 0.01;
        if (transformSessionRef.current) transformSessionRef.current.currentSelection = rotatedSelection;
        onSelectionChange(rotatedSelection);
        setTransformPreviewQuad(selectionQuad(rotatedSelection));
        onPixelsChanged({x: 0, y: 0, width, height});
        return;
      }
      if (transformGesture.mode === "resize" && transformGesture.handle && transformGesture.transformMode !== "scale") {
        const boundary = {
          x: Math.round((point.x - viewport.x) / zoom),
          y: Math.round((point.y - viewport.y) / zoom),
        };
        const quad = deformedQuad(
          transformGesture.originQuad,
          transformGesture.handle,
          boundary,
          transformGesture.transformMode,
          width,
          height,
        );
        targetPixels.set(transformGesture.before);
        const transformedSelection = warpSelectionToQuad(targetPixels, width, height, transformGesture.sourceOrigin, quad, backgroundClearColor);
        if (!transformedSelection) {
          targetPixels.set(transformGesture.before);
          return;
        }
        transformGesture.moved = true;
        if (transformSessionRef.current) transformSessionRef.current.currentSelection = transformedSelection;
        setTransformPreviewQuad(quad);
        onSelectionChange(transformedSelection);
        onPixelsChanged({x: 0, y: 0, width, height});
        return;
      }
      if (transformGesture.mode === "resize" && transformGesture.handle) {
        const boundary = {
          x: Math.round((point.x - viewport.x) / zoom),
          y: Math.round((point.y - viewport.y) / zoom),
        };
        next = resizedTransformBounds(transformGesture.origin, transformGesture.handle, boundary, width, height);
      } else {
        const deltaX = rawPixel.x - transformGesture.start.x;
        const deltaY = rawPixel.y - transformGesture.start.y;
        next = {
          ...cloneSelection(transformGesture.origin),
          x: Math.max(0, Math.min(width - transformGesture.origin.width, transformGesture.origin.x + deltaX)),
          y: Math.max(0, Math.min(height - transformGesture.origin.height, transformGesture.origin.y + deltaY)),
        };
        onTransformPivotChange({x: transformGesture.startPivot.x + next.x - transformGesture.origin.x, y: transformGesture.startPivot.y + next.y - transformGesture.origin.y});
      }
      const currentSelection = selection ?? transformGesture.origin;
      if (next.x === currentSelection.x && next.y === currentSelection.y && next.width === currentSelection.width && next.height === currentSelection.height) return;
      const nextSelection = renderClipboardTransformFromSource(
        targetPixels,
        width,
        height,
        transformGesture.before,
        transformGesture.sourceOrigin,
        transformGesture.source,
        next,
        backgroundClearColor,
      );
      transformGesture.moved = true;
      if (transformSessionRef.current) transformSessionRef.current.currentSelection = nextSelection;
      onSelectionChange(nextSelection);
      setTransformPreviewQuad(selectionQuad(nextSelection));
      // Every preview starts by restoring the original buffer. A full invalidation also
      // clears pixels covered by an earlier preview after rapid pointer movement.
      onPixelsChanged({x: 0, y: 0, width, height});
      return;
    }

    const pendingOutsideGesture = pendingOutsideGestureRef.current;
    if (pendingOutsideGesture) {
      if (!inside) return;
      const editPixels = onEnsureEditablePixels();
      if (!editPixels) {
        pendingOutsideGestureRef.current = null;
        onBlockedEdit();
        return;
      }
      activeEditPixelsRef.current = editPixels;
      stabilizedPointRef.current = clampToDocument(pendingOutsideGesture.start);
      const gesture = beginTool(
        toolContext(event),
        pendingOutsideGesture.tool,
        clampToDocument(pendingOutsideGesture.start),
        pendingOutsideGesture.constrainLine,
      );
      pendingOutsideGestureRef.current = null;
      gestureRef.current = gesture;
      applyResult(gesture, gesture.before);
      const movePoint = gesture.tool === "ellipse" && event.shiftKey
        ? constrainPointToSquare(gesture.start, rawPixel)
        : freehandTools.has(gesture.tool)
          ? (stabilizedPointRef.current = stabilizePointerPoint(stabilizedPointRef.current, rawPixel, brushStabilizer))
          : rawPixel;
      applyResult(moveTool(toolContext(event), gesture, movePoint), gesture.before);
      return;
    }

    const sliceGesture = sliceGestureRef.current;
    if (sliceGesture) {
      const end = clampToDocument(rawPixel);
      sliceGesture.moved = sliceGesture.moved || end.x !== sliceGesture.start.x || end.y !== sliceGesture.start.y;
      setSlicePreview({id: "new", bounds: selectionFromPoints(sliceGesture.start.x, sliceGesture.start.y, end.x, end.y, width, height) ?? {x: end.x, y: end.y, width: 1, height: 1}});
      return;
    }

    const cropGesture = cropGestureRef.current;
    if (cropGesture) {
      const end = clampToDocument(rawPixel);
      cropGesture.moved = cropGesture.moved || end.x !== cropGesture.start.x || end.y !== cropGesture.start.y;
      setCropPreview(selectionFromPoints(
        cropGesture.start.x,
        cropGesture.start.y,
        end.x,
        end.y,
        width,
        height,
      ));
      return;
    }

    const selectionGesture = selectionGestureRef.current;
    if (selectionGesture) {
      const point = clampToDocument(rawPixel);
      if (selectionGesture.mode === "select") {
        selectionGesture.moved = true;
        const points = selectionGesture.points ?? [selectionGesture.start];
        if (selectionGesture.shape === "lasso" || selectionGesture.shape === "polygon") {
          const previous = points.at(-1);
          if (!previous || previous.x !== point.x || previous.y !== point.y) points.push(point);
        }
        const next = selectionGesture.shape === "ellipse"
          ? ellipseSelection(selectionGesture.start.x, selectionGesture.start.y, point.x, point.y, width, height, selectionAntialias)
          : selectionGesture.shape === "lasso"
            ? lassoSelection(points, width, height, selectionAntialias)
            : selectionGesture.shape === "polygon"
              ? polygonSelection(simplifyPolygonDrag(points), width, height, selectionAntialias)
              : selectionFromPoints(selectionGesture.start.x, selectionGesture.start.y, point.x, point.y, width, height);
        onSelectionChange(combineSelections(
          selectionGesture.baseSelection ?? null,
          next,
          selectionGesture.operation ?? "replace",
        ));
      } else if (selectionGesture.before) {
        const targetPixels = activeEditPixelsRef.current ?? pixels;
        targetPixels.set(selectionGesture.before);
        const moved = moveSelection(
          targetPixels,
          width,
          height,
          selectionGesture.origin,
          selectionGesture.origin.x + point.x - selectionGesture.start.x,
          selectionGesture.origin.y + point.y - selectionGesture.start.y,
          backgroundClearColor,
        );
        onSelectionChange(moved);
        // Each preview restores the original buffer, so clear every earlier preview position.
        onPixelsChanged({x: 0, y: 0, width, height});
      }
      return;
    }

    const gesture = gestureRef.current;
    if (!gesture || gesture.tool === "fill") return;
    if (!previewShiftLine && gesture.constrainLine && (gesture.tool === "pencil" || gesture.tool === "eraser")) return;
    if (!inside && gesture.tool !== "line" && gesture.tool !== "rectangle" && gesture.tool !== "ellipse" && gesture.tool !== "curve" && gesture.tool !== "polyline" && gesture.tool !== "gradient" && gesture.tool !== "blur" && gesture.tool !== "jumble") return;
    const movePoint = gesture.tool === "ellipse" && event.shiftKey
      ? constrainPointToSquare(gesture.start, clampToDocument(rawPixel))
      : freehandTools.has(gesture.tool)
        ? (stabilizedPointRef.current = stabilizePointerPoint(stabilizedPointRef.current, clampToDocument(rawPixel), brushStabilizer))
        : clampToDocument(rawPixel);
    applyResult(moveTool(toolContext(event), gesture, movePoint), gesture.before);
  };

  const finishPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const celMoveGesture = celMoveGestureRef.current;
    if (celMoveGesture) {
      const point = snapPointToGrid(documentPoint(eventPoint(event)));
      onCelMovePointer?.("end", celMoveGesture.start, point, {lockAxis: event.shiftKey, autoSelect: celMoveGesture.autoSelect});
      celMoveGestureRef.current = null;
      return;
    }
    if (tilemapGestureRef.current) {
      const raw = snapPointToGrid(documentPoint(eventPoint(event)));
      onTilemapPointer?.("end", raw, tilemapGestureRef.current.secondary);
      tilemapGestureRef.current = null;
      return;
    }
    if (stagedPolylineGestureRef.current || stagedCurveGestureRef.current) {
      if (event.type === "pointercancel") {
        restoreStagedGesture();
        return;
      }
      const point = clampToDocument(snapPointToGrid(documentPoint(eventPoint(event))));
      const stagedPolyline = stagedPolylineGestureRef.current;
      if (stagedPolyline) {
        if (stagedPolyline.pointerDown && !samePoint(stagedPolyline.points[stagedPolyline.points.length - 1], point)) {
          stagedPolyline.points.push(point);
        }
        stagedPolyline.pointerDown = null;
        const shouldCommit = stagedPolyline.finishOnUp || event.button === 2;
        stagedPolyline.finishOnUp = false;
        stagedPolyline.pointerMoved = false;
        if (shouldCommit) commitStagedGesture();
        else renderPolylinePreview(stagedPolyline);
        return;
      }
      const stagedCurve = stagedCurveGestureRef.current;
      if (stagedCurve) {
        if (stagedCurve.phase === "end") {
          if (stagedCurve.pointerDown) {
            const isFirstClick = !stagedCurve.end
              && !stagedCurve.pointerMoved
              && samePoint(stagedCurve.pointerDown, stagedCurve.start)
              && samePoint(point, stagedCurve.start);
            if (isFirstClick) {
              stagedCurve.pointerDown = null;
              stagedCurve.previewPoint = null;
              return;
            }
            stagedCurve.end = point;
            stagedCurve.phase = "control";
            stagedCurve.previewPoint = null;
            stagedCurve.pointerDown = null;
            stagedCurve.pointerMoved = false;
            renderCurvePreview(stagedCurve);
          }
          return;
        }
        stagedCurve.control = point;
        stagedCurve.previewPoint = null;
        stagedCurve.pointerDown = null;
        stagedCurve.pointerMoved = false;
        commitStagedGesture();
        return;
      }
    }
    const canvasAidGesture = canvasAidGestureRef.current;
    if (canvasAidGesture) {
      if (canvasAidGesture.kind === "grid") onGridOffsetChange(canvasAidGesture.x, canvasAidGesture.y);
      else if (canvasAidGesture.kind === "guide") onGuideChange(canvasAidGesture.id, canvasAidGesture.position);
      else if (canvasAidGesture.current.x !== canvasAidGesture.origin.x
        || canvasAidGesture.current.y !== canvasAidGesture.origin.y
        || canvasAidGesture.current.width !== canvasAidGesture.origin.width
        || canvasAidGesture.current.height !== canvasAidGesture.origin.height) {
        const changedItems = canvasAidGesture.items.filter((item) => (
          item.current.x !== item.origin.x
          || item.current.y !== item.origin.y
          || item.current.width !== item.origin.width
          || item.current.height !== item.origin.height
        ));
        if (changedItems.length > 1) {
          const changes = changedItems.map((item) => ({id: item.id, bounds: item.current}));
          if (onSliceBatchBoundsChange) onSliceBatchBoundsChange(changes);
          else for (const change of changes) onSliceBoundsChange(change.id, change.bounds);
        } else if (changedItems.length === 1) {
          onSliceBoundsChange(changedItems[0].id, changedItems[0].current);
        } else {
          onSliceBoundsChange(canvasAidGesture.id, canvasAidGesture.current);
        }
      }
      canvasAidGestureRef.current = null;
      setGuidePreview(null);
      setGridPreview(null);
      setSlicePreview(null);
      return;
    }
    const transformGesture = transformGestureRef.current;
    if (transformGesture) {
      if (transformGesture.moved) onEditCommit(transformGesture.commitBefore);
      transformGestureRef.current = null;
      activeEditPixelsRef.current = null;
      panningRef.current = false;
      setIsPanning(false);
      return;
    }
    const cropGesture = cropGestureRef.current;
    if (cropGesture) {
      const end = clampToDocument(snapPointToGrid(documentPoint(eventPoint(event))));
      const bounds = selectionFromPoints(cropGesture.start.x, cropGesture.start.y, end.x, end.y, width, height);
      cropGestureRef.current = null;
      setCropPreview(null);
      if (bounds && cropGesture.moved) onCrop(bounds);
      return;
    }
    const sliceGesture = sliceGestureRef.current;
    if (sliceGesture) {
      const end = clampToDocument(snapPointToGrid(documentPoint(eventPoint(event))));
      const bounds = selectionFromPoints(sliceGesture.start.x, sliceGesture.start.y, end.x, end.y, width, height);
      sliceGestureRef.current = null;
      setSlicePreview(null);
      if (bounds && sliceGesture.moved) onSliceCreate?.(bounds);
      return;
    }
    const selectionGesture = selectionGestureRef.current;
    if (selectionGesture) {
      if (selectionGesture.mode === "select" && selectionGesture.startedOutside && !selectionGesture.moved) {
        onSelectionChange(selectionGesture.operation === "replace" ? null : selectionGesture.baseSelection ?? null);
      }
      if (selectionGesture.mode === "move" && selectionGesture.before) onEditCommit(selectionGesture.before);
      selectionGestureRef.current = null;
      activeEditPixelsRef.current = null;
      panningRef.current = false;
      setIsPanning(false);
      return;
    }
    const gesture = gestureRef.current;
    if (gesture) {
      const pointer = clampToDocument(snapPointToGrid(documentPoint(eventPoint(event))));
      const point = gesture.tool === "ellipse" && event.shiftKey
        ? constrainPointToSquare(gesture.start, pointer)
        : freehandTools.has(gesture.tool)
          ? stabilizePointerPoint(stabilizedPointRef.current, pointer, brushStabilizer)
          : pointer;
      applyResult(finishTool(toolContext(event), gesture, point), gesture.before);
      onEditCommit(gesture.before);
    }
    gestureRef.current = null;
    pendingOutsideGestureRef.current = null;
    secondaryGestureRef.current = false;
    activeEditPixelsRef.current = null;
    dynamicsSampleRef.current = null;
    stabilizedPointRef.current = null;
    panningRef.current = false;
    setIsPanning(false);
  };

  const handleWheel = useCallback((event: WheelEvent) => {
    if (!wheelZoom) {
      wheelZoomAccumulatorRef.current = 0;
      return;
    }
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const accumulated = accumulateWheelZoom(event.deltaY, wheelZoomAccumulatorRef.current);
    wheelZoomAccumulatorRef.current = accumulated.remainder;
    if (accumulated.step === 0) return;
    const rect = canvas.getBoundingClientRect();
    const point = zoomFromCenter
      ? {x: surfaceSize.width / 2, y: surfaceSize.height / 2}
      : canvasLocalPoint(event, rect, surfaceSize);
    const currentIndex = zoomLevels.indexOf(zoom);
    const nextIndex = Math.max(0, Math.min(zoomLevels.length - 1, currentIndex + accumulated.step));
    const nextZoom = zoomLevels[nextIndex];
    if (nextZoom === zoom) return;
    const documentX = (point.x - viewport.x) / zoom;
    const documentY = (point.y - viewport.y) / zoom;
    setViewport({
      x: Math.round(point.x - documentX * nextZoom),
      y: Math.round(point.y - documentY * nextZoom),
    });
    onZoomChange(nextZoom);
  }, [onZoomChange, surfaceSize, viewport, wheelZoom, zoom, zoomFromCenter]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleWheel, {passive: false});
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const canvasDisplayStyle = {width: surfaceSize.width, height: surfaceSize.height};

  return (
    <div className="pixel-canvas-stack" ref={canvasStackRef}>
      <canvas
        ref={canvasRef}
        className={`pixel-canvas tool-${tool}${isPanning ? " is-panning" : ""}${editable || onTilemapPointer ? "" : " is-locked"}`}
        style={!isPanning && transformCursor
          ? {...canvasDisplayStyle, cursor: transformCursor}
          : !isPanning && brushCursorVisible
            ? {...canvasDisplayStyle, cursor: "none"}
            : canvasDisplayStyle}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onPointerLeave={() => { onCursorChange(null); onTilemapHover?.(null); updateBrushCursor(null); if (!transformGestureRef.current) setTransformCursor(null); }}
      />
      <canvas ref={cursorCanvasRef} className="pixel-cursor-canvas" style={canvasDisplayStyle} aria-hidden="true" />
    </div>
  );
}

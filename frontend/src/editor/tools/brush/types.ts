export type RGBA = readonly [number, number, number, number];
export type BrushShape = "square" | "circle" | "cross" | "diamond";
export type InkMode = "simple" | "alpha-composite" | "copy-alpha" | "lock-alpha";
export type GradientDither = "none" | "ordered";
export type ShapeFillMode = "outline" | "filled" | "both";
export type GradientType = "linear" | "radial" | "angular" | "reflected" | "diamond";
export type PatternAlignment = "source" | "canvas" | "destination";

export interface Point {
  x: number;
  y: number;
}

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

export interface ResolvedBrushSettings {
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

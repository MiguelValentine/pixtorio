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

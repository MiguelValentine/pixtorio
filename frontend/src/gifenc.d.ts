declare module "gifenc" {
  export function GIFEncoder(): {
    writeFrame(index: Uint8Array, width: number, height: number, options: {palette: number[][]; delay?: number; repeat?: number; transparent?: boolean; transparentIndex?: number}): void;
    finish(): void;
    bytes(): Uint8Array;
  };
  export function quantize(pixels: Uint8ClampedArray, maxColors: number, options?: {format?: string; oneBitAlpha?: boolean}): number[][];
  export function applyPalette(pixels: Uint8ClampedArray, palette: number[][], format?: string): Uint8Array;
}

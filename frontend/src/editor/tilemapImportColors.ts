import {
  indexPixels,
  parseHexColor,
  quantizePixelsInPlace,
  renderIndexedPixels,
} from "./colorModes";
import type {ColorMode} from "./document";

export interface ImportedTilePalette {
  readonly colors: readonly string[];
  readonly transparentIndex: number;
}

export interface NormalizedImportedTilePixels {
  pixels: Uint8ClampedArray;
  indexes?: Uint8Array;
}

/** Normalizes an imported PNG tile without mutating the decoder-owned pixels. */
export function normalizeImportedTilePixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  colorMode: ColorMode,
  palette: ImportedTilePalette,
): NormalizedImportedTilePixels {
  validatePixelBuffer(pixels, width, height);

  switch (colorMode) {
    case "rgba":
      return {pixels: pixels.slice()};
    case "indexed": {
      validateIndexedPalette(palette);
      const normalized = pixels.slice();
      const indexes = indexPixels(normalized, palette.colors, {
        width,
        height,
        transparentIndex: palette.transparentIndex,
      });
      renderIndexedPixels(indexes, normalized, palette.colors, palette.transparentIndex);
      return {pixels: normalized, indexes};
    }
    case "grayscale":
    case "bitmap": {
      const normalized = pixels.slice();
      quantizePixelsInPlace(normalized, colorMode, palette.colors);
      return {pixels: normalized};
    }
    default:
      throw new Error("Imported tile color mode is invalid");
  }
}

function validatePixelBuffer(pixels: Uint8ClampedArray, width: number, height: number) {
  if (!(pixels instanceof Uint8ClampedArray)) throw new Error("Imported tile pixels are invalid");
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error("Imported tile dimensions are invalid");
  }
  const pixelCount = width * height;
  if (!Number.isSafeInteger(pixelCount) || pixels.length !== pixelCount * 4) {
    throw new Error("Imported tile pixel dimensions are invalid");
  }
}

function validateIndexedPalette(palette: ImportedTilePalette) {
  if (!palette || !Array.isArray(palette.colors) || palette.colors.length < 1 || palette.colors.length > 256
    || !Number.isInteger(palette.transparentIndex)
    || palette.transparentIndex < 0
    || palette.transparentIndex >= palette.colors.length
    || palette.colors.some((color) => typeof color !== "string" || parseHexColor(color) === null)) {
    throw new Error("Imported indexed palette is invalid");
  }
}

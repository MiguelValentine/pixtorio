import type {PixelBuffer, PixelClipboard, RotationDirection, Selection, SelectionMask, SelectionPoint, TransformAxis} from "./selectionTypes";

import {assertPixelBuffer, assertSelectionDimensions, cloneSelection, hasUsableMask, maskForSelection, normalizeCoverageValue, normalizeMask, selectionFromMask} from "./selectionMask";



export function resizePixelsNearestNeighbor(
  pixels: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Uint8ClampedArray {
  assertSelectionDimensions(sourceWidth, sourceHeight);
  assertSelectionDimensions(targetWidth, targetHeight);
  assertPixelBuffer(pixels, sourceWidth, sourceHeight);
  const output = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  for (let targetY = 0; targetY < targetHeight; targetY += 1) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor(targetY * sourceHeight / targetHeight));
    for (let targetX = 0; targetX < targetWidth; targetX += 1) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor(targetX * sourceWidth / targetWidth));
      const sourceIndex = (sourceY * sourceWidth + sourceX) * 4;
      const targetIndex = (targetY * targetWidth + targetX) * 4;
      output.set(pixels.subarray(sourceIndex, sourceIndex + 4), targetIndex);
    }
  }
  return output;
}

export const resizePixelBuffer = resizePixelsNearestNeighbor;

export function resizeSelection(selection: Selection, width: number, height: number): Selection | null {
  assertSelectionDimensions(width, height);
  const resizedMask = resizeCoverageMask(maskForSelection(selection), selection.width, selection.height, width, height);
  return selectionFromMask(selection.x, selection.y, width, height, resizedMask);
}

export function resizeClipboard(clipboard: PixelClipboard, width: number, height: number): PixelClipboard {
  const resized: PixelClipboard = {
    width,
    height,
    pixels: resizePixelsNearestNeighbor(clipboard.pixels, clipboard.width, clipboard.height, width, height),
  };
  if (hasUsableClipboardMask(clipboard)) {
    resized.mask = resizeCoverageMask(normalizeMask(clipboard.mask!, clipboard.width * clipboard.height), clipboard.width, clipboard.height, width, height);
  }
  return resized;
}

export function flipPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  axis: TransformAxis,
): Uint8ClampedArray {
  assertSelectionDimensions(width, height);
  assertPixelBuffer(pixels, width, height);
  const output = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const targetX = axis === "horizontal" ? width - 1 - x : x;
      const targetY = axis === "vertical" ? height - 1 - y : y;
      const sourceIndex = (y * width + x) * 4;
      output.set(pixels.subarray(sourceIndex, sourceIndex + 4), (targetY * width + targetX) * 4);
    }
  }
  return output;
}

export const flipPixelBuffer = flipPixels;

export function flipSelection(selection: Selection, axis: TransformAxis): Selection {
  if (!hasUsableMask(selection)) return cloneSelection(selection);
  const source = normalizeMask(selection.mask!, selection.width * selection.height);
  const transformed = new Uint8Array(source.length);
  for (let y = 0; y < selection.height; y += 1) {
    for (let x = 0; x < selection.width; x += 1) {
      const targetX = axis === "horizontal" ? selection.width - 1 - x : x;
      const targetY = axis === "vertical" ? selection.height - 1 - y : y;
      transformed[targetY * selection.width + targetX] = source[y * selection.width + x];
    }
  }
  return selectionFromMask(selection.x, selection.y, selection.width, selection.height, transformed)!;
}

export const flipSelectionMask = flipSelection;

export function flipClipboard(clipboard: PixelClipboard, axis: TransformAxis): PixelClipboard {
  const flipped: PixelClipboard = {
    width: clipboard.width,
    height: clipboard.height,
    pixels: flipPixels(clipboard.pixels, clipboard.width, clipboard.height, axis),
  };
  if (hasUsableClipboardMask(clipboard)) {
    flipped.mask = flipMask(normalizeMask(clipboard.mask!, clipboard.width * clipboard.height), clipboard.width, clipboard.height, axis);
  }
  return flipped;
}

export function rotatePixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  direction: RotationDirection,
): PixelBuffer {
  assertSelectionDimensions(width, height);
  assertPixelBuffer(pixels, width, height);
  const outputWidth = height;
  const outputHeight = width;
  const output = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const targetX = direction === "clockwise" ? height - 1 - y : y;
      const targetY = direction === "clockwise" ? x : width - 1 - x;
      const sourceIndex = (y * width + x) * 4;
      output.set(pixels.subarray(sourceIndex, sourceIndex + 4), (targetY * outputWidth + targetX) * 4);
    }
  }
  return {width: outputWidth, height: outputHeight, pixels: output};
}

export function rotateSelection(selection: Selection, direction: RotationDirection): Selection {
  if (!hasUsableMask(selection)) {
    return {
      x: selection.x,
      y: selection.y,
      width: selection.height,
      height: selection.width,
    };
  }
  const source = normalizeMask(selection.mask!, selection.width * selection.height);
  const outputWidth = selection.height;
  const outputHeight = selection.width;
  const transformed = new Uint8Array(outputWidth * outputHeight);
  for (let y = 0; y < selection.height; y += 1) {
    for (let x = 0; x < selection.width; x += 1) {
      const targetX = direction === "clockwise" ? selection.height - 1 - y : y;
      const targetY = direction === "clockwise" ? x : selection.width - 1 - x;
      transformed[targetY * outputWidth + targetX] = source[y * selection.width + x];
    }
  }
  return selectionFromMask(selection.x, selection.y, outputWidth, outputHeight, transformed)!;
}

export function rotateClipboard(clipboard: PixelClipboard, direction: RotationDirection): PixelClipboard {
  const rotatedPixels = rotatePixels(clipboard.pixels, clipboard.width, clipboard.height, direction);
  const rotated: PixelClipboard = rotatedPixels;
  if (hasUsableClipboardMask(clipboard)) {
    const source = normalizeMask(clipboard.mask!, clipboard.width * clipboard.height);
    const output = new Uint8Array(rotated.width * rotated.height);
    for (let y = 0; y < clipboard.height; y += 1) {
      for (let x = 0; x < clipboard.width; x += 1) {
        const targetX = direction === "clockwise" ? clipboard.height - 1 - y : y;
        const targetY = direction === "clockwise" ? x : clipboard.width - 1 - x;
        output[targetY * rotated.width + targetX] = source[y * clipboard.width + x];
      }
    }
    rotated.mask = output;
  }
  return rotated;
}

/** Rotates clipboard pixels by an arbitrary angle using nearest-neighbor sampling. */
export function rotateClipboardArbitrary(
  clipboard: PixelClipboard,
  angleDegrees: number,
  pivot?: SelectionPoint,
): PixelClipboard {
  assertSelectionDimensions(clipboard.width, clipboard.height);
  assertPixelBuffer(clipboard.pixels, clipboard.width, clipboard.height);
  if (!Number.isFinite(angleDegrees)) throw new RangeError("Rotation angle must be finite");
  const radians = angleDegrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const hasExplicitPivot = pivot !== undefined;
  if (pivot && (!Number.isFinite(pivot.x) || !Number.isFinite(pivot.y))) {
    throw new RangeError("Rotation pivot must be finite");
  }
  const sourcePivot = pivot ?? {x: (clipboard.width - 1) / 2, y: (clipboard.height - 1) / 2};
  const defaultWidth = Math.max(1, Math.ceil(Math.abs(clipboard.width * cosine) + Math.abs(clipboard.height * sine)));
  const defaultHeight = Math.max(1, Math.ceil(Math.abs(clipboard.width * sine) + Math.abs(clipboard.height * cosine)));
  let width = defaultWidth;
  let height = defaultHeight;
  let outputOriginX = 0;
  let outputOriginY = 0;
  if (hasExplicitPivot) {
    const corners = [
      {x: 0, y: 0},
      {x: clipboard.width - 1, y: 0},
      {x: clipboard.width - 1, y: clipboard.height - 1},
      {x: 0, y: clipboard.height - 1},
    ].map((corner) => rotatePointAround(corner, sourcePivot, cosine, sine));
    const minimumX = Math.floor(Math.min(...corners.map((corner) => corner.x)) + 1e-9);
    const maximumX = Math.ceil(Math.max(...corners.map((corner) => corner.x)) - 1e-9);
    const minimumY = Math.floor(Math.min(...corners.map((corner) => corner.y)) + 1e-9);
    const maximumY = Math.ceil(Math.max(...corners.map((corner) => corner.y)) - 1e-9);
    outputOriginX = minimumX;
    outputOriginY = minimumY;
    width = Math.max(1, maximumX - minimumX + 1);
    height = Math.max(1, maximumY - minimumY + 1);
  }
  const output = new Uint8ClampedArray(width * height * 4);
  const outputMask = new Uint8Array(width * height);
  const sourceMask = clipboard.mask ? normalizeMask(clipboard.mask, clipboard.width * clipboard.height) : null;
  const sourceCenterX = (clipboard.width - 1) / 2;
  const sourceCenterY = (clipboard.height - 1) / 2;
  const targetCenterX = (width - 1) / 2;
  const targetCenterY = (height - 1) / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const worldX = hasExplicitPivot ? x + outputOriginX : x - targetCenterX + sourceCenterX;
      const worldY = hasExplicitPivot ? y + outputOriginY : y - targetCenterY + sourceCenterY;
      const translatedX = worldX - sourcePivot.x;
      const translatedY = worldY - sourcePivot.y;
      const sourceX = Math.round(translatedX * cosine + translatedY * sine + sourcePivot.x);
      const sourceY = Math.round(-translatedX * sine + translatedY * cosine + sourcePivot.y);
      if (sourceX < 0 || sourceY < 0 || sourceX >= clipboard.width || sourceY >= clipboard.height) continue;
      const sourceCell = sourceY * clipboard.width + sourceX;
      if (sourceMask && !sourceMask[sourceCell]) continue;
      const targetCell = y * width + x;
      output.set(clipboard.pixels.subarray(sourceCell * 4, sourceCell * 4 + 4), targetCell * 4);
      outputMask[targetCell] = sourceMask ? normalizeCoverageValue(sourceMask[sourceCell]) : 255;
    }
  }
  return {width, height, pixels: output, mask: outputMask};
}

/** Explicit-pivot alias for callers that want to document transform intent. */
export const rotateClipboardAroundPivot = rotateClipboardArbitrary;

export function resizeCoverageMask(
  mask: SelectionMask,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Uint8Array {
  assertSelectionDimensions(sourceWidth, sourceHeight);
  assertSelectionDimensions(targetWidth, targetHeight);
  const source = normalizeMask(mask, sourceWidth * sourceHeight);
  const output = new Uint8Array(targetWidth * targetHeight);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor(y * sourceHeight / targetHeight));
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor(x * sourceWidth / targetWidth));
      output[y * targetWidth + x] = source[sourceY * sourceWidth + sourceX];
    }
  }
  return output;
}

/** @deprecated The old name remains as a coverage-preserving alias. */
export const resizeBinaryMask = resizeCoverageMask;



function rotatePointAround(point: SelectionPoint, pivot: SelectionPoint, cosine: number, sine: number) {
  const x = point.x - pivot.x;
  const y = point.y - pivot.y;
  return {
    x: x * cosine - y * sine + pivot.x,
    y: x * sine + y * cosine + pivot.y,
  };
}



function hasUsableClipboardMask(clipboard: PixelClipboard) {
  return clipboard.mask !== undefined && clipboard.mask.length === clipboard.width * clipboard.height;
}



function flipMask(mask: Uint8Array, width: number, height: number, axis: TransformAxis) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const targetX = axis === "horizontal" ? width - 1 - x : x;
      const targetY = axis === "vertical" ? height - 1 - y : y;
      output[targetY * width + targetX] = mask[y * width + x];
    }
  }
  return output;
}

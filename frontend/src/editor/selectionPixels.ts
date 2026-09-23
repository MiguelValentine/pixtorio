import type {PixelClipboard, PixelDirtyBounds, Selection} from "./selectionTypes";

import {assertCanvasSize, assertCanvasWidth, assertPixelBuffer, assertSelectionDimensions, borderSelection, canvasHeightFor, clipSelection, hasUsableMask, maskCoverageAt, normalizeMask, selectionCoverageAt} from "./selectionMask";



export function copySelection(pixels: Uint8ClampedArray, canvasWidth: number, selection: Selection): PixelClipboard {
  assertCanvasWidth(canvasWidth);
  assertSelectionDimensions(selection.width, selection.height);
  const output = new Uint8ClampedArray(selection.width * selection.height * 4);
  const canvasHeight = canvasHeightFor(pixels, canvasWidth);
  for (let row = 0; row < selection.height; row += 1) {
    const sourceY = selection.y + row;
    if (sourceY < 0 || sourceY >= canvasHeight) continue;
    for (let column = 0; column < selection.width; column += 1) {
      if (selectionCoverageAt(selection, selection.x + column, sourceY) <= 0) continue;
      const sourceX = selection.x + column;
      if (sourceX < 0 || sourceX >= canvasWidth) continue;
      const sourceIndex = (sourceY * canvasWidth + sourceX) * 4;
      const targetIndex = (row * selection.width + column) * 4;
      output.set(pixels.subarray(sourceIndex, sourceIndex + 4), targetIndex);
    }
  }
  const clipboard: PixelClipboard = {width: selection.width, height: selection.height, pixels: output};
  if (hasUsableMask(selection)) clipboard.mask = normalizeMask(selection.mask!, selection.width * selection.height);
  return clipboard;
}

export function clearSelection(
  pixels: Uint8ClampedArray,
  canvasWidth: number,
  selection: Selection,
  replacement: readonly [number, number, number, number] = [0, 0, 0, 0],
) {
  assertCanvasWidth(canvasWidth);
  const canvasHeight = canvasHeightFor(pixels, canvasWidth);
  for (let row = 0; row < selection.height; row += 1) {
    const pointY = selection.y + row;
    if (pointY < 0 || pointY >= canvasHeight) continue;
    for (let column = 0; column < selection.width; column += 1) {
      const pointX = selection.x + column;
      if (pointX < 0 || pointX >= canvasWidth) continue;
      const index = (pointY * canvasWidth + pointX) * 4;
      const coverage = selectionCoverageAt(selection, pointX, pointY);
      if (coverage <= 0) continue;
      if (coverage >= 255) {
        pixels.set(replacement, index);
        continue;
      }
      const amount = coverage / 255;
      for (let channel = 0; channel < 4; channel += 1) {
        pixels[index + channel] = Math.round(pixels[index + channel] + (replacement[channel] - pixels[index + channel]) * amount);
      }
    }
  }
}

/** Source-over fills every covered selection pixel with an RGBA color. */
export function fillSelection(
  pixels: Uint8ClampedArray,
  canvasWidth: number,
  selection: Selection,
  color: readonly [number, number, number, number],
) {
  assertCanvasWidth(canvasWidth);
  const canvasHeight = canvasHeightFor(pixels, canvasWidth);
  for (let row = 0; row < selection.height; row += 1) {
    const pointY = selection.y + row;
    if (pointY < 0 || pointY >= canvasHeight) continue;
    for (let column = 0; column < selection.width; column += 1) {
      const pointX = selection.x + column;
      if (pointX < 0 || pointX >= canvasWidth) continue;
      const coverage = selectionCoverageAt(selection, pointX, pointY) / 255;
      const sourceAlpha = color[3] / 255 * coverage;
      if (sourceAlpha <= 0) continue;
      const offset = (pointY * canvasWidth + pointX) * 4;
      const destinationAlpha = pixels[offset + 3] / 255;
      const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[offset + channel] = outputAlpha <= 0
          ? 0
          : Math.round((color[channel] * sourceAlpha + pixels[offset + channel] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
      }
      pixels[offset + 3] = Math.round(outputAlpha * 255);
    }
  }
}

/** Fills an inward border derived from the current selection. */
export function strokeSelection(
  pixels: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  selection: Selection,
  color: readonly [number, number, number, number],
  thickness = 1,
) {
  const border = borderSelection(selection, thickness, canvasWidth, canvasHeight);
  if (border) fillSelection(pixels, canvasWidth, border, color);
}

/** Circularly shifts an entire pixel buffer, wrapping at every canvas edge. */
export function shiftPixelsWrapped(
  pixels: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  deltaX: number,
  deltaY: number,
  selection?: Selection | null,
) {
  assertCanvasSize(canvasWidth, canvasHeight);
  assertPixelBuffer(pixels, canvasWidth, canvasHeight);
  const bounds = selection
    ? clipSelection(selection, canvasWidth, canvasHeight)
    : {x: 0, y: 0, width: canvasWidth, height: canvasHeight};
  if (!bounds) return;
  const shiftX = ((Math.round(deltaX) % bounds.width) + bounds.width) % bounds.width;
  const shiftY = ((Math.round(deltaY) % bounds.height) + bounds.height) % bounds.height;
  if (shiftX === 0 && shiftY === 0) return;
  const source = pixels.slice();
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const coverage = selection ? selectionCoverageAt(selection, x, y) : 255;
      if (coverage <= 0) continue;
      const sourceX = bounds.x + ((x - bounds.x - shiftX + bounds.width) % bounds.width);
      const sourceY = bounds.y + ((y - bounds.y - shiftY + bounds.height) % bounds.height);
      const sourceOffset = (sourceY * canvasWidth + sourceX) * 4;
      const targetOffset = (y * canvasWidth + x) * 4;
      if (coverage >= 255) {
        pixels.set(source.subarray(sourceOffset, sourceOffset + 4), targetOffset);
        continue;
      }
      const amount = coverage / 255;
      for (let channel = 0; channel < 4; channel += 1) {
        pixels[targetOffset + channel] = Math.round(
          source[targetOffset + channel] + (source[sourceOffset + channel] - source[targetOffset + channel]) * amount,
        );
      }
    }
  }
}

/**
 * Restores edits outside an active selection from the pre-gesture snapshot.
 *
 * Pixel tools can render a complete preview into the authoritative buffer, so
 * clipping after each preview keeps every non-selected pixel unchanged while
 * leaving selected pixels untouched. The optional dirty bounds limit the
 * scan to the area reported by the tool and are intersected with the canvas.
 */
export function clipPixelEditsToSelection(
  pixels: Uint8ClampedArray,
  before: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  selection: Selection | null,
  dirtyBounds?: PixelDirtyBounds,
): void {
  assertCanvasSize(canvasWidth, canvasHeight);
  assertPixelBuffer(pixels, canvasWidth, canvasHeight);
  assertPixelBuffer(before, canvasWidth, canvasHeight);
  if (!selection) return;

  const bounds = clippedDirtyBounds(dirtyBounds, canvasWidth, canvasHeight);
  if (!bounds) return;

  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const pixelIndex = (y * canvasWidth + x) * 4;
      const coverage = selectionCoverageAt(selection, x, y);
      if (coverage >= 255) continue;
      if (pixels[pixelIndex] === before[pixelIndex]
        && pixels[pixelIndex + 1] === before[pixelIndex + 1]
        && pixels[pixelIndex + 2] === before[pixelIndex + 2]
        && pixels[pixelIndex + 3] === before[pixelIndex + 3]) continue;
      if (coverage <= 0) {
        pixels.set(before.subarray(pixelIndex, pixelIndex + 4), pixelIndex);
        continue;
      }
      const amount = coverage / 255;
      for (let channel = 0; channel < 4; channel += 1) {
        pixels[pixelIndex + channel] = Math.round(
          before[pixelIndex + channel] + (pixels[pixelIndex + channel] - before[pixelIndex + channel]) * amount,
        );
      }
    }
  }
}

export function pasteClipboard(
  pixels: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  clipboard: PixelClipboard,
  destinationX: number,
  destinationY: number,
) {
  assertCanvasSize(canvasWidth, canvasHeight);
  assertSelectionDimensions(clipboard.width, clipboard.height);
  assertPixelBuffer(clipboard.pixels, clipboard.width, clipboard.height);
  for (let sourceY = 0; sourceY < clipboard.height; sourceY += 1) {
    const targetY = destinationY + sourceY;
    if (targetY < 0 || targetY >= canvasHeight) continue;
    for (let sourceX = 0; sourceX < clipboard.width; sourceX += 1) {
      const coverage = hasUsableClipboardMask(clipboard)
        ? maskCoverageAt(clipboard.mask!, sourceY * clipboard.width + sourceX)
        : 255;
      if (coverage <= 0) continue;
      const targetX = destinationX + sourceX;
      if (targetX < 0 || targetX >= canvasWidth) continue;
      const sourceIndex = (sourceY * clipboard.width + sourceX) * 4;
      const targetIndex = (targetY * canvasWidth + targetX) * 4;
      if (coverage >= 255) {
        pixels.set(clipboard.pixels.subarray(sourceIndex, sourceIndex + 4), targetIndex);
        continue;
      }
      const amount = coverage / 255;
      for (let channel = 0; channel < 4; channel += 1) {
        pixels[targetIndex + channel] = Math.round(
          pixels[targetIndex + channel] + (clipboard.pixels[sourceIndex + channel] - pixels[targetIndex + channel]) * amount,
        );
      }
    }
  }
}

export function moveSelection(
  pixels: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  selection: Selection,
  destinationX: number,
  destinationY: number,
  clearColor?: readonly [number, number, number, number],
) {
  const clipboard = copySelection(pixels, canvasWidth, selection);
  clearSelection(pixels, canvasWidth, selection, clearColor);
  pasteClipboard(pixels, canvasWidth, canvasHeight, clipboard, destinationX, destinationY);
  return clipSelection(translateSelection(selection, destinationX - selection.x, destinationY - selection.y), canvasWidth, canvasHeight);
}

export function translateSelection(selection: Selection, deltaX: number, deltaY: number): Selection {
  const translated: Selection = {
    x: selection.x + deltaX,
    y: selection.y + deltaY,
    width: selection.width,
    height: selection.height,
  };
  if (hasUsableMask(selection)) translated.mask = normalizeMask(selection.mask!, selection.width * selection.height);
  return translated;
}

function hasUsableClipboardMask(clipboard: PixelClipboard) {
  return clipboard.mask !== undefined && clipboard.mask.length === clipboard.width * clipboard.height;
}



function clippedDirtyBounds(
  dirtyBounds: PixelDirtyBounds | undefined,
  canvasWidth: number,
  canvasHeight: number,
): PixelDirtyBounds | null {
  if (!dirtyBounds) return {x: 0, y: 0, width: canvasWidth, height: canvasHeight};
  if (![dirtyBounds.x, dirtyBounds.y, dirtyBounds.width, dirtyBounds.height].every(Number.isFinite)
    || dirtyBounds.width <= 0 || dirtyBounds.height <= 0) return null;

  const rightEdge = dirtyBounds.x + dirtyBounds.width;
  const bottomEdge = dirtyBounds.y + dirtyBounds.height;
  if (!Number.isFinite(rightEdge) || !Number.isFinite(bottomEdge)) return null;

  const left = Math.max(0, Math.floor(dirtyBounds.x));
  const top = Math.max(0, Math.floor(dirtyBounds.y));
  const right = Math.min(canvasWidth, Math.ceil(rightEdge));
  const bottom = Math.min(canvasHeight, Math.ceil(bottomEdge));
  if (right <= left || bottom <= top) return null;
  return {x: left, y: top, width: right - left, height: bottom - top};
}

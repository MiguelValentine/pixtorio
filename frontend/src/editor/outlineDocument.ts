import type {Cel, PixelDocument} from "./document";
import {indexPixels, renderIndexedPixels} from "./colorModes";
import {outlinePixelsInPlace, type OutlineOptions} from "./effects";

type DocumentOutlineOptions = Omit<OutlineOptions, "width" | "height">;

export function rasterizeOutlineCel(document: PixelDocument, cel: Cel) {
  const pixels = new Uint8ClampedArray(document.width * document.height * 4);
  const left = Math.max(0, cel.x), right = Math.min(document.width, cel.x + cel.width);
  if (left >= right) return pixels;
  for (let y = Math.max(0, cel.y); y < Math.min(document.height, cel.y + cel.height); y++) {
    const source = ((y - cel.y) * cel.width + left - cel.x) * 4;
    pixels.set(cel.pixels.subarray(source, source + (right - left) * 4), (y * document.width + left) * 4);
  }
  return pixels;
}

/** Calculate in document coordinates; preserve original pixels outside the canvas. */
export function renderDocumentOutline(document: PixelDocument, cel: Cel, options: DocumentOutlineOptions): Cel {
  const before = rasterizeOutlineCel(document, cel);
  const after = before.slice();
  if (!outlinePixelsInPlace(after, {...options, width: document.width, height: document.height})) return cel;
  const changed = new Uint8Array(document.width * document.height);
  const differs = (offset: number) => before[offset] !== after[offset]
    || before[offset + 1] !== after[offset + 1]
    || before[offset + 2] !== after[offset + 2]
    || before[offset + 3] !== after[offset + 3];
  for (let pixel = 0; pixel < changed.length; pixel++) changed[pixel] = differs(pixel * 4) ? 1 : 0;
  const indexed = document.colorMode === "indexed";
  const mappedIndexes = indexed ? indexPixels(after, document.palette.colors, document.palette.transparentIndex) : undefined;
  if (mappedIndexes) renderIndexedPixels(mappedIndexes, after, document.palette.colors, document.palette.transparentIndex);
  let left = cel.x, top = cel.y, right = cel.x + cel.width, bottom = cel.y + cel.height;
  let count = 0;
  for (let pixel = 0; pixel < changed.length; pixel++) {
    if (!changed[pixel] || !differs(pixel * 4)) { changed[pixel] = 0; continue; }
    const x = pixel % document.width, y = Math.floor(pixel / document.width);
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
    count++;
  }
  if (!count) return cel;
  const width = right - left, height = bottom - top;
  if (width > 2048 || height > 2048) throw new Error("Outline would exceed the 2048-pixel Cel limit");
  const pixels = new Uint8ClampedArray(width * height * 4);
  const indexes = indexed ? new Uint8Array(width * height).fill(document.palette.transparentIndex) : undefined;
  if (indexes) renderIndexedPixels(indexes, pixels, document.palette.colors, document.palette.transparentIndex);
  for (let y = 0; y < cel.height; y++) {
    const destination = (y + cel.y - top) * width + cel.x - left;
    pixels.set(cel.pixels.subarray(y * cel.width * 4, (y + 1) * cel.width * 4), destination * 4);
    if (indexes && cel.indexes) indexes.set(cel.indexes.subarray(y * cel.width, (y + 1) * cel.width), destination);
  }
  for (let pixel = 0; pixel < changed.length; pixel++) {
    if (!changed[pixel]) continue;
    const destination = (Math.floor(pixel / document.width) - top) * width + pixel % document.width - left;
    pixels.set(after.subarray(pixel * 4, pixel * 4 + 4), destination * 4);
    if (indexes && mappedIndexes) indexes[destination] = mappedIndexes[pixel];
  }
  return {...cel, x: left, y: top, width, height, pixels, indexes};
}

export function applyRenderedOutline(document: PixelDocument, source: Cel, result: Cel) {
  if (result === source) return false;
  const dx = result.x - source.x, dy = result.y - source.y;
  for (const alias of Object.values(document.cels)) {
    if (alias.linkId !== source.linkId) continue;
    alias.x += dx; alias.y += dy;
    alias.width = result.width; alias.height = result.height;
    alias.pixels = result.pixels; alias.indexes = result.indexes;
  }
  return true;
}

export function commitDocumentOutline(document: PixelDocument, cel: Cel, options: DocumentOutlineOptions) {
  return applyRenderedOutline(document, cel, renderDocumentOutline(document, cel, options));
}

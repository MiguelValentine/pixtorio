import type {Cel} from "./document";
import {selectionCoverageAt, type Selection} from "./selection";
import {createBitmapBrush, MAX_BRUSH_SIZE, type PatternBrush} from "./tools";

/** Capture authoritative pixels in document coordinates, including soft selection alpha. */
export function captureSelectionBrush(cel: Cel, selection: Selection) {
  if (selection.width < 1 || selection.height < 1 || selection.width > MAX_BRUSH_SIZE || selection.height > MAX_BRUSH_SIZE) return null;
  const pixels = new Uint8ClampedArray(selection.width * selection.height * 4);
  const mask = new Uint8Array(selection.width * selection.height);
  for (let y = 0; y < selection.height; y++) for (let x = 0; x < selection.width; x++) {
    const documentX = selection.x + x, documentY = selection.y + y;
    const localX = documentX - cel.x, localY = documentY - cel.y;
    const coverage = selectionCoverageAt(selection, documentX, documentY);
    if (!coverage || localX < 0 || localY < 0 || localX >= cel.width || localY >= cel.height) continue;
    const source = (localY * cel.width + localX) * 4;
    const destination = (y * selection.width + x) * 4;
    pixels.set(cel.pixels.subarray(source, source + 4), destination);
    pixels[destination + 3] = Math.round(cel.pixels[source + 3] * coverage / 255);
    if (pixels[destination + 3]) mask[y * selection.width + x] = 1;
  }
  const pattern: PatternBrush = {width: selection.width, height: selection.height, pixels, sourceX: selection.x, sourceY: selection.y};
  return {bitmap: createBitmapBrush(selection.width, selection.height, mask), pattern};
}

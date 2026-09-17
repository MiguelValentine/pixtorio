import {
  getCel,
  getLayerByID,
  isImageLayer,
  isLayerEffectivelyLocked,
  type Cel,
  type PixelDocument,
} from "./document";
import {clippedSelection, selectionFromMask, type Selection} from "./selection";

/**
 * Returns the opaque pixels represented by a Cel in document coordinates.
 *
 * Cels may be sparse and therefore have an origin different from the canvas.
 * Indexed documents use their authoritative index buffer instead of relying
 * on the RGBA render cache, while tilemap Cels are intentionally excluded.
 */
export function opaqueContentSelection(
  cel: Pick<Cel, "x" | "y" | "width" | "height" | "pixels" | "indexes" | "tilemap">,
  canvasWidth: number,
  canvasHeight: number,
  options: {indexed?: boolean; transparentIndex?: number} = {},
): Selection | null {
  if (!Number.isInteger(canvasWidth) || !Number.isInteger(canvasHeight) || canvasWidth <= 0 || canvasHeight <= 0) return null;
  if (!Number.isInteger(cel.x) || !Number.isInteger(cel.y)
    || !Number.isInteger(cel.width) || !Number.isInteger(cel.height)
    || cel.width <= 0 || cel.height <= 0
    || cel.pixels.length !== cel.width * cel.height * 4
    || cel.tilemap) return null;

  const pixelCount = cel.width * cel.height;
  const mask = new Uint8Array(pixelCount);
  if (options.indexed) {
    const transparentIndex = Number.isInteger(options.transparentIndex) ? options.transparentIndex! : 0;
    if (!cel.indexes || cel.indexes.length !== pixelCount) return null;
    for (let index = 0; index < pixelCount; index += 1) {
      if (cel.indexes[index] !== transparentIndex) mask[index] = 255;
    }
  } else {
    for (let index = 0; index < pixelCount; index += 1) {
      if (cel.pixels[index * 4 + 3] > 0) mask[index] = 255;
    }
  }

  const local = selectionFromMask(0, 0, cel.width, cel.height, mask);
  if (!local) return null;
  return clippedSelection(
    cel.x + local.x,
    cel.y + local.y,
    local.width,
    local.height,
    canvasWidth,
    canvasHeight,
    local.mask,
  );
}

/**
 * Selects the current frame's opaque content for an editable image layer.
 * Selection is read-only, but refusing locked/reference/tilemap layers keeps
 * the result consistent with the transform/editability rules in the editor.
 */
export function layerOpaqueContentSelection(
  document: PixelDocument,
  layerId = document.activeLayerId,
  frameId = document.activeFrameId,
): Selection | null {
  const layer = getLayerByID(document, layerId);
  if (!layer || !isImageLayer(layer) || layer.role === "reference" || isLayerEffectivelyLocked(document, layer)) return null;
  const cel = getCel(document, layerId, frameId);
  if (!cel) return null;
  return opaqueContentSelection(cel, document.width, document.height, {
    indexed: document.colorMode === "indexed",
    transparentIndex: document.palette.transparentIndex,
  });
}

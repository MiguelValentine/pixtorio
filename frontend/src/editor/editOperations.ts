import {syncIndexedCel} from "./colorModes";
import {addLayer, ensureCel, getCel, type PixelDocument} from "./document";
import {clearSelection, copySelection, pasteClipboard, type PixelClipboard, type Selection} from "./selection";

type RGBA = readonly [number, number, number, number];

interface SelectionToLayerOptions {
  clearColor?: RGBA;
  cut: boolean;
  name: string;
}

interface PasteAsLayerOptions {
  name: string;
  reference?: boolean;
  x: number;
  y: number;
}

/** Copies or cuts the active Cel selection into a newly created image layer. */
export function selectionToNewLayer(
  document: PixelDocument,
  selection: Selection,
  options: SelectionToLayerOptions,
): string | null {
  const sourceLayerId = document.activeLayerId;
  const sourceFrameId = document.activeFrameId;
  const source = getCel(document, sourceLayerId, sourceFrameId);
  if (!source) return null;
  const clipboard = copySelection(source.pixels, source.width, selection);

  if (options.cut) {
    clearSelection(source.pixels, source.width, selection, options.clearColor);
    syncIndexedCel(document, source);
  }

  const layer = addLayer(document, options.name);
  const target = ensureCel(document, layer.id, sourceFrameId);
  if (!target) return null;
  pasteClipboard(target.pixels, target.width, target.height, clipboard, selection.x, selection.y);
  syncIndexedCel(document, target);
  return layer.id;
}

/** Pastes a pixel clipboard into a newly created standard or reference layer. */
export function pasteClipboardAsNewLayer(
  document: PixelDocument,
  clipboard: PixelClipboard,
  options: PasteAsLayerOptions,
): string | null {
  const layer = addLayer(document, options.name);
  if (options.reference) layer.role = "reference";
  const target = ensureCel(document, layer.id, document.activeFrameId);
  if (!target) return null;
  pasteClipboard(target.pixels, target.width, target.height, clipboard, options.x, options.y);
  syncIndexedCel(document, target);
  return layer.id;
}

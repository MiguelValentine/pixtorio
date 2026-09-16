import {isTilemapLayer, type PixelDocument} from "./document";
import {indexPixels, refreshIndexedDocument, refreshTilemapCaches, renderIndexedPixels} from "./colorModes";

/** Relocate the transparent slot without changing the artwork's appearance. */
export function relocateTransparentIndex(document: PixelDocument, index: number) {
  const previous = document.palette.transparentIndex;
  if (!Number.isInteger(index) || index < 0 || index >= document.palette.colors.length) throw new Error("Invalid transparent index");
  if (index === previous) return false;
  const colors = document.palette.colors;
  [colors[previous], colors[index]] = [colors[index], colors[previous]];
  document.palette.transparentIndex = index;
  if (document.colorMode === "indexed") {
    const visited = new Set<Uint8Array>();
    const remap = (indexes?: Uint8Array) => {
      if (!indexes || visited.has(indexes)) return;
      visited.add(indexes);
      for (let offset = 0; offset < indexes.length; offset++) {
        if (indexes[offset] === previous) indexes[offset] = index;
        else if (indexes[offset] === index) indexes[offset] = previous;
      }
    };
    for (const cel of Object.values(document.cels)) remap(cel.indexes);
    for (const tileset of document.tilesets) for (const tile of tileset.tiles) remap(tile.indexes);
    refreshIndexedDocument(document);
  }
  return true;
}

/** Replace the palette, remapping authoritative indexes from current RGBA caches. */
export function applyDocumentPalette(document: PixelDocument, palette: {name: string; colors: string[]; transparentIndex: number}) {
  if (palette.colors.length < 1 || palette.colors.length > 256 || !Number.isInteger(palette.transparentIndex) || palette.transparentIndex < 0 || palette.transparentIndex >= palette.colors.length || palette.colors.some((color) => !/^#[\da-f]{6}([\da-f]{2})?$/i.test(color))) throw new Error("Invalid palette");
  if (document.palette.name === palette.name && document.palette.transparentIndex === palette.transparentIndex && document.palette.colors.join() === palette.colors.join()) return false;
  document.palette = {...document.palette, name: palette.name, colors: [...palette.colors], transparentIndex: palette.transparentIndex};
  if (document.colorMode !== "indexed") return true;
  const convert = (pixels: Uint8ClampedArray) => {
    const indexes = indexPixels(pixels, palette.colors, palette.transparentIndex);
    renderIndexedPixels(indexes, pixels, palette.colors, palette.transparentIndex);
    return indexes;
  };
  for (const tileset of document.tilesets) for (const tile of tileset.tiles) tile.indexes = convert(tile.pixels);
  const links = new Map<string, {pixels: Uint8ClampedArray; indexes: Uint8Array}>();
  for (const cel of Object.values(document.cels)) {
    const layer = document.layers.find((candidate) => candidate.id === cel.layerId);
    if (layer && isTilemapLayer(layer)) continue;
    let linked = links.get(cel.linkId);
    if (!linked) {
      linked = {pixels: cel.pixels, indexes: convert(cel.pixels)};
      links.set(cel.linkId, linked);
    }
    cel.pixels = linked.pixels;
    cel.indexes = linked.indexes;
  }
  refreshTilemapCaches(document);
  return true;
}

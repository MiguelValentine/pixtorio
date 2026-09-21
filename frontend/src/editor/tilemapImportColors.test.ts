import {describe, expect, it} from "vitest";
import {createDocument, getActiveCel} from "./document";
import {decodeProject, encodeProject} from "./serialization";
import {createTileset} from "./tilemap";
import {normalizeImportedTilePixels} from "./tilemapImportColors";

const opaquePalette = {colors: ["#000000ff", "#ffffffff"], transparentIndex: 0};

describe("normalizeImportedTilePixels", () => {
  it("returns an independent RGBA copy and validates dimensions", () => {
    const pixels = new Uint8ClampedArray([1, 2, 3, 4]);
    const before = pixels.slice();
    const result = normalizeImportedTilePixels(pixels, 1, 1, "rgba", opaquePalette);

    expect(result.pixels).not.toBe(pixels);
    expect([...result.pixels]).toEqual([...before]);
    expect(result.indexes).toBeUndefined();
    expect([...pixels]).toEqual([...before]);
    expect(() => normalizeImportedTilePixels(pixels, 0, 1, "rgba", opaquePalette)).toThrow(/dimensions/);
    expect(() => normalizeImportedTilePixels(pixels, 2, 1, "rgba", opaquePalette)).toThrow(/pixel dimensions/);
  });

  it("constrains imported pixels to grayscale without mutating the source", () => {
    const pixels = new Uint8ClampedArray([
      255, 0, 0, 128,
      0, 255, 0, 0,
    ]);
    const result = normalizeImportedTilePixels(pixels, 2, 1, "grayscale", opaquePalette);

    expect([...result.pixels]).toEqual([
      76, 76, 76, 128,
      150, 150, 150, 0,
    ]);
    expect([...pixels]).toEqual([
      255, 0, 0, 128,
      0, 255, 0, 0,
    ]);
    expect(result.indexes).toBeUndefined();
  });

  it("indexes off-palette colors and renders a canonical cache with a non-zero transparent index", () => {
    const palette = {
      colors: ["#000000ff", "#ff000080", "#00ff0000"],
      transparentIndex: 2,
    };
    const pixels = new Uint8ClampedArray([
      240, 0, 0, 255,
      10, 20, 30, 0,
    ]);
    const before = pixels.slice();
    const result = normalizeImportedTilePixels(pixels, 2, 1, "indexed", palette);

    expect([...result.indexes!]).toEqual([1, 2]);
    expect([...result.pixels]).toEqual([
      255, 0, 0, 128,
      0, 255, 0, 0,
    ]);
    expect([...pixels]).toEqual([...before]);
  });

  it("rejects invalid indexed palette metadata", () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 255]);

    expect(() => normalizeImportedTilePixels(pixels, 1, 1, "indexed", {
      colors: ["#000000ff"],
      transparentIndex: 1,
    })).toThrow(/palette/);
    expect(() => normalizeImportedTilePixels(pixels, 1, 1, "indexed", {
      colors: ["not-a-color"],
      transparentIndex: 0,
    })).toThrow(/palette/);
  });

  it("produces strict-v5-safe tile and cel payloads", () => {
    const palette = {
      colors: ["#000000ff", "#ff000080", "#00ff0000"],
      transparentIndex: 2,
    };
    const normalized = normalizeImportedTilePixels(new Uint8ClampedArray([
      240, 0, 0, 255,
      10, 20, 30, 0,
    ]), 2, 1, "indexed", palette);
    const document = createDocument({
      name: "imported.pixio",
      width: 2,
      height: 1,
      colorMode: "indexed",
      palette: [...palette.colors],
    });
    document.palette.transparentIndex = palette.transparentIndex;
    const cel = getActiveCel(document);
    cel.pixels = normalized.pixels;
    cel.indexes = normalized.indexes;
    document.tilesets = [createTileset({
      id: "imported-tiles",
      name: "Imported Tiles",
      tileWidth: 2,
      tileHeight: 1,
      tiles: [{id: 1, pixels: normalized.pixels, indexes: normalized.indexes}],
    })];

    const decoded = decodeProject(encodeProject(document));
    const decodedCel = getActiveCel(decoded);
    expect([...decodedCel.pixels]).toEqual([...normalized.pixels]);
    expect([...decodedCel.indexes!]).toEqual([...normalized.indexes!]);
    expect([...decoded.tilesets[0].tiles[0].pixels]).toEqual([...normalized.pixels]);
    expect([...decoded.tilesets[0].tiles[0].indexes!]).toEqual([...normalized.indexes!]);
  });
});

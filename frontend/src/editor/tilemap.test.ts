import {describe, expect, it} from "vitest";
import {createDocument, getActiveCel} from "./document";
import {
  addTile,
  clearTileReferences,
  cleanupTileset,
  cleanupTilesetInPlace,
  convertImageCelToTilemap,
  convertImageLayerToTilemap,
  createTilemapData,
  createTileset,
  deleteTile,
  drawTilemapPixel,
  drawTilemapPixelInPlace,
  findTile,
  flipTilePixels,
  flipTileValue,
  getTileCell,
  renderTilemapCel,
  setTileCell,
  syncTileIndexes,
  syncTilePixels,
  tileReferenceCount,
  tileReferenceCountInTilemaps,
  validateTileset,
} from "./tilemap";
import {tileFlipDiagonal as documentTileFlipDiagonal, tileFlipX as documentTileFlipX, tileFlipY as documentTileFlipY} from "./document";

function tilePixels(...colors: Array<[number, number, number, number]>) {
  return new Uint8ClampedArray(colors.flat());
}

describe("tilemap core", () => {
  it("creates a validated tileset with implicit empty tile 0, deduplicates pixels, and clears deleted references", () => {
    const tileset = createTileset({id: "set", name: "Test", tileWidth: 2, tileHeight: 2});
    expect(validateTileset(tileset)).toBe(true);
    expect(findTile(tileset, 0)).toBeNull();

    const red = tilePixels(
      [255, 0, 0, 255], [255, 0, 0, 255],
      [255, 0, 0, 255], [255, 0, 0, 255],
    );
    const first = addTile(tileset, red);
    expect(first.created).toBe(true);
    expect(first.tile.id).toBe(1);
    const duplicate = addTile(first.tileset, red);
    expect(duplicate.created).toBe(false);
    expect(duplicate.tile.id).toBe(1);
    expect(duplicate.tileset.tiles).toHaveLength(1);

    const tilemap = createTilemapData(2, 1);
    tilemap.tiles.set([1 | documentTileFlipX, 1 | documentTileFlipY]);
    const cleared = deleteTile(duplicate.tileset, 1, tilemap);
    expect(cleared.deleted).toBe(true);
    expect(cleared.tileset.tiles).toHaveLength(0);
    expect([...cleared.tilemaps[0].tiles]).toEqual([0, 0]);
    expect([...clearTileReferences(tilemap, 1).tiles]).toEqual([0, 0]);
  });

  it("gets and updates cells without mutating the source and encodes independent flip flags", () => {
    const original = createTilemapData(2, 2);
    const updated = setTileCell(original, 1, 0, 3 | documentTileFlipX | documentTileFlipDiagonal);
    expect(getTileCell(original, 1, 0)).toBe(0);
    expect(getTileCell(updated, 1, 0)).toBe((3 | documentTileFlipX | documentTileFlipDiagonal) >>> 0);
    expect(flipTileValue(3, "x")).toBe((3 | documentTileFlipX) >>> 0);
    expect(flipTileValue(3 | documentTileFlipX, "x")).toBe(3);
    expect(flipTileValue(3, "y")).toBe((3 | documentTileFlipY) >>> 0);
    expect(flipTileValue(3, "diagonal")).toBe((3 | documentTileFlipDiagonal) >>> 0);
  });

  it("flips tile pixels on X, Y, and diagonal axes", () => {
    const tile = {
      id: 1,
      pixels: tilePixels(
        [1, 0, 0, 255], [2, 0, 0, 255],
        [3, 0, 0, 255], [4, 0, 0, 255],
      ),
    };
    expect([...flipTilePixels(tile, 2, 2, "x").pixels.filter((_value, index) => index % 4 === 0)]).toEqual([2, 1, 4, 3]);
    expect([...flipTilePixels(tile, 2, 2, "y").pixels.filter((_value, index) => index % 4 === 0)]).toEqual([3, 4, 1, 2]);
    expect([...flipTilePixels(tile, 2, 2, "diagonal").pixels.filter((_value, index) => index % 4 === 0)]).toEqual([1, 3, 2, 4]);
  });

  it("renders tilemap cells and refreshes indexed tile caches", () => {
    const indexedTile = {
      id: 1,
      pixels: new Uint8ClampedArray(16),
      indexes: new Uint8Array([1, 0, 0, 1]),
    };
    const fromIndexes = syncTilePixels(indexedTile, ["#00000000", "#ff0000ff"], 0);
    expect([...fromIndexes.pixels]).toEqual([
      255, 0, 0, 255, 0, 0, 0, 0,
      0, 0, 0, 0, 255, 0, 0, 255,
    ]);
    const backToIndexes = syncTileIndexes(fromIndexes, ["#00000000", "#ff0000ff"], 0);
    expect([...backToIndexes.indexes!]).toEqual([1, 0, 0, 1]);

    const tileset = createTileset({tileWidth: 2, tileHeight: 2, tiles: [fromIndexes]});
    const cel = {
      id: "cel",
      linkId: "link",
      opacity: 1,
      zIndex: 0,
      layerId: "layer",
      frameId: "frame",
      x: 0,
      y: 0,
      width: 4,
      height: 2,
      pixels: new Uint8ClampedArray(32),
      tilemap: {columns: 2, rows: 1, tiles: new Uint32Array([1, 1 | documentTileFlipX])},
    };
    expect([...renderTilemapCel(cel, tileset, {palette: ["#00000000", "#ff0000ff"]})]).toEqual([
      255, 0, 0, 255, 0, 0, 0, 0,
      0, 0, 0, 0, 255, 0, 0, 255,
      0, 0, 0, 0, 255, 0, 0, 255,
      255, 0, 0, 255, 0, 0, 0, 0,
    ]);
  });

  it("converts image pixels on the document grid and reuses identical tiles", () => {
    const document = createDocument({width: 4, height: 2});
    const source = getActiveCel(document);
    source.pixels.set(tilePixels(
      [255, 0, 0, 255], [0, 0, 0, 0], [255, 0, 0, 255], [0, 0, 0, 0],
      [0, 0, 0, 0], [255, 0, 0, 255], [255, 0, 0, 255], [255, 0, 0, 255],
    ));
    const converted = convertImageCelToTilemap(source, createTileset({tileWidth: 2, tileHeight: 2}), {
      tileWidth: 2,
      tileHeight: 2,
    });
    expect(converted.tilemap.columns).toBe(2);
    expect(converted.tilemap.rows).toBe(1);
    expect(converted.tileset.tiles).toHaveLength(2);
    expect([...converted.tilemap.tiles]).toEqual([1, 2]);
    expect([...converted.pixels]).toEqual([...source.pixels]);

    const documentResult = convertImageLayerToTilemap(document, document.activeLayerId, {
      tileWidth: 2,
      tileHeight: 2,
    });
    expect(documentResult.layer.kind).toBe("tilemap");
    expect(documentResult.layer.tilesetId).toBe(documentResult.tileset.id);
    expect(documentResult.cels[0].tilemap).toBeDefined();
  });

  it("keeps indexed conversion caches in raster row order", () => {
    const document = createDocument({width: 4, height: 2, colorMode: "indexed", palette: ["#00000000", "#ff0000ff", "#00ff00ff"]});
    const source = getActiveCel(document);
    source.indexes = new Uint8Array([1, 2, 2, 1, 2, 1, 1, 2]);
    source.pixels.set([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 255, 0, 0, 255,
      0, 255, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255,
    ]);
    const converted = convertImageCelToTilemap(source, createTileset({tileWidth: 2, tileHeight: 2}), {
      tileWidth: 2,
      tileHeight: 2,
      palette: document.palette.colors,
      transparentIndex: 0,
    });
    expect([...converted.indexes!]).toEqual([...source.indexes]);
  });

  it("implements Manual, Auto, and Stack pixel synchronization semantics", () => {
    const pixels = tilePixels(
      [10, 20, 30, 255], [10, 20, 30, 255],
      [10, 20, 30, 255], [10, 20, 30, 255],
    );
    const baseTileset = createTileset({tileWidth: 2, tileHeight: 2});
    const added = addTile(baseTileset, pixels);
    const makeCel = () => ({
      id: "cel",
      linkId: "link",
      opacity: 1,
      zIndex: 0,
      layerId: "layer",
      frameId: "frame",
      x: 0,
      y: 0,
      width: 4,
      height: 2,
      pixels: new Uint8ClampedArray(32),
      tilemap: {columns: 2, rows: 1, tiles: new Uint32Array([1, 1])},
    });

    const manual = drawTilemapPixel(makeCel(), added.tileset, 0, 0, [200, 0, 0, 255], {mode: "manual"});
    expect(manual.created).toBe(false);
    expect(manual.tileset.tiles).toHaveLength(1);
    expect(findTile(manual.tileset, 1)?.pixels[0]).toBe(200);
    expect([...manual.cel.tilemap!.tiles]).toEqual([1, 1]);

    const auto = drawTilemapPixel(makeCel(), added.tileset, 0, 0, [0, 200, 0, 255], {mode: "auto"});
    expect(auto.created).toBe(true);
    expect(auto.tileset.tiles).toHaveLength(2);
    expect([...auto.cel.tilemap!.tiles]).toEqual([2, 1]);
    expect(findTile(auto.tileset, 1)?.pixels[0]).toBe(10);
    expect(findTile(auto.tileset, 2)?.pixels[1]).toBe(200);

    const stack = drawTilemapPixel(makeCel(), added.tileset, 0, 0, [0, 0, 200, 255], {mode: "stack"});
    expect(stack.created).toBe(true);
    expect(stack.tileset.tiles).toHaveLength(2);
    expect([...stack.cel.tilemap!.tiles]).toEqual([2, 1]);
    expect(tileReferenceCount(stack.cel.tilemap!, 1)).toBe(1);
  });

  it("compacts auto-edited tiles across all tilemap buffers while preserving flags and indexed authority", () => {
    const red = tilePixels(
      [255, 0, 0, 255], [255, 0, 0, 255],
      [255, 0, 0, 255], [255, 0, 0, 255],
    );
    const green = tilePixels(
      [0, 255, 0, 255], [0, 255, 0, 255],
      [0, 255, 0, 255], [0, 255, 0, 255],
    );
    const indexedRed = new Uint8Array([1, 1, 1, 1]);
    const tileset = createTileset({
      tileWidth: 2,
      tileHeight: 2,
      tiles: [
        {id: 1, pixels: red, indexes: indexedRed},
        {id: 2, pixels: red.slice(), indexes: indexedRed.slice()},
        {id: 3, pixels: green, indexes: new Uint8Array([2, 2, 2, 2])},
      ],
    });
    const first = createTilemapData(2, 1);
    first.tiles.set([2 | documentTileFlipX, 1]);
    const second = createTilemapData(1, 1);
    second.tiles[0] = 3;
    const result = cleanupTileset(tileset, [first, second]);

    expect(result.changed).toBe(true);
    expect(result.deduplicatedTileIDs).toEqual([2]);
    expect(result.removedTileIDs).toEqual([]);
    expect(result.tileIDMap.get(2)).toBe(1);
    expect(result.tileset.tiles.map((tile) => tile.id)).toEqual([1, 3]);
    expect([...result.tilemaps[0].tiles]).toEqual([(1 | documentTileFlipX) >>> 0, 1]);
    expect([...result.tilemaps[1].tiles]).toEqual([3]);
    expect(result.tileset.tiles[0].indexes).toEqual(indexedRed);
    expect(tileReferenceCountInTilemaps([first, second], 1)).toBe(1);
  });

  it("removes unreferenced auto-created tiles and keeps linked tilemap buffers in place", () => {
    const base = tilePixels(
      [10, 20, 30, 255], [10, 20, 30, 255],
      [10, 20, 30, 255], [10, 20, 30, 255],
    );
    const tileset = createTileset({tileWidth: 2, tileHeight: 2, tiles: [{id: 1, pixels: base}]});
    const linked = createTilemapData(2, 1);
    linked.tiles.set([1, 1]);
    const cel = {
      id: "cel",
      linkId: "link",
      opacity: 1,
      zIndex: 0,
      layerId: "layer",
      frameId: "frame",
      x: 0,
      y: 0,
      width: 4,
      height: 2,
      pixels: new Uint8ClampedArray(32),
      tilemap: linked,
    };
    const other = createTilemapData(1, 1);
    other.tiles[0] = 1;
    const edited = drawTilemapPixelInPlace(cel, tileset, 0, 0, [0, 200, 0, 255], {
      mode: "auto",
      referenceTilemaps: [linked, other],
    });
    expect(edited.created).toBe(true);
    expect(tileReferenceCountInTilemaps([linked], edited.tileId)).toBe(1);
    const tilemapIdentity = linked;
    const compacted = cleanupTilesetInPlace(tileset, [linked, other]);

    expect(compacted.removedTileIDs).toEqual([]);
    expect(tileset.tiles.map((tile) => tile.id)).toEqual([1, 2]);
    expect(linked).toBe(tilemapIdentity);
    expect([...linked.tiles]).toEqual([2, 1]);
    expect([...other.tiles]).toEqual([1]);

    linked.tiles[0] = 0;
    const removed = cleanupTilesetInPlace(tileset, [linked, other]);
    expect(removed.removedTileIDs).toEqual([2]);
    expect(tileset.tiles.map((tile) => tile.id)).toEqual([1]);
    expect([...linked.tiles]).toEqual([0, 1]);
  });

  it("writes transparent tile pixels to the configured indexed transparent slot", () => {
    const transparent = "#ff00ffff";
    const opaque = "#0000ffff";
    const tileset = createTileset({
      tileWidth: 1,
      tileHeight: 1,
      tiles: [{id: 1, pixels: tilePixels([255, 0, 0, 255]), indexes: new Uint8Array([1])}],
    });
    const cel = {
      id: "cel",
      linkId: "link",
      opacity: 1,
      zIndex: 0,
      layerId: "layer",
      frameId: "frame",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      pixels: new Uint8ClampedArray([255, 0, 0, 255]),
      indexes: new Uint8Array([1]),
      tilemap: {columns: 1, rows: 1, tiles: new Uint32Array([1])},
    };

    drawTilemapPixelInPlace(cel, tileset, 0, 0, [0, 0, 0, 0], {
      mode: "manual",
      palette: [opaque, transparent],
      transparentIndex: 1,
    });

    expect(tileset.tiles[0].indexes).toEqual(new Uint8Array([1]));
    expect(tileset.tiles[0].pixels).toEqual(new Uint8ClampedArray([255, 0, 255, 0]));
    expect(cel.indexes).toEqual(new Uint8Array([1]));
    expect(cel.pixels).toEqual(new Uint8ClampedArray([255, 0, 255, 0]));
  });
});

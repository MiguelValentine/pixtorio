import {describe, expect, it} from "vitest";
import {createDocument, getActiveCel, type TilesetGrid} from "./document";
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
  tileCellImageOrigin,
  tileCellsPixelBounds,
  tilemapCellAtPixel,
  tilemapPixelSize,
  validateTileset,
} from "./tilemap";
import {tileFlipDiagonal as documentTileFlipDiagonal, tileFlipX as documentTileFlipX, tileFlipY as documentTileFlipY} from "./document";

function tilePixels(...colors: Array<[number, number, number, number]>) {
  return new Uint8ClampedArray(colors.flat());
}

describe("tilemap core", () => {
  it("rejects an isometric grid gap before allocating or modifying a tile", () => {
    const tileset = createTileset({
      tileWidth: 2, tileHeight: 2,
      grid: {kind: "isometric", cellWidth: 8, cellHeight: 4, anchorX: 1, anchorY: 2},
    });
    const size = tilemapPixelSize(tileset, 2, 2);
    const document = createDocument(size);
    const cel = getActiveCel(document);
    cel.tilemap = createTilemapData(2, 2);
    const original = cel.tilemap.tiles.slice();
    expect(() => drawTilemapPixelInPlace(cel, tileset, 2, 1, [255, 0, 0, 255])).toThrow(/outside the tile image/);
    expect(tileset.tiles).toEqual([]);
    expect(cel.tilemap.tiles).toEqual(original);
    expect(cel.pixels.every((value) => value === 0)).toBe(true);
  });

  it("counts Terrain candidates as references and remaps them when deduplicating", () => {
    const tileset = createTileset({
      tileWidth: 1, tileHeight: 1,
      tiles: [
        {id: 1, pixels: tilePixels([255, 0, 0, 255])},
        {id: 2, pixels: tilePixels([255, 0, 0, 255])},
        {id: 3, pixels: tilePixels([0, 255, 0, 255])},
        {id: 4, pixels: tilePixels([0, 0, 255, 255])},
      ],
      terrains: [{
        id: 1, name: "Grass", color: "#00ff00ff", neighborMode: "edge4", boundary: "empty",
        rules: [{mask: 0, candidates: [
          {tileId: 2, flags: documentTileFlipX, weight: 3},
          {tileId: 3, flags: 0, weight: 1},
        ]}],
      }],
    });
    const map = createTilemapData(2, 1);
    map.tiles.set([1, 2]);
    const result = cleanupTileset(tileset, [map]);
    expect(result.tileset.tiles.map((tile) => tile.id)).toEqual([1, 3]);
    expect(result.removedTileIDs).toEqual([4]);
    expect(result.tileset.terrains[0].rules[0].candidates).toEqual([
      {tileId: 1, flags: documentTileFlipX, weight: 3}, {tileId: 3, flags: 0, weight: 1},
    ]);
    expect(tileset.terrains[0].rules[0].candidates[0].tileId).toBe(2);
    cleanupTilesetInPlace(tileset, [map]);
    expect(tileset.terrains).toEqual(result.tileset.terrains);
    expect([...map.tiles]).toEqual([1, 1]);
  });

  const overlapLayouts: TilesetGrid[] = [
    {kind: "isometric", cellWidth: 4, cellHeight: 2, anchorX: 2, anchorY: 4},
    {kind: "hexagonal", orientation: "pointy", offset: "odd-r"},
    {kind: "hexagonal", orientation: "flat", offset: "even-q"},
  ];

  it.each(overlapLayouts)("composites transparent and translucent overlap for $kind", (grid) => {
    const tileset = createTileset({tileWidth: 4, tileHeight: 4, grid});
    const tilemap = createTilemapData(2, 2);
    const back = new Uint8ClampedArray(64);
    const front = new Uint8ClampedArray(64);
    for (let offset = 0; offset < 64; offset += 4) back.set([255, 0, 0, 128], offset);
    tileset.tiles = [{id: 1, pixels: back}, {id: 2, pixels: front}];
    tilemap.tiles.fill(1);
    tilemap.tiles[3] = 2;
    const size = tilemapPixelSize(tileset, 2, 2);
    const emptyFront = renderTilemapCel({...size, tilemap}, tileset);
    tilemap.tiles[3] = 0;
    expect(emptyFront).toEqual(renderTilemapCel({...size, tilemap}, tileset));

    const origin = tileCellImageOrigin(tileset, tilemap, {column: 1, row: 1});
    const x = Math.round(origin.x), y = Math.round(origin.y);
    const index = (y * size.width + x) * 4;
    expect(emptyFront[index + 3]).toBeGreaterThan(0);
    front.set([0, 0, 255, 128], 0);
    tilemap.tiles[3] = 2;
    const blended = renderTilemapCel({...size, tilemap}, tileset);
    const alpha = 128 * 255 + emptyFront[index + 3] * 127;
    expect([...blended.slice(index, index + 4)]).toEqual([
      Math.round(255 * emptyFront[index + 3] * 127 / alpha),
      0,
      Math.round(255 * 128 * 255 / alpha),
      Math.round(alpha / 255),
    ]);
  });

  it.each(overlapLayouts)("keeps discrete indexed colors and transparent holes for $kind", (grid) => {
    const palette = ["#00000000", "#ff000080", "#0000ff80"];
    const tileset = createTileset({
      tileWidth: 4, tileHeight: 4, grid,
      tiles: [
        syncTilePixels({id: 1, pixels: new Uint8ClampedArray(64), indexes: new Uint8Array(16).fill(1)}, palette),
        syncTilePixels({id: 2, pixels: new Uint8ClampedArray(64), indexes: new Uint8Array(16)}, palette),
      ],
    });
    const tilemap = createTilemapData(2, 2);
    tilemap.tiles.fill(1);
    tilemap.tiles[3] = 2;
    const size = tilemapPixelSize(tileset, 2, 2);
    const before = renderTilemapCel({...size, tilemap}, tileset, {palette});
    const origin = tileCellImageOrigin(tileset, tilemap, {column: 1, row: 1});
    const index = (Math.round(origin.y) * size.width + Math.round(origin.x)) * 4;
    expect([...before.slice(index, index + 4)]).toEqual([255, 0, 0, 128]);
    tileset.tiles[1].indexes![0] = 2;
    tileset.tiles[1] = syncTilePixels(tileset.tiles[1], palette);
    const result = renderTilemapCel({...size, tilemap}, tileset, {palette});
    expect([...result.slice(index, index + 4)]).toEqual([0, 0, 255, 128]);
    expect(result).toEqual(renderTilemapCel({...size, tilemap}, tileset));
  });

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

  it("lays out isometric and hexagonal tilemaps with normalized pixel bounds", () => {
    const layouts = [
      createTileset({
        tileWidth: 4,
        tileHeight: 4,
        grid: {kind: "isometric", cellWidth: 4, cellHeight: 4, anchorX: 2, anchorY: 4},
      }),
      createTileset({
        tileWidth: 4,
        tileHeight: 4,
        grid: {kind: "hexagonal", orientation: "pointy", offset: "odd-r"},
      }),
      createTileset({
        tileWidth: 4,
        tileHeight: 4,
        grid: {kind: "hexagonal", orientation: "flat", offset: "odd-q"},
      }),
    ];
    const tilemap = createTilemapData(2, 2);
    for (const tileset of layouts) {
      const size = tilemapPixelSize(tileset, tilemap.columns, tilemap.rows);
      const origin = tileCellImageOrigin(tileset, tilemap, {column: 0, row: 0});
      const target = {column: 1, row: 1};
      const targetOrigin = tileCellImageOrigin(tileset, tilemap, target);
      const center = {
        x: targetOrigin.x + tileset.tileWidth / 2,
        y: targetOrigin.y + tileset.tileHeight / 2,
      };

      expect(size.width).toBeGreaterThanOrEqual(tileset.tileWidth);
      expect(size.height).toBeGreaterThanOrEqual(tileset.tileHeight);
      expect(origin.x).toBeGreaterThanOrEqual(0);
      expect(origin.y).toBeGreaterThanOrEqual(0);
      expect(tilemapCellAtPixel(tileset, tilemap, center.x, center.y)).toEqual(target);
    }
    expect(tilemapPixelSize(layouts[0], 2, 2)).toEqual({width: 8, height: 8});
    expect(tilemapPixelSize(layouts[1], 2, 2)).toEqual({width: 10, height: 7});
    expect(tilemapPixelSize(layouts[2], 2, 2)).toEqual({width: 7, height: 10});
  });

  it("renders high isometric tiles from their base anchor in stable depth order", () => {
    const red = new Uint8ClampedArray(2 * 4 * 4);
    const blue = new Uint8ClampedArray(2 * 4 * 4);
    for (let offset = 0; offset < red.length; offset += 4) {
      red.set([255, 0, 0, 255], offset);
      blue.set([0, 0, 255, 255], offset);
    }
    const tileset = createTileset({
      tileWidth: 2,
      tileHeight: 4,
      grid: {kind: "isometric", cellWidth: 2, cellHeight: 2, anchorX: 1, anchorY: 3},
      tiles: [{id: 1, pixels: red}, {id: 2, pixels: blue}],
    });
    const tilemap = createTilemapData(2, 1);
    tilemap.tiles.set([1, 2]);
    const size = tilemapPixelSize(tileset, tilemap.columns, tilemap.rows);
    const pixels = renderTilemapCel({width: size.width, height: size.height, tilemap}, tileset);

    expect(size).toEqual({width: 3, height: 5});
    expect([...pixels.slice((1 * size.width + 1) * 4, (1 * size.width + 1) * 4 + 4)]).toEqual([0, 0, 255, 255]);
    expect([...pixels.slice((4 * size.width + 2) * 4, (4 * size.width + 2) * 4 + 4)]).toEqual([0, 0, 255, 255]);
    expect(tileCellsPixelBounds(tileset, tilemap, [{column: 1, row: 0}])).toEqual({x: 1, y: 1, width: 2, height: 4});
  });

  it("uses actual hex tile image bounds and ignores duplicate or outside dirty cells", () => {
    const tileset = createTileset({
      tileWidth: 8, tileHeight: 6,
      grid: {kind: "hexagonal", orientation: "pointy", offset: "odd-r"},
    });
    const tilemap = createTilemapData(3, 3);
    const origin = tileCellImageOrigin(tileset, tilemap, {column: 1, row: 1});
    expect(tileCellsPixelBounds(tileset, tilemap, [
      {column: 1, row: 1},
      {column: 1, row: 1},
      {column: -1, row: 0},
    ])).toEqual({
      x: Math.floor(origin.x),
      y: Math.floor(origin.y),
      width: 8,
      height: Math.ceil(origin.y + 6) - Math.floor(origin.y),
    });
    expect(tileCellsPixelBounds(tileset, tilemap, [{column: 8, row: 8}])).toBeNull();
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

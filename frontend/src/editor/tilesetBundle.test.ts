import {describe, expect, it} from "vitest";

import {
  celKey,
  cloneDocument,
  createCel,
  createDocument,
  getActiveCel,
  type ColorMode,
  type PixelDocument,
  type TilesetGrid,
} from "./document";
import {CommandHistory, DocumentStateCommand} from "./history";
import {decodeProject, encodeProject} from "./serialization";
import {createTerrainMapData, terrainEmpty, type TerrainDefinition} from "./terrain";
import {createTileset} from "./tilemap";
import {exportTilemapJson, importTilemapJson, type TilemapInterchangeData} from "./tilemapInterchange";
import {tilemapPixelSize} from "./tilemapGeometry";
import {importTilesetBundleIntoDocument} from "./tilesetBundle";

const grids: TilesetGrid[] = [
  {kind: "orthogonal"},
  {kind: "isometric", cellWidth: 3, cellHeight: 2, anchorX: 1, anchorY: 2},
  {kind: "hexagonal", orientation: "pointy", offset: "odd-r"},
  {kind: "hexagonal", orientation: "flat", offset: "even-q"},
];

function terrain(grid: TilesetGrid): TerrainDefinition {
  return {
    id: 7,
    name: "Ground",
    color: "#44aa66",
    neighborMode: grid.kind === "hexagonal" ? "edge6" : "edge4",
    boundary: "empty",
    rules: [{mask: 0, candidates: [{tileId: 9, flags: 0, weight: 1}]}],
  };
}

function makeDocument(mode: ColorMode = "rgba") {
  const document = createDocument({width: 16, height: 16, colorMode: mode});
  const layer = document.layers[0];
  const cel = getActiveCel(document);
  const tileset = createTileset({
    id: "shared",
    name: "Old",
    tileWidth: 2,
    tileHeight: 2,
    tiles: [{id: 1, pixels: new Uint8ClampedArray(16)}],
  });
  Object.assign(layer, {kind: "tilemap", tilesetId: tileset.id});
  document.tilesets = [tileset];
  cel.tilemap = {columns: 2, rows: 1, tiles: new Uint32Array([1, 0])};
  Object.assign(cel, tilemapPixelSize(tileset, cel.tilemap));
  cel.pixels = new Uint8ClampedArray(cel.width * cel.height * 4);
  if (mode === "indexed") cel.indexes = new Uint8Array(cel.width * cel.height);
  return {document, cel, tileset};
}

function makeBundle(grid: TilesetGrid, options: {columns?: number; rows?: number; gridOffset?: "odd-r" | "even-r" | "odd-q" | "even-q"} = {}) {
  const columns = options.columns ?? 2;
  const rows = options.rows ?? 1;
  const metadataTileset = createTileset({
    id: "portable-id",
    name: "Imported",
    tileWidth: 2,
    tileHeight: 2,
    grid,
    terrains: [terrain(grid)],
    tiles: [
      {id: 9, pixels: new Uint8ClampedArray(16)},
      {id: 3, pixels: new Uint8ClampedArray(16)},
    ],
  });
  const tilemap = {
    columns,
    rows,
    ...(options.gridOffset ? {gridOffset: options.gridOffset} : {}),
    tiles: new Uint32Array(columns * rows).fill(9),
  };
  const size = tilemapPixelSize(metadataTileset, tilemap);
  const terrainmap = createTerrainMapData(columns, rows, 41);
  terrainmap.terrains.fill(7);
  if (terrainmap.terrains.length > 1) terrainmap.terrains[1] = terrainEmpty;
  const imported = importTilemapJson(exportTilemapJson({
    tileset: metadataTileset,
    tilemap,
    terrainmap,
    cel: {x: -4, y: 6, ...size},
    tilesetImage: {
      file: "imported.png",
      width: 4,
      height: 2,
      tiles: [
        {tileId: 9, x: 2, y: 0, width: 2, height: 2},
        {tileId: 3, x: 0, y: 0, width: 2, height: 2},
      ],
    },
  }));
  const pixels = new Uint8ClampedArray(4 * 2 * 4);
  fillRectangle(pixels, 4, 0, 0, 2, 2, [10, 20, 30, 255]);
  fillRectangle(pixels, 4, 2, 0, 2, 2, [200, 100, 50, 255]);
  return {imported, image: {name: "imported.png", width: 4, height: 2, pixels}};
}

describe("tileset bundle import", () => {
  it("round-trips exact PNG rectangles, Terrain, geometry, and strict v5 for every grid and color mode", () => {
    for (const mode of ["rgba", "grayscale", "indexed"] as const) {
      for (const grid of grids) {
        const {document, cel} = makeDocument(mode);
        const offset = grid.kind === "hexagonal"
          ? grid.orientation === "pointy" ? "even-r" : "odd-q"
          : undefined;
        const {imported, image} = makeBundle(grid, {gridOffset: offset});
        const result = importTilesetBundleIntoDocument(document, "shared", cel.id, imported, image);
        const currentCel = Object.values(document.cels).find((candidate) => candidate.id === cel.id)!;
        const currentTileset = document.tilesets[0];

        expect(result).toEqual({selectedTileId: 9, selectedTerrainId: 7});
        expect(currentTileset.id).toBe("shared");
        expect(currentTileset.tiles.map((tile) => tile.id)).toEqual([9, 3]);
        const firstPixel = [...currentTileset.tiles[0].pixels.slice(0, 4)];
        if (mode === "rgba") expect(firstPixel).toEqual([200, 100, 50, 255]);
        if (mode === "grayscale") {
          expect(firstPixel[0]).toBe(firstPixel[1]);
          expect(firstPixel[1]).toBe(firstPixel[2]);
          expect(firstPixel[3]).toBe(255);
        }
        if (mode === "indexed") {
          expect(firstPixel).toEqual([239, 71, 111, 255]);
          expect(currentTileset.tiles[0].indexes?.[0]).toBe(2);
        }
        expect(currentTileset.tiles[1].pixels.slice(0, 4)).not.toEqual(currentTileset.tiles[0].pixels.slice(0, 4));
        expect(currentCel.tilemap?.gridOffset).toBe(offset);
        expect(currentCel.terrainmap?.seed).toBe(41);
        expect([currentCel.x, currentCel.y]).toEqual([-4, 6]);
        expect(currentCel.pixels.length).toBe(currentCel.width * currentCel.height * 4);
        if (mode === "indexed") {
          expect(currentTileset.tiles.every((tile) => tile.indexes?.length === 4)).toBe(true);
          expect(currentCel.indexes?.length).toBe(currentCel.width * currentCel.height);
        }
        expect(decodeProject(encodeProject(document))).toEqual(document);
      }
    }
  });

  it("rebuilds shared non-target Cels, preserves placement/properties, and clears incompatible local hex offsets", () => {
    const {document, cel} = makeDocument();
    const layer = document.layers[0];
    const otherFrame = {id: "frame-other", durationMs: 80};
    document.frames.push(otherFrame);
    const other = createCel(layer.id, otherFrame.id, 4, 2);
    Object.assign(other, {x: 5, y: -2, opacity: 0.4, zIndex: 3});
    other.tilemap = {columns: 2, rows: 1, gridOffset: "odd-r", tiles: new Uint32Array([1, 0])};
    other.terrainmap = createTerrainMapData(2, 1, 12);
    other.terrainmap.terrains[0] = terrainEmpty;
    document.cels[celKey(layer.id, otherFrame.id)] = other;
    const linkedFrame = {id: "frame-linked", durationMs: 90};
    document.frames.push(linkedFrame);
    const linked = {...cel, id: "cel-linked", frameId: linkedFrame.id, x: 8, y: 9, opacity: 0.25, zIndex: -2};
    document.cels[celKey(layer.id, linkedFrame.id)] = linked;
    const {imported, image} = makeBundle({kind: "hexagonal", orientation: "flat", offset: "even-q"});

    importTilesetBundleIntoDocument(document, "shared", cel.id, imported, image);

    const updated = Object.values(document.cels);
    const target = updated.find((candidate) => candidate.id === cel.id)!;
    const updatedLinked = updated.find((candidate) => candidate.id === linked.id)!;
    const updatedOther = updated.find((candidate) => candidate.id === other.id)!;
    expect(updatedLinked.tilemap).toBe(target.tilemap);
    expect(updatedLinked.terrainmap).toBe(target.terrainmap);
    expect([updatedLinked.x, updatedLinked.y, updatedLinked.opacity, updatedLinked.zIndex]).toEqual([8, 9, 0.25, -2]);
    expect([updatedOther.x, updatedOther.y, updatedOther.opacity, updatedOther.zIndex]).toEqual([5, -2, 0.4, 3]);
    expect(updatedOther.tilemap?.gridOffset).toBeUndefined();
    expect(updatedOther.width).toBe(tilemapPixelSize(document.tilesets[0], updatedOther.tilemap!).width);
  });

  it("is reversible through DocumentStateCommand", () => {
    const {document, cel} = makeDocument();
    const before = cloneDocument(document);
    const {imported, image} = makeBundle(grids[1]);
    importTilesetBundleIntoDocument(document, "shared", cel.id, imported, image);
    const after = cloneDocument(document);
    const history = new CommandHistory<PixelDocument>();
    history.commit(new DocumentStateCommand(before, after, "Import Tileset Bundle"));

    history.undo(document);
    expect(document).toEqual(before);
    history.redo(document);
    expect(document).toEqual(after);
  });

  it("leaves the document byte-for-byte unchanged for every late validation failure", () => {
    const failures: Array<(document: PixelDocument, imported: TilemapInterchangeData, image: ReturnType<typeof makeBundle>["image"]) => void> = [
      (_document, _imported, image) => { image.name = "wrong.png"; },
      (_document, _imported, image) => { image.width = 3; },
      (_document, _imported, image) => { image.pixels = new Uint8ClampedArray(1); },
      (_document, imported) => { imported.tileset.tileIds[0] = 999; },
      (_document, imported) => { imported.tileset.grid = {kind: "orthogonal"}; imported.tileset.tileWidth = 2048; },
    ];
    for (const corrupt of failures) {
      const {document, cel} = makeDocument();
      const {imported, image} = makeBundle(grids[0], {columns: 2, rows: 2});
      corrupt(document, imported, image);
      const before = cloneDocument(document);
      expect(() => importTilesetBundleIntoDocument(document, "shared", cel.id, imported, image)).toThrow();
      expect(document).toEqual(before);
    }
  });

  it("rejects removals used by another Cel and non-square diagonal references atomically", () => {
    const {document, cel} = makeDocument();
    const layer = document.layers[0];
    const frame = {id: "independent", durationMs: 100};
    document.frames.push(frame);
    const other = createCel(layer.id, frame.id, 4, 2);
    other.tilemap = {columns: 1, rows: 1, tiles: new Uint32Array([1])};
    document.cels[celKey(layer.id, frame.id)] = other;
    const {imported, image} = makeBundle(grids[0]);
    const before = cloneDocument(document);

    expect(() => importTilesetBundleIntoDocument(document, "shared", cel.id, imported, image)).toThrow(/Tile ID/);
    expect(document).toEqual(before);
  });
});

function fillRectangle(
  pixels: Uint8ClampedArray,
  imageWidth: number,
  x: number,
  y: number,
  width: number,
  height: number,
  color: readonly number[],
) {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      pixels.set(color, (row * imageWidth + column) * 4);
    }
  }
}

import {describe, expect, it} from "vitest";

import {
  tileFlipDiagonal,
  tileFlipX,
  tileFlipY,
  type TilemapData,
  type TilesetGrid,
} from "./document";
import {createTerrainMapData, resolveTerrainTile} from "./terrain";
import {tilesetGridLayout} from "./tilemapGeometry";
import {cellToDocument} from "./tileGrid";
import {createTileset, createTilemapData, sourcePixelForTileValue} from "./tilemap";
import {transformTilemapGrid, type TilemapTransformOperation} from "./tilemapTransforms";

function mapOf(columns: number, rows: number, values: readonly number[]): TilemapData {
  const tilemap = createTilemapData(columns, rows);
  tilemap.tiles.set(values);
  return tilemap;
}

function mapValues(tilemap: TilemapData) {
  return [...tilemap.tiles];
}

function tileIds(tilemap: TilemapData) {
  return mapValues(tilemap).map((value) => value & 0x1fffffff);
}

function sourceCellForOperation(
  operation: TilemapTransformOperation,
  column: number,
  row: number,
  columns: number,
  rows: number,
) {
  switch (operation) {
    case "horizontal": return {column: columns - 1 - column, row};
    case "vertical": return {column, row: rows - 1 - row};
    case "cw": return {column: row, row: columns - 1 - column};
    case "ccw": return {column: rows - 1 - row, row: column};
    case "180": return {column: columns - 1 - column, row: rows - 1 - row};
  }
}

function expectTileImageTransform(value: number, result: number, operation: TilemapTransformOperation) {
  const operations = {
    horizontal: (x: number, y: number) => ({x: 1 - x, y}),
    vertical: (x: number, y: number) => ({x, y: 1 - y}),
    cw: (x: number, y: number) => ({x: y, y: 1 - x}),
    ccw: (x: number, y: number) => ({x: 1 - y, y: x}),
    "180": (x: number, y: number) => ({x: 1 - x, y: 1 - y}),
  };
  for (let y = 0; y < 2; y += 1) {
    for (let x = 0; x < 2; x += 1) {
      const source = operations[operation](x, y);
      expect(sourcePixelForTileValue(result, x, y, 2, 2)).toEqual(
        sourcePixelForTileValue(value, source.x, source.y, 2, 2),
      );
    }
  }
}

function inverse(operation: TilemapTransformOperation): TilemapTransformOperation {
  if (operation === "cw") return "ccw";
  if (operation === "ccw") return "cw";
  return operation;
}

describe("tilemap grid transforms", () => {
  it("rotates rectangular tile pixels and indexes while preserving every legal flip combination", () => {
    for (const grid of [
      {kind: "orthogonal"},
      {kind: "isometric", cellWidth: 6, cellHeight: 4, anchorX: 2, anchorY: 1},
      {kind: "hexagonal", orientation: "pointy", offset: "even-r"},
      {kind: "hexagonal", orientation: "flat", offset: "odd-q"},
    ] as const) {
      const pixels = new Uint8ClampedArray(Array.from({length: 6}, (_, i) => [i + 1, 0, 0, 255]).flat());
      const tileset = createTileset({tileWidth: 3, tileHeight: 2, grid, tiles: [{
        id: 1, pixels, indexes: Uint8Array.from([1, 2, 3, 4, 5, 6]),
      }]});
      tileset.terrains = [{
        id: 1, name: "Rectangular", color: "#ffffffff",
        neighborMode: grid.kind === "hexagonal" ? "edge6" : "edge4", boundary: "empty",
        rules: [{mask: 0, candidates: [{tileId: 1, flags: tileFlipX, weight: 1}]}],
      }];
      for (const operation of ["cw", "ccw"] as const) {
        for (const flags of [0, tileFlipX, tileFlipY, tileFlipX | tileFlipY]) {
          const map = mapOf(1, 1, [(1 | flags) >>> 0]);
          const result = transformTilemapGrid(map, tileset, operation);
          const rotated = result.tileset!;
          expect(rotated).toMatchObject({tileWidth: 2, tileHeight: 3});
          expect(rotated.terrains[0].rules[0].candidates[0].flags).toBe(tileFlipY);
          const value = result.tilemap.tiles[0];
          expect(value & tileFlipDiagonal).toBe(0);
          for (let y = 0; y < 3; y += 1) {
            for (let x = 0; x < 2; x += 1) {
              const point = operation === "cw" ? {x: y, y: 1 - x} : {x: 2 - y, y: x};
              const source = sourcePixelForTileValue(map.tiles[0], point.x, point.y, 3, 2);
              const target = sourcePixelForTileValue(value, x, y, 2, 3);
              const sourceIndex = source.y * 3 + source.x;
              const targetIndex = target.y * 2 + target.x;
              expect(rotated.tiles[0].pixels.slice(targetIndex * 4, targetIndex * 4 + 4))
                .toEqual(pixels.slice(sourceIndex * 4, sourceIndex * 4 + 4));
              expect(rotated.tiles[0].indexes![targetIndex]).toBe(sourceIndex + 1);
            }
          }
          const restored = transformTilemapGrid(result.tilemap, rotated, inverse(operation));
          expect(restored.tilemap).toEqual(map);
          expect(restored.tileset).toEqual(tileset);
        }
      }
    }
  });

  it("rotates hexagonal cell centers by a physical quarter-turn for every offset and map parity", () => {
    for (const grid of [
      {kind: "hexagonal", orientation: "pointy", offset: "odd-r"},
      {kind: "hexagonal", orientation: "pointy", offset: "even-r"},
      {kind: "hexagonal", orientation: "flat", offset: "odd-q"},
      {kind: "hexagonal", orientation: "flat", offset: "even-q"},
    ] as const) {
      for (const columns of [1, 2, 3, 4]) {
        for (const rows of [1, 2, 3, 4]) {
          const tileset = createTileset({tileWidth: 8, tileHeight: 8, grid});
          const source = mapOf(columns, rows, Array.from({length: columns * rows}, (_, index) => index + 1));
          const layout = tilesetGridLayout(tileset, columns, rows);
          for (const operation of ["cw", "ccw"] as const) {
            const result = transformTilemapGrid(source, tileset, operation);
            const targetLayout = tilesetGridLayout(result.tileset!, result.tilemap.columns, result.tilemap.rows);
            let translation: {x: number; y: number} | undefined;
            for (let index = 0; index < result.tilemap.tiles.length; index += 1) {
              const sourceIndex = (result.tilemap.tiles[index] & 0x1fffffff) - 1;
              const point = cellToDocument(layout, {column: sourceIndex % columns, row: Math.floor(sourceIndex / columns)});
              const target = cellToDocument(targetLayout, {
                column: index % result.tilemap.columns, row: Math.floor(index / result.tilemap.columns),
              });
              const rotated = operation === "cw" ? {x: -point.y, y: point.x} : {x: point.y, y: -point.x};
              const delta = {x: target.x - rotated.x, y: target.y - rotated.y};
              translation ??= delta;
              expect(delta).toEqual(translation);
            }
          }
        }
      }
    }
  });

  it("preserves each hexagonal rule direction across map parity and dimensions", () => {
    for (const grid of [
      {kind: "hexagonal", orientation: "pointy", offset: "odd-r"},
      {kind: "hexagonal", orientation: "pointy", offset: "even-r"},
      {kind: "hexagonal", orientation: "flat", offset: "odd-q"},
      {kind: "hexagonal", orientation: "flat", offset: "even-q"},
    ] as const) {
      for (const columns of [2, 3, 4]) {
        for (const rows of [2, 3, 4]) {
          const tileset = createTileset({tileWidth: 2, tileHeight: 2, grid});
          tileset.terrains = [{
            id: 1, name: "Directions", color: "#ffffffff", neighborMode: "edge6", boundary: "empty",
            rules: Array.from({length: 64}, (_, mask) => ({
              mask, candidates: [{tileId: mask + 1, flags: 0, weight: 1}],
            })),
          }];
          const map = createTerrainMapData(columns, rows, 9);
          map.terrains.set(Array.from({length: columns * rows}, (_, index) => index % 3 === 1 ? 0 : 1));
          const tilemap = createTilemapData(columns, rows);
          const layout = tilesetGridLayout(tileset);
          for (let row = 0; row < rows; row += 1) {
            for (let column = 0; column < columns; column += 1) {
              tilemap.tiles[row * columns + column] = resolveTerrainTile(map, tileset.terrains, layout, column, row);
            }
          }
          for (const operation of ["horizontal", "vertical", "180", "cw", "ccw"] as const) {
            const result = transformTilemapGrid(tilemap, map, tileset, operation);
            const targetLayout = tilesetGridLayout(result.tileset!);
            for (let row = 0; row < result.tilemap.rows; row += 1) {
              for (let column = 0; column < result.tilemap.columns; column += 1) {
                expect(result.tilemap.tiles[row * result.tilemap.columns + column]).toBe(
                  resolveTerrainTile(result.terrainmap!, result.tileset!.terrains, targetLayout, column, row),
                );
              }
            }
          }
        }
      }
    }
  });

  it("transforms orthogonal matrices and the complete tile flag transform without mutation", () => {
    const source = mapOf(3, 2, [
      1 | tileFlipX,
      2 | tileFlipY,
      0,
      3 | tileFlipDiagonal,
      4 | tileFlipX | tileFlipY,
      5,
    ]);
    const originalTiles = source.tiles.slice();
    const tileset = createTileset({tileWidth: 2, tileHeight: 2});
    const originalGrid = {...tileset.grid};

    for (const operation of ["horizontal", "vertical", "cw", "ccw", "180"] as const) {
      const result = transformTilemapGrid(source, tileset, operation);
      expect(result.tilemap.columns).toBe(operation === "cw" || operation === "ccw" ? 2 : 3);
      expect(result.tilemap.rows).toBe(operation === "cw" || operation === "ccw" ? 3 : 2);

      for (let row = 0; row < source.rows; row += 1) {
        for (let column = 0; column < source.columns; column += 1) {
          const destination = operation === "cw"
            ? {column: source.rows - 1 - row, row: column}
            : operation === "ccw"
              ? {column: row, row: source.columns - 1 - column}
              : operation === "horizontal"
                ? {column: source.columns - 1 - column, row}
                : operation === "vertical"
                  ? {column, row: source.rows - 1 - row}
                  : {column: source.columns - 1 - column, row: source.rows - 1 - row};
          const sourceValue = source.tiles[row * source.columns + column];
          const transformedValue = result.tilemap.tiles[destination.row * result.tilemap.columns + destination.column];
          if (sourceValue === 0) {
            expect(transformedValue).toBe(0);
          } else {
            expect(transformedValue & 0x1fffffff).toBe(sourceValue & 0x1fffffff);
            expectTileImageTransform(sourceValue, transformedValue, operation);
          }
        }
      }
    }

    expect(source.tiles).toEqual(originalTiles);
    expect(tileset.grid).toEqual(originalGrid);
  });

  it("uses screen geometry for a non-square isometric map and updates high-tile anchors", () => {
    const source = mapOf(3, 2, [1, 2, 3, 4, 5, 6]);
    const tileset = createTileset({
      tileWidth: 4,
      tileHeight: 4,
      grid: {kind: "isometric", cellWidth: 32, cellHeight: 16, anchorX: 1, anchorY: 3},
    });

    const horizontal = transformTilemapGrid(source, tileset, "horizontal");
    expect(tileIds(horizontal.tilemap)).toEqual([1, 4, 2, 5, 3, 6]);
    expect(horizontal.tileset?.grid).toEqual({kind: "isometric", cellWidth: 32, cellHeight: 16, anchorX: 3, anchorY: 3});

    const vertical = transformTilemapGrid(source, tileset, "vertical");
    expect(tileIds(vertical.tilemap)).toEqual([6, 3, 5, 2, 4, 1]);
    expect(vertical.tileset?.grid).toEqual({kind: "isometric", cellWidth: 32, cellHeight: 16, anchorX: 1, anchorY: 1});

    const clockwise = transformTilemapGrid(source, tileset, "cw");
    expect(tileIds(clockwise.tilemap)).toEqual([4, 1, 5, 2, 6, 3]);
    expect(clockwise.tileset?.grid).toEqual({kind: "isometric", cellWidth: 16, cellHeight: 32, anchorX: 1, anchorY: 1});

    const counterclockwise = transformTilemapGrid(source, tileset, "ccw");
    expect(tileIds(counterclockwise.tilemap)).toEqual([3, 6, 2, 5, 1, 4]);
    expect(counterclockwise.tileset?.grid).toEqual({kind: "isometric", cellWidth: 16, cellHeight: 32, anchorX: 3, anchorY: 3});

    const halfTurn = transformTilemapGrid(source, tileset, "180");
    expect(tileIds(halfTurn.tilemap)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(halfTurn.tileset?.grid).toEqual({kind: "isometric", cellWidth: 32, cellHeight: 16, anchorX: 3, anchorY: 1});
    expect(source.tiles).toEqual(new Uint32Array([1, 2, 3, 4, 5, 6]));
  });

  it("uses axial/cube semantics for every pointy/flat odd/even layout and round-trips", () => {
    const layouts: TilesetGrid[] = [
      {kind: "hexagonal", orientation: "pointy", offset: "odd-r"},
      {kind: "hexagonal", orientation: "pointy", offset: "even-r"},
      {kind: "hexagonal", orientation: "flat", offset: "odd-q"},
      {kind: "hexagonal", orientation: "flat", offset: "even-q"},
    ];
    const source = mapOf(3, 2, [1, 2, 3, 4, 5, 6]);

    for (const grid of layouts) {
      for (const operation of ["horizontal", "vertical", "180"] as const) {
        const result = transformTilemapGrid(source, grid, operation);
        expect(result.tilemap.columns).toBe(3);
        expect(result.tilemap.rows).toBe(2);
        expect(result.grid.kind).toBe("hexagonal");
        expect((result.grid as Extract<TilesetGrid, {kind: "hexagonal"}>).orientation).toBe(
          (grid as Extract<TilesetGrid, {kind: "hexagonal"}>).orientation,
        );

        const restored = transformTilemapGrid(result.tilemap, result.grid, inverse(operation));
        expect(restored.tilemap).not.toBe(result.tilemap);
        expect(mapValues(restored.tilemap)).toEqual(mapValues(source));
        expect(restored.grid).toEqual(grid);
      }
    }
  });

  it("maps Terrain IDs with the same coordinates and preserves the seed", () => {
    const source = mapOf(3, 2, [1, 2, 3, 4, 5, 6]);
    const terrainmap = createTerrainMapData(3, 2, 987654);
    terrainmap.terrains.set([10, 11, 12, 13, 14, 15]);
    const result = transformTilemapGrid(source, terrainmap, {kind: "orthogonal"}, "cw");

    expect(tileIds(result.tilemap)).toEqual([4, 1, 5, 2, 6, 3]);
    expect([...result.terrainmap!.terrains]).toEqual([13, 10, 14, 11, 15, 12]);
    expect(result.terrainmap?.seed).toBe(987654);
    expect([...terrainmap.terrains]).toEqual([10, 11, 12, 13, 14, 15]);
  });

  it("transforms Terrain candidate flags with the same screen operation", () => {
    const source = mapOf(1, 1, [1]);
    const tileset = createTileset({tileWidth: 2, tileHeight: 2});
    tileset.terrains = [{
      id: 1,
      name: "Road",
      color: "#ffffffff",
      neighborMode: "edge4",
      boundary: "empty",
      rules: [{mask: 0, candidates: [{tileId: 1, flags: tileFlipX, weight: 1}]}],
    }];
    const result = transformTilemapGrid(source, tileset, "cw");
    const flags = result.tileset!.terrains[0].rules[0].candidates[0].flags;
    expectTileImageTransform(1 | tileFlipX, 1 | flags, "cw");
    expect(tileset.terrains[0].rules[0].candidates[0].flags).toBe(tileFlipX);
  });

  it("permutes Terrain mask directions together with document transforms", () => {
    const source = mapOf(1, 1, [1]);
    const tileset = createTileset({tileWidth: 2, tileHeight: 2});
    tileset.terrains = [{
      id: 1,
      name: "Edge",
      color: "#ffffffff",
      neighborMode: "edge4",
      boundary: "empty",
      rules: [{mask: 1, candidates: [{tileId: 1, flags: 0, weight: 1}]}],
    }];
    expect(transformTilemapGrid(source, tileset, "horizontal").tileset!.terrains[0].rules[0].mask).toBe(1);
    expect(transformTilemapGrid(source, tileset, "vertical").tileset!.terrains[0].rules[0].mask).toBe(4);
    expect(transformTilemapGrid(source, tileset, "cw").tileset!.terrains[0].rules[0].mask).toBe(2);

    const hex = createTileset({
      tileWidth: 2,
      tileHeight: 2,
      grid: {kind: "hexagonal", orientation: "pointy", offset: "odd-r"},
    });
    hex.terrains = [{
      id: 1,
      name: "Hex",
      color: "#ffffffff",
      neighborMode: "edge6",
      boundary: "empty",
      rules: [{mask: 1, candidates: [{tileId: 1, flags: 0, weight: 1}]}],
    }];
    const mirrored = transformTilemapGrid(source, hex, "horizontal");
    expect(mirrored.tileset!.terrains[0].rules[0].mask).not.toBe(0);
    const restored = transformTilemapGrid(mirrored.tilemap, mirrored.tileset!, "horizontal");
    expect(restored.tileset!.terrains[0].rules[0].mask).toBe(1);
  });

  it("rejects flagged empty cells and non-square quarter-turns without tile pixels", () => {
    const flaggedEmpty = mapOf(1, 1, [tileFlipX]);
    expect(() => transformTilemapGrid(flaggedEmpty, {kind: "orthogonal"}, "horizontal")).toThrow(/Empty tile cells/);

    const nonSquare = mapOf(1, 1, [1]);
    const nonSquareTileset = createTileset({tileWidth: 3, tileHeight: 2});
    expect(transformTilemapGrid(nonSquare, nonSquareTileset, "cw").tileset).toMatchObject({tileWidth: 2, tileHeight: 3});
    expect(() => transformTilemapGrid(nonSquare, {kind: "orthogonal", tileWidth: 3, tileHeight: 2}, "cw")).toThrow(/square tiles/);

    const hexGrid: TilesetGrid = {kind: "hexagonal", orientation: "pointy", offset: "odd-r"};
    expect(transformTilemapGrid(nonSquare, hexGrid, "cw").grid).toMatchObject({orientation: "flat"});
    expect(transformTilemapGrid(nonSquare, hexGrid, "ccw").grid).toMatchObject({orientation: "flat"});
  });

  it("does not mutate Terrain, tilemap buffers, or returned geometry", () => {
    const source = mapOf(2, 2, [1, 2, 3, 4]);
    const terrainmap = createTerrainMapData(2, 2, 9);
    terrainmap.terrains.set([5, 6, 7, 8]);
    const grid: TilesetGrid = {kind: "hexagonal", orientation: "flat", offset: "even-q"};
    const result = transformTilemapGrid(source, terrainmap, grid, "180");

    expect(result.tilemap.tiles).not.toBe(source.tiles);
    expect(result.terrainmap?.terrains).not.toBe(terrainmap.terrains);
    expect(result.grid).not.toBe(grid);
    expect(mapValues(source)).toEqual([1, 2, 3, 4]);
    expect([...terrainmap.terrains]).toEqual([5, 6, 7, 8]);
    (result.grid as Extract<TilesetGrid, {kind: "hexagonal"}>).offset = "odd-q";
    expect(grid.offset).toBe("even-q");
  });
});

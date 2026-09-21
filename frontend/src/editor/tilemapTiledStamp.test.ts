import {describe, expect, it} from "vitest";

import {createTileset} from "./tilemap";
import type {TilesetGrid} from "./document";
import {terrainEmpty} from "./terrain";
import {terrainRectangleCells, type TerrainRectangleMode} from "./terrainTools";
import {
  mapTiledCellTargets,
  mapTiledTerrainStampTargets,
  mapTiledTileStampTargets,
  type TiledStampGeometry,
  type TiledStampTarget,
} from "./tilemapTiledStamp";
import type {TerrainStamp} from "./terrainTools";
import type {TileCell} from "./tileGrid";
import type {TileStamp} from "./tilemapTools";

const gridCases = [
  ["orthogonal", {kind: "orthogonal"}],
  ["isometric", {kind: "isometric", cellWidth: 4, cellHeight: 2, anchorX: 0, anchorY: 0}],
  ["pointy odd-r", {kind: "hexagonal", orientation: "pointy", offset: "odd-r"}],
  ["pointy even-r", {kind: "hexagonal", orientation: "pointy", offset: "even-r"}],
  ["flat odd-q", {kind: "hexagonal", orientation: "flat", offset: "odd-q"}],
  ["flat even-q", {kind: "hexagonal", orientation: "flat", offset: "even-q"}],
] as const;

function geometry(
  grid: TilesetGrid = {kind: "orthogonal"},
  overrides: Partial<TiledStampGeometry> = {},
): TiledStampGeometry {
  return {
    tileset: createTileset({tileWidth: 4, tileHeight: 4, grid}),
    tilemap: {columns: 4, rows: 4},
    celOffset: {x: 0, y: 0},
    documentSize: {width: 16, height: 16},
    tiledX: false,
    tiledY: false,
    ...overrides,
  };
}

function tileStamp(width: number, height: number, values: readonly number[]): TileStamp {
  return {width, height, tiles: Uint32Array.from(values)};
}

function terrainStamp(width: number, height: number, values: readonly number[]): TerrainStamp {
  return {width, height, terrains: Uint16Array.from(values)};
}

function targetValues(targets: readonly TiledStampTarget[]) {
  return targets.map(({cell, value}) => [cell.column, cell.row, value]);
}

function sourceValue(cell: TileCell) {
  return (cell.row + 20) * 100 + cell.column + 20;
}

function mapRectangle(
  tiledGeometry: TiledStampGeometry,
  start: TileCell,
  end: TileCell,
  mode: TerrainRectangleMode,
) {
  const cells = terrainRectangleCells(start, end, mode);
  return mapTiledCellTargets(tiledGeometry, cells.map((cell) => ({cell, value: sourceValue(cell)})));
}

describe("tiled tile and Terrain stamp target mapping", () => {
  it.each([
    ["orthogonal", {kind: "orthogonal"}],
    ["isometric", {kind: "isometric", cellWidth: 4, cellHeight: 2, anchorX: 0, anchorY: 0}],
  ] as const)("keeps non-boundary %s cells on their logical cells", (_label, grid) => {
    const result = mapTiledTileStampTargets(
      geometry(grid, {tilemap: {columns: 6, rows: 6}, documentSize: {width: 32, height: 24}}),
      {column: 2, row: 2},
      tileStamp(2, 2, [1, 2, 3, 4]),
    );

    expect(targetValues(result)).toEqual([
      [2, 2, 1],
      [3, 2, 2],
      [2, 3, 3],
      [3, 3, 4],
    ]);
  });

  it.each([
    ["pointy odd-r", {kind: "hexagonal", orientation: "pointy", offset: "odd-r"}],
    ["pointy even-r", {kind: "hexagonal", orientation: "pointy", offset: "even-r"}],
    ["flat odd-q", {kind: "hexagonal", orientation: "flat", offset: "odd-q"}],
    ["flat even-q", {kind: "hexagonal", orientation: "flat", offset: "even-q"}],
  ] as const)("round-trips logical centers for %s", (_label, grid) => {
    const result = mapTiledTileStampTargets(
      geometry(grid, {tilemap: {columns: 6, rows: 6}, documentSize: {width: 64, height: 64}}),
      {column: 2, row: 2},
      tileStamp(2, 2, [11, 12, 13, 14]),
    );

    expect(targetValues(result)).toEqual([
      [2, 2, 11],
      [3, 2, 12],
      [2, 3, 13],
      [3, 3, 14],
    ]);
  });

  it.each(gridCases)("maps ordered unwrapped candidates for %s", (_label, grid) => {
    const result = mapTiledCellTargets(
      geometry(grid, {tilemap: {columns: 4, rows: 4}, documentSize: {width: 64, height: 64}}),
      [
        {cell: {column: 2, row: 2}, value: 22},
        {cell: {column: 1, row: 1}, value: 11},
        {cell: {column: 2, row: 2}, value: 222},
        {cell: {column: 3, row: 2}, value: 32},
        {cell: {column: 100, row: 100}, value: 100},
      ],
    );

    expect(targetValues(result)).toEqual([
      [1, 1, 11],
      [2, 2, 222],
      [3, 2, 32],
    ]);
  });

  it.each(gridCases)("maps raw outline and filled rectangles for %s", (_label, grid) => {
    const tiledGeometry = geometry(grid, {
      tilemap: {columns: 6, rows: 6},
      documentSize: {width: 64, height: 64},
    });
    const outline = mapRectangle(tiledGeometry, {column: 1, row: 1}, {column: 3, row: 3}, "outline");
    const filled = mapRectangle(tiledGeometry, {column: 1, row: 1}, {column: 3, row: 3}, "filled");

    expect(outline).toHaveLength(8);
    expect(filled).toHaveLength(9);
    expect(outline).not.toContainEqual({cell: {column: 2, row: 2}, value: sourceValue({column: 2, row: 2})});
    expect(filled).toContainEqual({cell: {column: 2, row: 2}, value: sourceValue({column: 2, row: 2})});
  });

  it("wraps both axes in document space", () => {
    const result = mapTiledTileStampTargets(
      geometry(undefined, {
        tilemap: {columns: 2, rows: 2},
        documentSize: {width: 8, height: 8},
        tiledX: true,
        tiledY: true,
      }),
      {column: 1, row: 1},
      tileStamp(2, 2, [1, 2, 3, 4]),
    );

    expect(targetValues(result)).toEqual([
      [0, 0, 4],
      [1, 0, 3],
      [0, 1, 2],
      [1, 1, 1],
    ]);
  });

  it("clips an off-canvas partial Cel instead of taking a tilemap modulo", () => {
    const result = mapTiledTileStampTargets(
      geometry(undefined, {
        tilemap: {columns: 1, rows: 1},
        celOffset: {x: 4, y: 0},
        documentSize: {width: 8, height: 4},
        tiledX: true,
      }),
      {column: 0, row: 0},
      tileStamp(2, 1, [7, 8]),
    );

    expect(targetValues(result)).toEqual([[0, 0, 7]]);
  });

  it("uses row-major last-wins values when a large stamp repeats targets", () => {
    const result = mapTiledTileStampTargets(
      geometry(undefined, {
        tilemap: {columns: 2, rows: 1},
        documentSize: {width: 8, height: 4},
        tiledX: true,
      }),
      {column: 0, row: 0},
      tileStamp(5, 1, [1, 2, 3, 4, 5]),
    );

    expect(targetValues(result)).toEqual([
      [0, 0, 5],
      [1, 0, 4],
    ]);
  });

  it("clips a non-tiled boundary on only the disabled axis", () => {
    const result = mapTiledTileStampTargets(
      geometry(undefined, {
        tilemap: {columns: 2, rows: 2},
        documentSize: {width: 8, height: 8},
        tiledX: true,
        tiledY: false,
      }),
      {column: 1, row: 1},
      tileStamp(2, 2, [1, 2, 3, 4]),
    );

    expect(targetValues(result)).toEqual([
      [0, 1, 2],
      [1, 1, 1],
    ]);
  });

  it("maps right, left, and double-axis raw rectangle boundaries with outline versus filled semantics", () => {
    const tiledGeometry = geometry(undefined, {
      tilemap: {columns: 4, rows: 4},
      documentSize: {width: 16, height: 16},
      tiledX: true,
      tiledY: true,
    });
    const cases = [
      {
        start: {column: 3, row: 1},
        end: {column: 5, row: 3},
        interior: {source: {column: 4, row: 2}, target: {column: 0, row: 2}},
      },
      {
        start: {column: -2, row: 1},
        end: {column: 0, row: 3},
        interior: {source: {column: -1, row: 2}, target: {column: 3, row: 2}},
      },
      {
        start: {column: 3, row: 3},
        end: {column: 5, row: 5},
        interior: {source: {column: 4, row: 4}, target: {column: 0, row: 0}},
      },
    ] as const;

    for (const {start, end, interior} of cases) {
      const outline = mapRectangle(tiledGeometry, start, end, "outline");
      const filled = mapRectangle(tiledGeometry, start, end, "filled");
      const filledInterior = {cell: interior.target, value: sourceValue(interior.source)};

      expect(outline).toHaveLength(8);
      expect(filled).toHaveLength(9);
      expect(outline).not.toContainEqual(filledInterior);
      expect(filled).toContainEqual(filledInterior);
    }
  });

  it("maps radius brush candidates, including left/right/top collisions after wrapping", () => {
    const result = mapTiledCellTargets(
      geometry(undefined, {
        tilemap: {columns: 2, rows: 2},
        documentSize: {width: 8, height: 8},
        tiledX: true,
        tiledY: true,
      }),
      [
        {cell: {column: -1, row: 0}, value: 1},
        {cell: {column: 0, row: -1}, value: 2},
        {cell: {column: 0, row: 0}, value: 3},
        {cell: {column: 1, row: 0}, value: 4},
        {cell: {column: 0, row: 1}, value: 5},
        {cell: {column: 2, row: 0}, value: 6},
      ],
    );

    expect(targetValues(result)).toEqual([
      [0, 0, 6],
      [1, 0, 4],
      [0, 1, 5],
    ]);
  });

  it("supports tile empty overwrite and skip without mutating the stamp", () => {
    const stamp = tileStamp(2, 1, [0, 9]);
    const original = stamp.tiles.slice();
    const options = geometry(undefined, {tilemap: {columns: 2, rows: 1}, documentSize: {width: 8, height: 4}});

    expect(targetValues(mapTiledTileStampTargets(options, {column: 0, row: 0}, stamp))).toEqual([
      [0, 0, 0],
      [1, 0, 9],
    ]);
    expect(targetValues(mapTiledTileStampTargets(options, {column: 0, row: 0}, stamp, {emptyMode: "skip"}))).toEqual([
      [1, 0, 9],
    ]);
    expect(stamp.tiles).toEqual(original);
  });

  it("skips unspecified Terrain but preserves explicit empty Terrain in skip mode", () => {
    const stamp = terrainStamp(3, 1, [0, terrainEmpty, 12]);
    const original = stamp.terrains.slice();
    const options = geometry(undefined, {tilemap: {columns: 3, rows: 1}, documentSize: {width: 12, height: 4}});

    expect(targetValues(mapTiledTerrainStampTargets(options, {column: 0, row: 0}, stamp, {emptyMode: "skip"}))).toEqual([
      [1, 0, terrainEmpty],
      [2, 0, 12],
    ]);
    expect(targetValues(mapTiledTerrainStampTargets(options, {column: 0, row: 0}, stamp))).toEqual([
      [0, 0, 0],
      [1, 0, terrainEmpty],
      [2, 0, 12],
    ]);
    expect(stamp.terrains).toEqual(original);
  });
});

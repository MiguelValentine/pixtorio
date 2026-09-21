import {describe, expect, it} from "vitest";

import {createTerrainMapData, getTerrainCell, setTerrainCell, terrainEmpty} from "./terrain";
import {
  applyTerrainCells,
  applyTerrainStamp,
  createTerrainStamp,
  flipTerrainStamp,
  rotateTerrainStamp,
  transformTerrainSelection,
  terrainFloodFill,
  terrainLineCells,
  terrainPicker,
  terrainRectangleCells,
} from "./terrainTools";
import {cellNeighbors, type TileGridLayout} from "./tileGrid";

const orthogonal: TileGridLayout = {kind: "orthogonal", tileWidth: 16, tileHeight: 16};
const isometric: TileGridLayout = {kind: "isometric", tileWidth: 32, tileHeight: 16};

const hexLayouts: TileGridLayout[] = [
  {kind: "hexagonal", tileWidth: 18, tileHeight: 16, orientation: "pointy", offset: "odd-r"},
  {kind: "hexagonal", tileWidth: 18, tileHeight: 16, orientation: "pointy", offset: "even-r"},
  {kind: "hexagonal", tileWidth: 18, tileHeight: 16, orientation: "flat", offset: "odd-q"},
  {kind: "hexagonal", tileWidth: 18, tileHeight: 16, orientation: "flat", offset: "even-q"},
];

describe("terrain tools", () => {
  it("does not cross rejected selection cells during a flood", () => {
    for (const grid of [orthogonal, isometric, ...hexLayouts]) {
      const map = createTerrainMapData(5, 3, 0);
      map.terrains.fill(1);
      const filled = terrainFloodFill(map, grid, {column: 0, row: 1}, (cell) => cell.column !== 2);
      expect(filled).toHaveLength(6);
      expect(filled.every((cell) => cell.column < 2)).toBe(true);
      expect(terrainFloodFill(map, grid, {column: 2, row: 1}, (cell) => cell.column !== 2)).toEqual([]);
      expect(map.terrains.every((value) => value === 1)).toBe(true);
    }
  });

  it("picks valid cells, rejects invalid bounds, and preserves the map", () => {
    const map = createTerrainMapData(3, 2, 7);
    const updated = setTerrainCell(map, 1, 0, 42);

    expect(terrainPicker(updated, {column: 1, row: 0})).toBe(42);
    expect(terrainPicker(updated, 1, 0)).toBe(42);
    expect(() => terrainPicker(updated, -1, 0)).toThrow(/outside/);
    expect(() => terrainPicker(updated, 3, 0)).toThrow(/outside/);
    expect([...map.terrains]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("draws integer lines on orthogonal and isometric logical grids in both directions", () => {
    expect(terrainLineCells(orthogonal, {column: 0, row: 0}, {column: 3, row: 2})).toEqual([
      {column: 0, row: 0}, {column: 1, row: 1}, {column: 2, row: 1}, {column: 3, row: 2},
    ]);
    expect(terrainLineCells({column: 3, row: 2}, {column: -1, row: -1}, isometric)).toEqual([
      {column: 3, row: 2}, {column: 2, row: 1}, {column: 1, row: 0}, {column: 0, row: 0}, {column: -1, row: -1},
    ]);
  });

  it("draws gap-free shortest hex lines for all four offset layouts", () => {
    for (const grid of hexLayouts) {
      const line = terrainLineCells(grid, {column: -2, row: -1}, {column: 3, row: 3});
      expect(line[0]).toEqual({column: -2, row: -1});
      expect(line[line.length - 1]).toEqual({column: 3, row: 3});
      expect(new Set(line.map(({column, row}) => `${column},${row}`)).size).toBe(line.length);
      for (let index = 1; index < line.length; index += 1) {
        const previous = line[index - 1];
        expect(cellNeighbors(grid, previous)).toContainEqual(line[index]);
      }
    }
  });

  it("creates logical rectangles with deterministic outline and filled order", () => {
    expect(terrainRectangleCells({column: 3, row: 2}, {column: 1, row: 0})).toEqual([
      {column: 1, row: 0}, {column: 2, row: 0}, {column: 3, row: 0},
      {column: 1, row: 1}, {column: 3, row: 1},
      {column: 1, row: 2}, {column: 2, row: 2}, {column: 3, row: 2},
    ]);
    expect(terrainRectangleCells(orthogonal, {column: 0, row: 0}, {column: 1, row: 1}, "filled")).toEqual([
      {column: 0, row: 0}, {column: 1, row: 0}, {column: 0, row: 1}, {column: 1, row: 1},
    ]);
  });

  it("floods by logical terrain id using four or six neighbors without crossing regions", () => {
    const orthogonalMap = createTerrainMapData(4, 3);
    orthogonalMap.terrains.set([
      1, 1, 2, 2,
      1, 2, 1, 2,
      2, 2, 1, 2,
    ]);
    expect(terrainFloodFill(orthogonalMap, orthogonal, {column: 0, row: 0})).toEqual([
      {column: 0, row: 0}, {column: 1, row: 0}, {column: 0, row: 1},
    ]);

    const hexMap = createTerrainMapData(3, 3);
    hexMap.terrains.fill(1);
    hexMap.terrains[4] = 2;
    const filled = terrainFloodFill(hexMap, hexLayouts[0], {column: 0, row: 0});
    expect(filled).not.toContainEqual({column: 1, row: 1});
    expect(filled).toHaveLength(8);
  });

  it("applies valid terrain ids purely, deduplicates cells, and orders changes", () => {
    const map = createTerrainMapData(3, 2, 11);
    map.terrains.set([1, 2, 3, 4, 5, 6]);
    const applied = applyTerrainCells(map, [
      {column: 2, row: 1},
      {column: 0, row: 0},
      {column: 2, row: 1},
      {column: 1, row: 0},
    ], 65535);

    expect(applied.map).not.toBe(map);
    expect(applied.map.terrains).not.toBe(map.terrains);
    expect([...applied.map.terrains]).toEqual([65535, 65535, 3, 4, 5, 65535]);
    expect(applied.changedCells).toEqual([
      {column: 0, row: 0}, {column: 1, row: 0}, {column: 2, row: 1},
    ]);
    expect([...map.terrains]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(() => applyTerrainCells(map, [{column: -1, row: 0}], 1)).toThrow(/outside/);
    expect(() => applyTerrainCells(map, [{column: 0, row: 0}], 65536)).toThrow(/0 to 65535/);
  });

  it("returns an independent clone when no cells change", () => {
    const map = createTerrainMapData(1, 1);
    const applied = applyTerrainCells(map, 0, [{column: 0, row: 0}]);
    expect(applied.changedCells).toEqual([]);
    expect(applied.map).not.toBe(map);
    expect(getTerrainCell(applied.map, 0, 0)).toBe(0);
  });

  it("captures, applies, flips, and rotates Terrain stamps with empty-cell control", () => {
    const map = createTerrainMapData(4, 3);
    map.terrains.set([
      1, 0, 2, 0,
      3, 4, 0, 0,
      0, 0, 0, 0,
    ]);
    const stamp = createTerrainStamp(map, {column: 0, row: 0}, {column: 1, row: 1});
    expect(stamp).toEqual({width: 2, height: 2, terrains: new Uint16Array([1, 0, 3, 4])});
    expect(flipTerrainStamp(stamp, "horizontal").terrains).toEqual(new Uint16Array([0, 1, 4, 3]));
    expect(flipTerrainStamp(stamp, "vertical").terrains).toEqual(new Uint16Array([3, 4, 1, 0]));
    expect(rotateTerrainStamp(stamp, "cw")).toEqual({width: 2, height: 2, terrains: new Uint16Array([3, 1, 4, 0])});
    expect(rotateTerrainStamp(stamp, "ccw")).toEqual({width: 2, height: 2, terrains: new Uint16Array([0, 4, 1, 3])});

    const skipped = applyTerrainStamp(map, stamp, {column: 1, row: 0}, "skip");
    expect([...skipped.map.terrains]).toEqual([
      1, 1, 2, 0,
      3, 3, 4, 0,
      0, 0, 0, 0,
    ]);
    const overwritten = applyTerrainStamp(map, stamp, {column: 1, row: 0}, "overwrite");
    expect([...overwritten.map.terrains]).toEqual([
      1, 1, 0, 0,
      3, 3, 4, 0,
      0, 0, 0, 0,
    ]);
  });

  it("transforms Terrain selections while preserving seed and all three cell states", () => {
    const map = createTerrainMapData(4, 3, 73);
    map.terrains.set([
      1, terrainEmpty, 8, 9,
      0, 2, 7, 6,
      3, 4, 5, 0,
    ]);
    const selection = {x: 0, y: 0, width: 2, height: 3};

    const horizontal = transformTerrainSelection(map, selection, "flip-x");
    expect([...horizontal.map.terrains]).toEqual([
      terrainEmpty, 1, 8, 9,
      2, 0, 7, 6,
      4, 3, 5, 0,
    ]);
    expect(horizontal.map.seed).toBe(73);
    expect(horizontal.selection).toEqual(selection);

    const clockwise = transformTerrainSelection(map, selection, "cw");
    expect(clockwise.selection).toEqual({x: 0, y: 0, width: 3, height: 2});
    expect([...clockwise.map.terrains]).toEqual([
      3, 0, 1, 9,
      4, 2, terrainEmpty, 6,
      0, 0, 5, 0,
    ]);
    expect(clockwise.changedCells).toEqual([
      {column: 0, row: 0}, {column: 1, row: 0}, {column: 2, row: 0},
      {column: 0, row: 1}, {column: 2, row: 1},
      {column: 0, row: 2}, {column: 1, row: 2},
    ]);
    expect([...map.terrains]).toEqual([
      1, terrainEmpty, 8, 9,
      0, 2, 7, 6,
      3, 4, 5, 0,
    ]);
    expect(() => transformTerrainSelection(map, {x: 3, y: 2, width: 2, height: 1}, "flip-x")).toThrow(/selection/);
  });
});

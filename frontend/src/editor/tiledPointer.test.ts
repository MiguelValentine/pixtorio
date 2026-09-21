import {describe, expect, it} from "vitest";
import {crossesTiledBoundary, wrappedLinePoints, wrapTiledPoint} from "./tiledPointer";
import {createTilemapData, createTileset, tilemapCellAtPixel, tilemapPixelSize} from "./tilemap";

describe("unwrapped Tilemap pointer paths", () => {
  it("crosses the right edge without drawing through the middle of the document", () => {
    expect([...wrappedLinePoints({x: 7, y: 2}, {x: 9, y: 2}, 8, 6, true, false)]).toEqual([
      {x: 7, y: 2}, {x: 0, y: 2}, {x: 1, y: 2},
    ]);
    expect([...wrappedLinePoints({x: 0, y: 2}, {x: -2, y: 2}, 8, 6, true, false)]).toEqual([
      {x: 0, y: 2}, {x: 7, y: 2}, {x: 6, y: 2},
    ]);
  });

  it("wraps diagonal crossings and keeps long in-document lines long", () => {
    expect([...wrappedLinePoints({x: 7, y: 5}, {x: 9, y: 7}, 8, 6, true, true)]).toEqual([
      {x: 7, y: 5}, {x: 0, y: 0}, {x: 1, y: 1},
    ]);
    expect([...wrappedLinePoints({x: 0, y: 0}, {x: 7, y: 0}, 8, 6, true, false)]).toHaveLength(8);
    expect(crossesTiledBoundary({x: 0, y: 0}, {x: 7, y: 0}, 8, 6, true, false)).toBe(false);
    expect(crossesTiledBoundary({x: -1, y: 0}, {x: 0, y: 0}, 8, 6, true, false)).toBe(true);
    expect(crossesTiledBoundary({x: -1, y: 0}, {x: 0, y: 0}, 8, 6, false, false)).toBe(false);
  });

  it("includes the last release segment and clips only axes that are not tiled", () => {
    const start = {x: 6, y: 3};
    const move = {x: 7, y: 3};
    const release = {x: 10, y: 3};
    const visited = [...wrappedLinePoints(start, move, 8, 6, true, false),
      ...wrappedLinePoints(move, release, 8, 6, true, false)];
    expect(visited.map((point) => point.x)).toEqual([6, 7, 7, 0, 1, 2]);
    expect([...wrappedLinePoints({x: 7, y: 5}, {x: 10, y: 8}, 8, 6, true, false)]).toEqual([{x: 7, y: 5}]);
    expect([...wrappedLinePoints({x: -2, y: 2}, {x: 2, y: 2}, 8, 6, false, false)]).toEqual([
      {x: 0, y: 2}, {x: 1, y: 2}, {x: 2, y: 2},
    ]);
  });

  it("keeps repeated traversals continuous, including a complete loop with identical wrapped endpoints", () => {
    const points = [...wrappedLinePoints({x: -1, y: 1}, {x: 15, y: 1}, 8, 4, true, false)];
    expect(points).toHaveLength(17);
    expect(points[0]).toEqual(points[16]);
    expect(new Set(points.map((point) => point.x)).size).toBe(8);
    for (let index = 1; index < points.length; index += 1) {
      expect((points[index].x - points[index - 1].x + 8) % 8).toBe(1);
    }
  });

  it("maps only seam samples into each grid, independent of its pixel geometry", () => {
    for (const grid of [
      {kind: "orthogonal"},
      {kind: "isometric", cellWidth: 4, cellHeight: 2, anchorX: 2, anchorY: 4},
      {kind: "hexagonal", orientation: "pointy", offset: "odd-r"},
      {kind: "hexagonal", orientation: "flat", offset: "even-q"},
    ] as const) {
      const tileset = createTileset({tileWidth: 4, tileHeight: 4, grid});
      const tilemap = createTilemapData(8, 6);
      const size = tilemapPixelSize(tileset, tilemap.columns, tilemap.rows);
      const y = Math.floor(size.height / 2);
      const samples = [...wrappedLinePoints({x: size.width - 1, y}, {x: size.width + 1, y},
        size.width, size.height, true, false)];
      expect(samples.map((point) => point.x)).toEqual([size.width - 1, 0, 1]);
      const cells = samples.map((point) => tilemapCellAtPixel(tileset, tilemap, point.x, point.y));
      expect(cells).toEqual([size.width - 1, 0, 1].map((x) => tilemapCellAtPixel(tileset, tilemap, x, y)));
    }
  });

  it("rejects fractional line coordinates instead of entering a nonterminating walk", () => {
    expect(() => [...wrappedLinePoints({x: 0.5, y: 0}, {x: 1, y: 0}, 8, 6, true, false)]).toThrow(/integers/);
    expect(wrapTiledPoint({x: -1, y: 2}, 8, 6, true, false)).toEqual({x: 7, y: 2});
  });
});

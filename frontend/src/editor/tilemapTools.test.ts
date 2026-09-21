import {describe, expect, it} from "vitest";
import {tileFlipDiagonal, tileFlipX, tileFlipY} from "./document";
import {createTilemapData, getTileCell} from "./tilemap";
import {
  applyTileStamp,
  copyTilemapSelection,
  createTileStamp,
  createTilemapSelection,
  cutTilemapSelection,
  eraseTileCells,
  floodFillTilemap,
  flipTilemapSelection,
  flipTileStamp,
  moveTilemapSelection,
  normalizeTilemapSelection,
  pickTileCell,
  pasteTilemapClipboard,
  rotateTileStamp,
  rotateTilemapSelection,
  tileLineCells,
  tileRectangleCells,
} from "./tilemapTools";

function cellValues(tilemap: ReturnType<typeof createTilemapData>) {
  return Array.from(tilemap.tiles);
}

describe("tilemap tools", () => {
  it("treats rejected selection cells as flood barriers", () => {
    const tilemap = createTilemapData(5, 1);
    tilemap.tiles.fill(1);
    const options = {acceptsCell: ({x}: {x: number}) => x !== 2};
    expect(cellValues(floodFillTilemap(tilemap, {x: 0, y: 0}, 2, options).tilemap)).toEqual([2, 2, 1, 1, 1]);
    expect(floodFillTilemap(tilemap, {x: 2, y: 0}, 2, options).changedCells).toEqual([]);
    expect(cellValues(tilemap)).toEqual([1, 1, 1, 1, 1]);
  });

  it("fills hexagonal diagonal edge neighbors using the actual grid", () => {
    const tilemap = createTilemapData(3, 3);
    tilemap.tiles.fill(2);
    tilemap.tiles[4] = 1;
    tilemap.tiles[2] = 1;
    const filled = floodFillTilemap(tilemap, {x: 1, y: 1}, 3, {
      grid: {kind: "hexagonal", tileWidth: 16, tileHeight: 16, orientation: "pointy", offset: "odd-r"},
    });
    expect(filled.changedCells).toEqual([{x: 2, y: 0}, {x: 1, y: 1}]);
    expect(floodFillTilemap(tilemap, {x: 1, y: 1}, 3).changedCells).toEqual([{x: 1, y: 1}]);
  });

  it("fills a large map with one detached output buffer", () => {
    const tilemap = createTilemapData(256, 256);
    const filled = floodFillTilemap(tilemap, {x: 0, y: 0}, 7);
    expect(filled.changedCells).toHaveLength(65536);
    expect(filled.tilemap.tiles.every((value) => value === 7)).toBe(true);
    expect(tilemap.tiles.every((value) => value === 0)).toBe(true);
  });

  it("picks cells safely and generates inclusive Bresenham lines", () => {
    const tilemap = createTilemapData(3, 2);
    tilemap.tiles.set([1, 2, 3, 4, 5, 6]);

    expect(pickTileCell(tilemap, 1, 0)).toBe(2);
    expect(pickTileCell(tilemap, {x: -1, y: 0})).toBeUndefined();
    expect(tileLineCells({x: 0, y: 0}, {x: 3, y: 2})).toEqual([
      {x: 0, y: 0},
      {x: 1, y: 1},
      {x: 2, y: 1},
      {x: 3, y: 2},
    ]);
  });

  it("generates row-major outline and filled rectangles without duplicates", () => {
    expect(tileRectangleCells({x: 1, y: 1}, {x: 3, y: 3})).toEqual([
      {x: 1, y: 1}, {x: 2, y: 1}, {x: 3, y: 1},
      {x: 1, y: 2}, {x: 3, y: 2},
      {x: 1, y: 3}, {x: 2, y: 3}, {x: 3, y: 3},
    ]);
    expect(tileRectangleCells({x: 1, y: 1}, {x: 2, y: 2}, "filled")).toEqual([
      {x: 1, y: 1}, {x: 2, y: 1}, {x: 1, y: 2}, {x: 2, y: 2},
    ]);
  });

  it("floods only the connected region and can match full values or tile ids", () => {
    const tilemap = createTilemapData(4, 3);
    tilemap.tiles.set([
      1 | tileFlipX, 1 | tileFlipX, 2, 2,
      1 | tileFlipX, 3, 1 | tileFlipX, 2,
      2, 2, 1 | tileFlipX, 2,
    ]);

    const full = floodFillTilemap(tilemap, {x: 0, y: 0}, 9);
    expect(cellValues(full.tilemap)).toEqual([
      9, 9, 2, 2,
      9, 3, 1 | tileFlipX, 2,
      2, 2, 1 | tileFlipX, 2,
    ].map((value) => value >>> 0));

    const byId = floodFillTilemap(tilemap, {x: 0, y: 0}, 9 | tileFlipY, {match: "tileId"});
    expect(cellValues(byId.tilemap)).toEqual([
      (9 | tileFlipY) >>> 0, (9 | tileFlipY) >>> 0, 2, 2,
      (9 | tileFlipY) >>> 0, 3, 1 | tileFlipX, 2,
      2, 2, 1 | tileFlipX, 2,
    ].map((value) => value >>> 0));
    expect(cellValues(tilemap)).toEqual([
      1 | tileFlipX, 1 | tileFlipX, 2, 2,
      1 | tileFlipX, 3, 1 | tileFlipX, 2,
      2, 2, 1 | tileFlipX, 2,
    ].map((value) => value >>> 0));
  });

  it("erases duplicate and out-of-bounds cells without mutating the source", () => {
    const tilemap = createTilemapData(2, 2);
    tilemap.tiles.set([1, 0, 2, 3]);
    const erased = eraseTileCells(tilemap, [{x: 1, y: 1}, {x: -1, y: 0}, {x: 1, y: 1}, {x: 0, y: 1}]);

    expect(cellValues(erased.tilemap)).toEqual([1, 0, 0, 0]);
    expect(erased.changedCells).toEqual([{x: 0, y: 1}, {x: 1, y: 1}]);
    expect(cellValues(tilemap)).toEqual([1, 0, 2, 3]);
  });

  it("captures empty cells and flags, then clips negative stamp targets", () => {
    const tilemap = createTilemapData(3, 2);
    tilemap.tiles.set([0, 7 | tileFlipX, 0, 8 | tileFlipDiagonal, 0, 9 | tileFlipY]);
    const stamp = createTileStamp(tilemap, {x: 0, y: 0, width: 3, height: 2});
    expect(Array.from(stamp.tiles)).toEqual([0, 7 | tileFlipX, 0, 8 | tileFlipDiagonal, 0, 9 | tileFlipY].map((value) => value >>> 0));

    const applied = applyTileStamp(tilemap, stamp, {x: -1, y: 0}, {emptyMode: "overwrite"});
    expect(cellValues(applied.tilemap)).toEqual([7 | tileFlipX, 0, 0, 0, 9 | tileFlipY, 9 | tileFlipY].map((value) => value >>> 0));
    expect(applied.changedCells).toEqual([
      {x: 0, y: 0}, {x: 1, y: 0}, {x: 0, y: 1}, {x: 1, y: 1},
    ]);
  });

  it("supports skip-empty stamp application and rejects unclipped overflow", () => {
    const target = createTilemapData(3, 2);
    target.tiles.set([11, 12, 13, 14, 15, 16]);
    const source = createTilemapData(2, 2);
    source.tiles.set([0, 20, 21, 0]);
    const stamp = createTileStamp(source, {x: 0, y: 0, width: 2, height: 2});

    const skipped = applyTileStamp(target, stamp, {x: 1, y: 0}, {emptyMode: "skip"});
    expect(cellValues(skipped.tilemap)).toEqual([11, 12, 20, 14, 21, 16]);
    expect(skipped.changedCells).toEqual([{x: 2, y: 0}, {x: 1, y: 1}]);
    expect(() => applyTileStamp(target, stamp, {x: 2, y: 1}, {clip: false})).toThrow();
  });

  it("composes flags when flipping and rotating stamps", () => {
    const tilemap = createTilemapData(2, 2);
    tilemap.tiles.set([
      1,
      2 | tileFlipX,
      3 | tileFlipY,
      4 | tileFlipDiagonal,
    ]);
    const stamp = createTileStamp(tilemap, {x: 0, y: 0, width: 2, height: 2}, {tileWidth: 2, tileHeight: 2});

    const flipped = flipTileStamp(stamp, "x");
    expect(Array.from(flipped.tiles)).toEqual([
      2,
      1 | tileFlipX,
      4 | tileFlipY | tileFlipDiagonal,
      3 | tileFlipX | tileFlipY,
    ].map((value) => value >>> 0));

    const rotated = rotateTileStamp(stamp, 90);
    expect(rotated.width).toBe(2);
    expect(rotated.height).toBe(2);
    expect(rotated.tiles.length).toBe(4);
    expect(getTileCell({columns: 2, rows: 2, tiles: rotated.tiles}, 0, 0)).toBe((3 | tileFlipDiagonal) >>> 0);
  });

  it("rejects diagonal and quarter-turn transforms for non-square tiles", () => {
    const stamp = {width: 1, height: 1, tiles: new Uint32Array([1]), tileWidth: 2, tileHeight: 1};
    expect(() => flipTileStamp(stamp, "diagonal")).toThrow(/square/);
    expect(() => rotateTileStamp(stamp, 90)).toThrow(/square/);
    expect(() => rotateTileStamp({width: 1, height: 1, tiles: new Uint32Array([1])}, 90)).toThrow(/dimensions/);
    expect(rotateTileStamp(stamp, 180).tiles).toEqual(new Uint32Array([1 | tileFlipX | tileFlipY]));
  });

  it("creates normalized selections from reversed endpoints and clamps them to the map", () => {
    const tilemap = createTilemapData(4, 3);

    expect(createTilemapSelection(tilemap, {x: 3, y: 2}, {x: 1, y: 0})).toEqual({x: 1, y: 0, width: 3, height: 3});
    expect(normalizeTilemapSelection({x: 3, y: 2, width: -2, height: -2})).toEqual({x: 2, y: 1, width: 2, height: 2});
    expect(createTilemapSelection(tilemap, {x: -4, y: -2}, {x: 8, y: 9})).toEqual({x: 0, y: 0, width: 4, height: 3});
  });

  it("copies and cuts complete tile values, flags, and empty cells without aliasing the map", () => {
    const tilemap = createTilemapData(3, 2);
    tilemap.tiles.set([
      1 | tileFlipX, 0, 2 | tileFlipDiagonal,
      3 | tileFlipY, 0, 4 | tileFlipX | tileFlipY,
    ]);
    const selection = createTilemapSelection(tilemap, {x: 2, y: 1}, {x: 0, y: 0});

    const copied = copyTilemapSelection(tilemap, selection);
    expect(Array.from(copied.tiles)).toEqual(Array.from(tilemap.tiles));
    copied.tiles[0] = 99;
    expect(tilemap.tiles[0]).toBe((1 | tileFlipX) >>> 0);

    const cut = cutTilemapSelection(tilemap, selection);
    expect(Array.from(cut.clipboard.tiles)).toEqual(Array.from(tilemap.tiles));
    expect(Array.from(cut.tilemap.tiles)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(Array.from(tilemap.tiles)).toEqual([
      (1 | tileFlipX) >>> 0, 0, (2 | tileFlipDiagonal) >>> 0,
      (3 | tileFlipY) >>> 0, 0, (4 | tileFlipX | tileFlipY) >>> 0,
    ]);
  });

  it("pastes tile clipboards with clipping and selectable empty-cell overwrite", () => {
    const target = createTilemapData(3, 2);
    target.tiles.set([11, 12, 13, 14, 15, 16]);
    const clipboard = {
      width: 2,
      height: 2,
      tiles: new Uint32Array([0, 20 | tileFlipX, 21 | tileFlipY, 0]),
    };

    const overwritten = pasteTilemapClipboard(target, clipboard, {x: 1, y: 0});
    expect(Array.from(overwritten.tilemap.tiles)).toEqual([11, 0, 20 | tileFlipX, 14, 21 | tileFlipY, 0].map((value) => value >>> 0));

    const skipped = pasteTilemapClipboard(target, clipboard, {x: 1, y: 0}, {emptyMode: "skip"});
    expect(Array.from(skipped.tilemap.tiles)).toEqual([11, 12, 20 | tileFlipX, 14, 21 | tileFlipY, 16].map((value) => value >>> 0));
    expect(Array.from(target.tiles)).toEqual([11, 12, 13, 14, 15, 16]);
    expect(() => pasteTilemapClipboard(target, clipboard, {x: 2, y: 1}, {clip: false})).toThrow(/outside/);
  });

  it("moves from a snapshot so overlapping source and destination cells are preserved", () => {
    const tilemap = createTilemapData(5, 1);
    tilemap.tiles.set([1, 2, 3, 4, 5]);

    const moved = moveTilemapSelection(tilemap, {x: 0, y: 0, width: 3, height: 1}, {x: 2, y: 0});
    expect(Array.from(moved.tilemap.tiles)).toEqual([0, 0, 1, 2, 3]);
    expect(moved.changedCells).toEqual([
      {x: 0, y: 0}, {x: 1, y: 0}, {x: 2, y: 0}, {x: 3, y: 0}, {x: 4, y: 0},
    ]);
    expect(Array.from(tilemap.tiles)).toEqual([1, 2, 3, 4, 5]);
  });

  it("flips and rotates selected tile contents while retaining legal flags", () => {
    const tilemap = createTilemapData(2, 2);
    tilemap.tiles.set([1, 2 | tileFlipX, 3 | tileFlipY, 4 | tileFlipDiagonal]);
    const selection = {x: 0, y: 0, width: 2, height: 2};
    const stamp = createTileStamp(tilemap, selection, {tileWidth: 2, tileHeight: 2});

    const horizontal = flipTilemapSelection(tilemap, selection, "horizontal", {tileWidth: 2, tileHeight: 2});
    expect(Array.from(horizontal.tilemap.tiles)).toEqual(Array.from(flipTileStamp(stamp, "horizontal").tiles));

    const vertical = flipTilemapSelection(tilemap, selection, "vertical", {tileWidth: 2, tileHeight: 2});
    expect(Array.from(vertical.tilemap.tiles)).toEqual(Array.from(flipTileStamp(stamp, "vertical").tiles));

    const clockwise = rotateTilemapSelection(tilemap, selection, "clockwise", {tileWidth: 2, tileHeight: 2});
    expect(Array.from(clockwise.tilemap.tiles)).toEqual(Array.from(rotateTileStamp(stamp, "clockwise").tiles));

    const counterclockwise = rotateTilemapSelection(tilemap, selection, "counterclockwise", {tileWidth: 2, tileHeight: 2});
    expect(Array.from(counterclockwise.tilemap.tiles)).toEqual(Array.from(rotateTileStamp(stamp, "counterclockwise").tiles));
    expect(Array.from(tilemap.tiles)).toEqual([1, 2 | tileFlipX, 3 | tileFlipY, 4 | tileFlipDiagonal].map((value) => value >>> 0));
  });

  it("rejects invalid selections and non-square quarter-turn transforms", () => {
    const tilemap = createTilemapData(2, 1);
    tilemap.tiles.set([1, 2]);

    expect(() => normalizeTilemapSelection({x: 0, y: 0, width: 0, height: 1})).toThrow(/non-zero/);
    expect(() => createTilemapSelection(tilemap, {x: 0.5, y: 0}, {x: 1, y: 0})).toThrow(/integer/);
    expect(() => flipTilemapSelection(tilemap, {x: 0, y: 0, width: 2, height: 1}, "diagonal", {tileWidth: 2, tileHeight: 1})).toThrow(/square/);
    expect(() => rotateTilemapSelection(tilemap, {x: 0, y: 0, width: 2, height: 1}, "clockwise", {tileWidth: 2, tileHeight: 1})).toThrow(/square/);
    expect(() => rotateTilemapSelection(tilemap, {x: 0, y: 0, width: 2, height: 1}, "clockwise")).toThrow(/dimensions/);
  });
});

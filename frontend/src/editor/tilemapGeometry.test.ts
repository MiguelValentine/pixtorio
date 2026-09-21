import {describe, expect, it} from "vitest";
import {createTilemapData, createTileset} from "./tilemap";
import type {TilesetGrid} from "./document";
import {cellPolygon} from "./tileGrid";
import {
  tileCellImageOrigin,
  tilemapPixelSize,
  tilesetGridLayout,
} from "./tilemapGeometry";

type HexagonalGrid = Extract<TilesetGrid, {kind: "hexagonal"}>;

const hexagonalGrids: HexagonalGrid[] = [
  {kind: "hexagonal", orientation: "pointy", offset: "odd-r"},
  {kind: "hexagonal", orientation: "pointy", offset: "even-r"},
  {kind: "hexagonal", orientation: "flat", offset: "odd-q"},
  {kind: "hexagonal", orientation: "flat", offset: "even-q"},
];

const sizes = [1, 2, 3, 5] as const;

const expectedPixelSizes = {
  pointy: {
    1: {width: 8, height: 6},
    2: {width: 20, height: 11},
    3: {width: 28, height: 15},
    5: {width: 44, height: 24},
  },
  flat: {
    1: {width: 8, height: 6},
    2: {width: 14, height: 15},
    3: {width: 20, height: 21},
    5: {width: 32, height: 33},
  },
} as const;

describe("hexagonal tilemap geometry", () => {
  it.each(hexagonalGrids.map((grid) => ({name: `${grid.orientation} ${grid.offset}`, grid})))
    ("contains every $name cell in 1/2/3/5-sized pixel bounds", ({name, grid}) => {
      for (const size of sizes) {
        const tileset = createTileset({tileWidth: 8, tileHeight: 6, grid});
        const tilemap = createTilemapData(size, size);
        const pixelSize = tilemapPixelSize(tileset, size, size);
        const layout = tilesetGridLayout(tileset, size, size);
        const epsilon = 1e-9;
        expect(pixelSize).toEqual(expectedPixelSizes[grid.orientation][size]);

        for (let row = 0; row < size; row += 1) {
          for (let column = 0; column < size; column += 1) {
            const cell = {column, row};
            const imageOrigin = tileCellImageOrigin(tileset, tilemap, cell);
            expect(imageOrigin.x, `${name} ${size}x${size} image left`).toBeGreaterThanOrEqual(-epsilon);
            expect(imageOrigin.y, `${name} ${size}x${size} image top`).toBeGreaterThanOrEqual(-epsilon);
            expect(imageOrigin.x + tileset.tileWidth, `${name} ${size}x${size} image right`)
              .toBeLessThanOrEqual(pixelSize.width + epsilon);
            expect(imageOrigin.y + tileset.tileHeight, `${name} ${size}x${size} image bottom`)
              .toBeLessThanOrEqual(pixelSize.height + epsilon);

            for (const point of cellPolygon(layout, cell)) {
              expect(point.x, `${name} ${size}x${size} polygon left`).toBeGreaterThanOrEqual(-epsilon);
              expect(point.y, `${name} ${size}x${size} polygon top`).toBeGreaterThanOrEqual(-epsilon);
              expect(point.x, `${name} ${size}x${size} polygon right`).toBeLessThanOrEqual(pixelSize.width + epsilon);
              expect(point.y, `${name} ${size}x${size} polygon bottom`).toBeLessThanOrEqual(pixelSize.height + epsilon);
            }
          }
        }
      }
  });

  it("keeps 512x512 bounds on a constant-size candidate set", () => {
    const size = 512;
    const expected = {
      pointy: {width: 4100, height: 2306},
      flat: {width: 3074, height: 3075},
    } as const;
    for (const grid of hexagonalGrids) {
      const tileset = createTileset({tileWidth: 8, tileHeight: 6, grid});
      const tilemap = createTilemapData(size, size);
      const pixelSize = tilemapPixelSize(tileset, size, size);
      const layout = tilesetGridLayout(tileset, size, size);
      expect(pixelSize).toEqual(expected[grid.orientation]);

      for (const row of [0, 1, size - 2, size - 1]) {
        for (const column of [0, 1, size - 2, size - 1]) {
          const cell = {column, row};
          const origin = tileCellImageOrigin(tileset, tilemap, cell);
          expect(origin.x).toBeGreaterThanOrEqual(0);
          expect(origin.y).toBeGreaterThanOrEqual(0);
          expect(origin.x + tileset.tileWidth).toBeLessThanOrEqual(pixelSize.width);
          expect(origin.y + tileset.tileHeight).toBeLessThanOrEqual(pixelSize.height);
          for (const point of cellPolygon(layout, cell)) {
            expect(point.x).toBeGreaterThanOrEqual(0);
            expect(point.y).toBeGreaterThanOrEqual(0);
            expect(point.x).toBeLessThanOrEqual(pixelSize.width);
            expect(point.y).toBeLessThanOrEqual(pixelSize.height);
          }
        }
      }
    }
  });

  it("uses a valid per-map parity override without mutating the shared Tileset grid", () => {
    const tileset = createTileset({
      tileWidth: 8,
      tileHeight: 6,
      grid: {kind: "hexagonal", orientation: "pointy", offset: "odd-r"},
    });
    const overridden = {...createTilemapData(3, 2), gridOffset: "even-r" as const};
    const evenTileset = createTileset({
      tileWidth: 8,
      tileHeight: 6,
      grid: {kind: "hexagonal", orientation: "pointy", offset: "even-r"},
    });
    expect(tilesetGridLayout(tileset, overridden)).toEqual(tilesetGridLayout(evenTileset, 3, 2));
    expect(tilemapPixelSize(tileset, overridden)).toEqual(tilemapPixelSize(evenTileset, 3, 2));
    expect(tileset.grid).toEqual({kind: "hexagonal", orientation: "pointy", offset: "odd-r"});
    expect(() => tilesetGridLayout(tileset, {...overridden, gridOffset: "odd-q"})).toThrow(/grid offset/);
  });
});

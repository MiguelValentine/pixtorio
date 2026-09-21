import {describe, expect, it} from "vitest";

import {
  cellNeighbors,
  cellPolygon,
  cellToDocument,
  compareCellsForRendering,
  documentToCell,
  expandCellRegion,
  gridLineSegments,
  pointInCell,
  validateTileGridLayout,
  visibleCellRange,
  type TileCell,
  type TileGridLayout,
  type TilePoint,
} from "./tileGrid";

interface GridCase {
  label: string;
  layout: TileGridLayout;
  polygonVertices: number;
  neighborCount: number;
}

const gridCases: GridCase[] = [
  {
    label: "orthogonal",
    layout: {kind: "orthogonal", tileWidth: 16, tileHeight: 10, originX: 7, originY: -5},
    polygonVertices: 4,
    neighborCount: 4,
  },
  {
    label: "isometric",
    layout: {kind: "isometric", tileWidth: 20, tileHeight: 12, originX: 7, originY: -5},
    polygonVertices: 4,
    neighborCount: 4,
  },
  {
    label: "pointy odd-r",
    layout: {
      kind: "hexagonal",
      tileWidth: 18,
      tileHeight: 14,
      originX: 7,
      originY: -5,
      orientation: "pointy",
      offset: "odd-r",
    },
    polygonVertices: 6,
    neighborCount: 6,
  },
  {
    label: "pointy even-r",
    layout: {
      kind: "hexagonal",
      tileWidth: 18,
      tileHeight: 14,
      originX: 7,
      originY: -5,
      orientation: "pointy",
      offset: "even-r",
    },
    polygonVertices: 6,
    neighborCount: 6,
  },
  {
    label: "flat odd-q",
    layout: {
      kind: "hexagonal",
      tileWidth: 18,
      tileHeight: 14,
      originX: 7,
      originY: -5,
      orientation: "flat",
      offset: "odd-q",
    },
    polygonVertices: 6,
    neighborCount: 6,
  },
  {
    label: "flat even-q",
    layout: {
      kind: "hexagonal",
      tileWidth: 18,
      tileHeight: 14,
      originX: 7,
      originY: -5,
      orientation: "flat",
      offset: "even-q",
    },
    polygonVertices: 6,
    neighborCount: 6,
  },
];

const testCells: TileCell[] = [
  {column: -3, row: 2},
  {column: 2, row: -4},
  {column: 1, row: -3},
];

function cellCenter(layout: TileGridLayout, cell: TileCell): TilePoint {
  const anchor = cellToDocument(layout, cell);
  if (layout.kind === "hexagonal") return anchor;
  return {
    x: anchor.x + layout.tileWidth / 2,
    y: anchor.y + layout.tileHeight / 2,
  };
}

function cellKey(cell: TileCell) {
  return `${cell.column},${cell.row}`;
}

describe("tile grids", () => {
  it("round-trips cell centers for all grid kinds with negative cells and a non-zero origin", () => {
    for (const {label, layout} of gridCases) {
      for (const cell of testCells) {
        const center = cellCenter(layout, cell);

        expect(documentToCell(layout, center), `${label} ${cellKey(cell)}`).toEqual(cell);
      }
    }
  });

  it("supports every pointy and flat hex offset variant", () => {
    const hexCases = gridCases.filter(({layout}) => layout.kind === "hexagonal");

    expect(hexCases.map(({label}) => label)).toEqual([
      "pointy odd-r",
      "pointy even-r",
      "flat odd-q",
      "flat even-q",
    ]);

    for (const {layout} of hexCases) {
      for (const cell of testCells) {
        expect(documentToCell(layout, cellToDocument(layout, cell))).toEqual(cell);
      }
    }
  });

  it("creates polygons with the expected vertices and hit-tests their centers", () => {
    const cell = {column: -2, row: 3};

    for (const {label, layout, polygonVertices} of gridCases) {
      const polygon = cellPolygon(layout, cell);
      const center = cellCenter(layout, cell);

      expect(polygon, label).toHaveLength(polygonVertices);
      expect(new Set(polygon.map(({x, y}) => `${x},${y}`)).size).toBe(polygonVertices);
      expect(pointInCell(layout, cell, center)).toBe(true);
      expect(pointInCell(layout, cell, polygon[0])).toBe(true);
      expect(pointInCell(layout, cell, {
        x: center.x + layout.tileWidth,
        y: center.y + layout.tileHeight,
      })).toBe(false);
    }
  });

  it("returns the expected number of unique neighbors for each grid kind", () => {
    const cell = {column: -3, row: 2};

    for (const {label, layout, neighborCount} of gridCases) {
      const neighbors = cellNeighbors(layout, cell);

      expect(neighbors, label).toHaveLength(neighborCount);
      expect(new Set(neighbors.map(cellKey)).size).toBe(neighborCount);
      expect(neighbors).not.toContainEqual(cell);
    }
  });

  it("rejects invalid hex orientations and incompatible offsets", () => {
    const base = {
      kind: "hexagonal" as const,
      tileWidth: 18,
      tileHeight: 14,
      originX: 7,
      originY: -5,
    };

    expect(() => validateTileGridLayout({
      ...base,
      orientation: "diagonal" as never,
      offset: "odd-r",
    })).toThrow("Hexagonal orientation must be pointy or flat");

    expect(() => validateTileGridLayout({
      ...base,
      orientation: "pointy",
      offset: "odd-q" as never,
    })).toThrow("Pointy hexagonal grids require odd-r or even-r offset");

    expect(() => validateTileGridLayout({
      ...base,
      orientation: "flat",
      offset: "odd-r" as never,
    })).toThrow("Flat hexagonal grids require odd-q or even-q offset");
  });

  it("includes the cell at the visible bounds center in every visible cell range", () => {
    const cell = {column: -2, row: 3};

    for (const {label, layout} of gridCases) {
      const center = cellCenter(layout, cell);
      const bounds = {x: center.x - 0.25, y: center.y - 0.25, width: 0.5, height: 0.5};
      const visibleCenterCell = documentToCell(layout, {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
      });
      const range = visibleCellRange(layout, bounds);

      expect(visibleCenterCell, label).toEqual(cell);
      expect(range.minColumn).toBeLessThanOrEqual(visibleCenterCell.column);
      expect(range.maxColumn).toBeGreaterThanOrEqual(visibleCenterCell.column);
      expect(range.minRow).toBeLessThanOrEqual(visibleCenterCell.row);
      expect(range.maxRow).toBeGreaterThanOrEqual(visibleCenterCell.row);
    }
  });

  it("expands cell regions by native edge neighbors", () => {
    const center = [{column: 0, row: 0}];
    const orthogonal = gridCases[0].layout;
    const pointyHex = gridCases[2].layout;

    expect(expandCellRegion(orthogonal, center, 0)).toEqual(center);
    expect(expandCellRegion(orthogonal, center, 1)).toHaveLength(5);
    expect(expandCellRegion(pointyHex, center, 1)).toHaveLength(7);
    expect(expandCellRegion(pointyHex, center, 2)).toHaveLength(19);
    expect(() => expandCellRegion(orthogonal, center, -1)).toThrow("non-negative integer");
  });

  it("deduplicates shared grid edges and provides stable rendering order", () => {
    const single = {minColumn: 0, minRow: 0, maxColumn: 0, maxRow: 0};
    const horizontalPair = {minColumn: 0, minRow: 0, maxColumn: 1, maxRow: 0};
    const orthogonal = gridCases[0].layout;
    const isometric = gridCases[1].layout;
    const pointyHex = gridCases[2].layout;

    expect(gridLineSegments(orthogonal, single)).toHaveLength(4);
    expect(gridLineSegments(orthogonal, horizontalPair)).toHaveLength(7);
    expect(gridLineSegments(isometric, horizontalPair)).toHaveLength(7);
    expect(gridLineSegments(pointyHex, horizontalPair)).toHaveLength(11);

    const cells = [{column: 0, row: 1}, {column: 1, row: 0}, {column: 0, row: 0}];
    expect([...cells].sort((left, right) => compareCellsForRendering(isometric, left, right))).toEqual([
      {column: 0, row: 0},
      {column: 1, row: 0},
      {column: 0, row: 1},
    ]);
  });
});

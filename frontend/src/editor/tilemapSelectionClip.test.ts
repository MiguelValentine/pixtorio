import {describe, expect, it} from "vitest";

import {createTileset} from "./tilemap";
import {cellPolygon, cellToDocument} from "./tileGrid";
import {tilesetGridLayout} from "./tilemapGeometry";
import {createTilemapSelectionPredicate} from "./tilemapSelectionClip";
import {selectionCoverageAt, type Selection} from "./selection";

function singlePixelSelection(x: number, y: number): Selection {
  return {x, y, width: 1, height: 1};
}

function polygonCentroid(polygon: readonly {x: number; y: number}[]) {
  let twiceArea = 0;
  let centroidX = 0;
  let centroidY = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const cross = current.x * next.y - next.x * current.y;
    twiceArea += cross;
    centroidX += (current.x + next.x) * cross;
    centroidY += (current.y + next.y) * cross;
  }
  if (twiceArea === 0) throw new Error("Polygon has no area");
  return {x: centroidX / (3 * twiceArea), y: centroidY / (3 * twiceArea)};
}

describe("tilemap selection predicate", () => {
  it("uses the orthogonal cell center and reuses the predicate for multiple cells", () => {
    const tileset = createTileset({tileWidth: 4, tileHeight: 4});
    const predicate = createTilemapSelectionPredicate(singlePixelSelection(2, 2), tileset, 2, 1);

    expect(predicate({column: 0, row: 0})).toBe(true);
    expect(predicate({column: 1, row: 0})).toBe(false);
    expect(createTilemapSelectionPredicate(singlePixelSelection(0, 0), tileset, 2, 1)({column: 0, row: 0})).toBe(false);
  });

  it("uses the isometric polygon centroid instead of the bottom vertex", () => {
    const tileset = createTileset({
      tileWidth: 8,
      tileHeight: 8,
      grid: {kind: "isometric", cellWidth: 8, cellHeight: 4, anchorX: 0, anchorY: 0},
    });
    const layout = tilesetGridLayout(tileset, 1, 1);
    const cell = {column: 0, row: 0};
    const polygon = cellPolygon(layout, cell);
    const centroid = polygonCentroid(polygon);
    const bottomVertex = polygon.reduce((bottom, point) => point.y > bottom.y ? point : bottom, polygon[0]);

    expect(createTilemapSelectionPredicate(singlePixelSelection(centroid.x, centroid.y), tileset, 1, 1)(cell)).toBe(true);
    expect(createTilemapSelectionPredicate(singlePixelSelection(bottomVertex.x, bottomVertex.y), tileset, 1, 1)(cell)).toBe(false);
  });

  it.each([
    ["pointy odd-r", {kind: "hexagonal", orientation: "pointy", offset: "odd-r"}],
    ["pointy even-r", {kind: "hexagonal", orientation: "pointy", offset: "even-r"}],
    ["flat odd-q", {kind: "hexagonal", orientation: "flat", offset: "odd-q"}],
    ["flat even-q", {kind: "hexagonal", orientation: "flat", offset: "even-q"}],
  ] as const)("uses the logical center for %s", (_label, grid) => {
    const tileset = createTileset({tileWidth: 8, tileHeight: 6, grid});
    const layout = tilesetGridLayout(tileset, 3, 3);
    const cell = {column: 1, row: 1};
    const center = cellToDocument(layout, cell);
    const predicate = createTilemapSelectionPredicate(singlePixelSelection(center.x, center.y), tileset, 3, 3);

    expect(predicate(cell)).toBe(true);
  });

  it("adds the Cel document offset before checking the pixel selection", () => {
    const tileset = createTileset({tileWidth: 4, tileHeight: 4});
    const predicate = createTilemapSelectionPredicate(singlePixelSelection(12, -1), tileset, 1, 1, {
      celX: 10,
      celY: -3,
    });

    expect(predicate({column: 0, row: 0})).toBe(true);
    expect(createTilemapSelectionPredicate(singlePixelSelection(12, -1), tileset, 1, 1)({column: 0, row: 0})).toBe(false);
  });

  it("treats any positive mask coverage as selected and zero coverage as clipped", () => {
    const tileset = createTileset({tileWidth: 2, tileHeight: 2});
    const selection: Selection = {x: 1, y: 1, width: 2, height: 1, mask: Uint8Array.from([1, 0])};
    const predicate = createTilemapSelectionPredicate(selection, tileset, 2, 1);

    expect(predicate({column: 0, row: 0})).toBe(true);
    expect(predicate({column: 1, row: 0})).toBe(false);
  });

  it("floors fractional coordinates before indexing a selection mask", () => {
    const selection: Selection = {x: 10, y: 20, width: 2, height: 1, mask: Uint8Array.from([0, 255])};

    expect(selectionCoverageAt(selection, 10.75, 20.25)).toBe(0);
    expect(selectionCoverageAt(selection, 11.75, 20.25)).toBe(255);
  });

  it("allows every in-map cell without a pixel selection and rejects out-of-map cells", () => {
    const tileset = createTileset({tileWidth: 4, tileHeight: 4});
    const predicate = createTilemapSelectionPredicate(null, tileset, 2, 2);

    expect(predicate({column: 0, row: 0})).toBe(true);
    expect(predicate({column: 1, row: 1})).toBe(true);
    expect(predicate({column: -1, row: 0})).toBe(false);
    expect(predicate({column: 2, row: 0})).toBe(false);
    expect(predicate({column: 0, row: 2})).toBe(false);
  });

  it("clips cells whose logical point is outside a selection without throwing", () => {
    const tileset = createTileset({tileWidth: 4, tileHeight: 4});
    const predicate = createTilemapSelectionPredicate({x: -20, y: -20, width: 1, height: 1}, tileset, 1, 1);

    expect(predicate({column: 0, row: 0})).toBe(false);
  });
});

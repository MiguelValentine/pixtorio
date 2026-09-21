import {describe, expect, it} from "vitest";

import type {TerrainNeighborMode} from "./terrain";
import {getTerrainMaskGeometry} from "./terrainMaskGeometry";
import type {HexOrientation, TileGridKind, TilePoint} from "./tileGrid";

type TerrainMaskGeometry = ReturnType<typeof getTerrainMaskGeometry>;

const epsilon = 1e-8;

function centroid(points: readonly TilePoint[]): TilePoint {
  return {
    x: points.reduce((total, point) => total + point.x, 0) / points.length,
    y: points.reduce((total, point) => total + point.y, 0) / points.length,
  };
}

function pointKey(point: TilePoint) {
  return `${round(point.x)},${round(point.y)}`;
}

function round(value: number) {
  return Math.round(value * 1e8) / 1e8;
}

function hasPoint(points: readonly TilePoint[], target: TilePoint) {
  return points.some((point) => Math.abs(point.x - target.x) <= epsilon && Math.abs(point.y - target.y) <= epsilon);
}

function sharedPoints(left: readonly TilePoint[], right: readonly TilePoint[]) {
  return left.filter((point) => hasPoint(right, point)).length;
}

function edgeLengths(points: readonly TilePoint[]) {
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    return Math.hypot(next.x - point.x, next.y - point.y);
  });
}

function expectSameNumbers(actual: readonly number[], expected: readonly number[], label: string) {
  expect(actual, label).toHaveLength(expected.length);
  actual.forEach((value, index) => expect(value, `${label} ${index}`).toBeCloseTo(expected[index], 8));
}

function expectBounds(geometry: TerrainMaskGeometry) {
  const points = [
    ...geometry.center,
    ...geometry.entries.flatMap((entry) => entry.polygon),
    ...geometry.corners.map((corner) => corner.point),
  ];
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));

  expect(minX).toBeCloseTo(0, 8);
  expect(minY).toBeCloseTo(0, 8);
  expect(maxX).toBeCloseTo(geometry.width, 8);
  expect(maxY).toBeCloseTo(geometry.height, 8);
  for (const point of points) {
    expect(point.x).toBeGreaterThanOrEqual(-epsilon);
    expect(point.y).toBeGreaterThanOrEqual(-epsilon);
    expect(point.x).toBeLessThanOrEqual(geometry.width + epsilon);
    expect(point.y).toBeLessThanOrEqual(geometry.height + epsilon);
  }
}

function expectOppositeSymmetry(
  geometry: TerrainMaskGeometry,
  pairs: readonly (readonly [number, number])[],
) {
  const center = centroid(geometry.center);
  const entries = new Map(geometry.entries.map((entry) => [entry.bit, entry]));
  for (const [leftBit, rightBit] of pairs) {
    const left = entries.get(leftBit);
    const right = entries.get(rightBit);
    expect(left, `missing bit ${leftBit}`).toBeDefined();
    expect(right, `missing bit ${rightBit}`).toBeDefined();
    const reflected = left!.polygon.map((point) => ({
      x: 2 * center.x - point.x,
      y: 2 * center.y - point.y,
    }));
    expect(new Set(right!.polygon.map(pointKey))).toEqual(new Set(reflected.map(pointKey)));
  }
}

function expectEntryGeometry(geometry: TerrainMaskGeometry, vertexCount: number) {
  expect(geometry.center).toHaveLength(vertexCount);
  expect(new Set(geometry.center.map(pointKey)).size).toBe(vertexCount);
  const centerLengths = edgeLengths(geometry.center);
  for (const entry of geometry.entries) {
    expect(entry.polygon).toHaveLength(vertexCount);
    expect(new Set(entry.polygon.map(pointKey)).size).toBe(vertexCount);
    expectSameNumbers(edgeLengths(entry.polygon), centerLengths, `${entry.label} edge lengths`);
  }
  expectBounds(geometry);
}

function expectLabelPositions(
  geometry: TerrainMaskGeometry,
  expectedSigns: Readonly<Record<string, readonly [number, number]>>,
) {
  const center = centroid(geometry.center);
  for (const entry of geometry.entries) {
    const point = centroid(entry.polygon);
    const [xSign, ySign] = expectedSigns[entry.label];
    if (xSign !== 0) expect(Math.sign(point.x - center.x), entry.label).toBe(xSign);
    if (ySign !== 0) expect(Math.sign(point.y - center.y), entry.label).toBe(ySign);
  }
}

describe("terrain mask geometry", () => {
  it.each([
    ["edge4", "orthogonal", undefined, ["N", "E", "S", "W"], 4],
    ["edge4", "isometric", undefined, ["N", "E", "S", "W"], 4],
    ["blob8", "orthogonal", undefined, ["N", "NE", "E", "SE", "S", "SW", "W", "NW"], 8],
    ["edge6", "hexagonal", "pointy", ["E", "NE", "NW", "W", "SW", "SE"], 6],
    ["edge6", "hexagonal", "flat", ["SE", "NE", "N", "NW", "SW", "S"], 6],
  ] as const)("returns unique %s bits and logical labels for %s %s", (mode, gridKind, orientation, labels, count) => {
    const geometry = getTerrainMaskGeometry(
      mode as TerrainNeighborMode,
      gridKind as TileGridKind,
      orientation as HexOrientation | undefined,
    );
    expect(geometry.entries).toHaveLength(count);
    expect(geometry.entries.map((entry) => entry.bit)).toEqual(Array.from({length: count}, (_value, index) => index));
    expect(new Set(geometry.entries.map((entry) => entry.bit)).size).toBe(count);
    expect(geometry.entries.map((entry) => entry.label)).toEqual(labels);
    expect(geometry.width).toBeGreaterThan(0);
    expect(geometry.height).toBeGreaterThan(0);
    expectEntryGeometry(geometry, count === 6 ? 6 : 4);
  });

  it("places isometric edge4 entries diagonally while preserving logical labels", () => {
    const geometry = getTerrainMaskGeometry("edge4", "isometric");
    expectLabelPositions(geometry, {
      N: [1, -1],
      E: [1, 1],
      S: [-1, 1],
      W: [-1, -1],
    });
    expectOppositeSymmetry(geometry, [[0, 2], [1, 3]]);
  });

  it("keeps flat-hex north/south labels vertically ordered in actual geometry", () => {
    const geometry = getTerrainMaskGeometry("edge6", "hexagonal", "flat");
    expectLabelPositions(geometry, {
      SE: [1, 1],
      NE: [1, -1],
      N: [0, -1],
      NW: [-1, -1],
      SW: [-1, 1],
      S: [0, 1],
    });
    expectOppositeSymmetry(geometry, [[0, 3], [1, 4], [2, 5]]);
  });

  it.each([
    ["pointy", [[1, 2], [0, 1], [0, 5], [4, 5], [3, 4], [2, 3]]],
    ["flat", [[0, 1], [0, 5], [4, 5], [3, 4], [2, 3], [1, 2]]],
  ] as const)("maps %s hex vertices to adjacent neighbor bits and shared geometry", (orientation, expectedPairs) => {
    const geometry = getTerrainMaskGeometry("edge6", "hexagonal", orientation);
    const entries = new Map(geometry.entries.map((entry) => [entry.bit, entry]));
    expect(geometry.corners).toHaveLength(6);

    for (const [index, expected] of expectedPairs.entries()) {
      const point = geometry.center[index];
      const corner = geometry.corners.find((candidate) => hasPoint([candidate.point], point));
      expect(corner, `center vertex ${index}`).toBeDefined();
      expect(new Set(corner!.bits)).toEqual(new Set(expected));
      expect(corner!.bits).toHaveLength(2);
      const first = entries.get(expected[0]);
      const second = entries.get(expected[1]);
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      expect(hasPoint(first!.polygon, point)).toBe(true);
      expect(hasPoint(second!.polygon, point)).toBe(true);
      expect(sharedPoints(geometry.center, first!.polygon)).toBeGreaterThanOrEqual(2);
      expect(sharedPoints(geometry.center, second!.polygon)).toBeGreaterThanOrEqual(2);
      expect(sharedPoints(first!.polygon, second!.polygon)).toBeGreaterThanOrEqual(2);
    }
  });

  it("uses no corners for square grids and keeps opposite edge4 pairs symmetric", () => {
    for (const gridKind of ["orthogonal", "isometric"] as const) {
      const geometry = getTerrainMaskGeometry("edge4", gridKind);
      expect(geometry.corners).toEqual([]);
      expectOppositeSymmetry(geometry, [[0, 2], [1, 3]]);
    }
  });
});

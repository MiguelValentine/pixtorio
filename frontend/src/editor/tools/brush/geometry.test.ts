import {describe, expect, it} from "vitest";

import {
  createBitmapBrush,
  createShapeBitmapBrush,
  drawSpacedStroke,
  rotateBitmapBrush,
  simplifyPixelPerfectStroke,
} from "./geometry";

describe("brush geometry", () => {
  it("normalizes bitmap masks and rotates around the anchor", () => {
    const brush = createBitmapBrush([
      [1, 0],
      [0, 1],
      [1, 1],
    ], {x: 0, y: 1});
    const rotated = rotateBitmapBrush(brush, 90);

    expect(rotated).toMatchObject({width: 3, height: 2, anchorX: 1, anchorY: 0});
    expect(Array.from(rotated.mask)).toEqual([1, 0, 1, 1, 1, 0]);
  });

  it("creates the same pixel-art shape masks used by the brush rasterizer", () => {
    const diamond = createShapeBitmapBrush("diamond", 5);
    expect(Array.from(diamond.mask).reduce((sum, value) => sum + value, 0)).toBe(13);
  });

  it("shares endpoint-preserving spacing for stamp kernels", () => {
    const stamps: Array<{x: number; y: number}> = [];
    const changed = drawSpacedStroke([{x: 0, y: 0}, {x: 5, y: 0}], 2, (point) => {
      stamps.push(point);
      return 1;
    });

    expect(changed).toBe(4);
    expect(stamps).toEqual([{x: 0, y: 0}, {x: 2, y: 0}, {x: 4, y: 0}, {x: 5, y: 0}]);
  });

  it("removes duplicate and collinear points for pixel-perfect strokes", () => {
    expect(simplifyPixelPerfectStroke([
      {x: 0, y: 0}, {x: 0, y: 0}, {x: 1, y: 0}, {x: 2, y: 0}, {x: 3, y: 1},
    ])).toEqual([{x: 0, y: 0}, {x: 2, y: 0}, {x: 3, y: 1}]);
  });
});

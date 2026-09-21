import {describe, expect, it} from "vitest";
import {accumulateWheelZoom, canvasLocalPoint, findCanvasContextTarget, wrapTiledPoint} from "./PixelCanvas";

describe("canvas pointer coordinates", () => {
  it.each([0.75, 1, 1.25, 1.5, 1.75, 2])("undoes %s CSS zoom for drawing and wheel anchors", (scale) => {
    const surface = {width: 800, height: 600};
    const rect = {left: 48 * scale, top: 44 * scale, width: surface.width * scale, height: surface.height * scale};
    expect(canvasLocalPoint({clientX: rect.left + 120 * scale, clientY: rect.top + 90 * scale}, rect, surface))
      .toEqual({x: 120, y: 90});
  });

  it("retains off-canvas positions during pointer-captured gestures", () => {
    expect(canvasLocalPoint(
      {clientX: 10, clientY: 500},
      {left: 50, top: 40, width: 400, height: 300},
      {width: 200, height: 150},
    )).toEqual({x: -20, y: 230});
  });

  it("preserves fractional coordinates until document-pixel conversion", () => {
    expect(canvasLocalPoint(
      {clientX: 201, clientY: 151},
      {left: 0, top: 0, width: 400, height: 300},
      {width: 200, height: 150},
    )).toEqual({x: 100.5, y: 75.5});
  });

  it("wraps tilemap editing across enabled tiled-preview axes", () => {
    expect(wrapTiledPoint({x: -1, y: 5}, 8, 6, true, false)).toEqual({x: 7, y: 5});
    expect(wrapTiledPoint({x: 9, y: -2}, 8, 6, true, true)).toEqual({x: 1, y: 4});
    expect(wrapTiledPoint({x: 9, y: 2}, 8, 6, false, true)).toBeNull();
  });
});

describe("wheel zoom accumulation", () => {
  it("accumulates MacIntel upward wheel input over four events", () => {
    let accumulator = 0;
    for (let index = 0; index < 3; index += 1) {
      const result = accumulateWheelZoom(-1, accumulator, "MacIntel");
      expect(result.step).toBe(0);
      accumulator = result.remainder;
    }

    expect(accumulateWheelZoom(-1, accumulator, "MacIntel")).toEqual({step: 1, remainder: 0});
  });

  it("accumulates MacIntel downward wheel input over four events", () => {
    let accumulator = 0;
    for (let index = 0; index < 3; index += 1) {
      const result = accumulateWheelZoom(1, accumulator, "MacIntel");
      expect(result.step).toBe(0);
      accumulator = result.remainder;
    }

    expect(accumulateWheelZoom(1, accumulator, "MacIntel")).toEqual({step: -1, remainder: 0});
  });

  it("clears the old MacIntel accumulation when the direction reverses", () => {
    let accumulator = 0;
    for (let index = 0; index < 3; index += 1) {
      accumulator = accumulateWheelZoom(-1, accumulator, "MacIntel").remainder;
    }

    expect(accumulateWheelZoom(1, accumulator, "MacIntel")).toEqual({step: 0, remainder: -0.25});
  });

  it.each([
    [-1, 1],
    [1, -1],
  ])("steps immediately on Win32 for deltaY=%s", (deltaY, step) => {
    expect(accumulateWheelZoom(deltaY, 0, "Win32")).toEqual({step, remainder: 0});
  });
});

describe("canvas context target hit testing", () => {
  const slices = [
    {id: "first", x: 2, y: 2, width: 8, height: 8},
    {id: "second", x: 4, y: 4, width: 8, height: 8},
  ];
  const guides = [
    {id: "vertical-guide", axis: "vertical" as const, position: 6},
    {id: "horizontal-guide", axis: "horizontal" as const, position: 7},
  ];

  it("prefers the ordered slice overlay over a guide at the same point", () => {
    expect(findCanvasContextTarget(
      {x: 6, y: 6},
      {x: 34, y: 44},
      slices,
      guides,
      "first",
      {x: 10, y: 20},
      4,
    )).toEqual({kind: "slice", id: "first"});
  });

  it("uses the active slice ordering for overlapping rectangles", () => {
    expect(findCanvasContextTarget(
      {x: 6, y: 6},
      {x: 0, y: 0},
      slices,
      [],
      "second",
      {x: 0, y: 0},
      1,
    )).toEqual({kind: "slice", id: "second"});
  });

  it("checks guides with the existing five-pixel screen tolerance", () => {
    expect(findCanvasContextTarget(
      {x: 20, y: 0},
      {x: 35, y: 100},
      [],
      guides,
      "",
      {x: 10, y: 20},
      4,
    )).toEqual({kind: "guide", id: "vertical-guide", axis: "vertical"});
    expect(findCanvasContextTarget(
      {x: 0, y: 0},
      {x: 100, y: 54},
      [],
      guides,
      "",
      {x: 10, y: 20},
      4,
    )).toBeNull();
  });

  it("receives the unsnapped document point", () => {
    expect(findCanvasContextTarget(
      {x: 3, y: 3},
      {x: 0, y: 0},
      [{id: "unsnapped", x: 3, y: 3, width: 1, height: 1}],
      [],
      "",
      {x: 0, y: 0},
      1,
    )).toEqual({kind: "slice", id: "unsnapped"});
  });
});

import {describe, expect, it} from "vitest";
import {accumulateWheelZoom, canvasLocalPoint} from "./PixelCanvas";

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

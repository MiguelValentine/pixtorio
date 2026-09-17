import {describe, expect, it} from "vitest";
import {applyPixelAspectRatio, normalizePixelAspectRatio, resizePixels} from "./pixelAspectRatio";

describe("pixel aspect ratio export scaling", () => {
  it("reduces equivalent ratios before expansion", () => {
    expect(normalizePixelAspectRatio({width: 2, height: 2})).toEqual({width: 1, height: 1});
    expect(normalizePixelAspectRatio({width: 6, height: 4})).toEqual({width: 3, height: 2});
  });

  it("expands each source pixel without interpolation", () => {
    const source = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 128,
    ]);
    const result = applyPixelAspectRatio(2, 1, source, {width: 2, height: 1});
    expect(result.width).toBe(4);
    expect(result.height).toBe(1);
    expect(Array.from(result.pixels)).toEqual([
      255, 0, 0, 255, 255, 0, 0, 255,
      0, 255, 0, 128, 0, 255, 0, 128,
    ]);
  });

  it("supports tall pixels and rejects invalid buffers", () => {
    const result = applyPixelAspectRatio(1, 1, new Uint8ClampedArray([1, 2, 3, 4]), {width: 1, height: 2});
    expect(result.width).toBe(1);
    expect(result.height).toBe(2);
    expect(Array.from(result.pixels)).toEqual([1, 2, 3, 4, 1, 2, 3, 4]);
    expect(() => resizePixels(1, 1, new Uint8ClampedArray(3), 1, 1)).toThrow("pixel buffer");
  });
});

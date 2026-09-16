import {describe, expect, it} from "vitest";

import {applyPatch, createPatch, drawLine, hexToRGBA, rgbaToHex, setPixel} from "./pixels";

const RED: readonly [number, number, number, number] = [255, 32, 48, 255];
const BLUE: readonly [number, number, number, number] = [32, 96, 255, 192];

function pixelAt(pixels: Uint8ClampedArray, width: number, x: number, y: number) {
  const index = (y * width + x) * 4;
  return Array.from(pixels.subarray(index, index + 4));
}

function changedCoordinates(pixels: Uint8ClampedArray, width: number, height: number) {
  const coordinates: Array<[number, number]> = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] !== 0) {
        coordinates.push([x, y]);
      }
    }
  }
  return coordinates;
}

describe("setPixel", () => {
  it("writes the requested color at an in-bounds coordinate", () => {
    const pixels = new Uint8ClampedArray(3 * 2 * 4);

    setPixel(pixels, 3, 2, 1, 0, RED);

    expect(pixelAt(pixels, 3, 1, 0)).toEqual([...RED]);
    expect(pixelAt(pixels, 3, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(pixels, 3, 2, 1)).toEqual([0, 0, 0, 0]);
  });

  it("ignores coordinates outside every canvas edge", () => {
    const pixels = new Uint8ClampedArray(3 * 2 * 4).fill(17);
    const initial = Array.from(pixels);

    for (const [x, y] of [[-1, 0], [3, 0], [0, -1], [0, 2]] as const) {
      setPixel(pixels, 3, 2, x, y, RED);
    }

    expect(Array.from(pixels)).toEqual(initial);
  });
});

describe("drawLine", () => {
  it("rasterizes a shallow line continuously from start to end", () => {
    const pixels = new Uint8ClampedArray(8 * 8 * 4);

    drawLine(pixels, 8, 8, 1, 1, 6, 4, RED);

    expect(changedCoordinates(pixels, 8, 8)).toEqual([
      [1, 1],
      [2, 2],
      [3, 2],
      [4, 3],
      [5, 3],
      [6, 4],
    ]);
  });

  it("handles vertical and steep lines without gaps", () => {
    const pixels = new Uint8ClampedArray(8 * 8 * 4);

    drawLine(pixels, 8, 8, 2, 0, 2, 6, RED);
    expect(changedCoordinates(pixels, 8, 8)).toEqual([
      [2, 0],
      [2, 1],
      [2, 2],
      [2, 3],
      [2, 4],
      [2, 5],
      [2, 6],
    ]);

    const steep = new Uint8ClampedArray(8 * 8 * 4);
    drawLine(steep, 8, 8, 2, 0, 4, 6, BLUE);
    expect(changedCoordinates(steep, 8, 8)).toEqual([
      [2, 0],
      [2, 1],
      [3, 2],
      [3, 3],
      [3, 4],
      [4, 5],
      [4, 6],
    ]);
  });
});

describe("createPatch", () => {
  it("returns null when two pixel buffers are identical", () => {
    const before = new Uint8ClampedArray(4 * 3 * 4);

    expect(createPatch(before, before.slice(), 4, 3)).toBeNull();
  });

  it("captures the smallest dirty rectangle and its before/after data", () => {
    const before = new Uint8ClampedArray(5 * 4 * 4);
    const after = before.slice();
    setPixel(after, 5, 4, 1, 1, RED);
    setPixel(after, 5, 4, 3, 2, BLUE);

    const patch = createPatch(before, after, 5, 4);

    expect(patch).not.toBeNull();
    if (patch === null) return;
    expect(patch).toMatchObject({x: 1, y: 1, width: 3, height: 2});
    expect(Array.from(patch.before)).toEqual(new Array(3 * 2 * 4).fill(0));

    const expectedAfter = new Uint8ClampedArray(3 * 2 * 4);
    expectedAfter.set(RED, 0);
    expectedAfter.set(BLUE, 5 * 4);
    expect(Array.from(patch.after)).toEqual(Array.from(expectedAfter));
  });
});

describe("applyPatch", () => {
  it("restores a dirty region for undo and reapplies it for redo", () => {
    const width = 5;
    const height = 4;
    const before = Uint8ClampedArray.from(
      {length: width * height * 4},
      (_, index) => (index * 13) % 256,
    );
    const after = before.slice();
    setPixel(after, width, height, 1, 1, RED);
    setPixel(after, width, height, 3, 2, BLUE);
    const patch = createPatch(before, after, width, height);

    expect(patch).not.toBeNull();
    if (patch === null) return;

    const target = after.slice();
    applyPatch(target, width, patch, "before");
    expect(Array.from(target)).toEqual(Array.from(before));

    applyPatch(target, width, patch, "after");
    expect(Array.from(target)).toEqual(Array.from(after));
  });
});

describe("hexToRGBA", () => {
  it("converts a six-digit hex color to opaque RGBA", () => {
    expect(hexToRGBA("#12aBcD")).toEqual([18, 171, 205, 255]);
    expect(hexToRGBA("#000000")).toEqual([0, 0, 0, 255]);
    expect(hexToRGBA("#FFFFFF")).toEqual([255, 255, 255, 255]);
  });

  it("converts RGBA back to a six-digit color", () => {
    expect(rgbaToHex([18, 171, 205, 64])).toBe("#12abcd");
    expect(rgbaToHex([0, 0, 0, 0])).toBe("#000000");
  });
});

import {describe, expect, it} from "vitest";

import {
  addSelection,
  borderSelection,
  clearSelection,
  clipPixelEditsToSelection,
  clippedSelection,
  containsPoint,
  copySelection,
  ellipseSelection,
  featherSelection,
  fillSelection,
  flipClipboard,
  flipSelection,
  growSelection,
  intersectSelection,
  invertSelection,
  lassoSelection,
  magicWandSelection,
  moveSelection,
  pasteClipboard,
  polygonSelection,
  resizeClipboard,
  resizeSelection,
  rotateClipboard,
  rotateSelection,
  selectByColor,
  selectOpaquePixels,
  selectionFromMask,
  selectionFromEllipseBoundsAntialiased,
  selectionFromPolygonAntialiased,
  selectionFromPoints,
  selectionCoverageAt,
  shiftPixelsWrapped,
  shrinkSelection,
  strokeSelection,
  subtractSelection,
  type PixelClipboard,
  type Selection,
} from "./selection";

function pixelAt(pixels: Uint8ClampedArray, width: number, x: number, y: number) {
  const index = (y * width + x) * 4;
  return Array.from(pixels.subarray(index, index + 4));
}

function setPixel(pixels: Uint8ClampedArray, width: number, x: number, y: number, value: readonly number[]) {
  pixels.set(value, (y * width + x) * 4);
}

describe("selectionFromPoints", () => {
  it("normalizes reverse drags into an inclusive rectangle", () => {
    expect(selectionFromPoints(4, 3, 1, 1, 6, 5)).toEqual({
      x: 1,
      y: 1,
      width: 4,
      height: 3,
    });
  });

  it("clamps points at every canvas edge", () => {
    expect(selectionFromPoints(-4, -2, 8, 7, 5, 4)).toEqual({
      x: 0,
      y: 0,
      width: 5,
      height: 4,
    });
    expect(selectionFromPoints(-4, 1, -2, 2, 5, 4)).toEqual({
      x: 0,
      y: 1,
      width: 1,
      height: 2,
    });
  });

  it("returns null for an empty canvas", () => {
    expect(selectionFromPoints(0, 0, 0, 0, 0, 4)).toBeNull();
    expect(selectionFromPoints(0, 0, 0, 0, 4, 0)).toBeNull();
  });
});

describe("containsPoint", () => {
  const selection: Selection = {x: 2, y: 1, width: 3, height: 2};

  it("includes the top-left edge and excludes the right and bottom edges", () => {
    expect(containsPoint(selection, 2, 1)).toBe(true);
    expect(containsPoint(selection, 4, 2)).toBe(true);
    expect(containsPoint(selection, 5, 2)).toBe(false);
    expect(containsPoint(selection, 4, 3)).toBe(false);
    expect(containsPoint(selection, 1, 1)).toBe(false);
  });
});

describe("copySelection and clearSelection", () => {
  it("copies RGBA rows and does not share storage with the source", () => {
    const pixels = new Uint8ClampedArray(4 * 3 * 4);
    setPixel(pixels, 4, 1, 0, [10, 20, 30, 40]);
    setPixel(pixels, 4, 2, 0, [50, 60, 70, 80]);
    setPixel(pixels, 4, 1, 1, [90, 100, 110, 120]);
    setPixel(pixels, 4, 2, 1, [130, 140, 150, 160]);
    const selection: Selection = {x: 1, y: 0, width: 2, height: 2};

    const copied = copySelection(pixels, 4, selection);

    expect(copied.width).toBe(2);
    expect(copied.height).toBe(2);
    expect(Array.from(copied.pixels)).toEqual([
      10, 20, 30, 40, 50, 60, 70, 80,
      90, 100, 110, 120, 130, 140, 150, 160,
    ]);

    pixels.fill(255, 4);
    expect(Array.from(copied.pixels)).toEqual([
      10, 20, 30, 40, 50, 60, 70, 80,
      90, 100, 110, 120, 130, 140, 150, 160,
    ]);
  });

  it("clears only the selected pixels", () => {
    const pixels = Uint8ClampedArray.from({length: 4 * 3 * 4}, (_, index) => index + 1);
    const before = pixels.slice();
    const selection: Selection = {x: 1, y: 1, width: 2, height: 1};

    clearSelection(pixels, 4, selection);

    expect(pixelAt(pixels, 4, 1, 1)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(pixels, 4, 2, 1)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(pixels, 4, 0, 1)).toEqual(pixelAt(before, 4, 0, 1));
    expect(pixelAt(pixels, 4, 3, 1)).toEqual(pixelAt(before, 4, 3, 1));
    expect(pixelAt(pixels, 4, 1, 0)).toEqual(pixelAt(before, 4, 1, 0));
    expect(pixelAt(pixels, 4, 1, 2)).toEqual(pixelAt(before, 4, 1, 2));
  });

  it("uses an opaque replacement color for fully covered pixels", () => {
    const pixels = Uint8ClampedArray.from([
      10, 20, 30, 255,
      40, 50, 60, 128,
      70, 80, 90, 64,
    ]);
    const replacement = [12, 34, 56, 255] as const;

    clearSelection(pixels, 3, {x: 1, y: 0, width: 2, height: 1}, replacement);

    expect(pixelAt(pixels, 3, 0, 0)).toEqual([10, 20, 30, 255]);
    expect(pixelAt(pixels, 3, 1, 0)).toEqual(replacement);
    expect(pixelAt(pixels, 3, 2, 0)).toEqual(replacement);
  });
});

describe("clipPixelEditsToSelection", () => {
  it("restores rectangle edits outside the selection and keeps edits inside", () => {
    const width = 5;
    const height = 3;
    const before = Uint8ClampedArray.from({length: width * height * 4}, (_, index) => index + 1);
    const pixels = before.slice();
    const changed = [220, 221, 222, 223];
    const selection: Selection = {x: 1, y: 1, width: 2, height: 1};

    setPixel(pixels, width, 0, 1, changed);
    setPixel(pixels, width, 1, 1, changed);
    setPixel(pixels, width, 2, 1, changed);
    setPixel(pixels, width, 3, 1, changed);
    setPixel(pixels, width, 2, 0, changed);
    setPixel(pixels, width, 4, 2, changed);

    clipPixelEditsToSelection(pixels, before, width, height, selection, {
      x: -2,
      y: -2,
      width: width + 4,
      height: height + 4,
    });

    expect(pixelAt(pixels, width, 1, 1)).toEqual(changed);
    expect(pixelAt(pixels, width, 2, 1)).toEqual(changed);
    expect(pixelAt(pixels, width, 0, 1)).toEqual(pixelAt(before, width, 0, 1));
    expect(pixelAt(pixels, width, 3, 1)).toEqual(pixelAt(before, width, 3, 1));
    expect(pixelAt(pixels, width, 2, 0)).toEqual(pixelAt(before, width, 2, 0));
    expect(pixelAt(pixels, width, 4, 2)).toEqual(pixelAt(before, width, 4, 2));
  });

  it("restores unselected cells in an irregular mask while retaining selected cells", () => {
    const width = 5;
    const height = 4;
    const before = Uint8ClampedArray.from({length: width * height * 4}, (_, index) => (index % 32) + 1);
    const pixels = before.slice();
    const changed = [240, 241, 242, 243];
    const selection: Selection = {
      x: 1,
      y: 1,
      width: 3,
      height: 2,
      mask: Uint8Array.from([
        1, 0, 1,
        0, 1, 0,
      ]),
    };

    for (let y = 1; y <= 2; y += 1) {
      for (let x = 1; x <= 3; x += 1) setPixel(pixels, width, x, y, changed);
    }
    setPixel(pixels, width, 0, 0, changed);

    clipPixelEditsToSelection(pixels, before, width, height, selection, {
      x: 0,
      y: 0,
      width: width,
      height: height,
    });

    expect(pixelAt(pixels, width, 1, 1)).toEqual(changed);
    expect(pixelAt(pixels, width, 3, 1)).toEqual(changed);
    expect(pixelAt(pixels, width, 2, 2)).toEqual(changed);
    expect(pixelAt(pixels, width, 2, 1)).toEqual(pixelAt(before, width, 2, 1));
    expect(pixelAt(pixels, width, 1, 2)).toEqual(pixelAt(before, width, 1, 2));
    expect(pixelAt(pixels, width, 3, 2)).toEqual(pixelAt(before, width, 3, 2));
    expect(pixelAt(pixels, width, 0, 0)).toEqual(pixelAt(before, width, 0, 0));
  });

  it("does not modify pixels when there is no active selection", () => {
    const before = new Uint8ClampedArray(3 * 2 * 4).fill(7);
    const pixels = before.slice();
    pixels.fill(99);

    clipPixelEditsToSelection(pixels, before, 3, 2, null);

    expect(Array.from(pixels)).toEqual(new Array(3 * 2 * 4).fill(99));
  });

  it("validates both pixel buffers", () => {
    const before = new Uint8ClampedArray(2 * 2 * 4);
    const selection: Selection = {x: 0, y: 0, width: 1, height: 1};

    expect(() => clipPixelEditsToSelection(
      new Uint8ClampedArray(2),
      before,
      2,
      2,
      selection,
    )).toThrow(RangeError);
    expect(() => clipPixelEditsToSelection(
      before,
      new Uint8ClampedArray(2),
      2,
      2,
      selection,
    )).toThrow(RangeError);
  });
});

describe("pasteClipboard", () => {
  it("clips source pixels that land outside the left and top edges", () => {
    const pixels = new Uint8ClampedArray(4 * 3 * 4);
    const clipboard: PixelClipboard = {
      width: 3,
      height: 2,
      pixels: Uint8ClampedArray.from([
        10, 11, 12, 13, 20, 21, 22, 23, 30, 31, 32, 33,
        40, 41, 42, 43, 50, 51, 52, 53, 60, 61, 62, 63,
      ]),
    };

    pasteClipboard(pixels, 4, 3, clipboard, -1, -1);

    expect(pixelAt(pixels, 4, 0, 0)).toEqual([50, 51, 52, 53]);
    expect(pixelAt(pixels, 4, 1, 0)).toEqual([60, 61, 62, 63]);
    expect(pixelAt(pixels, 4, 0, 1)).toEqual([0, 0, 0, 0]);
  });

  it("clips source pixels that land outside the right and bottom edges", () => {
    const pixels = new Uint8ClampedArray(4 * 3 * 4);
    const clipboard: PixelClipboard = {
      width: 3,
      height: 2,
      pixels: Uint8ClampedArray.from([
        10, 11, 12, 13, 20, 21, 22, 23, 30, 31, 32, 33,
        40, 41, 42, 43, 50, 51, 52, 53, 60, 61, 62, 63,
      ]),
    };

    pasteClipboard(pixels, 4, 3, clipboard, 3, 2);

    expect(pixelAt(pixels, 4, 3, 2)).toEqual([10, 11, 12, 13]);
    expect(pixelAt(pixels, 4, 2, 2)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(pixels, 4, 3, 1)).toEqual([0, 0, 0, 0]);
  });
});

describe("moveSelection", () => {
  it("moves overlapping content using the original pixels", () => {
    const pixels = new Uint8ClampedArray(6 * 3 * 4);
    const selection: Selection = {x: 1, y: 1, width: 3, height: 1};
    setPixel(pixels, 6, 1, 1, [10, 11, 12, 13]);
    setPixel(pixels, 6, 2, 1, [20, 21, 22, 23]);
    setPixel(pixels, 6, 3, 1, [30, 31, 32, 33]);
    setPixel(pixels, 6, 0, 1, [90, 91, 92, 93]);
    setPixel(pixels, 6, 5, 1, [80, 81, 82, 83]);

    const result = moveSelection(pixels, 6, 3, selection, 2, 1);

    expect(result).toEqual({x: 2, y: 1, width: 3, height: 1});
    expect(pixelAt(pixels, 6, 0, 1)).toEqual([90, 91, 92, 93]);
    expect(pixelAt(pixels, 6, 1, 1)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(pixels, 6, 2, 1)).toEqual([10, 11, 12, 13]);
    expect(pixelAt(pixels, 6, 3, 1)).toEqual([20, 21, 22, 23]);
    expect(pixelAt(pixels, 6, 4, 1)).toEqual([30, 31, 32, 33]);
    expect(pixelAt(pixels, 6, 5, 1)).toEqual([80, 81, 82, 83]);
  });

  it("clears the source and returns the visible selection when moved out of bounds", () => {
    const pixels = new Uint8ClampedArray(5 * 4 * 4);
    const selection: Selection = {x: 1, y: 1, width: 3, height: 2};
    const source = [
      [10, 11, 12, 13], [20, 21, 22, 23], [30, 31, 32, 33],
      [40, 41, 42, 43], [50, 51, 52, 53], [60, 61, 62, 63],
    ];
    source.forEach((value, index) => setPixel(pixels, 5, 1 + (index % 3), 1 + Math.floor(index / 3), value));
    setPixel(pixels, 5, 0, 0, [90, 91, 92, 93]);

    const result = moveSelection(pixels, 5, 4, selection, -1, -1);

    expect(result).toEqual({x: 0, y: 0, width: 2, height: 1});
    expect(pixelAt(pixels, 5, 0, 0)).toEqual([50, 51, 52, 53]);
    expect(pixelAt(pixels, 5, 1, 0)).toEqual([60, 61, 62, 63]);
    for (const [x, y] of [[1, 1], [2, 1], [3, 1], [1, 2], [2, 2], [3, 2]] as const) {
      expect(pixelAt(pixels, 5, x, y)).toEqual([0, 0, 0, 0]);
    }
    expect(pixelAt(pixels, 5, 4, 3)).toEqual([0, 0, 0, 0]);
  });

  it("leaves the provided opaque clear color at the source", () => {
    const pixels = new Uint8ClampedArray(5 * 1 * 4);
    setPixel(pixels, 5, 1, 0, [10, 20, 30, 255]);
    setPixel(pixels, 5, 2, 0, [40, 50, 60, 128]);
    const replacement = [90, 80, 70, 255] as const;

    const result = moveSelection(pixels, 5, 1, {x: 1, y: 0, width: 2, height: 1}, 3, 0, replacement);

    expect(result).toEqual({x: 3, y: 0, width: 2, height: 1});
    expect(pixelAt(pixels, 5, 1, 0)).toEqual(replacement);
    expect(pixelAt(pixels, 5, 2, 0)).toEqual(replacement);
    expect(pixelAt(pixels, 5, 3, 0)).toEqual([10, 20, 30, 255]);
    expect(pixelAt(pixels, 5, 4, 0)).toEqual([40, 50, 60, 128]);
  });
});

describe("clippedSelection", () => {
  it("clips a rectangle against all four canvas edges", () => {
    expect(clippedSelection(-2, -1, 5, 4, 4, 3)).toEqual({
      x: 0,
      y: 0,
      width: 3,
      height: 3,
    });
    expect(clippedSelection(2, 1, 5, 4, 4, 3)).toEqual({
      x: 2,
      y: 1,
      width: 2,
      height: 2,
    });
  });

  it("returns null when there is no visible intersection", () => {
    expect(clippedSelection(-4, 0, 2, 2, 4, 3)).toBeNull();
    expect(clippedSelection(0, 3, 2, 2, 4, 3)).toBeNull();
  });
});

describe("masked selections", () => {
  it("trims empty mask edges while preserving the irregular shape", () => {
    const selection = selectionFromMask(2, 3, 4, 3, Uint8Array.from([
      0, 0, 0, 0,
      0, 1, 1, 0,
      0, 1, 0, 0,
    ]));

    expect(selection).toEqual({
      x: 3,
      y: 4,
      width: 2,
      height: 2,
      mask: Uint8Array.from([1, 1, 1, 0]),
    });
    expect(containsPoint(selection!, 3, 4)).toBe(true);
    expect(containsPoint(selection!, 4, 4)).toBe(true);
    expect(containsPoint(selection!, 3, 5)).toBe(true);
    expect(containsPoint(selection!, 4, 5)).toBe(false);
  });

  it("supports replace, add, subtract, and intersect with rectangles", () => {
    const first: Selection = {x: 1, y: 1, width: 3, height: 2};
    const second: Selection = {x: 3, y: 0, width: 2, height: 3};

    expect(addSelection(first, second)).toEqual({
      x: 1,
      y: 0,
      width: 4,
      height: 3,
      mask: Uint8Array.from([
        0, 0, 1, 1,
        1, 1, 1, 1,
        1, 1, 1, 1,
      ]),
    });
    expect(subtractSelection(first, second)).toEqual({x: 1, y: 1, width: 2, height: 2});
    expect(intersectSelection(first, second)).toEqual({x: 3, y: 1, width: 1, height: 2});

    const replacement = addSelection(first, second);
    expect(replacement).not.toBe(second);
  });

  it("subtracts a hole from a rectangle and intersects an irregular mask", () => {
    const rectangle: Selection = {x: 1, y: 1, width: 3, height: 3};
    const hole: Selection = {x: 2, y: 2, width: 1, height: 1};
    const result = subtractSelection(rectangle, hole);

    expect(result).toEqual({
      x: 1,
      y: 1,
      width: 3,
      height: 3,
      mask: Uint8Array.from([
        1, 1, 1,
        1, 0, 1,
        1, 1, 1,
      ]),
    });
    expect(intersectSelection(result, {x: 2, y: 1, width: 2, height: 3})).toEqual({
      x: 2,
      y: 1,
      width: 2,
      height: 3,
      mask: Uint8Array.from([
        1, 1,
        0, 1,
        1, 1,
      ]),
    });
  });

  it("copies, clears, pastes, and moves only selected mask cells", () => {
    const pixels = new Uint8ClampedArray(4 * 3 * 4);
    setPixel(pixels, 4, 1, 0, [10, 11, 12, 13]);
    setPixel(pixels, 4, 2, 0, [20, 21, 22, 23]);
    setPixel(pixels, 4, 1, 1, [30, 31, 32, 33]);
    setPixel(pixels, 4, 2, 1, [40, 41, 42, 43]);
    const selection: Selection = {x: 1, y: 0, width: 2, height: 2, mask: Uint8Array.from([1, 0, 0, 1])};

    const copied = copySelection(pixels, 4, selection);
    expect(copied.mask).toEqual(Uint8Array.from([1, 0, 0, 1]));
    expect(pixelAt(copied.pixels, 2, 0, 0)).toEqual([10, 11, 12, 13]);
    expect(pixelAt(copied.pixels, 2, 1, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(copied.pixels, 2, 0, 1)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(copied.pixels, 2, 1, 1)).toEqual([40, 41, 42, 43]);

    clearSelection(pixels, 4, selection);
    expect(pixelAt(pixels, 4, 1, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(pixels, 4, 2, 0)).toEqual([20, 21, 22, 23]);
    expect(pixelAt(pixels, 4, 1, 1)).toEqual([30, 31, 32, 33]);
    expect(pixelAt(pixels, 4, 2, 1)).toEqual([0, 0, 0, 0]);

    const destination = new Uint8ClampedArray(4 * 3 * 4);
    setPixel(destination, 4, 2, 1, [90, 91, 92, 93]);
    setPixel(destination, 4, 3, 1, [90, 91, 92, 93]);
    setPixel(destination, 4, 2, 2, [90, 91, 92, 93]);
    pasteClipboard(destination, 4, 3, copied, 2, 1);
    expect(pixelAt(destination, 4, 2, 1)).toEqual([10, 11, 12, 13]);
    expect(pixelAt(destination, 4, 3, 1)).toEqual([90, 91, 92, 93]);
    expect(pixelAt(destination, 4, 2, 2)).toEqual([90, 91, 92, 93]);
    expect(pixelAt(destination, 4, 3, 2)).toEqual([40, 41, 42, 43]);
  });

  it("clips a moved irregular selection at the canvas boundary", () => {
    const pixels = new Uint8ClampedArray(4 * 3 * 4);
    setPixel(pixels, 4, 1, 1, [10, 11, 12, 13]);
    setPixel(pixels, 4, 2, 1, [20, 21, 22, 23]);
    setPixel(pixels, 4, 1, 2, [30, 31, 32, 33]);
    setPixel(pixels, 4, 2, 2, [40, 41, 42, 43]);
    const selection: Selection = {x: 1, y: 1, width: 2, height: 2, mask: Uint8Array.from([1, 0, 0, 1])};

    const result = moveSelection(pixels, 4, 3, selection, 3, 2);

    expect(result).toEqual({x: 3, y: 2, width: 1, height: 1});
    expect(pixelAt(pixels, 4, 1, 1)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(pixels, 4, 2, 2)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(pixels, 4, 3, 2)).toEqual([10, 11, 12, 13]);
    expect(pixelAt(pixels, 4, 2, 1)).toEqual([20, 21, 22, 23]);
  });
});

describe("selection and pixel transforms", () => {
  const clipboard: PixelClipboard = {
    width: 2,
    height: 3,
    pixels: Uint8ClampedArray.from([
      1, 0, 0, 255, 2, 0, 0, 255,
      3, 0, 0, 255, 4, 0, 0, 255,
      5, 0, 0, 255, 6, 0, 0, 255,
    ]),
    mask: Uint8Array.from([
      1, 0,
      0, 1,
      1, 0,
    ]),
  };

  it("resizes pixels and masks with nearest-neighbor sampling", () => {
    const resized = resizeClipboard(clipboard, 4, 2);

    expect(resized.width).toBe(4);
    expect(resized.height).toBe(2);
    expect(Array.from(resized.pixels)).toEqual([
      1, 0, 0, 255, 1, 0, 0, 255, 2, 0, 0, 255, 2, 0, 0, 255,
      3, 0, 0, 255, 3, 0, 0, 255, 4, 0, 0, 255, 4, 0, 0, 255,
    ]);
    expect(resized.mask).toEqual(Uint8Array.from([1, 1, 0, 0, 0, 0, 1, 1]));

    const selection = resizeSelection({x: 5, y: 6, width: 2, height: 3, mask: clipboard.mask}, 4, 2);
    expect(selection).toEqual({x: 5, y: 6, width: 4, height: 2, mask: resized.mask});
  });

  it("flips both pixel order and selection mask on either axis", () => {
    const horizontal = flipClipboard(clipboard, "horizontal");
    expect(Array.from(horizontal.pixels)).toEqual([
      2, 0, 0, 255, 1, 0, 0, 255,
      4, 0, 0, 255, 3, 0, 0, 255,
      6, 0, 0, 255, 5, 0, 0, 255,
    ]);
    expect(horizontal.mask).toEqual(Uint8Array.from([0, 1, 1, 0, 0, 1]));

    const vertical = flipSelection({x: 4, y: 2, width: 2, height: 3, mask: clipboard.mask}, "vertical");
    expect(vertical).toEqual({
      x: 4,
      y: 2,
      width: 2,
      height: 3,
      mask: Uint8Array.from([1, 0, 0, 1, 1, 0]),
    });
  });

  it("rotates pixels and masks clockwise and counterclockwise", () => {
    const clockwise = rotateClipboard(clipboard, "clockwise");
    expect(clockwise.width).toBe(3);
    expect(clockwise.height).toBe(2);
    expect(Array.from(clockwise.pixels)).toEqual([
      5, 0, 0, 255, 3, 0, 0, 255, 1, 0, 0, 255,
      6, 0, 0, 255, 4, 0, 0, 255, 2, 0, 0, 255,
    ]);
    expect(clockwise.mask).toEqual(Uint8Array.from([1, 0, 1, 0, 1, 0]));

    const counterclockwise = rotateSelection({x: 7, y: 8, width: 2, height: 3, mask: clipboard.mask}, "counterclockwise");
    expect(counterclockwise).toEqual({
      x: 7,
      y: 8,
      width: 3,
      height: 2,
      mask: Uint8Array.from([0, 1, 0, 1, 0, 1]),
    });
  });
});

describe("advanced selections", () => {
  function selectedCells(selection: Selection | null, width: number, height: number) {
    const cells: string[] = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (selection && containsPoint(selection, x, y)) cells.push(`${x},${y}`);
      }
    }
    return cells;
  }

  it("rasterizes an ellipse from inclusive drag bounds", () => {
    const ellipse = ellipseSelection(0, 0, 4, 4, 5, 5);
    expect(selectedCells(ellipse, 5, 5)).toEqual([
      "2,0",
      "1,1", "2,1", "3,1",
      "0,2", "1,2", "2,2", "3,2", "4,2",
      "1,3", "2,3", "3,3",
      "2,4",
    ]);
  });

  it("fills polygon and lasso point lists, including the closing edge", () => {
    const points = [[1, 1], [4, 1], [1, 4]] as const;
    const polygon = polygonSelection(points, 6, 6);
    expect(polygon).not.toBeNull();
    expect(containsPoint(polygon!, 1, 1)).toBe(true);
    expect(containsPoint(polygon!, 2, 2)).toBe(true);
    expect(containsPoint(polygon!, 4, 4)).toBe(false);
    expect(lassoSelection(points, 6, 6)).toEqual(polygon);
  });

  it("keeps magic-wand selection contiguous while color selection is global", () => {
    const pixels = new Uint8ClampedArray(5 * 2 * 4);
    const red: readonly [number, number, number, number] = [255, 0, 0, 255];
    const nearRed: readonly [number, number, number, number] = [254, 0, 0, 255];
    const blue: readonly [number, number, number, number] = [0, 0, 255, 255];
    setPixel(pixels, 5, 0, 0, red);
    setPixel(pixels, 5, 1, 0, red);
    setPixel(pixels, 5, 2, 0, blue);
    setPixel(pixels, 5, 3, 0, red);
    setPixel(pixels, 5, 0, 1, nearRed);
    setPixel(pixels, 5, 1, 1, red);
    setPixel(pixels, 5, 2, 1, blue);
    setPixel(pixels, 5, 3, 1, red);

    expect(selectedCells(magicWandSelection(pixels, 5, 2, 0, 0, 1), 5, 2)).toEqual([
      "0,0", "1,0", "0,1", "1,1",
    ]);
    expect(selectedCells(selectByColor(pixels, 5, 2, red, 1), 5, 2)).toEqual([
      "0,0", "1,0", "3,0", "0,1", "1,1", "3,1",
    ]);
  });

  it("selects non-transparent pixels and can invert a selection", () => {
    const pixels = new Uint8ClampedArray(3 * 2 * 4);
    setPixel(pixels, 3, 0, 0, [1, 2, 3, 0]);
    setPixel(pixels, 3, 1, 0, [1, 2, 3, 1]);
    setPixel(pixels, 3, 2, 0, [1, 2, 3, 255]);
    const opaque = selectOpaquePixels(pixels, 3, 2);
    expect(selectedCells(opaque, 3, 2)).toEqual(["1,0", "2,0"]);

    const inverted = invertSelection({x: 1, y: 0, width: 1, height: 1}, 3, 2);
    expect(selectedCells(inverted, 3, 2)).toHaveLength(5);
    expect(containsPoint(inverted!, 1, 0)).toBe(false);
    expect(containsPoint(inverted!, 0, 0)).toBe(true);
  });

  it("grows, shrinks, and extracts an inward border", () => {
    const point: Selection = {x: 2, y: 2, width: 1, height: 1};
    const grown = growSelection(point, 1, 5, 5);
    expect(grown).toEqual({x: 1, y: 1, width: 3, height: 3});
    expect(shrinkSelection(grown, 1, 5, 5)).toEqual(point);

    const border = borderSelection({x: 0, y: 0, width: 5, height: 5}, 1, 5, 5);
    expect(selectedCells(border, 5, 5)).toHaveLength(16);
    expect(containsPoint(border!, 0, 0)).toBe(true);
    expect(containsPoint(border!, 2, 2)).toBe(false);
  });
});

describe("soft selection coverage", () => {
  it("keeps 0..255 coverage through combination and point queries", () => {
    const first: Selection = {x: 0, y: 0, width: 2, height: 1, mask: Uint8Array.from([128, 255])};
    const second: Selection = {x: 1, y: 0, width: 2, height: 1, mask: Uint8Array.from([64, 192])};

    const added = addSelection(first, second)!;
    expect(selectionCoverageAt(added, 0, 0)).toBe(128);
    expect(selectionCoverageAt(added, 1, 0)).toBe(255);
    expect(selectionCoverageAt(added, 2, 0)).toBe(192);
    expect(selectionCoverageAt(intersectSelection(first, second)!, 1, 0)).toBe(64);
    expect(selectionCoverageAt(subtractSelection(first, second)!, 1, 0)).toBe(191);
    expect(containsPoint(added, 0, 0)).toBe(true);
  });

  it("blends partial clear, paste, and edit clipping by coverage", () => {
    const selection: Selection = {x: 0, y: 0, width: 1, height: 1, mask: Uint8Array.from([128])};
    const pixels = Uint8ClampedArray.from([100, 80, 60, 200]);
    clearSelection(pixels, 1, selection);
    expect(Array.from(pixels)).toEqual([50, 40, 30, 100]);

    const destination = Uint8ClampedArray.from([0, 0, 0, 0]);
    pasteClipboard(destination, 1, 1, {
      width: 1,
      height: 1,
      pixels: Uint8ClampedArray.from([200, 100, 50, 255]),
      mask: Uint8Array.from([128]),
    }, 0, 0);
    expect(Array.from(destination)).toEqual([100, 50, 25, 128]);

    const before = Uint8ClampedArray.from([0, 0, 0, 0]);
    const edited = Uint8ClampedArray.from([255, 255, 255, 255]);
    clipPixelEditsToSelection(edited, before, 1, 1, selection);
    expect(Array.from(edited)).toEqual([128, 128, 128, 128]);
  });

  it("interpolates a replacement color for soft clear coverage", () => {
    const pixels = Uint8ClampedArray.from([100, 80, 60, 200]);
    const selection: Selection = {x: 0, y: 0, width: 1, height: 1, mask: Uint8Array.from([128])};

    clearSelection(pixels, 1, selection, [10, 20, 30, 255]);

    expect(Array.from(pixels)).toEqual([55, 50, 45, 228]);
  });

  it("feathers a hard selection into a soft edge", () => {
    const hard: Selection = {x: 2, y: 2, width: 3, height: 3};
    const feathered = featherSelection(hard, 1, 8, 8)!;
    expect(selectionCoverageAt(feathered, 3, 3)).toBe(255);
    expect(selectionCoverageAt(feathered, 2, 3)).toBeGreaterThan(0);
    expect(selectionCoverageAt(feathered, 2, 3)).toBeLessThan(255);
    expect(selectionCoverageAt(feathered, 1, 3)).toBeGreaterThan(0);
    expect(selectionCoverageAt(feathered, 0, 3)).toBe(0);
  });

  it("can rasterize ellipse and polygon edges with fractional coverage", () => {
    const ellipse = selectionFromEllipseBoundsAntialiased(0, 0, 5, 5, 6, 6, 8);
    const polygon = selectionFromPolygonAntialiased([[0, 0], [4, 0], [0, 4]], 6, 6, 8);
    const ellipseMask = ellipse ? Array.from(ellipse.mask ?? []) : [];
    const polygonMask = polygon ? Array.from(polygon.mask ?? []) : [];
    expect(ellipseMask.some((value) => value > 0 && value < 255)).toBe(true);
    expect(polygonMask.some((value) => value > 0 && value < 255)).toBe(true);
  });
});

describe("selection edit operations", () => {
  it("fills with source-over color and soft selection coverage", () => {
    const pixels = Uint8ClampedArray.from([
      0, 0, 255, 255,
      0, 0, 0, 0,
    ]);
    const selection: Selection = {x: 0, y: 0, width: 2, height: 1, mask: Uint8Array.from([255, 128])};
    fillSelection(pixels, 2, selection, [255, 0, 0, 128]);
    expect(pixelAt(pixels, 2, 0, 0)).toEqual([128, 0, 127, 255]);
    expect(pixelAt(pixels, 2, 1, 0)).toEqual([255, 0, 0, 64]);
  });

  it("strokes the inward edge without filling the center", () => {
    const pixels = new Uint8ClampedArray(5 * 5 * 4);
    strokeSelection(pixels, 5, 5, {x: 0, y: 0, width: 5, height: 5}, [10, 20, 30, 255], 1);
    expect(pixelAt(pixels, 5, 0, 0)).toEqual([10, 20, 30, 255]);
    expect(pixelAt(pixels, 5, 4, 4)).toEqual([10, 20, 30, 255]);
    expect(pixelAt(pixels, 5, 2, 2)).toEqual([0, 0, 0, 0]);
  });

  it("shifts the canvas pixels with wrapping in both axes", () => {
    const pixels = new Uint8ClampedArray(3 * 2 * 4);
    [1, 2, 3, 4, 5, 6].forEach((value, index) => setPixel(pixels, 3, index % 3, Math.floor(index / 3), [value, 0, 0, 255]));
    shiftPixelsWrapped(pixels, 3, 2, 1, -1);
    expect([0, 1, 2].map((x) => pixelAt(pixels, 3, x, 0)[0])).toEqual([6, 4, 5]);
    expect([0, 1, 2].map((x) => pixelAt(pixels, 3, x, 1)[0])).toEqual([3, 1, 2]);
  });

  it("wraps only inside the active selection and preserves outside pixels", () => {
    const pixels = new Uint8ClampedArray(5 * 2 * 4);
    for (let index = 0; index < 10; index += 1) {
      setPixel(pixels, 5, index % 5, Math.floor(index / 5), [index + 1, 0, 0, 255]);
    }
    shiftPixelsWrapped(pixels, 5, 2, 1, 0, {x: 1, y: 0, width: 3, height: 2});

    expect([0, 1, 2, 3, 4].map((x) => pixelAt(pixels, 5, x, 0)[0])).toEqual([1, 4, 2, 3, 5]);
    expect([0, 1, 2, 3, 4].map((x) => pixelAt(pixels, 5, x, 1)[0])).toEqual([6, 9, 7, 8, 10]);
  });
});

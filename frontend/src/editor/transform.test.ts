import {describe, expect, it} from "vitest";

import {resizedTransformBounds} from "./PixelCanvas";
import {deformedTransformQuad, renderClipboardTransformFromSource, rotateClipboardWithPivot, selectionQuad, warpSelectionToQuad} from "./transform";
import {copySelection, maskForSelection, type Selection} from "./selection";

const origin = {x: 4, y: 3, width: 6, height: 5};
const boundaryOrigin = {x: 3, y: 2, width: 4, height: 3};

const deformationOrigin: Selection = {x: 4, y: 3, width: 6, height: 5};

describe("transform bounds", () => {
  it.each([
    ["nw", {x: 1, y: 1}, {x: 1, y: 1, width: 9, height: 7}],
    ["n", {x: 7, y: 0}, {x: 4, y: 0, width: 6, height: 8}],
    ["ne", {x: 14, y: 1}, {x: 4, y: 1, width: 10, height: 7}],
    ["e", {x: 15, y: 6}, {x: 4, y: 3, width: 11, height: 5}],
    ["se", {x: 14, y: 11}, {x: 4, y: 3, width: 10, height: 8}],
    ["s", {x: 7, y: 10}, {x: 4, y: 3, width: 6, height: 7}],
    ["sw", {x: 1, y: 10}, {x: 1, y: 3, width: 9, height: 7}],
    ["w", {x: 1, y: 6}, {x: 1, y: 3, width: 9, height: 5}],
  ] as const)("resizes from the %s handle", (handle, point, expected) => {
    expect(resizedTransformBounds(origin, handle, point, 16, 12)).toEqual(expected);
  });

  it.each([
    ["nw", {x: -100, y: -100}, {x: 0, y: 0, width: 7, height: 5}],
    ["n", {x: -100, y: -100}, {x: 3, y: 0, width: 4, height: 5}],
    ["ne", {x: 100, y: -100}, {x: 3, y: 0, width: 7, height: 5}],
    ["e", {x: 100, y: -100}, {x: 3, y: 2, width: 7, height: 3}],
    ["se", {x: 100, y: 100}, {x: 3, y: 2, width: 7, height: 6}],
    ["s", {x: -100, y: 100}, {x: 3, y: 2, width: 4, height: 6}],
    ["sw", {x: -100, y: 100}, {x: 0, y: 2, width: 7, height: 6}],
    ["w", {x: -100, y: -100}, {x: 0, y: 2, width: 7, height: 3}],
  ] as const)("clamps the %s handle to the canvas boundary", (handle, point, expected) => {
    expect(resizedTransformBounds(boundaryOrigin, handle, point, 10, 8)).toEqual(expected);
  });

  it.each([
    ["nw", {x: 100, y: 100}, {x: 9, y: 7, width: 1, height: 1}],
    ["n", {x: 0, y: 100}, {x: 4, y: 7, width: 6, height: 1}],
    ["ne", {x: -100, y: 100}, {x: 4, y: 7, width: 1, height: 1}],
    ["e", {x: -100, y: 0}, {x: 4, y: 3, width: 1, height: 5}],
    ["se", {x: -100, y: -100}, {x: 4, y: 3, width: 1, height: 1}],
    ["s", {x: 0, y: -100}, {x: 4, y: 3, width: 6, height: 1}],
    ["sw", {x: 100, y: -100}, {x: 9, y: 3, width: 1, height: 1}],
    ["w", {x: 100, y: 0}, {x: 9, y: 3, width: 1, height: 5}],
  ] as const)("keeps a minimum 1x1 box when shrinking from %s", (handle, point, expected) => {
    expect(resizedTransformBounds(origin, handle, point, 10, 8)).toEqual(expected);
  });
});

describe("transform session rendering", () => {
  it("restores original detail after shrinking and expanding in one session", () => {
    const selection: Selection = {x: 0, y: 0, width: 4, height: 1};
    const original = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 0, 255,
    ]);
    const before = original.slice();
    const source = copySelection(original, 4, selection);
    const pixels = original.slice();

    renderClipboardTransformFromSource(pixels, 4, 1, before, selection, source, {...selection, width: 2});
    const restoredSelection = renderClipboardTransformFromSource(pixels, 4, 1, before, selection, source, selection);

    expect(restoredSelection).toEqual(selection);
    expect(pixels).toEqual(original);
  });
});

describe("pivoted nearest-neighbor transforms", () => {
  it("keeps an explicit pivot stable while rotating pixel order", () => {
    const clipboard = {
      width: 3,
      height: 1,
      pixels: Uint8ClampedArray.from([
        10, 0, 0, 255,
        20, 0, 0, 255,
        30, 0, 0, 255,
      ]),
    };
    const rotated = rotateClipboardWithPivot(clipboard, 180, {x: 0, y: 0});
    expect(rotated.width).toBe(3);
    expect(rotated.height).toBe(1);
    expect(Array.from(rotated.pixels)).toEqual([
      30, 0, 0, 255,
      20, 0, 0, 255,
      10, 0, 0, 255,
    ]);
    expect(rotated.mask).toEqual(Uint8Array.from([255, 255, 255]));
  });

  it("keeps the pivot in world space and reports the rotated bounds offset", () => {
    const clipboard = {
      width: 2,
      height: 1,
      pixels: Uint8ClampedArray.from([
        10, 0, 0, 255,
        20, 0, 0, 255,
      ]),
    };

    // The right-hand source pixel is the pivot. Rotating around it moves the
    // other pixel above the pivot, so the result's world-space Y origin is -1.
    const rotated = rotateClipboardWithPivot(clipboard, 90, {x: 1, y: 0});

    expect(rotated.width).toBe(1);
    expect(rotated.height).toBe(2);
    expect(rotated.offsetX).toBe(1);
    expect(rotated.offsetY).toBe(-1);
    expect(Array.from(rotated.pixels)).toEqual([
      10, 0, 0, 255,
      20, 0, 0, 255,
    ]);
    expect(Array.from(rotated.mask ?? [])).toEqual([255, 255]);
    expect({x: 1 - rotated.offsetX, y: 0 - rotated.offsetY}).toEqual({x: 0, y: 1});
    expect(Array.from(rotated.pixels.subarray(4, 8))).toEqual([20, 0, 0, 255]);
  });

  it("rotates every pixel around an off-center pivot without changing its anchor", () => {
    const clipboard = {
      width: 2,
      height: 2,
      pixels: Uint8ClampedArray.from([
        1, 0, 0, 255,
        2, 0, 0, 255,
        3, 0, 0, 255,
        4, 0, 0, 255,
      ]),
    };

    const rotated = rotateClipboardWithPivot(clipboard, 180, {x: 0, y: 0});

    expect(rotated.width).toBe(2);
    expect(rotated.height).toBe(2);
    expect(rotated.offsetX).toBe(-1);
    expect(rotated.offsetY).toBe(-1);
    expect(Array.from(rotated.pixels)).toEqual([
      4, 0, 0, 255,
      3, 0, 0, 255,
      2, 0, 0, 255,
      1, 0, 0, 255,
    ]);
    // The source pivot (0, 0) lands at the bottom-right output cell.
    expect({x: 0 - rotated.offsetX, y: 0 - rotated.offsetY}).toEqual({x: 1, y: 1});
    expect(Array.from(rotated.pixels.subarray(12, 16))).toEqual([1, 0, 0, 255]);
  });
});

describe("quad deformation", () => {
  it.each([
    ["nw", {x: 1, y: 0}],
    ["ne", {x: 13, y: 0}],
    ["se", {x: 13, y: 11}],
    ["sw", {x: 1, y: 11}],
  ] as const)("distort moves only the %s corner", (handle, point) => {
    const original = selectionQuad(deformationOrigin);
    const transformed = deformedTransformQuad(deformationOrigin, handle, point, "distort", 16, 12);

    for (const corner of ["nw", "ne", "se", "sw"] as const) {
      if (corner === handle) {
        expect(transformed[corner]).toEqual(point);
      } else {
        expect(transformed[corner]).toEqual(original[corner]);
      }
    }
  });

  it("perspective keeps the opposite edge parallel and produces a trapezoid", () => {
    const transformed = deformedTransformQuad(
      deformationOrigin,
      "nw",
      {x: 2, y: 0},
      "perspective",
      16,
      12,
    );

    // The top-left corner moved upward. Perspective mode mirrors that
    // vertical delta on the lower-left corner, preserving the right edge.
    expect(transformed.nw).toEqual({x: 4, y: 0});
    expect(transformed.sw).toEqual({x: 4, y: 11});
    expect(transformed.ne).toEqual({x: 10, y: 3});
    expect(transformed.se).toEqual({x: 10, y: 8});
    expect(transformed.nw.y - transformed.ne.y).not.toBe(0);
    expect(transformed.sw.y - transformed.se.y).not.toBe(0);
  });

  it.each([
    ["n", {x: 7, y: 1}, "y"],
    ["e", {x: 13, y: 6}, "x"],
    ["s", {x: 7, y: 10}, "y"],
    ["w", {x: 1, y: 6}, "x"],
  ] as const)("moving the %s midpoint moves the whole corresponding edge", (handle, point, axis) => {
    const original = selectionQuad(deformationOrigin);
    const transformed = deformedTransformQuad(deformationOrigin, handle, point, "distort", 16, 12);
    const edge = handle === "n" ? ["nw", "ne"]
      : handle === "e" ? ["ne", "se"]
        : handle === "s" ? ["sw", "se"]
          : ["nw", "sw"];

    for (const corner of edge as Array<keyof typeof original>) {
      expect(transformed[corner][axis]).toBe(point[axis]);
    }
    for (const corner of (["nw", "ne", "se", "sw"] as const).filter((corner) => !edge.includes(corner))) {
      expect(transformed[corner][axis]).toBe(original[corner][axis]);
    }
  });
});

describe("quad warping", () => {
  function filledSource(width = 4, height = 4) {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = 255;
      pixels[index + 1] = (index / 4) & 0xff;
      pixels[index + 3] = 255;
    }
    return pixels;
  }

  it("creates a masked trapezoid and keeps the result inside the canvas", () => {
    const canvasWidth = 12;
    const canvasHeight = 12;
    const origin: Selection = {x: 2, y: 2, width: 4, height: 4};
    const pixels = new Uint8ClampedArray(canvasWidth * canvasHeight * 4);
    const source = filledSource(origin.width, origin.height);
    for (let row = 0; row < origin.height; row += 1) {
      pixels.set(source.subarray(row * origin.width * 4, (row + 1) * origin.width * 4), ((origin.y + row) * canvasWidth + origin.x) * 4);
    }
    const beforeLength = pixels.length;
    const quad = {
      nw: {x: 2, y: 2},
      ne: {x: 8, y: 2},
      se: {x: 7, y: 8},
      sw: {x: 2, y: 8},
    };

    const result = warpSelectionToQuad(pixels, canvasWidth, canvasHeight, origin, quad);

    expect(result).not.toBeNull();
    expect(result!.x).toBeGreaterThanOrEqual(0);
    expect(result!.y).toBeGreaterThanOrEqual(0);
    expect(result!.x + result!.width).toBeLessThanOrEqual(canvasWidth);
    expect(result!.y + result!.height).toBeLessThanOrEqual(canvasHeight);
    expect(result!.mask).toBeDefined();
    const mask = maskForSelection(result!);
    expect(mask.some((value) => value === 0)).toBe(true);
    expect(mask.some((value) => value !== 0)).toBe(true);
    expect(pixels).toHaveLength(beforeLength);
  });

  it("creates a diamond mask without writing outside the canvas", () => {
    const canvasWidth = 12;
    const canvasHeight = 12;
    const origin: Selection = {x: 2, y: 2, width: 4, height: 4};
    const pixels = new Uint8ClampedArray(canvasWidth * canvasHeight * 4);
    const source = filledSource(origin.width, origin.height);
    for (let row = 0; row < origin.height; row += 1) {
      pixels.set(source.subarray(row * origin.width * 4, (row + 1) * origin.width * 4), ((origin.y + row) * canvasWidth + origin.x) * 4);
    }
    const quad = {
      nw: {x: 6, y: 2},
      ne: {x: 10, y: 6},
      se: {x: 6, y: 10},
      sw: {x: 2, y: 6},
    };

    const result = warpSelectionToQuad(pixels, canvasWidth, canvasHeight, origin, quad);

    expect(result).not.toBeNull();
    expect(result!.mask).toBeDefined();
    const mask = maskForSelection(result!);
    expect(mask.some((value) => value === 0)).toBe(true);
    expect(mask.some((value) => value !== 0)).toBe(true);
    expect(result!.x).toBeGreaterThanOrEqual(0);
    expect(result!.y).toBeGreaterThanOrEqual(0);
    expect(result!.x + result!.width).toBeLessThanOrEqual(canvasWidth);
    expect(result!.y + result!.height).toBeLessThanOrEqual(canvasHeight);
  });
});

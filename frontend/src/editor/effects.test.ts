import {describe, expect, it} from "vitest";
import {outlinePixelsInPlace, shadePixelsInPlace} from "./effects";

function pixelBuffer(width: number, height: number, points: Array<{x: number; y: number; color?: [number, number, number, number]}> = []) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (const point of points) {
    const offset = (point.y * width + point.x) * 4;
    pixels.set(point.color ?? [255, 255, 255, 255], offset);
  }
  return pixels;
}

function pixelAt(pixels: Uint8ClampedArray, width: number, x: number, y: number) {
  return [...pixels.subarray((y * width + x) * 4, (y * width + x + 1) * 4)];
}

describe("pixel effects", () => {
  it("draws an outside outline without overwriting the source", () => {
    const pixels = new Uint8ClampedArray(3 * 3 * 4);
    pixels.set([255, 255, 255, 255], (1 * 3 + 1) * 4);
    expect(outlinePixelsInPlace(pixels, {width: 3, height: 3, color: [255, 0, 0, 255], thickness: 1, diagonal: false})).toBe(4);
    expect([...pixels.subarray((1 * 3 + 1) * 4, (1 * 3 + 1) * 4 + 4)]).toEqual([255, 255, 255, 255]);
  });

  it("uses square, diamond, and circle distance kernels", () => {
    const outline = (shape: "square" | "diamond" | "circle") => {
      const pixels = pixelBuffer(7, 7, [{x: 3, y: 3}]);
      return outlinePixelsInPlace(pixels, {width: 7, height: 7, color: [255, 0, 0, 255], thickness: 2, shape});
    };
    expect(outline("square")).toBe(24);
    expect(outline("diamond")).toBe(12);
    expect(outline("circle")).toBe(12);
  });

  it("restricts an outline to a directional side", () => {
    const pixels = pixelBuffer(5, 5, [{x: 2, y: 2}]);
    expect(outlinePixelsInPlace(pixels, {
      width: 5,
      height: 5,
      color: [255, 0, 0, 255],
      thickness: 2,
      shape: "square",
      directions: ["n"],
    })).toBe(2);
    expect(pixelAt(pixels, 5, 2, 1)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(pixels, 5, 2, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(pixels, 5, 1, 2)).toEqual([0, 0, 0, 0]);
  });

  it("clips inside outlines to opaque source pixels", () => {
    const pixels = pixelBuffer(5, 5, [
      {x: 1, y: 1}, {x: 2, y: 1}, {x: 3, y: 1},
      {x: 1, y: 2}, {x: 2, y: 2}, {x: 3, y: 2},
      {x: 1, y: 3}, {x: 2, y: 3}, {x: 3, y: 3},
    ]);
    expect(outlinePixelsInPlace(pixels, {
      width: 5,
      height: 5,
      color: [0, 255, 0, 255],
      position: "inside",
      shape: "square",
      diagonal: false,
    })).toBe(8);
    expect(pixelAt(pixels, 5, 2, 2)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(pixels, 5, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it("wraps outline samples independently on X and Y", () => {
    const horizontal = pixelBuffer(3, 1, [{x: 0, y: 0}]);
    expect(outlinePixelsInPlace(horizontal, {
      width: 3,
      height: 1,
      color: [255, 0, 0, 255],
      directions: ["w"],
      tileX: true,
    })).toBe(1);
    expect(pixelAt(horizontal, 3, 2, 0)).toEqual([255, 0, 0, 255]);

    const vertical = pixelBuffer(1, 3, [{x: 0, y: 0}]);
    expect(outlinePixelsInPlace(vertical, {
      width: 1,
      height: 3,
      color: [255, 0, 0, 255],
      directions: ["n"],
      tileY: true,
    })).toBe(1);
    expect(pixelAt(vertical, 1, 0, 2)).toEqual([255, 0, 0, 255]);
  });

  it("blends soft selections and preserves masked channels", () => {
    const pixels = pixelBuffer(3, 3, [
      {x: 1, y: 1},
      {x: 1, y: 0, color: [40, 50, 60, 0]},
    ]);
    const selection = {x: 0, y: 0, width: 3, height: 3, mask: new Uint8Array(9).fill(0)};
    selection.mask[1] = 128;
    expect(outlinePixelsInPlace(pixels, {
      width: 3,
      height: 3,
      color: [200, 100, 80, 200],
      directions: ["n"],
      selection,
      channelMask: {red: true, green: false, blue: true, alpha: false},
    })).toBe(1);
    expect(pixelAt(pixels, 3, 1, 0)).toEqual([120, 50, 70, 0]);
  });

  it("keeps feathered outside outlines saturated regardless of hidden source RGB", () => {
    for (const hidden of [[0, 0, 0, 0], [20, 220, 180, 0]] as [number, number, number, number][]) {
      const pixels = pixelBuffer(2, 1, [{x: 0, y: 0}, {x: 1, y: 0, color: hidden}]);
      expect(outlinePixelsInPlace(pixels, {
        width: 2, height: 1, color: [240, 80, 40, 200],
        selection: {x: 0, y: 0, width: 2, height: 1, mask: new Uint8Array([0, 128])},
      })).toBe(1);
      expect(pixelAt(pixels, 2, 1, 0)).toEqual([240, 80, 40, 100]);
      expect(pixelAt(pixels, 2, 0, 0)).toEqual([255, 255, 255, 255]);
    }
  });

  it("weights inside outline colors by alpha while preserving disabled channels", () => {
    const pixels = pixelBuffer(1, 1, [{x: 0, y: 0, color: [200, 100, 50, 100]}]);
    outlinePixelsInPlace(pixels, {
      width: 1, height: 1, position: "inside", color: [40, 200, 250, 200],
      channelMask: {green: false},
      selection: {x: 0, y: 0, width: 1, height: 1, mask: new Uint8Array([85])},
    });
    expect(pixelAt(pixels, 1, 0, 0)).toEqual([120, 100, 150, 133]);
  });

  it("can feather an inside outline to transparent without adding a dark fringe", () => {
    const pixels = pixelBuffer(1, 1, [{x: 0, y: 0, color: [200, 100, 50, 200]}]);
    outlinePixelsInPlace(pixels, {
      width: 1, height: 1, position: "inside", color: [0, 0, 0, 0],
      selection: {x: 0, y: 0, width: 1, height: 1, mask: new Uint8Array([128])},
    });
    expect(pixelAt(pixels, 1, 0, 0)).toEqual([200, 100, 50, 100]);
  });

  it("returns zero without changing pixels for empty directions or masks", () => {
    const pixels = pixelBuffer(3, 3, [{x: 1, y: 1}]);
    const before = pixels.slice();
    expect(outlinePixelsInPlace(pixels, {width: 3, height: 3, color: [255, 0, 0, 255], directions: []})).toBe(0);
    expect(pixels).toEqual(before);
    expect(outlinePixelsInPlace(pixels, {
      width: 3,
      height: 3,
      color: [255, 0, 0, 255],
      channelMask: {red: false, green: false, blue: false, alpha: false},
    })).toBe(0);
    expect(pixels).toEqual(before);
  });

  it("validates positive dimensions and exact buffer length", () => {
    expect(() => outlinePixelsInPlace(new Uint8ClampedArray(0), {
      width: 0,
      height: 1,
      color: [255, 0, 0, 255],
    })).toThrow("Outline dimensions");
    expect(() => outlinePixelsInPlace(new Uint8ClampedArray(4), {
      width: 2,
      height: 2,
      color: [255, 0, 0, 255],
    })).toThrow("Outline dimensions");
  });

  it("maps luminance between shadow and highlight colors", () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    shadePixelsInPlace(pixels, {width: 2, height: 1, shadow: [255, 0, 0, 255], highlight: [0, 0, 255, 255]});
    expect([...pixels]).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
  });
});

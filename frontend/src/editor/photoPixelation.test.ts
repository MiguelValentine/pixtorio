import {describe, expect, it} from "vitest";
import {pixelatePhoto, type PhotoPixelationOptions} from "./photoPixelation";

function options(overrides: Partial<PhotoPixelationOptions> = {}): PhotoPixelationOptions {
  return {maxColors: 8, mergeThreshold: 0, dither: "none", ...overrides};
}

function uniquePixels(pixels: Uint8ClampedArray) {
  const colors = new Set<string>();
  for (let offset = 0; offset < pixels.length; offset += 4) colors.add(Array.from(pixels.slice(offset, offset + 4)).join(","));
  return colors;
}

function gradient(width: number, height: number) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const value = Math.round((pixel / Math.max(1, width * height - 1)) * 255);
    pixels.set([value, 255 - value, (value * 3) % 256, 255], pixel * 4);
  }
  return pixels;
}

function opaque256Pixels() {
  const pixels = new Uint8ClampedArray(256 * 4);
  for (let index = 0; index < 256; index += 1) {
    pixels.set([(index & 15) * 17, (index >> 4) * 17, 96, 255], index * 4);
  }
  return pixels;
}

describe("photo pixelation", () => {
  it("limits colors, reports actual usage, and does not mutate input", () => {
    const input = gradient(16, 16);
    const original = new Uint8ClampedArray(input);
    const result = pixelatePhoto(input, 16, 16, options({maxColors: 5}));

    expect(input).toEqual(original);
    expect(result.colorCount).toBe(uniquePixels(result.pixels).size);
    expect(result.colorCount).toBe(result.palette.length);
    expect(result.colorCount).toBeLessThanOrEqual(5);
    expect(new Set(result.palette).size).toBe(result.palette.length);
    for (const color of result.palette) {
      const parsed = color.slice(1).match(/../g)!.map((value) => Number.parseInt(value, 16));
      expect(uniquePixels(result.pixels)).toContain(parsed.join(","));
    }
  });

  it("merges close palette colors deterministically", () => {
    const input = new Uint8ClampedArray([
      32, 32, 32, 255, 32, 32, 32, 255,
      48, 48, 48, 255, 48, 48, 48, 255,
    ]);
    const separate = pixelatePhoto(input, 4, 1, options({maxColors: 4}));
    const merged = pixelatePhoto(input, 4, 1, options({maxColors: 4, mergeThreshold: 7}));

    expect(separate.colorCount).toBe(2);
    expect(merged.colorCount).toBe(1);
    expect(merged).toEqual(pixelatePhoto(input, 4, 1, options({maxColors: 4, mergeThreshold: 7})));
  });

  it("merges every opaque RGB color at a 100 percent threshold", () => {
    const input = new Uint8ClampedArray([
      0, 0, 0, 255,
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
    ]);
    const result = pixelatePhoto(input, 4, 1, options({maxColors: 8, mergeThreshold: 100}));

    expect(result.colorCount).toBe(1);
    expect(result.palette).toHaveLength(1);
    expect(new Set(uniquePixels(result.pixels)).size).toBe(1);
  });

  it("keeps transparent pixels canonical and quantizes semi-transparent colors", () => {
    const input = new Uint8ClampedArray([
      200, 20, 10, 0,
      12, 80, 160, 64,
      12, 80, 160, 128,
      240, 220, 20, 255,
    ]);
    const result = pixelatePhoto(input, 4, 1, options({maxColors: 4}));

    expect(result.palette[0]).toBe("#00000000");
    expect(Array.from(result.pixels.slice(0, 4))).toEqual([0, 0, 0, 0]);
    expect(result.pixels[7]).toBeGreaterThan(0);
    expect(result.colorCount).toBeLessThanOrEqual(4);
  });

  it("reduces a fully transparent input to one canonical transparent color", () => {
    const input = new Uint8ClampedArray([
      255, 0, 0, 0,
      0, 255, 0, 0,
      0, 0, 255, 0,
      128, 128, 128, 0,
    ]);
    const result = pixelatePhoto(input, 2, 2, options({maxColors: 2}));

    expect(result.pixels).toEqual(new Uint8ClampedArray(16));
    expect(result.palette).toEqual(["#00000000"]);
    expect(result.colorCount).toBe(1);
  });

  it("keeps the total color count within two for mixed transparency", () => {
    const input = new Uint8ClampedArray([
      20, 40, 60, 0,
      20, 40, 60, 96,
      240, 180, 40, 255,
    ]);
    const result = pixelatePhoto(input, 3, 1, options({maxColors: 2}));

    expect(result.colorCount).toBeLessThanOrEqual(2);
    expect(result.palette.length).toBe(result.colorCount);
    expect(Array.from(result.pixels.slice(0, 4))).toEqual([0, 0, 0, 0]);
    expect(result.pixels[7]).toBeGreaterThan(0);
  });

  it.each(["none", "ordered", "floyd-steinberg"] as const)("supports %s dithering", (dither) => {
    const result = pixelatePhoto(gradient(8, 4), 8, 4, options({maxColors: 3, dither}));
    const repeated = pixelatePhoto(gradient(8, 4), 8, 4, options({maxColors: 3, dither}));

    expect(result.pixels).toEqual(repeated.pixels);
    expect(result.colorCount).toBeLessThanOrEqual(3);
    expect(result.palette.length).toBe(result.colorCount);
  });

  it("does not clear the first real color when no transparency exists", () => {
    const input = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]);
    const result = pixelatePhoto(input, 2, 1, options({maxColors: 2}));

    expect(result.palette).not.toContain("#00000000");
    expect(result.pixels[3]).toBe(255);
    expect(result.pixels[7]).toBe(255);
  });

  it("keeps all 256 opaque slots addressable without a synthetic transparent slot", () => {
    const input = opaque256Pixels();
    const result = pixelatePhoto(input, 256, 1, options({maxColors: 256}));

    expect(result.pixels[3]).toBe(255);
    expect(result.colorCount).toBe(256);
    expect(result.palette).not.toContain("#00000000");
  });

  it.each(["ordered", "floyd-steinberg"] as const)("keeps alpha opaque for 256 real colors with %s dithering", (dither) => {
    const result = pixelatePhoto(opaque256Pixels(), 256, 1, options({maxColors: 256, dither}));

    for (let offset = 3; offset < result.pixels.length; offset += 4) expect(result.pixels[offset]).toBe(255);
    expect(result.colorCount).toBeGreaterThan(0);
    expect(result.colorCount).toBeLessThanOrEqual(256);
  });

  it.each([[1, 1024], [1024, 1]] as const)("accepts the legal extreme size %sx%s", (width, height) => {
    const input = new Uint8ClampedArray(width * height * 4);
    input.fill(255);
    const result = pixelatePhoto(input, width, height, options({maxColors: 2}));

    expect(result.width).toBe(width);
    expect(result.height).toBe(height);
    expect(result.pixels.length).toBe(width * height * 4);
    expect(result.colorCount).toBe(1);
  });

  it("rejects invalid dimensions, buffers, and options", () => {
    const valid = new Uint8ClampedArray([0, 0, 0, 255]);
    expect(() => pixelatePhoto(valid, 0, 1, options())).toThrow();
    expect(() => pixelatePhoto(valid, 1025, 1, options())).toThrow();
    expect(() => pixelatePhoto(valid, 1, 1, options({maxColors: 1}))).toThrow();
    expect(() => pixelatePhoto(valid, 1, 1, options({maxColors: 257}))).toThrow();
    expect(() => pixelatePhoto(valid, 1, 1, options({mergeThreshold: -1}))).toThrow();
    expect(() => pixelatePhoto(valid, 1, 1, options({mergeThreshold: 101}))).toThrow();
    expect(() => pixelatePhoto(new Uint8ClampedArray(8), 1, 1, options())).toThrow();
    expect(() => pixelatePhoto(valid, 1, 1, {...options(), dither: "bad" as never})).toThrow();
  });
});

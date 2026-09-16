import {describe, expect, it} from "vitest";
import {
  adjustBrightnessContrastInPlace,
  adjustHsvHsl,
  adjustHsvInPlace,
  adjustHslInPlace,
  applyColorCurvesInPlace,
  applyConvolutionInPlace,
  applyDespeckleInPlace,
  applyMedianInPlace,
  applyChannelMaskInPlace,
  createCurveLut,
  invertPixelsInPlace,
  maskChannelsInPlace,
} from "./adjustments";

function pixel(...values: number[]) {
  return new Uint8ClampedArray(values);
}

describe("pixel color adjustments", () => {
  it("applies brightness and contrast in place while preserving alpha", () => {
    const pixels = pixel(20, 40, 60, 91, 200, 180, 160, 37);
    const result = adjustBrightnessContrastInPlace(pixels, {
      width: 2,
      height: 1,
      brightness: 10,
      contrast: 0,
    });

    expect(result).toBe(pixels);
    expect([...pixels]).toEqual([46, 66, 86, 91, 226, 206, 186, 37]);
  });

  it("limits adjustments to a rectangular selection", () => {
    const pixels = pixel(10, 20, 30, 255, 40, 50, 60, 255);
    adjustBrightnessContrastInPlace(pixels, {
      width: 2,
      height: 1,
      brightness: 100,
      selection: {x: 1, y: 0, width: 1, height: 1},
    });

    expect([...pixels]).toEqual([10, 20, 30, 255, 255, 255, 255, 255]);
  });

  it("blends soft selection coverage with the original pixel", () => {
    const pixels = pixel(100, 100, 100, 200);
    adjustBrightnessContrastInPlace(pixels, {
      width: 1,
      height: 1,
      brightness: 100,
      selection: {x: 0, y: 0, width: 1, height: 1, mask: new Uint8ClampedArray([128])},
    });

    expect([...pixels]).toEqual([178, 178, 178, 200]);
  });

  it("treats existing binary Uint8Array selection masks as fully selected", () => {
    const pixels = pixel(10, 20, 30, 255);
    adjustBrightnessContrastInPlace(pixels, {
      width: 1,
      height: 1,
      brightness: 100,
      selection: {x: 0, y: 0, width: 1, height: 1, mask: new Uint8Array([1])},
    });

    expect([...pixels]).toEqual([255, 255, 255, 255]);
  });

  it("rotates hue and preserves the source alpha", () => {
    const pixels = pixel(255, 0, 0, 77);
    adjustHslInPlace(pixels, {width: 1, height: 1, hue: 120});

    expect([...pixels]).toEqual([0, 255, 0, 77]);
  });

  it("supports saturation and lightness changes with channel masks", () => {
    const pixels = pixel(100, 150, 200, 88);
    adjustHslInPlace(pixels, {
      width: 1,
      height: 1,
      lightness: 20,
      channelMask: {red: true, green: false, blue: false},
    });

    expect(pixels[0]).toBeGreaterThan(100);
    expect(pixels[1]).toBe(150);
    expect(pixels[2]).toBe(200);
    expect(pixels[3]).toBe(88);
  });

  it("inverts RGB only by default and can explicitly include alpha", () => {
    const pixels = pixel(10, 20, 30, 40);
    invertPixelsInPlace(pixels, 1, 1);
    expect([...pixels]).toEqual([245, 235, 225, 40]);

    invertPixelsInPlace(pixels, 1, 1, {includeAlpha: true});
    expect([...pixels]).toEqual([10, 20, 30, 215]);
  });

  it("clears disabled channels and blends the clear through a soft selection", () => {
    const pixels = pixel(100, 80, 60, 40);
    maskChannelsInPlace(
      pixels,
      1,
      1,
      {green: false, alpha: false},
      {x: 0, y: 0, width: 1, height: 1, mask: new Uint8ClampedArray([128])},
    );

    expect([...pixels]).toEqual([100, 40, 60, 20]);
  });

  it("exports the explicit channel-mask alias", () => {
    const pixels = pixel(1, 2, 3, 4);
    applyChannelMaskInPlace(pixels, 1, 1, {red: false});
    expect([...pixels]).toEqual([0, 2, 3, 4]);
  });

  it("rejects buffers whose dimensions do not match", () => {
    expect(() => adjustBrightnessContrastInPlace(pixel(0, 0, 0, 0), {
      width: 2,
      height: 1,
    })).toThrow(/expected 8/);
  });

  it("convolves with odd kernels, clamping edge samples", () => {
    const pixels = pixel(
      0, 0, 0, 255,
      100, 0, 0, 255,
      200, 0, 0, 255,
    );
    applyConvolutionInPlace(pixels, {
      width: 3,
      height: 1,
      kernel: [1, 1, 1, 1, 1, 1, 1, 1, 1],
      divisor: 9,
      channelMask: {green: false, blue: false},
    });
    expect([pixels[0], pixels[4], pixels[8]]).toEqual([33, 100, 167]);
  });

  it("supports matrix kernels, bias, channel masks, and soft selections", () => {
    const pixels = pixel(10, 20, 30, 40);
    applyConvolutionInPlace(pixels, {
      width: 1,
      height: 1,
      kernel: [[1]],
      bias: 100,
      selection: {x: 0, y: 0, width: 1, height: 1, mask: new Uint8ClampedArray([128])},
      channelMask: {red: true, green: false, blue: false, alpha: true},
    });
    expect([...pixels]).toEqual([60, 20, 30, 90]);
  });

  it("removes isolated specks with both 3x3 and 5x5 median kernels", () => {
    const pixels = new Uint8ClampedArray(25 * 4);
    for (let index = 0; index < 25; index += 1) pixels[index * 4 + 3] = 255;
    pixels[(12 * 4)] = 255;
    applyMedianInPlace(pixels, {width: 5, height: 5, size: 3});
    expect(pixels[12 * 4]).toBe(0);

    const larger = new Uint8ClampedArray(25 * 4);
    for (let index = 0; index < 25; index += 1) larger[index * 4 + 3] = 255;
    larger[12 * 4] = 255;
    applyDespeckleInPlace(larger, {width: 5, height: 5, size: 5});
    expect(larger[12 * 4]).toBe(0);
  });

  it("builds per-channel curve LUTs and applies them through soft selection", () => {
    const lut = createCurveLut([[0, 0], [128, 255], [255, 0]]);
    expect(lut[0]).toBe(0);
    expect(lut[128]).toBe(255);
    expect(lut[64]).toBe(128);

    const pixels = pixel(64, 64, 64, 255, 64, 64, 64, 255);
    applyColorCurvesInPlace(pixels, {
      width: 2,
      height: 1,
      curves: {red: lut},
      selection: {x: 1, y: 0, width: 1, height: 1, mask: new Uint8ClampedArray([128])},
    });
    expect(pixels[0]).toBe(64);
    expect(pixels[4]).toBe(96);
  });

  it("supports relative and absolute HSV/HSL adjustment modes", () => {
    const relative = pixel(255, 0, 0, 77);
    adjustHsvInPlace(relative, {width: 1, height: 1, hue: 120});
    expect([...relative]).toEqual([0, 255, 0, 77]);

    const absolute = adjustHsvHsl(pixel(255, 0, 0, 77), {
      width: 1,
      height: 1,
      space: "hsv",
      mode: "absolute",
      hue: 240,
      saturation: 100,
      value: 100,
    });
    expect([...absolute]).toEqual([0, 0, 255, 77]);

    const hsl = adjustHsvHsl(pixel(255, 0, 0, 77), {width: 1, height: 1, space: "hsl", mode: "absolute", hue: 120, saturation: 100, lightness: 50});
    expect([...hsl]).toEqual([0, 255, 0, 77]);
  });
});

import {describe, expect, it} from "vitest";
import {
  clampByte,
  clampPercent,
  colorToRgbaBytes,
  hslaToRgba,
  normalizeHSLA,
  normalizeRGBA,
  parseHexColor,
  rgbToHsla,
  rgbaBytesToColor,
  rgbaToHex,
} from "./colorEditor";

describe("color editor conversions", () => {
  it("normalizes invalid RGB and alpha input without producing NaN", () => {
    expect(normalizeRGBA({r: "300", g: -2, b: "invalid", a: "125"})).toEqual({r: 255, g: 0, b: 0, a: 100});
    expect(normalizeRGBA({r: Number.NaN, a: Number.POSITIVE_INFINITY}, {r: 12, g: 34, b: 56, a: 78})).toEqual({r: 12, g: 34, b: 56, a: 78});
    expect(clampByte("not a number", 7)).toBe(7);
    expect(clampPercent("not a number", 42)).toBe(42);
  });

  it("wraps hue and clamps HSLA percentages", () => {
    expect(normalizeHSLA({h: -30, s: 120, l: -1, a: 101})).toEqual({h: 330, s: 100, l: 0, a: 100});
  });

  it("round-trips a color between RGB and HSL while preserving alpha", () => {
    const rgba = {r: 44, g: 155, b: 210, a: 37.5};
    const hsla = rgbToHsla(rgba);
    expect(hsla.a).toBe(37.5);
    expect(hslaToRgba(hsla)).toEqual(rgba);
  });

  it("handles grayscale HSLA values", () => {
    expect(hslaToRgba({h: 240, s: 0, l: 50, a: 25})).toEqual({r: 128, g: 128, b: 128, a: 25});
    expect(rgbToHsla({r: 0, g: 0, b: 0, a: 0})).toEqual({h: 0, s: 0, l: 0, a: 0});
  });

  it("converts editor alpha percentages to and from RGBA8 bytes", () => {
    expect(colorToRgbaBytes({r: 1, g: 2, b: 3, a: 50})).toEqual([1, 2, 3, 128]);
    expect(rgbaBytesToColor([1, 2, 3, 128])).toEqual({r: 1, g: 2, b: 3, a: 50.19607843137255});
  });

  it("parses short and full hex colors including optional alpha", () => {
    expect(parseHexColor("#3af")).toEqual({r: 51, g: 170, b: 255, a: 100});
    expect(parseHexColor("#12348080")).toEqual({r: 18, g: 52, b: 128, a: 50.19607843137255});
    expect(parseHexColor("not-a-color")).toBeNull();
  });

  it("serializes RGB and RGBA hex values", () => {
    const color = {r: 18, g: 52, b: 128, a: 50};
    expect(rgbaToHex(color)).toBe("#123480");
    expect(rgbaToHex(color, true)).toBe("#12348080");
  });
});

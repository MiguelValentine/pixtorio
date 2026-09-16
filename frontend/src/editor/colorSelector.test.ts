import {describe, expect, it} from "vitest";
import {hexToHsv, hsvToHex, mixHex, selectorColorAt, tintShadeToneColor} from "./colorSelector";

describe("color selector", () => {
  it("round-trips primary HSV colors", () => {
    expect(hexToHsv("#ff0000")).toEqual({h: 0, s: 1, v: 1});
    expect(hsvToHex({h: 120, s: 1, v: 1})).toBe("#00ff00");
    expect(hsvToHex({h: 240, s: 1, v: 1})).toBe("#0000ff");
  });

  it("selects saturation/value from the spectrum", () => {
    expect(selectorColorAt("spectrum", 0, 0, 11, 11, "#ff0000")).toBe("#ffffff");
    expect(selectorColorAt("spectrum", 10, 0, 11, 11, "#ff0000")).toBe("#ff0000");
    expect(selectorColorAt("spectrum", 10, 10, 11, 11, "#ff0000")).toBe("#000000");
  });

  it("creates tint, tone and shade variants", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(selectorColorAt("tint-shade-tone", 0, 0, 70, 30, "#ff0000")).not.toBe("#ff0000");
    expect(selectorColorAt("tint-shade-tone", 0, 29, 70, 30, "#ffffff")).not.toBe("#ffffff");
    expect(tintShadeToneColor("#ff0000", {column: 0, row: 0})).toBe("#ff2020");
    expect(tintShadeToneColor("#ff0000", {column: 0, row: 0})).toBe("#ff2020");
  });

  it("uses the wheel disk for hue/saturation and the strip for value", () => {
    expect(selectorColorAt("wheel", 50, 42, 100, 100, "#ffffff")).toBe("#ffffff");
    expect(selectorColorAt("wheel", 99, 99, 100, 100, "#ff0000")).toBe("#ff0000");
    expect(selectorColorAt("wheel", 0, 0, 100, 100, "#ff0000")).toBeNull();
  });
});

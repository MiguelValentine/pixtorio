import {describe, expect, it} from "vitest";
import {hexToHsv, hsvToHex, mixHex, selectorColorAt, tintShadeToneColor, wheelSelectorGeometry} from "./colorSelector";

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

  it("shares wheel geometry and selects the center", () => {
    const width = 240;
    const height = 252;
    const geometry = wheelSelectorGeometry(width, height);
    expect(geometry).toEqual({centerX: 120, centerY: 120, radius: 119, valueStripTop: 242, valueStripHeight: 10});
    expect(selectorColorAt("wheel", geometry.centerX, geometry.centerY, width, height, "#808080")).toBe("#808080");
  });

  it("rejects points outside the wheel disk", () => {
    const geometry = wheelSelectorGeometry(240, 252);
    expect(selectorColorAt("wheel", geometry.centerX + geometry.radius + 0.5, geometry.centerY, 240, 252, "#ff0000")).toBeNull();
    expect(selectorColorAt("wheel", 0, 0, 240, 252, "#ff0000")).toBeNull();
  });

  it("maps the wheel circumference to hue and full saturation", () => {
    const width = 240;
    const height = 252;
    const geometry = wheelSelectorGeometry(width, height);
    const right = selectorColorAt("wheel", geometry.centerX + geometry.radius, geometry.centerY, width, height, "#ffffff");
    const left = selectorColorAt("wheel", geometry.centerX - geometry.radius, geometry.centerY, width, height, "#ffffff");
    expect(right).not.toBeNull();
    expect(left).not.toBeNull();
    expect(hexToHsv(right!)).toEqual({h: 0, s: 1, v: 1});
    expect(hexToHsv(left!)).toEqual({h: 180, s: 1, v: 1});
  });

  it("keeps the value strip thin and accepts a strip click", () => {
    const width = 240;
    const height = 252;
    const geometry = wheelSelectorGeometry(width, height);
    expect(geometry.valueStripHeight).toBe(10);
    expect(selectorColorAt("wheel", width - 1, geometry.valueStripTop + 1, width, height, "#000000")).toBe("#ffffff");
  });
});

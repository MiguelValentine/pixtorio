import {describe, expect, it} from "vitest";
import {compositeTextMasks, hintTextPosition, layoutText, measureTextRun, normalizeTextToolSettings, stampRasterizedText} from "./textTool";

describe("text tool", () => {
  it("lays out normalized multiline text", () => {
    const layout = layoutText("ab\nc", 10, 1.5, (line) => line.length * 4);
    expect(layout).toEqual({lines: ["ab", "c"], widths: [8, 4], width: 8, height: 30, lineHeightPixels: 15});
    expect(normalizeTextToolSettings({text: "x", fontFamily: " ", fontSize: 900, lineHeight: 0, bold: false, italic: false, align: "left", antialias: true, color: [0, 0, 0, 255]})).toMatchObject({fontFamily: "sans-serif", fontSize: 512, lineHeight: 0.5});
    expect(normalizeTextToolSettings({text: "x", fontFamily: "Arial", fontSize: 12, lineHeight: 1, bold: false, italic: false, align: "left", antialias: false, color: [0, 0, 0, 255], strokeColor: [255, 255, 255, 255], strokeWidth: 99})).toMatchObject({strokeWidth: 64});
  });

  it("applies hinting precision and measures ligature-disabled runs per character", () => {
    expect(hintTextPosition(4.24, "none")).toBe(4.24);
    expect(hintTextPosition(4.24, "slight")).toBe(4);
    expect(hintTextPosition(4.6, "full")).toBe(5);
    const measure = (value: string) => value === "fi" ? 7.4 : value.length * 4.2;
    expect(measureTextRun("fi", measure, true, "none")).toBe(7.4);
    expect(measureTextRun("fi", measure, false, "none")).toBeCloseTo(8.4);
    expect(measureTextRun("fi", measure, false, "full")).toBe(8);
  });

  it("stamps alpha-composited pixels and respects soft selection", () => {
    const target = new Uint8ClampedArray([0, 0, 255, 255, 0, 0, 0, 0]);
    const source = {width: 2, height: 1, pixels: new Uint8ClampedArray([255, 0, 0, 128, 0, 255, 0, 255])};
    const selection = {x: 0, y: 0, width: 2, height: 1, mask: new Uint8Array([255, 128])};
    expect(stampRasterizedText(target, 2, 1, source, 0, 0, selection)).toBe(2);
    expect([...target.subarray(0, 4)]).toEqual([128, 0, 127, 255]);
    expect([...target.subarray(4, 8)]).toEqual([0, 255, 0, 128]);
  });

  it("keeps text coverage independent from the chosen colors", () => {
    const fillMask = new Uint8ClampedArray([0, 0, 0, 96, 0, 0, 0, 255]);
    const strokeMask = new Uint8ClampedArray([0, 0, 0, 180, 0, 0, 0, 0]);
    const red = compositeTextMasks(fillMask, strokeMask, [255, 0, 0, 255], [0, 0, 0, 255], true);
    const blue = compositeTextMasks(fillMask, strokeMask, [0, 0, 255, 255], [255, 255, 255, 255], true);
    expect([red[3], red[7]]).toEqual([blue[3], blue[7]]);
    expect(red[0]).not.toBe(blue[0]);
  });
});

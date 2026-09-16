import {describe, expect, it} from "vitest";
import {createDocument, getActiveCel} from "./document";
import {
  assignDocumentColorProfile,
  convertDocumentColorProfile,
  convertRGBColorProfile,
} from "./colorProfiles";

describe("color profiles", () => {
  it("converts between sRGB and Display P3 without changing alpha", () => {
    const p3 = convertRGBColorProfile([255, 0, 0, 123], "srgb", "display-p3");
    expect(p3[3]).toBe(123);
    expect(p3).not.toEqual([255, 0, 0, 123]);
    const roundTrip = convertRGBColorProfile(p3, "display-p3", "srgb");
    expect(roundTrip[0]).toBeGreaterThan(250);
    expect(roundTrip[1]).toBeLessThan(5);
    expect(roundTrip[2]).toBeLessThan(5);
  });

  it("distinguishes profile assignment from pixel conversion", () => {
    const document = createDocument({width: 1, height: 1});
    getActiveCel(document).pixels.set([240, 40, 20, 255]);
    const original = [...getActiveCel(document).pixels];
    expect(assignDocumentColorProfile(document, {type: "display-p3", name: "Display P3"})).toBe(true);
    expect([...getActiveCel(document).pixels]).toEqual(original);

    expect(convertDocumentColorProfile(document, {type: "srgb", name: "sRGB"})).toBe(true);
    expect([...getActiveCel(document).pixels]).not.toEqual(original);
    expect(document.colorProfile.type).toBe("srgb");
  });

  it("converts indexed palette colors and retains authoritative indexes", () => {
    const document = createDocument({width: 1, height: 1, colorMode: "indexed", palette: ["#00000000", "#ff0000ff"]});
    const cel = getActiveCel(document);
    cel.indexes![0] = 1;
    cel.pixels.set([255, 0, 0, 255]);
    expect(convertDocumentColorProfile(document, {type: "display-p3", name: "Display P3"})).toBe(true);
    expect(cel.indexes![0]).toBe(1);
    expect(document.palette.colors[1]).not.toBe("#ff0000ff");
    expect([...cel.pixels]).not.toEqual([255, 0, 0, 255]);
  });

  it("rejects conversion from an embedded profile without a color engine", () => {
    const document = createDocument({width: 1, height: 1});
    assignDocumentColorProfile(document, {type: "embedded", name: "Custom", data: new Uint8Array([1, 2, 3])});
    expect(() => convertDocumentColorProfile(document, {type: "srgb", name: "sRGB"})).toThrow(/assigned/);
  });
});

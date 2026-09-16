import {describe, expect, it} from "vitest";
import {
  constrainColorToMode,
  convertDocumentColorMode,
  exportGplPalette,
  exportJascPalette,
  extractPalette,
  indexPixels,
  parseGplPalette,
  parseJascPalette,
  parsePaletteText,
  sortPalette,
  refreshIndexedDocument,
  syncIndexedCel,
} from "./colorModes";
import {celKey, createDocument, getActiveCel} from "./document";
import {convertImageLayerToTilemap} from "./tilemap";

describe("color modes", () => {
  it("synchronizes live linked indexes but leaves detached effect previews isolated", () => {
    const document = createDocument({width: 1, height: 1, colorMode: "indexed", palette: ["#00000000", "#ff0000ff", "#0000ffff"]});
    const cel = getActiveCel(document)!;
    const alias = {...cel, id: "alias", frameId: "other"};
    document.cels[celKey(cel.layerId, "other")] = alias;
    cel.pixels.set([255, 0, 0, 255]);
    syncIndexedCel(document, cel);
    expect(alias.indexes).toBe(cel.indexes);
    expect([...alias.indexes!]).toEqual([1]);
    const preview = {...cel, pixels: new Uint8ClampedArray([0, 0, 255, 255])};
    syncIndexedCel(document, preview);
    expect([...preview.indexes!]).toEqual([2]);
    expect([...cel.indexes!]).toEqual([1]);
    expect([...alias.pixels]).toEqual([255, 0, 0, 255]);
  });
  it("constrains grayscale and indexed paint colors", () => {
    expect(constrainColorToMode([255, 0, 0, 128], "grayscale", [])).toEqual([76, 76, 76, 128]);
    expect(constrainColorToMode([240, 10, 10, 200], "indexed", ["#000000", "#ff0000"])).toEqual([255, 0, 0, 200]);
  });

  it("converts linked document buffers only once", () => {
    const document = createDocument({width: 1, height: 1});
    getActiveCel(document).pixels.set([20, 100, 220, 255]);
    expect(convertDocumentColorMode(document, "grayscale")).toBe(true);
    expect(document.colorMode).toBe("grayscale");
    expect([...getActiveCel(document).pixels]).toEqual([90, 90, 90, 255]);
  });

  it("keeps tile, tilemap cache, and indexed payloads synchronized", () => {
    const document = createDocument({
      width: 2,
      height: 1,
      palette: ["#00000000", "#ff0000ff"],
    });
    getActiveCel(document).pixels.set([255, 0, 0, 255, 0, 0, 0, 0]);
    const converted = convertImageLayerToTilemap(document, document.activeLayerId, {
      tileWidth: 1,
      tileHeight: 1,
    });
    document.layers = document.layers.map((layer) => layer.id === converted.layer.id ? converted.layer : layer);
    document.tilesets.push(converted.tileset);
    for (const cel of converted.cels) document.cels[`${cel.layerId}:${cel.frameId}`] = cel;

    expect(convertDocumentColorMode(document, "indexed")).toBe(true);
    expect([...document.tilesets[0].tiles[0].indexes!]).toEqual([1]);
    expect([...getActiveCel(document).indexes!]).toEqual([1, 0]);

    document.palette.colors[1] = "#00ff00ff";
    expect(refreshIndexedDocument(document)).toBe(true);
    expect([...document.tilesets[0].tiles[0].pixels]).toEqual([0, 255, 0, 255]);
    expect([...getActiveCel(document).pixels]).toEqual([0, 255, 0, 255, 0, 0, 0, 0]);

    expect(convertDocumentColorMode(document, "grayscale")).toBe(true);
    expect(document.tilesets[0].tiles[0].indexes).toBeUndefined();
    expect(getActiveCel(document).indexes).toBeUndefined();
    expect([...getActiveCel(document).pixels]).toEqual([150, 150, 150, 255, 0, 0, 0, 0]);
  });

  it("extracts frequent colors and sorts palette colors", () => {
    const colors = extractPalette([new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255])], 2);
    expect(colors[0]).toBe("#ff0000ff");
    expect(sortPalette(["#00ff00", "#ff0000", "#00ff00"])).toHaveLength(2);
  });

  it("keeps distinct alpha values when extracting palette colors", () => {
    const colors = extractPalette([new Uint8ClampedArray([
      255, 0, 0, 255,
      255, 0, 0, 128,
    ])]);
    expect(colors).toEqual(["#ff0000ff", "#ff000080"]);
  });

  it("supports deterministic indexed conversion and transparent pixels", () => {
    const pixels = new Uint8ClampedArray([
      10, 10, 10, 255,
      245, 245, 245, 255,
      0, 0, 0, 0,
    ]);
    expect([...indexPixels(pixels, ["#000000", "#ffffff"], 1)]).toEqual([0, 0, 1]);
    expect([...indexPixels(pixels, ["#000000", "#ffffff"], {transparentIndex: 1})]).toEqual([0, 0, 1]);
  });

  it("supports ordered and Floyd-Steinberg dithering with explicit dimensions", () => {
    const pixels = new Uint8ClampedArray([
      120, 120, 120, 255, 120, 120, 120, 255, 120, 120, 120, 255, 120, 120, 120, 255,
      120, 120, 120, 255, 120, 120, 120, 255, 120, 120, 120, 255, 120, 120, 120, 255,
    ]);
    const palette = ["#00000000", "#000000", "#ffffff"];
    const none = indexPixels(pixels, palette, {width: 4, height: 2, dither: "none"});
    const ordered = indexPixels(pixels, palette, {width: 4, height: 2, dither: "ordered"});
    const floyd = indexPixels(pixels, palette, {width: 4, height: 2, dither: "floyd-steinberg"});
    expect([...none]).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
    expect(new Set(ordered).size).toBeGreaterThan(1);
    expect(new Set(floyd).size).toBeGreaterThan(1);
    expect(() => indexPixels(pixels, palette, {width: 3, height: 3, dither: "none"})).toThrow(/dimensions/);
  });

  it("round trips GIMP GPL palettes including Pixtorio alpha annotations", () => {
    const text = exportGplPalette(["#ff0000ff", "#00ff0080", "#0000ff00"], "Test Palette");
    const parsed = parseGplPalette(text);
    expect(parsed.format).toBe("gpl");
    expect(parsed.name).toBe("Test Palette");
    expect(parsed.colors).toEqual(["#ff0000ff", "#00ff0080", "#0000ff00"]);
    expect(parsePaletteText(text).colors).toEqual(parsed.colors);
  });

  it("round trips JASC PAL palettes and rejects malformed rows", () => {
    const text = exportJascPalette({name: "Jasc", colors: ["#112233", "#445566cc"]});
    const parsed = parseJascPalette(text);
    expect(parsed.format).toBe("jasc-pal");
    expect(parsed.name).toBe("Jasc");
    expect(parsed.colors).toEqual(["#112233ff", "#445566cc"]);
    expect(() => parseJascPalette("JASC-PAL\n0100\n1\n255 0 nope\n")).toThrow(/row/);
    expect(() => parseGplPalette("GIMP Palette\nName: Broken\n300 0 0\n")).toThrow(/color/);
  });
});

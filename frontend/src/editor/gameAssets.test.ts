import {describe, expect, it} from "vitest";
import {createDocument} from "./document";
import {buildSpriteSheet, calculateSpriteSheetLayout, exportAtlasMetadata, exportSliceMetadata, exportSpriteSheetMetadata, packAtlas, sliceSpriteSheet, validAtlasOutputDimensions, validPNGImportDimensions} from "./gameAssets";

describe("game asset workflows", () => {
  it("shares the desktop PNG import dimension boundary", () => {
    expect(validPNGImportDimensions(1, 1)).toBe(true);
    expect(validPNGImportDimensions(2048, 2048)).toBe(true);
    expect(validPNGImportDimensions(2049, 1)).toBe(false);
    expect(validPNGImportDimensions(1, 2049)).toBe(false);
  });

  it("uses the larger shared atlas export dimension boundary", () => {
    expect(validAtlasOutputDimensions(2049, 1)).toBe(true);
    expect(validAtlasOutputDimensions(16384, 16384)).toBe(true);
    expect(validAtlasOutputDimensions(16385, 1)).toBe(false);
    expect(validAtlasOutputDimensions(1, 16385)).toBe(false);
  });

  it("builds sprite sheet geometry and pixels deterministically", () => {
    const first = new Uint8ClampedArray([255, 0, 0, 255]);
    const second = new Uint8ClampedArray([0, 255, 0, 255]);
    const layout = calculateSpriteSheetLayout(1, 1, 2, {layout: "horizontal", scale: 2, borderPadding: 1, framePadding: 1});
    expect(layout).toEqual({
      width: 7,
      height: 4,
      frames: [
        {x: 1, y: 1, width: 2, height: 2},
        {x: 4, y: 1, width: 2, height: 2},
      ],
    });
    const sheet = buildSpriteSheet([first, second], 1, 1, {layout: "horizontal", scale: 2, borderPadding: 1, framePadding: 1});
    expect(sheet.width).toBe(7);
    expect(sheet.height).toBe(4);
    expect(Array.from(sheet.pixels.slice((1 * 7 + 1) * 4, (1 * 7 + 1) * 4 + 4))).toEqual([255, 0, 0, 255]);
    expect(Array.from(sheet.pixels.slice((1 * 7 + 4) * 4, (1 * 7 + 4) * 4 + 4))).toEqual([0, 255, 0, 255]);
  });

  it("slices sheets with offsets and padding", () => {
    const pixels = new Uint8ClampedArray(5 * 2 * 4);
    pixels.fill(255);
    const result = sliceSpriteSheet(pixels, 5, 2, {frameWidth: 2, frameHeight: 2, paddingX: 1});
    expect(result.frames).toHaveLength(2);
    expect(result.frames[0]).toHaveLength(16);
  });

  it.each([
    ["horizontal", [[0, 0], [2, 0], [4, 0]]],
    ["vertical", [[0, 0], [0, 2], [0, 4]]],
    ["matrix", [[0, 0], [2, 0], [4, 0], [0, 2], [2, 2], [4, 2], [0, 4], [2, 4], [4, 4]]],
  ] as const)("slices %s sheets in the expected frame order", (layout, origins) => {
    const pixels = new Uint8ClampedArray(6 * 6 * 4);
    for (let y = 0; y < 6; y += 1) {
      for (let x = 0; x < 6; x += 1) {
        const offset = (y * 6 + x) * 4;
        pixels[offset] = x;
        pixels[offset + 1] = y;
        pixels[offset + 3] = 255;
      }
    }
    const result = sliceSpriteSheet(pixels, 6, 6, {frameWidth: 2, frameHeight: 2, layout});
    expect(result.frames.map((frame) => [frame[0], frame[1]])).toEqual(origins);
  });

  it("keeps offsets and padding for the selected import layout", () => {
    const pixels = new Uint8ClampedArray(7 * 7 * 4);
    for (let y = 0; y < 7; y += 1) {
      for (let x = 0; x < 7; x += 1) {
        const offset = (y * 7 + x) * 4;
        pixels[offset] = x;
        pixels[offset + 1] = y;
        pixels[offset + 3] = 255;
      }
    }
    const result = sliceSpriteSheet(pixels, 7, 7, {
      frameWidth: 2,
      frameHeight: 2,
      layout: "matrix",
      offsetX: 1,
      offsetY: 1,
      paddingX: 1,
      paddingY: 1,
    });
    expect(result.frames.map((frame) => [frame[0], frame[1]])).toEqual([[1, 1], [4, 1], [1, 4], [4, 4]]);
  });

  it("defaults to matrix and rejects unknown layouts", () => {
    const pixels = new Uint8ClampedArray(2 * 2 * 4);
    expect(sliceSpriteSheet(pixels, 2, 2, {frameWidth: 1, frameHeight: 1}).frames).toHaveLength(4);
    expect(() => sliceSpriteSheet(pixels, 2, 2, {frameWidth: 1, frameHeight: 1, layout: "diagonal" as never})).toThrow("layout");
  });

  it("packs trimmed frames and retains source rectangles", () => {
    const first = new Uint8ClampedArray(4 * 4 * 4);
    first.set([255, 0, 0, 255], (1 * 4 + 2) * 4);
    const atlas = packAtlas([first], 4, 4, ["frame-1"], [100]);
    expect(atlas.width).toBe(1);
    expect(atlas.height).toBe(1);
    expect(atlas.frames[0].spriteSourceSize).toEqual({x: 2, y: 1, width: 1, height: 1});
  });

  it("supports atlas output wider than the PNG import limit", () => {
    const width = 2049;
    const frame = new Uint8ClampedArray(width * 4);
    frame.fill(255);
    const atlas = packAtlas([frame], width, 1, ["large"], [100]);
    expect(atlas.width).toBe(width);
    expect(atlas.height).toBe(1);
  });

  it("rejects packed atlases whose height exceeds the export limit before allocation", () => {
    const frame = new Uint8ClampedArray([255, 0, 0, 255]);
    expect(() => packAtlas([frame, frame], 1, 1, ["one", "two"], [100, 100], 16384, 1)).toThrow("atlas dimensions");
  });

  it("exports slice, pivot and nine-patch data", () => {
    const document = createDocument({width: 16, height: 16});
    document.slices.push({id: "slice", name: "Button", color: "#ff0000ff", keys: [{
      frameId: document.activeFrameId,
      x: 1,
      y: 2,
      width: 10,
      height: 8,
      center: {x: 2, y: 2, width: 6, height: 4},
      pivot: {x: 5, y: 4},
    }]});
    expect(exportSliceMetadata(document).slices[0].keys[0].pivot).toEqual({x: 5, y: 4});
  });

  it("exports packed-atlas metadata with scaled geometry and project structure", () => {
    const document = createDocument({width: 2, height: 2});
    document.pixelAspectRatio = {width: 2, height: 1};
    document.tags.push({
      id: "tag",
      name: "Idle",
      fromFrameId: document.activeFrameId,
      toFrameId: document.activeFrameId,
      direction: "forward",
      color: "#ff0000ff",
      repeat: 0,
    });
    document.slices.push({id: "slice", name: "Button", color: "#00ff00ff", keys: [{
      frameId: document.activeFrameId,
      x: 1,
      y: 0,
      width: 1,
      height: 2,
      center: {x: 0, y: 0, width: 1, height: 1},
      pivot: {x: 1, y: 1},
    }]});
    const frame = new Uint8ClampedArray(4 * 2 * 4);
    frame[3] = 255;
    const atlas = packAtlas([frame], 4, 2, [document.activeFrameId], [120]);
    const metadata = exportAtlasMetadata(document, [document.activeFrameId], atlas, "sprite-atlas.png", {applyPixelRatio: true});

    expect(metadata.format).toBe("pixtorio-atlas-v1");
    expect(metadata.image).toBe("sprite-atlas.png");
    expect(metadata.canvas).toEqual({width: 4, height: 2});
    expect(metadata.sourceCanvas).toEqual({width: 2, height: 2});
    expect(metadata.appliedPixelRatio).toBe(true);
    expect(metadata.frames[0].sourceSize).toEqual({width: 4, height: 2});
    expect(metadata.tags[0].name).toBe("Idle");
    expect(metadata.layers[0].id).toBe(document.layers[0].id);
    expect(metadata.slices[0].keys[0]).toMatchObject({x: 2, y: 0, width: 2, height: 2});
    expect(metadata.slices[0].keys[0].center).toEqual({x: 0, y: 0, width: 2, height: 1});
    expect(metadata.slices[0].keys[0].pivot).toEqual({x: 2, y: 1});
  });

  it("exports complete metadata for ordinary sprite sheets", () => {
    const document = createDocument({width: 2, height: 1});
    document.tags.push({id: "tag", name: "Idle", fromFrameId: document.activeFrameId, toFrameId: document.activeFrameId, direction: "forward", color: "#ff0000ff", repeat: 0});
    const sheet = buildSpriteSheet([new Uint8ClampedArray(2 * 1 * 4)], 2, 1, {layout: "horizontal", scale: 2});
    const metadata = exportSpriteSheetMetadata(document, [document.activeFrameId], sheet, "sprite-sheet.png");
    expect(metadata.format).toBe("pixtorio-atlas-v1");
    expect(metadata.image).toBe("sprite-sheet.png");
    expect(metadata.width).toBe(4);
    expect(metadata.height).toBe(2);
    expect(metadata.frames[0]).toMatchObject({
      id: document.activeFrameId,
      frame: {x: 0, y: 0, width: 4, height: 2},
      sourceSize: {width: 2, height: 1},
      spriteSourceSize: {x: 0, y: 0, width: 2, height: 1},
      durationMs: 100,
    });
    expect(metadata.tags[0].name).toBe("Idle");
    expect(metadata.layers[0].id).toBe(document.layers[0].id);
  });
});

import {describe, expect, it} from "vitest";
import {createDocument} from "./document";
import {exportSliceMetadata, packAtlas, sliceSpriteSheet} from "./gameAssets";

describe("game asset workflows", () => {
  it("slices sheets with offsets and padding", () => {
    const pixels = new Uint8ClampedArray(5 * 2 * 4);
    pixels.fill(255);
    const result = sliceSpriteSheet(pixels, 5, 2, {frameWidth: 2, frameHeight: 2, paddingX: 1});
    expect(result.frames).toHaveLength(2);
    expect(result.frames[0]).toHaveLength(16);
  });

  it("packs trimmed frames and retains source rectangles", () => {
    const first = new Uint8ClampedArray(4 * 4 * 4);
    first.set([255, 0, 0, 255], (1 * 4 + 2) * 4);
    const atlas = packAtlas([first], 4, 4, ["frame-1"], [100]);
    expect(atlas.width).toBe(1);
    expect(atlas.height).toBe(1);
    expect(atlas.frames[0].spriteSourceSize).toEqual({x: 2, y: 1, width: 1, height: 1});
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
});

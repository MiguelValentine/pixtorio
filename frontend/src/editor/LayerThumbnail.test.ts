import {describe, expect, it} from "vitest";

import {copyThumbnailPixels, getThumbnailDestinationRect} from "./LayerThumbnail";

describe("LayerThumbnail pixel buffer handling", () => {
  it("copies a complete RGBA buffer", () => {
    const target = new Uint8ClampedArray(8);
    const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 128]);

    expect(copyThumbnailPixels(target, pixels)).toBe(true);
    expect(Array.from(target)).toEqual(Array.from(pixels));
  });

  it("rejects incomplete buffers without retaining stale target bytes and truncates oversized buffers", () => {
    const target = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]);

    expect(copyThumbnailPixels(target, new Uint8ClampedArray([9, 10, 11, 12]))).toBe(false);
    expect(Array.from(target)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    expect(copyThumbnailPixels(target, new Uint8ClampedArray([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]))).toBe(true);
    expect(Array.from(target)).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it("fits wide and tall pixels into the thumbnail without expanding the source buffer", () => {
    expect(getThumbnailDestinationRect(16, 8, 192, {width: 2, height: 1})).toEqual({x: 0, y: 72, width: 192, height: 48});
    expect(getThumbnailDestinationRect(8, 16, 192, {width: 1, height: 2})).toEqual({x: 72, y: 0, width: 48, height: 192});
  });

  it("keeps large ratios bounded to the thumbnail draw size", () => {
    const source = new Uint8ClampedArray([255, 0, 0, 255]);

    expect(getThumbnailDestinationRect(1, 1, 192, {width: 1_000_000_000, height: 1})).toEqual({x: 0, y: 95, width: 192, height: 1});
    expect(source).toHaveLength(4);
  });
});

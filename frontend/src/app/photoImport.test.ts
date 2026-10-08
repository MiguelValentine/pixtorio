import {afterEach, describe, expect, it, vi} from "vitest";
import {compositeFrame, getActiveCel} from "../editor/document";
import {decodeProject, encodeProject} from "../editor/serialization";
import {createPhotoDocument, fitPhotoDimensions, loadPhoto, maxPhotoFileBytes, samplePhoto, validatePhotoFile, type LoadedPhoto} from "./photoImport";

afterEach(() => vi.unstubAllGlobals());

describe("photo import", () => {
  it("fits landscape, portrait, tiny and extreme aspect ratios without upscaling", () => {
    expect(fitPhotoDimensions(6000, 4000)).toEqual({width: 128, height: 85});
    expect(fitPhotoDimensions(4000, 6000)).toEqual({width: 85, height: 128});
    expect(fitPhotoDimensions(12, 6)).toEqual({width: 12, height: 6});
    expect(fitPhotoDimensions(100000, 1)).toEqual({width: 128, height: 1});
  });

  it("accepts common raster files and rejects unsupported, empty and oversized files", () => {
    for (const name of ["photo.JPG", "photo.jpeg", "photo.png", "photo.webp", "photo.bmp"]) {
      expect(() => validatePhotoFile({name, size: 1024})).not.toThrow();
    }
    expect(() => validatePhotoFile({name: "photo.svg", size: 10})).toThrow("format");
    expect(() => validatePhotoFile({name: "photo.jpg", size: 0})).toThrow("file-size");
    expect(() => validatePhotoFile({name: "photo.png", size: maxPhotoFileBytes + 1})).toThrow("file-size");
  });

  it("revokes object URLs when decoding fails or the decoded source is oversized", async () => {
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {createObjectURL: () => "blob:photo", revokeObjectURL});
    vi.stubGlobal("Image", class {
      onerror?: () => void;
      set src(_: string) { this.onerror?.(); }
    });
    const file = new File(["image"], "photo.jpg");
    await expect(loadPhoto(file)).rejects.toThrow("decode");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:photo");
    vi.stubGlobal("Image", class {
      naturalWidth = 20000;
      naturalHeight = 20000;
      onload?: () => void;
      set src(_: string) { this.onload?.(); }
    });
    await expect(loadPhoto(file)).rejects.toThrow("source-size");
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it("samples large sources directly into the bounded output canvas", () => {
    const pixels = new Uint8ClampedArray(16 * 8 * 4);
    const context = {imageSmoothingEnabled: false, imageSmoothingQuality: "", drawImage: vi.fn(), getImageData: vi.fn(() => ({data: pixels}))};
    const canvas = {width: 0, height: 0, getContext: () => context};
    vi.stubGlobal("document", {createElement: () => canvas});
    const photo = {image: {}, width: 9000, height: 4500} as LoadedPhoto;
    expect(samplePhoto(photo, 16, 8, true)).toBe(pixels);
    expect(canvas).toMatchObject({width: 16, height: 8});
    expect(context.drawImage).toHaveBeenCalledWith(photo.image, 0, 0, 16, 8);
    expect(context.imageSmoothingEnabled).toBe(true);
    samplePhoto(photo, 16, 8, false);
    expect(context.imageSmoothingEnabled).toBe(false);
    for (const width of [0, -1, 1025, 1.5, NaN]) expect(() => samplePhoto(photo, width, 8, true)).toThrow("output-size");
  });

  it("creates an independent RGBA document with identical preview, compositor and strict-v5 round-trip pixels", () => {
    const result = {
      width: 3, height: 1,
      pixels: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 0, 0]),
      palette: ["#ff0000ff", "#00ff0080", "#00000000"],
      colorCount: 3,
    };
    const imported = createPhotoDocument("holiday.photo.jpg", result);
    expect(imported.name).toBe("holiday.photo-pixel.pixio");
    expect(imported.colorMode).toBe("rgba");
    expect(imported.palette.colors).toEqual(result.palette);
    expect(getActiveCel(imported).pixels).toEqual(result.pixels);
    expect(getActiveCel(imported).pixels).not.toBe(result.pixels);
    expect(imported.palette.colors).not.toBe(result.palette);
    expect(compositeFrame(imported)).toEqual(result.pixels);
    const encoded = encodeProject(imported);
    expect(JSON.parse(encoded).formatVersion).toBe(5);
    const reopened = decodeProject(encoded);
    expect(compositeFrame(reopened)).toEqual(result.pixels);
    expect(reopened.palette.colors).toEqual(result.palette);
  });
});

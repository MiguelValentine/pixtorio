import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {ClipboardReadImage, ClipboardWriteImage} from "../../wailsjs/go/main/App";
import {ClipboardGetText, ClipboardSetText} from "../../wailsjs/runtime/runtime";
import {
  browserPNGBlob, chooseBrowserFile, chooseBrowserFiles, decodeBrowserPNG,
  pixelClipboardBlob, readClipboardText, readPixelClipboardImage,
  writeClipboardText, writePixelClipboard,
} from "./platformIO";

vi.mock("../../wailsjs/go/main/App", () => ({
  ClipboardReadImage: vi.fn(),
  ClipboardWriteImage: vi.fn(),
}));
vi.mock("../../wailsjs/runtime/runtime", () => ({
  ClipboardGetText: vi.fn(),
  ClipboardSetText: vi.fn(),
}));

const pixels = new Uint8ClampedArray([10, 20, 30, 255]);
const clipboard = {width: 1, height: 1, pixels};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("window", {});
  vi.stubGlobal("navigator", {});
});
afterEach(() => vi.unstubAllGlobals());

function mockCanvas(available = true) {
  const blob = new Blob(["png"], {type: "image/png"});
  const context = {
    putImageData: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({data: pixels})),
  };
  const canvas = {
    width: 0, height: 0,
    getContext: vi.fn(() => available ? context : null),
    toBlob: vi.fn((done: (value: Blob) => void) => done(blob)),
  };
  vi.stubGlobal("document", {createElement: vi.fn(() => canvas)});
  vi.stubGlobal("ImageData", class {
    constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
  });
  return {canvas, context, blob};
}

describe("platform clipboard routing", () => {
  it("uses native text and image bridges when available", async () => {
    vi.stubGlobal("window", {go: {main: {App: {}}}, runtime: {}});
    vi.mocked(ClipboardGetText).mockResolvedValue("native");
    vi.mocked(ClipboardReadImage).mockResolvedValue(JSON.stringify({
      name: "clipboard", width: 1, height: 1, pixels: btoa(String.fromCharCode(...pixels)),
    }));
    await writeClipboardText("text");
    await writePixelClipboard(clipboard);
    expect(ClipboardSetText).toHaveBeenCalledWith("text");
    expect(ClipboardWriteImage).toHaveBeenCalledWith(1, 1, btoa(String.fromCharCode(...pixels)));
    expect(await readClipboardText()).toBe("native");
    expect(await readPixelClipboardImage()).toEqual(clipboard);
  });

  it("uses browser PNG clipboard writes and falls back to serialized text", async () => {
    const {blob} = mockCanvas();
    const write = vi.fn();
    const writeText = vi.fn();
    vi.stubGlobal("navigator", {clipboard: {write, writeText}});
    vi.stubGlobal("ClipboardItem", class {
      constructor(public data: Record<string, Blob>) {}
    });
    await writePixelClipboard(clipboard);
    expect(write.mock.calls[0][0][0].data["image/png"]).toBe(blob);
    expect(writeText).not.toHaveBeenCalled();
    vi.stubGlobal("navigator", {clipboard: {writeText}});
    await writePixelClipboard(clipboard);
    expect(writeText).toHaveBeenCalledOnce();
    expect(ClipboardWriteImage).not.toHaveBeenCalled();
  });

  it("returns empty results when clipboard access is unavailable", async () => {
    expect(await readClipboardText()).toBe("");
    expect(await readPixelClipboardImage()).toBeNull();
  });
});

describe("browser image resources", () => {
  it("shares PNG encoding while retaining source pixels", async () => {
    const {canvas, context, blob} = mockCanvas();
    expect(await browserPNGBlob(1, 1, pixels)).toBe(blob);
    expect(await pixelClipboardBlob(clipboard)).toBe(blob);
    expect(canvas.width).toBe(1);
    expect(canvas.height).toBe(1);
    expect(context.putImageData).toHaveBeenCalledTimes(2);
    expect(context.putImageData.mock.calls[0][0].data).toEqual(pixels);
    expect(context.putImageData.mock.calls[0][0].data).not.toBe(pixels);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");
  });

  it("preserves operation-specific errors when a canvas is unavailable", async () => {
    mockCanvas(false);
    await expect(browserPNGBlob(1, 1, pixels)).rejects.toThrow("PNG export is unavailable");
    await expect(pixelClipboardBlob(clipboard)).rejects.toThrow("Clipboard image is unavailable");
  });

  it.each([true, false])("closes imported bitmaps with an available canvas: %s", async (available) => {
    mockCanvas(available);
    const bitmap = {width: 1, height: 1, close: vi.fn()};
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
    const result = decodeBrowserPNG(new File(["png"], "sprite.png"));
    if (available) expect(await result).toEqual({...clipboard, name: "sprite.png"});
    else await expect(result).rejects.toThrow("PNG import is unavailable");
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("closes invalid browser clipboard bitmaps before rejecting them", async () => {
    const bitmap = {width: 0, height: 1, close: vi.fn()};
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
    vi.stubGlobal("navigator", {clipboard: {read: async () => [{
      types: ["image/png"], getType: async () => new Blob(),
    }]}});
    await expect(readPixelClipboardImage()).rejects.toThrow("Invalid clipboard image dimensions");
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});

describe("browser file selection", () => {
  it("retains the first single selection and naturally sorts multiple files", async () => {
    const files = [new File([], "frame10.png"), new File([], "frame2.png")];
    const input = {
      type: "", accept: "", multiple: false, files,
      onchange: () => {},
      click() { this.onchange(); },
    };
    vi.stubGlobal("document", {createElement: () => input});
    expect(await chooseBrowserFile(".png")).toBe(files[0]);
    expect(input.multiple).toBe(false);
    expect(input.accept).toBe(".png");
    expect(await chooseBrowserFiles(".png")).toEqual([files[1], files[0]]);
    expect(input.multiple).toBe(true);
    input.files = [];
    expect(await chooseBrowserFile(".png")).toBeNull();
    expect(await chooseBrowserFiles(".png")).toEqual([]);
  });
});

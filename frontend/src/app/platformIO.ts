import {GIFEncoder, applyPalette, quantize} from "gifenc";
import {ClipboardReadImage, ClipboardWriteImage} from "../../wailsjs/go/main/App";
import {ClipboardGetText, ClipboardSetText} from "../../wailsjs/runtime/runtime";
import {serializePixelClipboard} from "../editor/appHelpers";
import {validPNGImportDimensions} from "../editor/gameAssets";
import {resizePixels} from "../editor/pixelAspectRatio";
import type {PixelClipboard} from "../editor/selection";
import {bytesToBase64} from "../editor/serialization";
import {parsePNGResponse} from "./bridgeResponses";

type WailsWindow = Window & {
  go?: {main?: {App?: unknown}};
  runtime?: unknown;
};

export const hasWailsAppBridge = () => Boolean((window as WailsWindow).go?.main?.App);

export const hasWailsRuntimeBridge = () => Boolean((window as WailsWindow).runtime);

const webAPIBaseURL = "http://127.0.0.1:17353/api/pixio";

export async function writeClipboardText(value: string) {
  if (hasWailsRuntimeBridge()) return ClipboardSetText(value);
  if (navigator.clipboard) await navigator.clipboard.writeText(value);
}

export async function readClipboardText() {
  if (hasWailsRuntimeBridge()) return ClipboardGetText();
  return navigator.clipboard?.readText() ?? "";
}

function encodePixelsAsPNG(width: number, height: number, pixels: Uint8ClampedArray, unavailableMessage: string) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error(unavailableMessage);
  context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  return canvasBlob(canvas, "image/png");
}

export async function pixelClipboardBlob(clipboard: PixelClipboard) {
  return encodePixelsAsPNG(clipboard.width, clipboard.height, clipboard.pixels, "Clipboard image is unavailable");
}

export async function writePixelClipboard(clipboard: PixelClipboard) {
  if (hasWailsAppBridge()) {
    await ClipboardWriteImage(clipboard.width, clipboard.height, bytesToBase64(clipboard.pixels));
    return;
  }
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    const blob = await pixelClipboardBlob(clipboard);
    await navigator.clipboard.write([new ClipboardItem({"image/png": blob})]);
    return;
  }
  await writeClipboardText(serializePixelClipboard(clipboard));
}

export async function readPixelClipboardImage(): Promise<PixelClipboard | null> {
  if (hasWailsAppBridge()) {
    const payload = await ClipboardReadImage();
    if (!payload) return null;
    const image = parsePNGResponse(payload);
    return {width: image.width, height: image.height, pixels: image.pixels};
  }
  if (!navigator.clipboard?.read) return null;
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const type = item.types.find((candidate) => candidate.startsWith("image/"));
    if (!type) continue;
    const bitmap = await createImageBitmap(await item.getType(type));
    try {
      if (!validPNGImportDimensions(bitmap.width, bitmap.height)) throw new Error("Invalid clipboard image dimensions");
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.drawImage(bitmap, 0, 0);
      return {width: bitmap.width, height: bitmap.height, pixels: context.getImageData(0, 0, bitmap.width, bitmap.height).data};
    } finally {
      bitmap.close();
    }
  }
  return null;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function canvasBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Export failed")), type);
  });
}

function chooseBrowserFilesRaw(accept: string, multiple: boolean) {
  return new Promise<File[]>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
}

export async function chooseBrowserFile(accept: string) {
  const files = await chooseBrowserFilesRaw(accept, false);
  return files[0] ?? null;
}

export async function chooseBrowserFiles(accept: string) {
  const files = await chooseBrowserFilesRaw(accept, true);
  return files.sort((left, right) => left.name.localeCompare(right.name, undefined, {numeric: true}));
}

export async function decodeBrowserPNG(file: File) {
  const image = await createImageBitmap(file);
  try {
    if (!validPNGImportDimensions(image.width, image.height)) throw new Error("invalid PNG dimensions");
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", {willReadFrequently: true});
    if (!context) throw new Error("PNG import is unavailable");
    context.drawImage(image, 0, 0);
    return {name: file.name, width: canvas.width, height: canvas.height, pixels: context.getImageData(0, 0, canvas.width, canvas.height).data};
  } finally {
    image.close();
  }
}

export async function browserPNGBlob(width: number, height: number, pixels: Uint8ClampedArray) {
  return encodePixelsAsPNG(width, height, pixels, "PNG export is unavailable");
}

export function browserGIFBlob(width: number, height: number, frames: Uint8ClampedArray[], durations: number[], loopCount: number, scale = 1) {
  const encoder = GIFEncoder();
  const outputWidth = width * scale;
  const outputHeight = height * scale;
  for (let index = 0; index < frames.length; index += 1) {
    const frame = scale === 1 ? frames[index] : resizePixels(width, height, frames[index], scale, scale).pixels;
    const palette = quantize(frame, 256, {format: "rgba4444", oneBitAlpha: true});
    const transparentIndex = palette.findIndex((color) => color[3] === 0);
    encoder.writeFrame(applyPalette(frame, palette, "rgba4444"), outputWidth, outputHeight, {
      palette,
      delay: durations[index],
      repeat: index === 0 ? loopCount : undefined,
      transparent: transparentIndex >= 0,
      transparentIndex: transparentIndex >= 0 ? transparentIndex : 0,
    });
  }
  encoder.finish();
  return new Blob([new Uint8Array(encoder.bytes())], {type: "image/gif"});
}

export async function webEncodePixio(document: string) {
  const response = await fetch(`${webAPIBaseURL}/encode`, {method: "POST", headers: {"Content-Type": "application/json"}, body: document});
  if (!response.ok) throw new Error(await response.text());
  return response.blob();
}

export async function webDecodePixio(file: File) {
  const response = await fetch(`${webAPIBaseURL}/decode`, {method: "POST", headers: {"Content-Type": "application/octet-stream"}, body: file});
  if (!response.ok) throw new Error(await response.text());
  return response.text();
}

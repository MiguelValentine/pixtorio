import type {TagDirection} from "./document";
import type {PixelClipboard} from "./selection";

const pixelClipboardFormat = "pixtorio-selection-v1" as const;

interface PixelClipboardPayload {
  format: typeof pixelClipboardFormat;
  width: number;
  height: number;
  pixels: number[];
  mask?: number[];
}

function isPositiveDimension(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isByte(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255;
}

function isByteList(value: unknown, expectedLength: number): value is number[] {
  return Array.isArray(value)
    && value.length === expectedLength
    && value.every(isByte);
}

function isSelectionMask(value: unknown, expectedLength: number): value is number[] {
  return Array.isArray(value)
    && value.length === expectedLength
    && value.every(isByte);
}

/** Serializes the internal clipboard into the text payload shared between Pixtorio documents. */
export function serializePixelClipboard(clipboard: PixelClipboard): string {
  if (!isPositiveDimension(clipboard.width) || !isPositiveDimension(clipboard.height)) {
    throw new Error("Invalid clipboard dimensions");
  }
  const area = clipboard.width * clipboard.height;
  if (!Number.isSafeInteger(area) || !isByteList(Array.from(clipboard.pixels), area * 4)) {
    throw new Error("Invalid clipboard pixels");
  }
  if (clipboard.mask !== undefined && !isSelectionMask(Array.from(clipboard.mask), area)) {
    throw new Error("Invalid clipboard mask");
  }

  const payload: PixelClipboardPayload = {
    format: pixelClipboardFormat,
    width: clipboard.width,
    height: clipboard.height,
    pixels: Array.from(clipboard.pixels),
  };
  if (clipboard.mask !== undefined) payload.mask = Array.from(clipboard.mask);
  return JSON.stringify(payload);
}

/** Parses a system clipboard payload, returning null for unrelated or malformed text. */
export function deserializePixelClipboard(payload: string): PixelClipboard | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const value = parsed as Record<string, unknown>;
  if (value.format !== pixelClipboardFormat
    || !isPositiveDimension(value.width)
    || !isPositiveDimension(value.height)) return null;

  const area = value.width * value.height;
  if (!Number.isSafeInteger(area) || !isByteList(value.pixels, area * 4)) return null;

  const clipboard: PixelClipboard = {
    width: value.width,
    height: value.height,
    pixels: Uint8ClampedArray.from(value.pixels),
  };
  if (Object.prototype.hasOwnProperty.call(value, "mask")) {
    if (!isSelectionMask(value.mask, area)) return null;
    clipboard.mask = Uint8Array.from(value.mask);
  }
  return clipboard;
}

/** Orders an already range-limited sequence for a frame tag's playback direction. */
export function orderFrameIDs(frameIDs: readonly string[], direction: TagDirection): string[] {
  const ordered = [...frameIDs];
  if (direction === "reverse") return ordered.reverse();
  if (direction !== "pingpong" || ordered.length <= 2) return ordered;
  return [...ordered, ...ordered.slice(1, -1).reverse()];
}

/** Runs tasks for the same key in request order while allowing other keys to proceed. */
export function enqueueSerialTask(
  queues: Map<string, Promise<void>>,
  key: string,
  task: () => Promise<void>,
): Promise<void> {
  const previous = queues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  queues.set(key, current);
  void current.finally(() => {
    if (queues.get(key) === current) queues.delete(key);
  }).catch(() => undefined);
  return current;
}

import {
  compositeFrame,
  compositeFrameRegion,
  type PixelBounds,
  type PixelDocument,
} from "./document";

export const defaultCompositeCacheLimitBytes = 64 * 1024 * 1024;

/**
 * Keeps the flattened result for each frame. Pixel edits repair only their
 * dirty rectangle; document-structure edits explicitly discard the cache.
 */
export class FrameCompositeCache {
  private readonly frames = new Map<string, Uint8ClampedArray>();
  private retainedBytes = 0;

  constructor(private readonly maxBytes = defaultCompositeCacheLimitBytes) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error("Composite cache limit must be a non-negative integer");
  }

  get byteSize() {
    return this.retainedBytes;
  }

  clear() {
    this.frames.clear();
    this.retainedBytes = 0;
  }

  get(document: PixelDocument, frameId = document.activeFrameId) {
    let pixels = this.frames.get(frameId);
    if (pixels && pixels.length === document.width * document.height * 4) {
      this.frames.delete(frameId);
      this.frames.set(frameId, pixels);
      return pixels;
    }
    if (pixels) this.remove(frameId);
    if (!pixels || pixels.length !== document.width * document.height * 4) {
      pixels = compositeFrame(document, frameId);
      this.store(frameId, pixels);
    }
    return pixels;
  }

  repair(document: PixelDocument, frameId: string, bounds: PixelBounds) {
    const pixels = this.get(document, frameId);
    const clipped = clipPixelBounds(bounds, document.width, document.height);
    if (!clipped) return pixels;
    const patch = compositeFrameRegion(document, clipped, frameId);
    for (let row = 0; row < clipped.height; row += 1) {
      const sourceStart = row * clipped.width * 4;
      const targetStart = ((clipped.y + row) * document.width + clipped.x) * 4;
      pixels.set(patch.subarray(sourceStart, sourceStart + clipped.width * 4), targetStart);
    }
    return pixels;
  }

  private store(frameId: string, pixels: Uint8ClampedArray) {
    if (pixels.byteLength > this.maxBytes) return;
    this.remove(frameId);
    while (this.retainedBytes + pixels.byteLength > this.maxBytes) {
      const oldest = this.frames.keys().next().value as string | undefined;
      if (!oldest) break;
      this.remove(oldest);
    }
    this.frames.set(frameId, pixels);
    this.retainedBytes += pixels.byteLength;
  }

  private remove(frameId: string) {
    const pixels = this.frames.get(frameId);
    if (!pixels) return;
    this.frames.delete(frameId);
    this.retainedBytes -= pixels.byteLength;
  }
}

function clipPixelBounds(bounds: PixelBounds, canvasWidth: number, canvasHeight: number): PixelBounds | null {
  const left = Math.max(0, Math.floor(bounds.x));
  const top = Math.max(0, Math.floor(bounds.y));
  const right = Math.min(canvasWidth, Math.ceil(bounds.x + bounds.width));
  const bottom = Math.min(canvasHeight, Math.ceil(bounds.y + bounds.height));
  if (right <= left || bottom <= top) return null;
  return {x: left, y: top, width: right - left, height: bottom - top};
}

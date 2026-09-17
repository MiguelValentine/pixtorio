export interface PixelAspectRatio {
  width: number;
  height: number;
}

export interface ResizedPixels {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

/** Normalize a stored ratio so equivalent values (for example 2:2) export identically. */
export function normalizePixelAspectRatio(ratio: PixelAspectRatio): PixelAspectRatio {
  const width = positiveInteger(ratio.width, "Pixel aspect width");
  const height = positiveInteger(ratio.height, "Pixel aspect height");
  const divisor = greatestCommonDivisor(width, height);
  return {width: width / divisor, height: height / divisor};
}

/** Expand each source pixel into a nearest-neighbor rectangle for square-pixel output. */
export function applyPixelAspectRatio(
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
  ratio: PixelAspectRatio,
): ResizedPixels {
  const normalized = normalizePixelAspectRatio(ratio);
  return resizePixels(width, height, pixels, normalized.width, normalized.height);
}

export function resizePixels(
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
  scaleX: number,
  scaleY: number,
): ResizedPixels {
  positiveInteger(width, "Image width");
  positiveInteger(height, "Image height");
  positiveInteger(scaleX, "Horizontal scale");
  positiveInteger(scaleY, "Vertical scale");
  if (pixels.length !== width * height * 4) throw new Error("Invalid RGBA pixel buffer");

  const outputWidth = width * scaleX;
  const outputHeight = height * scaleY;
  if (!Number.isSafeInteger(outputWidth) || !Number.isSafeInteger(outputHeight)) throw new Error("Resized image dimensions overflow");
  const output = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (y * width + x) * 4;
      for (let scaledY = 0; scaledY < scaleY; scaledY += 1) {
        const rowOffset = ((y * scaleY + scaledY) * outputWidth + x * scaleX) * 4;
        for (let scaledX = 0; scaledX < scaleX; scaledX += 1) {
          output.set(pixels.subarray(sourceOffset, sourceOffset + 4), rowOffset + scaledX * 4);
        }
      }
    }
  }
  return {width: outputWidth, height: outputHeight, pixels: output};
}

function positiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
  return value;
}

function greatestCommonDivisor(left: number, right: number) {
  while (right !== 0) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }
  return left;
}

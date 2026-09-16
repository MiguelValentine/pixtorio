export interface PixelPatch {
  x: number;
  y: number;
  width: number;
  height: number;
  before: Uint8ClampedArray;
  after: Uint8ClampedArray;
}

export function setPixel(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  color: readonly [number, number, number, number],
) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const index = (y * width + x) * 4;
  pixels.set(color, index);
}

export function drawLine(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: readonly [number, number, number, number],
) {
  let x = fromX;
  let y = fromY;
  const dx = Math.abs(toX - fromX);
  const sx = fromX < toX ? 1 : -1;
  const dy = -Math.abs(toY - fromY);
  const sy = fromY < toY ? 1 : -1;
  let error = dx + dy;

  while (true) {
    setPixel(pixels, width, height, x, y, color);
    if (x === toX && y === toY) return;
    const twiceError = error * 2;
    if (twiceError >= dy) {
      error += dy;
      x += sx;
    }
    if (twiceError <= dx) {
      error += dx;
      y += sy;
    }
  }
}

export function createPatch(
  before: Uint8ClampedArray,
  after: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
): PixelPatch | null {
  let minX = canvasWidth;
  let minY = canvasHeight;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < canvasHeight; y += 1) {
    for (let x = 0; x < canvasWidth; x += 1) {
      const index = (y * canvasWidth + x) * 4;
      if (
        before[index] !== after[index] ||
        before[index + 1] !== after[index + 1] ||
        before[index + 2] !== after[index + 2] ||
        before[index + 3] !== after[index + 3]
      ) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < 0) return null;

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  return {
    x: minX,
    y: minY,
    width,
    height,
    before: copyRegion(before, canvasWidth, minX, minY, width, height),
    after: copyRegion(after, canvasWidth, minX, minY, width, height),
  };
}

export function applyPatch(
  pixels: Uint8ClampedArray,
  canvasWidth: number,
  patch: PixelPatch,
  direction: "before" | "after",
) {
  const source = patch[direction];
  for (let row = 0; row < patch.height; row += 1) {
    const sourceStart = row * patch.width * 4;
    const targetStart = ((patch.y + row) * canvasWidth + patch.x) * 4;
    pixels.set(source.subarray(sourceStart, sourceStart + patch.width * 4), targetStart);
  }
}

export function hexToRGBA(hex: string): [number, number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
}

export function rgbaToHex(color: readonly [number, number, number, number]) {
  return `#${color.slice(0, 3).map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function copyRegion(
  pixels: Uint8ClampedArray,
  canvasWidth: number,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const copy = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const sourceStart = ((y + row) * canvasWidth + x) * 4;
    const targetStart = row * width * 4;
    copy.set(pixels.subarray(sourceStart, sourceStart + width * 4), targetStart);
  }
  return copy;
}

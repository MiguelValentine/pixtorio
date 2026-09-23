import type {BlendMode, Cel} from "./document";

/**
 * Pixel-only compositing primitives. Document traversal and layer semantics
 * stay in document.ts; this module only combines RGBA buffers and Cels.
 */

export function compositeCel(
  output: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  cel: Cel,
  opacity: number,
  blendMode: BlendMode,
) {
  const layerOpacity = Math.max(0, Math.min(1, opacity * cel.opacity));
  if (layerOpacity <= 0) return;
  if (blendMode === "normal") {
    compositeNormalCel(output, canvasWidth, canvasHeight, cel, layerOpacity);
    return;
  }
  compositeBlendCel(output, canvasWidth, canvasHeight, cel, layerOpacity, blendMode);
}

export function compositeTintedCel(
  output: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  cel: Cel,
  opacity: number,
  tint: readonly [number, number, number, number],
) {
  const normalizedOpacity = Math.max(0, Math.min(1, opacity * cel.opacity));
  if (normalizedOpacity <= 0) return;
  const startX = Math.max(0, -cel.x);
  const endX = Math.min(cel.width, canvasWidth - cel.x);
  const startY = Math.max(0, -cel.y);
  const endY = Math.min(cel.height, canvasHeight - cel.y);

  for (let celY = startY; celY < endY; celY += 1) {
    for (let celX = startX; celX < endX; celX += 1) {
      const sourceIndex = (celY * cel.width + celX) * 4;
      const sourceAlpha = (cel.pixels[sourceIndex + 3] / 255) * normalizedOpacity * (tint[3] / 255);
      if (sourceAlpha <= 0) continue;
      const targetIndex = ((cel.y + celY) * canvasWidth + cel.x + celX) * 4;
      const targetAlpha = output[targetIndex + 3] / 255;
      const targetContribution = targetAlpha * (1 - sourceAlpha);
      const outputAlpha = sourceAlpha + targetContribution;
      output[targetIndex] = Math.round((tint[0] * sourceAlpha + output[targetIndex] * targetContribution) / outputAlpha);
      output[targetIndex + 1] = Math.round((tint[1] * sourceAlpha + output[targetIndex + 1] * targetContribution) / outputAlpha);
      output[targetIndex + 2] = Math.round((tint[2] * sourceAlpha + output[targetIndex + 2] * targetContribution) / outputAlpha);
      output[targetIndex + 3] = Math.round(outputAlpha * 255);
    }
  }
}

export function compositeBuffer(target: Uint8ClampedArray, source: Uint8ClampedArray, opacity: number, blendMode: BlendMode) {
  if (blendMode === "normal") {
    compositeNormalBuffer(target, source, opacity);
    return;
  }
  for (let offset = 0; offset < target.length; offset += 4) {
    blendPixel(target, offset, source, offset, opacity, blendMode);
  }
}

function compositeNormalCel(
  output: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  cel: Cel,
  opacity: number,
) {
  const startX = Math.max(0, -cel.x);
  const endX = Math.min(cel.width, canvasWidth - cel.x);
  const startY = Math.max(0, -cel.y);
  const endY = Math.min(cel.height, canvasHeight - cel.y);
  const rowWidth = endX - startX;
  if (rowWidth <= 0 || endY <= startY) return;

  let sourceRowIndex = (startY * cel.width + startX) * 4;
  let targetRowIndex = ((cel.y + startY) * canvasWidth + cel.x + startX) * 4;
  const sourceRowStride = cel.width * 4;
  const targetRowStride = canvasWidth * 4;
  const rowEndOffset = rowWidth * 4;
  const opacityScale = opacity / 255;

  for (let row = startY; row < endY; row += 1) {
    let sourceIndex = sourceRowIndex;
    let targetIndex = targetRowIndex;
    const sourceEndIndex = sourceIndex + rowEndOffset;
    while (sourceIndex < sourceEndIndex) {
      blendNormalPixel(output, targetIndex, cel.pixels, sourceIndex, opacityScale);
      sourceIndex += 4;
      targetIndex += 4;
    }
    sourceRowIndex += sourceRowStride;
    targetRowIndex += targetRowStride;
  }
}

function compositeBlendCel(
  output: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  cel: Cel,
  opacity: number,
  blendMode: BlendMode,
) {
  for (let celY = 0; celY < cel.height; celY += 1) {
    const canvasY = cel.y + celY;
    if (canvasY < 0 || canvasY >= canvasHeight) continue;
    for (let celX = 0; celX < cel.width; celX += 1) {
      const canvasX = cel.x + celX;
      if (canvasX < 0 || canvasX >= canvasWidth) continue;
      const sourceIndex = (celY * cel.width + celX) * 4;
      const targetIndex = (canvasY * canvasWidth + canvasX) * 4;
      blendPixel(output, targetIndex, cel.pixels, sourceIndex, opacity, blendMode);
    }
  }
}

function compositeNormalBuffer(target: Uint8ClampedArray, source: Uint8ClampedArray, opacity: number) {
  const opacityScale = opacity / 255;
  for (let offset = 0; offset < target.length; offset += 4) {
    blendNormalPixel(target, offset, source, offset, opacityScale);
  }
}

/**
 * Normal source-over uses a caller-precomputed alpha scale to keep division
 * out of the per-pixel hot path.
 */
function blendNormalPixel(
  target: Uint8ClampedArray,
  targetIndex: number,
  source: Uint8ClampedArray,
  sourceIndex: number,
  opacityScale: number,
) {
  const sourceAlpha = source[sourceIndex + 3] * opacityScale;
  if (sourceAlpha <= 0) return;
  if (sourceAlpha === 1) {
    target[targetIndex] = source[sourceIndex];
    target[targetIndex + 1] = source[sourceIndex + 1];
    target[targetIndex + 2] = source[sourceIndex + 2];
    target[targetIndex + 3] = 255;
    return;
  }
  const targetAlpha = target[targetIndex + 3] / 255;
  if (targetAlpha === 0) {
    target[targetIndex] = source[sourceIndex];
    target[targetIndex + 1] = source[sourceIndex + 1];
    target[targetIndex + 2] = source[sourceIndex + 2];
    target[targetIndex + 3] = Math.round(sourceAlpha * 255);
    return;
  }
  const targetContribution = targetAlpha * (1 - sourceAlpha);
  const outputAlpha = sourceAlpha + targetContribution;
  target[targetIndex] = Math.round(
    (source[sourceIndex] * sourceAlpha + target[targetIndex] * targetContribution) / outputAlpha,
  );
  target[targetIndex + 1] = Math.round(
    (source[sourceIndex + 1] * sourceAlpha + target[targetIndex + 1] * targetContribution) / outputAlpha,
  );
  target[targetIndex + 2] = Math.round(
    (source[sourceIndex + 2] * sourceAlpha + target[targetIndex + 2] * targetContribution) / outputAlpha,
  );
  target[targetIndex + 3] = Math.round(outputAlpha * 255);
}

function blendPixel(
  target: Uint8ClampedArray,
  targetIndex: number,
  source: Uint8ClampedArray,
  sourceIndex: number,
  opacity: number,
  blendMode: BlendMode,
) {
  const sourceAlpha = (source[sourceIndex + 3] / 255) * opacity;
  if (sourceAlpha <= 0) return;
  const targetAlpha = target[targetIndex + 3] / 255;
  const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
  const backdrop: BlendColor = [
    target[targetIndex] / 255,
    target[targetIndex + 1] / 255,
    target[targetIndex + 2] / 255,
  ];
  const sourceColor: BlendColor = [
    source[sourceIndex] / 255,
    source[sourceIndex + 1] / 255,
    source[sourceIndex + 2] / 255,
  ];
  const blendedColor = blendMode === "hue" || blendMode === "saturation" || blendMode === "color" || blendMode === "luminosity"
    ? blendNonSeparable(backdrop, sourceColor, blendMode)
    : null;

  for (let channel = 0; channel < 3; channel += 1) {
    const sourceValue = sourceColor[channel];
    const targetValue = backdrop[channel];
    const blended = blendedColor?.[channel] ?? blendChannel(targetValue, sourceValue, blendMode);
    target[targetIndex + channel] = Math.round(
      255 * (
        sourceValue * sourceAlpha * (1 - targetAlpha)
        + targetValue * targetAlpha * (1 - sourceAlpha)
        + blended * sourceAlpha * targetAlpha
      ) / outputAlpha,
    );
  }
  target[targetIndex + 3] = Math.round(outputAlpha * 255);
}

type BlendColor = [number, number, number];

function blendNonSeparable(backdrop: BlendColor, source: BlendColor, blendMode: "hue" | "saturation" | "color" | "luminosity"): BlendColor {
  switch (blendMode) {
    case "hue": return setLuminosity(setSaturation(source, saturation(backdrop)), luminosity(backdrop));
    case "saturation": return setLuminosity(setSaturation(backdrop, saturation(source)), luminosity(backdrop));
    case "color": return setLuminosity(source, luminosity(backdrop));
    case "luminosity": return setLuminosity(backdrop, luminosity(source));
  }
}

function luminosity(color: BlendColor) {
  return 0.3 * color[0] + 0.59 * color[1] + 0.11 * color[2];
}

function saturation(color: BlendColor) {
  return Math.max(...color) - Math.min(...color);
}

function setLuminosity(color: BlendColor, target: number): BlendColor {
  const delta = target - luminosity(color);
  return clipBlendColor([color[0] + delta, color[1] + delta, color[2] + delta]);
}

function clipBlendColor(color: BlendColor): BlendColor {
  const lightness = luminosity(color);
  const minimum = Math.min(...color);
  const maximum = Math.max(...color);
  let result: BlendColor = [...color];
  if (minimum < 0) result = result.map((component) => lightness + ((component - lightness) * lightness) / (lightness - minimum)) as BlendColor;
  if (maximum > 1) result = result.map((component) => lightness + ((component - lightness) * (1 - lightness)) / (maximum - lightness)) as BlendColor;
  return result.map((component) => Math.max(0, Math.min(1, component))) as BlendColor;
}

function setSaturation(color: BlendColor, target: number): BlendColor {
  const order = [0, 1, 2].sort((left, right) => color[left] - color[right]);
  const minimum = order[0];
  const middle = order[1];
  const maximum = order[2];
  const result: BlendColor = [0, 0, 0];
  if (color[maximum] > color[minimum]) {
    result[middle] = ((color[middle] - color[minimum]) * target) / (color[maximum] - color[minimum]);
    result[maximum] = target;
  }
  return result;
}

function blendChannel(backdrop: number, source: number, blendMode: BlendMode) {
  switch (blendMode) {
    case "darken": return Math.min(backdrop, source);
    case "multiply": return backdrop * source;
    case "color-burn": return source <= 0 ? 0 : 1 - Math.min(1, (1 - backdrop) / source);
    case "lighten": return Math.max(backdrop, source);
    case "screen": return backdrop + source - backdrop * source;
    case "color-dodge": return source >= 1 ? 1 : Math.min(1, backdrop / (1 - source));
    case "overlay": return backdrop <= 0.5
      ? 2 * backdrop * source
      : 1 - 2 * (1 - backdrop) * (1 - source);
    case "soft-light": return source <= 0.5
      ? backdrop - (1 - 2 * source) * backdrop * (1 - backdrop)
      : backdrop + (2 * source - 1) * ((backdrop <= 0.25 ? ((16 * backdrop - 12) * backdrop + 4) * backdrop : Math.sqrt(backdrop)) - backdrop);
    case "hard-light": return source <= 0.5
      ? 2 * backdrop * source
      : 1 - 2 * (1 - backdrop) * (1 - source);
    case "difference": return Math.abs(backdrop - source);
    case "exclusion": return backdrop + source - 2 * backdrop * source;
    case "addition": return Math.min(1, backdrop + source);
    case "subtract": return Math.max(0, backdrop - source);
    case "divide": return source <= 0 ? 1 : Math.min(1, backdrop / source);
    case "hue":
    case "saturation":
    case "color":
    case "luminosity":
    case "normal": return source;
  }
}

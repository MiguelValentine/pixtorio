import {selectionCoverageAt, type Selection} from "./selection";
import type {RGBA} from "./tools";

export type TextAlign = "left" | "center" | "right";
export type TextHinting = "none" | "slight" | "full";

export interface TextToolSettings {
  text: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  bold: boolean;
  italic: boolean;
  align: TextAlign;
  antialias: boolean;
  hinting?: TextHinting;
  ligatures?: boolean;
  color: RGBA;
  strokeColor?: RGBA;
  strokeWidth?: number;
}

export interface TextLayout {
  lines: string[];
  widths: number[];
  width: number;
  height: number;
  lineHeightPixels: number;
}

export interface RasterizedText extends TextLayout {
  pixels: Uint8ClampedArray;
}

export function normalizeTextToolSettings(settings: TextToolSettings): TextToolSettings {
  return {
    ...settings,
    fontFamily: settings.fontFamily.trim() || "sans-serif",
    fontSize: Math.max(1, Math.min(512, Math.round(settings.fontSize || 1))),
    lineHeight: Math.max(0.5, Math.min(4, Number.isFinite(settings.lineHeight) ? settings.lineHeight : 1.2)),
    hinting: settings.hinting === "none" || settings.hinting === "full" ? settings.hinting : "slight",
    ligatures: settings.ligatures !== false,
    strokeWidth: Math.max(0, Math.min(64, Math.round(settings.strokeWidth ?? 0))),
  };
}

export function hintTextPosition(value: number, hinting: TextHinting): number {
  if (hinting === "full") return Math.round(value);
  if (hinting === "slight") return Math.round(value * 2) / 2;
  return value;
}

export function measureTextRun(
  text: string,
  measure: (value: string) => number,
  ligatures = true,
  hinting: TextHinting = "slight",
): number {
  const raw = ligatures
    ? measure(text || " ")
    : Array.from(text || " ").reduce((width, character) => width + measure(character), 0);
  return Math.max(0, hintTextPosition(raw, hinting));
}

export function layoutText(
  text: string,
  fontSize: number,
  lineHeight: number,
  measure: (line: string) => number,
): TextLayout {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const widths = lines.map((line) => Math.max(0, measure(line)));
  const lineHeightPixels = Math.max(1, Math.ceil(fontSize * lineHeight));
  return {
    lines,
    widths,
    width: Math.max(1, Math.ceil(Math.max(0, ...widths))),
    height: Math.max(1, lines.length * lineHeightPixels),
    lineHeightPixels,
  };
}

export function rasterizeText(settings: TextToolSettings): RasterizedText {
  const normalized = normalizeTextToolSettings(settings);
  const measureCanvas = document.createElement("canvas");
  const context = measureCanvas.getContext("2d", {willReadFrequently: true});
  if (!context) throw new Error("Canvas 2D is unavailable");
  context.font = textFont(normalized);
  context.fontKerning = normalized.ligatures ? "auto" : "none";
  const layout = layoutText(normalized.text, normalized.fontSize, normalized.lineHeight, (line) => measureTextRun(
    line,
    (value) => context.measureText(value).width,
    normalized.ligatures,
    normalized.hinting,
  ));
  const strokePadding = normalized.strokeColor && normalized.strokeWidth ? normalized.strokeWidth : 0;
  const width = layout.width + strokePadding * 2;
  const height = layout.height + strokePadding * 2;
  const anchorX = normalized.align === "left"
    ? strokePadding
    : normalized.align === "center"
      ? width / 2
      : width - strokePadding;
  const renderMask = (stroke: boolean) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const draw = canvas.getContext("2d", {willReadFrequently: true});
    if (!draw) throw new Error("Canvas 2D is unavailable");
    draw.clearRect(0, 0, width, height);
    draw.font = textFont(normalized);
    draw.fontKerning = normalized.ligatures ? "auto" : "none";
    draw.textBaseline = "top";
    draw.textAlign = "left";
    draw.fillStyle = "#fff";
    if (stroke) {
      draw.strokeStyle = "#fff";
      draw.lineWidth = normalized.strokeWidth! * 2;
      draw.lineJoin = "round";
    }
    layout.lines.forEach((line, index) => {
      const lineWidth = layout.widths[index];
      const rawX = normalized.align === "left"
        ? anchorX
        : normalized.align === "center"
          ? anchorX - lineWidth / 2
          : anchorX - lineWidth;
      const x = hintTextPosition(rawX, normalized.hinting!);
      const y = hintTextPosition(strokePadding + index * layout.lineHeightPixels, normalized.hinting!);
      if (normalized.ligatures) {
        if (stroke) draw.strokeText(line, x, y);
        else draw.fillText(line, x, y);
        return;
      }
      let rawAdvance = 0;
      for (const character of Array.from(line)) {
        const characterX = hintTextPosition(x + rawAdvance, normalized.hinting!);
        if (stroke) draw.strokeText(character, characterX, y);
        else draw.fillText(character, characterX, y);
        rawAdvance += draw.measureText(character).width;
      }
    });
    return new Uint8ClampedArray(draw.getImageData(0, 0, width, height).data);
  };
  const fillMask = renderMask(false);
  const strokeMask = normalized.strokeColor && normalized.strokeWidth ? renderMask(true) : null;
  const pixels = compositeTextMasks(fillMask, strokeMask, normalized.color, normalized.strokeColor, normalized.antialias);
  return {...layout, width, height, pixels};
}

/** Applies color and alpha to fixed text coverage masks. Mask RGB values are ignored. */
export function compositeTextMasks(
  fillMask: Uint8ClampedArray,
  strokeMask: Uint8ClampedArray | null,
  fillColor: RGBA,
  strokeColor: RGBA | undefined,
  antialias: boolean,
): Uint8ClampedArray {
  if (fillMask.length % 4 !== 0 || (strokeMask && strokeMask.length !== fillMask.length)) {
    throw new Error("Text masks must have matching RGBA lengths");
  }
  const pixels = new Uint8ClampedArray(fillMask.length);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (strokeMask && strokeColor) compositeMaskPixel(pixels, offset, strokeMask[offset + 3], strokeColor, antialias);
    compositeMaskPixel(pixels, offset, fillMask[offset + 3], fillColor, antialias);
  }
  return pixels;
}

function compositeMaskPixel(
  target: Uint8ClampedArray,
  offset: number,
  maskAlpha: number,
  color: RGBA,
  antialias: boolean,
) {
  const coverage = antialias ? maskAlpha / 255 : maskAlpha >= 128 ? 1 : 0;
  const sourceAlpha = coverage * (color[3] / 255);
  if (sourceAlpha <= 0) return;
  const targetAlpha = target[offset + 3] / 255;
  const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
  for (let channel = 0; channel < 3; channel += 1) {
    const sourceChannel = color[channel] / 255;
    const targetChannel = target[offset + channel] / 255;
    target[offset + channel] = outputAlpha === 0
      ? 0
      : Math.round(((sourceChannel * sourceAlpha) + (targetChannel * targetAlpha * (1 - sourceAlpha))) / outputAlpha * 255);
  }
  target[offset + 3] = Math.round(outputAlpha * 255);
}

/** Commits a rasterized text block with source-over alpha and selection coverage. */
export function stampRasterizedText(
  target: Uint8ClampedArray,
  targetWidth: number,
  targetHeight: number,
  source: Pick<RasterizedText, "width" | "height" | "pixels">,
  x: number,
  y: number,
  selection?: Selection | null,
) {
  let changed = 0;
  const originX = Math.round(x);
  const originY = Math.round(y);
  for (let sourceY = 0; sourceY < source.height; sourceY += 1) {
    const targetY = originY + sourceY;
    if (targetY < 0 || targetY >= targetHeight) continue;
    for (let sourceX = 0; sourceX < source.width; sourceX += 1) {
      const targetX = originX + sourceX;
      if (targetX < 0 || targetX >= targetWidth) continue;
      const coverage = selection ? selectionCoverageAt(selection, targetX, targetY) : 255;
      if (coverage === 0) continue;
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      const sourceAlpha = (source.pixels[sourceOffset + 3] / 255) * (coverage / 255);
      if (sourceAlpha <= 0) continue;
      const targetOffset = (targetY * targetWidth + targetX) * 4;
      const targetAlpha = target[targetOffset + 3] / 255;
      const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
      const before = `${target[targetOffset]},${target[targetOffset + 1]},${target[targetOffset + 2]},${target[targetOffset + 3]}`;
      for (let channel = 0; channel < 3; channel += 1) {
        const sourceChannel = source.pixels[sourceOffset + channel] / 255;
        const targetChannel = target[targetOffset + channel] / 255;
        target[targetOffset + channel] = outputAlpha === 0 ? 0 : Math.round(((sourceChannel * sourceAlpha) + (targetChannel * targetAlpha * (1 - sourceAlpha))) / outputAlpha * 255);
      }
      target[targetOffset + 3] = Math.round(outputAlpha * 255);
      if (before !== `${target[targetOffset]},${target[targetOffset + 1]},${target[targetOffset + 2]},${target[targetOffset + 3]}`) changed += 1;
    }
  }
  return changed;
}

function textFont(settings: TextToolSettings) {
  const family = settings.fontFamily.includes(" ") ? `"${settings.fontFamily.replaceAll('"', "")}"` : settings.fontFamily;
  return `${settings.italic ? "italic " : ""}${settings.bold ? "700 " : ""}${settings.fontSize}px ${family}`;
}

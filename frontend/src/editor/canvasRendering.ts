import {
  isBrushPixel,
  normalizeBrushSize,
  type BitmapBrush,
  type BrushShape,
  type Point,
} from "./tools";
import {containsPoint, type Selection} from "./selection";

export type SourceCanvas = HTMLCanvasElement | OffscreenCanvas;

export function createSourceCanvas(): SourceCanvas {
  return typeof OffscreenCanvas === "undefined"
    ? document.createElement("canvas")
    : new OffscreenCanvas(1, 1);
}

export function createCheckerPattern(context: CanvasRenderingContext2D, dark: string, light: string, checkerSize: number) {
  const source = document.createElement("canvas");
  source.width = checkerSize * 2;
  source.height = checkerSize * 2;
  const sourceContext = source.getContext("2d");
  if (!sourceContext) return null;
  sourceContext.fillStyle = dark;
  sourceContext.fillRect(0, 0, source.width, source.height);
  sourceContext.fillStyle = light;
  sourceContext.fillRect(0, 0, checkerSize, checkerSize);
  sourceContext.fillRect(checkerSize, checkerSize, checkerSize, checkerSize);
  return context.createPattern(source, "repeat");
}

export function createSelectionOutline(
  selection: Selection,
  viewport: {x: number; y: number},
  zoom: number,
) {
  const path = new Path2D();
  if (!selection.mask) {
    path.rect(
      Math.round(viewport.x + selection.x * zoom) - 0.5,
      Math.round(viewport.y + selection.y * zoom) - 0.5,
      selection.width * zoom + 1,
      selection.height * zoom + 1,
    );
    return path;
  }

  const edge = (fromX: number, fromY: number, toX: number, toY: number) => {
    path.moveTo(Math.round(viewport.x + fromX * zoom) + 0.5, Math.round(viewport.y + fromY * zoom) + 0.5);
    path.lineTo(Math.round(viewport.x + toX * zoom) + 0.5, Math.round(viewport.y + toY * zoom) + 0.5);
  };
  for (let localY = 0; localY < selection.height; localY += 1) {
    for (let localX = 0; localX < selection.width; localX += 1) {
      const x = selection.x + localX;
      const y = selection.y + localY;
      if (!containsPoint(selection, x, y)) continue;
      if (!containsPoint(selection, x, y - 1)) edge(x, y, x + 1, y);
      if (!containsPoint(selection, x + 1, y)) edge(x + 1, y, x + 1, y + 1);
      if (!containsPoint(selection, x, y + 1)) edge(x + 1, y + 1, x, y + 1);
      if (!containsPoint(selection, x - 1, y)) edge(x, y + 1, x, y);
    }
  }
  return path;
}

export function drawBrushOutline(
  context: CanvasRenderingContext2D,
  cursor: Point,
  brushSize: number,
  brushShape: BrushShape,
  viewport: Point,
  zoom: number,
  canvasWidth: number,
  canvasHeight: number,
  bitmapBrush?: BitmapBrush | null,
) {
  const brushWidth = bitmapBrush?.width ?? normalizeBrushSize(brushSize);
  const brushHeight = bitmapBrush?.height ?? normalizeBrushSize(brushSize);
  const originX = cursor.x - (bitmapBrush?.anchorX ?? Math.floor(brushWidth / 2));
  const originY = cursor.y - (bitmapBrush?.anchorY ?? Math.floor(brushHeight / 2));
  const contains = (localX: number, localY: number) => {
    if (localX < 0 || localY < 0 || localX >= brushWidth || localY >= brushHeight) return false;
    const x = originX + localX;
    const y = originY + localY;
    return x >= 0 && y >= 0 && x < canvasWidth && y < canvasHeight
      && (bitmapBrush
        ? Boolean(bitmapBrush.mask[localY * bitmapBrush.width + localX])
        : isBrushPixel(localX, localY, brushWidth, brushShape));
  };
  const edge = (fromX: number, fromY: number, toX: number, toY: number) => {
    context.moveTo(Math.round(viewport.x + fromX * zoom) + 0.5, Math.round(viewport.y + fromY * zoom) + 0.5);
    context.lineTo(Math.round(viewport.x + toX * zoom) + 0.5, Math.round(viewport.y + toY * zoom) + 0.5);
  };

  context.beginPath();
  for (let localY = 0; localY < brushHeight; localY += 1) {
    for (let localX = 0; localX < brushWidth; localX += 1) {
      if (!contains(localX, localY)) continue;
      const x = originX + localX;
      const y = originY + localY;
      if (!contains(localX, localY - 1)) edge(x, y, x + 1, y);
      if (!contains(localX + 1, localY)) edge(x + 1, y, x + 1, y + 1);
      if (!contains(localX, localY + 1)) edge(x + 1, y + 1, x, y + 1);
      if (!contains(localX - 1, localY)) edge(x, y + 1, x, y);
    }
  }
}

export function colorWithOpacity(color: string, opacityPercent: number) {
  const alpha = Math.round(Math.max(0, Math.min(100, opacityPercent)) * 2.55);
  return `${color}${alpha.toString(16).padStart(2, "0")}`;
}

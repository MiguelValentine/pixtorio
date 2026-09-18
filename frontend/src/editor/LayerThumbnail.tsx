import {useLayoutEffect, useRef} from "react";

import {normalizePixelAspectRatio, type PixelAspectRatio} from "./pixelAspectRatio";

const THUMBNAIL_SIZE = 28;
const CHECKER_SIZE = 4;
const CHECKER_LIGHT = "#eeeeee";
const CHECKER_DARK = "#c8c8c8";

type SourceCanvas = HTMLCanvasElement | OffscreenCanvas;

function createSourceCanvas(): SourceCanvas {
  return typeof OffscreenCanvas === "undefined"
    ? document.createElement("canvas")
    : new OffscreenCanvas(1, 1);
}

export interface LayerThumbnailProps {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  revision: number;
  visible: boolean;
  ariaLabel: string;
  size?: number;
  pixelAspectRatio?: PixelAspectRatio;
}

/** Copy enough RGBA data to fill the target so a reused ImageData cannot retain old tail pixels. */
export function copyThumbnailPixels(target: Uint8ClampedArray, pixels: Uint8ClampedArray) {
  if (pixels.length < target.length) return false;
  target.set(pixels.subarray(0, target.length));
  return true;
}

export function getThumbnailDestinationRect(width: number, height: number, size: number, pixelAspectRatio?: PixelAspectRatio) {
  const ratio = normalizePixelAspectRatio(pixelAspectRatio ?? {width: 1, height: 1});
  const displayWidth = width * ratio.width;
  const displayHeight = height * ratio.height;
  const scale = Math.min(size / displayWidth, size / displayHeight);
  const destinationWidth = Math.max(1, Math.round(displayWidth * scale));
  const destinationHeight = Math.max(1, Math.round(displayHeight * scale));
  return {
    x: Math.floor((size - destinationWidth) / 2),
    y: Math.floor((size - destinationHeight) / 2),
    width: destinationWidth,
    height: destinationHeight,
  };
}

/** Renders a layer's pixels independently from the editor's main canvas. */
export function LayerThumbnail({pixels, width, height, revision, visible, ariaLabel, size = THUMBNAIL_SIZE, pixelAspectRatio}: LayerThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceCanvasRef = useRef<SourceCanvas | null>(null);
  const sourceImageRef = useRef<{width: number; height: number; imageData: ImageData} | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (canvas.width !== size) canvas.width = size;
    if (canvas.height !== size) canvas.height = size;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, size, size);
    drawCheckerboard(context, size);

    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return;

    const expectedLength = width * height * 4;
    if (!Number.isSafeInteger(expectedLength) || expectedLength <= 0) return;

    const source = sourceCanvasRef.current ?? (sourceCanvasRef.current = createSourceCanvas());
    if (source.width !== width) source.width = width;
    if (source.height !== height) source.height = height;
    const sourceContext = source.getContext("2d");
    if (!sourceContext) return;

    const cached = sourceImageRef.current;
    const imageData = cached?.width === width && cached.height === height
      ? cached.imageData
      : sourceContext.createImageData(width, height);
    if (!copyThumbnailPixels(imageData.data, pixels)) return;
    sourceContext.putImageData(imageData, 0, 0);
    sourceImageRef.current = {width, height, imageData};

    const destination = getThumbnailDestinationRect(width, height, size, pixelAspectRatio);
    context.drawImage(source, destination.x, destination.y, destination.width, destination.height);
  }, [height, pixelAspectRatio?.height, pixelAspectRatio?.width, pixels, revision, size, width]);

  return (
    <canvas
      ref={canvasRef}
      className={`layer-thumbnail${visible ? "" : " is-hidden"}`}
      width={size}
      height={size}
      style={{
        display: "block",
        width: `${size}px`,
        height: `${size}px`,
        imageRendering: "pixelated",
        opacity: visible ? 1 : 0.48,
      }}
      aria-label={ariaLabel}
      role="img"
    />
  );
}

function drawCheckerboard(context: CanvasRenderingContext2D, size = THUMBNAIL_SIZE) {
  for (let y = 0; y < size; y += CHECKER_SIZE) {
    for (let x = 0; x < size; x += CHECKER_SIZE) {
      context.fillStyle = ((x / CHECKER_SIZE + y / CHECKER_SIZE) & 1) === 0
        ? CHECKER_LIGHT
        : CHECKER_DARK;
      context.fillRect(x, y, CHECKER_SIZE, CHECKER_SIZE);
    }
  }
}

import {createDocument, getActiveCel} from "../editor/document";
import type {PhotoPixelationResult} from "../editor/photoPixelation";

export const photoFileAccept = ".png,.jpg,.jpeg,.webp,.bmp,image/png,image/jpeg,image/webp,image/bmp";
export const maxPhotoFileBytes = 64 * 1024 * 1024;
export const maxPhotoSourcePixels = 100_000_000;
export const maxPhotoOutputDimension = 1024;

export interface LoadedPhoto {
  name: string;
  image: HTMLImageElement;
  url: string;
  width: number;
  height: number;
}

export function validatePhotoFile(file: Pick<File, "name" | "size">) {
  if (!/\.(png|jpe?g|webp|bmp)$/i.test(file.name)) throw new Error("format");
  if (file.size === 0 || file.size > maxPhotoFileBytes) throw new Error("file-size");
}

export async function loadPhoto(file: File): Promise<LoadedPhoto> {
  validatePhotoFile(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("decode"));
      image.src = url;
    });
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (width < 1 || height < 1 || width * height > maxPhotoSourcePixels) throw new Error("source-size");
    return {name: file.name, image, url, width, height};
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export function fitPhotoDimensions(width: number, height: number, longestEdge = 128) {
  const scale = Math.min(1, longestEdge / Math.max(width, height));
  return {width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale))};
}

export function samplePhoto(photo: LoadedPhoto, width: number, height: number, smoothing: boolean) {
  if (![width, height].every((dimension) => Number.isInteger(dimension) && dimension >= 1 && dimension <= maxPhotoOutputDimension)) {
    throw new Error("output-size");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", {willReadFrequently: true});
  if (!context) throw new Error("canvas");
  context.imageSmoothingEnabled = smoothing;
  context.imageSmoothingQuality = "high";
  context.drawImage(photo.image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}

export function createPhotoDocument(name: string, result: PhotoPixelationResult) {
  const imported = createDocument({
    name: `${name.replace(/\.[^.]+$/, "") || "photo"}-pixel.pixio`,
    width: result.width,
    height: result.height,
    colorMode: "rgba",
    palette: [...result.palette],
  });
  getActiveCel(imported).pixels.set(result.pixels);
  return imported;
}

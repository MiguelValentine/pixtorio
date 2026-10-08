import {pixelatePhoto, type PhotoPixelationOptions} from "./photoPixelation";

self.onmessage = (event: MessageEvent<{pixels: Uint8ClampedArray; width: number; height: number; options: PhotoPixelationOptions}>) => {
  try {
    const {pixels, width, height, options} = event.data;
    const result = pixelatePhoto(pixels, width, height, options);
    self.postMessage({result});
  } catch {
    self.postMessage({error: true});
  }
};

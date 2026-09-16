import {describe, expect, it} from "vitest";

import {
  addFrame,
  addLayer,
  compositeFrameWithOnionSkin,
  createDocument,
  getCel,
  ensureCel,
} from "./document";
import {setPixel} from "./pixels";

describe("onion-skin compositing", () => {
  it("renders both neighboring active-layer cels above an opaque background", () => {
    const document = createDocument({width: 2, height: 1});
    const background = document.layers[0];
    const previous = document.frames[0];
    const current = addFrame(document);
    const next = addFrame(document);
    const animated = addLayer(document, "Animated");

    for (const frame of document.frames) {
      ensureCel(document, background.id, frame.id);
      const backgroundCel = getCel(document, background.id, frame.id)!;
      setPixel(backgroundCel.pixels, 2, 1, 0, 0, [255, 255, 255, 255]);
      setPixel(backgroundCel.pixels, 2, 1, 1, 0, [255, 255, 255, 255]);
    }
    for (const frame of document.frames) ensureCel(document, animated.id, frame.id);
    setPixel(getCel(document, animated.id, previous.id)!.pixels, 2, 1, 0, 0, [1, 2, 3, 255]);
    setPixel(getCel(document, animated.id, next.id)!.pixels, 2, 1, 0, 0, [4, 5, 6, 255]);
    setPixel(getCel(document, animated.id, current.id)!.pixels, 2, 1, 1, 0, [10, 20, 30, 255]);
    document.activeFrameId = current.id;
    document.activeLayerId = animated.id;

    expect(Array.from(compositeFrameWithOnionSkin(document, previous.id, next.id))).toEqual([
      190, 186, 218, 255,
      10, 20, 30, 255,
    ]);
  });
});

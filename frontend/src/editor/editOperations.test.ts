import {describe, expect, it} from "vitest";

import {
  createDocument,
  getCel,
  type Cel,
} from "./document";
import {
  pasteClipboardAsNewLayer,
  selectionToNewLayer,
} from "./editOperations";
import type {PixelClipboard, Selection} from "./selection";

function pixelAt(cel: Cel, x: number, y: number) {
  const offset = (y * cel.width + x) * 4;
  return Array.from(cel.pixels.subarray(offset, offset + 4));
}

function setPixel(cel: Cel, x: number, y: number, value: readonly number[]) {
  cel.pixels.set(value, (y * cel.width + x) * 4);
}

describe("edit layer operations", () => {
  it("copies only the selected pixels into a new layer and leaves the source unchanged", () => {
    const document = createDocument({width: 4, height: 2});
    const source = getCel(document, document.activeLayerId, document.activeFrameId)!;
    setPixel(source, 0, 0, [1, 2, 3, 255]);
    setPixel(source, 1, 0, [10, 20, 30, 255]);
    setPixel(source, 2, 0, [40, 50, 60, 128]);
    setPixel(source, 3, 0, [7, 8, 9, 255]);
    setPixel(source, 0, 1, [11, 12, 13, 255]);
    const sourceBefore = source.pixels.slice();
    const selection: Selection = {x: 1, y: 0, width: 2, height: 1};

    const layerId = selectionToNewLayer(document, selection, {
      cut: false,
      name: "Copied Selection",
    });

    expect(layerId).not.toBeNull();
    expect(Array.from(source.pixels)).toEqual(Array.from(sourceBefore));
    const target = getCel(document, layerId!, document.activeFrameId)!;
    expect(pixelAt(target, 1, 0)).toEqual([10, 20, 30, 255]);
    expect(pixelAt(target, 2, 0)).toEqual([40, 50, 60, 128]);
    expect(pixelAt(target, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(target, 3, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(target, 0, 1)).toEqual([0, 0, 0, 0]);
  });

  it("cuts a background selection with the supplied clear color and preserves outside pixels", () => {
    const document = createDocument({width: 3, height: 1});
    const sourceLayer = document.layers[0];
    sourceLayer.role = "background";
    const source = getCel(document, sourceLayer.id, document.activeFrameId)!;
    setPixel(source, 0, 0, [1, 2, 3, 255]);
    setPixel(source, 1, 0, [10, 20, 30, 255]);
    setPixel(source, 2, 0, [40, 50, 60, 255]);
    const clearColor = [90, 80, 70, 255] as const;

    const layerId = selectionToNewLayer(document, {x: 1, y: 0, width: 1, height: 1}, {
      cut: true,
      clearColor,
      name: "Cut Selection",
    });

    expect(layerId).not.toBeNull();
    expect(pixelAt(source, 0, 0)).toEqual([1, 2, 3, 255]);
    expect(pixelAt(source, 1, 0)).toEqual(clearColor);
    expect(pixelAt(source, 2, 0)).toEqual([40, 50, 60, 255]);
    const target = getCel(document, layerId!, document.activeFrameId)!;
    expect(pixelAt(target, 1, 0)).toEqual([10, 20, 30, 255]);
    expect(document.layers.find((layer) => layer.id === sourceLayer.id)?.role).toBe("background");
  });

  it("pastes into a new reference layer while keeping masked-out pixels transparent", () => {
    const document = createDocument({width: 4, height: 1});
    const clipboard: PixelClipboard = {
      width: 2,
      height: 1,
      pixels: Uint8ClampedArray.from([
        20, 30, 40, 255,
        50, 60, 70, 255,
      ]),
      mask: Uint8Array.from([255, 0]),
    };

    const layerId = pasteClipboardAsNewLayer(document, clipboard, {
      name: "Reference Paste",
      reference: true,
      x: 1,
      y: 0,
    });

    expect(layerId).not.toBeNull();
    expect(document.layers.find((layer) => layer.id === layerId)?.role).toBe("reference");
    const target = getCel(document, layerId!, document.activeFrameId)!;
    expect(pixelAt(target, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(target, 1, 0)).toEqual([20, 30, 40, 255]);
    expect(pixelAt(target, 2, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(target, 3, 0)).toEqual([0, 0, 0, 0]);
  });

  it("synchronizes indexed pixels and indexes for a cut and a masked paste", () => {
    const document = createDocument({
      width: 3,
      height: 1,
      colorMode: "indexed",
      palette: ["#00000000", "#ff0000ff", "#00ff00ff", "#0000ffff"],
    });
    const source = getCel(document, document.activeLayerId, document.activeFrameId)!;
    setPixel(source, 0, 0, [0, 0, 255, 255]);
    setPixel(source, 1, 0, [255, 0, 0, 255]);
    setPixel(source, 2, 0, [0, 255, 0, 255]);

    const cutLayerId = selectionToNewLayer(document, {x: 1, y: 0, width: 2, height: 1}, {
      cut: true,
      clearColor: [0, 0, 0, 0],
      name: "Indexed Cut",
    });

    expect(cutLayerId).not.toBeNull();
    const cutTarget = getCel(document, cutLayerId!, document.activeFrameId)!;
    expect(Array.from(cutTarget.indexes!)).toEqual([0, 1, 2]);
    expect(Array.from(source.indexes!)).toEqual([3, 0, 0]);

    const pasteLayerId = pasteClipboardAsNewLayer(document, {
      width: 2,
      height: 1,
      pixels: Uint8ClampedArray.from([
        0, 255, 0, 255,
        255, 0, 0, 255,
      ]),
      mask: Uint8Array.from([255, 0]),
    }, {
      name: "Indexed Paste",
      x: 0,
      y: 0,
    });

    expect(pasteLayerId).not.toBeNull();
    const pasteTarget = getCel(document, pasteLayerId!, document.activeFrameId)!;
    expect(Array.from(pasteTarget.indexes!)).toEqual([2, 0, 0]);
    expect(pixelAt(pasteTarget, 0, 0)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(pasteTarget, 1, 0)).toEqual([0, 0, 0, 0]);
  });
});

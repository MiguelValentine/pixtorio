import {describe, expect, it} from "vitest";
import {addFrame, addLayer, createDocument, ensureCel, getActiveCel, getCel, linkCels} from "./document";
import {findTopmostMovableCelAt, moveCels, rasterizeCelsToCanvas, rotatePixelsNearestNeighbor, transformCels} from "./celTransform";

describe("cel transforms", () => {
  it("moves multiple cels without breaking their shared pixel link", () => {
    const document = createDocument({width: 4, height: 4});
    const first = getActiveCel(document);
    const secondFrame = addFrame(document);
    const second = ensureCel(document, document.activeLayerId, secondFrame.id)!;
    second.linkId = first.linkId;
    second.pixels = first.pixels;

    expect(moveCels(document, [
      {layerId: first.layerId, frameId: first.frameId},
      {layerId: second.layerId, frameId: second.frameId},
    ], 3, -2)).toBe(true);
    expect([first.x, first.y, second.x, second.y]).toEqual([3, -2, 3, -2]);
    expect(second.linkId).toBe(first.linkId);
    expect(second.pixels).toBe(first.pixels);
  });

  it("auto-selects the topmost visible unlocked opaque cel", () => {
    const document = createDocument({width: 3, height: 2});
    const bottom = getActiveCel(document);
    bottom.pixels.set([255, 0, 0, 255], 0);
    const topLayer = addLayer(document, "Top");
    const top = getActiveCel(document);
    top.pixels.set([0, 0, 255, 255], 0);

    expect(findTopmostMovableCelAt(document, document.activeFrameId, 0, 0)).toEqual({
      layerId: topLayer.id,
      frameId: document.activeFrameId,
    });
    topLayer.locked = true;
    expect(findTopmostMovableCelAt(document, document.activeFrameId, 0, 0)?.layerId).toBe(bottom.layerId);
    topLayer.locked = false;
    topLayer.visible = false;
    expect(findTopmostMovableCelAt(document, document.activeFrameId, 0, 0)?.layerId).toBe(bottom.layerId);
  });

  it("does not move background or locked cels", () => {
    const document = createDocument({width: 2, height: 1});
    const cel = getActiveCel(document);
    document.layers[0].role = "background";
    expect(moveCels(document, [{layerId: cel.layerId, frameId: cel.frameId}], 2, 1)).toBe(false);
    expect([cel.x, cel.y]).toEqual([0, 0]);
    document.layers[0].role = "standard";
    document.layers[0].locked = true;
    expect(moveCels(document, [{layerId: cel.layerId, frameId: cel.frameId}], 2, 1)).toBe(false);
    expect([cel.x, cel.y]).toEqual([0, 0]);
  });

  it("rotates pixels around the cel center", () => {
    const source = new Uint8ClampedArray(3 * 3 * 4);
    source.set([255, 0, 0, 255], (0 * 3 + 1) * 4);
    const rotated = rotatePixelsNearestNeighbor(source, 3, 3, 90);
    expect(rotated[(1 * 3 + 2) * 4]).toBe(255);
  });

  it("applies offsets and rotation to multiple selected linked cels", () => {
    const document = createDocument({width: 3, height: 3});
    const first = document.frames[0];
    const second = addFrame(document);
    ensureCel(document, document.activeLayerId, second.id);
    linkCels(document, document.activeLayerId, [first.id, second.id], first.id);
    const addresses = [first, second].map((frame) => ({layerId: document.activeLayerId, frameId: frame.id}));
    expect(transformCels(document, addresses, {angleDegrees: 90, offsetX: 2, offsetY: -1})).toBe(true);
    expect(getActiveCel(document).x).toBe(2);
    expect(getCel(document, document.activeLayerId, second.id)?.y).toBe(-1);
    expect(getActiveCel(document).pixels).toBe(getCel(document, document.activeLayerId, second.id)?.pixels);
  });

  it("rasterizes an offset cel back into an editable full-canvas buffer", () => {
    const document = createDocument({width: 3, height: 3});
    const cel = getActiveCel(document);
    cel.width = 1;
    cel.height = 1;
    cel.x = 2;
    cel.y = 1;
    cel.pixels = new Uint8ClampedArray([10, 20, 30, 255]);
    expect(rasterizeCelsToCanvas(document, [{layerId: cel.layerId, frameId: cel.frameId}])).toBe(true);
    expect({x: cel.x, y: cel.y, width: cel.width, height: cel.height}).toEqual({x: 0, y: 0, width: 3, height: 3});
    expect([...cel.pixels.slice((1 * 3 + 2) * 4, (1 * 3 + 2) * 4 + 4)]).toEqual([10, 20, 30, 255]);
  });

  it("unlinks the pixel buffer when only part of a linked group is offset", () => {
    const document = createDocument({width: 2, height: 2});
    const first = document.frames[0];
    const second = addFrame(document);
    ensureCel(document, document.activeLayerId, second.id);
    linkCels(document, document.activeLayerId, [first.id, second.id], first.id);
    const firstCel = getCel(document, document.activeLayerId, first.id)!;
    const secondCel = getCel(document, document.activeLayerId, second.id)!;
    expect(transformCels(document, [{layerId: firstCel.layerId, frameId: firstCel.frameId}], {angleDegrees: 0, offsetX: 1, offsetY: 0})).toBe(true);
    expect(firstCel.linkId).not.toBe(secondCel.linkId);
    expect(firstCel.pixels).not.toBe(secondCel.pixels);
  });
});

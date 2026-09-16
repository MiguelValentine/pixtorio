import {describe, expect, it} from "vitest";
import {
  addFrame,
  addLayer,
  addLayerGroup,
  celKey,
  createCel,
  createDocument,
  ensureCel,
  getCel,
  linkCels,
  type Layer,
} from "./document";
import {
  clearCelSelection,
  copyCelSelection,
  pasteCelSelection,
  type CelAddress,
  type CelClipboard,
} from "./celClipboard";
import {setPixel} from "./pixels";

function address(layerId: string, frameId: string): CelAddress {
  return {layerId, frameId};
}

function addImageLayer(document: ReturnType<typeof createDocument>, name: string) {
  const layer = addLayer(document, name);
  return layer;
}

function addFrames(document: ReturnType<typeof createDocument>, count: number) {
  const frames = [document.frames[0]];
  for (let index = 1; index < count; index += 1) frames.push(addFrame(document));
  // addFrame intentionally leaves non-continuous layers sparse. These tests
  // exercise a populated timeline grid, so create the requested source cels.
  for (const layer of document.layers.filter((candidate) => candidate.kind === "image")) {
    for (const frame of frames) ensureCel(document, layer.id, frame.id);
  }
  return frames;
}

function addFrameWithCel(document: ReturnType<typeof createDocument>) {
  const frame = addFrame(document);
  ensureCel(document, document.activeLayerId, frame.id);
  return frame;
}

function layerIDs(document: ReturnType<typeof createDocument>) {
  return document.layers.filter((layer) => layer.kind === "image").map((layer) => layer.id);
}

function pixel(cel: ReturnType<typeof createCel>, x: number, y: number) {
  const index = (y * cel.width + x) * 4;
  return Array.from(cel.pixels.slice(index, index + 4));
}

describe("cel clipboard model", () => {
  it("copies a 2x2 selection with timeline-relative offsets", () => {
    const document = createDocument({width: 2, height: 2});
    const secondLayer = addImageLayer(document, "Layer 2");
    const frames = addFrames(document, 2);
    const orderedLayers = layerIDs(document);
    const addresses = orderedLayers.flatMap((layerId) => frames.map((frame) => address(layerId, frame.id)));

    for (let index = 0; index < addresses.length; index += 1) {
      const cel = getCel(document, addresses[index].layerId, addresses[index].frameId)!;
      cel.pixels.fill(index + 1);
    }
    const clipboard = copyCelSelection(document, addresses, addresses[3], orderedLayers);

    expect(clipboard?.cells.map(({rowOffset, columnOffset}) => [rowOffset, columnOffset])).toEqual([
      [-1, -1], [-1, 0], [0, -1], [0, 0],
    ]);
    expect(clipboard?.cells[0].pixels).not.toBe(getCel(document, addresses[0].layerId, addresses[0].frameId)!.pixels);
    expect(secondLayer.id).toBe(orderedLayers[1]);
  });

  it("copies sparse selections and preserves negative offsets", () => {
    const document = createDocument({width: 1, height: 1});
    const secondLayer = addImageLayer(document, "Layer 2");
    const thirdLayer = addImageLayer(document, "Layer 3");
    const frames = addFrames(document, 3);
    const orderedLayers = layerIDs(document);
    const selected = [address(thirdLayer.id, frames[0].id), address(secondLayer.id, frames[2].id)];
    const clipboard = copyCelSelection(document, selected, selected[0], orderedLayers);

    expect(clipboard?.cells.map(({rowOffset, columnOffset}) => [rowOffset, columnOffset])).toEqual([[0, 0], [-1, 2]]);
  });

  it("pastes into a different canvas by clipping source canvas coordinates", () => {
    const source = createDocument({width: 4, height: 3});
    const sourceCel = getCel(source, source.activeLayerId, source.activeFrameId)!;
    setPixel(sourceCel.pixels, sourceCel.width, sourceCel.height, 0, 0, [1, 2, 3, 255]);
    setPixel(sourceCel.pixels, sourceCel.width, sourceCel.height, 3, 2, [7, 8, 9, 255]);
    const clipboard = copyCelSelection(
      source,
      [address(source.activeLayerId, source.activeFrameId)],
      address(source.activeLayerId, source.activeFrameId),
      [source.activeLayerId],
    )!;

    const target = createDocument({width: 2, height: 2});
    const targetAddress = address(target.activeLayerId, target.activeFrameId);
    expect(pasteCelSelection(target, clipboard, targetAddress, [target.activeLayerId])).toEqual([targetAddress]);
    const targetCel = getCel(target, target.activeLayerId, target.activeFrameId)!;
    expect(pixel(targetCel, 0, 0)).toEqual([1, 2, 3, 255]);
    expect(pixel(targetCel, 1, 1)).toEqual([0, 0, 0, 0]);
  });

  it("keeps copied linked cells linked, with a new buffer and link id", () => {
    const document = createDocument({width: 1, height: 1});
    const secondFrame = addFrameWithCel(document);
    const firstAddress = address(document.activeLayerId, document.frames[0].id);
    const secondAddress = address(document.activeLayerId, secondFrame.id);
    expect(linkCels(document, document.activeLayerId, [document.frames[0].id, secondFrame.id])).toBe(true);
    const sourcePixels = getCel(document, firstAddress.layerId, firstAddress.frameId)!.pixels;
    const sourceLinkId = getCel(document, firstAddress.layerId, firstAddress.frameId)!.linkId;
    sourcePixels.set([9, 8, 7, 255]);
    const clipboard = copyCelSelection(document, [firstAddress, secondAddress], firstAddress, [document.activeLayerId])!;

    const target = createDocument({width: 1, height: 1});
    const targetFrame = addFrame(target);
    const targetAddresses = pasteCelSelection(
      target,
      clipboard,
      address(target.activeLayerId, target.frames[0].id),
      [target.activeLayerId],
    )!;
    const first = getCel(target, targetAddresses[0].layerId, targetAddresses[0].frameId)!;
    const second = getCel(target, targetAddresses[1].layerId, targetAddresses[1].frameId)!;
    expect(first.linkId).toBe(second.linkId);
    expect(first.pixels).toBe(second.pixels);
    expect(first.linkId).not.toBe(sourceLinkId);
    expect(first.pixels).not.toBe(sourcePixels);
    expect(targetFrame.id).toBe(targetAddresses[1].frameId);
  });

  it("rejects a locked destination atomically, including locked parents", () => {
    const source = createDocument({width: 1, height: 1});
    const clipboard = copyCelSelection(
      source,
      [address(source.activeLayerId, source.activeFrameId)],
      address(source.activeLayerId, source.activeFrameId),
      [source.activeLayerId],
    )!;
    const target = createDocument({width: 1, height: 1});
    const secondLayer = addImageLayer(target, "Layer 2");
    const before = Object.values(target.cels).map((cel) => ({key: celKey(cel.layerId, cel.frameId), id: cel.id, linkId: cel.linkId, pixels: cel.pixels.slice()}));
    target.layers.find((layer) => layer.id === target.activeLayerId)!.locked = true;
    expect(pasteCelSelection(target, clipboard, address(target.activeLayerId, target.activeFrameId), layerIDs(target))).toBeNull();
    expect(Object.values(target.cels).map((cel) => ({key: celKey(cel.layerId, cel.frameId), id: cel.id, linkId: cel.linkId, pixels: Array.from(cel.pixels)}))).toEqual(before.map((entry) => ({...entry, pixels: Array.from(entry.pixels)})));

    target.layers[0].locked = false;
    const group = addLayerGroup(target, "Group");
    secondLayer.parentId = group.id;
    group.locked = true;
    const targetAddress = address(secondLayer.id, target.activeFrameId);
    const snapshot = getCel(target, secondLayer.id, target.activeFrameId)!.pixels.slice();
    expect(pasteCelSelection(target, clipboard, targetAddress, layerIDs(target))).toBeNull();
    expect(Array.from(getCel(target, secondLayer.id, target.activeFrameId)!.pixels)).toEqual(Array.from(snapshot));
  });

  it("clears a linked subset without changing its unselected alias", () => {
    const document = createDocument({width: 1, height: 1});
    const secondFrame = addFrameWithCel(document);
    const first = getCel(document, document.activeLayerId, document.frames[0].id)!;
    const second = getCel(document, document.activeLayerId, secondFrame.id)!;
    expect(linkCels(document, document.activeLayerId, [first.frameId, second.frameId])).toBe(true);
    first.pixels.set([30, 40, 50, 255]);
    const oldLinkId = first.linkId;
    const oldPixels = second.pixels;
    expect(clearCelSelection(document, [address(first.layerId, first.frameId)])).toBe(true);
    expect(pixel(first, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(second, 0, 0)).toEqual([30, 40, 50, 255]);
    expect(first.linkId).not.toBe(oldLinkId);
    expect(first.pixels).not.toBe(oldPixels);
    expect(second.linkId).toBe(oldLinkId);
    expect(second.pixels).toBe(oldPixels);
  });

  it("clears background cels to the configured opaque color", () => {
    const document = createDocument({width: 2, height: 1});
    const layer = document.layers.find((candidate) => candidate.id === document.activeLayerId)!;
    layer.role = "background";
    const cel = getCel(document, document.activeLayerId, document.activeFrameId)!;
    const originalPixels = cel.pixels;
    cel.pixels.set([1, 2, 3, 4, 5, 6, 7, 8]);

    expect(clearCelSelection(document, [address(cel.layerId, cel.frameId)], [20, 40, 60, 75])).toBe(true);
    expect(cel.pixels).toBe(originalPixels);
    expect(Array.from(cel.pixels)).toEqual([20, 40, 60, 255, 20, 40, 60, 255]);
    expect(clearCelSelection(document, [address(cel.layerId, cel.frameId)], [20, 40, 60, 0])).toBe(false);
  });

  it("detaches a cleared background cel without changing its linked alias", () => {
    const document = createDocument({width: 1, height: 1});
    document.layers.find((candidate) => candidate.id === document.activeLayerId)!.role = "background";
    const secondFrame = addFrameWithCel(document);
    const first = getCel(document, document.activeLayerId, document.frames[0].id)!;
    const second = getCel(document, document.activeLayerId, secondFrame.id)!;
    expect(linkCels(document, document.activeLayerId, [first.frameId, second.frameId])).toBe(true);
    first.pixels.set([90, 80, 70, 255]);
    const oldLinkId = first.linkId;
    const oldPixels = second.pixels;

    expect(clearCelSelection(document, [address(first.layerId, first.frameId)], [9, 8, 7, 10])).toBe(true);
    expect(pixel(first, 0, 0)).toEqual([9, 8, 7, 255]);
    expect(pixel(second, 0, 0)).toEqual([90, 80, 70, 255]);
    expect(first.linkId).not.toBe(oldLinkId);
    expect(first.pixels).not.toBe(oldPixels);
    expect(second.linkId).toBe(oldLinkId);
    expect(second.pixels).toBe(oldPixels);
  });

  it("keeps indexed cel indexes synchronized when clearing a background", () => {
    const document = createDocument({
      width: 1,
      height: 1,
      colorMode: "indexed",
      palette: ["#00000000", "#123456ff"],
    });
    document.layers.find((candidate) => candidate.id === document.activeLayerId)!.role = "background";
    const cel = getCel(document, document.activeLayerId, document.activeFrameId)!;
    cel.pixels.set([255, 255, 255, 255]);
    cel.indexes![0] = 0;

    expect(clearCelSelection(document, [address(cel.layerId, cel.frameId)], [0x12, 0x34, 0x56, 128])).toBe(true);
    expect(pixel(cel, 0, 0)).toEqual([0x12, 0x34, 0x56, 255]);
    expect(Array.from(cel.indexes!)).toEqual([1]);
  });

  it("detaches linked cells and clears RGB data from an independent transparent cell", () => {
    const document = createDocument({width: 1, height: 1});
    const secondFrame = addFrameWithCel(document);
    const first = getCel(document, document.activeLayerId, document.frames[0].id)!;
    const second = getCel(document, document.activeLayerId, secondFrame.id)!;
    expect(linkCels(document, document.activeLayerId, [first.frameId, second.frameId])).toBe(true);
    const oldLinkId = first.linkId;
    const oldPixels = first.pixels;
    expect(clearCelSelection(document, [address(first.layerId, first.frameId)])).toBe(true);
    expect(first.linkId).not.toBe(oldLinkId);
    expect(first.pixels).not.toBe(oldPixels);
    expect(second.linkId).toBe(oldLinkId);
    expect(second.pixels).toBe(oldPixels);

    const independent = getCel(document, document.activeLayerId, document.activeFrameId)!;
    const independentPixels = independent.pixels;
    const independentLink = independent.linkId;
    expect(clearCelSelection(document, [address(independent.layerId, independent.frameId)])).toBe(false);
    expect(independent.linkId).toBe(independentLink);
    expect(independent.pixels).toBe(independentPixels);

    independent.pixels.set([17, 34, 51, 0]);
    expect(clearCelSelection(document, [address(independent.layerId, independent.frameId)])).toBe(true);
    expect(independent.linkId).toBe(independentLink);
    expect(independent.pixels).toBe(independentPixels);
    expect(Array.from(independent.pixels)).toEqual([0, 0, 0, 0]);
  });

  it.each([
    "unknown-layer",
    "unknown-frame",
  ])("rejects an invalid %s address without writes", (invalid) => {
    const document = createDocument({width: 1, height: 1});
    const valid = address(document.activeLayerId, document.activeFrameId);
    const bad = invalid === "unknown-layer"
      ? address("missing-layer", document.activeFrameId)
      : address(document.activeLayerId, "missing-frame");
    const before = getCel(document, valid.layerId, valid.frameId)!.pixels.slice();
    expect(copyCelSelection(document, [bad], valid, [document.activeLayerId])).toBeNull();
    expect(clearCelSelection(document, [valid, bad])).toBe(false);
    expect(Array.from(getCel(document, valid.layerId, valid.frameId)!.pixels)).toEqual(Array.from(before));
  });

  it("rejects duplicate and out-of-grid paste mappings atomically", () => {
    const document = createDocument({width: 1, height: 1});
    const anchor = address(document.activeLayerId, document.activeFrameId);
    const base = copyCelSelection(document, [anchor], anchor, [document.activeLayerId])!;
    const duplicate: CelClipboard = {
      cells: [base.cells[0], {...base.cells[0], linkGroup: "other"}],
    };
    expect(pasteCelSelection(document, duplicate, anchor, [document.activeLayerId])).toBeNull();
    const outOfBounds: CelClipboard = {
      cells: [{...base.cells[0], rowOffset: 1}],
    };
    const before = getCel(document, anchor.layerId, anchor.frameId)!.pixels.slice();
    expect(pasteCelSelection(document, outOfBounds, anchor, [document.activeLayerId])).toBeNull();
    expect(Array.from(getCel(document, anchor.layerId, anchor.frameId)!.pixels)).toEqual(Array.from(before));
  });

  it("rejects group rows and invalid link-group snapshots", () => {
    const document = createDocument({width: 1, height: 1});
    const imageLayerId = document.activeLayerId;
    const group: Layer = addLayerGroup(document, "Group");
    const anchor = address(imageLayerId, document.activeFrameId);
    expect(copyCelSelection(document, [anchor], anchor, [group.id, document.activeLayerId])).toBeNull();
    const clipboard = copyCelSelection(document, [anchor], anchor, [imageLayerId])!;
    expect(pasteCelSelection(document, {
      cells: [clipboard.cells[0], {...clipboard.cells[0], rowOffset: 0, columnOffset: 0, linkGroup: "different"}],
    }, anchor, [imageLayerId])).toBeNull();
    expect(group.kind).toBe("group");
  });
});

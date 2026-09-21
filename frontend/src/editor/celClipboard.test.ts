import {describe, expect, it} from "vitest";
import {
  addFrame,
  addLayer,
  addLayerGroup,
  addTilemapLayer,
  celKey,
  cloneDocument,
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
import {CommandHistory, DocumentStateCommand} from "./history";
import {setPixel} from "./pixels";
import {createTileset, renderTilemapCel, tileFlipX} from "./tilemap";
import {createTerrainMapData} from "./terrain";

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
  it("links same-document pastes on continuous layers and keeps indexed buffers shared", () => {
    const document = createDocument({width: 1, height: 1, colorMode: "indexed", palette: ["#00000000", "#ff0000ff"]});
    const layer = document.layers[0];
    layer.continuous = true;
    const sourceAddress = address(layer.id, document.activeFrameId);
    const source = getCel(document, layer.id, document.activeFrameId)!;
    source.indexes![0] = 1;
    source.pixels.set([255, 0, 0, 255]);
    const targetFrame = addFrame(document);
    delete document.cels[celKey(layer.id, targetFrame.id)];
    const clipboard = copyCelSelection(document, [sourceAddress], sourceAddress, [layer.id])!;

    const pasted = pasteCelSelection(document, clipboard, address(layer.id, targetFrame.id), [layer.id])!;
    const target = getCel(document, layer.id, pasted[0].frameId)!;
    expect(target.linkId).toBe(source.linkId);
    expect(target.pixels).toBe(source.pixels);
    expect(target.indexes).toBe(source.indexes);
    target.pixels[0] = 80;
    expect(source.pixels[0]).toBe(80);
  });

  it("links same-document tilemap pastes only when the target is continuous", () => {
    const document = createDocument({width: 1, height: 1});
    const tileset = createTileset({id: "continuous-tiles", tileWidth: 1, tileHeight: 1, name: "Continuous tiles"});
    tileset.tiles.push({id: 1, pixels: new Uint8ClampedArray([255, 0, 0, 255])});
    document.tilesets.push(tileset);
    const layer = addTilemapLayer(document, tileset.id, "Map")!;
    layer.continuous = true;
    const source = getCel(document, layer.id, document.activeFrameId)!;
    source.tilemap!.tiles[0] = 1;
    const sourceAddress = address(layer.id, document.activeFrameId);
    const targetFrame = addFrame(document);
    delete document.cels[celKey(layer.id, targetFrame.id)];
    const clipboard = copyCelSelection(document, [sourceAddress], sourceAddress, [layer.id])!;

    const pasted = pasteCelSelection(document, clipboard, address(layer.id, targetFrame.id), [layer.id])!;
    const target = getCel(document, layer.id, pasted[0].frameId)!;
    expect(target.linkId).toBe(source.linkId);
    expect(target.tilemap).toBe(source.tilemap);
    expect(target.pixels).toBe(source.pixels);
  });

  it("protects background paste from source aliases and preserves one-command undo", () => {
    const document = createDocument({width: 1, height: 1});
    const sourceLayer = document.layers[0];
    const backgroundLayer = addImageLayer(document, "Background");
    backgroundLayer.role = "background";
    backgroundLayer.continuous = true;
    const source = getCel(document, sourceLayer.id, document.activeFrameId)!;
    source.pixels.set([100, 50, 0, 128]);
    const sourceAddress = address(sourceLayer.id, document.activeFrameId);
    const targetAddress = address(backgroundLayer.id, document.activeFrameId);
    const clipboard = copyCelSelection(document, [sourceAddress], sourceAddress, [sourceLayer.id, backgroundLayer.id])!;
    const before = cloneDocument(document);
    expect(pasteCelSelection(document, clipboard, targetAddress, [sourceLayer.id, backgroundLayer.id], [10, 20, 30, 255])).toEqual([targetAddress]);

    const pasted = getCel(document, backgroundLayer.id, document.activeFrameId)!;
    expect(pasted.linkId).not.toBe(source.linkId);
    expect(pasted.opacity).toBe(1);
    expect(pasted.zIndex).toBe(0);
    expect(Array.from(pasted.pixels)).toEqual([55, 35, 15, 255]);
    const history = new CommandHistory<typeof document>();
    history.commit(new DocumentStateCommand(before, document, "Paste Cels"));
    expect(history.undo(document)?.label).toBe("Paste Cels");
    expect(Array.from(getCel(document, backgroundLayer.id, document.activeFrameId)!.pixels)).not.toEqual([55, 35, 15, 255]);
    history.redo(document);
    expect(Array.from(getCel(document, backgroundLayer.id, document.activeFrameId)!.pixels)).toEqual([55, 35, 15, 255]);
  });

  it("copies and pastes tilemap cels with tile resources, flags, linked buffers and indexed caches", () => {
    const palette = ["#00000000", "#ff0000ff", "#00ff00ff"];
    const source = createDocument({width: 2, height: 2, colorMode: "indexed", palette});
    const sourceTileset = createTileset({
      id: "source-tileset",
      name: "Source tiles",
      tileWidth: 1,
      tileHeight: 1,
      terrains: [{
        id: 4,
        name: "Ground",
        color: "#00ff00ff",
        neighborMode: "edge4",
        boundary: "empty",
        rules: [{mask: 0, candidates: [{tileId: 7, flags: 0, weight: 1}]}],
      }],
      tiles: [{id: 7, pixels: new Uint8ClampedArray([255, 0, 0, 255]), indexes: new Uint8Array([1])}],
    });
    source.tilesets.push(sourceTileset);
    const sourceLayer = addTilemapLayer(source, sourceTileset.id, "Source map")!;
    const sourceFrame1 = source.activeFrameId;
    const sourceCel = getCel(source, sourceLayer.id, sourceFrame1)!;
    sourceCel.tilemap = {columns: 2, rows: 2, tiles: new Uint32Array([7 | tileFlipX, 0, 0, 7])};
    sourceCel.terrainmap = createTerrainMapData(2, 2, 91);
    sourceCel.terrainmap.terrains.set([4, 0, 0, 4]);
    sourceCel.pixels = renderTilemapCel(sourceCel, sourceTileset, {palette, transparentIndex: 0});
    sourceCel.indexes = new Uint8Array([1, 0, 0, 1]);
    const sourceFrame2 = addFrame(source);
    const sourceCel2 = ensureCel(source, sourceLayer.id, sourceFrame2.id)!;
    sourceCel2.tilemap = {...sourceCel.tilemap, tiles: sourceCel.tilemap.tiles.slice()};
    sourceCel2.terrainmap = {...sourceCel.terrainmap, terrains: sourceCel.terrainmap.terrains.slice()};
    sourceCel2.pixels = sourceCel.pixels.slice();
    sourceCel2.indexes = sourceCel.indexes?.slice();
    expect(linkCels(source, sourceLayer.id, [sourceFrame1, sourceFrame2.id], sourceFrame1)).toBe(true);

    const target = createDocument({width: 2, height: 2, colorMode: "indexed", palette});
    const targetTileset = createTileset({
      id: "target-tileset",
      name: "Target tiles",
      tileWidth: 1,
      tileHeight: 1,
      tiles: [{id: 7, pixels: new Uint8ClampedArray([0, 255, 0, 255]), indexes: new Uint8Array([2])}],
    });
    target.tilesets.push(targetTileset);
    const targetLayer = addTilemapLayer(target, targetTileset.id, "Target map")!;
    const targetFrame2 = addFrame(target);
    ensureCel(target, targetLayer.id, targetFrame2.id);
    const targetAddress = address(targetLayer.id, target.frames[0].id);
    const clipboard = copyCelSelection(
      source,
      [address(sourceLayer.id, sourceFrame1), address(sourceLayer.id, sourceFrame2.id)],
      address(sourceLayer.id, sourceFrame1),
      [sourceLayer.id],
    )!;

    expect(clipboard.cells[0].kind).toBe("tilemap");
    expect(clipboard.cells[0].tilemap?.tiles).not.toBe(sourceCel.tilemap.tiles);
    expect(clipboard.cells[0].terrainmap?.terrains).not.toBe(sourceCel.terrainmap.terrains);
    expect(clipboard.cells[0].tileset?.tiles[0].pixels).not.toBe(sourceTileset.tiles[0].pixels);
    expect(pasteCelSelection(target, clipboard, targetAddress, [targetLayer.id])).toHaveLength(2);

    const pasted = getCel(target, targetLayer.id, target.frames[0].id)!;
    expect(pasted.tilemap?.tiles).toEqual(new Uint32Array([1 | tileFlipX, 0, 0, 1]));
    expect(pasted.tilemap?.tiles).not.toBe(sourceCel.tilemap.tiles);
    expect(pasted.terrainmap).toMatchObject({columns: 2, rows: 2, seed: 91});
    expect([...pasted.terrainmap!.terrains]).toEqual([1, 0, 0, 1]);
    expect(pasted.indexes).toEqual(new Uint8Array([1, 0, 0, 1]));
    expect(pasted.pixels).toEqual(sourceCel.pixels);
    expect(target.tilesets[0].tiles).toHaveLength(2);
    expect(target.tilesets[0].terrains).toEqual([{
      id: 1,
      name: "Ground",
      color: "#00ff00ff",
      neighborMode: "edge4",
      boundary: "empty",
      rules: [{mask: 0, candidates: [{tileId: 1, flags: 0, weight: 1}]}],
    }]);
    expect(target.tilesets[0].tiles[1].pixels).not.toBe(sourceTileset.tiles[0].pixels);
    const pastedSecond = getCel(target, targetLayer.id, targetFrame2.id)!;
    expect(pastedSecond.linkId).toBe(pasted.linkId);
    expect(pastedSecond.tilemap).toBe(pasted.tilemap);
    expect(pastedSecond.terrainmap).toBe(pasted.terrainmap);
    expect(pastedSecond.pixels).toBe(pasted.pixels);
  });

  it("clears tilemap cels through the authoritative tile cells and refreshes indexed caches", () => {
    const palette = ["#00000000", "#ff0000ff"];
    const document = createDocument({width: 2, height: 1, colorMode: "indexed", palette});
    const tileset = createTileset({
      id: "tileset",
      tileWidth: 1,
      tileHeight: 1,
      tiles: [{id: 1, pixels: new Uint8ClampedArray([255, 0, 0, 255]), indexes: new Uint8Array([1])}],
    });
    document.tilesets.push(tileset);
    const layer = addTilemapLayer(document, tileset.id, "Map")!;
    const cel = getCel(document, layer.id, document.activeFrameId)!;
    cel.tilemap = {columns: 2, rows: 1, tiles: new Uint32Array([1, 1])};
    cel.pixels = renderTilemapCel(cel, tileset, {palette, transparentIndex: 0});
    cel.indexes = new Uint8Array([1, 1]);

    expect(clearCelSelection(document, [address(layer.id, document.activeFrameId)])).toBe(true);
    expect(cel.tilemap?.tiles).toEqual(new Uint32Array([0, 0]));
    expect(cel.pixels).toEqual(new Uint8ClampedArray(8));
    expect(cel.indexes).toEqual(new Uint8Array([0, 0]));
  });

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

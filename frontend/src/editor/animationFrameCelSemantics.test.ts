import {describe, expect, it} from "vitest";
import {
  addEmptyFrame,
  addFrame,
  addLayer,
  addTilemapLayer,
  celKey,
  cloneDocument,
  createDocument,
  deleteCel,
  duplicateFrames,
  ensureCel,
  getCel,
  linkCels,
  setLayerRole,
} from "./document";
import {createTileset} from "./tilemap";
import {CommandHistory, DocumentStateCommand} from "./history";
import {duplicateTimelineCels} from "./timelineCelOperations";

describe("animation frame Cel semantics", () => {
  it("links New Frame Cels on continuous RGBA, indexed, and tilemap layers", () => {
    const rgba = createDocument({width: 1, height: 1});
    const rgbaLayer = rgba.layers[0];
    rgbaLayer.continuous = true;
    const rgbaSource = getCel(rgba, rgbaLayer.id, rgba.activeFrameId)!;
    rgbaSource.pixels.set([10, 20, 30, 255]);
    const rgbaFrame = addFrame(rgba);
    const rgbaCopy = getCel(rgba, rgbaLayer.id, rgbaFrame.id)!;
    expect(rgbaCopy.linkId).toBe(rgbaSource.linkId);
    expect(rgbaCopy.pixels).toBe(rgbaSource.pixels);

    const indexed = createDocument({width: 1, height: 1, colorMode: "indexed", palette: ["#00000000", "#ff0000ff"]});
    const indexedLayer = indexed.layers[0];
    indexedLayer.continuous = true;
    const indexedSource = getCel(indexed, indexedLayer.id, indexed.activeFrameId)!;
    indexedSource.indexes![0] = 1;
    const indexedFrame = addFrame(indexed);
    const indexedCopy = getCel(indexed, indexedLayer.id, indexedFrame.id)!;
    expect(indexedCopy.linkId).toBe(indexedSource.linkId);
    expect(indexedCopy.indexes).toBe(indexedSource.indexes);
    expect(indexedCopy.pixels).toBe(indexedSource.pixels);

    const tilemap = createDocument({width: 1, height: 1});
    const tileset = createTileset({tileWidth: 1, tileHeight: 1, name: "Continuous tiles"});
    tilemap.tilesets.push(tileset);
    const tileLayer = addTilemapLayer(tilemap, tileset.id, "Tilemap")!;
    tileLayer.continuous = true;
    const tileSource = getCel(tilemap, tileLayer.id, tilemap.activeFrameId)!;
    tileSource.tilemap!.tiles[0] = 7;
    const tileFrame = addFrame(tilemap);
    const tileCopy = getCel(tilemap, tileLayer.id, tileFrame.id)!;
    expect(tileCopy.linkId).toBe(tileSource.linkId);
    expect(tileCopy.tilemap).toBe(tileSource.tilemap);
    expect(tileCopy.pixels).toBe(tileSource.pixels);
  });

  it("links duplicate frames on continuous layers while copying ordinary payloads", () => {
    const document = createDocument({width: 1, height: 1});
    const continuous = document.layers[0];
    continuous.continuous = true;
    const source = getCel(document, continuous.id, document.activeFrameId)!;
    source.pixels.set([10, 20, 30, 255]);
    const copied = duplicateFrames(document, [document.activeFrameId])[0]!;
    const linked = getCel(document, continuous.id, copied.id)!;
    expect(linked.linkId).toBe(source.linkId);
    expect(linked.pixels).toBe(source.pixels);
    linked.pixels[0] = 99;
    expect(source.pixels[0]).toBe(99);

    const ordinary = addLayer(document, "Ordinary");
    const ordinarySource = getCel(document, ordinary.id, copied.id)!;
    ordinarySource.pixels[0] = 41;
    const next = duplicateFrames(document, [copied.id])[0]!;
    const detached = getCel(document, ordinary.id, next.id)!;
    expect(detached.linkId).not.toBe(ordinarySource.linkId);
    expect(detached.pixels).not.toBe(ordinarySource.pixels);
    detached.pixels[0] = 210;
    expect(ordinarySource.pixels[0]).toBe(41);
  });

  it("restores continuous duplicate-frame links through one history command", () => {
    const document = createDocument({width: 1, height: 1});
    document.layers[0].continuous = true;
    const before = cloneDocument(document);
    const copies = duplicateFrames(document, [document.activeFrameId]);
    const history = new CommandHistory<typeof document>();
    history.commit(new DocumentStateCommand(before, document, "Duplicate Frame"));
    expect(history.undo(document)?.label).toBe("Duplicate Frame");
    expect(document.frames).toHaveLength(1);
    history.redo(document);
    const restored = getCel(document, document.activeLayerId, copies[0].id)!;
    const restoredSource = getCel(document, document.activeLayerId, document.frames[0].id)!;
    expect(restored.linkId).toBe(restoredSource.linkId);
    expect(restored.pixels).toBe(restoredSource.pixels);
  });

  it("links indexed tilemap and background cels without violating background properties", () => {
    const indexed = createDocument({width: 1, height: 1, colorMode: "indexed", palette: ["#00000000", "#ff0000ff"]});
    const tileset = createTileset({tileWidth: 1, tileHeight: 1, name: "Continuous tiles"});
    tileset.tiles.push({id: 1, pixels: new Uint8ClampedArray([255, 0, 0, 255]), indexes: new Uint8Array([1])});
    indexed.tilesets.push(tileset);
    const tileLayer = addTilemapLayer(indexed, tileset.id, "Tilemap")!;
    tileLayer.continuous = true;
    const tileSource = getCel(indexed, tileLayer.id, indexed.activeFrameId)!;
    tileSource.tilemap!.tiles[0] = 1;
    tileSource.indexes = new Uint8Array([1]);
    const tileCopyFrame = duplicateFrames(indexed, [indexed.activeFrameId])[0]!;
    const tileCopy = getCel(indexed, tileLayer.id, tileCopyFrame.id)!;
    expect(tileCopy.linkId).toBe(tileSource.linkId);
    expect(tileCopy.tilemap).toBe(tileSource.tilemap);
    expect(tileCopy.indexes).toBe(tileSource.indexes);

    const background = createDocument({width: 1, height: 1});
    const backgroundLayer = background.layers[0];
    backgroundLayer.role = "background";
    backgroundLayer.continuous = true;
    const backgroundSource = getCel(background, backgroundLayer.id, background.activeFrameId)!;
    backgroundSource.opacity = 0.25;
    backgroundSource.zIndex = 7;
    const backgroundCopyFrame = duplicateFrames(background, [background.activeFrameId])[0]!;
    const backgroundCopy = getCel(background, backgroundLayer.id, backgroundCopyFrame.id)!;
    expect(backgroundCopy.linkId).toBe(backgroundSource.linkId);
    expect(backgroundCopy.opacity).toBe(1);
    expect(backgroundCopy.zIndex).toBe(0);
  });

  it("copies the complete current frame while keeping sparse and linked buffers independent", () => {
    const document = createDocument({width: 2, height: 1});
    const baseLayer = document.layers[0];
    const sparseLayer = addLayer(document, "Sparse");
    const firstFrame = document.frames[0];
    const sparseCel = getCel(document, sparseLayer.id, firstFrame.id)!;
    sparseCel.pixels[0] = 22;
    deleteCel(document, sparseLayer.id, firstFrame.id);

    const secondFrame = addFrame(document);
    document.activeFrameId = firstFrame.id;
    const baseCel = getCel(document, baseLayer.id, firstFrame.id)!;
    const secondBaseCel = getCel(document, baseLayer.id, secondFrame.id)!;
    baseCel.pixels.set([12, 34, 56, 255, 0, 0, 0, 0]);
    expect(linkCels(document, baseLayer.id, [firstFrame.id, secondFrame.id], firstFrame.id)).toBe(true);

    const copiedFrame = addFrame(document);
    const copiedBaseCel = getCel(document, baseLayer.id, copiedFrame.id)!;

    expect(Array.from(copiedBaseCel.pixels)).toEqual(Array.from(baseCel.pixels));
    expect(copiedBaseCel.id).not.toBe(baseCel.id);
    expect(copiedBaseCel.linkId).not.toBe(baseCel.linkId);
    expect(copiedBaseCel.pixels).not.toBe(baseCel.pixels);
    expect(getCel(document, sparseLayer.id, copiedFrame.id)).toBeNull();

    copiedBaseCel.pixels[0] = 240;
    expect(baseCel.pixels[0]).toBe(12);
    expect(secondBaseCel.pixels[0]).toBe(12);
  });

  it("copies indexed and tilemap Cel payloads without sharing their buffers", () => {
    const indexed = createDocument({width: 2, height: 1, colorMode: "indexed", palette: ["#00000000", "#ff0000ff"]});
    const indexedSource = getCel(indexed, indexed.activeLayerId, indexed.activeFrameId)!;
    indexedSource.indexes!.set([1, 0]);
    indexedSource.pixels.set([255, 0, 0, 255, 0, 0, 0, 0]);
    const indexedCopy = addFrame(indexed);
    const indexedTarget = getCel(indexed, indexed.activeLayerId, indexedCopy.id)!;
    expect(Array.from(indexedTarget.indexes ?? [])).toEqual([1, 0]);
    expect(indexedTarget.indexes).not.toBe(indexedSource.indexes);
    expect(indexedTarget.pixels).not.toBe(indexedSource.pixels);

    const tilemap = createDocument({width: 2, height: 2});
    const tileset = createTileset({tileWidth: 1, tileHeight: 1, name: "Test"});
    tilemap.tilesets.push(tileset);
    const tileLayer = addTilemapLayer(tilemap, tileset.id, "Tiles");
    const firstFrame = tilemap.frames[0];
    const source = ensureCel(tilemap, tileLayer!.id, firstFrame.id)!;
    source.tilemap!.tiles[0] = 7;
    source.pixels[0] = 99;
    tilemap.activeFrameId = firstFrame.id;
    const copiedFrame = addFrame(tilemap);
    const copied = getCel(tilemap, tileLayer!.id, copiedFrame.id)!;
    expect(copied.tilemap!.tiles[0]).toBe(7);
    expect(copied.tilemap).not.toBe(source.tilemap);
    expect(copied.tilemap!.tiles).not.toBe(source.tilemap!.tiles);
    expect(copied.pixels).not.toBe(source.pixels);
    copied.tilemap!.tiles[0] = 3;
    expect(source.tilemap!.tiles[0]).toBe(7);
  });

  it("creates a background Cel for an empty frame using the active background color", () => {
    const document = createDocument({width: 2, height: 1, palette: ["#00000000", "#ff0000ff"]});
    const background = addLayer(document, "Background");
    expect(setLayerRole(document, background.id, "background")).toBe(true);
    deleteCel(document, background.id, document.activeFrameId);

    const frame = addEmptyFrame(document, 180, [12, 34, 56, 255]);
    const cel = getCel(document, background.id, frame.id)!;
    expect(Array.from(cel.pixels)).toEqual([12, 34, 56, 255, 12, 34, 56, 255]);
    expect(cel.opacity).toBe(1);
    expect(cel.zIndex).toBe(0);

    const indexed = createDocument({width: 1, height: 1, colorMode: "indexed", palette: ["#00000000", "#ff0000ff"]});
    const indexedBackground = addLayer(indexed, "Background");
    expect(setLayerRole(indexed, indexedBackground.id, "background")).toBe(true);
    const indexedFrame = addEmptyFrame(indexed, 100, [255, 0, 0, 255]);
    const indexedCel = getCel(indexed, indexedBackground.id, indexedFrame.id)!;
    expect(Array.from(indexedCel.indexes ?? [])).toEqual([1]);
    expect(Array.from(indexedCel.pixels)).toEqual([255, 0, 0, 255]);
  });

  it("duplicates selected Cels to the next frame with independent copied link groups", () => {
    const document = createDocument({width: 2, height: 1});
    const layer = document.layers[0];
    const first = document.frames[0];
    const second = addEmptyFrame(document);
    const third = addEmptyFrame(document);
    const firstCel = getCel(document, layer.id, first.id)!;
    const secondCel = ensureCel(document, layer.id, second.id)!;
    firstCel.pixels[0] = 41;
    secondCel.pixels[0] = 41;
    expect(linkCels(document, layer.id, [first.id, second.id], first.id)).toBe(true);

    const result = duplicateTimelineCels(document, {
      sourceAddresses: [
        {layerId: layer.id, frameId: first.id},
        {layerId: layer.id, frameId: second.id},
      ],
      sourceAnchor: {layerId: layer.id, frameId: first.id},
      orderedLayerIds: [layer.id],
      targetFrameIndex: 2,
    });

    expect(result?.targetAddresses).toHaveLength(2);
    expect(document.frames).toHaveLength(4);
    const copiedFirst = getCel(document, layer.id, document.frames[2].id)!;
    const copiedSecond = getCel(document, layer.id, document.frames[3].id)!;
    expect(copiedFirst.linkId).not.toBe(firstCel.linkId);
    expect(copiedSecond.linkId).toBe(copiedFirst.linkId);
    expect(copiedFirst.pixels).toBe(copiedSecond.pixels);
    expect(copiedFirst.pixels).not.toBe(firstCel.pixels);
    copiedFirst.pixels[0] = 210;
    expect(firstCel.pixels[0]).toBe(41);
  });

  it("duplicates indexed and tilemap Cels with their authoritative payloads", () => {
    const indexed = createDocument({width: 1, height: 1, colorMode: "indexed", palette: ["#00000000", "#ff0000ff"]});
    const indexedSource = getCel(indexed, indexed.activeLayerId, indexed.activeFrameId)!;
    indexedSource.indexes![0] = 1;
    indexedSource.pixels.set([255, 0, 0, 255]);
    const indexedResult = duplicateTimelineCels(indexed, {
      sourceAddresses: [{layerId: indexed.activeLayerId, frameId: indexed.activeFrameId}],
      sourceAnchor: {layerId: indexed.activeLayerId, frameId: indexed.activeFrameId},
      orderedLayerIds: [indexed.activeLayerId],
    });
    expect(indexedResult).not.toBeNull();
    const indexedCopy = getCel(indexed, indexed.activeLayerId, indexed.frames[1].id)!;
    expect(Array.from(indexedCopy.indexes ?? [])).toEqual([1]);
    expect(indexedCopy.indexes).not.toBe(indexedSource.indexes);

    const tilemap = createDocument({width: 1, height: 1});
    const tileset = createTileset({tileWidth: 1, tileHeight: 1, name: "Duplicate tiles"});
    tilemap.tilesets.push(tileset);
    const tileLayer = addTilemapLayer(tilemap, tileset.id, "Tiles")!;
    const tileSource = getCel(tilemap, tileLayer.id, tilemap.activeFrameId)!;
    tileSource.tilemap!.tiles[0] = 9;
    const tileResult = duplicateTimelineCels(tilemap, {
      sourceAddresses: [{layerId: tileLayer.id, frameId: tilemap.activeFrameId}],
      sourceAnchor: {layerId: tileLayer.id, frameId: tilemap.activeFrameId},
      orderedLayerIds: [tileLayer.id],
    });
    expect(tileResult).not.toBeNull();
    const tileCopy = getCel(tilemap, tileLayer.id, tilemap.frames[1].id)!;
    expect(tileCopy.tilemap!.tiles[0]).toBe(9);
    expect(tileCopy.tilemap!.tiles).not.toBe(tileSource.tilemap!.tiles);
  });

  it("keeps duplicate-Cel placement ready for one document history command", () => {
    const document = createDocument({width: 1, height: 1});
    const layer = document.layers[0];
    const before = cloneDocument(document);
    const source = {layerId: layer.id, frameId: document.activeFrameId};
    const result = duplicateTimelineCels(document, {
      sourceAddresses: [source],
      sourceAnchor: source,
      orderedLayerIds: [layer.id],
    });
    expect(result).not.toBeNull();
    expect(document.cels[celKey(layer.id, document.frames[1].id)]).toBeDefined();

    const history = new CommandHistory<typeof document>();
    history.commit(new DocumentStateCommand(before, document, "Duplicate Cels"));
    expect(history.undo(document)?.label).toBe("Duplicate Cels");
    expect(document.frames).toHaveLength(1);
    history.redo(document);
    expect(document.frames).toHaveLength(2);
    expect(getCel(document, layer.id, document.frames[1].id)).toBeDefined();
  });
});

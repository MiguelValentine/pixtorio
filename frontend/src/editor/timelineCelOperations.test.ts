import {describe, expect, it} from "vitest";
import {addFrame, addLayer, addTilemapLayer, createDocument, ensureCel, getActiveCel, getCel, linkCels, setLayerRole} from "./document";
import {addTile, createTileset, renderTilemapCel} from "./tilemap";
import {duplicateLinkedTimelineCels, duplicateTimelineCels, transferTimelineCels} from "./timelineCelOperations";

function address(layerId: string, frameId: string) {
  return {layerId, frameId};
}

describe("timeline cel operations", () => {
  it("keeps copied Cels linked on continuous layers and exposes an explicit linked variant", () => {
    const continuous = createDocument({width: 1, height: 1});
    const layer = continuous.layers[0];
    layer.continuous = true;
    const source = getCel(continuous, layer.id, continuous.activeFrameId)!;
    source.pixels[0] = 47;
    const result = duplicateTimelineCels(continuous, {
      sourceAddresses: [address(layer.id, continuous.activeFrameId)],
      sourceAnchor: address(layer.id, continuous.activeFrameId),
      orderedLayerIds: [layer.id],
    });
    expect(result).not.toBeNull();
    const linkedCopy = getCel(continuous, layer.id, continuous.frames[1].id)!;
    expect(linkedCopy.linkId).toBe(source.linkId);
    expect(linkedCopy.pixels).toBe(source.pixels);

    const ordinary = createDocument({width: 1, height: 1});
    const ordinaryLayer = ordinary.layers[0];
    const ordinarySource = getCel(ordinary, ordinaryLayer.id, ordinary.activeFrameId)!;
    ordinarySource.pixels[0] = 19;
    const linkedResult = duplicateLinkedTimelineCels(ordinary, {
      sourceAddresses: [address(ordinaryLayer.id, ordinary.activeFrameId)],
      sourceAnchor: address(ordinaryLayer.id, ordinary.activeFrameId),
      orderedLayerIds: [ordinaryLayer.id],
    });
    expect(linkedResult).not.toBeNull();
    const forcedLinked = getCel(ordinary, ordinaryLayer.id, ordinary.frames[1].id)!;
    expect(forcedLinked.linkId).toBe(ordinarySource.linkId);
    expect(forcedLinked.pixels).toBe(ordinarySource.pixels);
  });

  it("materializes opaque background Cels when a copy is dropped into the append slot", () => {
    const rgba = createDocument({width: 2, height: 1});
    const background = addLayer(rgba, "Background");
    expect(setLayerRole(rgba, background.id, "background")).toBe(true);
    const sourceLayer = rgba.layers.find((layer) => layer.id !== background.id)!;
    const sourceFrame = rgba.activeFrameId;
    const source = getCel(rgba, sourceLayer.id, sourceFrame)!;
    source.pixels[3] = 255;
    const result = transferTimelineCels(rgba, {
      sourceAddresses: [address(sourceLayer.id, sourceFrame)],
      sourceAnchor: address(sourceLayer.id, sourceFrame),
      targetLayerId: sourceLayer.id,
      targetFrameIndex: rgba.frames.length,
      orderedLayerIds: [background.id, sourceLayer.id],
      mode: "copy",
      backgroundColor: [12, 34, 56, 255],
    });
    expect(result?.createdFrameIds).toHaveLength(1);
    const appendedFrameId = rgba.frames.at(-1)!.id;
    const backgroundCel = getCel(rgba, background.id, appendedFrameId)!;
    expect(Array.from(backgroundCel.pixels)).toEqual([12, 34, 56, 255, 12, 34, 56, 255]);
    expect(backgroundCel.opacity).toBe(1);
    expect(backgroundCel.zIndex).toBe(0);

    const indexed = createDocument({width: 1, height: 1, colorMode: "indexed", palette: ["#00000000", "#ff0000ff"]});
    const indexedBackground = addLayer(indexed, "Background");
    expect(setLayerRole(indexed, indexedBackground.id, "background")).toBe(true);
    const indexedSourceLayer = indexed.layers.find((layer) => layer.id !== indexedBackground.id)!;
    const indexedSourceFrame = indexed.activeFrameId;
    const indexedResult = transferTimelineCels(indexed, {
      sourceAddresses: [address(indexedSourceLayer.id, indexedSourceFrame)],
      sourceAnchor: address(indexedSourceLayer.id, indexedSourceFrame),
      targetLayerId: indexedSourceLayer.id,
      targetFrameIndex: indexed.frames.length,
      orderedLayerIds: [indexedBackground.id, indexedSourceLayer.id],
      mode: "copy",
      backgroundColor: [255, 0, 0, 255],
    });
    expect(indexedResult?.createdFrameIds).toHaveLength(1);
    const indexedCel = getCel(indexed, indexedBackground.id, indexed.frames.at(-1)!.id)!;
    expect(Array.from(indexedCel.indexes ?? [])).toEqual([1]);
    expect(Array.from(indexedCel.pixels)).toEqual([255, 0, 0, 255]);
  });

  it("appends missing frames at the drop column without inheriting unrelated continuous cels", () => {
    const document = createDocument({width: 2, height: 1});
    const sourceLayer = document.layers[0];
    sourceLayer.continuous = true;
    const firstFrame = document.frames[0];
    firstFrame.durationMs = 140;
    const secondFrame = addFrame(document, 280);
    const source = getCel(document, sourceLayer.id, firstFrame.id)!;
    source.pixels[3] = 255;

    const otherLayer = addLayer(document, "Other");
    otherLayer.continuous = true;
    const otherCel = getCel(document, otherLayer.id, secondFrame.id)!;
    expect(otherCel).toBeDefined();

    const result = transferTimelineCels(document, {
      sourceAddresses: [address(sourceLayer.id, firstFrame.id)],
      sourceAnchor: address(sourceLayer.id, firstFrame.id),
      targetLayerId: sourceLayer.id,
      targetFrameIndex: document.frames.length,
      orderedLayerIds: [sourceLayer.id, otherLayer.id],
      mode: "move",
    });

    expect(result?.createdFrameIds).toHaveLength(1);
    expect(document.frames).toHaveLength(3);
    expect(document.frames.at(-1)?.durationMs).toBe(140);
    expect(getCel(document, sourceLayer.id, firstFrame.id)).toBeNull();
    expect(getCel(document, sourceLayer.id, document.frames.at(-1)!.id)).toBeDefined();
    expect(getCel(document, otherLayer.id, document.frames.at(-1)!.id)).toBeNull();
  });

  it("copies linked indexed cels into appended frames with source durations and independent buffers", () => {
    const document = createDocument({width: 2, height: 1, colorMode: "indexed", palette: ["#00000000", "#ff0000ff"]});
    const sourceLayer = document.layers[0];
    const firstFrame = document.frames[0];
    firstFrame.durationMs = 90;
    const secondFrame = addFrame(document, 210);
    const source = getCel(document, sourceLayer.id, firstFrame.id)!;
    const secondCel = ensureCel(document, sourceLayer.id, secondFrame.id)!;
    source.indexes = new Uint8Array([1, 0]);
    secondCel.indexes = source.indexes;
    secondCel.pixels = source.pixels;
    linkCels(document, sourceLayer.id, [firstFrame.id, secondFrame.id], firstFrame.id);

    const result = transferTimelineCels(document, {
      sourceAddresses: [address(sourceLayer.id, firstFrame.id), address(sourceLayer.id, secondFrame.id)],
      sourceAnchor: address(sourceLayer.id, firstFrame.id),
      targetLayerId: sourceLayer.id,
      targetFrameIndex: document.frames.length,
      orderedLayerIds: [sourceLayer.id],
      mode: "copy",
    });

    expect(result?.targetAddresses).toHaveLength(2);
    expect(result?.createdFrameIds).toHaveLength(2);
    const copiedFirst = getCel(document, sourceLayer.id, document.frames[2].id)!;
    const copiedSecond = getCel(document, sourceLayer.id, document.frames[3].id)!;
    expect(document.frames.slice(2).map((frame) => frame.durationMs)).toEqual([90, 210]);
    expect(copiedFirst.linkId).toBe(copiedSecond.linkId);
    expect(copiedFirst.pixels).toBe(copiedSecond.pixels);
    expect(copiedFirst.pixels).not.toBe(source.pixels);
    expect(copiedFirst.indexes).not.toBe(source.indexes);
    expect([...copiedFirst.indexes!]).toEqual([1, 0]);
  });

  it("moves a sparse indexed cel between existing frames without changing canvas geometry", () => {
    const document = createDocument({width: 2, height: 1, colorMode: "indexed", palette: ["#00000000", "#ff0000ff"]});
    const layerId = document.activeLayerId;
    const firstFrameId = document.activeFrameId;
    const source = getActiveCel(document);
    const secondFrame = addFrame(document);
    source.x = 3;
    source.y = -2;
    source.width = 1;
    source.height = 1;
    source.pixels = new Uint8ClampedArray([255, 0, 0, 255]);
    source.indexes = new Uint8Array([1]);

    const result = transferTimelineCels(document, {
      sourceAddresses: [address(layerId, firstFrameId)],
      sourceAnchor: address(layerId, firstFrameId),
      targetAnchor: address(layerId, secondFrame.id),
      orderedLayerIds: [layerId],
      mode: "move",
    });

    expect(result?.targetAddresses).toEqual([address(layerId, secondFrame.id)]);
    expect(getCel(document, layerId, firstFrameId)).toBeNull();
    const moved = getCel(document, layerId, secondFrame.id)!;
    expect({x: moved.x, y: moved.y, width: moved.width, height: moved.height}).toEqual({x: 3, y: -2, width: 1, height: 1});
    expect([...moved.indexes!]).toEqual([1]);
    expect([...moved.pixels]).toEqual([255, 0, 0, 255]);
  });

  it("copies linked cels to another layer and frame with independent shared buffers", () => {
    const document = createDocument({width: 2, height: 1});
    const sourceLayer = document.layers[0];
    const firstFrame = document.frames[0];
    const source = getCel(document, sourceLayer.id, firstFrame.id)!;
    const sourceLinkId = source.linkId;
    const secondFrame = addFrame(document);
    const thirdFrame = addFrame(document);
    const fourthFrame = addFrame(document);
    const secondCel = document.cels[`${sourceLayer.id}:${secondFrame.id}`] = {
      ...source,
      id: "second-cel",
      frameId: secondFrame.id,
    };
    secondCel.pixels = source.pixels;
    linkCels(document, sourceLayer.id, [firstFrame.id, secondFrame.id], firstFrame.id);

    const destinationLayer = addLayer(document, "Destination");
    const result = transferTimelineCels(document, {
      sourceAddresses: [address(sourceLayer.id, firstFrame.id), address(sourceLayer.id, secondFrame.id)],
      sourceAnchor: address(sourceLayer.id, firstFrame.id),
      targetAnchor: address(destinationLayer.id, thirdFrame.id),
      orderedLayerIds: [sourceLayer.id, destinationLayer.id],
      mode: "copy",
    });

    expect(result?.targetAddresses).toEqual([
      address(destinationLayer.id, thirdFrame.id),
      address(destinationLayer.id, fourthFrame.id),
    ]);
    const copiedFirst = getCel(document, destinationLayer.id, thirdFrame.id)!;
    const copiedSecond = getCel(document, destinationLayer.id, fourthFrame.id)!;
    expect(copiedFirst).toBeDefined();
    expect(copiedSecond).toBeDefined();
    expect(copiedFirst.linkId).not.toBe(sourceLinkId);
    expect(copiedSecond.linkId).toBe(copiedFirst.linkId);
    expect(copiedSecond.pixels).toBe(copiedFirst.pixels);
    expect(getCel(document, sourceLayer.id, firstFrame.id)).toBeDefined();
    expect(getCel(document, sourceLayer.id, secondFrame.id)).toBeDefined();
  });

  it("copies tilemap authority and indexed caches without aliasing the source", () => {
    const document = createDocument({width: 2, height: 1, colorMode: "indexed", palette: ["#00000000", "#ff0000ff"]});
    const tileset = createTileset({id: "tileset", name: "Tiles", tileWidth: 1, tileHeight: 1});
    const tile = addTile(tileset, new Uint8ClampedArray([255, 0, 0, 255]));
    document.tilesets.push(tile.tileset);
    const sourceLayer = addTilemapLayer(document, tileset.id, "Source map")!;
    const firstFrameId = document.activeFrameId;
    const secondFrame = addFrame(document);
    const source = getCel(document, sourceLayer.id, firstFrameId)!;
    source.tilemap!.tiles.set([tile.tile.id, 0]);
    source.pixels = renderTilemapCel(source, tile.tileset, {palette: document.palette.colors, transparentIndex: document.palette.transparentIndex});
    source.indexes = new Uint8Array([1, 0]);

    const destinationLayer = addTilemapLayer(document, tileset.id, "Destination map")!;
    const result = transferTimelineCels(document, {
      sourceAddresses: [address(sourceLayer.id, firstFrameId)],
      sourceAnchor: address(sourceLayer.id, firstFrameId),
      targetAnchor: address(destinationLayer.id, secondFrame.id),
      orderedLayerIds: [sourceLayer.id, destinationLayer.id],
      mode: "copy",
    });

    expect(result).not.toBeNull();
    const copied = getCel(document, destinationLayer.id, secondFrame.id)!;
    expect(copied.tilemap).toBeDefined();
    expect([...copied.tilemap!.tiles]).toEqual([tile.tile.id, 0]);
    expect(copied.tilemap).not.toBe(source.tilemap);
    expect(copied.tilemap!.tiles).not.toBe(source.tilemap!.tiles);
    expect([...copied.indexes!]).toEqual([1, 0]);
    expect(copied.pixels).not.toBe(source.pixels);
  });

  it("rejects out-of-range targets and locked layers without partial writes", () => {
    const document = createDocument({width: 2, height: 1});
    const layerId = document.activeLayerId;
    const frameId = document.activeFrameId;
    const before = getCel(document, layerId, frameId)!;
    document.layers[0].locked = true;
    expect(transferTimelineCels(document, {
      sourceAddresses: [address(layerId, frameId)],
      sourceAnchor: address(layerId, frameId),
      targetAnchor: address(layerId, frameId),
      orderedLayerIds: [layerId],
      mode: "move",
    })).toBeNull();
    expect(getCel(document, layerId, frameId)).toBe(before);
  });
});

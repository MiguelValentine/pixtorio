import {describe, expect, it} from "vitest";
import {
  addEmptyFrame,
  addFrame,
  addFrameTag,
  addLayer,
  addSlice,
  addSliceKey,
  celKey,
  createDocument,
  ensureCel,
  getCel,
  linkCels,
} from "./document";
import {createTileset} from "./tilemap";
import {canCopyLayersToDocument, copyFramesToDocument, copyLayersToDocument} from "./crossDocumentCopy";

describe("cross-document frame copy", () => {
  it("imports sparse linked cels with fresh IDs and mapped tags/slices", () => {
    const source = createDocument({name: "source.pixio", width: 2, height: 2});
    const second = addEmptyFrame(source, 240);
    const third = addEmptyFrame(source, 480);
    const sourceCel = getCel(source, source.activeLayerId, source.frames[0].id)!;
    const secondCel = ensureCel(source, source.activeLayerId, second.id)!;
    sourceCel.pixels.set([9, 8, 7, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    secondCel.pixels = sourceCel.pixels;
    secondCel.linkId = sourceCel.linkId;
    expect(linkCels(source, source.activeLayerId, [source.frames[0].id, second.id])).toBe(false);
    // Keep the third frame sparse to prove missing Cels are not materialized.
    source.cels[celKey(source.activeLayerId, third.id)] = {
      ...sourceCel,
      id: "temporary-third-cel",
      frameId: third.id,
      pixels: sourceCel.pixels.slice(),
      linkId: "third-link",
    };
    delete source.cels[celKey(source.activeLayerId, third.id)];
    const tag = addFrameTag(source, "Run", source.frames[0].id, third.id, "pingpong", "#00ff00ff")!;
    tag.repeat = 3;
    const slice = addSlice(source, "Hitbox", {frameId: second.id, x: 0, y: 0, width: 1, height: 1})!;
    expect(addSliceKey(source, slice.id, third.id, {x: 1, y: 1, width: 1, height: 1})).not.toBeNull();
    source.guides.push({id: "source-guide", axis: "vertical", position: 1});

    const destination = createDocument({name: "destination.pixio", width: 2, height: 2});
    const result = copyFramesToDocument(source, [source.frames[0].id, second.id], destination)!;

    expect(result.frameIds).toHaveLength(2);
    expect(result.layerIds).toHaveLength(source.layers.length);
    expect(destination.frames).toHaveLength(3);
    expect(destination.frames.slice(1).map((frame) => frame.durationMs)).toEqual([100, 240]);
    expect(result.frameIds.every((id) => !source.frames.some((frame) => frame.id === id))).toBe(true);

    const importedLayerId = result.layerIds.find((id) => destination.layers.find((layer) => layer.id === id)?.kind === "image")!;
    const importedFirst = getCel(destination, importedLayerId, result.frameIds[0])!;
    const importedSecond = getCel(destination, importedLayerId, result.frameIds[1])!;
    expect(importedFirst.pixels).not.toBe(sourceCel.pixels);
    expect(importedFirst.pixels).toBe(importedSecond.pixels);
    expect(importedFirst.linkId).toBe(importedSecond.linkId);
    expect(getCel(destination, importedLayerId, destination.frames[0].id)).toBeNull();
    expect(destination.tags).toHaveLength(1);
    expect(destination.tags[0]).toMatchObject({name: "Run", direction: "pingpong", repeat: 3, fromFrameId: result.frameIds[0], toFrameId: result.frameIds[1]});
    expect(destination.slices[0].keys.map((key) => key.frameId)).toEqual([result.frameIds[1]]);
    expect(destination.guides).toHaveLength(1);
  });

  it("copies indexed tilemap caches and authoritative indexes without aliasing the source", () => {
    const palette = ["#00000000", "#ff0000ff"];
    const source = createDocument({width: 2, height: 2, colorMode: "indexed", palette});
    const tileset = createTileset({id: "source-tileset", name: "Tiles", tileWidth: 1, tileHeight: 1, tiles: [{id: 1, pixels: new Uint8ClampedArray([255, 0, 0, 255]), indexes: new Uint8Array([1])}]});
    source.tilesets.push(tileset);
    const layer = addLayer(source, "Tilemap source");
    layer.kind = "tilemap";
    layer.tilesetId = tileset.id;
    const cel = getCel(source, layer.id, source.activeFrameId)!;
    cel.indexes = new Uint8Array([1, 0, 0, 1]);
    cel.tilemap = {columns: 2, rows: 2, tiles: new Uint32Array([1, 0, 0, 1])};
    cel.pixels.set([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 255]);

    const destination = createDocument({width: 2, height: 2, colorMode: "indexed", palette});
    const result = copyFramesToDocument(source, [source.activeFrameId], destination)!;
    const importedTilemapLayerId = result.layerIds.find((id) => destination.layers.find((candidate) => candidate.id === id)?.kind === "tilemap")!;
    const imported = getCel(destination, importedTilemapLayerId, result.frameIds[0])!;
    expect(imported.indexes).not.toBe(cel.indexes);
    expect(Array.from(imported.indexes!)).toEqual([1, 0, 0, 1]);
    expect(imported.tilemap).toEqual({columns: 2, rows: 2, tiles: new Uint32Array([1, 0, 0, 1])});
    expect(imported.tilemap?.tiles).not.toBe(cel.tilemap?.tiles);
    expect(destination.layers.find((candidate) => candidate.id === importedTilemapLayerId)?.tilesetId).not.toBe(tileset.id);
    expect(destination.tilesets).toHaveLength(1);
  });

  it("rejects incompatible open documents before mutating them", () => {
    const source = createDocument({width: 2, height: 2});
    const destination = createDocument({width: 3, height: 2});
    const beforeFrames = destination.frames.length;
    expect(copyFramesToDocument(source, [source.activeFrameId], destination)).toBeNull();
    expect(destination.frames).toHaveLength(beforeFrames);
    expect(destination.layers).toHaveLength(1);
  });

  it("rejects indexed targets with a different palette instead of reinterpreting indexes", () => {
    const source = createDocument({width: 1, height: 1, colorMode: "indexed", palette: ["#00000000", "#ff0000ff"]});
    const destination = createDocument({width: 1, height: 1, colorMode: "indexed", palette: ["#00000000", "#0000ffff"]});
    expect(copyFramesToDocument(source, [source.activeFrameId], destination)).toBeNull();
    expect(destination.frames).toHaveLength(1);
  });

  it("preserves reverse tag endpoints and direction when copying frames", () => {
    const source = createDocument({width: 1, height: 1});
    addFrame(source);
    addFrame(source);
    const reverse = addFrameTag(source, "Reverse", source.frames[2].id, source.frames[0].id, "reverse", "#abcdef")!;
    reverse.repeat = 2;
    const destination = createDocument({width: 1, height: 1});
    const result = copyFramesToDocument(source, source.frames.map((frame) => frame.id), destination)!;
    expect(destination.tags).toHaveLength(1);
    expect(destination.tags[0]).toMatchObject({
      name: "Reverse",
      direction: "reverse",
      repeat: 2,
      fromFrameId: result.frameIds[2],
      toFrameId: result.frameIds[0],
    });
  });
});

describe("cross-document layer copy", () => {
  it("imports a selected nested layer subtree across matching timelines", () => {
    const source = createDocument({name: "source.pixio", width: 2, height: 2});
    const group = addLayer(source, "Group placeholder");
    group.kind = "group";
    const child = addLayer(source, "Animated child");
    child.parentId = group.id;
    const second = addFrame(source, 240);
    const firstCel = getCel(source, child.id, source.frames[0].id)!;
    const secondCel = ensureCel(source, child.id, second.id)!;
    firstCel.pixels.set([1, 2, 3, 255, 4, 5, 6, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
    firstCel.x = -1;
    firstCel.opacity = 0.65;
    firstCel.zIndex = 4;
    secondCel.pixels = firstCel.pixels;
    secondCel.linkId = firstCel.linkId;
    // A sibling outside the selected subtree must not be imported.
    const sibling = addLayer(source, "Unselected");
    sibling.parentId = undefined;

    const destination = createDocument({name: "destination.pixio", width: 2, height: 2});
    addFrame(destination, 80);
    const destinationFrameIDs = destination.frames.map((frame) => frame.id);
    expect(canCopyLayersToDocument(source, destination)).toBe(true);
    const result = copyLayersToDocument(source, [group.id, child.id], destination)!;

    expect(result.layerIds).toHaveLength(2);
    expect(destination.layers.some((layer) => layer.name === "Unselected")).toBe(false);
    const importedGroup = destination.layers.find((layer) => layer.id === result.layerIds[0])!;
    const importedChild = destination.layers.find((layer) => layer.id === result.layerIds[1])!;
    expect(importedGroup.kind).toBe("group");
    expect(importedChild.parentId).toBe(importedGroup.id);
    expect(importedChild.id).not.toBe(child.id);

    const importedFirst = getCel(destination, importedChild.id, destinationFrameIDs[0])!;
    const importedSecond = getCel(destination, importedChild.id, destinationFrameIDs[1])!;
    expect(importedFirst.pixels).not.toBe(firstCel.pixels);
    expect(importedFirst.pixels).toBe(importedSecond.pixels);
    expect(importedFirst.linkId).toBe(importedSecond.linkId);
    expect(importedFirst).toMatchObject({x: -1, opacity: 0.65, zIndex: 4});
    expect(destination.activeLayerId).toBe(importedChild.id);
  });

  it("copies indexed tilemap resources, caches and authoritative indexes without aliasing", () => {
    const palette = ["#00000000", "#ff0000ff"];
    const source = createDocument({width: 2, height: 2, colorMode: "indexed", palette});
    const tileset = createTileset({id: "source-tileset", name: "Tiles", tileWidth: 1, tileHeight: 1, tiles: [{id: 1, pixels: new Uint8ClampedArray([255, 0, 0, 255]), indexes: new Uint8Array([1])}]});
    source.tilesets.push(tileset);
    const tilemap = addLayer(source, "Tilemap source");
    tilemap.kind = "tilemap";
    tilemap.tilesetId = tileset.id;
    const cel = getCel(source, tilemap.id, source.activeFrameId)!;
    cel.indexes = new Uint8Array([1, 0, 0, 1]);
    cel.tilemap = {columns: 2, rows: 2, tiles: new Uint32Array([1, 0, 0, 1])};
    cel.pixels.set([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 255]);

    const destination = createDocument({width: 2, height: 2, colorMode: "indexed", palette});
    const result = copyLayersToDocument(source, [tilemap.id], destination)!;
    const importedLayer = destination.layers.find((layer) => layer.id === result.layerIds[0])!;
    const importedCel = getCel(destination, importedLayer.id, destination.activeFrameId)!;

    expect(importedLayer.kind).toBe("tilemap");
    expect(importedLayer.tilesetId).not.toBe(tileset.id);
    expect(importedCel.indexes).not.toBe(cel.indexes);
    expect(importedCel.indexes).toEqual(cel.indexes);
    expect(importedCel.tilemap).toEqual(cel.tilemap);
    expect(importedCel.tilemap?.tiles).not.toBe(cel.tilemap?.tiles);
    expect(destination.tilesets).toHaveLength(1);
    expect(destination.tilesets[0].tiles[0].pixels).not.toBe(tileset.tiles[0].pixels);
  });

  it("rejects mismatched timelines or indexed palettes before mutating", () => {
    const source = createDocument({width: 1, height: 1, colorMode: "indexed", palette: ["#00000000", "#ff0000ff"]});
    const layer = source.layers[0];
    const differentFrameCount = createDocument({width: 1, height: 1, colorMode: "indexed", palette: ["#00000000", "#ff0000ff"]});
    addFrame(differentFrameCount);
    expect(canCopyLayersToDocument(source, differentFrameCount)).toBe(false);
    expect(copyLayersToDocument(source, [layer.id], differentFrameCount)).toBeNull();
    expect(differentFrameCount.layers).toHaveLength(1);

    const differentPalette = createDocument({width: 1, height: 1, colorMode: "indexed", palette: ["#00000000", "#0000ffff"]});
    expect(canCopyLayersToDocument(source, differentPalette)).toBe(false);
    expect(copyLayersToDocument(source, [layer.id], differentPalette)).toBeNull();
    expect(differentPalette.layers).toHaveLength(1);
  });
});

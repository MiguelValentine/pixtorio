import {describe, expect, it} from "vitest";
import {CommandHistory, DocumentStateCommand} from "./history";
import {
  addLayer,
  addLayerGroup,
  addFrame,
  addEmptyFrame,
  adjacentFrameID,
  addFrameTag,
  addSlice,
  celKey,
  cloneDocument,
  compositeFrame,
  compositeFrameForExport,
  createCel,
  createDocument,
  cropDocument,
  resizeDocument,
  deleteLayer,
  deleteFrame,
  deleteFrames,
  duplicateFrame,
  duplicateFrames,
  duplicateDocument,
  duplicateLayer,
  getLayerByID,
  getActiveCel,
  getCel,
  ensureCel,
  flattenVisibleLayers,
  frameIDsInRange,
  isCelLinked,
  linkCels,
  mergeLayerDown,
  moveLayer,
  moveFrame,
  moveFrames,
  replaceDocument,
  unlinkCels,
  setLayerLocked,
  setLayerAlphaLock,
  setLayerBlendMode,
  setLayerOpacity,
  setLayerRole,
  setLayerVisibility,
  setFrameDuration,
  setFramesDuration,
  type Layer,
  type PixelDocument,
} from "./document";
import {convertImageLayerToTilemap} from "./tilemap";
import {setPixel} from "./pixels";
import {createTerrainMapData} from "./terrain";

describe("createDocument", () => {
  it("copies Terrain links within duplicated layers without aliasing the source layer", () => {
    const document = createDocument({width: 2, height: 2});
    const converted = convertImageLayerToTilemap(document, document.activeLayerId, {tileWidth: 1, tileHeight: 1});
    document.layers[0] = converted.layer;
    document.tilesets = [converted.tileset];
    const source = converted.cels[0];
    source.terrainmap = createTerrainMapData(2, 2, 41);
    source.terrainmap.terrains.set([0, 65535, 0, 65535]);
    document.cels = {[celKey(source.layerId, source.frameId)]: source};
    const frame = addFrame(document);
    expect(linkCels(document, source.layerId, document.frames.map((item) => item.id), source.frameId)).toBe(true);
    expect(getCel(document, source.layerId, frame.id)!.terrainmap).toBe(source.terrainmap);
    const before = cloneDocument(document);
    const duplicate = duplicateLayer(document, source.layerId)!;
    const first = getCel(document, duplicate.id, source.frameId)!;
    const second = getCel(document, duplicate.id, frame.id)!;
    expect(first.terrainmap!.terrains).toBe(second.terrainmap!.terrains);
    expect(first.terrainmap!.terrains).not.toBe(source.terrainmap.terrains);
    expect(first.terrainmap).toEqual(source.terrainmap);
    first.terrainmap!.terrains[0] = 65535;
    expect(second.terrainmap!.terrains[0]).toBe(65535);
    expect(source.terrainmap.terrains[0]).toBe(0);
    const history = new CommandHistory<PixelDocument>();
    history.commit(new DocumentStateCommand(before, document, "Duplicate Terrain Layer"));
    history.undo(document);
    expect(document.layers).toHaveLength(1);
    history.redo(document);
    const restored = getCel(document, duplicate.id, source.frameId)!;
    expect(restored.terrainmap!.terrains).toBe(getCel(document, duplicate.id, frame.id)!.terrainmap!.terrains);
    expect(restored.terrainmap!.terrains).not.toBe(getCel(document, source.layerId, source.frameId)!.terrainmap!.terrains);
  });

  it("linking and unlinking Cels preserves Terrain authority and removes stale Terrain maps", () => {
    const document = createDocument({width: 2, height: 2});
    const source = getActiveCel(document);
    source.terrainmap = createTerrainMapData(2, 2, 17);
    const frame = addFrame(document);
    const target = getActiveCel(document);
    const frameIDs = document.frames.map((item) => item.id);
    expect(linkCels(document, source.layerId, frameIDs, source.frameId)).toBe(true);
    expect(target.terrainmap).toBe(source.terrainmap);
    expect(unlinkCels(document, source.layerId, [frame.id])).toBe(true);
    expect(target.terrainmap).toEqual(source.terrainmap);
    expect(target.terrainmap!.terrains).not.toBe(source.terrainmap.terrains);
    source.terrainmap = undefined;
    expect(linkCels(document, source.layerId, frameIDs, source.frameId)).toBe(true);
    expect(target.terrainmap).toBeUndefined();
  });

  it("creates one editable RGBA cel", () => {
    const document = createDocument({name: "sprite.pixio", width: 16, height: 12});
    const cel = getActiveCel(document);

    expect(document.name).toBe("sprite.pixio");
    expect(document.colorMode).toBe("rgba");
    expect(document.layers).toHaveLength(1);
    expect(document.frames).toHaveLength(1);
    expect(cel.width).toBe(16);
    expect(cel.height).toBe(12);
    expect(cel.pixels).toHaveLength(16 * 12 * 4);
    expect(getCel(document, document.activeLayerId, document.activeFrameId)).toBe(cel);
  });

  it("rejects invalid dimensions", () => {
    expect(() => createDocument({width: 0, height: 16})).toThrow(/positive integers/);
    expect(() => createDocument({width: 16, height: 16385})).toThrow(/cannot exceed/);
  });

  it("copies a supplied palette", () => {
    const colors = ["#112233"];
    const document = createDocument({width: 1, height: 1, palette: colors});
    colors[0] = "#ffffff";
    expect(document.palette.colors).toEqual(["#112233"]);
  });
});

describe("compositeFrame", () => {
  it("composites visible layers from bottom to top", () => {
    const document = createDocument({width: 1, height: 1});
    const bottom = getActiveCel(document);
    setPixel(bottom.pixels, 1, 1, 0, 0, [255, 0, 0, 255]);

    const topLayer: Layer = {
      id: "layer-top",
      name: "Top",
      visible: true,
      locked: false,
      opacity: 0.5,
      kind: "image",
      blendMode: "normal",
      role: "standard",
      continuous: false,
      alphaLock: false,
    };
    const top = createCel(topLayer.id, document.activeFrameId, 1, 1);
    setPixel(top.pixels, 1, 1, 0, 0, [0, 0, 255, 128]);
    document.layers.push(topLayer);
    document.cels[celKey(topLayer.id, document.activeFrameId)] = top;

    expect(Array.from(compositeFrame(document))).toEqual([191, 0, 64, 255]);
  });

  it("skips hidden layers", () => {
    const document = createDocument({width: 1, height: 1});
    const cel = getActiveCel(document);
    setPixel(cel.pixels, 1, 1, 0, 0, [12, 34, 56, 255]);
    document.layers[0].visible = false;

    expect(Array.from(compositeFrame(document))).toEqual([0, 0, 0, 0]);
  });

  it("preserves color and alpha when compositing translucent layers", () => {
    const document = createDocument({width: 1, height: 1});
    const bottom = getActiveCel(document);
    setPixel(bottom.pixels, 1, 1, 0, 0, [255, 0, 0, 128]);

    const topLayer: Layer = {
      id: "layer-top-alpha",
      name: "Top",
      visible: true,
      locked: false,
      opacity: 1,
      kind: "image",
      blendMode: "normal",
      role: "standard",
      continuous: false,
      alphaLock: false,
    };
    const top = createCel(topLayer.id, document.activeFrameId, 1, 1);
    setPixel(top.pixels, 1, 1, 0, 0, [0, 0, 255, 128]);
    document.layers.push(topLayer);
    document.cels[celKey(topLayer.id, document.activeFrameId)] = top;

    expect(Array.from(compositeFrame(document))).toEqual([85, 0, 170, 192]);
  });
});

describe("layer operations", () => {
  it("creates the active-frame cel when adding and removes sparse layer cels", () => {
    const document = createDocument({width: 3, height: 2});
    const baseLayerId = document.layers[0].id;
    const secondFrame = {id: "frame-second", durationMs: 180};
    document.frames.push(secondFrame);
    document.cels[celKey(baseLayerId, secondFrame.id)] = createCel(
      baseLayerId,
      secondFrame.id,
      document.width,
      document.height,
    );

    const added = addLayer(document, "Highlights");

    expect(document.layers).toHaveLength(2);
    expect(document.activeLayerId).toBe(added.id);
    const activeCel = getCel(document, added.id, document.activeFrameId);
    expect(activeCel).not.toBeNull();
    expect(activeCel?.layerId).toBe(added.id);
    expect(activeCel?.frameId).toBe(document.activeFrameId);
    expect(activeCel?.pixels).toHaveLength(document.width * document.height * 4);
    expect(getCel(document, added.id, secondFrame.id)).toBeNull();

    expect(deleteLayer(document, added.id)).toBe(true);
    expect(document.layers.map((layer) => layer.id)).toEqual([baseLayerId]);
    expect(getCel(document, added.id, document.activeFrameId)).toBeNull();
  });

  it("deep-copies every frame cel when duplicating a layer", () => {
    const document = createDocument({width: 2, height: 1});
    const source = document.layers[0];
    const secondFrame = {id: "frame-duplicate", durationMs: 240};
    document.frames.push(secondFrame);
    const secondFrameCel = createCel(source.id, secondFrame.id, document.width, document.height);
    setPixel(secondFrameCel.pixels, 2, 1, 1, 0, [20, 40, 60, 255]);
    document.cels[celKey(source.id, secondFrame.id)] = secondFrameCel;
    setPixel(
      getCel(document, source.id, document.activeFrameId)!.pixels,
      2,
      1,
      0,
      0,
      [200, 100, 50, 255],
    );

    const duplicate = duplicateLayer(document, source.id);

    expect(duplicate).not.toBeNull();
    if (!duplicate) return;
    expect(duplicate.id).not.toBe(source.id);
    expect(duplicate.name).toBe("Layer 1 copy");
    expect(document.activeLayerId).toBe(duplicate.id);
    for (const frame of document.frames) {
      const sourceCel = getCel(document, source.id, frame.id);
      const duplicateCel = getCel(document, duplicate.id, frame.id);
      expect(duplicateCel).not.toBeNull();
      expect(duplicateCel).not.toBe(sourceCel);
      expect(duplicateCel?.pixels).not.toBe(sourceCel?.pixels);
      expect(Array.from(duplicateCel?.pixels ?? [])).toEqual(Array.from(sourceCel?.pixels ?? []));
    }

    const sourcePixelBefore = Array.from(getCel(document, source.id, secondFrame.id)!.pixels);
    getCel(document, duplicate.id, secondFrame.id)!.pixels.fill(99);
    expect(Array.from(getCel(document, source.id, secondFrame.id)!.pixels)).toEqual(sourcePixelBefore);
  });

  it("duplicates a complete nested group subtree with independent internal links", () => {
    const document = createDocument({width: 2, height: 1});
    const base = document.layers[0];
    const outside = addLayer(document, "Outside");
    const group = addLayerGroup(document, "Group");
    outside.parentId = undefined;
    const child = addLayer(document, "Child");
    const nested = addLayerGroup(document, "Nested");
    const nestedChild = addLayer(document, "Nested Child");
    const first = document.frames[0];
    const second = addFrame(document, 180);
    ensureCel(document, child.id, second.id);
    ensureCel(document, nestedChild.id, first.id);
    ensureCel(document, nestedChild.id, second.id);
    const childFirst = getCel(document, child.id, first.id)!;
    const childSecond = getCel(document, child.id, second.id)!;
    childFirst.pixels.set([10, 20, 30, 255, 0, 0, 0, 0]);
    childSecond.pixels.set([40, 50, 60, 255, 0, 0, 0, 0]);
    expect(linkCels(document, child.id, [first.id, second.id], first.id)).toBe(true);

    // Linked cels can span image layers; the copied subtree must retain that
    // relationship without sharing the source tree's buffer.
    const nestedFirst = getCel(document, nestedChild.id, first.id)!;
    const nestedSecond = getCel(document, nestedChild.id, second.id)!;
    nestedFirst.linkId = childFirst.linkId;
    nestedFirst.pixels = childFirst.pixels;
    nestedSecond.linkId = childSecond.linkId;
    nestedSecond.pixels = childSecond.pixels;

    const duplicate = duplicateLayer(document, group.id, "Group Clone");

    expect(duplicate).not.toBeNull();
    if (!duplicate) return;
    expect(duplicate.kind).toBe("group");
    expect(document.activeLayerId).toBe(duplicate.id);
    const duplicateIndex = document.layers.findIndex((layer) => layer.id === duplicate.id);
    const duplicateLayers = document.layers.slice(duplicateIndex, duplicateIndex + 4);
    expect(duplicateLayers.map((layer) => layer.name)).toEqual([
      "Group Clone", "Child", "Nested", "Nested Child",
    ]);
    const duplicateChild = duplicateLayers.find((layer) => layer.name === "Child")!;
    const duplicateNested = duplicateLayers.find((layer) => layer.name === "Nested")!;
    const duplicateNestedChild = duplicateLayers.find((layer) => layer.name === "Nested Child")!;
    expect(duplicate.parentId).toBeUndefined();
    expect(duplicateChild.parentId).toBe(duplicateNested.id);
    expect(duplicateNested.parentId).toBe(duplicate.id);
    expect(duplicateNestedChild.parentId).toBe(duplicateNested.id);
    expect(document.layers.slice(0, duplicateIndex).map((layer) => layer.id)).toEqual([
      base.id,
      document.layers[1].id,
      group.id,
      child.id,
      nested.id,
      nestedChild.id,
    ]);

    const duplicateChildFirst = getCel(document, duplicateChild.id, first.id)!;
    const duplicateChildSecond = getCel(document, duplicateChild.id, second.id)!;
    const duplicateNestedFirst = getCel(document, duplicateNestedChild.id, first.id)!;
    const duplicateNestedSecond = getCel(document, duplicateNestedChild.id, second.id)!;
    expect(duplicateChildFirst.linkId).not.toBe(childFirst.linkId);
    expect(duplicateChildSecond.linkId).toBe(duplicateChildFirst.linkId);
    expect(duplicateNestedFirst.linkId).toBe(duplicateChildFirst.linkId);
    expect(duplicateNestedSecond.linkId).toBe(duplicateChildFirst.linkId);
    expect(duplicateNestedFirst.pixels).toBe(duplicateChildFirst.pixels);
    expect(duplicateNestedSecond.pixels).toBe(duplicateChildSecond.pixels);
    duplicateChildFirst.pixels[0] = 250;
    expect(childFirst.pixels[0]).toBe(10);
    expect(nestedFirst.pixels[0]).toBe(10);
  });

  it("moves layers up toward the top and down toward the bottom", () => {
    const document = createDocument({width: 1, height: 1});
    const bottom = document.layers[0];
    const middle = addLayer(document, "Middle");
    const top = addLayer(document, "Top");

    expect(document.layers.map((layer) => layer.id)).toEqual([bottom.id, middle.id, top.id]);
    expect(moveLayer(document, middle.id, "up")).toBe(true);
    expect(document.layers.map((layer) => layer.id)).toEqual([bottom.id, top.id, middle.id]);
    expect(moveLayer(document, middle.id, "up")).toBe(false);
    expect(moveLayer(document, middle.id, "down")).toBe(true);
    expect(document.layers.map((layer) => layer.id)).toEqual([bottom.id, middle.id, top.id]);
    expect(moveLayer(document, bottom.id, "down")).toBe(false);
  });

  it("does not delete the final remaining layer", () => {
    const document = createDocument({width: 2, height: 2});
    const layerId = document.layers[0].id;
    const cel = getCel(document, layerId, document.activeFrameId);

    expect(deleteLayer(document, layerId)).toBe(false);
    expect(document.layers).toHaveLength(1);
    expect(document.layers[0].id).toBe(layerId);
    expect(getCel(document, layerId, document.activeFrameId)).toBe(cel);
  });

  it("updates layer locking, visibility, and opacity state", () => {
    const document = createDocument({width: 1, height: 1});
    const layerId = document.layers[0].id;

    expect(setLayerLocked(document, layerId, true)).toBe(true);
    expect(getLayerByID(document, layerId)?.locked).toBe(true);
    expect(setLayerLocked(document, layerId, true)).toBe(false);
    expect(setLayerVisibility(document, layerId, false)).toBe(true);
    expect(getLayerByID(document, layerId)?.visible).toBe(false);
    expect(setLayerVisibility(document, layerId, false)).toBe(false);
    expect(setLayerOpacity(document, layerId, 0.35)).toBe(true);
    expect(getLayerByID(document, layerId)?.opacity).toBe(0.35);
    expect(setLayerOpacity(document, layerId, 4)).toBe(true);
    expect(getLayerByID(document, layerId)?.opacity).toBe(1);
    expect(setLayerOpacity(document, layerId, -2)).toBe(true);
    expect(getLayerByID(document, layerId)?.opacity).toBe(0);
  });

  it("composes nested layer groups and removes a group subtree as one unit", () => {
    const document = createDocument({width: 1, height: 1});
    const base = document.layers[0];
    const outside = addLayer(document, "Outside");
    const group = addLayerGroup(document, "Characters");
    const child = addLayer(document, "Body");
    const nestedGroup = addLayerGroup(document, "Details");
    const nestedChild = addLayer(document, "Highlights");

    expect(outside.parentId).toBe(group.id);
    expect(nestedGroup.parentId).toBe(group.id);
    expect(child.parentId).toBe(nestedGroup.id);
    expect(nestedChild.parentId).toBe(nestedGroup.id);
    setPixel(getCel(document, base.id, document.activeFrameId)!.pixels, 1, 1, 0, 0, [10, 20, 30, 255]);
    setPixel(getCel(document, child.id, document.activeFrameId)!.pixels, 1, 1, 0, 0, [40, 50, 60, 255]);
    setPixel(getCel(document, nestedChild.id, document.activeFrameId)!.pixels, 1, 1, 0, 0, [70, 80, 90, 255]);

    expect(Array.from(compositeFrame(document))).toEqual([70, 80, 90, 255]);
    expect(deleteLayer(document, group.id)).toBe(true);
    expect(document.layers.map((layer) => layer.id)).toEqual([base.id]);
    expect(Object.values(document.cels)).toHaveLength(document.frames.length);
    expect(document.activeLayerId).toBe(base.id);
  });

  it("links cels, unlinks a target into an independent buffer, and preserves links in clones", () => {
    const document = createDocument({width: 1, height: 1});
    const firstFrame = document.frames[0];
    const layer = document.layers[0];
    const secondFrame = addFrame(document);
    ensureCel(document, layer.id, secondFrame.id);
    const first = getCel(document, layer.id, firstFrame.id)!;
    const second = getCel(document, layer.id, secondFrame.id)!;
    first.pixels.set([12, 34, 56, 255]);

    expect(linkCels(document, layer.id, [firstFrame.id, secondFrame.id], firstFrame.id)).toBe(true);
    expect(second.pixels).toBe(first.pixels);
    expect(second.linkId).toBe(first.linkId);
    expect(isCelLinked(document, first)).toBe(true);
    second.pixels[0] = 99;
    expect(first.pixels[0]).toBe(99);

    expect(unlinkCels(document, layer.id, [secondFrame.id])).toBe(true);
    expect(second.pixels).not.toBe(first.pixels);
    expect(second.linkId).not.toBe(first.linkId);
    second.pixels[0] = 7;
    expect(first.pixels[0]).toBe(99);
    expect(isCelLinked(document, second)).toBe(false);

    linkCels(document, layer.id, [firstFrame.id, secondFrame.id], firstFrame.id);
    const clone = cloneDocument(document);
    const clonedFirst = getCel(clone, layer.id, firstFrame.id)!;
    const clonedSecond = getCel(clone, layer.id, secondFrame.id)!;
    expect(clonedSecond.pixels).toBe(clonedFirst.pixels);
    expect(clonedSecond.pixels).not.toBe(second.pixels);
    clonedFirst.pixels[0] = 201;
    expect(clonedSecond.pixels[0]).toBe(201);
    expect(first.pixels[0]).toBe(99);
  });

  it("refuses to link or unlink cels through a locked layer hierarchy", () => {
    const document = createDocument({width: 1, height: 1});
    const group = addLayerGroup(document, "Locked Group");
    const layer = addLayer(document, "Child");
    const first = document.frames[0];
    const second = addFrame(document);
    ensureCel(document, layer.id, second.id);
    const firstCel = getCel(document, layer.id, first.id)!;
    const secondCel = getCel(document, layer.id, second.id)!;
    group.locked = true;

    expect(linkCels(document, layer.id, [first.id, second.id], first.id)).toBe(false);
    expect(secondCel.pixels).not.toBe(firstCel.pixels);

    group.locked = false;
    expect(linkCels(document, layer.id, [first.id, second.id], first.id)).toBe(true);
    group.locked = true;
    expect(unlinkCels(document, layer.id, [second.id])).toBe(false);
    expect(secondCel.pixels).toBe(firstCel.pixels);
  });
});

describe("background layers", () => {
  it("enforces opaque background invariants and fills newly ensured cels", () => {
    const document = createDocument({
      width: 2,
      height: 1,
      palette: ["#00000000", "#ff0000ff"],
    });
    const background = addLayer(document, "Background");
    const firstCel = getCel(document, background.id, document.activeFrameId)!;
    firstCel.pixels.set([0, 0, 255, 128, 10, 20, 30, 0]);

    expect(setLayerRole(document, background.id, "background")).toBe(true);
    expect(background.role).toBe("background");
    expect(background.alphaLock).toBe(true);
    expect(background.opacity).toBe(1);
    expect(background.blendMode).toBe("normal");
    expect(Array.from(firstCel.pixels)).toEqual([127, 0, 128, 255, 255, 0, 0, 255]);

    expect(setLayerAlphaLock(document, background.id, false)).toBe(false);
    expect(setLayerOpacity(document, background.id, 0.5)).toBe(false);
    expect(setLayerBlendMode(document, background.id, "multiply")).toBe(false);
    expect(background.alphaLock).toBe(true);
    expect(background.opacity).toBe(1);
    expect(background.blendMode).toBe("normal");

    const secondFrame = addEmptyFrame(document);
    const ensured = getCel(document, background.id, secondFrame.id);
    expect(ensured).not.toBeNull();
    expect(Array.from(ensured!.pixels)).toEqual([255, 0, 0, 255, 255, 0, 0, 255]);
  });

  it("keeps the background unique, root-level, and at the bottom", () => {
    const document = createDocument({width: 1, height: 1});
    const background = addLayer(document, "Background");
    expect(setLayerRole(document, background.id, "background")).toBe(true);
    expect(document.layers[0].id).toBe(background.id);
    expect(background.parentId).toBeUndefined();

    // Group creation while the background is active must leave it at the
    // document root instead of reparenting it.
    const group = addLayerGroup(document, "Group");
    expect(group.parentId).toBeUndefined();
    expect(background.parentId).toBeUndefined();
    expect(document.layers[0].id).toBe(background.id);

    const ordinary = addLayer(document, "Ordinary");
    expect(setLayerRole(document, ordinary.id, "background")).toBe(false);
    expect(document.layers.filter((layer) => layer.role === "background")).toHaveLength(1);

    const duplicate = duplicateLayer(document, background.id);
    expect(duplicate?.role).toBe("standard");
    expect(document.layers.filter((layer) => layer.role === "background")).toHaveLength(1);
    expect(moveLayer(document, background.id, "up")).toBe(false);
    expect(moveLayer(document, background.id, "down")).toBe(false);
    expect(mergeLayerDown(document, background.id)).toBe(false);
  });

  it("repairs background constraints when a setter receives an existing background", () => {
    const document = createDocument({width: 1, height: 1});
    const background = addLayer(document, "Background");
    expect(setLayerRole(document, background.id, "background")).toBe(true);
    const group = addLayerGroup(document, "Group");
    background.parentId = group.id;
    background.opacity = 0.25;
    background.blendMode = "multiply";
    background.alphaLock = false;
    document.layers.splice(document.layers.indexOf(background), 1);
    document.layers.push(background);

    expect(setLayerOpacity(document, background.id, 1)).toBe(false);
    expect(background.parentId).toBeUndefined();
    expect(background.opacity).toBe(1);
    expect(background.blendMode).toBe("normal");
    expect(background.alphaLock).toBe(true);
    expect(document.layers[0].id).toBe(background.id);
  });
});

describe("frame operations", () => {
  it("inserts a truly empty frame without inheriting a continuous Cel", () => {
    const document = createDocument({width: 2, height: 1});
    const layer = document.layers[0];
    layer.continuous = true;
    const sourceFrameId = document.activeFrameId;
    const sourceCel = getCel(document, layer.id, sourceFrameId)!;
    sourceCel.pixels.set([9, 8, 7, 255, 0, 0, 0, 0]);

    const empty = addEmptyFrame(document, 240);

    expect(document.frames.map((frame) => frame.id)).toEqual([sourceFrameId, empty.id]);
    expect(empty.durationMs).toBe(240);
    expect(document.activeFrameId).toBe(empty.id);
    expect(getCel(document, layer.id, empty.id)).toBeNull();
    expect(adjacentFrameID(document, empty.id, -1)).toBe(sourceFrameId);
    expect(adjacentFrameID(document, sourceFrameId, -1)).toBeNull();
    expect(adjacentFrameID(document, empty.id, 1)).toBeNull();
  });

  it("restores an empty-frame insertion through document history", () => {
    const document = createDocument({width: 1, height: 1});
    const before = cloneDocument(document);
    const history = new CommandHistory<PixelDocument>();
    addEmptyFrame(document);
    history.commit(new DocumentStateCommand(before, document, "New Empty Frame"));

    expect(history.undo(document)?.label).toBe("New Empty Frame");
    expect(document.frames).toHaveLength(1);
    expect(document.activeFrameId).toBe(before.activeFrameId);
    history.redo(document);
    expect(document.frames).toHaveLength(2);
    expect(getCel(document, document.activeLayerId, document.activeFrameId)).toBeNull();
  });

  it("creates, duplicates, moves, and deletes complete per-layer cel sets", () => {
    const document = createDocument({width: 2, height: 1});
    const base = document.frames[0];
    const layer = document.layers[0];
    setPixel(getCel(document, layer.id, base.id)!.pixels, 2, 1, 0, 0, [1, 2, 3, 255]);
    const blank = addEmptyFrame(document, 80);
    ensureCel(document, layer.id, blank.id);
    expect(getCel(document, layer.id, blank.id)?.pixels).toEqual(new Uint8ClampedArray(8));
    const copy = duplicateFrame(document, base.id)!;
    expect(Array.from(getCel(document, layer.id, copy.id)!.pixels)).toEqual([1, 2, 3, 255, 0, 0, 0, 0]);
    expect(moveFrame(document, copy.id, "forward")).toBe(true);
    expect(setFrameDuration(document, copy.id, 0)).toBe(true);
    expect(copy.durationMs).toBe(1);
    expect(deleteFrame(document, blank.id)).toBe(true);
    expect(getCel(document, layer.id, blank.id)).toBeNull();
    expect(deleteFrame(document, base.id)).toBe(true);
    expect(deleteFrame(document, copy.id)).toBe(false);
  });

  it("keeps frame tags within the remaining frame range as frames are deleted", () => {
    const document = createDocument({width: 1, height: 1});
    const first = document.frames[0];
    const second = addFrame(document);
    const third = addFrame(document);
    const tag = addFrameTag(document, "Run", first.id, third.id, "pingpong", "#123456");

    expect(tag).not.toBeNull();
    expect(frameIDsInRange(document, third.id, first.id)).toEqual([first.id, second.id, third.id]);
    expect(deleteFrame(document, second.id)).toBe(true);
    expect(document.tags).toHaveLength(1);
    expect(document.tags[0]).toMatchObject({
      id: tag!.id,
      name: "Run",
      fromFrameId: first.id,
      toFrameId: third.id,
      direction: "pingpong",
      color: "#123456",
    });

    expect(deleteFrame(document, first.id)).toBe(true);
    expect(document.tags[0]).toMatchObject({fromFrameId: third.id, toFrameId: third.id});
    expect(deleteFrame(document, third.id)).toBe(false);
    expect(document.tags).toHaveLength(1);
  });

  it("duplicates an ordered frame selection as a linked, independent block", () => {
    const document = createDocument({width: 2, height: 1});
    const layer = document.layers[0];
    const first = document.frames[0];
    const second = addFrame(document, 180);
    const third = addFrame(document, 240);
    const fourth = addFrame(document, 300);
    ensureCel(document, layer.id, third.id);
    const firstCel = getCel(document, layer.id, first.id)!;
    const thirdCel = getCel(document, layer.id, third.id)!;
    firstCel.pixels.set([12, 34, 56, 255, 0, 0, 0, 0]);
    thirdCel.pixels.set([78, 90, 12, 255, 0, 0, 0, 0]);
    expect(linkCels(document, layer.id, [first.id, third.id], first.id)).toBe(true);

    const copies = duplicateFrames(document, [third.id, first.id, third.id, "missing-frame"]);

    expect(copies).toHaveLength(2);
    expect(document.frames.map((frame) => frame.id)).toEqual([
      first.id, second.id, third.id, copies[0].id, copies[1].id, fourth.id,
    ]);
    expect(copies.map((frame) => frame.durationMs)).toEqual([first.durationMs, third.durationMs]);
    expect(document.activeFrameId).toBe(copies[1].id);
    const copyFirst = getCel(document, layer.id, copies[0].id)!;
    const copyThird = getCel(document, layer.id, copies[1].id)!;
    expect(copyFirst.linkId).not.toBe(firstCel.linkId);
    expect(copyThird.linkId).toBe(copyFirst.linkId);
    expect(copyThird.pixels).toBe(copyFirst.pixels);
    expect(Array.from(copyFirst.pixels)).toEqual(Array.from(firstCel.pixels));
    copyFirst.pixels[0] = 201;
    expect(firstCel.pixels[0]).toBe(12);
    expect(thirdCel.pixels[0]).toBe(12);
  });

  it("deletes multiple frames, cels, tags, and the active frame consistently", () => {
    const document = createDocument({width: 1, height: 1});
    const first = document.frames[0];
    const second = addFrame(document);
    const third = addFrame(document);
    const fourth = addFrame(document);
    const layer = document.layers[0];
    const wholeTag = addFrameTag(document, "Whole", first.id, fourth.id);
    const deletedTag = addFrameTag(document, "Deleted", second.id, third.id);
    document.activeFrameId = third.id;

    expect(deleteFrames(document, [third.id, "missing-frame", second.id, second.id])).toBe(true);
    expect(document.frames.map((frame) => frame.id)).toEqual([first.id, fourth.id]);
    expect(getCel(document, layer.id, second.id)).toBeNull();
    expect(getCel(document, layer.id, third.id)).toBeNull();
    expect(document.activeFrameId).toBe(fourth.id);
    expect(document.tags).toHaveLength(1);
    expect(document.tags[0]).toMatchObject({
      id: wholeTag!.id,
      fromFrameId: first.id,
      toFrameId: fourth.id,
    });
    expect(document.tags.some((tag) => tag.id === deletedTag!.id)).toBe(false);

    const frameIDsBeforeRejectedDelete = document.frames.map((frame) => frame.id);
    expect(deleteFrames(document, [first.id, fourth.id, first.id])).toBe(false);
    expect(document.frames.map((frame) => frame.id)).toEqual(frameIDsBeforeRejectedDelete);
  });

  it("moves a selection one slot and updates all selected durations once", () => {
    const document = createDocument({width: 1, height: 1});
    const first = document.frames[0];
    const second = addFrame(document);
    const third = addFrame(document);
    const fourth = addFrame(document);

    expect(moveFrames(document, [third.id, first.id, third.id], "forward")).toBe(true);
    expect(document.frames.map((frame) => frame.id)).toEqual([second.id, first.id, fourth.id, third.id]);
    expect(moveFrames(document, [third.id, first.id], "backward")).toBe(true);
    expect(document.frames.map((frame) => frame.id)).toEqual([first.id, second.id, third.id, fourth.id]);
    expect(moveFrames(document, [first.id], "backward")).toBe(false);

    expect(setFramesDuration(document, [fourth.id, second.id, fourth.id, "missing-frame"], 233.6)).toBe(true);
    expect(document.frames.find((frame) => frame.id === second.id)?.durationMs).toBe(234);
    expect(document.frames.find((frame) => frame.id === fourth.id)?.durationMs).toBe(234);
    expect(setFramesDuration(document, [second.id, fourth.id], 234)).toBe(false);
  });
});

describe("mergeLayerDown", () => {
  it.each([
    {name: "both visible", bottomVisible: true, topVisible: true, bottomOpacity: 0.45, topOpacity: 0.7},
    {name: "top hidden", bottomVisible: true, topVisible: false, bottomOpacity: 0.45, topOpacity: 0.7},
    {name: "bottom hidden", bottomVisible: false, topVisible: true, bottomOpacity: 0.45, topOpacity: 0.7},
    {name: "both hidden", bottomVisible: false, topVisible: false, bottomOpacity: 0.45, topOpacity: 0.7},
  ])("keeps the composited appearance when $name", ({
    bottomVisible,
    topVisible,
    bottomOpacity,
    topOpacity,
  }) => {
    const document = createTwoLayerDocument();
    const bottom = document.layers[0];
    const top = document.layers[1];
    bottom.visible = bottomVisible;
    bottom.opacity = bottomOpacity;
    top.visible = topVisible;
    top.opacity = topOpacity;
    setPixel(getCel(document, bottom.id, document.activeFrameId)!.pixels, 2, 1, 0, 0, [220, 30, 40, 180]);
    setPixel(getCel(document, top.id, document.activeFrameId)!.pixels, 2, 1, 1, 0, [30, 80, 220, 160]);
    const before = compositeFrame(document);

    expect(mergeLayerDown(document, top.id)).toBe(true);

    expect(Array.from(compositeFrame(document))).toEqual(Array.from(before));
    expect(document.layers).toHaveLength(1);
    expect(document.layers[0].id).toBe(bottom.id);
    expect(getCel(document, top.id, document.activeFrameId)).toBeNull();
    expect(document.activeLayerId).toBe(bottom.id);
  });

  it("rejects merging the bottom layer or locked neighbors", () => {
    const document = createTwoLayerDocument();
    const bottom = document.layers[0];
    const top = document.layers[1];

    expect(mergeLayerDown(document, bottom.id)).toBe(false);
    expect(document.layers).toHaveLength(2);
    bottom.locked = true;
    expect(mergeLayerDown(document, top.id)).toBe(false);
    bottom.locked = false;
    top.locked = true;
    expect(mergeLayerDown(document, top.id)).toBe(false);
  });

  it("merges non-normal layers and does not skip over an adjacent group", () => {
    const document = createTwoLayerDocument();
    const bottom = document.layers[0];
    const top = document.layers[1];

    bottom.blendMode = "multiply";
    expect(mergeLayerDown(document, top.id)).toBe(true);
    expect(document.layers).toHaveLength(1);

    const groupedDocument = createTwoLayerDocument();
    const groupedTop = groupedDocument.layers[1];
    const group: Layer = {
      id: "between-group",
      name: "Between",
      visible: true,
      locked: false,
      opacity: 1,
      kind: "group",
      blendMode: "normal",
      role: "standard",
      continuous: false,
      alphaLock: false,
    };
    groupedDocument.layers.splice(1, 0, group);
    expect(mergeLayerDown(groupedDocument, groupedTop.id)).toBe(false);
    expect(groupedDocument.layers).toHaveLength(3);
  });

  it("merges mixed blend modes across every frame", () => {
    const document = createTwoLayerDocument();
    const bottom = document.layers[0];
    const top = document.layers[1];
    const secondFrame = addFrame(document, 240);
    ensureCel(document, bottom.id, secondFrame.id);
    ensureCel(document, top.id, secondFrame.id);
    bottom.opacity = 0.65;
    bottom.blendMode = "multiply";
    top.opacity = 0.75;
    top.blendMode = "screen";

    setPixel(getCel(document, bottom.id, document.frames[0].id)!.pixels, 2, 1, 0, 0, [220, 30, 40, 200]);
    setPixel(getCel(document, top.id, document.frames[0].id)!.pixels, 2, 1, 1, 0, [30, 80, 220, 160]);
    setPixel(getCel(document, bottom.id, secondFrame.id)!.pixels, 2, 1, 1, 0, [40, 180, 80, 220]);
    setPixel(getCel(document, top.id, secondFrame.id)!.pixels, 2, 1, 0, 0, [230, 120, 30, 140]);
    const before = new Map(document.frames.map((frame) => [frame.id, Array.from(compositeFrame(document, frame.id))]));

    expect(mergeLayerDown(document, top.id)).toBe(true);
    expect(document.layers).toHaveLength(1);
    expect(document.activeLayerId).toBe(bottom.id);
    expect(bottom.opacity).toBe(1);
    expect(bottom.blendMode).toBe("normal");
    for (const frame of document.frames) {
      expect(Array.from(compositeFrame(document, frame.id))).toEqual(before.get(frame.id));
      expect(getCel(document, top.id, frame.id)).toBeNull();
      expect(getCel(document, bottom.id, frame.id)).not.toBeNull();
    }
  });
});

describe("reference and flattened layers", () => {
  it("shows reference layers in the editor but excludes them from exports", () => {
    const document = createTwoLayerDocument();
    const reference = document.layers[1];
    reference.role = "reference";
    setPixel(getCel(document, reference.id, document.activeFrameId)!.pixels, 2, 1, 0, 0, [250, 10, 20, 255]);
    expect(Array.from(compositeFrame(document).slice(0, 4))).toEqual([250, 10, 20, 255]);
    expect(Array.from(compositeFrameForExport(document).slice(0, 4))).toEqual([0, 0, 0, 0]);
  });

  it("bakes all visible blend modes while retaining reference layers separately", () => {
    const document = createTwoLayerDocument();
    const top = document.layers[1];
    const reference = addLayer(document, "Reference");
    reference.role = "reference";
    top.blendMode = "multiply";
    setPixel(getCel(document, document.layers[0].id, document.activeFrameId)!.pixels, 2, 1, 0, 0, [200, 180, 160, 255]);
    setPixel(getCel(document, top.id, document.activeFrameId)!.pixels, 2, 1, 0, 0, [128, 64, 255, 180]);
    const expected = compositeFrameForExport(document);
    const flattened = flattenVisibleLayers(document);
    expect(Array.from(compositeFrameForExport(document))).toEqual(Array.from(expected));
    expect(document.layers.map((layer) => layer.id)).toEqual([flattened.id, reference.id]);
  });

  it("flattens every frame while preserving reference cels", () => {
    const document = createTwoLayerDocument();
    const base = document.layers[0];
    const top = document.layers[1];
    const reference = addLayer(document, "Reference");
    reference.role = "reference";
    const secondFrame = addFrame(document, 200);
    ensureCel(document, base.id, secondFrame.id);
    ensureCel(document, top.id, secondFrame.id);
    ensureCel(document, reference.id, secondFrame.id);
    top.blendMode = "addition";
    top.opacity = 0.6;

    setPixel(getCel(document, base.id, document.frames[0].id)!.pixels, 2, 1, 0, 0, [40, 50, 60, 255]);
    setPixel(getCel(document, top.id, document.frames[0].id)!.pixels, 2, 1, 1, 0, [30, 40, 50, 180]);
    setPixel(getCel(document, base.id, secondFrame.id)!.pixels, 2, 1, 1, 0, [70, 80, 90, 255]);
    setPixel(getCel(document, top.id, secondFrame.id)!.pixels, 2, 1, 0, 0, [100, 110, 120, 200]);
    setPixel(getCel(document, reference.id, document.frames[0].id)!.pixels, 2, 1, 0, 0, [250, 10, 20, 255]);
    setPixel(getCel(document, reference.id, secondFrame.id)!.pixels, 2, 1, 1, 0, [20, 250, 30, 255]);
    const expected = new Map(document.frames.map((frame) => [frame.id, Array.from(compositeFrameForExport(document, frame.id))]));

    const flattened = flattenVisibleLayers(document, "All Frames");

    expect(document.layers.map((layer) => layer.id)).toEqual([flattened.id, reference.id]);
    expect(document.frames).toHaveLength(2);
    expect(getCel(document, reference.id, document.frames[0].id)).not.toBeNull();
    expect(getCel(document, reference.id, secondFrame.id)).not.toBeNull();
    for (const frame of document.frames) {
      expect(Array.from(compositeFrameForExport(document, frame.id))).toEqual(expected.get(frame.id));
      expect(getCel(document, flattened.id, frame.id)).not.toBeNull();
    }
  });
});

describe("document cloning", () => {
  it("deep-copies metadata and all cel pixel buffers", () => {
    const document = createTwoLayerDocument();
    const clone = cloneDocument(document);

    expect(clone).toEqual(document);
    expect(clone).not.toBe(document);
    expect(clone.palette).not.toBe(document.palette);
    expect(clone.palette.colors).not.toBe(document.palette.colors);
    expect(clone.layers[0]).not.toBe(document.layers[0]);
    expect(clone.frames[0]).not.toBe(document.frames[0]);
    expect(clone.cels[celKey(document.layers[0].id, document.activeFrameId)]).not.toBe(
      document.cels[celKey(document.layers[0].id, document.activeFrameId)],
    );

    clone.palette.colors[0] = "#abcdef";
    clone.layers[0].name = "Changed";
    clone.frames[0].durationMs = 900;
    clone.cels[celKey(clone.layers[0].id, clone.activeFrameId)].pixels[0] = 255;
    expect(document.palette.colors[0]).not.toBe("#abcdef");
    expect(document.layers[0].name).toBe("Layer 1");
    expect(document.frames[0].durationMs).toBe(100);
    expect(document.cels[celKey(document.layers[0].id, document.activeFrameId)].pixels[0]).toBe(0);
  });

  it("replaces a document with an independent deep copy", () => {
    const target = createDocument({name: "target.pixio", width: 1, height: 1});
    const source = createTwoLayerDocument();

    replaceDocument(target, source);

    expect(target).toEqual(source);
    expect(target).not.toBe(source);
    expect(target.layers).not.toBe(source.layers);
    expect(target.cels[celKey(source.layers[0].id, source.activeFrameId)]).not.toBe(
      source.cels[celKey(source.layers[0].id, source.activeFrameId)],
    );
    target.layers[0].visible = false;
    target.cels[celKey(target.layers[0].id, target.activeFrameId)].pixels[0] = 77;
    expect(source.layers[0].visible).toBe(true);
    expect(source.cels[celKey(source.layers[0].id, source.activeFrameId)].pixels[0]).toBe(0);
  });

  it("duplicates a sprite with fresh IDs while preserving sparse, linked, indexed, and tilemap data", () => {
    const document = createDocument({
      name: "source.pixio",
      width: 2,
      height: 1,
      colorMode: "indexed",
      palette: ["#00000000", "#ff0000ff"],
    });
    const firstFrame = document.frames[0];
    const sourceCel = getActiveCel(document);
    sourceCel.indexes!.set([1, 0]);
    sourceCel.pixels.set([255, 0, 0, 255, 0, 0, 0, 0]);
    const secondFrame = addFrame(document, 240);
    const linkedCel = ensureCel(document, document.activeLayerId, secondFrame.id)!;
    linkCels(document, document.activeLayerId, [firstFrame.id, secondFrame.id], firstFrame.id);
    expect(linkedCel.pixels).toBe(sourceCel.pixels);
    expect(linkedCel.indexes).toBe(sourceCel.indexes);
    const tag = addFrameTag(document, "Walk", firstFrame.id, secondFrame.id)!;
    const slice = addSlice(document, "Body", {x: 0, y: 0, width: 2, height: 1, frameId: firstFrame.id})!;
    const thirdFrame = addEmptyFrame(document, 300);
    document.activeFrameId = thirdFrame.id;
    const duplicate = duplicateDocument(document, "source copy.pixio");

    expect(duplicate.name).toBe("source copy.pixio");
    expect(duplicate).not.toBe(document);
    expect(duplicate.palette.id).not.toBe(document.palette.id);
    expect(duplicate.activeLayerId).not.toBe(document.activeLayerId);
    expect(duplicate.activeFrameId).not.toBe(document.activeFrameId);
    expect(duplicate.layers.map((layer) => layer.id)).not.toEqual(document.layers.map((layer) => layer.id));
    expect(duplicate.frames.map((frame) => frame.id)).not.toEqual(document.frames.map((frame) => frame.id));
    expect(Object.values(duplicate.cels)).toHaveLength(Object.values(document.cels).length);
    const duplicateFirstCel = getCel(duplicate, duplicate.activeLayerId, duplicate.frames[0].id)!;
    const duplicateSecondCel = getCel(duplicate, duplicate.activeLayerId, duplicate.frames[1].id)!;
    expect(duplicateFirstCel.indexes).toEqual(sourceCel.indexes);
    expect(duplicateFirstCel.pixels).not.toBe(sourceCel.pixels);
    expect(duplicateFirstCel.linkId).not.toBe(sourceCel.linkId);
    expect(duplicateSecondCel.pixels).toBe(duplicateFirstCel.pixels);
    expect(duplicateSecondCel.indexes).toBe(duplicateFirstCel.indexes);
    expect(getCel(duplicate, duplicate.activeLayerId, duplicate.frames[2].id)).toBeNull();
    expect(duplicate.activeFrameId).toBe(duplicate.frames[2].id);
    expect(duplicate.tags[0].id).not.toBe(tag.id);
    expect(duplicate.tags[0].fromFrameId).toBe(duplicate.frames[0].id);
    expect(duplicate.tags[0].toFrameId).toBe(duplicate.frames[1].id);
    expect(duplicate.slices[0].id).not.toBe(slice.id);
    expect(duplicate.slices[0].keys[0].frameId).toBe(duplicate.frames[0].id);

    const duplicateCel = duplicateFirstCel;
    duplicateCel.pixels[0] = 0;
    expect(sourceCel.pixels[0]).toBe(255);

    const tilemapSource = createDocument({name: "tiles.pixio", width: 2, height: 1});
    getActiveCel(tilemapSource).pixels.set([255, 0, 0, 255, 0, 255, 0, 255]);
    const converted = convertImageLayerToTilemap(tilemapSource, tilemapSource.activeLayerId, {tileWidth: 1, tileHeight: 1});
    tilemapSource.layers[0] = converted.layer;
    tilemapSource.tilesets = [converted.tileset];
    tilemapSource.cels = {[celKey(converted.layer.id, tilemapSource.activeFrameId)]: converted.cels[0]};
    tilemapSource.activeLayerId = converted.layer.id;
    const tilemapDuplicate = duplicateDocument(tilemapSource, "tiles copy.pixio");
    const duplicateTilemapLayer = tilemapDuplicate.layers[0];
    const duplicateTilemapCel = getCel(tilemapDuplicate, duplicateTilemapLayer.id, tilemapDuplicate.activeFrameId)!;
    expect(duplicateTilemapLayer.tilesetId).not.toBe(converted.layer.tilesetId);
    expect(duplicateTilemapCel.tilemap?.tiles).toEqual(converted.cels[0].tilemap?.tiles);
    expect(duplicateTilemapCel.tilemap?.tiles).not.toBe(converted.cels[0].tilemap?.tiles);
  });
});

describe("cropDocument", () => {
  it("preserves authoritative tile and Terrain cells while translating a partial tilemap Cel", () => {
    const document = createDocument({width: 4, height: 4});
    const converted = convertImageLayerToTilemap(document, document.activeLayerId, {tileWidth: 2, tileHeight: 2});
    document.layers[0] = converted.layer;
    document.tilesets = [converted.tileset];
    document.cels = {[celKey(converted.layer.id, document.activeFrameId)]: converted.cels[0]};
    const cel = getActiveCel(document);
    cel.terrainmap = createTerrainMapData(cel.tilemap!.columns, cel.tilemap!.rows, 23);
    cel.terrainmap.terrains.set([1, 0, 0, 1]);
    cel.x = 1;
    cel.y = 1;
    const tilemap = cel.tilemap;
    const terrainmap = cel.terrainmap;
    const pixels = cel.pixels;

    expect(cropDocument(document, 1, 1, 2, 2)).toBe(true);
    expect(cel.x).toBe(0);
    expect(cel.y).toBe(0);
    expect(cel.width).toBe(4);
    expect(cel.height).toBe(4);
    expect(cel.tilemap).toBe(tilemap);
    expect(cel.terrainmap).toBe(terrainmap);
    expect(cel.pixels).toBe(pixels);
    expect([...cel.terrainmap!.terrains]).toEqual([1, 0, 0, 1]);
  });

  it("crops every cel consistently and rejects invalid crop boundaries", () => {
    const document = createTwoLayerDocument();
    const first = getCel(document, document.layers[0].id, document.activeFrameId)!;
    const second = getCel(document, document.layers[1].id, document.activeFrameId)!;
    setPixel(first.pixels, 2, 1, 1, 0, [10, 20, 30, 255]);
    setPixel(second.pixels, 2, 1, 0, 0, [40, 50, 60, 255]);

    expect(cropDocument(document, 1, 0, 1, 1)).toBe(true);
    expect(document.width).toBe(1);
    expect(document.height).toBe(1);
    for (const cel of Object.values(document.cels)) {
      expect(cel.width).toBe(1);
      expect(cel.height).toBe(1);
      expect(cel.pixels).toHaveLength(4);
    }
    expect(Array.from(first.pixels)).toEqual([10, 20, 30, 255]);
    expect(Array.from(second.pixels)).toEqual([0, 0, 0, 0]);
    expect(cropDocument(document, 0, 0, 1, 1)).toBe(false);
    expect(cropDocument(document, -1, 0, 1, 1)).toBe(false);
    expect(cropDocument(document, 0, 0, 2, 1)).toBe(false);
  });

  it("maps pixels from an offset cel into the cropped canvas", () => {
    const document = createDocument({width: 5, height: 4});
    const cel = getActiveCel(document);
    cel.x = 1;
    cel.y = 1;
    cel.width = 3;
    cel.height = 2;
    cel.pixels = new Uint8ClampedArray(cel.width * cel.height * 4);
    setPixel(cel.pixels, cel.width, cel.height, 0, 0, [10, 20, 30, 255]);
    setPixel(cel.pixels, cel.width, cel.height, 2, 1, [40, 50, 60, 255]);

    expect(cropDocument(document, 1, 1, 3, 2)).toBe(true);

    expect(cel.x).toBe(0);
    expect(cel.y).toBe(0);
    expect(cel.width).toBe(3);
    expect(cel.height).toBe(2);
    expect(Array.from(cel.pixels)).toEqual([
      10, 20, 30, 255, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 40, 50, 60, 255,
    ]);
  });

  it("keeps stable authoritative tile IDs and clips the translated cache at composition time", () => {
    const document = createDocument({width: 4, height: 2});
    const source = getActiveCel(document);
    setPixel(source.pixels, 4, 2, 2, 0, [255, 0, 0, 255]);
    const converted = convertImageLayerToTilemap(document, document.activeLayerId, {tileWidth: 2, tileHeight: 2});
    document.layers[0] = converted.layer;
    document.tilesets = [converted.tileset];
    document.cels[celKey(converted.layer.id, document.activeFrameId)] = converted.cels[0];

    expect(cropDocument(document, 2, 0, 2, 2)).toBe(true);
    const cel = getActiveCel(document);
    expect(cel.x).toBe(-2);
    expect(cel.tilemap?.columns).toBe(2);
    expect(cel.tilemap?.rows).toBe(1);
    expect([...cel.tilemap!.tiles]).toEqual([1, 2]);
    expect(document.tilesets[0].tiles).toHaveLength(2);
    expect([...compositeFrame(document).subarray(0, 4)]).toEqual([255, 0, 0, 255]);
  });
});

describe("resizeDocument", () => {
  it("preserves tilemap and Terrain authority while moving the Cel with the canvas anchor", () => {
    const document = createDocument({width: 4, height: 4});
    const converted = convertImageLayerToTilemap(document, document.activeLayerId, {tileWidth: 2, tileHeight: 2});
    document.layers[0] = converted.layer;
    document.tilesets = [converted.tileset];
    document.cels = {[celKey(converted.layer.id, document.activeFrameId)]: converted.cels[0]};
    const cel = getActiveCel(document);
    cel.terrainmap = createTerrainMapData(cel.tilemap!.columns, cel.tilemap!.rows, 29);
    cel.terrainmap.terrains.set([1, 0, 0, 1]);
    const tilemap = cel.tilemap;
    const terrainmap = cel.terrainmap;
    const pixels = cel.pixels;

    expect(resizeDocument(document, 6, 6, "right", "bottom")).toBe(true);
    expect(cel.x).toBe(2);
    expect(cel.y).toBe(2);
    expect(cel.width).toBe(4);
    expect(cel.height).toBe(4);
    expect(cel.tilemap).toBe(tilemap);
    expect(cel.terrainmap).toBe(terrainmap);
    expect(cel.pixels).toBe(pixels);
    expect([...cel.terrainmap!.terrains]).toEqual([1, 0, 0, 1]);
  });

  it("expands with the requested anchor while preserving cel pixels", () => {
    const document = createDocument({width: 2, height: 2});
    const cel = getActiveCel(document);
    cel.pixels.set([255, 0, 0, 255], 0);

    expect(resizeDocument(document, 4, 3, "right", "bottom")).toBe(true);
    expect(document.width).toBe(4);
    expect(document.height).toBe(3);
    expect(Array.from(getActiveCel(document).pixels.subarray((1 * 4 + 2) * 4, (1 * 4 + 2) * 4 + 4))).toEqual([255, 0, 0, 255]);
  });

  it("crops from the requested edge and rejects dimensions above the UI limit", () => {
    const document = createDocument({width: 3, height: 1});
    const cel = getActiveCel(document);
    cel.pixels.set([255, 0, 0, 255], 4);

    expect(resizeDocument(document, 2, 1, "right", "top")).toBe(true);
    expect(Array.from(getActiveCel(document).pixels.subarray(0, 4))).toEqual([255, 0, 0, 255]);
    expect(resizeDocument(document, 2049, 1)).toBe(false);
  });

  it("translates pixels from an offset cel when expanding the canvas", () => {
    const document = createDocument({width: 4, height: 3});
    const cel = getActiveCel(document);
    cel.x = 1;
    cel.y = 1;
    cel.width = 2;
    cel.height = 2;
    cel.pixels = new Uint8ClampedArray(cel.width * cel.height * 4);
    setPixel(cel.pixels, cel.width, cel.height, 1, 1, [80, 90, 100, 255]);

    expect(resizeDocument(document, 6, 5, "right", "bottom")).toBe(true);

    expect(cel.x).toBe(0);
    expect(cel.y).toBe(0);
    expect(cel.width).toBe(6);
    expect(cel.height).toBe(5);
    const pixelIndex = (4 * document.width + 4) * 4;
    expect(Array.from(cel.pixels.subarray(pixelIndex, pixelIndex + 4))).toEqual([80, 90, 100, 255]);
  });

  it("clips an offset cel against the new canvas when shrinking", () => {
    const document = createDocument({width: 4, height: 4});
    const cel = getActiveCel(document);
    cel.x = 1;
    cel.y = 1;
    cel.width = 3;
    cel.height = 3;
    cel.pixels = new Uint8ClampedArray(cel.width * cel.height * 4);
    setPixel(cel.pixels, cel.width, cel.height, 1, 1, [110, 120, 130, 255]);

    expect(resizeDocument(document, 2, 2, "right", "bottom")).toBe(true);

    expect(Array.from(cel.pixels.subarray(0, 4))).toEqual([110, 120, 130, 255]);
    expect(Array.from(cel.pixels.subarray(4))).toEqual(new Array(12).fill(0));
  });
});

describe("tilemap ownership", () => {
  it("removes a tileset after its last referencing layer is deleted", () => {
    const document = createDocument({width: 2, height: 2});
    const converted = convertImageLayerToTilemap(document, document.activeLayerId, {tileWidth: 1, tileHeight: 1});
    document.layers[0] = converted.layer;
    document.tilesets = [converted.tileset];
    document.cels[celKey(converted.layer.id, document.activeFrameId)] = converted.cels[0];
    const tilemapLayerID = converted.layer.id;
    addLayer(document, "Remaining");

    expect(deleteLayer(document, tilemapLayerID)).toBe(true);
    expect(document.tilesets).toEqual([]);
  });
});

function createTwoLayerDocument(): PixelDocument {
  const document = createDocument({width: 2, height: 1});
  addLayer(document, "Top");
  return document;
}

import {describe, expect, it} from "vitest";
import {addEmptyFrame, addLayer, addLayerGroup, cloneDocument, createDocument, ensureCel, getCel, getLayerByID, linkCels, type PixelDocument} from "./document";
import {DocumentStateCommand} from "./history";
import {applyLayerProperties, existingCelsForLayers, linkedCelsForSelection} from "./layerProperties";

function indexedDocument(): PixelDocument {
  return createDocument({width: 2, height: 1, colorMode: "indexed", palette: ["#00000000", "#ffffffff"]});
}

describe("layer properties and cel selection variants", () => {
  it("applies batch layer properties and keeps the operation reversible as a document state", () => {
    const document = indexedDocument();
    const layer = addLayer(document, "Ink");
    const group = addLayerGroup(document, "Characters");
    const child = addLayer(document, "Face");
    const before = cloneDocument(document);

    expect(applyLayerProperties(document, [layer.id, child.id], {
      name: "Edited",
      opacity: 0.5,
      blendMode: "multiply",
      visible: false,
      locked: true,
      alphaLock: true,
      continuous: true,
    })).toBe(true);
    expect(getLayerByID(document, layer.id)).toMatchObject({name: "Edited", opacity: 0.5, blendMode: "multiply", visible: false, locked: true, alphaLock: true, continuous: true});
    expect(getLayerByID(document, child.id)).toMatchObject({name: "Edited", opacity: 0.5, blendMode: "multiply", visible: false, locked: true, alphaLock: true, continuous: true});
    expect(group.kind).toBe("group");
    expect(getLayerByID(document, layer.id)?.kind).toBe("image");
    expect(getLayerByID(document, child.id)?.kind).toBe("image");
    const after = cloneDocument(document);
    const command = new DocumentStateCommand(before, after, "Layer Properties");
    command.undo(document);
    expect(getLayerByID(document, layer.id)).toMatchObject({name: "Ink", opacity: 1, blendMode: "normal", visible: true, locked: false, alphaLock: false, continuous: false});
    command.redo(document);
    expect(getLayerByID(document, layer.id)).toMatchObject({name: "Edited", opacity: 0.5, blendMode: "multiply", visible: false, locked: true, alphaLock: true, continuous: true});
  });

  it("honors background invariants when setting a role through the batch helper", () => {
    const document = indexedDocument();
    const layer = addLayer(document, "Background");
    const cel = getCel(document, layer.id, document.activeFrameId)!;
    cel.pixels.set([255, 0, 0, 128, 0, 0, 0, 0]);
    cel.indexes = new Uint8Array([1, 0]);

    expect(applyLayerProperties(document, [layer.id], {role: "background", opacity: 0.5, blendMode: "multiply", alphaLock: false})).toBe(true);
    expect(getLayerByID(document, layer.id)).toMatchObject({role: "background", opacity: 1, blendMode: "normal", alphaLock: true});
    expect(cel.opacity).toBe(1);
    expect(cel.pixels[3]).toBe(255);
    expect(cel.indexes).toHaveLength(2);
  });

  it("returns only existing sparse cels for a layer", () => {
    const document = createDocument({width: 2, height: 1});
    const layer = addLayer(document, "Animated");
    const second = addEmptyFrame(document);
    const third = addEmptyFrame(document);
    expect(ensureCel(document, layer.id, second.id)).not.toBeNull();
    expect(existingCelsForLayers(document, [layer.id])).toEqual([
      {layerId: layer.id, frameId: document.frames[0].id},
      {layerId: layer.id, frameId: second.id},
    ]);
    expect(getCel(document, layer.id, third.id)).toBeNull();
  });

  it("expands a linked selection without creating sparse cels or changing buffers", () => {
    const document = createDocument({width: 1, height: 1});
    const layer = document.layers[0];
    const second = addEmptyFrame(document);
    const third = addEmptyFrame(document);
    const firstCel = getCel(document, layer.id, document.frames[0].id)!;
    const secondCel = ensureCel(document, layer.id, second.id)!;
    firstCel.pixels[0] = 42;
    expect(linkCels(document, layer.id, [firstCel.frameId, second.id], firstCel.frameId)).toBe(true);
    const selected = linkedCelsForSelection(document, [{layerId: layer.id, frameId: second.id}]);
    expect(selected).toEqual([
      {layerId: layer.id, frameId: firstCel.frameId},
      {layerId: layer.id, frameId: second.id},
    ]);
    expect(getCel(document, layer.id, third.id)).toBeNull();
    expect(secondCel.pixels).toBe(firstCel.pixels);
  });
});

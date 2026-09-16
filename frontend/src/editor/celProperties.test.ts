import {describe, expect, it} from "vitest";
import {addLayer, addLayerGroup, celKey, cloneDocument, compositeFrame, compositeFrameForExport, compositeFrameRegion, createDocument, duplicateFrames, getActiveCel, getCel, mergeLayerDown, setCelProperties, setLayerRole, type BlendMode} from "./document";
import {decodeProject, encodeProject} from "./serialization";
import {DocumentStateCommand} from "./history";
import {copyCelSelection, pasteCelSelection} from "./celClipboard";
import {findTopmostMovableCelAt} from "./celTransform";

function twoLayers() {
  const document = createDocument({width: 1, height: 1});
  const bottom = getActiveCel(document);
  bottom.pixels.set([255, 0, 0, 255]);
  const layer = addLayer(document);
  const top = getCel(document, layer.id, document.activeFrameId)!;
  top.pixels.set([0, 0, 255, 255]);
  return {document, bottom, top, layer};
}

describe("Cel appearance properties", () => {
  it("multiplies layer and Cel opacity and excludes fully transparent cels from hit testing", () => {
    const {document, top, layer} = twoLayers();
    layer.opacity = 0.5;
    top.opacity = 0.5;
    expect([...compositeFrame(document)]).toEqual([191, 0, 64, 255]);
    top.opacity = 0;
    expect([...compositeFrameForExport(document)]).toEqual([255, 0, 0, 255]);
    expect(findTopmostMovableCelAt(document, top.frameId, 0, 0)?.layerId).not.toBe(top.layerId);
  });

  it("orders displaced cels including ties consistently for export, regions and hit testing", () => {
    const {document, bottom, top} = twoLayers();
    bottom.zIndex = 1;
    const expected = new Uint8ClampedArray([255, 0, 0, 255]);
    expect(compositeFrame(document)).toEqual(expected);
    expect(compositeFrameForExport(document)).toEqual(expected);
    expect(compositeFrameRegion(document, {x: 0, y: 0, width: 1, height: 1})).toEqual(expected);
    expect(findTopmostMovableCelAt(document, top.frameId, 0, 0)?.layerId).toBe(bottom.layerId);
    bottom.zIndex = 0;
    top.zIndex = -1;
    expect(compositeFrame(document)).toEqual(expected);
  });

  it("keeps group compositing boundaries and opacity", () => {
    const {document, bottom, top} = twoLayers();
    const group = addLayerGroup(document);
    document.layers = [document.layers[0], group, document.layers.find((layer) => layer.id === top.layerId)!];
    document.layers[2].parentId = group.id;
    group.opacity = 0.5;
    top.zIndex = -100;
    top.opacity = 0.5;
    expect([...compositeFrame(document)]).toEqual([191, 0, 64, 255]);
    bottom.zIndex = 0;
  });

  it("retains independent linked appearance through history, v4 and duplication", () => {
    const document = createDocument({width: 1, height: 1});
    const cel = getActiveCel(document);
    cel.pixels.set([255, 100, 20, 255]);
    document.frames.push({id: "alias-frame", durationMs: 100});
    const alias = {...cel, id: "alias", frameId: "alias-frame"};
    document.cels[celKey(alias.layerId, alias.frameId)] = alias;
    const before = cloneDocument(document);
    expect(setCelProperties(document, alias.layerId, alias.frameId, {opacity: 0.25, zIndex: -4})).toBe(true);
    expect(cel.opacity).toBe(1);
    expect(alias.pixels).toBe(cel.pixels);
    const after = cloneDocument(document);
    const loaded = decodeProject(encodeProject(document));
    const loadedAlias = getCel(loaded, alias.layerId, alias.frameId)!;
    expect(loadedAlias).toMatchObject({opacity: 0.25, zIndex: -4});
    expect(loadedAlias.pixels).toBe(getCel(loaded, cel.layerId, cel.frameId)!.pixels);
    const history = new DocumentStateCommand(before, after, "Change Cel Properties");
    history.undo(document);
    expect(getCel(document, alias.layerId, alias.frameId)!.opacity).toBe(1);
    history.redo(document);
    expect(getCel(document, alias.layerId, alias.frameId)!.opacity).toBe(0.25);
    const [copy] = duplicateFrames(document, [alias.frameId]);
    expect(getCel(document, alias.layerId, copy.id)).toMatchObject({opacity: 0.25, zIndex: -4});
  });

  it("copies appearance across documents without baking or changing source pixels", () => {
    const document = createDocument({width: 1, height: 1});
    const source = getActiveCel(document);
    source.opacity = 0.4; source.zIndex = 3;
    source.pixels.set([40, 80, 120, 255]);
    const address = {layerId: source.layerId, frameId: source.frameId};
    const clipboard = copyCelSelection(document, [address], address, [source.layerId])!;
    const destination = createDocument({width: 1, height: 1});
    const anchor = {layerId: destination.activeLayerId, frameId: destination.activeFrameId};
    expect(pasteCelSelection(destination, clipboard, anchor, [anchor.layerId])).not.toBeNull();
    expect(getActiveCel(destination)).toMatchObject({opacity: 0.4, zIndex: 3});
    expect(getActiveCel(destination).pixels).toEqual(source.pixels);
  });

  it("bakes appearance once when merging two cels", () => {
    const {document, bottom, top} = twoLayers();
    bottom.opacity = 0.5;
    bottom.zIndex = 1;
    top.opacity = 0.25;
    const before = compositeFrame(document);
    expect(mergeLayerDown(document, top.layerId)).toBe(true);
    expect(getCel(document, bottom.layerId, bottom.frameId)).toMatchObject({opacity: 1, zIndex: 0});
    expect(compositeFrame(document)).toEqual(before);
  });

  it("bakes independently linked opacity when converting to a background layer", () => {
    const document = createDocument({width: 1, height: 1, palette: ["#00000000", "#ffffffff"]});
    const first = getActiveCel(document);
    first.pixels.set([255, 0, 0, 255]);
    first.opacity = 0.5;
    document.frames.push({id: "alias-frame", durationMs: 100});
    const alias = {...first, id: "alias", frameId: "alias-frame", opacity: 1};
    document.cels[celKey(alias.layerId, alias.frameId)] = alias;
    expect(setLayerRole(document, first.layerId, "background")).toBe(true);
    expect([...first.pixels]).toEqual([255, 128, 128, 255]);
    expect([...alias.pixels]).toEqual([255, 0, 0, 255]);
    expect(first).toMatchObject({opacity: 1, zIndex: 0});
    expect(alias).toMatchObject({opacity: 1, zIndex: 0});
    expect(first.linkId).not.toBe(alias.linkId);
    expect(setCelProperties(document, first.layerId, first.frameId, {opacity: 0})).toBe(false);
    expect(() => decodeProject(encodeProject(document))).not.toThrow();
  });

  it.each(["multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity", "addition", "subtract", "divide", "normal"] as BlendMode[])("uses Cel opacity in %s compositing", (blendMode) => {
    const {document, top, layer} = twoLayers();
    layer.blendMode = blendMode;
    top.opacity = 0.4;
    const celOpacity = compositeFrame(document);
    top.opacity = 1; layer.opacity = 0.4;
    expect(compositeFrame(document)).toEqual(celOpacity);
  });

  it("rejects omitted or invalid appearance fields in strict v4", () => {
    const raw = JSON.parse(encodeProject(createDocument({width: 1, height: 1})));
    for (const [field, value] of [["opacity", undefined], ["zIndex", undefined], ["opacity", -1], ["opacity", 2], ["zIndex", 0.5], ["zIndex", 32768]]) {
      const invalid = structuredClone(raw);
      invalid.cels[0][field as string] = value;
      expect(() => decodeProject(JSON.stringify(invalid))).toThrow();
    }
  });
});

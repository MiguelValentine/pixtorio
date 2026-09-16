import {describe, expect, it} from "vitest";
import {celKey, cloneDocument, createDocument, getCel} from "./document";
import {refreshIndexedDocument, refreshTilemapCaches} from "./colorModes";
import {applyDocumentPalette, relocateTransparentIndex} from "./paletteOperations";
import {DocumentStateCommand} from "./history";
import {decodeProject, encodeProject} from "./serialization";
import {convertImageLayerToTilemap} from "./tilemap";

function createIndexedTilemapFixture() {
  const document = createDocument({
    width: 2,
    height: 1,
    colorMode: "indexed",
    palette: ["#00000000", "#ff0000ff"],
  });
  const source = getCel(document, document.activeLayerId, document.activeFrameId)!;
  source.indexes!.set([1, 0]);
  refreshIndexedDocument(document);

  const converted = convertImageLayerToTilemap(document, document.activeLayerId, {
    tileWidth: 1,
    tileHeight: 1,
  });
  document.layers = [converted.layer];
  document.tilesets = [converted.tileset];
  for (const cel of converted.cels) document.cels[celKey(cel.layerId, cel.frameId)] = cel;

  const first = getCel(document, converted.layer.id, document.activeFrameId)!;
  const linkedLayer = {...converted.layer, id: "linked-map", name: "Linked Map"};
  const linked = {
    ...first,
    id: "linked-cel",
    layerId: linkedLayer.id,
    pixels: first.pixels,
    indexes: first.indexes,
    tilemap: first.tilemap,
  };
  const independentLayer = {...converted.layer, id: "independent-map", name: "Independent Map"};
  const independent = {
    ...first,
    id: "independent-cel",
    linkId: "independent-link",
    layerId: independentLayer.id,
    pixels: first.pixels.slice(),
    indexes: first.indexes?.slice(),
    tilemap: first.tilemap ? {...first.tilemap, tiles: first.tilemap.tiles.slice()} : undefined,
  };
  document.layers.push(linkedLayer, independentLayer);
  document.cels[celKey(linked.layerId, linked.frameId)] = linked;
  document.cels[celKey(independent.layerId, independent.frameId)] = independent;
  refreshTilemapCaches(document);
  return {document, first, linked, independent};
}

describe("palette operations", () => {
  it("relocates transparency once for shared linked buffers and retains appearance, history and v4 data", () => {
    const document = createDocument({width: 3, height: 1, colorMode: "indexed", palette: ["#00000000", "#ff0000ff", "#00ff0080"]});
    const cel = getCel(document, document.activeLayerId, document.activeFrameId)!;
    cel.indexes!.set([0, 1, 2]);
    document.frames.push({id: "linked-frame", durationMs: 100});
    document.cels[celKey(cel.layerId, "linked-frame")] = {...cel, id: "linked-cel", frameId: "linked-frame"};
    refreshIndexedDocument(document);
    const original = cel.pixels.slice();
    const before = cloneDocument(document);
    expect(relocateTransparentIndex(document, 2)).toBe(true);
    expect([...cel.indexes!]).toEqual([2, 1, 0]);
    expect(cel.pixels).toEqual(original);
    const decoded = decodeProject(encodeProject(document));
    expect(decoded.palette.transparentIndex).toBe(2);
    expect(Object.values(decoded.cels)[0].pixels).toEqual(original);
    const command = new DocumentStateCommand(before, document, "Move Transparent Index");
    command.undo(document);
    expect(document.palette.transparentIndex).toBe(0);
    command.redo(document);
    expect(document.palette.transparentIndex).toBe(2);
  });

  it("remaps a shorter palette without out-of-range indexes or opaque pixels selecting transparency", () => {
    const document = createDocument({width: 2, height: 1, colorMode: "indexed"});
    const cel = getCel(document, document.activeLayerId, document.activeFrameId)!;
    cel.pixels.set([0, 0, 0, 255, 255, 0, 0, 0]);
    expect(applyDocumentPalette(document, {name: "Small", colors: ["#000000ff", "#ffffffff"], transparentIndex: 0})).toBe(true);
    expect([...cel.indexes!]).toEqual([1, 0]);
    expect(cel.pixels[3]).toBe(255);
    expect(cel.pixels[7]).toBe(0);
  });

  it("applies a default palette across shared indexed tilemap caches", () => {
    const fixture = createIndexedTilemapFixture();
    const {document, first, linked, independent} = fixture;
    expect(applyDocumentPalette(document, {
      name: "Custom Default",
      colors: ["#00ff00ff", "#ff0000ff", "#00000000"],
      transparentIndex: 2,
    })).toBe(true);

    expect(document.palette).toMatchObject({
      name: "Custom Default",
      colors: ["#00ff00ff", "#ff0000ff", "#00000000"],
      transparentIndex: 2,
    });
    expect(document.layers.filter((layer) => layer.kind === "tilemap").map((layer) => layer.tilesetId))
      .toEqual([document.tilesets[0].id, document.tilesets[0].id, document.tilesets[0].id]);
    expect(document.tilesets[0].tiles.map((tile) => [...tile.indexes!])).toEqual([[1], [2]]);
    expect(document.tilesets[0].tiles.map((tile) => [...tile.pixels])).toEqual([
      [255, 0, 0, 255],
      [0, 0, 0, 0],
    ]);
    expect([...first.tilemap!.tiles]).toEqual([1, 2]);
    expect([...first.indexes!]).toEqual([1, 2]);
    expect([...first.pixels]).toEqual([255, 0, 0, 255, 0, 0, 0, 0]);
    expect(linked.pixels).toBe(first.pixels);
    expect(linked.indexes).toBe(first.indexes);
    expect([...linked.pixels]).toEqual([...first.pixels]);
    expect([...independent.indexes!]).toEqual([1, 2]);
    expect([...independent.pixels]).toEqual([...first.pixels]);
    expect(independent.pixels).not.toBe(first.pixels);
    expect(independent.indexes).not.toBe(first.indexes);
  });

  it("relocates transparency in indexed tilemap authority and restores linked caches through history", () => {
    const fixture = createIndexedTilemapFixture();
    const {document, first, linked, independent} = fixture;
    const before = cloneDocument(document);

    expect(relocateTransparentIndex(document, 1)).toBe(true);
    const after = cloneDocument(document);
    expect(document.palette.transparentIndex).toBe(1);
    expect(document.palette.colors).toEqual(["#ff0000ff", "#00000000"]);
    expect(document.tilesets[0].tiles.map((tile) => [...tile.indexes!])).toEqual([[0], [1]]);
    expect(document.tilesets[0].tiles.map((tile) => [...tile.pixels])).toEqual([
      [255, 0, 0, 255],
      [0, 0, 0, 0],
    ]);
    expect([...first.tilemap!.tiles]).toEqual([1, 2]);
    expect([...first.indexes!]).toEqual([0, 1]);
    expect([...first.pixels]).toEqual([255, 0, 0, 255, 0, 0, 0, 0]);
    expect(linked.pixels).toBe(first.pixels);
    expect(linked.indexes).toBe(first.indexes);
    expect([...independent.indexes!]).toEqual([0, 1]);
    expect([...independent.pixels]).toEqual([...first.pixels]);

    const command = new DocumentStateCommand(before, after, "Move Transparent Index");
    command.undo(document);
    const undone = getCel(document, document.activeLayerId, document.activeFrameId)!;
    const undoneLinked = getCel(document, "linked-map", document.activeFrameId)!;
    expect(document.palette.transparentIndex).toBe(0);
    expect(document.palette.colors).toEqual(["#00000000", "#ff0000ff"]);
    expect(document.tilesets[0].tiles.map((tile) => [...tile.indexes!])).toEqual([[1], [0]]);
    expect([...undone.indexes!]).toEqual([1, 0]);
    expect([...undone.pixels]).toEqual([255, 0, 0, 255, 0, 0, 0, 0]);
    expect(undoneLinked.pixels).toBe(undone.pixels);
    expect(undoneLinked.indexes).toBe(undone.indexes);

    command.redo(document);
    const redone = getCel(document, document.activeLayerId, document.activeFrameId)!;
    const redoneLinked = getCel(document, "linked-map", document.activeFrameId)!;
    expect(document.palette.transparentIndex).toBe(1);
    expect([...redone.indexes!]).toEqual([0, 1]);
    expect([...redone.pixels]).toEqual([255, 0, 0, 255, 0, 0, 0, 0]);
    expect(redoneLinked.pixels).toBe(redone.pixels);
    expect(redoneLinked.indexes).toBe(redone.indexes);
  });

  it("rejects invalid indices without changing the document", () => {
    const document = createDocument({width: 1, height: 1});
    const before = cloneDocument(document);
    expect(() => relocateTransparentIndex(document, -1)).toThrow();
    expect(document).toEqual(before);
  });
});

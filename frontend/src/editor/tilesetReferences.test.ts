import {describe, expect, it} from "vitest";

import {
  addFrame,
  addTilemapLayer,
  cloneDocument,
  createDocument,
  deleteCel,
  ensureCel,
  getCel,
  type PixelDocument,
} from "./document";
import {createTileset} from "./tilemap";
import {collectTilesetReferences} from "./tilesetReferences";

function terrainTileset(id: string, name: string) {
  return createTileset({
    id,
    name,
    tileWidth: 1,
    tileHeight: 1,
    terrains: [
      {
        id: 7,
        name: "Grass",
        color: "#4caf50ff",
        neighborMode: "blob8",
        boundary: "empty",
        rules: [
          {mask: 0, candidates: [{tileId: 1, flags: 0, weight: 1}, {tileId: 2, flags: 0, weight: 1}]},
          {mask: 255, candidates: [{tileId: 1, flags: 0, weight: 1}]},
        ],
      },
      {
        id: 8,
        name: "Rock",
        color: "#777777ff",
        neighborMode: "blob8",
        boundary: "same",
        rules: [{mask: 0, candidates: [{tileId: 1, flags: 0, weight: 1}]}],
      },
    ],
    tiles: [
      {id: 1, pixels: new Uint8ClampedArray([255, 0, 0, 255])},
      {id: 2, pixels: new Uint8ClampedArray([0, 255, 0, 255])},
    ],
  });
}

function tilemapDocument() {
  const document = createDocument({width: 2, height: 2});
  const targetTileset = terrainTileset("target", "Target");
  const otherTileset = terrainTileset("other", "Other");
  document.tilesets = [targetTileset, otherTileset];

  const first = document.layers[0];
  first.name = "Duplicate";
  first.tilesetId = targetTileset.id;

  const targetA = addTilemapLayer(document, targetTileset.id, "Duplicate")!;
  const targetB = addTilemapLayer(document, targetTileset.id, "Duplicate")!;
  const emptyTarget = addTilemapLayer(document, targetTileset.id, "Empty target")!;
  const otherLayer = addTilemapLayer(document, otherTileset.id, "Other tileset")!;
  const sameIdImage = document.layers[0];
  sameIdImage.kind = "image";
  sameIdImage.tilesetId = targetTileset.id;

  const firstFrame = document.frames[0];
  const secondFrame = addFrame(document);
  const thirdFrame = addFrame(document);
  ensureCel(document, targetA.id, thirdFrame.id);
  ensureCel(document, targetB.id, secondFrame.id);
  ensureCel(document, targetB.id, thirdFrame.id);
  ensureCel(document, otherLayer.id, secondFrame.id);
  deleteCel(document, targetA.id, secondFrame.id);
  deleteCel(document, emptyTarget.id, firstFrame.id);
  deleteCel(document, emptyTarget.id, secondFrame.id);
  deleteCel(document, emptyTarget.id, thirdFrame.id);

  const linked = getCel(document, targetB.id, firstFrame.id)!;
  const linkedSecond = getCel(document, targetB.id, secondFrame.id)!;
  linkedSecond.linkId = linked.linkId;

  // Make object insertion order intentionally disagree with document order.
  document.cels = Object.fromEntries(Object.entries(document.cels).reverse());
  document.layers = [first, targetA, targetB, emptyTarget, otherLayer];
  return {document, targetTileset, targetA, targetB, emptyTarget, firstFrame, secondFrame, thirdFrame};
}

describe("collectTilesetReferences", () => {
  it("collects referenced layers and real tilemap Cels in layer/frame order", () => {
    const fixture = tilemapDocument();
    const references = collectTilesetReferences(fixture.document, fixture.targetTileset.id);

    expect(references.layers).toEqual([
      {id: fixture.targetA.id, name: "Duplicate"},
      {id: fixture.targetB.id, name: "Duplicate"},
      {id: fixture.emptyTarget.id, name: "Empty target"},
    ]);
    expect(references.cels.map((cel) => ({
      id: cel.id,
      layerId: cel.layerId,
      frameId: cel.frameId,
      frameIndex: cel.frameIndex,
      linkId: cel.linkId,
    }))).toEqual([
      {id: getCel(fixture.document, fixture.targetA.id, fixture.firstFrame.id)!.id, layerId: fixture.targetA.id, frameId: fixture.firstFrame.id, frameIndex: 0, linkId: getCel(fixture.document, fixture.targetA.id, fixture.firstFrame.id)!.linkId},
      {id: getCel(fixture.document, fixture.targetA.id, fixture.thirdFrame.id)!.id, layerId: fixture.targetA.id, frameId: fixture.thirdFrame.id, frameIndex: 2, linkId: getCel(fixture.document, fixture.targetA.id, fixture.thirdFrame.id)!.linkId},
      {id: getCel(fixture.document, fixture.targetB.id, fixture.firstFrame.id)!.id, layerId: fixture.targetB.id, frameId: fixture.firstFrame.id, frameIndex: 0, linkId: getCel(fixture.document, fixture.targetB.id, fixture.firstFrame.id)!.linkId},
      {id: getCel(fixture.document, fixture.targetB.id, fixture.secondFrame.id)!.id, layerId: fixture.targetB.id, frameId: fixture.secondFrame.id, frameIndex: 1, linkId: getCel(fixture.document, fixture.targetB.id, fixture.secondFrame.id)!.linkId},
      {id: getCel(fixture.document, fixture.targetB.id, fixture.thirdFrame.id)!.id, layerId: fixture.targetB.id, frameId: fixture.thirdFrame.id, frameIndex: 2, linkId: getCel(fixture.document, fixture.targetB.id, fixture.thirdFrame.id)!.linkId},
    ]);
    expect(references.cels[2].linkId).toBe(references.cels[3].linkId);
    expect(references.cels.every((cel) => cel.layerName === "Duplicate")).toBe(true);
  });

  it("reports tileset terrain definitions and does not mutate the document", () => {
    const fixture = tilemapDocument();
    const before = cloneDocument(fixture.document);
    const references = collectTilesetReferences(fixture.document, fixture.targetTileset.id);

    expect(references.terrains).toEqual([
      {id: 7, name: "Grass", ruleCount: 2, candidateCount: 3},
      {id: 8, name: "Rock", ruleCount: 1, candidateCount: 1},
    ]);
    expect(fixture.document).toEqual(before);
  });

  it("returns empty reference groups for a missing tileset", () => {
    const fixture = tilemapDocument();
    expect(collectTilesetReferences(fixture.document, "missing")).toEqual({layers: [], cels: [], terrains: []});
  });
});

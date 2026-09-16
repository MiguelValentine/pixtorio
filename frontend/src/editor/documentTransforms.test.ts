import {describe, expect, it} from "vitest";
import {
  addFrame,
  celKey,
  createCel,
  createDocument,
  getActiveCel,
  getCel,
  linkCels,
  type PixelDocument,
} from "./document";
import {convertImageLayerToTilemap, renderTilemapCel} from "./tilemap";
import {
  findContentBounds,
  flipDocument,
  resizeSpriteContent,
  rotateDocument,
  trimDocument,
} from "./documentTransforms";

function pixel(red: number, green = 0, blue = 0, alpha = 255) {
  return [red, green, blue, alpha];
}

function matrixDocument(): PixelDocument {
  const document = createDocument({width: 3, height: 2});
  getActiveCel(document).pixels.set([
    ...pixel(1), ...pixel(2), ...pixel(3),
    ...pixel(4), ...pixel(5), ...pixel(6),
  ]);
  return document;
}

function redChannels(pixels: Uint8ClampedArray) {
  return [...pixels].filter((_value, index) => index % 4 === 0);
}

describe("document transforms", () => {
  it("rotates pixels, partial Cel geometry, guides, slices, and grid metadata", () => {
    const document = matrixDocument();
    document.guides = [
      {id: "vertical", axis: "vertical", position: 1},
      {id: "horizontal", axis: "horizontal", position: 1},
    ];
    document.slices = [{
      id: "slice",
      name: "Sprite",
      color: "#ff0000ff",
      keys: [{frameId: document.activeFrameId, x: 1, y: 0, width: 2, height: 1, pivot: {x: 1, y: 0}}],
    }];
    document.settings.gridWidth = 2;
    document.settings.gridHeight = 4;
    document.settings.gridOffsetX = 1;
    document.settings.gridOffsetY = 2;
    document.settings.symmetryAxisX = 1;
    document.settings.symmetryAxisY = 1;
    const cel = getActiveCel(document);
    cel.x = 1;
    cel.y = 0;
    cel.width = 2;
    cel.height = 1;
    cel.pixels = new Uint8ClampedArray([...pixel(7), ...pixel(8)]);

    expect(rotateDocument(document, "cw")).toBe(true);
    expect(document.width).toBe(2);
    expect(document.height).toBe(3);
    expect(cel.x).toBe(1);
    expect(cel.y).toBe(1);
    expect(cel.width).toBe(1);
    expect(cel.height).toBe(2);
    expect(redChannels(cel.pixels)).toEqual([7, 8]);
    expect(document.guides).toEqual([
      {id: "vertical", axis: "horizontal", position: 1},
      {id: "horizontal", axis: "vertical", position: 1},
    ]);
    expect(document.slices[0].keys[0]).toMatchObject({x: 1, y: 1, width: 1, height: 2, pivot: {x: 1, y: 1}});
    expect(document.settings.gridWidth).toBe(4);
    expect(document.settings.gridHeight).toBe(2);
    expect(document.pixelAspectRatio).toEqual({width: 1, height: 1});
  });

  it("preserves linked RGBA and indexed buffers while flipping", () => {
    const document = createDocument({width: 3, height: 1, colorMode: "indexed", palette: ["#00000000", "#ff0000ff", "#00ff00ff"]});
    const layer = document.layers[0];
    const firstFrameId = document.activeFrameId;
    const secondFrame = addFrame(document, 100);
    const first = getCel(document, layer.id, firstFrameId)!;
    const second = createCel(layer.id, secondFrame.id, 3, 1);
    first.pixels.set([...pixel(10), ...pixel(20), ...pixel(30)]);
    first.indexes = new Uint8Array([1, 2, 0]);
    second.pixels = first.pixels;
    second.indexes = first.indexes;
    document.cels[celKey(layer.id, secondFrame.id)] = second;
    expect(linkCels(document, layer.id, [firstFrameId, secondFrame.id], firstFrameId)).toBe(true);

    expect(flipDocument(document, "horizontal")).toBe(true);
    expect(redChannels(first.pixels)).toEqual([30, 20, 10]);
    expect([...first.indexes!]).toEqual([0, 2, 1]);
    expect(second.pixels).toBe(first.pixels);
    expect(second.indexes).toBe(first.indexes);
  });

  it("trims transparent margins across sparse cels and uses indexed transparency", () => {
    const document = createDocument({width: 8, height: 6, colorMode: "indexed", palette: ["#ff0000ff", "#00000000", "#00ff00ff"]});
    document.palette.transparentIndex = 1;
    const layer = document.layers[0];
    const cel = getActiveCel(document);
    cel.x = 2;
    cel.y = 1;
    cel.width = 3;
    cel.height = 2;
    cel.pixels = new Uint8ClampedArray(3 * 2 * 4);
    cel.indexes = new Uint8Array([1, 1, 1, 1, 2, 1]);
    cel.pixels.set([...pixel(0, 0, 0, 0), ...pixel(0, 0, 0, 0), ...pixel(0, 0, 0, 0), ...pixel(0, 0, 0, 0), ...pixel(0, 255, 0), ...pixel(0, 0, 0, 0)]);

    expect(findContentBounds(document)).toEqual({x: 3, y: 2, width: 1, height: 1});
    expect(trimDocument(document)).toBe(true);
    expect(document.width).toBe(1);
    expect(document.height).toBe(1);
    expect(getActiveCel(document).indexes).toEqual(new Uint8Array([2]));
    expect([...getActiveCel(document).pixels]).toEqual(pixel(0, 255, 0));
    expect(layer.id).toBe(document.activeLayerId);
  });

  it("scales sprite content with nearest-neighbor RGBA and index samples", () => {
    const document = createDocument({width: 2, height: 2, colorMode: "indexed", palette: ["#00000000", "#ff0000ff", "#00ff00ff", "#0000ffff"]});
    const cel = getActiveCel(document);
    cel.indexes = new Uint8Array([1, 2, 2, 3]);
    cel.pixels.set([
      ...pixel(255, 0, 0), ...pixel(0, 255, 0),
      ...pixel(0, 255, 0), ...pixel(0, 0, 255),
    ]);

    expect(resizeSpriteContent(document, 4, 4)).toBe(true);
    expect(document.width).toBe(4);
    expect(document.height).toBe(4);
    expect([...cel.indexes!]).toEqual([
      1, 1, 2, 2,
      1, 1, 2, 2,
      2, 2, 3, 3,
      2, 2, 3, 3,
    ]);
    expect([...cel.pixels.subarray(0, 4)]).toEqual(pixel(255, 0, 0));
    expect([...cel.pixels.subarray((3 * 4 + 3) * 4, (3 * 4 + 3) * 4 + 4)]).toEqual(pixel(0, 0, 255));
  });

  it("rebuilds tilemap authority after a quarter-turn and sprite resize", () => {
    const document = createDocument({width: 4, height: 2});
    const source = getActiveCel(document);
    source.pixels.set([
      ...pixel(255, 0, 0), ...pixel(255, 0, 0), ...pixel(0, 0, 0, 0), ...pixel(0, 0, 0, 0),
      ...pixel(0, 0, 0, 0), ...pixel(0, 0, 0, 0), ...pixel(0, 0, 255), ...pixel(0, 0, 255),
    ]);
    const converted = convertImageLayerToTilemap(document, document.activeLayerId, {tileWidth: 2, tileHeight: 2});
    document.layers[0] = converted.layer;
    document.tilesets = [converted.tileset];
    document.cels[celKey(converted.layer.id, document.activeFrameId)] = converted.cels[0];

    expect(rotateDocument(document, "cw")).toBe(true);
    const cel = getActiveCel(document);
    expect(cel.tilemap).toBeDefined();
    expect(cel.tilemap?.columns).toBe(1);
    expect(cel.tilemap?.rows).toBe(2);
    expect(renderTilemapCel(cel, document.tilesets[0])).toEqual(cel.pixels);

    expect(resizeSpriteContent(document, 4, 6)).toBe(true);
    expect(getActiveCel(document).tilemap).toBeDefined();
    expect(renderTilemapCel(getActiveCel(document), document.tilesets[0])).toEqual(getActiveCel(document).pixels);
  });
});

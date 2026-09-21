import {describe, expect, it} from "vitest";
import {
  addFrame,
  celKey,
  cloneDocument,
  createCel,
  createDocument,
  getActiveCel,
  getCel,
  linkCels,
  tileFlipDiagonal,
  tileFlipX,
  type PixelDocument,
} from "./document";
import {convertImageLayerToTilemap, createTilemapData, createTileset, renderTilemapCel, tilemapPixelSize} from "./tilemap";
import {createTerrainMapData, recalculateTerrainCells} from "./terrain";
import {decodeProject, encodeProject} from "./serialization";
import {tilesetGridLayout} from "./tilemapGeometry";
import {transformTilemapGrid} from "./tilemapTransforms";
import {convertDocumentColorMode, refreshTilemapCaches} from "./colorModes";
import {CommandHistory, DocumentStateCommand} from "./history";
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
    expect(document.slices[0].keys[0]).toMatchObject({x: 1, y: 1, width: 1, height: 2, pivot: {x: 0, y: 1}});
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

  it("logically rotates and scales tilemap authority with nearest-neighbor pixels", () => {
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

    const beforeResize = getActiveCel(cloneDocument(document));
    expect(resizeSpriteContent(document, 4, 6)).toBe(true);
    expect(cel.tilemap).toMatchObject({columns: 1, rows: 2});
    expect(document.tilesets[0]).toMatchObject({tileWidth: 4, tileHeight: 3});
    for (let y = 0; y < cel.height; y += 1) {
      for (let x = 0; x < cel.width; x += 1) {
        const source = (Math.floor(y * 4 / 6) * 2 + Math.floor(x / 2)) * 4;
        const target = (y * cel.width + x) * 4;
        expect(cel.pixels.slice(target, target + 4)).toEqual(beforeResize.pixels.slice(source, source + 4));
      }
    }
    expect(renderTilemapCel(getActiveCel(document), document.tilesets[0])).toEqual(getActiveCel(document).pixels);
    expect(() => decodeProject(encodeProject(document))).not.toThrow();
  });

  it("rotates isometric Terrain authority, candidate flags, and render caches together", () => {
    const tileset = createTileset({
      tileWidth: 2,
      tileHeight: 2,
      grid: {kind: "isometric", cellWidth: 2, cellHeight: 2, anchorX: 1, anchorY: 2},
      tiles: [{id: 1, pixels: new Uint8ClampedArray([
        ...pixel(255), ...pixel(0, 255),
        ...pixel(0, 0, 255), ...pixel(255, 255),
      ])}],
    });
    tileset.terrains = [{
      id: 1,
      name: "Road",
      color: "#ffffffff",
      neighborMode: "edge4",
      boundary: "empty",
      rules: Array.from({length: 16}, (_, mask) => ({
        mask,
        candidates: [{tileId: 1, flags: 0, weight: 1}],
      })),
    }];
    const size = tilemapPixelSize(tileset, 3, 2);
    const document = createDocument({width: size.width, height: size.height});
    document.tilesets = [tileset];
    document.layers[0].kind = "tilemap";
    document.layers[0].tilesetId = tileset.id;
    const cel = getActiveCel(document);
    cel.tilemap = createTilemapData(3, 2);
    cel.terrainmap = createTerrainMapData(3, 2, 37);
    cel.terrainmap.terrains.set([1, 0, 1, 0, 1, 0]);
    recalculateTerrainCells(
      cel.terrainmap,
      tileset.terrains,
      {kind: "isometric", tileWidth: 2, tileHeight: 2},
      cel.tilemap.tiles,
      Array.from({length: 6}, (_, index) => ({column: index % 3, row: Math.floor(index / 3)})),
    );
    cel.width = size.width;
    cel.height = size.height;
    cel.pixels = renderTilemapCel(cel, tileset);

    expect(rotateDocument(document, "cw")).toBe(true);
    expect(cel.tilemap).toMatchObject({columns: 2, rows: 3});
    expect([...cel.terrainmap!.terrains]).toEqual([0, 1, 1, 0, 0, 1]);
    expect(cel.terrainmap!.seed).toBe(37);
    expect(document.tilesets[0].grid).toEqual({kind: "isometric", cellWidth: 2, cellHeight: 2, anchorX: 0, anchorY: 1});
    expect(document.tilesets[0].terrains[0].rules[0].candidates[0].flags).not.toBe(0);
    expect(renderTilemapCel(cel, document.tilesets[0])).toEqual(cel.pixels);
  });

  it("scales Terrain, linked and independent Cels without discarding authority in every color mode", () => {
    for (const grid of [
      {kind: "orthogonal"},
      {kind: "isometric", cellWidth: 4, cellHeight: 2, anchorX: 2, anchorY: 4},
      {kind: "hexagonal", orientation: "pointy", offset: "odd-r"},
      {kind: "hexagonal", orientation: "pointy", offset: "even-r"},
      {kind: "hexagonal", orientation: "flat", offset: "odd-q"},
      {kind: "hexagonal", orientation: "flat", offset: "even-q"},
    ] as const) {
      for (const mode of ["rgba", "grayscale", "indexed"] as const) {
        const document = createDocument({width: 32, height: 32});
        const tileset = createTileset({tileWidth: 4, tileHeight: 4, grid,
          tiles: [{id: 1, pixels: Uint8ClampedArray.from(
            Array.from({length: 16}, (_, i) => pixel(i * 16, 255 - i * 16)).flat(),
          )}],
        });
        tileset.terrains = [{
          id: 1, name: "Grass", color: "#ffffffff", neighborMode: grid.kind === "hexagonal" ? "edge6" : "edge4",
          boundary: "wrap", rules: [{mask: 0, candidates: [{tileId: 1, flags: (tileFlipX | tileFlipDiagonal) >>> 0, weight: 1}]}],
        }];
        document.tilesets = [tileset];
        Object.assign(document.layers[0], {kind: "tilemap", tilesetId: tileset.id});
        const first = getActiveCel(document);
        first.tilemap = createTilemapData(3, 2);
        first.terrainmap = createTerrainMapData(3, 2, 17);
        first.terrainmap.terrains.set([1, 65535, 0, 1, 1, 1]);
        recalculateTerrainCells(first.terrainmap, tileset.terrains, tilesetGridLayout(tileset), first.tilemap.tiles,
          Array.from({length: 6}, (_, i) => ({column: i % 3, row: Math.floor(i / 3)})));
        Object.assign(first, tilemapPixelSize(tileset, 3, 2), {x: -2, y: 3});
        refreshTilemapCaches(document);
        if (mode !== "rgba") convertDocumentColorMode(document, mode);
        const nextFrame = addFrame(document);
        linkCels(document, first.layerId, document.frames.map((frame) => frame.id), first.frameId);
        const linked = getCel(document, first.layerId, nextFrame.id)!;
        Object.assign(linked, {x: 3, y: -2, opacity: 0.5, zIndex: 2});
        const layer = {...document.layers[0], id: "other-tile-layer", name: "Other"};
        document.layers.push(layer);
        const independent = {...first, id: "other-tile-cel", linkId: "other-link", layerId: layer.id,
          tilemap: createTilemapData(2, 1), terrainmap: undefined, ...tilemapPixelSize(tileset, 2, 1)};
        independent.tilemap.tiles.set([1, 0]);
        document.cels[celKey(layer.id, first.frameId)] = independent;
        refreshTilemapCaches(document);
        const before = cloneDocument(document);
        expect(() => decodeProject(encodeProject(before))).not.toThrow();
        expect(resizeSpriteContent(document, 64, 16)).toBe(true);
        expect(tileset).toMatchObject({tileWidth: 8, tileHeight: 2});
        expect(first).toMatchObject({x: -4, y: 2});
        expect(linked).toMatchObject({x: 6, y: -1, opacity: 0.5, zIndex: 2});
        expect(linked.tilemap).toBe(first.tilemap);
        expect(linked.terrainmap).toBe(first.terrainmap);
        expect(linked.pixels).toBe(first.pixels);
        expect(linked.indexes).toBe(first.indexes);
        expect([...first.terrainmap!.terrains]).toEqual([1, 65535, 0, 1, 1, 1]);
        expect(tileset.terrains[0].rules[0].candidates[0].flags).toBe(0);
        expect(independent.tilemap).toMatchObject({columns: 2, rows: 1});
        expect(() => decodeProject(encodeProject(document))).not.toThrow();
        const after = cloneDocument(document);
        const history = new CommandHistory<PixelDocument>();
        history.commit(new DocumentStateCommand(before, document, "Resize Sprite"));
        history.undo(document);
        expect(document).toEqual(before);
        history.redo(document);
        expect(document).toEqual(after);
        expect(() => decodeProject(encodeProject(document))).not.toThrow();
      }
    }
  });

  it("rejects oversized shared tilemap scaling before mutating any resource", () => {
    const document = createDocument({width: 2, height: 2});
    const converted = convertImageLayerToTilemap(document, document.activeLayerId, {tileWidth: 2, tileHeight: 2});
    document.layers[0] = converted.layer;
    document.tilesets = [converted.tileset];
    const cel = converted.cels[0];
    cel.tilemap = createTilemapData(3, 1);
    cel.width = 6;
    cel.pixels = renderTilemapCel(cel, converted.tileset);
    document.cels[celKey(cel.layerId, cel.frameId)] = cel;
    const before = cloneDocument(document);
    expect(resizeSpriteContent(document, 2048, 2)).toBe(false);
    expect(document).toEqual(before);
  });

  it("quarter-turns rectangular tiles across grids and color modes with strict cache validation", () => {
    for (const grid of [
      {kind: "orthogonal"},
      {kind: "isometric", cellWidth: 8, cellHeight: 4, anchorX: 4, anchorY: 4},
      {kind: "hexagonal", orientation: "pointy", offset: "odd-r"},
      {kind: "hexagonal", orientation: "pointy", offset: "even-r"},
      {kind: "hexagonal", orientation: "flat", offset: "odd-q"},
      {kind: "hexagonal", orientation: "flat", offset: "even-q"},
    ] as const) {
      for (const mode of ["rgba", "grayscale", "indexed"] as const) {
        const tileset = createTileset({
          tileWidth: 8, tileHeight: 4, grid,
          tiles: [{id: 1, pixels: new Uint8ClampedArray(
            Array.from({length: 32}, (_, i) => pixel(i * 7, i * 3, i)).flat(),
          )}],
        });
        const size = tilemapPixelSize(tileset, 3, 2);
        const document = createDocument(size);
        document.tilesets = [tileset];
        Object.assign(document.layers[0], {kind: "tilemap", tilesetId: tileset.id});
        const cel = getActiveCel(document);
        cel.tilemap = createTilemapData(3, 2);
        cel.tilemap.tiles.set([1, 0, 1, 1, 1, 0]);
        cel.pixels = renderTilemapCel(cel, tileset);
        if (mode !== "rgba") convertDocumentColorMode(document, mode);
        const before = cloneDocument(document);
        expect(rotateDocument(document, "cw")).toBe(true);
        expect(document.tilesets[0]).toMatchObject({tileWidth: 4, tileHeight: 8});
        const restored = decodeProject(encodeProject(document));
        expect(getActiveCel(restored).pixels).toEqual(cel.pixels);
        expect(getActiveCel(restored).indexes).toEqual(cel.indexes);
        if (grid.kind === "orthogonal") {
          const original = getActiveCel(before);
          for (let y = 0; y < cel.height; y += 1) {
            for (let x = 0; x < cel.width; x += 1) {
              const source = ((original.height - 1 - x) * original.width + y) * 4;
              const target = (y * cel.width + x) * 4;
              expect(cel.pixels.slice(target, target + 4)).toEqual(original.pixels.slice(source, source + 4));
            }
          }
        }
        expect(rotateDocument(document, "ccw")).toBe(true);
        expect(document).toEqual(before);
      }
    }
  });

  it("flips and quarter-turns hexagonal Terrain with strict persistence", () => {
    const tileset = createTileset({
      tileWidth: 2,
      tileHeight: 2,
      grid: {kind: "hexagonal", orientation: "pointy", offset: "odd-r"},
      tiles: [{id: 1, pixels: new Uint8ClampedArray(16).fill(255)}],
    });
    const size = tilemapPixelSize(tileset, 2, 2);
    const document = createDocument({width: size.width, height: size.height});
    document.tilesets = [tileset];
    document.layers[0].kind = "tilemap";
    document.layers[0].tilesetId = tileset.id;
    const cel = getActiveCel(document);
    cel.tilemap = createTilemapData(2, 2);
    cel.tilemap.tiles.set([1, 0, 0, 1]);
    cel.terrainmap = createTerrainMapData(2, 2, 11);
    cel.terrainmap.terrains.set([1, 2, 3, 4]);
    tileset.terrains = [1, 2, 3, 4].map((id) => ({
      id, name: `Terrain ${id}`, color: "#ffffffff",
      neighborMode: "edge6", boundary: "empty",
      rules: [{mask: 0, candidates: [{tileId: 1, flags: 0, weight: 1}]}],
    }));
    cel.width = size.width;
    cel.height = size.height;
    cel.pixels = renderTilemapCel(cel, tileset);

    expect(flipDocument(document, "horizontal")).toBe(true);
    expect([...cel.terrainmap.terrains]).toEqual([2, 1, 4, 3]);
    const snapshot = cloneDocument(document);
    expect(rotateDocument(document, "cw")).toBe(true);
    expect(document.tilesets[0].grid).toMatchObject({orientation: "flat"});
    expect(getActiveCel(decodeProject(encodeProject(document))).terrainmap).toEqual(cel.terrainmap);
    expect(rotateDocument(document, "ccw")).toBe(true);
    expect(document).toEqual(snapshot);
  });

  it("strictly round-trips transformed asymmetric Terrain rules and weighted variants", () => {
    for (const grid of [
      {kind: "orthogonal"},
      {kind: "isometric", cellWidth: 2, cellHeight: 2, anchorX: 1, anchorY: 2},
      {kind: "hexagonal", orientation: "pointy", offset: "odd-r"},
      {kind: "hexagonal", orientation: "pointy", offset: "even-r"},
      {kind: "hexagonal", orientation: "flat", offset: "odd-q"},
      {kind: "hexagonal", orientation: "flat", offset: "even-q"},
    ] as const) {
      for (const rows of [2, 3]) {
        for (const operation of ["horizontal", "vertical", "180", "cw", "ccw"] as const) {
          const tileset = createTileset({
            tileWidth: 2, tileHeight: 2, grid,
            tiles: [1, 2, 3].map((id) => ({
              id, pixels: new Uint8ClampedArray(Array.from({length: 4}, () => pixel(id * 60)).flat()),
            })),
          });
          tileset.terrains = [{
            id: 1, name: "Weighted", color: "#ffffffff",
            neighborMode: grid.kind === "hexagonal" ? "edge6" : grid.kind === "isometric" ? "edge4" : "blob8",
            boundary: "wrap",
            rules: (grid.kind === "orthogonal" ? [1, 4, 7, 28] : [1, 2, 5, 12]).map((mask) => ({
              mask,
              candidates: [
                {tileId: 1, flags: 0, weight: 1},
                {tileId: 2, flags: 0, weight: 3},
                {tileId: 3, flags: 0, weight: 2},
              ],
            })),
          }];
          const size = tilemapPixelSize(tileset, 3, rows);
          const document = createDocument(size);
          document.tilesets = [tileset];
          Object.assign(document.layers[0], {kind: "tilemap", tilesetId: tileset.id});
          const cel = getActiveCel(document);
          cel.tilemap = createTilemapData(3, rows);
          cel.terrainmap = createTerrainMapData(3, rows, 37);
          cel.terrainmap.terrains.set(Array.from({length: 3 * rows}, (_, index) => index % 4 === 0 ? 0 : 1));
          recalculateTerrainCells(cel.terrainmap, tileset.terrains, tilesetGridLayout(tileset), cel.tilemap.tiles,
            Array.from({length: 3 * rows}, (_, index) => ({column: index % 3, row: Math.floor(index / 3)})));
          Object.assign(cel, size);
          cel.pixels = renderTilemapCel(cel, tileset);
          expect(() => decodeProject(encodeProject(document))).not.toThrow();
          expect(operation === "horizontal" || operation === "vertical"
            ? flipDocument(document, operation) : rotateDocument(document, operation)).toBe(true);
          const restored = decodeProject(encodeProject(document));
          expect(getActiveCel(restored).terrainmap).toEqual(cel.terrainmap);
          expect(getActiveCel(restored).tilemap).toEqual(cel.tilemap);
          expect(getActiveCel(restored).pixels).toEqual(cel.pixels);
        }
      }
    }
  });

  it("transforms every independent Cel sharing one Tileset and keeps linked aliases shared", () => {
    const document = createDocument({width: 4, height: 2});
    const converted = convertImageLayerToTilemap(document, document.activeLayerId, {tileWidth: 2, tileHeight: 2});
    document.layers[0] = converted.layer;
    document.tilesets = [converted.tileset];
    const first = converted.cels[0];
    first.tilemap!.tiles.set([1, 0]);
    first.pixels = renderTilemapCel(first, converted.tileset);
    document.cels = {[celKey(first.layerId, first.frameId)]: first};
    const secondFrame = addFrame(document);
    const linked = {...first, id: "linked-tile-cel", frameId: secondFrame.id};
    document.cels[celKey(first.layerId, secondFrame.id)] = linked;

    const layer = {...converted.layer, id: "shared-tile-layer", name: "Shared"};
    document.layers.push(layer);
    const independent = {
      ...first,
      id: "independent-tile-cel",
      linkId: "independent-tile-link",
      layerId: layer.id,
      tilemap: {columns: 2, rows: 1, tiles: new Uint32Array([0, 1])},
    };
    independent.pixels = renderTilemapCel(independent, converted.tileset);
    document.cels[celKey(layer.id, independent.frameId)] = independent;

    expect(flipDocument(document, "horizontal")).toBe(true);
    expect([...first.tilemap!.tiles].map((value) => value & 0x1fffffff)).toEqual([0, 1]);
    expect(linked.tilemap).toBe(first.tilemap);
    expect(linked.pixels).toBe(first.pixels);
    expect([...independent.tilemap.tiles].map((value) => value & 0x1fffffff)).toEqual([1, 0]);
    expect(renderTilemapCel(independent, document.tilesets[0])).toEqual(independent.pixels);
  });

  it("preserves distinct hex offset layouts for differently sized Cels sharing one Tileset", () => {
    const tileset = createTileset({
      tileWidth: 2,
      tileHeight: 2,
      grid: {kind: "hexagonal", orientation: "pointy", offset: "odd-r"},
      tiles: [{id: 1, pixels: new Uint8ClampedArray(16).fill(255)}],
    });
    const candidates = Array.from({length: 16}, (_, index) => ({
      columns: index % 4 + 1,
      rows: Math.floor(index / 4) + 1,
    })).map((dimensions) => ({
      ...dimensions,
      result: transformTilemapGrid(createTilemapData(dimensions.columns, dimensions.rows), undefined, tileset, "cw"),
    }));
    const firstCandidate = candidates[0];
    const secondCandidate = candidates.find((candidate) =>
      candidate.result.grid.kind === "hexagonal" && firstCandidate.result.grid.kind === "hexagonal"
      && candidate.result.grid.offset !== firstCandidate.result.grid.offset);
    expect(secondCandidate).toBeDefined();

    const document = createDocument({width: 32, height: 32});
    document.tilesets = [tileset];
    const firstLayer = {...document.layers[0], kind: "tilemap" as const, tilesetId: tileset.id};
    const secondLayer = {...firstLayer, id: "second-hex-layer", name: "Second hex"};
    document.layers = [firstLayer, secondLayer];
    const createMapCel = (layerId: string, columns: number, rows: number, linkId: string) => {
      const tilemap = createTilemapData(columns, rows);
      tilemap.tiles.fill(1);
      const size = tilemapPixelSize(tileset, tilemap);
      const cel = createCel(layerId, document.frames[0].id, size.width, size.height);
      cel.linkId = linkId;
      cel.tilemap = tilemap;
      cel.pixels = renderTilemapCel(cel, tileset);
      return cel;
    };
    const first = createMapCel(firstLayer.id, firstCandidate.columns, firstCandidate.rows, "first-hex-link");
    const second = createMapCel(secondLayer.id, secondCandidate!.columns, secondCandidate!.rows, "second-hex-link");
    document.cels = {
      [celKey(first.layerId, first.frameId)]: first,
      [celKey(second.layerId, second.frameId)]: second,
    };
    const before = cloneDocument(document);

    expect(rotateDocument(document, "cw")).toBe(true);
    expect(document.tilesets).toHaveLength(1);
    expect(document.tilesets[0].grid).toEqual(firstCandidate.result.grid);
    expect(first.tilemap!.gridOffset).toBeUndefined();
    expect(second.tilemap!.gridOffset).toBe((secondCandidate!.result.grid as {offset: string}).offset);
    expect((tilesetGridLayout(document.tilesets[0], first.tilemap!) as {offset: string}).offset)
      .toBe((firstCandidate.result.grid as {offset: string}).offset);
    expect((tilesetGridLayout(document.tilesets[0], second.tilemap!) as {offset: string}).offset)
      .toBe((secondCandidate!.result.grid as {offset: string}).offset);
    expect(document.tilesets[0].grid).toMatchObject({kind: "hexagonal", orientation: "flat"});
    expect(second.tilemap!.gridOffset).toMatch(/-q$/);
    expect(renderTilemapCel(first, document.tilesets[0])).toEqual(first.pixels);
    expect(renderTilemapCel(second, document.tilesets[0])).toEqual(second.pixels);
    expect(decodeProject(encodeProject(document))).toEqual(document);
    expect(() => transformTilemapGrid(first.tilemap!, undefined, document.tilesets[0], "ccw")).not.toThrow();
    expect(() => transformTilemapGrid(second.tilemap!, undefined, document.tilesets[0], "ccw")).not.toThrow();

    expect(rotateDocument(document, "ccw")).toBe(true);
    expect(document).toEqual(before);
  });
});

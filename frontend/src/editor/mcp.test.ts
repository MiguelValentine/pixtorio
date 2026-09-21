import {describe, expect, it} from "vitest";

import {
  addFrame,
  celKey,
  cloneDocument,
  createDocument,
  ensureCel,
  getActiveCel,
  linkCels,
  type PixelDocument,
} from "./document";
import {DocumentStateCommand, PixelEditCommand} from "./history";
import {applyMCPEdits, readMCPIndexes, readMCPPixels, readMCPTilemap, readMCPTileset, summarizeMCPDocument} from "./mcp";
import {setPixel} from "./pixels";
import {decodeProject, encodeProject} from "./serialization";
import {createTilemapData, createTileset, renderTilemapCel, tilemapPixelSize} from "./tilemap";

function pixelAt(document: PixelDocument, layerId: string, frameId: string, x: number, y: number) {
  const cel = document.cels[celKey(layerId, frameId)];
  if (!cel) throw new Error("Test cel is missing");
  const offset = ((y - cel.y) * cel.width + x - cel.x) * 4;
  return Array.from(cel.pixels.subarray(offset, offset + 4));
}

function createTerrainTilemapFixture() {
  const document = createDocument({width: 2, height: 1});
  applyMCPEdits(document, [
    {type: "add_tileset", tilesetId: "terrain", name: "Terrain", tileWidth: 1, tileHeight: 1},
    {type: "add_tile", tilesetId: "terrain", tileId: 1, pixels: ["#ff0000ff"]},
    {type: "add_tile", tilesetId: "terrain", tileId: 2, pixels: ["#0000ffff"]},
    {type: "add_layer", name: "Map", kind: "tilemap", tilesetId: "terrain"},
  ]);
  const layerId = document.activeLayerId;
  const firstFrameId = document.activeFrameId;
  applyMCPEdits(document, [{
    type: "add_terrain",
    tilesetId: "terrain",
    terrain: {
      id: 1,
      name: "Grass",
      color: "#00ff00",
      neighborMode: "edge4",
      boundary: "empty",
      rules: [{mask: 0, candidates: [{tileId: 1, flags: 0, weight: 1}]}],
    },
  }]);
  applyMCPEdits(document, [{type: "set_terrainmap", layerId, frameId: firstFrameId, cells: [1, 1]}]);
  const secondFrame = addFrame(document);
  linkCels(document, layerId, [firstFrameId, secondFrame.id], firstFrameId);
  return {document, layerId, firstFrameId, secondFrameId: secondFrame.id};
}

describe("MCP document metadata and reads", () => {
  it("summarizes editable metadata without exposing pixel buffers", () => {
    const document = createDocument({name: "sprite.pixio", width: 4, height: 3});
    const summary = summarizeMCPDocument(document);

    expect(summary).toMatchObject({
      name: "sprite.pixio",
      width: 4,
      height: 3,
      dimensions: {width: 4, height: 3},
      colorMode: "rgba",
      colorProfile: {type: "srgb", name: "sRGB", embeddedBytes: 0},
      pixelAspectRatio: {width: 1, height: 1},
      activeLayerId: document.activeLayerId,
      activeFrameId: document.activeFrameId,
    });
    expect(summary.layers[0]).toMatchObject({id: document.activeLayerId, kind: "image"});
    expect(summary.frames[0]).toEqual({id: document.activeFrameId, durationMs: 100});
    expect(summary.palette.colors).toEqual(document.palette.colors);
    expect(summary.cels[0]).not.toHaveProperty("pixels");
    expect(summary.cels[0]).toMatchObject({opacity: 1, zIndex: 0});
  });

  it("summarizes and edits v5 tilesets and tilemap Cels", () => {
    const document = createDocument({width: 4, height: 2});
    const command = applyMCPEdits(document, [
      {type: "add_tileset", tilesetId: "terrain", name: "Terrain", tileWidth: 2, tileHeight: 2},
      {type: "add_tile", tilesetId: "terrain", tileId: 1, pixels: ["#ff0000ff", "#00ff00ff", "#0000ffff", "#ffffffff"]},
      {type: "add_layer", name: "Map", kind: "tilemap", tilesetId: "terrain"},
      {type: "set_tile_cells", cells: [{x: 0, y: 0, value: 1}, {x: 1, y: 0, value: 1 | 0x80000000}]},
    ]);
    expect(command).toBeInstanceOf(DocumentStateCommand);
    const layer = document.layers.find((candidate) => candidate.name === "Map")!;
    expect(layer).toMatchObject({kind: "tilemap", tilesetId: "terrain"});
    expect(summarizeMCPDocument(document)).toMatchObject({
      tilesets: [{id: "terrain", tileWidth: 2, tileHeight: 2, tileCount: 1}],
    });
    expect(readMCPTileset(document, {tilesetId: "terrain"}).tiles[0].pixels).toEqual([
      "#ff0000ff", "#00ff00ff", "#0000ffff", "#ffffffff",
    ]);
    expect(readMCPTilemap(document, {layerId: layer.id})).toMatchObject({
      layerId: layer.id, tilesetId: "terrain", columns: 2, rows: 1, tiles: [1, 0x80000001],
    });

    applyMCPEdits(document, [{type: "delete_tile", tilesetId: "terrain", tileId: 1}]);
    expect(readMCPTilemap(document, {layerId: layer.id}).tiles).toEqual([0, 0]);
  });

  it("reports an effective per-map hex offset through document and tilemap reads", () => {
    const document = createDocument({width: 8, height: 8});
    const tileset = createTileset({
      tileWidth: 2,
      tileHeight: 2,
      grid: {kind: "hexagonal", orientation: "pointy", offset: "odd-r"},
      tiles: [{id: 1, pixels: new Uint8ClampedArray(16).fill(255)}],
    });
    document.tilesets = [tileset];
    Object.assign(document.layers[0], {kind: "tilemap", tilesetId: tileset.id});
    const cel = getActiveCel(document);
    cel.tilemap = {...createTilemapData(2, 3), gridOffset: "even-r"};
    cel.tilemap.tiles.fill(1);
    Object.assign(cel, tilemapPixelSize(tileset, cel.tilemap));
    cel.pixels = renderTilemapCel(cel, tileset);

    expect(summarizeMCPDocument(document).cels[0].tilemap).toEqual({
      columns: 2, rows: 3, gridOffset: "even-r",
    });
    expect(readMCPTilemap(document)).toMatchObject({columns: 2, rows: 3, gridOffset: "even-r"});
  });

  it("reads composited pixels as row-major RGBA hex", () => {
    const document = createDocument({width: 2, height: 2});
    setPixel(getActiveCel(document).pixels, 2, 2, 1, 0, [18, 52, 86, 64]);

    expect(readMCPPixels(document, {x: 0, y: 0, width: 2, height: 2})).toEqual([
      "#00000000", "#12345640",
      "#00000000", "#00000000",
    ]);
  });

  it("reads a layer using document coordinates when its Cel has an offset", () => {
    const document = createDocument({width: 4, height: 3});
    const cel = getActiveCel(document);
    cel.x = 1;
    cel.y = 1;
    cel.width = 2;
    cel.height = 1;
    cel.pixels = new Uint8ClampedArray(2 * 1 * 4);
    setPixel(cel.pixels, cel.width, cel.height, 0, 0, [255, 0, 0, 255]);
    setPixel(cel.pixels, cel.width, cel.height, 1, 0, [0, 255, 0, 128]);

    expect(readMCPPixels(document, {
      layerId: document.activeLayerId,
      x: 0,
      y: 0,
      width: 4,
      height: 3,
    })).toEqual([
      "#00000000", "#00000000", "#00000000", "#00000000",
      "#00000000", "#ff0000ff", "#00ff0080", "#00000000",
      "#00000000", "#00000000", "#00000000", "#00000000",
    ]);
  });

  it("rejects reads larger than the MCP pixel limit", () => {
    const document = createDocument({width: 2048, height: 2048});
    expect(() => readMCPPixels(document)).toThrow(/16384/);
  });

  it("reads and strictly validates orthogonal, isometric, and hexagonal grids", () => {
    const grids = [
      {kind: "orthogonal" as const},
      {kind: "isometric" as const, cellWidth: 1, cellHeight: 1, anchorX: 0, anchorY: 1},
      {kind: "hexagonal" as const, orientation: "pointy" as const, offset: "odd-r" as const},
      {kind: "hexagonal" as const, orientation: "pointy" as const, offset: "even-r" as const},
      {kind: "hexagonal" as const, orientation: "flat" as const, offset: "odd-q" as const},
      {kind: "hexagonal" as const, orientation: "flat" as const, offset: "even-q" as const},
    ];

    for (const [index, grid] of grids.entries()) {
      const document = createDocument({width: 2, height: 2});
      applyMCPEdits(document, [{
        type: "add_tileset",
        tilesetId: `grid-${index}`,
        name: "Grid",
        tileWidth: 1,
        tileHeight: 1,
        grid,
      }]);
      expect(summarizeMCPDocument(document).tilesets[0]).toMatchObject({grid, terrains: []});
      expect(readMCPTileset(document, {tilesetId: `grid-${index}`})).toMatchObject({grid, terrains: []});
    }

    const invalidGrids = [
      {kind: "isometric", cellWidth: 1, cellHeight: 1, anchorX: 2, anchorY: 1},
      {kind: "hexagonal", orientation: "pointy", offset: "odd-q"},
      {kind: "hexagonal", orientation: "flat", offset: "even-r"},
      {kind: "hexagonal", orientation: "pointy", offset: "diagonal"},
    ];
    for (const [index, grid] of invalidGrids.entries()) {
      const document = createDocument({width: 1, height: 1});
      expect(() => applyMCPEdits(document, [{
        type: "add_tileset",
        tilesetId: `invalid-${index}`,
        name: "Invalid",
        tileWidth: 1,
        tileHeight: 1,
        grid,
      }])).toThrow(/grid|offset/);
      expect(document.tilesets).toHaveLength(0);
    }
  });

  it("reads terrainmap seed and row-major terrain cells", () => {
    const document = createDocument({width: 2, height: 2});
    applyMCPEdits(document, [
      {type: "add_tileset", tilesetId: "terrain", name: "Terrain", tileWidth: 1, tileHeight: 1},
      {type: "add_tile", tilesetId: "terrain", tileId: 1, pixels: ["#ff0000ff"]},
      {type: "add_layer", name: "Map", kind: "tilemap", tilesetId: "terrain"},
    ]);
    const layerId = document.activeLayerId;
    applyMCPEdits(document, [{
      type: "add_terrain",
      tilesetId: "terrain",
      terrain: {
        id: 1,
        name: "Grass",
        color: "#00ff00",
        neighborMode: "edge4",
        boundary: "empty",
        rules: [{mask: 0, candidates: [{tileId: 1, flags: 0, weight: 1}]}],
      },
    }]);
    applyMCPEdits(document, [{type: "set_terrainmap", layerId, cells: [1, 1, 65535, 0], seed: 42}]);

    expect(readMCPTileset(document, {tilesetId: "terrain"}).terrains).toEqual([{
      id: 1,
      name: "Grass",
      color: "#00ff00",
      neighborMode: "edge4",
      boundary: "empty",
      rules: [{mask: 0, candidates: [{tileId: 1, flags: 0, weight: 1}]}],
    }]);
    expect(readMCPTilemap(document, {layerId})).toMatchObject({
      columns: 2,
      rows: 2,
      tiles: [1, 1, 0, 0],
      terrainmap: {seed: 42, terrains: [1, 1, 65535, 0]},
    });
    expect(readMCPPixels(document, {x: 0, y: 0, width: 2, height: 2})).toEqual([
      "#ff0000ff", "#ff0000ff",
      "#00000000", "#00000000",
    ]);
  });
});

describe("MCP edits", () => {
  it("rejects Terrain-managed tile writes by default and detaches the linked group only when requested", () => {
    const {document, layerId, firstFrameId, secondFrameId} = createTerrainTilemapFixture();
    const firstKey = celKey(layerId, firstFrameId);
    const secondKey = celKey(layerId, secondFrameId);
    const before = cloneDocument(document);

    expect(() => applyMCPEdits(document, [{
      type: "set_tile_cells",
      layerId,
      frameId: firstFrameId,
      cells: [{x: 0, y: 0, value: 2}],
    }])).toThrow(/detachTerrain/);
    expect(document).toEqual(before);
    expect(() => decodeProject(encodeProject(document))).not.toThrow();

    expect(() => applyMCPEdits(document, [{
      type: "set_tile_cells",
      layerId,
      frameId: firstFrameId,
      detachTerrain: "yes" as unknown as boolean,
      cells: [{x: 0, y: 0, value: 2}],
    }])).toThrow(/detachTerrain.*boolean/);
    expect(document).toEqual(before);

    expect(() => applyMCPEdits(document, [
      {
        type: "set_tile_cells",
        layerId,
        frameId: firstFrameId,
        detachTerrain: true,
        cells: [{x: 0, y: 0, value: 2}],
      },
      {
        type: "set_tile_cells",
        layerId,
        frameId: firstFrameId,
        detachTerrain: true,
        cells: [{x: 1, y: 0, value: 99}],
      },
    ])).toThrow(/does not exist in tileset/);
    expect(document).toEqual(before);

    const command = applyMCPEdits(document, [{
      type: "set_tile_cells",
      layerId,
      frameId: firstFrameId,
      detachTerrain: true,
      cells: [{x: 0, y: 0, value: 2}],
    }]);
    expect(command).toBeInstanceOf(DocumentStateCommand);
    expect(document.cels[firstKey]?.terrainmap).toBeUndefined();
    expect(document.cels[secondKey]?.terrainmap).toBeUndefined();
    expect([...document.cels[firstKey].tilemap!.tiles]).toEqual([2, 1]);
    expect(() => decodeProject(encodeProject(document))).not.toThrow();

    command!.undo(document);
    expect(document.cels[firstKey]?.terrainmap).toBeDefined();
    expect(document.cels[secondKey]?.terrainmap).toEqual(document.cels[firstKey]?.terrainmap);
    expect(document.cels[secondKey]?.linkId).toBe(document.cels[firstKey]?.linkId);
    expect([...document.cels[firstKey].tilemap!.tiles]).toEqual([1, 1]);
    expect(() => decodeProject(encodeProject(document))).not.toThrow();

    command!.redo(document);
    expect(document.cels[firstKey]?.terrainmap).toBeUndefined();
    expect(document.cels[secondKey]?.terrainmap).toBeUndefined();
    expect([...document.cels[firstKey].tilemap!.tiles]).toEqual([2, 1]);
    expect(() => decodeProject(encodeProject(document))).not.toThrow();
  });

  it("does not detach Terrain for a tile no-op, including a duplicate write that ends at the original value", () => {
    const {document, layerId, firstFrameId, secondFrameId} = createTerrainTilemapFixture();
    const first = document.cels[celKey(layerId, firstFrameId)];
    const second = document.cels[celKey(layerId, secondFrameId)];
    const terrainmap = first.terrainmap;

    expect(applyMCPEdits(document, [{
      type: "set_tile_cells",
      layerId,
      frameId: firstFrameId,
      detachTerrain: true,
      cells: [
        {x: 0, y: 0, value: 2},
        {x: 0, y: 0, value: 1},
      ],
    }])).toBeNull();
    expect(first.terrainmap).toBe(terrainmap);
    expect(second.terrainmap).toBe(terrainmap);
    expect([...first.tilemap!.tiles]).toEqual([1, 1]);
  });

  it("exposes and edits the v5 layer, sparse cel, indexed, tag, slice, guide and settings model", () => {
    const document = createDocument({width: 4, height: 3, colorMode: "indexed"});
    const firstFrameId = document.activeFrameId;
    const secondFrame = addFrame(document);
    const layerId = document.activeLayerId;
    const command = applyMCPEdits(document, [
      {type: "set_indexes", layerId, frameId: secondFrame.id, pixels: [{x: 1, y: 1, index: 2}]},
      {type: "update_layer", layerId, role: "reference", continuous: true, alphaLock: true, blendMode: "soft-light"},
      {type: "update_settings", tiledX: true, onionNextFrames: 3, onionOpacity: 0.5},
      {type: "add_tag", name: "intro", fromFrameId: firstFrameId, toFrameId: secondFrame.id, repeat: 2},
      {type: "add_slice", name: "hero", x: 0, y: 0, width: 2, height: 2, pivot: {x: 1, y: 1}},
      {type: "add_guide", axis: "vertical", position: 2},
    ]);
    expect(command).toBeInstanceOf(DocumentStateCommand);
    expect(document.cels[celKey(layerId, secondFrame.id)]).toBeDefined();
    expect(readMCPIndexes(document, {layerId, frameId: secondFrame.id, x: 0, y: 0, width: 2, height: 2})).toEqual([0, 0, 0, 2]);
    const summary = summarizeMCPDocument(document);
    expect(summary.formatVersion).toBe(5);
    expect(summary.layers[0]).toMatchObject({role: "reference", continuous: true, alphaLock: true, blendMode: "soft-light"});
    expect(summary.tags[0].repeat).toBe(2);
    expect(summary.slices[0].name).toBe("hero");
    expect(summary.guides[0]).toMatchObject({axis: "vertical", position: 2});
    expect(summary.settings).toMatchObject({tiledX: true, onionNextFrames: 3, onionOpacity: 0.5});
    command?.undo(document);
    expect(document.slices).toHaveLength(0);
    command?.redo(document);
    expect(document.slices).toHaveLength(1);
    applyMCPEdits(document, [{type: "update_layer", layerId, role: "standard", alphaLock: false}]);
    const indexCommand = applyMCPEdits(document, [{type: "set_indexes", layerId, frameId: secondFrame.id, pixels: [{x: 0, y: 0, index: 3}]}]);
    expect(readMCPIndexes(document, {layerId, frameId: secondFrame.id, x: 0, y: 0, width: 1, height: 1})).toEqual([3]);
    indexCommand?.undo(document);
    expect(readMCPIndexes(document, {layerId, frameId: secondFrame.id, x: 0, y: 0, width: 1, height: 1})).toEqual([0]);
    indexCommand?.redo(document);
    expect(readMCPIndexes(document, {layerId, frameId: secondFrame.id, x: 0, y: 0, width: 1, height: 1})).toEqual([3]);
  });

  it("applies RGBA edits and returns a PixelEditCommand for one buffer", () => {
    const document = createDocument({width: 3, height: 2});
    const command = applyMCPEdits(document, [{
      type: "set_pixels",
      pixels: [
        {x: 1, y: 0, color: "#12345640"},
        {x: 2, y: 1, color: "#abcdef"},
      ],
    }]);

    expect(command).toBeInstanceOf(PixelEditCommand);
    expect(pixelAt(document, document.activeLayerId, document.activeFrameId, 1, 0)).toEqual([18, 52, 86, 64]);
    expect(pixelAt(document, document.activeLayerId, document.activeFrameId, 2, 1)).toEqual([171, 205, 239, 255]);

    command?.undo(document);
    expect(pixelAt(document, document.activeLayerId, document.activeFrameId, 1, 0)).toEqual([0, 0, 0, 0]);
    command?.redo(document);
    expect(pixelAt(document, document.activeLayerId, document.activeFrameId, 1, 0)).toEqual([18, 52, 86, 64]);
  });

  it("constrains set pixels using the document color mode", () => {
    const document = createDocument({width: 1, height: 1, colorMode: "grayscale"});
    applyMCPEdits(document, [{type: "set_pixels", pixels: [{x: 0, y: 0, color: "#ff000080"}]}]);
    expect(pixelAt(document, document.activeLayerId, document.activeFrameId, 0, 0)).toEqual([76, 76, 76, 128]);
  });

  it("returns null for a pixel batch whose final bytes are unchanged", () => {
    const document = createDocument({width: 1, height: 1});
    const command = applyMCPEdits(document, [{
      type: "set_pixels",
      pixels: [
        {x: 0, y: 0, color: "#ff0000ff"},
        {x: 0, y: 0, color: "#00000000"},
      ],
    }]);
    expect(command).toBeNull();
    expect(pixelAt(document, document.activeLayerId, document.activeFrameId, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it("applies per-Cel opacity and z-index and supports undo/redo", () => {
    const document = createDocument({width: 1, height: 1});
    const layerId = document.activeLayerId;
    const frameId = document.activeFrameId;
    const command = applyMCPEdits(document, [{
      type: "set_cel_properties",
      layerId,
      frameId,
      opacity: 0.4,
      zIndex: -12,
    }]);
    const cel = document.cels[celKey(layerId, frameId)];

    expect(command).toBeInstanceOf(DocumentStateCommand);
    expect(cel).toMatchObject({opacity: 0.4, zIndex: -12});
    expect(summarizeMCPDocument(document).cels[0]).toMatchObject({opacity: 0.4, zIndex: -12});

    command?.undo(document);
    expect(document.cels[celKey(layerId, frameId)]).toMatchObject({opacity: 1, zIndex: 0});
    command?.redo(document);
    expect(document.cels[celKey(layerId, frameId)]).toMatchObject({opacity: 0.4, zIndex: -12});
  });

  it("keeps linked Cel properties independent", () => {
    const document = createDocument({width: 1, height: 1});
    const firstFrameId = document.activeFrameId;
    const secondFrame = addFrame(document);
    const layerId = document.activeLayerId;
    ensureCel(document, layerId, secondFrame.id);
    expect(linkCels(document, layerId, [firstFrameId, secondFrame.id], firstFrameId)).toBe(true);

    const command = applyMCPEdits(document, [{
      type: "set_cel_properties",
      layerId,
      frameId: secondFrame.id,
      opacity: 0.25,
      zIndex: 7,
    }]);
    const firstCel = document.cels[celKey(layerId, firstFrameId)];
    const secondCel = document.cels[celKey(layerId, secondFrame.id)];

    expect(command).toBeInstanceOf(DocumentStateCommand);
    expect(firstCel.linkId).toBe(secondCel.linkId);
    expect(firstCel.pixels).toBe(secondCel.pixels);
    expect(firstCel).toMatchObject({opacity: 1, zIndex: 0});
    expect(secondCel).toMatchObject({opacity: 0.25, zIndex: 7});
  });

  it("rejects invalid Cel property batches before changing the document", () => {
    const document = createDocument({name: "before.pixio", width: 1, height: 1});
    const before = cloneDocument(document);
    const target = {layerId: document.activeLayerId, frameId: document.activeFrameId};

    for (const operation of [
      {type: "set_cel_properties", ...target},
      {type: "set_cel_properties", ...target, opacity: -0.01},
      {type: "set_cel_properties", ...target, opacity: Number.NaN},
      {type: "set_cel_properties", ...target, zIndex: 32768},
      {type: "set_cel_properties", ...target, zIndex: 1.5},
    ]) {
      expect(() => applyMCPEdits(document, [
        {type: "rename_document", name: "after.pixio"},
        operation,
      ])).toThrow();
      expect(document.name).toBe(before.name);
      expect(document.cels[celKey(target.layerId, target.frameId)]).toMatchObject({opacity: 1, zIndex: 0});
    }
  });

  it("updates linked Cels through one pixel edit and restores both on undo", () => {
    const document = createDocument({width: 1, height: 1});
    const firstFrameId = document.activeFrameId;
    const secondFrame = addFrame(document);
    const layerId = document.activeLayerId;
    // v5 permits sparse Cels; materialize the target before linking it.
    ensureCel(document, layerId, secondFrame.id);
    expect(linkCels(document, layerId, [firstFrameId, secondFrame.id], firstFrameId)).toBe(true);

    const command = applyMCPEdits(document, [{
      type: "set_pixels",
      frameId: secondFrame.id,
      pixels: [{x: 0, y: 0, color: "#ff0000ff"}],
    }]);
    expect(pixelAt(document, layerId, firstFrameId, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(document, layerId, secondFrame.id, 0, 0)).toEqual([255, 0, 0, 255]);

    command?.undo(document);
    expect(pixelAt(document, layerId, firstFrameId, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(document, layerId, secondFrame.id, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it("rejects locked pixel edits without applying any earlier operation", () => {
    const document = createDocument({name: "before.pixio", width: 1, height: 1});
    document.layers[0].locked = true;
    const before = cloneDocument(document);

    expect(() => applyMCPEdits(document, [
      {type: "rename_document", name: "after.pixio"},
      {type: "set_pixels", pixels: [{x: 0, y: 0, color: "#ff0000ff"}]},
    ])).toThrow(/locked/);
    expect(document.name).toBe(before.name);
    expect(Array.from(getActiveCel(document).pixels)).toEqual(Array.from(getActiveCel(before).pixels));
  });

  it("rolls back a batch when a later structural reference is invalid", () => {
    const document = createDocument({name: "before.pixio", width: 2, height: 1});
    const before = cloneDocument(document);

    expect(() => applyMCPEdits(document, [
      {type: "rename_document", name: "after.pixio"},
      {type: "delete_frame", frameId: "missing-frame"},
    ])).toThrow(/missing-frame/);
    expect(document).toMatchObject({name: before.name, activeLayerId: before.activeLayerId, activeFrameId: before.activeFrameId});
    expect(document.layers).toEqual(before.layers);
  });

  it("batches structural operations into one state command and supports undo/redo", () => {
    const document = createDocument({width: 2, height: 1});
    const originalLayerId = document.activeLayerId;
    const command = applyMCPEdits(document, [
      {type: "add_layer", name: "Highlights"},
      {type: "add_frame", durationMs: 240},
      {type: "set_palette", colors: ["#11223344"]},
      {type: "rename_document", name: "edited.pixio"},
    ]);

    expect(command).toBeInstanceOf(DocumentStateCommand);
    expect(document.layers).toHaveLength(2);
    expect(document.frames).toHaveLength(2);
    expect(document.palette.colors).toEqual(["#11223344"]);
    expect(document.name).toBe("edited.pixio");

    command?.undo(document);
    expect(document.layers.map((layer) => layer.id)).toEqual([originalLayerId]);
    expect(document.frames).toHaveLength(1);
    expect(document.palette.colors).not.toEqual(["#11223344"]);
    expect(document.name).toBe("untitled.pixio");

    command?.redo(document);
    expect(document.layers).toHaveLength(2);
    expect(document.frames).toHaveLength(2);
    expect(document.name).toBe("edited.pixio");
  });

  it("validates batch and pixel bounds before touching the document", () => {
    const document = createDocument({width: 1, height: 1});
    const before = cloneDocument(document);
    const tooMany = Array.from({length: 257}, () => ({type: "rename_document", name: "same.pixio"}));

    expect(() => applyMCPEdits(document, tooMany)).toThrow(/256/);
    expect(() => applyMCPEdits(document, [{
      type: "set_pixels",
      pixels: [{x: 1, y: 0, color: "#ffffff"}],
    }])).toThrow(/outside the document/);
    expect(document).toMatchObject({name: before.name, width: before.width, height: before.height});
  });

  it("adds, updates, and deletes terrains while rebuilding tilemap caches", () => {
    const document = createDocument({width: 2, height: 2});
    applyMCPEdits(document, [
      {type: "add_tileset", tilesetId: "terrain", name: "Terrain", tileWidth: 1, tileHeight: 1},
      {type: "add_tile", tilesetId: "terrain", tileId: 1, pixels: ["#ff0000ff"]},
      {type: "add_tile", tilesetId: "terrain", tileId: 2, pixels: ["#0000ffff"]},
      {type: "add_layer", name: "Map", kind: "tilemap", tilesetId: "terrain"},
    ]);
    const layerId = document.activeLayerId;
    const terrain = {
      id: 1,
      name: "Grass",
      color: "#00ff00",
      neighborMode: "edge4" as const,
      boundary: "empty" as const,
      rules: [{mask: 0, candidates: [{tileId: 1, flags: 0, weight: 1}]}],
    };

    const addCommand = applyMCPEdits(document, [{type: "add_terrain", tilesetId: "terrain", terrain}]);
    expect(addCommand).toBeInstanceOf(DocumentStateCommand);
    applyMCPEdits(document, [{type: "set_terrainmap", layerId, cells: [1, 1, 0, 0], seed: 9}]);
    expect(readMCPTilemap(document, {layerId}).tiles).toEqual([1, 1, 0, 0]);

    const updateCommand = applyMCPEdits(document, [{
      type: "update_terrain",
      tilesetId: "terrain",
      terrainId: 1,
      rules: [{mask: 0, candidates: [{tileId: 2, flags: 0, weight: 1}]}],
    }]);
    expect(updateCommand).toBeInstanceOf(DocumentStateCommand);
    expect(readMCPTilemap(document, {layerId}).tiles).toEqual([2, 2, 0, 0]);
    updateCommand?.undo(document);
    expect(readMCPTilemap(document, {layerId}).tiles).toEqual([1, 1, 0, 0]);
    updateCommand?.redo(document);
    expect(readMCPTilemap(document, {layerId}).tiles).toEqual([2, 2, 0, 0]);

    expect(() => applyMCPEdits(document, [{type: "delete_terrain", tilesetId: "terrain", terrainId: 1}])).toThrow(/terrainmap/);
    applyMCPEdits(document, [{type: "set_terrainmap", layerId, cells: [0, 0, 0, 0]}]);
    expect(applyMCPEdits(document, [{type: "delete_terrain", tilesetId: "terrain", terrainId: 1}])).toBeInstanceOf(DocumentStateCommand);
    expect(readMCPTileset(document, {tilesetId: "terrain"}).terrains).toEqual([]);
  });

  it("rejects invalid terrain rules, tile references, and terrainmap writes atomically", () => {
    const document = createDocument({name: "before.pixio", width: 2, height: 1});
    applyMCPEdits(document, [
      {type: "add_tileset", tilesetId: "terrain", name: "Terrain", tileWidth: 1, tileHeight: 1},
      {type: "add_tile", tilesetId: "terrain", tileId: 1, pixels: ["#ff0000ff"]},
      {type: "add_layer", name: "Map", kind: "tilemap", tilesetId: "terrain"},
    ]);
    const layerId = document.activeLayerId;
    const validTerrain = {
      id: 1,
      name: "Grass",
      color: "#00ff00",
      neighborMode: "edge4" as const,
      boundary: "empty" as const,
      rules: [{mask: 0, candidates: [{tileId: 1, flags: 0, weight: 1}]}],
    };

    expect(() => applyMCPEdits(document, [{
      type: "add_terrain",
      tilesetId: "terrain",
      terrain: {...validTerrain, rules: [{mask: 0, candidates: [{tileId: 99, flags: 0, weight: 1}]}]},
    }])).toThrow(/tile 99/);
    expect(() => applyMCPEdits(document, [{
      type: "add_terrain",
      tilesetId: "terrain",
      terrain: {...validTerrain, neighborMode: "edge6"},
    }])).toThrow(/edge6/);
    applyMCPEdits(document, [{type: "add_terrain", tilesetId: "terrain", terrain: validTerrain}]);

    const before = cloneDocument(document);
    expect(() => applyMCPEdits(document, [
      {type: "rename_document", name: "after.pixio"},
      {type: "set_terrainmap", layerId, cells: [1]},
    ])).toThrow(/exactly 2/);
    expect(document.name).toBe(before.name);
    expect(document.cels[celKey(layerId, document.activeFrameId)]?.terrainmap).toBeUndefined();

    expect(() => applyMCPEdits(document, [{type: "set_terrainmap", layerId, cells: [1, 2]}])).toThrow(/unknown terrain 2/);
    expect(document.cels[celKey(layerId, document.activeFrameId)]?.terrainmap).toBeUndefined();
  });
});

import {describe, expect, it} from "vitest";
import {addFrame, addFrameTag, createDocument, ensureCel, getActiveCel, getCel, linkCels} from "./document";
import {decodeProject, encodeProject} from "./serialization";
import {convertImageLayerToTilemap, createTilemapData, createTileset, renderTilemapCel} from "./tilemap";
import {createTerrainMapData, recalculateTerrainCells, terrainEmpty, terrainRuleMasks} from "./terrain";
import {tilemapPixelSize, tilesetGridLayout} from "./tilemapGeometry";

describe("project bridge serialization", () => {
  it("round trips a complete 47-rule Blob and rejects unsupported corners or stale cache values", () => {
    const document = createDocument({width: 3, height: 3});
    const masks = terrainRuleMasks("blob8");
    const tileset = createTileset({tileWidth: 1, tileHeight: 1,
      tiles: masks.map((mask) => ({id: mask + 1, pixels: new Uint8ClampedArray([mask, 0, 0, 255])})),
    });
    tileset.terrains = [{
      id: 1, name: "Blob", color: "#ffffffff", neighborMode: "blob8", boundary: "empty",
      rules: masks.map((mask) => ({mask, candidates: [{tileId: mask + 1, flags: 0, weight: 1}]})),
    }];
    document.tilesets = [tileset];
    Object.assign(document.layers[0], {kind: "tilemap", tilesetId: tileset.id});
    const cel = getActiveCel(document);
    cel.tilemap = createTilemapData(3, 3);
    cel.terrainmap = createTerrainMapData(3, 3, 23);
    cel.terrainmap.terrains.set([1, 0, 0, 0, 1, 1, 0, 0, terrainEmpty]);
    recalculateTerrainCells(cel.terrainmap, tileset.terrains, tilesetGridLayout(tileset), cel.tilemap.tiles,
      Array.from({length: 9}, (_, index) => ({column: index % 3, row: Math.floor(index / 3)})));
    expect(cel.tilemap.tiles[4]).toBe(5);
    cel.pixels = renderTilemapCel(cel, tileset);
    const encoded = encodeProject(document);
    expect(getActiveCel(decodeProject(encoded)).tilemap).toEqual(cel.tilemap);
    const invalid = JSON.parse(encoded);
    invalid.tilesets[0].terrains[0].rules[0].mask = 2;
    expect(() => decodeProject(JSON.stringify(invalid))).toThrow(/terrains/);
    cel.tilemap.tiles[4] = 1;
    expect(() => decodeProject(encodeProject(document))).toThrow();
  });

  it("round trips RGBA pixels as base64 across multiple cels", () => {
    const document = createDocument({width: 2, height: 1});
    document.layers[0].continuous = true;
    getActiveCel(document).pixels.set([255, 0, 0, 128, 0, 255, 0, 0]);
    addFrame(document);
    getActiveCel(document).pixels.set([1, 2, 3, 4, 5, 6, 7, 8]);

    const payload = encodeProject(document);
    const raw = JSON.parse(payload) as {formatVersion: number; cels: Array<{pixels: unknown}>};
    expect(raw.formatVersion).toBe(5);
    expect(raw.cels).toHaveLength(2);
    expect(raw.cels.every((cel) => typeof cel.pixels === "string")).toBe(true);

    const decoded = decodeProject(payload);
    expect(decoded.frames).toEqual(document.frames);
    expect(Object.keys(decoded.cels)).toEqual(Object.keys(document.cels));
    for (const key of Object.keys(document.cels)) {
      expect(Array.from(decoded.cels[key].pixels)).toEqual(Array.from(document.cels[key].pixels));
    }
  });

  it("round trips palette colors with alpha", () => {
    const document = createDocument({width: 1, height: 1, palette: ["#ef476f80"]});
    const decoded = decodeProject(encodeProject(document));
    expect(decoded.palette.colors).toEqual(["#ef476f80"]);
  });

  it("strictly validates indexed Cel and Tileset RGBA caches against authoritative indexes", () => {
    const document = createDocument({
      width: 1,
      height: 1,
      colorMode: "indexed",
      palette: ["#00000000", "#ff0000ff"],
    });
    const cel = getActiveCel(document);
    cel.indexes![0] = 1;
    cel.pixels.set([255, 0, 0, 255]);
    const converted = convertImageLayerToTilemap(document, document.activeLayerId, {tileWidth: 1, tileHeight: 1});
    document.layers[0] = converted.layer;
    document.tilesets = [converted.tileset];
    document.cels = {[`${converted.layer.id}:${document.activeFrameId}`]: converted.cels[0]};
    expect(() => decodeProject(encodeProject(document))).not.toThrow();

    const corruptCel = JSON.parse(encodeProject(document));
    corruptCel.cels[0].pixels = bytesToBase64(new Uint8ClampedArray([0, 0, 0, 0]));
    expect(() => decodeProject(JSON.stringify(corruptCel))).toThrow("indexed cel cache");

    const corruptTile = JSON.parse(encodeProject(document));
    corruptTile.tilesets[0].tiles[0].pixels = bytesToBase64(new Uint8ClampedArray([0, 0, 0, 0]));
    expect(() => decodeProject(JSON.stringify(corruptTile))).toThrow("indexed tile cache");

    const unknownPaletteIndex = JSON.parse(encodeProject(document));
    unknownPaletteIndex.cels[0].indexes = bytesToBase64(new Uint8ClampedArray([2]));
    expect(() => decodeProject(JSON.stringify(unknownPaletteIndex))).toThrow("unknown palette color");
  });

  it("round-trips blank indexed documents with opaque RGB in the transparent palette slot", () => {
    const document = createDocument({width: 2, height: 2, colorMode: "indexed"});
    expect(decodeProject(encodeProject(document)).palette).toEqual(document.palette);
    getActiveCel(document).pixels[3] = 255;
    expect(() => decodeProject(encodeProject(document))).toThrow("indexed cel cache");
  });

  it("rejects cel buffers that do not match their dimensions", () => {
    const document = createDocument({width: 1, height: 1});
    const payload = JSON.parse(encodeProject(document)) as {cels: Array<{pixels: string}>};
    payload.cels[0].pixels = btoa("short");
    expect(() => decodeProject(JSON.stringify(payload))).toThrow("Project cel dimensions are invalid");
  });

  it("uses stable errors for malformed project JSON", () => {
    expect(() => decodeProject("not-json")).toThrow("Project JSON is invalid");
    expect(() => decodeProject("null")).toThrow("Unsupported .pixio format version");
  });

  it("round trips frame tags and restores shared linked cel buffers", () => {
    const document = createDocument({width: 1, height: 1});
    const first = document.frames[0];
    const second = addFrame(document);
    ensureCel(document, document.layers[0].id, second.id);
    getCel(document, document.layers[0].id, first.id)!.pixels.set([9, 8, 7, 255]);
    expect(linkCels(document, document.layers[0].id, [first.id, second.id], first.id)).toBe(true);
    const tag = addFrameTag(document, "Loop", first.id, second.id, "reverse", "#abcdef");

    const decoded = decodeProject(encodeProject(document));
    expect(decoded.tags).toEqual([tag]);
    const firstCel = decoded.cels[`${document.layers[0].id}:${first.id}`];
    const secondCel = decoded.cels[`${document.layers[0].id}:${second.id}`];
    expect(secondCel.linkId).toBe(firstCel.linkId);
    expect(secondCel.pixels).toBe(firstCel.pixels);
    expect(Array.from(secondCel.pixels)).toEqual([9, 8, 7, 255]);
  });

  it("round trips partial and offset v5 cels", () => {
    const document = createDocument({width: 4, height: 3});
    const firstCel = getActiveCel(document);
    firstCel.x = -2;
    firstCel.y = 1;
    firstCel.width = 2;
    firstCel.height = 2;
    firstCel.pixels = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 255, 255,
    ]);

    const decoded = decodeProject(encodeProject(document));
    const cel = getActiveCel(decoded);
    expect({x: cel.x, y: cel.y, width: cel.width, height: cel.height}).toEqual({x: -2, y: 1, width: 2, height: 2});
    expect([...cel.pixels]).toEqual([...firstCel.pixels]);
  });

  it.each([
    ["width", 0],
    ["height", 3],
    ["width", 1.5],
    ["width", 1],
    ["height", 1],
  ] as const)("rejects cel dimensions that do not match the canvas: %s=%s", (field, value) => {
    const document = createDocument({width: 2, height: 2});
    const payload = JSON.parse(encodeProject(document)) as {cels: Array<{width: number; height: number}>};
    payload.cels[0][field] = value;

    expect(() => decodeProject(JSON.stringify(payload))).toThrow("Project cel dimensions are invalid");
  });

  it.each([["x", 3], ["y", -3], ["x", 1], ["y", -1]] as const)("accepts integer cel offsets: %s=%s", (field, value) => {
    const document = createDocument({width: 2, height: 2});
    const payload = JSON.parse(encodeProject(document)) as {cels: Array<{x: number; y: number}>};
    payload.cels[0][field] = value;
    expect(decodeProject(JSON.stringify(payload)).cels[`${document.activeLayerId}:${document.activeFrameId}`][field]).toBe(value);
  });

  it("rejects fractional cel offsets", () => {
    const document = createDocument({width: 2, height: 2});
    const payload = JSON.parse(encodeProject(document)) as {cels: Array<{x: number; y: number}>};
    payload.cels[0].x = 1.5;
    expect(() => decodeProject(JSON.stringify(payload))).toThrow("Project cel pixels are invalid");
  });

  it("rejects linked cels whose dimensions and pixels do not match", () => {
    const document = createDocument({width: 2, height: 2});
    document.layers[0].continuous = true;
    addFrame(document);
    const payload = JSON.parse(encodeProject(document)) as {
      cels: Array<{linkId: string; width: number; height: number; pixels: string}>;
    };
    payload.cels[1].linkId = payload.cels[0].linkId;
    payload.cels[1].width = 1;
    payload.cels[1].pixels = bytesToBase64(new Uint8ClampedArray(1 * 2 * 4));

    expect(() => decodeProject(JSON.stringify(payload))).toThrow("Linked cel pixels do not match");
  });

  it("rejects linked cels with mismatched pixels", () => {
    const document = createDocument({width: 2, height: 2});
    document.layers[0].continuous = true;
    addFrame(document);
    const payload = JSON.parse(encodeProject(document)) as {
      cels: Array<{linkId: string; width: number; height: number; pixels: string}>;
    };
    payload.cels[1].linkId = payload.cels[0].linkId;
    payload.cels[1].pixels = bytesToBase64(new Uint8ClampedArray(2 * 2 * 4).fill(1));

    expect(() => decodeProject(JSON.stringify(payload))).toThrow("Linked cel pixels do not match");
  });

  it.each([".", "..", "../cel", "..\\cel", "cel..part"] as const)("rejects unsafe cel and link IDs: %s", (unsafeID) => {
    for (const field of ["id", "linkId"] as const) {
      const document = createDocument({width: 1, height: 1});
      const payload = JSON.parse(encodeProject(document)) as {cels: Array<{id: string; linkId: string}>};
      payload.cels[0][field] = unsafeID;

      expect(() => decodeProject(JSON.stringify(payload))).toThrow("Project cel pixels are invalid");
    }
  });

  it("rejects v1 payloads because only the current strict v5 format is supported", () => {
    const payload = JSON.parse(encodeProject(createDocument({width: 1, height: 1}))) as Record<string, unknown>;
    payload.formatVersion = 1;

    expect(() => decodeProject(JSON.stringify(payload))).toThrow("Unsupported .pixio format version");
  });

  it("uses a stable error for invalid cel Base64", () => {
    const document = createDocument({width: 1, height: 1});
    const payload = JSON.parse(encodeProject(document)) as {cels: Array<{pixels: string}>};
    payload.cels[0].pixels = "not-base64!";
    expect(() => decodeProject(JSON.stringify(payload))).toThrow("Project cel pixels are invalid");
  });

  it("round trips tilemaps, tilesets, embedded profiles, and pixel aspect ratio", () => {
    const document = createDocument({width: 2, height: 1});
    getActiveCel(document).pixels.set([255, 0, 0, 255, 0, 255, 0, 255]);
    document.colorProfile = {type: "embedded", name: "Test ICC", data: new Uint8Array([1, 2, 3, 4])};
    document.pixelAspectRatio = {width: 2, height: 1};
    const converted = convertImageLayerToTilemap(document, document.activeLayerId, {tileWidth: 1, tileHeight: 1});
    document.layers[0] = converted.layer;
    document.tilesets = [converted.tileset];
    for (const cel of converted.cels) document.cels[`${cel.layerId}:${cel.frameId}`] = cel;

    const decoded = decodeProject(encodeProject(document));
    expect(decoded.colorProfile).toMatchObject({type: "embedded", name: "Test ICC"});
    expect([...decoded.colorProfile.data!]).toEqual([1, 2, 3, 4]);
    expect(decoded.pixelAspectRatio).toEqual({width: 2, height: 1});
    expect(decoded.layers[0]).toMatchObject({kind: "tilemap", tilesetId: converted.tileset.id});
    expect(decoded.tilesets[0].grid).toEqual({kind: "orthogonal"});
    expect(decoded.tilesets[0].tiles).toHaveLength(2);
    expect([...getActiveCel(decoded).tilemap!.tiles]).toEqual([1, 2]);
    expect([...getActiveCel(decoded).pixels]).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  });

  it("strictly rejects missing color configuration and unknown tile references", () => {
    const document = createDocument({width: 1, height: 1});
    const missingProfile = JSON.parse(encodeProject(document)) as Record<string, unknown>;
    delete missingProfile.colorProfile;
    expect(() => decodeProject(JSON.stringify(missingProfile))).toThrow("Project color profile is invalid");

    const converted = convertImageLayerToTilemap(document, document.activeLayerId, {tileWidth: 1, tileHeight: 1});
    document.layers[0] = converted.layer;
    document.tilesets = [converted.tileset];
    for (const cel of converted.cels) document.cels[`${cel.layerId}:${cel.frameId}`] = cel;
    const payload = JSON.parse(encodeProject(document)) as {cels: Array<{tilemap: {tiles: string}}>};
    payload.cels[0].tilemap.tiles = bytesToBase64(new Uint8ClampedArray([99, 0, 0, 0]));
    expect(() => decodeProject(JSON.stringify(payload))).toThrow("Project tilemap references an unknown tile");
  });

  it("round trips strict v5 grid layouts, Terrain rules, and linked Terrain maps", () => {
    const document = createDocument({width: 2, height: 1});
    getActiveCel(document).pixels.set([255, 0, 0, 255, 0, 255, 0, 255]);
    const converted = convertImageLayerToTilemap(document, document.activeLayerId, {tileWidth: 1, tileHeight: 1});
    converted.tileset.grid = {kind: "hexagonal", orientation: "pointy", offset: "odd-r"};
    converted.tileset.terrains = [{
      id: 1,
      name: "Grass",
      color: "#00ff00ff",
      neighborMode: "edge6",
      boundary: "empty",
      rules: [{mask: 0, candidates: [{tileId: 1, flags: 0, weight: 1}]}],
    }];
    converted.cels[0].terrainmap = createTerrainMapData(2, 1, 42);
    converted.cels[0].terrainmap.terrains.set([1, terrainEmpty]);
    converted.cels[0].tilemap!.tiles.set([1, 0]);
    converted.cels[0].pixels = renderTilemapCel(converted.cels[0], converted.tileset);
    document.layers[0] = converted.layer;
    document.tilesets = [converted.tileset];
    document.cels = {[`${converted.layer.id}:${document.activeFrameId}`]: converted.cels[0]};

    const decoded = decodeProject(encodeProject(document));
    expect(decoded.formatVersion).toBe(5);
    expect(decoded.tilesets[0].grid).toEqual({kind: "hexagonal", orientation: "pointy", offset: "odd-r"});
    expect(decoded.tilesets[0].terrains).toEqual(converted.tileset.terrains);
    expect(decoded.cels[`${converted.layer.id}:${document.activeFrameId}`].terrainmap).toMatchObject({
      columns: 2,
      rows: 1,
      seed: 42,
    });
    expect([...decoded.cels[`${converted.layer.id}:${document.activeFrameId}`].terrainmap!.terrains]).toEqual([1, terrainEmpty]);

    const corruptTerrainCache = JSON.parse(encodeProject(document));
    corruptTerrainCache.cels[0].tilemap.tiles = bytesToBase64(new Uint8ClampedArray([1, 0, 0, 0, 2, 0, 0, 0]));
    expect(() => decodeProject(JSON.stringify(corruptTerrainCache))).toThrow("Project Terrain cache does not match");

    const corruptPixelCache = JSON.parse(encodeProject(document));
    corruptPixelCache.cels[0].pixels = bytesToBase64(new Uint8ClampedArray(8));
    expect(() => decodeProject(JSON.stringify(corruptPixelCache))).toThrow("Project tilemap cache does not match");
  });

  it("strictly rejects missing v5 grid/Terrain fields and unknown Terrain references", () => {
    const document = createDocument({width: 1, height: 1});
    const converted = convertImageLayerToTilemap(document, document.activeLayerId, {tileWidth: 1, tileHeight: 1});
    document.layers[0] = converted.layer;
    document.tilesets = [converted.tileset];
    document.cels = {[`${converted.layer.id}:${document.activeFrameId}`]: converted.cels[0]};

    const missingGrid = JSON.parse(encodeProject(document)) as {tilesets: Array<Record<string, unknown>>};
    delete missingGrid.tilesets[0].grid;
    expect(() => decodeProject(JSON.stringify(missingGrid))).toThrow("Project tilesets are invalid");

    const missingTerrains = JSON.parse(encodeProject(document)) as {tilesets: Array<Record<string, unknown>>};
    delete missingTerrains.tilesets[0].terrains;
    expect(() => decodeProject(JSON.stringify(missingTerrains))).toThrow("Project tilesets are invalid");

    const invalidAnchor = JSON.parse(encodeProject(document)) as {tilesets: Array<Record<string, unknown>>};
    invalidAnchor.tilesets[0].grid = {kind: "isometric", cellWidth: 1, cellHeight: 1, anchorX: 2, anchorY: 1};
    expect(() => decodeProject(JSON.stringify(invalidAnchor))).toThrow("Project tilesets are invalid");

    const extraHexField = JSON.parse(encodeProject(document)) as {tilesets: Array<Record<string, unknown>>};
    extraHexField.tilesets[0].grid = {kind: "hexagonal", orientation: "pointy", offset: "odd-r", anchorX: 0};
    expect(() => decodeProject(JSON.stringify(extraHexField))).toThrow("Project tilesets are invalid");

    converted.tileset.terrains = [{
      id: 1,
      name: "Terrain",
      color: "#ffffffff",
      neighborMode: "edge4",
      boundary: "empty",
      rules: [{mask: 0, candidates: [{tileId: 1, flags: 0, weight: 1}]}],
    }];
    converted.cels[0].terrainmap = createTerrainMapData(1, 1);
    converted.cels[0].terrainmap.terrains[0] = 2;
    expect(() => decodeProject(encodeProject(document))).toThrow("unknown terrain");
  });

  it("strictly round trips per-map hex offsets and rejects invalid or linked-mismatched overrides", () => {
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
    const size = tilemapPixelSize(tileset, cel.tilemap);
    Object.assign(cel, size);
    cel.pixels = renderTilemapCel(cel, tileset);

    const encoded = encodeProject(document);
    expect(getActiveCel(decodeProject(encoded)).tilemap).toEqual(cel.tilemap);
    const raw = JSON.parse(encoded);
    expect(raw.cels[0].tilemap.gridOffset).toBe("even-r");

    for (const invalid of ["", "odd-q", null, 1]) {
      const payload = JSON.parse(encoded);
      payload.cels[0].tilemap.gridOffset = invalid;
      expect(() => decodeProject(JSON.stringify(payload))).toThrow(/grid offset/);
    }
    const unknown = JSON.parse(encoded);
    unknown.cels[0].tilemap.offsetParity = "even-r";
    expect(() => decodeProject(JSON.stringify(unknown))).toThrow("Project tilemap data is invalid");

    const frame = addFrame(document);
    const alias = {...cel, id: "hex-offset-alias", frameId: frame.id,
      tilemap: {...cel.tilemap, gridOffset: "odd-r" as const, tiles: cel.tilemap.tiles.slice()}};
    document.cels[`${alias.layerId}:${frame.id}`] = alias;
    expect(() => decodeProject(encodeProject(document))).toThrow(/Linked cel/);
  });
});

function bytesToBase64(bytes: Uint8ClampedArray) {
  return btoa(String.fromCharCode(...bytes));
}

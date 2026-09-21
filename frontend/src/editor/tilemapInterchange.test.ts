import {describe, expect, it} from "vitest";

import {
  exportTilemapCsv,
  exportTilemapJson,
  importTilemapCsv,
  importTilemapJson,
  validateTilesetBundleReferences,
  type TilemapInterchangeInput,
} from "./tilemapInterchange";
import {cloneDocument, createDocument, getActiveCel, tileFlipDiagonal, tileFlipX, tileFlipY, type Cel, type Tileset, type TilemapData} from "./document";
import {createTerrainMapData, terrainEmpty, type TerrainDefinition} from "./terrain";
import {tilemapPixelSize} from "./tilemapGeometry";

const layouts = [
  {kind: "orthogonal" as const},
  {kind: "isometric" as const, cellWidth: 16, cellHeight: 8, anchorX: 8, anchorY: 16},
  {kind: "hexagonal" as const, orientation: "pointy" as const, offset: "odd-r" as const},
  {kind: "hexagonal" as const, orientation: "pointy" as const, offset: "even-r" as const},
  {kind: "hexagonal" as const, orientation: "flat" as const, offset: "odd-q" as const},
  {kind: "hexagonal" as const, orientation: "flat" as const, offset: "even-q" as const},
];

function terrainFor(layout: TilemapInterchangeInput["tileset"]["grid"]): TerrainDefinition {
  return {
    id: 1,
    name: "Grass",
    color: "#5cb85c",
    neighborMode: layout.kind === "hexagonal" ? "edge6" : "edge4",
    boundary: "empty",
    rules: [{mask: 0, candidates: [{tileId: 1, flags: 0, weight: 1}]}],
  };
}

function makeInput(grid: TilemapInterchangeInput["tileset"]["grid"], withTerrain = true): TilemapInterchangeInput {
  const tileset: Tileset = {
    id: "terrain-set",
    name: "Terrain Set",
    tileWidth: 16,
    tileHeight: 16,
    grid,
    terrains: withTerrain ? [terrainFor(grid)] : [],
    tiles: [
      {id: 1, pixels: new Uint8ClampedArray(16 * 16 * 4)},
      {id: 2, pixels: new Uint8ClampedArray(16 * 16 * 4)},
    ],
  };
  const tilemap: TilemapData = {
    columns: 2,
    rows: 2,
    tiles: new Uint32Array([
      1,
      (2 | tileFlipX) >>> 0,
      (1 | tileFlipY) >>> 0,
      (2 | tileFlipDiagonal) >>> 0,
    ]),
  };
  const size = tilemapPixelSize(tileset, tilemap);
  return {
    tileset,
    tilemap,
    terrainmap: withTerrain ? {columns: 2, rows: 2, seed: 73, terrains: new Uint16Array([1, terrainEmpty, 1, 0])} : undefined,
    cel: {x: -3, y: 4, width: size.width, height: size.height},
  };
}

describe("tilemap interchange JSON", () => {
  it("validates only bundle references surviving the replaced linked group", () => {
    const imported = importTilemapJson(exportTilemapJson(makeInput(layouts[0]))).tileset;
    const document = createDocument({width: 16, height: 16});
    Object.assign(document.layers[0], {kind: "tilemap", tilesetId: "target"});
    const source = getActiveCel(document);
    source.tilemap = {columns: 1, rows: 1, tiles: new Uint32Array([999])};
    source.terrainmap = createTerrainMapData(1, 1, 0);
    source.terrainmap.terrains[0] = 999;
    document.cels.alias = {...source, id: "alias", frameId: "other-frame"};
    const other: Cel = {...source, id: "independent", linkId: "independent-link",
      tilemap: {columns: 1, rows: 1, tiles: new Uint32Array([1])},
      terrainmap: createTerrainMapData(1, 1, 0)};
    other.terrainmap!.terrains[0] = terrainEmpty;
    document.cels.other = other;
    expect(() => validateTilesetBundleReferences(document, "target", source.linkId, imported)).not.toThrow();
    expect(() => validateTilesetBundleReferences(document, "target", source.linkId, {...imported, tileIds: [2]})).not.toThrow();
    other.terrainmap = undefined;
    const before = cloneDocument(document);
    expect(() => validateTilesetBundleReferences(document, "target", source.linkId, {...imported, tileIds: [2]})).toThrow(/Tile ID/);
    expect(document).toEqual(before);
    other.terrainmap = createTerrainMapData(1, 1, 0);
    other.terrainmap.terrains[0] = 42;
    expect(() => validateTilesetBundleReferences(document, "target", source.linkId, imported)).toThrow(/Terrain/);
    other.terrainmap = undefined;
    other.tilemap!.tiles[0] = (1 | tileFlipDiagonal) >>> 0;
    expect(() => validateTilesetBundleReferences(document, "target", source.linkId, {...imported, tileHeight: 8})).toThrow(/diagonal/);
  });

  it("round-trips every supported grid layout with flags, Terrain, and typed arrays", () => {
    for (const grid of layouts) {
      const source = makeInput(grid);
      const decoded = importTilemapJson(exportTilemapJson(source));

      expect(decoded.format).toBe("pixtorio-tilemap-v1");
      expect(decoded.tileset.grid).toEqual(grid);
      expect(decoded.tileset.tileIds).toEqual([1, 2]);
      expect(decoded.tileset.terrains).toEqual(source.tileset.terrains);
      expect(decoded.tilemap.tiles).toBeInstanceOf(Uint32Array);
      expect([...decoded.tilemap.tiles]).toEqual([...source.tilemap.tiles]);
      expect(decoded.terrainmap?.cells).toBeInstanceOf(Uint16Array);
      expect([...decoded.terrainmap!.cells]).toEqual([1, terrainEmpty, 1, 0]);
      expect(decoded.cel).toEqual(source.cel);
    }
  });

  it("round-trips a per-map hex offset and rejects invalid orientation overrides", () => {
    const source = makeInput({kind: "hexagonal", orientation: "pointy", offset: "odd-r"});
    source.tilemap.gridOffset = "even-r";
    const encoded = exportTilemapJson(source);
    expect(importTilemapJson(encoded).tilemap.gridOffset).toBe("even-r");
    const invalid = JSON.parse(encoded);
    invalid.tilemap.gridOffset = "odd-q";
    expect(() => importTilemapJson(JSON.stringify(invalid))).toThrow(/grid offset/);
    invalid.tilemap.gridOffset = null;
    expect(() => importTilemapJson(JSON.stringify(invalid))).toThrow(/grid offset/);
  });

  it("returns deep copies of typed arrays and nested metadata", () => {
    const source = makeInput(layouts[0]);
    const decoded = importTilemapJson(exportTilemapJson(source));

    decoded.tilemap.tiles[0] = 2;
    decoded.terrainmap!.cells[0] = 0;
    decoded.tileset.tileIds[0] = 2;
    decoded.tileset.terrains[0].rules[0].candidates[0].tileId = 2;

    expect(source.tilemap.tiles[0]).toBe(1);
    expect((source.terrainmap as {terrains: Uint16Array}).terrains[0]).toBe(1);
    expect((source.tileset as Tileset).tiles[0].id).toBe(1);
    expect(source.tileset.terrains[0].rules[0].candidates[0].tileId).toBe(1);
  });

  it("round-trips strict Tileset PNG rectangles without guessing Tile ID order", () => {
    const source = makeInput(layouts[1]);
    (source.tileset as Tileset).tiles.reverse();
    source.tilesetImage = {
      file: "terrain-tiles.png",
      width: 32,
      height: 16,
      tiles: [
        {tileId: 2, x: 0, y: 0, width: 16, height: 16},
        {tileId: 1, x: 16, y: 0, width: 16, height: 16},
      ],
    };
    const decoded = importTilemapJson(exportTilemapJson(source));
    expect(decoded.tileset.tileIds).toEqual([2, 1]);
    expect(decoded.tilesetImage).toEqual(source.tilesetImage);

    const corrupt = JSON.parse(exportTilemapJson(source));
    corrupt.tilesetImage.tiles[1].tileId = 2;
    expect(() => importTilemapJson(JSON.stringify(corrupt))).toThrow(/image tile/i);
    corrupt.tilesetImage.tiles[1].tileId = 1;
    corrupt.tilesetImage.tiles[1].x = 31;
    expect(() => importTilemapJson(JSON.stringify(corrupt))).toThrow(/image tile/i);
    corrupt.tilesetImage.tiles[1].x = 16;
    corrupt.tilesetImage.extra = true;
    expect(() => importTilemapJson(JSON.stringify(corrupt))).toThrow(/unknown field/i);
  });

  it("rejects corrupt format, fields, references, flags, modes, and dimensions", () => {
    const json = JSON.parse(exportTilemapJson(makeInput(layouts[0]))) as Record<string, any>;
    const expectInvalid = (mutate: (value: Record<string, any>) => void, message: RegExp) => {
      const next = structuredClone(json);
      mutate(next);
      expect(() => importTilemapJson(JSON.stringify(next))).toThrow(message);
    };

    expectInvalid((value) => { value.format = "pixtorio-tilemap-v2"; }, /format/);
    expectInvalid((value) => { value.extra = true; }, /unknown field/);
    expectInvalid((value) => { value.tileset.tileIds = [1, 1]; }, /unique/);
    expectInvalid((value) => { value.tilemap.tiles[0] = 99; }, /unknown tile/);
    expectInvalid((value) => { value.tilemap.tiles[0] = 0x100000000; }, /invalid/);
    expectInvalid((value) => { value.tileset.terrains[0].rules[0].candidates[0].tileId = 99; }, /unknown tile/);
    expectInvalid((value) => { value.tileset.grid = {kind: "hexagonal", orientation: "pointy", offset: "odd-q"}; }, /grid/);
    expectInvalid((value) => { value.tileset.terrains[0].neighborMode = "edge6"; }, /edge6/);
    expectInvalid((value) => { value.terrainmap.cells[0] = 2; }, /unknown terrain/);
    expectInvalid((value) => { value.terrainmap.columns = 1; }, /dimensions/);
    expectInvalid((value) => { value.cel.width = 33; }, /dimensions/);
  });

  it("rejects non-square diagonal flags", () => {
    const source = makeInput(layouts[0]);
    source.tileset.tileHeight = 8;
    source.cel.height = 16;
    source.tilemap = {columns: 2, rows: 2, tiles: new Uint32Array([1, 2, 1, (2 | tileFlipDiagonal) >>> 0])};
    expect(() => exportTilemapJson(source)).toThrow(/square/);
  });
});

describe("tilemap interchange CSV", () => {
  it("round-trips a flag-free, Terrain-free Tile ID layer", () => {
    const source = makeInput(layouts[0], false);
    source.tilemap = {columns: 2, rows: 2, tiles: new Uint32Array([1, 2, 0, 1])};
    const csv = exportTilemapCsv(source);
    expect(csv).toBe("1,2\n0,1");
    const imported = importTilemapCsv(csv, {tileset: source.tileset});
    expect(imported).toEqual({columns: 2, rows: 2, tiles: new Uint32Array([1, 2, 0, 1])});
  });

  it("rejects flags and Terrain instead of silently dropping information", () => {
    const flagSource = makeInput(layouts[0], false);
    expect(() => exportTilemapCsv(flagSource)).toThrow(/flags/);

    const terrainSource = makeInput(layouts[0], true);
    expect(() => exportTilemapCsv(terrainSource)).toThrow(/Terrain/);
    expect(() => importTilemapCsv("1,2\n0,1", {tileset: terrainSource.tileset})).toThrow(/Terrain/);
  });

  it("rejects malformed, non-rectangular, negative, and out-of-range CSV cells", () => {
    const invalid = [
      "",
      "1,2\n3",
      "1,,2",
      "1,-2",
      "1,1.5",
      "01,2",
      "1,4294967295",
      "1\n\n2",
    ];
    for (const csv of invalid) expect(() => importTilemapCsv(csv)).toThrow();
  });

  it("accepts CRLF but rejects unknown tile IDs when a tileset is supplied", () => {
    const source = makeInput(layouts[0], false);
    expect(importTilemapCsv("1,2\r\n0,1\r\n", {tileset: source.tileset}).tiles).toEqual(new Uint32Array([1, 2, 0, 1]));
    expect(() => importTilemapCsv("1,3", {tileset: source.tileset})).toThrow(/unknown tile/);
  });
});

import {describe, expect, it} from "vitest";
import {
  addFrame, celKey, cloneDocument, createDocument, getActiveCel, getCel, linkCels,
  type ColorMode, type PixelDocument, type TilesetGrid,
} from "./document";
import {convertDocumentColorMode, refreshTilemapCaches} from "./colorModes";
import {CommandHistory, DocumentStateCommand, TerrainCellsCommand} from "./history";
import {createTerrainMapData, recalculateTerrainCells, terrainEmpty} from "./terrain";
import {cleanupTilesetInPlace, createTilemapData, createTileset, drawTilemapPixelInPlace, tilemapPixelSize} from "./tilemap";
import {tilesetGridLayout} from "./tilemapGeometry";
import {replaceCelTerrainAuthority} from "./tilemapAuthority";
import {decodeProject, encodeProject} from "./serialization";
import {transformTerrainSelection} from "./terrainTools";

function fixture(mode: ColorMode, grid: TilesetGrid = {kind: "hexagonal", orientation: "pointy", offset: "even-r"}) {
  const document = createDocument({width: 6, height: 4, palette: ["#00000000", "#ff0000ff", "#00ff00ff"]});
  const tileset = createTileset({
    tileWidth: 2, tileHeight: 2,
    grid,
    tiles: [1, 2].map((id) => ({
      id, pixels: new Uint8ClampedArray(Array.from({length: 4}, () => id === 1
        ? [255, 0, 0, 255] : [0, 255, 0, 255]).flat()),
    })),
  });
  tileset.terrains = [{
    id: 1, name: "Grass", color: "#00ff00ff", neighborMode: grid.kind === "hexagonal" ? "edge6" : "edge4", boundary: "empty",
    rules: [{mask: 0, candidates: [{tileId: 2, flags: 0, weight: 1}]}],
  }];
  document.tilesets = [tileset];
  Object.assign(document.layers[0], {kind: "tilemap", tilesetId: tileset.id});
  const cel = getActiveCel(document);
  cel.tilemap = createTilemapData(3, 2);
  cel.tilemap.tiles.fill(1);
  Object.assign(cel, tilemapPixelSize(tileset, 3, 2));
  refreshTilemapCaches(document);
  if (mode !== "rgba") convertDocumentColorMode(document, mode);
  const frame = addFrame(document);
  linkCels(document, cel.layerId, document.frames.map((item) => item.id), cel.frameId);
  const alias = getCel(document, cel.layerId, frame.id)!;
  alias.x = 2;
  alias.y = -1;
  alias.opacity = 0.5;
  alias.zIndex = 2;
  return {document, cel, alias, tileset};
}

describe("Tilemap authority transitions", () => {
  for (const grid of [
    {kind: "orthogonal"},
    {kind: "isometric", cellWidth: 2, cellHeight: 2, anchorX: 1, anchorY: 2},
    {kind: "hexagonal", orientation: "pointy", offset: "even-r"},
  ] as const) {
  for (const mode of ["rgba", "grayscale", "indexed"] as const) {
    it(`initializes and undoes the complete linked Terrain gesture in ${mode}/${grid.kind}`, () => {
      const {document, cel, alias, tileset} = fixture(mode, grid);
      const before = cloneDocument(document);
      const map = createTerrainMapData(3, 2, 17);
      replaceCelTerrainAuthority(document, cel, map);
      expect([...cel.tilemap!.tiles]).toEqual([0, 0, 0, 0, 0, 0]);
      map.terrains[0] = 1;
      map.terrains[4] = terrainEmpty;
      recalculateTerrainCells(map, tileset.terrains, tilesetGridLayout(tileset), cel.tilemap!.tiles,
        [{column: 0, row: 0}, {column: 1, row: 1}]);
      refreshTilemapCaches(document);
      expect(alias.terrainmap).toBe(map);
      expect(alias.tilemap).toBe(cel.tilemap);
      expect(alias).toMatchObject({x: 2, y: -1, opacity: 0.5, zIndex: 2});
      const after = cloneDocument(document);
      expect(() => decodeProject(encodeProject(document))).not.toThrow();
      const history = new CommandHistory<PixelDocument>();
      history.commit(new DocumentStateCommand(before, document, "Draw Terrain"));
      history.undo(document);
      expect(document).toEqual(before);
      expect(() => decodeProject(encodeProject(document))).not.toThrow();
      history.redo(document);
      expect(document).toEqual(after);
      const restored = document.cels[celKey(cel.layerId, cel.frameId)];
      expect(restored.terrainmap!.terrains).toBe(document.cels[celKey(alias.layerId, alias.frameId)].terrainmap!.terrains);
      const sparse = new TerrainCellsCommand(restored.id, [{index: 1, before: 0, after: 1}], "Draw Terrain");
      sparse.redo(document);
      history.commit(sparse);
      expect(sparse.byteSize).toBeLessThan(100);
      expect(() => decodeProject(encodeProject(document))).not.toThrow();
      history.undo(document);
      expect(document).toEqual(after);
    });

    it(`bakes Terrain for manual Tile editing without losing the image in ${mode}/${grid.kind}`, () => {
      const {document, cel, alias} = fixture(mode, grid);
      const map = createTerrainMapData(3, 2, 17);
      map.terrains.fill(1);
      replaceCelTerrainAuthority(document, cel, map);
      const before = cloneDocument(document);
      const pixels = cel.pixels.slice();
      replaceCelTerrainAuthority(document, cel, undefined);
      expect(cel.terrainmap).toBeUndefined();
      expect(alias.terrainmap).toBeUndefined();
      expect(cel.pixels).toEqual(pixels);
      cel.tilemap!.tiles[0] = 1;
      refreshTilemapCaches(document);
      const history = new CommandHistory<PixelDocument>();
      history.commit(new DocumentStateCommand(before, document, "Draw Tiles"));
      expect(() => decodeProject(encodeProject(document))).not.toThrow();
      history.undo(document);
      expect(document).toEqual(before);
      history.redo(document);
      expect(document.cels[celKey(cel.layerId, cel.frameId)].terrainmap).toBeUndefined();
      expect(() => decodeProject(encodeProject(document))).not.toThrow();
    });
  }
  }

  it("rejects invalid Terrain authority before modifying linked data", () => {
    const {document, cel} = fixture("rgba");
    const before = cloneDocument(document);
    expect(() => replaceCelTerrainAuthority(document, cel, createTerrainMapData(1, 1, 0))).toThrow(/dimensions/);
    const map = createTerrainMapData(3, 2, 0);
    map.terrains[2] = 123;
    expect(() => replaceCelTerrainAuthority(document, cel, map)).toThrow(/unknown terrain/);
    expect(document).toEqual(before);
  });

  it("keeps rule-only tiles during Auto cleanup after a Terrain-to-pixel edit", () => {
    const {document, cel, tileset} = fixture("rgba");
    const map = createTerrainMapData(3, 2, 17);
    map.terrains[0] = 1;
    replaceCelTerrainAuthority(document, cel, map);
    const before = cloneDocument(document);
    replaceCelTerrainAuthority(document, cel, undefined);
    cel.tilemap!.tiles.fill(1);
    drawTilemapPixelInPlace(cel, tileset, 1, 1, [255, 0, 255, 255], {
      mode: "auto", referenceTilemaps: [cel.tilemap!],
    });
    cleanupTilesetInPlace(tileset, [cel.tilemap!]);
    refreshTilemapCaches(document);
    expect(tileset.tiles.some((tile) => tile.id === 2)).toBe(true);
    expect(() => decodeProject(encodeProject(document))).not.toThrow();
    const history = new CommandHistory<PixelDocument>();
    history.commit(new DocumentStateCommand(before, document, "Draw Tile Pixels"));
    history.undo(document);
    expect(document).toEqual(before);
    history.redo(document);
    expect(() => decodeProject(encodeProject(document))).not.toThrow();
  });

  it("keeps linked Terrain authority, weighted variants, caches, strict v5, and history through selection transforms", () => {
    const {document, cel, alias, tileset} = fixture("indexed", {kind: "orthogonal"});
    tileset.terrains[0] = {
      ...tileset.terrains[0],
      boundary: "wrap",
      rules: Array.from({length: 16}, (_, mask) => ({
        mask,
        candidates: [
          {tileId: 1, flags: 0, weight: 1},
          {tileId: 2, flags: 0, weight: 3},
        ],
      })),
    };
    const map = createTerrainMapData(3, 2, 12345);
    map.terrains.set([1, terrainEmpty, 0, 1, 1, terrainEmpty]);
    replaceCelTerrainAuthority(document, cel, map);
    const before = cloneDocument(document);
    const transformed = transformTerrainSelection(map, {x: 0, y: 0, width: 2, height: 2}, "cw");
    replaceCelTerrainAuthority(document, cel, transformed.map);

    expect([...cel.terrainmap!.terrains]).toEqual([1, 1, 0, 1, terrainEmpty, terrainEmpty]);
    expect(cel.terrainmap!.seed).toBe(12345);
    expect(alias.terrainmap).toBe(cel.terrainmap);
    expect(alias.tilemap).toBe(cel.tilemap);
    expect(alias.pixels).toBe(cel.pixels);
    expect(alias.indexes).toBe(cel.indexes);
    expect(cel.indexes).toHaveLength(cel.width * cel.height);
    expect(() => decodeProject(encodeProject(document))).not.toThrow();

    const after = cloneDocument(document);
    const history = new CommandHistory<PixelDocument>();
    history.commit(new DocumentStateCommand(before, document, "Transform Terrain Cells"));
    history.undo(document);
    expect(document).toEqual(before);
    history.redo(document);
    expect(document).toEqual(after);
    expect(() => decodeProject(encodeProject(document))).not.toThrow();
  });
});

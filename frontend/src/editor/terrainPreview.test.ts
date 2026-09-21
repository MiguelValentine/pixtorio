import {describe, expect, it} from "vitest";

import {createTileset} from "./tilemap";
import type {TilesetGrid} from "./document";
import {generateTerrainPreviews, type TerrainPreviewScene} from "./terrainPreview";

const palette = ["#00000000", "#e63946ff", "#457b9dff"];

const gridCases = [
  ["orthogonal", {kind: "orthogonal"}],
  ["isometric high tile", {kind: "isometric", cellWidth: 4, cellHeight: 4, anchorX: 2, anchorY: 4}],
  ["pointy odd-r", {kind: "hexagonal", orientation: "pointy", offset: "odd-r"}],
  ["pointy even-r", {kind: "hexagonal", orientation: "pointy", offset: "even-r"}],
  ["flat odd-q", {kind: "hexagonal", orientation: "flat", offset: "odd-q"}],
  ["flat even-q", {kind: "hexagonal", orientation: "flat", offset: "even-q"}],
] as const;

function terrainMode(grid: TilesetGrid) {
  return grid.kind === "hexagonal" ? "edge6" : grid.kind === "isometric" ? "edge4" : "blob8";
}

function createPreviewTileset(
  grid: TilesetGrid = {kind: "orthogonal"},
  options: {indexed?: boolean; weighted?: boolean; tileWidth?: number; tileHeight?: number} = {},
) {
  const indexed = options.indexed ?? false;
  const tileWidth = options.tileWidth ?? 4;
  const tileHeight = options.tileHeight ?? 4;
  const pixelsFor = (color: [number, number, number]) => new Uint8ClampedArray(
    Array.from({length: tileWidth * tileHeight}, () => [...color, 255]).flat(),
  );
  const indexesFor = (index: number) => new Uint8Array(tileWidth * tileHeight).fill(index);
  const candidates = options.weighted
    ? [{tileId: 1, flags: 0, weight: 1}, {tileId: 2, flags: 0, weight: 1}]
    : [{tileId: 1, flags: 0, weight: 1}];
  return createTileset({
    id: "preview-tileset",
    name: "Preview",
    tileWidth,
    tileHeight,
    grid,
    terrains: [{
      id: 7,
      name: "Selected",
      color: "#e63946ff",
      neighborMode: terrainMode(grid),
      boundary: "empty",
      rules: [{mask: 0, candidates}],
    }],
    tiles: [
      {id: 1, pixels: pixelsFor([230, 57, 70]), ...(indexed ? {indexes: indexesFor(1)} : {})},
      {id: 2, pixels: pixelsFor([69, 123, 157]), ...(indexed ? {indexes: indexesFor(2)} : {})},
    ],
  });
}

function terrainCounts(previews: readonly TerrainPreviewScene[]) {
  return previews.map((preview) => Array.from(preview.terrainmap.terrains).filter((value) => value === 7).length);
}

describe("Terrain preview generation", () => {
  it("returns six distinct 5x5 logical scenes using real terrain and tilemap caches", () => {
    const tileset = createPreviewTileset(undefined, {weighted: true});
    const previews = generateTerrainPreviews(tileset, 7, {seed: 23});

    expect(previews.map((preview) => preview.kind)).toEqual([
      "island", "edge", "outer-corner", "inner-corner", "channel", "closed",
    ]);
    expect(terrainCounts(previews)).toEqual([1, 15, 9, 16, 5, 25]);
    for (const preview of previews) {
      expect(preview.tilemap.columns).toBe(5);
      expect(preview.tilemap.rows).toBe(5);
      expect(preview.terrainmap.columns).toBe(5);
      expect(preview.terrainmap.rows).toBe(5);
      expect(preview.pixels).toHaveLength(preview.width * preview.height * 4);
      expect(preview.tilemap.tiles.some((value) => value !== 0)).toBe(true);
    }
    expect(previews[0].terrainmap).not.toBe(previews[5].terrainmap);
    expect(previews[0].tilemap).not.toBe(previews[5].tilemap);
  });

  it.each(gridCases)("supports %s geometry", (_name, grid) => {
    const previews = generateTerrainPreviews(createPreviewTileset(grid), 7, {seed: 9});
    expect(previews).toHaveLength(6);
    expect(previews.every((preview) => preview.width > 0 && preview.height > 0)).toBe(true);
    expect(previews.every((preview) => preview.pixels.length === preview.width * preview.height * 4)).toBe(true);
  });

  it("passes seed through deterministic weighted resolution and reflects rule changes", () => {
    const tileset = createPreviewTileset(undefined, {weighted: true});
    const first = generateTerrainPreviews(tileset, 7, {seed: 1})[5];
    const differentSeed = Array.from({length: 64}, (_value, index) => index + 2)
      .map((seed) => ({seed, preview: generateTerrainPreviews(tileset, 7, {seed})[5]}))
      .find(({preview}) => !arraysEqual(preview.tilemap.tiles, first.tilemap.tiles));
    expect(differentSeed).toBeDefined();
    expect(differentSeed!.preview.terrainmap.seed).toBe(differentSeed!.seed);

    const changedRules = createPreviewTileset(undefined);
    changedRules.terrains[0].rules[0].candidates = [{tileId: 2, flags: 0, weight: 1}];
    const changed = generateTerrainPreviews(changedRules, 7, {seed: 1})[5];
    expect(Array.from(changed.tilemap.tiles).every((value) => value === 2)).toBe(true);
    expect(arraysEqual(changed.tilemap.tiles, first.tilemap.tiles)).toBe(false);
  });

  it("preserves the source tileset and renders indexed and grayscale caches", () => {
    const indexedTileset = createPreviewTileset(undefined, {indexed: true});
    const indexedBefore = snapshotTileset(indexedTileset);
    const indexed = generateTerrainPreviews(indexedTileset, 7, {
      seed: 5,
      palette,
      transparentIndex: 0,
    });
    expect(indexed[5].pixels.some((value) => value !== 0)).toBe(true);
    expect(snapshotTileset(indexedTileset)).toEqual(indexedBefore);

    const grayscaleTileset = createPreviewTileset(undefined);
    for (const tile of grayscaleTileset.tiles) {
      for (let index = 0; index < tile.pixels.length; index += 4) {
        const value = tile.id === 1 ? 80 : 180;
        tile.pixels[index] = value;
        tile.pixels[index + 1] = value;
        tile.pixels[index + 2] = value;
      }
    }
    const grayscale = generateTerrainPreviews(grayscaleTileset, 7, {seed: 5});
    for (let index = 0; index < grayscale[5].pixels.length; index += 4) {
      expect(grayscale[5].pixels[index]).toBe(grayscale[5].pixels[index + 1]);
      expect(grayscale[5].pixels[index + 1]).toBe(grayscale[5].pixels[index + 2]);
    }
  });

  it("rejects missing terrain definitions and oversized preview resources", () => {
    const tileset = createPreviewTileset();
    expect(() => generateTerrainPreviews(tileset, 99)).toThrow(/missing/);

    const huge = createPreviewTileset({kind: "isometric", cellWidth: 4096, cellHeight: 4096, anchorX: 0, anchorY: 0}, {
      tileWidth: 1,
      tileHeight: 1,
    });
    expect(() => generateTerrainPreviews(huge, 7)).toThrow(/too large/);
  });
});

function arraysEqual(left: ArrayLike<number>, right: ArrayLike<number>) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

function snapshotTileset(tileset: ReturnType<typeof createPreviewTileset>) {
  return {
    terrains: JSON.stringify(tileset.terrains),
    tiles: tileset.tiles.map((tile) => ({
      id: tile.id,
      pixels: Array.from(tile.pixels),
      indexes: tile.indexes ? Array.from(tile.indexes) : undefined,
    })),
  };
}

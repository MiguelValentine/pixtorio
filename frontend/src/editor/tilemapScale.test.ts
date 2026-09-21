import {describe, expect, it} from "vitest";
import {tileFlipDiagonal, tileFlipX, tileFlipY} from "./document";
import {createTileset, sourcePixelForTileValue} from "./tilemap";
import {scaleTileset} from "./tilemapScale";

function fixture() {
  return createTileset({tileWidth: 3, tileHeight: 3, tiles: [{
    id: 4,
    pixels: Uint8ClampedArray.from(Array.from({length: 9}, (_, i) => [i, i * 2, i * 3, 255]).flat()),
    indexes: Uint8Array.from({length: 9}, (_, i) => i),
  }]});
}

describe("tileset content scaling", () => {
  it("samples all eight orientations before non-integral anisotropic scaling", () => {
    for (const scale of [[2, 1], [1.5, 0.7], [0.2, 0.3]]) {
      const source = fixture();
      const before = structuredClone(source);
      const result = scaleTileset(source, scale[0], scale[1]);
      for (const flags of [0, tileFlipX, tileFlipY, tileFlipX | tileFlipY,
        tileFlipDiagonal, tileFlipDiagonal | tileFlipX, tileFlipDiagonal | tileFlipY,
        tileFlipDiagonal | tileFlipX | tileFlipY]) {
        const value = (4 | flags) >>> 0;
        const id = result.remapValue(value);
        expect(result.remapValue(value)).toBe(id);
        const tile = result.tileset.tiles.find((entry) => entry.id === id)!;
        for (let y = 0; y < result.tileset.tileHeight; y += 1) {
          for (let x = 0; x < result.tileset.tileWidth; x += 1) {
            const point = sourcePixelForTileValue(value,
              Math.floor(x * 3 / result.tileset.tileWidth), Math.floor(y * 3 / result.tileset.tileHeight), 3, 3);
            const from = point.y * 3 + point.x;
            const to = y * result.tileset.tileWidth + x;
            expect(tile.pixels.slice(to * 4, to * 4 + 4)).toEqual(source.tiles[0].pixels.slice(from * 4, from * 4 + 4));
            expect(tile.indexes![to]).toBe(from);
          }
        }
      }
      expect(result.tileset.tiles).toHaveLength(8);
      expect(result.remapValue(0)).toBe(0);
      expect(source).toEqual(before);
    }
  });

  it("scales isometric grid and anchors and shares baked Terrain candidates", () => {
    const source = fixture();
    source.grid = {kind: "isometric", cellWidth: 6, cellHeight: 3, anchorX: 2, anchorY: 3};
    source.terrains = [{
      id: 1, name: "Grass", color: "#ffffffff", neighborMode: "edge4", boundary: "wrap",
      rules: [0, 1].map((mask) => ({mask, candidates: [{tileId: 4, flags: tileFlipDiagonal, weight: 3}]})),
    }];
    const result = scaleTileset(source, 2, 0.5);
    expect(result.tileset.grid).toEqual({kind: "isometric", cellWidth: 12, cellHeight: 2, anchorX: 4, anchorY: 2});
    const id = result.remapValue((4 | tileFlipDiagonal) >>> 0);
    for (const rule of result.tileset.terrains[0].rules) {
      expect(rule.candidates).toEqual([{tileId: id, flags: 0, weight: 3}]);
    }
    expect(result.tileset.tiles).toHaveLength(2);
    expect(source.terrains[0].rules[0].candidates[0].flags).toBe(tileFlipDiagonal);
  });

  it("rejects invalid scales, oversized metrics and missing tile references", () => {
    const source = fixture();
    for (const scale of [0, -1, NaN, Infinity, 4097]) {
      expect(() => scaleTileset(source, scale, 1)).toThrow();
    }
    const result = scaleTileset(source, 1, 1);
    expect(() => result.remapValue(99)).toThrow(/missing tile/);
  });
});

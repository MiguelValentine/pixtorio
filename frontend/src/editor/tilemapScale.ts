import {tileIndexMask, type Tile, type Tileset} from "./document";
import {cloneTileset, sourcePixelForTileValue, validateTileset} from "./tilemap";

/**
 * Scales shared tile images and grid metrics without changing logical cells.
 * Integer grid metrics are rounded, with a minimum footprint of one pixel.
 */
export function scaleTileset(source: Tileset, scaleX: number, scaleY: number) {
  validateTileset(source);
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
    throw new Error("Tile scale must be finite and positive");
  }
  const dimension = (size: number, scale: number) => {
    const result = Math.max(1, Math.round(size * scale));
    if (result > 4096) throw new Error("Scaled tile dimensions exceed 4096 pixels");
    return result;
  };
  const tileset = cloneTileset(source);
  tileset.tileWidth = dimension(source.tileWidth, scaleX);
  tileset.tileHeight = dimension(source.tileHeight, scaleY);
  if (tileset.grid.kind === "isometric" && source.grid.kind === "isometric") {
    tileset.grid.cellWidth = dimension(source.grid.cellWidth, scaleX);
    tileset.grid.cellHeight = dimension(source.grid.cellHeight, scaleY);
    tileset.grid.anchorX = Math.min(tileset.tileWidth, Math.round(source.grid.anchorX * scaleX));
    tileset.grid.anchorY = Math.min(tileset.tileHeight, Math.round(source.grid.anchorY * scaleY));
  }
  const sourceTiles = new Map(source.tiles.map((tile) => [tile.id, tile]));
  const sample = (tile: Tile, value: number, id: number): Tile => {
    const pixels = new Uint8ClampedArray(tileset.tileWidth * tileset.tileHeight * 4);
    const indexes = tile.indexes ? new Uint8Array(tileset.tileWidth * tileset.tileHeight) : undefined;
    for (let y = 0; y < tileset.tileHeight; y += 1) {
      for (let x = 0; x < tileset.tileWidth; x += 1) {
        const point = sourcePixelForTileValue(value,
          Math.floor(x * source.tileWidth / tileset.tileWidth),
          Math.floor(y * source.tileHeight / tileset.tileHeight), source.tileWidth, source.tileHeight);
        const from = point.y * source.tileWidth + point.x;
        const to = y * tileset.tileWidth + x;
        pixels.set(tile.pixels.subarray(from * 4, from * 4 + 4), to * 4);
        if (indexes) indexes[to] = tile.indexes![from];
      }
    }
    return {...tile, id, pixels, ...(indexes ? {indexes} : {})};
  };
  tileset.tiles = source.tiles.map((tile) => sample(tile, tile.id, tile.id));
  const used = new Set(sourceTiles.keys());
  const variants = new Map<number, number>();
  let nextID = 1;
  const remapValue = (raw: number): number => {
    const value = raw >>> 0;
    const id = value & tileIndexMask;
    if (value === 0) return 0;
    const tile = sourceTiles.get(id);
    if (!tile) throw new Error("Scaled tilemap references a missing tile");
    if (value === id) return id;
    // Baking before sampling preserves the orientation under non-integral
    // scaling too; flipping an already-resized bitmap can choose other pixels.
    const existing = variants.get(value);
    if (existing !== undefined) return existing;
    while (used.has(nextID)) nextID += 1;
    if (nextID > tileIndexMask) throw new Error("Tileset has reached its tile limit");
    const variant = nextID++;
    used.add(variant);
    tileset.tiles.push(sample(tile, value, variant));
    variants.set(value, variant);
    return variant;
  };
  for (const terrain of tileset.terrains) {
    for (const rule of terrain.rules) {
      for (const candidate of rule.candidates) {
        candidate.tileId = remapValue(candidate.tileId | candidate.flags);
        candidate.flags = 0;
      }
    }
  }
  validateTileset(tileset);
  return {tileset, remapValue};
}

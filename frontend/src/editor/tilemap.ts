import {
  tileFlipDiagonal,
  tileFlipX,
  tileFlipY,
  tileIndexMask,
  type Cel,
  type Layer,
  type PixelDocument,
  type Tile,
  type TilemapData,
  type Tileset,
} from "./document";

// Re-export the encoding constants from the tilemap-facing module so callers
// do not need to know which document module owns the binary representation.
export {tileFlipDiagonal, tileFlipX, tileFlipY, tileIndexMask} from "./document";

/** Pixel edit synchronization used by Aseprite-style tilemap drawing. */
export type TilePixelSyncMode = "manual" | "auto" | "stack";

export interface CreateTilesetOptions {
  id?: string;
  name?: string;
  tileWidth: number;
  tileHeight: number;
  tiles?: readonly Tile[];
}

export interface TilemapGrid {
  tileWidth: number;
  tileHeight: number;
  offsetX?: number;
  offsetY?: number;
}

export interface TilemapConversionOptions {
  tileWidth?: number;
  tileHeight?: number;
  offsetX?: number;
  offsetY?: number;
  tilesetId?: string;
  tilesetName?: string;
  palette?: readonly string[];
  transparentIndex?: number;
}

export interface ImageCelConversionOptions extends TilemapConversionOptions {
  tileWidth: number;
  tileHeight: number;
}

export interface TilemapConversionResult {
  tileset: Tileset;
  layer: Layer;
  cels: Cel[];
}

export interface TilePixelEditOptions {
  mode?: TilePixelSyncMode;
  palette?: readonly string[];
  transparentIndex?: number;
}

export interface TilePixelEditResult {
  tileset: Tileset;
  cel: Cel;
  tileId: number;
  cellX: number;
  cellY: number;
  localX: number;
  localY: number;
  created: boolean;
}

let generatedID = 0;

/** Creates a tileset. Tile index 0 is implicit and is never stored in `tiles`. */
export function createTileset(options: CreateTilesetOptions): Tileset;
export function createTileset(tileWidth: number, tileHeight: number, id?: string, name?: string): Tileset;
export function createTileset(
  optionsOrWidth: CreateTilesetOptions | number,
  height?: number,
  id?: string,
  name = "Tileset",
): Tileset {
  const options: CreateTilesetOptions = typeof optionsOrWidth === "number"
    ? {tileWidth: optionsOrWidth, tileHeight: height ?? optionsOrWidth, id, name}
    : optionsOrWidth;
  assertTileDimensions(options.tileWidth, options.tileHeight);
  const tileset: Tileset = {
    id: options.id ?? createGeneratedID("tileset"),
    name: options.name ?? "Tileset",
    tileWidth: options.tileWidth,
    tileHeight: options.tileHeight,
    tiles: (options.tiles ?? []).map(cloneTile),
  };
  validateTileset(tileset);
  return tileset;
}

/** Throws when a tileset is malformed. Returns true for convenient assertions. */
export function validateTileset(tileset: Tileset): true {
  if (!tileset || typeof tileset !== "object") throw new Error("Tileset is required");
  if (typeof tileset.id !== "string" || tileset.id.length === 0) throw new Error("Tileset id is required");
  if (typeof tileset.name !== "string") throw new Error("Tileset name is invalid");
  assertTileDimensions(tileset.tileWidth, tileset.tileHeight);
  if (!Array.isArray(tileset.tiles)) throw new Error("Tileset tiles are invalid");
  const expectedPixels = tileset.tileWidth * tileset.tileHeight * 4;
  const ids = new Set<number>();
  for (const tile of tileset.tiles) {
    if (!tile || !Number.isInteger(tile.id) || tile.id <= 0 || tile.id > tileIndexMask) {
      throw new Error("Tileset tile id is invalid; tile 0 is reserved for empty");
    }
    if (ids.has(tile.id)) throw new Error("Tileset tile ids must be unique");
    ids.add(tile.id);
    if (!(tile.pixels instanceof Uint8ClampedArray) || tile.pixels.length !== expectedPixels) {
      throw new Error("Tileset tile pixel dimensions are invalid");
    }
    if (tile.indexes !== undefined && (!(tile.indexes instanceof Uint8Array) || tile.indexes.length !== expectedPixels / 4)) {
      throw new Error("Tileset tile index dimensions are invalid");
    }
  }
  return true;
}

export function cloneTileset(tileset: Tileset): Tileset {
  validateTileset(tileset);
  return {...tileset, tiles: tileset.tiles.map(cloneTile)};
}

export function findTile(tileset: Tileset, tileId: number): Tile | null {
  if (tileId === 0) return null;
  return tileset.tiles.find((tile) => tile.id === (tileId & tileIndexMask)) ?? null;
}

/** Returns the first tile whose decoded RGBA pixels are byte-for-byte equal. */
export function findTileByPixels(tileset: Tileset, pixels: Uint8ClampedArray): Tile | null {
  if (pixels.length !== tileset.tileWidth * tileset.tileHeight * 4) throw new Error("Tile pixel dimensions are invalid");
  return tileset.tiles.find((tile) => bytesEqual(tile.pixels, pixels)) ?? null;
}

export interface AddTileResult {
  tileset: Tileset;
  tile: Tile;
  created: boolean;
}

/** Adds a tile to a cloned tileset, reusing an exactly equal tile when possible. */
export function addTile(
  tileset: Tileset,
  pixels: Uint8ClampedArray,
  indexes?: Uint8Array,
): AddTileResult {
  validateTileset(tileset);
  if (pixels.length !== tileset.tileWidth * tileset.tileHeight * 4) throw new Error("Tile pixel dimensions are invalid");
  if (indexes && indexes.length !== pixels.length / 4) throw new Error("Tile index dimensions are invalid");
  const existing = findTileByPixels(tileset, pixels);
  if (existing) {
    const next = cloneTileset(tileset);
    const reused = next.tiles.find((tile) => tile.id === existing.id)!;
    if (indexes && !reused.indexes) reused.indexes = indexes.slice();
    return {tileset: next, tile: cloneTile(reused), created: false};
  }
  const next = cloneTileset(tileset);
  const tile: Tile = {
    id: nextTileID(next),
    pixels: pixels.slice(),
    ...(indexes ? {indexes: indexes.slice()} : {}),
  };
  next.tiles.push(tile);
  return {tileset: next, tile: cloneTile(tile), created: true};
}

/** Mutating convenience form for document editing code. */
export function addTileInPlace(tileset: Tileset, pixels: Uint8ClampedArray, indexes?: Uint8Array): {tile: Tile; created: boolean} {
  const result = addTile(tileset, pixels, indexes);
  tileset.tiles = result.tileset.tiles;
  return {tile: result.tile, created: result.created};
}

export interface DeleteTileResult {
  tileset: Tileset;
  tilemaps: TilemapData[];
  deleted: boolean;
}

/** Deletes a tile and replaces all references in the supplied tilemaps with empty tile 0. */
export function deleteTile(
  tileset: Tileset,
  tileId: number,
  tilemaps: TilemapData | readonly TilemapData[] = [],
): DeleteTileResult {
  validateTileset(tileset);
  const id = tileId & tileIndexMask;
  const tilemapList = Array.isArray(tilemaps) ? tilemaps : [tilemaps];
  const deleted = id !== 0 && tileset.tiles.some((tile) => tile.id === id);
  const nextTileset = deleted
    ? {...cloneTileset(tileset), tiles: tileset.tiles.filter((tile) => tile.id !== id).map(cloneTile)}
    : cloneTileset(tileset);
  const nextTilemaps = tilemapList.map((tilemap) => clearTileReferences(tilemap, id));
  return {tileset: nextTileset, tilemaps: nextTilemaps, deleted};
}

export function deleteTileInPlace(tileset: Tileset, tileId: number, tilemaps: TilemapData | readonly TilemapData[] = []): boolean {
  const list = Array.isArray(tilemaps) ? tilemaps : [tilemaps];
  const result = deleteTile(tileset, tileId, list);
  tileset.tiles = result.tileset.tiles;
  list.forEach((tilemap, index) => tilemap.tiles.set(result.tilemaps[index].tiles));
  return result.deleted;
}

export function clearTileReferences(tilemap: TilemapData, tileId: number): TilemapData {
  validateTilemapData(tilemap);
  const id = tileId & tileIndexMask;
  const tiles = tilemap.tiles.slice();
  for (let index = 0; index < tiles.length; index += 1) {
    if ((tiles[index] & tileIndexMask) === id) tiles[index] = 0;
  }
  return {...tilemap, tiles};
}

export function validateTilemapData(tilemap: TilemapData): true {
  if (!tilemap || !Number.isInteger(tilemap.columns) || !Number.isInteger(tilemap.rows) || tilemap.columns <= 0 || tilemap.rows <= 0) {
    throw new Error("Tilemap dimensions are invalid");
  }
  if (!(tilemap.tiles instanceof Uint32Array) || tilemap.tiles.length !== tilemap.columns * tilemap.rows) {
    throw new Error("Tilemap cells are invalid");
  }
  return true;
}

export function createTilemapData(columns: number, rows: number): TilemapData {
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns <= 0 || rows <= 0) throw new Error("Tilemap dimensions are invalid");
  return {columns, rows, tiles: new Uint32Array(columns * rows)};
}

export function getTileCell(tilemap: TilemapData, x: number, y: number): number {
  validateCellPosition(tilemap, x, y);
  return tilemap.tiles[y * tilemap.columns + x];
}

/** Pure cell update. The input tilemap and its Uint32Array are not modified. */
export function setTileCell(tilemap: TilemapData, x: number, y: number, value: number): TilemapData {
  validateCellPosition(tilemap, x, y);
  const normalized = normalizeTileValue(value);
  const tiles = tilemap.tiles.slice();
  tiles[y * tilemap.columns + x] = normalized;
  return {...tilemap, tiles};
}

export function setTileCellInPlace(tilemap: TilemapData, x: number, y: number, value: number): number {
  validateCellPosition(tilemap, x, y);
  const normalized = normalizeTileValue(value);
  tilemap.tiles[y * tilemap.columns + x] = normalized;
  return normalized;
}

export function flipTileValue(value: number, axis: "x" | "y" | "diagonal"): number {
  const flag = axis === "x" ? tileFlipX : axis === "y" ? tileFlipY : tileFlipDiagonal;
  return (normalizeTileValue(value) ^ flag) >>> 0;
}

export function tileValueIndex(value: number): number {
  return normalizeTileValue(value) & tileIndexMask;
}

export function tileValueFlags(value: number): number {
  return normalizeTileValue(value) & ~tileIndexMask;
}

/** Maps a destination tile pixel to its source pixel under the encoded flags. */
export function sourcePixelForTileValue(value: number, x: number, y: number, width: number, height: number) {
  assertTileDimensions(width, height);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= width || y < 0 || y >= height) throw new Error("Tile pixel position is invalid");
  const flags = tileValueFlags(value);
  if ((flags & tileFlipDiagonal) !== 0 && width !== height) throw new Error("Diagonal tile flips require square tiles");
  let sourceX = x;
  let sourceY = y;
  if ((flags & tileFlipDiagonal) !== 0) [sourceX, sourceY] = [sourceY, sourceX];
  if ((flags & tileFlipX) !== 0) sourceX = width - 1 - sourceX;
  if ((flags & tileFlipY) !== 0) sourceY = height - 1 - sourceY;
  return {x: sourceX, y: sourceY};
}

export function flipTilePixels(tile: Tile, tileWidth: number, tileHeight: number, axis: "x" | "y" | "diagonal"): Tile {
  assertTileDimensions(tileWidth, tileHeight);
  if (tile.pixels.length !== tileWidth * tileHeight * 4) throw new Error("Tile pixel dimensions are invalid");
  if (tile.indexes && tile.indexes.length !== tileWidth * tileHeight) throw new Error("Tile index dimensions are invalid");
  const value = flipTileValue(1, axis);
  const pixels = new Uint8ClampedArray(tile.pixels.length);
  const indexes = tile.indexes ? new Uint8Array(tile.indexes.length) : undefined;
  for (let y = 0; y < tileHeight; y += 1) {
    for (let x = 0; x < tileWidth; x += 1) {
      const source = sourcePixelForTileValue(value, x, y, tileWidth, tileHeight);
      const targetIndex = (y * tileWidth + x) * 4;
      const sourceIndex = (source.y * tileWidth + source.x) * 4;
      pixels.set(tile.pixels.subarray(sourceIndex, sourceIndex + 4), targetIndex);
      if (indexes) indexes[y * tileWidth + x] = tile.indexes![source.y * tileWidth + source.x];
    }
  }
  return {...tile, pixels, ...(indexes ? {indexes} : {})};
}

export interface RenderTilemapOptions {
  palette?: readonly string[];
  transparentIndex?: number;
}

/** Renders a tilemap Cel's authoritative cells into a newly allocated RGBA cache. */
export function renderTilemapCel(
  cel: Pick<Cel, "width" | "height" | "tilemap">,
  tileset: Tileset,
  options: RenderTilemapOptions = {},
): Uint8ClampedArray {
  validateTileset(tileset);
  if (!cel.tilemap) return new Uint8ClampedArray(cel.width * cel.height * 4);
  validateTilemapData(cel.tilemap);
  if (!Number.isInteger(cel.width) || !Number.isInteger(cel.height) || cel.width <= 0 || cel.height <= 0) throw new Error("Cel dimensions are invalid");
  const output = new Uint8ClampedArray(cel.width * cel.height * 4);
  for (let cellY = 0; cellY < cel.tilemap.rows; cellY += 1) {
    for (let cellX = 0; cellX < cel.tilemap.columns; cellX += 1) {
      const value = cel.tilemap.tiles[cellY * cel.tilemap.columns + cellX];
      const tile = findTile(tileset, value);
      if (!tile) continue;
      const startX = cellX * tileset.tileWidth;
      const startY = cellY * tileset.tileHeight;
      for (let y = 0; y < tileset.tileHeight; y += 1) {
        const targetY = startY + y;
        if (targetY < 0 || targetY >= cel.height) continue;
        for (let x = 0; x < tileset.tileWidth; x += 1) {
          const targetX = startX + x;
          if (targetX < 0 || targetX >= cel.width) continue;
          const source = sourcePixelForTileValue(value, x, y, tileset.tileWidth, tileset.tileHeight);
          const targetIndex = (targetY * cel.width + targetX) * 4;
          const sourcePixel = source.y * tileset.tileWidth + source.x;
          if (tile.indexes && options.palette) {
            writePalettePixel(output, targetIndex, tile.indexes[sourcePixel], options.palette, options.transparentIndex ?? 0);
          } else {
            output.set(tile.pixels.subarray(sourcePixel * 4, sourcePixel * 4 + 4), targetIndex);
          }
        }
      }
    }
  }
  return output;
}

export function renderTilemapCelIntoCache(cel: Cel, tileset: Tileset, options: RenderTilemapOptions = {}): Uint8ClampedArray {
  const pixels = renderTilemapCel(cel, tileset, options);
  cel.pixels = pixels;
  return pixels;
}

/** Converts every Cel belonging to an image layer into one tilemap layer and a shared deduplicated tileset. */
export function convertImageLayerToTilemap(
  document: PixelDocument,
  layerId = document.activeLayerId,
  options?: TilemapConversionOptions,
): TilemapConversionResult {
  const sourceLayer = document.layers.find((layer) => layer.id === layerId);
  if (!sourceLayer || sourceLayer.kind !== "image") throw new Error("The source layer must be an image layer");
  const tileWidth = options?.tileWidth ?? document.settings.gridWidth;
  const tileHeight = options?.tileHeight ?? document.settings.gridHeight;
  const offsetX = options?.offsetX ?? document.settings.gridOffsetX;
  const offsetY = options?.offsetY ?? document.settings.gridOffsetY;
  const tileset = createTileset({
    id: options?.tilesetId ?? createGeneratedID("tileset"),
    name: options?.tilesetName ?? `${sourceLayer.name} Tiles`,
    tileWidth,
    tileHeight,
  });
  const layer: Layer = {...sourceLayer, kind: "tilemap", tilesetId: tileset.id};
  const cels: Cel[] = [];
  const linked = new Map<string, Cel>();
  for (const sourceCel of Object.values(document.cels).filter((cel) => cel.layerId === sourceLayer.id)) {
    const linkedCel = linked.get(sourceCel.linkId);
    if (linkedCel) {
      cels.push({...linkedCel, id: sourceCel.id, layerId: layer.id, frameId: sourceCel.frameId});
      continue;
    }
    const converted = convertImageCelToTilemap(sourceCel, tileset, {
      tileWidth,
      tileHeight,
      offsetX,
      offsetY,
      palette: options?.palette ?? (document.colorMode === "indexed" ? document.palette.colors : undefined),
      transparentIndex: options?.transparentIndex ?? document.palette.transparentIndex,
    });
    tileset.tiles = converted.tileset.tiles;
    const cel: Cel = {
      ...sourceCel,
      layerId: layer.id,
      x: converted.x,
      y: converted.y,
      width: converted.width,
      height: converted.height,
      pixels: converted.pixels,
      indexes: sourceCel.indexes ? converted.indexes : undefined,
      tilemap: converted.tilemap,
    };
    linked.set(sourceCel.linkId, cel);
    cels.push(cel);
  }
  return {tileset, layer, cels};
}

export interface ConvertedImageCel {
  x: number;
  y: number;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  indexes?: Uint8Array;
  tilemap: TilemapData;
  tileset: Tileset;
}

export function convertImageCelToTilemap(
  sourceCel: Cel,
  tileset: Tileset,
  grid: ImageCelConversionOptions,
): ConvertedImageCel {
  validateTileset(tileset);
  const tileWidth = grid.tileWidth;
  const tileHeight = grid.tileHeight;
  assertTileDimensions(tileWidth, tileHeight);
  if (sourceCel.pixels.length !== sourceCel.width * sourceCel.height * 4) throw new Error("Cel pixel dimensions are invalid");
  const offsetX = grid.offsetX ?? 0;
  const offsetY = grid.offsetY ?? 0;
  const originX = Math.floor((sourceCel.x - offsetX) / tileWidth) * tileWidth + offsetX;
  const originY = Math.floor((sourceCel.y - offsetY) / tileHeight) * tileHeight + offsetY;
  const columns = Math.max(1, Math.ceil((sourceCel.x + sourceCel.width - originX) / tileWidth));
  const rows = Math.max(1, Math.ceil((sourceCel.y + sourceCel.height - originY) / tileHeight));
  let nextTileset = cloneTileset(tileset);
  const tilemap = createTilemapData(columns, rows);
  const sourceIndexes = sourceCel.indexes;
  const convertedIndexes = sourceIndexes ? new Uint8Array(columns * tileWidth * rows * tileHeight) : undefined;
  const transparentIndex = grid.transparentIndex ?? 0;
  for (let cellY = 0; cellY < rows; cellY += 1) {
    for (let cellX = 0; cellX < columns; cellX += 1) {
      const tilePixels = new Uint8ClampedArray(tileWidth * tileHeight * 4);
      const tileIndexes = sourceIndexes ? new Uint8Array(tileWidth * tileHeight) : undefined;
      if (tileIndexes) tileIndexes.fill(transparentIndex);
      for (let localY = 0; localY < tileHeight; localY += 1) {
        const worldY = originY + cellY * tileHeight + localY;
        for (let localX = 0; localX < tileWidth; localX += 1) {
          const worldX = originX + cellX * tileWidth + localX;
          const tilePixel = (localY * tileWidth + localX) * 4;
          const sourceX = worldX - sourceCel.x;
          const sourceY = worldY - sourceCel.y;
          if (sourceX < 0 || sourceX >= sourceCel.width || sourceY < 0 || sourceY >= sourceCel.height) continue;
          const sourcePixel = (sourceY * sourceCel.width + sourceX) * 4;
          tilePixels.set(sourceCel.pixels.subarray(sourcePixel, sourcePixel + 4), tilePixel);
          if (tileIndexes) {
            const paletteIndex = sourceIndexes![sourceY * sourceCel.width + sourceX];
            tileIndexes[localY * tileWidth + localX] = paletteIndex;
            convertedIndexes![(cellY * tileHeight + localY) * (columns * tileWidth) + cellX * tileWidth + localX] = paletteIndex;
          }
        }
      }
      const added = addTile(nextTileset, tilePixels, tileIndexes);
      nextTileset = added.tileset;
      tilemap.tiles[cellY * columns + cellX] = added.tile.id;
    }
  }
  const convertedCel: Pick<Cel, "width" | "height" | "tilemap"> = {width: columns * tileWidth, height: rows * tileHeight, tilemap};
  const pixels = renderTilemapCel(convertedCel, nextTileset, {
    palette: grid.palette,
    transparentIndex,
  });
  return {
    tileset: nextTileset,
    tilemap,
    x: originX,
    y: originY,
    width: columns * tileWidth,
    height: rows * tileHeight,
    pixels,
    ...(convertedIndexes ? {indexes: convertedIndexes} : {}),
  };
}

/** Returns how many cells reference a tile id, ignoring flip flags. */
export function tileReferenceCount(tilemap: TilemapData, tileId: number): number {
  validateTilemapData(tilemap);
  const id = tileId & tileIndexMask;
  return [...tilemap.tiles].filter((value) => (value & tileIndexMask) === id).length;
}

/** Draws one canvas pixel and returns cloned tilemap/Cel/Tileset state. */
export function drawTilemapPixel(
  cel: Cel,
  tileset: Tileset,
  pixelX: number,
  pixelY: number,
  color: readonly number[],
  options: TilePixelEditOptions = {},
): TilePixelEditResult {
  const nextCel: Cel = cloneCel(cel);
  const nextTileset = cloneTileset(tileset);
  return drawTilemapPixelInPlace(nextCel, nextTileset, pixelX, pixelY, color, options);
}

/** Draws one canvas pixel in-place. Empty cells become new tiles in all modes. */
export function drawTilemapPixelInPlace(
  cel: Cel,
  tileset: Tileset,
  pixelX: number,
  pixelY: number,
  color: readonly number[],
  options: TilePixelEditOptions = {},
): TilePixelEditResult {
  if (!cel.tilemap) throw new Error("Cel does not contain tilemap data");
  validateTileset(tileset);
  validateTilemapData(cel.tilemap);
  if (!Number.isInteger(pixelX) || !Number.isInteger(pixelY) || pixelX < 0 || pixelY < 0 || pixelX >= cel.width || pixelY >= cel.height) {
    throw new Error("Tile pixel position is outside the Cel");
  }
  const cellX = Math.floor(pixelX / tileset.tileWidth);
  const cellY = Math.floor(pixelY / tileset.tileHeight);
  if (cellX >= cel.tilemap.columns || cellY >= cel.tilemap.rows) throw new Error("Tile pixel position is outside the tilemap");
  const cellOffset = cellY * cel.tilemap.columns + cellX;
  const oldValue = cel.tilemap.tiles[cellOffset];
  const oldId = tileValueIndex(oldValue);
  const mode = options.mode ?? "manual";
  const references = tileReferenceCount(cel.tilemap, oldId);
  let tile = findTile(tileset, oldValue);
  let created = false;
  if (!tile || mode === "stack" || (mode === "auto" && references > 1)) {
    const sourcePixels = tile?.pixels ?? new Uint8ClampedArray(tileset.tileWidth * tileset.tileHeight * 4);
    const sourceIndexes = tile?.indexes;
    if (tile && (mode === "stack" || (mode === "auto" && references > 1))) {
      tile = appendTile(tileset, sourcePixels, sourceIndexes);
    } else {
      const added = addTile(tileset, sourcePixels, sourceIndexes);
      tileset.tiles = added.tileset.tiles;
      tile = tileset.tiles.find((candidate) => candidate.id === added.tile.id)!;
    }
    created = true;
    cel.tilemap.tiles[cellOffset] = (tile.id | tileValueFlags(oldValue)) >>> 0;
  }
  if (!tile) throw new Error("Unable to allocate tile");
  const localX = pixelX % tileset.tileWidth;
  const localY = pixelY % tileset.tileHeight;
  const activeValue = cel.tilemap.tiles[cellOffset];
  const source = sourcePixelForTileValue(activeValue, localX, localY, tileset.tileWidth, tileset.tileHeight);
  const sourcePixel = source.y * tileset.tileWidth + source.x;
  const normalizedColor = normalizeRGBA(color);
  tile.pixels.set(normalizedColor, sourcePixel * 4);
  if (options.palette) {
    if (!tile.indexes) tile.indexes = new Uint8Array(tileset.tileWidth * tileset.tileHeight);
    tile.indexes[sourcePixel] = nearestPaletteIndex(normalizedColor, options.palette);
    writePalettePixel(tile.pixels, sourcePixel * 4, tile.indexes[sourcePixel], options.palette, options.transparentIndex ?? 0);
  }
  const actual = tileset.tiles.find((candidate) => candidate.id === tile!.id);
  if (actual && actual !== tile) {
    actual.pixels = tile.pixels;
    actual.indexes = tile.indexes;
  }
  cel.pixels = renderTilemapCel(cel, tileset, options);
  if (cel.indexes && options.palette) {
    cel.indexes = indexesFromPixels(cel.pixels, cel.width, cel.height, options.palette, options.transparentIndex ?? 0);
  }
  return {tileset, cel, tileId: tile.id, cellX, cellY, localX, localY, created};
}

/** Synchronizes an indexed tile's RGBA cache from its authoritative indexes. */
export function syncTilePixels(tile: Tile, palette: readonly string[], transparentIndex = 0): Tile {
  if (!tile.indexes) return cloneTile(tile);
  const pixels = new Uint8ClampedArray(tile.indexes.length * 4);
  for (let index = 0; index < tile.indexes.length; index += 1) writePalettePixel(pixels, index * 4, tile.indexes[index], palette, transparentIndex);
  return {...tile, pixels, indexes: tile.indexes.slice()};
}

/** Synchronizes an indexed tile's indexes from its RGBA pixels using nearest palette colors. */
export function syncTileIndexes(tile: Tile, palette: readonly string[], transparentIndex = 0): Tile {
  const indexes = indexesFromPixels(tile.pixels, 1, tile.pixels.length / 4, palette, transparentIndex);
  return {...tile, pixels: tile.pixels.slice(), indexes};
}

export function synchronizeTile(tile: Tile, palette: readonly string[], transparentIndex = 0, source: "pixels" | "indexes" = "pixels"): Tile {
  return source === "indexes" ? syncTilePixels(tile, palette, transparentIndex) : syncTileIndexes(tile, palette, transparentIndex);
}

function cloneTile(tile: Tile): Tile {
  return {...tile, pixels: tile.pixels.slice(), ...(tile.indexes ? {indexes: tile.indexes.slice()} : {})};
}

function cloneCel(cel: Cel): Cel {
  return {
    ...cel,
    pixels: cel.pixels.slice(),
    ...(cel.indexes ? {indexes: cel.indexes.slice()} : {}),
    ...(cel.tilemap ? {tilemap: {...cel.tilemap, tiles: cel.tilemap.tiles.slice()}} : {}),
  };
}

function normalizeTileValue(value: number) {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff) throw new Error("Tile value is invalid");
  return value >>> 0;
}

function nextTileID(tileset: Tileset) {
  let id = 1;
  const used = new Set(tileset.tiles.map((tile) => tile.id));
  while (used.has(id)) id += 1;
  if (id > tileIndexMask) throw new Error("Tileset has reached its tile limit");
  return id;
}

function appendTile(tileset: Tileset, pixels: Uint8ClampedArray, indexes?: Uint8Array): Tile {
  const tile: Tile = {
    id: nextTileID(tileset),
    pixels: pixels.slice(),
    ...(indexes ? {indexes: indexes.slice()} : {}),
  };
  tileset.tiles.push(tile);
  return tile;
}

function validateCellPosition(tilemap: TilemapData, x: number, y: number) {
  validateTilemapData(tilemap);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= tilemap.columns || y >= tilemap.rows) {
    throw new Error("Tile cell position is outside the tilemap");
  }
}

function assertTileDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > 4096 || height > 4096) {
    throw new Error("Tile dimensions must be positive integers no larger than 4096");
  }
}

function bytesEqual(left: ArrayLike<number>, right: ArrayLike<number>) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

function createGeneratedID(prefix: string) {
  generatedID += 1;
  return `${prefix}-${generatedID}`;
}

function normalizeRGBA(color: ArrayLike<number>) {
  if (color.length < 3) throw new Error("RGBA color requires at least three channels");
  return new Uint8ClampedArray([color[0] ?? 0, color[1] ?? 0, color[2] ?? 0, color[3] ?? 255]);
}

function parsePaletteColor(value: string): [number, number, number, number] {
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
  if (!match) return [0, 0, 0, 0];
  return [
    Number.parseInt(match[1].slice(0, 2), 16),
    Number.parseInt(match[1].slice(2, 4), 16),
    Number.parseInt(match[1].slice(4, 6), 16),
    match[2] ? Number.parseInt(match[2], 16) : 255,
  ];
}

function writePalettePixel(pixels: Uint8ClampedArray, offset: number, index: number, palette: readonly string[], transparentIndex: number) {
  const color = parsePaletteColor(palette[index] ?? "#00000000");
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = index === transparentIndex ? 0 : color[3];
}

function nearestPaletteIndex(color: ArrayLike<number>, palette: readonly string[]) {
  if (color[3] === 0) return 0;
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < palette.length; index += 1) {
    const candidate = parsePaletteColor(palette[index]);
    const dr = candidate[0] - color[0];
    const dg = candidate[1] - color[1];
    const db = candidate[2] - color[2];
    const da = candidate[3] - color[3];
    const next = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11 + da * da;
    if (next < distance) {
      distance = next;
      best = index;
    }
  }
  return best;
}

function indexesFromPixels(pixels: Uint8ClampedArray, width: number, height: number, palette: readonly string[], transparentIndex: number) {
  if (!palette.length) return new Uint8Array(pixels.length / 4);
  if (width * height * 4 !== pixels.length) throw new Error("Pixel dimensions are invalid");
  const indexes = new Uint8Array(width * height);
  for (let pixel = 0; pixel < indexes.length; pixel += 1) indexes[pixel] = pixels[pixel * 4 + 3] === 0 ? transparentIndex : nearestPaletteIndex(pixels.subarray(pixel * 4, pixel * 4 + 4), palette);
  return indexes;
}

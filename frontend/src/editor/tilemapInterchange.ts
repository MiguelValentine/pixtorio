import {
  tileFlipDiagonal,
  tileFlipX,
  tileFlipY,
  tileIndexMask,
  type Cel,
  type Tileset,
  type TilesetGrid,
  type TilemapData,
  type PixelDocument,
} from "./document";
import {
  terrainEmpty,
  validateTerrainDefinitions,
  type TerrainDefinition,
  type TerrainMapData,
} from "./terrain";
import {validateTileGridLayout, type TileGridLayout} from "./tileGrid";
import {tilemapPixelSize} from "./tilemapGeometry";

export const tilemapInterchangeFormat = "pixtorio-tilemap-v1" as const;
export const TILEMAP_INTERCHANGE_FORMAT = tilemapInterchangeFormat;

/** Validate references which will survive replacement of one linked Cel group. */
export function validateTilesetBundleReferences(
  document: Pick<PixelDocument, "layers" | "cels">,
  tilesetId: string,
  replacedLinkId: string,
  imported: TilemapInterchangeTileset,
) {
  const tileIDs = new Set(imported.tileIds);
  const terrainIDs = new Set(imported.terrains.map((terrain) => terrain.id));
  const layerIDs = new Set(document.layers
    .filter((layer) => layer.kind === "tilemap" && layer.tilesetId === tilesetId)
    .map((layer) => layer.id));
  for (const cel of Object.values(document.cels)) {
    if (!layerIDs.has(cel.layerId) || !cel.tilemap || cel.linkId === replacedLinkId) continue;
    if (!cel.terrainmap) {
      for (const value of cel.tilemap.tiles) {
        const tileID = value & tileIndexMask;
        if (tileID !== 0 && !tileIDs.has(tileID)) throw new Error("Tileset bundle would remove a Tile ID used by another Cel");
        if ((value & tileFlipDiagonal) !== 0 && imported.tileWidth !== imported.tileHeight) {
          throw new Error("Tileset bundle is incompatible with diagonal flags in another Cel");
        }
      }
    }
    if (cel.terrainmap) {
      for (const terrainID of cel.terrainmap.terrains) {
        if (terrainID !== 0 && terrainID !== terrainEmpty && !terrainIDs.has(terrainID)) {
          throw new Error("Tileset bundle would remove a Terrain used by another Cel");
        }
      }
    }
  }
}

const tileFlagMask = (tileFlipX | tileFlipY | tileFlipDiagonal) >>> 0;

export interface TilemapInterchangeTileset {
  id: string;
  name: string;
  tileWidth: number;
  tileHeight: number;
  grid: TilesetGrid;
  /** Tile metadata is exchanged without pixel payloads. Tile 0 is implicit. */
  tileIds: number[];
  terrains: TerrainDefinition[];
}

export interface TilemapInterchangeTilemapJSON {
  columns: number;
  rows: number;
  gridOffset?: TilemapData["gridOffset"];
  tiles: number[];
}

export interface TilemapInterchangeTerrainMapJSON {
  columns: number;
  rows: number;
  seed: number;
  cells: number[];
}

export interface TilemapInterchangeCel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TilemapInterchangeTilesetImage {
  file: string;
  width: number;
  height: number;
  tiles: Array<{tileId: number; x: number; y: number; width: number; height: number}>;
}

export interface TilemapInterchangeJSON {
  format: typeof tilemapInterchangeFormat;
  tileset: TilemapInterchangeTileset;
  tilemap: TilemapInterchangeTilemapJSON;
  terrainmap?: TilemapInterchangeTerrainMapJSON;
  cel: TilemapInterchangeCel;
  tilesetImage?: TilemapInterchangeTilesetImage;
}

export interface TilemapInterchangeTerrainMap {
  columns: number;
  rows: number;
  seed: number;
  cells: Uint16Array;
}

export interface TilemapInterchangeData {
  format: typeof tilemapInterchangeFormat;
  tileset: TilemapInterchangeTileset;
  tilemap: TilemapData;
  terrainmap?: TilemapInterchangeTerrainMap;
  cel: TilemapInterchangeCel;
  tilesetImage?: TilemapInterchangeTilesetImage;
}

export type TilemapInterchangeTilesetSource = Tileset | TilemapInterchangeTileset;

export interface TilemapInterchangeInput {
  tileset: TilemapInterchangeTilesetSource;
  tilemap: TilemapData;
  terrainmap?: TerrainMapData | TilemapInterchangeTerrainMap;
  cel: TilemapInterchangeCel | Pick<Cel, "x" | "y" | "width" | "height">;
  tilesetImage?: TilemapInterchangeTilesetImage;
}

export interface TilemapCsvOptions {
  tileset?: TilemapInterchangeTilesetSource;
  terrainmap?: TerrainMapData | TilemapInterchangeTerrainMap;
  hasTerrain?: boolean;
}

interface CanonicalInterchangeData {
  format: typeof tilemapInterchangeFormat;
  tileset: TilemapInterchangeTileset;
  tilemap: TilemapData;
  terrainmap?: TilemapInterchangeTerrainMap;
  cel: TilemapInterchangeCel;
  tilesetImage?: TilemapInterchangeTilesetImage;
}

/** Serializes one tilemap Cel and its tileset metadata as strict v1 JSON. */
export function exportTilemapJson(input: TilemapInterchangeInput): string {
  const data = normalizeInput(input);
  return JSON.stringify(toJsonValue(data));
}

/** Parses strict v1 JSON and returns independent typed-array data. */
export function importTilemapJson(payload: string): TilemapInterchangeData {
  if (typeof payload !== "string") throw new Error("Tilemap interchange JSON must be a string");

  let value: unknown;
  try {
    value = JSON.parse(payload) as unknown;
  } catch {
    throw new Error("Tilemap interchange JSON is invalid");
  }
  return normalizeJsonValue(value);
}

/** Validates a parsed v1 value without exposing mutable internal references. */
export function validateTilemapInterchange(value: unknown): true {
  normalizeJsonValue(value);
  return true;
}

/** Exports a lossless row-major CSV for a tile-ID-only tilemap. */
export function exportTilemapCsv(
  source: TilemapData | TilemapInterchangeInput | {tilemap: TilemapData; tileset?: TilemapInterchangeTilesetSource; terrainmap?: TerrainMapData | TilemapInterchangeTerrainMap},
  options: TilemapCsvOptions = {},
): string {
  const context = normalizeCsvSource(source, options);
  rejectCsvLossyData(context);
  const rows: string[] = [];
  for (let row = 0; row < context.tilemap.rows; row += 1) {
    const values: string[] = [];
    for (let column = 0; column < context.tilemap.columns; column += 1) {
      values.push(String(context.tilemap.tiles[row * context.tilemap.columns + column]));
    }
    rows.push(values.join(","));
  }
  return rows.join("\n");
}

/** Imports strict rectangular non-negative integer CSV as a flag-free tilemap. */
export function importTilemapCsv(csv: string, options: TilemapCsvOptions = {}): TilemapData {
  if (typeof csv !== "string") throw new Error("Tilemap CSV must be a string");
  const tileset = options.tileset ? normalizeTilesetSource(options.tileset) : undefined;
  if (options.terrainmap !== undefined || options.hasTerrain || tileset?.terrains.length) {
    throw new Error("Tilemap CSV cannot represent Terrain data");
  }

  const rows = parseCsvRows(csv);
  const columns = rows[0].length;
  const values = rows.flat();
  const tilemap: TilemapData = {
    columns,
    rows: rows.length,
    tiles: new Uint32Array(values),
  };
  validateTilemapData(tilemap, tileset?.tileIds);
  return {...tilemap, tiles: tilemap.tiles.slice()};
}

export const exportTilemapJSON = exportTilemapJson;
export const importTilemapJSON = importTilemapJson;
export const exportTilemapCSV = exportTilemapCsv;
export const importTilemapCSV = importTilemapCsv;
export const encodeTilemapInterchange = exportTilemapJson;
export const decodeTilemapInterchange = importTilemapJson;

function normalizeInput(input: TilemapInterchangeInput): CanonicalInterchangeData {
  if (!isRecord(input)) throw new Error("Tilemap interchange input is required");
  const tileset = normalizeTilesetSource(input.tileset);
  const tilemap = normalizeTilemap(input.tilemap, tileset.tileIds, tileset.tileWidth, tileset.tileHeight, tileset.grid);
  const cel = normalizeCel(input.cel);
  validateCelAndTilemapDimensions(cel, tilemap, tileset);
  const terrainmap = input.terrainmap === undefined
    ? undefined
    : normalizeTerrainmap(input.terrainmap, tilemap.columns, tilemap.rows, tileset.terrains);
  const tilesetImage = input.tilesetImage === undefined
    ? undefined
    : normalizeTilesetImage(input.tilesetImage, tileset.tileIds, tileset.tileWidth, tileset.tileHeight);
  return {format: tilemapInterchangeFormat, tileset, tilemap, terrainmap, cel, ...(tilesetImage ? {tilesetImage} : {})};
}

function normalizeJsonValue(value: unknown): TilemapInterchangeData {
  if (!isRecord(value)) throw new Error("Tilemap interchange JSON must be an object");
  assertKeys(value, ["format", "tileset", "tilemap", "terrainmap", "cel", "tilesetImage"], "Tilemap interchange");
  if (value.format !== tilemapInterchangeFormat) throw new Error("Unsupported tilemap interchange format");

  const tileset = parseTileset(value.tileset);
  const tilemapValue = parseTilemap(value.tilemap);
  const tilemap = normalizeTilemap(tilemapValue, tileset.tileIds, tileset.tileWidth, tileset.tileHeight, tileset.grid);
  const cel = parseCel(value.cel);
  validateCelAndTilemapDimensions(cel, tilemap, tileset);
  const terrainmap = value.terrainmap === undefined
    ? undefined
    : parseTerrainmap(value.terrainmap, tilemap.columns, tilemap.rows, tileset.terrains);
  const tilesetImage = value.tilesetImage === undefined
    ? undefined
    : normalizeTilesetImage(value.tilesetImage, tileset.tileIds, tileset.tileWidth, tileset.tileHeight);

  return {
    format: tilemapInterchangeFormat,
    tileset,
    tilemap: {...tilemap, tiles: tilemap.tiles.slice()},
    ...(terrainmap ? {terrainmap: cloneTerrainmap(terrainmap)} : {}),
    cel: {...cel},
    ...(tilesetImage ? {tilesetImage} : {}),
  };
}

function toJsonValue(data: CanonicalInterchangeData): TilemapInterchangeJSON {
  return {
    format: tilemapInterchangeFormat,
    tileset: cloneTilesetMetadata(data.tileset),
    tilemap: {
      columns: data.tilemap.columns,
      rows: data.tilemap.rows,
      ...(data.tilemap.gridOffset ? {gridOffset: data.tilemap.gridOffset} : {}),
      tiles: Array.from(data.tilemap.tiles),
    },
    ...(data.terrainmap ? {
      terrainmap: {
        columns: data.terrainmap.columns,
        rows: data.terrainmap.rows,
        seed: data.terrainmap.seed,
        cells: Array.from(data.terrainmap.cells),
      },
    } : {}),
    cel: {...data.cel},
    ...(data.tilesetImage ? {tilesetImage: normalizeTilesetImage(
      data.tilesetImage,
      data.tileset.tileIds,
      data.tileset.tileWidth,
      data.tileset.tileHeight,
    )} : {}),
  };
}

function normalizeTilesetImage(
  value: unknown,
  tileIds: readonly number[],
  tileWidth: number,
  tileHeight: number,
): TilemapInterchangeTilesetImage {
  if (!isRecord(value)) throw new Error("Tileset image metadata is invalid");
  assertKeys(value, ["file", "width", "height", "tiles"], "Tileset image metadata");
  if (typeof value.file !== "string" || !value.file.trim() || value.file.includes("/") || value.file.includes("\\")) {
    throw new Error("Tileset image file is invalid");
  }
  validatePositiveInteger(value.width as number, "Tileset image width");
  validatePositiveInteger(value.height as number, "Tileset image height");
  if (!Array.isArray(value.tiles) || value.tiles.length !== tileIds.length) throw new Error("Tileset image tiles are invalid");
  const expected = new Set(tileIds);
  const seen = new Set<number>();
  const tiles = value.tiles.map((candidate) => {
    if (!isRecord(candidate)) throw new Error("Tileset image tile is invalid");
    assertKeys(candidate, ["tileId", "x", "y", "width", "height"], "Tileset image tile");
    if (!Number.isSafeInteger(candidate.tileId) || !expected.has(candidate.tileId as number) || seen.has(candidate.tileId as number)
      || !Number.isSafeInteger(candidate.x) || (candidate.x as number) < 0
      || !Number.isSafeInteger(candidate.y) || (candidate.y as number) < 0
      || candidate.width !== tileWidth || candidate.height !== tileHeight
      || (candidate.x as number) + tileWidth > (value.width as number)
      || (candidate.y as number) + tileHeight > (value.height as number)) {
      throw new Error("Tileset image tile is invalid");
    }
    seen.add(candidate.tileId as number);
    return {
      tileId: candidate.tileId as number,
      x: candidate.x as number,
      y: candidate.y as number,
      width: tileWidth,
      height: tileHeight,
    };
  });
  return {file: value.file, width: value.width as number, height: value.height as number, tiles};
}

function normalizeTilesetSource(source: TilemapInterchangeTilesetSource): TilemapInterchangeTileset {
  if (!isRecord(source)) throw new Error("Tilemap tileset is required");
  const id = source.id;
  const name = source.name;
  const tileWidth = source.tileWidth;
  const tileHeight = source.tileHeight;
  const grid = source.grid;
  const terrains = source.terrains;
  const tileIds = "tileIds" in source
    ? source.tileIds
    : Array.isArray(source.tiles) ? source.tiles.map((tile) => tile?.id) : undefined;

  validateStringId(id, "Tileset id");
  if (typeof name !== "string" || name.trim() === "") throw new Error("Tileset name is invalid");
  validatePositiveInteger(tileWidth, "Tile width");
  validatePositiveInteger(tileHeight, "Tile height");
  const normalizedGrid = normalizeGrid(grid, tileWidth, tileHeight);
  const normalizedTileIds = normalizeTileIds(tileIds);
  if (!Array.isArray(terrains)) throw new Error("Tileset terrains are invalid");
  const normalizedTerrains = normalizeTerrainDefinitions(
    terrains,
    normalizedGrid,
    normalizedTileIds,
    tileWidth,
    tileHeight,
  );

  return {
    id,
    name,
    tileWidth,
    tileHeight,
    grid: normalizedGrid,
    tileIds: normalizedTileIds,
    terrains: normalizedTerrains,
  };
}

function parseTileset(value: unknown): TilemapInterchangeTileset {
  if (!isRecord(value)) throw new Error("Tilemap tileset is invalid");
  assertKeys(value, ["id", "name", "tileWidth", "tileHeight", "grid", "tileIds", "terrains"], "Tilemap tileset");
  requireField(value, "id", "Tilemap tileset");
  requireField(value, "name", "Tilemap tileset");
  requireField(value, "tileWidth", "Tilemap tileset");
  requireField(value, "tileHeight", "Tilemap tileset");
  requireField(value, "grid", "Tilemap tileset");
  requireField(value, "tileIds", "Tilemap tileset");
  requireField(value, "terrains", "Tilemap tileset");
  if (!Array.isArray(value.tileIds)) throw new Error("Tilemap tileset tileIds are invalid");
  validateStringId(value.id, "Tileset id");
  if (typeof value.name !== "string" || value.name.trim() === "") throw new Error("Tileset name is invalid");
  validatePositiveInteger(value.tileWidth as number, "Tile width");
  validatePositiveInteger(value.tileHeight as number, "Tile height");
  const grid = normalizeGrid(value.grid as TilesetGrid, value.tileWidth as number, value.tileHeight as number);
  const tileIds = normalizeTileIds(value.tileIds);
  const terrains = parseTerrainDefinitions(
    value.terrains,
    grid,
    tileIds,
    value.tileWidth as number,
    value.tileHeight as number,
  );
  return {
    id: value.id,
    name: value.name,
    tileWidth: value.tileWidth,
    tileHeight: value.tileHeight,
    grid,
    tileIds,
    terrains,
  };
}

function normalizeGrid(grid: TilesetGrid, tileWidth: number, tileHeight: number): TilesetGrid {
  if (!isRecord(grid)) throw new Error("Tilemap grid is invalid");
  const candidate = grid as Record<string, unknown>;
  if (candidate.kind === "orthogonal") {
    assertKeys(candidate, ["kind"], "Tilemap grid");
  } else if (candidate.kind === "isometric") {
    assertKeys(candidate, ["kind", "cellWidth", "cellHeight", "anchorX", "anchorY"], "Tilemap grid");
  } else if (candidate.kind === "hexagonal") {
    assertKeys(candidate, ["kind", "orientation", "offset"], "Tilemap grid");
  } else {
    throw new Error("Tilemap grid kind is invalid");
  }

  const cloned = candidate.kind === "hexagonal"
    ? {
      kind: "hexagonal" as const,
      orientation: candidate.orientation as "pointy" | "flat",
      offset: candidate.offset as "odd-r" | "even-r" | "odd-q" | "even-q",
    }
    : candidate.kind === "isometric"
      ? {
        kind: "isometric" as const,
        cellWidth: candidate.cellWidth as number,
        cellHeight: candidate.cellHeight as number,
        anchorX: candidate.anchorX as number,
        anchorY: candidate.anchorY as number,
      }
      : {kind: "orthogonal" as const};
  try {
    validateTileGridLayout({
      kind: cloned.kind,
      tileWidth: cloned.kind === "isometric" ? cloned.cellWidth : tileWidth,
      tileHeight: cloned.kind === "isometric" ? cloned.cellHeight : tileHeight,
      ...(cloned.kind === "hexagonal" ? {orientation: cloned.orientation, offset: cloned.offset} : {}),
    } as TileGridLayout);
  } catch (error) {
    throw new Error(`Tilemap grid is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (cloned.kind === "isometric"
    && (!Number.isInteger(cloned.cellWidth) || cloned.cellWidth <= 0
      || !Number.isInteger(cloned.cellHeight) || cloned.cellHeight <= 0
      || !Number.isInteger(cloned.anchorX) || cloned.anchorX < 0 || cloned.anchorX > tileWidth
      || !Number.isInteger(cloned.anchorY) || cloned.anchorY < 0 || cloned.anchorY > tileHeight)) {
    throw new Error("Tilemap isometric grid is invalid");
  }
  return cloned;
}

function parseTilemap(value: unknown): TilemapInterchangeTilemapJSON {
  if (!isRecord(value)) throw new Error("Tilemap data is invalid");
  assertKeys(value, ["columns", "rows", "gridOffset", "tiles"], "Tilemap data");
  requireField(value, "columns", "Tilemap data");
  requireField(value, "rows", "Tilemap data");
  requireField(value, "tiles", "Tilemap data");
  if (!Array.isArray(value.tiles)) throw new Error("Tilemap tile values are invalid");
  return {
    columns: value.columns as number,
    rows: value.rows as number,
    ...(value.gridOffset === undefined ? {} : {gridOffset: value.gridOffset as TilemapData["gridOffset"]}),
    tiles: value.tiles as number[],
  };
}

function normalizeTilemap(
  tilemap: TilemapData | TilemapInterchangeTilemapJSON,
  tileIds?: readonly number[],
  tileWidth?: number,
  tileHeight?: number,
  grid?: TilesetGrid,
): TilemapData {
  if (!isRecord(tilemap)) throw new Error("Tilemap data is required");
  const columns = tilemap.columns;
  const rows = tilemap.rows;
  validateMapDimensions(columns, rows, "Tilemap dimensions");
  const values = tilemap.tiles;
  const gridOffset = normalizeTilemapGridOffset(tilemap.gridOffset, grid);
  if (!(values instanceof Uint32Array) && !Array.isArray(values)) throw new Error("Tilemap tile values are invalid");
  if (values.length !== columns * rows) throw new Error("Tilemap tile dimensions are invalid");
  const tiles = new Uint32Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    validateUint32(value, `Tilemap tile value ${index}`);
    const normalized = value >>> 0;
    const tileId = normalized & tileIndexMask;
    if (tileIds && tileId !== 0 && !tileIds.includes(tileId)) {
      throw new Error(`Tilemap references unknown tile ${tileId}`);
    }
    if ((normalized & tileFlipDiagonal) !== 0 && tileWidth !== undefined && tileHeight !== undefined && tileWidth !== tileHeight) {
      throw new Error("Diagonal tile flips require square tiles");
    }
    tiles[index] = normalized;
  }
  return {columns, rows, ...(gridOffset ? {gridOffset} : {}), tiles};
}

function normalizeTilemapGridOffset(value: unknown, grid?: TilesetGrid): TilemapData["gridOffset"] {
  if (value === undefined) return undefined;
  if (value !== "odd-r" && value !== "even-r" && value !== "odd-q" && value !== "even-q") {
    throw new Error("Tilemap grid offset is invalid");
  }
  if (!grid || grid.kind !== "hexagonal"
    || (grid.orientation === "pointy" && !value.endsWith("-r"))
    || (grid.orientation === "flat" && !value.endsWith("-q"))) {
    throw new Error("Tilemap grid offset does not match the Tileset grid");
  }
  return value;
}

function validateTilemapData(tilemap: TilemapData, tileIds?: readonly number[], tileWidth?: number, tileHeight?: number) {
  validateMapDimensions(tilemap.columns, tilemap.rows, "Tilemap dimensions");
  if (!(tilemap.tiles instanceof Uint32Array) || tilemap.tiles.length !== tilemap.columns * tilemap.rows) {
    throw new Error("Tilemap tile values are invalid");
  }
  for (let index = 0; index < tilemap.tiles.length; index += 1) {
    const value = tilemap.tiles[index];
    const tileId = value & tileIndexMask;
    if (tileIds && tileId !== 0 && !tileIds.includes(tileId)) throw new Error(`Tilemap references unknown tile ${tileId}`);
    if ((value & tileFlipDiagonal) !== 0 && tileWidth !== undefined && tileHeight !== undefined && tileWidth !== tileHeight) {
      throw new Error("Diagonal tile flips require square tiles");
    }
  }
}

function parseTerrainmap(
  value: unknown,
  columns: number,
  rows: number,
  terrains: readonly TerrainDefinition[],
): TilemapInterchangeTerrainMap {
  if (!isRecord(value)) throw new Error("Terrain map is invalid");
  assertKeys(value, ["columns", "rows", "seed", "cells"], "Terrain map");
  requireField(value, "columns", "Terrain map");
  requireField(value, "rows", "Terrain map");
  requireField(value, "seed", "Terrain map");
  requireField(value, "cells", "Terrain map");
  if (!Array.isArray(value.cells)) throw new Error("Terrain map cells are invalid");
  return normalizeTerrainmap({
    columns: value.columns as number,
    rows: value.rows as number,
    seed: value.seed as number,
    cells: value.cells as number[],
  }, columns, rows, terrains);
}

function normalizeTerrainmap(
  value: TerrainMapData | TilemapInterchangeTerrainMap | {columns: number; rows: number; seed: number; cells: number[]},
  columns: number,
  rows: number,
  terrains: readonly TerrainDefinition[],
): TilemapInterchangeTerrainMap {
  if (!isRecord(value)) throw new Error("Terrain map is invalid");
  if (value.columns !== columns || value.rows !== rows) throw new Error("Terrain map dimensions do not match tilemap");
  validateMapDimensions(value.columns, value.rows, "Terrain map dimensions");
  if (!Number.isSafeInteger(value.seed)) throw new Error("Terrain map seed is invalid");
  const cells = "cells" in value ? value.cells : value.terrains;
  if (!(cells instanceof Uint16Array) && !Array.isArray(cells)) throw new Error("Terrain map cells are invalid");
  if (cells.length !== columns * rows) throw new Error("Terrain map cell dimensions are invalid");
  const terrainIds = new Set(terrains.map((terrain) => terrain.id));
  const normalized = new Uint16Array(cells.length);
  for (let index = 0; index < cells.length; index += 1) {
    const terrainId = cells[index];
    if (!Number.isSafeInteger(terrainId) || terrainId < 0 || terrainId > 0xffff) {
      throw new Error(`Terrain map cell ${index} is invalid`);
    }
    if (terrainId !== 0 && terrainId !== terrainEmpty && !terrainIds.has(terrainId)) {
      throw new Error(`Terrain map references unknown terrain ${terrainId}`);
    }
    normalized[index] = terrainId;
  }
  return {columns, rows, seed: value.seed, cells: normalized};
}

function parseCel(value: unknown): TilemapInterchangeCel {
  if (!isRecord(value)) throw new Error("Cel geometry is invalid");
  assertKeys(value, ["x", "y", "width", "height"], "Cel geometry");
  requireField(value, "x", "Cel geometry");
  requireField(value, "y", "Cel geometry");
  requireField(value, "width", "Cel geometry");
  requireField(value, "height", "Cel geometry");
  return normalizeCel(value as TilemapInterchangeCel);
}

function normalizeCel(cel: TilemapInterchangeCel | Pick<Cel, "x" | "y" | "width" | "height">): TilemapInterchangeCel {
  if (!isRecord(cel)) throw new Error("Cel geometry is required");
  if (!Number.isSafeInteger(cel.x) || !Number.isSafeInteger(cel.y)) throw new Error("Cel offsets are invalid");
  validatePositiveInteger(cel.width, "Cel width");
  validatePositiveInteger(cel.height, "Cel height");
  return {x: cel.x, y: cel.y, width: cel.width, height: cel.height};
}

function validateCelAndTilemapDimensions(
  cel: TilemapInterchangeCel,
  tilemap: TilemapData,
  tileset: TilemapInterchangeTileset,
) {
  if (tileset.grid.kind === "orthogonal") {
    const expectedColumns = Math.ceil(cel.width / tileset.tileWidth);
    const expectedRows = Math.ceil(cel.height / tileset.tileHeight);
    if (tilemap.columns === expectedColumns && tilemap.rows === expectedRows) return;
  } else {
    const geometryTileset: Tileset = {
      id: tileset.id,
      name: tileset.name,
      tileWidth: tileset.tileWidth,
      tileHeight: tileset.tileHeight,
      grid: {...tileset.grid},
      terrains: [],
      tiles: [],
    };
    const expected = tilemapPixelSize(geometryTileset, tilemap);
    if (cel.width === expected.width && cel.height === expected.height) return;
  }
  throw new Error("Tilemap dimensions do not match Cel geometry");
}

function normalizeTerrainDefinitions(
  definitions: readonly TerrainDefinition[],
  grid: TilesetGrid,
  tileIds: readonly number[],
  tileWidth: number,
  tileHeight: number,
): TerrainDefinition[] {
  if (!Array.isArray(definitions)) throw new Error("Tileset terrains are invalid");
  const cloned = definitions.map((definition) => {
    const validDefinition = validateTerrainShape(definition);
    return {
      ...validDefinition,
      rules: validDefinition.rules.map((rule: TerrainDefinition["rules"][number]) => ({
        ...rule,
        candidates: rule.candidates.map((candidate: TerrainDefinition["rules"][number]["candidates"][number]) => ({
          ...candidate,
          flags: normalizeFlags(candidate.flags, "Terrain candidate flags"),
        })),
      })),
    };
  });
  const terrainGrid = gridToLayout(grid, tileWidth, tileHeight);
  try {
    validateTerrainDefinitions(cloned, terrainGrid);
  } catch (error) {
    throw new Error(`Tileset terrains are invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  for (const definition of cloned) {
    for (const rule of definition.rules) {
      for (const candidate of rule.candidates) {
        if (!tileIds.includes(candidate.tileId)) throw new Error(`Terrain candidate references unknown tile ${candidate.tileId}`);
        if ((candidate.flags & tileFlipDiagonal) !== 0 && tileWidth !== tileHeight) {
          throw new Error("Diagonal terrain candidate flags require square tiles");
        }
      }
    }
  }
  return cloned;
}

function validateTerrainShape(definition: TerrainDefinition): TerrainDefinition {
  if (!isRecord(definition)) throw new Error("Terrain definition is invalid");
  if (!Array.isArray(definition.rules)) throw new Error("Terrain rules are invalid");
  for (const rule of definition.rules) {
    if (!isRecord(rule) || !Array.isArray(rule.candidates)) throw new Error("Terrain rules are invalid");
    for (const candidate of rule.candidates) {
      if (!isRecord(candidate)) throw new Error("Terrain candidate is invalid");
    }
  }
  return definition;
}

function gridToLayout(grid: TilesetGrid, tileWidth: number, tileHeight: number): TileGridLayout {
  return grid.kind === "hexagonal"
    ? {kind: grid.kind, tileWidth, tileHeight, orientation: grid.orientation, offset: grid.offset}
    : {kind: grid.kind, tileWidth, tileHeight};
}

function parseTerrainDefinitions(
  value: unknown,
  grid: TilesetGrid,
  tileIds: readonly number[],
  tileWidth: number,
  tileHeight: number,
): TerrainDefinition[] {
  if (!Array.isArray(value)) throw new Error("Tileset terrains are invalid");
  const definitions = value.map((raw, definitionIndex): TerrainDefinition => {
    if (!isRecord(raw)) throw new Error(`Terrain ${definitionIndex} is invalid`);
    assertKeys(raw, ["id", "name", "color", "neighborMode", "boundary", "rules"], `Terrain ${definitionIndex}`);
    for (const key of ["id", "name", "color", "neighborMode", "boundary", "rules"]) requireField(raw, key, `Terrain ${definitionIndex}`);
    if (!Array.isArray(raw.rules)) throw new Error(`Terrain ${definitionIndex} rules are invalid`);
    const rules = raw.rules.map((rawRule, ruleIndex) => {
      if (!isRecord(rawRule)) throw new Error(`Terrain ${definitionIndex} rule ${ruleIndex} is invalid`);
      assertKeys(rawRule, ["mask", "candidates"], `Terrain ${definitionIndex} rule ${ruleIndex}`);
      requireField(rawRule, "mask", `Terrain ${definitionIndex} rule ${ruleIndex}`);
      requireField(rawRule, "candidates", `Terrain ${definitionIndex} rule ${ruleIndex}`);
      if (!Array.isArray(rawRule.candidates)) throw new Error(`Terrain ${definitionIndex} candidates are invalid`);
      const candidates = rawRule.candidates.map((rawCandidate, candidateIndex) => {
        if (!isRecord(rawCandidate)) throw new Error(`Terrain ${definitionIndex} candidate ${candidateIndex} is invalid`);
        assertKeys(rawCandidate, ["tileId", "flags", "weight"], `Terrain ${definitionIndex} candidate ${candidateIndex}`);
        requireField(rawCandidate, "tileId", `Terrain ${definitionIndex} candidate ${candidateIndex}`);
        requireField(rawCandidate, "flags", `Terrain ${definitionIndex} candidate ${candidateIndex}`);
        requireField(rawCandidate, "weight", `Terrain ${definitionIndex} candidate ${candidateIndex}`);
        return {
          tileId: rawCandidate.tileId as number,
          flags: rawCandidate.flags as number,
          weight: rawCandidate.weight as number,
        };
      });
      return {mask: rawRule.mask as number, candidates};
    });
    return {
      id: raw.id as number,
      name: raw.name as string,
      color: raw.color as string,
      neighborMode: raw.neighborMode as TerrainDefinition["neighborMode"],
      boundary: raw.boundary as TerrainDefinition["boundary"],
      rules,
    };
  });
  return normalizeTerrainDefinitions(definitions, grid, tileIds, tileWidth, tileHeight);
}

function normalizeTileIds(value: unknown): number[] {
  if (!Array.isArray(value)) throw new Error("Tileset tileIds are invalid");
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const id of value) {
    if (!Number.isSafeInteger(id) || id <= 0 || id > tileIndexMask) throw new Error("Tileset tile id is invalid");
    if (seen.has(id)) throw new Error("Tileset tile ids must be unique");
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function validateMapDimensions(columns: number, rows: number, context: string) {
  if (!Number.isSafeInteger(columns) || !Number.isSafeInteger(rows) || columns <= 0 || rows <= 0
    || !Number.isSafeInteger(columns * rows)) {
    throw new Error(`${context} are invalid`);
  }
}

function validatePositiveInteger(value: number, context: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${context} is invalid`);
}

function validateUint32(value: number, context: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new Error(`${context} is invalid`);
}

function normalizeFlags(value: number, context: string): number {
  if (!Number.isSafeInteger(value) || value < -0x80000000 || value > 0xffffffff) {
    throw new Error(`${context} are invalid`);
  }
  const flags = value >>> 0;
  if ((flags & ~tileFlagMask) !== 0) throw new Error(`${context} are invalid`);
  return flags;
}

function validateStringId(value: unknown, context: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value === "." || value === ".."
    || value.includes("..") || value.includes("/") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) {
    throw new Error(`${context} is invalid`);
  }
}

function cloneTilesetMetadata(tileset: TilemapInterchangeTileset): TilemapInterchangeTileset {
  return {
    ...tileset,
    grid: {...tileset.grid},
    tileIds: tileset.tileIds.slice(),
    terrains: cloneTerrainDefinitions(tileset.terrains),
  };
}

function cloneTerrainDefinitions(definitions: readonly TerrainDefinition[]): TerrainDefinition[] {
  return definitions.map((definition) => ({
    ...definition,
    rules: definition.rules.map((rule) => ({
      ...rule,
      candidates: rule.candidates.map((candidate) => ({...candidate})),
    })),
  }));
}

function cloneTerrainmap(terrainmap: TilemapInterchangeTerrainMap): TilemapInterchangeTerrainMap {
  return {...terrainmap, cells: terrainmap.cells.slice()};
}

function normalizeCsvSource(
  source: TilemapData | TilemapInterchangeInput | {tilemap: TilemapData; tileset?: TilemapInterchangeTilesetSource; terrainmap?: TerrainMapData | TilemapInterchangeTerrainMap},
  options: TilemapCsvOptions,
): {tilemap: TilemapData; tileset?: TilemapInterchangeTileset; terrainmap?: TilemapInterchangeTerrainMap; hasTerrain: boolean} {
  if (isTilemapData(source)) {
    const tileset = options.tileset ? normalizeTilesetSource(options.tileset) : undefined;
    const tilemap = normalizeTilemap(source, tileset?.tileIds, tileset?.tileWidth, tileset?.tileHeight, tileset?.grid);
    if (!tileset) validateTilemapData(tilemap);
    const terrainmap = options.terrainmap === undefined
      ? undefined
      : normalizeTerrainmap(options.terrainmap, tilemap.columns, tilemap.rows, tileset?.terrains ?? []);
    return {tilemap, tileset, terrainmap, hasTerrain: Boolean(terrainmap) || Boolean(options.hasTerrain)};
  }
  if (!isRecord(source) || !isTilemapData(source.tilemap)) throw new Error("Tilemap CSV source is invalid");
  if ("cel" in source) {
    const data = normalizeInput(source as TilemapInterchangeInput);
    return {tilemap: data.tilemap, tileset: data.tileset, terrainmap: data.terrainmap, hasTerrain: Boolean(data.terrainmap)};
  }
  const tileset = source.tileset ? normalizeTilesetSource(source.tileset) : undefined;
  const tilemap = normalizeTilemap(source.tilemap, tileset?.tileIds, tileset?.tileWidth, tileset?.tileHeight, tileset?.grid);
  const terrainmap = source.terrainmap === undefined
    ? undefined
    : normalizeTerrainmap(source.terrainmap, tilemap.columns, tilemap.rows, tileset?.terrains ?? []);
  return {tilemap, tileset, terrainmap, hasTerrain: Boolean(terrainmap) || Boolean(options.hasTerrain)};
}

function rejectCsvLossyData(context: {tilemap: TilemapData; tileset?: TilemapInterchangeTileset; terrainmap?: TilemapInterchangeTerrainMap; hasTerrain: boolean}) {
  if (context.hasTerrain || context.terrainmap || context.tileset?.terrains.length) {
    throw new Error("Tilemap CSV cannot represent Terrain data");
  }
  for (const value of context.tilemap.tiles) {
    if ((value & tileFlagMask) !== 0) throw new Error("Tilemap CSV cannot represent tile flags");
  }
}

function parseCsvRows(csv: string): number[][] {
  if (csv.length === 0) throw new Error("Tilemap CSV is empty");
  if (csv.includes("\r") && !csv.includes("\r\n")) throw new Error("Tilemap CSV has invalid line endings");
  const normalized = csv.replace(/\r\n/g, "\n");
  const rawRows = normalized.split("\n");
  if (rawRows[rawRows.length - 1] === "") rawRows.pop();
  if (rawRows.length === 0 || rawRows.some((row) => row === "")) throw new Error("Tilemap CSV must be a non-empty rectangle");
  const rows: number[][] = [];
  let columns = 0;
  rawRows.forEach((rawRow, rowIndex) => {
    const fields = rawRow.split(",");
    if (rowIndex === 0) columns = fields.length;
    if (fields.length === 0 || fields.length !== columns) throw new Error("Tilemap CSV must be rectangular");
    const row = fields.map((field, columnIndex) => {
      if (!/^(0|[1-9][0-9]*)$/.test(field)) {
        throw new Error(`Tilemap CSV cell ${columnIndex},${rowIndex} is not a non-negative integer`);
      }
      const value = Number(field);
      if (!Number.isSafeInteger(value) || value > tileIndexMask) {
        throw new Error(`Tilemap CSV cell ${columnIndex},${rowIndex} is outside the Tile ID range`);
      }
      return value;
    });
    rows.push(row);
  });
  return rows;
}

function isTilemapData(value: unknown): value is TilemapData {
  return isRecord(value) && "columns" in value && "rows" in value && "tiles" in value;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function assertKeys(value: Record<string, unknown>, allowed: readonly string[], context: string) {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unknown) throw new Error(`${context} contains unknown field ${unknown}`);
}

function requireField(value: Record<string, unknown>, key: string, context: string) {
  if (!(key in value)) throw new Error(`${context}.${key} is required`);
}

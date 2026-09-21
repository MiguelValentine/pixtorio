import type {Cel, TilemapData, Tileset} from "./document";
import {terrainUnspecified} from "./terrain";
import type {TerrainStamp} from "./terrainTools";
import {cellToDocument, documentToCell, type TileCell, type TilePoint, type TileGridLayout} from "./tileGrid";
import {tilesetGridLayout} from "./tilemapGeometry";
import type {TileStamp} from "./tilemapTools";

export interface TiledStampGeometry {
  tileset: Tileset;
  /** A full TilemapData is accepted; only geometry fields are read. */
  tilemap: Pick<TilemapData, "columns" | "rows" | "gridOffset">;
  /** The Cel origin in document pixel coordinates. */
  celOffset: Pick<Cel, "x" | "y"> | TilePoint;
  documentSize: {width: number; height: number};
  tiledX: boolean;
  tiledY: boolean;
}

export interface TiledStampTarget<Value extends number = number> {
  cell: TileCell;
  value: Value;
}

export interface TiledStampOptions {
  /** Defaults to overwrite. Tile zero is empty; Terrain zero is unspecified. */
  emptyMode?: "overwrite" | "skip";
}

/**
 * Maps arbitrary logical cell/value candidates through document-space tiled
 * wrapping. Input candidates are consumed in order, so the last candidate
 * targeting one output cell wins.
 */
export function mapTiledCellTargets(
  geometry: TiledStampGeometry,
  cells: readonly {cell: TileCell; value: number}[],
): TiledStampTarget<number>[] {
  return mapTiledCellTargetEntries(geometry, cells);
}

/**
 * Maps a Tile stamp through document-space tiled wrapping into target Cel cells.
 * The returned targets are sparse and sorted by target row, then column.
 */
export function mapTiledTileStampTargets(
  geometry: TiledStampGeometry,
  startCell: TileCell,
  stamp: TileStamp,
  options: TiledStampOptions = {},
): TiledStampTarget<number>[] {
  validateTileStamp(stamp);
  const emptyMode = validateOptions(options);
  return mapStampTargets(geometry, startCell, stamp.width, stamp.height, stamp.tiles, {
    emptyMode,
    isEmpty: (value) => value === 0,
  });
}

/**
 * Maps a Terrain stamp through document-space tiled wrapping into target Cel cells.
 * In skip mode, unspecified Terrain (0) is skipped while explicit empty Terrain
 * (65535) remains an emitted overwrite.
 */
export function mapTiledTerrainStampTargets(
  geometry: TiledStampGeometry,
  startCell: TileCell,
  stamp: TerrainStamp,
  options: TiledStampOptions = {},
): TiledStampTarget<number>[] {
  validateTerrainStamp(stamp);
  const emptyMode = validateOptions(options);
  return mapStampTargets(geometry, startCell, stamp.width, stamp.height, stamp.terrains, {
    emptyMode,
    isEmpty: (value) => value === terrainUnspecified,
  });
}

/** Convenience aliases for callers that name the operation as a mapping. */
export const mapTiledTileStamp = mapTiledTileStampTargets;
export const mapTiledTerrainStamp = mapTiledTerrainStampTargets;

interface StampValues {
  emptyMode: "overwrite" | "skip";
  isEmpty(value: number): boolean;
}

function mapStampTargets(
  geometry: TiledStampGeometry,
  startCell: TileCell,
  width: number,
  height: number,
  values: ArrayLike<number>,
  options: StampValues,
): TiledStampTarget<number>[] {
  validateCell(startCell, "startCell");
  return mapTiledCellTargetEntries(geometry, stampCellTargets(startCell, width, height, values, options));
}

function* stampCellTargets(
  startCell: TileCell,
  width: number,
  height: number,
  values: ArrayLike<number>,
  options: StampValues,
): Iterable<TiledStampTarget<number>> {
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const value = values[row * width + column];
      if (options.emptyMode === "skip" && options.isEmpty(value)) continue;
      yield {
        cell: {
          column: startCell.column + column,
          row: startCell.row + row,
        },
        value,
      };
    }
  }
}

function mapTiledCellTargetEntries(
  geometry: TiledStampGeometry,
  cells: Iterable<{cell: TileCell; value: number}>,
): TiledStampTarget<number>[] {
  const layout = targetLayout(geometry);
  const targets = new Map<string, TiledStampTarget<number>>();

  for (const entry of cells) {
    validateCellTarget(entry);
    const center = logicalCellCenter(layout, entry.cell);
    const wrappedCenter = wrapDocumentPoint(center, geometry.documentSize, geometry.tiledX, geometry.tiledY);
    if (!wrappedCenter) continue;

    const targetCell = documentToCell(layout, wrappedCenter);
    if (!isInside(targetCell, geometry.tilemap.columns, geometry.tilemap.rows)) continue;

    // Input iteration order is authoritative; replacing the Map value gives
    // deterministic last-wins behavior when candidates collide after wrapping.
    targets.set(cellKey(targetCell), {cell: targetCell, value: entry.value});
  }

  return [...targets.values()].sort((left, right) =>
    left.cell.row - right.cell.row || left.cell.column - right.cell.column);
}

function targetLayout(geometry: TiledStampGeometry): TileGridLayout {
  validateGeometry(geometry);
  const base = tilesetGridLayout(geometry.tileset, geometry.tilemap);
  const originX = (base.originX ?? 0) + geometry.celOffset.x;
  const originY = (base.originY ?? 0) + geometry.celOffset.y;
  return {...base, originX, originY};
}

function logicalCellCenter(layout: TileGridLayout, cell: TileCell): TilePoint {
  const anchor = cellToDocument(layout, cell);
  if (layout.kind === "hexagonal") return anchor;
  return {
    x: anchor.x + layout.tileWidth / 2,
    y: anchor.y + layout.tileHeight / 2,
  };
}

function wrapDocumentPoint(
  point: TilePoint,
  documentSize: {width: number; height: number},
  tiledX: boolean,
  tiledY: boolean,
): TilePoint | null {
  let x = point.x;
  let y = point.y;
  if (x < 0 || x >= documentSize.width) {
    if (!tiledX) return null;
    x = positiveModulo(x, documentSize.width);
  }
  if (y < 0 || y >= documentSize.height) {
    if (!tiledY) return null;
    y = positiveModulo(y, documentSize.height);
  }
  return {x, y};
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function isInside(cell: TileCell, columns: number, rows: number) {
  return cell.column >= 0 && cell.row >= 0 && cell.column < columns && cell.row < rows;
}

function cellKey(cell: TileCell) {
  return `${cell.column},${cell.row}`;
}

function validateGeometry(geometry: TiledStampGeometry) {
  if (!geometry || typeof geometry !== "object") throw new Error("Tiled stamp geometry is required");
  if (!geometry.tileset || typeof geometry.tileset !== "object") throw new Error("Tiled stamp tileset is required");
  validateMapDimension(geometry.tilemap?.columns, "Tilemap columns");
  validateMapDimension(geometry.tilemap?.rows, "Tilemap rows");
  validateCoordinate(geometry.celOffset?.x, "Cel offset X");
  validateCoordinate(geometry.celOffset?.y, "Cel offset Y");
  validateMapDimension(geometry.documentSize?.width, "Document width");
  validateMapDimension(geometry.documentSize?.height, "Document height");
  if (typeof geometry.tiledX !== "boolean" || typeof geometry.tiledY !== "boolean") {
    throw new Error("Tiled stamp wrapping flags are invalid");
  }
}

function validateTileStamp(stamp: TileStamp) {
  if (!stamp || !Number.isSafeInteger(stamp.width) || !Number.isSafeInteger(stamp.height)
    || stamp.width <= 0 || stamp.height <= 0
    || !Number.isSafeInteger(stamp.width * stamp.height)
    || !(stamp.tiles instanceof Uint32Array)
    || stamp.tiles.length !== stamp.width * stamp.height) {
    throw new Error("Tile stamp is invalid");
  }
}

function validateTerrainStamp(stamp: TerrainStamp) {
  if (!stamp || !Number.isSafeInteger(stamp.width) || !Number.isSafeInteger(stamp.height)
    || stamp.width <= 0 || stamp.height <= 0
    || !Number.isSafeInteger(stamp.width * stamp.height)
    || !(stamp.terrains instanceof Uint16Array)
    || stamp.terrains.length !== stamp.width * stamp.height) {
    throw new Error("Terrain stamp is invalid");
  }
}

function validateOptions(options: TiledStampOptions) {
  const emptyMode = options.emptyMode ?? "overwrite";
  if (emptyMode !== "overwrite" && emptyMode !== "skip") throw new Error("Tiled stamp empty mode is invalid");
  return emptyMode;
}

function validateCell(cell: TileCell, name: string) {
  if (!cell || !Number.isSafeInteger(cell.column) || !Number.isSafeInteger(cell.row)) {
    throw new Error(`${name} coordinates must be integers`);
  }
}

function validateCellTarget(entry: {cell: TileCell; value: number}) {
  if (!entry || typeof entry !== "object") throw new Error("Tiled cell target is invalid");
  validateCell(entry.cell, "cell");
  if (!Number.isSafeInteger(entry.value)) throw new Error("Tiled cell target value must be an integer");
}

function validateMapDimension(value: number | undefined, name: string) {
  if (value === undefined || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} is invalid`);
  }
}

function validateCoordinate(value: number | undefined, name: string) {
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be an integer`);
}

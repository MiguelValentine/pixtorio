import {
  tileFlipDiagonal,
  tileFlipX,
  tileFlipY,
  tileIndexMask,
  type TilemapData,
} from "./document";
import {
  getTileCell,
  setTileCell,
  sourcePixelForTileValue,
  validateTilemapData,
} from "./tilemap";
import {cellNeighbors, validateTileGridLayout, type TileGridLayout} from "./tileGrid";

export {tileFlipDiagonal, tileFlipX, tileFlipY, tileIndexMask} from "./document";

export interface TileCell {
  x: number;
  y: number;
}

export interface TileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A normalized, inclusive rectangular selection in tile-cell coordinates. */
export interface TilemapSelection extends TileRect {}

export type TileSelection = TilemapSelection;

export interface TileDimensions {
  tileWidth: number;
  tileHeight: number;
}

export type TileSizeInput = TileDimensions | {width: number; height: number} | readonly [number, number] | number;

export type TileCellLike = TileCell | {column: number; row: number};
export type RectangleMode = "outline" | "filled";

export interface TilemapEditResult {
  tilemap: TilemapData;
  changedCells: TileCell[];
}

export interface FloodFillOptions {
  grid?: TileGridLayout;
  acceptsCell?: (cell: TileCell) => boolean;
  /** Defaults to matching the complete encoded cell value. */
  match?: "value" | "tileId";
  /** Alias for match, useful at call sites that prefer an explicit mode name. */
  matchMode?: "value" | "tileId";
  /** Alias for match: true matches only the tile id, false matches the full value. */
  matchTileId?: boolean;
}

export interface ApplyTileStampOptions {
  /** Defaults to true. When false, a partially out-of-bounds stamp throws. */
  clip?: boolean;
  /** Defaults to overwrite. */
  emptyMode?: "overwrite" | "skip";
}

export interface TileStamp {
  width: number;
  height: number;
  /** Row-major encoded tile values. Zero is an intentional empty cell. */
  tiles: Uint32Array;
  /** Optional tileset dimensions used to validate diagonal and quarter-turn transforms. */
  tileWidth?: number;
  tileHeight?: number;
}

/** A detached, lossless rectangular tile-cell clipboard. */
export interface TilemapClipboard extends TileStamp {}

export interface TilemapCutResult {
  clipboard: TilemapClipboard;
  tilemap: TilemapData;
}

export interface TilemapTransformOptions {
  /** Defaults to true. When false, an out-of-bounds transformed stamp throws. */
  clip?: boolean;
  /** Tile dimensions required by diagonal and quarter-turn transforms. */
  tileSize?: TileSizeInput;
  /** Direct tile-size fields are accepted for callers that do not wrap them in tileSize. */
  tileWidth?: number;
  tileHeight?: number;
}

export interface MoveTilemapSelectionOptions {
  /** Defaults to true. When false, the moved clipboard must fit in the map. */
  clip?: boolean;
}

export type StampFlip = "x" | "y" | "horizontal" | "vertical" | "diagonal";
export type StampRotation = number | "cw" | "ccw" | "clockwise" | "counterclockwise";

const tileFlagValues = [
  0,
  tileFlipX,
  tileFlipY,
  tileFlipX | tileFlipY,
  tileFlipDiagonal,
  tileFlipX | tileFlipDiagonal,
  tileFlipY | tileFlipDiagonal,
  tileFlipX | tileFlipY | tileFlipDiagonal,
].map((value) => value >>> 0);
const tileFlagMask = (tileFlipX | tileFlipY | tileFlipDiagonal) >>> 0;

function normalizeTileValue(value: number): number {
  if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff) {
    throw new Error("Tile value is invalid");
  }
  return value >>> 0;
}

function normalizeCoordinate(value: number, name: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be an integer`);
  return value;
}

function normalizeCell(cell: TileCellLike, name = "cell"): TileCell {
  if (!cell || typeof cell !== "object") throw new Error(`${name} is required`);
  const candidate = cell as Partial<TileCell> & {column?: number; row?: number};
  const x = candidate.x ?? candidate.column;
  const y = candidate.y ?? candidate.row;
  if (x === undefined || y === undefined) throw new Error(`${name} is invalid`);
  return {
    x: normalizeCoordinate(x, `${name}.x`),
    y: normalizeCoordinate(y, `${name}.y`),
  };
}

function isCellLike(value: unknown): value is TileCellLike {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TileCell> & {column?: number; row?: number};
  return (candidate.x !== undefined && candidate.y !== undefined)
    || (candidate.column !== undefined && candidate.row !== undefined);
}

function isInside(tilemap: TilemapData, cell: TileCell): boolean {
  return cell.x >= 0 && cell.y >= 0 && cell.x < tilemap.columns && cell.y < tilemap.rows;
}

function cloneTilemap(tilemap: TilemapData): TilemapData {
  validateTilemapData(tilemap);
  return {...tilemap, tiles: tilemap.tiles.slice()};
}

function cellKey(cell: TileCell): string {
  return `${cell.x},${cell.y}`;
}

function sortCells(cells: Iterable<TileCell>): TileCell[] {
  const unique = new Map<string, TileCell>();
  for (const cell of cells) unique.set(cellKey(cell), {x: cell.x, y: cell.y});
  return [...unique.values()].sort((left, right) => left.y - right.y || left.x - right.x);
}

function result(tilemap: TilemapData, changedCells: Iterable<TileCell>): TilemapEditResult {
  return {tilemap, changedCells: sortCells(changedCells)};
}

function parsePointArguments(
  pointOrX: TileCellLike | number,
  y?: number,
  name = "point",
): TileCell {
  if (typeof pointOrX === "number") {
    if (y === undefined) throw new Error(`${name}.y is required`);
    return {x: normalizeCoordinate(pointOrX, `${name}.x`), y: normalizeCoordinate(y, `${name}.y`)};
  }
  return normalizeCell(pointOrX, name);
}

function rectangleFromPoints(start: TileCell, end: TileCell): TileRect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x) + 1;
  const height = Math.abs(end.y - start.y) + 1;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || !Number.isSafeInteger(width * height)) {
    throw new Error("rectangle dimensions are too large");
  }
  return {
    x,
    y,
    width,
    height,
  };
}

function normalizeRect(rect: TileRect): TileRect {
  const x = normalizeCoordinate(rect.x, "rect.x");
  const y = normalizeCoordinate(rect.y, "rect.y");
  if (!Number.isInteger(rect.width) || rect.width === 0) throw new Error("rect.width must be a non-zero integer");
  if (!Number.isInteger(rect.height) || rect.height === 0) throw new Error("rect.height must be a non-zero integer");
  const width = Math.abs(rect.width);
  const height = Math.abs(rect.height);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || !Number.isSafeInteger(width * height)) {
    throw new Error("rect dimensions are too large");
  }
  const normalizedX = rect.width > 0 ? x : x + rect.width + 1;
  const normalizedY = rect.height > 0 ? y : y + rect.height + 1;
  if (!Number.isSafeInteger(normalizedX) || !Number.isSafeInteger(normalizedY)) {
    throw new Error("rect coordinates are too large");
  }
  return {
    x: normalizedX,
    y: normalizedY,
    width,
    height,
  };
}

function isRectLike(value: unknown): value is TileRect {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TileRect>;
  return candidate.x !== undefined && candidate.y !== undefined
    && candidate.width !== undefined && candidate.height !== undefined;
}

function normalizedSelectionFromPoints(start: TileCellLike, end: TileCellLike): TilemapSelection {
  return rectangleFromPoints(normalizeCell(start, "start"), normalizeCell(end, "end"));
}

function selectionForMap(tilemap: TilemapData, selection: TileRect): TilemapSelection {
  validateTilemapData(tilemap);
  const rect = normalizeRect(selection);
  const left = Math.max(0, Math.min(tilemap.columns - 1, rect.x));
  const top = Math.max(0, Math.min(tilemap.rows - 1, rect.y));
  const right = Math.max(0, Math.min(tilemap.columns - 1, rect.x + rect.width - 1));
  const bottom = Math.max(0, Math.min(tilemap.rows - 1, rect.y + rect.height - 1));
  return {x: left, y: top, width: right - left + 1, height: bottom - top + 1};
}

function normalizeTileDimensions(size: TileDimensions | {width: number; height: number} | readonly [number, number] | number | undefined, height?: number): TileDimensions | undefined {
  if (typeof size === "number") {
    if (height === undefined) throw new Error("tileHeight is required");
    size = {tileWidth: size, tileHeight: height};
  }
  if (size === undefined) return undefined;
  const dimensions = Array.isArray(size)
    ? {tileWidth: size[0], tileHeight: size[1]}
    : "tileWidth" in size
      ? {tileWidth: size.tileWidth, tileHeight: size.tileHeight}
      : {tileWidth: (size as {width: number; height: number}).width, tileHeight: (size as {width: number; height: number}).height};
  if (!Number.isInteger(dimensions.tileWidth) || dimensions.tileWidth <= 0) throw new Error("tileWidth must be a positive integer");
  if (!Number.isInteger(dimensions.tileHeight) || dimensions.tileHeight <= 0) throw new Error("tileHeight must be a positive integer");
  return dimensions;
}

function stampDimensions(stamp: TileStamp): {width: number; height: number} {
  if (!stamp || typeof stamp !== "object") throw new Error("Tile stamp is required");
  if (!Number.isInteger(stamp.width) || stamp.width <= 0 || !Number.isInteger(stamp.height) || stamp.height <= 0) {
    throw new Error("Tile stamp dimensions are invalid");
  }
  if (!(stamp.tiles instanceof Uint32Array) || stamp.tiles.length !== stamp.width * stamp.height) {
    throw new Error("Tile stamp cells are invalid");
  }
  if ((stamp.tileWidth === undefined) !== (stamp.tileHeight === undefined)) {
    throw new Error("Tile stamp dimensions are incomplete");
  }
  if (stamp.tileWidth !== undefined && stamp.tileHeight !== undefined) {
    normalizeTileDimensions({tileWidth: stamp.tileWidth, tileHeight: stamp.tileHeight});
  }
  return {width: stamp.width, height: stamp.height};
}

function cloneStamp(stamp: TileStamp): TileStamp {
  stampDimensions(stamp);
  return {
    width: stamp.width,
    height: stamp.height,
    tiles: stamp.tiles.slice(),
    ...(stamp.tileWidth === undefined ? {} : {tileWidth: stamp.tileWidth, tileHeight: stamp.tileHeight}),
  };
}

function tileId(value: number): number {
  return (normalizeTileValue(value) & tileIndexMask) >>> 0;
}

function fillMatches(value: number, target: number, mode: "value" | "tileId"): boolean {
  return mode === "tileId" ? tileId(value) === tileId(target) : normalizeTileValue(value) === target;
}

function floodMatchMode(options: FloodFillOptions | "value" | "tileId" | undefined): "value" | "tileId" {
  if (options === "value" || options === "tileId") return options;
  if (!options) return "value";
  if (options.matchTileId !== undefined) return options.matchTileId ? "tileId" : "value";
  return options.matchMode ?? options.match ?? "value";
}

/** Returns the encoded value at a cell, or undefined when the cell is outside the map. */
export function pickTileCell(tilemap: TilemapData, cell: TileCellLike): number | undefined;
export function pickTileCell(tilemap: TilemapData, x: number, y: number): number | undefined;
export function pickTileCell(tilemap: TilemapData, cellOrX: TileCellLike | number, y?: number): number | undefined {
  validateTilemapData(tilemap);
  const cell = parsePointArguments(cellOrX, y);
  return isInside(tilemap, cell) ? getTileCell(tilemap, cell.x, cell.y) : undefined;
}

/** Returns an inclusive integer Bresenham line in start-to-end order. */
export function tileLineCells(start: TileCellLike, end: TileCellLike): TileCell[] {
  const from = normalizeCell(start, "start");
  const to = normalizeCell(end, "end");
  const cells: TileCell[] = [];
  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - from.x);
  const sx = from.x < to.x ? 1 : -1;
  const dy = -Math.abs(to.y - from.y);
  const sy = from.y < to.y ? 1 : -1;
  let error = dx + dy;
  while (true) {
    cells.push({x, y});
    if (x === to.x && y === to.y) break;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x += sx;
    }
    if (doubled <= dx) {
      error += dx;
      y += sy;
    }
  }
  return cells;
}

export function tileRectangleCells(start: TileCellLike, end: TileCellLike, mode?: RectangleMode | {mode?: RectangleMode; filled?: boolean}): TileCell[] {
  const rect = rectangleFromPoints(normalizeCell(start, "start"), normalizeCell(end, "end"));
  const filled = typeof mode === "object" ? mode.filled ?? mode.mode === "filled" : mode === "filled";
  const cells: TileCell[] = [];
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      if (filled || x === rect.x || x === rect.x + rect.width - 1 || y === rect.y || y === rect.y + rect.height - 1) {
        cells.push({x, y});
      }
    }
  }
  return cells;
}

/** Normalizes a possibly reversed rectangle without changing its cell bounds. */
export function normalizeTilemapSelection(selection: TileRect): TilemapSelection {
  return normalizeRect(selection);
}

/** Creates an inclusive cell selection from two endpoints and clamps it to the map. */
export function createTilemapSelection(tilemap: TilemapData, start: TileCellLike, end: TileCellLike): TilemapSelection {
  validateTilemapData(tilemap);
  return selectionForMap(tilemap, normalizedSelectionFromPoints(start, end));
}

export const tilemapSelectionFromPoints = createTilemapSelection;
export const createTileSelection = createTilemapSelection;
export const normalizeTileSelection = normalizeTilemapSelection;

export function floodFillTilemap(
  tilemap: TilemapData,
  start: TileCellLike,
  replacement: number,
  options?: FloodFillOptions | "value" | "tileId",
): TilemapEditResult;
export function floodFillTilemap(
  tilemap: TilemapData,
  x: number,
  y: number,
  replacement: number,
  options?: FloodFillOptions | "value" | "tileId",
): TilemapEditResult;
export function floodFillTilemap(
  tilemap: TilemapData,
  startOrX: TileCellLike | number,
  yOrReplacement: number,
  replacementOrOptions?: number | FloodFillOptions | "value" | "tileId",
  options?: FloodFillOptions | "value" | "tileId",
): TilemapEditResult {
  validateTilemapData(tilemap);
  let start: TileCell;
  let replacement: number;
  let fillOptions: FloodFillOptions | "value" | "tileId" | undefined;
  if (typeof startOrX === "number") {
    start = parsePointArguments(startOrX, yOrReplacement, "start");
    if (typeof replacementOrOptions !== "number") throw new Error("replacement is required");
    replacement = replacementOrOptions;
    fillOptions = options;
  } else {
    start = normalizeCell(startOrX, "start");
    replacement = yOrReplacement;
    fillOptions = replacementOrOptions as FloodFillOptions | "value" | "tileId" | undefined;
  }
  const normalizedReplacement = normalizeTileValue(replacement);
  const output = cloneTilemap(tilemap);
  if (!isInside(tilemap, start)) return result(output, []);

  const mode = floodMatchMode(fillOptions);
  const grid = typeof fillOptions === "object" ? fillOptions.grid : undefined;
  const acceptsCell = typeof fillOptions === "object" ? fillOptions.acceptsCell : undefined;
  if (grid) validateTileGridLayout(grid);
  const target = getTileCell(tilemap, start.x, start.y);
  const visited = new Uint8Array(tilemap.tiles.length);
  const queue: TileCell[] = [start];
  const region: TileCell[] = [];
  let queueIndex = 0;
  while (queueIndex < queue.length) {
    const current = queue[queueIndex++];
    const index = current.y * tilemap.columns + current.x;
    if (visited[index] !== 0) continue;
    visited[index] = 1;
    if (acceptsCell && !acceptsCell(current)) continue;
    if (!fillMatches(getTileCell(tilemap, current.x, current.y), target, mode)) continue;
    region.push(current);
    if (grid) {
      for (const neighbor of cellNeighbors(grid, {column: current.x, row: current.y})) {
        const cell = {x: neighbor.column, y: neighbor.row};
        if (isInside(tilemap, cell)) queue.push(cell);
      }
    } else {
      if (current.x > 0) queue.push({x: current.x - 1, y: current.y});
      if (current.x + 1 < tilemap.columns) queue.push({x: current.x + 1, y: current.y});
      if (current.y > 0) queue.push({x: current.x, y: current.y - 1});
      if (current.y + 1 < tilemap.rows) queue.push({x: current.x, y: current.y + 1});
    }
  }

  const changed: TileCell[] = [];
  for (const cell of region) {
    if (getTileCell(tilemap, cell.x, cell.y) === normalizedReplacement) continue;
    output.tiles[cell.y * output.columns + cell.x] = normalizedReplacement;
    changed.push(cell);
  }
  return result(output, changed);
}

export function eraseTileCells(tilemap: TilemapData, cells: TileCellLike | readonly TileCellLike[]): TilemapEditResult {
  validateTilemapData(tilemap);
  const output = cloneTilemap(tilemap);
  const candidates = Array.isArray(cells) ? cells : [cells];
  const changed: TileCell[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const cell = normalizeCell(candidate);
    const key = cellKey(cell);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!isInside(tilemap, cell) || getTileCell(tilemap, cell.x, cell.y) === 0) continue;
    const updated = setTileCell(output, cell.x, cell.y, 0);
    output.tiles.set(updated.tiles);
    changed.push(cell);
  }
  return result(output, changed);
}

export function createTileStamp(tilemap: TilemapData, rect: TileRect, tileSize?: TileDimensions | {width: number; height: number} | readonly [number, number]): TileStamp;
export function createTileStamp(tilemap: TilemapData, start: TileCellLike, end: TileCellLike, tileSize?: TileDimensions | {width: number; height: number} | readonly [number, number]): TileStamp;
export function createTileStamp(tilemap: TilemapData, x: number, y: number, width: number, height: number, tileSize?: TileDimensions | {width: number; height: number} | readonly [number, number]): TileStamp;
export function createTileStamp(
  tilemap: TilemapData,
  first: TileRect | TileCellLike | number,
  second?: unknown,
  third?: unknown,
  fourth?: unknown,
  fifth?: unknown,
  sixth?: unknown,
): TileStamp {
  validateTilemapData(tilemap);
  let rect: TileRect;
  let tileSize: TileDimensions | undefined;
  if (typeof first === "number") {
    if (typeof second !== "number" || typeof third !== "number" || typeof fourth !== "number") {
      throw new Error("Stamp rectangle arguments are invalid");
    }
    rect = normalizeRect({x: first, y: second, width: third, height: fourth});
    tileSize = normalizeTileDimensions(fifth as TileDimensions | {width: number; height: number} | readonly [number, number] | number | undefined);
  } else if (isCellLike(second)) {
    rect = rectangleFromPoints(normalizeCell(first, "start"), normalizeCell(second, "end"));
    tileSize = normalizeTileDimensions(third as TileDimensions | {width: number; height: number} | readonly [number, number] | number | undefined);
  } else {
    if (!("width" in first) || !("height" in first)) throw new Error("Stamp rectangle is invalid");
    rect = normalizeRect(first);
    tileSize = normalizeTileDimensions(second as TileDimensions | {width: number; height: number} | readonly [number, number] | number | undefined);
  }

  const tiles = new Uint32Array(rect.width * rect.height);
  for (let y = 0; y < rect.height; y += 1) {
    for (let x = 0; x < rect.width; x += 1) {
      const value = pickTileCell(tilemap, rect.x + x, rect.y + y);
      tiles[y * rect.width + x] = value ?? 0;
    }
  }
  return {
    width: rect.width,
    height: rect.height,
    tiles,
    ...(tileSize ? {tileWidth: tileSize.tileWidth, tileHeight: tileSize.tileHeight} : {}),
  };
}

type ClipboardTileSize = Exclude<TileSizeInput, number>;

export function copyTilemapSelection(tilemap: TilemapData, selection: TileRect, tileSize?: ClipboardTileSize): TilemapClipboard;
export function copyTilemapSelection(tilemap: TilemapData, start: TileCellLike, end: TileCellLike, tileSize?: ClipboardTileSize): TilemapClipboard;
export function copyTilemapSelection(
  tilemap: TilemapData,
  selectionOrStart: TileRect | TileCellLike,
  endOrTileSize?: TileCellLike | ClipboardTileSize,
  maybeTileSize?: ClipboardTileSize,
): TilemapClipboard {
  validateTilemapData(tilemap);
  if (isRectLike(selectionOrStart)) {
    const selection = normalizeTilemapSelection(selectionOrStart);
    const tileSize = normalizeTileDimensions(endOrTileSize as ClipboardTileSize | undefined);
    return createTileStamp(tilemap, selection, tileSize);
  }
  if (!isCellLike(endOrTileSize)) throw new Error("Selection end point is required");
  const selection = normalizedSelectionFromPoints(selectionOrStart, endOrTileSize);
  const tileSize = normalizeTileDimensions(maybeTileSize);
  return createTileStamp(tilemap, selection, tileSize);
}

function clearTilemapSelection(tilemap: TilemapData, selection: TileRect): TilemapEditResult {
  validateTilemapData(tilemap);
  const rect = normalizeTilemapSelection(selection);
  const output = cloneTilemap(tilemap);
  const changed: TileCell[] = [];
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    if (y < 0 || y >= tilemap.rows) continue;
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      if (x < 0 || x >= tilemap.columns) continue;
      const index = y * tilemap.columns + x;
      if (output.tiles[index] === 0) continue;
      output.tiles[index] = 0;
      changed.push({x, y});
    }
  }
  return result(output, changed);
}

export function cutTilemapSelection(tilemap: TilemapData, selection: TileRect, tileSize?: ClipboardTileSize): TilemapCutResult;
export function cutTilemapSelection(tilemap: TilemapData, start: TileCellLike, end: TileCellLike, tileSize?: ClipboardTileSize): TilemapCutResult;
export function cutTilemapSelection(
  tilemap: TilemapData,
  selectionOrStart: TileRect | TileCellLike,
  endOrTileSize?: TileCellLike | ClipboardTileSize,
  maybeTileSize?: ClipboardTileSize,
): TilemapCutResult {
  const clipboard = isRectLike(selectionOrStart)
    ? copyTilemapSelection(tilemap, normalizeTilemapSelection(selectionOrStart), endOrTileSize as ClipboardTileSize | undefined)
    : copyTilemapSelection(tilemap, selectionOrStart, endOrTileSize as TileCellLike, maybeTileSize);
  const selection = isRectLike(selectionOrStart)
    ? normalizeTilemapSelection(selectionOrStart)
    : normalizedSelectionFromPoints(selectionOrStart, endOrTileSize as TileCellLike);
  return {clipboard, tilemap: clearTilemapSelection(tilemap, selection).tilemap};
}

export function applyTileStamp(tilemap: TilemapData, stamp: TileStamp, target: TileCellLike, options?: ApplyTileStampOptions): TilemapEditResult;
export function applyTileStamp(tilemap: TilemapData, stamp: TileStamp, x: number, y: number, options?: ApplyTileStampOptions): TilemapEditResult;
export function applyTileStamp(
  tilemap: TilemapData,
  stamp: TileStamp,
  targetOrX: TileCellLike | number,
  yOrOptions?: number | ApplyTileStampOptions,
  maybeOptions?: ApplyTileStampOptions,
): TilemapEditResult {
  validateTilemapData(tilemap);
  const {width, height} = stampDimensions(stamp);
  const target = typeof targetOrX === "number"
    ? parsePointArguments(targetOrX, yOrOptions as number | undefined, "target")
    : normalizeCell(targetOrX, "target");
  const options = typeof targetOrX === "number" ? maybeOptions : yOrOptions as ApplyTileStampOptions | undefined;
  const clip = options?.clip ?? true;
  const emptyMode = options?.emptyMode ?? "overwrite";
  if (emptyMode !== "overwrite" && emptyMode !== "skip") throw new Error("emptyMode is invalid");

  if (!clip && (target.x < 0 || target.y < 0 || target.x + width > tilemap.columns || target.y + height > tilemap.rows)) {
    throw new Error("Tile stamp is outside the tilemap");
  }

  const output = cloneTilemap(tilemap);
  const changed: TileCell[] = [];
  for (let sourceY = 0; sourceY < height; sourceY += 1) {
    for (let sourceX = 0; sourceX < width; sourceX += 1) {
      const destination = {x: target.x + sourceX, y: target.y + sourceY};
      if (!isInside(tilemap, destination)) continue;
      const value = stamp.tiles[sourceY * width + sourceX];
      if (emptyMode === "skip" && value === 0) continue;
      if (getTileCell(tilemap, destination.x, destination.y) === value) continue;
      const updated = setTileCell(output, destination.x, destination.y, value);
      output.tiles.set(updated.tiles);
      changed.push(destination);
    }
  }
  return result(output, changed);
}

export type TilemapPasteOptions = ApplyTileStampOptions;

export function pasteTilemapClipboard(tilemap: TilemapData, clipboard: TilemapClipboard, target: TileCellLike, options?: TilemapPasteOptions): TilemapEditResult;
export function pasteTilemapClipboard(tilemap: TilemapData, clipboard: TilemapClipboard, x: number, y: number, options?: TilemapPasteOptions): TilemapEditResult;
export function pasteTilemapClipboard(
  tilemap: TilemapData,
  clipboard: TilemapClipboard,
  targetOrX: TileCellLike | number,
  yOrOptions?: number | TilemapPasteOptions,
  maybeOptions?: TilemapPasteOptions,
): TilemapEditResult {
  return typeof targetOrX === "number"
    ? applyTileStamp(tilemap, clipboard, targetOrX, yOrOptions as number, maybeOptions)
    : applyTileStamp(tilemap, clipboard, targetOrX, yOrOptions as TilemapPasteOptions | undefined);
}

export const pasteTilemapSelection = pasteTilemapClipboard;

function changedCellsBetween(before: TilemapData, after: TilemapData): TileCell[] {
  validateTilemapData(before);
  validateTilemapData(after);
  if (before.columns !== after.columns || before.rows !== after.rows) throw new Error("Tilemap dimensions do not match");
  const changed: TileCell[] = [];
  for (let y = 0; y < before.rows; y += 1) {
    for (let x = 0; x < before.columns; x += 1) {
      const index = y * before.columns + x;
      if (before.tiles[index] !== after.tiles[index]) changed.push({x, y});
    }
  }
  return changed;
}

export function moveTilemapSelection(tilemap: TilemapData, selection: TileRect, target: TileCellLike, options?: MoveTilemapSelectionOptions): TilemapEditResult;
export function moveTilemapSelection(tilemap: TilemapData, selection: TileRect, x: number, y: number, options?: MoveTilemapSelectionOptions): TilemapEditResult;
export function moveTilemapSelection(
  tilemap: TilemapData,
  selection: TileRect,
  targetOrX: TileCellLike | number,
  yOrOptions?: number | MoveTilemapSelectionOptions,
  maybeOptions?: MoveTilemapSelectionOptions,
): TilemapEditResult {
  validateTilemapData(tilemap);
  const rect = normalizeTilemapSelection(selection);
  const target = typeof targetOrX === "number"
    ? parsePointArguments(targetOrX, yOrOptions as number | undefined, "target")
    : normalizeCell(targetOrX, "target");
  const options = typeof targetOrX === "number" ? maybeOptions : yOrOptions as MoveTilemapSelectionOptions | undefined;
  const clipboard = copyTilemapSelection(tilemap, rect);
  const cleared = clearTilemapSelection(tilemap, rect);
  const pasted = applyTileStamp(cleared.tilemap, clipboard, target, {
    clip: options?.clip ?? true,
    emptyMode: "overwrite",
  });
  return result(pasted.tilemap, changedCellsBetween(tilemap, pasted.tilemap));
}

export const moveTileSelection = moveTilemapSelection;
export const copyTileSelection = copyTilemapSelection;
export const cutTileSelection = cutTilemapSelection;

function requireSquareTiles(stamp: TileStamp, sizeOrWidth?: TileDimensions | {width: number; height: number} | readonly [number, number] | number, tileHeight?: number): TileDimensions {
  const dimensions = normalizeTileDimensions(sizeOrWidth, tileHeight)
    ?? (stamp.tileWidth === undefined || stamp.tileHeight === undefined
      ? undefined
      : {tileWidth: stamp.tileWidth, tileHeight: stamp.tileHeight});
  if (!dimensions) throw new Error("Tile dimensions are required for diagonal or 90-degree transforms");
  if (dimensions.tileWidth !== dimensions.tileHeight) throw new Error("Diagonal and 90-degree transforms require square tiles");
  return dimensions;
}

type StampOperation = "flipX" | "flipY" | "diagonal" | "rotate90" | "rotate180" | "rotate270";

function operationSource(operation: StampOperation, x: number, y: number, width: number, height: number): TileCell {
  switch (operation) {
    case "flipX": return {x: width - 1 - x, y};
    case "flipY": return {x, y: height - 1 - y};
    case "diagonal": return {x: y, y: x};
    case "rotate90": return {x: y, y: width - 1 - x};
    case "rotate180": return {x: width - 1 - x, y: height - 1 - y};
    case "rotate270": return {x: height - 1 - y, y: x};
  }
}

function transformedTileValue(value: number, operation: StampOperation): number {
  const normalized = normalizeTileValue(value);
  const id = normalized & tileIndexMask;
  const existingFlags = (normalized & tileFlagMask) >>> 0;

  let transformedFlags = 0;
  for (const candidate of tileFlagValues) {
    let matches = true;
    for (let y = 0; y < 2 && matches; y += 1) {
      for (let x = 0; x < 2; x += 1) {
        const source = operationSource(operation, x, y, 2, 2);
        const expected = sourcePixelForTileValue(existingFlags, source.x, source.y, 2, 2);
        const actual = sourcePixelForTileValue(candidate, x, y, 2, 2);
        if (expected.x !== actual.x || expected.y !== actual.y) {
          matches = false;
          break;
        }
      }
    }
    if (matches) {
      transformedFlags = candidate;
      break;
    }
  }
  return (id | transformedFlags) >>> 0;
}

function transformStamp(stamp: TileStamp, operation: StampOperation): TileStamp {
  const {width, height} = stampDimensions(stamp);
  const swapsDimensions = operation === "diagonal" || operation === "rotate90" || operation === "rotate270";
  const outputWidth = swapsDimensions ? height : width;
  const outputHeight = swapsDimensions ? width : height;
  const tiles = new Uint32Array(outputWidth * outputHeight);
  for (let y = 0; y < outputHeight; y += 1) {
    for (let x = 0; x < outputWidth; x += 1) {
      const source = operationSource(operation, x, y, width, height);
      const sourceValue = stamp.tiles[source.y * width + source.x];
      tiles[y * outputWidth + x] = transformedTileValue(sourceValue, operation);
    }
  }
  return {
    width: outputWidth,
    height: outputHeight,
    tiles,
    ...(stamp.tileWidth === undefined ? {} : {tileWidth: stamp.tileWidth, tileHeight: stamp.tileHeight}),
  };
}

export function flipTileStamp(stamp: TileStamp, axis: StampFlip, sizeOrWidth?: TileDimensions | {width: number; height: number} | readonly [number, number] | number, tileHeight?: number): TileStamp {
  stampDimensions(stamp);
  const operation: StampOperation = axis === "x" || axis === "horizontal"
    ? "flipX"
    : axis === "y" || axis === "vertical"
      ? "flipY"
      : axis === "diagonal"
        ? "diagonal"
        : (() => { throw new Error("Stamp flip axis is invalid"); })();
  if (operation === "diagonal") requireSquareTiles(stamp, sizeOrWidth, tileHeight);
  return transformStamp(stamp, operation);
}

function rotationOperation(rotation: StampRotation): StampOperation | null {
  if (rotation === "cw" || rotation === "clockwise") return "rotate90";
  if (rotation === "ccw" || rotation === "counterclockwise") return "rotate270";
  if (!Number.isInteger(rotation)) throw new Error("Stamp rotation must be an integer");
  const degrees = Math.abs(rotation) <= 3 ? rotation * 90 : rotation;
  const normalized = ((degrees % 360) + 360) % 360;
  if (normalized === 0) return null;
  if (normalized === 90) return "rotate90";
  if (normalized === 180) return "rotate180";
  if (normalized === 270) return "rotate270";
  throw new Error("Stamp rotation must be a multiple of 90 degrees");
}

export function rotateTileStamp(stamp: TileStamp, rotation: StampRotation, sizeOrWidth?: TileDimensions | {width: number; height: number} | readonly [number, number] | number, tileHeight?: number): TileStamp {
  const operation = rotationOperation(rotation);
  if (!operation) return cloneStamp(stamp);
  if (operation === "rotate90" || operation === "rotate270") requireSquareTiles(stamp, sizeOrWidth, tileHeight);
  return transformStamp(stamp, operation);
}

function normalizeTransformOptions(
  sizeOrOptions?: TileSizeInput | TilemapTransformOptions,
  tileHeight?: number,
): {clip: boolean; tileSize?: TileDimensions} {
  let clip = true;
  let size: TileSizeInput | undefined;
  if (sizeOrOptions && typeof sizeOrOptions === "object" && !Array.isArray(sizeOrOptions)) {
    const candidate = sizeOrOptions as TilemapTransformOptions;
    if ("clip" in candidate || "tileSize" in candidate) {
      clip = candidate.clip ?? true;
      size = candidate.tileSize;
      if (size === undefined && (candidate.tileWidth !== undefined || candidate.tileHeight !== undefined)) {
        size = {tileWidth: candidate.tileWidth as number, tileHeight: candidate.tileHeight as number};
      }
    } else {
      size = sizeOrOptions as TileSizeInput;
    }
  } else {
    size = sizeOrOptions as TileSizeInput | undefined;
  }
  return {clip, tileSize: normalizeTileDimensions(size, tileHeight)};
}

function transformTilemapSelection(
  tilemap: TilemapData,
  selection: TileRect,
  transform: (stamp: TilemapClipboard, tileSize?: TileDimensions) => TilemapClipboard,
  sizeOrOptions?: TileSizeInput | TilemapTransformOptions,
  tileHeight?: number,
): TilemapEditResult {
  validateTilemapData(tilemap);
  const rect = normalizeTilemapSelection(selection);
  const options = normalizeTransformOptions(sizeOrOptions, tileHeight);
  const source = copyTilemapSelection(tilemap, rect, options.tileSize);
  const transformed = transform(source, options.tileSize);
  const cleared = clearTilemapSelection(tilemap, rect);
  const pasted = applyTileStamp(cleared.tilemap, transformed, {x: rect.x, y: rect.y}, {
    clip: options.clip,
    emptyMode: "overwrite",
  });
  return result(pasted.tilemap, changedCellsBetween(tilemap, pasted.tilemap));
}

export function flipTilemapSelection(
  tilemap: TilemapData,
  selection: TileRect,
  axis: StampFlip,
  sizeOrOptions?: TileSizeInput | TilemapTransformOptions,
  tileHeight?: number,
): TilemapEditResult {
  return transformTilemapSelection(
    tilemap,
    selection,
    (stamp, tileSize) => flipTileStamp(stamp, axis, tileSize),
    sizeOrOptions,
    tileHeight,
  );
}

export function rotateTilemapSelection(
  tilemap: TilemapData,
  selection: TileRect,
  rotation: StampRotation,
  sizeOrOptions?: TileSizeInput | TilemapTransformOptions,
  tileHeight?: number,
): TilemapEditResult {
  return transformTilemapSelection(
    tilemap,
    selection,
    (stamp, tileSize) => rotateTileStamp(stamp, rotation, tileSize),
    sizeOrOptions,
    tileHeight,
  );
}

export const flipStamp = flipTileStamp;
export const rotateStamp = rotateTileStamp;
export const flipTileSelection = flipTilemapSelection;
export const rotateTileSelection = rotateTilemapSelection;

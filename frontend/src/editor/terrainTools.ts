import {
  getTerrainCell,
  setTerrainCell,
  terrainEmpty,
  terrainUnspecified,
  type TerrainMapData,
} from "./terrain";
import {
  cellNeighbors,
  validateTileGridLayout,
  type TileCell,
  type TileGridLayout,
} from "./tileGrid";
import {
  axialToOffset,
  offsetToAxial,
} from "./tileGridHexagonal";

export type {TileCell, TileGridLayout} from "./tileGrid";

export type TerrainCellLike = TileCell | {x: number; y: number};
export type TerrainRectangleMode = "outline" | "filled";

export interface TerrainRectangleOptions {
  mode?: TerrainRectangleMode;
  filled?: boolean;
}

export interface TerrainEditResult {
  map: TerrainMapData;
  changedCells: TileCell[];
}

export interface TerrainStamp {
  width: number;
  height: number;
  terrains: Uint16Array;
}

export interface TerrainSelection {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TerrainSelectionTransformResult extends TerrainEditResult {
  selection: TerrainSelection;
}

const maxTerrainId = 0xffff;

function validateTerrainMap(map: TerrainMapData): true {
  if (!map || typeof map !== "object") throw new Error("Terrain map is required");
  if (!Number.isSafeInteger(map.columns) || !Number.isSafeInteger(map.rows) || map.columns <= 0 || map.rows <= 0) {
    throw new Error("Terrain map dimensions are invalid");
  }
  if (!Number.isSafeInteger(map.columns * map.rows)) throw new Error("Terrain map dimensions are invalid");
  if (!Number.isSafeInteger(map.seed)) throw new Error("Terrain seed must be a safe integer");
  if (!(map.terrains instanceof Uint16Array) || map.terrains.length !== map.columns * map.rows) {
    throw new Error("Terrain map cells are invalid");
  }
  return true;
}

function validateTerrainId(terrainId: number): true {
  if (!Number.isInteger(terrainId) || terrainId < 0 || terrainId > maxTerrainId) {
    throw new Error("Terrain id must be an integer from 0 to 65535");
  }
  return true;
}

function normalizeCell(cell: TerrainCellLike, name = "cell"): TileCell {
  if (!cell || typeof cell !== "object") throw new Error(`${name} is required`);
  const candidate = cell as Partial<TileCell> & {x?: number; y?: number};
  const column = candidate.column ?? candidate.x;
  const row = candidate.row ?? candidate.y;
  if (column === undefined || row === undefined
    || !Number.isInteger(column) || !Number.isInteger(row)) {
    throw new Error(`${name} coordinates must be integers`);
  }
  return {
    column: column === 0 ? 0 : column,
    row: row === 0 ? 0 : row,
  };
}

function validateCellInMap(map: TerrainMapData, cell: TileCell): true {
  if (cell.column < 0 || cell.row < 0 || cell.column >= map.columns || cell.row >= map.rows) {
    throw new Error("Terrain cell position is outside the terrain map");
  }
  return true;
}

function isGridLayout(value: unknown): value is TileGridLayout {
  return Boolean(value && typeof value === "object" && "kind" in value && "tileWidth" in value && "tileHeight" in value);
}

function cellKey(cell: TileCell): string {
  return `${cell.column},${cell.row}`;
}

function sortUniqueCells(cells: Iterable<TileCell>): TileCell[] {
  const unique = new Map<string, TileCell>();
  for (const cell of cells) unique.set(cellKey(cell), {column: cell.column, row: cell.row});
  return [...unique.values()].sort((left, right) => left.row - right.row || left.column - right.column);
}

function uniqueCellsInOrder(cells: Iterable<TileCell>): TileCell[] {
  const unique = new Map<string, TileCell>();
  for (const cell of cells) {
    const normalized = normalizeCell(cell);
    if (!unique.has(cellKey(normalized))) unique.set(cellKey(normalized), normalized);
  }
  return [...unique.values()];
}

function cloneTerrainMap(map: TerrainMapData): TerrainMapData {
  validateTerrainMap(map);
  return {...map, terrains: map.terrains.slice()};
}

function isInside(map: TerrainMapData, cell: TileCell): boolean {
  return cell.column >= 0 && cell.row >= 0 && cell.column < map.columns && cell.row < map.rows;
}

export function terrainPicker(map: TerrainMapData, cell: TerrainCellLike): number;
export function terrainPicker(map: TerrainMapData, column: number, row: number): number;
export function terrainPicker(
  map: TerrainMapData,
  cellOrColumn: TerrainCellLike | number,
  row?: number,
): number {
  validateTerrainMap(map);
  const cell = typeof cellOrColumn === "number"
    ? normalizeCell({column: cellOrColumn, row: row as number}, "cell")
    : normalizeCell(cellOrColumn, "cell");
  validateCellInMap(map, cell);
  return getTerrainCell(map, cell.column, cell.row);
}

export function terrainFloodFill(map: TerrainMapData, grid: TileGridLayout, start: TerrainCellLike, acceptsCell?: (cell: TileCell) => boolean): TileCell[];
export function terrainFloodFill(map: TerrainMapData, grid: TileGridLayout, column: number, row: number): TileCell[];
export function terrainFloodFill(map: TerrainMapData, start: TerrainCellLike, grid: TileGridLayout): TileCell[];
export function terrainFloodFill(map: TerrainMapData, column: number, row: number, grid: TileGridLayout): TileCell[];
export function terrainFloodFill(
  map: TerrainMapData,
  first: TileGridLayout | TerrainCellLike | number,
  second: TerrainCellLike | TileGridLayout | number,
  third?: number | TileGridLayout | ((cell: TileCell) => boolean),
): TileCell[] {
  validateTerrainMap(map);
  let grid: TileGridLayout;
  let start: TileCell;
  if (isGridLayout(first)) {
    grid = first;
    if (isGridLayout(second) || typeof second === "number") {
      if (typeof second !== "number" || typeof third !== "number") throw new Error("Terrain flood start is invalid");
      start = normalizeCell({column: second, row: third}, "start");
    } else {
      start = normalizeCell(second as TerrainCellLike, "start");
    }
  } else {
    if (isGridLayout(second)) {
      grid = second;
      start = normalizeCell(first as TerrainCellLike, "start");
    } else {
      if (typeof first !== "number" || typeof second !== "number" || !isGridLayout(third)) {
        throw new Error("Terrain flood arguments are invalid");
      }
      grid = third;
      start = normalizeCell({column: first, row: second}, "start");
    }
  }
  validateTileGridLayout(grid);
  validateCellInMap(map, start);
  const acceptsCell = typeof third === "function" ? third : undefined;

  const target = getTerrainCell(map, start.column, start.row);
  const visited = new Uint8Array(map.terrains.length);
  const queue: TileCell[] = [start];
  const filled: TileCell[] = [];
  let queueIndex = 0;
  while (queueIndex < queue.length) {
    const cell = queue[queueIndex++];
    const index = cell.row * map.columns + cell.column;
    if (visited[index] !== 0) continue;
    visited[index] = 1;
    if (acceptsCell && !acceptsCell(cell)) continue;
    if (getTerrainCell(map, cell.column, cell.row) !== target) continue;
    filled.push(cell);
    for (const neighbor of cellNeighbors(grid, cell)) {
      if (isInside(map, neighbor)) queue.push(neighbor);
    }
  }
  return sortUniqueCells(filled);
}

export function terrainLineCells(grid: TileGridLayout, start: TerrainCellLike, end: TerrainCellLike): TileCell[];
export function terrainLineCells(start: TerrainCellLike, end: TerrainCellLike, grid: TileGridLayout): TileCell[];
export function terrainLineCells(
  first: TileGridLayout | TerrainCellLike,
  second: TerrainCellLike | TileGridLayout,
  third: TerrainCellLike | TileGridLayout,
): TileCell[] {
  let grid: TileGridLayout;
  let start: TileCell;
  let end: TileCell;
  if (isGridLayout(first)) {
    grid = first;
    start = normalizeCell(second as TerrainCellLike, "start");
    end = normalizeCell(third as TerrainCellLike, "end");
  } else {
    start = normalizeCell(first, "start");
    end = normalizeCell(second as TerrainCellLike, "end");
    if (!isGridLayout(third)) throw new Error("Terrain grid layout is required");
    grid = third;
  }
  validateTileGridLayout(grid);
  if (grid.kind === "hexagonal") return hexLineCells(grid, start, end);
  return bresenhamCells(start, end);
}

function bresenhamCells(start: TileCell, end: TileCell): TileCell[] {
  const cells: TileCell[] = [];
  let column = start.column;
  let row = start.row;
  const deltaColumn = Math.abs(end.column - start.column);
  const stepColumn = start.column < end.column ? 1 : -1;
  const deltaRow = -Math.abs(end.row - start.row);
  const stepRow = start.row < end.row ? 1 : -1;
  let error = deltaColumn + deltaRow;
  while (true) {
    cells.push({column, row});
    if (column === end.column && row === end.row) break;
    const doubleError = 2 * error;
    if (doubleError >= deltaRow) {
      error += deltaRow;
      column += stepColumn;
    }
    if (doubleError <= deltaColumn) {
      error += deltaColumn;
      row += stepRow;
    }
  }
  return cells;
}

interface Cube {
  x: number;
  y: number;
  z: number;
}

function hexLineCells(grid: Extract<TileGridLayout, {kind: "hexagonal"}>, start: TileCell, end: TileCell): TileCell[] {
  const startAxial = offsetToAxial(grid, start);
  const endAxial = offsetToAxial(grid, end);
  const startCube = axialToCube(startAxial.q, startAxial.r);
  const endCube = axialToCube(endAxial.q, endAxial.r);
  const distance = Math.max(
    Math.abs(endCube.x - startCube.x),
    Math.abs(endCube.y - startCube.y),
    Math.abs(endCube.z - startCube.z),
  );
  const cells: TileCell[] = [];
  for (let step = 0; step <= distance; step += 1) {
    const amount = distance === 0 ? 0 : step / distance;
    const cube = cubeRound({
      x: startCube.x + (endCube.x - startCube.x) * amount,
      y: startCube.y + (endCube.y - startCube.y) * amount,
      z: startCube.z + (endCube.z - startCube.z) * amount,
    });
    cells.push(normalizeCell(axialToOffset(grid, {q: cube.x, r: cube.z}), "line cell"));
  }
  return uniqueCellsInOrder(cells);
}

function axialToCube(q: number, r: number): Cube {
  return {x: q, y: -q - r, z: r};
}

function cubeRound(cube: Cube): Cube {
  let x = Math.round(cube.x);
  let y = Math.round(cube.y);
  let z = Math.round(cube.z);
  const differenceX = Math.abs(x - cube.x);
  const differenceY = Math.abs(y - cube.y);
  const differenceZ = Math.abs(z - cube.z);
  if (differenceX > differenceY && differenceX > differenceZ) x = -y - z;
  else if (differenceY > differenceZ) y = -x - z;
  else z = -x - y;
  return {x, y, z};
}

export function terrainRectangleCells(
  start: TerrainCellLike,
  end: TerrainCellLike,
  mode?: TerrainRectangleMode | TerrainRectangleOptions | boolean,
): TileCell[];
export function terrainRectangleCells(
  grid: TileGridLayout,
  start: TerrainCellLike,
  end: TerrainCellLike,
  mode?: TerrainRectangleMode | TerrainRectangleOptions | boolean,
): TileCell[];
export function terrainRectangleCells(
  first: TileGridLayout | TerrainCellLike,
  second: TerrainCellLike,
  third?: TerrainCellLike | TerrainRectangleMode | TerrainRectangleOptions | boolean,
  fourth?: TerrainRectangleMode | TerrainRectangleOptions | boolean,
): TileCell[] {
  let start: TileCell;
  let end: TileCell;
  let mode: TerrainRectangleMode | TerrainRectangleOptions | boolean | undefined;
  if (isGridLayout(first)) {
    validateTileGridLayout(first);
    start = normalizeCell(second, "start");
    if (!isCellLike(third)) throw new Error("Terrain rectangle end is invalid");
    end = normalizeCell(third, "end");
    mode = fourth;
  } else {
    start = normalizeCell(first, "start");
    if (!isCellLike(second)) throw new Error("Terrain rectangle arguments are invalid");
    end = normalizeCell(second, "end");
    mode = third as TerrainRectangleMode | TerrainRectangleOptions | boolean;
  }
  const filled = typeof mode === "boolean"
    ? mode
    : typeof mode === "object"
      ? mode.filled ?? mode.mode === "filled"
      : mode === "filled";
  const minColumn = Math.min(start.column, end.column);
  const maxColumn = Math.max(start.column, end.column);
  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);
  const cells: TileCell[] = [];
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      if (filled || column === minColumn || column === maxColumn || row === minRow || row === maxRow) {
        cells.push({column, row});
      }
    }
  }
  return cells;
}

function isCellLike(value: unknown): value is TerrainCellLike {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TileCell> & {x?: number; y?: number};
  return (candidate.column !== undefined && candidate.row !== undefined)
    || (candidate.x !== undefined && candidate.y !== undefined);
}

export function applyTerrainCells(
  map: TerrainMapData,
  cells: TerrainCellLike | readonly TerrainCellLike[],
  terrainId: number,
): TerrainEditResult;
export function applyTerrainCells(
  map: TerrainMapData,
  terrainId: number,
  cells: TerrainCellLike | readonly TerrainCellLike[],
): TerrainEditResult;
export function applyTerrainCells(
  map: TerrainMapData,
  cellsOrTerrainId: TerrainCellLike | readonly TerrainCellLike[] | number,
  terrainIdOrCells: number | TerrainCellLike | readonly TerrainCellLike[],
): TerrainEditResult {
  validateTerrainMap(map);
  const terrainId = typeof cellsOrTerrainId === "number" ? cellsOrTerrainId : terrainIdOrCells as number;
  const inputCells = typeof cellsOrTerrainId === "number" ? terrainIdOrCells : cellsOrTerrainId;
  validateTerrainId(terrainId);
  if (!isCellLike(inputCells) && !Array.isArray(inputCells)) throw new Error("Terrain cells are invalid");
  const candidates = Array.isArray(inputCells) ? inputCells : [inputCells];
  const normalized = candidates.map((cell) => {
    const result = normalizeCell(cell);
    validateCellInMap(map, result);
    return result;
  });
  const unique = sortUniqueCells(normalized);
  let output = cloneTerrainMap(map);
  const changedCells: TileCell[] = [];
  for (const cell of unique) {
    if (getTerrainCell(map, cell.column, cell.row) === terrainId) continue;
    output = setTerrainCell(output, cell.column, cell.row, terrainId);
    changedCells.push(cell);
  }
  return {map: output, changedCells};
}

export function createTerrainStamp(
  map: TerrainMapData,
  start: TerrainCellLike,
  end: TerrainCellLike,
): TerrainStamp {
  validateTerrainMap(map);
  const from = normalizeCell(start, "start");
  const to = normalizeCell(end, "end");
  const minColumn = Math.min(from.column, to.column);
  const minRow = Math.min(from.row, to.row);
  const maxColumn = Math.max(from.column, to.column);
  const maxRow = Math.max(from.row, to.row);
  const width = maxColumn - minColumn + 1;
  const height = maxRow - minRow + 1;
  const terrains = new Uint16Array(width * height);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const source = {column: minColumn + column, row: minRow + row};
      if (isInside(map, source)) terrains[row * width + column] = getTerrainCell(map, source.column, source.row);
    }
  }
  return {width, height, terrains};
}

export function applyTerrainStamp(
  map: TerrainMapData,
  stamp: TerrainStamp,
  target: TerrainCellLike,
  emptyMode: "overwrite" | "skip" = "overwrite",
): TerrainEditResult {
  validateTerrainMap(map);
  validateTerrainStamp(stamp);
  if (emptyMode !== "overwrite" && emptyMode !== "skip") throw new Error("Terrain stamp empty mode is invalid");
  const origin = normalizeCell(target, "target");
  const output = cloneTerrainMap(map);
  const changedCells: TileCell[] = [];
  for (let row = 0; row < stamp.height; row += 1) {
    for (let column = 0; column < stamp.width; column += 1) {
      const destination = {column: origin.column + column, row: origin.row + row};
      if (!isInside(map, destination)) continue;
      const terrainId = stamp.terrains[row * stamp.width + column];
      if (emptyMode === "skip" && (terrainId === terrainUnspecified || terrainId === terrainEmpty)) continue;
      const index = destination.row * map.columns + destination.column;
      if (output.terrains[index] === terrainId) continue;
      output.terrains[index] = terrainId;
      changedCells.push(destination);
    }
  }
  return {map: output, changedCells: sortUniqueCells(changedCells)};
}

export function flipTerrainStamp(stamp: TerrainStamp, axis: "horizontal" | "vertical"): TerrainStamp {
  validateTerrainStamp(stamp);
  if (axis !== "horizontal" && axis !== "vertical") throw new Error("Terrain stamp flip axis is invalid");
  const terrains = new Uint16Array(stamp.terrains.length);
  for (let row = 0; row < stamp.height; row += 1) {
    for (let column = 0; column < stamp.width; column += 1) {
      const sourceColumn = axis === "horizontal" ? stamp.width - 1 - column : column;
      const sourceRow = axis === "vertical" ? stamp.height - 1 - row : row;
      terrains[row * stamp.width + column] = stamp.terrains[sourceRow * stamp.width + sourceColumn];
    }
  }
  return {width: stamp.width, height: stamp.height, terrains};
}

export function rotateTerrainStamp(stamp: TerrainStamp, direction: "cw" | "ccw"): TerrainStamp {
  validateTerrainStamp(stamp);
  if (direction !== "cw" && direction !== "ccw") throw new Error("Terrain stamp rotation is invalid");
  const width = stamp.height;
  const height = stamp.width;
  const terrains = new Uint16Array(width * height);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const sourceColumn = direction === "cw" ? row : stamp.width - 1 - row;
      const sourceRow = direction === "cw" ? stamp.height - 1 - column : column;
      terrains[row * width + column] = stamp.terrains[sourceRow * stamp.width + sourceColumn];
    }
  }
  return {width, height, terrains};
}

/** Transforms logical Terrain cells without detaching Terrain authority. */
export function transformTerrainSelection(
  map: TerrainMapData,
  selection: TerrainSelection,
  operation: "flip-x" | "flip-y" | "cw" | "ccw",
): TerrainSelectionTransformResult {
  validateTerrainMap(map);
  validateTerrainSelection(map, selection);
  const source = createTerrainStamp(
    map,
    {column: selection.x, row: selection.y},
    {column: selection.x + selection.width - 1, row: selection.y + selection.height - 1},
  );
  const transformed = operation === "flip-x"
    ? flipTerrainStamp(source, "horizontal")
    : operation === "flip-y"
      ? flipTerrainStamp(source, "vertical")
      : rotateTerrainStamp(source, operation);
  const terrains = map.terrains.slice();
  for (let row = selection.y; row < selection.y + selection.height; row += 1) {
    for (let column = selection.x; column < selection.x + selection.width; column += 1) {
      terrains[row * map.columns + column] = terrainUnspecified;
    }
  }
  for (let row = 0; row < transformed.height; row += 1) {
    for (let column = 0; column < transformed.width; column += 1) {
      const targetColumn = selection.x + column;
      const targetRow = selection.y + row;
      if (targetColumn >= map.columns || targetRow >= map.rows) continue;
      terrains[targetRow * map.columns + targetColumn] = transformed.terrains[row * transformed.width + column];
    }
  }
  const changedCells: TileCell[] = [];
  for (let index = 0; index < terrains.length; index += 1) {
    if (terrains[index] !== map.terrains[index]) {
      changedCells.push({column: index % map.columns, row: Math.floor(index / map.columns)});
    }
  }
  return {
    map: {...map, terrains},
    changedCells,
    selection: {
      x: selection.x,
      y: selection.y,
      width: Math.min(transformed.width, map.columns - selection.x),
      height: Math.min(transformed.height, map.rows - selection.y),
    },
  };
}

function validateTerrainStamp(stamp: TerrainStamp) {
  if (!stamp || !Number.isInteger(stamp.width) || !Number.isInteger(stamp.height)
    || stamp.width <= 0 || stamp.height <= 0
    || !(stamp.terrains instanceof Uint16Array)
    || stamp.terrains.length !== stamp.width * stamp.height) {
    throw new Error("Terrain stamp is invalid");
  }
}

function validateTerrainSelection(map: TerrainMapData, selection: TerrainSelection) {
  if (!selection || !Number.isInteger(selection.x) || !Number.isInteger(selection.y)
    || !Number.isInteger(selection.width) || !Number.isInteger(selection.height)
    || selection.x < 0 || selection.y < 0 || selection.width <= 0 || selection.height <= 0
    || selection.x + selection.width > map.columns || selection.y + selection.height > map.rows) {
    throw new Error("Terrain selection is invalid");
  }
}

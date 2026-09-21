import {
  tileFlipDiagonal,
  tileFlipX,
  tileFlipY,
  tileIndexMask,
} from "./document";
import {
  cellNeighbors,
  validateTileGridLayout,
  type TileCell,
  type TileGridLayout,
} from "./tileGrid";

export {
  tileFlipDiagonal,
  tileFlipX,
  tileFlipY,
  tileIndexMask,
} from "./document";

export type TerrainNeighborMode = "edge4" | "blob8" | "edge6";
export type TerrainBoundary = "empty" | "same" | "wrap";
export const terrainUnspecified = 0;
export const terrainEmpty = 0xffff;

export interface TerrainCandidate {
  tileId: number;
  flags: number;
  weight: number;
}

export interface TerrainRule {
  mask: number;
  candidates: TerrainCandidate[];
}

export interface TerrainDefinition {
  id: number;
  name: string;
  color: string;
  neighborMode: TerrainNeighborMode;
  boundary: TerrainBoundary;
  rules: TerrainRule[];
}

export interface TerrainMapData {
  columns: number;
  rows: number;
  terrains: Uint16Array;
  seed: number;
}

export interface TerrainMapDimensions {
  columns: number;
  rows: number;
}

interface CompiledTerrain {
  definition: TerrainDefinition;
  rules: ReadonlyMap<number, TerrainRule>;
  fallback?: TerrainRule;
}

export interface CreateTerrainMapDataOptions {
  columns: number;
  rows: number;
  seed?: number;
}

export interface TerrainRuleDiagnostic {
  maximumMask: number;
  missingMasks: number[];
  coveredMasks: number[];
  duplicateMasks: number[];
  invalidMasks: number[];
  invalidCandidates: Array<{mask: number; candidateIndex: number; reason: "tile" | "flags" | "weight"}>;
}

export interface TerrainRuleDiagnosticOptions {
  tileIds?: readonly number[];
  tileWidth?: number;
  tileHeight?: number;
}

const maxTerrainDefinitionId = 0xfffe;
const maxTerrainCell = 0xffff;
const allowedTileFlags = (tileFlipX | tileFlipY | tileFlipDiagonal) >>> 0;

/** Blob corners require both adjoining cardinal neighbors. */
export function normalizeBlobMask(mask: number): number {
  if (!Number.isInteger(mask) || mask < 0 || mask > 255) throw new Error("Blob mask is invalid");
  let normalized = mask;
  for (const corner of [1, 3, 5, 7]) {
    const edges = (1 << (corner - 1)) | (1 << ((corner + 1) % 8));
    if ((mask & edges) !== edges) normalized &= ~(1 << corner);
  }
  return normalized;
}

export function terrainRuleMasks(mode: TerrainNeighborMode): number[] {
  if (mode !== "edge4" && mode !== "blob8" && mode !== "edge6") throw new Error("Terrain neighbor mode is invalid");
  return Array.from({length: maximumMask(mode) + 1}, (_, mask) => mask)
    .filter((mask) => mode !== "blob8" || normalizeBlobMask(mask) === mask);
}

/**
 * Validates definitions against the logical grid. Rules use the neighbor
 * order documented by `terrainMaskAt`, so a mask has one stable meaning for
 * every map and never depends on the order in which cells are recalculated.
 */
export function validateTerrainDefinitions(
  definitions: readonly TerrainDefinition[],
  grid: TileGridLayout,
): true {
  validateTileGridLayout(grid);
  if (!Array.isArray(definitions)) throw new Error("Terrain definitions are invalid");

  const ids = new Set<number>();
  for (const definition of definitions) {
    validateTerrainDefinition(definition, grid);
    if (ids.has(definition.id)) throw new Error("Terrain ids must be unique");
    ids.add(definition.id);
  }
  return true;
}

export function createTerrainMapData(
  columns: number,
  rows: number,
  seed?: number,
): TerrainMapData;
export function createTerrainMapData(options: CreateTerrainMapDataOptions): TerrainMapData;
export function createTerrainMapData(
  columnsOrOptions: number | CreateTerrainMapDataOptions,
  rows?: number,
  seed = 0,
): TerrainMapData {
  const options = typeof columnsOrOptions === "number"
    ? {columns: columnsOrOptions, rows, seed}
    : columnsOrOptions;
  const mapRows = options.rows;
  if (mapRows === undefined) throw new Error("Terrain map dimensions are invalid");
  const mapSeed = options.seed ?? 0;
  validateMapDimensions(options.columns, mapRows);
  validateSeed(mapSeed);
  return {
    columns: options.columns,
    rows: mapRows,
    terrains: new Uint16Array(options.columns * mapRows),
    seed: mapSeed,
  };
}

export function terrainRuleDiagnostic(
  definition: TerrainDefinition,
  options: TerrainRuleDiagnosticOptions = {},
): TerrainRuleDiagnostic {
  if (!definition || (definition.neighborMode !== "edge4" && definition.neighborMode !== "blob8" && definition.neighborMode !== "edge6")) {
    throw new Error("Terrain definition is invalid");
  }
  const maximum = maximumMask(definition.neighborMode);
  const supported = terrainRuleMasks(definition.neighborMode);
  const supportedSet = new Set(supported);
  const counts = new Map<number, number>();
  for (const rule of definition.rules) counts.set(rule.mask, (counts.get(rule.mask) ?? 0) + 1);
  const validMasks = definition.rules
    .map((rule) => rule.mask)
    .filter((mask) => supportedSet.has(mask));
  const covered = new Set(validMasks);
  const tileIds = options.tileIds ? new Set(options.tileIds) : null;
  const invalidCandidates: TerrainRuleDiagnostic["invalidCandidates"] = [];
  for (const rule of definition.rules) {
    rule.candidates.forEach((candidate, candidateIndex) => {
      if (!Number.isInteger(candidate.tileId) || candidate.tileId <= 0 || (tileIds && !tileIds.has(candidate.tileId))) {
        invalidCandidates.push({mask: rule.mask, candidateIndex, reason: "tile"});
      }
      const flags = candidate.flags >>> 0;
      if (!Number.isInteger(candidate.flags) || flags !== candidate.flags
        || (flags & ~allowedTileFlags) !== 0
        || (options.tileWidth !== undefined && options.tileHeight !== undefined
          && options.tileWidth !== options.tileHeight && (flags & tileFlipDiagonal) !== 0)) {
        invalidCandidates.push({mask: rule.mask, candidateIndex, reason: "flags"});
      }
      if (!Number.isFinite(candidate.weight) || candidate.weight <= 0) {
        invalidCandidates.push({mask: rule.mask, candidateIndex, reason: "weight"});
      }
    });
  }
  return {
    maximumMask: maximum,
    coveredMasks: [...covered].filter((mask) => Number.isInteger(mask) && mask >= 0 && mask <= maximum).sort((left, right) => left - right),
    missingMasks: supported.filter((mask) => !covered.has(mask)),
    duplicateMasks: [...counts].filter(([, count]) => count > 1).map(([mask]) => mask).sort((left, right) => left - right),
    invalidMasks: [...counts.keys()].filter((mask) => !supportedSet.has(mask)).sort((left, right) => left - right),
    invalidCandidates,
  };
}

export function createTerrainRuleTemplate(
  mode: TerrainNeighborMode,
  candidate: TerrainCandidate,
  masks?: readonly number[],
): TerrainRule[] {
  if (mode !== "edge4" && mode !== "blob8" && mode !== "edge6") throw new Error("Terrain neighbor mode is invalid");
  validateTerrainCandidate(candidate);
  const supported = new Set(terrainRuleMasks(mode));
  const requested = masks ?? [...supported];
  const unique = [...new Set(requested)];
  if (unique.some((mask) => !supported.has(mask))) {
    throw new Error("Terrain rule mask is invalid");
  }
  return unique.sort((left, right) => left - right).map((mask) => ({
    mask,
    candidates: [{...candidate, flags: normalizeFlags(candidate.flags)}],
  }));
}

export function getTerrainCell(map: TerrainMapData, column: number, row: number): number {
  validateTerrainMapData(map);
  validateCellPosition(map, column, row);
  return map.terrains[row * map.columns + column];
}

/** Returns a copy with one logical Terrain cell changed. */
export function setTerrainCell(
  map: TerrainMapData,
  column: number,
  row: number,
  terrainId: number,
): TerrainMapData {
  validateTerrainMapData(map);
  validateCellPosition(map, column, row);
  validateTerrainId(terrainId);
  const terrains = map.terrains.slice();
  terrains[row * map.columns + column] = terrainId;
  return {...map, terrains};
}

export function terrainMaskAt(
  map: TerrainMapData,
  definitions: readonly TerrainDefinition[] | TerrainDefinition,
  grid: TileGridLayout,
  column: number,
  row: number,
  terrainId?: number,
): number;
export function terrainMaskAt(
  definitions: readonly TerrainDefinition[],
  map: TerrainMapData,
  grid: TileGridLayout,
  column: number,
  row: number,
  terrainId?: number,
): number;
export function terrainMaskAt(
  first: TerrainMapData | readonly TerrainDefinition[],
  second: readonly TerrainDefinition[] | TerrainDefinition | TerrainMapData,
  grid: TileGridLayout,
  column: number,
  row: number,
  terrainId?: number,
): number {
  const {map, definitions} = normalizeMapAndDefinitions(first, second);
  validateTerrainMapData(map);
  validateTerrainDefinitions(definitions, grid);
  validateCellPosition(map, column, row);

  const currentTerrainId = terrainId ?? getTerrainCell(map, column, row);
  if (currentTerrainId === terrainUnspecified || currentTerrainId === terrainEmpty) return 0;
  validateTerrainId(currentTerrainId);
  const definition = findTerrainDefinition(definitions, currentTerrainId);
  if (!definition) throw new Error("Terrain map references an unknown terrain");
  return computeTerrainMask(map, definition, grid, column, row);
}

export function resolveTerrainTile(
  map: TerrainMapData,
  definitions: readonly TerrainDefinition[] | TerrainDefinition,
  grid: TileGridLayout,
  column: number,
  row: number,
): number;
export function resolveTerrainTile(
  definitions: readonly TerrainDefinition[],
  map: TerrainMapData,
  grid: TileGridLayout,
  column: number,
  row: number,
): number;
export function resolveTerrainTile(
  first: TerrainMapData | readonly TerrainDefinition[],
  second: readonly TerrainDefinition[] | TerrainDefinition | TerrainMapData,
  grid: TileGridLayout,
  column: number,
  row: number,
): number {
  const {map, definitions} = normalizeMapAndDefinitions(first, second);
  validateTerrainMapData(map);
  validateTerrainDefinitions(definitions, grid);
  validateCellPosition(map, column, row);

  const terrainId = getTerrainCell(map, column, row);
  if (terrainId === terrainUnspecified || terrainId === terrainEmpty) return 0;
  return resolveTerrainTileCompiled(
    map,
    compileTerrainDefinitions(definitions),
    grid,
    column,
    row,
  );
}

export function recalculateTerrainCells(
  map: TerrainMapData,
  definitions: readonly TerrainDefinition[],
  grid: TileGridLayout,
  tileCells: Uint32Array,
  changedCells: readonly TileCell[],
): TileCell[];
export function recalculateTerrainCells(
  definitions: readonly TerrainDefinition[],
  map: TerrainMapData,
  grid: TileGridLayout,
  tileCells: Uint32Array,
  changedCells: readonly TileCell[],
): TileCell[];
export function recalculateTerrainCells(
  tileCells: Uint32Array,
  map: TerrainMapData,
  definitions: readonly TerrainDefinition[],
  grid: TileGridLayout,
  changedCells: readonly TileCell[],
): TileCell[];
export function recalculateTerrainCells(
  first: TerrainMapData | readonly TerrainDefinition[] | Uint32Array,
  second: readonly TerrainDefinition[] | TerrainMapData,
  third: TileGridLayout | readonly TerrainDefinition[],
  fourth: Uint32Array | TileGridLayout,
  fifth: readonly TileCell[],
): TileCell[] {
  const {map, definitions, grid, tileCells, changedCells} = normalizeRecalculationArguments(
    first,
    second,
    third,
    fourth,
    fifth,
  );
  validateTerrainMapData(map);
  validateTerrainDefinitions(definitions, grid);
  if (!(tileCells instanceof Uint32Array) || tileCells.length !== map.columns * map.rows) {
    throw new Error("Terrain tile cells are invalid");
  }
  if (!Array.isArray(changedCells)) throw new Error("Terrain changed cells are invalid");

  const positions = terrainAffectedCells(map, definitions, grid, changedCells);
  const compiled = compileTerrainDefinitions(definitions);
  const changed: TileCell[] = [];
  for (const cell of positions) {
    const index = cell.row * map.columns + cell.column;
    const next = resolveTerrainTileCompiled(map, compiled, grid, cell.column, cell.row);
    if (tileCells[index] === next) continue;
    tileCells[index] = next;
    changed.push(cell);
  }
  return changed;
}

/** Returns the cells whose terrain tile may change after the given cells are edited. */
export function terrainAffectedCells(
  map: TerrainMapData,
  definitions: readonly TerrainDefinition[],
  grid: TileGridLayout,
  changedCells: readonly TileCell[],
): TileCell[];
export function terrainAffectedCells(
  dimensions: TerrainMapDimensions,
  definitions: readonly TerrainDefinition[],
  grid: TileGridLayout,
  changedCells: readonly TileCell[],
): TileCell[];
export function terrainAffectedCells(
  mapOrDimensions: TerrainMapData | TerrainMapDimensions,
  definitions: readonly TerrainDefinition[],
  grid: TileGridLayout,
  changedCells: readonly TileCell[],
): TileCell[] {
  return terrainAffectedCellsForDimensions(mapOrDimensions, definitions, grid, changedCells);
}

function terrainAffectedCellsForDimensions(
  mapOrDimensions: TerrainMapData | TerrainMapDimensions,
  definitions: readonly TerrainDefinition[],
  grid: TileGridLayout,
  changedCells: readonly TileCell[],
): TileCell[] {
  const dimensions = normalizeTerrainMapDimensions(mapOrDimensions);
  validateTerrainDefinitions(definitions, grid);
  if (!Array.isArray(changedCells)) throw new Error("Terrain changed cells are invalid");
  return collectTerrainAffectedCells(dimensions, definitions, grid, changedCells);
}

function compileTerrainDefinitions(definitions: readonly TerrainDefinition[]) {
  const compiled = new Map<number, CompiledTerrain>();
  for (const definition of definitions) {
    const rules = new Map(definition.rules.map((rule) => [rule.mask, rule]));
    const fallback = rules.get(0)
      ?? [...definition.rules].sort((left, right) => left.mask - right.mask)[0];
    compiled.set(definition.id, {definition, rules, fallback});
  }
  return compiled;
}

function resolveTerrainTileCompiled(
  map: TerrainMapData,
  compiled: ReadonlyMap<number, CompiledTerrain>,
  grid: TileGridLayout,
  column: number,
  row: number,
) {
  const terrainId = map.terrains[row * map.columns + column];
  if (terrainId === terrainUnspecified || terrainId === terrainEmpty) return 0;
  const terrain = compiled.get(terrainId);
  if (!terrain) throw new Error("Terrain map references an unknown terrain");
  const mask = computeTerrainMask(map, terrain.definition, grid, column, row);
  const rule = terrain.rules.get(mask) ?? terrain.fallback;
  return rule ? chooseTerrainCandidate(rule.candidates, map.seed, column, row) : 0;
}

function validateTerrainDefinition(definition: TerrainDefinition, grid: TileGridLayout) {
  if (!definition || typeof definition !== "object") throw new Error("Terrain definition is invalid");
  validateDefinitionId(definition.id);
  if (typeof definition.name !== "string" || definition.name.length === 0) {
    throw new Error("Terrain name is invalid");
  }
  if (typeof definition.color !== "string" || definition.color.length === 0) {
    throw new Error("Terrain color is invalid");
  }
  if (definition.neighborMode !== "edge4" && definition.neighborMode !== "blob8" && definition.neighborMode !== "edge6") {
    throw new Error("Terrain neighbor mode is invalid");
  }
  if (definition.boundary !== "empty" && definition.boundary !== "same" && definition.boundary !== "wrap") {
    throw new Error("Terrain boundary is invalid");
  }
  validateNeighborModeForGrid(definition.neighborMode, grid);
  if (!Array.isArray(definition.rules)) throw new Error("Terrain rules are invalid");

  const maxMask = maximumMask(definition.neighborMode);
  const masks = new Set<number>();
  for (const rule of definition.rules) {
    if (!rule || typeof rule !== "object" || !Number.isInteger(rule.mask) || rule.mask < 0 || rule.mask > maxMask
      || (definition.neighborMode === "blob8" && normalizeBlobMask(rule.mask) !== rule.mask)) {
      throw new Error("Terrain rule mask is invalid");
    }
    if (masks.has(rule.mask)) throw new Error("Terrain rule masks must be unique");
    masks.add(rule.mask);
    if (!Array.isArray(rule.candidates) || rule.candidates.length === 0) {
      throw new Error("Terrain rule candidates are invalid");
    }
    for (const candidate of rule.candidates) validateTerrainCandidate(candidate);
  }
}

function validateTerrainCandidate(candidate: TerrainCandidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("Terrain candidate is invalid");
  if (!Number.isInteger(candidate.tileId) || candidate.tileId <= 0 || candidate.tileId > tileIndexMask) {
    throw new Error("Terrain candidate tile id is invalid");
  }
  const flags = normalizeFlags(candidate.flags);
  if ((flags & (~allowedTileFlags >>> 0)) !== 0) throw new Error("Terrain candidate flags are invalid");
  if (typeof candidate.weight !== "number" || !Number.isFinite(candidate.weight) || candidate.weight <= 0) {
    throw new Error("Terrain candidate weight is invalid");
  }
}

function validateTerrainId(terrainId: number) {
  if (!Number.isInteger(terrainId) || terrainId < terrainUnspecified || terrainId > maxTerrainCell) {
    throw new Error("Terrain id must be an integer from 0 to 65535");
  }
}

function validateDefinitionId(terrainId: number) {
  if (!Number.isInteger(terrainId) || terrainId < 1 || terrainId > maxTerrainDefinitionId) {
    throw new Error("Terrain id must be an integer from 1 to 65534");
  }
}

function validateSeed(seed: number) {
  if (!Number.isSafeInteger(seed)) throw new Error("Terrain seed must be a safe integer");
}

function validateMapDimensions(columns: number, rows: number) {
  if (!Number.isSafeInteger(columns) || !Number.isSafeInteger(rows) || columns <= 0 || rows <= 0) {
    throw new Error("Terrain map dimensions are invalid");
  }
  if (!Number.isSafeInteger(columns * rows)) throw new Error("Terrain map dimensions are invalid");
}

function validateTerrainMapData(map: TerrainMapData) {
  if (!map || typeof map !== "object") throw new Error("Terrain map is required");
  validateMapDimensions(map.columns, map.rows);
  validateSeed(map.seed);
  if (!(map.terrains instanceof Uint16Array) || map.terrains.length !== map.columns * map.rows) {
    throw new Error("Terrain map cells are invalid");
  }
}

function validateCellPosition(map: TerrainMapDimensions, column: number, row: number) {
  if (!Number.isInteger(column) || !Number.isInteger(row)
    || column < 0 || row < 0 || column >= map.columns || row >= map.rows) {
    throw new Error("Terrain cell position is outside the terrain map");
  }
}

function validateNeighborModeForGrid(mode: TerrainNeighborMode, grid: TileGridLayout) {
  if (grid.kind === "hexagonal" && mode !== "edge6") {
    throw new Error("Hexagonal grids require edge6 terrain rules");
  }
  if (grid.kind === "isometric" && mode !== "edge4") {
    throw new Error("Isometric grids require edge4 terrain rules");
  }
  if (grid.kind === "orthogonal" && mode === "edge6") {
    throw new Error("Orthogonal grids do not support edge6 terrain rules");
  }
}

function maximumMask(mode: TerrainNeighborMode) {
  return mode === "edge6" ? 0x3f : mode === "blob8" ? 0xff : 0x0f;
}

function normalizeFlags(flags: number) {
  if (!Number.isInteger(flags) || flags < -0x80000000 || flags > 0xffffffff) {
    throw new Error("Terrain candidate flags are invalid");
  }
  return flags >>> 0;
}

function normalizeMapAndDefinitions(
  first: TerrainMapData | readonly TerrainDefinition[],
  second: readonly TerrainDefinition[] | TerrainDefinition | TerrainMapData,
): {map: TerrainMapData; definitions: readonly TerrainDefinition[]} {
  if (isTerrainMapData(first)) {
    if (isTerrainMapData(second) || !Array.isArray(second)) {
      const definition = second as TerrainDefinition;
      return {map: first, definitions: [definition]};
    }
    return {map: first, definitions: second};
  }
  if (!isTerrainMapData(second) || !Array.isArray(first)) {
    throw new Error("Terrain map and definitions are required");
  }
  return {map: second, definitions: first};
}

function isTerrainMapData(value: unknown): value is TerrainMapData {
  return Boolean(value && typeof value === "object" && "columns" in value && "rows" in value && "terrains" in value && "seed" in value);
}

function normalizeTerrainMapDimensions(
  value: TerrainMapData | TerrainMapDimensions,
): TerrainMapDimensions {
  if (isTerrainMapData(value)) {
    validateTerrainMapData(value);
    return value;
  }
  if (!value || typeof value !== "object") throw new Error("Terrain map dimensions are invalid");
  validateMapDimensions(value.columns, value.rows);
  return value;
}

function findTerrainDefinition(
  definitions: readonly TerrainDefinition[],
  terrainId: number,
): TerrainDefinition | undefined {
  return definitions.find((definition) => definition.id === terrainId);
}

function computeTerrainMask(
  map: TerrainMapData,
  definition: TerrainDefinition,
  grid: TileGridLayout,
  column: number,
  row: number,
): number {
  const neighbors = terrainNeighbors(grid, definition.neighborMode, column, row);
  let mask = 0;
  for (let index = 0; index < neighbors.length; index += 1) {
    const neighbor = resolveBoundary(map, definition.boundary, neighbors[index]);
    if (neighbor === "same") {
      mask |= 1 << index;
      continue;
    }
    if (neighbor === null) continue;
    if (map.terrains[neighbor.row * map.columns + neighbor.column] === definition.id) {
      mask |= 1 << index;
    }
  }
  return definition.neighborMode === "blob8" ? normalizeBlobMask(mask) : mask;
}

function terrainNeighbors(
  grid: TileGridLayout,
  mode: TerrainNeighborMode,
  column: number,
  row: number,
): TileCell[] {
  if (mode === "edge6") return cellNeighbors(grid, {column, row});
  if (mode === "edge4") return cellNeighbors(grid, {column, row});
  return [
    {column, row: row - 1},
    {column: column + 1, row: row - 1},
    {column: column + 1, row},
    {column: column + 1, row: row + 1},
    {column, row: row + 1},
    {column: column - 1, row: row + 1},
    {column: column - 1, row},
    {column: column - 1, row: row - 1},
  ];
}

function resolveBoundary(
  map: TerrainMapDimensions,
  boundary: TerrainBoundary,
  cell: TileCell,
): TileCell | "same" | null {
  if (cell.column >= 0 && cell.column < map.columns && cell.row >= 0 && cell.row < map.rows) return cell;
  if (boundary === "same") return "same";
  if (boundary === "empty") return null;
  return {
    column: modulo(cell.column, map.columns),
    row: modulo(cell.row, map.rows),
  };
}

function findRule(definition: TerrainDefinition, mask: number): TerrainRule | undefined {
  const exact = definition.rules.find((rule) => rule.mask === mask);
  if (exact) return exact;
  return definition.rules.find((rule) => rule.mask === 0)
    ?? [...definition.rules].sort((left, right) => left.mask - right.mask)[0];
}

function chooseTerrainCandidate(
  candidates: readonly TerrainCandidate[],
  seed: number,
  column: number,
  row: number,
): number {
  let totalWeight = 0;
  for (const candidate of candidates) totalWeight += candidate.weight;
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) return 0;

  let target = (hashTerrainCoordinate(seed, column, row) / 0x100000000) * totalWeight;
  for (const candidate of candidates) {
    if (target < candidate.weight) return encodeTileValue(candidate.tileId, candidate.flags);
    target -= candidate.weight;
  }
  const last = candidates[candidates.length - 1];
  return encodeTileValue(last.tileId, last.flags);
}

function encodeTileValue(tileId: number, flags: number) {
  return (tileId | normalizeFlags(flags)) >>> 0;
}

function hashTerrainCoordinate(seed: number, column: number, row: number) {
  let hash = (2166136261 ^ (seed >>> 0)) >>> 0;
  hash = hashInteger(hash, column);
  hash = hashInteger(hash, row);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function hashInteger(hash: number, value: number) {
  hash ^= value >>> 0;
  return Math.imul(hash, 0x01000193) >>> 0;
}

function normalizeRecalculationArguments(
  first: TerrainMapData | readonly TerrainDefinition[] | Uint32Array,
  second: readonly TerrainDefinition[] | TerrainMapData,
  third: TileGridLayout | readonly TerrainDefinition[],
  fourth: Uint32Array | TileGridLayout,
  fifth: readonly TileCell[],
): {
  map: TerrainMapData;
  definitions: readonly TerrainDefinition[];
  grid: TileGridLayout;
  tileCells: Uint32Array;
  changedCells: readonly TileCell[];
} {
  if (first instanceof Uint32Array) {
    if (!isTerrainMapData(second) || !Array.isArray(third) || !isTileGridLayout(fourth)) {
      throw new Error("Terrain recalculation arguments are invalid");
    }
    return {tileCells: first, map: second, definitions: third, grid: fourth, changedCells: fifth};
  }
  if (isTerrainMapData(first)) {
    if (!Array.isArray(second) || !isTileGridLayout(third) || !(fourth instanceof Uint32Array)) {
      throw new Error("Terrain recalculation arguments are invalid");
    }
    return {map: first, definitions: second, grid: third, tileCells: fourth, changedCells: fifth};
  }
  if (!Array.isArray(first) || !isTerrainMapData(second) || !isTileGridLayout(third) || !(fourth instanceof Uint32Array)) {
    throw new Error("Terrain recalculation arguments are invalid");
  }
  return {map: second, definitions: first, grid: third, tileCells: fourth, changedCells: fifth};
}

function isTileGridLayout(value: unknown): value is TileGridLayout {
  return Boolean(value && typeof value === "object" && "kind" in value && "tileWidth" in value && "tileHeight" in value);
}

function collectTerrainAffectedCells(
  dimensions: TerrainMapDimensions,
  definitions: readonly TerrainDefinition[],
  grid: TileGridLayout,
  changedCells: readonly TileCell[],
): TileCell[] {
  const positions = new Map<number, TileCell>();
  const wraps = definitions.some((definition) => definition.boundary === "wrap");
  const neighborhoods = [...new Map(definitions.map((definition) =>
    [`${definition.neighborMode}:${definition.boundary}`, definition])).values()];
  const include = (cell: TileCell) => {
    positions.set(cell.row * dimensions.columns + cell.column, cell);
  };

  for (const cell of changedCells) {
    if (!cell || !Number.isInteger(cell.column) || !Number.isInteger(cell.row)) {
      throw new Error("Terrain changed cell is invalid");
    }
    validateCellPosition(dimensions, cell.column, cell.row);
    include(cell);
  }

  for (const cell of changedCells) {
    if (positions.size === dimensions.columns * dimensions.rows) break;
    // Every supported terrain neighborhood changes each coordinate by at most
    // one cell. Check the small candidate window against the target's actual
    // neighbors so offset-hex parity is evaluated at the target boundary.
    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
        const rawColumn = cell.column + columnOffset;
        const rawRow = cell.row + rowOffset;
        if (!wraps && (rawColumn < 0 || rawColumn >= dimensions.columns || rawRow < 0 || rawRow >= dimensions.rows)) {
          continue;
        }
        const candidate = {
          column: wraps ? modulo(rawColumn, dimensions.columns) : rawColumn,
          row: wraps ? modulo(rawRow, dimensions.rows) : rawRow,
        };
        if (!positions.has(candidate.row * dimensions.columns + candidate.column)
          && terrainCellDependsOn(dimensions, neighborhoods, grid, candidate, cell)) include(candidate);
      }
    }
  }

  return [...positions.values()].sort((left, right) => left.row - right.row || left.column - right.column);
}

function terrainCellDependsOn(
  dimensions: TerrainMapDimensions,
  definitions: readonly TerrainDefinition[],
  grid: TileGridLayout,
  candidate: TileCell,
  changed: TileCell,
): boolean {
  return definitions.some((definition) => terrainNeighbors(grid, definition.neighborMode, candidate.column, candidate.row)
    .some((neighbor) => {
      const resolved = resolveBoundary(dimensions, definition.boundary, neighbor);
      if (resolved === null || resolved === "same") return false;
      return resolved.column === changed.column && resolved.row === changed.row;
    }));
}

function modulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

import {
  tileFlipDiagonal,
  tileFlipX,
  tileFlipY,
  tileIndexMask,
  type TilemapData,
  type Tileset,
  type TilesetGrid,
} from "./document";
import type {TerrainMapData} from "./terrain";
import {
  axialToOffset,
  offsetToAxial,
} from "./tileGridHexagonal";
import {
  validateTileGridLayout,
  cellNeighbors,
  type HexagonalTileGridLayout,
  type TileGridLayout,
} from "./tileGrid";
import {cloneTileset, sourcePixelForTileValue, validateTilemapData, validateTileset} from "./tilemap";
import {tilemapPixelSize} from "./tilemapGeometry";

export type TilemapTransformOperation = "horizontal" | "vertical" | "cw" | "ccw" | "180";

export type TilemapTransformGridInput = Tileset | TilesetGrid | TileGridLayout;

export interface TilemapGridTransformGeometry {
  sourceDimensions: {columns: number; rows: number};
  dimensions: {columns: number; rows: number};
  sourceGrid: TilesetGrid | TileGridLayout;
  grid: TilesetGrid | TileGridLayout;
  tileWidth?: number;
  tileHeight?: number;
  pixelSize?: {width: number; height: number};
}

export interface TilemapGridTransformResult {
  tilemap: TilemapData;
  terrainmap?: TerrainMapData;
  grid: TilesetGrid | TileGridLayout;
  tileset?: Tileset;
  geometry: TilemapGridTransformGeometry;
}

interface NormalizedGridInput {
  sourceGrid: TilesetGrid | TileGridLayout;
  sourceTileset?: Tileset;
  tileWidth?: number;
  tileHeight?: number;
  layoutInput: boolean;
}

interface CellMapping {
  columns: number;
  rows: number;
  mapSourceCell(column: number, row: number): {column: number; row: number};
  hexTarget?: {
    orientation: "pointy" | "flat";
    offset: "odd-r" | "even-r" | "odd-q" | "even-q";
  };
}

interface AxialCell {
  q: number;
  r: number;
}

interface CubeCell {
  x: number;
  y: number;
  z: number;
}

const tileFlagMask = (tileFlipX | tileFlipY | tileFlipDiagonal) >>> 0;
const invalidTileFlagMask = (~tileFlagMask) >>> 0;
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

/**
 * Transforms a complete logical tilemap. Grid-specific transforms operate in
 * logical coordinates first, while encoded tile flags keep the same screen
 * operation for each tile image.
 */
export function transformTilemapGrid(
  tilemap: TilemapData,
  terrainmapOrGrid: TerrainMapData | TilemapTransformGridInput | undefined,
  gridOrOperation: TilemapTransformGridInput | TilemapTransformOperation,
  maybeOperation?: TilemapTransformOperation,
): TilemapGridTransformResult {
  const hasTerrainMap = typeof gridOrOperation !== "string";
  const terrainmap = hasTerrainMap ? terrainmapOrGrid as TerrainMapData | undefined : undefined;
  const tilesetOrGrid = hasTerrainMap
    ? gridOrOperation as TilemapTransformGridInput
    : terrainmapOrGrid as TilemapTransformGridInput;
  const operation = hasTerrainMap ? maybeOperation : gridOrOperation as TilemapTransformOperation;

  if (!operation || !isTransformOperation(operation)) throw new Error("Tilemap transform operation is invalid");
  validateTilemapData(tilemap);
  validateTerrainMap(terrainmap);
  if (terrainmap && (terrainmap.columns !== tilemap.columns || terrainmap.rows !== tilemap.rows)) {
    throw new Error("Terrain map dimensions must match the tilemap");
  }

  const normalized = normalizeGridInput(tilesetOrGrid, tilemap.gridOffset);
  validateTileValues(tilemap, normalized.tileWidth, normalized.tileHeight);
  const rotateTilePixels = Boolean(normalized.sourceTileset
    && normalized.tileWidth !== normalized.tileHeight && (operation === "cw" || operation === "ccw"));
  if (!rotateTilePixels) validateQuarterTurnDimensions(operation, normalized.tileWidth, normalized.tileHeight);

  const mapping = createCellMapping(tilemap, normalized.sourceGrid, operation);
  const transformedTilemap = {
    columns: mapping.columns,
    rows: mapping.rows,
    tiles: new Uint32Array(mapping.columns * mapping.rows),
  };

  for (let row = 0; row < tilemap.rows; row += 1) {
    for (let column = 0; column < tilemap.columns; column += 1) {
      const destination = mapping.mapSourceCell(column, row);
      const sourceValue = tilemap.tiles[row * tilemap.columns + column];
      transformedTilemap.tiles[destination.row * mapping.columns + destination.column] = rotateTilePixels
        ? swapTileFlipAxes(sourceValue) : transformTileValue(sourceValue, operation);
    }
  }

  const transformedTerrainmap = terrainmap
    ? transformTerrainMap(terrainmap, mapping)
    : undefined;
  const transformedGrid = transformGridInput(normalized, operation, mapping.hexTarget);
  const transformedTileset = normalized.sourceTileset
    ? cloneTransformedTileset(normalized.sourceTileset, transformedGrid, operation, rotateTilePixels)
    : undefined;
  const geometry: TilemapGridTransformGeometry = {
    sourceDimensions: {columns: tilemap.columns, rows: tilemap.rows},
    dimensions: {columns: mapping.columns, rows: mapping.rows},
    sourceGrid: cloneGrid(normalized.sourceGrid),
    grid: cloneGrid(transformedGrid),
    ...(normalized.tileWidth === undefined ? {} : {tileWidth: rotateTilePixels ? normalized.tileHeight : normalized.tileWidth}),
    ...(normalized.tileHeight === undefined ? {} : {tileHeight: rotateTilePixels ? normalized.tileWidth : normalized.tileHeight}),
    ...(transformedTileset
      ? {pixelSize: tilemapPixelSize(transformedTileset, transformedTilemap)}
      : {}),
  };

  return {
    tilemap: transformedTilemap,
    ...(transformedTerrainmap ? {terrainmap: transformedTerrainmap} : {}),
    grid: transformedGrid,
    ...(transformedTileset ? {tileset: transformedTileset} : {}),
    geometry,
  };
}

function normalizeGridInput(input: TilemapTransformGridInput, gridOffset?: TilemapData["gridOffset"]): NormalizedGridInput {
  if (isTileset(input)) {
    validateTileset(input);
    if (gridOffset !== undefined && (input.grid.kind !== "hexagonal"
      || (input.grid.orientation === "pointy" && !gridOffset.endsWith("-r"))
      || (input.grid.orientation === "flat" && !gridOffset.endsWith("-q")))) {
      throw new Error("Tilemap grid offset does not match the Tileset grid");
    }
    return {
      sourceGrid: input.grid.kind === "hexagonal" && gridOffset ? {...input.grid, offset: gridOffset} : cloneGrid(input.grid),
      sourceTileset: input,
      tileWidth: input.tileWidth,
      tileHeight: input.tileHeight,
      layoutInput: false,
    };
  }

  if (isTileGridLayout(input)) {
    validateTileGridLayout(input);
    return {
      sourceGrid: cloneGrid(input),
      tileWidth: input.kind === "isometric" ? undefined : input.tileWidth,
      tileHeight: input.kind === "isometric" ? undefined : input.tileHeight,
      layoutInput: true,
    };
  }

  validateTilesetGridShape(input);
  return {
    sourceGrid: cloneGrid(input),
    layoutInput: false,
  };
}

function isTileset(value: TilemapTransformGridInput): value is Tileset {
  return Boolean(value && typeof value === "object" && "grid" in value && "tiles" in value
    && "tileWidth" in value && "tileHeight" in value);
}

function isTileGridLayout(value: TilemapTransformGridInput): value is TileGridLayout {
  return Boolean(value && typeof value === "object" && "tileWidth" in value && "tileHeight" in value);
}

function cloneGrid(grid: TilesetGrid | TileGridLayout): TilesetGrid | TileGridLayout {
  return {...grid};
}

function cloneTransformedTileset(
  tileset: Tileset,
  grid: TilesetGrid | TileGridLayout,
  operation: TilemapTransformOperation,
  rotateTilePixels: boolean,
): Tileset {
  if (isTileGridLayout(grid)) throw new Error("Tileset geometry cannot use a generic tile grid layout");
  const transformed = cloneTileset(tileset);
  transformed.grid = {...grid};
  if (rotateTilePixels) {
    transformed.tileWidth = tileset.tileHeight;
    transformed.tileHeight = tileset.tileWidth;
    for (const tile of transformed.tiles) {
      const pixels = new Uint8ClampedArray(tile.pixels.length);
      const indexes = tile.indexes ? new Uint8Array(tile.indexes.length) : undefined;
      for (let y = 0; y < transformed.tileHeight; y += 1) {
        for (let x = 0; x < transformed.tileWidth; x += 1) {
          const source = operationSource(operation, x, y, tileset.tileWidth, tileset.tileHeight);
          const sourceIndex = source.y * tileset.tileWidth + source.x;
          const targetIndex = y * transformed.tileWidth + x;
          pixels.set(tile.pixels.subarray(sourceIndex * 4, sourceIndex * 4 + 4), targetIndex * 4);
          if (indexes) indexes[targetIndex] = tile.indexes![sourceIndex];
        }
      }
      tile.pixels = pixels;
      tile.indexes = indexes;
    }
  }
  transformed.terrains = transformed.terrains.map((terrain) => ({
    ...terrain,
    rules: terrain.rules.map((rule) => ({
      ...rule,
      mask: transformTerrainMask(rule.mask, terrain.neighborMode, tileset.grid, transformed.grid, operation),
      candidates: rule.candidates.map((candidate) => ({
        ...candidate,
        flags: ((rotateTilePixels
          ? swapTileFlipAxes(candidate.flags)
          : transformTileValue((candidate.tileId | candidate.flags) >>> 0, operation)) & tileFlagMask) >>> 0,
      })),
    })),
  }));
  return transformed;
}

function swapTileFlipAxes(value: number): number {
  return ((value & tileIndexMask)
    | ((value & tileFlipX) ? tileFlipY : 0)
    | ((value & tileFlipY) ? tileFlipX : 0)) >>> 0;
}

function transformTerrainMask(
  mask: number,
  mode: "edge4" | "blob8" | "edge6",
  sourceGrid: TilesetGrid,
  targetGrid: TilesetGrid,
  operation: TilemapTransformOperation,
) {
  if (mode === "edge6") {
    if (sourceGrid.kind !== "hexagonal" || targetGrid.kind !== "hexagonal") {
      throw new Error("Hexagonal Terrain requires hexagonal grids");
    }
    // Direction vectors do not depend on the map's dimensions or offset parity.
    const origin = {column: 0, row: 0};
    const sourceLayout = gridLayoutForNeighbors(sourceGrid) as HexagonalTileGridLayout;
    const targetLayout = gridLayoutForNeighbors(targetGrid) as HexagonalTileGridLayout;
    const sourceOrigin = offsetToAxial(sourceLayout, origin);
    const targetOrigin = offsetToAxial(targetLayout, origin);
    const targetDirections = cellNeighbors(targetLayout, origin).map((cell) => {
      const axial = offsetToAxial(targetLayout, cell);
      return {q: axial.q - targetOrigin.q, r: axial.r - targetOrigin.r};
    });
    let transformed = 0;
    cellNeighbors(sourceLayout, origin).forEach((cell, index) => {
      if ((mask & (1 << index)) === 0) return;
      const axial = offsetToAxial(sourceLayout, cell);
      const direction = cubeToAxial(transformHexCube(
        axialToCube({q: axial.q - sourceOrigin.q, r: axial.r - sourceOrigin.r}),
        sourceGrid.orientation,
        operation,
      ));
      const targetIndex = targetDirections.findIndex((candidate) => candidate.q === direction.q && candidate.r === direction.r);
      if (targetIndex < 0) throw new Error("Terrain mask transform is incomplete");
      transformed |= 1 << targetIndex;
    });
    return transformed;
  }
  const probe = {columns: 7, rows: 7, tiles: new Uint32Array(49)};
  const mapping = createCellMapping(probe, sourceGrid, operation);
  const sourceCenter = {column: 3, row: 3};
  const targetCenter = mapping.mapSourceCell(sourceCenter.column, sourceCenter.row);
  const sourceNeighbors = terrainMaskNeighbors(sourceGrid, mode, sourceCenter);
  const targetNeighbors = terrainMaskNeighbors(targetGrid, mode, targetCenter);
  let transformed = 0;
  for (let sourceIndex = 0; sourceIndex < sourceNeighbors.length; sourceIndex += 1) {
    if ((mask & (1 << sourceIndex)) === 0) continue;
    const source = sourceNeighbors[sourceIndex];
    const target = mapping.mapSourceCell(source.column, source.row);
    const targetIndex = targetNeighbors.findIndex((candidate) => candidate.column === target.column && candidate.row === target.row);
    if (targetIndex < 0) throw new Error("Terrain mask transform is incomplete");
    transformed |= 1 << targetIndex;
  }
  return transformed;
}

function terrainMaskNeighbors(
  grid: TilesetGrid,
  mode: "edge4" | "blob8" | "edge6",
  center: {column: number; row: number},
) {
  if (mode === "edge6") return cellNeighbors(gridLayoutForNeighbors(grid), center);
  if (mode === "edge4") {
    return [
      {column: center.column, row: center.row - 1},
      {column: center.column + 1, row: center.row},
      {column: center.column, row: center.row + 1},
      {column: center.column - 1, row: center.row},
    ];
  }
  return [
    {column: center.column, row: center.row - 1},
    {column: center.column + 1, row: center.row - 1},
    {column: center.column + 1, row: center.row},
    {column: center.column + 1, row: center.row + 1},
    {column: center.column, row: center.row + 1},
    {column: center.column - 1, row: center.row + 1},
    {column: center.column - 1, row: center.row},
    {column: center.column - 1, row: center.row - 1},
  ];
}

function gridLayoutForNeighbors(grid: TilesetGrid): TileGridLayout {
  if (grid.kind === "orthogonal") return {kind: "orthogonal", tileWidth: 1, tileHeight: 1};
  if (grid.kind === "isometric") return {kind: "isometric", tileWidth: grid.cellWidth, tileHeight: grid.cellHeight};
  return {kind: "hexagonal", tileWidth: 2, tileHeight: 2, orientation: grid.orientation, offset: grid.offset};
}

function validateTilesetGridShape(grid: TilesetGrid): true {
  if (!grid || typeof grid !== "object") throw new Error("Tileset grid is required");
  if (grid.kind === "orthogonal") return true;
  if (grid.kind === "isometric") {
    if (!Number.isInteger(grid.cellWidth) || grid.cellWidth <= 0
      || !Number.isInteger(grid.cellHeight) || grid.cellHeight <= 0
      || !Number.isInteger(grid.anchorX) || grid.anchorX < 0
      || !Number.isInteger(grid.anchorY) || grid.anchorY < 0) {
      throw new Error("Tileset isometric grid is invalid");
    }
    return true;
  }
  if (grid.kind !== "hexagonal"
    || (grid.orientation !== "pointy" && grid.orientation !== "flat")
    || (grid.offset !== "odd-r" && grid.offset !== "even-r" && grid.offset !== "odd-q" && grid.offset !== "even-q")
    || (grid.orientation === "pointy" && grid.offset !== "odd-r" && grid.offset !== "even-r")
    || (grid.orientation === "flat" && grid.offset !== "odd-q" && grid.offset !== "even-q")) {
    throw new Error("Tileset grid is invalid");
  }
  return true;
}

function validateTerrainMap(map: TerrainMapData | undefined): true {
  if (!map) return true;
  if (!Number.isSafeInteger(map.columns) || map.columns <= 0
    || !Number.isSafeInteger(map.rows) || map.rows <= 0
    || !Number.isSafeInteger(map.columns * map.rows)) {
    throw new Error("Terrain map dimensions are invalid");
  }
  if (!(map.terrains instanceof Uint16Array) || map.terrains.length !== map.columns * map.rows) {
    throw new Error("Terrain map cells are invalid");
  }
  if (!Number.isSafeInteger(map.seed)) throw new Error("Terrain seed must be a safe integer");
  return true;
}

function validateTileValues(tilemap: TilemapData, tileWidth?: number, tileHeight?: number) {
  for (const rawValue of tilemap.tiles) {
    const value = rawValue >>> 0;
    const flags = (value & (~tileIndexMask)) >>> 0;
    if ((flags & invalidTileFlagMask) !== 0) throw new Error("Tile value contains invalid flags");
    const tileId = value & tileIndexMask;
    if (tileId === 0 && flags !== 0) throw new Error("Empty tile cells cannot carry flags");
    if (tileWidth !== undefined && tileHeight !== undefined
      && tileWidth !== tileHeight && (flags & tileFlipDiagonal) !== 0) {
      throw new Error("Diagonal tile flags require square tiles");
    }
  }
}

function validateQuarterTurnDimensions(
  operation: TilemapTransformOperation,
  tileWidth?: number,
  tileHeight?: number,
) {
  if (operation !== "cw" && operation !== "ccw") return;
  if (tileWidth !== undefined && tileHeight !== undefined && tileWidth !== tileHeight) {
    throw new Error("90-degree tilemap transforms require square tiles");
  }
}

function isTransformOperation(value: string): value is TilemapTransformOperation {
  return value === "horizontal" || value === "vertical" || value === "cw" || value === "ccw" || value === "180";
}

function createCellMapping(
  tilemap: TilemapData,
  grid: TilesetGrid | TileGridLayout,
  operation: TilemapTransformOperation,
): CellMapping {
  if (grid.kind === "orthogonal") return createOrthogonalMapping(tilemap.columns, tilemap.rows, operation);
  if (grid.kind === "isometric") return createIsometricMapping(tilemap.columns, tilemap.rows, operation);
  return createHexagonalMapping(tilemap.columns, tilemap.rows, grid, operation);
}

function createOrthogonalMapping(columns: number, rows: number, operation: TilemapTransformOperation): CellMapping {
  switch (operation) {
    case "horizontal":
      return {columns, rows, mapSourceCell: (column, row) => ({column: columns - 1 - column, row})};
    case "vertical":
      return {columns, rows, mapSourceCell: (column, row) => ({column, row: rows - 1 - row})};
    case "cw":
      return {columns: rows, rows: columns, mapSourceCell: (column, row) => ({column: rows - 1 - row, row: column})};
    case "ccw":
      return {columns: rows, rows: columns, mapSourceCell: (column, row) => ({column: row, row: columns - 1 - column})};
    case "180":
      return {columns, rows, mapSourceCell: (column, row) => ({column: columns - 1 - column, row: rows - 1 - row})};
  }
}

function createIsometricMapping(columns: number, rows: number, operation: TilemapTransformOperation): CellMapping {
  switch (operation) {
    case "horizontal":
      return {columns: rows, rows: columns, mapSourceCell: (column, row) => ({column: row, row: column})};
    case "vertical":
      return {
        columns: rows,
        rows: columns,
        mapSourceCell: (column, row) => ({column: rows - 1 - row, row: columns - 1 - column}),
      };
    case "cw":
      return {
        columns: rows,
        rows: columns,
        mapSourceCell: (column, row) => ({column: rows - 1 - row, row: column}),
      };
    case "ccw":
      return {
        columns: rows,
        rows: columns,
        mapSourceCell: (column, row) => ({column: row, row: columns - 1 - column}),
      };
    case "180":
      return {
        columns,
        rows,
        mapSourceCell: (column, row) => ({column: columns - 1 - column, row: rows - 1 - row}),
      };
  }
}

function createHexagonalMapping(
  columns: number,
  rows: number,
  grid: Extract<TilesetGrid | TileGridLayout, {kind: "hexagonal"}>,
  operation: TilemapTransformOperation,
): CellMapping {
  const sourceOrientation = grid.orientation;
  const targetOrientation = operation === "cw" || operation === "ccw"
    ? sourceOrientation === "pointy" ? "flat" : "pointy"
    : sourceOrientation;
  const outputColumns = operation === "cw" || operation === "ccw" ? rows : columns;
  const outputRows = operation === "cw" || operation === "ccw" ? columns : rows;
  const preferredParity = grid.offset.startsWith("odd") ? "odd" : "even";
  const targetOffsets = hexOffsets(targetOrientation).sort((left, right) => {
    const leftPreferred = left.startsWith(preferredParity) ? 0 : 1;
    const rightPreferred = right.startsWith(preferredParity) ? 0 : 1;
    return leftPreferred - rightPreferred;
  });

  const sourceAxial: Array<{sourceColumn: number; sourceRow: number; transformed: AxialCell}> = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const axial = offsetToAxial(hexLayout(sourceOrientation, grid.offset), {column, row});
      sourceAxial.push({
        sourceColumn: column,
        sourceRow: row,
        transformed: cubeToAxial(transformHexCube(axialToCube(axial), sourceOrientation, operation)),
      });
    }
  }

  for (const offset of targetOffsets) {
    const targetCells = new Map<string, {column: number; row: number}>();
    let targetMinimumQ = Number.POSITIVE_INFINITY;
    let targetMinimumR = Number.POSITIVE_INFINITY;
    for (let row = 0; row < outputRows; row += 1) {
      for (let column = 0; column < outputColumns; column += 1) {
        const axial = offsetToAxial(hexLayout(targetOrientation, offset), {column, row});
        targetCells.set(axialKey(axial), {column, row});
        targetMinimumQ = Math.min(targetMinimumQ, axial.q);
        targetMinimumR = Math.min(targetMinimumR, axial.r);
      }
    }
    let sourceMinimumQ = Number.POSITIVE_INFINITY;
    let sourceMinimumR = Number.POSITIVE_INFINITY;
    for (const cell of sourceAxial) {
      sourceMinimumQ = Math.min(sourceMinimumQ, cell.transformed.q);
      sourceMinimumR = Math.min(sourceMinimumR, cell.transformed.r);
    }
    const translation = {q: sourceMinimumQ - targetMinimumQ, r: sourceMinimumR - targetMinimumR};
    const sourceToTarget = new Map<number, {column: number; row: number}>();
    const usedTargets = new Set<string>();
    let valid = true;
    for (const source of sourceAxial) {
      const target = targetCells.get(axialKey({
        q: source.transformed.q - translation.q,
        r: source.transformed.r - translation.r,
      }));
      if (!target) {
        valid = false;
        break;
      }
      const targetKey = `${target.column},${target.row}`;
      if (usedTargets.has(targetKey)) {
        valid = false;
        break;
      }
      usedTargets.add(targetKey);
      sourceToTarget.set(source.sourceRow * columns + source.sourceColumn, target);
    }
    if (!valid || usedTargets.size !== columns * rows) continue;

    return {
      columns: outputColumns,
      rows: outputRows,
      mapSourceCell: (column, row) => {
        const destination = sourceToTarget.get(row * columns + column);
        if (!destination) throw new Error("Hexagonal cell transform is incomplete");
        return destination;
      },
      hexTarget: {orientation: targetOrientation, offset},
    };
  }

  throw new Error("Hexagonal transform does not produce a rectangular offset grid");
}

function hexLayout(
  orientation: "pointy" | "flat",
  offset: "odd-r" | "even-r" | "odd-q" | "even-q",
): HexagonalTileGridLayout {
  return {kind: "hexagonal", tileWidth: 1, tileHeight: 1, orientation, offset};
}

function hexOffsets(orientation: "pointy" | "flat") {
  return orientation === "pointy"
    ? ["odd-r", "even-r"] as Array<"odd-r" | "even-r">
    : ["odd-q", "even-q"] as Array<"odd-q" | "even-q">;
}

function axialToCube(axial: AxialCell): CubeCell {
  return {x: axial.q, y: -axial.q - axial.r, z: axial.r};
}

function cubeToAxial(cube: CubeCell): AxialCell {
  return {q: cube.x, r: cube.z};
}

function transformHexCube(
  cube: CubeCell,
  orientation: "pointy" | "flat",
  operation: TilemapTransformOperation,
): CubeCell {
  if (operation === "180") return {x: -cube.x, y: -cube.y, z: -cube.z};
  if (orientation === "pointy") {
    switch (operation) {
      case "horizontal": return {x: cube.y, y: cube.x, z: cube.z};
      case "vertical": return {x: -cube.y, y: -cube.x, z: -cube.z};
      case "cw": return {x: -cube.z, y: -cube.x, z: -cube.y};
      case "ccw": return {x: cube.z, y: cube.x, z: cube.y};
    }
  }
  switch (operation) {
    case "horizontal": return {x: -cube.x, y: -cube.z, z: -cube.y};
    case "vertical": return {x: cube.x, y: cube.z, z: cube.y};
    case "cw": return {x: cube.y, y: cube.z, z: cube.x};
    case "ccw": return {x: -cube.y, y: -cube.z, z: -cube.x};
  }
}

function axialKey(cell: AxialCell) {
  return `${cell.q},${cell.r}`;
}

function transformGridInput(
  normalized: NormalizedGridInput,
  operation: TilemapTransformOperation,
  hexTarget: CellMapping["hexTarget"],
): TilesetGrid | TileGridLayout {
  const source = normalized.sourceGrid;
  if (normalized.layoutInput) {
    const layout = source as TileGridLayout;
    if (layout.kind === "orthogonal") return {...layout};
    if (layout.kind === "isometric") {
      const nextLayout = {...layout};
      if (operation === "cw" || operation === "ccw") {
        [nextLayout.tileWidth, nextLayout.tileHeight] = [nextLayout.tileHeight, nextLayout.tileWidth];
      }
      return nextLayout;
    }
    const nextLayout = {...layout};
    if (hexTarget) {
      nextLayout.orientation = hexTarget.orientation;
      nextLayout.offset = hexTarget.offset;
    }
    return nextLayout;
  }

  const grid = source as TilesetGrid;
  if (grid.kind === "orthogonal") return {...grid};
  if (grid.kind === "isometric") {
    const nextGrid = {...grid};
    if (operation === "cw" || operation === "ccw") {
      [nextGrid.cellWidth, nextGrid.cellHeight] = [nextGrid.cellHeight, nextGrid.cellWidth];
    }
    if (normalized.tileWidth !== undefined && normalized.tileHeight !== undefined) {
      const sourceAnchor = {x: nextGrid.anchorX, y: nextGrid.anchorY};
      if (operation === "cw") {
        nextGrid.anchorX = normalized.tileHeight - sourceAnchor.y;
        nextGrid.anchorY = sourceAnchor.x;
      } else if (operation === "ccw") {
        nextGrid.anchorX = sourceAnchor.y;
        nextGrid.anchorY = normalized.tileWidth - sourceAnchor.x;
      } else if (operation === "horizontal") {
        nextGrid.anchorX = normalized.tileWidth - sourceAnchor.x;
      } else if (operation === "vertical") {
        nextGrid.anchorY = normalized.tileHeight - sourceAnchor.y;
      } else {
        nextGrid.anchorX = normalized.tileWidth - sourceAnchor.x;
        nextGrid.anchorY = normalized.tileHeight - sourceAnchor.y;
      }
    }
    return nextGrid;
  }

  const nextGrid = {...grid};
  if (!hexTarget) throw new Error("Hexagonal transform geometry is missing");
  nextGrid.orientation = hexTarget.orientation;
  nextGrid.offset = hexTarget.offset;
  return nextGrid;
}

function transformTerrainMap(map: TerrainMapData, mapping: CellMapping): TerrainMapData {
  const terrains = new Uint16Array(mapping.columns * mapping.rows);
  for (let row = 0; row < map.rows; row += 1) {
    for (let column = 0; column < map.columns; column += 1) {
      const destination = mapping.mapSourceCell(column, row);
      terrains[destination.row * mapping.columns + destination.column] = map.terrains[row * map.columns + column];
    }
  }
  return {...map, columns: mapping.columns, rows: mapping.rows, terrains};
}

function transformTileValue(value: number, operation: TilemapTransformOperation): number {
  const normalized = value >>> 0;
  const tileId = normalized & tileIndexMask;
  if (tileId === 0) return 0;
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
  return (tileId | transformedFlags) >>> 0;
}

function operationSource(
  operation: TilemapTransformOperation,
  x: number,
  y: number,
  width: number,
  height: number,
): {x: number; y: number} {
  switch (operation) {
    case "horizontal": return {x: width - 1 - x, y};
    case "vertical": return {x, y: height - 1 - y};
    case "cw": return {x: y, y: height - 1 - x};
    case "ccw": return {x: width - 1 - y, y: x};
    case "180": return {x: width - 1 - x, y: height - 1 - y};
  }
}

import type {TilemapData, Tileset} from "./document";
import {
  cellPolygon,
  cellToDocument,
  documentToCell,
  type TileCell,
  type TileGridLayout,
} from "./tileGrid";

export function tilesetGridLayout(
  tileset: Tileset,
  columnsOrTilemap: number | Pick<TilemapData, "columns" | "rows" | "gridOffset"> = 1,
  rows = 1,
): TileGridLayout {
  const columns = typeof columnsOrTilemap === "number" ? columnsOrTilemap : columnsOrTilemap.columns;
  if (typeof columnsOrTilemap !== "number") rows = columnsOrTilemap.rows;
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns <= 0 || rows <= 0) {
    throw new Error("Tilemap dimensions are invalid");
  }
  const gridOffset = typeof columnsOrTilemap === "number" ? undefined : columnsOrTilemap.gridOffset;
  if (gridOffset !== undefined && (tileset.grid.kind !== "hexagonal"
    || (tileset.grid.orientation === "pointy" && !gridOffset.endsWith("-r"))
    || (tileset.grid.orientation === "flat" && !gridOffset.endsWith("-q")))) {
    throw new Error("Tilemap grid offset does not match the Tileset grid");
  }
  const base = baseTilesetGridLayout(tileset, gridOffset);
  if (tileset.grid.kind === "orthogonal") return base;
  const bounds = tileImageBoundsForCells(base, tileset, layoutBoundsCells(tileset.grid.kind, columns, rows));
  return {
    ...base,
    originX: (base.originX ?? 0) - bounds.minX,
    originY: (base.originY ?? 0) - bounds.minY,
  };
}

export function tilemapCellAtPixel(tileset: Tileset, tilemap: TilemapData, pixelX: number, pixelY: number): TileCell {
  if (!Number.isFinite(pixelX) || !Number.isFinite(pixelY)) throw new Error("Tilemap pixel position is invalid");
  return documentToCell(tilesetGridLayout(tileset, tilemap), {x: pixelX, y: pixelY});
}

export function tileCellImageOrigin(tileset: Tileset, tilemap: TilemapData, cell: TileCell) {
  return tileImageOriginForLayout(tilesetGridLayout(tileset, tilemap), tileset, cell);
}

export function tilemapPixelSize(
  tileset: Tileset,
  columnsOrTilemap: number | Pick<TilemapData, "columns" | "rows" | "gridOffset">,
  rows?: number,
) {
  const columns = typeof columnsOrTilemap === "number" ? columnsOrTilemap : columnsOrTilemap.columns;
  const resolvedRows = typeof columnsOrTilemap === "number" ? rows : columnsOrTilemap.rows;
  if (resolvedRows === undefined) throw new Error("Tilemap dimensions are invalid");
  const layout = tilesetGridLayout(tileset, columnsOrTilemap, resolvedRows);
  const bounds = tileImageBoundsForCells(layout, tileset, layoutBoundsCells(tileset.grid.kind, columns, resolvedRows));
  return {
    width: Math.ceil(bounds.maxX),
    height: Math.ceil(bounds.maxY),
  };
}

/** Pixel bounds touched by cell images, including isometric visual overflow. */
export function tileCellsPixelBounds(
  tileset: Tileset,
  tilemap: TilemapData,
  cells: readonly TileCell[],
): {x: number; y: number; width: number; height: number} | null {
  if (cells.length === 0) return null;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  const seen = new Set<string>();
  for (const cell of cells) {
    if (!Number.isInteger(cell.column) || !Number.isInteger(cell.row)
      || cell.column < 0 || cell.row < 0 || cell.column >= tilemap.columns || cell.row >= tilemap.rows) continue;
    const key = `${cell.column}:${cell.row}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (tileset.grid.kind === "hexagonal") {
      const polygon = cellPolygon(tilesetGridLayout(tileset, tilemap), cell);
      left = Math.min(left, Math.floor(Math.min(...polygon.map((point) => point.x))));
      top = Math.min(top, Math.floor(Math.min(...polygon.map((point) => point.y))));
      right = Math.max(right, Math.ceil(Math.max(...polygon.map((point) => point.x))));
      bottom = Math.max(bottom, Math.ceil(Math.max(...polygon.map((point) => point.y))));
    } else {
      const origin = tileCellImageOrigin(tileset, tilemap, cell);
      left = Math.min(left, Math.floor(origin.x));
      top = Math.min(top, Math.floor(origin.y));
      right = Math.max(right, Math.ceil(origin.x + tileset.tileWidth));
      bottom = Math.max(bottom, Math.ceil(origin.y + tileset.tileHeight));
    }
  }
  return seen.size === 0 ? null : {x: left, y: top, width: right - left, height: bottom - top};
}

function baseTilesetGridLayout(tileset: Tileset, gridOffset?: TilemapData["gridOffset"]): TileGridLayout {
  if (tileset.grid.kind === "orthogonal") {
    return {kind: "orthogonal", tileWidth: tileset.tileWidth, tileHeight: tileset.tileHeight};
  }
  if (tileset.grid.kind === "isometric") {
    return {kind: "isometric", tileWidth: tileset.grid.cellWidth, tileHeight: tileset.grid.cellHeight};
  }
  return {
    kind: "hexagonal",
    tileWidth: tileset.tileWidth,
    tileHeight: tileset.tileHeight,
    orientation: tileset.grid.orientation,
    offset: gridOffset ?? tileset.grid.offset,
  };
}

function tileImageOriginForLayout(layout: TileGridLayout, tileset: Tileset, cell: TileCell) {
  const point = cellToDocument(layout, cell);
  if (tileset.grid.kind === "isometric") {
    return {
      x: point.x + tileset.grid.cellWidth / 2 - tileset.grid.anchorX,
      y: point.y + tileset.grid.cellHeight - tileset.grid.anchorY,
    };
  }
  return tileset.grid.kind === "hexagonal"
    ? {x: point.x - tileset.tileWidth / 2, y: point.y - tileset.tileHeight / 2}
    : point;
}

function cornerCells(columns: number, rows: number): TileCell[] {
  return [
    {column: 0, row: 0},
    {column: columns - 1, row: 0},
    {column: 0, row: rows - 1},
    {column: columns - 1, row: rows - 1},
  ];
}

function layoutBoundsCells(kind: Tileset["grid"]["kind"], columns: number, rows: number): TileCell[] {
  if (kind !== "hexagonal") return cornerCells(columns, rows);
  const columnCandidates = boundaryIndices(columns);
  const rowCandidates = boundaryIndices(rows);
  const cells: TileCell[] = [];
  for (const row of rowCandidates) {
    for (const column of columnCandidates) {
      cells.push({column, row});
    }
  }
  return cells;
}

function boundaryIndices(size: number): number[] {
  if (size <= 0) return [];
  if (size <= 4) return Array.from({length: size}, (_value, index) => index);
  return [0, 1, size - 2, size - 1];
}

function tileImageBoundsForCells(layout: TileGridLayout, tileset: Tileset, cells: readonly TileCell[]) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const cell of cells) {
    const origin = tileImageOriginForLayout(layout, tileset, cell);
    minX = Math.min(minX, origin.x);
    minY = Math.min(minY, origin.y);
    maxX = Math.max(maxX, origin.x + tileset.tileWidth);
    maxY = Math.max(maxY, origin.y + tileset.tileHeight);
  }
  return {minX, minY, maxX, maxY};
}

import {
  isometricCellPolygon,
  isometricCellToDocument,
  isometricDocumentToCell,
  isometricNeighbors,
} from "./tileGridIsometric";
import {
  hexagonalCellPolygon,
  hexagonalCellToDocument,
  hexagonalDocumentToCell,
  hexagonalNeighbors,
  validateHexagonalLayout,
} from "./tileGridHexagonal";
import {
  orthogonalCellPolygon,
  orthogonalCellToDocument,
  orthogonalDocumentToCell,
  orthogonalNeighbors,
} from "./tileGridOrthogonal";

export type TileGridKind = "orthogonal" | "isometric" | "hexagonal";
export type HexOrientation = "pointy" | "flat";
export type HexOffset = "odd-r" | "even-r" | "odd-q" | "even-q";

export interface TileCell {
  column: number;
  row: number;
}

export interface TilePoint {
  x: number;
  y: number;
}

export interface TileBounds extends TilePoint {
  width: number;
  height: number;
}

export interface TileCellRange {
  minColumn: number;
  minRow: number;
  maxColumn: number;
  maxRow: number;
}

export interface TileLineSegment {
  start: TilePoint;
  end: TilePoint;
}

interface TileGridLayoutBase {
  tileWidth: number;
  tileHeight: number;
  originX?: number;
  originY?: number;
}

export interface OrthogonalTileGridLayout extends TileGridLayoutBase {
  kind: "orthogonal";
}

export interface IsometricTileGridLayout extends TileGridLayoutBase {
  kind: "isometric";
}

export interface HexagonalTileGridLayout extends TileGridLayoutBase {
  kind: "hexagonal";
  orientation: HexOrientation;
  offset: HexOffset;
}

export type TileGridLayout =
  | OrthogonalTileGridLayout
  | IsometricTileGridLayout
  | HexagonalTileGridLayout;

export function validateTileGridLayout(layout: TileGridLayout): true {
  if (!layout || typeof layout !== "object") throw new Error("Tile grid layout is required");
  assertPositiveDimension(layout.tileWidth, "Tile width");
  assertPositiveDimension(layout.tileHeight, "Tile height");
  assertFiniteCoordinate(layout.originX ?? 0, "Grid origin X");
  assertFiniteCoordinate(layout.originY ?? 0, "Grid origin Y");
  if (layout.kind === "hexagonal") return validateHexagonalLayout(layout);
  if (layout.kind !== "orthogonal" && layout.kind !== "isometric") {
    throw new Error(`Unsupported tile grid kind ${String((layout as {kind?: unknown}).kind)}`);
  }
  return true;
}

export function cellToDocument(layout: TileGridLayout, cell: TileCell): TilePoint {
  validateTileGridLayout(layout);
  validateCell(cell);
  switch (layout.kind) {
    case "orthogonal": return orthogonalCellToDocument(layout, cell);
    case "isometric": return isometricCellToDocument(layout, cell);
    case "hexagonal": return hexagonalCellToDocument(layout, cell);
  }
}

export function documentToCell(layout: TileGridLayout, point: TilePoint): TileCell {
  validateTileGridLayout(layout);
  validatePoint(point);
  switch (layout.kind) {
    case "orthogonal": return orthogonalDocumentToCell(layout, point);
    case "isometric": return isometricDocumentToCell(layout, point);
    case "hexagonal": return hexagonalDocumentToCell(layout, point);
  }
}

export function cellPolygon(layout: TileGridLayout, cell: TileCell): TilePoint[] {
  validateTileGridLayout(layout);
  validateCell(cell);
  switch (layout.kind) {
    case "orthogonal": return orthogonalCellPolygon(layout, cell);
    case "isometric": return isometricCellPolygon(layout, cell);
    case "hexagonal": return hexagonalCellPolygon(layout, cell);
  }
}

export function cellNeighbors(layout: TileGridLayout, cell: TileCell): TileCell[] {
  validateTileGridLayout(layout);
  validateCell(cell);
  switch (layout.kind) {
    case "orthogonal": return orthogonalNeighbors(cell);
    case "isometric": return isometricNeighbors(cell);
    case "hexagonal": return hexagonalNeighbors(layout, cell);
  }
}

export function visibleCellRange(layout: TileGridLayout, bounds: TileBounds): TileCellRange {
  validateTileGridLayout(layout);
  validateBounds(bounds);
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  const corners = [
    documentToCell(layout, {x: bounds.x, y: bounds.y}),
    documentToCell(layout, {x: right, y: bounds.y}),
    documentToCell(layout, {x: bounds.x, y: bottom}),
    documentToCell(layout, {x: right, y: bottom}),
  ];
  const padding = layout.kind === "orthogonal" ? 1 : 2;
  return {
    minColumn: Math.min(...corners.map((cell) => cell.column)) - padding,
    minRow: Math.min(...corners.map((cell) => cell.row)) - padding,
    maxColumn: Math.max(...corners.map((cell) => cell.column)) + padding,
    maxRow: Math.max(...corners.map((cell) => cell.row)) + padding,
  };
}

export function pointInCell(layout: TileGridLayout, cell: TileCell, point: TilePoint): boolean {
  validatePoint(point);
  return pointInPolygon(point, cellPolygon(layout, cell));
}

export function compareCellsForRendering(layout: TileGridLayout, left: TileCell, right: TileCell): number {
  validateTileGridLayout(layout);
  validateCell(left);
  validateCell(right);
  if (layout.kind === "isometric") {
    const depthDifference = left.column + left.row - right.column - right.row;
    if (depthDifference !== 0) return depthDifference;
  } else {
    const leftCenter = cellCenter(layout, left);
    const rightCenter = cellCenter(layout, right);
    if (leftCenter.y !== rightCenter.y) return leftCenter.y - rightCenter.y;
  }
  if (left.row !== right.row) return left.row - right.row;
  return left.column - right.column;
}

export function expandCellRegion(layout: TileGridLayout, cells: readonly TileCell[], rings = 1): TileCell[] {
  validateTileGridLayout(layout);
  if (!Number.isInteger(rings) || rings < 0) throw new Error("Tile cell expansion rings must be a non-negative integer");
  const expanded = new Map<string, TileCell>();
  let frontier: TileCell[] = [];
  for (const cell of cells) {
    validateCell(cell);
    const key = cellKey(cell);
    if (expanded.has(key)) continue;
    expanded.set(key, cell);
    frontier.push(cell);
  }
  for (let ring = 0; ring < rings; ring += 1) {
    const next: TileCell[] = [];
    for (const cell of frontier) {
      for (const neighbor of cellNeighbors(layout, cell)) {
        const key = cellKey(neighbor);
        if (expanded.has(key)) continue;
        expanded.set(key, neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return [...expanded.values()].sort((left, right) => compareCellsForRendering(layout, left, right));
}

export function gridLineSegments(layout: TileGridLayout, range: TileCellRange): TileLineSegment[] {
  validateTileGridLayout(layout);
  validateRange(range);
  const segments = new Map<string, TileLineSegment>();
  for (let row = range.minRow; row <= range.maxRow; row += 1) {
    for (let column = range.minColumn; column <= range.maxColumn; column += 1) {
      const polygon = cellPolygon(layout, {column, row});
      for (let index = 0; index < polygon.length; index += 1) {
        const start = polygon[index];
        const end = polygon[(index + 1) % polygon.length];
        const startKey = pointKey(start);
        const endKey = pointKey(end);
        const key = startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
        if (!segments.has(key)) segments.set(key, {start, end});
      }
    }
  }
  return [...segments.values()];
}

function pointInPolygon(point: TilePoint, polygon: readonly TilePoint[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    if (pointOnSegment(point, previousPoint, currentPoint)) return true;
    const intersects = (currentPoint.y > point.y) !== (previousPoint.y > point.y)
      && point.x < (previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)
        / (previousPoint.y - currentPoint.y) + currentPoint.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointOnSegment(point: TilePoint, start: TilePoint, end: TilePoint) {
  const cross = (point.y - start.y) * (end.x - start.x) - (point.x - start.x) * (end.y - start.y);
  if (Math.abs(cross) > 1e-8) return false;
  const dot = (point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y);
  if (dot < 0) return false;
  const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  return dot <= lengthSquared;
}

function validateCell(cell: TileCell) {
  if (!Number.isInteger(cell.column) || !Number.isInteger(cell.row)) {
    throw new Error("Tile cell coordinates must be integers");
  }
}

function validatePoint(point: TilePoint) {
  assertFiniteCoordinate(point.x, "Point X");
  assertFiniteCoordinate(point.y, "Point Y");
}

function validateBounds(bounds: TileBounds) {
  validatePoint(bounds);
  if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || bounds.width < 0 || bounds.height < 0) {
    throw new Error("Tile bounds dimensions must be finite and non-negative");
  }
}

function validateRange(range: TileCellRange) {
  if (!Number.isInteger(range.minColumn) || !Number.isInteger(range.minRow)
    || !Number.isInteger(range.maxColumn) || !Number.isInteger(range.maxRow)
    || range.minColumn > range.maxColumn || range.minRow > range.maxRow) {
    throw new Error("Tile cell range is invalid");
  }
}

function cellCenter(layout: TileGridLayout, cell: TileCell) {
  const anchor = cellToDocument(layout, cell);
  if (layout.kind === "hexagonal") return anchor;
  return {x: anchor.x + layout.tileWidth / 2, y: anchor.y + layout.tileHeight / 2};
}

function cellKey(cell: TileCell) {
  return `${cell.column},${cell.row}`;
}

function pointKey(point: TilePoint) {
  return `${roundedCoordinate(point.x)},${roundedCoordinate(point.y)}`;
}

function roundedCoordinate(value: number) {
  return Math.round(value * 1e9) / 1e9;
}

function assertPositiveDimension(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive`);
}

function assertFiniteCoordinate(value: number, label: string) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

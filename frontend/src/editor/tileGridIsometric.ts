import type {
  IsometricTileGridLayout,
  TileCell,
  TilePoint,
} from "./tileGrid";

export function isometricCellToDocument(layout: IsometricTileGridLayout, cell: TileCell): TilePoint {
  const halfWidth = layout.tileWidth / 2;
  const halfHeight = layout.tileHeight / 2;
  return {
    x: (layout.originX ?? 0) + (cell.column - cell.row) * halfWidth - halfWidth,
    y: (layout.originY ?? 0) + (cell.column + cell.row) * halfHeight,
  };
}

export function isometricDocumentToCell(layout: IsometricTileGridLayout, point: TilePoint): TileCell {
  const normalizedX = (point.x - (layout.originX ?? 0)) / (layout.tileWidth / 2);
  const normalizedY = (point.y - (layout.originY ?? 0)) / (layout.tileHeight / 2);
  return {
    column: Math.floor((normalizedX + normalizedY) / 2),
    row: Math.floor((normalizedY - normalizedX) / 2),
  };
}

export function isometricCellPolygon(layout: IsometricTileGridLayout, cell: TileCell): TilePoint[] {
  const bounds = isometricCellToDocument(layout, cell);
  const halfWidth = layout.tileWidth / 2;
  const halfHeight = layout.tileHeight / 2;
  return [
    {x: bounds.x + halfWidth, y: bounds.y},
    {x: bounds.x + layout.tileWidth, y: bounds.y + halfHeight},
    {x: bounds.x + halfWidth, y: bounds.y + layout.tileHeight},
    {x: bounds.x, y: bounds.y + halfHeight},
  ];
}

export function isometricNeighbors(cell: TileCell): TileCell[] {
  return [
    {column: cell.column, row: cell.row - 1},
    {column: cell.column + 1, row: cell.row},
    {column: cell.column, row: cell.row + 1},
    {column: cell.column - 1, row: cell.row},
  ];
}

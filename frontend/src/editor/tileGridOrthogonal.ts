import type {
  OrthogonalTileGridLayout,
  TileCell,
  TilePoint,
} from "./tileGrid";

export function orthogonalCellToDocument(layout: OrthogonalTileGridLayout, cell: TileCell): TilePoint {
  return {
    x: (layout.originX ?? 0) + cell.column * layout.tileWidth,
    y: (layout.originY ?? 0) + cell.row * layout.tileHeight,
  };
}

export function orthogonalDocumentToCell(layout: OrthogonalTileGridLayout, point: TilePoint): TileCell {
  return {
    column: Math.floor((point.x - (layout.originX ?? 0)) / layout.tileWidth),
    row: Math.floor((point.y - (layout.originY ?? 0)) / layout.tileHeight),
  };
}

export function orthogonalCellPolygon(layout: OrthogonalTileGridLayout, cell: TileCell): TilePoint[] {
  const origin = orthogonalCellToDocument(layout, cell);
  return [
    origin,
    {x: origin.x + layout.tileWidth, y: origin.y},
    {x: origin.x + layout.tileWidth, y: origin.y + layout.tileHeight},
    {x: origin.x, y: origin.y + layout.tileHeight},
  ];
}

export function orthogonalNeighbors(cell: TileCell): TileCell[] {
  return [
    {column: cell.column, row: cell.row - 1},
    {column: cell.column + 1, row: cell.row},
    {column: cell.column, row: cell.row + 1},
    {column: cell.column - 1, row: cell.row},
  ];
}

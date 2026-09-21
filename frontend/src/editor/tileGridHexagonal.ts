import type {
  HexagonalTileGridLayout,
  TileCell,
  TilePoint,
} from "./tileGrid";

interface AxialCell {
  q: number;
  r: number;
}

const axialDirections: readonly AxialCell[] = [
  {q: 1, r: 0},
  {q: 1, r: -1},
  {q: 0, r: -1},
  {q: -1, r: 0},
  {q: -1, r: 1},
  {q: 0, r: 1},
];

export function validateHexagonalLayout(layout: HexagonalTileGridLayout): true {
  if (layout.orientation !== "pointy" && layout.orientation !== "flat") {
    throw new Error("Hexagonal orientation must be pointy or flat");
  }
  const rowOffset = layout.offset === "odd-r" || layout.offset === "even-r";
  const columnOffset = layout.offset === "odd-q" || layout.offset === "even-q";
  if (layout.orientation === "pointy" && !rowOffset) {
    throw new Error("Pointy hexagonal grids require odd-r or even-r offset");
  }
  if (layout.orientation === "flat" && !columnOffset) {
    throw new Error("Flat hexagonal grids require odd-q or even-q offset");
  }
  return true;
}

export function hexagonalCellToDocument(layout: HexagonalTileGridLayout, cell: TileCell): TilePoint {
  const axial = offsetToAxial(layout, cell);
  const originX = (layout.originX ?? 0) + layout.tileWidth / 2;
  const originY = (layout.originY ?? 0) + layout.tileHeight / 2;
  if (layout.orientation === "pointy") {
    return {
      x: originX + layout.tileWidth * (axial.q + axial.r / 2),
      y: originY + layout.tileHeight * 0.75 * axial.r,
    };
  }
  return {
    x: originX + layout.tileWidth * 0.75 * axial.q,
    y: originY + layout.tileHeight * (axial.r + axial.q / 2),
  };
}

export function hexagonalDocumentToCell(layout: HexagonalTileGridLayout, point: TilePoint): TileCell {
  const normalizedX = (point.x - ((layout.originX ?? 0) + layout.tileWidth / 2)) / layout.tileWidth;
  const normalizedY = (point.y - ((layout.originY ?? 0) + layout.tileHeight / 2)) / layout.tileHeight;
  const fractional = layout.orientation === "pointy"
    ? {q: normalizedX - normalizedY / 1.5, r: normalizedY / 0.75}
    : {q: normalizedX / 0.75, r: normalizedY - normalizedX / 1.5};
  return axialToOffset(layout, roundAxial(fractional));
}

export function hexagonalCellPolygon(layout: HexagonalTileGridLayout, cell: TileCell): TilePoint[] {
  const center = hexagonalCellToDocument(layout, cell);
  const halfWidth = layout.tileWidth / 2;
  const halfHeight = layout.tileHeight / 2;
  if (layout.orientation === "pointy") {
    return [
      {x: center.x, y: center.y - halfHeight},
      {x: center.x + halfWidth, y: center.y - halfHeight / 2},
      {x: center.x + halfWidth, y: center.y + halfHeight / 2},
      {x: center.x, y: center.y + halfHeight},
      {x: center.x - halfWidth, y: center.y + halfHeight / 2},
      {x: center.x - halfWidth, y: center.y - halfHeight / 2},
    ];
  }
  return [
    {x: center.x + halfWidth, y: center.y},
    {x: center.x + halfWidth / 2, y: center.y + halfHeight},
    {x: center.x - halfWidth / 2, y: center.y + halfHeight},
    {x: center.x - halfWidth, y: center.y},
    {x: center.x - halfWidth / 2, y: center.y - halfHeight},
    {x: center.x + halfWidth / 2, y: center.y - halfHeight},
  ];
}

export function hexagonalNeighbors(layout: HexagonalTileGridLayout, cell: TileCell): TileCell[] {
  const axial = offsetToAxial(layout, cell);
  return axialDirections.map((direction) => axialToOffset(layout, {
    q: axial.q + direction.q,
    r: axial.r + direction.r,
  }));
}

export function offsetToAxial(layout: HexagonalTileGridLayout, cell: TileCell): AxialCell {
  switch (layout.offset) {
    case "odd-r":
      return {q: cell.column - (cell.row - parity(cell.row)) / 2, r: cell.row};
    case "even-r":
      return {q: cell.column - (cell.row + parity(cell.row)) / 2, r: cell.row};
    case "odd-q":
      return {q: cell.column, r: cell.row - (cell.column - parity(cell.column)) / 2};
    case "even-q":
      return {q: cell.column, r: cell.row - (cell.column + parity(cell.column)) / 2};
  }
}

export function axialToOffset(layout: HexagonalTileGridLayout, cell: AxialCell): TileCell {
  switch (layout.offset) {
    case "odd-r":
      return {column: cell.q + (cell.r - parity(cell.r)) / 2, row: cell.r};
    case "even-r":
      return {column: cell.q + (cell.r + parity(cell.r)) / 2, row: cell.r};
    case "odd-q":
      return {column: cell.q, row: cell.r + (cell.q - parity(cell.q)) / 2};
    case "even-q":
      return {column: cell.q, row: cell.r + (cell.q + parity(cell.q)) / 2};
  }
}

function roundAxial(cell: AxialCell): AxialCell {
  const x = cell.q;
  const z = cell.r;
  const y = -x - z;
  let roundedX = Math.round(x);
  let roundedY = Math.round(y);
  let roundedZ = Math.round(z);
  const xDifference = Math.abs(roundedX - x);
  const yDifference = Math.abs(roundedY - y);
  const zDifference = Math.abs(roundedZ - z);
  if (xDifference > yDifference && xDifference > zDifference) roundedX = -roundedY - roundedZ;
  else if (yDifference > zDifference) roundedY = -roundedX - roundedZ;
  else roundedZ = -roundedX - roundedY;
  return {q: roundedX, r: roundedZ};
}

function parity(value: number) {
  return Math.abs(value % 2);
}

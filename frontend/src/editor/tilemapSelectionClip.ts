import type {TilemapData, Tileset} from "./document";
import {selectionCoverageAt, type Selection} from "./selection";
import {cellToDocument, type TileCell, type TileGridLayout, type TilePoint} from "./tileGrid";
import {tilesetGridLayout} from "./tilemapGeometry";

export interface TilemapSelectionPredicateOptions {
  /** The Cel origin in document pixel coordinates. */
  celX?: number;
  celY?: number;
  gridOffset?: TilemapData["gridOffset"];
}

export type TilemapSelectionPredicate = (cell: TileCell) => boolean;

/**
 * Creates the pixel-selection gate shared by tile and Terrain cell tools.
 *
 * The gate tests one logical point per cell instead of the rendered tile
 * bounds. Isometric cells use the center of their logical diamond.
 */
export function createTilemapSelectionPredicate(
  selection: Selection | null | undefined,
  tileset: Tileset,
  columns: number,
  rows: number,
  options: TilemapSelectionPredicateOptions = {},
): TilemapSelectionPredicate {
  const layout = tilesetGridLayout(tileset, {columns, rows, ...(options.gridOffset ? {gridOffset: options.gridOffset} : {})});
  const celX = options.celX ?? 0;
  const celY = options.celY ?? 0;
  validateCelOffset(celX, "Cel X");
  validateCelOffset(celY, "Cel Y");

  return (cell) => {
    if (!isCellInsideMap(cell, columns, rows)) return false;
    if (!selection) return true;
    const center = logicalCellCenter(layout, cell);
    return selectionCoverageAt(selection, center.x + celX, center.y + celY) > 0;
  };
}

function logicalCellCenter(layout: TileGridLayout, cell: TileCell): TilePoint {
  const anchor = cellToDocument(layout, cell);
  if (layout.kind === "hexagonal") return anchor;
  if (layout.kind === "isometric") {
    return {
      x: anchor.x + layout.tileWidth / 2,
      y: anchor.y + layout.tileHeight / 2,
    };
  }
  return {
    x: anchor.x + layout.tileWidth / 2,
    y: anchor.y + layout.tileHeight / 2,
  };
}

function isCellInsideMap(cell: TileCell, columns: number, rows: number) {
  return Number.isInteger(cell.column) && Number.isInteger(cell.row)
    && cell.column >= 0 && cell.row >= 0
    && cell.column < columns && cell.row < rows;
}

function validateCelOffset(value: number, label: string) {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be an integer`);
}

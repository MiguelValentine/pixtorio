import type {TilemapData, Tileset} from "./document";
import {
  createTerrainMapData,
  recalculateTerrainCells,
  validateTerrainDefinitions,
  type TerrainMapData,
} from "./terrain";
import {renderTilemapCel, createTilemapData, validateTileset} from "./tilemap";
import {tilemapPixelSize, tilesetGridLayout} from "./tilemapGeometry";

const previewColumns = 5;
const previewRows = 5;
const maxPreviewDimension = 8192;
const maxPreviewPixelsPerScene = 8_000_000;
const maxPreviewPixelsTotal = 16_000_000;

export type TerrainPreviewKind = "island" | "edge" | "outer-corner" | "inner-corner" | "channel" | "closed";

export interface TerrainPreviewScene {
  readonly kind: TerrainPreviewKind;
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
  readonly tilemap: TilemapData;
  readonly terrainmap: TerrainMapData;
}

export interface TerrainPreviewOptions {
  seed?: number;
  palette?: readonly string[];
  transparentIndex?: number;
}

interface PreviewPattern {
  kind: TerrainPreviewKind;
  includes(column: number, row: number): boolean;
}

const previewPatterns: readonly PreviewPattern[] = [
  {kind: "island", includes: (column, row) => column === 2 && row === 2},
  {kind: "edge", includes: (_column, row) => row >= 2},
  {kind: "outer-corner", includes: (column, row) => column >= 2 && row >= 2},
  {kind: "inner-corner", includes: (column, row) => !(column >= 2 && row <= 2)},
  {kind: "channel", includes: (_column, row) => row === 2},
  {kind: "closed", includes: () => true},
];

/**
 * Generates six small, real Terrain/tilemap scenes for inspector previews.
 * The source tileset is read-only from this function's perspective.
 */
export function generateTerrainPreviews(
  tileset: Tileset,
  terrainId: number,
  options: TerrainPreviewOptions = {},
): readonly TerrainPreviewScene[] {
  validateTileset(tileset);
  if (!Number.isSafeInteger(terrainId) || terrainId <= 0 || terrainId >= 0xffff) {
    throw new Error("Terrain preview terrain id is invalid");
  }
  if (!tileset.terrains.some((terrain) => terrain.id === terrainId)) {
    throw new Error("Terrain preview terrain is missing");
  }
  if (options.seed !== undefined && !Number.isSafeInteger(options.seed)) {
    throw new Error("Terrain preview seed is invalid");
  }

  const layout = tilesetGridLayout(tileset, previewColumns, previewRows);
  validateTerrainDefinitions(tileset.terrains, layout);
  const pixelSize = tilemapPixelSize(tileset, previewColumns, previewRows);
  validatePreviewSize(pixelSize.width, pixelSize.height);

  const scenePixels = pixelSize.width * pixelSize.height;
  const totalPixels = scenePixels * previewPatterns.length;
  if (!Number.isSafeInteger(totalPixels) || totalPixels > maxPreviewPixelsTotal) {
    throw new Error("Terrain preview batch is too large");
  }

  const changedCells = allPreviewCells();
  return Object.freeze(previewPatterns.map((pattern) => {
    const terrainmap = createTerrainMapData(previewColumns, previewRows, options.seed ?? 0);
    for (let row = 0; row < previewRows; row += 1) {
      for (let column = 0; column < previewColumns; column += 1) {
        if (pattern.includes(column, row)) terrainmap.terrains[row * previewColumns + column] = terrainId;
      }
    }

    const tilemap = createTilemapData(previewColumns, previewRows);
    recalculateTerrainCells(terrainmap, tileset.terrains, layout, tilemap.tiles, changedCells);
    const pixels = renderTilemapCel({width: pixelSize.width, height: pixelSize.height, tilemap}, tileset, {
      palette: options.palette,
      transparentIndex: options.transparentIndex,
    });
    return Object.freeze({
      kind: pattern.kind,
      width: pixelSize.width,
      height: pixelSize.height,
      pixels,
      tilemap,
      terrainmap,
    });
  })) as readonly TerrainPreviewScene[];
}

function allPreviewCells() {
  return Array.from({length: previewColumns * previewRows}, (_value, index) => ({
    column: index % previewColumns,
    row: Math.floor(index / previewColumns),
  }));
}

function validatePreviewSize(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
    || width > maxPreviewDimension || height > maxPreviewDimension) {
    throw new Error("Terrain preview dimensions are too large");
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > maxPreviewPixelsPerScene) {
    throw new Error("Terrain preview is too large");
  }
}

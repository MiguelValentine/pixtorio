import {refreshTilemapCaches} from "./colorModes";
import {
  cloneDocument,
  replaceDocument,
  type Cel,
  type PixelDocument,
  type TilemapData,
  type Tileset,
} from "./document";
import {recalculateTerrainCells, type TerrainDefinition, type TerrainMapData} from "./terrain";
import {normalizeImportedTilePixels} from "./tilemapImportColors";
import {
  validateTilesetBundleReferences,
  type TilemapInterchangeData,
} from "./tilemapInterchange";
import {tilemapPixelSize, tilesetGridLayout} from "./tilemapGeometry";

export interface TilesetBundleImage {
  name: string;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export interface TilesetBundleImportResult {
  selectedTileId: number;
  selectedTerrainId: number;
}

/**
 * Imports a PNG/sidecar pair transactionally. All validation, Terrain
 * rebuilding, and cache rendering happen on a clone before the live document
 * is replaced.
 */
export function importTilesetBundleIntoDocument(
  document: PixelDocument,
  targetTilesetId: string,
  targetCelId: string,
  imported: TilemapInterchangeData,
  image: TilesetBundleImage,
): TilesetBundleImportResult {
  const sourceTileset = document.tilesets.find((candidate) => candidate.id === targetTilesetId);
  const sourceCel = Object.values(document.cels).find((candidate) => candidate.id === targetCelId);
  const sourceLayer = document.layers.find((candidate) => candidate.id === sourceCel?.layerId);
  if (!sourceTileset || !sourceCel?.tilemap || sourceLayer?.kind !== "tilemap"
    || sourceLayer.tilesetId !== sourceTileset.id) {
    throw new Error("Tileset bundle target does not exist");
  }
  if (!imported.tilesetImage) throw new Error("Tileset metadata does not contain PNG rectangles");
  validateBundleImage(imported, image);
  validateTilesetBundleReferences(document, targetTilesetId, sourceCel.linkId, imported.tileset);

  const staged = cloneDocument(document);
  const targetTileset = staged.tilesets.find((candidate) => candidate.id === targetTilesetId)!;
  const targetCel = Object.values(staged.cels).find((candidate) => candidate.id === targetCelId)!;
  const affectedLayerIds = new Set(staged.layers
    .filter((layer) => layer.kind === "tilemap" && layer.tilesetId === targetTilesetId)
    .map((layer) => layer.id));
  const targetAliases = Object.values(staged.cels).filter((candidate) => candidate.linkId === targetCel.linkId);
  if (targetAliases.some((candidate) => !affectedLayerIds.has(candidate.layerId) || !candidate.tilemap)) {
    throw new Error("Linked target Cels must use the target Tileset");
  }

  replaceTileset(targetTileset, imported, image, staged);
  replaceTargetAuthority(targetAliases, targetCel, imported);
  rebuildAffectedCels(staged, targetTileset, affectedLayerIds);
  refreshTilemapCaches(staged);
  replaceDocument(document, staged);

  return {
    selectedTileId: targetTileset.tiles[0]?.id ?? 0,
    selectedTerrainId: targetTileset.terrains[0]?.id ?? 0,
  };
}

function validateBundleImage(imported: TilemapInterchangeData, image: TilesetBundleImage) {
  const metadata = imported.tilesetImage!;
  if (!image || typeof image.name !== "string" || image.name !== metadata.file) {
    throw new Error(`Tileset metadata expects ${metadata.file}, received ${image?.name ?? "unknown"}`);
  }
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height)
    || image.width !== metadata.width || image.height !== metadata.height) {
    throw new Error("Tileset PNG dimensions do not match its metadata");
  }
  if (!(image.pixels instanceof Uint8ClampedArray)
    || image.pixels.length !== image.width * image.height * 4) {
    throw new Error("Tileset PNG pixels are invalid");
  }
}

function replaceTileset(
  target: Tileset,
  imported: TilemapInterchangeData,
  image: TilesetBundleImage,
  document: PixelDocument,
) {
  const rectangles = new Map(imported.tilesetImage!.tiles.map((rectangle) => [rectangle.tileId, rectangle]));
  const tiles = imported.tileset.tileIds.map((id) => {
    const rectangle = rectangles.get(id);
    if (!rectangle) throw new Error("Tileset image is missing a Tile rectangle");
    const pixels = new Uint8ClampedArray(imported.tileset.tileWidth * imported.tileset.tileHeight * 4);
    for (let row = 0; row < rectangle.height; row += 1) {
      const sourceOffset = ((rectangle.y + row) * image.width + rectangle.x) * 4;
      const targetOffset = row * rectangle.width * 4;
      pixels.set(image.pixels.subarray(sourceOffset, sourceOffset + rectangle.width * 4), targetOffset);
    }
    return {
      id,
      ...normalizeImportedTilePixels(
        pixels,
        imported.tileset.tileWidth,
        imported.tileset.tileHeight,
        document.colorMode,
        document.palette,
      ),
    };
  });
  target.name = imported.tileset.name;
  target.tileWidth = imported.tileset.tileWidth;
  target.tileHeight = imported.tileset.tileHeight;
  target.grid = {...imported.tileset.grid};
  target.tiles = tiles;
  target.terrains = cloneTerrainDefinitions(imported.tileset.terrains);
}

function replaceTargetAuthority(
  aliases: Cel[],
  targetCel: Cel,
  imported: TilemapInterchangeData,
) {
  const tilemap: TilemapData = {
    columns: imported.tilemap.columns,
    rows: imported.tilemap.rows,
    ...(imported.tilemap.gridOffset ? {gridOffset: imported.tilemap.gridOffset} : {}),
    tiles: imported.tilemap.tiles.slice(),
  };
  const terrainmap = imported.terrainmap ? {
    columns: imported.terrainmap.columns,
    rows: imported.terrainmap.rows,
    seed: imported.terrainmap.seed,
    terrains: imported.terrainmap.cells.slice(),
  } : undefined;
  for (const alias of aliases) {
    alias.tilemap = tilemap;
    alias.terrainmap = terrainmap;
  }
  targetCel.x = imported.cel.x;
  targetCel.y = imported.cel.y;
}

function rebuildAffectedCels(
  document: PixelDocument,
  tileset: Tileset,
  affectedLayerIds: ReadonlySet<string>,
) {
  const groups = new Map<string, Cel[]>();
  for (const cel of Object.values(document.cels)) {
    if (!affectedLayerIds.has(cel.layerId)) continue;
    if (!cel.tilemap) throw new Error("Tileset layer Cel does not contain a tilemap");
    const aliases = groups.get(cel.linkId);
    if (aliases) aliases.push(cel);
    else groups.set(cel.linkId, [cel]);
  }

  for (const aliases of groups.values()) {
    const canonical = aliases[0];
    const tilemap = canonical.tilemap!;
    tilemap.gridOffset = compatibleGridOffset(tilemap.gridOffset, tileset);
    const terrainmap = canonical.terrainmap;
    validateLinkedAliases(aliases, tilemap, terrainmap);
    const size = tilemapPixelSize(tileset, tilemap);
    if (size.width > 2048 || size.height > 2048) {
      throw new Error("Tileset bundle would exceed the 2048-pixel Cel limit");
    }
    if (terrainmap) {
      recalculateTerrainCells(
        terrainmap,
        tileset.terrains,
        tilesetGridLayout(tileset, tilemap),
        tilemap.tiles,
        allTerrainCells(terrainmap),
      );
    }
    for (const alias of aliases) {
      alias.tilemap = tilemap;
      alias.terrainmap = terrainmap;
      alias.width = size.width;
      alias.height = size.height;
    }
  }
}

function validateLinkedAliases(
  aliases: readonly Cel[],
  tilemap: TilemapData,
  terrainmap: TerrainMapData | undefined,
) {
  for (const alias of aliases) {
    if (!alias.tilemap || alias.tilemap.columns !== tilemap.columns || alias.tilemap.rows !== tilemap.rows) {
      throw new Error("Linked tilemap dimensions must match");
    }
    if (Boolean(alias.terrainmap) !== Boolean(terrainmap)
      || (alias.terrainmap && terrainmap
        && (alias.terrainmap.columns !== terrainmap.columns || alias.terrainmap.rows !== terrainmap.rows))) {
      throw new Error("Linked Terrain dimensions must match");
    }
  }
}

function compatibleGridOffset(offset: TilemapData["gridOffset"], tileset: Tileset) {
  if (!offset || tileset.grid.kind !== "hexagonal") return undefined;
  if (tileset.grid.orientation === "pointy") return offset.endsWith("-r") ? offset : undefined;
  return offset.endsWith("-q") ? offset : undefined;
}

function allTerrainCells(map: TerrainMapData) {
  return Array.from({length: map.terrains.length}, (_, index) => ({
    column: index % map.columns,
    row: Math.floor(index / map.columns),
  }));
}

function cloneTerrainDefinitions(definitions: readonly TerrainDefinition[]): TerrainDefinition[] {
  return definitions.map((terrain) => ({
    ...terrain,
    rules: terrain.rules.map((rule) => ({
      ...rule,
      candidates: rule.candidates.map((candidate) => ({...candidate})),
    })),
  }));
}

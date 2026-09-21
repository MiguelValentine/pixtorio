import {type Cel, type PixelDocument} from "./document";
import {refreshTilemapCaches} from "./colorModes";
import {recalculateTerrainCells, type TerrainMapData} from "./terrain";
import {tilesetGridLayout} from "./tilemapGeometry";

/** Replaces logical authority for a complete linked Cel group, never its per-Cel placement. */
export function replaceCelTerrainAuthority(document: PixelDocument, cel: Cel, terrainmap: TerrainMapData | undefined) {
  if (!Object.values(document.cels).includes(cel) || !cel.tilemap) throw new Error("Tilemap Cel does not exist");
  const layer = document.layers.find((candidate) => candidate.id === cel.layerId);
  const tileset = document.tilesets.find((candidate) => candidate.id === layer?.tilesetId);
  if (layer?.kind !== "tilemap" || !tileset) throw new Error("Tilemap Tileset does not exist");
  const aliases = Object.values(document.cels).filter((candidate) => candidate.linkId === cel.linkId);
  if (terrainmap && (terrainmap.columns !== cel.tilemap.columns || terrainmap.rows !== cel.tilemap.rows)) {
    throw new Error("Terrain map dimensions must match the tilemap");
  }
  for (const alias of aliases) {
    if (!alias.tilemap || alias.tilemap.columns !== cel.tilemap.columns || alias.tilemap.rows !== cel.tilemap.rows
      || alias.tilemap.gridOffset !== cel.tilemap.gridOffset) {
      throw new Error("Linked tilemap dimensions must match");
    }
  }
  let tiles: Uint32Array | undefined;
  if (terrainmap) {
    tiles = new Uint32Array(cel.tilemap.tiles.length);
    recalculateTerrainCells(terrainmap, tileset.terrains,
      tilesetGridLayout(tileset, cel.tilemap), tiles,
      Array.from({length: tiles.length}, (_, index) => ({
        column: index % terrainmap.columns, row: Math.floor(index / terrainmap.columns),
      })));
  }
  if (tiles) cel.tilemap.tiles.set(tiles);
  for (const alias of aliases) {
    alias.terrainmap = terrainmap;
    alias.tilemap = cel.tilemap;
  }
  if (terrainmap) refreshTilemapCaches(document);
}

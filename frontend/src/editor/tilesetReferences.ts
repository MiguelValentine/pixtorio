import {celKey, isTilemapLayer, type PixelDocument} from "./document";

export interface TilesetLayerReference {
  readonly id: string;
  readonly name: string;
}

export interface TilesetCelReference {
  readonly id: string;
  readonly layerId: string;
  readonly layerName: string;
  readonly frameId: string;
  readonly frameIndex: number;
  readonly linkId: string;
}

export interface TilesetTerrainReference {
  readonly id: number;
  readonly name: string;
  readonly ruleCount: number;
  readonly candidateCount: number;
}

export interface TilesetReferences {
  readonly layers: readonly TilesetLayerReference[];
  readonly cels: readonly TilesetCelReference[];
  readonly terrains: readonly TilesetTerrainReference[];
}

/** Collects deterministic, read-only reference details for one tileset. */
export function collectTilesetReferences(document: PixelDocument, tilesetId: string): TilesetReferences {
  const tileset = document.tilesets.find((candidate) => candidate.id === tilesetId);
  if (!tileset) return {layers: [], cels: [], terrains: []};

  const layers = document.layers
    .filter((layer) => isTilemapLayer(layer) && layer.tilesetId === tilesetId)
    .map((layer) => ({id: layer.id, name: layer.name}));
  const referencedLayers = document.layers.filter((layer) => isTilemapLayer(layer) && layer.tilesetId === tilesetId);
  const cels: TilesetCelReference[] = [];

  for (const layer of referencedLayers) {
    for (const [frameIndex, frame] of document.frames.entries()) {
      const cel = document.cels[celKey(layer.id, frame.id)];
      if (!cel || !cel.tilemap) continue;
      cels.push({
        id: cel.id,
        layerId: layer.id,
        layerName: layer.name,
        frameId: frame.id,
        frameIndex,
        linkId: cel.linkId,
      });
    }
  }

  const terrains = tileset.terrains.map((terrain) => ({
    id: terrain.id,
    name: terrain.name,
    ruleCount: terrain.rules.length,
    candidateCount: terrain.rules.reduce((total, rule) => total + rule.candidates.length, 0),
  }));

  return {layers, cels, terrains};
}

import {
  documentFormatVersion,
  restoreLinkedCelBuffers,
  type BlendMode,
  type Cel,
  type Frame,
  type FrameTag,
  type Layer,
  type PixelDocument,
  type Slice,
  type Guide,
  type DocumentSettings,
  type TagDirection,
  type ColorProfile,
  type Tileset,
  type TilemapData,
  tileIndexMask,
} from "./document";
import {
  recalculateTerrainCells,
  terrainEmpty,
  validateTerrainDefinitions,
  type TerrainDefinition,
  type TerrainMapData,
} from "./terrain";
import type {TileGridLayout} from "./tileGrid";
import {tilemapPixelSize, tilesetGridLayout as positionedTilesetGridLayout} from "./tilemapGeometry";
import {renderTilemapCel} from "./tilemap";

type SerializedCel = Omit<Cel, "pixels" | "indexes" | "tilemap" | "terrainmap"> & {
  pixels: string;
  indexes?: string;
  tilemap?: Omit<TilemapData, "tiles"> & {tiles: string};
  terrainmap?: Omit<TerrainMapData, "terrains"> & {terrains: string};
};

type SerializedTileset = Omit<Tileset, "tiles"> & {
  tiles: Array<Omit<Tileset["tiles"][number], "pixels" | "indexes"> & {pixels: string; indexes?: string}>;
};

type SerializedColorProfile = Omit<ColorProfile, "data"> & {data?: string};

type SerializedDocument = Omit<PixelDocument, "cels" | "tilesets" | "colorProfile"> & {
  cels: SerializedCel[];
  tilesets: SerializedTileset[];
  colorProfile: SerializedColorProfile;
};

const binaryChunkSize = 0x8000;

export function encodeProject(document: PixelDocument): string {
  const serialized: SerializedDocument = {
    ...document,
    colorProfile: {
      ...document.colorProfile,
      data: document.colorProfile.data ? bytesToBase64(document.colorProfile.data) : undefined,
    },
    tilesets: document.tilesets.map((tileset) => ({
      ...tileset,
      tiles: tileset.tiles.map((tile) => ({
        ...tile,
        pixels: bytesToBase64(tile.pixels),
        indexes: tile.indexes ? bytesToBase64(tile.indexes) : undefined,
      })),
    })),
    cels: Object.values(document.cels).map((cel) => ({
      ...cel,
      pixels: bytesToBase64(cel.pixels),
      indexes: cel.indexes ? bytesToBase64(cel.indexes) : undefined,
      tilemap: cel.tilemap ? {
        columns: cel.tilemap.columns,
        rows: cel.tilemap.rows,
        ...(cel.tilemap.gridOffset ? {gridOffset: cel.tilemap.gridOffset} : {}),
        tiles: bytesToBase64(uint32ToBytesLE(cel.tilemap.tiles)),
      } : undefined,
      terrainmap: cel.terrainmap ? {
        columns: cel.terrainmap.columns,
        rows: cel.terrainmap.rows,
        seed: cel.terrainmap.seed,
        terrains: bytesToBase64(uint16ToBytesLE(cel.terrainmap.terrains)),
      } : undefined,
    })),
  };
  return JSON.stringify(serialized);
}

export function decodeProject(payload: string): PixelDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error("Project JSON is invalid");
  }
  if (!isRecord(parsed) || parsed.formatVersion !== documentFormatVersion) {
    throw new Error("Unsupported .pixio format version");
  }
  const decoded = parsed as unknown as SerializedDocument;
  if (typeof decoded.name !== "string"
    || !validDimension(decoded.width)
    || !validDimension(decoded.height)
    || !isColorMode(decoded.colorMode)
    || !isRecord(decoded.palette)
    || typeof decoded.palette.id !== "string"
    || typeof decoded.palette.name !== "string"
    || !Array.isArray(decoded.palette.colors)
    || decoded.palette.colors.length > 256
    || decoded.palette.colors.some((color) => typeof color !== "string" || !validColor(color))
    || typeof decoded.palette.transparentIndex !== "number"
    || !Number.isInteger(decoded.palette.transparentIndex)
    || decoded.palette.transparentIndex < 0
    || decoded.palette.transparentIndex >= Math.max(1, decoded.palette.colors.length)) {
    throw new Error("Project document is invalid");
  }
  const colorProfile = decodeColorProfile(decoded.colorProfile);
  const pixelAspectRatio = decodePixelAspectRatio(decoded.pixelAspectRatio);
  const tilesets = decodeTilesets(decoded.tilesets, decoded.colorMode, decoded.palette.colors, decoded.palette.transparentIndex);
  const layers = decodeLayers(decoded.layers, tilesets);
  const frames = decodeFrames(decoded.frames);
  const tags = decodeTags(decoded.tags, frames);
  const slices = decodeSlices(decoded.slices, frames, decoded.width, decoded.height);
  const guides = decodeGuides(decoded.guides, decoded.width, decoded.height);
  const settings = decodeSettings(decoded.settings, decoded.width, decoded.height);
  if (typeof decoded.activeLayerId !== "string"
    || typeof decoded.activeFrameId !== "string"
    || !layers.some((layer) => layer.id === decoded.activeLayerId)
    || !frames.some((frame) => frame.id === decoded.activeFrameId)) {
    throw new Error("Project document is invalid");
  }
  if (!Array.isArray(decoded.cels)) throw new Error("Project cels are missing");

  const cels: PixelDocument["cels"] = {};
  const celIDs = new Set<string>();
  const linkedCels = new Map<string, {
    width: number;
    height: number;
    pixels: Uint8ClampedArray;
    indexes?: Uint8Array;
    tilemap?: TilemapData;
    terrainmap?: TerrainMapData;
  }>();
  for (const value of decoded.cels) {
    if (!isRecord(value)) throw new Error("Project cel pixels are invalid");
    const cel = value as SerializedCel;
    if (!validCelID(cel.id) || celIDs.has(cel.id)
      || !validCelID(cel.linkId)
      || typeof cel.layerId !== "string" || !layers.some((layer) => layer.id === cel.layerId && layer.kind !== "group")
      || typeof cel.frameId !== "string" || !frames.some((frame) => frame.id === cel.frameId)
      || !validCelOffset(cel.x) || !validCelOffset(cel.y)
      || typeof cel.opacity !== "number" || !Number.isFinite(cel.opacity) || cel.opacity < 0 || cel.opacity > 1
      || !Number.isInteger(cel.zIndex) || cel.zIndex < -32768 || cel.zIndex > 32767
      || typeof cel.pixels !== "string") {
      throw new Error("Project cel pixels are invalid");
    }
    const pixels = base64ToBytes(cel.pixels);
    const indexes = typeof cel.indexes === "string" ? Uint8Array.from(base64ToBytes(cel.indexes)) : undefined;
    if (!validDimension(cel.width)
      || !validDimension(cel.height)
      || pixels.length !== cel.width * cel.height * 4) {
      throw new Error("Project cel dimensions are invalid");
    }
    if (decoded.colorMode === "indexed" && (!indexes || indexes.length !== cel.width * cel.height)) {
      throw new Error("Project indexed cel data is invalid");
    }
    if (decoded.colorMode !== "indexed" && indexes) throw new Error("Project indexed cel data is invalid");
    if (indexes && !indexedPixelsMatch(pixels, pixelsFromIndexes(indexes, decoded.palette.colors, decoded.palette.transparentIndex))) {
      throw new Error("Project indexed cel cache does not match its indexes");
    }
    const layer = layers.find((candidate) => candidate.id === cel.layerId)!;
    if (layer.role === "background" && (cel.opacity !== 1 || cel.zIndex !== 0)) throw new Error("Project background cel properties are invalid");
    let tilemap: TilemapData | undefined;
    let terrainmap: TerrainMapData | undefined;
    if (layer.kind === "tilemap") {
      if (!isRecord(cel.tilemap)
        || !validDimension(cel.tilemap.columns)
        || !validDimension(cel.tilemap.rows)
        || !Object.keys(cel.tilemap).every((key) => ["columns", "rows", "gridOffset", "tiles"].includes(key))
        || typeof cel.tilemap.tiles !== "string") throw new Error("Project tilemap data is invalid");
      const tileset = tilesets.find((candidate) => candidate.id === layer.tilesetId)!;
      const expectedColumns = cel.tilemap.columns;
      const expectedRows = cel.tilemap.rows;
      const gridOffset = decodeTilemapGridOffset(cel.tilemap.gridOffset, tileset);
      const geometryTilemap: TilemapData = {
        columns: expectedColumns,
        rows: expectedRows,
        ...(gridOffset ? {gridOffset} : {}),
        tiles: new Uint32Array(expectedColumns * expectedRows),
      };
      if (tileset.grid.kind === "orthogonal") {
        if (expectedColumns !== Math.ceil(cel.width / tileset.tileWidth)
          || expectedRows !== Math.ceil(cel.height / tileset.tileHeight)) throw new Error("Project tilemap dimensions are invalid");
      } else {
        const pixelSize = tilemapPixelSize(tileset, geometryTilemap);
        if (cel.width !== pixelSize.width || cel.height !== pixelSize.height) throw new Error("Project tilemap dimensions are invalid");
      }
      const tileCells = base64ToUint32LE(cel.tilemap.tiles);
      if (tileCells.length !== expectedColumns * expectedRows) throw new Error("Project tilemap dimensions are invalid");
      const tileIDs = new Set(tileset.tiles.map((tile) => tile.id));
      if (tileCells.some((value) => (value & tileIndexMask) !== 0 && !tileIDs.has(value & tileIndexMask))) throw new Error("Project tilemap references an unknown tile");
      tilemap = {columns: expectedColumns, rows: expectedRows, ...(gridOffset ? {gridOffset} : {}), tiles: tileCells};
      if (cel.terrainmap !== undefined) {
        if (!isRecord(cel.terrainmap)
          || cel.terrainmap.columns !== expectedColumns
          || cel.terrainmap.rows !== expectedRows
          || !Number.isSafeInteger(cel.terrainmap.seed)
          || typeof cel.terrainmap.terrains !== "string") throw new Error("Project terrain map data is invalid");
        const terrainCells = base64ToUint16LE(cel.terrainmap.terrains);
        if (terrainCells.length !== expectedColumns * expectedRows) throw new Error("Project terrain map dimensions are invalid");
        const terrainIDs = new Set(tileset.terrains.map((terrain) => terrain.id));
        if (terrainCells.some((value) => value !== 0 && value !== terrainEmpty && !terrainIDs.has(value))) {
          throw new Error("Project terrain map references an unknown terrain");
        }
        terrainmap = {
          columns: expectedColumns,
          rows: expectedRows,
          seed: cel.terrainmap.seed as number,
          terrains: terrainCells,
        };
      }
    } else if (cel.tilemap !== undefined || cel.terrainmap !== undefined) {
      throw new Error("Project tilemap data is invalid");
    }
    const key = `${cel.layerId}:${cel.frameId}`;
    if (cels[key]) throw new Error("Project contains duplicate cels");
    const existingCel = linkedCels.get(cel.linkId);
    if (existingCel && (existingCel.width !== cel.width
      || existingCel.height !== cel.height
      || !bytesEqual(existingCel.pixels, pixels)
      || !optionalBytesEqual(existingCel.indexes, indexes)
      || !optionalTilemapsEqual(existingCel.tilemap, tilemap)
      || !optionalTerrainmapsEqual(existingCel.terrainmap, terrainmap))) {
      throw new Error("Linked cel pixels do not match");
    }
    const sharedPixels = existingCel?.pixels ?? pixels;
    const sharedIndexes = existingCel?.indexes ?? indexes;
    if (!existingCel) linkedCels.set(cel.linkId, {width: cel.width, height: cel.height, pixels, indexes, tilemap, terrainmap});
    cels[key] = {
      ...cel,
      pixels: sharedPixels,
      indexes: sharedIndexes,
      tilemap: existingCel?.tilemap ?? tilemap,
      terrainmap: existingCel?.terrainmap ?? terrainmap,
    };
    celIDs.add(cel.id);
  }
  const document: PixelDocument = {
    formatVersion: documentFormatVersion,
    name: decoded.name,
    width: decoded.width,
    height: decoded.height,
    colorMode: decoded.colorMode,
    colorProfile,
    pixelAspectRatio,
    palette: {id: decoded.palette.id, name: decoded.palette.name, colors: [...decoded.palette.colors], transparentIndex: decoded.palette.transparentIndex},
    tilesets,
    layers,
    frames,
    tags,
    slices,
    guides,
    settings,
    cels,
    activeLayerId: decoded.activeLayerId,
    activeFrameId: decoded.activeFrameId,
  };
  for (const cel of Object.values(document.cels)) {
    const layer = layers.find((candidate) => candidate.id === cel.layerId);
    if (layer?.kind !== "tilemap" || !layer.tilesetId || !cel.tilemap) continue;
    const tileset = tilesets.find((candidate) => candidate.id === layer.tilesetId)!;
    if (cel.terrainmap) {
      const expectedTiles = new Uint32Array(cel.tilemap.tiles.length);
      recalculateTerrainCells(
        cel.terrainmap,
        tileset.terrains,
        positionedTilesetGridLayout(tileset, cel.tilemap),
        expectedTiles,
        Array.from({length: expectedTiles.length}, (_, index) => ({
          column: index % cel.tilemap!.columns,
          row: Math.floor(index / cel.tilemap!.columns),
        })),
      );
      if (expectedTiles.some((value, index) => value !== cel.tilemap!.tiles[index])) throw new Error("Project Terrain cache does not match its TerrainMap");
    }
    const rendered = renderTilemapCel(cel, tileset, {
      palette: decoded.colorMode === "indexed" ? decoded.palette.colors : undefined,
      transparentIndex: decoded.palette.transparentIndex,
    });
    if (!bytesEqual(rendered, cel.pixels)) throw new Error("Project tilemap cache does not match its cells");
  }
  restoreLinkedCelBuffers(document);
  return document;
}

function decodeTilemapGridOffset(value: unknown, tileset: Tileset): TilemapData["gridOffset"] {
  if (value === undefined) return undefined;
  if (value !== "odd-r" && value !== "even-r" && value !== "odd-q" && value !== "even-q") {
    throw new Error("Project tilemap grid offset is invalid");
  }
  if (tileset.grid.kind !== "hexagonal"
    || (tileset.grid.orientation === "pointy" && !value.endsWith("-r"))
    || (tileset.grid.orientation === "flat" && !value.endsWith("-q"))) {
    throw new Error("Project tilemap grid offset does not match its Tileset");
  }
  return value;
}

function decodeLayers(value: unknown, tilesets: readonly Tileset[]): Layer[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Project layers are invalid");
  const ids = new Set<string>();
  const layers = value.map((candidate): Layer => {
    if (!isRecord(candidate)
      || typeof candidate.id !== "string" || !candidate.id || ids.has(candidate.id)
      || typeof candidate.name !== "string" || !candidate.name.trim()
      || typeof candidate.visible !== "boolean"
      || typeof candidate.locked !== "boolean"
      || typeof candidate.opacity !== "number" || !Number.isFinite(candidate.opacity) || candidate.opacity < 0 || candidate.opacity > 1
      || (candidate.kind !== "image" && candidate.kind !== "group" && candidate.kind !== "tilemap")
      || !isBlendMode(candidate.blendMode)
      || !isLayerRole(candidate.role)
      || typeof candidate.continuous !== "boolean"
      || typeof candidate.alphaLock !== "boolean"
      || (candidate.kind === "tilemap" && (typeof candidate.tilesetId !== "string" || !tilesets.some((tileset) => tileset.id === candidate.tilesetId)))
      || (candidate.kind !== "tilemap" && candidate.tilesetId !== undefined)
      || (candidate.parentId !== undefined && (typeof candidate.parentId !== "string" || !candidate.parentId))) {
      throw new Error("Project layers are invalid");
    }
    ids.add(candidate.id);
    return {
      id: candidate.id,
      name: candidate.name,
      visible: candidate.visible,
      locked: candidate.locked,
      opacity: candidate.opacity,
      kind: candidate.kind,
      blendMode: candidate.blendMode,
      role: candidate.role,
      continuous: candidate.continuous,
      alphaLock: candidate.alphaLock,
      ...(candidate.kind === "tilemap" ? {tilesetId: candidate.tilesetId as string} : {}),
      ...(candidate.parentId ? {parentId: candidate.parentId} : {}),
    };
  });
  if (!layers.some((layer) => layer.kind !== "group")) throw new Error("Project layers are invalid");
  const byID = new Map(layers.map((layer) => [layer.id, layer]));
  for (const layer of layers) {
    if (layer.parentId && byID.get(layer.parentId)?.kind !== "group") throw new Error("Project layer hierarchy is invalid");
    const visited = new Set<string>([layer.id]);
    let parentId = layer.parentId;
    while (parentId) {
      if (visited.has(parentId)) throw new Error("Project layer hierarchy is invalid");
      visited.add(parentId);
      parentId = byID.get(parentId)?.parentId;
    }
  }
  return layers;
}

function decodeColorProfile(value: unknown): ColorProfile {
  if (!isRecord(value)
    || (value.type !== "none" && value.type !== "srgb" && value.type !== "display-p3" && value.type !== "embedded")
    || typeof value.name !== "string" || !value.name.trim()) {
    throw new Error("Project color profile is invalid");
  }
  if (value.type === "embedded") {
    if (typeof value.data !== "string") throw new Error("Project color profile is invalid");
    const data = Uint8Array.from(base64ToBytes(value.data));
    if (data.length === 0 || data.length > 4 * 1024 * 1024) throw new Error("Project color profile is invalid");
    return {type: value.type, name: value.name.trim(), data};
  }
  if (value.data !== undefined) throw new Error("Project color profile is invalid");
  return {type: value.type, name: value.name.trim()};
}

function decodePixelAspectRatio(value: unknown): PixelDocument["pixelAspectRatio"] {
  if (!isRecord(value)
    || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height)
    || (value.width as number) < 1 || (value.width as number) > 64
    || (value.height as number) < 1 || (value.height as number) > 64) {
    throw new Error("Project pixel aspect ratio is invalid");
  }
  return {width: value.width as number, height: value.height as number};
}

function decodeTilesets(
  value: unknown,
  colorMode: PixelDocument["colorMode"],
  palette: readonly string[],
  transparentIndex: number,
): Tileset[] {
  if (!Array.isArray(value)) throw new Error("Project tilesets are invalid");
  const ids = new Set<string>();
  return value.map((candidate): Tileset => {
    if (!isRecord(candidate)
      || typeof candidate.id !== "string" || !validCelID(candidate.id) || ids.has(candidate.id)
      || typeof candidate.name !== "string" || !candidate.name.trim()
      || !validDimension(candidate.tileWidth) || !validDimension(candidate.tileHeight)
      || !isTilesetGrid(candidate.grid, candidate.tileWidth, candidate.tileHeight)
      || !Array.isArray(candidate.terrains)
      || !Array.isArray(candidate.tiles)) throw new Error("Project tilesets are invalid");
    ids.add(candidate.id);
    const tileIDs = new Set<number>();
    const expectedPixels = candidate.tileWidth * candidate.tileHeight * 4;
    const expectedIndexes = candidate.tileWidth * candidate.tileHeight;
    const tiles = candidate.tiles.map((raw): Tileset["tiles"][number] => {
      if (!isRecord(raw)
        || typeof raw.id !== "number" || !Number.isSafeInteger(raw.id) || raw.id <= 0 || raw.id > tileIndexMask || tileIDs.has(raw.id)
        || typeof raw.pixels !== "string") throw new Error("Project tilesets are invalid");
      const pixels = base64ToBytes(raw.pixels);
      const indexes = typeof raw.indexes === "string" ? Uint8Array.from(base64ToBytes(raw.indexes)) : undefined;
      if (pixels.length !== expectedPixels
        || (colorMode === "indexed" && (!indexes || indexes.length !== expectedIndexes))
        || (colorMode !== "indexed" && indexes !== undefined)) throw new Error("Project tilesets are invalid");
      if (indexes && !indexedPixelsMatch(pixels, pixelsFromIndexes(indexes, palette, transparentIndex))) {
        throw new Error("Project indexed tile cache does not match its indexes");
      }
      tileIDs.add(raw.id);
      return {id: raw.id, pixels, indexes};
    });
    const grid = {...candidate.grid};
    let terrains: TerrainDefinition[];
    try {
      terrains = candidate.terrains.map((terrain) => cloneSerializedTerrainDefinition(terrain));
      validateTerrainDefinitions(terrains, tilesetGridLayout(candidate.tileWidth, candidate.tileHeight, grid));
    } catch {
      throw new Error("Project terrains are invalid");
    }
    if (terrains.some((terrain) => !validColor(terrain.color)
      || terrain.rules.some((rule) => rule.candidates.some((candidate) => !tileIDs.has(candidate.tileId))))) {
      throw new Error("Project terrains are invalid");
    }
    return {
      id: candidate.id,
      name: candidate.name.trim(),
      tileWidth: candidate.tileWidth,
      tileHeight: candidate.tileHeight,
      grid,
      terrains,
      tiles,
    };
  });
}

function cloneSerializedTerrainDefinition(value: unknown): TerrainDefinition {
  if (!isRecord(value) || !Array.isArray(value.rules)) throw new Error("Project terrain is invalid");
  return {
    id: value.id as number,
    name: value.name as string,
    color: value.color as string,
    neighborMode: value.neighborMode as TerrainDefinition["neighborMode"],
    boundary: value.boundary as TerrainDefinition["boundary"],
    rules: value.rules.map((rule) => {
      if (!isRecord(rule) || !Array.isArray(rule.candidates)) throw new Error("Project terrain rule is invalid");
      return {
        mask: rule.mask as number,
        candidates: rule.candidates.map((candidate) => {
          if (!isRecord(candidate)) throw new Error("Project terrain candidate is invalid");
          return {
            tileId: candidate.tileId as number,
            flags: candidate.flags as number,
            weight: candidate.weight as number,
          };
        }),
      };
    }),
  };
}

function tilesetGridLayout(
  tileWidth: number,
  tileHeight: number,
  grid: Tileset["grid"],
): TileGridLayout {
  return grid.kind === "hexagonal"
    ? {kind: grid.kind, tileWidth, tileHeight, orientation: grid.orientation, offset: grid.offset}
    : grid.kind === "isometric"
      ? {kind: grid.kind, tileWidth: grid.cellWidth, tileHeight: grid.cellHeight}
      : {kind: grid.kind, tileWidth, tileHeight};
}

function isTilesetGrid(value: unknown, tileWidth: number, tileHeight: number): value is Tileset["grid"] {
  if (!isRecord(value)) return false;
  if (value.kind === "orthogonal") {
    return Object.keys(value).length === 1;
  }
  if (value.kind === "isometric") {
    return Number.isSafeInteger(value.cellWidth) && (value.cellWidth as number) > 0 && (value.cellWidth as number) <= 4096
      && Number.isSafeInteger(value.cellHeight) && (value.cellHeight as number) > 0 && (value.cellHeight as number) <= 4096
      && Number.isSafeInteger(value.anchorX) && (value.anchorX as number) >= 0 && (value.anchorX as number) <= tileWidth
      && Number.isSafeInteger(value.anchorY) && (value.anchorY as number) >= 0 && (value.anchorY as number) <= tileHeight
      && Object.keys(value).every((key) => ["kind", "cellWidth", "cellHeight", "anchorX", "anchorY"].includes(key));
  }
  if (value.kind !== "hexagonal"
    || (value.orientation !== "pointy" && value.orientation !== "flat")
    || (value.offset !== "odd-r" && value.offset !== "even-r" && value.offset !== "odd-q" && value.offset !== "even-q")) return false;
  return Object.keys(value).every((key) => ["kind", "orientation", "offset"].includes(key))
    && ((value.orientation === "pointy" && (value.offset === "odd-r" || value.offset === "even-r"))
      || (value.orientation === "flat" && (value.offset === "odd-q" || value.offset === "even-q")));
}

function decodeFrames(value: unknown): Frame[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Project frames are invalid");
  const ids = new Set<string>();
  return value.map((candidate): Frame => {
    if (!isRecord(candidate)
      || typeof candidate.id !== "string" || !candidate.id || ids.has(candidate.id)
      || typeof candidate.durationMs !== "number" || !Number.isInteger(candidate.durationMs) || candidate.durationMs <= 0) {
      throw new Error("Project frames are invalid");
    }
    ids.add(candidate.id);
    return {id: candidate.id, durationMs: candidate.durationMs};
  });
}

function decodeTags(value: unknown, frames: readonly Frame[]): FrameTag[] {
  if (!Array.isArray(value)) throw new Error("Project tags are invalid");
  const frameIDs = new Set(frames.map((frame) => frame.id));
  const tagIDs = new Set<string>();
  return value.map((candidate): FrameTag => {
    if (!isRecord(candidate)
      || typeof candidate.id !== "string" || !candidate.id || tagIDs.has(candidate.id)
      || typeof candidate.name !== "string" || !candidate.name.trim()
      || typeof candidate.fromFrameId !== "string" || !frameIDs.has(candidate.fromFrameId)
      || typeof candidate.toFrameId !== "string" || !frameIDs.has(candidate.toFrameId)
      || !isTagDirection(candidate.direction)
      || typeof candidate.color !== "string" || !validColor(candidate.color)
      || typeof candidate.repeat !== "number" || !Number.isSafeInteger(candidate.repeat) || candidate.repeat < 0 || candidate.repeat > 65535) {
      throw new Error("Project tags are invalid");
    }
    tagIDs.add(candidate.id);
    return candidate as unknown as FrameTag;
  });
}

function decodeSlices(value: unknown, frames: readonly Frame[], width: number, height: number): Slice[] {
  if (!Array.isArray(value)) throw new Error("Project slices are invalid");
  const frameIDs = new Set(frames.map((frame) => frame.id));
  const ids = new Set<string>();
  return value.map((candidate) => {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || !candidate.id || ids.has(candidate.id)
      || typeof candidate.name !== "string" || !candidate.name.trim() || typeof candidate.color !== "string" || !validColor(candidate.color)
      || !Array.isArray(candidate.keys) || candidate.keys.length === 0) throw new Error("Project slices are invalid");
    ids.add(candidate.id);
    const keyFrameIDs = new Set<string>();
    const keys = candidate.keys.map((raw) => {
      if (!isRecord(raw) || typeof raw.frameId !== "string" || !frameIDs.has(raw.frameId) || !validRect(raw, width, height)
        || keyFrameIDs.has(raw.frameId)
        || (raw.center !== undefined && (!isRecord(raw.center) || !validRect(raw.center, raw.width as number, raw.height as number)))
        || (raw.pivot !== undefined && (!isRecord(raw.pivot) || !Number.isInteger(raw.pivot.x) || !Number.isInteger(raw.pivot.y)))) {
        throw new Error("Project slices are invalid");
      }
      keyFrameIDs.add(raw.frameId);
      return raw as unknown as Slice["keys"][number];
    });
    return {id: candidate.id, name: candidate.name.trim(), color: candidate.color, keys};
  });
}

function decodeGuides(value: unknown, width: number, height: number): Guide[] {
  if (!Array.isArray(value)) throw new Error("Project guides are invalid");
  const ids = new Set<string>();
  return value.map((candidate) => {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || !candidate.id || ids.has(candidate.id)
      || (candidate.axis !== "horizontal" && candidate.axis !== "vertical") || typeof candidate.position !== "number" || !Number.isFinite(candidate.position)
      || candidate.position < 0 || candidate.position > (candidate.axis === "horizontal" ? height : width)) throw new Error("Project guides are invalid");
    ids.add(candidate.id);
    return candidate as unknown as Guide;
  });
}

function decodeSettings(value: unknown, width: number, height: number): DocumentSettings {
  if (!isRecord(value)
    || !validDimension(value.gridWidth) || !validDimension(value.gridHeight)
    || !Number.isSafeInteger(value.gridOffsetX) || !Number.isSafeInteger(value.gridOffsetY)
    || typeof value.snapToGrid !== "boolean" || typeof value.tiledX !== "boolean" || typeof value.tiledY !== "boolean"
    || typeof value.symmetryX !== "boolean" || typeof value.symmetryY !== "boolean"
    || typeof value.symmetryAxisX !== "number" || !Number.isFinite(value.symmetryAxisX) || value.symmetryAxisX < 0 || value.symmetryAxisX > width
    || typeof value.symmetryAxisY !== "number" || !Number.isFinite(value.symmetryAxisY) || value.symmetryAxisY < 0 || value.symmetryAxisY > height
    || typeof value.onionPreviousFrames !== "number" || !Number.isSafeInteger(value.onionPreviousFrames) || value.onionPreviousFrames < 0 || value.onionPreviousFrames > 16
    || typeof value.onionNextFrames !== "number" || !Number.isSafeInteger(value.onionNextFrames) || value.onionNextFrames < 0 || value.onionNextFrames > 16
    || typeof value.onionOpacity !== "number" || !Number.isFinite(value.onionOpacity) || value.onionOpacity < 0 || value.onionOpacity > 1
    || typeof value.onionPreviousColor !== "string" || !validColor(value.onionPreviousColor)
    || typeof value.onionNextColor !== "string" || !validColor(value.onionNextColor)
    || (value.interpolation !== "nearest" && value.interpolation !== "bilinear")
    || (value.gradientType !== "linear" && value.gradientType !== "radial" && value.gradientType !== "angular" && value.gradientType !== "reflected" && value.gradientType !== "diamond")
    || (value.selectionConnectivity !== 4 && value.selectionConnectivity !== 8)) {
    throw new Error("Project settings are invalid");
  }
  return value as unknown as DocumentSettings;
}

export function bytesToBase64(bytes: Uint8Array | Uint8ClampedArray): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += binaryChunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + binaryChunkSize)));
  }
  return btoa(chunks.join(""));
}

function base64ToBytes(value: string): Uint8ClampedArray {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error("Project cel pixels are invalid");
  }
  const bytes = new Uint8ClampedArray(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function uint32ToBytesLE(values: Uint32Array) {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value, true));
  return bytes;
}

function uint16ToBytesLE(values: Uint16Array) {
  const bytes = new Uint8Array(values.length * 2);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setUint16(index * 2, value, true));
  return bytes;
}

function base64ToUint32LE(value: string) {
  const bytes = base64ToBytes(value);
  if (bytes.length % 4 !== 0) throw new Error("Project tilemap data is invalid");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const values = new Uint32Array(bytes.length / 4);
  for (let index = 0; index < values.length; index += 1) values[index] = view.getUint32(index * 4, true);
  return values;
}

function base64ToUint16LE(value: string) {
  const bytes = base64ToBytes(value);
  if (bytes.length % 2 !== 0) throw new Error("Project terrain map data is invalid");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const values = new Uint16Array(bytes.length / 2);
  for (let index = 0; index < values.length; index += 1) values[index] = view.getUint16(index * 2, true);
  return values;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validDimension(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 2048;
}

function validCelOffset(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isColorMode(value: unknown): value is PixelDocument["colorMode"] {
  return value === "rgba" || value === "grayscale" || value === "indexed" || value === "bitmap";
}

function validCelID(value: unknown): value is string {
  return typeof value === "string"
    && value !== ""
    && value !== "."
    && value !== ".."
    && !value.includes("..")
    && !value.includes("/")
    && !value.includes("\\");
}

function validColor(value: string) {
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value);
}

function isBlendMode(value: unknown): value is BlendMode {
  return typeof value === "string" && ["normal", "darken", "multiply", "color-burn", "lighten", "screen", "color-dodge", "overlay", "soft-light", "hard-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity", "addition", "subtract", "divide"].includes(value);
}

function isLayerRole(value: unknown): value is Layer["role"] {
  return value === "standard" || value === "background" || value === "reference";
}

function validRect(value: Record<string, unknown>, width: number, height: number) {
  return Number.isInteger(value.x) && Number.isInteger(value.y) && Number.isInteger(value.width) && Number.isInteger(value.height)
    && (value.width as number) > 0 && (value.height as number) > 0 && (value.x as number) >= 0 && (value.y as number) >= 0
    && (value.x as number) + (value.width as number) <= width && (value.y as number) + (value.height as number) <= height;
}

function isTagDirection(value: unknown): value is TagDirection {
  return value === "forward" || value === "reverse" || value === "pingpong";
}

function bytesEqual(left: Uint8ClampedArray, right: Uint8ClampedArray) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function pixelsFromIndexes(indexes: Uint8Array, palette: readonly string[], transparentIndex: number) {
  const pixels = new Uint8ClampedArray(indexes.length * 4);
  for (let index = 0; index < indexes.length; index += 1) {
    if (indexes[index] >= palette.length) throw new Error("Project indexed data references an unknown palette color");
    const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(palette[indexes[index]]);
    if (!match) throw new Error("Project palette is invalid");
    const offset = index * 4;
    pixels[offset] = Number.parseInt(match[1].slice(0, 2), 16);
    pixels[offset + 1] = Number.parseInt(match[1].slice(2, 4), 16);
    pixels[offset + 2] = Number.parseInt(match[1].slice(4, 6), 16);
    pixels[offset + 3] = indexes[index] === transparentIndex ? 0 : match[2] ? Number.parseInt(match[2], 16) : 255;
  }
  return pixels;
}

function indexedPixelsMatch(pixels: Uint8ClampedArray, expected: Uint8ClampedArray) {
  if (pixels.length !== expected.length) return false;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset + 3] !== expected[offset + 3]) return false;
    if (expected[offset + 3] !== 0
      && (pixels[offset] !== expected[offset]
        || pixels[offset + 1] !== expected[offset + 1]
        || pixels[offset + 2] !== expected[offset + 2])) return false;
  }
  return true;
}

function optionalBytesEqual(left?: Uint8Array, right?: Uint8Array) {
  if (!left || !right) return left === right;
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function optionalTilemapsEqual(left?: TilemapData, right?: TilemapData) {
  if (!left || !right) return left === right;
  if (left.columns !== right.columns || left.rows !== right.rows || left.gridOffset !== right.gridOffset
    || left.tiles.length !== right.tiles.length) return false;
  return left.tiles.every((value, index) => value === right.tiles[index]);
}

function optionalTerrainmapsEqual(left?: TerrainMapData, right?: TerrainMapData) {
  if (!left || !right) return left === right;
  if (left.columns !== right.columns || left.rows !== right.rows || left.seed !== right.seed
    || left.terrains.length !== right.terrains.length) return false;
  return left.terrains.every((value, index) => value === right.terrains[index]);
}

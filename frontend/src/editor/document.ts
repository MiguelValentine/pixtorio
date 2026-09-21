import type {TerrainDefinition, TerrainMapData} from "./terrain";
import {tilemapPixelSize} from "./tilemapGeometry";

export const documentFormatVersion = 5 as const;

export type ColorMode = "rgba" | "grayscale" | "indexed" | "bitmap";
export type LayerKind = "image" | "group" | "tilemap";
export type LayerRole = "standard" | "background" | "reference";
export type BlendMode = "normal" | "darken" | "multiply" | "color-burn" | "lighten" | "screen" | "color-dodge" | "overlay" | "soft-light" | "hard-light" | "difference" | "exclusion" | "hue" | "saturation" | "color" | "luminosity" | "addition" | "subtract" | "divide";
export type TagDirection = "forward" | "reverse" | "pingpong";

export interface Palette {
  id: string;
  name: string;
  colors: string[];
  transparentIndex: number;
}

export type ColorProfileType = "none" | "srgb" | "display-p3" | "embedded";

export interface ColorProfile {
  type: ColorProfileType;
  name: string;
  /** Raw ICC payload for embedded profiles. */
  data?: Uint8Array;
}

export interface PixelAspectRatio {
  width: number;
  height: number;
}

export const tileFlipX = 0x80000000;
export const tileFlipY = 0x40000000;
export const tileFlipDiagonal = 0x20000000;
export const tileIndexMask = 0x1fffffff;

export interface Tile {
  /** Tile index 0 is reserved for the empty tile and is never stored here. */
  id: number;
  pixels: Uint8ClampedArray;
  indexes?: Uint8Array;
}

export type TilesetGrid =
  | {kind: "orthogonal"}
  | {
    kind: "isometric";
    cellWidth: number;
    cellHeight: number;
    anchorX: number;
    anchorY: number;
  }
  | {
    kind: "hexagonal";
    orientation: "pointy" | "flat";
    offset: "odd-r" | "even-r" | "odd-q" | "even-q";
  };

export interface Tileset {
  id: string;
  name: string;
  tileWidth: number;
  tileHeight: number;
  grid: TilesetGrid;
  terrains: TerrainDefinition[];
  tiles: Tile[];
}

export interface TilemapData {
  columns: number;
  rows: number;
  /** Optional per-map hex offset when shared maps require different parity layouts. */
  gridOffset?: "odd-r" | "even-r" | "odd-q" | "even-q";
  /** Tile index plus the high-bit flip flags declared above. */
  tiles: Uint32Array;
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  kind: LayerKind;
  parentId?: string;
  blendMode: BlendMode;
  role: LayerRole;
  continuous: boolean;
  alphaLock: boolean;
  tilesetId?: string;
}

export interface Frame {
  id: string;
  durationMs: number;
}

export interface FrameTag {
  id: string;
  name: string;
  fromFrameId: string;
  toFrameId: string;
  direction: TagDirection;
  color: string;
  repeat: number;
}

export interface Cel {
  id: string;
  linkId: string;
  /** Per-instance appearance; linked Cels share pixels, not these properties. */
  opacity: number;
  zIndex: number;
  layerId: string;
  frameId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  /** Authoritative palette indexes in indexed documents. RGBA pixels are the render cache. */
  indexes?: Uint8Array;
  /** Authoritative tile cells on tilemap layers. RGBA pixels are a render cache. */
  tilemap?: TilemapData;
  /** Authoritative logical Terrain cells when Terrain painting is enabled. */
  terrainmap?: TerrainMapData;
}

export interface SliceKey {
  frameId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  center?: {x: number; y: number; width: number; height: number};
  pivot?: {x: number; y: number};
}

export type SliceKeyUpdate = Partial<Omit<SliceKey, "frameId">>;

export interface Slice {
  id: string;
  name: string;
  color: string;
  keys: SliceKey[];
}

export interface Guide {
  id: string;
  axis: "horizontal" | "vertical";
  position: number;
}

export interface DocumentSettings {
  gridWidth: number;
  gridHeight: number;
  gridOffsetX: number;
  gridOffsetY: number;
  snapToGrid: boolean;
  tiledX: boolean;
  tiledY: boolean;
  symmetryX: boolean;
  symmetryY: boolean;
  symmetryAxisX: number;
  symmetryAxisY: number;
  onionPreviousFrames: number;
  onionNextFrames: number;
  onionOpacity: number;
  onionPreviousColor: string;
  onionNextColor: string;
  /** How transformed pixels are sampled. */
  interpolation: "nearest" | "bilinear";
  /** Default gradient geometry for newly started gradient gestures. */
  gradientType: "linear" | "radial" | "angular" | "reflected" | "diamond";
  /** Connectivity used by region tools such as magic wand and contour. */
  selectionConnectivity: 4 | 8;
}

export interface PixelDocument {
  formatVersion: 5;
  name: string;
  width: number;
  height: number;
  colorMode: ColorMode;
  colorProfile: ColorProfile;
  pixelAspectRatio: PixelAspectRatio;
  palette: Palette;
  tilesets: Tileset[];
  layers: Layer[];
  frames: Frame[];
  tags: FrameTag[];
  slices: Slice[];
  guides: Guide[];
  settings: DocumentSettings;
  cels: Record<string, Cel>;
  activeLayerId: string;
  activeFrameId: string;
}

interface CreateDocumentOptions {
  name?: string;
  layerName?: string;
  width: number;
  height: number;
  palette?: string[];
  colorMode?: ColorMode;
}

export const defaultPalette = [
  "#1f2024ff", "#ffffffff", "#ef476fff", "#f78c6bff",
  "#ffd166ff", "#83d483ff", "#06d6a0ff", "#4cc9f0ff",
  "#4895efff", "#725ac1ff", "#b5179eff", "#7a5548ff",
];

export function createDocument({
  name = "untitled.pixio",
  layerName = "Layer 1",
  width,
  height,
  palette = defaultPalette,
  colorMode = "rgba",
}: CreateDocumentOptions): PixelDocument {
  assertDimensions(width, height);

  const layerId = createID("layer");
  const frameId = createID("frame");
  const cel = createCel(layerId, frameId, width, height);
  if (colorMode === "indexed") cel.indexes = new Uint8Array(width * height);

  return {
    formatVersion: documentFormatVersion,
    name,
    width,
    height,
    colorMode,
    colorProfile: {type: "srgb", name: "sRGB"},
    pixelAspectRatio: {width: 1, height: 1},
    palette: {
      id: createID("palette"),
      name: "Default",
      colors: [...palette],
      transparentIndex: 0,
    },
    tilesets: [],
    layers: [{
      id: layerId,
      name: layerName,
      visible: true,
      locked: false,
      opacity: 1,
      kind: "image",
      blendMode: "normal",
      role: "standard",
      continuous: false,
      alphaLock: false,
    }],
    frames: [{id: frameId, durationMs: 100}],
    tags: [],
    slices: [],
    guides: [],
    settings: defaultDocumentSettings(width, height),
    cels: {[celKey(layerId, frameId)]: cel},
    activeLayerId: layerId,
    activeFrameId: frameId,
  };
}

export function createCel(layerId: string, frameId: string, width: number, height: number): Cel {
  assertDimensions(width, height);
  return {
    id: createID("cel"),
    linkId: createID("link"),
    opacity: 1,
    zIndex: 0,
    layerId,
    frameId,
    x: 0,
    y: 0,
    width,
    height,
    pixels: new Uint8ClampedArray(width * height * 4),
  };
}

export function setCelProperties(document: PixelDocument, layerId: string, frameId: string, update: {opacity?: number; zIndex?: number}) {
  if (update.opacity !== undefined && (!Number.isFinite(update.opacity) || update.opacity < 0 || update.opacity > 1)) throw new Error("Invalid cel opacity");
  if (update.zIndex !== undefined && (!Number.isInteger(update.zIndex) || update.zIndex < -32768 || update.zIndex > 32767)) throw new Error("Invalid cel z-index");
  const layer = getLayerByID(document, layerId);
  const cel = getCel(document, layerId, frameId);
  if (!layer || !cel || layer.role !== "standard" || isLayerEffectivelyLocked(document, layer)) return false;
  const opacity = update.opacity ?? cel.opacity, zIndex = update.zIndex ?? cel.zIndex;
  if (opacity === cel.opacity && zIndex === cel.zIndex) return false;
  cel.opacity = opacity;
  cel.zIndex = zIndex;
  return true;
}

/** Frame-specific stacking stays inside each composited group. */
export function orderedFrameLayers(document: PixelDocument, frameId: string, parentId?: string) {
  return document.layers.filter((layer) => layer.parentId === parentId)
    .map((layer, index) => ({layer, index, z: layer.kind === "group" || layer.role === "background" ? 0 : getCel(document, layer.id, frameId)?.zIndex ?? 0}))
    .sort((a, b) => {
      if (a.layer.role === "background" || b.layer.role === "background") return a.layer.role === b.layer.role ? 0 : a.layer.role === "background" ? -1 : 1;
      return (a.index + a.z) - (b.index + b.z) || a.z - b.z || a.index - b.index;
    }).map(({layer}) => layer);
}

export function defaultDocumentSettings(width: number, height: number): DocumentSettings {
  return {
    gridWidth: 8,
    gridHeight: 8,
    gridOffsetX: 0,
    gridOffsetY: 0,
    snapToGrid: false,
    tiledX: false,
    tiledY: false,
    symmetryX: false,
    symmetryY: false,
    symmetryAxisX: width / 2,
    symmetryAxisY: height / 2,
    onionPreviousFrames: 1,
    onionNextFrames: 1,
    onionOpacity: 0.35,
    onionPreviousColor: "#f25b5bff",
    onionNextColor: "#4ea3ffff",
    interpolation: "nearest",
    gradientType: "linear",
    selectionConnectivity: 8,
  };
}

export function ensureCel(document: PixelDocument, layerId = document.activeLayerId, frameId = document.activeFrameId) {
  const layer = getLayerByID(document, layerId);
  if (!layer || !isCelLayer(layer)) return null;
  const key = celKey(layerId, frameId);
  let cel = document.cels[key];
  if (!cel) {
    cel = createCel(layerId, frameId, document.width, document.height);
    if (isTilemapLayer(layer)) {
      const tileset = document.tilesets.find((candidate) => candidate.id === layer.tilesetId);
      if (!tileset) return null;
      const columns = Math.ceil(document.width / tileset.tileWidth);
      const rows = Math.ceil(document.height / tileset.tileHeight);
      cel.tilemap = {columns, rows, tiles: new Uint32Array(columns * rows)};
      const size = tilemapPixelSize(tileset, cel.tilemap);
      cel.width = size.width;
      cel.height = size.height;
      cel.pixels = new Uint8ClampedArray(size.width * size.height * 4);
    }
    if (layer.role === "background") {
      const color = parseHexRGBA(document.palette.colors.find((_, index) => index !== document.palette.transparentIndex) ?? "#000000ff", [0, 0, 0, 255]);
      for (let offset = 0; offset < cel.pixels.length; offset += 4) cel.pixels.set([color[0], color[1], color[2], 255], offset);
    }
    if (document.colorMode === "indexed") cel.indexes = indexesForPixels(cel.pixels, document.palette.colors, document.palette.transparentIndex);
    document.cels[key] = cel;
  }
  return cel;
}

export function deleteCel(document: PixelDocument, layerId = document.activeLayerId, frameId = document.activeFrameId) {
  const key = celKey(layerId, frameId);
  if (!document.cels[key]) return false;
  delete document.cels[key];
  return true;
}

export function getCel(document: PixelDocument, layerId: string, frameId: string) {
  return document.cels[celKey(layerId, frameId)] ?? null;
}

export function getActiveCel(document: PixelDocument) {
  const cel = getCel(document, document.activeLayerId, document.activeFrameId);
  if (!cel) throw new Error("The active layer and frame do not have a cel");
  return cel;
}

export function getLayerByID(document: PixelDocument, layerId: string) {
  return document.layers.find((layer) => layer.id === layerId) ?? null;
}

export function getActiveLayer(document: PixelDocument) {
  const layer = getLayerByID(document, document.activeLayerId);
  if (!layer) throw new Error("The active layer does not exist");
  return layer;
}

export function layerKind(layer: Layer): LayerKind {
  return layer.kind;
}

export function layerBlendMode(layer: Layer): BlendMode {
  return layer.blendMode;
}

export function isImageLayer(layer: Layer) {
  return layerKind(layer) === "image";
}

export function isTilemapLayer(layer: Layer) {
  return layerKind(layer) === "tilemap";
}

export function isCelLayer(layer: Layer) {
  return isImageLayer(layer) || isTilemapLayer(layer);
}

export function isEditableImageLayer(layer: Layer) {
  return isImageLayer(layer) && layer.role !== "reference";
}

export function setPixelAspectRatio(document: PixelDocument, width: number, height: number) {
  const normalizedWidth = Math.max(1, Math.min(64, Math.round(width)));
  const normalizedHeight = Math.max(1, Math.min(64, Math.round(height)));
  if (document.pixelAspectRatio.width === normalizedWidth && document.pixelAspectRatio.height === normalizedHeight) return false;
  document.pixelAspectRatio = {width: normalizedWidth, height: normalizedHeight};
  return true;
}

export function assignColorProfile(document: PixelDocument, profile: ColorProfile) {
  if (!profile.name.trim()) return false;
  if (profile.type === "embedded" && (!profile.data || profile.data.length === 0)) return false;
  if (profile.type !== "embedded" && profile.data) return false;
  const sameData = optionalByteArraysEqual(document.colorProfile.data, profile.data);
  if (document.colorProfile.type === profile.type && document.colorProfile.name === profile.name.trim() && sameData) return false;
  document.colorProfile = {...profile, name: profile.name.trim(), data: profile.data?.slice()};
  return true;
}

export function isLayerEffectivelyLocked(document: PixelDocument, layer: Layer) {
  let current: Layer | null = layer;
  const visited = new Set<string>();
  while (current) {
    if (current.locked) return true;
    if (!current.parentId || visited.has(current.id)) return false;
    visited.add(current.id);
    current = getLayerByID(document, current.parentId);
  }
  return false;
}

export function getCelByID(document: PixelDocument, celId: string) {
  return Object.values(document.cels).find((cel) => cel.id === celId) ?? null;
}

export function compositeFrame(document: PixelDocument, frameId = document.activeFrameId) {
  return compositeLayerChildren(document, frameId, undefined, new Set<string>(), undefined, undefined, true);
}

export function compositeFrameForExport(document: PixelDocument, frameId = document.activeFrameId) {
  return compositeLayerChildren(document, frameId, undefined, new Set<string>(), undefined, undefined, false);
}

export interface PixelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Composites just a clipped document region. This is equivalent to cropping
 * `compositeFrame` to the same bounds, but avoids visiting pixels outside the
 * invalidated area when a cached frame needs a small repair.
 */
export function compositeFrameRegion(document: PixelDocument, bounds: PixelBounds, frameId = document.activeFrameId) {
  const region = clipPixelBounds(bounds, document.width, document.height);
  if (!region) return new Uint8ClampedArray();
  return compositeLayerChildren(document, frameId, undefined, new Set<string>(), undefined, region);
}

export function compositeFrameWithOnionSkin(
  document: PixelDocument,
  previousFrameIds: readonly string[] | string = [],
  nextFrameIds: readonly string[] | string = [],
) {
  const previous = typeof previousFrameIds === "string" ? [previousFrameIds] : previousFrameIds;
  const next = typeof nextFrameIds === "string" ? [nextFrameIds] : nextFrameIds;
  return compositeLayerChildren(document, document.activeFrameId, undefined, new Set<string>(), {
    layerId: document.activeLayerId,
    previousFrameIds: previous,
    nextFrameIds: next,
    opacity: document.settings.onionOpacity,
    previousColor: parseHexRGBA(document.settings.onionPreviousColor, [242, 91, 91, 255]),
    nextColor: parseHexRGBA(document.settings.onionNextColor, [78, 163, 255, 255]),
  });
}

export function addLayer(document: PixelDocument, name = nextLayerName(document)) {
  const activeIndex = document.layers.findIndex((layer) => layer.id === document.activeLayerId);
  const activeLayer = activeIndex >= 0 ? document.layers[activeIndex] : null;
  const layer: Layer = {
    id: createID("layer"),
    name,
    visible: true,
    locked: false,
    opacity: 1,
    kind: "image",
    blendMode: "normal",
    role: "standard",
    continuous: false,
    alphaLock: false,
    parentId: activeLayer && layerKind(activeLayer) === "group" ? activeLayer.id : activeLayer?.parentId,
  };
  document.layers.splice(activeIndex < 0 ? document.layers.length : activeIndex + 1, 0, layer);
  ensureCel(document, layer.id, document.activeFrameId);
  document.activeLayerId = layer.id;
  return layer;
}

export function addLayerGroup(document: PixelDocument, name = nextGroupName(document)) {
  const activeIndex = document.layers.findIndex((layer) => layer.id === document.activeLayerId);
  const activeLayer = activeIndex >= 0 ? document.layers[activeIndex] : null;
  const group: Layer = {
    id: createID("group"),
    name,
    visible: true,
    locked: false,
    opacity: 1,
    kind: "group",
    blendMode: "normal",
    role: "standard",
    continuous: false,
    alphaLock: false,
    parentId: activeLayer?.parentId,
  };
  document.layers.splice(activeIndex < 0 ? document.layers.length : activeIndex + 1, 0, group);
  // A background layer is always a root layer. Creating a group while it is
  // active must not turn it into a child of that group.
  if (activeLayer && activeLayer.role !== "background") activeLayer.parentId = group.id;
  document.activeLayerId = group.id;
  return group;
}

export function addTilemapLayer(document: PixelDocument, tilesetId: string, name = "Tilemap") {
  if (!document.tilesets.some((tileset) => tileset.id === tilesetId)) return null;
  const activeIndex = document.layers.findIndex((layer) => layer.id === document.activeLayerId);
  const activeLayer = activeIndex >= 0 ? document.layers[activeIndex] : null;
  const layer: Layer = {
    id: createID("layer"),
    name,
    visible: true,
    locked: false,
    opacity: 1,
    kind: "tilemap",
    blendMode: "normal",
    role: "standard",
    continuous: false,
    alphaLock: false,
    tilesetId,
    parentId: activeLayer && layerKind(activeLayer) === "group" ? activeLayer.id : activeLayer?.parentId,
  };
  document.layers.splice(activeIndex < 0 ? document.layers.length : activeIndex + 1, 0, layer);
  document.activeLayerId = layer.id;
  ensureCel(document, layer.id, document.activeFrameId);
  return layer;
}

export function duplicateLayer(document: PixelDocument, layerId = document.activeLayerId, name?: string) {
  const sourceIndex = document.layers.findIndex((layer) => layer.id === layerId);
  if (sourceIndex < 0) return null;
  const source = document.layers[sourceIndex];
  const subtreeIDs = new Set<string>([source.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const layer of document.layers) {
      if (layer.parentId && subtreeIDs.has(layer.parentId) && !subtreeIDs.has(layer.id)) {
        subtreeIDs.add(layer.id);
        changed = true;
      }
    }
  }

  const sourceLayers = document.layers.filter((layer) => subtreeIDs.has(layer.id));
  const sourceIndexes = document.layers
    .map((layer, index) => subtreeIDs.has(layer.id) ? index : -1)
    .filter((index) => index >= 0);
  const insertIndex = Math.max(...sourceIndexes) + 1;
  const layerIDs = new Map<string, string>();
  for (const layer of sourceLayers) layerIDs.set(layer.id, createID("layer"));
  const duplicateLayers = sourceLayers.map((layer) => ({
    ...layer,
    id: layerIDs.get(layer.id)!,
    name: layer.id === source.id ? name ?? nextCopyName(document, source.name) : layer.name,
    // Background is a unique document role. A duplicate is an ordinary
    // editable layer rather than a second background layer.
    role: layer.role === "background" ? "standard" as const : layer.role,
    parentId: layer.id === source.id
      ? source.parentId
      : layer.parentId ? layerIDs.get(layer.parentId) : undefined,
  }));
  document.layers.splice(insertIndex, 0, ...duplicateLayers);

  const sourceLayerIDsByDuplicateID = new Map(duplicateLayers.map((layer, index) => [layer.id, sourceLayers[index].id]));
  const linkIDs = new Map<string, string>();
  const linkedBuffers = new Map<string, Uint8ClampedArray>();
  const linkedIndexes = new Map<string, Uint8Array>();
  const linkedTilemaps = new Map<string, Uint32Array>();
  const linkedTerrains = new Map<string, Uint16Array>();
  for (const layer of duplicateLayers) {
    if (!isCelLayer(layer)) continue;
    const sourceLayerID = sourceLayerIDsByDuplicateID.get(layer.id);
    if (!sourceLayerID) continue;
    for (const frame of document.frames) {
      const sourceCel = getCel(document, sourceLayerID, frame.id);
      let cel: Cel;
      if (sourceCel) {
        let linkId = linkIDs.get(sourceCel.linkId);
        let pixels = linkedBuffers.get(sourceCel.linkId);
        if (!linkId || !pixels) {
          linkId = createID("link");
          pixels = sourceCel.pixels.slice();
          linkIDs.set(sourceCel.linkId, linkId);
          linkedBuffers.set(sourceCel.linkId, pixels);
        }
        let indexes: Uint8Array | undefined;
        if (sourceCel.indexes) {
          indexes = linkedIndexes.get(sourceCel.linkId);
          if (!indexes) {
            indexes = sourceCel.indexes.slice();
            linkedIndexes.set(sourceCel.linkId, indexes);
          }
        }
        let tilemap: TilemapData | undefined;
        if (sourceCel.tilemap) {
          let tiles = linkedTilemaps.get(sourceCel.linkId);
          if (!tiles) {
            tiles = sourceCel.tilemap.tiles.slice();
            linkedTilemaps.set(sourceCel.linkId, tiles);
          }
          tilemap = {...sourceCel.tilemap, tiles};
        }
        let terrainmap: TerrainMapData | undefined;
        if (sourceCel.terrainmap) {
          let terrains = linkedTerrains.get(sourceCel.linkId);
          if (!terrains) {
            terrains = sourceCel.terrainmap.terrains.slice();
            linkedTerrains.set(sourceCel.linkId, terrains);
          }
          terrainmap = {...sourceCel.terrainmap, terrains};
        }
        cel = {...sourceCel, id: createID("cel"), linkId, layerId: layer.id, pixels, indexes, tilemap, terrainmap};
      } else continue;
      document.cels[celKey(layer.id, frame.id)] = cel;
    }
  }
  const duplicate = duplicateLayers.find((layer) => layer.id === layerIDs.get(source.id));
  if (!duplicate) return null;
  document.activeLayerId = duplicate.id;
  return duplicate;
}

export function deleteLayer(document: PixelDocument, layerId = document.activeLayerId) {
  const index = document.layers.findIndex((layer) => layer.id === layerId);
  if (index < 0) return false;
  const target = document.layers[index];
  const removedIDs = new Set<string>([target.id]);
  if (layerKind(target) === "group") {
    let changed = true;
    while (changed) {
      changed = false;
      for (const layer of document.layers) {
        if (layer.parentId && removedIDs.has(layer.parentId) && !removedIDs.has(layer.id)) {
          removedIDs.add(layer.id);
          changed = true;
        }
      }
    }
  }
  const remainingCelLayers = document.layers.filter((layer) => isCelLayer(layer) && !removedIDs.has(layer.id));
  if (remainingCelLayers.length === 0) return false;
  document.layers = document.layers.filter((layer) => !removedIDs.has(layer.id));
  const referencedTilesets = new Set(document.layers
    .filter((layer) => isTilemapLayer(layer) && layer.tilesetId)
    .map((layer) => layer.tilesetId!));
  document.tilesets = document.tilesets.filter((tileset) => referencedTilesets.has(tileset.id));
  for (const key of Object.keys(document.cels)) {
    if (removedIDs.has(document.cels[key].layerId)) delete document.cels[key];
  }
  if (removedIDs.has(document.activeLayerId)) {
    document.activeLayerId = remainingCelLayers[Math.min(index, remainingCelLayers.length - 1)]?.id ?? remainingCelLayers[0].id;
  }
  return true;
}

export function addFrame(document: PixelDocument, durationMs = 100) {
  const activeIndex = document.frames.findIndex((frame) => frame.id === document.activeFrameId);
  const frame: Frame = {id: createID("frame"), durationMs: Math.max(1, Math.round(durationMs))};
  document.frames.splice(activeIndex < 0 ? document.frames.length : activeIndex + 1, 0, frame);
  copyFrameCels(document, document.activeFrameId, frame.id);
  document.activeFrameId = frame.id;
  return frame;
}

/**
 * Inserts a frame after the active frame without inheriting ordinary Cels.
 * Background layers are the exception: an opaque Cel is materialized so an
 * empty frame still has a valid background surface.
 */
export function addEmptyFrame(
  document: PixelDocument,
  durationMs = 100,
  backgroundColor?: readonly [number, number, number, number],
) {
  const activeIndex = document.frames.findIndex((frame) => frame.id === document.activeFrameId);
  const frame: Frame = {id: createID("frame"), durationMs: Math.max(1, Math.round(durationMs))};
  document.frames.splice(activeIndex < 0 ? document.frames.length : activeIndex + 1, 0, frame);
  for (const layer of document.layers) {
    if (layer.role !== "background" || !isCelLayer(layer)) continue;
    const cel = ensureCel(document, layer.id, frame.id);
    if (!cel || !backgroundColor) continue;
    const [red, green, blue] = backgroundColor;
    for (let offset = 0; offset < cel.pixels.length; offset += 4) {
      cel.pixels[offset] = red;
      cel.pixels[offset + 1] = green;
      cel.pixels[offset + 2] = blue;
      cel.pixels[offset + 3] = 255;
    }
    if (document.colorMode === "indexed") {
      cel.indexes = indexesForPixels(cel.pixels, document.palette.colors, document.palette.transparentIndex);
      for (let pixel = 0; pixel < cel.indexes.length; pixel += 1) {
        const color = parseHexRGBA(document.palette.colors[cel.indexes[pixel]] ?? "#000000ff", [0, 0, 0, 255]);
        const offset = pixel * 4;
        cel.pixels[offset] = color[0];
        cel.pixels[offset + 1] = color[1];
        cel.pixels[offset + 2] = color[2];
        cel.pixels[offset + 3] = 255;
      }
    }
  }
  document.activeFrameId = frame.id;
  return frame;
}

interface SharedCelBuffers {
  linkId: string;
  pixels: Uint8ClampedArray;
  indexes?: Uint8Array;
  tilemap?: TilemapData;
  terrainmap?: TerrainMapData;
}

/**
 * Copies every existing Cel from one frame into another frame. The copied
 * frame is independent from its source, while Cels that shared a buffer in
 * the source frame continue to share one cloned buffer in the destination.
 * Missing Cels remain missing.
 */
function copyFrameCels(document: PixelDocument, sourceFrameId: string, targetFrameId: string) {
  const copiedBuffers = new Map<string, SharedCelBuffers>();
  for (const layer of document.layers) {
    if (!isCelLayer(layer)) continue;
    const source = getCel(document, layer.id, sourceFrameId);
    if (!source) continue;

    if (layer.continuous) {
      // A regular New Frame on a continuous layer is an alias of the source
      // Cel. Per-instance appearance still belongs to the new Cel, so keep
      // the background invariants local to this frame.
      const linked: Cel = {
        ...source,
        id: createID("cel"),
        frameId: targetFrameId,
        linkId: source.linkId,
        pixels: source.pixels,
        indexes: source.indexes,
        tilemap: source.tilemap,
        terrainmap: source.terrainmap,
      };
      if (layer.role === "background") {
        linked.opacity = 1;
        linked.zIndex = 0;
      }
      document.cels[celKey(layer.id, targetFrameId)] = linked;
      continue;
    }

    let buffers = copiedBuffers.get(source.linkId);
    if (!buffers) {
      buffers = {
        linkId: createID("link"),
        pixels: source.pixels.slice(),
        indexes: source.indexes?.slice(),
        tilemap: source.tilemap
          ? {...source.tilemap, tiles: source.tilemap.tiles.slice()}
          : undefined,
        terrainmap: source.terrainmap
          ? {...source.terrainmap, terrains: source.terrainmap.terrains.slice()}
          : undefined,
      };
      copiedBuffers.set(source.linkId, buffers);
    }

    document.cels[celKey(layer.id, targetFrameId)] = {
      ...source,
      id: createID("cel"),
      linkId: buffers.linkId,
      frameId: targetFrameId,
      pixels: buffers.pixels,
      indexes: buffers.indexes,
      tilemap: buffers.tilemap,
      terrainmap: buffers.terrainmap,
    };
  }
}

/** Returns the neighboring frame without wrapping at either end. */
export function adjacentFrameID(document: PixelDocument, frameId = document.activeFrameId, direction: -1 | 1) {
  const index = document.frames.findIndex((frame) => frame.id === frameId);
  return index < 0 ? null : document.frames[index + direction]?.id ?? null;
}

export function duplicateFrame(document: PixelDocument, frameId = document.activeFrameId) {
  return duplicateFrames(document, [frameId])[0] ?? null;
}

export function deleteFrame(document: PixelDocument, frameId = document.activeFrameId) {
  return deleteFrames(document, [frameId]);
}

export function moveFrame(document: PixelDocument, frameId: string, direction: "forward" | "backward") {
  return moveFrames(document, [frameId], direction);
}

export function setFrameDuration(document: PixelDocument, frameId: string, durationMs: number) {
  return setFramesDuration(document, [frameId], durationMs);
}

/**
 * Duplicates the requested frames as one block immediately after the last
 * selected frame. Continuous layers link the new Cels to their source Cels;
 * ordinary layers receive detached buffers while preserving links inside the
 * copied block.
 */
export function duplicateFrames(document: PixelDocument, frameIds: readonly string[]) {
  const selectedIDs = orderedFrameIDs(document, frameIds);
  if (selectedIDs.length === 0) return [];

  const selectedFrames = selectedIDs.map((frameId) => document.frames.find((frame) => frame.id === frameId)!);
  const insertionIndex = Math.max(...selectedIDs.map((frameId) => document.frames.findIndex((frame) => frame.id === frameId))) + 1;
  const copies = selectedFrames.map((frame) => ({id: createID("frame"), durationMs: frame.durationMs}));
  const linkIDs = new Map<string, string>();
  const linkedBuffers = new Map<string, Uint8ClampedArray>();
  const linkedIndexes = new Map<string, Uint8Array>();
  const linkedTilemaps = new Map<string, Uint32Array>();
  const linkedTerrainmaps = new Map<string, Uint16Array>();

  for (let selectedIndex = 0; selectedIndex < selectedFrames.length; selectedIndex += 1) {
    const sourceFrame = selectedFrames[selectedIndex];
    const duplicateFrame = copies[selectedIndex];
    for (const layer of document.layers) {
      if (!isCelLayer(layer)) continue;
      const sourceCel = getCel(document, layer.id, sourceFrame.id);
      if (!sourceCel) continue;

      let cel: Cel;
      if (layer.continuous) {
        // Continuous layers intentionally share the source buffer. This also
        // preserves links to source frames outside the duplicated selection.
        cel = {
          ...sourceCel,
          id: createID("cel"),
          frameId: duplicateFrame.id,
          linkId: sourceCel.linkId,
          pixels: sourceCel.pixels,
          indexes: sourceCel.indexes,
          tilemap: sourceCel.tilemap,
          terrainmap: sourceCel.terrainmap,
        };
      } else {
        let linkId = linkIDs.get(sourceCel.linkId);
        let pixels = linkedBuffers.get(sourceCel.linkId);
        if (!linkId || !pixels) {
          linkId = createID("link");
          pixels = sourceCel.pixels.slice();
          linkIDs.set(sourceCel.linkId, linkId);
          linkedBuffers.set(sourceCel.linkId, pixels);
        }
        cel = {
          ...sourceCel,
          id: createID("cel"),
          linkId,
          frameId: duplicateFrame.id,
          pixels,
          indexes: sourceCel.indexes
            ? linkedIndexes.get(sourceCel.linkId) ?? (() => {
              const indexes = sourceCel.indexes!.slice();
              linkedIndexes.set(sourceCel.linkId, indexes);
              return indexes;
            })()
            : undefined,
          tilemap: sourceCel.tilemap
            ? {
              ...sourceCel.tilemap,
              tiles: linkedTilemaps.get(sourceCel.linkId) ?? (() => {
                const tiles = sourceCel.tilemap!.tiles.slice();
                linkedTilemaps.set(sourceCel.linkId, tiles);
                return tiles;
              })(),
            }
            : undefined,
          terrainmap: sourceCel.terrainmap
            ? {
              ...sourceCel.terrainmap,
              terrains: linkedTerrainmaps.get(sourceCel.linkId) ?? (() => {
                const terrains = sourceCel.terrainmap!.terrains.slice();
                linkedTerrainmaps.set(sourceCel.linkId, terrains);
                return terrains;
              })(),
            }
            : undefined,
        };
      }
      if (layer.role === "background") {
        cel.opacity = 1;
        cel.zIndex = 0;
      }
      document.cels[celKey(layer.id, duplicateFrame.id)] = cel;
    }
  }

  document.frames.splice(insertionIndex, 0, ...copies);
  // Slice keys are frame-local metadata. Duplicate the selected key for each
  // copied frame without sharing nested center/pivot objects.
  for (let selectedIndex = 0; selectedIndex < selectedIDs.length; selectedIndex += 1) {
    const sourceFrameId = selectedIDs[selectedIndex];
    const duplicateFrameId = copies[selectedIndex].id;
    for (const slice of document.slices) {
      const sourceKey = slice.keys.find((key) => key.frameId === sourceFrameId);
      if (!sourceKey) continue;
      slice.keys.push(cloneSliceKey({...sourceKey, frameId: duplicateFrameId}));
    }
  }
  document.activeFrameId = copies.at(-1)!.id;
  return copies;
}

/** Removes a normalized set of frames while retaining at least one frame. */
export function deleteFrames(document: PixelDocument, frameIds: readonly string[]) {
  const selectedIDs = orderedFrameIDs(document, frameIds);
  if (selectedIDs.length === 0 || selectedIDs.length >= document.frames.length) return false;

  const selectedSet = new Set(selectedIDs);
  const activeIndex = document.frames.findIndex((frame) => frame.id === document.activeFrameId);
  const tagUpdates = document.tags.map((tag) => {
    const range = frameIDsInRange(document, tag.fromFrameId, tag.toFrameId);
    const remaining = range.filter((frameId) => !selectedSet.has(frameId));
    if (remaining.length === 0) return null;
    const fromIndex = document.frames.findIndex((frame) => frame.id === tag.fromFrameId);
    const toIndex = document.frames.findIndex((frame) => frame.id === tag.toFrameId);
    const ascending = fromIndex <= toIndex;
    return {
      ...tag,
      fromFrameId: ascending ? remaining[0] : remaining.at(-1)!,
      toFrameId: ascending ? remaining.at(-1)! : remaining[0],
    };
  }).filter((tag): tag is FrameTag => Boolean(tag));

  document.frames.splice(0, document.frames.length, ...document.frames.filter((frame) => !selectedSet.has(frame.id)));
  for (const key of Object.keys(document.cels)) {
    if (selectedSet.has(document.cels[key].frameId)) delete document.cels[key];
  }
  for (const slice of document.slices) {
    slice.keys = slice.keys.filter((key) => !selectedSet.has(key.frameId));
  }
  document.slices = document.slices.filter((slice) => slice.keys.length > 0);
  document.tags = tagUpdates;
  if (selectedSet.has(document.activeFrameId)) {
    document.activeFrameId = document.frames[Math.min(Math.max(0, activeIndex), document.frames.length - 1)].id;
  }
  return true;
}

/** Moves all selected frames by one slot while preserving selected order. */
export function moveFrames(document: PixelDocument, frameIds: readonly string[], direction: "forward" | "backward") {
  const selectedIDs = orderedFrameIDs(document, frameIds);
  if (selectedIDs.length === 0) return false;
  const selectedSet = new Set(selectedIDs);
  let changed = false;

  if (direction === "forward") {
    for (let index = document.frames.length - 2; index >= 0; index -= 1) {
      if (!selectedSet.has(document.frames[index].id) || selectedSet.has(document.frames[index + 1].id)) continue;
      [document.frames[index], document.frames[index + 1]] = [document.frames[index + 1], document.frames[index]];
      changed = true;
    }
  } else {
    for (let index = 1; index < document.frames.length; index += 1) {
      if (!selectedSet.has(document.frames[index].id) || selectedSet.has(document.frames[index - 1].id)) continue;
      [document.frames[index], document.frames[index - 1]] = [document.frames[index - 1], document.frames[index]];
      changed = true;
    }
  }
  return changed;
}

export function setFramesDuration(document: PixelDocument, frameIds: readonly string[], durationMs: number) {
  const selectedIDs = orderedFrameIDs(document, frameIds);
  if (selectedIDs.length === 0) return false;
  const duration = normalizeFrameDuration(durationMs);
  let changed = false;
  for (const frameId of selectedIDs) {
    const frame = document.frames.find((candidate) => candidate.id === frameId);
    if (!frame || frame.durationMs === duration) continue;
    frame.durationMs = duration;
    changed = true;
  }
  return changed;
}

export function frameIDsInRange(document: PixelDocument, fromFrameId: string, toFrameId: string) {
  const from = document.frames.findIndex((frame) => frame.id === fromFrameId);
  const to = document.frames.findIndex((frame) => frame.id === toFrameId);
  if (from < 0 || to < 0) return [];
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  return document.frames.slice(start, end + 1).map((frame) => frame.id);
}

export function addFrameTag(
  document: PixelDocument,
  name: string,
  fromFrameId: string,
  toFrameId: string,
  direction: TagDirection = "forward",
  color = "#ef476f",
) {
  if (frameIDsInRange(document, fromFrameId, toFrameId).length === 0) return null;
  const normalizedName = name.trim() || nextTagName(document);
  const tag: FrameTag = {
    id: createID("tag"),
    name: normalizedName,
    fromFrameId,
    toFrameId,
    direction,
    color,
    repeat: 0,
  };
  document.tags.push(tag);
  return tag;
}

export function updateFrameTag(document: PixelDocument, tagId: string, update: Partial<Omit<FrameTag, "id">>) {
  const tag = document.tags.find((candidate) => candidate.id === tagId);
  if (!tag) return false;
  const next = {...tag, ...update};
  if (!next.name.trim() || frameIDsInRange(document, next.fromFrameId, next.toFrameId).length === 0) return false;
  if (!isTagDirection(next.direction)) return false;
  Object.assign(tag, next, {name: next.name.trim()});
  return true;
}

export function deleteFrameTag(document: PixelDocument, tagId: string) {
  const index = document.tags.findIndex((tag) => tag.id === tagId);
  if (index < 0) return false;
  document.tags.splice(index, 1);
  return true;
}

export function linkCels(document: PixelDocument, layerId: string, frameIds: readonly string[], sourceFrameId = document.activeFrameId) {
  const layer = getLayerByID(document, layerId);
  const source = getCel(document, layerId, sourceFrameId);
  const targets = [...new Set(frameIds)].map((frameId) => getCel(document, layerId, frameId)).filter((cel): cel is Cel => Boolean(cel));
  if (!layer || !isCelLayer(layer) || isLayerEffectivelyLocked(document, layer) || !source || targets.length < 2) return false;
  const linkId = source.linkId || createID("link");
  source.linkId = linkId;
  let changed = false;
  for (const cel of targets) {
    if (cel.linkId !== linkId || cel.pixels !== source.pixels
      || cel.tilemap !== source.tilemap || cel.terrainmap !== source.terrainmap) changed = true;
    cel.linkId = linkId;
    cel.x = source.x;
    cel.y = source.y;
    cel.width = source.width;
    cel.height = source.height;
    cel.pixels = source.pixels;
    cel.indexes = source.indexes;
    cel.tilemap = source.tilemap;
    cel.terrainmap = source.terrainmap;
  }
  return changed;
}

export function unlinkCels(document: PixelDocument, layerId: string, frameIds: readonly string[]) {
  const layer = getLayerByID(document, layerId);
  if (!layer || !isCelLayer(layer) || isLayerEffectivelyLocked(document, layer)) return false;
  let changed = false;
  for (const frameId of new Set(frameIds)) {
    const cel = getCel(document, layerId, frameId);
    if (!cel || !isCelLinked(document, cel)) continue;
    cel.linkId = createID("link");
    cel.pixels = cel.pixels.slice();
    cel.indexes = cel.indexes?.slice();
    cel.tilemap = cel.tilemap ? {...cel.tilemap, tiles: cel.tilemap.tiles.slice()} : undefined;
    cel.terrainmap = cel.terrainmap ? {...cel.terrainmap, terrains: cel.terrainmap.terrains.slice()} : undefined;
    changed = true;
  }
  return changed;
}

export function isCelLinked(document: PixelDocument, cel: Cel) {
  return Object.values(document.cels).some((candidate) => candidate.id !== cel.id && candidate.linkId === cel.linkId);
}

export function restoreLinkedCelBuffers(document: PixelDocument) {
  const buffers = new Map<string, Uint8ClampedArray>();
  const indexBuffers = new Map<string, Uint8Array>();
  const tileBuffers = new Map<string, Uint32Array>();
  const terrainBuffers = new Map<string, Uint16Array>();
  for (const cel of Object.values(document.cels)) {
    const existing = buffers.get(cel.linkId);
    if (existing) cel.pixels = existing;
    else buffers.set(cel.linkId, cel.pixels);
    if (cel.indexes) {
      const existingIndexes = indexBuffers.get(cel.linkId);
      if (existingIndexes) cel.indexes = existingIndexes;
      else indexBuffers.set(cel.linkId, cel.indexes);
    }
    if (cel.tilemap) {
      const existingTiles = tileBuffers.get(cel.linkId);
      if (existingTiles) cel.tilemap.tiles = existingTiles;
      else tileBuffers.set(cel.linkId, cel.tilemap.tiles);
    }
    if (cel.terrainmap) {
      const existingTerrains = terrainBuffers.get(cel.linkId);
      if (existingTerrains) cel.terrainmap.terrains = existingTerrains;
      else terrainBuffers.set(cel.linkId, cel.terrainmap.terrains);
    }
  }
}

export function moveLayer(document: PixelDocument, layerId: string, direction: "up" | "down") {
  const index = document.layers.findIndex((layer) => layer.id === layerId);
  if (index < 0) return false;
  const layer = document.layers[index];
  if (layer.role === "background") return false;
  const siblings = document.layers.filter((candidate) => candidate.parentId === layer.parentId);
  const siblingIndex = siblings.findIndex((candidate) => candidate.id === layerId);
  const targetSibling = siblings[siblingIndex + (direction === "up" ? 1 : -1)];
  if (!targetSibling || targetSibling.role === "background") return false;
  const target = document.layers.findIndex((candidate) => candidate.id === targetSibling.id);
  [document.layers[index], document.layers[target]] = [document.layers[target], document.layers[index]];
  return true;
}

export function renameLayer(document: PixelDocument, layerId: string, name: string) {
  const layer = getLayerByID(document, layerId);
  const normalized = name.trim();
  if (!layer || !normalized || layer.name === normalized) return false;
  layer.name = normalized;
  return true;
}

export function setLayerVisibility(document: PixelDocument, layerId: string, visible: boolean) {
  const layer = getLayerByID(document, layerId);
  if (!layer || layer.visible === visible) return false;
  layer.visible = visible;
  return true;
}

export function setLayerLocked(document: PixelDocument, layerId: string, locked: boolean) {
  const layer = getLayerByID(document, layerId);
  if (!layer || layer.locked === locked) return false;
  layer.locked = locked;
  return true;
}

/**
 * Keeps the structural and appearance invariants of a background layer in
 * one place. The layer array is ordered from bottom to top, so the background
 * must be inserted before the first other root layer.
 */
function enforceBackgroundLayerInvariants(document: PixelDocument, layer: Layer) {
  layer.parentId = undefined;
  layer.opacity = 1;
  layer.blendMode = "normal";
  layer.alphaLock = true;

  const currentIndex = document.layers.findIndex((candidate) => candidate.id === layer.id);
  if (currentIndex < 0) return;
  document.layers.splice(currentIndex, 1);
  const firstRootIndex = document.layers.findIndex((candidate) => candidate.parentId === undefined);
  document.layers.splice(firstRootIndex < 0 ? 0 : firstRootIndex, 0, layer);
}

export function setLayerRole(document: PixelDocument, layerId: string, role: LayerRole) {
  const layer = getLayerByID(document, layerId);
  if (!layer || layer.kind !== "image" || !isLayerRole(role) || layer.role === role) return false;
  if (role === "background" && document.layers.some((candidate) => candidate.id !== layerId && candidate.role === "background")) return false;
  layer.role = role;
  if (role === "background") {
    enforceBackgroundLayerInvariants(document, layer);
    const background = parseHexRGBA(document.palette.colors.find((_, index) => index !== document.palette.transparentIndex) ?? "#000000ff", [0, 0, 0, 255]);
    for (const frame of document.frames) {
      const cel = getCel(document, layer.id, frame.id);
      if (!cel) continue;
      // Baking per-Cel opacity must not modify another linked instance.
      cel.pixels = cel.pixels.slice();
      cel.linkId = createID("link");
      for (let offset = 0; offset < cel.pixels.length; offset += 4) {
        const alpha = cel.pixels[offset + 3] / 255 * cel.opacity;
        cel.pixels[offset] = Math.round(cel.pixels[offset] * alpha + background[0] * (1 - alpha));
        cel.pixels[offset + 1] = Math.round(cel.pixels[offset + 1] * alpha + background[1] * (1 - alpha));
        cel.pixels[offset + 2] = Math.round(cel.pixels[offset + 2] * alpha + background[2] * (1 - alpha));
        cel.pixels[offset + 3] = 255;
      }
      cel.opacity = 1;
      cel.zIndex = 0;
      cel.indexes = document.colorMode === "indexed" ? indexesForPixels(cel.pixels, document.palette.colors, document.palette.transparentIndex) : undefined;
    }
  }
  return true;
}

export function setLayerContinuous(document: PixelDocument, layerId: string, continuous: boolean) {
  const layer = getLayerByID(document, layerId);
  if (!layer || !isCelLayer(layer) || layer.continuous === continuous) return false;
  layer.continuous = continuous;
  return true;
}

export function setLayerAlphaLock(document: PixelDocument, layerId: string, alphaLock: boolean) {
  const layer = getLayerByID(document, layerId);
  if (!layer || !isImageLayer(layer)) return false;
  if (layer.role === "background") {
    enforceBackgroundLayerInvariants(document, layer);
    if (!alphaLock) return false;
  }
  if (layer.alphaLock === alphaLock) return false;
  layer.alphaLock = alphaLock;
  return true;
}

export function setLayerOpacity(document: PixelDocument, layerId: string, opacity: number) {
  const layer = getLayerByID(document, layerId);
  const normalized = Math.max(0, Math.min(1, opacity));
  if (!layer) return false;
  if (layer.role === "background") {
    enforceBackgroundLayerInvariants(document, layer);
    if (normalized !== 1) return false;
  }
  if (layer.opacity === normalized) return false;
  layer.opacity = normalized;
  return true;
}

export function setLayerBlendMode(document: PixelDocument, layerId: string, blendMode: BlendMode) {
  const layer = getLayerByID(document, layerId);
  if (!layer || !isBlendMode(blendMode)) return false;
  if (layer.role === "background") {
    enforceBackgroundLayerInvariants(document, layer);
    if (blendMode !== "normal") return false;
  }
  if (layerBlendMode(layer) === blendMode) return false;
  layer.blendMode = blendMode;
  return true;
}

export function reverseFrames(document: PixelDocument, frameIds: readonly string[]) {
  const selected = new Set(frameIds);
  const indexes = document.frames.map((frame, index) => selected.has(frame.id) ? index : -1).filter((index) => index >= 0);
  if (indexes.length < 2) return false;
  const reversed = indexes.map((index) => document.frames[index]).reverse();
  indexes.forEach((index, position) => { document.frames[index] = reversed[position]; });
  return true;
}

export function addSlice(document: PixelDocument, name: string, key: Omit<SliceKey, "frameId"> & {frameId?: string}) {
  const frameId = key.frameId ?? document.activeFrameId;
  if (!document.frames.some((frame) => frame.id === frameId)) return null;
  const nextKey = {...key, frameId};
  if (!validSliceKey(document, nextKey)) return null;
  const slice: Slice = {
    id: createID("slice"),
    name: name.trim() || `Slice ${document.slices.length + 1}`,
    color: "#ef476fff",
    keys: [cloneSliceKey(nextKey)],
  };
  document.slices.push(slice);
  return slice;
}

export function updateSlice(document: PixelDocument, sliceId: string, update: Partial<Omit<Slice, "id">>) {
  const slice = document.slices.find((candidate) => candidate.id === sliceId);
  if (!slice) return false;
  const next = {...slice, ...update};
  if (!next.name.trim() || !/^#[0-9a-f]{8}$/i.test(next.color) || next.keys.length === 0 || next.keys.some((key) => !validSliceKey(document, key))) return false;
  if (next.keys.some((key, index) => next.keys.some((other, otherIndex) => otherIndex !== index && other.frameId === key.frameId))) return false;
  Object.assign(slice, next, {name: next.name.trim()});
  return true;
}

/** Returns only the key authored for the requested frame; there is no fallback. */
export function getSliceKey(document: PixelDocument, sliceId: string, frameId: string): SliceKey | null {
  return document.slices.find((slice) => slice.id === sliceId)?.keys.find((key) => key.frameId === frameId) ?? null;
}

/** Adds a frame-local key, inheriting the nearest preceding key when available. */
export function addSliceKey(document: PixelDocument, sliceId: string, frameId = document.activeFrameId, key?: SliceKeyUpdate): SliceKey | null {
  const slice = document.slices.find((candidate) => candidate.id === sliceId);
  const frameIndex = document.frames.findIndex((frame) => frame.id === frameId);
  if (!slice || frameIndex < 0 || slice.keys.some((candidate) => candidate.frameId === frameId)) return null;
  const source = [...slice.keys]
    .map((candidate) => ({candidate, index: document.frames.findIndex((frame) => frame.id === candidate.frameId)}))
    .filter(({index}) => index >= 0)
    .sort((left, right) => {
      const leftBefore = left.index <= frameIndex;
      const rightBefore = right.index <= frameIndex;
      if (leftBefore !== rightBefore) return leftBefore ? -1 : 1;
      if (leftBefore) return right.index - left.index;
      return left.index - right.index;
    })[0]?.candidate;
  const next = {
    ...(source ? cloneSliceKey(source) : {x: 0, y: 0, width: document.width, height: document.height}),
    ...key,
    frameId,
  };
  if (!validSliceKey(document, next)) return null;
  slice.keys.push(cloneSliceKey(next));
  return slice.keys.at(-1)!;
}

/** Updates only the key authored for the requested frame; missing keys are not mutated. */
export function updateSliceKey(document: PixelDocument, sliceId: string, frameId: string, update: SliceKeyUpdate) {
  const key = getSliceKey(document, sliceId, frameId);
  if (!key) return false;
  const next = {...key, ...update, frameId};
  if (!validSliceKey(document, next) || sliceKeyEqual(key, next)) return false;
  Object.assign(key, cloneSliceKey(next));
  return true;
}

/** Removes a frame-local key while preserving the strict non-empty key invariant. */
export function deleteSliceKey(document: PixelDocument, sliceId: string, frameId: string) {
  const slice = document.slices.find((candidate) => candidate.id === sliceId);
  if (!slice || slice.keys.length <= 1) return false;
  const index = slice.keys.findIndex((key) => key.frameId === frameId);
  if (index < 0) return false;
  slice.keys.splice(index, 1);
  return true;
}

export function deleteSlice(document: PixelDocument, sliceId: string) {
  const index = document.slices.findIndex((slice) => slice.id === sliceId);
  if (index < 0) return false;
  document.slices.splice(index, 1);
  return true;
}

export function mergeLayerDown(document: PixelDocument, layerId = document.activeLayerId) {
  const topIndex = document.layers.findIndex((layer) => layer.id === layerId);
  if (topIndex < 0) return false;
  const topLayer = document.layers[topIndex];
  // The background is the bottom-most opaque surface and cannot be merged
  // into a layer below it.
  if (!isImageLayer(topLayer) || topLayer.role === "background") return false;
  const siblings = document.layers.filter((layer) => layer.parentId === topLayer.parentId);
  const siblingIndex = siblings.findIndex((layer) => layer.id === layerId);
  const bottomLayer = siblings[siblingIndex - 1];
  if (!bottomLayer || !isImageLayer(bottomLayer) || topLayer.locked || bottomLayer.locked) return false;
  for (const frame of document.frames) {
    const mergedPixels = new Uint8ClampedArray(document.width * document.height * 4);
    const bottomCel = getCel(document, bottomLayer.id, frame.id);
    const topCel = getCel(document, topLayer.id, frame.id);
    for (const layer of orderedFrameLayers(document, frame.id, topLayer.parentId)) {
      if (layer !== bottomLayer && layer !== topLayer) continue;
      const cel = layer === bottomLayer ? bottomCel : topCel;
      if (layer.visible && cel) compositeCel(mergedPixels, document.width, document.height, cel, layer.opacity, layerBlendMode(layer));
    }

    const mergedCel = bottomCel ?? createCel(bottomLayer.id, frame.id, document.width, document.height);
    mergedCel.linkId = createID("link");
    mergedCel.opacity = 1;
    mergedCel.zIndex = 0;
    mergedCel.x = 0;
    mergedCel.y = 0;
    mergedCel.width = document.width;
    mergedCel.height = document.height;
    mergedCel.pixels = mergedPixels;
    mergedCel.indexes = document.colorMode === "indexed"
      ? indexesForPixels(mergedPixels, document.palette.colors, document.palette.transparentIndex)
      : undefined;
    document.cels[celKey(bottomLayer.id, frame.id)] = mergedCel;
    delete document.cels[celKey(topLayer.id, frame.id)];
  }

  bottomLayer.visible = bottomLayer.visible || topLayer.visible;
  bottomLayer.opacity = 1;
  bottomLayer.blendMode = "normal";
  document.layers.splice(topIndex, 1);
  document.activeLayerId = bottomLayer.id;
  return true;
}

/** Bake the visible composite of every frame into one standard image layer. */
export function flattenVisibleLayers(document: PixelDocument, name = "Flattened") {
  const renderedFrames = document.frames.map((frame) => ({frame, pixels: compositeFrameForExport(document, frame.id)}));
  const referenceLayers = document.layers.filter((layer) => isImageLayer(layer) && layer.role === "reference");
  const referenceLayerIds = new Set(referenceLayers.map((layer) => layer.id));
  const referenceCels = Object.fromEntries(Object.entries(document.cels).filter(([, cel]) => referenceLayerIds.has(cel.layerId)));
  const layer: Layer = {
    id: createID("layer"),
    name: name.trim() || "Flattened",
    visible: true,
    locked: false,
    opacity: 1,
    kind: "image",
    blendMode: "normal",
    role: "standard",
    continuous: false,
    alphaLock: false,
  };
  document.layers = [layer, ...referenceLayers.map((reference) => ({...reference, parentId: undefined}))];
  document.cels = referenceCels;
  for (const {frame, pixels} of renderedFrames) {
    if (!hasVisiblePixel(pixels)) continue;
    const cel = createCel(layer.id, frame.id, document.width, document.height);
    cel.pixels = pixels;
    cel.indexes = document.colorMode === "indexed"
      ? indexesForPixels(pixels, document.palette.colors, document.palette.transparentIndex)
      : undefined;
    document.cels[celKey(layer.id, frame.id)] = cel;
  }
  document.activeLayerId = layer.id;
  return layer;
}

function hasVisiblePixel(pixels: Uint8ClampedArray) {
  for (let offset = 3; offset < pixels.length; offset += 4) if (pixels[offset] !== 0) return true;
  return false;
}

export function cropDocument(document: PixelDocument, x: number, y: number, width: number, height: number) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(width) || !Number.isInteger(height)) return false;
  if (width <= 0 || height <= 0 || x < 0 || y < 0 || x + width > document.width || y + height > document.height) return false;
  if (x === 0 && y === 0 && width === document.width && height === document.height) return false;

  const transformed = new Map<string, Uint8ClampedArray>();
  const transformedIndexes = new Map<string, Uint8Array>();
  const tilemapLayerIDs = new Set(document.layers.filter(isTilemapLayer).map((layer) => layer.id));
  for (const cel of Object.values(document.cels)) {
    if (tilemapLayerIDs.has(cel.layerId) && cel.tilemap) {
      cel.x -= x;
      cel.y -= y;
      continue;
    }
    let pixels = transformed.get(cel.linkId);
    if (!pixels) {
      pixels = new Uint8ClampedArray(width * height * 4);
      copyCelIntoCanvas(pixels, width, height, cel, -x, -y, x, y, width, height);
      transformed.set(cel.linkId, pixels);
    }
    let indexes: Uint8Array | undefined;
    if (cel.indexes) {
      indexes = transformedIndexes.get(cel.linkId);
      if (!indexes) {
        indexes = copyCelIndexes(cel, width, height, -x, -y, x, y, width, height, document.palette.transparentIndex);
        transformedIndexes.set(cel.linkId, indexes);
      }
    }
    cel.x = 0;
    cel.y = 0;
    cel.width = width;
    cel.height = height;
    cel.pixels = pixels;
    cel.indexes = indexes;
  }
  translateSlices(document, -x, -y, width, height);
  document.width = width;
  document.height = height;
  return true;
}

export function resizeDocument(
  document: PixelDocument,
  width: number,
  height: number,
  horizontal: "left" | "center" | "right" = "center",
  vertical: "top" | "center" | "bottom" = "center",
) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > 2048 || height > 2048) return false;
  if (width === document.width && height === document.height) return false;

  const offsetX = horizontal === "left" ? 0 : horizontal === "right" ? width - document.width : Math.floor((width - document.width) / 2);
  const offsetY = vertical === "top" ? 0 : vertical === "bottom" ? height - document.height : Math.floor((height - document.height) / 2);

  const transformed = new Map<string, Uint8ClampedArray>();
  const transformedIndexes = new Map<string, Uint8Array>();
  const tilemapLayerIDs = new Set(document.layers.filter(isTilemapLayer).map((layer) => layer.id));
  for (const cel of Object.values(document.cels)) {
    if (tilemapLayerIDs.has(cel.layerId) && cel.tilemap) {
      cel.x += offsetX;
      cel.y += offsetY;
      continue;
    }
    let pixels = transformed.get(cel.linkId);
    if (!pixels) {
      pixels = new Uint8ClampedArray(width * height * 4);
      copyCelIntoCanvas(pixels, width, height, cel, offsetX, offsetY, 0, 0, document.width, document.height);
      transformed.set(cel.linkId, pixels);
    }
    let indexes: Uint8Array | undefined;
    if (cel.indexes) {
      indexes = transformedIndexes.get(cel.linkId);
      if (!indexes) {
        indexes = copyCelIndexes(cel, width, height, offsetX, offsetY, 0, 0, document.width, document.height, document.palette.transparentIndex);
        transformedIndexes.set(cel.linkId, indexes);
      }
    }
    cel.x = 0;
    cel.y = 0;
    cel.width = width;
    cel.height = height;
    cel.pixels = pixels;
    cel.indexes = indexes;
  }
  translateSlices(document, offsetX, offsetY, width, height);
  document.width = width;
  document.height = height;
  return true;
}

function translateSlices(document: PixelDocument, offsetX: number, offsetY: number, width: number, height: number) {
  document.slices = document.slices.map((slice) => ({
    ...slice,
    keys: slice.keys
      .map((key) => translateSliceKey(key, offsetX, offsetY, width, height))
      .filter((key): key is SliceKey => Boolean(key)),
  })).filter((slice) => slice.keys.length > 0);
}

function translateSliceKey(key: SliceKey, offsetX: number, offsetY: number, width: number, height: number): SliceKey | null {
  const outer = {x: key.x + offsetX, y: key.y + offsetY, width: key.width, height: key.height};
  const clipped = intersectRect(outer, {x: 0, y: 0, width, height});
  if (!clipped) return null;
  const center = key.center
    ? intersectRect(
      {x: outer.x + key.center.x, y: outer.y + key.center.y, width: key.center.width, height: key.center.height},
      clipped,
    )
    : null;
  const pivot = key.pivot
    ? {x: outer.x + key.pivot.x - clipped.x, y: outer.y + key.pivot.y - clipped.y}
    : undefined;
  return {
    ...key,
    x: clipped.x,
    y: clipped.y,
    width: clipped.width,
    height: clipped.height,
    center: center
      ? {x: center.x - clipped.x, y: center.y - clipped.y, width: center.width, height: center.height}
      : undefined,
    pivot,
  };
}

function intersectRect(left: PixelBounds, right: PixelBounds): PixelBounds | null {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height);
  return rightEdge > x && bottomEdge > y
    ? {x, y, width: rightEdge - x, height: bottomEdge - y}
    : null;
}

export function cloneDocument(document: PixelDocument): PixelDocument {
  const linkedBuffers = new Map<string, Uint8ClampedArray>();
  const linkedIndexes = new Map<string, Uint8Array>();
  const linkedTilemaps = new Map<string, TilemapData>();
  const linkedTerrainmaps = new Map<string, TerrainMapData>();
  return {
    ...document,
    colorProfile: {
      ...document.colorProfile,
      data: document.colorProfile.data?.slice(),
    },
    pixelAspectRatio: {...document.pixelAspectRatio},
    palette: {...document.palette, colors: [...document.palette.colors]},
    tilesets: document.tilesets.map((tileset) => ({
      ...tileset,
      grid: {...tileset.grid},
      terrains: tileset.terrains.map((terrain) => ({
        ...terrain,
        rules: terrain.rules.map((rule) => ({
          ...rule,
          candidates: rule.candidates.map((candidate) => ({...candidate})),
        })),
      })),
      tiles: tileset.tiles.map((tile) => ({
        ...tile,
        pixels: tile.pixels.slice(),
        indexes: tile.indexes?.slice(),
      })),
    })),
    layers: document.layers.map((layer) => ({...layer})),
    frames: document.frames.map((frame) => ({...frame})),
    tags: document.tags.map((tag) => ({...tag})),
    slices: document.slices.map((slice) => ({
      ...slice,
      keys: slice.keys.map((key) => ({
        ...key,
        center: key.center ? {...key.center} : undefined,
        pivot: key.pivot ? {...key.pivot} : undefined,
      })),
    })),
    guides: document.guides.map((guide) => ({...guide})),
    settings: {...document.settings},
    cels: Object.fromEntries(Object.entries(document.cels).map(([key, cel]) => {
      let pixels = linkedBuffers.get(cel.linkId);
      if (!pixels) {
        pixels = cel.pixels.slice();
        linkedBuffers.set(cel.linkId, pixels);
      }
      let indexes: Uint8Array | undefined;
      if (cel.indexes) {
        indexes = linkedIndexes.get(cel.linkId);
        if (!indexes) {
          indexes = cel.indexes.slice();
          linkedIndexes.set(cel.linkId, indexes);
        }
      }
      let tilemap: TilemapData | undefined;
      if (cel.tilemap) {
        tilemap = linkedTilemaps.get(cel.linkId);
        if (!tilemap) {
          tilemap = {...cel.tilemap, tiles: cel.tilemap.tiles.slice()};
          linkedTilemaps.set(cel.linkId, tilemap);
        }
      }
      let terrainmap: TerrainMapData | undefined;
      if (cel.terrainmap) {
        terrainmap = linkedTerrainmaps.get(cel.linkId);
        if (!terrainmap) {
          terrainmap = {...cel.terrainmap, terrains: cel.terrainmap.terrains.slice()};
          linkedTerrainmaps.set(cel.linkId, terrainmap);
        }
      }
      return [key, {...cel, pixels, indexes, tilemap, terrainmap}];
    })),
  };
}

/**
 * Creates an editable duplicate of a document for a separate sprite tab.
 *
 * Unlike cloneDocument, which intentionally preserves IDs for history
 * snapshots, a duplicated sprite receives fresh IDs for every document
 * entity. Shared Cel buffers remain shared inside the duplicate, but never
 * alias the source document.
 */
export function duplicateDocument(document: PixelDocument, name = document.name): PixelDocument {
  const duplicate = cloneDocument(document);
  const paletteID = createID("palette");
  const tilesetIDs = new Map(duplicate.tilesets.map((tileset) => [tileset.id, createID("tileset")]));
  const layerIDs = new Map(duplicate.layers.map((layer) => [layer.id, createID("layer")]));
  const frameIDs = new Map(duplicate.frames.map((frame) => [frame.id, createID("frame")]));
  const tagIDs = new Map(duplicate.tags.map((tag) => [tag.id, createID("tag")]));
  const sliceIDs = new Map(duplicate.slices.map((slice) => [slice.id, createID("slice")]));
  const guideIDs = new Map(duplicate.guides.map((guide) => [guide.id, createID("guide")]));
  const linkIDs = new Map<string, string>();

  duplicate.name = name.trim() || document.name;
  duplicate.palette = {...duplicate.palette, id: paletteID};
  duplicate.tilesets = duplicate.tilesets.map((tileset) => ({
    ...tileset,
    id: tilesetIDs.get(tileset.id)!,
  }));
  duplicate.layers = duplicate.layers.map((layer) => ({
    ...layer,
    id: layerIDs.get(layer.id)!,
    parentId: layer.parentId ? layerIDs.get(layer.parentId) : undefined,
    tilesetId: layer.tilesetId ? tilesetIDs.get(layer.tilesetId) : undefined,
  }));
  duplicate.frames = duplicate.frames.map((frame) => ({...frame, id: frameIDs.get(frame.id)!}));
  duplicate.tags = duplicate.tags.map((tag) => ({
    ...tag,
    id: tagIDs.get(tag.id)!,
    fromFrameId: frameIDs.get(tag.fromFrameId)!,
    toFrameId: frameIDs.get(tag.toFrameId)!,
  }));
  duplicate.slices = duplicate.slices.map((slice) => ({
    ...slice,
    id: sliceIDs.get(slice.id)!,
    keys: slice.keys.map((key) => ({...key, frameId: frameIDs.get(key.frameId)!})),
  }));
  duplicate.guides = duplicate.guides.map((guide) => ({...guide, id: guideIDs.get(guide.id)!}));

  const cels = Object.values(duplicate.cels).map((cel) => {
    let linkId = linkIDs.get(cel.linkId);
    if (!linkId) {
      linkId = createID("link");
      linkIDs.set(cel.linkId, linkId);
    }
    return {
      ...cel,
      id: createID("cel"),
      linkId,
      layerId: layerIDs.get(cel.layerId)!,
      frameId: frameIDs.get(cel.frameId)!,
      tilemap: cel.tilemap ? {...cel.tilemap, tiles: cel.tilemap.tiles} : undefined,
    };
  });
  duplicate.cels = Object.fromEntries(cels.map((cel) => [celKey(cel.layerId, cel.frameId), cel]));
  duplicate.activeLayerId = layerIDs.get(document.activeLayerId)!;
  duplicate.activeFrameId = frameIDs.get(document.activeFrameId)!;
  return duplicate;
}

export function replaceDocument(target: PixelDocument, source: PixelDocument) {
  Object.assign(target, cloneDocument(source));
}

export function estimateDocumentBytes(document: PixelDocument) {
  const countedLinks = new Set<string>();
  const pixelBytes = Object.values(document.cels).reduce((total, cel) => {
    if (countedLinks.has(cel.linkId)) return total;
    countedLinks.add(cel.linkId);
    return total + cel.pixels.byteLength + (cel.indexes?.byteLength ?? 0)
      + (cel.tilemap?.tiles.byteLength ?? 0) + (cel.terrainmap?.terrains.byteLength ?? 0);
  }, 0);
  const tilesetBytes = document.tilesets.reduce((total, tileset) => total + tileset.tiles.reduce(
    (tileTotal, tile) => tileTotal + tile.pixels.byteLength + (tile.indexes?.byteLength ?? 0) + 48,
    tileset.name.length * 2 + tileset.terrains.reduce((terrainTotal, terrain) => terrainTotal
      + terrain.name.length * 2 + terrain.color.length * 2
      + terrain.rules.reduce((ruleTotal, rule) => ruleTotal + 24 + rule.candidates.length * 24, 0), 0) + 96,
  ), 0);
  const metadataBytes = document.name.length * 2
    + document.colorProfile.name.length * 2
    + (document.colorProfile.data?.byteLength ?? 0)
    + document.palette.colors.reduce((total, color) => total + color.length * 2, 0)
    + document.layers.reduce((total, layer) => total + layer.name.length * 2 + 96, 0)
    + document.frames.length * 32
    + document.tags.reduce((total, tag) => total + tag.name.length * 2 + 96, 0)
    + document.slices.reduce((total, slice) => total + slice.name.length * 2 + slice.keys.length * 96, 0)
    + document.guides.length * 32
    + Object.keys(document.cels).length * 128;
  return pixelBytes + tilesetBytes + metadataBytes;
}

export function celKey(layerId: string, frameId: string) {
  return `${layerId}:${frameId}`;
}

function orderedFrameIDs(document: PixelDocument, frameIds: readonly string[]) {
  const requested = new Set(frameIds);
  return document.frames.filter((frame) => requested.has(frame.id)).map((frame) => frame.id);
}

function normalizeFrameDuration(durationMs: number) {
  return Math.max(1, Math.round(Number.isFinite(durationMs) ? durationMs : 1));
}

/**
 * Copies the part of a Cel that is visible in a source canvas region into a
 * destination canvas. Cel coordinates are canvas coordinates plus their
 * local pixel coordinates; translation moves those canvas coordinates into
 * the destination canvas.
 */
function copyCelIntoCanvas(
  target: Uint8ClampedArray,
  targetWidth: number,
  targetHeight: number,
  cel: Cel,
  translateX: number,
  translateY: number,
  sourceClipX: number,
  sourceClipY: number,
  sourceClipWidth: number,
  sourceClipHeight: number,
) {
  const sourceLeft = Math.max(cel.x, sourceClipX, -translateX);
  const sourceTop = Math.max(cel.y, sourceClipY, -translateY);
  const sourceRight = Math.min(
    cel.x + cel.width,
    sourceClipX + sourceClipWidth,
    targetWidth - translateX,
  );
  const sourceBottom = Math.min(
    cel.y + cel.height,
    sourceClipY + sourceClipHeight,
    targetHeight - translateY,
  );
  const copyWidth = sourceRight - sourceLeft;
  const copyHeight = sourceBottom - sourceTop;
  if (copyWidth <= 0 || copyHeight <= 0) return;

  const sourceX = sourceLeft - cel.x;
  const sourceY = sourceTop - cel.y;
  const targetX = sourceLeft + translateX;
  const targetY = sourceTop + translateY;
  for (let row = 0; row < copyHeight; row += 1) {
    const sourceStart = ((sourceY + row) * cel.width + sourceX) * 4;
    const targetStart = ((targetY + row) * targetWidth + targetX) * 4;
    target.set(cel.pixels.subarray(sourceStart, sourceStart + copyWidth * 4), targetStart);
  }
}

function copyCelIndexes(
  cel: Cel,
  targetWidth: number,
  targetHeight: number,
  translateX: number,
  translateY: number,
  sourceClipX: number,
  sourceClipY: number,
  sourceClipWidth: number,
  sourceClipHeight: number,
  transparentIndex: number,
) {
  const output = new Uint8Array(targetWidth * targetHeight).fill(transparentIndex);
  if (!cel.indexes) return output;
  const sourceLeft = Math.max(cel.x, sourceClipX, -translateX);
  const sourceTop = Math.max(cel.y, sourceClipY, -translateY);
  const sourceRight = Math.min(cel.x + cel.width, sourceClipX + sourceClipWidth, targetWidth - translateX);
  const sourceBottom = Math.min(cel.y + cel.height, sourceClipY + sourceClipHeight, targetHeight - translateY);
  const copyWidth = sourceRight - sourceLeft;
  if (copyWidth <= 0 || sourceBottom <= sourceTop) return output;
  const sourceX = sourceLeft - cel.x;
  const sourceY = sourceTop - cel.y;
  const targetX = sourceLeft + translateX;
  const targetY = sourceTop + translateY;
  for (let row = 0; row < sourceBottom - sourceTop; row += 1) {
    const sourceStart = (sourceY + row) * cel.width + sourceX;
    const targetStart = (targetY + row) * targetWidth + targetX;
    output.set(cel.indexes.subarray(sourceStart, sourceStart + copyWidth), targetStart);
  }
  return output;
}

/**
 * Re-tiles the rendered Cel caches after a document-size operation. Tile ids
 * are intentionally regenerated because v5 treats the tile cells, not legacy
 * ids, as authoritative project content.
 */
export function rebuildTilemapData(document: PixelDocument) {
  const tilemapLayers = document.layers.filter((layer) => isTilemapLayer(layer) && layer.tilesetId);
  for (const tileset of document.tilesets) {
    const layers = tilemapLayers.filter((layer) => layer.tilesetId === tileset.id);
    if (layers.length === 0) continue;
    // Raster document transforms regenerate Tile IDs. Terrain rules and maps
    // reference those IDs and must not survive as stale authority.
    tileset.terrains = [];
    const tiles: Tile[] = [];
    const tileByBytes = new Map<string, number>();
    const linked = new Map<string, {tilemap: TilemapData; pixels: Uint8ClampedArray; indexes?: Uint8Array}>();
    for (const cel of Object.values(document.cels)) {
      if (!layers.some((layer) => layer.id === cel.layerId)) continue;
      const existing = linked.get(cel.linkId);
      if (existing) {
        cel.tilemap = existing.tilemap;
        cel.pixels = existing.pixels;
        cel.indexes = existing.indexes;
        continue;
      }
      const columns = Math.max(1, Math.ceil(cel.width / tileset.tileWidth));
      const rows = Math.max(1, Math.ceil(cel.height / tileset.tileHeight));
      const cells = new Uint32Array(columns * rows);
      for (let cellY = 0; cellY < rows; cellY += 1) {
        for (let cellX = 0; cellX < columns; cellX += 1) {
          const tilePixels = new Uint8ClampedArray(tileset.tileWidth * tileset.tileHeight * 4);
          const tileIndexes = cel.indexes
            ? new Uint8Array(tileset.tileWidth * tileset.tileHeight).fill(document.palette.transparentIndex)
            : undefined;
          let visible = false;
          for (let y = 0; y < tileset.tileHeight; y += 1) {
            const sourceY = cellY * tileset.tileHeight + y;
            if (sourceY >= cel.height) continue;
            for (let x = 0; x < tileset.tileWidth; x += 1) {
              const sourceX = cellX * tileset.tileWidth + x;
              if (sourceX >= cel.width) continue;
              const sourcePixel = sourceY * cel.width + sourceX;
              const targetPixel = y * tileset.tileWidth + x;
              tilePixels.set(cel.pixels.subarray(sourcePixel * 4, sourcePixel * 4 + 4), targetPixel * 4);
              if (tilePixels[targetPixel * 4 + 3] !== 0) visible = true;
              if (tileIndexes) tileIndexes[targetPixel] = cel.indexes![sourcePixel];
            }
          }
          if (!visible) continue;
          const key = `${bytesKey(tilePixels)}|${tileIndexes ? bytesKey(tileIndexes) : ""}`;
          let tileID = tileByBytes.get(key);
          if (!tileID) {
            tileID = tiles.length + 1;
            tileByBytes.set(key, tileID);
            tiles.push({id: tileID, pixels: tilePixels, indexes: tileIndexes});
          }
          cells[cellY * columns + cellX] = tileID;
        }
      }
      cel.tilemap = {columns, rows, tiles: cells};
      linked.set(cel.linkId, {tilemap: cel.tilemap, pixels: cel.pixels, indexes: cel.indexes});
    }
    tileset.tiles = tiles;
  }
}

function bytesKey(bytes: Uint8Array | Uint8ClampedArray) {
  let output = "";
  for (let index = 0; index < bytes.length; index += 1) output += String.fromCharCode(bytes[index]);
  return output;
}

function indexesForPixels(pixels: Uint8ClampedArray, palette: readonly string[], transparentIndex: number) {
  const parsedPalette = palette.map((value) => parseHexRGBA(value, [0, 0, 0, 0]));
  const indexes = new Uint8Array(pixels.length / 4);
  for (let pixel = 0; pixel < indexes.length; pixel += 1) {
    const offset = pixel * 4;
    if (pixels[offset + 3] === 0) {
      indexes[pixel] = transparentIndex;
      continue;
    }
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < parsedPalette.length; index += 1) {
      if (index === transparentIndex) continue;
      const color = parsedPalette[index];
      const red = color[0] - pixels[offset];
      const green = color[1] - pixels[offset + 1];
      const blue = color[2] - pixels[offset + 2];
      const alpha = color[3] - pixels[offset + 3];
      const distance = red * red * 0.3 + green * green * 0.59 + blue * blue * 0.11 + alpha * alpha;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    indexes[pixel] = bestIndex;
  }
  return indexes;
}

function parseHexRGBA(value: string, fallback: readonly [number, number, number, number]): [number, number, number, number] {
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
  if (!match) return [fallback[0], fallback[1], fallback[2], fallback[3]];
  return [
    Number.parseInt(match[1].slice(0, 2), 16),
    Number.parseInt(match[1].slice(2, 4), 16),
    Number.parseInt(match[1].slice(4, 6), 16),
    match[2] ? Number.parseInt(match[2], 16) : 255,
  ];
}

function compositeCel(
  output: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  cel: Cel,
  opacity: number,
  blendMode: BlendMode,
) {
  const layerOpacity = Math.max(0, Math.min(1, opacity * cel.opacity));
  if (layerOpacity <= 0) return;
  if (blendMode === "normal") {
    compositeNormalCel(output, canvasWidth, canvasHeight, cel, layerOpacity);
    return;
  }
  compositeBlendCel(output, canvasWidth, canvasHeight, cel, layerOpacity, blendMode);
}

function compositeNormalCel(
  output: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  cel: Cel,
  opacity: number,
) {
  const startX = Math.max(0, -cel.x);
  const endX = Math.min(cel.width, canvasWidth - cel.x);
  const startY = Math.max(0, -cel.y);
  const endY = Math.min(cel.height, canvasHeight - cel.y);
  const rowWidth = endX - startX;
  if (rowWidth <= 0 || endY <= startY) return;

  let sourceRowIndex = (startY * cel.width + startX) * 4;
  let targetRowIndex = ((cel.y + startY) * canvasWidth + cel.x + startX) * 4;
  const sourceRowStride = cel.width * 4;
  const targetRowStride = canvasWidth * 4;
  const rowEndOffset = rowWidth * 4;
  const opacityScale = opacity / 255;

  for (let row = startY; row < endY; row += 1) {
    let sourceIndex = sourceRowIndex;
    let targetIndex = targetRowIndex;
    const sourceEndIndex = sourceIndex + rowEndOffset;
    while (sourceIndex < sourceEndIndex) {
      blendNormalPixel(output, targetIndex, cel.pixels, sourceIndex, opacityScale);
      sourceIndex += 4;
      targetIndex += 4;
    }
    sourceRowIndex += sourceRowStride;
    targetRowIndex += targetRowStride;
  }
}

function compositeBlendCel(
  output: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  cel: Cel,
  opacity: number,
  blendMode: BlendMode,
) {
  for (let celY = 0; celY < cel.height; celY += 1) {
    const canvasY = cel.y + celY;
    if (canvasY < 0 || canvasY >= canvasHeight) continue;
    for (let celX = 0; celX < cel.width; celX += 1) {
      const canvasX = cel.x + celX;
      if (canvasX < 0 || canvasX >= canvasWidth) continue;
      const sourceIndex = (celY * cel.width + celX) * 4;
      const targetIndex = (canvasY * canvasWidth + canvasX) * 4;
      blendPixel(output, targetIndex, cel.pixels, sourceIndex, opacity, blendMode);
    }
  }
}

function compositeLayerChildren(
  document: PixelDocument,
  frameId: string,
  parentId: string | undefined,
  visiting: Set<string>,
  onionSkin?: {
    layerId: string;
    previousFrameIds: readonly string[];
    nextFrameIds: readonly string[];
    opacity: number;
    previousColor: readonly [number, number, number, number];
    nextColor: readonly [number, number, number, number];
  },
  region?: PixelBounds,
  includeReference = true,
) {
  const outputWidth = region?.width ?? document.width;
  const outputHeight = region?.height ?? document.height;
  const output = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  for (const layer of orderedFrameLayers(document, frameId, parentId)) {
    if (layer.parentId !== parentId || !layer.visible || layer.opacity <= 0 || (!includeReference && layer.role === "reference")) continue;
    if (layer.kind === "group") {
      if (visiting.has(layer.id)) continue;
      visiting.add(layer.id);
      const groupPixels = compositeLayerChildren(document, frameId, layer.id, visiting, onionSkin, region, includeReference);
      visiting.delete(layer.id);
      compositeBuffer(output, groupPixels, layer.opacity, layer.blendMode);
      continue;
    }
    if (onionSkin?.layerId === layer.id) {
      onionSkin.previousFrameIds.forEach((frameId, index) => {
        const cel = getCel(document, layer.id, frameId);
        if (cel) compositeTintedCel(
          output,
          outputWidth,
          outputHeight,
          translateCelToRegion(cel, region),
          layer.opacity * onionSkin.opacity * (1 - index / (onionSkin.previousFrameIds.length + 1)),
          onionSkin.previousColor,
        );
      });
      onionSkin.nextFrameIds.forEach((frameId, index) => {
        const cel = getCel(document, layer.id, frameId);
        if (cel) compositeTintedCel(
          output,
          outputWidth,
          outputHeight,
          translateCelToRegion(cel, region),
          layer.opacity * onionSkin.opacity * (1 - index / (onionSkin.nextFrameIds.length + 1)),
          onionSkin.nextColor,
        );
      });
    }
    const cel = getCel(document, layer.id, frameId);
    if (cel) compositeCel(output, outputWidth, outputHeight, translateCelToRegion(cel, region), layer.opacity, layer.blendMode);
  }
  return output;
}

function translateCelToRegion(cel: Cel, region: PixelBounds | undefined) {
  if (!region) return cel;
  return {...cel, x: cel.x - region.x, y: cel.y - region.y};
}

function clipPixelBounds(bounds: PixelBounds, canvasWidth: number, canvasHeight: number): PixelBounds | null {
  const left = Math.max(0, Math.floor(bounds.x));
  const top = Math.max(0, Math.floor(bounds.y));
  const right = Math.min(canvasWidth, Math.ceil(bounds.x + bounds.width));
  const bottom = Math.min(canvasHeight, Math.ceil(bounds.y + bounds.height));
  if (right <= left || bottom <= top) return null;
  return {x: left, y: top, width: right - left, height: bottom - top};
}

function compositeTintedCel(
  output: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  cel: Cel,
  opacity: number,
  tint: readonly [number, number, number, number],
) {
  const normalizedOpacity = Math.max(0, Math.min(1, opacity * cel.opacity));
  if (normalizedOpacity <= 0) return;
  const startX = Math.max(0, -cel.x);
  const endX = Math.min(cel.width, canvasWidth - cel.x);
  const startY = Math.max(0, -cel.y);
  const endY = Math.min(cel.height, canvasHeight - cel.y);

  for (let celY = startY; celY < endY; celY += 1) {
    for (let celX = startX; celX < endX; celX += 1) {
      const sourceIndex = (celY * cel.width + celX) * 4;
      const sourceAlpha = (cel.pixels[sourceIndex + 3] / 255) * normalizedOpacity * (tint[3] / 255);
      if (sourceAlpha <= 0) continue;
      const targetIndex = ((cel.y + celY) * canvasWidth + cel.x + celX) * 4;
      const targetAlpha = output[targetIndex + 3] / 255;
      const targetContribution = targetAlpha * (1 - sourceAlpha);
      const outputAlpha = sourceAlpha + targetContribution;
      output[targetIndex] = Math.round((tint[0] * sourceAlpha + output[targetIndex] * targetContribution) / outputAlpha);
      output[targetIndex + 1] = Math.round((tint[1] * sourceAlpha + output[targetIndex + 1] * targetContribution) / outputAlpha);
      output[targetIndex + 2] = Math.round((tint[2] * sourceAlpha + output[targetIndex + 2] * targetContribution) / outputAlpha);
      output[targetIndex + 3] = Math.round(outputAlpha * 255);
    }
  }
}

function compositeBuffer(target: Uint8ClampedArray, source: Uint8ClampedArray, opacity: number, blendMode: BlendMode) {
  if (blendMode === "normal") {
    compositeNormalBuffer(target, source, opacity);
    return;
  }
  for (let offset = 0; offset < target.length; offset += 4) {
    blendPixel(target, offset, source, offset, opacity, blendMode);
  }
}

function compositeNormalBuffer(target: Uint8ClampedArray, source: Uint8ClampedArray, opacity: number) {
  const opacityScale = opacity / 255;
  for (let offset = 0; offset < target.length; offset += 4) {
    blendNormalPixel(target, offset, source, offset, opacityScale);
  }
}

/**
 * Normal source-over uses a caller-precomputed alpha scale to keep division
 * out of the per-pixel hot path.
 */
function blendNormalPixel(
  target: Uint8ClampedArray,
  targetIndex: number,
  source: Uint8ClampedArray,
  sourceIndex: number,
  opacityScale: number,
) {
  const sourceAlpha = source[sourceIndex + 3] * opacityScale;
  if (sourceAlpha <= 0) return;
  if (sourceAlpha === 1) {
    target[targetIndex] = source[sourceIndex];
    target[targetIndex + 1] = source[sourceIndex + 1];
    target[targetIndex + 2] = source[sourceIndex + 2];
    target[targetIndex + 3] = 255;
    return;
  }
  const targetAlpha = target[targetIndex + 3] / 255;
  if (targetAlpha === 0) {
    target[targetIndex] = source[sourceIndex];
    target[targetIndex + 1] = source[sourceIndex + 1];
    target[targetIndex + 2] = source[sourceIndex + 2];
    target[targetIndex + 3] = Math.round(sourceAlpha * 255);
    return;
  }
  const targetContribution = targetAlpha * (1 - sourceAlpha);
  const outputAlpha = sourceAlpha + targetContribution;
  target[targetIndex] = Math.round(
    (source[sourceIndex] * sourceAlpha + target[targetIndex] * targetContribution) / outputAlpha,
  );
  target[targetIndex + 1] = Math.round(
    (source[sourceIndex + 1] * sourceAlpha + target[targetIndex + 1] * targetContribution) / outputAlpha,
  );
  target[targetIndex + 2] = Math.round(
    (source[sourceIndex + 2] * sourceAlpha + target[targetIndex + 2] * targetContribution) / outputAlpha,
  );
  target[targetIndex + 3] = Math.round(outputAlpha * 255);
}

function blendPixel(
  target: Uint8ClampedArray,
  targetIndex: number,
  source: Uint8ClampedArray,
  sourceIndex: number,
  opacity: number,
  blendMode: BlendMode,
) {
  const sourceAlpha = (source[sourceIndex + 3] / 255) * opacity;
  if (sourceAlpha <= 0) return;
  const targetAlpha = target[targetIndex + 3] / 255;
  const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
  const backdrop: [number, number, number] = [
    target[targetIndex] / 255,
    target[targetIndex + 1] / 255,
    target[targetIndex + 2] / 255,
  ];
  const sourceColor: [number, number, number] = [
    source[sourceIndex] / 255,
    source[sourceIndex + 1] / 255,
    source[sourceIndex + 2] / 255,
  ];
  const blendedColor = blendMode === "hue" || blendMode === "saturation" || blendMode === "color" || blendMode === "luminosity"
    ? blendNonSeparable(backdrop, sourceColor, blendMode)
    : null;

  for (let channel = 0; channel < 3; channel += 1) {
    const sourceValue = sourceColor[channel];
    const targetValue = backdrop[channel];
    const blended = blendedColor?.[channel] ?? blendChannel(targetValue, sourceValue, blendMode);
    target[targetIndex + channel] = Math.round(
      255 * (
        sourceValue * sourceAlpha * (1 - targetAlpha)
        + targetValue * targetAlpha * (1 - sourceAlpha)
        + blended * sourceAlpha * targetAlpha
      ) / outputAlpha,
    );
  }
  target[targetIndex + 3] = Math.round(outputAlpha * 255);
}

type BlendColor = [number, number, number];

function blendNonSeparable(backdrop: BlendColor, source: BlendColor, blendMode: "hue" | "saturation" | "color" | "luminosity"): BlendColor {
  switch (blendMode) {
    case "hue": return setLuminosity(setSaturation(source, saturation(backdrop)), luminosity(backdrop));
    case "saturation": return setLuminosity(setSaturation(backdrop, saturation(source)), luminosity(backdrop));
    case "color": return setLuminosity(source, luminosity(backdrop));
    case "luminosity": return setLuminosity(backdrop, luminosity(source));
  }
}

function luminosity(color: BlendColor) {
  return 0.3 * color[0] + 0.59 * color[1] + 0.11 * color[2];
}

function saturation(color: BlendColor) {
  return Math.max(...color) - Math.min(...color);
}

function setLuminosity(color: BlendColor, target: number): BlendColor {
  const delta = target - luminosity(color);
  return clipBlendColor([color[0] + delta, color[1] + delta, color[2] + delta]);
}

function clipBlendColor(color: BlendColor): BlendColor {
  const lightness = luminosity(color);
  const minimum = Math.min(...color);
  const maximum = Math.max(...color);
  let result: BlendColor = [...color];
  if (minimum < 0) result = result.map((component) => lightness + ((component - lightness) * lightness) / (lightness - minimum)) as BlendColor;
  if (maximum > 1) result = result.map((component) => lightness + ((component - lightness) * (1 - lightness)) / (maximum - lightness)) as BlendColor;
  return result.map((component) => Math.max(0, Math.min(1, component))) as BlendColor;
}

function setSaturation(color: BlendColor, target: number): BlendColor {
  const order = [0, 1, 2].sort((left, right) => color[left] - color[right]);
  const minimum = order[0];
  const middle = order[1];
  const maximum = order[2];
  const result: BlendColor = [0, 0, 0];
  if (color[maximum] > color[minimum]) {
    result[middle] = ((color[middle] - color[minimum]) * target) / (color[maximum] - color[minimum]);
    result[maximum] = target;
  }
  return result;
}

function blendChannel(backdrop: number, source: number, blendMode: BlendMode) {
  switch (blendMode) {
    case "darken": return Math.min(backdrop, source);
    case "multiply": return backdrop * source;
    case "color-burn": return source <= 0 ? 0 : 1 - Math.min(1, (1 - backdrop) / source);
    case "lighten": return Math.max(backdrop, source);
    case "screen": return backdrop + source - backdrop * source;
    case "color-dodge": return source >= 1 ? 1 : Math.min(1, backdrop / (1 - source));
    case "overlay": return backdrop <= 0.5
      ? 2 * backdrop * source
      : 1 - 2 * (1 - backdrop) * (1 - source);
    case "soft-light": return source <= 0.5
      ? backdrop - (1 - 2 * source) * backdrop * (1 - backdrop)
      : backdrop + (2 * source - 1) * ((backdrop <= 0.25 ? ((16 * backdrop - 12) * backdrop + 4) * backdrop : Math.sqrt(backdrop)) - backdrop);
    case "hard-light": return source <= 0.5
      ? 2 * backdrop * source
      : 1 - 2 * (1 - backdrop) * (1 - source);
    case "difference": return Math.abs(backdrop - source);
    case "exclusion": return backdrop + source - 2 * backdrop * source;
    case "addition": return Math.min(1, backdrop + source);
    case "subtract": return Math.max(0, backdrop - source);
    case "divide": return source <= 0 ? 1 : Math.min(1, backdrop / source);
    case "hue":
    case "saturation":
    case "color":
    case "luminosity":
    case "normal": return source;
  }
}

function isBlendMode(value: string): value is BlendMode {
  return ["normal", "darken", "multiply", "color-burn", "lighten", "screen", "color-dodge", "overlay", "soft-light", "hard-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity", "addition", "subtract", "divide"].includes(value);
}

function isLayerRole(value: string): value is LayerRole {
  return value === "standard" || value === "background" || value === "reference";
}

function validRect(value: {x: number; y: number; width: number; height: number}, width: number, height: number) {
  return Number.isInteger(value.x) && Number.isInteger(value.y) && Number.isInteger(value.width) && Number.isInteger(value.height)
    && value.width > 0 && value.height > 0 && value.x >= 0 && value.y >= 0 && value.x + value.width <= width && value.y + value.height <= height;
}

function validSliceKey(document: PixelDocument, key: SliceKey) {
  return document.frames.some((frame) => frame.id === key.frameId)
    && validRect(key, document.width, document.height)
    && (!key.center || validRect(key.center, key.width, key.height))
    && (!key.pivot || (Number.isInteger(key.pivot.x) && Number.isInteger(key.pivot.y)));
}

function cloneSliceKey(key: SliceKey): SliceKey {
  return {
    ...key,
    center: key.center ? {...key.center} : undefined,
    pivot: key.pivot ? {...key.pivot} : undefined,
  };
}

function sliceKeyEqual(left: SliceKey, right: SliceKey) {
  return left.frameId === right.frameId
    && left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height
    && left.center?.x === right.center?.x && left.center?.y === right.center?.y
    && left.center?.width === right.center?.width && left.center?.height === right.center?.height
    && left.pivot?.x === right.pivot?.x && left.pivot?.y === right.pivot?.y;
}

function isTagDirection(value: string): value is TagDirection {
  return value === "forward" || value === "reverse" || value === "pingpong";
}

function optionalByteArraysEqual(left?: Uint8Array, right?: Uint8Array) {
  if (!left || !right) return left === right;
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function assertDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("Document dimensions must be positive integers");
  }
  if (width > 16384 || height > 16384) {
    throw new Error("Document dimensions cannot exceed 16384 pixels");
  }
}

export function nextLayerName(document: PixelDocument, prefix = "Layer") {
  let number = document.layers.length + 1;
  const names = new Set(document.layers.map((layer) => layer.name));
  while (names.has(`${prefix} ${number}`)) number += 1;
  return `${prefix} ${number}`;
}

export function nextGroupName(document: PixelDocument, prefix = "Group") {
  let number = document.layers.filter((layer) => layer.kind === "group").length + 1;
  const names = new Set(document.layers.map((layer) => layer.name));
  while (names.has(`${prefix} ${number}`)) number += 1;
  return `${prefix} ${number}`;
}

export function nextTagName(document: PixelDocument, prefix = "Tag") {
  let number = document.tags.length + 1;
  const names = new Set(document.tags.map((tag) => tag.name));
  while (names.has(`${prefix} ${number}`)) number += 1;
  return `${prefix} ${number}`;
}

export function timelineLayerEntries(document: PixelDocument) {
  const output: Array<{layer: Layer; depth: number}> = [];
  const visited = new Set<string>();
  const append = (parentId: string | undefined, depth: number) => {
    const children = document.layers.filter((layer) => layer.parentId === parentId).reverse();
    for (const layer of children) {
      if (visited.has(layer.id)) continue;
      visited.add(layer.id);
      output.push({layer, depth});
      if (layer.kind === "group") append(layer.id, depth + 1);
    }
  };
  append(undefined, 0);
  return output;
}

export function nextCopyName(document: PixelDocument, sourceName: string, copyLabel = "copy") {
  const names = new Set(document.layers.map((layer) => layer.name));
  let candidate = `${sourceName} ${copyLabel}`;
  let number = 2;
  while (names.has(candidate)) candidate = `${sourceName} ${copyLabel} ${number++}`;
  return candidate;
}

function createID(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

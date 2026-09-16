import {
  addFrame,
  addFrameTag,
  addLayer,
  addTilemapLayer,
  addSlice,
  cloneDocument,
  compositeFrameRegion,
  deleteFrame,
  deleteFrameTag,
  deleteLayer,
  deleteSlice,
  duplicateFrame,
  ensureCel,
  getCel,
  getCelByID,
  getLayerByID,
  isImageLayer,
  isTilemapLayer,
  isLayerEffectivelyLocked,
  linkCels,
  reverseFrames,
  resizeDocument,
  setCelProperties,
  setFrameDuration,
  unlinkCels,
  updateFrameTag,
  updateSlice,
  type BlendMode,
  type ColorMode,
  type DocumentSettings,
  type FrameTag,
  type Layer,
  type PixelDocument,
  type Tile,
  type TilemapData,
  type Tileset,
} from "./document";
import {constrainColorToMode, parseHexColor, renderIndexedPixels, syncIndexedCel} from "./colorModes";
import {
  addTile,
  deleteTile,
  findTile,
  renderTilemapCelIntoCache,
  syncTileIndexes,
  tileFlipDiagonal,
  tileFlipX,
  tileFlipY,
  tileIndexMask,
  tileValueFlags,
  tileValueIndex,
  validateTilemapData,
  validateTileset,
} from "./tilemap";
import {
  DocumentStateCommand,
  PixelEditCommand,
  type HistoryCommand,
} from "./history";
import {applyPatch, createPatch, type PixelPatch} from "./pixels";

const MAX_OPERATIONS = 256;
const MAX_PIXEL_ENTRIES = 65_536;
const MAX_READ_PIXELS = 16_384;
const MAX_CANVAS_DIMENSION = 2_048;

const blendModes: readonly BlendMode[] = [
  "normal", "darken", "multiply", "color-burn", "lighten", "screen", "color-dodge",
  "overlay", "soft-light", "hard-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity", "addition", "subtract", "divide",
];
const operationTypes = [
  "set_pixels",
  "set_indexes",
  "set_cel_properties",
  "add_tileset",
  "update_tileset",
  "delete_tileset",
  "add_tile",
  "update_tile",
  "delete_tile",
  "set_tile_cells",
  "add_layer",
  "update_layer",
  "delete_layer",
  "add_frame",
  "delete_frame",
  "set_frame_duration",
  "set_palette",
  "rename_document",
  "resize_canvas",
  "update_settings",
  "add_tag",
  "update_tag",
  "delete_tag",
  "reverse_frames",
  "link_cels",
  "unlink_cels",
  "add_slice",
  "update_slice",
  "delete_slice",
  "add_guide",
  "update_guide",
  "delete_guide",
] as const;

export interface MCPDocumentSummary {
  formatVersion: 4;
  name: string;
  width: number;
  height: number;
  dimensions: {width: number; height: number};
  colorMode: ColorMode;
  colorProfile: {
    type: PixelDocument["colorProfile"]["type"];
    name: string;
    embeddedBytes: number;
  };
  pixelAspectRatio: PixelDocument["pixelAspectRatio"];
  palette: {id: string; name: string; colors: string[]; transparentIndex: number};
  tilesets: Array<{
    id: string;
    name: string;
    tileWidth: number;
    tileHeight: number;
    tileCount: number;
  }>;
  layers: Array<{
    id: string;
    name: string;
    visible: boolean;
    locked: boolean;
    opacity: number;
    kind: Layer["kind"];
    parentId?: string;
    blendMode: BlendMode;
    role: Layer["role"];
    continuous: boolean;
    alphaLock: boolean;
    tilesetId?: string;
  }>;
  frames: Array<{id: string; durationMs: number}>;
  tags: FrameTag[];
  cels: Array<{
    id: string;
    linkId: string;
    layerId: string;
    frameId: string;
    opacity: number;
    zIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
    indexed: boolean;
    tilemap?: {columns: number; rows: number};
  }>;
  slices: PixelDocument["slices"];
  guides: PixelDocument["guides"];
  settings: DocumentSettings;
  activeLayerId: string;
  activeFrameId: string;
}

export interface ReadMCPTilesetArgs {
  tilesetId: string;
  tileId?: number;
}

export interface ReadMCPTilemapArgs {
  layerId?: string;
  frameId?: string;
}

export interface MCPReadTile {
  id: number;
  pixels: string[];
  indexes?: number[];
}

export interface MCPReadTileset {
  id: string;
  name: string;
  tileWidth: number;
  tileHeight: number;
  tiles: MCPReadTile[];
}

export interface MCPReadTilemap {
  layerId: string;
  frameId: string;
  celId: string;
  tilesetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  columns: number;
  rows: number;
  /** Row-major tile values, including the X/Y/diagonal flip flags. */
  tiles: number[];
}

export interface ReadMCPPixelsArgs {
  layerId?: string;
  frameId?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface ReadMCPIndexesArgs {
  layerId?: string;
  frameId?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface MCPSetPixel {
  x: number;
  y: number;
  color: string;
}

export interface MCPSetPixelsOperation {
  type: "set_pixels";
  layerId?: string;
  frameId?: string;
  pixels: MCPSetPixel[];
}

export interface MCPSetIndexesOperation {
  type: "set_indexes";
  layerId?: string;
  frameId?: string;
  pixels: Array<{x: number; y: number; index: number}>;
}

export interface MCPSetCelPropertiesOperation {
  type: "set_cel_properties";
  layerId: string;
  frameId: string;
  opacity?: number;
  zIndex?: number;
}

export interface MCPAddTilesetOperation {
  type: "add_tileset";
  tilesetId?: string;
  name: string;
  tileWidth: number;
  tileHeight: number;
}

export interface MCPUpdateTilesetOperation {
  type: "update_tileset";
  tilesetId: string;
  name?: string;
}

export interface MCPDeleteTilesetOperation {
  type: "delete_tileset";
  tilesetId: string;
}

export interface MCPAddTileOperation {
  type: "add_tile";
  tilesetId: string;
  pixels: string[];
  indexes?: number[];
  tileId?: number;
}

export interface MCPUpdateTileOperation {
  type: "update_tile";
  tilesetId: string;
  tileId: number;
  pixels?: string[];
  indexes?: number[];
}

export interface MCPDeleteTileOperation {
  type: "delete_tile";
  tilesetId: string;
  tileId: number;
}

export interface MCPSetTileCellsOperation {
  type: "set_tile_cells";
  layerId?: string;
  frameId?: string;
  cells: Array<{x: number; y: number; value: number}>;
}

export interface MCPAddLayerOperation {
  type: "add_layer";
  name: string;
  parentId?: string;
  kind?: "image" | "group" | "tilemap";
  tilesetId?: string;
  role?: Layer["role"];
  continuous?: boolean;
  alphaLock?: boolean;
  opacity?: number;
  blendMode?: BlendMode;
}

export interface MCPUpdateLayerOperation {
  type: "update_layer";
  layerId: string;
  name?: string;
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
  blendMode?: BlendMode;
  role?: Layer["role"];
  continuous?: boolean;
  alphaLock?: boolean;
}

export interface MCPDeleteLayerOperation {
  type: "delete_layer";
  layerId: string;
}

export interface MCPAddFrameOperation {
  type: "add_frame";
  duplicateFromId?: string;
  durationMs?: number;
}

export interface MCPDeleteFrameOperation {
  type: "delete_frame";
  frameId: string;
}

export interface MCPSetFrameDurationOperation {
  type: "set_frame_duration";
  frameId: string;
  durationMs: number;
}

export interface MCPSetPaletteOperation {
  type: "set_palette";
  colors: string[];
  name?: string;
  transparentIndex?: number;
}

export interface MCPRenameDocumentOperation {
  type: "rename_document";
  name: string;
}

export interface MCPResizeCanvasOperation {
  type: "resize_canvas";
  width: number;
  height: number;
  anchorX: 0 | 0.5 | 1;
  anchorY: 0 | 0.5 | 1;
}

export interface MCPUpdateSettingsOperation {
  type: "update_settings";
  [key: string]: unknown;
}

export interface MCPAddTagOperation {
  type: "add_tag";
  name: string;
  fromFrameId: string;
  toFrameId: string;
  direction?: FrameTag["direction"];
  color?: string;
  repeat?: number;
}

export interface MCPUpdateTagOperation {
  type: "update_tag";
  tagId: string;
  name?: string;
  fromFrameId?: string;
  toFrameId?: string;
  direction?: FrameTag["direction"];
  color?: string;
  repeat?: number;
}

export interface MCPDeleteTagOperation { type: "delete_tag"; tagId: string; }
export interface MCPReverseFramesOperation { type: "reverse_frames"; frameIds: string[]; }
export interface MCPLinkCelsOperation { type: "link_cels"; layerId: string; frameIds: string[]; sourceFrameId?: string; }
export interface MCPUnlinkCelsOperation { type: "unlink_cels"; layerId: string; frameIds: string[]; }

export interface MCPAddSliceOperation {
  type: "add_slice";
  name: string;
  color?: string;
  frameId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  center?: {x: number; y: number; width: number; height: number};
  pivot?: {x: number; y: number};
}

export interface MCPUpdateSliceOperation {
  type: "update_slice";
  sliceId: string;
  name?: string;
  color?: string;
  keys?: PixelDocument["slices"][number]["keys"];
}

export interface MCPDeleteSliceOperation { type: "delete_slice"; sliceId: string; }
export interface MCPAddGuideOperation { type: "add_guide"; axis: "horizontal" | "vertical"; position: number; }
export interface MCPUpdateGuideOperation { type: "update_guide"; guideId: string; axis?: "horizontal" | "vertical"; position?: number; }
export interface MCPDeleteGuideOperation { type: "delete_guide"; guideId: string; }

export type MCPEditOperation =
  | MCPSetPixelsOperation
  | MCPSetIndexesOperation
  | MCPSetCelPropertiesOperation
  | MCPAddTilesetOperation
  | MCPUpdateTilesetOperation
  | MCPDeleteTilesetOperation
  | MCPAddTileOperation
  | MCPUpdateTileOperation
  | MCPDeleteTileOperation
  | MCPSetTileCellsOperation
  | MCPAddLayerOperation
  | MCPUpdateLayerOperation
  | MCPDeleteLayerOperation
  | MCPAddFrameOperation
  | MCPDeleteFrameOperation
  | MCPSetFrameDurationOperation
  | MCPSetPaletteOperation
  | MCPRenameDocumentOperation
  | MCPResizeCanvasOperation
  | MCPUpdateSettingsOperation
  | MCPAddTagOperation
  | MCPUpdateTagOperation
  | MCPDeleteTagOperation
  | MCPReverseFramesOperation
  | MCPLinkCelsOperation
  | MCPUnlinkCelsOperation
  | MCPAddSliceOperation
  | MCPUpdateSliceOperation
  | MCPDeleteSliceOperation
  | MCPAddGuideOperation
  | MCPUpdateGuideOperation
  | MCPDeleteGuideOperation;

type ValidatedOperation =
  | (MCPSetPixelsOperation & {pixels: MCPSetPixel[]})
  | MCPSetIndexesOperation
  | MCPSetCelPropertiesOperation
  | MCPAddTilesetOperation
  | MCPUpdateTilesetOperation
  | MCPDeleteTilesetOperation
  | MCPAddTileOperation
  | MCPUpdateTileOperation
  | MCPDeleteTileOperation
  | MCPSetTileCellsOperation
  | MCPAddLayerOperation
  | MCPUpdateLayerOperation
  | MCPDeleteLayerOperation
  | MCPAddFrameOperation
  | MCPDeleteFrameOperation
  | MCPSetFrameDurationOperation
  | MCPSetPaletteOperation
  | MCPRenameDocumentOperation
  | MCPResizeCanvasOperation
  | MCPUpdateSettingsOperation
  | MCPAddTagOperation
  | MCPUpdateTagOperation
  | MCPDeleteTagOperation
  | MCPReverseFramesOperation
  | MCPLinkCelsOperation
  | MCPUnlinkCelsOperation
  | MCPAddSliceOperation
  | MCPUpdateSliceOperation
  | MCPDeleteSliceOperation
  | MCPAddGuideOperation
  | MCPUpdateGuideOperation
  | MCPDeleteGuideOperation;

interface MCPPixelPatch {
  celId: string;
  patch: PixelPatch;
  indexBefore?: Uint8Array;
  indexAfter?: Uint8Array;
}

/**
 * A single history entry for a pixel-only MCP batch that touches more than
 * one linked buffer. The normal one-buffer case uses PixelEditCommand.
 */
class MCPPixelBatchCommand implements HistoryCommand<PixelDocument> {
  readonly byteSize: number;

  constructor(
    readonly patches: readonly MCPPixelPatch[],
    readonly label: string,
  ) {
    this.byteSize = patches.reduce(
      (total, entry) => total + entry.patch.before.byteLength + entry.patch.after.byteLength
        + (entry.indexBefore ? entry.indexBefore.byteLength + entry.indexAfter!.byteLength : 0) + 64,
      0,
    );
  }

  undo(document: PixelDocument) {
    this.apply(document, "before");
  }

  redo(document: PixelDocument) {
    this.apply(document, "after");
  }

  private apply(document: PixelDocument, direction: "before" | "after") {
    for (const entry of this.patches) {
      const cel = getCelByID(document, entry.celId);
      if (!cel) throw new Error(`Cannot apply history command: cel ${entry.celId} does not exist`);
      applyPatch(cel.pixels, cel.width, entry.patch, direction);
      if (entry.indexBefore && entry.indexAfter && cel.indexes) {
        cel.indexes.set(direction === "before" ? entry.indexBefore : entry.indexAfter);
      }
    }
  }
}

export function summarizeMCPDocument(document: PixelDocument): MCPDocumentSummary {
  return {
    formatVersion: document.formatVersion,
    name: document.name,
    width: document.width,
    height: document.height,
    dimensions: {width: document.width, height: document.height},
    colorMode: document.colorMode,
    colorProfile: {
      type: document.colorProfile.type,
      name: document.colorProfile.name,
      embeddedBytes: document.colorProfile.data?.byteLength ?? 0,
    },
    pixelAspectRatio: {...document.pixelAspectRatio},
    palette: {
      id: document.palette.id,
      name: document.palette.name,
      colors: [...document.palette.colors],
      transparentIndex: document.palette.transparentIndex,
    },
    tilesets: document.tilesets.map((tileset) => ({
      id: tileset.id,
      name: tileset.name,
      tileWidth: tileset.tileWidth,
      tileHeight: tileset.tileHeight,
      tileCount: tileset.tiles.length,
    })),
    layers: document.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      locked: layer.locked,
      opacity: layer.opacity,
      kind: layer.kind,
      ...(layer.parentId ? {parentId: layer.parentId} : {}),
      blendMode: layer.blendMode,
      role: layer.role,
      continuous: layer.continuous,
      alphaLock: layer.alphaLock,
      ...(layer.tilesetId ? {tilesetId: layer.tilesetId} : {}),
    })),
    frames: document.frames.map((frame) => ({id: frame.id, durationMs: frame.durationMs})),
    tags: document.tags.map((tag) => ({...tag})),
    cels: Object.values(document.cels).map((cel) => ({
      id: cel.id,
      linkId: cel.linkId,
      layerId: cel.layerId,
      frameId: cel.frameId,
      opacity: cel.opacity,
      zIndex: cel.zIndex,
      x: cel.x,
      y: cel.y,
      width: cel.width,
      height: cel.height,
      indexed: Boolean(cel.indexes),
      ...(cel.tilemap ? {tilemap: {columns: cel.tilemap.columns, rows: cel.tilemap.rows}} : {}),
    })),
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
    activeLayerId: document.activeLayerId,
    activeFrameId: document.activeFrameId,
  };
}

export function readMCPPixels(document: PixelDocument, args: ReadMCPPixelsArgs = {}): string[] {
  const readArgs = validateReadArgs(args);
  const frameId = readArgs.frameId ?? document.activeFrameId;
  if (!document.frames.some((frame) => frame.id === frameId)) {
    throw new Error(`MCP read frame ${frameId} does not exist`);
  }

  const region = normalizeReadRegion(document, readArgs);
  let pixels: Uint8ClampedArray;
  if (readArgs.layerId) {
    const layer = getLayerByID(document, readArgs.layerId);
    if (!layer) throw new Error(`MCP read layer ${readArgs.layerId} does not exist`);
    if (!isImageLayer(layer)) throw new Error(`MCP read layer ${readArgs.layerId} is not an image layer`);
    pixels = readLayerRegion(document, layer.id, frameId, region);
  } else {
    pixels = compositeFrameRegion(document, region, frameId);
  }

  const result: string[] = [];
  for (let offset = 0; offset < pixels.length; offset += 4) {
    result.push(rgbaHex(pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]));
  }
  return result;
}

export function readMCPIndexes(document: PixelDocument, args: ReadMCPIndexesArgs = {}): number[] {
  if (document.colorMode !== "indexed") throw new Error("MCP index reads require an indexed document");
  const readArgs = validateReadArgs(args);
  const frameId = readArgs.frameId ?? document.activeFrameId;
  const layerId = readArgs.layerId ?? document.activeLayerId;
  const layer = getLayerByID(document, layerId);
  if (!layer) throw new Error(`MCP read layer ${layerId} does not exist`);
  if (!isImageLayer(layer)) throw new Error(`MCP read layer ${layerId} is not an image layer`);
  if (!document.frames.some((frame) => frame.id === frameId)) throw new Error(`MCP read frame ${frameId} does not exist`);
  const region = normalizeReadRegion(document, readArgs);
  const output = new Array<number>(region.width * region.height).fill(document.palette.transparentIndex);
  const cel = getCel(document, layerId, frameId);
  if (!cel?.indexes) return output;
  const startX = Math.max(region.x, cel.x);
  const startY = Math.max(region.y, cel.y);
  const endX = Math.min(region.x + region.width, cel.x + cel.width);
  const endY = Math.min(region.y + region.height, cel.y + cel.height);
  for (let y = startY; y < endY; y += 1) for (let x = startX; x < endX; x += 1) {
    output[(y - region.y) * region.width + x - region.x] = cel.indexes[(y - cel.y) * cel.width + x - cel.x];
  }
  return output;
}

/**
 * Reads authoritative tile data without exposing the mutable document
 * buffers. Tile pixels are returned as row-major RGBA hex values, matching
 * the pixel read API's representation.
 */
export function readMCPTileset(document: PixelDocument, args: ReadMCPTilesetArgs): MCPReadTileset {
  if (typeof args?.tilesetId !== "string" || !args.tilesetId) {
    throw new Error("MCP tileset reads require a tilesetId");
  }
  const tileset = document.tilesets.find((candidate) => candidate.id === args.tilesetId);
  if (!tileset) throw new Error(`MCP read tileset ${args.tilesetId} does not exist`);
  if (args.tileId !== undefined && (!Number.isSafeInteger(args.tileId) || args.tileId <= 0)) {
    throw new Error("MCP tileId must be a positive integer");
  }
  const tiles = args.tileId === undefined
    ? tileset.tiles
    : tileset.tiles.filter((tile) => tile.id === args.tileId);
  if (args.tileId !== undefined && tiles.length === 0) {
    throw new Error(`MCP read tile ${args.tileId} does not exist in tileset ${args.tilesetId}`);
  }
  return {
    id: tileset.id,
    name: tileset.name,
    tileWidth: tileset.tileWidth,
    tileHeight: tileset.tileHeight,
    tiles: tiles.map((tile) => ({
      id: tile.id,
      pixels: rgbaBufferToHex(tile.pixels),
      ...(tile.indexes ? {indexes: Array.from(tile.indexes)} : {}),
    })),
  };
}

/** Reads the authoritative row-major tile values for one Tilemap Cel. */
export function readMCPTilemap(document: PixelDocument, args: ReadMCPTilemapArgs = {}): MCPReadTilemap {
  const layerId = args.layerId ?? document.activeLayerId;
  const frameId = args.frameId ?? document.activeFrameId;
  const layer = getLayerByID(document, layerId);
  if (!layer) throw new Error(`MCP read tilemap layer ${layerId} does not exist`);
  if (!isTilemapLayer(layer) || !layer.tilesetId) throw new Error(`MCP read layer ${layerId} is not a tilemap layer`);
  if (!document.frames.some((frame) => frame.id === frameId)) throw new Error(`MCP read frame ${frameId} does not exist`);
  const cel = getCel(document, layerId, frameId);
  if (!cel?.tilemap) throw new Error(`MCP tilemap Cel for ${layerId} and ${frameId} does not exist`);
  validateTilemapData(cel.tilemap);
  const tileset = document.tilesets.find((candidate) => candidate.id === layer.tilesetId);
  if (!tileset) throw new Error(`MCP tilemap tileset ${layer.tilesetId} does not exist`);
  return {
    layerId,
    frameId,
    celId: cel.id,
    tilesetId: tileset.id,
    x: cel.x,
    y: cel.y,
    width: cel.width,
    height: cel.height,
    columns: cel.tilemap.columns,
    rows: cel.tilemap.rows,
    tiles: Array.from(cel.tilemap.tiles, (value) => value >>> 0),
  };
}

export function applyMCPEdits(
  document: PixelDocument,
  operations: unknown[],
): HistoryCommand<PixelDocument> | null {
  if (!Array.isArray(operations)) throw new Error("MCP edits must be an array");
  if (operations.length > MAX_OPERATIONS) {
    throw new Error(`MCP edit batches cannot contain more than ${MAX_OPERATIONS} operations`);
  }

  const validated = operations.map((operation, index) => validateOperation(operation, index));
  const pixelEntryCount = validated.reduce(
    (total, operation) => total + ((operation.type === "set_pixels" || operation.type === "set_indexes") ? operation.pixels.length : 0),
    0,
  );
  if (pixelEntryCount > MAX_PIXEL_ENTRIES) {
    throw new Error(`MCP edit batches cannot contain more than ${MAX_PIXEL_ENTRIES} pixel entries`);
  }
  if (validated.length === 0) return null;

  const before = cloneDocument(document);
  const working = cloneDocument(document);
  let changed = false;
  let pixelOnly = true;
  for (const operation of validated) {
    if (operation.type !== "set_pixels" && operation.type !== "set_indexes") pixelOnly = false;
    changed = applyOperation(working, operation) || changed;
  }
  if (!changed) return null;

  const command = pixelOnly && samePixelHistoryStructure(before, working)
    ? createPixelHistoryCommand(before, working)
    : new DocumentStateCommand(before, working, "MCP document edits");
  if (!command) return null;
  // The command owns defensive snapshots or bounded pixel patches, so the
  // staged state can become the caller's document without another deep clone.
  Object.assign(document, working);
  return command;
}

function applyOperation(document: PixelDocument, operation: ValidatedOperation) {
  switch (operation.type) {
    case "set_pixels":
      return applySetPixels(document, operation);
    case "set_indexes":
      return applySetIndexes(document, operation);
    case "set_cel_properties":
      return setCelProperties(document, operation.layerId, operation.frameId, {
        ...(operation.opacity !== undefined ? {opacity: operation.opacity} : {}),
        ...(operation.zIndex !== undefined ? {zIndex: operation.zIndex} : {}),
      });
    case "add_tileset":
      return applyAddTileset(document, operation);
    case "update_tileset":
      return applyUpdateTileset(document, operation);
    case "delete_tileset":
      return applyDeleteTileset(document, operation);
    case "add_tile":
      return applyAddTile(document, operation);
    case "update_tile":
      return applyUpdateTile(document, operation);
    case "delete_tile":
      return applyDeleteTile(document, operation);
    case "set_tile_cells":
      return applySetTileCells(document, operation);
    case "add_layer":
      addMcpLayer(document, operation);
      return true;
    case "update_layer":
      return applyUpdateLayer(document, operation);
    case "delete_layer":
      if (!getLayerByID(document, operation.layerId)) {
        throw new Error(`MCP delete layer ${operation.layerId} does not exist`);
      }
      if (!deleteLayer(document, operation.layerId)) {
        throw new Error(`MCP cannot delete layer ${operation.layerId}`);
      }
      return true;
    case "add_frame": {
      let frame;
      if (operation.duplicateFromId !== undefined) {
        if (!document.frames.some((candidate) => candidate.id === operation.duplicateFromId)) {
          throw new Error(`MCP duplicate frame ${operation.duplicateFromId} does not exist`);
        }
        frame = duplicateFrame(document, operation.duplicateFromId);
      } else {
        frame = addFrame(document, operation.durationMs ?? 100);
      }
      if (!frame) throw new Error("MCP could not add frame");
      if (operation.durationMs !== undefined) frame.durationMs = operation.durationMs;
      return true;
    }
    case "delete_frame":
      if (!document.frames.some((frame) => frame.id === operation.frameId)) {
        throw new Error(`MCP delete frame ${operation.frameId} does not exist`);
      }
      if (!deleteFrame(document, operation.frameId)) {
        throw new Error(`MCP cannot delete frame ${operation.frameId}`);
      }
      return true;
    case "set_frame_duration": {
      const frame = document.frames.find((candidate) => candidate.id === operation.frameId);
      if (!frame) throw new Error(`MCP frame ${operation.frameId} does not exist`);
      return setFrameDuration(document, operation.frameId, operation.durationMs);
    }
    case "set_palette": {
      const sameColors = arraysEqual(document.palette.colors, operation.colors);
      const sameName = operation.name === undefined || document.palette.name === operation.name;
      const sameTransparent = operation.transparentIndex === undefined || document.palette.transparentIndex === operation.transparentIndex;
      if (sameColors && sameName && sameTransparent) return false;
      document.palette.colors = [...operation.colors];
      if (operation.name !== undefined) document.palette.name = operation.name;
      if (operation.transparentIndex !== undefined) document.palette.transparentIndex = operation.transparentIndex;
      if (document.colorMode === "indexed") {
        for (const cel of Object.values(document.cels)) {
          if (cel.indexes) {
            // Keep indexed Cel payloads authoritative after palette edits.
            syncIndexedCel(document, cel);
          }
        }
      }
      return true;
    }
    case "rename_document":
      if (document.name === operation.name) return false;
      document.name = operation.name;
      return true;
    case "resize_canvas": {
      const horizontal = operation.anchorX === 0 ? "left" : operation.anchorX === 1 ? "right" : "center";
      const vertical = operation.anchorY === 0 ? "top" : operation.anchorY === 1 ? "bottom" : "center";
      return resizeDocument(document, operation.width, operation.height, horizontal, vertical);
    }
    case "update_settings":
      return applyUpdateSettings(document, operation);
    case "add_tag": {
      const tag = addFrameTag(document, operation.name, operation.fromFrameId, operation.toFrameId, operation.direction, operation.color);
      if (!tag) throw new Error("MCP add_tag frame range is invalid");
      if (operation.repeat !== undefined) tag.repeat = operation.repeat;
      return true;
    }
    case "update_tag": {
      const changed = updateFrameTag(document, operation.tagId, {
        ...(operation.name !== undefined ? {name: operation.name} : {}),
        ...(operation.fromFrameId !== undefined ? {fromFrameId: operation.fromFrameId} : {}),
        ...(operation.toFrameId !== undefined ? {toFrameId: operation.toFrameId} : {}),
        ...(operation.direction !== undefined ? {direction: operation.direction} : {}),
        ...(operation.color !== undefined ? {color: operation.color} : {}),
        ...(operation.repeat !== undefined ? {repeat: operation.repeat} : {}),
      });
      if (!changed) throw new Error(`MCP update_tag ${operation.tagId} is invalid or unchanged`);
      return true;
    }
    case "delete_tag":
      return deleteFrameTag(document, operation.tagId);
    case "reverse_frames":
      return reverseFrames(document, operation.frameIds);
    case "link_cels": {
      const source = operation.sourceFrameId ?? document.activeFrameId;
      if (!document.frames.some((frame) => frame.id === source) || operation.frameIds.some((frameId) => !document.frames.some((frame) => frame.id === frameId))) {
        throw new Error("MCP link_cels references an unknown frame");
      }
      if (!ensureCel(document, operation.layerId, source) || operation.frameIds.some((frameId) => !ensureCel(document, operation.layerId, frameId))) {
        throw new Error("MCP link_cels targets are invalid or cannot be materialized");
      }
      if (!linkCels(document, operation.layerId, operation.frameIds, source)) {
        throw new Error("MCP link_cels targets are invalid or locked");
      }
      return true;
    }
    case "unlink_cels":
      return unlinkCels(document, operation.layerId, operation.frameIds);
    case "add_slice": {
      const key = {
        frameId: operation.frameId ?? document.activeFrameId,
        x: operation.x, y: operation.y, width: operation.width, height: operation.height,
        center: operation.center, pivot: operation.pivot,
      };
      if (!validMcpSliceKey(document, key)) throw new Error("MCP add_slice key is outside the document");
      const slice = addSlice(document, operation.name, {
        frameId: operation.frameId,
        x: operation.x,
        y: operation.y,
        width: operation.width,
        height: operation.height,
        center: operation.center,
        pivot: operation.pivot,
      });
      if (!slice) throw new Error("MCP add_slice rectangle is invalid");
      if (operation.color !== undefined) slice.color = operation.color;
      return true;
    }
    case "update_slice": {
      if (operation.keys !== undefined && operation.keys.some((key) => !validMcpSliceKey(document, key))) {
        throw new Error(`MCP update_slice ${operation.sliceId} has a key outside the document`);
      }
      const changed = updateSlice(document, operation.sliceId, {
        ...(operation.name !== undefined ? {name: operation.name} : {}),
        ...(operation.color !== undefined ? {color: operation.color} : {}),
        ...(operation.keys !== undefined ? {keys: operation.keys} : {}),
      });
      if (!changed) throw new Error(`MCP update_slice ${operation.sliceId} is invalid or unchanged`);
      return true;
    }
    case "delete_slice":
      return deleteSlice(document, operation.sliceId);
    case "add_guide": {
      const limit = operation.axis === "horizontal" ? document.height : document.width;
      if (operation.position > limit) throw new Error("MCP add_guide position is outside the canvas");
      const guide = {id: createMCPID("guide"), axis: operation.axis, position: operation.position};
      document.guides.push(guide);
      return true;
    }
    case "update_guide": {
      const guide = document.guides.find((candidate) => candidate.id === operation.guideId);
      if (!guide) throw new Error(`MCP guide ${operation.guideId} does not exist`);
      const axis = operation.axis ?? guide.axis;
      const limit = axis === "horizontal" ? document.height : document.width;
      if (operation.position !== undefined && operation.position > limit) throw new Error("MCP update_guide position is outside the canvas");
      let changed = false;
      if (operation.axis !== undefined && guide.axis !== operation.axis) { guide.axis = operation.axis; changed = true; }
      if (operation.position !== undefined && guide.position !== operation.position) { guide.position = operation.position; changed = true; }
      return changed;
    }
    case "delete_guide": {
      const index = document.guides.findIndex((guide) => guide.id === operation.guideId);
      if (index < 0) return false;
      document.guides.splice(index, 1);
      return true;
    }
  }
}

function applySetPixels(document: PixelDocument, operation: MCPSetPixelsOperation) {
  const layerId = operation.layerId ?? document.activeLayerId;
  const frameId = operation.frameId ?? document.activeFrameId;
  const layer = getLayerByID(document, layerId);
  if (!layer) throw new Error(`MCP set_pixels layer ${layerId} does not exist`);
  if (!isImageLayer(layer)) throw new Error(`MCP set_pixels layer ${layerId} is not an image layer`);
  if (isLayerEffectivelyLocked(document, layer) || layer.role === "reference") throw new Error(`MCP set_pixels layer ${layerId} is locked or reference-only`);
  if (!document.frames.some((frame) => frame.id === frameId)) {
    throw new Error(`MCP set_pixels frame ${frameId} does not exist`);
  }
  const cel = ensureCel(document, layerId, frameId);
  if (!cel) throw new Error(`MCP set_pixels cel for ${layerId} and ${frameId} cannot be created`);

  let changed = false;
  for (const pixel of operation.pixels) {
    if (pixel.x < 0 || pixel.y < 0 || pixel.x >= document.width || pixel.y >= document.height) {
      throw new Error(`MCP pixel coordinate (${pixel.x}, ${pixel.y}) is outside the document`);
    }
    const localX = pixel.x - cel.x;
    const localY = pixel.y - cel.y;
    if (localX < 0 || localY < 0 || localX >= cel.width || localY >= cel.height) {
      throw new Error(`MCP pixel coordinate (${pixel.x}, ${pixel.y}) is outside the target cel`);
    }
    const parsed = parseHexColor(pixel.color);
    if (!parsed) throw new Error(`MCP pixel color ${pixel.color} is invalid`);
    const constrained = constrainColorToMode(
      [parsed.r, parsed.g, parsed.b, parsed.a],
      document.colorMode,
      document.palette.colors,
    );
    const offset = (localY * cel.width + localX) * 4;
    if (layer.alphaLock && cel.pixels[offset + 3] === 0) continue;
    for (let channel = 0; channel < 4; channel += 1) {
      if (cel.pixels[offset + channel] === constrained[channel]) continue;
      cel.pixels[offset + channel] = constrained[channel];
      changed = true;
    }
  }
  if (changed && document.colorMode === "indexed") syncIndexedCel(document, cel);
  return changed;
}

function applySetIndexes(document: PixelDocument, operation: MCPSetIndexesOperation) {
  if (document.colorMode !== "indexed") throw new Error("MCP set_indexes requires an indexed document");
  const layerId = operation.layerId ?? document.activeLayerId;
  const frameId = operation.frameId ?? document.activeFrameId;
  const layer = getLayerByID(document, layerId);
  if (!layer) throw new Error(`MCP set_indexes layer ${layerId} does not exist`);
  if (!isImageLayer(layer)) throw new Error(`MCP set_indexes layer ${layerId} is not an image layer`);
  if (isLayerEffectivelyLocked(document, layer) || layer.role === "reference") throw new Error(`MCP set_indexes layer ${layerId} is locked or reference-only`);
  if (!document.frames.some((frame) => frame.id === frameId)) throw new Error(`MCP set_indexes frame ${frameId} does not exist`);
  const cel = ensureCel(document, layerId, frameId);
  if (!cel?.indexes) throw new Error(`MCP set_indexes cel for ${layerId} and ${frameId} cannot be created`);
  let changed = false;
  for (const pixel of operation.pixels) {
    if (pixel.x < 0 || pixel.y < 0 || pixel.x >= document.width || pixel.y >= document.height) throw new Error(`MCP index coordinate (${pixel.x}, ${pixel.y}) is outside the document`);
    const localX = pixel.x - cel.x;
    const localY = pixel.y - cel.y;
    if (localX < 0 || localY < 0 || localX >= cel.width || localY >= cel.height) throw new Error(`MCP index coordinate (${pixel.x}, ${pixel.y}) is outside the target cel`);
    if (!Number.isSafeInteger(pixel.index) || pixel.index < 0 || pixel.index >= Math.max(1, document.palette.colors.length)) throw new Error(`MCP palette index ${pixel.index} is invalid`);
    const offset = localY * cel.width + localX;
    if (layer.alphaLock && cel.pixels[offset * 4 + 3] === 0) continue;
    if (cel.indexes[offset] === pixel.index) continue;
    cel.indexes[offset] = pixel.index;
    changed = true;
  }
  if (changed) renderIndexedPixels(cel.indexes, cel.pixels, document.palette.colors, document.palette.transparentIndex);
  return changed;
}

function applyAddTileset(document: PixelDocument, operation: MCPAddTilesetOperation) {
  const id = operation.tilesetId ?? createMCPID("tileset");
  if (document.tilesets.some((tileset) => tileset.id === id)) throw new Error(`MCP tileset ${id} already exists`);
  const tileset: Tileset = {
    id,
    name: operation.name,
    tileWidth: operation.tileWidth,
    tileHeight: operation.tileHeight,
    tiles: [],
  };
  validateTileset(tileset);
  document.tilesets.push(tileset);
  return true;
}

function applyUpdateTileset(document: PixelDocument, operation: MCPUpdateTilesetOperation) {
  const tileset = findMcpTileset(document, operation.tilesetId);
  if (tileset.name === operation.name) return false;
  tileset.name = operation.name!;
  return true;
}

function applyDeleteTileset(document: PixelDocument, operation: MCPDeleteTilesetOperation) {
  const index = document.tilesets.findIndex((candidate) => candidate.id === operation.tilesetId);
  if (index < 0) throw new Error(`MCP delete tileset ${operation.tilesetId} does not exist`);
  if (document.layers.some((layer) => layer.kind === "tilemap" && layer.tilesetId === operation.tilesetId)) {
    throw new Error(`MCP tileset ${operation.tilesetId} is used by a tilemap layer`);
  }
  document.tilesets.splice(index, 1);
  return true;
}

function applyAddTile(document: PixelDocument, operation: MCPAddTileOperation) {
  const tileset = findMcpTileset(document, operation.tilesetId);
  const payload = parseMcpTilePayload(operation.pixels, operation.indexes, tileset, document);
  if (operation.tileId !== undefined) {
    if (!Number.isSafeInteger(operation.tileId) || operation.tileId <= 0 || operation.tileId > tileIndexMask) {
      throw new Error(`MCP tileId must be an integer from 1 to ${tileIndexMask}`);
    }
    if (findTile(tileset, operation.tileId)) throw new Error(`MCP tile ${operation.tileId} already exists in tileset ${operation.tilesetId}`);
    tileset.tiles.push({id: operation.tileId, pixels: payload.pixels, ...(payload.indexes ? {indexes: payload.indexes} : {})});
    refreshMcpTilemapCaches(document, operation.tilesetId);
    return true;
  }
  const added = addTile(tileset, payload.pixels, payload.indexes);
  if (!added.created && (!payload.indexes || findTile(tileset, added.tile.id)?.indexes)) return false;
  tileset.tiles = added.tileset.tiles;
  refreshMcpTilemapCaches(document, operation.tilesetId);
  return true;
}

function applyUpdateTile(document: PixelDocument, operation: MCPUpdateTileOperation) {
  const tileset = findMcpTileset(document, operation.tilesetId);
  const tile = findTile(tileset, operation.tileId);
  if (!tile) throw new Error(`MCP tile ${operation.tileId} does not exist in tileset ${operation.tilesetId}`);
  if (operation.pixels === undefined && operation.indexes === undefined) throw new Error("MCP update_tile requires pixels or indexes");
  const payload = parseMcpTilePayload(
    operation.pixels ?? rgbaBufferToHex(tile.pixels),
    operation.indexes,
    tileset,
    document,
  );
  let changed = !bytesEqual(tile.pixels, payload.pixels);
  if (payload.indexes) changed = changed || !tile.indexes || !bytesEqual(tile.indexes, payload.indexes);
  if (!changed) return false;
  tile.pixels = payload.pixels;
  tile.indexes = payload.indexes;
  refreshMcpTilemapCaches(document, operation.tilesetId);
  return true;
}

function applyDeleteTile(document: PixelDocument, operation: MCPDeleteTileOperation) {
  const tileset = findMcpTileset(document, operation.tilesetId);
  if (operation.tileId <= 0 || !Number.isSafeInteger(operation.tileId)) throw new Error("MCP tileId must be a positive integer");
  const tilemaps: TilemapData[] = [];
  const seen = new Set<TilemapData>();
  for (const layer of document.layers) {
    if (!isTilemapLayer(layer) || layer.tilesetId !== operation.tilesetId) continue;
    for (const cel of Object.values(document.cels)) {
      if (cel.layerId !== layer.id || !cel.tilemap || seen.has(cel.tilemap)) continue;
      seen.add(cel.tilemap);
      tilemaps.push(cel.tilemap);
    }
  }
  const result = deleteTile(tileset, operation.tileId, tilemaps);
  if (!result.deleted) throw new Error(`MCP tile ${operation.tileId} does not exist in tileset ${operation.tilesetId}`);
  tileset.tiles = result.tileset.tiles;
  tilemaps.forEach((tilemap, index) => tilemap.tiles.set(result.tilemaps[index].tiles));
  refreshMcpTilemapCaches(document, operation.tilesetId);
  return true;
}

function applySetTileCells(document: PixelDocument, operation: MCPSetTileCellsOperation) {
  const layerId = operation.layerId ?? document.activeLayerId;
  const frameId = operation.frameId ?? document.activeFrameId;
  const layer = getLayerByID(document, layerId);
  if (!layer) throw new Error(`MCP set_tile_cells layer ${layerId} does not exist`);
  if (!isTilemapLayer(layer) || !layer.tilesetId) throw new Error(`MCP set_tile_cells layer ${layerId} is not a tilemap layer`);
  if (isLayerEffectivelyLocked(document, layer) || layer.role === "reference") throw new Error(`MCP set_tile_cells layer ${layerId} is locked or reference-only`);
  if (!document.frames.some((frame) => frame.id === frameId)) throw new Error(`MCP set_tile_cells frame ${frameId} does not exist`);
  const tileset = findMcpTileset(document, layer.tilesetId);
  const cel = ensureCel(document, layerId, frameId);
  if (!cel?.tilemap) throw new Error(`MCP tilemap Cel for ${layerId} and ${frameId} cannot be created`);

  for (const cell of operation.cells) {
    if (cell.x < 0 || cell.y < 0 || cell.x >= cel.tilemap.columns || cell.y >= cel.tilemap.rows) {
      throw new Error(`MCP tile cell (${cell.x}, ${cell.y}) is outside the tilemap`);
    }
    validateMcpTileValue(cell.value, tileset);
  }
  let changed = false;
  for (const cell of operation.cells) {
    const offset = cell.y * cel.tilemap.columns + cell.x;
    const value = cell.value >>> 0;
    if (cel.tilemap.tiles[offset] === value) continue;
    cel.tilemap.tiles[offset] = value;
    changed = true;
  }
  if (!changed) return false;
  refreshMcpTilemapCaches(document, layer.tilesetId);
  return true;
}

function findMcpTileset(document: PixelDocument, tilesetId: string) {
  const tileset = document.tilesets.find((candidate) => candidate.id === tilesetId);
  if (!tileset) throw new Error(`MCP tileset ${tilesetId} does not exist`);
  return tileset;
}

function parseMcpTilePayload(
  pixels: string[],
  indexes: number[] | undefined,
  tileset: Tileset,
  document: PixelDocument,
) {
  const expected = tileset.tileWidth * tileset.tileHeight;
  if (pixels.length !== expected) throw new Error(`MCP tile pixels must contain exactly ${expected} colors`);
  const output = new Uint8ClampedArray(expected * 4);
  pixels.forEach((color, index) => {
    const parsed = parseHexColor(color);
    if (!parsed) throw new Error(`MCP tile color ${color} is invalid`);
    output.set([parsed.r, parsed.g, parsed.b, parsed.a], index * 4);
  });
  if (indexes !== undefined) {
    if (indexes.length !== expected || indexes.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= Math.max(1, document.palette.colors.length))) {
      throw new Error("MCP tile indexes have invalid dimensions or palette entries");
    }
    const normalized = new Uint8Array(indexes);
    if (document.colorMode === "indexed") {
      renderIndexedPixels(normalized, output, document.palette.colors, document.palette.transparentIndex);
    }
    return {pixels: output, indexes: normalized};
  }
  if (document.colorMode === "indexed") {
    const tile: Tile = {id: 1, pixels: output};
    const indexed = syncTileIndexes(tile, document.palette.colors, document.palette.transparentIndex);
    return {pixels: indexed.pixels, indexes: indexed.indexes};
  }
  return {pixels: output, indexes: undefined};
}

function validateMcpTileValue(value: number, tileset: Tileset) {
  if (!Number.isSafeInteger(value) || value < -0x80000000 || value > 0xffffffff) throw new Error("MCP tile value must be a 32-bit integer");
  const normalized = value >>> 0;
  const flags = tileValueFlags(normalized);
  const allowedFlags = tileFlipX | tileFlipY | tileFlipDiagonal;
  if ((flags & ~allowedFlags) !== 0) throw new Error("MCP tile value contains unknown flip flags");
  if ((flags & tileFlipDiagonal) !== 0 && tileset.tileWidth !== tileset.tileHeight) throw new Error("MCP diagonal tile flips require square tiles");
  if (tileValueIndex(normalized) !== 0 && !findTile(tileset, normalized)) throw new Error(`MCP tile ${tileValueIndex(normalized)} does not exist in tileset ${tileset.id}`);
}

function refreshMcpTilemapCaches(document: PixelDocument, tilesetId: string) {
  const tileset = findMcpTileset(document, tilesetId);
  const renderedLinks = new Map<string, {pixels: Uint8ClampedArray; indexes?: Uint8Array}>();
  for (const layer of document.layers) {
    if (!isTilemapLayer(layer) || layer.tilesetId !== tilesetId) continue;
    for (const cel of Object.values(document.cels)) {
      if (cel.layerId !== layer.id || !cel.tilemap) continue;
      const rendered = renderedLinks.get(cel.linkId);
      if (rendered) {
        cel.pixels = rendered.pixels;
        cel.indexes = rendered.indexes;
        continue;
      }
      renderTilemapCelIntoCache(cel, tileset, {
        palette: document.colorMode === "indexed" ? document.palette.colors : undefined,
        transparentIndex: document.palette.transparentIndex,
      });
      if (document.colorMode === "indexed" && cel.indexes) syncIndexedCel(document, cel);
      renderedLinks.set(cel.linkId, {pixels: cel.pixels, indexes: cel.indexes});
    }
  }
}

function addMcpLayer(document: PixelDocument, operation: MCPAddLayerOperation) {
  const activeLayer = getLayerByID(document, document.activeLayerId);
  const parentId = operation.parentId
    ?? (activeLayer?.kind === "group" ? activeLayer.id : activeLayer?.parentId);
  if (parentId) {
    const parent = getLayerByID(document, parentId);
    if (!parent) throw new Error(`MCP layer parent ${parentId} does not exist`);
    if (parent.kind !== "group") throw new Error(`MCP layer parent ${parentId} is not a group`);
  }

  const kind = operation.kind ?? "image";
  if (kind === "tilemap") {
    if (!operation.tilesetId) throw new Error("MCP tilemap layers require a tilesetId");
    const layer = addTilemapLayer(document, operation.tilesetId, operation.name);
    if (!layer) throw new Error(`MCP tilemap tileset ${operation.tilesetId} does not exist`);
    if (parentId) layer.parentId = parentId;
    else delete layer.parentId;
    if (operation.role !== undefined) layer.role = operation.role;
    if (operation.continuous !== undefined) layer.continuous = operation.continuous;
    if (operation.alphaLock !== undefined) layer.alphaLock = operation.alphaLock;
    if (operation.opacity !== undefined) layer.opacity = operation.opacity;
    if (operation.blendMode !== undefined) layer.blendMode = operation.blendMode;
    if (layer.role === "background") {
      delete layer.parentId;
      layer.opacity = 1;
    }
    return layer;
  }

  if (kind === "image") {
    const layer = addLayer(document, operation.name);
    if (parentId) layer.parentId = parentId;
    else delete layer.parentId;
    if (operation.role !== undefined) layer.role = operation.role;
    if (operation.continuous !== undefined) layer.continuous = operation.continuous;
    if (operation.alphaLock !== undefined) layer.alphaLock = operation.alphaLock;
    if (operation.opacity !== undefined) layer.opacity = operation.opacity;
    if (operation.blendMode !== undefined) layer.blendMode = operation.blendMode;
    if (layer.role === "background") {
      delete layer.parentId;
      layer.opacity = 1;
    }
    return layer;
  }

  // addLayerGroup intentionally wraps the active layer. MCP's parentId is a
  // direct hierarchy target, so groups are created without reparenting peers.
  const layer: Layer = {
    id: createMCPID("layer"),
    name: operation.name,
    visible: true,
    locked: false,
    opacity: 1,
    kind,
    ...(parentId ? {parentId} : {}),
    blendMode: "normal",
    role: "standard",
    continuous: false,
    alphaLock: false,
  };
  const activeIndex = document.layers.findIndex((candidate) => candidate.id === document.activeLayerId);
  document.layers.splice(activeIndex < 0 ? document.layers.length : activeIndex + 1, 0, layer);
  document.activeLayerId = layer.id;
  return layer;
}

function applyUpdateLayer(document: PixelDocument, operation: MCPUpdateLayerOperation) {
  const layer = getLayerByID(document, operation.layerId);
  if (!layer) throw new Error(`MCP update layer ${operation.layerId} does not exist`);
  let changed = false;
  if (operation.name !== undefined && operation.name !== layer.name) {
    layer.name = operation.name;
    changed = true;
  }
  if (operation.visible !== undefined && operation.visible !== layer.visible) {
    layer.visible = operation.visible;
    changed = true;
  }
  if (operation.locked !== undefined && operation.locked !== layer.locked) {
    layer.locked = operation.locked;
    changed = true;
  }
  if (operation.opacity !== undefined && operation.opacity !== layer.opacity) {
    layer.opacity = operation.opacity;
    changed = true;
  }
  if (operation.blendMode !== undefined && operation.blendMode !== layer.blendMode) {
    layer.blendMode = operation.blendMode;
    changed = true;
  }
  if (operation.role !== undefined && operation.role !== layer.role) {
    if (layer.kind !== "image" || operation.role === "background" && document.layers.some((candidate) => candidate.id !== layer.id && candidate.role === "background")) {
      throw new Error(`MCP update layer ${operation.layerId} role is invalid`);
    }
    layer.role = operation.role;
    if (operation.role === "background") {
      delete layer.parentId;
      layer.opacity = 1;
    }
    changed = true;
  }
  if (operation.continuous !== undefined && operation.continuous !== layer.continuous) {
    if (layer.kind !== "image") throw new Error(`MCP update layer ${operation.layerId} is not an image layer`);
    layer.continuous = operation.continuous;
    changed = true;
  }
  if (operation.alphaLock !== undefined && operation.alphaLock !== layer.alphaLock) {
    if (layer.kind !== "image") throw new Error(`MCP update layer ${operation.layerId} is not an image layer`);
    layer.alphaLock = operation.alphaLock;
    changed = true;
  }
  return changed;
}

function applyUpdateSettings(document: PixelDocument, operation: MCPUpdateSettingsOperation) {
  const keys: (keyof DocumentSettings)[] = [
    "gridWidth", "gridHeight", "gridOffsetX", "gridOffsetY", "snapToGrid", "tiledX", "tiledY",
    "symmetryX", "symmetryY", "symmetryAxisX", "symmetryAxisY", "onionPreviousFrames", "onionNextFrames",
    "onionOpacity", "onionPreviousColor", "onionNextColor",
  ];
  let changed = false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(operation, key)) continue;
    const value = operation[key] as DocumentSettings[typeof key];
    if (typeof value !== typeof document.settings[key]) throw new Error(`MCP update_settings.${key} has an invalid type`);
    if (typeof value === "number" && (!Number.isFinite(value) || !Number.isSafeInteger(value) && ["gridOffsetX", "gridOffsetY", "onionPreviousFrames", "onionNextFrames"].includes(key))) throw new Error(`MCP update_settings.${key} is invalid`);
    if ((key === "gridWidth" || key === "gridHeight") && (!Number.isInteger(value as number) || (value as number) < 1 || (value as number) > 2048)) {
      throw new Error(`MCP update_settings.${key} must be an integer from 1 to 2048`);
    }
    if ((key === "onionOpacity") && (value as number) > 1) throw new Error("MCP update_settings.onionOpacity must be between 0 and 1");
    if ((key === "onionPreviousFrames" || key === "onionNextFrames") && (value as number) > 16) throw new Error(`MCP update_settings.${key} must be between 0 and 16`);
    if (key === "symmetryAxisX" && (value as number) > document.width || key === "symmetryAxisY" && (value as number) > document.height) {
      throw new Error(`MCP update_settings.${key} is outside the canvas`);
    }
    if ((key === "onionPreviousColor" || key === "onionNextColor") && (typeof value !== "string" || !validRGBAHex(value))) {
      throw new Error(`MCP update_settings.${key} must be a color`);
    }
    if (document.settings[key] !== value) {
      (document.settings as unknown as Record<keyof DocumentSettings, unknown>)[key] = value;
      changed = true;
    }
  }
  return changed;
}

function createPixelHistoryCommand(before: PixelDocument, after: PixelDocument): HistoryCommand<PixelDocument> | null {
  const patches: MCPPixelPatch[] = [];
  const seenLinks = new Set<string>();
  for (const beforeCel of Object.values(before.cels)) {
    const afterCel = getCelByID(after, beforeCel.id);
    if (!afterCel || seenLinks.has(beforeCel.linkId)) continue;
    seenLinks.add(beforeCel.linkId);
    const patch = createPatch(beforeCel.pixels, afterCel.pixels, beforeCel.width, beforeCel.height);
    const indexesChanged = beforeCel.indexes && afterCel.indexes && !bytesEqual(beforeCel.indexes, afterCel.indexes);
    if (patch) patches.push({
      celId: beforeCel.id,
      patch,
      ...(indexesChanged ? {indexBefore: beforeCel.indexes!.slice(), indexAfter: afterCel.indexes!.slice()} : {}),
    });
  }
  if (patches.length === 0) return null;
  if (patches.length === 1 && !patches[0].indexBefore) return new PixelEditCommand(patches[0].celId, patches[0].patch, "MCP set pixels");
  return new MCPPixelBatchCommand(patches, "MCP set pixels");
}

function samePixelHistoryStructure(before: PixelDocument, after: PixelDocument) {
  const beforeCels = Object.values(before.cels);
  const afterCels = Object.values(after.cels);
  if (beforeCels.length !== afterCels.length) return false;
  return beforeCels.every((cel) => {
    const next = getCelByID(after, cel.id);
    return Boolean(next && next.layerId === cel.layerId && next.frameId === cel.frameId
      && next.x === cel.x && next.y === cel.y && next.width === cel.width && next.height === cel.height
      && next.linkId === cel.linkId
      && Boolean(next.indexes) === Boolean(cel.indexes));
  });
}

function bytesEqual(left: ArrayLike<number>, right: ArrayLike<number>) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

function validateOperation(value: unknown, index: number): ValidatedOperation {
  const context = `MCP operation ${index}`;
  if (!isRecord(value)) throw new Error(`${context} must be an object`);
  const type = value.type;
  if (typeof type !== "string" || !operationTypes.includes(type as typeof operationTypes[number])) {
    throw new Error(`${context} has an unknown type`);
  }

  switch (type as typeof operationTypes[number]) {
    case "set_pixels": {
      assertKeys(value, ["type", "layerId", "frameId", "pixels"], context);
      const layerId = optionalID(value, "layerId", context);
      const frameId = optionalID(value, "frameId", context);
      if (!Array.isArray(value.pixels)) throw new Error(`${context}.pixels must be an array`);
      const pixels = value.pixels.map((entry, pixelIndex) => {
        const pixelContext = `${context}.pixels[${pixelIndex}]`;
        if (!isRecord(entry)) throw new Error(`${pixelContext} must be an object`);
        assertKeys(entry, ["x", "y", "color"], pixelContext);
        const x = requiredInteger(entry, "x", pixelContext);
        const y = requiredInteger(entry, "y", pixelContext);
        if (typeof entry.color !== "string" || !validRGBAHex(entry.color)) {
          throw new Error(`${pixelContext}.color must be #RRGGBB or #RRGGBBAA`);
        }
        return {x, y, color: entry.color};
      });
      return {type: "set_pixels", ...(layerId ? {layerId} : {}), ...(frameId ? {frameId} : {}), pixels};
    }
    case "set_indexes": {
      assertKeys(value, ["type", "layerId", "frameId", "pixels"], context);
      const layerId = optionalID(value, "layerId", context);
      const frameId = optionalID(value, "frameId", context);
      if (!Array.isArray(value.pixels)) throw new Error(`${context}.pixels must be an array`);
      const pixels = value.pixels.map((entry, pixelIndex) => {
        const pixelContext = `${context}.pixels[${pixelIndex}]`;
        if (!isRecord(entry)) throw new Error(`${pixelContext} must be an object`);
        assertKeys(entry, ["x", "y", "index"], pixelContext);
        return {x: requiredInteger(entry, "x", pixelContext), y: requiredInteger(entry, "y", pixelContext), index: requiredInteger(entry, "index", pixelContext)};
      });
      return {type: "set_indexes", ...(layerId ? {layerId} : {}), ...(frameId ? {frameId} : {}), pixels};
    }
    case "set_cel_properties": {
      assertKeys(value, ["type", "layerId", "frameId", "opacity", "zIndex"], context);
      const result: MCPSetCelPropertiesOperation = {
        type: "set_cel_properties",
        layerId: requiredID(value, "layerId", context),
        frameId: requiredID(value, "frameId", context),
      };
      let hasUpdate = false;
      if (value.opacity !== undefined) {
        result.opacity = requiredOpacity(value, "opacity", context);
        hasUpdate = true;
      }
      if (value.zIndex !== undefined) {
        result.zIndex = requiredCelZIndex(value, "zIndex", context);
        hasUpdate = true;
      }
      if (!hasUpdate) throw new Error(`${context} must update at least one Cel property`);
      return result;
    }
    case "add_tileset": {
      assertKeys(value, ["type", "tilesetId", "name", "tileWidth", "tileHeight"], context);
      const tilesetId = value.tilesetId === undefined ? undefined : requiredID(value, "tilesetId", context);
      if (typeof value.name !== "string" || !value.name.trim()) throw new Error(`${context}.name must be a non-empty string`);
      if (!validCanvasDimension(value.tileWidth) || !validCanvasDimension(value.tileHeight)) {
        throw new Error(`${context}.tileWidth and .tileHeight must be integers from 1 to ${MAX_CANVAS_DIMENSION}`);
      }
      return {type: "add_tileset", ...(tilesetId ? {tilesetId} : {}), name: value.name.trim(), tileWidth: value.tileWidth, tileHeight: value.tileHeight};
    }
    case "update_tileset": {
      assertKeys(value, ["type", "tilesetId", "name"], context);
      const result: MCPUpdateTilesetOperation = {type: "update_tileset", tilesetId: requiredID(value, "tilesetId", context)};
      if (value.name !== undefined) {
        if (typeof value.name !== "string" || !value.name.trim()) throw new Error(`${context}.name is invalid`);
        result.name = value.name.trim();
      }
      if (result.name === undefined) throw new Error(`${context} must update at least one tileset property`);
      return result;
    }
    case "delete_tileset":
      assertKeys(value, ["type", "tilesetId"], context);
      return {type: "delete_tileset", tilesetId: requiredID(value, "tilesetId", context)};
    case "add_tile": {
      assertKeys(value, ["type", "tilesetId", "tileId", "pixels", "indexes"], context);
      const tileId = value.tileId === undefined ? undefined : requiredInteger(value, "tileId", context);
      if (tileId !== undefined && (tileId <= 0 || tileId > tileIndexMask)) throw new Error(`${context}.tileId is invalid`);
      const pixels = requiredTileColors(value.pixels, context);
      const indexes = optionalTileIndexes(value.indexes, context);
      return {type: "add_tile", tilesetId: requiredID(value, "tilesetId", context), pixels, ...(indexes ? {indexes} : {}), ...(tileId !== undefined ? {tileId} : {})};
    }
    case "update_tile": {
      assertKeys(value, ["type", "tilesetId", "tileId", "pixels", "indexes"], context);
      const pixels = value.pixels === undefined ? undefined : requiredTileColors(value.pixels, context);
      const indexes = optionalTileIndexes(value.indexes, context);
      if (pixels === undefined && indexes === undefined) throw new Error(`${context} must update pixels or indexes`);
      return {type: "update_tile", tilesetId: requiredID(value, "tilesetId", context), tileId: requiredInteger(value, "tileId", context), ...(pixels ? {pixels} : {}), ...(indexes ? {indexes} : {})};
    }
    case "delete_tile":
      assertKeys(value, ["type", "tilesetId", "tileId"], context);
      return {type: "delete_tile", tilesetId: requiredID(value, "tilesetId", context), tileId: requiredInteger(value, "tileId", context)};
    case "set_tile_cells": {
      assertKeys(value, ["type", "layerId", "frameId", "cells"], context);
      const layerId = optionalID(value, "layerId", context);
      const frameId = optionalID(value, "frameId", context);
      if (!Array.isArray(value.cells) || value.cells.length === 0) throw new Error(`${context}.cells must be a non-empty array`);
      const cells = value.cells.map((entry, cellIndex) => {
        const cellContext = `${context}.cells[${cellIndex}]`;
        if (!isRecord(entry)) throw new Error(`${cellContext} must be an object`);
        assertKeys(entry, ["x", "y", "value"], cellContext);
        const x = requiredInteger(entry, "x", cellContext);
        const y = requiredInteger(entry, "y", cellContext);
        const tileValue = requiredInteger(entry, "value", cellContext);
        if (x < 0 || y < 0 || tileValue < -0x80000000 || tileValue > 0xffffffff) throw new Error(`${cellContext} is invalid`);
        return {x, y, value: tileValue};
      });
      return {type: "set_tile_cells", ...(layerId ? {layerId} : {}), ...(frameId ? {frameId} : {}), cells};
    }
    case "add_layer": {
      assertKeys(value, ["type", "name", "parentId", "kind", "tilesetId", "role", "continuous", "alphaLock", "opacity", "blendMode"], context);
      if (typeof value.name !== "string" || value.name.trim() === "") {
        throw new Error(`${context}.name must be a non-empty string`);
      }
      const parentId = optionalID(value, "parentId", context);
      const kind = value.kind === undefined ? "image" : value.kind;
      if (kind !== "image" && kind !== "group" && kind !== "tilemap") throw new Error(`${context}.kind is invalid`);
      const tilesetId = value.tilesetId === undefined ? undefined : requiredID(value, "tilesetId", context);
      if (kind === "tilemap" && !tilesetId) throw new Error(`${context}.tilesetId is required for tilemap layers`);
      if (kind !== "tilemap" && tilesetId !== undefined) throw new Error(`${context}.tilesetId requires kind=tilemap`);
      const role = value.role === undefined ? undefined : value.role;
      if (role !== undefined && !isLayerRole(role)) throw new Error(`${context}.role is invalid`);
      if (value.continuous !== undefined && typeof value.continuous !== "boolean") throw new Error(`${context}.continuous is invalid`);
      if (value.alphaLock !== undefined && typeof value.alphaLock !== "boolean") throw new Error(`${context}.alphaLock is invalid`);
      if (kind === "group" && (role !== undefined || value.continuous !== undefined || value.alphaLock !== undefined)) throw new Error(`${context} image-only properties require a Cel layer`);
      const opacity = value.opacity === undefined ? undefined : requiredOpacity(value, "opacity", context);
      const blendMode = value.blendMode === undefined ? undefined : value.blendMode;
      if (blendMode !== undefined && !isBlendMode(blendMode)) throw new Error(`${context}.blendMode is invalid`);
      return {type: "add_layer", name: value.name.trim(), ...(parentId ? {parentId} : {}), kind, ...(tilesetId ? {tilesetId} : {}),
        ...(role !== undefined ? {role} : {}), ...(value.continuous !== undefined ? {continuous: value.continuous} : {}),
        ...(value.alphaLock !== undefined ? {alphaLock: value.alphaLock} : {}), ...(opacity !== undefined ? {opacity} : {}),
        ...(blendMode !== undefined ? {blendMode} : {})};
    }
    case "update_layer": {
      assertKeys(value, ["type", "layerId", "name", "visible", "locked", "opacity", "blendMode", "role", "continuous", "alphaLock"], context);
      const layerId = requiredID(value, "layerId", context);
      let hasUpdate = false;
      const result: MCPUpdateLayerOperation = {type: "update_layer", layerId};
      if (value.name !== undefined) {
        if (typeof value.name !== "string" || value.name.trim() === "") throw new Error(`${context}.name is invalid`);
        result.name = value.name.trim();
        hasUpdate = true;
      }
      if (value.visible !== undefined) {
        if (typeof value.visible !== "boolean") throw new Error(`${context}.visible is invalid`);
        result.visible = value.visible;
        hasUpdate = true;
      }
      if (value.locked !== undefined) {
        if (typeof value.locked !== "boolean") throw new Error(`${context}.locked is invalid`);
        result.locked = value.locked;
        hasUpdate = true;
      }
      if (value.opacity !== undefined) {
        if (typeof value.opacity !== "number" || !Number.isFinite(value.opacity) || value.opacity < 0 || value.opacity > 1) {
          throw new Error(`${context}.opacity must be between 0 and 1`);
        }
        result.opacity = value.opacity;
        hasUpdate = true;
      }
      if (value.blendMode !== undefined) {
        if (!isBlendMode(value.blendMode)) throw new Error(`${context}.blendMode is invalid`);
        result.blendMode = value.blendMode;
        hasUpdate = true;
      }
      if (value.role !== undefined) {
        if (!isLayerRole(value.role)) throw new Error(`${context}.role is invalid`);
        result.role = value.role;
        hasUpdate = true;
      }
      if (value.continuous !== undefined) {
        if (typeof value.continuous !== "boolean") throw new Error(`${context}.continuous is invalid`);
        result.continuous = value.continuous;
        hasUpdate = true;
      }
      if (value.alphaLock !== undefined) {
        if (typeof value.alphaLock !== "boolean") throw new Error(`${context}.alphaLock is invalid`);
        result.alphaLock = value.alphaLock;
        hasUpdate = true;
      }
      if (!hasUpdate) throw new Error(`${context} must update at least one layer property`);
      return result;
    }
    case "delete_layer":
      assertKeys(value, ["type", "layerId"], context);
      return {type: "delete_layer", layerId: requiredID(value, "layerId", context)};
    case "add_frame": {
      assertKeys(value, ["type", "duplicateFromId", "durationMs"], context);
      const duplicateFromId = optionalID(value, "duplicateFromId", context);
      const durationMs = optionalDuration(value, "durationMs", context);
      return {type: "add_frame", ...(duplicateFromId ? {duplicateFromId} : {}), ...(durationMs !== undefined ? {durationMs} : {})};
    }
    case "delete_frame":
      assertKeys(value, ["type", "frameId"], context);
      return {type: "delete_frame", frameId: requiredID(value, "frameId", context)};
    case "set_frame_duration":
      assertKeys(value, ["type", "frameId", "durationMs"], context);
      return {
        type: "set_frame_duration",
        frameId: requiredID(value, "frameId", context),
        durationMs: requiredDuration(value, "durationMs", context),
      };
    case "set_palette": {
      assertKeys(value, ["type", "colors", "name", "transparentIndex"], context);
      if (!Array.isArray(value.colors) || value.colors.length > 256) {
        throw new Error(`${context}.colors must contain at most 256 colors`);
      }
      if (value.colors.some((color) => typeof color !== "string" || !validRGBAHex(color))) {
        throw new Error(`${context}.colors must contain #RRGGBB or #RRGGBBAA values`);
      }
      if (value.name !== undefined && (typeof value.name !== "string" || value.name.trim() === "")) throw new Error(`${context}.name is invalid`);
      const transparentIndex = value.transparentIndex;
      if (transparentIndex !== undefined && (typeof transparentIndex !== "number" || !Number.isSafeInteger(transparentIndex) || transparentIndex < 0 || transparentIndex >= Math.max(1, value.colors.length))) {
        throw new Error(`${context}.transparentIndex is invalid`);
      }
      return {type: "set_palette", colors: [...value.colors],
        ...(value.name !== undefined ? {name: value.name.trim()} : {}),
        ...(transparentIndex !== undefined ? {transparentIndex} : {})};
    }
    case "rename_document":
      assertKeys(value, ["type", "name"], context);
      if (typeof value.name !== "string" || value.name.trim() === "") throw new Error(`${context}.name is invalid`);
      return {type: "rename_document", name: value.name.trim()};
    case "resize_canvas":
      assertKeys(value, ["type", "width", "height", "anchorX", "anchorY"], context);
      const width = value.width;
      const height = value.height;
      const anchorX = value.anchorX;
      const anchorY = value.anchorY;
      if (!validCanvasDimension(width) || !validCanvasDimension(height)) {
        throw new Error(`${context}.width and .height must be integers from 1 to ${MAX_CANVAS_DIMENSION}`);
      }
      if (!isAnchor(anchorX) || !isAnchor(anchorY)) {
        throw new Error(`${context}.anchorX and .anchorY must be 0, 0.5, or 1`);
      }
      return {type: "resize_canvas", width, height, anchorX, anchorY};
    case "update_settings": {
      const allowed = ["type", "gridWidth", "gridHeight", "gridOffsetX", "gridOffsetY", "snapToGrid", "tiledX", "tiledY", "symmetryX", "symmetryY", "symmetryAxisX", "symmetryAxisY", "onionPreviousFrames", "onionNextFrames", "onionOpacity", "onionPreviousColor", "onionNextColor"];
      assertKeys(value, allowed, context);
      const result: MCPUpdateSettingsOperation = {type: "update_settings"};
      const numericInts = ["gridWidth", "gridHeight", "gridOffsetX", "gridOffsetY", "onionPreviousFrames", "onionNextFrames"];
      const booleans = ["snapToGrid", "tiledX", "tiledY", "symmetryX", "symmetryY"];
      for (const key of numericInts) if (value[key] !== undefined) {
        if (!Number.isSafeInteger(value[key])) throw new Error(`${context}.${key} must be an integer`);
        result[key] = value[key];
      }
      for (const key of booleans) if (value[key] !== undefined) {
        if (typeof value[key] !== "boolean") throw new Error(`${context}.${key} must be boolean`);
        result[key] = value[key];
      }
      for (const key of ["symmetryAxisX", "symmetryAxisY", "onionOpacity"] as const) if (value[key] !== undefined) {
        if (typeof value[key] !== "number" || !Number.isFinite(value[key])) throw new Error(`${context}.${key} must be a finite number`);
        result[key] = value[key];
      }
      for (const key of ["onionPreviousColor", "onionNextColor"] as const) if (value[key] !== undefined) {
        if (typeof value[key] !== "string" || !validRGBAHex(value[key])) throw new Error(`${context}.${key} must be a color`);
        result[key] = value[key];
      }
      if (Object.keys(result).length === 1) throw new Error(`${context} must update at least one setting`);
      return result;
    }
    case "add_tag": {
      assertKeys(value, ["type", "name", "fromFrameId", "toFrameId", "direction", "color", "repeat"], context);
      if (typeof value.name !== "string" || !value.name.trim()) throw new Error(`${context}.name is invalid`);
      const direction = value.direction === undefined ? undefined : value.direction;
      if (direction !== undefined && !isTagDirection(direction)) throw new Error(`${context}.direction is invalid`);
      if (value.color !== undefined && (typeof value.color !== "string" || !validRGBAHex(value.color))) throw new Error(`${context}.color is invalid`);
      const repeat = value.repeat === undefined ? undefined : requiredRepeat(value, "repeat", context);
      return {type: "add_tag", name: value.name.trim(), fromFrameId: requiredID(value, "fromFrameId", context), toFrameId: requiredID(value, "toFrameId", context),
        ...(direction !== undefined ? {direction} : {}), ...(value.color !== undefined ? {color: value.color} : {}), ...(repeat !== undefined ? {repeat} : {})};
    }
    case "update_tag": {
      assertKeys(value, ["type", "tagId", "name", "fromFrameId", "toFrameId", "direction", "color", "repeat"], context);
      const result: MCPUpdateTagOperation = {type: "update_tag", tagId: requiredID(value, "tagId", context)};
      if (value.name !== undefined) { if (typeof value.name !== "string" || !value.name.trim()) throw new Error(`${context}.name is invalid`); result.name = value.name.trim(); }
      if (value.fromFrameId !== undefined) result.fromFrameId = requiredID(value, "fromFrameId", context);
      if (value.toFrameId !== undefined) result.toFrameId = requiredID(value, "toFrameId", context);
      if (value.direction !== undefined) { if (!isTagDirection(value.direction)) throw new Error(`${context}.direction is invalid`); result.direction = value.direction; }
      if (value.color !== undefined) { if (typeof value.color !== "string" || !validRGBAHex(value.color)) throw new Error(`${context}.color is invalid`); result.color = value.color; }
      if (value.repeat !== undefined) result.repeat = requiredRepeat(value, "repeat", context);
      if (Object.keys(result).length === 2) throw new Error(`${context} must update at least one tag property`);
      return result;
    }
    case "delete_tag":
      assertKeys(value, ["type", "tagId"], context);
      return {type: "delete_tag", tagId: requiredID(value, "tagId", context)};
    case "reverse_frames":
      assertKeys(value, ["type", "frameIds"], context);
      return {type: "reverse_frames", frameIds: requiredIDs(value, "frameIds", context)};
    case "link_cels": {
      assertKeys(value, ["type", "layerId", "frameIds", "sourceFrameId"], context);
      const sourceFrameId = optionalID(value, "sourceFrameId", context);
      return {type: "link_cels", layerId: requiredID(value, "layerId", context), frameIds: requiredIDs(value, "frameIds", context), ...(sourceFrameId ? {sourceFrameId} : {})};
    }
    case "unlink_cels":
      assertKeys(value, ["type", "layerId", "frameIds"], context);
      return {type: "unlink_cels", layerId: requiredID(value, "layerId", context), frameIds: requiredIDs(value, "frameIds", context)};
    case "add_slice": {
      assertKeys(value, ["type", "name", "color", "frameId", "x", "y", "width", "height", "center", "pivot"], context);
      if (typeof value.name !== "string" || !value.name.trim()) throw new Error(`${context}.name is invalid`);
      if (value.color !== undefined && (typeof value.color !== "string" || !validRGBAHex(value.color))) throw new Error(`${context}.color is invalid`);
      const rect = requiredRect(value, context);
      const frameId = optionalID(value, "frameId", context);
      return {type: "add_slice", name: value.name.trim(), ...rect, ...(frameId ? {frameId} : {}),
        ...(value.color !== undefined ? {color: value.color} : {}), ...(value.center !== undefined ? {center: requiredSubRect(value.center, `${context}.center`)} : {}),
        ...(value.pivot !== undefined ? {pivot: requiredPoint(value.pivot, `${context}.pivot`)} : {})};
    }
    case "update_slice": {
      assertKeys(value, ["type", "sliceId", "name", "color", "keys"], context);
      const result: MCPUpdateSliceOperation = {type: "update_slice", sliceId: requiredID(value, "sliceId", context)};
      if (value.name !== undefined) { if (typeof value.name !== "string" || !value.name.trim()) throw new Error(`${context}.name is invalid`); result.name = value.name.trim(); }
      if (value.color !== undefined) { if (typeof value.color !== "string" || !validRGBAHex(value.color)) throw new Error(`${context}.color is invalid`); result.color = value.color; }
      if (value.keys !== undefined) result.keys = requiredSliceKeys(value.keys, context);
      if (Object.keys(result).length === 2) throw new Error(`${context} must update at least one slice property`);
      return result;
    }
    case "delete_slice":
      assertKeys(value, ["type", "sliceId"], context);
      return {type: "delete_slice", sliceId: requiredID(value, "sliceId", context)};
    case "add_guide": {
      assertKeys(value, ["type", "axis", "position"], context);
      if (value.axis !== "horizontal" && value.axis !== "vertical") throw new Error(`${context}.axis is invalid`);
      if (typeof value.position !== "number" || !Number.isFinite(value.position) || value.position < 0) throw new Error(`${context}.position is invalid`);
      return {type: "add_guide", axis: value.axis, position: value.position};
    }
    case "update_guide": {
      assertKeys(value, ["type", "guideId", "axis", "position"], context);
      const result: MCPUpdateGuideOperation = {type: "update_guide", guideId: requiredID(value, "guideId", context)};
      if (value.axis !== undefined) { if (value.axis !== "horizontal" && value.axis !== "vertical") throw new Error(`${context}.axis is invalid`); result.axis = value.axis; }
      if (value.position !== undefined) { if (typeof value.position !== "number" || !Number.isFinite(value.position) || value.position < 0) throw new Error(`${context}.position is invalid`); result.position = value.position; }
      if (Object.keys(result).length === 2) throw new Error(`${context} must update at least one guide property`);
      return result;
    }
    case "delete_guide":
      assertKeys(value, ["type", "guideId"], context);
      return {type: "delete_guide", guideId: requiredID(value, "guideId", context)};
  }
}

function validateReadArgs(args: ReadMCPPixelsArgs): ReadMCPPixelsArgs {
  if (!isRecord(args)) throw new Error("MCP read arguments must be an object");
  assertKeys(args, ["layerId", "frameId", "x", "y", "width", "height"], "MCP read arguments");
  const layerId = optionalID(args, "layerId", "MCP read arguments");
  const frameId = optionalID(args, "frameId", "MCP read arguments");
  const regionKeys = ["x", "y", "width", "height"] as const;
  const hasRegion = regionKeys.some((key) => Object.prototype.hasOwnProperty.call(args, key));
  if (!hasRegion) return {layerId, frameId};
  if (!regionKeys.every((key) => Object.prototype.hasOwnProperty.call(args, key))) {
    throw new Error("MCP read region requires x, y, width, and height");
  }
  const x = requiredInteger(args, "x", "MCP read arguments");
  const y = requiredInteger(args, "y", "MCP read arguments");
  const width = requiredInteger(args, "width", "MCP read arguments");
  const height = requiredInteger(args, "height", "MCP read arguments");
  return {layerId, frameId, x, y, width, height};
}

function normalizeReadRegion(document: PixelDocument, args: ReadMCPPixelsArgs) {
  const x = args.x ?? 0;
  const y = args.y ?? 0;
  const width = args.width ?? document.width;
  const height = args.height ?? document.height;
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)
    || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width <= 0 || height <= 0) {
    throw new Error("MCP read region must have positive integer dimensions");
  }
  if (width * height > MAX_READ_PIXELS) {
    throw new Error(`MCP pixel reads cannot exceed ${MAX_READ_PIXELS} pixels`);
  }
  if (x < 0 || y < 0 || x + width > document.width || y + height > document.height) {
    throw new Error("MCP read region is outside the document");
  }
  return {x, y, width, height};
}

function readLayerRegion(document: PixelDocument, layerId: string, frameId: string, region: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const output = new Uint8ClampedArray(region.width * region.height * 4);
  const cel = getCel(document, layerId, frameId);
  if (!cel) return output;
  const startX = Math.max(region.x, cel.x);
  const startY = Math.max(region.y, cel.y);
  const endX = Math.min(region.x + region.width, cel.x + cel.width);
  const endY = Math.min(region.y + region.height, cel.y + cel.height);
  if (startX >= endX || startY >= endY) return output;
  for (let documentY = startY; documentY < endY; documentY += 1) {
    for (let documentX = startX; documentX < endX; documentX += 1) {
      const sourceIndex = ((documentY - cel.y) * cel.width + documentX - cel.x) * 4;
      const targetIndex = ((documentY - region.y) * region.width + documentX - region.x) * 4;
      output.set(cel.pixels.subarray(sourceIndex, sourceIndex + 4), targetIndex);
    }
  }
  return output;
}

function rgbaHex(r: number, g: number, b: number, a: number) {
  return `#${[r, g, b, a].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function rgbaBufferToHex(pixels: ArrayLike<number>) {
  const result: string[] = [];
  for (let offset = 0; offset < pixels.length; offset += 4) {
    result.push(rgbaHex(pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]));
  }
  return result;
}

function assertKeys(value: Record<string, unknown>, allowed: readonly string[], context: string) {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unknown) throw new Error(`${context} contains unknown field ${unknown}`);
}

function requiredID(value: Record<string, unknown>, key: string, context: string) {
  const candidate = value[key];
  if (typeof candidate !== "string" || candidate.length === 0) throw new Error(`${context}.${key} must be a non-empty string`);
  return candidate;
}

function requiredInteger(value: Record<string, unknown>, key: string, context: string): number {
  const candidate = value[key];
  if (typeof candidate !== "number" || !Number.isSafeInteger(candidate)) {
    throw new Error(`${context}.${key} must be an integer`);
  }
  return candidate;
}

function optionalID(value: Record<string, unknown>, key: string, context: string) {
  if (!Object.prototype.hasOwnProperty.call(value, key)) return undefined;
  return requiredID(value, key, context);
}

function requiredIDs(value: Record<string, unknown>, key: string, context: string) {
  const candidate = value[key];
  if (!Array.isArray(candidate) || candidate.length === 0) throw new Error(`${context}.${key} must be a non-empty array`);
  return candidate.map((entry, index) => {
    if (typeof entry !== "string" || !entry) throw new Error(`${context}.${key}[${index}] must be a non-empty string`);
    return entry;
  });
}

function requiredOpacity(value: Record<string, unknown>, key: string, context: string) {
  const candidate = value[key];
  if (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate < 0 || candidate > 1) {
    throw new Error(`${context}.${key} must be between 0 and 1`);
  }
  return candidate;
}

function requiredCelZIndex(value: Record<string, unknown>, key: string, context: string) {
  const candidate = value[key];
  if (typeof candidate !== "number" || !Number.isSafeInteger(candidate) || candidate < -32768 || candidate > 32767) {
    throw new Error(`${context}.${key} must be an integer from -32768 to 32767`);
  }
  return candidate;
}

function requiredRepeat(value: Record<string, unknown>, key: string, context: string) {
  const candidate = value[key];
  if (typeof candidate !== "number" || !Number.isSafeInteger(candidate) || candidate < 0 || candidate > 65535) {
    throw new Error(`${context}.${key} must be an integer from 0 to 65535`);
  }
  return candidate;
}

function requiredRect(value: Record<string, unknown>, context: string) {
  for (const key of ["x", "y", "width", "height"]) if (!Number.isSafeInteger(value[key])) throw new Error(`${context}.${key} must be an integer`);
  if ((value.width as number) <= 0 || (value.height as number) <= 0 || (value.x as number) < 0 || (value.y as number) < 0) throw new Error(`${context} rectangle is invalid`);
  return {x: value.x as number, y: value.y as number, width: value.width as number, height: value.height as number};
}

function requiredTileColors(value: unknown, context: string): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${context}.pixels must be a non-empty color array`);
  if (value.some((color) => typeof color !== "string" || !validRGBAHex(color))) {
    throw new Error(`${context}.pixels must contain #RRGGBB or #RRGGBBAA values`);
  }
  return value.slice() as string[];
}

function optionalTileIndexes(value: unknown, context: string): number[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((index) => !Number.isSafeInteger(index) || index < 0 || index > 255)) {
    throw new Error(`${context}.indexes must contain palette indexes from 0 to 255`);
  }
  return value.slice() as number[];
}

function requiredSubRect(value: unknown, context: string) {
  if (!isRecord(value)) throw new Error(`${context} must be an object`);
  return requiredRect(value, context);
}

function requiredPoint(value: unknown, context: string) {
  if (!isRecord(value) || !Number.isSafeInteger(value.x) || !Number.isSafeInteger(value.y)) throw new Error(`${context} must have integer x and y`);
  return {x: value.x as number, y: value.y as number};
}

function requiredSliceKeys(value: unknown, context: string): PixelDocument["slices"][number]["keys"] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${context}.keys must be a non-empty array`);
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`${context}.keys[${index}] must be an object`);
    const rect = requiredRect(entry, `${context}.keys[${index}]`);
    const frameId = requiredID(entry, "frameId", `${context}.keys[${index}]`);
    const result: PixelDocument["slices"][number]["keys"][number] = {...rect, frameId};
    if (entry.center !== undefined) result.center = requiredSubRect(entry.center, `${context}.keys[${index}].center`);
    if (entry.pivot !== undefined) result.pivot = requiredPoint(entry.pivot, `${context}.keys[${index}].pivot`);
    return result;
  });
}

function validMcpSliceKey(document: PixelDocument, key: PixelDocument["slices"][number]["keys"][number]) {
  if (!document.frames.some((frame) => frame.id === key.frameId)
    || key.x < 0 || key.y < 0 || key.width <= 0 || key.height <= 0
    || key.x + key.width > document.width || key.y + key.height > document.height) return false;
  if (key.center && (key.center.x < 0 || key.center.y < 0 || key.center.width <= 0 || key.center.height <= 0
    || key.center.x + key.center.width > key.width || key.center.y + key.center.height > key.height)) return false;
  return true;
}

function requiredDuration(value: Record<string, unknown>, key: string, context: string): number {
  const duration = value[key];
  if (typeof duration !== "number" || !Number.isSafeInteger(duration) || duration < 1 || duration > 60_000) {
    throw new Error(`${context}.${key} must be an integer from 1 to 60000`);
  }
  return duration;
}

function optionalDuration(value: Record<string, unknown>, key: string, context: string) {
  if (!Object.prototype.hasOwnProperty.call(value, key)) return undefined;
  return requiredDuration(value, key, context);
}

function validRGBAHex(value: string) {
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value);
}

function validCanvasDimension(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 1
    && value <= MAX_CANVAS_DIMENSION;
}

function isAnchor(value: unknown): value is 0 | 0.5 | 1 {
  return value === 0 || value === 0.5 || value === 1;
}

function isBlendMode(value: unknown): value is BlendMode {
  return typeof value === "string" && blendModes.includes(value as BlendMode);
}

function isLayerRole(value: unknown): value is Layer["role"] {
  return value === "standard" || value === "background" || value === "reference";
}

function isTagDirection(value: unknown): value is FrameTag["direction"] {
  return value === "forward" || value === "reverse" || value === "pingpong";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arraysEqual(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function createMCPID(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

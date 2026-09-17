import {
  celKey,
  createCel,
  getCel,
  getLayerByID,
  isCelLayer,
  isImageLayer,
  isTilemapLayer,
  tileIndexMask,
  isLayerEffectivelyLocked,
  type Cel,
  type PixelDocument,
  type Tile,
  type TilemapData,
  type Tileset,
} from "./document";
import {indexPixels, renderIndexedPixels} from "./colorModes";
import {renderTilemapCel} from "./tilemap";

/** A layer/frame coordinate in the timeline cell grid. */
export interface CelAddress {
  layerId: string;
  frameId: string;
}

export interface CelClipboardCell {
  /** The source layer kind. Omitted by legacy image-only clipboard snapshots. */
  kind?: "image" | "tilemap";
  opacity: number;
  zIndex: number;
  /** Timeline row distance from the copied anchor (layer distance). */
  rowOffset: number;
  /** Timeline column distance from the copied anchor (frame distance). */
  columnOffset: number;
  /** Canvas-space origin and dimensions of the source cel. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** A detached snapshot of the source cel pixels. */
  pixels: Uint8ClampedArray;
  /** Indexed Cel cache, retained for legacy image clipboard consumers. */
  indexes?: Uint8Array;
  /** Authoritative tile cells for tilemap Cels. */
  tilemap?: TilemapData;
  /** Detached tile resources used by the authoritative tilemap cells. */
  tileset?: Tileset;
  /** Cells with the same source linkId share this clipboard group. */
  linkGroup: string;
  /** Same-document origin used by continuous-layer paste linking. */
  origin?: {
    document: PixelDocument;
    address: CelAddress;
  };
}

export interface CelClipboard {
  cells: CelClipboardCell[];
}

interface IndexedAddress extends CelAddress {
  row: number;
  column: number;
}

interface SourceCell extends CelClipboardCell {
  source: Cel;
}

interface PlannedPaste {
  address: CelAddress;
  cel: Cel;
}

interface TilemapPasteContext {
  tileset: Tileset;
  tileIDs: Map<number, number>;
}

interface PlannedClear {
  cel: Cel;
  pixels: Uint8ClampedArray;
  indexes?: Uint8Array;
  tilemap?: TilemapData;
  linkId?: string;
  replaceBuffers: boolean;
}

type ClearColor = readonly [number, number, number, number];

/**
 * Copies a sparse rectangular-timeline cell selection into an independent
 * clipboard snapshot. Rows are Cel layers and columns are document frames.
 */
export function copyCelSelection(
  document: PixelDocument,
  addresses: readonly CelAddress[],
  anchor: CelAddress,
  orderedCelLayerIds: readonly string[],
): CelClipboard | null {
  const grid = indexTimelineAddress(document, anchor, orderedCelLayerIds);
  if (!grid || !validAddressList(addresses)) return null;

  const seen = new Set<string>();
  const linkGroups = new Map<string, SourceCell>();
  const cells: CelClipboardCell[] = [];
  for (const address of addresses) {
    const indexed = indexTimelineAddress(document, address, orderedCelLayerIds);
    if (!indexed) return null;
    const key = celKey(address.layerId, address.frameId);
    if (seen.has(key)) return null;
    seen.add(key);

    const source = getCel(document, address.layerId, address.frameId);
    const layer = getLayerByID(document, address.layerId);
    if (!layer || !validSourceCel(document, source, address, layer)) return null;

    const existing = linkGroups.get(source.linkId);
    if (existing && !sameCelSnapshot(existing, source)) return null;
    const snapshot: SourceCell = {
      source,
      kind: layer.kind === "tilemap" ? "tilemap" : "image",
      opacity: source.opacity,
      zIndex: source.zIndex,
      rowOffset: indexed.row - grid.row,
      columnOffset: indexed.column - grid.column,
      x: source.x,
      y: source.y,
      width: source.width,
      height: source.height,
      pixels: source.pixels.slice(),
      indexes: source.indexes?.slice(),
      tilemap: source.tilemap ? cloneTilemap(source.tilemap) : undefined,
      tileset: layer.kind === "tilemap" && layer.tilesetId
        ? cloneTileset(document.tilesets.find((tileset) => tileset.id === layer.tilesetId)!)
        : undefined,
      linkGroup: source.linkId,
      origin: {document, address: {...address}},
    };
    if (!existing) linkGroups.set(source.linkId, snapshot);
    cells.push(snapshot);
  }

  return cells.length > 0 ? {
    cells: cells.map((cell): CelClipboardCell => ({
      opacity: cell.opacity,
      zIndex: cell.zIndex,
      kind: cell.kind,
      rowOffset: cell.rowOffset,
      columnOffset: cell.columnOffset,
      x: cell.x,
      y: cell.y,
      width: cell.width,
      height: cell.height,
      pixels: cell.pixels,
      indexes: cell.indexes,
      tilemap: cell.tilemap,
      tileset: cell.tileset,
      linkGroup: cell.linkGroup,
      origin: cell.origin,
    })),
  } : null;
}

/**
 * Pastes a sparse cell clipboard at a timeline anchor. The complete write
 * plan is validated before any destination cel is installed.
 */
export function pasteCelSelection(
  document: PixelDocument,
  clipboard: CelClipboard,
  targetAnchor: CelAddress,
  orderedCelLayerIds: readonly string[],
  backgroundColor: ClearColor = [0, 0, 0, 255],
): CelAddress[] | null {
  const targetGrid = indexTimelineAddress(document, targetAnchor, orderedCelLayerIds);
  if (!targetGrid) return null;
  const validatedClipboard = validateClipboard(clipboard);
  if (!validatedClipboard) return null;

  const targets: Array<{address: CelAddress; source: CelClipboardCell}> = [];
  const targetKeys = new Set<string>();
  for (const source of validatedClipboard) {
    const row = targetGrid.row + source.rowOffset;
    const column = targetGrid.column + source.columnOffset;
    if (row < 0 || row >= orderedCelLayerIds.length
      || column < 0 || column >= document.frames.length) return null;

    const address: CelAddress = {
      layerId: orderedCelLayerIds[row],
      frameId: document.frames[column].id,
    };
    const key = celKey(address.layerId, address.frameId);
    if (targetKeys.has(key)) return null;
    targetKeys.add(key);

    const layer = getLayerByID(document, address.layerId);
    if (!layer || !isCelLayer(layer) || isLayerEffectivelyLocked(document, layer)) return null;
    if (clipboardCellKind(source) === "tilemap" && !isTilemapLayer(layer)) return null;
    if (clipboardCellKind(source) === "image" && !isImageLayer(layer)) return null;
    targets.push({address, source});
  }
  if (targets.length === 0) return null;

  const nextTilesets = new Map<string, Tileset>();
  const tilemapContexts = new Map<string, TilemapPasteContext>();
  for (const target of targets) {
    if (clipboardCellKind(target.source) !== "tilemap") continue;
    const layer = getLayerByID(document, target.address.layerId);
    const sourceTileset = target.source.tileset;
    if (!layer || !isTilemapLayer(layer) || !layer.tilesetId || !sourceTileset || !target.source.tilemap) return null;
    const destinationTileset = nextTilesets.get(layer.tilesetId)
      ?? cloneTileset(document.tilesets.find((tileset) => tileset.id === layer.tilesetId)!);
    if (!destinationTileset || destinationTileset.tileWidth !== sourceTileset.tileWidth
      || destinationTileset.tileHeight !== sourceTileset.tileHeight) return null;
    nextTilesets.set(layer.tilesetId, destinationTileset);
    const contextKey = `${target.source.linkGroup}:${layer.tilesetId}`;
    if (!tilemapContexts.has(contextKey)) {
      const tileIDs = new Map<number, number>();
      if (!prepareTilemapTileIDs(target.source, sourceTileset, destinationTileset, tileIDs)) return null;
      tilemapContexts.set(contextKey, {tileset: destinationTileset, tileIDs});
    }
  }

  const continuousSources = new Map<string, Cel>();
  for (const target of targets) {
    const layer = getLayerByID(document, target.address.layerId);
    if (!layer) continue;
    const source = resolveContinuousSource(document, layer, target.source);
    if (source) continuousSources.set(celKey(target.address.layerId, target.address.frameId), source);
  }

  const groups = new Map<string, {linkId: string; pixels: Uint8ClampedArray; indexes?: Uint8Array; tilemap?: TilemapData}>();
  const plan: PlannedPaste[] = [];
  for (const target of targets) {
    const layer = getLayerByID(document, target.address.layerId)!;
    const kind = clipboardCellKind(target.source);
    const targetKey = celKey(target.address.layerId, target.address.frameId);
    const continuousSource = continuousSources.get(targetKey);
    if (continuousSource) {
      // Continuous paste links to the same-document source Cel. Keep the
      // clipboard's per-instance properties, but retain source geometry and
      // authoritative buffers so linked edits propagate as expected.
      const cel = {
        ...continuousSource,
        id: createCel(target.address.layerId, target.address.frameId, 1, 1).id,
        layerId: target.address.layerId,
        frameId: target.address.frameId,
        opacity: target.source.opacity,
        zIndex: target.source.zIndex,
        linkId: continuousSource.linkId,
        pixels: continuousSource.pixels,
        indexes: continuousSource.indexes,
        tilemap: continuousSource.tilemap,
      };
      plan.push({address: target.address, cel});
      continue;
    }

    const tilemapContext = kind === "tilemap"
      ? tilemapContexts.get(`${target.source.linkGroup}:${layer.tilesetId}`)
      : undefined;
    const copyMode = layer.continuous ? "continuous-copy" : "copy";
    const groupKey = kind === "tilemap"
      ? `${kind}:${target.source.linkGroup}:${layer.tilesetId}:${copyMode}`
      : `${kind}:${target.source.linkGroup}:${copyMode}:${layer.role === "background" ? "background" : ""}`;
    let group = groups.get(groupKey);
    if (!group) {
      const cel = kind === "tilemap"
        ? createCel(target.address.layerId, target.address.frameId, target.source.width, target.source.height)
        : createCel(target.address.layerId, target.address.frameId, document.width, document.height);
      cel.opacity = target.source.opacity;
      cel.zIndex = target.source.zIndex;
      if (kind === "tilemap") {
        if (!tilemapContext || !target.source.tilemap) return null;
        cel.x = target.source.x;
        cel.y = target.source.y;
        cel.tilemap = remapTilemap(target.source.tilemap, tilemapContext.tileIDs);
        cel.pixels = renderTilemapCel(cel, tilemapContext.tileset, {
          palette: document.colorMode === "indexed" ? document.palette.colors : undefined,
          transparentIndex: document.palette.transparentIndex,
        });
        cel.indexes = document.colorMode === "indexed"
          ? indexPixels(cel.pixels, document.palette.colors, document.palette.transparentIndex)
          : undefined;
      } else {
        copyCelSnapshotToCanvas(cel.pixels, document.width, document.height, target.source);
      }
      group = {linkId: cel.linkId, pixels: cel.pixels, indexes: cel.indexes, tilemap: cel.tilemap};
      groups.set(groupKey, group);
      plan.push({address: target.address, cel});
      continue;
    }

    const cel = kind === "tilemap"
      ? createCel(target.address.layerId, target.address.frameId, target.source.width, target.source.height)
      : createCel(target.address.layerId, target.address.frameId, document.width, document.height);
    cel.opacity = target.source.opacity;
    cel.zIndex = target.source.zIndex;
    cel.linkId = group.linkId;
    cel.pixels = group.pixels;
    cel.indexes = group.indexes;
    cel.x = target.source.x;
    cel.y = target.source.y;
    if (kind === "tilemap") cel.tilemap = group.tilemap;
    plan.push({address: target.address, cel});
  }

  const indexedLinks = new Map<string, Uint8Array>();
  for (const entry of plan) {
    const cel = entry.cel;
    if (isImageLayer(getLayerByID(document, entry.address.layerId)!) && getLayerByID(document, entry.address.layerId)?.role === "background") {
      cel.pixels = cel.pixels.slice();
      cel.linkId = createCel(cel.layerId, cel.frameId, 1, 1).linkId;
      for (let offset = 0; offset < cel.pixels.length; offset += 4) {
        const alpha = cel.pixels[offset + 3] / 255 * cel.opacity;
        for (let channel = 0; channel < 3; channel++) cel.pixels[offset + channel] = Math.round(cel.pixels[offset + channel] * alpha + backgroundColor[channel] * (1 - alpha));
        cel.pixels[offset + 3] = 255;
      }
      cel.opacity = 1;
      cel.zIndex = 0;
    }
    if (document.colorMode === "indexed" && !cel.tilemap && !continuousSources.has(celKey(entry.address.layerId, entry.address.frameId))) {
      let indexes = indexedLinks.get(cel.linkId);
      if (!indexes) {
        indexes = indexPixels(cel.pixels, document.palette.colors, document.palette.transparentIndex);
        renderIndexedPixels(indexes, cel.pixels, document.palette.colors, document.palette.transparentIndex);
        indexedLinks.set(cel.linkId, indexes);
      }
      cel.indexes = indexes;
    }
    document.cels[celKey(entry.address.layerId, entry.address.frameId)] = cel;
  }
  for (const [tilesetId, tileset] of nextTilesets) {
    const index = document.tilesets.findIndex((candidate) => candidate.id === tilesetId);
    if (index >= 0) document.tilesets[index] = tileset;
  }
  return plan.map(({address}) => address);
}

/**
 * Clears selected timeline cels. Background layers use the configured opaque
 * background color; ordinary layers use transparency. Linked selections
 * receive fresh shared buffers so aliases outside the selection retain data.
 */
export function clearCelSelection(
  document: PixelDocument,
  addresses: readonly CelAddress[],
  backgroundColor: ClearColor = [0, 0, 0, 255],
): boolean {
  if (!validAddressList(addresses)) return false;

  const selected = new Map<string, {cel: Cel; replacement: ClearColor; kind: "image" | "tilemap"}>();
  for (const address of addresses) {
    const layer = getLayerByID(document, address.layerId);
    if (!layer || !isCelLayer(layer) || isLayerEffectivelyLocked(document, layer)) return false;
    const frame = document.frames.find((candidate) => candidate.id === address.frameId);
    const cel = getCel(document, address.layerId, address.frameId);
    if (!frame || !validSourceCel(document, cel, address, layer)) return false;
    const key = celKey(address.layerId, address.frameId);
    if (selected.has(key)) return false;
    selected.set(key, {
      cel,
      kind: isTilemapLayer(layer) ? "tilemap" : "image",
      replacement: layer.role === "background"
        ? [backgroundColor[0], backgroundColor[1], backgroundColor[2], 255]
        : [0, 0, 0, 0],
    });
  }
  if (selected.size === 0) return false;

  const aliasCounts = countCelLinks(document);
  const selectedGroups = new Map<string, {cels: Cel[]; replacement: ClearColor; kind: "image" | "tilemap"}>();
  for (const {cel, replacement, kind} of selected.values()) {
    const groupKey = `${kind}:${cel.linkId}:${replacement.join(",")}`;
    const group = selectedGroups.get(groupKey) ?? {cels: [], replacement, kind};
    group.cels.push(cel);
    selectedGroups.set(groupKey, group);
  }

  const plan: PlannedClear[] = [];
  for (const {cels: group, replacement, kind} of selectedGroups.values()) {
    const linked = (aliasCounts.get(group[0].linkId) ?? 0) > 1;
    let tilemap: TilemapData | undefined;
    let pixels: Uint8ClampedArray;
    let indexes: Uint8Array | undefined;
    if (kind === "tilemap") {
      const layer = getLayerByID(document, group[0].layerId);
      if (!layer || !isTilemapLayer(layer) || !layer.tilesetId || !group[0].tilemap) return false;
      if (!group.every((cel) => cel.tilemap && sameTilemapGeometry(cel.tilemap, group[0].tilemap!))) return false;
      tilemap = {columns: group[0].tilemap.columns, rows: group[0].tilemap.rows, tiles: new Uint32Array(group[0].tilemap.tiles.length)};
      const tileset = document.tilesets.find((candidate) => candidate.id === layer.tilesetId);
      if (!tileset) return false;
      pixels = renderTilemapCel({...group[0], tilemap}, tileset, {
        palette: document.colorMode === "indexed" ? document.palette.colors : undefined,
        transparentIndex: document.palette.transparentIndex,
      });
      indexes = document.colorMode === "indexed"
        ? indexPixels(pixels, document.palette.colors, document.palette.transparentIndex)
        : undefined;
    } else {
      pixels = filledPixelBuffer(group[0].pixels.length, replacement);
      indexes = document.colorMode === "indexed"
        ? indexPixels(pixels, document.palette.colors, document.palette.transparentIndex, {
          width: group[0].width,
          height: group[0].height,
        })
        : undefined;
    }
    if (!linked) {
      const cel = group[0];
      if (bytesEqual(cel.pixels, pixels) && optionalBytesEqual(cel.indexes, indexes)
        && (!tilemap || sameTilemap(cel.tilemap, tilemap))) continue;
      plan.push({cel, pixels, indexes, tilemap, replaceBuffers: false});
      continue;
    }

    if (!sameGeometry(group)) return false;
    const freshLinkId = createCel(group[0].layerId, group[0].frameId, 1, 1).linkId;
    for (const cel of group) plan.push({cel, pixels, indexes, tilemap, linkId: freshLinkId, replaceBuffers: true});
  }

  if (plan.length === 0) return false;
  for (const operation of plan) {
    if (operation.replaceBuffers) {
      operation.cel.linkId = operation.linkId!;
      operation.cel.pixels = operation.pixels;
      operation.cel.indexes = operation.indexes;
      operation.cel.tilemap = operation.tilemap;
    } else {
      operation.cel.pixels.set(operation.pixels);
      if (operation.indexes) {
        if (operation.cel.indexes?.length === operation.indexes.length) operation.cel.indexes.set(operation.indexes);
        else operation.cel.indexes = operation.indexes;
      } else {
        operation.cel.indexes = undefined;
      }
      if (operation.tilemap) {
        if (operation.cel.tilemap && sameTilemapGeometry(operation.cel.tilemap, operation.tilemap)) operation.cel.tilemap.tiles.set(operation.tilemap.tiles);
        else operation.cel.tilemap = operation.tilemap;
      }
    }
  }
  return true;
}

function filledPixelBuffer(length: number, color: ClearColor) {
  const pixels = new Uint8ClampedArray(length);
  for (let offset = 0; offset < length; offset += 4) pixels.set(color, offset);
  return pixels;
}

function indexTimelineAddress(
  document: PixelDocument,
  address: CelAddress,
  orderedCelLayerIds: readonly string[],
): IndexedAddress | null {
  if (!validAddress(address) || !validLayerOrder(document, orderedCelLayerIds)) return null;
  const row = orderedCelLayerIds.indexOf(address.layerId);
  const column = document.frames.findIndex((frame) => frame.id === address.frameId);
  if (row < 0 || column < 0) return null;
  const layer = getLayerByID(document, address.layerId);
  if (!layer || !isCelLayer(layer)) return null;
  return {...address, row, column};
}

function validLayerOrder(document: PixelDocument, orderedCelLayerIds: readonly string[]) {
  if (orderedCelLayerIds.length === 0) return false;
  const seen = new Set<string>();
  for (const layerId of orderedCelLayerIds) {
    if (!validID(layerId) || seen.has(layerId)) return false;
    const layer = getLayerByID(document, layerId);
    if (!layer || !isCelLayer(layer)) return false;
    seen.add(layerId);
  }
  return true;
}

function validAddressList(addresses: readonly CelAddress[]) {
  return Array.isArray(addresses) && addresses.length > 0 && addresses.every(validAddress);
}

function validAddress(address: CelAddress): address is CelAddress {
  return Boolean(address) && validID(address.layerId) && validID(address.frameId);
}

function validID(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validSourceCel(document: PixelDocument, cel: Cel | null, address: CelAddress, layer: ReturnType<typeof getLayerByID>) {
  if (!cel || cel.layerId !== address.layerId || cel.frameId !== address.frameId || !validID(cel.linkId)) return false;
  if (!Number.isInteger(cel.x) || !Number.isInteger(cel.y)
    || !Number.isInteger(cel.width) || !Number.isInteger(cel.height)
    || cel.width <= 0 || cel.height <= 0
    || !Number.isSafeInteger(cel.width * cel.height * 4)
    || !(cel.pixels instanceof Uint8ClampedArray)
    || cel.pixels.length !== cel.width * cel.height * 4) return false;
  if (layer?.kind === "tilemap") {
    if (!layer.tilesetId || !cel.tilemap) return false;
    const tileset = document.tilesets.find((candidate) => candidate.id === layer.tilesetId);
    if (!tileset || cel.tilemap.columns !== Math.ceil(cel.width / tileset.tileWidth)
      || cel.tilemap.rows !== Math.ceil(cel.height / tileset.tileHeight)
      || cel.tilemap.tiles.length !== cel.tilemap.columns * cel.tilemap.rows) return false;
    const tileIDs = new Set(tileset.tiles.map((tile) => tile.id));
    if ([...cel.tilemap.tiles].some((value) => (value & tileIndexMask) !== 0 && !tileIDs.has(value & tileIndexMask))) return false;
  } else if (cel.tilemap !== undefined) {
    return false;
  }
  return true;
}

/**
 * Resolves the original Cel for a continuous paste when the clipboard still
 * points at this exact document. Cross-document and stale-origin pastes use
 * the detached snapshot instead, so clipboard contents remain deterministic.
 */
function resolveContinuousSource(
  document: PixelDocument,
  targetLayer: NonNullable<ReturnType<typeof getLayerByID>>,
  source: CelClipboardCell,
) {
  if (!targetLayer.continuous || targetLayer.role === "background" || !source.origin) return null;
  if (source.origin.document !== document) return null;

  const address = source.origin.address;
  const originLayer = getLayerByID(document, address.layerId);
  const originCel = getCel(document, address.layerId, address.frameId);
  if (!originLayer || !originCel || originLayer.role === "background"
    || !validSourceCel(document, originCel, address, originLayer)) return null;
  if (clipboardCellKind(source) === "tilemap" && (!isTilemapLayer(originLayer) || !isTilemapLayer(targetLayer)
    || originLayer.tilesetId !== targetLayer.tilesetId)) return null;
  if (clipboardCellKind(source) === "image" && !isImageLayer(originLayer)) return null;
  if (!sameClipboardSnapshotAsCel(source, originCel)) return null;

  if (clipboardCellKind(source) === "tilemap") {
    const tileset = originLayer.tilesetId
      ? document.tilesets.find((candidate) => candidate.id === originLayer.tilesetId)
      : undefined;
    if (!source.tileset || !tileset || !sameTileset(source.tileset, tileset)) return null;
  }
  return originCel;
}

function sameClipboardSnapshotAsCel(source: CelClipboardCell, cel: Cel) {
  return source.x === cel.x && source.y === cel.y
    && source.width === cel.width && source.height === cel.height
    && bytesEqual(source.pixels, cel.pixels)
    && optionalBytesEqual(source.indexes, cel.indexes)
    && sameTilemap(source.tilemap, cel.tilemap);
}

function sameCelSnapshot(first: SourceCell, cel: Cel) {
  if (first.x !== cel.x || first.y !== cel.y || first.width !== cel.width || first.height !== cel.height) return false;
  return bytesEqual(first.pixels, cel.pixels)
    && optionalBytesEqual(first.indexes, cel.indexes)
    && sameTilemap(first.tilemap, cel.tilemap);
}

function sameGeometry(cels: readonly Cel[]) {
  const first = cels[0];
  return cels.every((cel) => cel.x === first.x && cel.y === first.y
    && cel.width === first.width && cel.height === first.height
    && cel.pixels.length === first.pixels.length);
}

function validateClipboard(clipboard: CelClipboard): CelClipboardCell[] | null {
  if (!clipboard || !Array.isArray(clipboard.cells) || clipboard.cells.length === 0) return null;
  const offsets = new Set<string>();
  const groups = new Map<string, CelClipboardCell>();
  const cells: CelClipboardCell[] = [];
  for (const cell of clipboard.cells) {
    if (!validClipboardCell(cell)) return null;
    const offsetKey = `${cell.rowOffset}:${cell.columnOffset}`;
    if (offsets.has(offsetKey)) return null;
    offsets.add(offsetKey);
    const existing = groups.get(cell.linkGroup);
    if (existing && !sameClipboardSnapshot(existing, cell)) return null;
    if (!existing) groups.set(cell.linkGroup, cell);
    cells.push(cell);
  }
  return cells;
}

function validClipboardCell(cell: CelClipboardCell) {
  const kind = clipboardCellKind(cell);
  if (kind !== "image" && kind !== "tilemap") return false;
  if (kind === "tilemap" && (!cell.tilemap || !cell.tileset
    || cell.tilemap.columns !== Math.ceil(cell.width / cell.tileset.tileWidth)
    || cell.tilemap.rows !== Math.ceil(cell.height / cell.tileset.tileHeight)
    || !validTilemapSnapshot(cell.tilemap, cell.tileset))) return false;
  if (kind === "image" && (cell.tilemap !== undefined || cell.tileset !== undefined)) return false;
  return Boolean(cell)
    && Number.isFinite(cell.opacity) && cell.opacity >= 0 && cell.opacity <= 1
    && Number.isInteger(cell.zIndex) && cell.zIndex >= -32768 && cell.zIndex <= 32767
    && Number.isInteger(cell.rowOffset) && Number.isInteger(cell.columnOffset)
    && Number.isInteger(cell.x) && Number.isInteger(cell.y)
    && Number.isInteger(cell.width) && Number.isInteger(cell.height)
    && cell.width > 0 && cell.height > 0
    && Number.isSafeInteger(cell.width * cell.height * 4)
    && validID(cell.linkGroup)
    && cell.pixels instanceof Uint8ClampedArray
    && cell.pixels.length === cell.width * cell.height * 4;
}

function sameClipboardSnapshot(first: CelClipboardCell, cell: CelClipboardCell) {
  return first.x === cell.x && first.y === cell.y
    && first.width === cell.width && first.height === cell.height
    && clipboardCellKind(first) === clipboardCellKind(cell)
    && bytesEqual(first.pixels, cell.pixels)
    && optionalBytesEqual(first.indexes, cell.indexes)
    && sameTilemap(first.tilemap, cell.tilemap)
    && sameTileset(first.tileset, cell.tileset);
}

function clipboardCellKind(cell: Pick<CelClipboardCell, "kind" | "tilemap">): "image" | "tilemap" {
  return cell.kind ?? (cell.tilemap ? "tilemap" : "image");
}

function validTilemapSnapshot(tilemap: TilemapData, tileset: Tileset) {
  if (!Number.isInteger(tilemap.columns) || !Number.isInteger(tilemap.rows)
    || tilemap.columns <= 0 || tilemap.rows <= 0
    || !(tilemap.tiles instanceof Uint32Array)
    || tilemap.tiles.length !== tilemap.columns * tilemap.rows
    || !Number.isInteger(tileset.tileWidth) || !Number.isInteger(tileset.tileHeight)
    || tileset.tileWidth <= 0 || tileset.tileHeight <= 0) return false;
  if (!Array.isArray(tileset.tiles) || tileset.tiles.some((tile) => !Number.isInteger(tile.id) || tile.id <= 0
    || !(tile.pixels instanceof Uint8ClampedArray)
    || tile.pixels.length !== tileset.tileWidth * tileset.tileHeight * 4
    || (tile.indexes !== undefined && (!(tile.indexes instanceof Uint8Array)
      || tile.indexes.length !== tileset.tileWidth * tileset.tileHeight)))) return false;
  const tileIDs = new Set(tileset.tiles.map((tile) => tile.id));
  return [...tilemap.tiles].every((value) => (value & tileIndexMask) === 0 || tileIDs.has(value & tileIndexMask));
}

function prepareTilemapTileIDs(
  source: CelClipboardCell,
  sourceTileset: Tileset,
  destinationTileset: Tileset,
  tileIDs: Map<number, number>,
) {
  if (!source.tilemap || !validTilemapSnapshot(source.tilemap, sourceTileset)) return false;
  const referenced = new Set<number>();
  for (const value of source.tilemap.tiles) {
    const id = value & tileIndexMask;
    if (id !== 0) referenced.add(id);
  }
  for (const id of referenced) {
    if (tileIDs.has(id)) continue;
    const sourceTile = sourceTileset.tiles.find((tile) => tile.id === id);
    if (!sourceTile) return false;
    const existing = destinationTileset.tiles.find((tile) => tilesEqual(tile, sourceTile));
    if (existing) {
      tileIDs.set(id, existing.id);
      continue;
    }
    const nextID = nextTileID(destinationTileset);
    destinationTileset.tiles.push({
      ...sourceTile,
      id: nextID,
      pixels: sourceTile.pixels.slice(),
      indexes: sourceTile.indexes?.slice(),
    });
    tileIDs.set(id, nextID);
  }
  return true;
}

function remapTilemap(tilemap: TilemapData, tileIDs: ReadonlyMap<number, number>): TilemapData {
  return {
    columns: tilemap.columns,
    rows: tilemap.rows,
    tiles: Uint32Array.from(tilemap.tiles, (value) => {
      const id = value & tileIndexMask;
      if (id === 0) return value >>> 0;
      const mapped = tileIDs.get(id);
      if (mapped === undefined) throw new Error("Tilemap clipboard references an unknown tile");
      return ((value & ~tileIndexMask) | mapped) >>> 0;
    }),
  };
}

function cloneTilemap(tilemap: TilemapData): TilemapData {
  return {...tilemap, tiles: tilemap.tiles.slice()};
}

function cloneTileset(tileset: Tileset): Tileset {
  return {
    ...tileset,
    tiles: tileset.tiles.map((tile) => ({...tile, pixels: tile.pixels.slice(), indexes: tile.indexes?.slice()})),
  };
}

function tilesEqual(left: Tile, right: Tile) {
  return bytesEqual(left.pixels, right.pixels)
    && optionalBytesEqual(left.indexes, right.indexes);
}

function sameTilemap(left: TilemapData | undefined, right: TilemapData | undefined) {
  if (left === undefined || right === undefined) return left === right;
  return sameTilemapGeometry(left, right) && bytesEqual(left.tiles, right.tiles);
}

function sameTilemapGeometry(left: TilemapData, right: TilemapData) {
  return left.columns === right.columns && left.rows === right.rows && left.tiles.length === right.tiles.length;
}

function sameTileset(left: Tileset | undefined, right: Tileset | undefined) {
  if (left === undefined || right === undefined) return left === right;
  return left.tileWidth === right.tileWidth && left.tileHeight === right.tileHeight
    && left.tiles.length === right.tiles.length
    && left.tiles.every((tile, index) => tile.id === right.tiles[index].id && tilesEqual(tile, right.tiles[index]));
}

function nextTileID(tileset: Tileset) {
  const used = new Set(tileset.tiles.map((tile) => tile.id));
  let id = 1;
  while (used.has(id)) id += 1;
  if (id > tileIndexMask) throw new Error("Tileset has reached its tile limit");
  return id;
}

function copyCelSnapshotToCanvas(
  target: Uint8ClampedArray,
  targetWidth: number,
  targetHeight: number,
  source: Pick<CelClipboardCell, "x" | "y" | "width" | "height" | "pixels">,
) {
  const sourceLeft = Math.max(0, -source.x);
  const sourceTop = Math.max(0, -source.y);
  const sourceRight = Math.min(source.width, targetWidth - source.x);
  const sourceBottom = Math.min(source.height, targetHeight - source.y);
  if (sourceRight <= sourceLeft || sourceBottom <= sourceTop) return;

  const copyWidth = sourceRight - sourceLeft;
  for (let row = sourceTop; row < sourceBottom; row += 1) {
    const sourceStart = (row * source.width + sourceLeft) * 4;
    const targetStart = ((source.y + row) * targetWidth + source.x + sourceLeft) * 4;
    target.set(source.pixels.subarray(sourceStart, sourceStart + copyWidth * 4), targetStart);
  }
}

function countCelLinks(document: PixelDocument) {
  const counts = new Map<string, number>();
  for (const cel of Object.values(document.cels)) counts.set(cel.linkId, (counts.get(cel.linkId) ?? 0) + 1);
  return counts;
}

function optionalBytesEqual(left: Uint8Array | undefined, right: Uint8Array | undefined) {
  return left === undefined ? right === undefined : right !== undefined && bytesEqual(left, right);
}

function bytesEqual(left: ArrayLike<number>, right: ArrayLike<number>) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

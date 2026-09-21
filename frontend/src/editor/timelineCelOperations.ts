import {
  celKey,
  ensureCel,
  getCel,
  getLayerByID,
  isImageLayer,
  isCelLayer,
  isLayerEffectivelyLocked,
  type Cel,
  type Layer,
  type PixelDocument,
} from "./document";
import {syncIndexedCel} from "./colorModes";

/** A cell coordinate in the timeline grid. */
export interface TimelineCelAddress {
  layerId: string;
  frameId: string;
}

export type TimelineCelTransferMode = "move" | "copy";

export interface TimelineCelTransferOptions {
  sourceAddresses: readonly TimelineCelAddress[];
  sourceAnchor: TimelineCelAddress;
  /** Existing destination cell. Omit this when dropping into the append slot. */
  targetAnchor?: TimelineCelAddress;
  /** Visible row used with an append-slot destination. */
  targetLayerId?: string;
  /** Zero-based destination frame column. Values at/after the current end append frames. */
  targetFrameIndex?: number;
  /** Visible cel-capable rows in timeline order. */
  orderedLayerIds: readonly string[];
  mode: TimelineCelTransferMode;
  /** Duplicate Cels may target the document background row. */
  allowBackground?: boolean;
  /** Force copied Cels to share the source buffer and linkId. */
  linkSource?: boolean;
  /** Fill newly appended background Cels with this opaque RGB color. */
  backgroundColor?: readonly [number, number, number, number];
}

export interface TimelineCelTransferResult {
  sourceAddresses: TimelineCelAddress[];
  targetAddresses: TimelineCelAddress[];
  /** Frames appended to satisfy a destination beyond the current timeline end. */
  createdFrameIds: string[];
}

export interface DuplicateTimelineCelsOptions {
  sourceAddresses: readonly TimelineCelAddress[];
  sourceAnchor: TimelineCelAddress;
  /** Visible cel-capable rows in timeline order. */
  orderedLayerIds: readonly string[];
  /** Destination column; defaults to the column immediately after the anchor. */
  targetFrameIndex?: number;
  /** Explicit Duplicate Linked Cels behavior. */
  linkSource?: boolean;
  /** Fill newly appended background Cels with this opaque RGB color. */
  backgroundColor?: readonly [number, number, number, number];
}

interface IndexedAddress extends TimelineCelAddress {
  row: number;
  column: number;
}

interface PlannedTransfer {
  source: Cel;
  sourceAddress: TimelineCelAddress;
  targetAddress: TimelineCelAddress;
  targetFrameColumn: number;
  sourceLayer: Layer;
  targetLayer: Layer;
}

interface LinkGroupBuffers {
  linkId: string;
  pixels: Uint8ClampedArray;
  indexes?: Uint8Array;
  tilemap?: Cel["tilemap"];
  terrainmap?: Cel["terrainmap"];
}

/**
 * Moves or copies existing Cels inside the timeline grid.
 *
 * This is deliberately separate from canvas-space Cel transforms: frame and
 * layer coordinates change, while each Cel's x/y and pixel geometry stay
 * intact. The operation is transactional; all source/target addresses and
 * layer compatibility are validated before changing the document.
 *
 * Existing frame destinations retain their normal behavior. An append-slot
 * destination is represented by `targetFrameIndex` and creates only the
 * missing empty frames needed by the transfer. The caller owns tab-local loop
 * and selection state so those changes can be captured in the same history
 * command as the document mutation.
 */
export function transferTimelineCels(
  document: PixelDocument,
  options: TimelineCelTransferOptions,
): TimelineCelTransferResult | null {
  const sourceAddresses = uniqueAddresses(options.sourceAddresses);
  if (sourceAddresses.length === 0 || !validAddress(options.sourceAnchor)) return null;
  if (!sourceAddresses.some((address) => sameAddress(address, options.sourceAnchor))) return null;

  const sourceGrid = indexAddress(document, options.sourceAnchor, options.orderedLayerIds);
  if (!sourceGrid || !isTransferMode(options.mode)) return null;
  const targetGrid = options.targetAnchor
    ? indexAddress(document, options.targetAnchor, options.orderedLayerIds)
    : null;
  const explicitTargetColumn = options.targetFrameIndex;
  if (!targetGrid && (!validString(options.targetLayerId)
    || !Number.isInteger(explicitTargetColumn) || explicitTargetColumn! < 0)) return null;
  if (targetGrid && explicitTargetColumn !== undefined && explicitTargetColumn !== targetGrid.column) return null;
  if (targetGrid && options.targetLayerId !== undefined && options.targetLayerId !== targetGrid.layerId) return null;
  const targetRow = targetGrid?.row ?? options.orderedLayerIds.indexOf(options.targetLayerId!);
  const targetColumn = targetGrid?.column ?? explicitTargetColumn!;
  if (targetRow < 0 || targetRow >= options.orderedLayerIds.length) return null;

  const plans: PlannedTransfer[] = [];
  const sourceKeys = new Set<string>();
  const targetKeys = new Set<string>();
  const targetFrameDurations = new Map<number, number>();
  let maximumTargetColumn = targetColumn;
  for (const sourceAddress of sourceAddresses) {
    const sourceGridAddress = indexAddress(document, sourceAddress, options.orderedLayerIds);
    const source = getCel(document, sourceAddress.layerId, sourceAddress.frameId);
    const sourceLayer = getLayerByID(document, sourceAddress.layerId);
    if (!sourceGridAddress || !source || !sourceLayer || !editableCelLayer(sourceLayer, options.allowBackground)) return null;

    const destinationRow = targetRow + sourceGridAddress.row - sourceGrid.row;
    const destinationColumn = targetColumn + sourceGridAddress.column - sourceGrid.column;
    if (destinationRow < 0 || destinationRow >= options.orderedLayerIds.length || destinationColumn < 0) return null;

    const targetAddress: TimelineCelAddress = {
      layerId: options.orderedLayerIds[destinationRow],
      frameId: document.frames[destinationColumn]?.id ?? "",
    };
    targetFrameDurations.set(destinationColumn, document.frames[sourceGridAddress.column].durationMs);
    maximumTargetColumn = Math.max(maximumTargetColumn, destinationColumn);
    const targetLayer = getLayerByID(document, targetAddress.layerId);
    if (!targetLayer || !compatibleCelLayers(document, source, sourceLayer, targetLayer, options.allowBackground)) return null;

    const sourceKey = celKey(sourceAddress.layerId, sourceAddress.frameId);
    const targetKey = `${targetAddress.layerId}:${destinationColumn}`;
    if (sourceKeys.has(sourceKey) || targetKeys.has(targetKey)) return null;
    sourceKeys.add(sourceKey);
    targetKeys.add(targetKey);
    plans.push({source, sourceAddress, targetAddress, targetFrameColumn: destinationColumn, sourceLayer, targetLayer});
  }

  if (plans.length === 0) return null;

  const createdFrames = appendMissingFrames(document, maximumTargetColumn + 1, targetFrameDurations, options.backgroundColor);
  // The initial plan is built before appending so source offsets can be
  // validated atomically. Resolve frame IDs only after the append is complete.
  for (const plan of plans) {
    const frame = document.frames[plan.targetFrameColumn];
    if (!frame) return null;
    plan.targetAddress.frameId = frame.id;
  }
  if (sameAddressSet(sourceAddresses, plans.map(({targetAddress}) => targetAddress))) return null;

  const copiedGroups = new Map<string, LinkGroupBuffers>();
  const replacements = plans.map((plan) => {
    if (options.mode === "move") {
      const moved = {
        ...plan.source,
        layerId: plan.targetAddress.layerId,
        frameId: plan.targetAddress.frameId,
      } satisfies Cel;
      return normalizeTargetCel(moved, plan.targetLayer);
    }

    // New/duplicate Cels on a continuous layer retain the source alias. The
    // explicit linked variant applies the same rule even when the layer is
    // not marked continuous.
    if (options.linkSource || (plan.sourceLayer.id === plan.targetLayer.id && plan.sourceLayer.continuous)) {
      const linked = {
        ...plan.source,
        id: createCelID(),
        linkId: plan.source.linkId,
        layerId: plan.targetAddress.layerId,
        frameId: plan.targetAddress.frameId,
        pixels: plan.source.pixels,
        indexes: plan.source.indexes,
        tilemap: plan.source.tilemap,
        terrainmap: plan.source.terrainmap,
      } satisfies Cel;
      return normalizeTargetCel(linked, plan.targetLayer);
    }

    let group = copiedGroups.get(plan.source.linkId);
    if (!group) {
      group = {
        linkId: createLinkID(),
        pixels: plan.source.pixels.slice(),
        indexes: plan.source.indexes?.slice(),
        tilemap: plan.source.tilemap
          ? {...plan.source.tilemap, tiles: plan.source.tilemap.tiles.slice()}
          : undefined,
        terrainmap: plan.source.terrainmap
          ? {...plan.source.terrainmap, terrains: plan.source.terrainmap.terrains.slice()}
          : undefined,
      };
      copiedGroups.set(plan.source.linkId, group);
    }
    const copied = {
      ...plan.source,
      id: createCelID(),
      linkId: group.linkId,
      layerId: plan.targetAddress.layerId,
      frameId: plan.targetAddress.frameId,
      pixels: group.pixels,
      indexes: group.indexes,
      tilemap: group.tilemap,
      terrainmap: group.terrainmap,
    } satisfies Cel;
    return normalizeTargetCel(copied, plan.targetLayer);
  });

  // Remove every source first. This makes overlapping moves (for example
  // frame 1 -> 2 and frame 2 -> 3) deterministic and lossless.
  if (options.mode === "move") {
    for (const plan of plans) delete document.cels[celKey(plan.sourceAddress.layerId, plan.sourceAddress.frameId)];
  }
  for (const [index, plan] of plans.entries()) {
    document.cels[celKey(plan.targetAddress.layerId, plan.targetAddress.frameId)] = replacements[index];
  }

  return {
    sourceAddresses: plans.map(({sourceAddress}) => ({...sourceAddress})),
    targetAddresses: plans.map(({targetAddress}) => ({...targetAddress})),
    createdFrameIds: createdFrames.map((frame) => frame.id),
  };
}

/**
 * Duplicates a timeline Cel selection one frame to the right by default.
 * Continuous layers retain the source alias; ordinary layers receive
 * independent buffers while selected source links remain shared inside the
 * duplicated selection. Sparse rows stay sparse and the append slot creates
 * the required destination frames.
 */
export function duplicateTimelineCels(
  document: PixelDocument,
  options: DuplicateTimelineCelsOptions,
) {
  const anchor = indexAddress(document, options.sourceAnchor, options.orderedLayerIds);
  if (!anchor) return null;
  const targetFrameIndex = options.targetFrameIndex ?? anchor.column + 1;
  if (!Number.isInteger(targetFrameIndex) || targetFrameIndex < 0) return null;
  return transferTimelineCels(document, {
    sourceAddresses: options.sourceAddresses,
    sourceAnchor: options.sourceAnchor,
    targetLayerId: options.sourceAnchor.layerId,
    targetFrameIndex,
    orderedLayerIds: options.orderedLayerIds,
    mode: "copy",
    allowBackground: true,
    linkSource: options.linkSource,
    backgroundColor: options.backgroundColor,
  });
}

/** Explicit Duplicate Linked Cels operation used by the Sprite/Timeline UI. */
export function duplicateLinkedTimelineCels(
  document: PixelDocument,
  options: Omit<DuplicateTimelineCelsOptions, "linkSource">,
) {
  return duplicateTimelineCels(document, {...options, linkSource: true});
}

function appendMissingFrames(
  document: PixelDocument,
  requiredCount: number,
  durationByColumn: ReadonlyMap<number, number>,
  backgroundColor?: readonly [number, number, number, number],
) {
  const created: Array<{id: string; durationMs: number}> = [];
  const fallbackDuration = document.frames.at(-1)?.durationMs ?? 100;
  while (document.frames.length < requiredCount) {
    const column = document.frames.length;
    const frame = {
      id: `frame-${crypto.randomUUID()}`,
      durationMs: Math.max(1, Math.round(durationByColumn.get(column) ?? fallbackDuration)),
    };
    document.frames.push(frame);
    materializeBackgroundCels(document, frame.id, backgroundColor);
    created.push(frame);
  }
  return created;
}

function materializeBackgroundCels(
  document: PixelDocument,
  frameId: string,
  backgroundColor?: readonly [number, number, number, number],
) {
  for (const layer of document.layers) {
    if (!isImageLayer(layer) || layer.role !== "background") continue;
    const cel = ensureCel(document, layer.id, frameId);
    if (!cel) continue;
    cel.opacity = 1;
    cel.zIndex = 0;
    if (!backgroundColor) continue;
    for (let offset = 0; offset < cel.pixels.length; offset += 4) {
      cel.pixels[offset] = backgroundColor[0];
      cel.pixels[offset + 1] = backgroundColor[1];
      cel.pixels[offset + 2] = backgroundColor[2];
      cel.pixels[offset + 3] = 255;
    }
    if (document.colorMode === "indexed") syncIndexedCel(document, cel);
  }
}

function normalizeTargetCel(cel: Cel, targetLayer: Layer) {
  if (targetLayer.role === "background") {
    cel.opacity = 1;
    cel.zIndex = 0;
  }
  return cel;
}

function validString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function indexAddress(document: PixelDocument, address: TimelineCelAddress, orderedLayerIds: readonly string[]): IndexedAddress | null {
  if (!validAddress(address)) return null;
  const row = orderedLayerIds.indexOf(address.layerId);
  const column = document.frames.findIndex((frame) => frame.id === address.frameId);
  if (row < 0 || column < 0) return null;
  const layer = getLayerByID(document, address.layerId);
  if (!layer || !isCelLayer(layer)) return null;
  return {...address, row, column};
}

function editableCelLayer(layer: Layer, allowBackground = false) {
  return isCelLayer(layer) && (allowBackground || layer.role !== "background") && !isLayerEffectivelyLockedForLayer(layer);
}

function isLayerEffectivelyLockedForLayer(layer: Layer) {
  // Parent lock is checked by the document-level helper below. This local
  // guard keeps the layer role test obvious and is completed per target in
  // compatibleCelLayers.
  return layer.locked;
}

function compatibleCelLayers(
  document: PixelDocument,
  source: Cel,
  sourceLayer: Layer,
  targetLayer: Layer,
  allowBackground = false,
) {
  if (!editableCelLayer(targetLayer, allowBackground) || isLayerEffectivelyLocked(document, sourceLayer) || isLayerEffectivelyLocked(document, targetLayer)) return false;
  if (sourceLayer.kind !== targetLayer.kind) return false;
  if (sourceLayer.kind === "tilemap" && sourceLayer.tilesetId !== targetLayer.tilesetId) return false;
  if (sourceLayer.kind === "tilemap" && !source.tilemap) return false;
  return true;
}

function uniqueAddresses(addresses: readonly TimelineCelAddress[]) {
  const seen = new Set<string>();
  const output: TimelineCelAddress[] = [];
  for (const address of addresses) {
    if (!validAddress(address)) continue;
    const key = celKey(address.layerId, address.frameId);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({...address});
  }
  return output;
}

function sameAddress(left: TimelineCelAddress, right: TimelineCelAddress) {
  return left.layerId === right.layerId && left.frameId === right.frameId;
}

function sameAddressSet(left: readonly TimelineCelAddress[], right: readonly TimelineCelAddress[]) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right.map((address) => celKey(address.layerId, address.frameId)));
  return left.every((address) => rightSet.has(celKey(address.layerId, address.frameId)));
}

function validAddress(address: TimelineCelAddress): address is TimelineCelAddress {
  return Boolean(address) && typeof address.layerId === "string" && address.layerId.length > 0
    && typeof address.frameId === "string" && address.frameId.length > 0;
}

function isTransferMode(value: unknown): value is TimelineCelTransferMode {
  return value === "move" || value === "copy";
}

function createCelID() {
  return `cel-${crypto.randomUUID()}`;
}

function createLinkID() {
  return `link-${crypto.randomUUID()}`;
}

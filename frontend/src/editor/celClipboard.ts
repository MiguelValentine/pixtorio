import {
  celKey,
  createCel,
  getCel,
  getLayerByID,
  isImageLayer,
  isLayerEffectivelyLocked,
  type Cel,
  type PixelDocument,
} from "./document";
import {indexPixels, renderIndexedPixels} from "./colorModes";

/** A layer/frame coordinate in the timeline cell grid. */
export interface CelAddress {
  layerId: string;
  frameId: string;
}

export interface CelClipboardCell {
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
  /** Cells with the same source linkId share this clipboard group. */
  linkGroup: string;
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

interface PlannedClear {
  cel: Cel;
  pixels: Uint8ClampedArray;
  indexes?: Uint8Array;
  linkId?: string;
  replaceBuffers: boolean;
}

type ClearColor = readonly [number, number, number, number];

/**
 * Copies a sparse rectangular-timeline cell selection into an independent
 * clipboard snapshot. Rows are image layers and columns are document frames.
 */
export function copyCelSelection(
  document: PixelDocument,
  addresses: readonly CelAddress[],
  anchor: CelAddress,
  orderedImageLayerIds: readonly string[],
): CelClipboard | null {
  const grid = indexTimelineAddress(document, anchor, orderedImageLayerIds);
  if (!grid || !validAddressList(addresses)) return null;

  const seen = new Set<string>();
  const linkGroups = new Map<string, SourceCell>();
  const cells: CelClipboardCell[] = [];
  for (const address of addresses) {
    const indexed = indexTimelineAddress(document, address, orderedImageLayerIds);
    if (!indexed) return null;
    const key = celKey(address.layerId, address.frameId);
    if (seen.has(key)) return null;
    seen.add(key);

    const source = getCel(document, address.layerId, address.frameId);
    if (!validSourceCel(source, address)) return null;

    const existing = linkGroups.get(source.linkId);
    if (existing && !sameCelSnapshot(existing, source)) return null;
    const snapshot: SourceCell = {
      source,
      opacity: source.opacity,
      zIndex: source.zIndex,
      rowOffset: indexed.row - grid.row,
      columnOffset: indexed.column - grid.column,
      x: source.x,
      y: source.y,
      width: source.width,
      height: source.height,
      pixels: source.pixels.slice(),
      linkGroup: source.linkId,
    };
    if (!existing) linkGroups.set(source.linkId, snapshot);
    cells.push(snapshot);
  }

  return cells.length > 0 ? {
    cells: cells.map((cell): CelClipboardCell => ({
      opacity: cell.opacity,
      zIndex: cell.zIndex,
      rowOffset: cell.rowOffset,
      columnOffset: cell.columnOffset,
      x: cell.x,
      y: cell.y,
      width: cell.width,
      height: cell.height,
      pixels: cell.pixels,
      linkGroup: cell.linkGroup,
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
  orderedImageLayerIds: readonly string[],
  backgroundColor: ClearColor = [0, 0, 0, 255],
): CelAddress[] | null {
  const targetGrid = indexTimelineAddress(document, targetAnchor, orderedImageLayerIds);
  if (!targetGrid) return null;
  const validatedClipboard = validateClipboard(clipboard);
  if (!validatedClipboard) return null;

  const targets: Array<{address: CelAddress; source: CelClipboardCell}> = [];
  const targetKeys = new Set<string>();
  for (const source of validatedClipboard) {
    const row = targetGrid.row + source.rowOffset;
    const column = targetGrid.column + source.columnOffset;
    if (row < 0 || row >= orderedImageLayerIds.length
      || column < 0 || column >= document.frames.length) return null;

    const address: CelAddress = {
      layerId: orderedImageLayerIds[row],
      frameId: document.frames[column].id,
    };
    const key = celKey(address.layerId, address.frameId);
    if (targetKeys.has(key)) return null;
    targetKeys.add(key);

    const layer = getLayerByID(document, address.layerId);
    if (!layer || !isImageLayer(layer) || isLayerEffectivelyLocked(document, layer)) return null;
    targets.push({address, source});
  }
  if (targets.length === 0) return null;

  const groups = new Map<string, {linkId: string; pixels: Uint8ClampedArray}>();
  const plan: PlannedPaste[] = [];
  for (const target of targets) {
    let group = groups.get(target.source.linkGroup);
    if (!group) {
      const cel = createCel(target.address.layerId, target.address.frameId, document.width, document.height);
      cel.opacity = target.source.opacity;
      cel.zIndex = target.source.zIndex;
      copyCelSnapshotToCanvas(cel.pixels, document.width, document.height, target.source);
      group = {linkId: cel.linkId, pixels: cel.pixels};
      groups.set(target.source.linkGroup, group);
      plan.push({address: target.address, cel});
      continue;
    }

    const cel = createCel(target.address.layerId, target.address.frameId, document.width, document.height);
    cel.opacity = target.source.opacity;
    cel.zIndex = target.source.zIndex;
    cel.linkId = group.linkId;
    cel.pixels = group.pixels;
    plan.push({address: target.address, cel});
  }

  const indexedLinks = new Map<string, Uint8Array>();
  for (const entry of plan) {
    const cel = entry.cel;
    if (getLayerByID(document, entry.address.layerId)?.role === "background") {
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
    if (document.colorMode === "indexed") {
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

  const selected = new Map<string, {cel: Cel; replacement: ClearColor}>();
  for (const address of addresses) {
    const layer = getLayerByID(document, address.layerId);
    if (!layer || !isImageLayer(layer) || isLayerEffectivelyLocked(document, layer)) return false;
    const frame = document.frames.find((candidate) => candidate.id === address.frameId);
    const cel = getCel(document, address.layerId, address.frameId);
    if (!frame || !validSourceCel(cel, address)) return false;
    const key = celKey(address.layerId, address.frameId);
    if (selected.has(key)) return false;
    selected.set(key, {
      cel,
      replacement: layer.role === "background"
        ? [backgroundColor[0], backgroundColor[1], backgroundColor[2], 255]
        : [0, 0, 0, 0],
    });
  }
  if (selected.size === 0) return false;

  const aliasCounts = countCelLinks(document);
  const selectedGroups = new Map<string, {cels: Cel[]; replacement: ClearColor}>();
  for (const {cel, replacement} of selected.values()) {
    const groupKey = `${cel.linkId}:${replacement.join(",")}`;
    const group = selectedGroups.get(groupKey) ?? {cels: [], replacement};
    group.cels.push(cel);
    selectedGroups.set(groupKey, group);
  }

  const plan: PlannedClear[] = [];
  for (const {cels: group, replacement} of selectedGroups.values()) {
    const linked = (aliasCounts.get(group[0].linkId) ?? 0) > 1;
    const pixels = filledPixelBuffer(group[0].pixels.length, replacement);
    const indexes = document.colorMode === "indexed"
      ? indexPixels(pixels, document.palette.colors, document.palette.transparentIndex, {
        width: group[0].width,
        height: group[0].height,
      })
      : undefined;
    if (!linked) {
      const cel = group[0];
      if (bytesEqual(cel.pixels, pixels) && optionalBytesEqual(cel.indexes, indexes)) continue;
      plan.push({cel, pixels, indexes, replaceBuffers: false});
      continue;
    }

    if (!sameGeometry(group)) return false;
    const freshLinkId = createCel(group[0].layerId, group[0].frameId, 1, 1).linkId;
    for (const cel of group) plan.push({cel, pixels, indexes, linkId: freshLinkId, replaceBuffers: true});
  }

  if (plan.length === 0) return false;
  for (const operation of plan) {
    if (operation.replaceBuffers) {
      operation.cel.linkId = operation.linkId!;
      operation.cel.pixels = operation.pixels;
      operation.cel.indexes = operation.indexes;
    } else {
      operation.cel.pixels.set(operation.pixels);
      if (operation.indexes) {
        if (operation.cel.indexes?.length === operation.indexes.length) operation.cel.indexes.set(operation.indexes);
        else operation.cel.indexes = operation.indexes;
      } else {
        operation.cel.indexes = undefined;
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
  orderedImageLayerIds: readonly string[],
): IndexedAddress | null {
  if (!validAddress(address) || !validLayerOrder(document, orderedImageLayerIds)) return null;
  const row = orderedImageLayerIds.indexOf(address.layerId);
  const column = document.frames.findIndex((frame) => frame.id === address.frameId);
  if (row < 0 || column < 0) return null;
  const layer = getLayerByID(document, address.layerId);
  if (!layer || !isImageLayer(layer)) return null;
  return {...address, row, column};
}

function validLayerOrder(document: PixelDocument, orderedImageLayerIds: readonly string[]) {
  if (orderedImageLayerIds.length === 0) return false;
  const seen = new Set<string>();
  for (const layerId of orderedImageLayerIds) {
    if (!validID(layerId) || seen.has(layerId)) return false;
    const layer = getLayerByID(document, layerId);
    if (!layer || !isImageLayer(layer)) return false;
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

function validSourceCel(cel: Cel | null, address: CelAddress) {
  if (!cel || cel.layerId !== address.layerId || cel.frameId !== address.frameId || !validID(cel.linkId)) return false;
  if (!Number.isInteger(cel.x) || !Number.isInteger(cel.y)
    || !Number.isInteger(cel.width) || !Number.isInteger(cel.height)
    || cel.width <= 0 || cel.height <= 0
    || !Number.isSafeInteger(cel.width * cel.height * 4)
    || !(cel.pixels instanceof Uint8ClampedArray)
    || cel.pixels.length !== cel.width * cel.height * 4) return false;
  return true;
}

function sameCelSnapshot(first: SourceCell, cel: Cel) {
  if (first.x !== cel.x || first.y !== cel.y || first.width !== cel.width || first.height !== cel.height) return false;
  return bytesEqual(first.pixels, cel.pixels);
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
    && bytesEqual(first.pixels, cell.pixels);
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

import {
  celKey,
  isCelLayer,
  type Cel,
  type PixelDocument,
} from "./document";

/**
 * The address of one image cel in the timeline.
 *
 * This intentionally uses the same fields as document's CelAddress contract.
 * Keeping the address independent from the Cel payload makes selection state
 * cheap to persist and safe to use after a cel buffer is replaced.
 */
export type CelAddress = Pick<Cel, "layerId" | "frameId">;

export type TimelineCelKey = string;

export interface TimelineCelSelection {
  keys: TimelineCelKey[];
  anchor: CelAddress | null;
}

export interface SelectTimelineCelOptions {
  /** Shift selection. This takes precedence over toggle. */
  extend?: boolean;
  /** Ctrl/Cmd selection toggle. */
  toggle?: boolean;
  /** The active cel is protected from Ctrl/Cmd removal. */
  active?: CelAddress | string | null;
  /** Explicit alias for callers that prefer a less abbreviated name. */
  activeAddress?: CelAddress | string | null;
  /** Compatibility alias for callers that name the active item as a cel. */
  activeCel?: CelAddress | string | null;
}

/** Selection scopes that can be passed to normalizeCelSelection. */
export type CelSelectionCommandScope = "cels" | (string & {});

/** Returns the canonical key used by PixelDocument.cels. */
export function celSelectionKey(layerId: string, frameId: string): TimelineCelKey {
  return celKey(layerId, frameId);
}

/**
 * Returns valid image-cel addresses in document order.
 *
 * Input keys are treated as a set. The document's layer order is the primary
 * order and frame order is secondary, so malformed, duplicate, group, deleted,
 * keys are silently omitted. Empty image slots remain valid selections.
 */
export function selectedCelAddresses(
  document: PixelDocument,
  keys: Iterable<TimelineCelKey>,
): CelAddress[] {
  const requested = new Set(keys);
  const output: CelAddress[] = [];

  for (const layer of document.layers) {
    if (!isCelLayer(layer)) continue;
    for (const frame of document.frames) {
      const key = celSelectionKey(layer.id, frame.id);
      if (!requested.has(key)) continue;
      output.push({layerId: layer.id, frameId: frame.id});
    }
  }

  return output;
}

/**
 * Cleans cel selection state after document mutations.
 *
 * Every scope removes invalid keys and clears an anchor that is no longer a
 * selected, valid image cel. The `cels` scope additionally guarantees that the
 * document's active image cel is selected when it exists; if the supplied
 * anchor is unusable, that active cel (or the first selected cel) becomes the
 * anchor. Other scopes do not force an active cel into the selection.
 */
export function normalizeCelSelection(
  document: PixelDocument,
  keys: Iterable<TimelineCelKey>,
  anchor: CelAddress | string | null | undefined,
  commandScope: CelSelectionCommandScope = "cels",
): TimelineCelSelection {
  const selected = selectedCelAddresses(document, keys);
  const selectedKeys = new Set(selected.map((address) => celSelectionKey(address.layerId, address.frameId)));
  const active = documentActiveCelAddress(document);

  if (commandScope === "cels" && active) {
    const activeKey = celSelectionKey(active.layerId, active.frameId);
    if (!selectedKeys.has(activeKey)) {
      selected.push(active);
      selectedKeys.add(activeKey);
      sortAddresses(document, selected);
    }
  }

  const normalizedKeys = selected.map((address) => celSelectionKey(address.layerId, address.frameId));
  const requestedAnchor = resolveAddress(document, anchor);
  const requestedAnchorKey = requestedAnchor
    ? celSelectionKey(requestedAnchor.layerId, requestedAnchor.frameId)
    : null;

  let normalizedAnchor = requestedAnchorKey && selectedKeys.has(requestedAnchorKey)
    ? requestedAnchor
    : null;
  if (!normalizedAnchor && commandScope === "cels" && active) {
    const activeKey = celSelectionKey(active.layerId, active.frameId);
    if (selectedKeys.has(activeKey)) normalizedAnchor = active;
  }
  if (!normalizedAnchor) normalizedAnchor = selected[0] ?? null;

  return {keys: normalizedKeys, anchor: normalizedAnchor ? {...normalizedAnchor} : null};
}

/**
 * Applies one timeline cel click to a two-dimensional selection.
 *
 * `visibleOrderedImageLayerIds` controls row geometry; document frame order
 * controls column geometry. A target must be a valid image cel in one of those
 * rows. Invalid targets are rejected as a no-op after cleaning current keys.
 */
export function selectTimelineCel(
  document: PixelDocument,
  visibleOrderedImageLayerIds: readonly string[],
  currentKeys: Iterable<TimelineCelKey>,
  currentAnchor: CelAddress | string | null | undefined,
  target: CelAddress | string,
  options: SelectTimelineCelOptions = {},
  positionalActive?: CelAddress | string | null,
): TimelineCelSelection {
  const visibleRows = visibleImageLayerIds(document, visibleOrderedImageLayerIds);
  const targetAddress = resolveAddress(document, target);
  const targetKey = targetAddress
    ? celSelectionKey(targetAddress.layerId, targetAddress.frameId)
    : null;
  const targetRow = targetAddress ? visibleRows.indexOf(targetAddress.layerId) : -1;
  const targetColumn = targetAddress
    ? document.frames.findIndex((frame) => frame.id === targetAddress.frameId)
    : -1;

  const currentAddresses = selectedCelAddresses(document, currentKeys);
  const currentSet = new Set(currentAddresses.map((address) => celSelectionKey(address.layerId, address.frameId)));
  const resolvedAnchor = resolveAddress(document, currentAnchor);
  const currentAnchorKey = resolvedAnchor
    ? celSelectionKey(resolvedAnchor.layerId, resolvedAnchor.frameId)
    : null;
  const activeInput = positionalActive
    ?? options.activeAddress
    ?? options.active
    ?? options.activeCel;
  const active = activeInput === undefined
    ? documentActiveCelAddress(document)
    : resolveAddress(document, activeInput);
  const activeKey = active ? celSelectionKey(active.layerId, active.frameId) : null;

  // Reject groups, missing frames, and rows hidden from the
  // timeline before applying any modifier. This makes invalid clicks a true
  // no-op rather than an accidental selection reset.
  if (!targetAddress || targetRow < 0 || targetColumn < 0 || !targetKey) {
    const normalizedAnchor = currentAnchorKey && currentSet.has(currentAnchorKey)
      ? resolvedAnchor
      : currentAddresses[0] ?? null;
    return {
      keys: currentAddresses.map((address) => celSelectionKey(address.layerId, address.frameId)),
      anchor: normalizedAnchor ? {...normalizedAnchor} : null,
    };
  }

  const extend = options.extend === true;
  const toggle = options.toggle === true;

  if (extend) {
    const anchor = resolvedAnchor && visibleRows.includes(resolvedAnchor.layerId)
      && document.frames.some((frame) => frame.id === resolvedAnchor.frameId)
      && hasValidCel(document, resolvedAnchor)
      ? resolvedAnchor
      : targetAddress;
    const anchorRow = visibleRows.indexOf(anchor.layerId);
    const anchorColumn = document.frames.findIndex((frame) => frame.id === anchor.frameId);
    const keys = new Set<TimelineCelKey>();

    if (anchorRow >= 0 && anchorColumn >= 0) {
      const firstRow = Math.min(anchorRow, targetRow);
      const lastRow = Math.max(anchorRow, targetRow);
      const firstColumn = Math.min(anchorColumn, targetColumn);
      const lastColumn = Math.max(anchorColumn, targetColumn);
      for (let row = firstRow; row <= lastRow; row += 1) {
        for (let column = firstColumn; column <= lastColumn; column += 1) {
          const address = {layerId: visibleRows[row], frameId: document.frames[column].id};
          if (hasValidCel(document, address)) keys.add(celSelectionKey(address.layerId, address.frameId));
        }
      }
    }

    return {
      keys: orderedKeys(document, keys),
      anchor: {...anchor},
    };
  }

  if (toggle) {
    if (currentSet.has(targetKey)) {
      // Keep the active and last remaining cells selectable. A Ctrl-click on
      // either one is intentionally a no-op.
      if (currentSet.size > 1 && activeKey !== targetKey) currentSet.delete(targetKey);
    } else {
      currentSet.add(targetKey);
    }

    const keys = orderedKeys(document, currentSet);
    const nextAnchor = currentAnchorKey && currentSet.has(currentAnchorKey)
      ? resolvedAnchor
      : targetAddress && currentSet.has(targetKey)
        ? targetAddress
        : selectedAddressForKey(document, keys[0]);
    return {keys, anchor: nextAnchor ? {...nextAnchor} : null};
  }

  return {keys: [targetKey], anchor: {...targetAddress}};
}

function visibleImageLayerIds(document: PixelDocument, layerIds: readonly string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const layerId of layerIds) {
    if (seen.has(layerId)) continue;
    const layer = document.layers.find((candidate) => candidate.id === layerId);
    if (!layer || !isCelLayer(layer)) continue;
    seen.add(layerId);
    output.push(layerId);
  }
  return output;
}

function orderedKeys(document: PixelDocument, keys: Iterable<TimelineCelKey>) {
  return selectedCelAddresses(document, keys).map((address) => celSelectionKey(address.layerId, address.frameId));
}

function sortAddresses(document: PixelDocument, addresses: CelAddress[]) {
  const layerOrder = new Map(document.layers.map((layer, index) => [layer.id, index]));
  const frameOrder = new Map(document.frames.map((frame, index) => [frame.id, index]));
  addresses.sort((left, right) => {
    const layerDelta = (layerOrder.get(left.layerId) ?? Number.MAX_SAFE_INTEGER)
      - (layerOrder.get(right.layerId) ?? Number.MAX_SAFE_INTEGER);
    if (layerDelta !== 0) return layerDelta;
    return (frameOrder.get(left.frameId) ?? Number.MAX_SAFE_INTEGER)
      - (frameOrder.get(right.frameId) ?? Number.MAX_SAFE_INTEGER);
  });
}

function selectedAddressForKey(document: PixelDocument, key: TimelineCelKey | undefined) {
  if (!key) return null;
  return selectedCelAddresses(document, [key])[0] ?? null;
}

function documentActiveCelAddress(document: PixelDocument): CelAddress | null {
  const address = {layerId: document.activeLayerId, frameId: document.activeFrameId};
  return hasValidCel(document, address) ? address : null;
}

function resolveAddress(
  document: PixelDocument,
  address: CelAddress | string | null | undefined,
): CelAddress | null {
  if (!address) return null;
  if (typeof address === "string") return selectedAddressForKey(document, address);
  return hasValidCel(document, address)
    ? {layerId: address.layerId, frameId: address.frameId}
    : null;
}

function hasValidCel(document: PixelDocument, address: CelAddress) {
  const layer = document.layers.find((candidate) => candidate.id === address.layerId);
  if (!layer || !isCelLayer(layer)) return false;
  if (!document.frames.some((frame) => frame.id === address.frameId)) return false;
  return true;
}

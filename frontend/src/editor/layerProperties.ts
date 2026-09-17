import {
  getCel,
  getLayerByID,
  isCelLayer,
  renameLayer,
  setLayerAlphaLock,
  setLayerBlendMode,
  setLayerContinuous,
  setLayerLocked,
  setLayerOpacity,
  setLayerRole,
  setLayerVisibility,
  type BlendMode,
  type LayerRole,
  type PixelDocument,
} from "./document";

/** Properties that can be applied to one or more selected layers. */
export interface LayerPropertyUpdate {
  name?: string;
  opacity?: number;
  blendMode?: BlendMode;
  role?: LayerRole;
  visible?: boolean;
  locked?: boolean;
  alphaLock?: boolean;
  continuous?: boolean;
}

/**
 * Applies a layer-properties dialog update through the document setters.
 * Setter order is intentional: role establishes background invariants before
 * the remaining appearance flags are evaluated.
 */
export function applyLayerProperties(
  document: PixelDocument,
  layerIds: Iterable<string>,
  update: LayerPropertyUpdate,
): boolean {
  const ids = [...new Set(layerIds)];
  let changed = false;
  for (const layerId of ids) {
    if (!getLayerByID(document, layerId)) continue;
    if (update.role !== undefined) changed = setLayerRole(document, layerId, update.role) || changed;
    if (update.name !== undefined) changed = renameLayer(document, layerId, update.name) || changed;
    if (update.visible !== undefined) changed = setLayerVisibility(document, layerId, update.visible) || changed;
    if (update.locked !== undefined) changed = setLayerLocked(document, layerId, update.locked) || changed;
    if (update.opacity !== undefined) changed = setLayerOpacity(document, layerId, update.opacity) || changed;
    if (update.blendMode !== undefined) changed = setLayerBlendMode(document, layerId, update.blendMode) || changed;
    if (update.alphaLock !== undefined) changed = setLayerAlphaLock(document, layerId, update.alphaLock) || changed;
    if (update.continuous !== undefined && isCelLayer(getLayerByID(document, layerId)!)) {
      changed = setLayerContinuous(document, layerId, update.continuous) || changed;
    }
  }
  return changed;
}

/** Returns existing cels for the requested layers in timeline display order. */
export function existingCelsForLayers(
  document: PixelDocument,
  layerIds: Iterable<string>,
): Array<{layerId: string; frameId: string}> {
  const requested = new Set(layerIds);
  const addresses: Array<{layerId: string; frameId: string}> = [];
  for (const layer of document.layers) {
    if (!requested.has(layer.id) || !isCelLayer(layer)) continue;
    for (const frame of document.frames) {
      if (getCel(document, layer.id, frame.id)) addresses.push({layerId: layer.id, frameId: frame.id});
    }
  }
  return addresses;
}

/**
 * Expands a Cel selection to every existing Cel sharing one of its link
 * buffers. Selection order follows document layer/frame order and sparse Cels
 * remain sparse; this helper never creates a Cel or mutates pixel buffers.
 */
export function linkedCelsForSelection(
  document: PixelDocument,
  addresses: Iterable<{layerId: string; frameId: string}>,
): Array<{layerId: string; frameId: string}> {
  const linkIds = new Set<string>();
  for (const address of addresses) {
    const cel = getCel(document, address.layerId, address.frameId);
    if (cel?.linkId) linkIds.add(cel.linkId);
  }
  if (linkIds.size === 0) return [];

  const result: Array<{layerId: string; frameId: string}> = [];
  for (const layer of document.layers) {
    if (!isCelLayer(layer)) continue;
    for (const frame of document.frames) {
      const cel = getCel(document, layer.id, frame.id);
      if (cel && linkIds.has(cel.linkId)) result.push({layerId: layer.id, frameId: frame.id});
    }
  }
  return result;
}

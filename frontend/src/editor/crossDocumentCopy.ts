import {
  type Cel,
  type FrameTag,
  type PixelDocument,
  type Slice,
  type TilemapData,
} from "./document";

export interface CrossDocumentCopyResult {
  frameIds: string[];
  layerIds: string[];
  tagIds: string[];
  sliceIds: string[];
}

export interface CrossDocumentLayerCopyResult {
  layerIds: string[];
  celIds: string[];
  tilesetIds: string[];
}

export function canCopyFramesToDocument(source: PixelDocument, destination: PixelDocument) {
  if (source === destination || source.width !== destination.width || source.height !== destination.height || source.colorMode !== destination.colorMode) return false;
  if (source.colorMode === "indexed") {
    if (source.palette.transparentIndex !== destination.palette.transparentIndex) return false;
    if (source.palette.colors.length !== destination.palette.colors.length) return false;
    if (source.palette.colors.some((color, index) => color !== destination.palette.colors[index])) return false;
  }
  return true;
}

/**
 * Layer Cels are matched by frame order because frame IDs are document-local.
 * Requiring the same frame count keeps this operation layer-only: it never
 * silently inserts or removes timeline frames in the destination document.
 */
export function canCopyLayersToDocument(source: PixelDocument, destination: PixelDocument) {
  return canCopyFramesToDocument(source, destination) && source.frames.length === destination.frames.length;
}

interface IDMaps {
  frame: Map<string, string>;
  layer: Map<string, string>;
  tileset: Map<string, string>;
}

/**
 * Appends selected source frames to another open document as an imported
 * layer tree. The destination keeps its existing layers and frames; imported
 * IDs and Cel link buffers are always fresh, while aliases inside the copied
 * selection remain shared.
 *
 * The operation deliberately requires equal canvas dimensions and color mode.
 * This keeps indexed indexes and tilemap caches authoritative without silently
 * converting pixels or changing the destination palette.
 */
export function copyFramesToDocument(
  source: PixelDocument,
  selectedFrameIds: readonly string[],
  destination: PixelDocument,
): CrossDocumentCopyResult | null {
  if (!canCopyFramesToDocument(source, destination)) return null;

  const selected = orderedUnique(source.frames.map((frame) => frame.id), selectedFrameIds);
  if (selected.length === 0) return null;

  for (const layer of source.layers) {
    if (layer.kind !== "tilemap") continue;
    if (!layer.tilesetId || !source.tilesets.some((tileset) => tileset.id === layer.tilesetId)) return null;
  }
  const maps: IDMaps = {
    frame: new Map(selected.map((frameId) => [frameId, createID("frame")])),
    layer: new Map(source.layers.map((layer) => [layer.id, createID("layer")])),
    tileset: new Map(),
  };
  for (const layer of source.layers) {
    if (layer.kind !== "tilemap" || !layer.tilesetId || maps.tileset.has(layer.tilesetId)) continue;
    maps.tileset.set(layer.tilesetId, createID("tileset"));
  }

  const importedFrames = selected.map((frameId) => {
    const frame = source.frames.find((candidate) => candidate.id === frameId)!;
    return {id: maps.frame.get(frameId)!, durationMs: frame.durationMs};
  });
  const importedTilesets = source.tilesets
    .filter((tileset) => maps.tileset.has(tileset.id))
    .map((tileset) => ({
      ...tileset,
      id: maps.tileset.get(tileset.id)!,
      tiles: tileset.tiles.map((tile) => ({
        ...tile,
        pixels: tile.pixels.slice(),
        indexes: tile.indexes?.slice(),
      })),
    }));

  const hasDestinationBackground = destination.layers.some((candidate) => candidate.role === "background");
  const importedLayers = source.layers.map((layer) => {
    const parentId = layer.parentId ? maps.layer.get(layer.parentId) : undefined;
    return {
      ...layer,
      id: maps.layer.get(layer.id)!,
      parentId,
      tilesetId: layer.tilesetId ? maps.tileset.get(layer.tilesetId) : undefined,
      // A document can have only one background layer. When the destination
      // already has one, keep the copied pixels but make this imported layer
      // ordinary so validation and compositing invariants remain intact.
      role: layer.role === "background" && hasDestinationBackground ? "standard" as const : layer.role,
    };
  });

  const linkIDs = new Map<string, string>();
  const linkedPixels = new Map<string, Uint8ClampedArray>();
  const linkedIndexes = new Map<string, Uint8Array>();
  const linkedTilemaps = new Map<string, TilemapData>();
  const importedCels: Cel[] = [];
  for (const sourceCel of Object.values(source.cels)) {
    const frameId = maps.frame.get(sourceCel.frameId);
    const layerId = maps.layer.get(sourceCel.layerId);
    if (!frameId || !layerId) continue;
    const sourceLayer = source.layers.find((layer) => layer.id === sourceCel.layerId);
    if (!sourceLayer || (sourceLayer.kind !== "image" && sourceLayer.kind !== "tilemap")) continue;
    let linkId = linkIDs.get(sourceCel.linkId);
    if (!linkId) {
      linkId = createID("link");
      linkIDs.set(sourceCel.linkId, linkId);
    }
    const pixels = linkedPixels.get(sourceCel.linkId) ?? sourceCel.pixels.slice();
    linkedPixels.set(sourceCel.linkId, pixels);
    const indexes = sourceCel.indexes
      ? linkedIndexes.get(sourceCel.linkId) ?? sourceCel.indexes.slice()
      : undefined;
    if (indexes) linkedIndexes.set(sourceCel.linkId, indexes);
    const tilemap = sourceCel.tilemap
      ? linkedTilemaps.get(sourceCel.linkId) ?? cloneTilemap(sourceCel.tilemap)!
      : undefined;
    if (tilemap) linkedTilemaps.set(sourceCel.linkId, tilemap);
    importedCels.push({
      ...sourceCel,
      id: createID("cel"),
      linkId,
      layerId,
      frameId,
      pixels,
      indexes,
      tilemap,
    });
  }

  const importedTags = copyTags(source, selected, maps.frame);
  const importedSlices = copySlices(source, selected, maps.frame);
  const importedGuides = source.guides.map((guide) => ({...guide, id: createID("guide")}));

  destination.frames.push(...importedFrames);
  destination.tilesets.push(...importedTilesets);
  destination.layers.push(...importedLayers);
  for (const cel of importedCels) destination.cels[`${cel.layerId}:${cel.frameId}`] = cel;
  destination.tags.push(...importedTags);
  destination.slices.push(...importedSlices);
  destination.guides.push(...importedGuides);

  if (!hasDestinationBackground) {
    const importedBackground = importedLayers.find((layer) => layer.role === "background");
    if (importedBackground) {
      importedBackground.parentId = undefined;
      const index = destination.layers.indexOf(importedBackground);
      if (index >= 0) {
        destination.layers.splice(index, 1);
        destination.layers.unshift(importedBackground);
      }
    }
  }

  destination.activeFrameId = importedFrames[0].id;
  const activeLayer = maps.layer.get(source.activeLayerId);
  destination.activeLayerId = activeLayer ?? importedLayers.find((layer) => layer.kind !== "group")?.id ?? destination.activeLayerId;

  return {
    frameIds: importedFrames.map((frame) => frame.id),
    layerIds: importedLayers.map((layer) => layer.id),
    tagIds: importedTags.map((tag) => tag.id),
    sliceIds: importedSlices.map((slice) => slice.id),
  };
}

/**
 * Appends selected layer subtrees to another open document. The destination
 * timeline is preserved and source/destination frames are paired by order.
 * Linked buffers remain shared inside the imported subtree, but never alias
 * the source document or the destination's existing Cels.
 */
export function copyLayersToDocument(
  source: PixelDocument,
  selectedLayerIds: readonly string[],
  destination: PixelDocument,
): CrossDocumentLayerCopyResult | null {
  if (!canCopyLayersToDocument(source, destination)) return null;

  const selectedIDs = new Set(selectedLayerIds);
  const selectedRoots = source.layers.filter((layer) => {
    if (!selectedIDs.has(layer.id)) return false;
    let parentId = layer.parentId;
    while (parentId) {
      if (selectedIDs.has(parentId)) return false;
      parentId = source.layers.find((candidate) => candidate.id === parentId)?.parentId;
    }
    return true;
  });
  if (selectedRoots.length === 0) return null;

  const includedIDs = new Set<string>();
  for (const root of selectedRoots) {
    includedIDs.add(root.id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const layer of source.layers) {
        if (layer.parentId && includedIDs.has(layer.parentId) && !includedIDs.has(layer.id)) {
          includedIDs.add(layer.id);
          changed = true;
        }
      }
    }
  }
  const sourceLayers = source.layers.filter((layer) => includedIDs.has(layer.id));
  if (sourceLayers.length === 0) return null;

  const layerIDs = new Map(sourceLayers.map((layer) => [layer.id, createID("layer")]));
  const tilesetIDs = new Map<string, string>();
  for (const layer of sourceLayers) {
    if (layer.kind !== "tilemap") continue;
    if (!layer.tilesetId || !source.tilesets.some((tileset) => tileset.id === layer.tilesetId)) return null;
    if (!tilesetIDs.has(layer.tilesetId)) tilesetIDs.set(layer.tilesetId, createID("tileset"));
  }

  const frameIDs = new Map(source.frames.map((frame, index) => [frame.id, destination.frames[index].id]));
  const hasDestinationBackground = destination.layers.some((layer) => layer.role === "background");
  const importedLayers = sourceLayers.map((layer) => ({
    ...layer,
    id: layerIDs.get(layer.id)!,
    parentId: layer.parentId && layerIDs.has(layer.parentId) ? layerIDs.get(layer.parentId) : undefined,
    tilesetId: layer.tilesetId ? tilesetIDs.get(layer.tilesetId) : undefined,
    role: layer.role === "background" && hasDestinationBackground ? "standard" as const : layer.role,
  }));
  const importedTilesets = source.tilesets
    .filter((tileset) => tilesetIDs.has(tileset.id))
    .map((tileset) => ({
      ...tileset,
      id: tilesetIDs.get(tileset.id)!,
      tiles: tileset.tiles.map((tile) => ({
        ...tile,
        pixels: tile.pixels.slice(),
        indexes: tile.indexes?.slice(),
      })),
    }));

  const linkIDs = new Map<string, string>();
  const linkedPixels = new Map<string, Uint8ClampedArray>();
  const linkedIndexes = new Map<string, Uint8Array>();
  const linkedTilemaps = new Map<string, TilemapData>();
  const importedCels: Cel[] = [];
  for (const sourceCel of Object.values(source.cels)) {
    if (!includedIDs.has(sourceCel.layerId)) continue;
    const layerId = layerIDs.get(sourceCel.layerId);
    const frameId = frameIDs.get(sourceCel.frameId);
    if (!layerId || !frameId) continue;
    const sourceLayer = source.layers.find((layer) => layer.id === sourceCel.layerId);
    if (!sourceLayer || (sourceLayer.kind !== "image" && sourceLayer.kind !== "tilemap")) continue;

    let linkId = linkIDs.get(sourceCel.linkId);
    if (!linkId) {
      linkId = createID("link");
      linkIDs.set(sourceCel.linkId, linkId);
    }
    let pixels = linkedPixels.get(sourceCel.linkId);
    if (!pixels) {
      pixels = sourceCel.pixels.slice();
      linkedPixels.set(sourceCel.linkId, pixels);
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
      tilemap = linkedTilemaps.get(sourceCel.linkId);
      if (!tilemap) {
        tilemap = cloneTilemap(sourceCel.tilemap);
        linkedTilemaps.set(sourceCel.linkId, tilemap!);
      }
    }
    importedCels.push({
      ...sourceCel,
      id: createID("cel"),
      linkId,
      layerId,
      frameId,
      pixels,
      indexes,
      tilemap,
    });
  }

  destination.tilesets.push(...importedTilesets);
  destination.layers.push(...importedLayers);
  for (const cel of importedCels) destination.cels[`${cel.layerId}:${cel.frameId}`] = cel;

  if (!hasDestinationBackground) {
    const importedBackground = importedLayers.find((layer) => layer.role === "background");
    if (importedBackground) {
      importedBackground.parentId = undefined;
      const index = destination.layers.indexOf(importedBackground);
      if (index >= 0) {
        destination.layers.splice(index, 1);
        destination.layers.unshift(importedBackground);
      }
    }
  }

  const sourceActiveLayer = layerIDs.get(source.activeLayerId);
  const activeImportedLayer = sourceActiveLayer && importedLayers.some((layer) => layer.id === sourceActiveLayer)
    ? sourceActiveLayer
    : importedLayers.find((layer) => layer.kind !== "group")?.id ?? importedLayers[0].id;
  destination.activeLayerId = activeImportedLayer;

  return {
    layerIds: importedLayers.map((layer) => layer.id),
    celIds: importedCels.map((cel) => cel.id),
    tilesetIds: importedTilesets.map((tileset) => tileset.id),
  };
}

function copyTags(source: PixelDocument, selectedFrameIds: readonly string[], frameMap: Map<string, string>) {
  const selectedSet = new Set(selectedFrameIds);
  const sourceIndexes = new Map(source.frames.map((frame, index) => [frame.id, index]));
  const tags: FrameTag[] = [];
  for (const tag of source.tags) {
    const start = source.frames.findIndex((frame) => frame.id === tag.fromFrameId);
    const end = source.frames.findIndex((frame) => frame.id === tag.toFrameId);
    if (start < 0 || end < 0) continue;
    const low = Math.min(start, end);
    const high = Math.max(start, end);
    const inRange = source.frames
      .slice(low, high + 1)
      .sort((left, right) => (start <= end ? 1 : -1) * (sourceIndexes.get(left.id)! - sourceIndexes.get(right.id)!))
      .map((frame) => frame.id)
      .filter((frameId) => selectedSet.has(frameId));
    if (inRange.length === 0) continue;

    // A non-contiguous selection becomes one tag per contiguous selected run;
    // each run preserves direction, color and repeat semantics.
    let run: string[] = [];
    const flush = () => {
      if (run.length === 0) return;
      const first = frameMap.get(run[0]);
      const last = frameMap.get(run.at(-1)!);
      if (first && last) tags.push({
        ...tag,
        id: createID("tag"),
        fromFrameId: first,
        toFrameId: last,
      });
      run = [];
    };
    for (const frameId of inRange) {
      const previous = run.at(-1);
      const previousIndex = previous === undefined ? undefined : sourceIndexes.get(previous);
      const currentIndex = sourceIndexes.get(frameId);
      if (previousIndex !== undefined && currentIndex !== undefined && Math.abs(currentIndex - previousIndex) !== 1) flush();
      run.push(frameId);
    }
    flush();
  }
  return tags;
}

function copySlices(source: PixelDocument, selectedFrameIds: readonly string[], frameMap: Map<string, string>) {
  const selected = new Set(selectedFrameIds);
  const slices: Slice[] = [];
  for (const slice of source.slices) {
    const keys = slice.keys
      .filter((key) => selected.has(key.frameId) && frameMap.has(key.frameId))
      .map((key) => ({
        ...key,
        frameId: frameMap.get(key.frameId)!,
        center: key.center ? {...key.center} : undefined,
        pivot: key.pivot ? {...key.pivot} : undefined,
      }));
    if (keys.length === 0) continue;
    slices.push({...slice, id: createID("slice"), keys});
  }
  return slices;
}

function cloneTilemap(tilemap: TilemapData | undefined) {
  return tilemap ? {...tilemap, tiles: tilemap.tiles.slice()} : undefined;
}

function orderedUnique(order: readonly string[], requested: readonly string[]) {
  const selected = new Set(requested);
  return order.filter((id) => selected.has(id));
}

function createID(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

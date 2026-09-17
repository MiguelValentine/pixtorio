import type {PixelDocument, Slice, SliceKey} from "./document";

export interface SliceFrameBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Returns the authored keys for the requested slices, optionally limited to
 * selected frames. Missing frame keys are intentionally omitted; batch slice
 * edits must never create implicit keys on other frames.
 */
export function selectedSliceKeys(
  document: PixelDocument,
  sliceIDs: readonly string[],
  frameIDs?: readonly string[],
) {
  const selected = new Set(sliceIDs);
  const frames = frameIDs ? new Set(frameIDs) : null;
  return document.slices.flatMap((slice) => selected.has(slice.id)
    ? slice.keys
      .filter((key) => !frames || frames.has(key.frameId))
      .map((key) => ({slice, key}))
    : []);
}

/**
 * Moves every authored key of the selected slices as one atomic operation.
 * The local center/pivot metadata remains local to its key, so animated slice
 * keys keep their own frame-specific semantics.
 */
export function moveSlices(
  document: PixelDocument,
  sliceIDs: readonly string[],
  deltaX: number,
  deltaY: number,
  frameIDs?: readonly string[],
) {
  if (!Number.isInteger(deltaX) || !Number.isInteger(deltaY) || (deltaX === 0 && deltaY === 0)) return false;
  const entries = selectedSliceKeys(document, sliceIDs, frameIDs);
  const updates = entries.map(({slice, key}) => ({
    slice,
    key,
    next: {...key, x: key.x + deltaX, y: key.y + deltaY},
  }));
  if (updates.length === 0 || updates.some(({next}) => !validSliceKey(document, next))) return false;
  for (const {key, next} of updates) Object.assign(key, cloneSliceKey(next));
  return true;
}

/**
 * Scales selected slices independently per frame around that frame's group
 * top-left corner. Keys absent on a frame stay absent, while all selected
 * keys on that frame preserve their relative placement.
 */
export function scaleSlices(
  document: PixelDocument,
  sliceIDs: readonly string[],
  scaleX: number,
  scaleY = scaleX,
  frameIDs?: readonly string[],
) {
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) return false;
  const entries = selectedSliceKeys(document, sliceIDs, frameIDs);
  if (entries.length === 0) return false;

  const byFrame = new Map<string, Array<{slice: Slice; key: SliceKey}>>();
  for (const entry of entries) {
    const frameEntries = byFrame.get(entry.key.frameId) ?? [];
    frameEntries.push(entry);
    byFrame.set(entry.key.frameId, frameEntries);
  }

  const updates: Array<{key: SliceKey; next: SliceKey}> = [];
  for (const frameEntries of byFrame.values()) {
    const originX = Math.min(...frameEntries.map(({key}) => key.x));
    const originY = Math.min(...frameEntries.map(({key}) => key.y));
    for (const {key} of frameEntries) {
      const width = Math.max(1, Math.round(key.width * scaleX));
      const height = Math.max(1, Math.round(key.height * scaleY));
      const next: SliceKey = {
        ...key,
        x: originX + Math.round((key.x - originX) * scaleX),
        y: originY + Math.round((key.y - originY) * scaleY),
        width,
        height,
        center: key.center
          ? {
            x: Math.round(key.center.x * scaleX),
            y: Math.round(key.center.y * scaleY),
            width: Math.max(1, Math.round(key.center.width * scaleX)),
            height: Math.max(1, Math.round(key.center.height * scaleY)),
          }
          : undefined,
        pivot: key.pivot
          ? {x: Math.round(key.pivot.x * scaleX), y: Math.round(key.pivot.y * scaleY)}
          : undefined,
      };
      if (next.center) {
        next.center.width = Math.min(next.width, next.center.width);
        next.center.height = Math.min(next.height, next.center.height);
        next.center.x = Math.max(0, Math.min(next.center.x, next.width - next.center.width));
        next.center.y = Math.max(0, Math.min(next.center.y, next.height - next.center.height));
      }
      updates.push({key, next});
    }
  }
  if (updates.every(({key, next}) => sliceKeyEqual(key, next)) || updates.some(({next}) => !validSliceKey(document, next))) return false;
  for (const {key, next} of updates) Object.assign(key, cloneSliceKey(next));
  return true;
}

/**
 * Applies exact canvas bounds to selected slice keys on the requested frame.
 * Missing keys remain missing so animated slices keep their authored frame
 * semantics. Local nine-patch and pivot metadata scale with the key geometry.
 */
export function resizeSliceKeys(
  document: PixelDocument,
  frameId: string,
  changes: readonly {id: string; bounds: SliceFrameBounds}[],
) {
  if (!frameId || changes.length === 0) return false;
  const byId = new Map(changes.map((change) => [change.id, change.bounds]));
  const entries = selectedSliceKeys(document, [...byId.keys()], [frameId]);
  if (entries.length === 0) return false;
  const updates = entries.map(({slice, key}) => {
    const bounds = byId.get(slice.id);
    if (!bounds) return null;
    const widthScale = bounds.width / key.width;
    const heightScale = bounds.height / key.height;
    const next: SliceKey = {
      ...key,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      center: key.center
        ? {
          x: Math.round(key.center.x * widthScale),
          y: Math.round(key.center.y * heightScale),
          width: Math.max(1, Math.round(key.center.width * widthScale)),
          height: Math.max(1, Math.round(key.center.height * heightScale)),
        }
        : undefined,
      pivot: key.pivot
        ? {x: Math.round(key.pivot.x * widthScale), y: Math.round(key.pivot.y * heightScale)}
        : undefined,
    };
    if (next.center) {
      next.center.width = Math.min(next.width, next.center.width);
      next.center.height = Math.min(next.height, next.center.height);
      next.center.x = Math.max(0, Math.min(next.center.x, next.width - next.center.width));
      next.center.y = Math.max(0, Math.min(next.center.y, next.height - next.center.height));
    }
    return {key, next};
  });
  if (updates.some((update) => !update) || updates.some((update) => update && !validSliceKey(document, update.next))) return false;
  const changed = updates.filter((update): update is {key: SliceKey; next: SliceKey} => Boolean(update))
    .some(({key, next}) => !sliceKeyEqual(key, next));
  if (!changed) return false;
  for (const update of updates) {
    if (update) Object.assign(update.key, cloneSliceKey(update.next));
  }
  return true;
}

/** Deletes complete slices, preserving all other slices and frame keys. */
export function deleteSlices(document: PixelDocument, sliceIDs: readonly string[]) {
  const selected = new Set(sliceIDs);
  const next = document.slices.filter((slice) => !selected.has(slice.id));
  if (next.length === document.slices.length) return false;
  document.slices = next;
  return true;
}

/**
 * Reuses an existing document color when it matches the requested slice color.
 * This keeps slice colors stable across repeated creation actions while still
 * accepting a new valid color when no existing slice uses it.
 */
export function reuseSliceColor(document: PixelDocument, requestedColor: string) {
  const normalized = normalizeSliceColor(requestedColor);
  if (!normalized) return document.slices[0]?.color ?? "#ef476fff";
  return document.slices.find((slice) => slice.color.toLowerCase() === normalized)?.color ?? normalized;
}

function normalizeSliceColor(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(trimmed)) return `${trimmed}ff`;
  return /^#[0-9a-f]{8}$/.test(trimmed) ? trimmed : null;
}

function validSliceKey(document: PixelDocument, key: SliceKey) {
  return document.frames.some((frame) => frame.id === key.frameId)
    && validRect(key, document.width, document.height)
    && (!key.center || validRect(key.center, key.width, key.height))
    && (!key.pivot || (Number.isInteger(key.pivot.x) && Number.isInteger(key.pivot.y)));
}

function validRect(value: SliceFrameBounds, width: number, height: number) {
  return Number.isInteger(value.x) && Number.isInteger(value.y)
    && Number.isInteger(value.width) && Number.isInteger(value.height)
    && value.width > 0 && value.height > 0
    && value.x >= 0 && value.y >= 0
    && value.x + value.width <= width && value.y + value.height <= height;
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
    && left.x === right.x && left.y === right.y
    && left.width === right.width && left.height === right.height
    && left.center?.x === right.center?.x && left.center?.y === right.center?.y
    && left.center?.width === right.center?.width && left.center?.height === right.center?.height
    && left.pivot?.x === right.pivot?.x && left.pivot?.y === right.pivot?.y;
}

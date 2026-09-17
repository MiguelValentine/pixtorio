export interface SliceOverlay {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
}

export interface SliceBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Returns true when two slice rectangles overlap or touch at an edge/corner. */
export function slicesTouch(first: SliceBounds, second: SliceBounds) {
  return first.x <= second.x + second.width
    && first.x + first.width >= second.x
    && first.y <= second.y + second.height
    && first.y + first.height >= second.y;
}

/** Finds overlays touched by a newly drawn slice rectangle in display order. */
export function touchedSliceIds<T extends SliceOverlay>(overlays: readonly T[], bounds: SliceBounds) {
  return overlays.filter((slice) => slicesTouch(slice, bounds)).map((slice) => slice.id);
}

/** Returns the integer union bounds for a selected overlay group. */
export function selectedSliceBounds<T extends SliceOverlay>(overlays: readonly T[], selectedIDs: readonly string[]) {
  const selected = new Set(selectedIDs);
  const matches = overlays.filter((slice) => selected.has(slice.id));
  if (matches.length === 0) return null;
  const left = Math.min(...matches.map((slice) => slice.x));
  const top = Math.min(...matches.map((slice) => slice.y));
  const right = Math.max(...matches.map((slice) => slice.x + slice.width));
  const bottom = Math.max(...matches.map((slice) => slice.y + slice.height));
  return {x: left, y: top, width: right - left, height: bottom - top};
}

/**
 * Keeps the active slice on top while preserving the existing reverse-order
 * hit preference for the other overlays. This makes overlapping overlays
 * deterministic in both Slice and Transform tools.
 */
export function orderedSliceOverlays<T extends SliceOverlay>(overlays: readonly T[], activeSliceId: string) {
  return [
    ...overlays.filter((slice) => slice.id === activeSliceId),
    ...overlays.filter((slice) => slice.id !== activeSliceId).reverse(),
  ];
}

/**
 * Applies the canvas slice-selection modifiers without mutating the current
 * selection. A plain click keeps an already selected slice set intact so a
 * selected group can still be dragged as one batch.
 */
export function nextSliceSelection(selectedSliceIds: readonly string[], sliceId: string, additive: boolean) {
  if (additive) {
    return selectedSliceIds.includes(sliceId)
      ? selectedSliceIds.filter((id) => id !== sliceId)
      : [...selectedSliceIds, sliceId];
  }
  return selectedSliceIds.length > 0 && selectedSliceIds.includes(sliceId)
    ? [...selectedSliceIds]
    : [sliceId];
}

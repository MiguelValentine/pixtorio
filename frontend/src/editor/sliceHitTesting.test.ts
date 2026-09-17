import {describe, expect, it} from "vitest";
import {nextSliceSelection, orderedSliceOverlays, selectedSliceBounds, slicesTouch, touchedSliceIds} from "./sliceHitTesting";

const overlays = [
  {id: "first", x: 0, y: 0, width: 4, height: 4},
  {id: "adjacent", x: 4, y: 0, width: 4, height: 4},
  {id: "overlap", x: 2, y: 2, width: 4, height: 4},
];

describe("slice canvas hit ordering and selection", () => {
  it("prioritizes the active overlay and reverses the remaining paint order", () => {
    expect(orderedSliceOverlays(overlays, "adjacent").map((slice) => slice.id)).toEqual([
      "adjacent",
      "overlap",
      "first",
    ]);
    expect(orderedSliceOverlays(overlays, "missing").map((slice) => slice.id)).toEqual([
      "overlap",
      "adjacent",
      "first",
    ]);
  });

  it("switches to a clicked adjacent slice without losing additive selection semantics", () => {
    expect(nextSliceSelection(["first"], "adjacent", false)).toEqual(["adjacent"]);
    expect(nextSliceSelection(["first"], "adjacent", true)).toEqual(["first", "adjacent"]);
    expect(nextSliceSelection(["first", "adjacent"], "adjacent", true)).toEqual(["first"]);
    expect(nextSliceSelection(["first", "adjacent"], "adjacent", false)).toEqual(["first", "adjacent"]);
  });

  it("treats edge and corner contact as a touched slice", () => {
    expect(slicesTouch({x: 0, y: 0, width: 2, height: 2}, {x: 2, y: 1, width: 2, height: 2})).toBe(true);
    expect(slicesTouch({x: 0, y: 0, width: 2, height: 2}, {x: 2, y: 2, width: 2, height: 2})).toBe(true);
    expect(slicesTouch({x: 0, y: 0, width: 2, height: 2}, {x: 3, y: 0, width: 2, height: 2})).toBe(false);
    expect(touchedSliceIds([
      {id: "first", x: 0, y: 0, width: 2, height: 2},
      {id: "second", x: 4, y: 1, width: 2, height: 2},
    ], {x: 2, y: 1, width: 2, height: 2})).toEqual(["first", "second"]);
  });

  it("computes the union bounds for a selected slice group", () => {
    expect(selectedSliceBounds([
      {id: "first", x: 2, y: 1, width: 2, height: 3},
      {id: "second", x: 7, y: 4, width: 3, height: 2},
    ], ["first", "second"])).toEqual({x: 2, y: 1, width: 8, height: 5});
    expect(selectedSliceBounds([], ["missing"])).toBeNull();
  });
});

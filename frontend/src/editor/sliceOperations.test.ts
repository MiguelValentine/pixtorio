import {describe, expect, it} from "vitest";
import {
  addFrame,
  addSlice,
  addSliceKey,
  cloneDocument,
  createDocument,
  getSliceKey,
} from "./document";
import {decodeProject, encodeProject} from "./serialization";
import {DocumentStateCommand, CommandHistory} from "./history";
import {deleteSlices, moveSlices, resizeSliceKeys, reuseSliceColor, scaleSlices, selectedSliceKeys} from "./sliceOperations";

describe("slice batch operations", () => {
  it("moves only authored keys and keeps each key's local metadata", () => {
    const document = createDocument({width: 16, height: 12});
    const firstFrameId = document.activeFrameId;
    const secondFrame = addFrame(document);
    const first = addSlice(document, "First", {
      frameId: firstFrameId,
      x: 1,
      y: 2,
      width: 3,
      height: 2,
      center: {x: 1, y: 0, width: 1, height: 1},
      pivot: {x: 2, y: 1},
    })!;
    const second = addSlice(document, "Second", {frameId: firstFrameId, x: 5, y: 2, width: 2, height: 2})!;
    expect(addSliceKey(document, first.id, secondFrame.id, {x: 2, y: 3, width: 3, height: 2})).not.toBeNull();

    expect(moveSlices(document, [first.id, second.id], 2, 1)).toBe(true);
    expect(getSliceKey(document, first.id, firstFrameId)).toMatchObject({x: 3, y: 3, center: {x: 1, y: 0}, pivot: {x: 2, y: 1}});
    expect(getSliceKey(document, second.id, firstFrameId)).toMatchObject({x: 7, y: 3});
    expect(getSliceKey(document, first.id, secondFrame.id)).toMatchObject({x: 4, y: 4});
    expect(selectedSliceKeys(document, [second.id], [secondFrame.id])).toHaveLength(0);
  });

  it("rejects an out-of-bounds batch move atomically", () => {
    const document = createDocument({width: 8, height: 8});
    const first = addSlice(document, "First", {x: 0, y: 0, width: 2, height: 2})!;
    const second = addSlice(document, "Second", {x: 6, y: 6, width: 2, height: 2})!;
    const before = cloneDocument(document);

    expect(moveSlices(document, [first.id, second.id], 1, 0)).toBe(false);
    expect(document.slices).toEqual(before.slices);
  });

  it("scales selected keys per frame without inventing missing keys", () => {
    const document = createDocument({width: 20, height: 16});
    const firstFrameId = document.activeFrameId;
    const secondFrame = addFrame(document);
    const first = addSlice(document, "First", {
      frameId: firstFrameId,
      x: 2,
      y: 2,
      width: 2,
      height: 2,
      center: {x: 0, y: 0, width: 1, height: 1},
      pivot: {x: 1, y: 1},
    })!;
    const second = addSlice(document, "Second", {frameId: firstFrameId, x: 6, y: 4, width: 2, height: 2})!;
    expect(addSliceKey(document, first.id, secondFrame.id, {x: 1, y: 1, width: 3, height: 2})).not.toBeNull();
    expect(scaleSlices(document, [first.id, second.id], 2, 2)).toBe(true);

    expect(getSliceKey(document, first.id, firstFrameId)).toMatchObject({x: 2, y: 2, width: 4, height: 4, center: {x: 0, y: 0, width: 2, height: 2}, pivot: {x: 2, y: 2}});
    expect(getSliceKey(document, second.id, firstFrameId)).toMatchObject({x: 10, y: 6, width: 4, height: 4});
    expect(getSliceKey(document, first.id, secondFrame.id)).toMatchObject({x: 1, y: 1, width: 6, height: 4});
    expect(getSliceKey(document, second.id, secondFrame.id)).toBeNull();
  });

  it("deletes complete slices, reuses colors, and round-trips through strict v4", () => {
    const document = createDocument({width: 8, height: 8});
    const first = addSlice(document, "First", {x: 0, y: 0, width: 2, height: 2})!;
    const second = addSlice(document, "Second", {x: 2, y: 0, width: 2, height: 2})!;
    second.color = "#AABBCCDD";
    expect(reuseSliceColor(document, "#aabbccdd")).toBe("#AABBCCDD");
    expect(reuseSliceColor(document, "#102030")).toBe("#102030ff");

    const before = cloneDocument(document);
    expect(deleteSlices(document, [first.id])).toBe(true);
    const after = cloneDocument(document);
    const history = new CommandHistory<typeof document>();
    history.commit(new DocumentStateCommand(before, after, "Delete Slices"));
    expect(document.slices.map((slice) => slice.id)).toEqual([second.id]);
    history.undo(document);
    expect(document.slices.map((slice) => slice.id)).toEqual([first.id, second.id]);
    history.redo(document);
    expect(decodeProject(encodeProject(document)).slices).toEqual(document.slices);
  });

  it("resizes only authored keys on the active frame and scales local metadata atomically", () => {
    const document = createDocument({width: 16, height: 12});
    const firstFrameId = document.activeFrameId;
    const first = addSlice(document, "First", {
      frameId: firstFrameId,
      x: 2,
      y: 2,
      width: 4,
      height: 4,
      center: {x: 1, y: 1, width: 2, height: 2},
      pivot: {x: 2, y: 3},
    })!;
    const second = addSlice(document, "Second", {frameId: firstFrameId, x: 8, y: 2, width: 2, height: 2})!;
    expect(resizeSliceKeys(document, firstFrameId, [
      {id: first.id, bounds: {x: 1, y: 1, width: 8, height: 2}},
      {id: second.id, bounds: {x: 9, y: 1, width: 4, height: 4}},
    ])).toBe(true);
    expect(getSliceKey(document, first.id, firstFrameId)).toMatchObject({
      x: 1, y: 1, width: 8, height: 2,
      center: {x: 2, y: 1, width: 4, height: 1},
      pivot: {x: 4, y: 2},
    });
    const before = cloneDocument(document);
    expect(resizeSliceKeys(document, firstFrameId, [{id: first.id, bounds: {x: 0, y: 0, width: 20, height: 2}}])).toBe(false);
    expect(document.slices).toEqual(before.slices);
  });
});

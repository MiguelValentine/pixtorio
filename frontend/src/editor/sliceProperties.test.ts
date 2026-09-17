import {describe, expect, it} from "vitest";
import {
  addFrame,
  addSlice,
  addSliceKey,
  cloneDocument,
  createDocument,
  cropDocument,
  deleteFrame,
  deleteSliceKey,
  duplicateFrames,
  getSliceKey,
  resizeDocument,
  updateSlice,
  updateSliceKey,
} from "./document";
import {decodeProject, encodeProject} from "./serialization";
import {DocumentStateCommand, CommandHistory} from "./history";
import {rotateDocument} from "./documentTransforms";

describe("slice key properties", () => {
  it("edits only the exact current-frame key and supports visible key lifecycle operations", () => {
    const document = createDocument({width: 8, height: 6});
    const firstFrameId = document.activeFrameId;
    const secondFrame = addFrame(document);
    const slice = addSlice(document, "Button", {
      frameId: firstFrameId,
      x: 1,
      y: 1,
      width: 4,
      height: 3,
      center: {x: 1, y: 1, width: 2, height: 1},
      pivot: {x: 2, y: 1},
    })!;

    expect(getSliceKey(document, slice.id, secondFrame.id)).toBeNull();
    expect(updateSliceKey(document, slice.id, secondFrame.id, {x: 2})).toBe(false);
    expect(getSliceKey(document, slice.id, firstFrameId)?.x).toBe(1);

    const secondKey = addSliceKey(document, slice.id, secondFrame.id)!;
    expect(secondKey).toMatchObject({frameId: secondFrame.id, x: 1, y: 1, width: 4, height: 3});
    expect(updateSliceKey(document, slice.id, secondFrame.id, {
      x: 2,
      center: {x: 0, y: 0, width: 3, height: 2},
    })).toBe(true);
    expect(getSliceKey(document, slice.id, firstFrameId)).toMatchObject({x: 1, center: {x: 1, y: 1, width: 2, height: 1}});
    expect(getSliceKey(document, slice.id, secondFrame.id)).toMatchObject({x: 2, center: {x: 0, y: 0, width: 3, height: 2}});

    expect(deleteSliceKey(document, slice.id, secondFrame.id)).toBe(true);
    expect(getSliceKey(document, slice.id, secondFrame.id)).toBeNull();
    expect(deleteSliceKey(document, slice.id, firstFrameId)).toBe(false);
  });

  it("duplicates and removes frame-local keys with animation frame operations", () => {
    const document = createDocument({width: 4, height: 4});
    const firstFrameId = document.activeFrameId;
    const slice = addSlice(document, "Sprite", {frameId: firstFrameId, x: 0, y: 0, width: 2, height: 2})!;
    const duplicated = duplicateFrames(document, [firstFrameId]).map((frame) => frame.id);
    expect(duplicated).toHaveLength(1);
    expect(getSliceKey(document, slice.id, duplicated[0])).toMatchObject({x: 0, width: 2});

    expect(deleteFrame(document, duplicated[0])).toBe(true);
    expect(getSliceKey(document, slice.id, duplicated[0])).toBeNull();
  });

  it("keeps slice properties in strict v4 round trips and rejects duplicate frame keys", () => {
    const document = createDocument({width: 8, height: 6});
    const slice = addSlice(document, "Button", {
      x: 1,
      y: 1,
      width: 4,
      height: 3,
      center: {x: 1, y: 1, width: 2, height: 1},
      pivot: {x: 2, y: 1},
    })!;
    expect(updateSlice(document, slice.id, {color: "#12345678"})).toBe(true);
    const decoded = decodeProject(encodeProject(document));
    expect(decoded.slices).toEqual(document.slices);

    const malformed = JSON.parse(encodeProject(document)) as {slices: Array<{keys: Array<Record<string, unknown>>}>};
    malformed.slices[0].keys.push({...malformed.slices[0].keys[0]});
    expect(() => decodeProject(JSON.stringify(malformed))).toThrow("Project slices are invalid");
  });

  it("restores slice key edits through the document history command", () => {
    const document = createDocument({width: 4, height: 4});
    const slice = addSlice(document, "Sprite", {x: 0, y: 0, width: 2, height: 2})!;
    const before = cloneDocument(document);
    expect(updateSliceKey(document, slice.id, document.activeFrameId, {center: {x: 0, y: 0, width: 1, height: 1}})).toBe(true);
    const after = cloneDocument(document);
    const history = new CommandHistory<typeof document>();
    history.commit(new DocumentStateCommand(before, after, "Edit Nine-patch"));
    expect(document.slices[0].keys[0].center).toEqual({x: 0, y: 0, width: 1, height: 1});
    history.undo(document);
    expect(document.slices[0].keys[0].center).toBeUndefined();
    history.redo(document);
    expect(document.slices[0].keys[0].center).toEqual({x: 0, y: 0, width: 1, height: 1});
  });

  it("preserves relative nine-patch geometry through rotation and canvas changes", () => {
    const document = createDocument({width: 6, height: 4});
    const slice = addSlice(document, "Panel", {
      x: 1,
      y: 1,
      width: 3,
      height: 2,
      center: {x: 1, y: 0, width: 2, height: 1},
    })!;

    expect(rotateDocument(document, "cw")).toBe(true);
    expect(document.slices[0].keys[0]).toMatchObject({x: 1, y: 1, width: 2, height: 3, center: {x: 1, y: 1, width: 1, height: 2}});

    expect(cropDocument(document, 1, 0, 3, 4)).toBe(true);
    expect(document.slices[0].keys[0]).toMatchObject({x: 0, y: 1, width: 2, height: 3, center: {x: 1, y: 1, width: 1, height: 2}});
    expect(resizeDocument(document, 5, 4, "right", "top")).toBe(true);
    expect(document.slices[0].keys[0]).toMatchObject({x: 2, y: 1, width: 2, height: 3, center: {x: 1, y: 1, width: 1, height: 2}});
    expect(slice.id).toBe(document.slices[0].id);
  });
});

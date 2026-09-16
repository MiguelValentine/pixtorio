import {describe, expect, it} from "vitest";

import {
  captureTabTimeline,
  createEditorTab,
  EditorDocumentStateCommand,
  extendTimelineLoopAfterInsertion,
  normalizeTabTimeline,
  shouldExtendTimelineLoopAfterInsertion,
  syncPlaybackFrameSelection,
} from "./App";
import {
  addFrame,
  addFrameTag,
  cloneDocument,
  createDocument,
  deleteFrameTag,
  duplicateFrames,
  updateFrameTag,
} from "./editor/document";

describe("timeline history state", () => {
  it("restores tag selection and loop bounds across undo and redo", () => {
    const document = createDocument({width: 1, height: 1});
    const first = document.frames[0];
    const second = addFrame(document);
    const third = addFrame(document);
    const fourth = addFrame(document);
    const tag = addFrameTag(document, "Walk", first.id, second.id)!;
    const tab = createEditorTab(document, "tab");
    tab.activeTagId = tag.id;
    normalizeTabTimeline(tab, true);
    const beforeDocument = cloneDocument(document);
    const beforeTimeline = captureTabTimeline(tab);

    expect(updateFrameTag(document, tag.id, {fromFrameId: third.id, toFrameId: fourth.id, direction: "reverse"})).toBe(true);
    document.activeFrameId = fourth.id;
    normalizeTabTimeline(tab, true);
    const command = new EditorDocumentStateCommand(
      beforeDocument,
      document,
      "Edit Frame Tag",
      tab,
      beforeTimeline,
      captureTabTimeline(tab),
    );

    command.undo(document);
    normalizeTabTimeline(tab, true);
    expect(tab.activeTagId).toBe(tag.id);
    expect(tab.selectedFrameIds).toEqual([first.id, second.id]);
    expect([tab.loopStartFrameId, tab.loopEndFrameId]).toEqual([first.id, second.id]);
    expect(document.activeFrameId).toBe(first.id);

    command.redo(document);
    normalizeTabTimeline(tab, true);
    expect(tab.activeTagId).toBe(tag.id);
    expect(tab.selectedFrameIds).toEqual([third.id, fourth.id]);
    expect([tab.loopStartFrameId, tab.loopEndFrameId]).toEqual([third.id, fourth.id]);
    expect(document.activeFrameId).toBe(fourth.id);
  });

  it("reactivates a deleted tag when its deletion is undone", () => {
    const document = createDocument({width: 1, height: 1});
    const first = document.frames[0];
    const second = addFrame(document);
    const tag = addFrameTag(document, "Idle", first.id, second.id)!;
    const tab = createEditorTab(document, "tab");
    tab.activeTagId = tag.id;
    normalizeTabTimeline(tab, true);
    const beforeDocument = cloneDocument(document);
    const beforeTimeline = captureTabTimeline(tab);

    expect(deleteFrameTag(document, tag.id)).toBe(true);
    normalizeTabTimeline(tab);
    const command = new EditorDocumentStateCommand(
      beforeDocument,
      document,
      "Delete Frame Tag",
      tab,
      beforeTimeline,
      captureTabTimeline(tab),
    );

    command.undo(document);
    normalizeTabTimeline(tab, true);
    expect(tab.activeTagId).toBe(tag.id);
    expect(tab.selectedFrameIds).toEqual([first.id, second.id]);

    command.redo(document);
    normalizeTabTimeline(tab, true);
    expect(tab.activeTagId).toBeUndefined();
  });
});

describe("timeline playback and insertion state", () => {
  it("syncs playback to one frame and clears cel command state", () => {
    const document = createDocument({width: 1, height: 1});
    const first = document.frames[0];
    const second = addFrame(document);
    const tab = createEditorTab(document, "tab");
    tab.commandScope = "cels";
    tab.selectedCelKeys = ["layer-1:frame-1"];
    tab.celSelectionAnchor = {layerId: document.activeLayerId, frameId: first.id};

    expect(syncPlaybackFrameSelection(tab, first.id)).toBe(true);
    expect(document.activeFrameId).toBe(first.id);
    expect(tab.selectedFrameIds).toEqual([first.id]);
    expect(tab.frameSelectionAnchorId).toBe(first.id);
    expect(tab.commandScope).toBe("frame");
    expect(tab.selectedCelKeys).toEqual([]);
    expect(tab.celSelectionAnchor).toBeNull();

    expect(syncPlaybackFrameSelection(tab, second.id)).toBe(true);
    expect(document.activeFrameId).toBe(second.id);
    expect(tab.selectedFrameIds).toEqual([second.id]);
    expect(tab.frameSelectionAnchorId).toBe(second.id);
  });

  it.each([
    ["add", (document: ReturnType<typeof createDocument>) => addFrame(document)],
    ["duplicate", (document: ReturnType<typeof createDocument>) => duplicateFrames(document, [document.activeFrameId])[0]],
  ])("extends a full loop after %s frame insertion", (_operation, insertFrame) => {
    const document = createDocument({width: 1, height: 1});
    const first = document.frames[0];
    addFrame(document);
    const lastBeforeInsert = addFrame(document);
    const tab = createEditorTab(document, "tab");
    tab.loopStartFrameId = first.id;
    tab.loopEndFrameId = lastBeforeInsert.id;

    const shouldExtend = shouldExtendTimelineLoopAfterInsertion(tab);
    const inserted = insertFrame(document);
    expect(inserted).toBeDefined();
    extendTimelineLoopAfterInsertion(tab, shouldExtend);

    expect([tab.loopStartFrameId, tab.loopEndFrameId]).toEqual([
      document.frames[0].id,
      document.frames.at(-1)!.id,
    ]);
  });

  it("keeps a custom loop range when a frame is inserted", () => {
    const document = createDocument({width: 1, height: 1});
    const first = document.frames[0];
    const second = addFrame(document);
    const third = addFrame(document);
    const tab = createEditorTab(document, "tab");
    tab.loopStartFrameId = second.id;
    tab.loopEndFrameId = third.id;

    const shouldExtend = shouldExtendTimelineLoopAfterInsertion(tab);
    addFrame(document);
    extendTimelineLoopAfterInsertion(tab, shouldExtend);

    expect(shouldExtend).toBe(false);
    expect([tab.loopStartFrameId, tab.loopEndFrameId]).toEqual([second.id, third.id]);
    expect(tab.loopStartFrameId).not.toBe(first.id);
  });
});
